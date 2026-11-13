// Rooms on the server: who owns them, who manages them, who is kicked or blacklisted. The voice token
// (GET /token) checks this, so a kick is enforced by LiveKit, not only hidden in the app: closing a room ends it
// in LiveKit and a kick or blacklist removes the person from the call (live.mjs RoomService).
//
//   POST /api/rooms        { title, announcement?, roomType?, password? }  → { room }
//   GET  /api/rooms                                                         → { rooms }   (open, fullest first; with room-social.mjs badges)
//   GET  /api/room?id=                                                      → { room }
//   POST /api/rooms/close  { id }                                           → { closed }
//   POST /api/rooms/update { id, title?, announcement?, password?, micCount?, layoutId?, micQueue?, coverId?, theme?, giftEffects? } → { room }
//                          (title, bulletin: owner or Süper Yönetici; password (null = no lock): owner; mic count,
//                          layout and the mic queue on/off: owner or any room admin; the room's phones see it at once)
//   POST /api/rooms/admin  { room, user, admin, super? }                    → { admin, super } (owner only)
//   POST /api/rooms/ban    { room, user, minutes }  (null = blacklist)      → { until }   (owner or admin)
//   POST /api/rooms/unban  { room, user }                                   → { banned: false }
//   POST /api/rooms/mute   { room, user, kind: text|voice, minutes|null, reason, description? } → { sanction }
//   POST /api/rooms/unmute { sanction, reason? }                            → { lifted }
//   GET  /api/rooms/mutes?room=                                             → { mutes }    (owner or admin)
//   GET  /api/rooms/staff?room=                                             → { owner, admins, djs, bans? } (bans: staff only)
//   POST /api/rooms/seat   { room, action: remove|move, user, seat? }       → { done }     (owner or admin)
//   POST /api/rooms/seat   { room, action: lock|unlock, seat }              → { lockedSeats }
//   POST /api/rooms/queue  { room, action: join|leave }                     → { queue }    (the mic queue, when on)
//   POST /api/rooms/queue  { room, action: approve|reject, user, seat? }    → { queue }    (owner or admin)
// DJs and the room's music: music.mjs (a DJ plays music and is not staff: none of the above). The Patron koltuğu:
// boss-seat.mjs. A room left without its owner and admins rests after a few minutes: room-autoclose.mjs.
// Ranks (migration 025): owner > Süper Yönetici > Yönetici > everyone else. Staff act only on people below their
// own rank: a Yönetici on members, a Süper Yönetici also on Yöneticiler, the owner on everyone.
// Room mutes are sanctions (sanctions.mjs): their own row, server time, audited. A room admin mutes for up to
// 7 days; the owner also without an end. Nobody mutes the owner or platform staff.
// Seats live in LiveKit, not here: a phone's mic is its own `seat` participant attribute, which room staff can
// set for someone else (taken off the mic, moved, or let up from the mic queue). The room's locked mics, layout,
// mic count and mic queue are kept here and written into the LiveKit room's metadata (pushRoomMeta), which
// LiveKit hands every phone in the room the moment it changes, and again on joining.
import { HttpError, LIVE_SANCTION, SANCTION_SELECT, UUID, auth, blockedBetween, db, env, filesOut, int, limit, publicText, readJson, sanctionView, sha, text, userId } from './core.mjs';
// live.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { announceRoom, deleteVoiceRoom, presenceTracked, removeFromVoice, roomService, voiceCounts } from './live.mjs';
import { applySanction, audit, liftSanction, refreshVoice } from './sanctions.mjs';
import { applyRules, memberCap, rulesOf } from './room-rules.mjs';
import { ROOM_COVERS, ROOM_THEMES, vipLevelOf } from './catalog.mjs';
import { statusOf } from './economy.mjs';
// music.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { clearRoomMusic, roomMusic } from './music.mjs';
// room-social.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { withRoomBadges } from './room-social.mjs';
// room-follow.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { roomFollowOf, roomOpened } from './room-follow.mjs';
// pk-cross.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { endCrossPkOfRoom } from './pk-cross.mjs';
import { closeRoomEvents, roomEventBrief } from './events.mjs';
// room-decor.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { shownBackground } from './room-decor.mjs';
// boss-seat.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { bossOf, bossRulesChanged, clearBoss } from './boss-seat.mjs';

const TYPES = ['free', 'stage', 'qa', 'music', 'event', 'private'];
/** LiveKit room name of a server room. */
export const liveKitName = (id) => `oda-${id}`;
/** The app's sample rooms (oda-r1 …) have no row: voice for them only on a development server. */
const PROTOTYPE_ROOMS = env.ALLOW_PROTOTYPE_ROOMS === '1';

// Room levels 1–15 (app data/catalog ROOM_XP_THRESHOLDS; test/room-level checks they match). The XP is the
// owner's (users.room_xp): coins of gifts sent in their open rooms, so a reopened room keeps its level.
export const ROOM_XP_THRESHOLDS = [0, 100, 300, 600, 1_000, 1_600, 2_400, 3_400, 4_800, 6_500, 8_500, 11_000, 14_000, 18_000, 23_000];
export const ROOM_MAX_LEVEL = ROOM_XP_THRESHOLDS.length;
export const roomLevel = (xp) => ROOM_XP_THRESHOLDS.filter((t) => Number(xp) >= t).length || 1;
/** The public room number the app shows as "ID" (app data/catalog roomCode). */
export const roomCode = (id) => String(10_000_000 + [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9_000_000, 7));
const LAYOUT = /^[A-Za-z0-9_-]{1,40}$/;
// A password lock needs a Lv.4 room or any VIP level (app data/catalog LOCK_MIN_LEVEL).
const LOCK_MIN_LEVEL = 4;
async function mayLock(me) {
  if (roomLevel(me.room_xp ?? 0) >= LOCK_MIN_LEVEL) return;
  if (vipLevelOf(me.svip_xp, (await statusOf(db, me.id)).noble?.tier) >= 1) return;
  throw new HttpError(403, `Oda kilidi Lv.${LOCK_MIN_LEVEL} odada veya VIP ile açılır`);
}

