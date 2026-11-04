// Live room bus (lib/live): what the voice connection (lib/livekit-engine) knows about the other phones in the
// room, for the room screen. Kept apart from LiveKit itself so the room screen and the tests don't load it.
//
//  - peers: everyone else connected to the room's voice, with the mic they sit on (their own `seat` participant
//    attribute, which only they can set) and whether they are talking right now;
//  - signals: small messages the phones send each other inside the room (chat lines, gift animations). They
//    are not stored anywhere: whoever is in the room sees them, a later joiner doesn't. Money never moves
//    through a signal: a gift is paid on the server first (lib/live liveGift) and only announced here.
import { useSyncExternalStore } from 'react';

export type LivePeer = { identity: string; name: string; seat: number | null; speaking: boolean };
export type RoomSignal = { t: 'chat'; text: string } | { t: 'gift'; giftId: string; count: number; to: string[] };

/** `send` is false when the voice connection isn't up and nothing went out. */
type Link = { setSeat: (seat: number | null) => void; send: (msg: RoomSignal) => boolean };
type Snapshot = { roomId: string | null; peers: LivePeer[]; meSpeaking: boolean };

const EMPTY: Snapshot = { roomId: null, peers: [], meSpeaking: false };
let snap: Snapshot = EMPTY;
let link: Link | null = null;
const listeners = new Set<() => void>();
const signalListeners = new Set<(roomId: string, from: string, msg: RoomSignal) => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

// --- Engine side ------------------------------------------------------------------------------------
/** The voice engine says how to set my mic attribute and send a signal (null when no LiveKit engine). */
export const bindLink = (l: Link | null) => void (link = l);

/** Who is connected right now (my own talking indicator included). `roomId` null = not in a room. */
export function reportPeers(roomId: string | null, peers: LivePeer[], meSpeaking = false) {
  const same =
    snap.roomId === roomId &&
    snap.meSpeaking === meSpeaking &&
    snap.peers.length === peers.length &&
    snap.peers.every((p, i) => p.identity === peers[i].identity && p.seat === peers[i].seat && p.speaking === peers[i].speaking && p.name === peers[i].name);
  if (same) return;
  snap = roomId ? { roomId, peers, meSpeaking } : EMPTY;
  listeners.forEach((l) => l());
}

/** A signal another phone sent; anything malformed is dropped here. */
export function reportSignal(roomId: string, from: string, raw: unknown) {
  const msg = parseSignal(raw);
  if (msg) signalListeners.forEach((l) => l(roomId, from, msg));
}

export function parseSignal(raw: unknown): RoomSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t === 'chat' && typeof m.text === 'string' && m.text.trim()) return { t: 'chat', text: m.text.slice(0, 300) };
  if (m.t === 'gift' && typeof m.giftId === 'string' && Number.isInteger(m.count) && Array.isArray(m.to)) {
    const to = m.to.filter((x): x is string => typeof x === 'string').slice(0, 20);
    if (to.length && (m.count as number) > 0 && (m.count as number) <= 10_000) return { t: 'gift', giftId: m.giftId.slice(0, 32), count: m.count as number, to };
  }
  return null;
}

/** "3" → 3; anything else (no attribute, "") → not on a mic. */
export const parseSeat = (v: string | undefined) => (v && /^\d{1,2}$/.test(v) ? Number(v) : null);

// --- Room screen side -------------------------------------------------------------------------------
const peersOf = (roomId: string) => (snap.roomId === roomId ? snap : EMPTY);
/** The other phones in this room's voice connection (empty while connecting or in another room). */
export function useLivePeers(roomId: string): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => peersOf(roomId),
    () => EMPTY,
  );
}
/** Signals sent in this room; returns the unsubscribe. */
export function onSignal(roomId: string, fn: (from: string, msg: RoomSignal) => void) {
  const l = (r: string, from: string, msg: RoomSignal) => r === roomId && fn(from, msg);
  signalListeners.add(l);
  return () => void signalListeners.delete(l);
}
/** Shows the other phones which mic I sit on (null = Güverte). Kept across reconnects by the engine. */
export const publishSeat = (seat: number | null) => link?.setSeat(seat);
/** False when it could not go out (no voice connection yet, or it dropped). */
export const sendSignal = (msg: RoomSignal) => link?.send(msg) ?? false;

// --- Wire format ------------------------------------------------------------------------------------
// UTF-8 by hand: Turkish letters must survive, and not every phone JavaScript engine has TextEncoder/TextDecoder.
export function encodeSignal(msg: RoomSignal) {
  const s = JSON.stringify(msg);
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
// A broken or hostile packet (bad bytes, a code point out of range) gives null instead of throwing in the room.
export function decodeSignal(bytes: Uint8Array): unknown {
  try {
    let s = '';
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i++];
      let c: number;
      if (b < 0x80) c = b;
      else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
      else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      else c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      s += String.fromCodePoint(c);
    }
    return JSON.parse(s);
  } catch {
    return null;
  }
}
