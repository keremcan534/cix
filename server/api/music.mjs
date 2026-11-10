// Music in the rooms (item 30 of güncelleme 2): the owner makes people DJ, and the owner, the room's admins and its
// DJs play music from their own library in the room. A DJ gets nothing else in the room: no mics, kicks or mutes
// (rooms.mjs never counts a DJ as staff). Everyone in the room hears the same track at the same point: each phone
// plays the file itself from the photo storage, at the position the room's clock gives (the app's lib/live/music).
//
//   GET  /api/music                          → { tracks }               my library, newest first
//   POST /api/music { title, url, seconds, size } → { track }           url: one I uploaded (media.mjs kind music)
//   POST /api/music/remove { id }            → { removed }              also leaves every room's queue
//   GET  /api/rooms/music?room=              → { music, canPlay, serverNow }
//   POST /api/rooms/music { room, action: play|add, track } | { room, action: remove, key }
//                         | { room, action: skip|pause|resume|clear } → { music, serverNow }   (owner, admin, DJ)
//
// play: the track plays now, from the start, in place of whatever played (the app's "Çal"); clear stops the music
// and empties the queue (the app's "Kapat"); pause and resume ("Durdur"). add (a queue after the playing track) is
// kept for older apps.
//   POST /api/rooms/dj { room, user, dj }    → { dj }                   (owner only; DJ_LIMITS by the room's level)
//
// music: { tracks: [{ key, title, url, seconds, by, byName }], startedAt, pausedAt } (server ms; null: nothing
// playing / not paused). tracks[0] plays, from startedAt; the rest wait in order. It also goes into the LiveKit room
// metadata (rooms.mjs pushRoomMeta), so every phone in the room follows a change at once. A track that has played
// through leaves the queue the next time the music is read (settle), so no phone has to tell the server. When
// LiveKit opens the room again (someone joins it empty), the queue starts empty.
//
// A library is for people who can play somewhere: the owner of a room, or an admin or DJ of one (media.mjs asks
// mayKeepMusic before it hands out an upload address). Playing music to a room is a public performance: see
// docs (PRS/PPL licence) before launch.
import { HttpError, UUID, auth, db, env, int, limit, publicText, readJson, tx, userId } from './core.mjs';
import { mayKeepMusic, removeFiles, verifyUpload } from './media.mjs';
// rooms.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { ROOM_MAX_LEVEL, pushRoomMeta, roomLevel } from './rooms.mjs';

/** DJs a room may have at each level (app data/catalog ROOM_LIMITS djs): 3, rising at the admins' rate. */
export const DJ_LIMITS = [3, 3, 3, 3, 3, 4, 5, 7, 8, 9, 10, 12, 14, 16, 18];
export const djLimit = (level) => DJ_LIMITS[Math.min(Math.max(level, 1), ROOM_MAX_LEVEL) - 1];
const LIBRARY_MAX = 50;
const QUEUE_MAX = 20;

const trackView = (t) => ({ id: String(t.id), title: t.title, url: t.url, seconds: t.seconds, createdAt: t.created_at.toISOString() });

/** A file I uploaded to my own music folder; anything else is refused. */
function musicUrl(v, owner) {
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  const dir = `${base}/music/${owner}/`;
  if (!base || typeof v !== 'string' || v.length > 500 || !v.startsWith(dir) || !/^[A-Za-z0-9._-]{1,120}$/.test(v.slice(dir.length))) throw new HttpError(400, 'Geçersiz müzik dosyası');
  return v;
}

async function roomOf(id, q = db) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new HttpError(400, 'Geçersiz oda');
  const r = await q.query('SELECT r.id, r.owner, r.closed_at, u.room_xp FROM rooms r JOIN users u ON u.id = r.owner WHERE r.id = $1', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  return r.rows[0];
}

