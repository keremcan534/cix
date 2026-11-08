// Live mode ("canlı mod"): when the app has a server address (EXPO_PUBLIC_API_URL, e.g. the test APK), what
// has to be shared between phones runs on our server (server/api): the account and profile, coin and diamond
// balances, test top-ups, gifts, Gelir locks, Çevir, rooms, direct messages and follows. Everything else keeps
// the local prototype state. Without a server address none of this runs and the app is the offline demo.
//
// Ids: on this phone the signed-in person is always 'me' (data/mock ME); everyone else from the server keeps
// their server id (a uuid), which data/mock userById / roomById resolve through putServerUser / putServerRoom.
//
// Balances: the store keeps the last balance the server sent. A new one is applied as the change since then, so
// a purchase the store already took locally (and mirrored with api.spend) is not taken twice. Local-only
// credits (task rewards, game wins) are not on the server: the next app start shows the server's balance.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { isServerId, putServerRoom, putServerUser, type Room, type User } from '@/data/mock';
import { liveRules, noteLiveRate, rateChangedMessage, refreshLiveCatalog } from '@/lib/live/catalog-live';
import { forgetRoomPasswords } from '@/lib/live/room-password';
import { replyOrder, unsureRefs } from '@/lib/live/requests';

export const liveMode = api.apiEnabled;
/**
 * The simulated calls and Hemen Tanış (a demo build: simulated peer, local per-minute charge). A live build has
 * its own, run by the server (liveCalls, lib/live/one-on-one).
 */
export const callsAvailable = () => !liveMode();
/** Real calls and Eşleşme: the server and the LiveKit address (the voice and video go through LiveKit). */
export const liveCalls = () => liveMode() && !!process.env.EXPO_PUBLIC_LIVEKIT_URL;
/** Calls and Hemen Tanış can be opened in this build (the demo's or the server's). */
export const oneOnOneOpen = () => callsAvailable() || liveCalls();

let myId: string | null = null;
/** My server id once signed in. */
export const myServerId = () => myId;
const accountListeners = new Set<() => void>();
/**
 * Called when this phone's server account changes: the first sign-in of a run, a sign-in as someone else, or a
 * sign-out (myServerId() is null then). lib/live/admin drops the role it read for the one before.
 */
export const onAccountChange = (l: () => void) => {
  accountListeners.add(l);
  return () => void accountListeners.delete(l);
};
const setMyId = (id: string | null) => {
  if (id === myId) return;
  myId = id;
  accountListeners.forEach((l) => l());
};
/** A server id as this phone names it: mine is 'me'. */
export const toLocal = (id: string) => (id === myId ? 'me' : id);
/** A local id as the server names it, or null for people who only exist in the demo (u1, gx-…). */
export const toServer = (id: string): string | null => (id === 'me' ? myId : isServerId(id) ? id : null);

// --- Wallet ----------------------------------------------------------------------------------------------
/**
 * `reason` names a change this phone asked for (for the wallet history); without it the change came from
 * elsewhere. `returned`: diamonds a rejected withdrawal gave back since the last balance (not a gift).
 */
type WalletHooks = { apply: (u: api.ServerUser, reason?: string, returned?: number) => void; locks: (e: api.ServerEarnings) => void };
let wallet: WalletHooks | null = null;
/** The store hands over how a server balance and the server's Gelir locks reach the screens. */
export const bindWallet = (h: WalletHooks) => void (wallet = h);
let lastDiamonds: number | null = null;
let returning = 0;
/** A rejected withdrawal (lib/live/withdraw) gave `n` diamonds back; the next balance carries them. */
export const expectReturn = (n: number) => void (returning += n);
const order = replyOrder();
/** `readAt`: a balance read's start number (order.begin); without it the reply is a money action's answer. */
const applied = <T extends { user: api.ServerUser }>(r: T, reason?: string, readAt?: number) => {
  setMyId(r.user.id);
  // A read that started before the last money answer holds an older balance: applying it would be a fake change.
  if (readAt !== undefined && order.stale(readAt)) return r;
  const returned = returning;
  returning = 0;
  wallet?.apply(r.user, reason, returned);
  // Diamonds moved (a gift came in, or Çevir): the Gelir locks changed with them.
  if (lastDiamonds !== null && r.user.diamonds !== lastDiamonds) void refreshEarnings().catch(() => {});
  lastDiamonds = r.user.diamonds;
  if (readAt === undefined) order.moneyApplied();
  return r;
};

/** A store purchase's server answer (lib/live/billing) reaches the wallet like every other live call. */
export const applyServerUser = (r: { user: api.ServerUser }, reason?: string) => void applied(r, reason);

