// Rooms on the server: who owns them, who manages them, who is kicked or blacklisted. The voice token
// (GET /token) checks this, so a kick is enforced by LiveKit, not only hidden in the app: closing a room ends it
// in LiveKit and a kick or blacklist removes the person from the call (live.mjs RoomService).
//
//   POST /api/rooms        { title, announcement?, roomType?, password? }  → { room }
//   GET  /api/rooms                                                         → { rooms }   (open, fullest first)
//   GET  /api/room?id=                                                      → { room }
//   POST /api/rooms/close  { id }                                           → { closed }
//   POST /api/rooms/update { id, title?, announcement? }                    → { room }    (owner only)
//   POST /api/rooms/admin  { room, user, admin }                            → { admin }   (owner only)
//   POST /api/rooms/ban    { room, user, minutes }  (null = blacklist)      → { until }   (owner or admin)
//   POST /api/rooms/unban  { room, user }                                   → { banned: false }
//   POST /api/rooms/mute   { room, user, kind: text|voice, minutes|null, reason, description? } → { sanction }
//   POST /api/rooms/unmute { sanction, reason? }                            → { lifted }
//   GET  /api/rooms/mutes?room=                                             → { mutes }    (owner or admin)
// Room mutes are sanctions (sanctions.mjs): their own row, server time, audited. A room admin mutes for up to
// 7 days; the owner also without an end. Nobody mutes the owner, platform staff or (unless owner) another admin.
import { HttpError, LIVE_SANCTION, SANCTION_SELECT, UUID, auth, blockedBetween, db, env, int, limit, readJson, sanctionView, sha, text, userId } from './core.mjs';
// live.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { deleteVoiceRoom, removeFromVoice } from './live.mjs';
import { applySanction, audit, liftSanction } from './sanctions.mjs';

const TYPES = ['free', 'stage', 'qa', 'music', 'event', 'private'];
/** LiveKit room name of a server room. */
export const liveKitName = (id) => `oda-${id}`;
/** The app's sample rooms (oda-r1 …) have no row: voice for them only on a development server. */
const PROTOTYPE_ROOMS = env.ALLOW_PROTOTYPE_ROOMS === '1';

const out = (r) => ({
  id: r.id,
  owner: { id: r.owner, name: r.owner_name, avatarUrl: r.owner_avatar ?? null },
  title: r.title,
  announcement: r.announcement,
  roomType: r.room_type,
  hasPassword: !!r.password_hash,
  createdAt: r.created_at,
  closed: !!r.closed_at,
  listeners: Number(r.listeners ?? 0),
});
/** Listeners come from LiveKit's webhooks (live.mjs room_presence). */
const SELECT = `SELECT r.*, u.name AS owner_name, u.avatar_url AS owner_avatar,
                       (SELECT count(*) FROM room_presence p WHERE p.room = 'oda-' || r.id::text) AS listeners
                  FROM rooms r JOIN users u ON u.id = r.owner`;

