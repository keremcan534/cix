// Oda Sahibi Merkezi on the server: the numbers the owner of a server room sees on its room card.
//
//   GET /api/rooms/owner-stats?room= → { session, since, minutes, listeners, peak, visitors, visits, avgStayMin,
//                                         newMembers, gifts: { coins, count, senders }, level, xp, levelXp, nextXp,
//                                         hours: [{ at, people }] }
//
// Only the room's owner (403 otherwise). "Bu oturum" (this session) starts when the owner came into the room's
// voice this time (room_presence keeps the first join across reconnects); when the server has no record of them
// in it (LiveKit's webhooks aren't set up, or they just left) it is the last 24 hours, and `session` is false.
// Everything is counted from records the server already keeps for other reasons (presence_log and room_presence
// from LiveKit's webhooks, gift_events, room_members, the owner's room XP): nothing new is stored, nobody is named,
// and the owner's own visits and gifts are left out of the visitor and gift numbers (the peak counts everyone).
// `hours`: how many different people were in the room in each of the last 10 hours, the current one last.
// There is no room owner share on the server: a gift's diamonds go to its recipient (gifts.mjs) and the room's gift
// coins only raise the owner's room level, so no payout figure is given here.
import { HttpError, UUID, auth, db } from './core.mjs';
import { voiceCounts } from './live.mjs';
import { ROOM_MAX_LEVEL, ROOM_XP_THRESHOLDS, roomLevel } from './rooms.mjs';

const HOURS = 10;

/** The visits that overlap [since, now], cut to it: presence_log's finished ones and room_presence's ongoing ones. */
const VISITS = `SELECT user_id::text AS who, greatest(joined_at, $2) AS a, left_at AS b FROM presence_log WHERE room = $1 AND left_at > $2
                UNION ALL SELECT identity, greatest(joined_at, $2), now() FROM room_presence WHERE room = $1`;

export const roomOwnerRoutes = {
  async 'GET /api/rooms/owner-stats'(req, url) {
    const me = await auth(req);
    const roomId = String(url.searchParams.get('room') ?? '').replace(/^oda-/, '');
    if (!UUID.test(roomId)) throw new HttpError(400, 'Geçersiz oda');
    const room = (await db.query('SELECT r.id, r.owner, r.closed_at, u.room_xp FROM rooms r JOIN users u ON u.id = r.owner WHERE r.id = $1', [roomId])).rows[0];
    if (!room) throw new HttpError(404, 'Oda bulunamadı');
    if (room.owner !== me.id) throw new HttpError(403, 'Oda Sahibi Merkezi yalnızca oda sahibine açık');
    const name = `oda-${roomId}`;
    const w = (
      await db.query(
        `SELECT p.joined_at, coalesce(p.joined_at, now() - interval '24 hours') AS since, now() AS now
           FROM (SELECT 1) one LEFT JOIN room_presence p ON p.room = $1 AND p.identity = $2`,
        [name, me.id],
      )
    ).rows[0];
    const since = w.since;
    const visits = (
      await db.query(
        `SELECT count(DISTINCT who) FILTER (WHERE who <> $3)::int AS visitors, count(*) FILTER (WHERE who <> $3)::int AS visits,
                coalesce(avg(extract(epoch FROM b - a)) FILTER (WHERE who <> $3), 0)::float AS avg_s
           FROM (${VISITS}) v`,
        [name, since, me.id],
      )
    ).rows[0];
    // The most people in the room at once: every visit is +1 at its start and -1 at its end (an end first when both
    // fall on the same moment), and the running sum's highest point is the peak.
    const peak = (
      await db.query(
        `WITH v AS (${VISITS}), e AS (SELECT a AS t, 1 AS d FROM v UNION ALL SELECT b, -1 FROM v)
         SELECT coalesce(max(n), 0)::int AS n FROM (SELECT sum(d) OVER (ORDER BY t, d ROWS UNBOUNDED PRECEDING) AS n FROM e) s`,
        [name, since],
      )
    ).rows[0].n;
    const here = Number((await db.query('SELECT count(*) AS n FROM room_presence WHERE room = $1', [name])).rows[0].n);
    const listeners = (await voiceCounts())?.get(name) ?? here;
    const hours = await db.query(
      `WITH v AS (SELECT user_id::text AS who, joined_at AS a, left_at AS b FROM presence_log WHERE room = $1 AND left_at > date_trunc('hour', now()) - make_interval(hours => $2::int - 1)
                  UNION ALL SELECT identity, joined_at, now() FROM room_presence WHERE room = $1)
       SELECT h AS at, (SELECT count(DISTINCT who) FROM v WHERE v.a < h + interval '1 hour' AND v.b > h)::int AS people
         FROM generate_series(date_trunc('hour', now()) - make_interval(hours => $2::int - 1), date_trunc('hour', now()), interval '1 hour') h ORDER BY h`,
      [name, HOURS],
    );
    const gifts = (
      await db.query(
        `SELECT coalesce(sum(total), 0)::bigint AS coins, count(*)::int AS n, count(DISTINCT sender)::int AS senders
           FROM gift_events WHERE room = ANY($1::text[]) AND created_at >= $2 AND sender <> $3`,
        [[roomId, name], since, me.id],
      )
    ).rows[0];
    const newMembers = (await db.query("SELECT count(*)::int AS n FROM room_members WHERE room_id = $1 AND status = 'member' AND created_at >= $2 AND user_id <> $3", [roomId, since, me.id])).rows[0].n;
    const xp = Number(room.room_xp ?? 0);
    const level = roomLevel(xp);
    return {
      session: !!w.joined_at,
      since: since.toISOString(),
      minutes: w.joined_at ? Math.max(0, Math.floor((w.now - w.joined_at) / 60_000)) : null,
      listeners,
      peak: Math.max(peak, listeners),
      visitors: visits.visitors,
      visits: visits.visits,
      avgStayMin: Math.round(visits.avg_s / 60),
      newMembers,
      gifts: { coins: Number(gifts.coins), count: gifts.n, senders: gifts.senders },
      level,
      xp,
      levelXp: ROOM_XP_THRESHOLDS[level - 1],
      nextXp: level >= ROOM_MAX_LEVEL ? null : ROOM_XP_THRESHOLDS[level],
      hours: hours.rows.map((x) => ({ at: x.at.toISOString(), people: x.people })),
    };
  },
};
