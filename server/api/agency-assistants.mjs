// Ajans asistanı (güncelleme 4, item 17; docs/AJANS_ASISTANI.md). An agency owner names assistants among the agency's
// own people (its streamers or its team), at most assistant_policy.max at once (1 by default, a centre setting). The
// streamers an assistant brings in (an invite they sent and the streamer accepted, or the assistant's own code)
// give the assistant a share of the agency's own commission on their income, in whole percent. The split itself is
// in the commission engine (agency-lib.mjs calcEvent, bookAssistantShare): the share leaves the owner's commission
// and reaches the assistant's wallet as diamonds in the same transaction; a refund takes it back the same way.
//
//   GET  /api/agency/assistants?id=                        → { max, open, canAdd, weekStart, nextWeek, assistants }
//   GET  /api/agency/assistants/candidates?id=&q=          → { users }            (the agency's own people)
//   POST /api/agency/assistants/add    { id, user, pct }   → { assistant }
//   POST /api/agency/assistants/share  { id, assistantId, pct } → { assistant, replay }
//   POST /api/agency/assistants/remove { id, assistantId } → { removed }
//   (the assistant's own view is in GET /api/agency/me, `assistant`; the wallet's Gelir kaynakları lists the share)
//
// Rules, all here on the server:
//  - Only the agency's owner names, changes and removes an assistant (the centre may remove one). The person must be
//    one of the agency's own now, not its owner, and not an assistant anywhere else.
//  - The first share starts with the assignment. A change starts the next Monday 00:00 (Türkiye) and comes at most
//    once a calendar week. Shares never change backwards.
//  - Removed (or gone from the agency, or the account deleted): no share from then on; the streamers they brought
//    stay in the agency and count wholly for the owner. Someone removed this week can be named again next week.
//  - Supporters' top-ups give an agency no commission (only streamers' income does), so there is no supporter share.
import { HttpError, UUID, auth, db, readJson, tx } from './core.mjs';
import { accessOf, agencyRow, audit, d4, needPlatform, newCode, nextWeekStart, notice, settingsAt, weekStart } from './agency-lib.mjs';
import { notify } from './push.mjs';

const bad = (m) => {
  throw new HttpError(400, m);
};
const uuid = (v, what = 'kimlik') => (typeof v === 'string' && UUID.test(v) ? v : bad(`Geçersiz ${what}`));
const pctOf = (v) => (Number.isSafeInteger(v) && v >= 0 && v <= 100 ? v : bad('Pay 0 ile 100 arasında tam sayı olmalı'));
const idOf = (v) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : bad('Geçersiz asistan'));
const n = (v) => Number(v ?? 0);

/** The person is one of the agency's own now: an open streamer membership in it or an open place on its team. */
const MEMBER = `(EXISTS (SELECT 1 FROM agency_streamers m WHERE m.streamer_id = u.id AND m.agency_id = $1 AND m.ended_at IS NULL)
              OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = u.id AND s.agency_id = $1 AND s.revoked_at IS NULL))`;

async function ctx(c, req) {
  const u = await auth(req);
  return { u, acc: await accessOf(c, u), s: (await settingsAt(c)).values };
}

/** Owner only (the centre may look, and remove). */
async function ownerOf(c, x, id, { lock = false, centre = null } = {}) {
  const a = await agencyRow(c, uuid(id, 'ajans'), lock);
  if (x.acc.owned.has(a.id)) return a;
  if (centre) {
    await needPlatform(c, x.acc, centre, a.id);
    return a;
  }
  await audit(db, x.u.id, 'assistants.manage', 'agency', a.id, { result: 'denied' });
  throw new HttpError(403, 'Asistanları yalnız ajans sahibi yönetir');
}

/**
 * An agency's invite code, or an open assistant's own code (their agency, and who brought the streamer). The
 * agency's code wins; the two never share a value (addAssistant checks both).
 */
