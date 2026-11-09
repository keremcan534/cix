// Aile: families on the server, so every phone sees the same families, members and chat.
//
//   GET  /api/families?q=                     → { families, mine }        (top 50 by this week's power; q filters by name)
//   GET  /api/family?id=                      → { family, members, myRole, requested, requests }   (no id: mine, or family null)
//   POST /api/families      { name, ref }     → { family, user, replay }  (founding fee FAMILY_COST coins)
//   POST /api/family/join   { id, join? }     → { joined } | { requested } (join: false takes my request back)
//   POST /api/family/request { userId, accept } → { members }             (the leader or a helper)
//   POST /api/family/leave                    → { left: true }
//   POST /api/family/kick   { userId }        → { members }               (the leader: anyone; a helper: members)
//   POST /api/family/role   { userId, role }  → { members }               (the leader; role 'owner' hands the family over)
//   POST /api/family/settings { announcement?, joinMode?, tag?, theme? } → { family }   (announcement: leader or helper; the rest: leader)
//   GET  /api/family/chat?after=              → { messages }              (members only, oldest first, at most 100)
//   POST /api/family/chat   { text }          → { message }
//
// One family per person (family_members' key). A family's power is the coins its members spent on gifts since they
// joined (gift_events), so it can't be bought or faked apart from real gifts; its level and size limit follow from
// that (FAMILY_XP, the same table as the app's data/rules). When the leader leaves, the earliest helper (else the
// earliest member) leads; the last one out closes the family. Names, announcements and chat pass the contact
// filter, and a mute on public text (sanctions 'post') stops chatting.
import { HttpError, auth, db, int, limit, once, publicText, readJson, tx, userId } from './core.mjs';
import { notify } from './push.mjs';
import { assertMay } from './sanctions.mjs';
import { spendCoins } from './wallet.mjs';
import { FAMILY_THEMES } from './family-rules.mjs';

/** The founding fee (app: data/kabile KABILE_CREATE_COST). */
export const FAMILY_COST = 500;
/** Power needed for each level (app: data/rules FAMILY_XP). */
export const FAMILY_XP = [0, 1_000, 3_000, 6_000, 10_000, 16_000, 24_000, 35_000, 50_000, 70_000, 95_000, 130_000, 175_000, 230_000, 300_000];
export const familyLevel = (power) => FAMILY_XP.reduce((lvl, t, i) => (power >= t ? i + 1 : lvl), 1);
export const familyCapacity = (level) => 50 + (level - 1) * 25;

export const WEEK = `(date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')`;
const ROLES = ['owner', 'helper', 'member'];

const familyId = (v) => {
  const id = typeof v === 'string' && /^\d{1,18}$/.test(v) ? Number(v) : int(v, 1, Number.MAX_SAFE_INTEGER);
  if (!id || !Number.isSafeInteger(id)) throw new HttpError(400, 'Geçersiz aile');
  return id;
};

/** Members and power (all time, this week) of each family in `ids`. */
export async function statsOf(ids, q = db) {
  const out = Object.fromEntries(ids.map((id) => [id, { members: 0, power: 0, weekly: 0 }]));
  if (!ids.length) return out;
  const m = await q.query('SELECT family_id, count(*)::int AS n FROM family_members WHERE family_id = ANY($1::bigint[]) GROUP BY family_id', [ids]);
  for (const r of m.rows) out[r.family_id].members = r.n;
  const p = await q.query(
    `SELECT fm.family_id, sum(g.total)::bigint AS power, COALESCE(sum(g.total) FILTER (WHERE g.created_at >= ${WEEK}), 0)::bigint AS weekly
       FROM family_members fm JOIN gift_events g ON g.sender = fm.user_id AND g.created_at >= fm.joined_at
      WHERE fm.family_id = ANY($1::bigint[]) GROUP BY fm.family_id`,
    [ids],
  );
  for (const r of p.rows) Object.assign(out[r.family_id], { power: Number(r.power), weekly: Number(r.weekly) });
  return out;
}

