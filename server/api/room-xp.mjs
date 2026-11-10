// Sıralama › Oda XP: the open rooms that earned the most room XP this day, week or month (Turkey's calendar, as the
// gift rankings: gifts.mjs). Room XP is the coins of gifts sent in a room (gifts.mjs, lucky.mjs add them to the
// owner's users.room_xp, which gives the room its level, rooms.mjs roomLevel), so a room's XP in a period is the sum
// of its gift_events then. Rooms whose owner I block, or who blocks me, are left out.
//
//   GET /api/rankings/room-xp?period=day|week|month → { rows: [{ rank, room, score }] }   (room as GET /api/rooms)
//
// Nothing is stored for this; it reads gift_events and rooms.
import { HttpError, auth, db } from './core.mjs';
import { PERIODS } from './gifts.mjs';
import { ROOM_SELECT, roomOut } from './rooms.mjs';

const SINCE = `date_trunc($1, now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'`;

export async function roomXpBoard(viewer, period, n = 50) {
  const r = await db.query(
    `WITH xp AS (
       SELECT regexp_replace(g.room, '^oda-', '') AS rid, sum(g.total) AS score
         FROM gift_events g
        WHERE g.room IS NOT NULL AND g.created_at >= ${SINCE}
        GROUP BY 1 HAVING sum(g.total) > 0
     )
     SELECT q.*, xp.score FROM (${ROOM_SELECT} WHERE r.closed_at IS NULL AND u.deleted_at IS NULL) q JOIN xp ON xp.rid = q.id::text
      WHERE NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $2 AND b.blocked = q.owner) OR (b.blocker = q.owner AND b.blocked = $2))
      ORDER BY xp.score DESC, q.id LIMIT $3`,
    [period, viewer, n],
  );
  return r.rows.map((x, i) => ({ rank: i + 1, room: roomOut(x), score: Number(x.score) }));
}

export const roomXpRoutes = {
  async 'GET /api/rankings/room-xp'(req, url) {
    const me = await auth(req);
    const period = url.searchParams.get('period') ?? 'week';
    if (!PERIODS.includes(period)) throw new HttpError(400, 'Geçersiz sıralama');
    return { rows: await roomXpBoard(me.id, period) };
  },
};