export async function resolveJoinCode(c, code) {
  const s = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6,10}$/.test(s)) throw new HttpError(400, 'Geçersiz ajans kodu');
  const a = await c.query('SELECT * FROM agencies WHERE code = $1', [s]);
  if (a.rowCount) return { agency: a.rows[0], assistant: null };
  const h = await c.query(
    `SELECT g.*, x.user_id AS assistant_user, u.name AS assistant_name FROM agency_assistants x JOIN agencies g ON g.id = x.agency_id JOIN users u ON u.id = x.user_id
      WHERE x.code = $1 AND x.ended_at IS NULL AND u.deleted_at IS NULL`,
    [s],
  );
  if (!h.rowCount) throw new HttpError(404, 'Bu kodla bir ajans yok');
  const { assistant_user: userId, assistant_name: name, ...agency } = h.rows[0];
  return { agency, assistant: { userId, name } };
}

const SHARE_NOW = `(SELECT s.streamer_pct FROM agency_assistant_shares s WHERE s.assistant_id = x.id AND s.effective_from <= now() ORDER BY s.effective_from DESC, s.id DESC LIMIT 1)`;

/** One assignment with its numbers, for the owner's list and the assistant's own card. */
async function viewOf(q, row) {
  const wk = weekStart(new Date());
  const shares = await q.query('SELECT streamer_pct, effective_from, initial, created_at FROM agency_assistant_shares WHERE assistant_id = $1 ORDER BY effective_from, id', [row.id]);
  const now = Date.now();
  const inForce = shares.rows.filter((s) => new Date(s.effective_from).getTime() <= now).at(-1) ?? null;
  const upcoming = shares.rows.filter((s) => new Date(s.effective_from).getTime() > now).at(-1) ?? null;
  const changedThisWeek = shares.rows.some((s) => !s.initial && new Date(s.created_at) >= wk);
  const r = (
    await q.query(
      `SELECT
         (SELECT count(DISTINCT m.streamer_id) FROM agency_streamers m WHERE m.invited_by = $2 AND m.agency_id = $3)::int AS invited,
         (SELECT count(*) FROM agency_streamers m WHERE m.invited_by = $2 AND m.agency_id = $3 AND m.ended_at IS NULL)::int AS invited_now,
         (SELECT coalesce(sum(e.diamonds), 0) FROM agency_streamers m JOIN income_events e ON e.streamer_id = m.streamer_id
           WHERE m.invited_by = $2 AND m.agency_id = $3 AND e.occurred_at >= greatest(m.joined_at, $4) AND e.occurred_at < $5
             AND (m.ended_at IS NULL OR e.occurred_at < m.ended_at)) AS income_week,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1 AND l.created_at >= $4) AS share_week,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1
           AND l.created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS share_month,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1) AS share_total,
         (SELECT coalesce(sum(l.wallet), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1) AS wallet_total,
         (EXISTS (SELECT 1 FROM agency_streamers m WHERE m.streamer_id = $2 AND m.agency_id = $3 AND m.ended_at IS NULL)
           OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = $2 AND s.agency_id = $3 AND s.revoked_at IS NULL)) AS member`,
      [row.id, row.user_id, row.agency_id, wk, nextWeekStart(wk)],
    )
  ).rows[0];
  return {
    id: Number(row.id),
    agency: { id: row.agency_id, name: row.agency_name },
    user: { id: row.user_id, name: row.user_name, avatarUrl: row.avatar_url ?? null },
    code: row.code,
    assignedAt: row.assigned_at,
    endedAt: row.ended_at ?? null,
    active: !row.ended_at,
    member: r.member,
    share: inForce ? { pct: inForce.streamer_pct, since: inForce.effective_from } : { pct: 0, since: row.assigned_at },
    upcoming: upcoming ? { pct: upcoming.streamer_pct, from: upcoming.effective_from } : null,
    canChange: !row.ended_at && !changedThisWeek,
    nextChangeFrom: nextWeekStart(new Date()),
    invited: { total: r.invited, now: r.invited_now },
    week: { streamerIncome: n(r.income_week), share: d4(r.share_week) },
    month: { share: d4(r.share_month) },
    total: { share: d4(r.share_total), wallet: n(r.wallet_total) },
  };
}

