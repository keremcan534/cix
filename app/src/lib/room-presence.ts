// Room presence server stand-in ("oda katılımcı durumu"). One model per room: who is in the room (unique
// user ids, join order) and who sits on which mic. Mic users, Balkon users and the total are all derived
// from this single model, so the counters can never disagree. Joins and leaves carry event ids and are
// applied once. Moderation (kick, mic mute, take off mic) and mic invites are validated here against the
// room roles, never only in the UI.
//
// The viewer's connection is simulated too: while offline the client keeps showing the snapshot it had
// when the connection dropped (marked as stale) and the server keeps changing; reconnecting resyncs.
import { useState, useSyncExternalStore } from 'react';

import { guestId } from '@/data/mock';

export type Role = 'owner' | 'admin' | 'member';
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'failed' | 'cancelled';
export type MicInvite = { id: string; roomId: string; fromId: string; toId: string; seat?: number; status: InviteStatus; at: number; expiresAt: number; note?: string };

export type RoomLive = {
  roomId: string;
  /** Unique user ids in the room, in join order (mic users included). */
  members: string[];
  /** Invisible entry: not listed or counted while on the Balkon (still listed once on a mic). */
  hidden: string[];
  seats: (string | null)[];
  locked: number[];
  /** Mic switched off by a moderator (different from someone's own mic toggle). */
  micMuted: string[];
  /** userId → ban end (ms). Infinity = room blacklist. */
  bans: Record<string, number>;
  ownerId: string;
  adminIds: string[];
  invites: MicInvite[];
  version: number;
};
export type PresenceAudit = { id: string; at: number; roomId: string; actor: string; action: string; target: string; note?: string };
export type Connection = 'online' | 'offline';
/** Demo switch for how invited people (other than you) answer a mic invite. */
export type InviteAnswer = 'random' | 'accept' | 'decline' | 'timeout';
type State = { rooms: Record<string, RoomLive>; frozen: Record<string, RoomLive> | null; connection: Connection; duplicates: number; audit: PresenceAudit[]; inviteAnswer: InviteAnswer };

export const INVITE_TTL_MS = 30_000;
export const INVITE_COOLDOWN_MS = 20_000;
export const KICK_BAN_MIN = 10;

let state: State = { rooms: {}, frozen: null, connection: 'online', duplicates: 0, audit: [], inviteAnswer: 'random' };
const listeners = new Set<() => void>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getPresence = () => state;
export const getRoom = (roomId: string): RoomLive | undefined => state.rooms[roomId];

const seenEvents = new Map<string, Set<string>>();
const guestSeq = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const rid = () => Math.random().toString(36).slice(2, 10);

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string; duplicate?: boolean };
const fail = (reason: string, duplicate?: boolean): { ok: false; reason: string; duplicate?: boolean } => ({ ok: false, reason, duplicate });

function put(r: RoomLive) {
  emit({ rooms: { ...state.rooms, [r.roomId]: { ...r, version: r.version + 1 } } });
}
function log(roomId: string, actor: string, action: string, target: string, note?: string) {
  emit({ audit: [{ id: rid(), at: Date.now(), roomId, actor, action, target, note }, ...state.audit].slice(0, 300) });
}
/** Event dedupe: the same event id is applied once per room, however many times it is delivered. */
function firstTime(roomId: string, eventId?: string) {
  if (!eventId) return true;
  const seen = seenEvents.get(roomId) ?? new Set<string>();
  seenEvents.set(roomId, seen);
  if (seen.has(eventId)) {
    emit({ duplicates: state.duplicates + 1 });
    return false;
  }
  seen.add(eventId);
  if (seen.size > 5000) seen.delete(seen.values().next().value as string);
  return true;
}

