// Ortak ekran (the Video and Sinema Salonu layouts): the room's one YouTube video, the same on every phone. The owner
// and the room's admins (only the owner when the room keeps its tools to the owner, room-rules manageFunctions) open a
// video and play, pause, seek or close it for everyone. Each phone plays it in its own YouTube player at the position
// the room's clock gives (app lib/room-modes expectedPosition).
//
//   POST /api/rooms/video { room, video } → { video, serverNow }
//     video: { videoId, status: 'playing' | 'paused', position } (seconds) or null (the screen closes)
//
// rooms.video holds { videoId, status, position, updatedAt, by }: `position` is where the video was at `updatedAt`
// (server ms). It goes into the LiveKit room metadata (rooms.mjs pushRoomMeta), so every phone follows a change at
// once and a phone that joins later starts at the same point. Only the video's 11-character id is ever stored: the
// app turns a pasted link into it (app lib/youtube), and nothing else from the link reaches another phone. When
// LiveKit opens the room again (someone joins it empty), the screen starts empty (rooms.mjs voiceRoomStarted).
import { HttpError, auth, db, limit, readJson } from './core.mjs';
import { rulesOf } from './room-rules.mjs';
import { pushRoomMeta, rankOf, roomRow } from './rooms.mjs';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const STATUS = ['playing', 'paused'];
/** The longest a position may be (a 24-hour live stream). */
const MAX_POSITION = 24 * 3600;

/** The stored video, as the API and the metadata give it; null when there is none or it is broken. */
export function videoView(v) {
  if (!v || typeof v !== 'object' || !VIDEO_ID.test(v.videoId) || !STATUS.includes(v.status)) return null;
  return { videoId: v.videoId, status: v.status, position: Number(v.position) || 0, updatedAt: Number(v.updatedAt) || 0, by: String(v.by ?? '') };
}

export const roomVideoRoutes = {
  async 'POST /api/rooms/video'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const rank = await rankOf(room, me.id);
    if (!rank) throw new HttpError(403, 'Ortak ekranı yalnızca oda sahibi veya yöneticiler yönetebilir');
    if (rank < 3 && rulesOf(room.rules).manageFunctions === 'owner') throw new HttpError(403, 'Bu odada ortak ekranı yalnızca oda sahibi yönetir');
    let video = null;
    if (b.video !== null) {
      const v = b.video;
      if (!v || typeof v !== 'object' || typeof v.videoId !== 'string' || !VIDEO_ID.test(v.videoId)) throw new HttpError(400, 'Geçersiz video');
      if (!STATUS.includes(v.status)) throw new HttpError(400, 'Geçersiz oynatma durumu');
      if (typeof v.position !== 'number' || !Number.isFinite(v.position) || v.position < 0 || v.position > MAX_POSITION) throw new HttpError(400, 'Geçersiz konum');
      video = { videoId: v.videoId, status: v.status, position: Math.round(v.position * 10) / 10, updatedAt: Date.now(), by: me.id };
    }
    limit(`roomvideo:${me.id}`, 60, 'Çok sık değiştirdin, biraz bekle');
    await db.query('UPDATE rooms SET video = $2 WHERE id = $1', [room.id, video && JSON.stringify(video)]);
    await pushRoomMeta(room.id);
    return { video: videoView(video), serverNow: new Date().toISOString() };
  },
};
