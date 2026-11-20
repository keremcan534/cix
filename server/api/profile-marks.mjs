// Profil izleri (docs/PROFIL_IZLERI.md; Güncelleme 7 item 11, Muzip hediyeler): a Muzip gift that leaves a mark on its
// receiver's profile photo (💩 Kaka Şakası: Kaka İzi; 🩴 Terlik Geldi!: Kırık Cam) and one that cleans it (💧 Temizlik
// Suyu, Cam Tamiri; dearer). Which gift leaves or cleans which kind is on the gift rows (profile-mark-rules.mjs), the
// kinds themselves are data (mark-kinds.mjs: name, overlay picture, minutes), so the panel makes new pairs. The
// owners' rules (20 Nov 2026, docs/PROFIL_IZLERI.md):
//   - a mark stays its gift's minutes (else its kind's, else Canlı ayarlar › Profil izleri hours: 24) or until someone
//     sends a gift that cleans its kind;
//   - one mark at a time: the same kind again starts its time again (kind stack 'refresh'; 'replace': the old one is
//     set aside), another kind takes the place of the one showing (cleared_how 'replaced');
//   - who may leave one is the receiver's Gizlilik choice (privacy.mjs marksFrom: everyone, the people they follow —
//     the default, also for whoever never chose —, nobody; "Profilime iz bırakılmasın" is nobody): anyone else is
//     refused before any coin moves (403 marks_off / marks_following), each receiver of a send to many on their own;
//   - the choice blocks new marks only: the ones showing stay; nobody takes their own mark off for free (the owners'
//     decision, docs/DENETIM.md): it comes off with a cleaning gift, by time, by staff, or when they block its leaver;
//   - a cleaning gift on a clean profile is a plain gift; no limit on how often.
// The cleaning gift's diamonds go to the cleaned person (a normal gift).
//
//   GET  /api/admin/marks?user=<id>                      → { user, marks }   their last 50 marks, the ones showing first
//   POST /api/admin/marks/clear { user, kind?, reason? } → { cleared }       the ones showing come off (an audit row)
//
// Where it runs elsewhere: gifts.mjs (markGift in the send's transaction, after both users rows are locked; the room's
// gift packet and the send's answer carry `mark`, a retry's answer too; the push says it), economy.mjs looksOf (every
// look carries `marks`, `marksFrom` and `noMarks`: room seats, profiles, the person card), social.mjs (GET /api/user
// `marks`, a block takes the blocked person's marks off, account deletion), privacy.mjs (marksFrom, profileMarks),
// my-data.mjs (marksDataOf), live-registry.mjs (mark_hours; 0 turns the feature off: the gifts are plain gifts and no
// mark shows), mark-kinds.mjs (a kind turned off does the same for its gifts and marks).
// A mark that changed outside a room's gift packet (a gift sent from a profile or a chat, a mark another kind
// replaced, a clean by staff, a block) reaches the rooms the person is in as their look (economy.mjs announceLook).
import { HttpError, auth, clientIp, db, readJson, tx, userId } from './core.mjs';
import { allGifts, giftEmojiOf, giftNameOf } from './custom-gifts.mjs';
import { live } from './live-settings.mjs';
import { kindsCatalog, markKindOf, markKindOn } from './mark-kinds.mjs';
import { panelDetail } from './panel.mjs';
import { KIND, MARK_GIFTS, MARK_ROLES, hoursFor, markNotice, marksAllow, marksRuleOf } from './profile-mark-rules.mjs';

/** Profil izleri run (Canlı ayarlar › Profil izleri › süre above 0). */
export const marksOn = (s = live()) => Number(s.markHours) > 0;

/** How long a mark gift `rule` leaves stays, in minutes: the gift's own, else its kind's, else the Canlı ayar's. */
export const markMinutesOf = (rule, s = live()) => rule.minutes ?? markKindOf(rule.kind)?.minutes ?? Number(s.markHours) * 60;