// --- Derived counts (the one place they are computed) ----------------------------------------------
export type RoomView = { total: number; mic: number; balcony: number; micIds: string[]; balconyIds: string[] };
export function deriveView(r: RoomLive): RoomView {
  const inRoom = new Set(r.members);
  const micIds = [...new Set(r.seats.filter((s): s is string => !!s && inRoom.has(s)))];
  const onMic = new Set(micIds);
  const hidden = new Set(r.hidden);
  const balconyIds = r.members.filter((m) => !onMic.has(m) && !hidden.has(m));
  return { total: micIds.length + balconyIds.length, mic: micIds.length, balcony: balconyIds.length, micIds, balconyIds };
}
export const roleIn = (r: RoomLive, uid: string): Role => (uid === r.ownerId ? 'owner' : r.adminIds.includes(uid) ? 'admin' : 'member');
export const isOnMic = (r: RoomLive | undefined, uid: string) => !!r && r.members.includes(uid) && r.seats.includes(uid);
export const banLeft = (r: RoomLive, uid: string, now = Date.now()) => Math.max(0, (r.bans[uid] ?? 0) - now);
/** Server-side lookup used by other services (PK): is this user on a mic in that room right now? */
export const onMicNow = (roomId: string, uid: string) => isOnMic(state.rooms[roomId], uid);
export const micUsersOf = (roomId: string) => (state.rooms[roomId] ? deriveView(state.rooms[roomId]).micIds : []);
export const roleOf = (roomId: string, uid: string): Role => (state.rooms[roomId] ? roleIn(state.rooms[roomId], uid) : 'member');

// --- Room lifecycle --------------------------------------------------------------------------------
export type Seed = { ownerId: string; adminIds: string[]; seats: (string | null)[]; capacity: number; total: number; regulars: string[] };
/**
 * Creates the room's presence the first time anyone opens it (later visits find it as it is). The audience
 * is the seated people, then regular users, then guests until the room's listener count is reached.
 * Silent: called before the first render reads it.
 */
export function seedRoom(roomId: string, seed: Seed): RoomLive {
  const have = state.rooms[roomId];
  if (have) return have;
  const seats = Array.from({ length: seed.capacity }, (_, i) => seed.seats[i] ?? null);
  const members = [...new Set([...seats.filter((s): s is string => !!s), ...seed.regulars])];
  let n = 0;
  while (members.length < seed.total) members.push(guestId(roomId, ++n));
  guestSeq.set(roomId, n);
  const room: RoomLive = { roomId, members, hidden: [], seats, locked: [], micMuted: [], bans: {}, ownerId: seed.ownerId, adminIds: seed.adminIds, invites: [], version: 0 };
  state = { ...state, rooms: { ...state.rooms, [roomId]: room } };
  return room;
}
/** A brand-new person for simulated joins. */
export const newGuest = (roomId: string) => {
  const n = (guestSeq.get(roomId) ?? 0) + 1;
  guestSeq.set(roomId, n);
  return guestId(roomId, n);
};

export function setRoles(roomId: string, ownerId: string, adminIds: string[]) {
  const r = state.rooms[roomId];
  if (!r || (r.ownerId === ownerId && r.adminIds.join() === adminIds.join())) return;
  put({ ...r, ownerId, adminIds });
}
export function setLocks(roomId: string, locked: number[]) {
  const r = state.rooms[roomId];
  if (!r || r.locked.join() === locked.join()) return;
  put({ ...r, locked });
}
/** Mic count changed: people on removed mics go to the Balkon (they stay in the room). */
export function resize(roomId: string, capacity: number) {
  const r = state.rooms[roomId];
  if (!r || r.seats.length === capacity) return;
  put({ ...r, seats: Array.from({ length: capacity }, (_, i) => r.seats[i] ?? null) });
}

