// Who owns the microphone and camera right now. Rooms report their state here; one-to-one calls
// (Hemen Tanış matches and direct calls) claim the devices through beginCall. Rules (Hemen Tanış spec §3–4):
// - only one one-to-one call at a time (a second one gets "meşgul");
// - when a call starts, the room releases the mic seat and stops the room camera, but the user stays in the room;
// - nothing is turned back on automatically when the call ends.
// In production the same arbitration runs in the realtime/media service (e.g. LiveKit) and on the server.
import { useSyncExternalStore } from 'react';

export type RoomMedia = { roomId: string; title: string; seated: boolean; micOn: boolean; camOn: boolean };
export type CallKind = 'match' | 'direct';
export type ActiveCall = { kind: CallKind; mode: 'voice' | 'video'; peerId: string; since: number };
type State = { room: RoomMedia | null; call: ActiveCall | null };

let state: State = { room: null, call: null };
const listeners = new Set<() => void>();
const emit = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

export const getMedia = () => state;
export function useMedia() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getMedia,
    getMedia,
  );
}

/** Rooms call this whenever my seat, mic or camera changes. */
export function reportRoom(room: RoomMedia) {
  const cur = state.room;
  if (cur && cur.roomId === room.roomId && cur.seated === room.seated && cur.micOn === room.micOn && cur.camOn === room.camOn && cur.title === room.title) return;
  emit({ ...state, room });
}
/** Leaving a room (screen closed) drops only the room part; an active call is untouched. */
export function leaveRoom(roomId: string) {
  if (state.room?.roomId === roomId) emit({ ...state, room: null });
}

export type Claim = { ok: true } | { ok: false; reason: string };
/** Claims mic (and camera for video) for a one-to-one call. Fails when another call already holds them. */
export function beginCall(call: Omit<ActiveCall, 'since'>): Claim {
  if (state.call) return { ok: false, reason: state.call.kind === 'match' ? 'Zaten bir Hemen Tanış görüşmesindesin.' : 'Zaten bire bir bir görüşmedesin.' };
  emit({ ...state, call: { ...call, since: Date.now() } });
  return { ok: true };
}
export function endCall(peerId?: string) {
  if (!state.call || (peerId && state.call.peerId !== peerId)) return;
  emit({ ...state, call: null });
}
export const inCall = () => !!state.call;

/** Shown when a room control is used while a call holds the devices. */
export const BUSY_DEVICES = 'Bire bir görüşmen sürüyor. Mikrofon ve kamera şu an o görüşmede; görüşme bitince yeniden mikrofon isteyebilir veya kameranı açabilirsin.';