const out = (r) => ({
  id: r.id,
  owner: { id: r.owner, name: r.owner_name, avatarUrl: r.owner_avatar ?? null },
  title: r.title,
  announcement: r.announcement,
  roomType: r.room_type,
  hasPassword: !!r.password_hash,
  createdAt: r.created_at,
  closed: !!r.closed_at,
  // Resting for lack of staff (room-autoclose.mjs): only its owner and admins get in, and their coming opens it.
  paused: !!r.paused_at,
  listeners: Number(r.listeners ?? 0),
  level: roomLevel(r.owner_room_xp ?? 0),
  xp: Number(r.owner_room_xp ?? 0),
  // null: the classic grid with as many mics as the level gives.
  micCount: r.mic_count ?? null,
  layoutId: r.layout_id ?? null,
  lockedSeats: (r.locked_seats ?? []).map(Number),
  micQueue: !!r.mic_queue,
  // The look the owner chose: a cover (an app background id; null = none), the theme, gift effects on or off.
  coverId: r.cover_id ?? null,
  theme: r.theme ?? 'chat',
  giftEffects: r.gift_effects !== false,
  // Oda süslemesi and Oda kapağı (room-decor.mjs): the free background chosen (null: the theme's stage), what
  // every phone draws behind the stage now (a paid or the owner's own picture while its term runs, else the free
  // one), and the uploaded card picture (null: the lists show what they did before, coverId's picture or none).
  bgId: r.bg_id ?? null,
  background: shownBackground(r),
  coverUrl: r.cover_url ?? null,
  // Oda ayarları and Moderasyon (room-rules.mjs), the same for every phone; the Patron koltuğu (boss-seat.mjs):
  // boss, the holder (what older apps read), and bossSeat, its mode, sitting and numbers.
  rules: rulesOf(r.rules),
  ...bossOf(r),
});
/** Listeners: LiveKit's own count when it can be read (withVoiceCounts), else its webhooks (live.mjs room_presence). */
const SELECT = `SELECT r.*, u.name AS owner_name, u.avatar_url AS owner_avatar, u.room_xp AS owner_room_xp,
                       b.name AS boss_name, b.avatar_url AS boss_avatar,
                       (SELECT count(*) FROM room_presence p WHERE p.room = 'oda-' || r.id::text) AS listeners,
                       d.pick AS bg_pick, d.custom_url AS bg_custom_url, d.custom_until AS bg_custom_until, d.custom_until > now() AS bg_custom_live,
                       (SELECT max(e.ends_at) FROM entitlements e WHERE e.user_id = r.owner AND e.kind = 'roombg' AND e.sku = d.pick
                           AND e.revoked_at IS NULL AND e.starts_at <= now() AND e.ends_at > now()) AS bg_paid_until
                  FROM rooms r JOIN users u ON u.id = r.owner LEFT JOIN users b ON b.id = r.boss_id LEFT JOIN room_decor d ON d.owner = r.owner`;

/** Puts LiveKit's people count on the rows of rooms it has open now (rooms it doesn't have keep room_presence's). */
async function withVoiceCounts(rows) {
  const n = await voiceCounts();
  if (!n) return rows;
  return rows.map((r) => (n.has(liveKitName(r.id)) ? { ...r, listeners: n.get(liveKitName(r.id)) } : r));
}
// Room social (room-social.mjs) lists rooms the same way: Odalarım › Katıl.
export { out as roomOut, SELECT as ROOM_SELECT, withVoiceCounts };