export function join(roomId: string, uid: string, opts: { eventId?: string; hidden?: boolean } = {}): Result {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  if (!firstTime(roomId, opts.eventId)) return fail('Bu olay zaten işlendi.', true);
  const left = banLeft(r, uid);
  if (left > 0) return fail(left === Infinity ? 'Bu odanın kara listesindesin.' : `Odaya giriş yasağı: ${Math.ceil(left / 60_000)} dk.`);
  const hidden = opts.hidden ? [...new Set([...r.hidden, uid])] : r.hidden.filter((x) => x !== uid);
  if (r.members.includes(uid)) {
    if (hidden.join() !== r.hidden.join()) put({ ...r, hidden });
    return { ok: true };
  }
  put({ ...r, members: [...r.members, uid], hidden });
  return { ok: true };
}

export function leave(roomId: string, uid: string, eventId?: string): Result {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  if (!firstTime(roomId, eventId)) return fail('Bu olay zaten işlendi.', true);
  if (!r.members.includes(uid)) return { ok: true };
  put(withoutUser(r, uid, 'Kişi odadan ayrıldı'));
  return { ok: true };
}
function withoutUser(r: RoomLive, uid: string, note: string): RoomLive {
  const invites = r.invites.map((i) => (i.status === 'pending' && (i.toId === uid || i.fromId === uid) ? { ...i, status: 'cancelled' as const, note } : i));
  return { ...r, members: r.members.filter((m) => m !== uid), seats: r.seats.map((s) => (s === uid ? null : s)), hidden: r.hidden.filter((h) => h !== uid), micMuted: r.micMuted.filter((m) => m !== uid), invites };
}

// --- Seats -----------------------------------------------------------------------------------------
export function takeSeat(roomId: string, uid: string, index: number): Result {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  if (!r.members.includes(uid)) return fail('Bu kişi artık odada değil.');
  if (index < 0 || index >= r.seats.length) return fail('Bu mikrofon yok.');
  if (r.locked.includes(index)) return fail('Bu mikrofon kilitli.');
  if (r.seats[index] === uid) return { ok: true };
  if (r.seats[index]) return fail('Bu mikrofon dolu.');
  put({ ...r, seats: r.seats.map((s, i) => (i === index ? uid : s === uid ? null : s)) });
  return { ok: true };
}
export function leaveSeat(roomId: string, uid: string) {
  const r = state.rooms[roomId];
  if (!r || !r.seats.includes(uid)) return;
  put({ ...r, seats: r.seats.map((s) => (s === uid ? null : s)) });
}
export const freeSeat = (r: RoomLive, preferred?: number) =>
  preferred !== undefined && preferred > 0 && preferred < r.seats.length && !r.seats[preferred] && !r.locked.includes(preferred)
    ? preferred
    : r.seats.findIndex((s, i) => i > 0 && !s && !r.locked.includes(i));

// --- Moderation (validated here) ------------------------------------------------------------------
function outranks(r: RoomLive, actorId: string, targetId: string): string | null {
  if (actorId === targetId) return 'Bu işlemi kendine uygulayamazsın.';
  const a = roleIn(r, actorId);
  const t = roleIn(r, targetId);
  if (a === 'member') return 'Bu işlem için oda sahibi veya yönetici olmalısın.';
  if (RANK[a] <= RANK[t]) return t === 'owner' ? 'Oda sahibine bu işlem uygulanamaz.' : 'Aynı veya üst role bu işlem uygulanamaz.';
  return null;
}
function denied(r: RoomLive, actorId: string, action: string, targetId: string, reason: string) {
  log(r.roomId, actorId, `Reddedildi: ${action}`, targetId, reason);
  return fail(reason);
}

