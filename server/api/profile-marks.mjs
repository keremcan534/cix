// Profil izleri (docs/PROFIL_IZLERI.md, Güncelleme 7 item 11): a Kutlama gift that leaves a mark on its receiver's
// profile photo (💩 Kaka: some dirt on the photo and a small 💩 on it) and one that cleans it (💧 Su, dearer). The
// owners' rules: a mark lasts Canlı ayarlar › Profil izleri hours (24) or until someone sends the gift that cleans it;
// a second one starts the time again (never two); the cleaning gift's diamonds go to the cleaned person (a normal
// gift); on a clean profile it is just a gift. Anyone may refuse marks in Gizlilik ("Profilime iz bırakılmasın",
// privacy.mjs profileMarks): a gift that leaves one is then refused before any coin moves (403 marks_off), and the
// marks they had go. Which gift leaves or cleans which kind is on the gift rows (profile-mark-rules.mjs), so the panel
// can make other pairs.
//
//   GET  /api/admin/marks?user=<id>                      → { user, marks }   their last 50 marks, the ones showing first
//   POST /api/admin/marks/clear { user, kind?, reason? } → { cleared }       the ones showing come off (an audit row)
//
// Where it runs elsewhere: gifts.mjs (markGift in the send's transaction, after both users rows are locked; the room's
// gift packet and the send's answer carry `mark`; the push says it), economy.mjs looksOf (every look carries `marks`
// and `noMarks`: room seats, profiles, the person card; no query of its own), social.mjs (GET /api/user `marks`, a
// block takes the blocked person's marks off, account deletion), privacy.mjs (profileMarks), my-data.mjs (marksDataOf),
// live-registry.mjs (mark_hours; 0 turns the feature off: the gifts are plain gifts and no mark shows).
// A mark that changed outside a room's gift packet (a gift sent from a profile or a chat, a clean by staff, an
// opt-out, a block) reaches the rooms the person is in as their look (economy.mjs announceLook).
import { HttpError, auth, clientIp, db, readJson, tx, userId } from './core.mjs';
import { allGifts, giftEmojiOf, giftNameOf } from './custom-gifts.mjs';
import { live } from './live-settings.mjs';
import { panelDetail } from './panel.mjs';
import { KIND, MARK_GIFTS, markNotice } from './profile-mark-rules.mjs';

/** Profil izleri run (Canlı ayarlar › Profil izleri › süre above 0). */
export const marksOn = (s = live()) => Number(s.markHours) > 0;

/** A mark row as phones get it: its kind, the gift that left it (for the badge), and until when it shows. */
const markOut = (m) => ({ kind: m.kind, gift: m.gift_id, emoji: giftEmojiOf(m.gift_id) ?? '💩', until: new Date(m.expires_at).toISOString() });

/**
 * The marks showing in a look (economy.mjs looksOf reads them with the person's row: { kind, gift_id, expires_at }
 * each): [] while the feature is off.
 */
export const marksView = (rows, s = live()) => (marksOn(s) && Array.isArray(rows) ? rows.map(markOut) : []);

/** The emoji of the gift that cleans `kind` now (the cheapest on the shelves), or null when none does. */
export function cleanEmojiOf(kind, s = live()) {
  const g = allGifts()
    .filter((x) => x.enabled && !s.giftsHidden.has(x.id) && x.mark?.role === 'clean' && x.mark.kind === kind)
    .sort((a, b) => a.price - b.price)[0];
  return g ? g.emoji : null;
}

/**
 * Inside a gift's transaction (gifts.mjs), after both people's users rows are locked (send-locks.mjs) and the gift's
 * row is written (`eventId`), before any coin moves: what `gift` does to `to`'s profile. A gift that leaves a mark on someone
 * who refuses marks is refused here (403 marks_off: the transaction rolls back, nothing moved). Each row is written
 * once: a leave ends the kind's showing mark (expires now) and adds its own; a clean takes the kind's showing mark off
 * (none: a plain gift). Null when nothing changed; else what the room's packet and the answer carry.
 */