export const TEST_PACKS = [1_000, 5_000, 10_000];
export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Signs in with this device (the server account is created the first time) and reads the balance. */
export async function liveSignIn(name: string) {
  const at = order.begin();
  const u = await api.ensureSignedIn(name);
  applied({ user: u }, undefined, at);
  // A new sign-in answers without the Cömertlik points (only GET /api/me counts them): read them now, so the
  // games the server allows don't stay hidden until the next refresh.
  if (u.wealthXp === undefined) void refreshWallet().catch(() => {});
  return u;
}

/** After the profile screen: the profile on the server, so other phones see the same name, age and city. */
export async function saveProfile(me: User, birthYear?: number) {
  await liveSignIn(me.name);
  const user = await api.updateProfile({
    name: me.name,
    ...(me.gender && { gender: me.gender }),
    // Only the year is asked; the server keeps a date (set once) for the 18+ check. The last day of the year,
    // so the age is never overstated (someone born late in the year isn't counted a year older).
    ...(birthYear && { birthDate: `${birthYear}-12-31` }),
    city: me.city,
    bio: me.bio.slice(0, 160),
    interests: (me.interests ?? []).slice(0, 5),
  });
  return user;
}

export async function refreshWallet() {
  const at = order.begin();
  applied({ user: await api.me() }, undefined, at);
}
export async function refreshEarnings() {
  wallet?.locks(await api.earnings());
}

/**
 * Money requests carry a request id (ref) the server keeps once. When the answer never arrived (no network,
 * time-out) the server may still have done it, so trying the same thing again reuses that ref: the server
 * then answers "already done" instead of doing it twice. Any answer from the server starts a fresh ref, and so
 * does a try after a few minutes (lib/live/requests).
 */
const unsure = unsureRefs();
export async function once<T>(key: string, run: (ref: string) => Promise<T>): Promise<T> {
  const ref = unsure.get(key) ?? api.newRef();
  try {
    const r = await run(ref);
    unsure.delete(key);
    return r;
  } catch (e) {
    // 0: no answer; 502–504: the proxy lost the API's answer. Both may hide a request that went through.
    if (e instanceof api.ApiError && (e.status === 0 || (e.status >= 502 && e.status <= 504))) unsure.set(key, ref);
    else unsure.delete(key);
    throw e;
  }
}

/** Test top-up (no payment): the server credits one of the test packs, at most 50.000 coins a day. */
export async function liveTopup(coins: number) {
  if (!TEST_PACKS.includes(coins)) throw new Error('Test sürümünde 1.000, 5.000 ve 10.000 jetonluk paketler denenebilir.');
  applied(await once(`topup:${coins}`, (ref) => api.testTopup(coins, ref)), 'Jeton yükleme (test)');
}

/**
 * Gelir > Çevir on the server; returns the coins received. The rate the screen showed goes with it (liveRules,
 * lib/live/catalog-live), so the server never gives less than the screen said. When the server's rate is lower
 * now (409 rate_changed) nothing was taken: the new rate reaches the screens and the error says the new amount.
 */
export async function liveExchange(diamonds: number) {
  const usdTry = liveRules().usdTry;
  let r: { user: api.ServerUser; coins: number };
  try {
    r = applied(await once(`exchange:${diamonds}`, (ref) => api.exchange(diamonds, ref, usdTry)), 'Elmas → jeton çevirme');
  } catch (e) {
    if (!(e instanceof api.ApiError && e.status === 409 && e.data.code === 'rate_changed')) throw e;
    noteLiveRate(e.data.usdTry);
    void refreshLiveCatalog();
    throw new api.ApiError(409, rateChangedMessage(diamonds, e.data), e.data);
  }
  await refreshEarnings().catch(() => {});
  return r.coins;
}

/** A gift to a real person, at the server's price. `room` = the LiveKit room it was sent in; `place` = where outside one. */
export async function liveGift(to: string, giftId: string, count: number, room?: string, place?: api.GiftPlace) {
  const id = toServer(to);
  if (!id) throw new Error('Bu kişiye şu an ulaşılamıyor');
  return applied(await once(`gift:${id}:${giftId}:${count}:${room ?? place ?? ''}`, (ref) => api.sendGift(id, giftId, count, room, ref, place)), 'Hediye gönderildi');
}

/** Signed out: the next account on this phone starts without this one's id, balance or pending request ids. */
export function forgetLiveAccount() {
  setMyId(null);
  lastDiamonds = null;
  returning = 0;
  unsure.clear();
  order.reset();
  for (const k of ['home', 'new', 'featured'] as const) {
    people[k] = null;
    peopleState[k] = 'loading';
  }
  locked.clear();
  forgetRoomPasswords();
  roomsState = 'loading';
  setRooms([]);
}

