// Music in the rooms (item 30 of güncelleme 2; the playlist of güncelleme 4, item 16): the owner makes people DJ,
// and the owner, the room's admins and its DJs play music from their own library in the room. A DJ gets nothing
// else in the room: no mics, kicks or mutes (rooms.mjs never counts a DJ as staff). Everyone in the room hears the
// same track at the same point: each phone plays the file itself from the photo storage, at the position the
// room's clock gives (the app's lib/live/music).
//
//   GET  /api/music                          → { tracks }               my library, newest first
//   POST /api/music { title, artist?, url, seconds, size } → { track }  url: one I uploaded (media.mjs kind music)
//   POST /api/music/remove { id }            → { removed }              also leaves every room's list
//   GET  /api/rooms/music?room=              → { music, canPlay, serverNow }
//   POST /api/rooms/music { room, action, … } → { music, serverNow }   (owner, admin, DJ)
//     add { tracks: [id…] }  my tracks to the end of the list (older apps send one as { track }); the first of
//                            them plays at once when nothing does
//     play { track }         one of my tracks now, from the start, right after the row that played (older apps'
//                            "Çal")
//     jump { key }           that row now, from the start
//     top { key }            that row plays next ("Öne al")
//     remove { key }         that row leaves the list (the playing one: the next one starts)
//     skip | prev            the next / previous row (prev after the first 3 s starts the track again)
//     pause | resume         ("Durdur"); resume with nothing playing starts the list from the top
//     repeat { mode }        off | one | all
//     stop                   the music stops for everyone, the list stays (the bar's "Kapat")
//     clear                  the list empties and the music stops ("Listeyi boşalt"; older apps' "Kapat")
//   POST /api/rooms/dj { room, user, dj }    → { dj }                   (owner only; DJ_LIMITS by the room's level)
//
// The room's list is room_music_queue in `pos` order; rooms.music_current is the row playing, from
// music_started_at (pauses taken out; while paused, since music_paused_at). A row stays on the list after it has
// played, so "previous" has somewhere to go; adding to a full list drops the oldest rows that already played.
// When the clock passes the end of a track, the next read moves the pointer on (settle): to the next row, the same
// row (repeat one), the top of the list (repeat all) or nowhere (the end, repeat off), so no phone has to tell the
// server. At each track's end a timer also writes the new state into the LiveKit metadata (endTimer).
//
// music: { tracks, startedAt, pausedAt, repeat, order, others } (server ms; null: nothing playing / not paused).
//   tracks: what plays from startedAt on, in order: the playing row first, then the rest of the list (with repeat
//   all the list goes round, with repeat one only the playing row). Apps from before the playlist read only this
//   and walk it on the clock, so they keep playing what everyone else hears. order: every row's key in list
//   order; others: the rows that are not in tracks. It also goes into the LiveKit room metadata (rooms.mjs
//   pushRoomMeta), so every phone in the room follows a change at once. When LiveKit opens the room again
//   (someone joins it empty), the list starts empty.
//
// A library is for people who can play somewhere: the owner of a room, or an admin or DJ of one (media.mjs asks
// mayKeepMusic before it hands out an upload address). There is no ready-made list from us: only what people add
// from their own phone. Playing music to a room is a public performance: see docs (PRS/PPL licence) before launch.
import { HttpError, UUID, auth, db, env, int, limit, publicText, readJson, tx, userId } from './core.mjs';
import { mayKeepMusic, removeFiles, verifyUpload } from './media.mjs';
// rooms.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { announceRoom } from './live.mjs';
import { ROOM_MAX_LEVEL, liveKitName, pushRoomMeta, roomLevel } from './rooms.mjs';