export async function markGift(c, { gift, from, to, eventId, s = live() }) {
  const rule = gift.mark;
  if (!rule || !marksOn(s)) return null;
  if (rule.role === 'leave') {
    const who = (await c.query('SELECT u.name, coalesce(p.profile_marks, true) AS open FROM users u LEFT JOIN privacy_settings p ON p.user_id = u.id WHERE u.id = $1', [to])).rows[0];
    if (!who?.open) {
      throw Object.assign(new HttpError(403, `${who?.name ?? 'Bu kişi'}, profiline iz bırakılmasını kapattı. ${gift.name} ona gönderilemez; başka bir hediye seçebilirsin.`), {
        extra: { code: 'marks_off' },
      });
    }
    const hours = rule.hours ?? s.markHours;
    const ended = await c.query('UPDATE profile_marks SET expires_at = now() WHERE user_id = $1 AND kind = $2 AND cleared_at IS NULL AND expires_at > now()', [to, rule.kind]);
    const r = await c.query(
      'INSERT INTO profile_marks (user_id, from_user, kind, gift_id, gift_event_id, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6)) RETURNING expires_at',
      [to, from, rule.kind, gift.id, eventId, hours],
    );
    return { role: 'leave', kind: rule.kind, gift: gift.id, emoji: gift.emoji, until: r.rows[0].expires_at.toISOString(), hours, again: ended.rowCount > 0, clean: cleanEmojiOf(rule.kind, s) };
  }
  const r = await c.query(
    "UPDATE profile_marks SET cleared_at = now(), cleared_by = $3, clear_event_id = $4, cleared_how = 'gift' WHERE user_id = $1 AND kind = $2 AND cleared_at IS NULL AND expires_at > now()",
    [to, rule.kind, from, eventId],
  );
  return r.rowCount ? { role: 'clean', kind: rule.kind, gift: gift.id, emoji: gift.emoji } : null;
}

/** The push a gift outside a room sends when it left a mark ("X sana 💩 attı; …"); null for any other gift. */
export const markPushBody = (mark, fromName) => (mark?.role === 'leave' ? markNotice(fromName, mark.emoji, mark.hours, mark.clean) : null);

/**
 * GET /api/catalog's gifts for this phone: an app without Profil izleri (no marks=1) never gets the app's gifts it
 * doesn't have (MARK_GIFTS: no name, picture or price of its own); one with it gets each gift's `mark` ({ role, kind,
 * hours } for a gift that leaves or cleans one, hours already the Canlı ayar's where the gift says none). While the
 * feature is off no gift says it does anything.
 */
export function withMarks(gifts, marks, s = live()) {
  if (!marks) return gifts.filter((g) => !MARK_GIFTS.has(g.id));
  if (!marksOn(s)) return gifts;
  const rules = new Map(allGifts().map((g) => [g.id, g.mark]));
  return gifts.map((g) => {
    const m = rules.get(g.id);
    return m ? { ...g, mark: { role: m.role, kind: m.kind, ...(m.role === 'leave' ? { hours: m.hours ?? s.markHours } : {}) } } : g;
  });
}

/** GET /api/catalog's `marks` (marks=1): whether Profil izleri run and the Canlı ayar's hours. */
export const marksInfo = (s = live()) => ({ on: marksOn(s), hours: Number(s.markHours) || 0 });

/** Tells the rooms `uid` is in that their marks changed (their look); best effort. */
export async function announceMarks(uid) {
  // Imported when needed: economy.mjs reads marksView from here.
  const { announceLook } = await import('./economy.mjs');
  await announceLook(uid);
}

/**
 * Takes the showing marks of `uid` off (`how`: 'self' they refuse marks now, 'block' they blocked the person who left
 * them, 'admin' staff; `by`: who did it; `from`: only the ones this person left; `kind`: only that kind), in a
 * transaction of its own that locks their users row first, as a gift does. Returns the rows taken off.
 */
export async function clearMarks(uid, { how, by, from = null, kind = null, audit = null }) {
  const rows = await tx(async (c) => {
    // Their row and the actor's (cleared_by points at it), in id order as a gift locks them: never a deadlock with one.
    const u = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[...new Set([uid, by].filter(Boolean))]]);
    if (!u.rows.some((x) => x.id === uid)) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const r = await c.query(
      `UPDATE profile_marks SET cleared_at = now(), cleared_by = $2, cleared_how = $3
        WHERE user_id = $1 AND cleared_at IS NULL AND expires_at > now() AND ($4::uuid IS NULL OR from_user = $4) AND ($5::text IS NULL OR kind = $5)
        RETURNING id, kind, gift_id, from_user, created_at, expires_at`,
      [uid, by, how, from, kind],
    );
    if (audit) await audit(c, r.rows);
    return r.rows;
  });
  if (rows.length) void announceMarks(uid).catch(() => {});
  return rows;
}

/** Account deletion (social.mjs eraseAccount, same transaction): their marks go; the ones they left lose their name. */
export async function eraseMarks(c, uid) {
  await c.query('DELETE FROM profile_marks WHERE user_id = $1', [uid]);
  await c.query('UPDATE profile_marks SET from_user = NULL WHERE from_user = $1', [uid]);
  await c.query('UPDATE profile_marks SET cleared_by = NULL WHERE cleared_by = $1', [uid]);
}