/** Owner, a room admin or a DJ: the people who play music in the room. */
async function mayPlay(room, uid) {
  if (room.owner === uid) return true;
  const r = await db.query(
    'SELECT EXISTS (SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2) OR EXISTS (SELECT 1 FROM room_djs WHERE room_id = $1 AND user_id = $2) AS ok',
    [room.id, uid],
  );
  return r.rows[0].ok;
}

/**
 * Takes the tracks that have played through off the room's queue, moving its clock on by their length, and
 * answers the queue left. In the caller's transaction, with the room row locked.
 */
async function settle(c, roomId, now = Date.now()) {
  const r = (await c.query('SELECT music_started_at, music_paused_at FROM rooms WHERE id = $1 FOR UPDATE', [roomId])).rows[0];
  const queue = (
    await c.query(
      `SELECT q.id, q.added_by, t.title, t.url, t.seconds, u.name AS by_name
         FROM room_music_queue q JOIN music_tracks t ON t.id = q.track_id JOIN users u ON u.id = q.added_by
        WHERE q.room_id = $1 ORDER BY q.id`,
      [roomId],
    )
  ).rows;
  let started = r.music_started_at?.getTime() ?? null;
  let paused = r.music_paused_at?.getTime() ?? null;
  const done = [];
  const at = paused ?? now;
  while (queue.length && started !== null && at - started >= queue[0].seconds * 1000) {
    started += queue[0].seconds * 1000;
    done.push(queue.shift().id);
  }
  if (!queue.length) [started, paused] = [null, null];
  else if (started === null) started = now;
  if (done.length) await c.query('DELETE FROM room_music_queue WHERE id = ANY($1::bigint[])', [done]);
  if (started !== (r.music_started_at?.getTime() ?? null) || paused !== (r.music_paused_at?.getTime() ?? null))
    await setClock(c, roomId, started, paused);
  return { queue, started, paused };
}
const setClock = (c, roomId, started, paused) =>
  c.query('UPDATE rooms SET music_started_at = to_timestamp($2::double precision / 1000), music_paused_at = to_timestamp($3::double precision / 1000) WHERE id = $1', [roomId, started, paused]);

const view = ({ queue, started, paused }) => ({
  tracks: queue.map((t) => ({ key: String(t.id), title: t.title, url: t.url, seconds: t.seconds, by: t.added_by, byName: t.by_name })),
  startedAt: started,
  pausedAt: paused,
});

/** The room's music now (played-through tracks taken off), for the API and the LiveKit metadata. */
export const roomMusic = (roomId) => tx(async (c) => view(await settle(c, roomId)));

/** LiveKit opened the room again (nobody was in it): its music starts from nothing. */
export async function clearRoomMusic(roomId) {
  await db.query('DELETE FROM room_music_queue WHERE room_id = $1', [roomId]);
  await db.query('UPDATE rooms SET music_started_at = NULL, music_paused_at = NULL WHERE id = $1', [roomId]);
}

/**
 * Takes queue rows out of their rooms (a track removed from a library, a deleted account). A room whose playing
 * track went starts the next one now. Answers the rooms that changed, for their metadata.
 */
export async function dropFromQueues(c, where, args) {
  const rows = (await c.query(`SELECT id, room_id FROM room_music_queue WHERE ${where}`, args)).rows;
  const rooms = [...new Set(rows.map((x) => x.room_id))];
  const now = Date.now();
  for (const roomId of rooms) {
    const s = await settle(c, roomId, now);
    const gone = new Set(rows.filter((x) => x.room_id === roomId).map((x) => String(x.id)));
    const headGone = s.queue.length && gone.has(String(s.queue[0].id));
    await c.query('DELETE FROM room_music_queue WHERE room_id = $1 AND id = ANY($2::bigint[])', [roomId, [...gone]]);
    const left = s.queue.filter((t) => !gone.has(String(t.id)));
    if (!left.length) await setClock(c, roomId, null, null);
    else if (headGone) await setClock(c, roomId, now, s.paused === null ? null : now);
  }
  return rooms;
}