const ROW = `SELECT x.*, u.name AS user_name, u.avatar_url, g.name AS agency_name FROM agency_assistants x JOIN users u ON u.id = x.user_id JOIN agencies g ON g.id = x.agency_id`;

/**
 * My own assistant card for GET /api/agency/me: the open assignment, else the latest one that earned something;
 * with my latest shares. Null when I was never an assistant.
 */
export async function myAssistant(q, userId) {
  const r = await q.query(
    `${ROW} WHERE x.user_id = $1 AND (x.ended_at IS NULL OR EXISTS (SELECT 1 FROM agency_assistant_ledger l WHERE l.assistant_id = x.id))
      ORDER BY x.ended_at IS NULL DESC, x.assigned_at DESC LIMIT 1`,
    [userId],
  );
  if (!r.rowCount) return null;
  const v = await viewOf(q, r.rows[0]);
  const rows = await q.query(
    `SELECT l.id, l.amount, l.wallet, l.pct, l.basis, l.reverses, l.created_at, s.name AS streamer_name
       FROM agency_assistant_ledger l LEFT JOIN users s ON s.id = l.streamer_id WHERE l.user_id = $1 ORDER BY l.id DESC LIMIT 20`,
    [userId],
  );
  return {
    ...v,
    rows: rows.rows.map((x) => ({
      id: Number(x.id),
      amount: d4(x.amount),
      wallet: n(x.wallet),
      pct: x.pct,
      basis: d4(x.basis),
      reversal: x.reverses !== null || Number(x.amount) < 0,
      streamer: x.streamer_name ?? null,
      at: x.created_at,
    })),
  };
}

/** Ends the open assignments in an agency whose person is no longer one of its own (they left; shares already stopped). */
async function endGone(c, agencyId) {
  await c.query(
    `UPDATE agency_assistants x SET ended_at = now(), end_reason = 'left' FROM users u
      WHERE u.id = x.user_id AND x.agency_id = $1 AND x.ended_at IS NULL AND NOT ${MEMBER}`,
    [agencyId],
  );
}