/** A mark row as phones get it: its kind, the gift that left it (for the badge), and until when it shows. */
const markOut = (m) => ({ kind: m.kind, gift: m.gift_id, emoji: giftEmojiOf(m.gift_id) ?? '💩', until: new Date(m.expires_at).toISOString() });

/**
 * The marks showing in a look (economy.mjs looksOf reads them with the person's row: { kind, gift_id, expires_at }
 * each): [] while the feature is off; a kind turned off (mark-kinds.mjs) doesn't show.
 */
export const marksView = (rows, s = live()) => (marksOn(s) && Array.isArray(rows) ? rows.filter((m) => markKindOn(m.kind)).map(markOut) : []);

/** The emoji of the gift that cleans `kind` now (the cheapest on the shelves), or null when none does. */
export function cleanEmojiOf(kind, s = live()) {
  const g = allGifts()
    .filter((x) => x.enabled && !s.giftsHidden.has(x.id) && x.mark?.role === 'clean' && x.mark.kind === kind)
    .sort((a, b) => a.price - b.price)[0];
  return g ? g.emoji : null;
}

/**
 * Why `name` refuses a mark from this sender (their Gizlilik rule, privacy.mjs marksFrom): the 403 a send gets, the
 * code telling the app which (marks_off: nobody, marks_following: only the people they follow).
 */
function marksRefusal(rule, name, gift) {
  const who = name ?? 'Bu kişi';
  return rule === 'nobody'
    ? Object.assign(new HttpError(403, `${who}, profiline iz bırakılmasını kapattı. ${gift.name} ona gönderilemez; başka bir hediye seçebilirsin.`), { extra: { code: 'marks_off' } })
    : Object.assign(new HttpError(403, `${who}, profiline yalnız takip ettiği kişilerin iz bırakmasına izin veriyor. ${gift.name} ona gönderilemez; başka bir hediye seçebilirsin.`), {
        extra: { code: 'marks_following' },
      });
}

/**
 * Inside a gift's transaction (gifts.mjs), after both people's users rows are locked (send-locks.mjs), the ref is
 * claimed and the gift's row is written (`eventId`), before any coin moves: what `gift` does to `to`'s profile.
 * A gift that leaves a mark on someone whose Gizlilik doesn't let this sender (nobody, or only the people they follow
 * and they don't follow `from`) is refused here (403: the transaction rolls back, nothing moved). Each row is written
 * once, and `to` has one mark showing at most: a leave of the kind showing ends it (refresh: it expires now; replace:
 * set aside), one of another kind sets that one aside ('replaced'), then its own row starts. A clean takes the kind's
 * showing mark off (none: a plain gift). Null when nothing changed; else what the room's packet and the answer carry
 * (`hours` rounded up for an app before minutes; `replaced`: the kinds it took the place of).
 */
