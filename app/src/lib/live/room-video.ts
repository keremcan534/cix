// Live mode (lib/live): the shared YouTube screen of a server room (Video and Sinema Salonu layouts,
// server/api/room-video.mjs). The server keeps the room's one video ({ videoId, status, position, updatedAt }) and
// writes it into the room metadata (lib/live/room-bus `video`), so every phone in the room, and one that joins
// later, shows the same video at the same point. The room screen still checks a change first (lib/room-modes
// setVideo, playVideo…), then sends the result here. Only lib/api and lib/sanction-time are used, so Node tests
// can load this.
import * as api from '@/lib/api';
import { parseRoomVideo, type RoomVideo } from '@/lib/live/room-bus';
import type { PlaybackState } from '@/lib/room-modes';
import { serverNow, setServerNow } from '@/lib/sanction-time';

export { parseRoomVideo, type RoomVideo };

/**
 * The server's video as this phone's playback state: its time moved onto this phone's clock (the room screen counts
 * the position on Date.now), so a phone whose clock is off still plays the same point as the others.
 */
export function videoPlayback(v: RoomVideo, now = Date.now(), server = serverNow()): PlaybackState {
  return { provider: 'youtube', videoId: v.videoId, playbackStatus: v.status, position: v.position, updatedAt: v.updatedAt ? v.updatedAt + (now - server) : now, updatedBy: v.by };
}

/**
 * Owner and admins: the room's video becomes this one for everyone (null closes the screen). Ended and broken
 * states stay on each phone (the server keeps playing or paused only): an ended video goes as paused at its end.
 */
export async function shareVideo(room: string, p: PlaybackState | null) {
  const video = p && { videoId: p.videoId, status: p.playbackStatus === 'playing' ? 'playing' : 'paused', position: Math.max(0, p.position) };
  const r = await api.apiRequest<{ video: unknown; serverNow: string }>('POST', '/api/rooms/video', { room, video });
  setServerNow(r.serverNow);
  return parseRoomVideo(r.video);
}