export const agencyAssistantRoutes = {
  async 'GET /api/agency/assistants'(req, url) {
    const x = await ctx(db, req);
    const a = await ownerOf(db, x, url.searchParams.get('id'), { centre: 'agencies.view' });
    const r = await db.query(`${ROW} WHERE x.agency_id = $1 AND x.ended_at IS NULL ORDER BY x.assigned_at`, [a.id]);
    const assistants = [];
    for (const row of r.rows) assistants.push(await viewOf(db, row));
    const max = x.s.assistant_policy.max;
    const open = assistants.filter((v) => v.member).length;
    return { max, open, canAdd: a.status === 'approved' && x.acc.owned.has(a.id) && open < max, weekStart: weekStart(new Date()), nextWeek: nextWeekStart(new Date()), assistants };
  },

  async 'GET /api/agency/assistants/candidates'(req, url) {
    const x = await ctx(db, req);
    const a = await ownerOf(db, x, url.searchParams.get('id'));
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length > 40) bad('Arama en fazla 40 karakter olabilir');
    const esc = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const r = await db.query(
      `SELECT u.id, u.name, u.avatar_url,
              EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = u.id AND s.agency_id = $1 AND s.revoked_at IS NULL) AS staff
         FROM users u
        WHERE u.deleted_at IS NULL AND u.id <> $2 AND ${MEMBER}
          AND NOT EXISTS (SELECT 1 FROM agency_assistants x WHERE x.user_id = u.id AND x.ended_at IS NULL)
          AND ($3 = '' OR u.name ILIKE $4 OR u.username ILIKE $4)
        ORDER BY u.name, u.id LIMIT 30`,
      [a.id, a.owner_id, q, `%${esc}%`],
    );
    return { users: r.rows.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null, role: u.staff ? 'staff' : 'streamer' })) };
  },

  async 'POST /api/agency/assistants/add'(req) {
    const b = await readJson(req);
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      // The agency row is locked: two adds at once can't both pass the limit.
      const a = await ownerOf(c, x, b.id, { lock: true });
      if (a.status !== 'approved') throw new HttpError(409, 'Ajans aktif değil');
      const user = uuid(b.user, 'kullanıcı');
      const pct = pctOf(b.pct);
      if (user === a.owner_id) bad('Ajans sahibi kendi asistanı olamaz');
      const p = await c.query(`SELECT u.id, u.name, ${MEMBER} AS member FROM users u WHERE u.id = $2 AND u.deleted_at IS NULL`, [a.id, user]);
      if (!p.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      if (!p.rows[0].member) throw new HttpError(409, 'Asistan, ajansının yayıncılarından ya da ekibinden biri olmalı');
      await endGone(c, a.id);
      const max = x.s.assistant_policy.max;
      const open = (await c.query('SELECT count(*)::int AS n FROM agency_assistants WHERE agency_id = $1 AND ended_at IS NULL', [a.id])).rows[0].n;
      if (open >= max) throw new HttpError(409, max === 0 ? 'Şu an asistan eklenemiyor' : `Şu an en fazla ${max} asistan ekleyebilirsin`);
      const wk = weekStart(new Date());
      const again = await c.query("SELECT 1 FROM agency_assistants WHERE agency_id = $1 AND user_id = $2 AND end_reason = 'owner' AND ended_at >= $3", [a.id, user, wk]);
      if (again.rowCount) throw new HttpError(409, 'Bu hafta asistanlıktan çıkardığın kişiyi gelecek hafta yeniden ekleyebilirsin');
      let row = null;
      for (let i = 0; i < 5 && !row; i++) {
        const code = newCode();
        if ((await c.query('SELECT 1 FROM agencies WHERE code = $1', [code])).rowCount) continue;
        try {
          await c.query('SAVEPOINT asst');
          row = (await c.query('INSERT INTO agency_assistants (agency_id, user_id, code, assigned_by) VALUES ($1, $2, $3, $4) RETURNING *', [a.id, user, code, x.u.id])).rows[0];
          await c.query('RELEASE SAVEPOINT asst');
        } catch (e) {
          await c.query('ROLLBACK TO SAVEPOINT asst');
          if (e.code !== '23505') throw e;
          if (e.constraint === 'agency_assistants_open_user') throw new HttpError(409, 'Bu kişi zaten bir ajansın asistanı');
        }
      }
      if (!row) throw new HttpError(500, 'Asistan kodu üretilemedi');
      await c.query('INSERT INTO agency_assistant_shares (assistant_id, streamer_pct, effective_from, initial, set_by) VALUES ($1, $2, $3, true, $4)', [row.id, pct, row.assigned_at, x.u.id]);
      await audit(c, x.u.id, 'assistant.add', 'agency', a.id, { after: { assistant: Number(row.id), user, pct } });
      await notice(c, a.id, 'team', `${p.rows[0].name} ajans asistanı oldu`, `Getirdiği yayıncıların kazancından ajans komisyonunun %${pct}'i asistana geçer.`);
      const v = (await c.query(`${ROW} WHERE x.id = $1`, [row.id])).rows[0];
      return { assistant: await viewOf(c, v), notify: { user, agency: a.name, pct } };
    });
    notify([out.notify.user], { title: 'Ajans asistanı oldun', body: `${out.notify.agency}: getirdiğin yayıncıların kazancından ajans komisyonunun %${out.notify.pct}'i sana geçer.`, data: { type: 'agency_assistant' } });
    return { assistant: out.assistant };
  },

  async 'POST /api/agency/assistants/share'(req) {
    const b = await readJson(req);
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      const a = await ownerOf(c, x, b.id);
      const pct = pctOf(b.pct);
      const r = await c.query(`${ROW} WHERE x.id = $1 AND x.agency_id = $2 AND x.ended_at IS NULL FOR UPDATE OF x`, [idOf(b.assistantId), a.id]);
      if (!r.rowCount) throw new HttpError(404, 'Asistan bulunamadı');
      const row = r.rows[0];
      const now = new Date();
      const from = nextWeekStart(now);
      const week = await c.query('SELECT streamer_pct, effective_from FROM agency_assistant_shares WHERE assistant_id = $1 AND initial = false AND created_at >= $2 ORDER BY id DESC LIMIT 1', [row.id, weekStart(now)]);
      // The same change sent twice (a double tap) is the one already made.
      if (week.rowCount && week.rows[0].streamer_pct === pct) return { assistant: await viewOf(c, row), replay: true };
      if (week.rowCount) throw new HttpError(409, 'Pay her takvim haftasında bir kez değiştirilebilir; yeni değişikliği pazartesiden sonra yapabilirsin');
      const last = await c.query('SELECT streamer_pct FROM agency_assistant_shares WHERE assistant_id = $1 ORDER BY effective_from DESC, id DESC LIMIT 1', [row.id]);
      if (last.rows[0]?.streamer_pct === pct) throw new HttpError(409, `Pay zaten %${pct}`);
      await c.query('INSERT INTO agency_assistant_shares (assistant_id, streamer_pct, effective_from, set_by) VALUES ($1, $2, $3, $4)', [row.id, pct, from, x.u.id]);
      await audit(c, x.u.id, 'assistant.share', 'agency', a.id, { before: { pct: last.rows[0]?.streamer_pct ?? null }, after: { assistant: Number(row.id), pct, from } });
      return { assistant: await viewOf(c, row), replay: false, notify: { user: row.user_id, agency: a.name, pct } };
    });
    if (out.notify) notify([out.notify.user], { title: 'Asistan payın değişiyor', body: `${out.notify.agency}: payın pazartesiden itibaren %${out.notify.pct} olacak.`, data: { type: 'agency_assistant' } });
    return { assistant: out.assistant, replay: out.replay };
  },

  async 'POST /api/agency/assistants/remove'(req) {
    const b = await readJson(req);
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      const a = await ownerOf(c, x, b.id, { centre: 'agencies.manage' });
      const centre = !x.acc.owned.has(a.id);
      const r = await c.query(
        "UPDATE agency_assistants SET ended_at = now(), ended_by = $3, end_reason = $4 WHERE id = $1 AND agency_id = $2 AND ended_at IS NULL RETURNING id, user_id",
        [idOf(b.assistantId), a.id, x.u.id, centre ? 'center' : 'owner'],
      );
      if (!r.rowCount) throw new HttpError(404, 'Asistan bulunamadı');
      const who = (await c.query('SELECT name FROM users WHERE id = $1', [r.rows[0].user_id])).rows[0]?.name ?? 'Asistan';
      await audit(c, x.u.id, 'assistant.remove', 'agency', a.id, { after: { assistant: Number(r.rows[0].id), user: r.rows[0].user_id } });
      await notice(c, a.id, 'team', `${who} artık ajans asistanı değil`, 'Getirdiği yayıncılar ajansta kalır; kazançlarından komisyonun tamamı ajansa yazılır.');
      return { user: r.rows[0].user_id, agency: a.name };
    });
    notify([out.user], { title: 'Ajans asistanlığın sona erdi', body: `${out.agency}: bundan sonraki kazançlardan asistan payı yazılmaz.`, data: { type: 'agency_assistant' } });
    return { removed: true };
  },
};