/** Mirrors a purchase the store already took locally; a refusal re-reads the real balance. */
export function liveSpend(n: number, reason: string) {
  if (!liveMode() || !myId) return;
  api
    .spend(n, reason)
    .then((r) => applied(r))
    .catch(() => refreshWallet().catch(() => {}));
}

// --- People ----------------------------------------------------------------------------------------------
/** Someone from a server list (room owner, message, LiveKit participant), known by name until their profile loads. */
export function rememberUser(c: { id: string; name: string; avatarUrl?: string | null }) {
  if (c.id === myId) return;
  putServerUser({ id: c.id, name: c.name, ...(c.avatarUrl ? { avatar: c.avatarUrl } : {}) });
}

/** A full profile (age, city, interests, follow state) from the server. */
export async function loadProfile(id: string) {
  const p = await api.userProfile(id);
  return putServerUser({
    id: p.id,
    name: p.name,
    // No age on the server stays unknown (0 in data/mock, which the screens leave out), never a made-up number.
    ...(p.age ? { age: p.age } : {}),
    city: p.city ?? '',
    bio: p.bio,
    interests: p.interests,
    ...(p.gender && { gender: p.gender }),
    ...(p.username && { username: p.username }),
    ...(p.avatarUrl && { avatar: p.avatarUrl }),
  });
}

/** How a server list stands: the first answer still coming, the last answer read, or the last try failed. */
export type LoadState = 'loading' | 'ready' | 'failed';

type DiscoverList = api.DiscoverList;
const people: Record<DiscoverList, User[] | null> = { home: null, new: null, featured: null };
const peopleState: Record<DiscoverList, LoadState> = { home: 'loading', new: 'loading', featured: 'loading' };
const peopleListeners = new Set<() => void>();
const subscribePeople = (l: () => void) => {
  peopleListeners.add(l);
  return () => peopleListeners.delete(l);
};
const emitPeople = () => peopleListeners.forEach((l) => l());
/** Reads one of Keşfet's lists from the server once (the retry button calls it too). */
export async function reloadDiscoverPeople(list: DiscoverList = 'home') {
  try {
    const rows = await api.discover(list);
    people[list] = rows.map((p) =>
      putServerUser({
        id: p.id,
        name: p.name,
        ...(p.age ? { age: p.age } : {}),
        city: p.city ?? '',
        bio: p.bio,
        interests: p.interests,
        online: p.online,
        ...(p.gender && { gender: p.gender }),
        ...(p.username && { username: p.username }),
        ...(p.avatarUrl && { avatar: p.avatarUrl }),
      }),
    );
    peopleState[list] = 'ready';
  } catch {
    peopleState[list] = 'failed';
  }
  emitPeople();
}
/** Keşfet in a live build: real people from the server, the list on screen re-read every 30 seconds while the
 *  screen is in front (once more when it comes back or the tab changes); null until the first answer. */
export function useDiscoverPeople(list: DiscoverList = 'home'): User[] | null {
  const rows = useSyncExternalStore(subscribePeople, () => people[list], () => people[list]);
  const focused = useIsFocused();
  useEffect(() => {
    if (!liveMode() || !focused) return;
    void reloadDiscoverPeople(list);
    const t = setInterval(() => void reloadDiscoverPeople(list), 30_000);
    return () => clearInterval(t);
  }, [focused, list]);
  return rows;
}
/** Whether that list's last read worked ('failed': the screen offers "Tekrar dene"). */
export const useDiscoverState = (list: DiscoverList = 'home') => useSyncExternalStore(subscribePeople, () => peopleState[list], () => peopleState[list]);

// --- Rooms -----------------------------------------------------------------------------------------------
// Rooms with a password, by id. Kept beside the Room (not as Room.password, which is the demo rooms' own
// password and would let this phone check it): the server checks the password when the voice token is asked for.
const locked = new Set<string>();
/** A server room that asks for a password before anyone but its staff gets in. */
export const isLockedRoom = (id: string) => locked.has(id);