async function roomRow(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'Geçersiz oda');
  const r = await db.query(`${SELECT} WHERE r.id = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  return r.rows[0];
}
const isAdmin = async (roomId, uid) => (await db.query('SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2', [roomId, uid])).rowCount > 0;

/**
 * Whether `u` may join the LiveKit room `name`: a server room that exists and is open, not banned there, the
 * right password for a private room (owner and admins skip it). Other names only with ALLOW_PROTOTYPE_ROOMS=1.
 */
export async function voiceAccess(name, u, password) {
  const m = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(name);
  if (!m) {
    if (PROTOTYPE_ROOMS) return;
    throw new HttpError(404, 'Oda bulunamadı');
  }
  const r = await db.query('SELECT * FROM rooms WHERE id = $1', [m[1]]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  const room = r.rows[0];
  if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
  const ban = await db.query('SELECT until FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, u.id]);
  if (ban.rowCount) throw new HttpError(403, ban.rows[0].until ? 'Bu odadan geçici olarak çıkarıldın' : 'Bu odaya giremezsin');
  if (await blockedBetween(room.owner, u.id)) throw new HttpError(403, 'Bu odaya giremezsin');
  const staff = room.owner === u.id || (await isAdmin(room.id, u.id));
  if (room.password_hash && !staff) {
    // A short password can't be guessed by trying them all: 10 tries a minute per person and room.
    limit(`roompw:${room.id}:${u.id}`, 10, 'Çok fazla şifre denemesi, bir dakika sonra tekrar dene');
    if (sha(`room:${room.id}:${password ?? ''}`) !== room.password_hash) throw new HttpError(403, 'Oda şifresi yanlış');
  }
}

/**
 * Whether someone already in the LiveKit room `name` may stay (checked when LiveKit says they joined, since
 * LiveKit renews a connected person's token without asking us): the room is still open, they aren't banned
 * from it or from the app, and the owner hasn't blocked them. 'closed' when the room itself should end.
 */
export async function mayStay(name, identity) {
  const m = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(name);
  if (!m) return PROTOTYPE_ROOMS ? 'yes' : 'closed';
  const r = await db.query('SELECT id, owner, closed_at FROM rooms WHERE id = $1', [m[1]]);
  if (!r.rowCount || r.rows[0].closed_at) return 'closed';
  if (!UUID.test(identity)) return 'no';
  const room = r.rows[0];
  const u = await db.query(
    `SELECT 1 FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM user_sanctions s WHERE s.user_id = u.id AND s.sanction_type = 'account_ban' AND ${LIVE_SANCTION})`,
    [identity],
  );
  if (!u.rowCount) return 'no';
  const ban = await db.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, identity]);
  if (ban.rowCount || (await blockedBetween(room.owner, identity))) return 'no';
  return 'yes';
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

  /** Open rooms, fullest first, without the ones whose owner and you have blocked each other. */
  async 'GET /api/rooms'(req) {
    const me = await auth(req);
    const r = await db.query(
      `${SELECT} WHERE r.closed_at IS NULL AND u.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = r.owner AND b.blocked = $1) OR (b.blocker = $1 AND b.blocked = r.owner))
       ORDER BY listeners DESC, r.created_at DESC LIMIT 100`,
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
    // Everyone still in the call leaves now, not when their token runs out.
    await deleteVoiceRoom(liveKitName(room.id));
    return { closed: true };
  },

  /** The owner renames the room or changes its bulletin while it is open. */
  async 'POST /api/rooms/update'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.id);
    if (room.owner !== me.id) throw new HttpError(403, 'Odayı yalnızca sahibi düzenleyebilir');
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if (b.title === undefined && b.announcement === undefined) throw new HttpError(400, 'Değişiklik yok');
    limit(`roomedit:${me.id}`, 20, 'Çok sık değiştirdin, biraz bekle');
    const title = b.title === undefined ? room.title : text(b.title, 3, 40, 'Oda adı');
    const announcement = b.announcement === undefined ? room.announcement : text(b.announcement, 0, 200, 'Duyuru');
    await db.query('UPDATE rooms SET title = $2, announcement = $3 WHERE id = $1', [room.id, title, announcement]);
    return { room: out(await roomRow(room.id)) };
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
    await removeFromVoice(liveKitName(room.id), target);
    await audit(db, { actor: me.id, role: owner ? 'room_owner' : 'room_admin', action: 'room_kick', target, detail: { room: room.id, minutes } });
    return { until: r.rows[0].until };
  },

  async 'POST /api/rooms/unban'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.owner !== me.id && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    const target = userId(b.user);
    const r = await db.query('DELETE FROM room_bans WHERE room_id = $1 AND user_id = $2', [room.id, target]);
    if (r.rowCount) await audit(db, { actor: me.id, role: room.owner === me.id ? 'room_owner' : 'room_admin', action: 'room_unkick', target, detail: { room: room.id } });
    return { banned: false };
  },

  async 'POST /api/rooms/mute'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const target = userId(b.user);
    const owner = room.owner === me.id;
    if (!owner && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    if (target === room.owner || target === me.id) throw new HttpError(400, 'Bu kişi susturulamaz');
    if (!owner && (await isAdmin(room.id, target))) throw new HttpError(403, 'Yöneticiyi yalnızca oda sahibi susturabilir');
    const t = (await db.query('SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rows[0];
    if (!t) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (t.role === 'admin' || t.role === 'moderator') throw new HttpError(403, 'Platform yetkilileri oda içinden susturulamaz');
    if (b.kind !== 'text' && b.kind !== 'voice') throw new HttpError(400, 'Susturma türü: text veya voice');
    const max = owner ? 60 * 24 * 3650 : 60 * 24 * 7;
    const minutes = b.minutes === null && owner ? null : int(b.minutes, 1, max);
    if (minutes === null && !(b.minutes === null && owner)) throw new HttpError(400, owner ? 'Süre 1 dakika ile 10 yıl arası olmalı (ya da süresiz)' : 'Oda yöneticisi en çok 7 gün susturabilir');
    limit(`roommute:${me.id}`, 30, 'Çok sık susturma yaptın, biraz bekle');
    const [s] = await applySanction(
      { id: me.id, role: owner ? 'room_owner' : 'room_admin' },
      {
        user: target,
        type: b.kind === 'text' ? 'mute_room_text' : 'mute_room_voice',
        reason: typeof b.reason === 'string' ? b.reason : 'disruption',
        minutes,
        description: b.description === undefined || b.description === '' ? '' : text(b.description, 3, 300, 'Gerekçe'),
        roomId: room.id,
        source: 'manual',
      },
    );
    return { sanction: sanctionView(s) };
  },

  /** Room staff lift the mutes room staff gave (the owner any of them); the platform's stay with the platform. */
  async 'POST /api/rooms/unmute'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const id = int(b.sanction, 1, Number.MAX_SAFE_INTEGER);
    const s = id && (await db.query(`${SANCTION_SELECT} WHERE s.id = $1 AND s.scope = 'room'`, [id])).rows[0];
    if (!s) throw new HttpError(404, 'Susturma bulunamadı');
    const room = await roomRow(s.room_id);
    const owner = room.owner === me.id;
    if (!owner && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    if (!['room_admin', 'room_owner'].includes(s.created_role)) throw new HttpError(403, 'Platform susturmasını oda yetkilisi kaldıramaz');
    const why = b.reason === undefined || b.reason === '' ? 'Oda yetkilisi kaldırdı' : text(b.reason, 3, 300, 'Gerekçe');
    await liftSanction({ id: me.id, role: owner ? 'room_owner' : 'room_admin' }, s, why);
    return { lifted: true };
  },

  async 'GET /api/rooms/mutes'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    if (room.owner !== me.id && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    const r = await db.query(`${SANCTION_SELECT} JOIN users t ON t.id = s.user_id WHERE s.room_id = $1 AND ${LIVE_SANCTION} ORDER BY s.id DESC`.replace('SELECT s.*', 'SELECT t.name AS user_name, s.*'), [room.id]);
    return { mutes: r.rows.map((s) => ({ ...sanctionView(s), userId: s.user_id, userName: s.user_name })) };
  },
};
