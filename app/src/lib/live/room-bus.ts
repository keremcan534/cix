// Live room bus (lib/live): what the voice connection (lib/livekit-engine) knows about the other phones in the
// room, for the room screen. Kept apart from LiveKit itself so the room screen and the tests don't load it.
//
//  - peers: everyone else connected to the room's voice, with the mic they sit on (their own `seat` participant
//    attribute: set by their phone, or by the server when the owner or an admin moves them), whether their mic
//    is on (their LiveKit microphone track, muted when they switch it off) and whether they are talking right now;
//  - signals: small messages inside the room. They are not stored anywhere: whoever is in the room sees them, a
//    later joiner doesn't. The phones send each other chat lines, the emoji over their own seat, a Hamle
//    (lib/room-moves: a kiss or a punch to the next mic, the dice, Taş Kağıt Makas) and the free Hareketli reactions. A gift is announced by the server after it is paid (server/api/gifts.mjs, LiveKit
//    SendData: a packet with no sending participant), so no phone can fake one; a gift packet from a phone is
//    dropped. A paid Hareketli is announced the same way (server/api/room-fx.mjs: 'fx'); the room screen plays a
//    phone's own 'anim' only when its catalog says that animation is free. The server also says when a PK starts or is cancelled
//    (server/api/pk.mjs): only "read the PK again", which lib/live/pk does; and when a Şanslı çanta is dropped
//    (server/api/lucky-bags.mjs): "read the room's bags again" (lib/live/lucky-bags); and when a mic invite was sent
//    or answered, or the room poll changed (server/api/room-social.mjs): "read it again" (lib/live/room-social); and
//    when the room's game table changed (server/api/room-games.mjs): "read it again" (lib/live/room-table);
//  - the room's state the server keeps on LiveKit: the room metadata (server/api/rooms.mjs pushRoomMeta: locked
//    mics, the layout, the mic count, the mic queue and who waits in it, the room's music: server/api/music.mjs),
//    which LiveKit hands every phone on join and on each change, and a seat the owner or an admin set for me (my
//    own `seat` attribute changed by the server).
import { useSyncExternalStore } from 'react';

import { parseMove, type Move } from '@/lib/room-moves';

export type LivePeer = { identity: string; name: string; seat: number | null; speaking: boolean; micOn: boolean };
/** What one phone may send the others: a chat line, an emoji or sticker over its own seat, a free Hareketli. */
export type PeerSignal =
  | { t: 'chat'; text: string }
  | { t: 'react'; emoji: string }
  /** A Hamle (lib/room-moves): a kiss or a punch to the mic beside the sender's, the dice, Taş Kağıt Makas. */
  | ({ t: 'act' } & Move)
  | { t: 'anim'; animationId: string }
  /** Soru-cevap: a listener's question, and the staff's pick (the room screen takes a pick only from its staff). */
  | { t: 'q'; id: string; text: string }
  | { t: 'qpick'; id: string };
/** A paid Hareketli the server announced (server/api/room-fx.mjs): `eventId` its room_animations row. */
export type FxSignal = { t: 'fx'; animationId: string; eventId: number };
/** A gift the server announced: `from` and `to` are server user ids, `eventId` its gift_events row. */
export type GiftSignal = { t: 'gift'; giftId: string; count: number; to: string[]; eventId: number };
/**
 * An Uğurlu send the server announced (server/api/lucky.mjs): `count` of the package to each of `to`; `best` the
 * highest multiplier drawn and `bigWin` its reward when the room is told about it (0 otherwise). The name and
 * emoji come along, so a phone that never opened the Uğurlu shelf still draws it.
 */
export type LuckySignal = { t: 'lucky'; giftId: string; name: string; emoji: string; count: number; to: string[]; eventId: number; best: number; bigWin: number };
export type RoomSignal = PeerSignal | GiftSignal | LuckySignal | FxSignal;

/** `send` is false when the voice connection isn't up and nothing went out. */
type Link = { setSeat: (seat: number | null) => void; send: (msg: PeerSignal) => boolean };
/**
 * What the server wrote in the room metadata besides the locks: the layout (null = classic grid), the classic
 * mic count (null = the level's most), whether the mic queue is on and who waits in it (server user ids, first
 * asked first). Null when the metadata has none of it (an older server, or nothing written yet).
 */