/** Kick = leave + temporary re-entry ban (default 10 dk). `minutes: null` = room blacklist (permanent). */
export function kick(roomId: string, actorId: string, targetId: string, minutes: number | null = KICK_BAN_MIN): Result {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  const why = outranks(r, actorId, targetId);
  if (why) return denied(r, actorId, 'Odadan çıkarma', targetId, why);
  if (!r.members.includes(targetId) && minutes !== null) return fail('Bu kişi zaten odada değil.');
  const until = minutes === null ? Infinity : Date.now() + minutes * 60_000;
  put({ ...withoutUser(r, targetId, 'Kişi odadan çıkarıldı'), bans: { ...r.bans, [targetId]: until } });
  log(roomId, actorId, minutes === null ? 'Kara listeye ekledi' : 'Odadan çıkardı', targetId, minutes === null ? 'kalıcı' : `${minutes} dk giriş yasağı`);
  return { ok: true };
}
export function forceLeaveSeat(roomId: string, actorId: string, targetId: string): Result {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  const why = outranks(r, actorId, targetId);
  if (why) return denied(r, actorId, 'Mikrofondan indirme', targetId, why);
  if (!r.seats.includes(targetId)) return fail('Bu kişi mikrofonda değil.');
  put({ ...r, seats: r.seats.map((s) => (s === targetId ? null : s)) });
  log(roomId, actorId, 'Mikrofondan indirdi', targetId);
  return { ok: true };
}
/** Moderator mic mute: only someone on a mic has a mic to switch off. */
export function setMicMute(roomId: string, actorId: string, targetId: string, muted: boolean): Result {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  const why = outranks(r, actorId, targetId);
  if (why) return denied(r, actorId, muted ? 'Mikrofon susturma' : 'Mikrofon açma', targetId, why);
  if (muted && !isOnMic(r, targetId)) return fail('Bu kişi Balkon’da; susturulacak açık bir mikrofonu yok.');
  const micMuted = muted ? [...new Set([...r.micMuted, targetId])] : r.micMuted.filter((m) => m !== targetId);
  put({ ...r, micMuted });
  log(roomId, actorId, muted ? 'Mikrofonunu susturdu' : 'Mikrofonunu açtı', targetId);
  return { ok: true };
}