export const musicRoutes = {
  async 'GET /api/music'(req) {
    const me = await auth(req);
    const r = await db.query('SELECT * FROM music_tracks WHERE owner = $1 AND removed_at IS NULL ORDER BY id DESC LIMIT $2', [me.id, LIBRARY_MAX]);
    return { tracks: r.rows.map(trackView) };
  },

  async 'POST /api/music'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (!(await mayKeepMusic(me.id))) throw new HttpError(403, 'Müzik kütüphanesi oda sahibi, yönetici ve DJ’ler için');
    // Everyone in the room reads the name: no contact details (contact-filter.mjs).
    const title = await publicText(b.title, 1, 80, 'Parça adı', me, 'room.music', 'title');
    const url = musicUrl(b.url, me.id);
    await verifyUpload(url, 'music');
    const seconds = int(b.seconds, 5, 1200);
    if (seconds === null) throw new HttpError(400, 'Parça 5 saniye ile 20 dakika arası olmalı');
    const size = int(b.size, 1, 20 * 1024 * 1024);
    if (size === null) throw new HttpError(400, 'Dosya en fazla 20 MB olabilir');
    limit(`music:${me.id}`, 30, 'Çok fazla parça ekledin, biraz bekle');
    const n = (await db.query('SELECT count(*)::int AS n FROM music_tracks WHERE owner = $1 AND removed_at IS NULL', [me.id])).rows[0].n;
    if (n >= LIBRARY_MAX) throw new HttpError(409, `Kütüphanede en fazla ${LIBRARY_MAX} parça olabilir; önce birini sil`);
    const r = await db.query('INSERT INTO music_tracks (owner, title, url, seconds, size) VALUES ($1,$2,$3,$4,$5) RETURNING *', [me.id, title, url, seconds, size]);
    return { track: trackView(r.rows[0]) };
  },

  async 'POST /api/music/remove'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const id = typeof b.id === 'string' && /^\d{1,18}$/.test(b.id) ? b.id : null;
    if (!id) throw new HttpError(400, 'Geçersiz parça');
    let url = null;
    const rooms = await tx(async (c) => {
      const r = await c.query('UPDATE music_tracks SET removed_at = now() WHERE id = $1 AND owner = $2 AND removed_at IS NULL RETURNING url', [id, me.id]);
      if (!r.rowCount) throw new HttpError(404, 'Parça bulunamadı');
      url = r.rows[0].url;
      return dropFromQueues(c, 'track_id = $1', [id]);
    });
    for (const roomId of rooms) await pushRoomMeta(roomId);
    // The file leaves the storage unless another track of the library still plays it.
    if (!(await db.query('SELECT 1 FROM music_tracks WHERE url = $1 AND removed_at IS NULL LIMIT 1', [url])).rowCount) removeFiles([url], me.id);
    return { removed: true };
  },

  async 'GET /api/rooms/music'(req, url) {
    const me = await auth(req);
    const room = await roomOf(url.searchParams.get('room'));
    return { music: await roomMusic(room.id), canPlay: !room.closed_at && (await mayPlay(room, me.id)), serverNow: new Date().toISOString() };
  },

  async 'POST /api/rooms/music'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomOf(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if (!(await mayPlay(room, me.id))) throw new HttpError(403, 'Odada müziği oda sahibi, yöneticiler ve DJ’ler çalar');
    limit(`roommusic:${me.id}`, 60, 'Çok sık değiştirdin, biraz bekle');
    const music = await tx(async (c) => {
      const now = Date.now();
      const s = await settle(c, room.id, now);
      // Only from my own library.
      const mine = async () => {
        const id = typeof b.track === 'string' && /^\d{1,18}$/.test(b.track) ? b.track : null;
        const t = id && (await c.query('SELECT id FROM music_tracks WHERE id = $1 AND owner = $2 AND removed_at IS NULL', [id, me.id])).rows[0];
        if (!t) throw new HttpError(404, 'Parça kütüphanende yok');
        return t;
      };
      if (b.action === 'play') {
        const t = await mine();
        await c.query('DELETE FROM room_music_queue WHERE room_id = $1', [room.id]);
        await c.query('INSERT INTO room_music_queue (room_id, track_id, added_by) VALUES ($1, $2, $3)', [room.id, t.id, me.id]);
        await setClock(c, room.id, now, null);
      } else if (b.action === 'add') {
        const t = await mine();
        if (s.queue.length >= QUEUE_MAX) throw new HttpError(409, `Sırada en fazla ${QUEUE_MAX} parça olabilir`);
        await c.query('INSERT INTO room_music_queue (room_id, track_id, added_by) VALUES ($1, $2, $3)', [room.id, t.id, me.id]);
        if (!s.queue.length) await setClock(c, room.id, now, null);
      } else if (b.action === 'remove') {
        const key = typeof b.key === 'string' && /^\d{1,18}$/.test(b.key) ? b.key : null;
        if (!key || !s.queue.some((t) => String(t.id) === key)) throw new HttpError(404, 'Bu parça sırada değil');
        await dropFromQueues(c, 'room_id = $1 AND id = $2', [room.id, key]);
      } else if (b.action === 'skip') {
        if (!s.queue.length) throw new HttpError(409, 'Çalan parça yok');
        await dropFromQueues(c, 'room_id = $1 AND id = $2', [room.id, s.queue[0].id]);
      } else if (b.action === 'pause') {
        if (s.queue.length && s.paused === null) await setClock(c, room.id, s.started, now);
      } else if (b.action === 'resume') {
        if (s.queue.length && s.paused !== null) await setClock(c, room.id, s.started + (now - s.paused), null);
      } else if (b.action === 'clear') {
        await c.query('DELETE FROM room_music_queue WHERE room_id = $1', [room.id]);
        await setClock(c, room.id, null, null);
      } else throw new HttpError(400, 'Geçersiz müzik işlemi');
      return view(await settle(c, room.id, now));
    });
    await pushRoomMeta(room.id);
    return { music, serverNow: new Date().toISOString() };
  },

  async 'POST /api/rooms/dj'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomOf(b.room);
    const target = userId(b.user);
    if (room.owner !== me.id) throw new HttpError(403, 'DJ yalnızca oda sahibince atanır');
    if (target === me.id) throw new HttpError(400, 'Oda sahibi zaten müzik çalabilir');
    if (typeof b.dj !== 'boolean') throw new HttpError(400, 'DJ açık ya da kapalı olmalı');
    if (!b.dj) {
      await db.query('DELETE FROM room_djs WHERE room_id = $1 AND user_id = $2', [room.id, target]);
      return { dj: false };
    }
    if (!(await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    if ((await db.query('SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2', [room.id, target])).rowCount) throw new HttpError(409, 'Yöneticiler zaten müzik çalabilir');
    const max = djLimit(roomLevel(room.room_xp ?? 0));
    const done = await tx(async (c) => {
      await c.query('SELECT 1 FROM rooms WHERE id = $1 FOR UPDATE', [room.id]);
      if ((await c.query('SELECT 1 FROM room_djs WHERE room_id = $1 AND user_id = $2', [room.id, target])).rowCount) return true;
      const n = (await c.query('SELECT count(*)::int AS n FROM room_djs WHERE room_id = $1', [room.id])).rows[0].n;
      if (n >= max) return false;
      await c.query('INSERT INTO room_djs (room_id, user_id, by_user) VALUES ($1, $2, $3)', [room.id, target, me.id]);
      return true;
    });
    if (!done) throw new HttpError(409, `Bu seviyedeki odada en fazla ${max} DJ olabilir`);
    return { dj: true };
  },
};