export type RoomState = { layoutId: string | null; micCount: number | null; micQueue: boolean; queue: string[]; music: RoomMusic | null };
/** A track in the room's music queue: `key` its place in the queue, `by` who added it (server user id). */
export type QueueTrack = { key: string; title: string; url: string; seconds: number; by: string; byName: string };
/**
 * The room's music (server/api/music.mjs): tracks[0] plays from `startedAt` (server ms, pauses taken out), the rest
 * wait in order; `pausedAt` is when it was paused (null: playing). Both null when the queue is empty.
 */
export type RoomMusic = { tracks: QueueTrack[]; startedAt: number | null; pausedAt: number | null };
type Snapshot = { roomId: string | null; peers: LivePeer[]; meSpeaking: boolean; lockedSeats: number[]; state: RoomState | null };

const EMPTY: Snapshot = { roomId: null, peers: [], meSpeaking: false, lockedSeats: [], state: null };
let snap: Snapshot = EMPTY;
let link: Link | null = null;
const listeners = new Set<() => void>();
const signalListeners = new Set<(roomId: string, from: string, msg: RoomSignal) => void>();
const seatListeners = new Set<(roomId: string, seat: number | null) => void>();
const pkListeners = new Set<(roomId: string) => void>();
const roomListeners = new Set<(roomId: string) => void>();
/** A bag packet: which bag, and whether it is the draw's (the bag was just drawn) rather than a new bag. */
export type BagNews = { id: number | null; drawn: boolean };
const bagListeners = new Set<(roomId: string, news: BagNews) => void>();
/** A mic invite packet: who it is for and from (server user ids; null when several ended at once). */
export type InviteNews = { to: string | null; from: string | null };
const inviteListeners = new Set<(roomId: string, news: InviteNews) => void>();
const pollListeners = new Set<(roomId: string) => void>();
const tableListeners = new Set<(roomId: string) => void>();
// Gift announcements already shown (a reliable packet can come twice around a reconnect).
const seenGifts: number[] = [];
// The same for paid Hareketli (their own ids: a room_animations row, not a gift_events one).
const seenFx: number[] = [];

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
    snap.peers.every((p, i) => p.identity === peers[i].identity && p.seat === peers[i].seat && p.speaking === peers[i].speaking && p.micOn === peers[i].micOn && p.name === peers[i].name);
  if (same) return;
  // The locks belong to the room: a new list of people keeps them, another room starts without.
  const sameRoom = snap.roomId === roomId;
  snap = roomId ? { roomId, peers, meSpeaking, lockedSeats: sameRoom ? snap.lockedSeats : [], state: sameRoom ? snap.state : null } : EMPTY;
  listeners.forEach((l) => l());
}

/** The room's LiveKit metadata changed (or we just joined): locked mics, layout, mic count, mic queue. */
export function reportRoomMeta(roomId: string, metadata: string | undefined) {
  const lockedSeats = parseRoomMeta(metadata);
  const state = parseRoomState(metadata);
  if (snap.roomId === roomId && snap.lockedSeats.join() === lockedSeats.join() && JSON.stringify(snap.state) === JSON.stringify(state)) return;
  snap = { ...(snap.roomId === roomId ? snap : { ...EMPTY, roomId }), lockedSeats, state };
  listeners.forEach((l) => l());
}