export async function markGift(c, { gift, from, to, eventId, s = live() }) {
  const rule = gift.mark;
  if (!rule || !marksOn(s) || !markKindOn(rule.kind)) return null;
  if (rule.role === 'leave') {
    const who = (
      await c.query(
        `SELECT u.name, p.profile_marks, p.marks_from, EXISTS (SELECT 1 FROM follows f WHERE f.follower = u.id AND f.followee = $2) AS follows_sender
           FROM users u LEFT JOIN privacy_settings p ON p.user_id = u.id WHERE u.id = $1`,
        [to, from],
      )
    ).rows[0];
    const allowed = marksRuleOf(who?.profile_marks ?? true, who?.marks_from);
    if (!marksAllow(allowed, who?.follows_sender === true)) throw marksRefusal(allowed, who?.name, gift);
    const minutes = markMinutesOf(rule, s);
    // Their users row is locked (the gift's): nothing else writes their marks meanwhile.
    const showing = (await c.query('SELECT id, kind FROM profile_marks WHERE user_id = $1 AND cleared_at IS NULL AND expires_at > now() ORDER BY id', [to])).rows;
    const same = showing.filter((m) => m.kind === rule.kind).map((m) => m.id);
    const other = showing.filter((m) => m.kind !== rule.kind);
    const refresh = (markKindOf(rule.kind)?.stack ?? 'refresh') === 'refresh';
    const aside = [...other.map((m) => m.id), ...(refresh ? [] : same)];
    if (refresh && same.length) await c.query('UPDATE profile_marks SET expires_at = now() WHERE id = ANY($1::bigint[])', [same]);
    if (aside.length) {
      await c.query("UPDATE profile_marks SET cleared_at = now(), cleared_by = $2, clear_event_id = $3, cleared_how = 'replaced' WHERE id = ANY($1::bigint[])", [aside, from, eventId]);
    }
    const r = await c.query(
      'INSERT INTO profile_marks (user_id, from_user, kind, gift_id, gift_event_id, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6)) RETURNING expires_at',
      [to, from, rule.kind, gift.id, eventId, minutes],
    );
    const replaced = [...new Set(other.map((m) => m.kind))];
    return {
      role: 'leave',
      kind: rule.kind,
      gift: gift.id,
      emoji: gift.emoji,
      until: r.rows[0].expires_at.toISOString(),
      hours: hoursFor(minutes),
      minutes,
      again: refresh && same.length > 0,
      clean: cleanEmojiOf(rule.kind, s),
      ...(replaced.length ? { replaced } : {}),
    };
  }
  const r = await c.query(
    "UPDATE profile_marks SET cleared_at = now(), cleared_by = $3, clear_event_id = $4, cleared_how = 'gift' WHERE user_id = $1 AND kind = $2 AND cleared_at IS NULL AND expires_at > now()",
    [to, rule.kind, from, eventId],
  );
  return r.rowCount ? { role: 'clean', kind: rule.kind, gift: gift.id, emoji: gift.emoji } : null;
}

/**
 * A retry's answer (gifts.mjs, the ref already went through): the mark that gift left, while it still shows, or the
 * clean it made, so a phone whose first answer was lost still draws it outside a room. Null for none.
 */
export async function markOfEvent(eventId, s = live()) {
  if (!eventId || !marksOn(s)) return null;
  const r = await db.query(
    `SELECT m.kind, m.gift_id, m.expires_at, m.created_at, (m.gift_event_id = $1 AND m.cleared_at IS NULL AND m.expires_at > now()) AS left_now, m.clear_event_id = $1 AND m.cleared_how = 'gift' AS cleaned
       FROM profile_marks m WHERE m.gift_event_id = $1 OR (m.clear_event_id = $1 AND m.cleared_how = 'gift') LIMIT 2`,
    [eventId],
  );
  const left = r.rows.find((m) => m.left_now);
  if (left && markKindOn(left.kind)) {
    const minutes = Math.max(1, Math.round((new Date(left.expires_at) - new Date(left.created_at)) / 60_000));
    return { role: 'leave', kind: left.kind, gift: left.gift_id, emoji: giftEmojiOf(left.gift_id) ?? '💩', until: new Date(left.expires_at).toISOString(), hours: hoursFor(minutes), minutes, again: false, clean: cleanEmojiOf(left.kind, s) };
  }
  const clean = r.rows.find((m) => m.cleaned);
  const by = clean && (await db.query('SELECT gift_id FROM gift_events WHERE id = $1', [eventId])).rows[0];
  return by ? { role: 'clean', kind: clean.kind, gift: by.gift_id, emoji: giftEmojiOf(by.gift_id) ?? '💧' } : null;
}

/** The push a gift outside a room sends when it left a mark ("X sana 💩 attı; 24 saat kalır…"); null for any other gift. */
export const markPushBody = (mark, fromName) => (mark?.role === 'leave' ? markNotice(fromName, mark.emoji, mark.minutes ?? (mark.hours ?? 24) * 60, mark.clean) : null);