/** DJs a room may have at each level (app data/catalog ROOM_LIMITS djs): 3, rising at the admins' rate. */
export const DJ_LIMITS = [3, 3, 3, 3, 3, 4, 5, 7, 8, 9, 10, 12, 14, 16, 18];
export const djLimit = (level) => DJ_LIMITS[Math.min(Math.max(level, 1), ROOM_MAX_LEVEL) - 1];
const LIBRARY_MAX = 50;
/** Rows on a room's list (the app's LIST_MAX). */
export const LIST_MAX = 50;
const REPEAT = ['off', 'one', 'all'];
/** "Önceki" in the first seconds of a track goes to the row before; later it starts the track again. */
const PREV_RESTART_MS = 3000;

const trackView = (t) => ({ id: String(t.id), title: t.title, artist: t.artist ?? '', url: t.url, seconds: t.seconds, createdAt: t.created_at.toISOString() });
const ID = /^\d{1,18}$/;
const idOf = (v) => (typeof v === 'string' && ID.test(v) ? v : null);
const ms = (d) => d?.getTime() ?? null;

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
 * The room's list and clock, with the pointer moved past the tracks that have played through (see the top of
 * this file). In the caller's transaction, with the room row locked. `index` is the playing row in `list`, -1
 * when nothing plays.
 */
async function settle(c, roomId, now = Date.now()) {
  const r = (await c.query('SELECT music_started_at, music_paused_at, music_current, music_repeat FROM rooms WHERE id = $1 FOR UPDATE', [roomId])).rows[0];
  const list = (
    await c.query(
      `SELECT q.id, q.pos, q.added_by, t.title, t.artist, t.url, t.seconds, u.name AS by_name
         FROM room_music_queue q JOIN music_tracks t ON t.id = q.track_id JOIN users u ON u.id = q.added_by
        WHERE q.room_id = $1 ORDER BY q.pos, q.id`,
      [roomId],
    )
  ).rows;
  const repeat = REPEAT.includes(r.music_repeat) ? r.music_repeat : 'off';
  let started = ms(r.music_started_at);
  let paused = ms(r.music_paused_at);
  let index = r.music_current === null ? -1 : list.findIndex((t) => String(t.id) === String(r.music_current));
  if (index < 0 || started === null) index = -1;
  else {
    const at = paused ?? now;
    const len = (i) => list[i].seconds * 1000;
    if (repeat === 'one') {
      if (at - started >= len(index)) started += Math.floor((at - started) / len(index)) * len(index);
    } else {
      // Whole rounds of the list at once (a room left playing for days), then row by row.
      const round = list.reduce((n, t) => n + t.seconds * 1000, 0);
      if (repeat === 'all' && at - started >= round) started += Math.floor((at - started) / round) * round;
      while (index >= 0 && at - started >= len(index)) {
        started += len(index);
        index += 1;
        if (index >= list.length) index = repeat === 'all' ? 0 : -1;
      }
    }
  }
  if (index < 0) [started, paused] = [null, null];
  const current = index < 0 ? null : String(list[index].id);
  if (current !== (r.music_current === null ? null : String(r.music_current)) || started !== ms(r.music_started_at) || paused !== ms(r.music_paused_at))
    await setClock(c, roomId, current, started, paused);
  return { list, index, started, paused, repeat };
}
/** Row `current` plays from `started` (server ms), paused since `paused`; null for all three: nothing plays. */
const setClock = (c, roomId, current, started, paused) =>
  c.query(
    'UPDATE rooms SET music_current = $2, music_started_at = to_timestamp($3::double precision / 1000), music_paused_at = to_timestamp($4::double precision / 1000) WHERE id = $1',
    [roomId, current, started, paused],
  );
/** Row `row` from its start now; a paused room stays paused (at its start). null: nothing plays. */
const startRow = (c, roomId, row, now, paused) => setClock(c, roomId, row === null ? null : String(row.id ?? row), row === null ? null : now, row !== null && paused !== null ? now : null);
/** The list in this order of ids (pos 1, 2, …). */
const reorder = (c, ids) =>
  c.query('UPDATE room_music_queue q SET pos = o.n FROM unnest($1::bigint[]) WITH ORDINALITY AS o(id, n) WHERE q.id = o.id', [ids.map(String)]);

