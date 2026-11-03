// Client for the Similar Club API on our server (server/api, docs/SUNUCU.md): sign-in, the server wallet,
// gifts, rankings, store purchases, push registration, uploads and voice tokens. Active when
// EXPO_PUBLIC_API_URL is set; otherwise apiEnabled() is false and the app keeps its local prototype state.
//
// Sign-in: a random device key is created once and kept on the device; the server knows only its hash. The
// session it returns is kept too, so the app stays signed in. Phone sign-in (otpStart / otpVerify) keeps the
// device's development account and wallet when it is used for the first time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';

export type ServerUser = { id: string; name: string; coins: number; diamonds: number; gameCoins: number; createdAt: string; phone?: string | null; svipXp?: number };
export type ServerLedgerRow = { id: number; currency: 'coin' | 'diamond' | 'game'; amount: number; balance: number; reason: string; ref: string; counterparty: string | null; created_at: string };

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEVICE_KEY = 'similarclub:device-key';
const SESSION_KEY = 'similarclub:api-session';

export const apiEnabled = () => !!BASE;
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// expo-crypto, not the global `crypto`: Android's JavaScript engine (Hermes) has no crypto.getRandomValues,
// so sign-up and every wallet request id would fail on the phone.
const randomId = (bytes: number) => Array.from(getRandomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
/** Request id for a wallet change; sending the same id again is applied once by the server. */
export const newRef = () => randomId(12);

let session: string | null = null;
let signingIn: Promise<ServerUser> | null = null;

async function call<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: object): Promise<T> {
  if (!BASE) throw new ApiError(0, 'Sunucu adresi ayarlı değil');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Sunucu hatası (${res.status})`);
  return data as T;
}

/** Any route of the API with this session (the agency panels go through lib/agency-net). */
export const apiRequest = <T>(method: 'GET' | 'POST', path: string, body?: object) => call<T>(method, path, body);

/** Signs in with this device (creating the account with `name` the first time). */
export async function signIn(name: string): Promise<ServerUser> {
  let key = await AsyncStorage.getItem(DEVICE_KEY);
  if (!key) {
    key = randomId(24);
    await AsyncStorage.setItem(DEVICE_KEY, key);
  }
  const r = await call<{ session: string; user: ServerUser }>('POST', '/api/auth/dev', { deviceKey: key, name });
  await keepSession(r.session);
  return r.user;
}

async function keepSession(s: string) {
  session = s;
  await AsyncStorage.setItem(SESSION_KEY, s);
}

/**
 * The signed-in user: the saved session if it still works, else a new sign-in with this device. Calls made at
 * the same time share one sign-in.
 */
export function ensureSignedIn(name: string): Promise<ServerUser> {
  signingIn ??= (async () => {
    session ??= await AsyncStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        return (await call<{ user: ServerUser }>('GET', '/api/me')).user;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        session = null;
      }
    }
    return signIn(name);
  })().finally(() => (signingIn = null));
  return signingIn;
}

export const me = () => call<{ user: ServerUser }>('GET', '/api/me').then((r) => r.user);
export const ledger = () => call<{ rows: ServerLedgerRow[] }>('GET', '/api/ledger').then((r) => r.rows);
export const testTopup = (amount: number, ref = newRef()) => call<{ user: ServerUser; replay: boolean }>('POST', '/api/wallet/test-topup', { amount, ref });
export const gift = (to: string, amount: number, ref = newRef()) => call<{ user: ServerUser; replay: boolean }>('POST', '/api/wallet/gift', { to, amount, ref });
/** LiveKit token for a room; needs a signed-in user. */
export const voiceToken = (room: string) => call<{ token: string }>('GET', `/token?room=${encodeURIComponent(room)}`).then((r) => r.token);

// --- Launch endpoints (server/api auth, gifts, purchases, push, media, live). Screens move to them one by one.
export type CatalogGift = { id: string; name: string; price: number; cat: string; minSvip: number };
export type CatalogPack = { id: string; productId: string; coins: number; firstBonus: number };
export type RankingRow = { rank: number; user: { id: string; name: string; avatarUrl: string | null }; score: number };
export type ServerSession = { id: string; device: string; createdAt: string; lastSeenAt: string; current: boolean };
export type StoreProof = { platform: 'android'; productId: string; token: string } | { platform: 'ios' | 'test'; productId: string; transactionId: string };

/** Phone sign-in, step 1: the server texts a 6-digit code (a new one every `retryAfter` seconds). */
export const otpStart = (phone: string) => call<{ sent: boolean; retryAfter: number }>('POST', '/api/auth/otp/start', { phone });

/** Phone sign-in, step 2: the code opens a session. `isNew` = a new account (ask for the profile next). */
export async function otpVerify(phone: string, code: string, name?: string, device?: string) {
  const deviceKey = (await AsyncStorage.getItem(DEVICE_KEY)) ?? undefined;
  const r = await call<{ session: string; user: ServerUser; isNew: boolean }>('POST', '/api/auth/otp/verify', { phone, code, name, deviceKey, device });
  await keepSession(r.session);
  return { user: r.user, isNew: r.isNew };
}

/** Ends this session (or every session of the account) and forgets it on the device. */
export async function logout(all = false) {
  await call('POST', '/api/auth/logout', { all }).catch(() => {});
  session = null;
  await AsyncStorage.removeItem(SESSION_KEY);
}
export const sessions = () => call<{ sessions: ServerSession[] }>('GET', '/api/sessions').then((r) => r.sessions);
export const revokeSession = (id: string) => call<{ revoked: boolean }>('POST', '/api/sessions/revoke', { id });

/** Gift prices, counts, coin packs and SVIP thresholds as the server charges them (no sign-in needed). */
export const catalog = () => call<{ gifts: CatalogGift[]; counts: number[]; packs: CatalogPack[]; svipXp: number[] }>('GET', '/api/catalog');
/** A gift at the server's price; `room` = sent on stage (no push to the recipient). */
export const sendGift = (to: string, giftId: string, count: number, room?: string, ref = newRef()) =>
  call<{ user: ServerUser; replay: boolean; total: number }>('POST', '/api/gifts/send', { to, giftId, count, room, ref });
export const rankings = (board: 'wealth' | 'charm', period: 'day' | 'week' | 'month') =>
  call<{ rows: RankingRow[] }>('GET', `/api/rankings?board=${board}&period=${period}`).then((r) => r.rows);

/** After a store purchase: the server checks it with Google / Apple and credits the coins once. */
export const verifyPurchase = (proof: StoreProof) => call<{ user: ServerUser; replay: boolean; coins: number; bonus: number }>('POST', '/api/wallet/purchase', proof);

export const registerPush = (token: string, platform: 'ios' | 'android' | 'web') => call<{ registered: boolean }>('POST', '/api/push/register', { token, platform });

/** A signed address to PUT a photo or video to (with exactly `headers`); save `publicUrl` afterwards. */
export const uploadUrl = (kind: 'avatar' | 'moment', contentType: string, size: number) =>
  call<{ uploadUrl: string; method: 'PUT'; headers: Record<string, string>; publicUrl: string; expiresIn: number }>('POST', '/api/media/upload-url', { kind, contentType, size });

/** Listener counts of every voice room with people in it (LiveKit room names, e.g. oda-r1). */
export const liveRooms = () => call<{ rooms: { room: string; listeners: number }[] }>('GET', '/api/rooms/live').then((r) => r.rooms);

// --- Live mode (lib/live): profile, people, rooms, messages, follows and the Gelir wallet on the server.
export type ServerProfile = { username: string | null; gender: 'Kadın' | 'Erkek' | null; age: number | null; city: string | null; bio: string; interests: string[]; avatarUrl: string | null };
export type ServerMe = ServerUser & ServerProfile & { role?: string };
export type PublicUser = { id: string; name: string } & ServerProfile & { followers: number; following: number; isFollowing: boolean; blockedByMe: boolean };
export type UserCard = { id: string; name: string; avatarUrl: string | null };
export type ServerRoom = { id: string; owner: UserCard; title: string; announcement: string; roomType: string; hasPassword: boolean; createdAt: string; closed: boolean; listeners: number };
export type DirectMessage = { id: number; from: string; to: string; text: string; createdAt: string; readAt: string | null };
export type ServerConversation = { user: UserCard; last: DirectMessage; unread: number };
export type ServerLock = { id: number; amount: number; channel: string; channelLabel: string; unlockAt: string; createdAt: string; from: { id: string; name: string } | null; gift: { id: string; count: number } | null };
export type ServerEarnings = { diamonds: number; withdrawable: number; locked: number; lockDays: { store: number; jeton: number }; locks: ServerLock[] };

export type ProfilePatch = { name?: string; gender?: 'Kadın' | 'Erkek'; birthDate?: string; city?: string; bio?: string; interests?: string[]; avatarUrl?: string | null };
export const updateProfile = (p: ProfilePatch) => call<{ user: ServerMe }>('PATCH', '/api/me', p).then((r) => r.user);
export const userProfile = (id: string) => call<{ user: PublicUser }>('GET', `/api/user?id=${encodeURIComponent(id)}`).then((r) => r.user);
export const follow = (to: string, on: boolean) => call<{ following: boolean }>('POST', '/api/follow', { to, follow: on }).then((r) => r.following);
export const followingList = () => call<{ users: UserCard[] }>('GET', '/api/following').then((r) => r.users);

export const serverRooms = () => call<{ rooms: ServerRoom[] }>('GET', '/api/rooms').then((r) => r.rooms);
export const createRoom = (title: string, announcement = '', roomType = 'free') => call<{ room: ServerRoom }>('POST', '/api/rooms', { title, announcement, roomType }).then((r) => r.room);
export const closeRoom = (id: string) => call<{ closed: boolean }>('POST', '/api/rooms/close', { id });

export const sendDm = (to: string, text: string, ref = newRef()) => call<{ message: DirectMessage; replay: boolean }>('POST', '/api/messages', { to, text, ref }).then((r) => r.message);
export const dmThread = (peer: string) => call<{ messages: DirectMessage[] }>('GET', `/api/messages?with=${encodeURIComponent(peer)}`).then((r) => r.messages);
export const conversations = () => call<{ conversations: ServerConversation[] }>('GET', '/api/conversations').then((r) => r.conversations);
export const markDmRead = (peer: string) => call<{ read: number }>('POST', '/api/messages/read', { with: peer });

export const earnings = () => call<ServerEarnings>('GET', '/api/wallet/earnings');
/** An in-app purchase paid with coins (VIP, store items, game entries): the server takes the coins once. */
export const spend = (amount: number, reason: string, ref = newRef()) => call<{ user: ServerUser; replay: boolean }>('POST', '/api/wallet/spend', { amount, reason, ref });
export const exchange = (diamonds: number, ref = newRef()) => call<{ user: ServerUser; replay: boolean; coins: number }>('POST', '/api/wallet/exchange', { diamonds, ref });