// --- Mic invites (the invited person decides) ----------------------------------------------------------
export function inviteToMic(roomId: string, actorId: string, targetId: string, seat?: number): Result<{ invite: MicInvite }> {
  const r = state.rooms[roomId];
  if (!r) return fail('Oda bulunamadı.');
  if (roleIn(r, actorId) === 'member') return denied(r, actorId, 'Mikrofon daveti', targetId, 'Mikrofon daveti için oda sahibi veya yönetici olmalısın.');
  if (actorId === targetId) return fail('Kendini davet edemezsin.');
  if (!r.members.includes(targetId)) return fail('Bu kişi artık odada değil.');
  if (isOnMic(r, targetId)) return fail('Bu kişi zaten mikrofonda.');
  const now = Date.now();
  if (r.invites.some((i) => i.toId === targetId && i.status === 'pending')) return fail('Bu kişiye davet gönderildi; yanıtı bekleniyor.');
  const last = r.invites.find((i) => i.toId === targetId);
  if (last && now - last.at < INVITE_COOLDOWN_MS) return fail(`Aynı kişiye yeniden davet için ${Math.ceil((INVITE_COOLDOWN_MS - (now - last.at)) / 1000)} sn bekle.`);
  if (freeSeat(r, seat) < 0) return fail('Boş mikrofon yok. Önce bir mikrofonu boşalt veya kilidini aç.');
  const invite: MicInvite = { id: `INV-${rid()}`, roomId, fromId: actorId, toId: targetId, seat, status: 'pending', at: now, expiresAt: now + INVITE_TTL_MS };
  put({ ...r, invites: [invite, ...r.invites].slice(0, 100) });
  log(roomId, actorId, 'Mikrofon daveti gönderdi', targetId);
  timers.set(invite.id, setTimeout(() => expireInvite(roomId, invite.id), INVITE_TTL_MS));
  if (targetId !== 'me') simulateAnswer(roomId, invite.id);
  return { ok: true, invite };
}
function setInvite(roomId: string, id: string, patch: Partial<MicInvite>) {
  const r = state.rooms[roomId];
  if (!r) return;
  put({ ...r, invites: r.invites.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}
function expireInvite(roomId: string, id: string) {
  timers.delete(id);
  const inv = state.rooms[roomId]?.invites.find((i) => i.id === id);
  if (inv?.status === 'pending') setInvite(roomId, id, { status: 'expired', note: 'Yanıt verilmedi' });
}
/** Only the invited person answers. Accepting takes a free mic at that moment; if none is left, nobody is seated. */
export function answerInvite(roomId: string, inviteId: string, answererId: string, accept: boolean): Result<{ seat?: number }> {
  const r = state.rooms[roomId];
  const inv = r?.invites.find((i) => i.id === inviteId);
  if (!r || !inv) return fail('Davet bulunamadı.');
  if (inv.toId !== answererId) return fail('Bu davet sana gönderilmedi.');
  if (inv.status !== 'pending') return fail(inv.status === 'expired' ? 'Davetin süresi doldu.' : 'Bu davet artık geçerli değil.');
  if (Date.now() >= inv.expiresAt) {
    setInvite(roomId, inviteId, { status: 'expired', note: 'Yanıt verilmedi' });
    return fail('Davetin süresi doldu.');
  }
  clearTimeout(timers.get(inviteId));
  timers.delete(inviteId);
  if (!accept) {
    setInvite(roomId, inviteId, { status: 'declined' });
    return { ok: true };
  }
  if (!r.members.includes(answererId)) {
    setInvite(roomId, inviteId, { status: 'cancelled', note: 'Kişi odada değil' });
    return fail('Odada değilsin.');
  }
  const seat = freeSeat(r, inv.seat);
  if (seat < 0) {
    setInvite(roomId, inviteId, { status: 'failed', note: 'Boş mikrofon kalmadı' });
    return fail('Boş mikrofon kalmadı; mikrofona geçilemedi.');
  }
  const taken = takeSeat(roomId, answererId, seat);
  if (!taken.ok) {
    setInvite(roomId, inviteId, { status: 'failed', note: taken.reason });
    return taken;
  }
  setInvite(roomId, inviteId, { status: 'accepted', seat });
  return { ok: true, seat };
}
export const setInviteAnswer = (inviteAnswer: InviteAnswer) => emit({ inviteAnswer });
function simulateAnswer(roomId: string, id: string) {
  const mode = state.inviteAnswer;
  const roll = Math.random();
  const answer = mode === 'random' ? (roll < 0.65 ? 'accept' : roll < 0.85 ? 'decline' : 'timeout') : mode;
  if (answer === 'timeout') return;
  setTimeout(() => {
    const inv = state.rooms[roomId]?.invites.find((i) => i.id === id);
    if (inv?.status === 'pending') answerInvite(roomId, id, inv.toId, answer === 'accept');
  }, 1500 + Math.random() * 1500);
}

// --- Viewer connection (simulated) --------------------------------------------------------------------
export function setConnection(connection: Connection) {
  if (connection === state.connection) return;
  emit({ connection, frozen: connection === 'offline' ? state.rooms : null });
}
export const isOnline = () => state.connection === 'online';

/** The room as this viewer sees it: live when online, the last received snapshot while offline. */
export function useRoomLive(roomId: string) {
  const s = useSyncExternalStore(subscribe, getPresence, getPresence);
  const offline = s.connection === 'offline';
  const room = (offline ? s.frozen?.[roomId] : undefined) ?? s.rooms[roomId];
  return { room, offline, presence: s };
}
/** Holds on to the last value received while connected; used for other realtime data (PK) the same way. */
export function useLatched<T>(value: T, frozen: boolean): T {
  const [latched, setLatched] = useState(value);
  if (!frozen && latched !== value) setLatched(value);
  return frozen ? latched : value;
}

/** Test support: forget all rooms. */
export function resetPresence() {
  timers.forEach(clearTimeout);
  timers.clear();
  seenEvents.clear();
  guestSeq.clear();
  state = { rooms: {}, frozen: null, connection: 'online', duplicates: 0, audit: [], inviteAnswer: 'random' };
}
