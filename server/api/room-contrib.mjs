// Oda katkı sıralaması: who sent (Cömertlik) and who received (Yankı) the most gift coins in one server room this
// hour, day or week. Turkey's calendar, as the other rankings (gifts.mjs): the hour and the day start on the clock
// in Istanbul, the week on Monday 00:00. 1 coin of a gift = 1 point: the gift's coins as gift_events keeps them
// (a Şanslı hediye counts its recipient's share, as Sıralama and the Patron koltuğu do).
//
//   GET /api/rooms/contrib?room=&side=sent|received&period=hour|day|week
//     → { rows: [{ rank, user: { id, name, avatarUrl }, score }], me: { rank, score }, since }
//
// `rows`: the top 50; a tie goes to whoever gave (or got) their first gift of the period earlier. `me`: my own place
// in the whole list (rank null and score 0 when I'm not in it). Any signed-in person may read it, for any server
// room (404 when there is none); deleted accounts leave the list. Nothing is stored for this: it reads gift_events
// by the room's id or its LiveKit name, as the app sends either (index gift_events_room_time).
import { HttpError, UUID, auth, db } from './core.mjs';

export const CONTRIB_SIDES = { sent: 'sender', received: 'recipient' };
export const CONTRIB_PERIODS = ['hour', 'day', 'week'];
const TOP = 50;

/** The board of one room: its top `n` and my place. `roomId` is the room's uuid. */
export async function roomContrib(roomId, side, period, me, n = TOP) {
  const col = CONTRIB_SIDES[side];
  const since = (await db.query(`SELECT date_trunc($1, now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul' AS since`, [period])).rows[0].since;
  const r = await db.query(
    `WITH s AS (
       SELECT g.${col} AS who, sum(g.total) AS score, min(g.created_at) AS first
         FROM gift_events g
        WHERE g.room = ANY($1::text[]) AND g.created_at >= $2
        GROUP BY g.${col}
     ), ranked AS (
       SELECT s.who, s.score, u.name, u.avatar_url, row_number() OVER (ORDER BY s.score DESC, s.first, s.who) AS rank
         FROM s JOIN users u ON u.id = s.who
        WHERE u.deleted_at IS NULL AND s.score > 0
     )
     SELECT * FROM ranked WHERE rank <= $3 OR who = $4 ORDER BY rank`,
    [[roomId, `oda-${roomId}`], since, n, me],
  );
  const rows = r.rows.filter((x) => Number(x.rank) <= n).map((x) => ({ rank: Number(x.rank), user: { id: x.who, name: x.name, avatarUrl: x.avatar_url ?? null }, score: Number(x.score) }));
  const mine = r.rows.find((x) => x.who === me);
  return { rows, me: { rank: mine ? Number(mine.rank) : null, score: mine ? Number(mine.score) : 0 }, since: since.toISOString() };
}

export const roomContribRoutes = {
  async 'GET /api/rooms/contrib'(req, url) {
    const me = await auth(req);
    const roomId = String(url.searchParams.get('room') ?? '').replace(/^oda-/, '');
    if (!UUID.test(roomId)) throw new HttpError(400, 'Geçersiz oda');
    const side = url.searchParams.get('side') ?? 'sent';
    const period = url.searchParams.get('period') ?? 'day';
    // Own keys only: 'constructor' would otherwise reach the SQL as a column name.
    if (!Object.hasOwn(CONTRIB_SIDES, side) || !CONTRIB_PERIODS.includes(period)) throw new HttpError(400, 'Geçersiz sıralama');
    if (!(await db.query('SELECT 1 FROM rooms WHERE id = $1', [roomId])).rowCount) throw new HttpError(404, 'Oda bulunamadı');
    return roomContrib(roomId, side, period, me.id);
  },
};