/**
 * GET /api/user's `marks`: the marks showing on `uid`'s photo, and on my own profile who left each (to block or report
 * them). [] while the feature is off.
 */
export async function profileMarksOf(uid, own, q = db) {
  if (!marksOn()) return [];
  const r = await q.query(
    `SELECT m.kind, m.gift_id, m.expires_at, m.from_user, u.name AS from_name FROM profile_marks m LEFT JOIN users u ON u.id = m.from_user AND u.deleted_at IS NULL
      WHERE m.user_id = $1 AND m.cleared_at IS NULL AND m.expires_at > now() ORDER BY m.id`,
    [uid],
  );
  return r.rows.map((m) => ({ ...markOut(m), ...(own ? { from: m.from_user && m.from_name ? { id: m.from_user, name: m.from_name } : null } : {}) }));
}

/** Verilerimin kopyası (my-data.mjs): the marks left on me and the ones I left, with who and when. */
export async function marksDataOf(c, uid) {
  const rows = (where) =>
    c.query(
      `SELECT m.*, f.name AS from_name, t.name AS to_name FROM profile_marks m LEFT JOIN users f ON f.id = m.from_user LEFT JOIN users t ON t.id = m.user_id
        WHERE ${where} ORDER BY m.id`,
      [uid],
    );
  const one = (m) => ({
    kind: m.kind,
    gift: giftNameOf(m.gift_id) ?? m.gift_id,
    at: m.created_at,
    until: m.expires_at,
    clearedAt: m.cleared_at,
    // How it came off: a cleaning gift, staff, my own Gizlilik choice or a block (staff are never named).
    cleared: m.cleared_how ?? null,
  });
  return {
    received: (await rows('m.user_id = $1')).rows.map((m) => ({ ...one(m), from: m.from_user ? { id: m.from_user, name: m.from_name ?? null } : null })),
    left: (await rows('m.from_user = $1')).rows.map((m) => ({ ...one(m), on: { id: m.user_id, name: m.to_name ?? null } })),
  };
}

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const kindOf = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !KIND.test(v)) throw new HttpError(400, 'Geçersiz iz türü');
  return v;
};
/** A staff view of a mark row: who left it and how it came off. */
const staffView = (m) => ({
  id: Number(m.id),
  kind: m.kind,
  gift: m.gift_id,
  giftName: giftNameOf(m.gift_id) ?? m.gift_id,
  from: m.from_user ? { id: m.from_user, name: m.from_name ?? null } : null,
  at: m.created_at,
  until: m.expires_at,
  showing: !m.cleared_at && new Date(m.expires_at) > new Date(),
  clearedAt: m.cleared_at ?? null,
  cleared: m.cleared_how ?? null,
  clearedBy: m.cleared_by ? { id: m.cleared_by, name: m.cleared_name ?? null } : null,
});

export const markRoutes = {
  /** A person's last 50 marks for staff (Kullanıcılar): who left each, until when, how it came off. */
  async 'GET /api/admin/marks'(req, url) {
    await admin(req);
    const uid = userId(url.searchParams.get('user'), 'kişi');
    const u = (await db.query('SELECT id, name FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const r = await db.query(
      `SELECT m.*, f.name AS from_name, c.name AS cleared_name FROM profile_marks m LEFT JOIN users f ON f.id = m.from_user LEFT JOIN users c ON c.id = m.cleared_by
        WHERE m.user_id = $1 ORDER BY (m.cleared_at IS NULL AND m.expires_at > now()) DESC, m.id DESC LIMIT 50`,
      [uid],
    );
    return { user: { id: u.id, name: u.name }, marks: r.rows.map(staffView), on: marksOn() };
  },

  /**
   * Takes a person's showing marks off (all, or one `kind`): an offensive one, a complaint. An audit_events row with
   * what came off (before) and nothing showing (after), even when there was nothing to take off.
   */
  async 'POST /api/admin/marks/clear'(req) {
    const a = await admin(req);
    const b = await readJson(req, 2048);
    const uid = userId(b.user, 'kişi');
    const kind = kindOf(b.kind);
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 200) : null;
    const rows = await clearMarks(uid, {
      how: 'admin',
      by: a.id,
      kind,
      audit: (c, cleared) =>
        c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
          a.id,
          'marks.clear',
          uid,
          JSON.stringify({ user: uid, kind, reason: reason || null, before: cleared.map((m) => ({ id: Number(m.id), kind: m.kind, gift: m.gift_id, from: m.from_user, until: m.expires_at })), after: [], ...panelDetail(a) }),
          clientIp(req),
        ]),
    });
    return { cleared: rows.length };
  },
};