const trackOut = (t) => ({ key: String(t.id), title: t.title, artist: t.artist ?? '', url: t.url, seconds: t.seconds, by: t.added_by, byName: t.by_name });
const view = ({ list, index, started, paused, repeat }) => {
  // The walk older apps make on the clock (they know no list and no repeat).
  const walk = index < 0 ? [] : repeat === 'one' ? [list[index]] : repeat === 'all' ? [...list.slice(index), ...list.slice(0, index)] : list.slice(index);
  const inWalk = new Set(walk.map((t) => String(t.id)));
  return {
    tracks: walk.map(trackOut),
    startedAt: started,
    pausedAt: paused,
    repeat,
    order: list.map((t) => String(t.id)),
    others: list.filter((t) => !inWalk.has(String(t.id))).map(trackOut),
  };
};

// --- The end of a track ------------------------------------------------------------------------------------------
// Phones walk the list on the room's clock by themselves, but the room's metadata should say what plays: apps from
// before the playlist only know `tracks`, so with repeat on they would walk past the end. At each track's end the
// metadata is written again (one LiveKit call a track). A room LiveKit has closed answers false: no more timers
// for it until its music is read again.
const ends = new Map();
function endTimer(roomId, s, now) {
  clearTimeout(ends.get(roomId));
  ends.delete(roomId);
  if (!env.LIVEKIT_API_URL || s.index < 0 || s.paused !== null) return;
  const left = s.started + s.list[s.index].seconds * 1000 - now;
  const t = setTimeout(
    () => {
      ends.delete(roomId);
      pushRoomMeta(roomId).then(
        (ok) => !ok && (clearTimeout(ends.get(roomId)), ends.delete(roomId)),
        () => {},
      );
    },
    Math.max(0, left) + 250,
  );
  t.unref?.();
  ends.set(roomId, t);
}
// After a restart: the rooms whose music plays get their timer again.
if (env.LIVEKIT_API_URL)
  setTimeout(
    () =>
      db
        .query('SELECT id FROM rooms WHERE music_current IS NOT NULL AND music_paused_at IS NULL AND closed_at IS NULL')
        .then((r) => Promise.all(r.rows.map((x) => roomMusic(x.id).catch(() => {}))))
        .catch((e) => console.error('music timers', e.message)),
    10_000,
  ).unref();

/** The room's music now (played-through tracks walked past), for the API and the LiveKit metadata. */
export async function roomMusic(roomId) {
  const now = Date.now();
  const s = await tx((c) => settle(c, roomId, now));
  endTimer(roomId, s, now);
  return view(s);
}

/** LiveKit opened the room again (nobody was in it): its music starts from nothing. */
export async function clearRoomMusic(roomId) {
  clearTimeout(ends.get(roomId));
  ends.delete(roomId);
  await db.query('DELETE FROM room_music_queue WHERE room_id = $1', [roomId]);
  await db.query('UPDATE rooms SET music_current = NULL, music_started_at = NULL, music_paused_at = NULL WHERE id = $1', [roomId]);
}

/**
 * Takes rows off their rooms' lists (a track removed from a library, a deleted account, "remove"). A room whose
 * playing row went starts the next row left now (round to the top with repeat on; nothing at the end with repeat
 * off). Answers the rooms that changed, for their metadata.
 */
export async function dropFromQueues(c, where, args) {
  const rows = (await c.query(`SELECT id, room_id FROM room_music_queue WHERE ${where}`, args)).rows;
  const rooms = [...new Set(rows.map((x) => x.room_id))];
  const now = Date.now();
  for (const roomId of rooms) {
    const s = await settle(c, roomId, now);
    const gone = new Set(rows.filter((x) => x.room_id === roomId).map((x) => String(x.id)));
    await c.query('DELETE FROM room_music_queue WHERE room_id = $1 AND id = ANY($2::bigint[])', [roomId, [...gone]]);
    if (s.index < 0 || !gone.has(String(s.list[s.index].id))) continue;
    let next = null;
    for (let k = 1; k < s.list.length && !next; k++) {
      if (s.index + k >= s.list.length && s.repeat === 'off') break;
      const t = s.list[(s.index + k) % s.list.length];
      if (!gone.has(String(t.id))) next = t;
    }
    await startRow(c, roomId, next, now, s.paused);
  }
  return rooms;
}

