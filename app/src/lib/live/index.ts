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
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { isServerId, putServerRoom, putServerUser, type Room, type User } from '@/data/mock';
import { replyOrder, unsureRefs } from '@/lib/live/requests';

export const liveMode = api.apiEnabled;
/**
 * One-to-one calls and Hemen Tanış only run on this phone (simulated peer, local per-minute charge): the server
 * has no matching, call signalling or call billing yet. A live build hides them instead of charging for a fake call.
 */
export const callsAvailable = () => !liveMode();

let myId: string | null = null;
/** My server id once signed in. */
export const myServerId = () => myId;
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
  myId = r.user.id;
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
  return u;
}

/** After the profile screen: the profile on the server, so other phones see the same name, age and city. */
export async function saveProfile(me: User, birthYear?: number) {
  await liveSignIn(me.name);
  const user = await api.updateProfile({
    name: me.name,
    ...(me.gender && { gender: me.gender }),
    // Only the year is asked; the server keeps a date (set once) for the 18+ check.
    ...(birthYear && { birthDate: `${birthYear}-01-01` }),
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

/** Gelir > Çevir on the server; returns the coins received. */
export async function liveExchange(diamonds: number) {
  const r = applied(await once(`exchange:${diamonds}`, (ref) => api.exchange(diamonds, ref)), 'Elmas → jeton çevirme');
  await refreshEarnings().catch(() => {});
  return r.coins;
}

/** A gift to a real person, at the server's price. `room` = the LiveKit room it was sent in. */
export async function liveGift(to: string, giftId: string, count: number, room?: string) {
  const id = toServer(to);
  if (!id) throw new Error('Bu kişi test sunucusunda yok');
  return applied(await once(`gift:${id}:${giftId}:${count}:${room ?? ''}`, (ref) => api.sendGift(id, giftId, count, room, ref)), 'Hediye gönderildi');
}

/** Signed out: the next account on this phone starts without this one's id, balance or pending request ids. */
export function forgetLiveAccount() {
  myId = null;
  lastDiamonds = null;
  returning = 0;
  unsure.clear();
  order.reset();
  people = null;
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
    age: p.age ?? 0,
    city: p.city ?? '',
    bio: p.bio,
    interests: p.interests,
    ...(p.gender && { gender: p.gender }),
    ...(p.username && { username: p.username }),
    ...(p.avatarUrl && { avatar: p.avatarUrl }),
  });
}

let people: User[] | null = null;
const peopleListeners = new Set<() => void>();
const subscribePeople = (l: () => void) => {
  peopleListeners.add(l);
  return () => peopleListeners.delete(l);
};
/** Keşfet in a live build: real people from the server, re-read every 30 seconds; null until the first answer. */
export function useDiscoverPeople(): User[] | null {
  const list = useSyncExternalStore(subscribePeople, () => people, () => people);
  useEffect(() => {
    if (!liveMode()) return;
    const tick = () =>
      void api
        .discover()
        .then((rows) => {
          people = rows.map((p) =>
            putServerUser({
              id: p.id,
              name: p.name,
              age: p.age ?? 0,
              city: p.city ?? '',
              bio: p.bio,
              interests: p.interests,
              online: p.online,
              ...(p.gender && { gender: p.gender }),
              ...(p.username && { username: p.username }),
              ...(p.avatarUrl && { avatar: p.avatarUrl }),
            }),
          );
          peopleListeners.forEach((l) => l());
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return list;
}

// --- Rooms -----------------------------------------------------------------------------------------------
/** A server room as the app's Room (no sample cover, empty mics: who sits where comes from LiveKit). */
export function roomOf(r: api.ServerRoom): Room {
  rememberUser(r.owner);
  const room: Room = {
    id: r.id,
    title: r.title,
    category: 'Sohbet',
    cover: '',
    hostId: toLocal(r.owner.id),
    listeners: r.listeners,
    seatUserIds: Array(9).fill(null),
    tags: ['Canlı'],
    level: 1,
    roomType: (['free', 'stage', 'qa', 'music', 'event', 'private'].includes(r.roomType) ? r.roomType : 'free') as Room['roomType'],
    announcement: r.announcement || undefined,
  };
  putServerRoom(room);
  return room;
}

let rooms: Room[] = [];
const roomListeners = new Set<() => void>();
const setRooms = (next: Room[]) => {
  rooms = next;
  roomListeners.forEach((l) => l());
};
/** Open server rooms, fullest first. Rooms with a password are left out until the app can ask for it. */
export async function loadRooms() {
  const list = await api.serverRooms();
  setRooms(list.filter((r) => !r.closed && !r.hasPassword).map(roomOf));
  return rooms;
}
const subscribeRooms = (l: () => void) => {
  roomListeners.add(l);
  return () => roomListeners.delete(l);
};
/** The open server rooms, re-read every 15 seconds while a screen shows them. */
export function useServerRooms(): Room[] {
  const list = useSyncExternalStore(subscribeRooms, () => rooms, () => rooms);
  useEffect(() => {
    if (!liveMode()) return;
    const tick = () => void loadRooms().catch(() => {});
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, []);
  return list;
}

/** Opens my room on the server and returns it, ready for /oda/<id>. One open room per person: if mine is already
 *  open, that one comes back. */
export async function openServerRoom(title: string, announcement: string) {
  try {
    const r = roomOf(await api.createRoom(title.trim().slice(0, 40) || 'Odam', announcement.trim().slice(0, 200)));
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
/** Closes my room on the server for everyone (it leaves the lists; a new one can be opened later). */
export async function closeServerRoom(id: string) {
  await api.closeRoom(id);
  setRooms(rooms.filter((r) => r.id !== id));
}

/** True for a room that lives on the server (real people, no demo bots or demo gifts). */
export const isLiveRoom = (id: string) => liveMode() && isServerId(id);
