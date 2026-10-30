// Rooms on the server: who owns them, who manages them, who is kicked or blacklisted. The voice token
// (GET /token) checks this, so a kick is enforced by LiveKit, not only hidden in the app.
//
//   POST /api/rooms        { title, announcement?, roomType?, password? }  → { room }
//   GET  /api/rooms                                                         → { rooms }   (open, newest first)
//   GET  /api/room?id=                                                      → { room }
//   POST /api/rooms/close  { id }                                           → { closed }
//   POST /api/rooms/admin  { room, user, admin }                            → { admin }   (owner only)
//   POST /api/rooms/ban    { room, user, minutes }  (null = blacklist)      → { until }   (owner or admin)
//   POST /api/rooms/unban  { room, user }                                   → { banned: false }
import { HttpError, UUID, auth, blockedBetween, db, int, readJson, sha, text, userId } from './core.mjs';

const TYPES = ['free', 'stage', 'qa', 'music', 'event', 'private'];
/** LiveKit room name of a server room. Prototype rooms (oda-r1 …) keep working without a row. */
export const liveKitName = (id) => `oda-${id}`;

const out = (r) => ({
  id: r.id,
  owner: { id: r.owner, name: r.owner_name, avatarUrl: r.owner_avatar ?? null },
  title: r.title,
  announcement: r.announcement,
  roomType: r.room_type,
  hasPassword: !!r.password_hash,
  createdAt: r.created_at,
  closed: !!r.closed_at,
});
const SELECT = 'SELECT r.*, u.name AS owner_name, u.avatar_url AS owner_avatar FROM rooms r JOIN users u ON u.id = r.owner';

async function roomRow(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'Geçersiz oda');
  const r = await db.query(`${SELECT} WHERE r.id = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  return r.rows[0];
}
const isAdmin = async (roomId, uid) => (await db.query('SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2', [roomId, uid])).rowCount > 0;

/**
 * Whether `u` may join the LiveKit room `name`. Server rooms: not closed, not banned there, the right
 * password for a private room (owner and admins skip it). Unknown names are prototype rooms and pass.
 */
export async function voiceAccess(name, u, password) {
  const m = /^oda-([0-9a-f-]{36})$/.exec(name);
  if (!m) return;
  const r = await db.query('SELECT * FROM rooms WHERE id = $1', [m[1]]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  const room = r.rows[0];
  if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
  const ban = await db.query('SELECT until FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, u.id]);
  if (ban.rowCount) throw new HttpError(403, ban.rows[0].until ? 'Bu odadan geçici olarak çıkarıldın' : 'Bu odaya giremezsin');
  if (await blockedBetween(room.owner, u.id)) throw new HttpError(403, 'Bu odaya giremezsin');
  const staff = room.owner === u.id || (await isAdmin(room.id, u.id));
  if (room.password_hash && !staff && sha(`room:${room.id}:${password ?? ''}`) !== room.password_hash) throw new HttpError(403, 'Oda şifresi yanlış');
}

export const roomRoutes = {
  async 'POST /api/rooms'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const title = text(b.title, 1, 40, 'Oda adı');
    const announcement = b.announcement === undefined ? '' : text(b.announcement, 0, 200, 'Duyuru');
    const roomType = b.roomType ?? 'free';
    if (!TYPES.includes(roomType)) throw new HttpError(400, 'Geçersiz oda türü');
    const password = b.password === undefined || b.password === '' ? null : text(b.password, 4, 32, 'Şifre');
    try {
      const r = await db.query('INSERT INTO rooms (owner, title, announcement, room_type) VALUES ($1,$2,$3,$4) RETURNING id', [me.id, title, announcement, roomType]);
      const id = r.rows[0].id;
      // The hash includes the room id, so the same password in two rooms doesn't give the same hash.
      if (password) await db.query('UPDATE rooms SET password_hash = $2 WHERE id = $1', [id, sha(`room:${id}:${password}`)]);
      return { room: out(await roomRow(id)) };
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Zaten açık bir odan var');
      throw e;
    }
  },

  /** Open rooms, without the ones whose owner and you have blocked each other. */
  async 'GET /api/rooms'(req) {
    const me = await auth(req);
    const r = await db.query(
      `${SELECT} WHERE r.closed_at IS NULL AND u.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = r.owner AND b.blocked = $1) OR (b.blocker = $1 AND b.blocked = r.owner))
       ORDER BY r.created_at DESC LIMIT 100`,
      [me.id],
    );
    return { rooms: r.rows.map(out) };
  },

  async 'GET /api/room'(req, url) {
    await auth(req);
    return { room: out(await roomRow(url.searchParams.get('id'))) };
  },

  async 'POST /api/rooms/close'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).id);
    if (room.owner !== me.id) throw new HttpError(403, 'Odayı yalnızca sahibi kapatabilir');
    await db.query('UPDATE rooms SET closed_at = now() WHERE id = $1 AND closed_at IS NULL', [room.id]);
    return { closed: true };
  },

  async 'POST /api/rooms/admin'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    const target = userId(b.user);
    if (room.owner !== me.id) throw new HttpError(403, 'Yönetici yalnızca oda sahibince atanır');
    if (target === me.id) throw new HttpError(400, 'Oda sahibi zaten yetkili');
    if (b.admin === false) {
      await db.query('DELETE FROM room_admins WHERE room_id = $1 AND user_id = $2', [room.id, target]);
      return { admin: false };
    }
    await db.query('INSERT INTO room_admins (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [room.id, target]);
    return { admin: true };
  },

  /** Kick for `minutes`, or blacklist with minutes = null. Admins can't remove the owner or another admin. */
  async 'POST /api/rooms/ban'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    const target = userId(b.user);
    const owner = room.owner === me.id;
    if (!owner && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    if (target === room.owner || target === me.id) throw new HttpError(400, 'Bu kişi odadan çıkarılamaz');
    if (!owner && (await isAdmin(room.id, target))) throw new HttpError(403, 'Yöneticiyi yalnızca oda sahibi çıkarabilir');
    const minutes = b.minutes === null ? null : int(b.minutes, 1, 60 * 24 * 30);
    if (b.minutes !== null && minutes === null) throw new HttpError(400, 'Süre 1 dakika ile 30 gün arası olmalı');
    const r = await db.query(
      `INSERT INTO room_bans (room_id, user_id, until, by_user) VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(mins => $3::int) END, $4)
       ON CONFLICT (room_id, user_id) DO UPDATE SET until = EXCLUDED.until, by_user = EXCLUDED.by_user, created_at = now() RETURNING until`,
      [room.id, target, minutes, me.id],
    );
    return { until: r.rows[0].until };
  },

  async 'POST /api/rooms/unban'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.owner !== me.id && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    await db.query('DELETE FROM room_bans WHERE room_id = $1 AND user_id = $2', [room.id, userId(b.user)]);
    return { banned: false };
  },
};