/** The rest of the metadata (RoomState); null unless `micQueue` is there (the server writes all of it at once). */
export function parseRoomState(metadata: string | undefined): RoomState | null {
  try {
    const m = JSON.parse(metadata || '{}') as Record<string, unknown> | null;
    if (!m || typeof m !== 'object' || typeof m.micQueue !== 'boolean') return null;
    const layoutId = typeof m.layoutId === 'string' && m.layoutId.length <= 40 ? m.layoutId : null;
    const micCount = Number.isInteger(m.micCount) && (m.micCount as number) >= 1 && (m.micCount as number) <= 99 ? (m.micCount as number) : null;
    const queue = Array.isArray(m.queue) ? [...new Set(m.queue.filter((x): x is string => typeof x === 'string' && !!x && x.length <= 64))].slice(0, 50) : [];
    return { layoutId, micCount, micQueue: m.micQueue, queue, music: parseMusic(m.music) };
  } catch {
    return null;
  }
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);
const stamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
/** The music the server wrote (metadata or an API answer); null when there is none. Odd tracks are left out. */
export function parseMusic(raw: unknown): RoomMusic | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!Array.isArray(m.tracks)) return null;
  const tracks: QueueTrack[] = [];
  for (const t of m.tracks.slice(0, 20) as Record<string, unknown>[]) {
    if (!t || typeof t !== 'object') continue;
    const key = text(t.key, 18);
    const title = text(t.title, 80);
    const url = text(t.url, 500);
    const seconds = Number.isInteger(t.seconds) && (t.seconds as number) >= 5 && (t.seconds as number) <= 1200 ? (t.seconds as number) : null;
    if (!key || !/^\d+$/.test(key) || !title || !url || !url.startsWith('https://') || !seconds) continue;
    tracks.push({ key, title, url, seconds, by: text(t.by, 64) ?? '', byName: text(t.byName, 80) ?? '' });
  }
  const startedAt = tracks.length ? stamp(m.startedAt) : null;
  return { tracks, startedAt, pausedAt: startedAt === null ? null : stamp(m.pausedAt) };
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
    if (isServerRoom(raw)) return roomListeners.forEach((l) => l(roomId));
    // A mic invite was sent or answered, the room poll changed (server/api/room-social.mjs): read it again.
    if (isServerInvite(raw)) {
      const p = raw as Record<string, unknown>;
      const id = (v: unknown) => (typeof v === 'string' && v.length <= 64 ? v : null);
      const news: InviteNews = { to: id(p.to), from: id(p.from) };
      return inviteListeners.forEach((l) => l(roomId, news));
    }
    if (isServerPoll(raw)) return pollListeners.forEach((l) => l(roomId));
    // The room's game table changed (server/api/room-games.mjs): read it again (lib/live/room-table).
    if (isServerTable(raw)) return tableListeners.forEach((l) => l(roomId));
    if (isServerBag(raw)) {
      const p = raw as Record<string, unknown>;
      const news: BagNews = { id: typeof p.id === 'number' && Number.isSafeInteger(p.id) ? p.id : null, drawn: p.drawn === true };
      return bagListeners.forEach((l) => l(roomId, news));
    }
    const fx = parseServerFx(raw);
    if (fx) {
      if (seenFx.includes(fx.msg.eventId)) return;
      seenFx.push(fx.msg.eventId);
      if (seenFx.length > 200) seenFx.shift();
      signalListeners.forEach((l) => l(roomId, fx.from, fx.msg));
      return;
    }
    const g = parseServerGift(raw) ?? parseServerLucky(raw);
    if (!g || seenGifts.includes(g.msg.eventId)) return;
    seenGifts.push(g.msg.eventId);
    if (seenGifts.length > 200) seenGifts.shift();
    signalListeners.forEach((l) => l(roomId, g.from, g.msg));
    return;
  }
  const msg = parseSignal(raw);
  if (msg) signalListeners.forEach((l) => l(roomId, from, msg));
}

/**
 * What a phone may send: a chat line, a seat emoji, a Hareketli id. A "gift" or a paid "fx" from a phone is never
 * shown (only the server announces those). Only the shape is checked here; the room screen shows a seat emoji only
 * from its own emoji and sticker lists, and an 'anim' only when its catalog says it is free.
 */
export function parseSignal(raw: unknown): PeerSignal | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.t === 'chat' && typeof m.text === 'string' && m.text.trim()) return { t: 'chat', text: m.text.slice(0, 300) };
  if (m.t === 'react' && typeof m.emoji === 'string' && m.emoji.trim() && m.emoji.length <= 40) return { t: 'react', emoji: m.emoji };
  if (m.t === 'anim' && typeof m.animationId === 'string' && /^[a-z0-9-]{1,40}$/.test(m.animationId)) return { t: 'anim', animationId: m.animationId };
  if (m.t === 'act') {
    const move = parseMove(m);
    return move ? { t: 'act', ...move } : null;
  }
  const qid = typeof m.id === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(m.id) ? m.id : null;
  if (m.t === 'q' && qid && typeof m.text === 'string' && m.text.trim()) return { t: 'q', id: qid, text: m.text.slice(0, 200) };
  if (m.t === 'qpick' && qid) return { t: 'qpick', id: qid };
  return null;
}

