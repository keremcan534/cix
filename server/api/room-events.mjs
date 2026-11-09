// Oda etkinlikleri: a server room's planned activities, written by its owner or a Süper Yönetici and seen by
// everyone who opens the room. People mark that they are going; a cancel stays visible (crossed out) for a week.
// A new or cancelled activity tells the room's phones to read the room (and its activities) again.
//
//   GET  /api/rooms/events?room=                         → { events }     (the last week's, newest first, at most 20)
//   POST /api/rooms/events        { room, title, desc?, when, type? } → { event }   (owner or Süper Yönetici)
//   POST /api/rooms/events/cancel { id }                  → { event }      (owner or Süper Yönetici)
//   POST /api/rooms/events/going  { id, going }           → { event }
//
// Titles, descriptions and the time text are public: they pass the contact filter (core.mjs publicText).
import { HttpError, auth, db, int, limit, publicText, readJson } from './core.mjs';
import { announceRoom } from './live.mjs';
import { liveKitName, rankOf, roomRow } from './rooms.mjs';

const KINDS = ['Sohbet', 'Oyun', 'Müzik', 'Yarışma', 'Kutlama', 'Duyuru'];
const view = (e, me) => ({
  id: Number(e.id),
  title: e.title,
  desc: e.description,
  when: e.when_text,
  type: e.kind,
  by: { id: e.creator, name: e.creator_name ?? 'Üye' },
  going: !!e.mine,
  attendees: Number(e.attendees ?? 0),
  cancelled: !!e.cancelled_at,
  createdAt: e.created_at,
  mine: e.creator === me,
});
const SELECT = `SELECT e.*, u.name AS creator_name,
                       (SELECT count(*) FROM room_event_going g WHERE g.event_id = e.id) AS attendees,
                       EXISTS (SELECT 1 FROM room_event_going g WHERE g.event_id = e.id AND g.user_id = $1) AS mine
                  FROM room_events e JOIN users u ON u.id = e.creator`;
async function eventRow(id, me) {
  // A row id comes back from Postgres as a string; the app sends a number.
  const n = typeof id === 'string' && /^\d{1,15}$/.test(id) ? Number(id) : int(id, 1, Number.MAX_SAFE_INTEGER);
  if (!n) throw new HttpError(400, 'Geçersiz etkinlik');
  const r = await db.query(`${SELECT} WHERE e.id = $2`, [me, n]);
  if (!r.rowCount) throw new HttpError(404, 'Etkinlik bulunamadı');
  return r.rows[0];
}

export const roomEventRoutes = {
  async 'GET /api/rooms/events'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    const r = await db.query(`${SELECT} WHERE e.room_id = $2 AND e.created_at > now() - interval '7 days' ORDER BY e.created_at DESC LIMIT 20`, [me.id, room.id]);
    return { events: r.rows.map((e) => view(e, me.id)) };
  },

  async 'POST /api/rooms/events'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if ((await rankOf(room, me.id)) < 2) throw new HttpError(403, 'Etkinliği oda sahibi veya Süper Yönetici ekler');
    limit(`roomevent:${me.id}`, 10, 'Çok sık etkinlik ekliyorsun, biraz bekle');
    const title = await publicText(b.title, 1, 40, 'Etkinlik adı', me, 'room.event', 'title');
    const desc = b.desc === undefined || b.desc === null ? '' : await publicText(b.desc, 0, 120, 'Açıklama', me, 'room.event', 'description');
    const when = await publicText(b.when, 1, 40, 'Zaman', me, 'room.event', 'when');
    const kind = KINDS.includes(b.type) ? b.type : 'Sohbet';
    const r = await db.query('INSERT INTO room_events (room_id, creator, title, description, when_text, kind) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [room.id, me.id, title, desc, when, kind]);
    const id = r.rows[0].id;
    // The one who plans it goes.
    await db.query('INSERT INTO room_event_going (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, me.id]);
    announceRoom(liveKitName(room.id));
    return { event: view(await eventRow(id, me.id), me.id) };
  },

  async 'POST /api/rooms/events/cancel'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const e = await eventRow(b.id, me.id);
    const room = await roomRow(e.room_id);
    if ((await rankOf(room, me.id)) < 2) throw new HttpError(403, 'Etkinliği oda sahibi veya Süper Yönetici iptal eder');
    if (!e.cancelled_at) {
      await db.query('UPDATE room_events SET cancelled_at = now() WHERE id = $1', [e.id]);
      announceRoom(liveKitName(room.id));
    }
    return { event: view(await eventRow(e.id, me.id), me.id) };
  },

  async 'POST /api/rooms/events/going'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.going !== 'boolean') throw new HttpError(400, 'Katılıyorum ya da katılmıyorum seç');
    const e = await eventRow(b.id, me.id);
    if (e.cancelled_at && b.going) throw new HttpError(409, 'Etkinlik iptal edildi');
    limit(`roomevent-going:${me.id}`, 60);
    if (b.going) await db.query('INSERT INTO room_event_going (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.id, me.id]);
    else await db.query('DELETE FROM room_event_going WHERE event_id = $1 AND user_id = $2', [e.id, me.id]);
    return { event: view(await eventRow(e.id, me.id), me.id) };
  },
};