/**
 * Which Profil izleri a catalog request asks for (GET /api/catalog `marks`, more than one allowed): 2 the kinds and
 * minutes (this app since 1.1.0, which sends marks=1&marks=2 so a server before kinds answers it as a G7 app), 1 the
 * rules in hours (G7: preview-191/192), 0 none (older apps).
 */
export function marksLevel(url) {
  const asked = url?.searchParams.getAll('marks') ?? [];
  return asked.includes('2') ? 2 : asked.includes('1') ? 1 : 0;
}

/**
 * GET /api/catalog's gifts for this phone. An app without Profil izleri (level 0) never gets a gift that leaves or
 * cleans a mark: it would show it as a plain gift, and the person it marks could neither see nor refuse it (MARK_GIFTS,
 * the app's two it has no picture of, and every gift the panel gave a rule: Kar Topu, Domates At, Terlik Geldi!…). One
 * with it gets each gift's `mark`: { role, kind } and for a leave `hours` (rounded up), with level 2 also `minutes`.
 * While the feature is off, or for a gift whose kind is turned off, no gift says it does anything.
 */
export function withMarks(gifts, level, s = live()) {
  const rules = new Map(allGifts().map((g) => [g.id, g.mark]));
  if (!level) return gifts.filter((g) => !MARK_GIFTS.has(g.id) && !MARK_ROLES.includes(rules.get(g.id)?.role));
  if (!marksOn(s)) return gifts;
  return gifts.map((g) => {
    const m = rules.get(g.id);
    if (!m || !MARK_ROLES.includes(m.role) || !markKindOn(m.kind)) return g;
    if (m.role !== 'leave') return { ...g, mark: { role: m.role, kind: m.kind } };
    const minutes = markMinutesOf(m, s);
    return { ...g, mark: { role: 'leave', kind: m.kind, hours: hoursFor(minutes), ...(level >= 2 ? { minutes } : {}) } };
  });
}

/**
 * GET /api/catalog's `marks`: whether Profil izleri run and the Canlı ayar's hours (level 1); level 2 adds the same in
 * minutes, the kinds (mark-kinds.mjs kindsCatalog: name, overlay picture, minutes, stack) and the server's clock, which
 * the app hides a mark by (its own clock may be off).
 */
export const marksInfo = (s = live(), level = 1) => {
  const hours = Number(s.markHours) || 0;
  return level >= 2 ? { on: marksOn(s), hours, minutes: hours * 60, kinds: kindsCatalog(), serverNow: new Date().toISOString() } : { on: marksOn(s), hours };
};

/** Tells the rooms `uid` is in that their marks changed (their look); best effort. */
export async function announceMarks(uid) {
  // Imported when needed: economy.mjs reads marksView from here.
  const { announceLook } = await import('./economy.mjs');
  await announceLook(uid);
}

/**
 * Takes the showing marks of `uid` off (`how`: 'block' they blocked the person who left them, 'admin' staff; 'self'
 * was "Profilime iz bırakılmasın" before 105 and is only in older rows now; `by`: who did it; `from`: only the ones
 * this person left; `kind`: only that kind), in a transaction of its own that locks their users row first, as a gift
 * does. Returns the rows taken off.
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
  // A kind turned off doesn't show (marksView); filtered below.
  const r = await q.query(
    `SELECT m.kind, m.gift_id, m.expires_at, m.from_user, u.name AS from_name FROM profile_marks m LEFT JOIN users u ON u.id = m.from_user AND u.deleted_at IS NULL
      WHERE m.user_id = $1 AND m.cleared_at IS NULL AND m.expires_at > now() ORDER BY m.id`,
    [uid],
  );
  return r.rows.filter((m) => markKindOn(m.kind)).map((m) => ({ ...markOut(m), ...(own ? { from: m.from_user && m.from_name ? { id: m.from_user, name: m.from_name } : null } : {}) }));
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
    // How it came off: a cleaning gift, staff, my own Gizlilik choice (before 105), a block or another mark that took
    // its place (staff are never named).
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
