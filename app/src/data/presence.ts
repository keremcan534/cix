// Where a user currently is (voice/video room or a private call). In production this comes from the
// realtime presence service; here it is derived from the mock rooms (host or seated = in that room).
import { ROOMS, roomById } from '@/data/mock';

export type Presence = { kind: 'room'; roomId: string; title: string; locked: boolean } | { kind: 'call'; mode: 'sesli' | 'görüntülü' } | null;

// A few users are in a private call (can't be joined, only shown as busy).
const IN_CALL: Record<string, 'sesli' | 'görüntülü'> = { u3: 'görüntülü', u8: 'sesli' };

/** In live mode (a server address is set; read on each call so a test can switch it) there is no presence
 *  service yet, and the sample rooms and calls are not real: nobody is shown in a room or a call. */
export const presenceOf = (userId: string): Presence => {
  if (process.env.EXPO_PUBLIC_API_URL) return null;
  const room = ROOMS.find((r) => r.hostId === userId || r.seatUserIds.includes(userId));
  if (room) return { kind: 'room', roomId: room.id, title: room.title, locked: !!room.password };
  if (IN_CALL[userId]) return { kind: 'call', mode: IN_CALL[userId] };
  return null;
};

export const presenceLabel = (p: Presence, online: boolean) =>
  p?.kind === 'room' ? `Partide · ${p.title}` : p?.kind === 'call' ? `${p.mode === 'sesli' ? 'Sesli' : 'Görüntülü'} görüşmede` : online ? 'Çevrimiçi' : 'Çevrimdışı';

/** Room route that records whom the user followed into the room (shown as a chat message there). */
export const followRoute = (roomId: string, viaUserId: string) => ({ pathname: '/oda/[id]' as const, params: { id: roomId, via: viaUserId } });
export const isLockedRoom = (roomId: string) => !!roomById(roomId)?.password;