/** A server room as the app's Room (no sample cover, empty mics: who sits where comes from LiveKit). */
export function roomOf(r: api.ServerRoom): Room {
  rememberUser(r.owner);
  if (r.hasPassword) locked.add(r.id);
  else locked.delete(r.id);
  const room: Room = {
    id: r.id,
    title: r.title,
    category: 'Sohbet',
    cover: '',
    hostId: toLocal(r.owner.id),
    listeners: r.listeners,
    seatUserIds: Array(9).fill(null),
    tags: ['Canlı'],
    level: r.level ?? 1,
    xp: r.xp ?? 0,
    roomType: (['free', 'stage', 'qa', 'music', 'event', 'private'].includes(r.roomType) ? r.roomType : 'free') as Room['roomType'],
    announcement: r.announcement || undefined,
    micCount: r.micCount ?? undefined,
    layoutId: r.layoutId ?? undefined,
    lockedSeats: r.lockedSeats ?? [],
    micQueue: !!r.micQueue,
  };
  putServerRoom(room);
  return room;
}

let rooms: Room[] = [];
let roomsState: LoadState = 'loading';
const roomListeners = new Set<() => void>();
const emitRooms = () => roomListeners.forEach((l) => l());
const setRooms = (next: Room[]) => {
  rooms = next;
  emitRooms();
};
/** Open server rooms, fullest first; password rooms too (the lists show a lock, the room asks for it). */
export async function loadRooms() {
  let list: api.ServerRoom[];
  try {
    list = await api.serverRooms();
  } catch (e) {
    roomsState = 'failed';
    emitRooms();
    throw e;
  }
  roomsState = 'ready';
  setRooms(list.filter((r) => !r.closed).map(roomOf));
  return rooms;
}
/** Reads the room list again (the "Tekrar dene" button); a failure only shows in the state. */
export const reloadServerRooms = () => void loadRooms().catch(() => {});
const subscribeRooms = (l: () => void) => {
  roomListeners.add(l);
  return () => roomListeners.delete(l);
};
/** The open server rooms, re-read every 15 seconds while the screen is in front (once more when it comes back). */
export function useServerRooms(): Room[] {
  const list = useSyncExternalStore(subscribeRooms, () => rooms, () => rooms);
  const focused = useIsFocused();
  useEffect(() => {
    if (!liveMode() || !focused) return;
    reloadServerRooms();
    const t = setInterval(reloadServerRooms, 15_000);
    return () => clearInterval(t);
  }, [focused]);
  return list;
}
/** Whether the last read of the room list worked ('failed': the list offers "Tekrar dene"). */
export const useServerRoomsState = () => useSyncExternalStore(subscribeRooms, () => roomsState, () => roomsState);

/** What the create sheet can set besides the name and the bulletin. `password`: 4–32 characters, or none. */
export type NewRoomOptions = { roomType?: string; password?: string };

/** Opens my room on the server and returns it, ready for /oda/<id>. One open room per person: if mine is already
 *  open, that one comes back. */
export async function openServerRoom(title: string, announcement: string, opts: NewRoomOptions = {}) {
  try {
    const password = opts.password?.trim() || undefined;
    const r = roomOf(await api.createRoom(title.trim().slice(0, 40) || 'Odam', announcement.trim().slice(0, 200), opts.roomType ?? 'free', password));
    setRooms([r, ...rooms.filter((x) => x.id !== r.id)]);
    return r;
  } catch (e) {
    if (!(e instanceof api.ApiError && e.status === 409)) throw e;
    const mine = (await loadRooms()).find((r) => r.hostId === 'me');
    if (!mine) throw e;
    return mine;
  }
}

/** My own server room, which only I can close for everyone. */
export const isMyServerRoom = (id: string) => liveMode() && isServerId(id) && rooms.some((r) => r.id === id && r.hostId === 'me');
/** Changes a server room (name and bulletin: mine; mics and layout: mine or one I'm an admin of); the lists and
 *  the open room show it right away, and the server tells the phones in the room. */
export async function updateServerRoom(id: string, patch: api.RoomPatch) {
  const r = roomOf(await api.updateRoom(id, patch));
  setRooms(rooms.map((x) => (x.id === r.id ? r : x)));
  return r;
}
/** Reads one server room again (after the server says it changed: a new level, mics or layout). */
export async function refreshServerRoom(id: string) {
  const r = roomOf(await api.serverRoom(id));
  // A room that isn't in the list yet (opened from a link or a search) is kept too, so its screen reads it.
  setRooms(rooms.some((x) => x.id === r.id) ? rooms.map((x) => (x.id === r.id ? r : x)) : [...rooms, r]);
  return r;
}
/** Closes my room on the server for everyone (it leaves the lists; a new one can be opened later). */
export async function closeServerRoom(id: string) {
  await api.closeRoom(id);
  setRooms(rooms.filter((r) => r.id !== id));
}

/** True for a room that lives on the server (real people, no demo bots or demo gifts). */
export const isLiveRoom = (id: string) => liveMode() && isServerId(id);
