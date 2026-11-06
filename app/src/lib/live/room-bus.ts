// Live room bus (lib/live): what the voice connection (lib/livekit-engine) knows about the other phones in the
// room, for the room screen. Kept apart from LiveKit itself so the room screen and the tests don't load it.
//
//  - peers: everyone else connected to the room's voice, with the mic they sit on (their own `seat` participant
//    attribute: set by their phone, or by the server when the owner or an admin moves them) and whether they
//    are talking right now;
//  - signals: small messages inside the room. They are not stored anywhere: whoever is in the room sees them, a
//    later joiner doesn't. The phones send each other chat lines only. A gift is announced by the server after
//    it is paid (server/api/gifts.mjs, LiveKit SendData: a packet with no sending participant), so no phone can
//    fake one; a gift packet from a phone is dropped. The server also says when a PK starts or is cancelled
//    (server/api/pk.mjs): only "read the PK again", which lib/live/pk does;
//  - the room's state the server keeps on LiveKit: locked mics (room metadata, server/api/rooms.mjs) and a seat
//    the owner or an admin set for me (my own `seat` attribute changed by the server).
import { useSyncExternalStore } from 'react';

export type LivePeer = { identity: string; name: string; seat: number | null; speaking: boolean };
/** What one phone may send the others. */
export type PeerSignal = { t: 'chat'; text: string };
/** A gift the server announced: `from` and `to` are server user ids, `eventId` its gift_events row. */
export type GiftSignal = { t: 'gift'; giftId: string; count: number; to: string[]; eventId: number };
export type RoomSignal = PeerSignal | GiftSignal;

/** `send` is false when the voice connection isn't up and nothing went out. */
type Link = { setSeat: (seat: number | null) => void; send: (msg: PeerSignal) => boolean };
type Snapshot = { roomId: string | null; peers: LivePeer[]; meSpeaking: boolean; lockedSeats: number[] };

const EMPTY: Snapshot = { roomId: null, peers: [], meSpeaking: false, lockedSeats: [] };
let snap: Snapshot = EMPTY;
let link: Link | null = null;
const listeners = new Set<() => void>();
const signalListeners = new Set<(roomId: string, from: string, msg: RoomSignal) => void>();
const seatListeners = new Set<(roomId: string, seat: number | null) => void>();
const pkListeners = new Set<(roomId: string) => void>();
// Gift announcements already shown (a reliable packet can come twice around a reconnect).
const seenGifts: number[] = [];

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
  // The locks belong to the room: a new list of people keeps them, another room starts without.
  snap = roomId ? { roomId, peers, meSpeaking, lockedSeats: snap.roomId === roomId ? snap.lockedSeats : [] } : EMPTY;
  listeners.forEach((l) => l());
}

/** The room's LiveKit metadata changed (or we just joined): the mics the owner or an admin locked. */
export function reportRoomMeta(roomId: string, metadata: string | undefined) {
  const lockedSeats = parseRoomMeta(metadata);
  if (snap.roomId === roomId && snap.lockedSeats.join() === lockedSeats.join()) return;
  snap = { ...(snap.roomId === roomId ? snap : { ...EMPTY, roomId }), lockedSeats };
  listeners.forEach((l) => l());
}