/** The server's paid Hareketli packet: `{ type: 'anim', animationId, from, eventId }` (server/api/room-fx.mjs). */
export function parseServerFx(raw: unknown): { from: string; msg: FxSignal } | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== 'anim' || typeof m.animationId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(m.animationId)) return null;
  if (typeof m.from !== 'string' || !m.from || !Number.isSafeInteger(m.eventId) || (m.eventId as number) <= 0) return null;
  return { from: m.from, msg: { t: 'fx', animationId: m.animationId, eventId: m.eventId as number } };
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

/** The server's Uğurlu packet: `{ type: 'lucky', giftId, name, emoji, count, from, to: [ids], eventIds, best, bigWin }`. */
export function parseServerLucky(raw: unknown): { from: string; msg: LuckySignal } | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.type !== 'lucky' || typeof m.giftId !== 'string' || typeof m.from !== 'string' || !m.from) return null;
  if (typeof m.name !== 'string' || typeof m.emoji !== 'string') return null;
  if (!Array.isArray(m.to) || !m.to.length || m.to.length > 20 || !m.to.every((t) => typeof t === 'string' && t)) return null;
  if (!Number.isInteger(m.count) || (m.count as number) <= 0 || (m.count as number) > 10_000) return null;
  const ids = Array.isArray(m.eventIds) ? m.eventIds : [];
  if (!ids.length || !ids.every((x) => Number.isSafeInteger(x) && (x as number) > 0)) return null;
  const n = (v: unknown) => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  return {
    from: m.from,
    msg: { t: 'lucky', giftId: m.giftId.slice(0, 32), name: m.name.slice(0, 30), emoji: m.emoji.slice(0, 8), count: m.count as number, to: m.to as string[], eventId: ids[0] as number, best: n(m.best), bigWin: n(m.bigWin) },
  };
}

/** The server's PK packet: a PK started or was cancelled in the room (server/api/pk.mjs); read it from the server. */
export const isServerPk = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'pk';
/** The server's room packet: the room's level, mics or layout changed (server/api/rooms.mjs, gifts.mjs, admin.mjs);
 *  read the room from the server. */
export const isServerRoom = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'room';
/** The server's bag packet: someone dropped a Şanslı çanta in the room (server/api/lucky-bags.mjs); read the bags. */
export const isServerBag = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'bag';

/** The server's mic invite packet (server/api/room-social.mjs): an invite in the room was sent or answered. */
export const isServerInvite = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'invite';
/** The server's poll packet (server/api/room-social.mjs): the room's poll started, got votes or ended. */
export const isServerPoll = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'poll';
/** The server's table packet (server/api/room-games.mjs): the room's game table opened, changed or closed. */
export const isServerTable = (raw: unknown) => !!raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'table';

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
/** The server says this room changed (level, mics, layout); returns the unsubscribe. */
export function onServerRoom(roomId: string, fn: () => void) {
  const l = (r: string) => r === roomId && fn();
  roomListeners.add(l);
  return () => void roomListeners.delete(l);
}
/** The server says a bag was dropped in this room, or drawn (news.drawn); returns the unsubscribe. */
export function onServerBag(roomId: string, fn: (news: BagNews) => void) {
  const l = (r: string, news: BagNews) => r === roomId && fn(news);
  bagListeners.add(l);
  return () => void bagListeners.delete(l);
}
/** The server says a mic invite in this room was sent or answered; returns the unsubscribe. */
export function onServerInvite(roomId: string, fn: (news: InviteNews) => void) {
  const l = (r: string, news: InviteNews) => r === roomId && fn(news);
  inviteListeners.add(l);
  return () => void inviteListeners.delete(l);
}
/** The server says the room's poll changed; returns the unsubscribe. */
export function onServerPoll(roomId: string, fn: () => void) {
  const l = (r: string) => r === roomId && fn();
  pollListeners.add(l);
  return () => void pollListeners.delete(l);
}
/** The server says the room's game table changed; returns the unsubscribe. */
export function onServerTable(roomId: string, fn: () => void) {
  const l = (r: string) => r === roomId && fn();
  tableListeners.add(l);
  return () => void tableListeners.delete(l);
}
/** Shows the other phones which mic I sit on (null = Balkon). Kept across reconnects by the engine. */
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