function view(f, s) {
  const level = familyLevel(s.power);
  return {
    id: String(f.id),
    name: f.name,
    announcement: f.announcement,
    joinMode: f.join_mode,
    leader: { id: f.leader, name: f.leader_name ?? '', avatarUrl: f.leader_avatar ?? null },
    members: s.members,
    power: s.power,
    weekly: s.weekly,
    level,
    capacity: familyCapacity(level),
    createdAt: f.created_at,
    // What the leader picked (family-more.mjs): a short tag beside the name and a theme (by family level).
    tag: f.tag ?? '',
    theme: f.theme ?? 'gece',
  };
}

const FAMILY = `SELECT f.*, u.name AS leader_name, u.avatar_url AS leader_avatar FROM families f JOIN users u ON u.id = f.leader WHERE f.closed_at IS NULL`;

export async function familyView(id, q = db) {
  const r = await q.query(`${FAMILY} AND f.id = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Bu aile artık yok');
  return view(r.rows[0], (await statsOf([id], q))[id]);
}

const person = (x) => ({ id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null, gender: x.gender ?? null });

export async function membersOf(id, q = db) {
  const r = await q.query(
    `SELECT fm.user_id, fm.role, fm.joined_at, u.name, u.avatar_url, u.gender,
            (SELECT COALESCE(sum(g.total), 0) FROM gift_events g WHERE g.sender = fm.user_id AND g.created_at >= GREATEST(fm.joined_at, ${WEEK}))::bigint AS weekly
       FROM family_members fm JOIN users u ON u.id = fm.user_id
      WHERE fm.family_id = $1 AND u.deleted_at IS NULL
      ORDER BY CASE fm.role WHEN 'owner' THEN 0 WHEN 'helper' THEN 1 ELSE 2 END, fm.joined_at`,
    [id],
  );
  return r.rows.map((x) => ({ ...person(x), role: x.role, joinedAt: x.joined_at, weekly: Number(x.weekly) }));
}

async function requestsOf(id, q = db) {
  const r = await q.query(
    `SELECT fr.user_id, fr.created_at, u.name, u.avatar_url, u.gender FROM family_requests fr JOIN users u ON u.id = fr.user_id
      WHERE fr.family_id = $1 AND u.deleted_at IS NULL ORDER BY fr.created_at LIMIT 100`,
    [id],
  );
  return r.rows.map((x) => ({ ...person(x), at: x.created_at }));
}

export const myMembership = async (uid, q = db) => (await q.query('SELECT family_id, role, joined_at FROM family_members WHERE user_id = $1', [uid])).rows[0] ?? null;

/** The open family `id`, locked for a membership change, or 404. */
async function lockFamily(c, id) {
  const r = await c.query('SELECT * FROM families WHERE id = $1 AND closed_at IS NULL FOR UPDATE', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Bu aile artık yok');
  return r.rows[0];
}

/** My role in family `id` (locked), or a 403 unless it is one of `roles`. */
async function roleIn(c, uid, id, roles, message = 'Bunu yalnızca aile lideri ya da yardımcısı yapabilir') {
  const m = (await c.query('SELECT role FROM family_members WHERE user_id = $1 AND family_id = $2', [uid, id])).rows[0];
  if (!m || !roles.includes(m.role)) throw new HttpError(403, message);
  return m.role;
}

async function assertRoom(c, id) {
  const s = (await statsOf([id], c))[id];
  if (s.members >= familyCapacity(familyLevel(s.power))) throw new HttpError(409, 'Aile dolu');
}

/** Adds `uid` to family `id` (locked by the caller) and drops their other requests. */
async function addMember(c, id, uid, role = 'member') {
  await c.query('INSERT INTO family_members (user_id, family_id, role) VALUES ($1, $2, $3)', [uid, id, role]);
  await c.query('DELETE FROM family_requests WHERE user_id = $1', [uid]);
}

/**
 * Takes `uid` out of their family (if any). A leader leaving hands the family to the earliest helper, else the
 * earliest member; the last one out closes it. Used by leave, kick and account deletion (social.mjs eraseAccount).
 */
export async function leaveFamily(c, uid) {
  const m = await myMembership(uid, c);
  if (!m) return null;
  await lockFamily(c, m.family_id).catch(() => null);
  await c.query('DELETE FROM family_members WHERE user_id = $1', [uid]);
  if (m.role === 'owner') {
    const next = await c.query(
      `SELECT user_id FROM family_members WHERE family_id = $1 ORDER BY CASE role WHEN 'helper' THEN 0 ELSE 1 END, joined_at LIMIT 1`,
      [m.family_id],
    );
    if (next.rowCount) {
      await c.query("UPDATE family_members SET role = 'owner' WHERE user_id = $1", [next.rows[0].user_id]);
      await c.query('UPDATE families SET leader = $2 WHERE id = $1', [m.family_id, next.rows[0].user_id]);
    }
  }
  const left = Number((await c.query('SELECT count(*) AS n FROM family_members WHERE family_id = $1', [m.family_id])).rows[0].n);
  if (!left) {
    await c.query('UPDATE families SET closed_at = now() WHERE id = $1', [m.family_id]);
    await c.query('DELETE FROM family_requests WHERE family_id = $1', [m.family_id]);
  }
  return m.family_id;
}

/** The family a profile shows: { id, name } or null. */
export async function familyOf(uid, q = db) {
  const r = await q.query('SELECT f.id, f.name, fm.role FROM family_members fm JOIN families f ON f.id = fm.family_id WHERE fm.user_id = $1 AND f.closed_at IS NULL', [uid]);
  return r.rowCount ? { id: String(r.rows[0].id), name: r.rows[0].name, role: r.rows[0].role } : null;
}

const managers = async (id) =>
  (await db.query("SELECT user_id FROM family_members WHERE family_id = $1 AND role IN ('owner', 'helper')", [id])).rows.map((x) => x.user_id);

export const familyRoutes = {
  async 'GET /api/families'(req, url) {
    const me = await auth(req);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 24);
    const args = [];
    const where = q ? ` AND f.name ILIKE $${args.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`)}` : '';
    const rows = (await db.query(`${FAMILY}${where} ORDER BY f.created_at DESC LIMIT 300`, args)).rows;
    const stats = await statsOf(rows.map((f) => Number(f.id)));
    const families = rows
      .map((f) => view(f, stats[f.id]))
      .filter((f) => f.members > 0)
      .sort((a, b) => b.weekly - a.weekly || b.power - a.power)
      .slice(0, 50);
    const mine = await myMembership(me.id);
    return { families, mine: mine ? String(mine.family_id) : null };
  },

  async 'GET /api/family'(req, url) {
    const me = await auth(req);
    const mine = await myMembership(me.id);
    const raw = url.searchParams.get('id');
    const id = raw ? familyId(raw) : mine ? Number(mine.family_id) : null;
    if (!id) return { family: null, members: [], myRole: null, requested: false, requests: [] };
    const family = await familyView(id);
    const myRole = mine && Number(mine.family_id) === id ? mine.role : null;
    const requested = !myRole && (await db.query('SELECT 1 FROM family_requests WHERE family_id = $1 AND user_id = $2', [id, me.id])).rowCount > 0;
    return {
      family,
      members: await membersOf(id),
      myRole,
      requested,
      requests: myRole === 'owner' || myRole === 'helper' ? await requestsOf(id) : [],
    };
  },

  async 'POST /api/families'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const name = await publicText(b.name, 2, 24, 'Aile adı', me, 'family.name', 'name');
    const res = await once(me.id, 'coin', b.ref, async (c) => {
      await c.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [me.id]);
      // The same request twice at once: the second waited for the first and finds its fee already taken.
      if ((await c.query("SELECT 1 FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [me.id, b.ref])).rowCount) return;
      if (await myMembership(me.id, c)) throw new HttpError(409, 'Zaten bir ailedesin');
      if ((await c.query('SELECT 1 FROM families WHERE lower(name) = lower($1) AND closed_at IS NULL', [name])).rowCount)
        throw new HttpError(409, 'Bu isimde bir aile var');
      await spendCoins(c, me.id, FAMILY_COST, `Aile kurma: ${name}`, b.ref);
      const f = await c.query('INSERT INTO families (name, leader) VALUES ($1, $2) RETURNING id', [name, me.id]);
      await addMember(c, Number(f.rows[0].id), me.id, 'owner');
    });
    const mine = await myMembership(me.id);
    return { family: mine ? await familyView(Number(mine.family_id)) : null, user: res.user, replay: res.replay };
  },

  async 'POST /api/family/join'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const id = familyId(b.id);
    if (b.join === false) {
      await db.query('DELETE FROM family_requests WHERE family_id = $1 AND user_id = $2', [id, me.id]);
      return { requested: false };
    }
    limit(`family-join:${me.id}`, 10, 'Çok hızlı, biraz bekle');
    const out = await tx(async (c) => {
      const f = await lockFamily(c, id);
      if (await myMembership(me.id, c)) throw new HttpError(409, 'Zaten bir ailedesin');
      await assertRoom(c, id);
      if (f.join_mode === 'open') {
        await addMember(c, id, me.id);
        return { joined: true };
      }
      const pending = Number((await c.query('SELECT count(*) AS n FROM family_requests WHERE user_id = $1', [me.id])).rows[0].n);
      if (pending >= 5) throw new HttpError(409, 'En fazla 5 aileye istek gönderebilirsin');
      const r = await c.query('INSERT INTO family_requests (family_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, me.id]);
      return { requested: true, fresh: r.rowCount > 0, name: f.name };
    });
    if (out.fresh) notify(await managers(id), { title: out.name, body: `${me.name} ailene katılmak istiyor`, data: { type: 'family_request', family: String(id) } });
    return out.joined ? { joined: true } : { requested: true };
  },

  async 'POST /api/family/request'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const who = userId(b.userId);
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    const id = Number(mine.family_id);
    const name = await tx(async (c) => {
      const f = await lockFamily(c, id);
      await roleIn(c, me.id, id, ['owner', 'helper']);
      const r = await c.query('DELETE FROM family_requests WHERE family_id = $1 AND user_id = $2', [id, who]);
      if (!r.rowCount) throw new HttpError(404, 'Bu istek artık yok');
      if (b.accept !== true) return null;
      if (await myMembership(who, c)) throw new HttpError(409, 'Bu kişi artık başka bir ailede');
      await assertRoom(c, id);
      await addMember(c, id, who);
      return f.name;
    });
    if (name) notify([who], { title: name, body: 'Aile isteğin kabul edildi', data: { type: 'family_joined', family: String(id) } });
    return { members: await membersOf(id) };
  },

  async 'POST /api/family/leave'(req) {
    const me = await auth(req);
    const gone = await tx((c) => leaveFamily(c, me.id));
    if (!gone) throw new HttpError(409, 'Bir ailede değilsin');
    return { left: true };
  },

  async 'POST /api/family/kick'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const who = userId(b.userId);
    if (who === me.id) throw new HttpError(400, 'Kendini çıkaramazsın; aileden ayrılabilirsin');
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    const id = Number(mine.family_id);
    await tx(async (c) => {
      await lockFamily(c, id);
      const myRole = await roleIn(c, me.id, id, ['owner', 'helper']);
      const them = (await c.query('SELECT role FROM family_members WHERE user_id = $1 AND family_id = $2', [who, id])).rows[0];
      if (!them) throw new HttpError(404, 'Bu kişi bu ailede değil');
      if (them.role === 'owner' || (myRole === 'helper' && them.role !== 'member')) throw new HttpError(403, 'Bu kişiyi çıkaramazsın');
      await c.query('DELETE FROM family_members WHERE user_id = $1', [who]);
    });
    return { members: await membersOf(id) };
  },

  async 'POST /api/family/role'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const who = userId(b.userId);
    if (!ROLES.includes(b.role)) throw new HttpError(400, 'Geçersiz rol');
    if (who === me.id) throw new HttpError(400, 'Kendi rolünü değiştiremezsin');
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    const id = Number(mine.family_id);
    await tx(async (c) => {
      await lockFamily(c, id);
      await roleIn(c, me.id, id, ['owner'], 'Rolleri yalnızca aile lideri değiştirebilir');
      const r = await c.query('UPDATE family_members SET role = $3 WHERE user_id = $1 AND family_id = $2', [who, id, b.role]);
      if (!r.rowCount) throw new HttpError(404, 'Bu kişi bu ailede değil');
      if (b.role === 'owner') {
        await c.query("UPDATE family_members SET role = 'helper' WHERE user_id = $1", [me.id]);
        await c.query('UPDATE families SET leader = $2 WHERE id = $1', [id, who]);
      }
    });
    return { members: await membersOf(id) };
  },

  async 'POST /api/family/settings'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    const id = Number(mine.family_id);
    const announcement = b.announcement === undefined ? undefined : await publicText(b.announcement, 0, 200, 'Duyuru', me, 'family.announcement', 'announcement');
    if (b.joinMode !== undefined && !['open', 'approve'].includes(b.joinMode)) throw new HttpError(400, 'Geçersiz katılım');
    // The leader's look: a short tag (letters and digits, at most 8) and a theme opened by the family's level.
    const tag = b.tag === undefined ? undefined : await publicText(b.tag, 0, 8, 'Aile etiketi', me, 'family.tag', 'tag');
    if (tag && !/^[\p{L}\p{N}]+$/u.test(tag)) throw new HttpError(400, 'Aile etiketi yalnızca harf ve rakam olabilir');
    let theme;
    if (b.theme !== undefined) {
      const t = FAMILY_THEMES.find((x) => x.id === b.theme);
      if (!t) throw new HttpError(400, 'Geçersiz tema');
      const level = (await familyView(id)).level;
      if (level < t.minLevel) throw new HttpError(403, `Bu tema Lv.${t.minLevel} ailede açılır`);
      theme = t.id;
    }
    const leaderOnly = b.joinMode !== undefined || tag !== undefined || theme !== undefined;
    await tx(async (c) => {
      await lockFamily(c, id);
      await roleIn(c, me.id, id, leaderOnly ? ['owner'] : ['owner', 'helper'], leaderOnly ? 'Bunu yalnızca aile lideri yapabilir' : undefined);
      if (announcement !== undefined) await c.query('UPDATE families SET announcement = $2 WHERE id = $1', [id, announcement]);
      if (b.joinMode !== undefined) await c.query('UPDATE families SET join_mode = $2 WHERE id = $1', [id, b.joinMode]);
      if (tag !== undefined) await c.query('UPDATE families SET tag = $2 WHERE id = $1', [id, tag]);
      if (theme !== undefined) await c.query('UPDATE families SET theme = $2 WHERE id = $1', [id, theme]);
    });
    return { family: await familyView(id) };
  },

  async 'GET /api/family/chat'(req, url) {
    const me = await auth(req);
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    const after = Number(url.searchParams.get('after') ?? 0);
    const r = await db.query(
      `SELECT * FROM (SELECT m.id, m.author, m.body, m.created_at, u.name, u.avatar_url, u.gender
         FROM family_messages m JOIN users u ON u.id = m.author
        WHERE m.family_id = $1 AND m.id > $2 AND u.deleted_at IS NULL ORDER BY m.id DESC LIMIT 100) x ORDER BY id`,
      [mine.family_id, Number.isSafeInteger(after) && after > 0 ? after : 0],
    );
    return {
      messages: r.rows.map((x) => ({ id: String(x.id), author: { id: x.author, name: x.name, avatarUrl: x.avatar_url ?? null, gender: x.gender ?? null }, text: x.body, createdAt: x.created_at })),
    };
  },

  async 'POST /api/family/chat'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    await assertMay(me, 'post');
    const body = await publicText(b.text, 1, 500, 'Mesaj', me, 'family.chat', 'text');
    limit(`family-chat:${me.id}`, 30, 'Çok hızlı yazıyorsun, biraz bekle');
    const r = await db.query('INSERT INTO family_messages (family_id, author, body) VALUES ($1, $2, $3) RETURNING id, created_at', [mine.family_id, me.id, body]);
    return { message: { id: String(r.rows[0].id), author: { id: me.id, name: me.name, avatarUrl: me.avatar_url ?? null, gender: me.gender ?? null }, text: body, createdAt: r.rows[0].created_at } };
  },
};