/** `{"lockedSeats":[2,5]}` → [2, 5]; mic 0 is the owner's and never locked; anything else → none. */
export function parseRoomMeta(metadata: string | undefined): number[] {
  try {
    const m = JSON.parse(metadata || '{}') as { lockedSeats?: unknown };
    if (!Array.isArray(m?.lockedSeats)) return [];
    return [...new Set(m.lockedSeats.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= 99))].sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/** The server moved me to another mic or took me off (my `seat` attribute, not written by this phone). */
export function reportServerSeat(roomId: string, seat: number | null) {
  seatListeners.forEach((l) => l(roomId, seat));
}

/**
 * A data packet in the room. `from` is the phone that sent it, or null when the server did: then only a paid
 * gift's announcement is taken (once per gift); from a phone only a chat line. Anything else is dropped here.
 */
export function reportSignal(roomId: string, from: string | null, raw: unknown) {
  if (from === null) {
    if (isServerPk(raw)) return pkListeners.forEach((l) => l(roomId));
    const g = parseServerGift(raw);
    if (!g || seenGifts.includes(g.msg.eventId)) return;
    seenGifts.push(g.msg.eventId);
    if (seenGifts.length > 200) seenGifts.shift();
    signalListeners.forEach((l) => l(roomId, g.from, g.msg));
    return;
  }
  const msg = parseSignal(raw);
  if (msg) signalListeners.forEach((l) => l(roomId, from, msg));
}

/** What a phone may send: a chat line. A "gift" from a phone is never shown (only the server announces one). */
export function parseSignal(raw: unknown): PeerSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t === 'chat' && typeof m.text === 'string' && m.text.trim()) return { t: 'chat', text: m.text.slice(0, 300) };
  return null;
}

/** The server's gift packet: `{ type: 'gift', giftId, count, from, to, eventId }` (server/api/gifts.mjs). */
export function parseServerGift(raw: unknown): { from: string; msg: GiftSignal } | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== 'gift' || typeof m.giftId !== 'string' || typeof m.from !== 'string' || typeof m.to !== 'string' || !m.from || !m.to) return null;
  if (!Number.isInteger(m.count) || (m.count as number) <= 0 || (m.count as number) > 10_000) return null;
  if (!Number.isSafeInteger(m.eventId) || (m.eventId as number) <= 0) return null;
  return { from: m.from, msg: { t: 'gift', giftId: m.giftId.slice(0, 32), count: m.count as number, to: [m.to], eventId: m.eventId as number } };
}

/** The server's PK packet: a PK started or was cancelled in the room (server/api/pk.mjs); read it from the server. */
export const isServerPk = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'pk';

/** "3" → 3; anything else (no attribute, "") → not on a mic. */
export const parseSeat = (v: string | undefined) => (v && /^\d{1,2}$/.test(v) ? Number(v) : null);

// --- Room screen side -------------------------------------------------------------------------------
/** What the voice connection shows of this room right now (empty while connecting or in another room). */
export const getLivePeers = (roomId: string): Snapshot => (snap.roomId === roomId ? snap : EMPTY);
/** The other phones in this room's voice connection and its locked mics, as a hook. */
export function useLivePeers(roomId: string): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => getLivePeers(roomId),
    () => EMPTY,
  );
}
/** Signals in this room (chat from the phones, gifts from the server); returns the unsubscribe. */
export function onSignal(roomId: string, fn: (from: string, msg: RoomSignal) => void) {
  const l = (r: string, from: string, msg: RoomSignal) => r === roomId && fn(from, msg);
  signalListeners.add(l);
  return () => void signalListeners.delete(l);
}
/** The server set my mic in this room (null = took me off); returns the unsubscribe. */
export function onServerSeat(roomId: string, fn: (seat: number | null) => void) {
  const l = (r: string, seat: number | null) => r === roomId && fn(seat);
  seatListeners.add(l);
  return () => void seatListeners.delete(l);
}
/** The server announced a PK change in this room (lib/live/pk reads it again); returns the unsubscribe. */
export function onServerPk(roomId: string, fn: () => void) {
  const l = (r: string) => r === roomId && fn();
  pkListeners.add(l);
  return () => void pkListeners.delete(l);
}
/** Shows the other phones which mic I sit on (null = Güverte). Kept across reconnects by the engine. */
export const publishSeat = (seat: number | null) => link?.setSeat(seat);
/** False when it could not go out (no voice connection yet, or it dropped). */
export const sendSignal = (msg: PeerSignal) => link?.send(msg) ?? false;

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
