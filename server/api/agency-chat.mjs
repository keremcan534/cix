// Ajans sohbet grubu: one private group per approved agency. In it: the agency's streamers (an open membership),
// its owner and its staff (an open assignment in that agency). A sub-agency has its own group: the parent agency's
// people are not in it, and neither is the centre. Nobody else reads a line or sees who is in the group.
//
//   GET  /api/agency/chat/groups        → { groups: [{ id, name, role }] }   (the groups I am in)
//   GET  /api/agency/chat?id=&after=    → { messages }                       (oldest first, at most 100)
//   POST /api/agency/chat { id, text }  → { message }
//   GET  /api/agency/chat/members?id=   → { members }                        (who is online, in which room, last seen)
//
// Messages pass the contact filter and a mute on public text stops writing (as in the family chat). The members
// list respects each person's own privacy choices (privacy.mjs): "Çevrimiçi durumumu göster" off hides whether they
// are online and when they were last seen, "Bulunduğum odayı göster" off hides the room.
import { HttpError, auth, db, limit, publicText, readJson } from './core.mjs';
import { privacyMap } from './privacy.mjs';
import { assertMay } from './sanctions.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Seen in the last 5 minutes counts as online (the family's list says the same). */
const ONLINE_MS = 5 * 60_000;
const MEMBERS_MAX = 500;

/** My place in each approved agency's group: owner before staff before streamer. */
const GROUPS = `
  SELECT a.id, a.name,
         CASE WHEN a.owner_id = $1 THEN 'owner'
              WHEN EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = $1 AND s.agency_id = a.id AND s.revoked_at IS NULL) THEN 'staff'
              ELSE 'streamer' END AS role
    FROM agencies a
   WHERE a.status = 'approved'
     AND (a.owner_id = $1
          OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = $1 AND s.agency_id = a.id AND s.revoked_at IS NULL)
          OR EXISTS (SELECT 1 FROM agency_streamers m WHERE m.streamer_id = $1 AND m.agency_id = a.id AND m.ended_at IS NULL))`;

/** The group `id` as I am in it, or 403: the same answer for an agency that isn't there, so nothing is told. */
async function groupOf(uid, id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'Geçersiz ajans');
  const r = await db.query(`${GROUPS} AND a.id = $2`, [uid, id]);
  if (!r.rowCount) throw new HttpError(403, 'Bu ajans grubuna yalnızca ajansın üyeleri girebilir');
  return r.rows[0];
}

const authorOf = (x) => ({ id: x.author, name: x.name, avatarUrl: x.avatar_url ?? null, gender: x.gender ?? null });

export const agencyChatRoutes = {
  async 'GET /api/agency/chat/groups'(req) {
    const me = await auth(req);
    const r = await db.query(`${GROUPS} ORDER BY a.name, a.id`, [me.id]);
    return { groups: r.rows.map((g) => ({ id: g.id, name: g.name, role: g.role })) };
  },

  async 'GET /api/agency/chat'(req, url) {
    const me = await auth(req);
    const g = await groupOf(me.id, url.searchParams.get('id'));
    const after = Number(url.searchParams.get('after') ?? 0);
    const r = await db.query(
      `SELECT * FROM (SELECT m.id, m.author, m.body, m.created_at, u.name, u.avatar_url, CASE WHEN u.gender_hidden THEN NULL ELSE u.gender END AS gender
         FROM agency_messages m JOIN users u ON u.id = m.author
        WHERE m.agency_id = $1 AND m.id > $2 AND u.deleted_at IS NULL ORDER BY m.id DESC LIMIT 100) x ORDER BY id`,
      [g.id, Number.isSafeInteger(after) && after > 0 ? after : 0],
    );
    return { messages: r.rows.map((x) => ({ id: String(x.id), author: authorOf(x), text: x.body, createdAt: x.created_at })) };
  },

  async 'POST /api/agency/chat'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const g = await groupOf(me.id, b.id);
    await assertMay(me, 'post');
    const body = await publicText(b.text, 1, 500, 'Mesaj', me, 'agency.chat', 'text');
    limit(`agency-chat:${me.id}`, 30, 'Çok hızlı yazıyorsun, biraz bekle');
    const r = await db.query('INSERT INTO agency_messages (agency_id, author, body) VALUES ($1, $2, $3) RETURNING id, created_at', [g.id, me.id, body]);
    return {
      message: {
        id: String(r.rows[0].id),
        author: { id: me.id, name: me.name, avatarUrl: me.avatar_url ?? null, gender: me.gender_hidden ? null : (me.gender ?? null) },
        text: body,
        createdAt: r.rows[0].created_at,
      },
    };
  },

  async 'GET /api/agency/chat/members'(req, url) {
    const me = await auth(req);
    const g = await groupOf(me.id, url.searchParams.get('id'));
    // One line per person, by their highest place in the agency.
    const r = await db.query(
      `WITH m AS (
         SELECT owner_id AS id, 'owner' AS role, 0 AS ord FROM agencies WHERE id = $1 AND owner_id IS NOT NULL
         UNION ALL SELECT user_id, 'staff', 1 FROM staff_assignments WHERE agency_id = $1 AND revoked_at IS NULL
         UNION ALL SELECT streamer_id, 'streamer', 2 FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL
       ), one AS (SELECT DISTINCT ON (id) id, role, ord FROM m ORDER BY id, ord)
       SELECT one.id, one.role, one.ord, u.name, u.avatar_url, CASE WHEN u.gender_hidden THEN NULL ELSE u.gender END AS gender,
              rm.id AS room_id, rm.title AS room_title,
              (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = one.id) AS seen
         FROM one JOIN users u ON u.id = one.id AND u.deleted_at IS NULL
         LEFT JOIN LATERAL (SELECT r.id, r.title FROM room_presence p JOIN rooms r ON p.room = 'oda-' || r.id::text AND r.closed_at IS NULL
                             WHERE p.identity = one.id::text ORDER BY p.joined_at DESC LIMIT 1) rm ON true
        ORDER BY one.ord, u.name, one.id LIMIT ${MEMBERS_MAX}`,
      [g.id],
    );
    const shows = await privacyMap(db, r.rows.map((x) => x.id));
    const fresh = Date.now() - ONLINE_MS;
    const members = r.rows.map((x) => {
      // My own line is never hidden from me.
      const p = x.id === me.id ? { showOnline: true, showCurrentRoom: true } : shows.get(x.id);
      const seen = x.seen ? new Date(x.seen) : null;
      const room = p.showCurrentRoom && x.room_id ? { id: x.room_id, title: x.room_title } : null;
      return {
        id: x.id,
        name: x.name,
        avatarUrl: x.avatar_url ?? null,
        gender: x.gender ?? null,
        role: x.role,
        // null: they chose not to show it.
        online: p.showOnline ? !!room || (!!seen && seen.getTime() > fresh) : room ? true : null,
        room,
        lastSeenAt: p.showOnline && seen ? seen.toISOString() : null,
      };
    });
    return { members };
  },
};