/**
 * Room on the list for `n` more rows: the oldest rows that already played (above the playing one; every row
 * when nothing plays) leave first. A 409 when that is not enough.
 */
async function makeRoom(c, s, n) {
  const over = s.list.length + n - LIST_MAX;
  if (over <= 0) return s.list;
  const played = s.index < 0 ? s.list : s.list.slice(0, s.index);
  if (over > played.length) throw new HttpError(409, `Çalma listesinde en fazla ${LIST_MAX} parça olabilir; önce birini çıkar`);
  const drop = played.slice(0, over).map((t) => String(t.id));
  await c.query('DELETE FROM room_music_queue WHERE id = ANY($1::bigint[])', [drop]);
  return s.list.filter((t) => !drop.includes(String(t.id)));
}
/** New rows of my tracks at the end of the room's list, in this order; answers their ids. */
async function append(c, roomId, trackIds, uid) {
  const r = await c.query(
    `INSERT INTO room_music_queue (room_id, track_id, added_by, pos)
     SELECT $1, t.id, $3, (SELECT coalesce(max(pos), 0) FROM room_music_queue WHERE room_id = $1) + o.n
       FROM unnest($2::bigint[]) WITH ORDINALITY AS o(id, n) JOIN music_tracks t ON t.id = o.id
      ORDER BY o.n RETURNING id, pos`,
    [roomId, trackIds, uid],
  );
  return r.rows.sort((a, b) => Number(a.pos) - Number(b.pos)).map((x) => String(x.id));
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
    // Everyone in the room reads the names: no contact details (contact-filter.mjs).
    const title = await publicText(b.title, 1, 80, 'Parça adı', me, 'room.music', 'title');
    const artist = typeof b.artist === 'string' && b.artist.trim() ? await publicText(b.artist, 1, 80, 'Sanatçı adı', me, 'room.music', 'artist') : null;
    const url = musicUrl(b.url, me.id);
    await verifyUpload(url, 'music');
    const seconds = int(b.seconds, 5, 1200);
    if (seconds === null) throw new HttpError(400, 'Parça 5 saniye ile 20 dakika arası olmalı');
    const size = int(b.size, 1, 20 * 1024 * 1024);
    if (size === null) throw new HttpError(400, 'Dosya en fazla 20 MB olabilir');
    limit(`music:${me.id}`, 30, 'Çok fazla parça ekledin, biraz bekle');
    const n = (await db.query('SELECT count(*)::int AS n FROM music_tracks WHERE owner = $1 AND removed_at IS NULL', [me.id])).rows[0].n;
    if (n >= LIBRARY_MAX) throw new HttpError(409, `Kütüphanede en fazla ${LIBRARY_MAX} parça olabilir; önce birini sil`);
    const r = await db.query('INSERT INTO music_tracks (owner, title, artist, url, seconds, size) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [me.id, title, artist, url, seconds, size]);
    return { track: trackView(r.rows[0]) };
  },

  async 'POST /api/music/remove'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const id = idOf(b.id);
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
    const now = Date.now();
    await tx(async (c) => {
      const s = await settle(c, room.id, now);
      const cur = s.index < 0 ? null : s.list[s.index];
      // Only from my own library, each one once, in the order given.
      const mine = async (ids) => {
        const want = [...new Set(ids)];
        if (!want.length || want.length > LIST_MAX || want.some((x) => !idOf(x))) throw new HttpError(400, 'Geçersiz parça');
        const r = await c.query('SELECT id FROM music_tracks WHERE id = ANY($1::bigint[]) AND owner = $2 AND removed_at IS NULL', [want, me.id]);
        if (r.rowCount !== want.length) throw new HttpError(404, 'Parça kütüphanende yok');
        return want;
      };
      // A row of the room's list.
      const row = () => {
        const key = idOf(b.key);
        const i = key ? s.list.findIndex((t) => String(t.id) === key) : -1;
        if (i < 0) throw new HttpError(404, 'Bu parça listede değil');
        return i;
      };
      if (b.action === 'add') {
        const ids = await mine(Array.isArray(b.tracks) ? b.tracks : [b.track]);
        await makeRoom(c, s, ids.length);
        const added = await append(c, room.id, ids, me.id);
        if (!cur) await startRow(c, room.id, added[0], now, null);
      } else if (b.action === 'play') {
        const [id] = await mine([b.track]);
        const list = (await makeRoom(c, s, 1)).map((t) => String(t.id));
        const [added] = await append(c, room.id, [id], me.id);
        const at = cur ? list.indexOf(String(cur.id)) + 1 : list.length;
        await reorder(c, [...list.slice(0, at), added, ...list.slice(at)]);
        await startRow(c, room.id, added, now, null);
      } else if (b.action === 'jump') {
        await startRow(c, room.id, s.list[row()], now, null);
      } else if (b.action === 'top') {
        const i = row();
        if (i === s.index) throw new HttpError(409, 'Bu parça zaten çalıyor');
        const ids = s.list.map((t) => String(t.id));
        const [moved] = ids.splice(i, 1);
        ids.splice(cur ? ids.indexOf(String(cur.id)) + 1 : 0, 0, moved);
        await reorder(c, ids);
      } else if (b.action === 'remove') {
        await dropFromQueues(c, 'room_id = $1 AND id = $2', [room.id, String(s.list[row()].id)]);
      } else if (b.action === 'skip') {
        if (!cur) throw new HttpError(409, 'Çalan parça yok');
        const i = s.index + 1;
        await startRow(c, room.id, i < s.list.length ? s.list[i] : s.repeat === 'off' ? null : s.list[0], now, s.paused);
      } else if (b.action === 'prev') {
        if (!s.list.length) throw new HttpError(409, 'Listede parça yok');
        if (!cur) await startRow(c, room.id, s.list[s.list.length - 1], now, null);
        else if ((s.paused ?? now) - s.started > PREV_RESTART_MS) await startRow(c, room.id, cur, now, s.paused);
        else {
          const i = s.index - 1;
          await startRow(c, room.id, i >= 0 ? s.list[i] : s.repeat === 'off' ? cur : s.list[s.list.length - 1], now, s.paused);
        }
      } else if (b.action === 'pause') {
        if (cur && s.paused === null) await setClock(c, room.id, String(cur.id), s.started, now);
      } else if (b.action === 'resume') {
        if (cur && s.paused !== null) await setClock(c, room.id, String(cur.id), s.started + (now - s.paused), null);
        else if (!cur && s.list.length) await startRow(c, room.id, s.list[0], now, null);
      } else if (b.action === 'repeat') {
        if (!REPEAT.includes(b.mode)) throw new HttpError(400, 'Geçersiz tekrar');
        await c.query('UPDATE rooms SET music_repeat = $2 WHERE id = $1', [room.id, b.mode]);
      } else if (b.action === 'stop') {
        if (cur) await setClock(c, room.id, null, null, null);
      } else if (b.action === 'clear') {
        await c.query('DELETE FROM room_music_queue WHERE room_id = $1', [room.id]);
        await setClock(c, room.id, null, null, null);
      } else throw new HttpError(400, 'Geçersiz müzik işlemi');
    });
    // Read again after the change (settle on the new clock), then out to every phone; the timer follows.
    const music = await roomMusic(room.id);
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
      // The phones in the room read who plays music again at once (rooms.mjs does the same for admins).
      announceRoom(liveKitName(room.id));
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
    announceRoom(liveKitName(room.id));
    return { dj: true };
  },
};