export async function roomRow(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'Geçersiz oda');
  const r = await db.query(`${SELECT} WHERE r.id = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  return r.rows[0];
}
const isAdmin = async (roomId, uid) => (await db.query('SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2', [roomId, uid])).rowCount > 0;
/** Owner 3, Süper Yönetici 2, Yönetici 1, anyone else 0. */
const OWNER = 3;
const SUPER = 2;
export async function rankOf(room, uid) {
  if (room.owner === uid) return OWNER;
  const r = await db.query('SELECT super FROM room_admins WHERE room_id = $1 AND user_id = $2', [room.id, uid]);
  return r.rowCount ? (r.rows[0].super ? SUPER : 1) : 0;
}
/** The audit role of a rank. */
const roleOfRank = (rank) => (rank === OWNER ? 'room_owner' : 'room_admin');
/** My rank in the room; refused unless I'm room staff. */
async function staffRank(room, me) {
  const rank = await rankOf(room, me);
  if (!rank) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
  return rank;
}
/** Refused unless `target` is below my rank (`mine`). */
async function mustOutrank(room, mine, target, what) {
  if (target === room.owner) throw new HttpError(403, `Oda sahibine ${what}`);
  if ((await rankOf(room, target)) >= mine) throw new HttpError(403, `Kendi yetkindeki ya da üstündeki birine ${what}`);
}

const ROOM_NAME = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const queueOf = async (roomId) =>
  (await db.query('SELECT user_id FROM room_mic_queue WHERE room_id = $1 ORDER BY created_at, user_id LIMIT 50', [roomId])).rows.map((x) => x.user_id);
/**
 * Writes the room's locked mics, layout, classic mic count and mic queue into the LiveKit room's metadata. LiveKit
 * hands it to every phone in the room as soon as it changes and to each phone that joins, so all phones draw the
 * same mics without asking (app lib/live/room-bus parseRoomMeta). False when LiveKit doesn't have the room open
 * (nobody in it: the next one in gets it from room_started, live.mjs) or can't be reached. Never throws.
 */
export async function pushRoomMeta(roomId) {
  try {
    const r = (await db.query('SELECT locked_seats, layout_id, mic_count, mic_queue, video FROM rooms WHERE id = $1', [roomId])).rows[0];
    if (!r) return false;
    // The music's files go out at this server's address, like every answer (core.mjs filesOut).
    const metadata = filesOut(
      JSON.stringify({
        lockedSeats: (r.locked_seats ?? []).map(Number),
        layoutId: r.layout_id ?? null,
        micCount: r.mic_count ?? null,
        micQueue: !!r.mic_queue,
        queue: await queueOf(roomId),
        music: await roomMusic(roomId),
        // The shared YouTube screen (room-video.mjs): checked when it was written.
        video: r.video ?? null,
      }),
    );
    const name = liveKitName(roomId);
    return await roomService('UpdateRoomMetadata', { room: name, metadata }, { roomAdmin: true, room: name });
  } catch (e) {
    console.error('livekit UpdateRoomMetadata', roomId, String(e).slice(0, 200));
    return false;
  }
}
/** Someone left the voice room: off its mic queue. */
export async function leftVoiceRoom(name, identity) {
  const m = ROOM_NAME.exec(name);
  if (!m || !UUID.test(identity)) return;
  const r = await db.query('DELETE FROM room_mic_queue WHERE room_id = $1 AND user_id = $2', [m[1], identity]);
  if (r.rowCount) await pushRoomMeta(m[1]);
}
/**
 * LiveKit opened the room (someone joined it while empty): nobody waits for a mic yet, no music plays and the shared
 * screen is empty; it gets the room's mics.
 */
export async function voiceRoomStarted(name) {
  const m = ROOM_NAME.exec(name);
  if (!m) return;
  await db.query('DELETE FROM room_mic_queue WHERE room_id = $1', [m[1]]);
  await clearRoomMusic(m[1]);
  await db.query('UPDATE rooms SET video = NULL WHERE id = $1 AND video IS NOT NULL', [m[1]]);
  await pushRoomMeta(m[1]);
}
/** A made-up or deleted account gets a 404, not a room_admins / room_bans row. */
async function mustExist(uid) {
  if (!(await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [uid])).rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
}
/** One seat change in LiveKit (live.mjs roomService); false when LiveKit doesn't have the room or the person. */
async function seatCall(method, body, room) {
  if (!env.LIVEKIT_API_URL) throw new HttpError(503, 'Ses sunucusu şu an bağlı değil');
  try {
    return await roomService(method, body, { roomAdmin: true, room });
  } catch (e) {
    console.error('livekit', method, room, String(e).slice(0, 200));
    throw new HttpError(502, 'Ses sunucusuna şu an ulaşılamadı');
  }
}
/** Mic numbers as the app draws them: 0 is the owner's, 1–99 the others. */
const seatNo = (v) => int(v, 1, 99);

/**
 * Whether `u` may join the LiveKit room `name`: a server room that exists and is open, not banned there, the
 * right password for a private room (owner and admins skip it). Other names only with ALLOW_PROTOTYPE_ROOMS=1.
 * A room resting for lack of staff (room-autoclose.mjs) lets only its owner and admins in, and their coming opens it.
 */
export async function voiceAccess(name, u, password) {
  const m = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(name);
  if (!m) {
    // A 1v1 call's room (one-on-one.mjs) is only ever joined with the call's own token.
    if (PROTOTYPE_ROOMS && !name.startsWith('call-')) return;
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
  if (room.paused_at) {
    if (!staff) throw new HttpError(410, 'Oda şu an kapalı: yetkilisi gelince açılır');
    await db.query('UPDATE rooms SET paused_at = NULL, no_staff_since = NULL WHERE id = $1', [room.id]);
  }
  const member = !staff && (await db.query("SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 AND status = 'member'", [room.id, u.id])).rowCount > 0;
  // A private room (Özel oda): its staff and members come in; anyone else only with its password, if it has one.
  const privateRoom = room.room_type === 'private';
  if (privateRoom && !staff && !member && !room.password_hash) throw new HttpError(403, 'Bu oda özel: yalnızca oda üyeleri girebilir');
  if (room.password_hash && !staff && !(privateRoom && member)) {
    // A short password can't be guessed by trying them all: 10 tries a minute per person and room.
    limit(`roompw:${room.id}:${u.id}`, 10, 'Çok fazla şifre denemesi, bir dakika sonra tekrar dene');
    if (sha(`room:${room.id}:${password ?? ''}`) !== room.password_hash) throw new HttpError(403, 'Oda şifresi yanlış');
  }
  // The people limit (Oda ayarları › Katılımcı limiti, else the level's most): staff always get in.
  const already = (await db.query('SELECT 1 FROM room_presence WHERE room = $1 AND identity = $2', [name, u.id])).rowCount > 0;
  if (!staff && !already) {
    const level = roomLevel((await db.query('SELECT room_xp FROM users WHERE id = $1', [room.owner])).rows[0]?.room_xp ?? 0);
    const cap = rulesOf(room.rules).limit ?? memberCap(level);
    const counts = await voiceCounts();
    const here = counts?.has(name)
      ? counts.get(name)
      : Number((await db.query('SELECT count(*) AS n FROM room_presence WHERE room = $1 AND identity <> $2', [name, u.id])).rows[0].n);
    if (here >= cap) throw new HttpError(403, `Oda dolu (en fazla ${cap.toLocaleString('tr-TR')} kişi)`);
  }
  if (member) await db.query('UPDATE room_members SET seen_at = now() WHERE room_id = $1 AND user_id = $2', [room.id, u.id]);
  // The owner comes into their room: its followers hear that it opened (room-follow.mjs, at most every 6 hours).
  if (room.owner === u.id && !already) void roomOpened(room.id, room.owner);
}

/** Members who stayed away longer than the room allows (rules.autoRemoveDays) are no longer members; staff stay. */
async function purgeMembers(room) {
  const days = rulesOf(room.rules).autoRemoveDays;
  if (!days) return;
  await db.query(
    `DELETE FROM room_members m WHERE m.room_id = $1 AND m.status = 'member' AND m.seen_at < now() - make_interval(days => $2)
       AND NOT EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = m.room_id AND a.user_id = m.user_id)`,
    [room.id, days],
  );
}
/** Whether `rank` may answer and remove the room's members (rules.manageMembers). */
export const mayManageMembers = (rules, rank) => rank === OWNER || (rules.manageMembers === 'admins' && rank >= 1);
/** Everyone in the room's voice gets their mic right again (the mic permission or their membership changed). */
async function refreshRoomVoices(roomId, only = null) {
  const name = liveKitName(roomId);
  const ids = new Set((await db.query('SELECT identity FROM room_presence WHERE room = $1', [name])).rows.map((x) => x.identity));
  if (!only) {
    const live = await roomService('ListParticipants', { room: name }, { roomAdmin: true, room: name }).catch(() => null);
    for (const p of live?.participants ?? []) ids.add(p.identity);
  }
  for (const id of only ? [only] : ids) if (UUID.test(id)) await refreshVoice(id).catch(() => {});
}

/**
 * Whether someone already in the LiveKit room `name` may stay (checked when LiveKit says they joined, since
 * LiveKit renews a connected person's token without asking us): the room is still open, they aren't banned
 * from it or from the app, and the owner hasn't blocked them. 'closed' when the room itself should end. While the
 * room rests for lack of staff (room-autoclose.mjs) only its owner and admins stay.
 */
export async function mayStay(name, identity) {
  // A 1v1 call (one-on-one.mjs): its two people, while it is live.
  const call = /^call-(\d{1,18})$/.exec(name);
  if (call) {
    const k = await db.query('SELECT caller, callee, status FROM calls WHERE id = $1', [call[1]]);
    if (!k.rowCount || k.rows[0].status !== 'live') return 'closed';
    return identity === k.rows[0].caller || identity === k.rows[0].callee ? 'yes' : 'no';
  }
  if (name.startsWith('call-')) return 'closed';
  const m = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(name);
  if (!m) return PROTOTYPE_ROOMS ? 'yes' : 'closed';
  const r = await db.query('SELECT id, owner, closed_at, paused_at FROM rooms WHERE id = $1', [m[1]]);
  if (!r.rowCount || r.rows[0].closed_at) return 'closed';
  if (!UUID.test(identity)) return 'no';
  const room = r.rows[0];
  if (room.paused_at && room.owner !== identity && !(await isAdmin(room.id, identity))) return 'no';
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
    // Everyone in the room list reads these: no contact details (contact-filter.mjs).
    const title = await publicText(b.title, 1, 40, 'Oda adı', me, 'room.title', 'title');
    const announcement = b.announcement === undefined ? '' : await publicText(b.announcement, 0, 200, 'Duyuru', me, 'room.announcement', 'announcement');
    const roomType = b.roomType ?? 'free';
    if (!TYPES.includes(roomType)) throw new HttpError(400, 'Geçersiz oda türü');
    const password = b.password === undefined || b.password === '' ? null : text(b.password, 4, 32, 'Şifre');
    if (password) await mayLock(me);
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

  /**
   * Open rooms, fullest first, without the ones whose owner and you have blocked each other. Once LiveKit's
   * webhooks arrive (live.mjs presenceTracked), also without other people's rooms nobody is in: such a room stays
   * open with its blacklist and admins, and is listed again as soon as someone joins. A room resting for lack of
   * staff (room-autoclose.mjs) is left out the same way. Rooms you own or run are always listed.
   */
  async 'GET /api/rooms'(req) {
    const me = await auth(req);
    const r = await db.query(
      `${SELECT} WHERE r.closed_at IS NULL AND u.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = r.owner AND b.blocked = $1) OR (b.blocker = $1 AND b.blocked = r.owner))
         AND (r.owner = $1 OR EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = r.id AND a.user_id = $1)
              OR (r.paused_at IS NULL AND (NOT $2::boolean OR EXISTS (SELECT 1 FROM room_presence p WHERE p.room = 'oda-' || r.id::text))))
       ORDER BY listeners DESC, r.created_at DESC LIMIT 100`,
      [me.id, presenceTracked()],
    );
    const rows = await withVoiceCounts(r.rows);
    rows.sort((a, b) => Number(b.listeners) - Number(a.listeners) || new Date(b.created_at) - new Date(a.created_at));
    // The Odalar rows' agency or family chip, PK pill and weekly TOP place (room-social.mjs).
    return { rooms: await withRoomBadges(rows.map(out)) };
  },

  async 'GET /api/room'(req, url) {
    const me = await auth(req);
    const [room] = await withVoiceCounts([await roomRow(url.searchParams.get('id'))]);
    // Following the room (room-follow.mjs): how many follow it, and whether I do.
    // The running event, else the next one within a day (events.mjs): the room's banner and theme.
    return { room: { ...out(room), ...(await roomFollowOf(room.owner, me.id)), event: await roomEventBrief(room.id) } };
  },

  async 'POST /api/rooms/close'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).id);
    if (room.owner !== me.id) throw new HttpError(403, 'Odayı yalnızca sahibi kapatabilir');
    await db.query('UPDATE rooms SET closed_at = now() WHERE id = $1 AND closed_at IS NULL', [room.id]);
    // An Odalar arası PK with this room ends, and the other room hears it (pk-cross.mjs).
    await endCrossPkOfRoom(room.id);
    // Its running event ends and the ones still to come are cancelled (events.mjs).
    await closeRoomEvents(room.id, me.id);
    // Everyone still in the call leaves now, not when their token runs out.
    await deleteVoiceRoom(liveKitName(room.id));
    return { closed: true };
  },

  /**
   * The owner or a Süper Yönetici renames the room or changes its bulletin; only the owner locks it with a password
   * (null or '' takes the lock off; people already inside stay, the password is asked at the next join). The owner
   * or any room admin sets the classic grid's mic count (null = the level's most), the stage layout (null = classic
   * grid) and whether the mic queue is on (off empties it). These go into the LiveKit room's metadata, so every
   * phone in the room draws the same mics at once; the room packet also tells older apps to read the room again.
   */
  async 'POST /api/rooms/update'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.id);
    const texts = b.title !== undefined || b.announcement !== undefined;
    const stage = b.micCount !== undefined || b.layoutId !== undefined || b.micQueue !== undefined;
    const look = b.coverId !== undefined || b.theme !== undefined || b.giftEffects !== undefined || b.roomType !== undefined;
    if (!texts && !stage && !look && b.password === undefined && b.rules === undefined) throw new HttpError(400, 'Değişiklik yok');
    const rank = await rankOf(room, me.id);
    if (b.password !== undefined && rank !== OWNER) throw new HttpError(403, 'Oda kilidini yalnızca oda sahibi değiştirebilir');
    if ((texts || b.coverId !== undefined) && rank < SUPER) throw new HttpError(403, 'Oda adını, duyurusunu ve kapağını oda sahibi veya Süper Yönetici değiştirebilir');
    if ((b.theme !== undefined || b.giftEffects !== undefined || b.roomType !== undefined) && rank !== OWNER) throw new HttpError(403, 'Oda tipini, temasını ve hediye efektlerini yalnızca oda sahibi değiştirebilir');
    if (b.roomType !== undefined && !TYPES.includes(b.roomType)) throw new HttpError(400, 'Geçersiz oda türü');
    const roomType = b.roomType ?? room.room_type;
    // Oda ayarları and Moderasyon (room-rules.mjs): each rule checks who may change it and the room's level.
    const rulesBefore = rulesOf(room.rules);
    const rules = b.rules === undefined ? rulesBefore : applyRules(rulesBefore, b.rules, { rank, level: roomLevel(room.owner_room_xp ?? 0) });
    if (!rank) throw new HttpError(403, 'Mikrofonları ve düzeni oda sahibi veya yöneticiler değiştirebilir');
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const micCount = b.micCount === undefined ? room.mic_count : b.micCount === null ? null : int(b.micCount, 1, 15);
    if (b.micCount != null && micCount === null) throw new HttpError(400, 'Mikrofon sayısı 1 ile 15 arasında olmalı');
    const layoutId = b.layoutId === undefined ? room.layout_id : b.layoutId;
    if (layoutId !== null && (typeof layoutId !== 'string' || !LAYOUT.test(layoutId))) throw new HttpError(400, 'Geçersiz düzen');
    if (b.micQueue !== undefined && typeof b.micQueue !== 'boolean') throw new HttpError(400, 'Mikrofon kuyruğu açık ya da kapalı olmalı');
    // A Sahne room's speakers always ask first: its mic queue stays on.
    if (b.micQueue === false && (b.roomType ?? room.room_type) === 'stage') throw new HttpError(400, 'Sahne odasında mikrofon kuyruğu hep açıktır');
    const micQueue = (b.roomType ?? room.room_type) === 'stage' ? true : (b.micQueue ?? room.mic_queue);
    // A cover opens at its room level (the app greys out the others); null takes the cover off.
    let coverId = room.cover_id ?? null;
    if (b.coverId !== undefined) {
      const c = b.coverId === null ? null : ROOM_COVERS.find((x) => x.id === b.coverId);
      if (c === undefined) throw new HttpError(400, 'Geçersiz kapak');
      if (c && roomLevel(room.owner_room_xp ?? 0) < c.minLevel) throw new HttpError(403, `Bu kapak Lv.${c.minLevel} odada açılır`);
      coverId = c ? c.id : null;
    }
    if (b.theme !== undefined && !ROOM_THEMES.includes(b.theme)) throw new HttpError(400, 'Geçersiz tema');
    if (b.giftEffects !== undefined && typeof b.giftEffects !== 'boolean') throw new HttpError(400, 'Hediye efektleri açık ya da kapalı olmalı');
    const theme = b.theme ?? room.theme ?? 'chat';
    const giftEffects = b.giftEffects ?? room.gift_effects !== false;
    limit(`roomedit:${me.id}`, 30, 'Çok sık değiştirdin, biraz bekle');
    const title = b.title === undefined ? room.title : await publicText(b.title, 3, 40, 'Oda adı', me, 'room.title', 'title');
    const announcement = b.announcement === undefined ? room.announcement : await publicText(b.announcement, 0, 200, 'Duyuru', me, 'room.announcement', 'announcement');
    const password = b.password === undefined ? undefined : b.password === null || b.password === '' ? null : text(b.password, 4, 32, 'Şifre');
    if (password) await mayLock(me);
    await db.query(
      'UPDATE rooms SET title = $2, announcement = $3, mic_count = $4, layout_id = $5, mic_queue = $6, cover_id = $7, theme = $8, gift_effects = $9, room_type = $10, rules = $11 WHERE id = $1',
      [room.id, title, announcement, micCount, layoutId, micQueue, coverId, theme, giftEffects, roomType, JSON.stringify(rules)],
    );
    if (!micQueue) await db.query('DELETE FROM room_mic_queue WHERE room_id = $1', [room.id]);
    // The hash includes the room id, as when the room is opened with a password.
    if (password !== undefined) await db.query('UPDATE rooms SET password_hash = $2 WHERE id = $1', [room.id, password && sha(`room:${room.id}:${password}`)]);
    const queueChanged = micQueue !== !!room.mic_queue;
    if (stage || queueChanged) await pushRoomMeta(room.id);
    // The phones in the room read it again: new mics or layout, a new cover, theme, type, gift effects or rules.
    if (stage || look || b.rules !== undefined) announceRoom(liveKitName(room.id));
    // The Patron koltuğu turned on or off or changed its mode: it starts empty (boss-seat.mjs).
    if (rules.bossSeat !== rulesBefore.bossSeat || (rules.bossSeat && rules.bossMode !== rulesBefore.bossMode)) await bossRulesChanged(room.id, rules);
    // Who may speak changed: everyone in the room gets their mic right again.
    if (rules.micPermission !== rulesBefore.micPermission) await refreshRoomVoices(room.id);
    const [fresh] = await withVoiceCounts([await roomRow(room.id)]);
    return { room: out(fresh) };
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
      // Every phone in the room reads who runs it again, so the rank is gone at once (not at their next read).
      announceRoom(liveKitName(room.id));
      return { admin: false, super: false };
    }
    if (b.super !== undefined && typeof b.super !== 'boolean') throw new HttpError(400, 'Süper Yönetici açık ya da kapalı olmalı');
    await mustExist(target);
    // super left out: an admin keeps the rank they have (a new one starts as Yönetici).
    const r = await db.query(
      `INSERT INTO room_admins (room_id, user_id, super) VALUES ($1, $2, coalesce($3::boolean, false))
       ON CONFLICT (room_id, user_id) DO UPDATE SET super = coalesce($3::boolean, room_admins.super) RETURNING super`,
      [room.id, target, b.super ?? null],
    );
    // An admin plays music anyway: no DJ seat kept for them.
    await db.query('DELETE FROM room_djs WHERE room_id = $1 AND user_id = $2', [room.id, target]);
    announceRoom(liveKitName(room.id));
    return { admin: true, super: r.rows[0].super };
  },

  /** Kick for `minutes`, or blacklist with minutes = null. Only someone below my rank (never the owner). */
  async 'POST /api/rooms/ban'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    const target = userId(b.user);
    const rank = await staffRank(room, me.id);
    if (target === room.owner || target === me.id) throw new HttpError(400, 'Bu kişi odadan çıkarılamaz');
    await mustOutrank(room, rank, target, 'çıkarma yapamazsın');
    const minutes = b.minutes === null ? null : int(b.minutes, 1, 60 * 24 * 30);
    if (b.minutes !== null && minutes === null) throw new HttpError(400, 'Süre 1 dakika ile 30 gün arası olmalı');
    await mustExist(target);
    const r = await db.query(
      `INSERT INTO room_bans (room_id, user_id, until, by_user) VALUES ($1, $2, CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(mins => $3::int) END, $4)
       ON CONFLICT (room_id, user_id) DO UPDATE SET until = EXCLUDED.until, by_user = EXCLUDED.by_user, created_at = now() RETURNING until`,
      [room.id, target, minutes, me.id],
    );
    await removeFromVoice(liveKitName(room.id), target);
    // Off the Patron koltuğu too (boss-seat.mjs): someone kept out of the room doesn't sit on its seat.
    await clearBoss(room.id, 'removed', target);
    await audit(db, { actor: me.id, role: roleOfRank(rank), action: 'room_kick', target, detail: { room: room.id, minutes } });
    announceRoom(liveKitName(room.id));
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
    announceRoom(liveKitName(room.id));
    return { banned: false };
  },

  async 'POST /api/rooms/mute'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const target = userId(b.user);
    const rank = await staffRank(room, me.id);
    const owner = rank === OWNER;
    if (target === room.owner || target === me.id) throw new HttpError(400, 'Bu kişi susturulamaz');
    await mustOutrank(room, rank, target, 'susturma yapamazsın');
    const t = (await db.query('SELECT role FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rows[0];
    if (!t) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if (t.role === 'admin' || t.role === 'moderator') throw new HttpError(403, 'Platform yetkilileri oda içinden susturulamaz');
    if (b.kind !== 'text' && b.kind !== 'voice') throw new HttpError(400, 'Susturma türü: text veya voice');
    const max = owner ? 60 * 24 * 3650 : 60 * 24 * 7;
    const minutes = b.minutes === null && owner ? null : int(b.minutes, 1, max);
    if (minutes === null && !(b.minutes === null && owner)) throw new HttpError(400, owner ? 'Süre 1 dakika ile 10 yıl arası olmalı (ya da süresiz)' : 'Oda yöneticisi en çok 7 gün susturabilir');
    limit(`roommute:${me.id}`, 30, 'Çok sık susturma yaptın, biraz bekle');
    // The muted person reads the description.
    const description = b.description === undefined || b.description === '' ? '' : await publicText(b.description, 3, 300, 'Gerekçe', me, 'room.mute', 'description');
    const [s] = await applySanction(
      { id: me.id, role: owner ? 'room_owner' : 'room_admin' },
      {
        user: target,
        type: b.kind === 'text' ? 'mute_room_text' : 'mute_room_voice',
        reason: typeof b.reason === 'string' ? b.reason : 'disruption',
        minutes,
        description,
        roomId: room.id,
        source: 'manual',
      },
    );
    announceRoom(liveKitName(room.id));
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
    announceRoom(liveKitName(room.id));
    return { lifted: true };
  },

  async 'GET /api/rooms/mutes'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    if (room.owner !== me.id && !(await isAdmin(room.id, me.id))) throw new HttpError(403, 'Bu işlem için oda yetkisi gerekli');
    const r = await db.query(`${SANCTION_SELECT} JOIN users t ON t.id = s.user_id WHERE s.room_id = $1 AND ${LIVE_SANCTION} ORDER BY s.id DESC`.replace('SELECT s.*', 'SELECT t.name AS user_name, s.*'), [room.id]);
    return { mutes: r.rows.map((s) => ({ ...sanctionView(s), userId: s.user_id, userName: s.user_name })) };
  },

  /** Who runs the room: everyone sees the admins (role badges); only the owner and admins see who is kept out. */
  async 'GET /api/rooms/staff'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    const admins = await db.query(
      'SELECT u.id, u.name, a.super FROM room_admins a JOIN users u ON u.id = a.user_id WHERE a.room_id = $1 AND u.deleted_at IS NULL ORDER BY a.super DESC, u.name, u.id',
      [room.id],
    );
    const djs = await db.query('SELECT u.id, u.name FROM room_djs d JOIN users u ON u.id = d.user_id WHERE d.room_id = $1 AND u.deleted_at IS NULL ORDER BY d.created_at, u.id', [room.id]);
    const staff = room.owner === me.id || admins.rows.some((a) => a.id === me.id);
    const result = { owner: room.owner, admins: admins.rows.map((a) => ({ id: a.id, name: a.name, super: a.super })), djs: djs.rows.map((d) => ({ id: d.id, name: d.name })) };
    if (!staff) return result;
    const bans = await db.query(
      'SELECT b.user_id, u.name, b.until FROM room_bans b JOIN users u ON u.id = b.user_id WHERE b.room_id = $1 AND (b.until IS NULL OR b.until > now()) ORDER BY b.created_at DESC LIMIT 200',
      [room.id],
    );
    return { ...result, bans: bans.rows.map((x) => ({ userId: x.user_id, name: x.name, until: x.until })) };
  },

  /**
   * The room's members (Oda üyeleri), how many it may have, my own membership ('owner' | 'member' | 'pending' |
   * null) and, for whoever answers members (rules.manageMembers), who asked to join.
   */
  async 'GET /api/rooms/members'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    await purgeMembers(room);
    const rules = rulesOf(room.rules);
    const canManage = mayManageMembers(rules, await rankOf(room, me.id));
    const r = await db.query(
      `SELECT m.user_id, m.status, m.created_at, u.name, u.avatar_url FROM room_members m JOIN users u ON u.id = m.user_id
        WHERE m.room_id = $1 AND u.deleted_at IS NULL ORDER BY m.created_at, m.user_id LIMIT 1000`,
      [room.id],
    );
    const person = (x) => ({ id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null, since: x.created_at });
    const members = r.rows.filter((x) => x.status === 'member');
    return {
      members: members.map(person),
      total: members.length,
      cap: memberCap(roomLevel(room.owner_room_xp ?? 0)),
      mine: room.owner === me.id ? 'owner' : (r.rows.find((x) => x.user_id === me.id)?.status ?? null),
      joinMode: rules.joinMode,
      canManage,
      pending: canManage ? r.rows.filter((x) => x.status === 'pending').map(person) : [],
    };
  },

  /** Become a member: at once in an open room, as a request in an 'apply' room; a closed room takes nobody. */
  async 'POST /api/rooms/members/join'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if (room.owner === me.id) throw new HttpError(400, 'Zaten oda sahibisin');
    limit(`roommember:${me.id}`, 20);
    const ban = await db.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, me.id]);
    if (ban.rowCount || (await blockedBetween(room.owner, me.id))) throw new HttpError(403, 'Bu odaya üye olamazsın');
    const rules = rulesOf(room.rules);
    const had = (await db.query('SELECT status FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, me.id])).rows[0]?.status ?? null;
    if (had === 'member') return { status: 'member' };
    if (rules.joinMode === 'closed') throw new HttpError(403, 'Bu oda şu an üye almıyor');
    await purgeMembers(room);
    if (rules.joinMode === 'open') {
      const n = Number((await db.query("SELECT count(*) AS n FROM room_members WHERE room_id = $1 AND status = 'member'", [room.id])).rows[0].n);
      const cap = memberCap(roomLevel(room.owner_room_xp ?? 0));
      if (n >= cap) throw new HttpError(403, `Üye kapasitesi dolu (${cap.toLocaleString('tr-TR')})`);
    }
    const status = rules.joinMode === 'open' ? 'member' : 'pending';
    await db.query(
      `INSERT INTO room_members (room_id, user_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO UPDATE SET status = EXCLUDED.status, seen_at = now()`,
      [room.id, me.id, status],
    );
    if (status === 'member') await refreshRoomVoices(room.id, me.id);
    return { status };
  },

  /** Leave the room's members (or take a request back). */
  async 'POST /api/rooms/members/leave'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).room);
    const r = await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, me.id]);
    if (r.rowCount) await refreshRoomVoices(room.id, me.id);
    return { status: null };
  },

  /** Accept or refuse a request to join (whoever answers members: rules.manageMembers). */
  async 'POST /api/rooms/members/answer'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    const target = userId(b.user);
    if (typeof b.accept !== 'boolean') throw new HttpError(400, 'Kabul ya da ret seç');
    if (!mayManageMembers(rulesOf(room.rules), await rankOf(room, me.id))) throw new HttpError(403, 'Üyeleri yönetme yetkin yok');
    const had = (await db.query('SELECT status FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, target])).rows[0]?.status;
    if (had !== 'pending') throw new HttpError(404, 'Bekleyen başvuru yok');
    if (!b.accept) {
      await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, target]);
      return { status: null };
    }
    const n = Number((await db.query("SELECT count(*) AS n FROM room_members WHERE room_id = $1 AND status = 'member'", [room.id])).rows[0].n);
    const cap = memberCap(roomLevel(room.owner_room_xp ?? 0));
    if (n >= cap) throw new HttpError(403, `Üye kapasitesi dolu (${cap.toLocaleString('tr-TR')})`);
    await db.query("UPDATE room_members SET status = 'member', created_at = now(), seen_at = now() WHERE room_id = $1 AND user_id = $2", [room.id, target]);
    await refreshRoomVoices(room.id, target);
    return { status: 'member' };
  },

  /** Take someone off the room's members (never the room's staff). */
  async 'POST /api/rooms/members/remove'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    const target = userId(b.user);
    if (!mayManageMembers(rulesOf(room.rules), await rankOf(room, me.id))) throw new HttpError(403, 'Üyeleri yönetme yetkin yok');
    if (target === room.owner || (await isAdmin(room.id, target))) throw new HttpError(403, 'Oda yetkilileri üyelikten çıkarılamaz');
    const r = await db.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, target]);
    if (!r.rowCount) throw new HttpError(404, 'Bu kişi oda üyesi değil');
    await audit(db, { actor: me.id, role: roleOfRank(await rankOf(room, me.id)), action: 'room_member_remove', target, detail: { room: room.id } });
    await refreshRoomVoices(room.id, target);
    return { status: null };
  },

  /**
   * Room staff move someone's mic: off it (remove) or to another free one (move), as that person's own `seat`
   * attribute in LiveKit, which their phone then follows. Lock / unlock changes the locked mics in the LiveKit
   * room (and its LiveKit metadata). Staff move only people below their own rank, or themselves.
   */
  async 'POST /api/rooms/seat'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const rank = await staffRank(room, me.id);
    const name = liveKitName(room.id);
    if (b.action === 'remove' || b.action === 'move') {
      const target = userId(b.user);
      if (target !== me.id) await mustOutrank(room, rank, target, 'koltuk işlemi yapamazsın');
      const seat = b.action === 'move' ? seatNo(b.seat) : null;
      if (b.action === 'move' && seat === null) throw new HttpError(400, 'Geçersiz koltuk');
      limit(`roomseat:${me.id}`, 60, 'Çok sık işlem yaptın, biraz bekle');
      const done = await seatCall('UpdateParticipant', { room: name, identity: target, attributes: { seat: seat === null ? '' : String(seat) } }, name);
      if (!done) throw new HttpError(409, 'Bu kişi şu an sesli odada değil');
      await audit(db, { actor: me.id, role: roleOfRank(rank), action: b.action === 'move' ? 'room_seat_move' : 'room_seat_remove', target, detail: { room: room.id, seat } });
      return { done: true };
    }
    if (b.action === 'lock' || b.action === 'unlock') {
      const seat = seatNo(b.seat);
      if (seat === null) throw new HttpError(400, 'Geçersiz koltuk');
      limit(`roomseat:${me.id}`, 60, 'Çok sık işlem yaptın, biraz bekle');
      // One statement, so two staff phones locking at once both count. Kept on the room, so an emptied room keeps
      // its locks; every phone in it sees them through the metadata.
      const r = await db.query(
        b.action === 'lock'
          ? 'UPDATE rooms SET locked_seats = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(array_append(locked_seats, $2::int)) x) WHERE id = $1 RETURNING locked_seats'
          : 'UPDATE rooms SET locked_seats = array_remove(locked_seats, $2::int) WHERE id = $1 RETURNING locked_seats',
        [room.id, seat],
      );
      await pushRoomMeta(room.id);
      return { lockedSeats: r.rows[0].locked_seats.map(Number) };
    }
    throw new HttpError(400, 'Geçersiz işlem');
  },

  /**
   * The mic queue (on in the room's settings): a member asks for a mic (join) or stops asking (leave); the owner or
   * an admin lets them up on mic `seat` (approve: their `seat` attribute in LiveKit, which their phone follows) or
   * turns them down (reject). Leaving the voice room takes them off it (live.mjs). Who waits is in the LiveKit
   * room's metadata, so every staff phone sees a raised hand at once.
   */
  async 'POST /api/rooms/queue'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const waiting = async (uid) => (await db.query('SELECT 1 FROM room_mic_queue WHERE room_id = $1 AND user_id = $2', [room.id, uid])).rowCount > 0;
    const drop = (uid) => db.query('DELETE FROM room_mic_queue WHERE room_id = $1 AND user_id = $2', [room.id, uid]);
    if (b.action === 'join' || b.action === 'leave') {
      limit(`roomqueue:${me.id}`, 30, 'Çok sık işlem yaptın, biraz bekle');
      if (b.action === 'join') {
        if (!room.mic_queue) throw new HttpError(409, 'Bu odada mikrofon kuyruğu kapalı');
        if ((await db.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, me.id])).rowCount)
          throw new HttpError(403, 'Bu odaya giremezsin');
        if (!(await waiting(me.id)) && (await queueOf(room.id)).length >= 50) throw new HttpError(409, 'Mikrofon kuyruğu dolu, biraz sonra tekrar dene');
        await db.query('INSERT INTO room_mic_queue (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [room.id, me.id]);
      } else await drop(me.id);
      await pushRoomMeta(room.id);
      return { queue: await queueOf(room.id) };
    }
    if (b.action === 'approve' || b.action === 'reject') {
      const rank = await staffRank(room, me.id);
      const target = userId(b.user);
      if (!(await waiting(target))) throw new HttpError(404, 'Bu kişi kuyrukta değil');
      limit(`roomseat:${me.id}`, 60, 'Çok sık işlem yaptın, biraz bekle');
      if (b.action === 'approve') {
        const seat = seatNo(b.seat);
        if (seat === null) throw new HttpError(400, 'Geçersiz koltuk');
        if ((room.locked_seats ?? []).map(Number).includes(seat)) throw new HttpError(409, 'Bu mikrofon kilitli');
        const name = liveKitName(room.id);
        const done = await seatCall('UpdateParticipant', { room: name, identity: target, attributes: { seat: String(seat) } }, name);
        await drop(target);
        await pushRoomMeta(room.id);
        if (!done) throw new HttpError(409, 'Bu kişi şu an sesli odada değil');
        await audit(db, { actor: me.id, role: roleOfRank(rank), action: 'room_seat_move', target, detail: { room: room.id, seat, queue: true } });
      } else {
        await drop(target);
        await pushRoomMeta(room.id);
      }
      return { queue: await queueOf(room.id) };
    }
    throw new HttpError(400, 'Geçersiz işlem');
  },
};
