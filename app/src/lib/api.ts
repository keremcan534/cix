// Client for the Similar Club API on our server (server/api, docs/SUNUCU.md): sign-in, the server wallet,
// gifts, rankings, store purchases, push registration, uploads and voice tokens. Active when
// EXPO_PUBLIC_API_URL is set; otherwise apiEnabled() is false and the app keeps its local prototype state.
//
// Sign-in: a random device key is created once and kept on the device; the server knows only its hash. The
// session it returns is kept too, so the app stays signed in. Phone sign-in (otpStart / otpVerify) keeps the
// device's development account and wallet when it is used for the first time. Google sign-in (googleSignIn,
// lib/live/account) and e-mail sign-in (emailStart / emailVerify) do the same; after any of them, an ended
// session asks the person to sign in again instead of using the device key.
//
// Sanctions (server/api/sanctions.mjs, lib/sanctions): every sign-in sends this phone's device signals
// (lib/device-info). A banned account or device gets 403 with code account_banned / device_banned and a one-day
// appeal session that can only read its sanctions and appeal; onBlocked() hears it and the app shows the ban.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';

import type { RoomBackground } from '@/data/catalog';
import type { Outcome } from '@/lib/casino-odds';
import { noteContactStrike, type ContactStrike } from '@/lib/contact-filter';
import { deviceInfo } from '@/lib/device-info';
import { forgetRoomPassword, roomPassword } from '@/lib/live/room-password';
import type { CardsMove, CardsSeen } from '@/lib/room-games/cards';
import type { FourMove, FourState } from '@/lib/room-games/four';
import type { LudoMode, LudoMove, LudoState } from '@/lib/room-games/ludo';
import type { XoxMove, XoxState } from '@/lib/room-games/xox';

/**
 * wealthXp: Cömertlik points, charmXp: Yankı points, only in GET /api/me (the server's counts, server/api/wheel.mjs
 * wealthPoints and wallet.mjs charmPoints).
 */
export type ServerUser = {
  id: string; name: string; coins: number; diamonds: number; gameCoins: number; createdAt: string; phone?: string | null; svipXp?: number; wealthXp?: number; charmXp?: number; paidGames?: boolean;
  // Only in GET/PATCH /api/me and the sign-in and add-address answers; wallet answers leave them out.
  email?: string | null; identities?: string[]; phoneVerified?: boolean;
};
export type ServerLedgerRow = { id: number; currency: 'coin' | 'diamond' | 'game'; amount: number; balance: number; reason: string; ref: string; counterparty: string | null; created_at: string };

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEVICE_KEY = 'similarclub:device-key';
const SESSION_KEY = 'similarclub:api-session';
/** How this device signed in: 'google', 'email' or 'phone' (none for the development account). */
const PROVIDER_KEY = 'similarclub:sign-in';

export const apiEnabled = () => !!BASE;
/** What the server sends with a sanction refusal (403 code muted / account_banned / device_banned). */
export type SanctionView = {
  id: number;
  type: 'mute_room_text' | 'mute_room_voice' | 'mute_global_text' | 'mute_global_voice' | 'mute_all' | 'account_ban' | 'device_ban';
  label: string;
  restricts: ('room_text' | 'room_voice' | 'dm' | 'call' | 'account' | 'device')[];
  roomId: string | null;
  reasonCode: string;
  reason: string;
  reasonText: string;
  startAt: string;
  endAt: string | null;
  permanent: boolean;
  appliedBy: string;
  status: string;
  appeal?: string | null;
};
export type SanctionCode = 'muted' | 'account_banned' | 'device_banned';
export type ErrorData = {
  error?: string;
  code?: SanctionCode | string;
  sanction?: SanctionView;
  serverNow?: string;
  appealSession?: string;
  /** Çevir, 409 rate_changed: the server's rate now and what the same diamonds give at it (check before use). */
  usdTry?: unknown;
  coins?: unknown;
  /** Canlı ayarlar, 409 stale: the settings version now; 409 confirm_needed: the preview to confirm. */
  v?: number;
  preview?: LivePreviewLine[];
  /** 409 device_has_account: how the account already on this phone signs in ('email' | 'google' | 'phone'). */
  method?: string;
};
// Plain fields, not constructor parameter properties: Node's type stripping (the unit tests) can't run those.
export class ApiError extends Error {
  readonly status: number;
  readonly data: ErrorData;
  constructor(status: number, message: string, data: ErrorData = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
export type Block = { code: 'account_banned' | 'device_banned'; sanction: SanctionView; serverNow: string; appealSession: string | null };
let blockListener: (b: Block) => void = () => {};
/** The app's ban screen (lib/sanctions) hears every account / device ban refusal here. */
export const onBlocked = (fn: (b: Block) => void) => (blockListener = fn);
/** A Google, e-mail or phone account's session ended: the person signs in again (no silent device account). */
export class SignInAgain extends ApiError {
  constructor() {
    super(401, 'Oturumun sona erdi. Devam etmek için yeniden giriş yap.');
  }
}
const provider = () => AsyncStorage.getItem(PROVIDER_KEY);
const viaGoogle = async () => (await provider()) === 'google';
/** Signed in with an account of its own (Google, e-mail, phone), not this device's key. */
const viaAccount = async () => ['google', 'email', 'phone'].includes((await provider()) ?? '');

// expo-crypto, not the global `crypto`: Android's JavaScript engine (Hermes) has no crypto.getRandomValues,
// so sign-up and every wallet request id would fail on the phone.
const randomId = (bytes: number) => Array.from(getRandomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
/** Request id for a wallet change; sending the same id again is applied once by the server. */
export const newRef = () => randomId(12);

let session: string | null = null;
let signingIn: Promise<ServerUser> | null = null;
/** The name the last sign-in used (a call refused for having no session signs in with it once); null after logout. */
let lastName: string | null = null;

// The saved session is read once per app start, and every call waits for that read: on a cold start (a room
// link, a reload inside a screen) the first requests would otherwise go out without it and get 401.
let restored = false;
/** A sign-in, sign-out or ended session since the start: the saved copy no longer counts. */
let sessionChanged = false;
let restoring: Promise<void> | null = null;
function restoreSession() {
  restoring ??= AsyncStorage.getItem(SESSION_KEY)
    .then(
      (saved) => {
        if (saved && !sessionChanged) session ??= saved;
      },
      () => {},
    )
    .finally(() => (restored = true));
  return restoring;
}
const setSession = (s: string | null) => {
  session = s;
  sessionChanged = true;
};

/**
 * A call that went out without a session got 401: waits for the sign-in under way, or, when this app start has
 * had no session at all yet (the first sign-in failed, e.g. no network), signs in once with the last name. Not
 * after a sign-out, a ban or an ended session: those are handled where they happen. true: there is a session now,
 * so the call can be sent again.
 */
async function signedInNow() {
  try {
    if (signingIn) await signingIn;
    else if (!session && !sessionChanged && lastName !== null) await ensureSignedIn(lastName);
  } catch {
    // The sign-in itself failed: the call keeps its own 401.
  }
  return !!session;
}

const TIMEOUT_MS = 15_000;

/**
 * One request. It gives up after 15 s (a phone network can otherwise hang a request forever, leaving a screen
 * busy). A 401 on a signed-in call means the session ended (expired, signed out elsewhere, server reset): the
 * session is dropped, the device signs in again once with its key, and the request is sent once more.
 *
 * Before sending it waits for the saved session (restoreSession) and for a sign-in under way, so it carries the
 * session; one that still went out without a session and got 401 is sent again once the sign-in is done.
 * `inSignIn`: a call made by the sign-in itself (it must not wait for itself).
 */
async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: object, retried = false, inSignIn = false): Promise<T> {
  if (!BASE) throw new ApiError(0, 'Sunucu adresi ayarlı değil');
  const signedRoute = !path.startsWith('/api/auth/');
  if (!restored) await restoreSession();
  // `retried` also marks a call with an appeal session (withSession), which must not wait for a normal sign-in.
  if (signedRoute && !inSignIn && !retried && signingIn) await signingIn.catch(() => {});
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const sent = session;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(sent ? { Authorization: `Bearer ${sent}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    if (ctrl.signal.aborted) throw new ApiError(0, 'Bağlantı zaman aşımına uğradı. İnternetini kontrol edip tekrar dene.');
    throw new ApiError(0, 'Sunucuya ulaşılamadı. İnternetini kontrol edip tekrar dene.');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && sent && !retried && signedRoute) {
    if (session === sent) await forgetSession();
    await reSignIn();
    return call<T>(method, path, body, true);
  }
  if (res.status === 401 && !sent && !retried && !inSignIn && signedRoute && (await signedInNow())) return call<T>(method, path, body, true);
  if (!res.ok) {
    if (res.status === 403 && (data.code === 'account_banned' || data.code === 'device_banned') && data.sanction) {
      // The server already ended the session; keep only the appeal session it gave.
      if (session === sent) await forgetSession();
      blockListener({ code: data.code, sanction: data.sanction, serverNow: data.serverNow ?? new Date().toISOString(), appealSession: data.appealSession ?? null });
    }
    // Contact details refused: how many tries are left before the automatic mute, or that it began (lib/contact-filter).
    if (res.status === 400 && data.code === 'contact_blocked') noteContactStrike(data);
    throw new ApiError(res.status, data.error ?? `Sunucu hatası (${res.status})`, data);
  }
  return data as T;
}

async function forgetSession() {
  setSession(null);
  await AsyncStorage.removeItem(SESSION_KEY);
}

/** A new session with this device's key (shared by calls that hit a 401 at the same time). */
let reSigning: Promise<void> | null = null;
function reSignIn() {
  reSigning ??= (async () => {
    if (session) return; // another call already signed in again
    if (await viaAccount()) throw new SignInAgain();
    const key = await AsyncStorage.getItem(DEVICE_KEY);
    if (!key) throw new ApiError(401, 'Oturumun sona erdi. Uygulamayı yeniden açıp giriş yap.');
    const r = await call<{ session: string }>('POST', '/api/auth/dev', { deviceKey: key, deviceInfo: await myDevice() });
    await keepSession(r.session);
  })().finally(() => (reSigning = null));
  return reSigning;
}

/** Signs in again with this device's key. true: signed in (no ban any more); a ban refusal instead brings a fresh
 *  appeal session through onBlocked. */
export async function retrySignIn(): Promise<boolean> {
  await forgetSession();
  return reSignIn().then(
    () => true,
    () => false,
  );
}

/** Any route of the API with this session (the agency panels go through lib/agency-net). */
export const apiRequest = <T>(method: 'GET' | 'POST', path: string, body?: object) => call<T>(method, path, body);

/**
 * Opens my live line (lib/live/live-line): a request that stays open while the server writes events into it.
 * Null when there is no server or no session yet. Not compressed, so each event comes through as it is written.
 */
export async function openLiveLine(signal: AbortSignal): Promise<Response | null> {
  if (!BASE) return null;
  await restoreSession();
  if (!session) return null;
  return fetch(`${BASE}/api/live`, { headers: { Authorization: `Bearer ${session}`, Accept: 'text/event-stream', 'Accept-Encoding': 'identity' }, signal });
}

/** The live line's address and my session, for the line's second way of reading it (XMLHttpRequest). */
export async function liveLineTarget(): Promise<{ url: string; token: string } | null> {
  if (!BASE) return null;
  await restoreSession();
  return session ? { url: `${BASE}/api/live`, token: session } : null;
}
/** Ayarlar › Bağlantı testi: the server sends a ping on my line; `open` is how many lines it has from me. */
export const pingLiveLine = () => call<{ open: number }>('POST', '/api/live/ping', {});

/** Signs in with this device (creating the account with `name` the first time). */
export async function signIn(name: string): Promise<ServerUser> {
  lastName = name;
  const key = await deviceKey();
  const r = await call<{ session: string; user: ServerUser }>('POST', '/api/auth/dev', { deviceKey: key, name, deviceInfo: await myDevice() });
  await keepSession(r.session);
  return r.user;
}

/** This install's random key, made the first time it is needed. */
async function deviceKey() {
  let key = await AsyncStorage.getItem(DEVICE_KEY);
  if (!key) {
    key = randomId(24);
    await AsyncStorage.setItem(DEVICE_KEY, key);
  }
  return key;
}
/** The device signals for the server (lib/device-info); never fails a sign-in. */
async function myDevice() {
  try {
    return await deviceInfo(await deviceKey(), () => randomId(24));
  } catch {
    return undefined;
  }
}

/**
 * Once per app start, after the saved session worked: tells the server which device it is on. A device banned
 * since is refused here (the ban screen opens through onBlocked).
 */
let registered = false;
async function registerDevice() {
  if (registered) return;
  const info = await myDevice();
  if (!info) return;
  try {
    await call('POST', '/api/devices/register', { deviceInfo: info }, false, true);
    registered = true;
  } catch (e) {
    // Banned: onBlocked already heard it. Anything else: try again on the next start.
    if (e instanceof ApiError && e.data.code === 'device_banned') throw e;
  }
}

async function keepSession(s: string) {
  setSession(s);
  await AsyncStorage.setItem(SESSION_KEY, s);
}

const signedInListeners = new Set<() => void>();
/** Hears every sign-in that worked (lib/sanctions asks again for what failed before it). Returns the unsubscribe. */
export function onSignedIn(fn: () => void) {
  signedInListeners.add(fn);
  return () => void signedInListeners.delete(fn);
}

/**
 * The signed-in user: the saved session if it still works, else a new sign-in with this device. Calls made at
 * the same time share one sign-in.
 */
export function ensureSignedIn(name: string): Promise<ServerUser> {
  lastName = name;
  signingIn ??= (async () => {
    await restoreSession();
    if (session) {
      try {
        const u = (await call<{ user: ServerUser }>('GET', '/api/me', undefined, false, true)).user;
        await registerDevice();
        return u;
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        setSession(null);
      }
    }
    if (await viaAccount()) throw new SignInAgain();
    return signIn(name);
  })()
    .then((u) => {
      signedInListeners.forEach((l) => l());
      return u;
    })
    .finally(() => (signingIn = null));
  return signingIn;
}

export const me = () => call<{ user: ServerUser }>('GET', '/api/me').then((r) => r.user);
export const ledger = () => call<{ rows: ServerLedgerRow[] }>('GET', '/api/ledger').then((r) => r.rows);
export const testTopup = (amount: number, ref = newRef()) => call<{ user: ServerUser; replay: boolean }>('POST', '/api/wallet/test-topup', { amount, ref });
export const gift = (to: string, amount: number, ref = newRef()) => call<{ user: ServerUser; replay: boolean }>('POST', '/api/wallet/gift', { to, amount, ref });
/**
 * LiveKit token for a room; needs a signed-in user. A password room's token needs the password the person typed
 * (lib/live/room-password, keyed by the room id in `oda-<id>`); a refusal forgets it, so the room asks again.
 */
export async function voiceToken(room: string) {
  const id = room.startsWith('oda-') ? room.slice(4) : room;
  const password = roomPassword(id);
  try {
    const r = await call<{ token: string }>('GET', `/token?room=${encodeURIComponent(room)}${password ? `&password=${encodeURIComponent(password)}` : ''}`);
    return r.token;
  } catch (e) {
    if (password && e instanceof ApiError && e.status === 403) forgetRoomPassword(id);
    throw e;
  }
}

// --- Launch endpoints (server/api auth, gifts, purchases, push, media, live). Screens move to them one by one.
export type CatalogGift = { id: string; name: string; price: number; cat: string; minSvip: number };
export type CatalogPack = { id: string; productId: string; coins: number; firstBonus: number };
export type RankingRow = { rank: number; user: { id: string; name: string; avatarUrl: string | null }; score: number };
export type ServerSession = { id: string; device: string; createdAt: string; lastSeenAt: string; current: boolean };
export type StoreProof = { platform: 'android'; productId: string; token: string } | { platform: 'ios' | 'test'; productId: string; transactionId: string };

/**
 * Phone sign-in, step 1 (off on the server unless PHONE_SIGN_IN=1): the server texts a 6-digit code (a new one
 * every `retryAfter` seconds). `challenge` goes back with the code in step 2.
 */
export const otpStart = (phone: string) => call<{ sent: boolean; retryAfter: number; challenge: string }>('POST', '/api/auth/otp/start', { phone });

/** Phone sign-in, step 2: the code and step 1's `challenge` open a session. `isNew` = a new account (ask for the profile next). */
export async function otpVerify(phone: string, code: string, challenge: string, name?: string, device?: string) {
  const r = await call<{ session: string; user: ServerUser; isNew: boolean }>('POST', '/api/auth/otp/verify', { phone, code, challenge, name, deviceKey: await deviceKey(), deviceInfo: await myDevice(), device });
  await keepSession(r.session);
  await AsyncStorage.setItem(PROVIDER_KEY, 'phone');
  return { user: r.user, isNew: r.isNew };
}

export type CodeSent = { sent: boolean; retryAfter: number; challenge: string };
/** E-mail sign-in, step 1 (503 until the server has a mail provider): a 6-digit code to the address. */
export const emailStart = (email: string) => call<CodeSent>('POST', '/api/auth/email/start', { email });
/** E-mail sign-in, step 2: the code and step 1's `challenge` open a session. `isNew` = a new account. */
export async function emailVerify(email: string, code: string, challenge: string, device?: string) {
  const r = await call<{ session: string; user: ServerMe; isNew: boolean }>('POST', '/api/auth/email/verify', { email, code, challenge, deviceKey: await deviceKey(), deviceInfo: await myDevice(), device });
  await keepSession(r.session);
  await AsyncStorage.setItem(PROVIDER_KEY, 'email');
  return { user: r.user, isNew: r.isNew };
}

// Adding an address or checking a number on the signed-in account (Ayarlar). Never merges two accounts.
export const linkEmailStart = (email: string) => call<CodeSent>('POST', '/api/me/email/start', { email });
export const linkEmailVerify = (email: string, code: string, challenge: string) => call<{ user: ServerMe }>('POST', '/api/me/email/verify', { email, code, challenge }).then((r) => r.user);
export const linkPhoneStart = (phone: string) => call<CodeSent>('POST', '/api/me/phone/start', { phone });
export const linkPhoneVerify = (phone: string, code: string, challenge: string) => call<{ user: ServerMe }>('POST', '/api/me/phone/verify', { phone, code, challenge }).then((r) => r.user);
/** A wa.me link with a one-time message to our number; sending it checks the number (valid `expiresIn` s). */
export const whatsappStart = () => call<{ link: string; expiresIn: number }>('POST', '/api/me/phone/whatsapp');
export type PhoneCheck = { phone: string | null; pending: boolean; result: null | 'verified' | 'taken' | 'country' | 'no_number' | 'expired' };
/** The latest WhatsApp check of this account (the app asks every few seconds while it waits). */
export const phoneStatus = () => call<PhoneCheck>('GET', '/api/me/phone/status');

/** Google sign-in: Google's ID token opens a session (a device development account is linked, not replaced). */
export async function googleSignIn(idToken: string, device?: string) {
  const r = await call<{ session: string; user: ServerMe; isNew: boolean }>('POST', '/api/auth/google', { idToken, deviceKey: await deviceKey(), deviceInfo: await myDevice(), device });
  await keepSession(r.session);
  await AsyncStorage.setItem(PROVIDER_KEY, 'google');
  return { user: r.user, isNew: r.isNew };
}
/** True after a Google sign-in on this device. */
export const signedInWithGoogle = viaGoogle;
/** True after a Google, e-mail or phone sign-in on this device (not the development account). */
export const signedInWithAccount = viaAccount;
/** This phone already has its account: the device key stays after "Çıkış yap" and goes only when the account is deleted. */
export const hasDeviceAccount = async () => !!(await AsyncStorage.getItem(DEVICE_KEY));

/** Ends this session (or every session of the account) and forgets it on the device. */
export async function logout(all = false) {
  await call('POST', '/api/auth/logout', { all }).catch(() => {});
  setSession(null);
  lastName = null;
  await AsyncStorage.multiRemove([SESSION_KEY, PROVIDER_KEY]);
}

/** Deletes the account on the server (DELETE /api/me), then forgets the session and the device key here. */
export async function deleteAccount() {
  await call<{ deleted: boolean }>('DELETE', '/api/me');
  setSession(null);
  lastName = null;
  await AsyncStorage.multiRemove([SESSION_KEY, PROVIDER_KEY, DEVICE_KEY]);
}
export const sessions = () => call<{ sessions: ServerSession[] }>('GET', '/api/sessions').then((r) => r.sessions);
export const revokeSession = (id: string) => call<{ revoked: boolean }>('POST', '/api/sessions/revoke', { id });

export type CatalogCampaign = { percent: number; startsAt: string; endsAt: string; label: string };
/** GET /api/catalog. Hidden gifts and packs are left out; `campaign` only while one runs. An older server
 *  sends no campaign, exchange or v. The app reads it through lib/live/catalog-live (never trusted as is). */
export type CatalogBody = {
  gifts: CatalogGift[];
  counts: number[];
  packs: CatalogPack[];
  svipXp: number[];
  purchases?: { testTopup: boolean; stores: { android: boolean; ios: boolean } };
  campaign?: CatalogCampaign | null;
  exchange?: { usdTry: number; minDiamonds: number };
  v?: number;
};
/** Gift prices, counts, coin packs and SVIP thresholds as the server charges them (no sign-in needed). */
export const catalog = () => call<CatalogBody>('GET', '/api/catalog');
/** Where a gift outside a room was sent from (Gelir's sources on the server). */
export type GiftPlace = 'chat' | 'moment' | 'profile' | 'family';
/** A gift at the server's price; `room` = sent on stage (no push to the recipient); `place` = where, outside a room. */
export const sendGift = (to: string, giftId: string, count: number, room?: string, ref = newRef(), place?: GiftPlace) =>
  call<{ user: ServerUser; replay: boolean; total: number }>('POST', '/api/gifts/send', { to, giftId, count, room, ref, ...(place && !room ? { place } : {}) });
/** Gelir's sources: the diamonds earned in the period, by where they came from (server wallet.mjs). */
export type IncomeSource = { key: string; label: string; diamonds: number; count: number; live: boolean };
export type IncomePeriod = 'day' | 'week' | 'month' | 'all';
export const incomeSources = (period: IncomePeriod) => call<{ period: IncomePeriod; total: number; sources: IncomeSource[] }>('GET', `/api/wallet/income?period=${period}`);
export const rankings = (board: 'wealth' | 'charm', period: 'day' | 'week' | 'month') =>
  call<{ rows: RankingRow[] }>('GET', `/api/rankings?board=${board}&period=${period}`).then((r) => r.rows);
/** Agencies by what their streamers earned this day, week or month (the commission base). */
export type AgencyRankingRow = { rank: number; agency: { id: string; name: string; avatarUrl: string | null }; score: number };
export const agencyRankings = (period: 'day' | 'week' | 'month') =>
  call<{ rows: AgencyRankingRow[] }>('GET', `/api/rankings?board=agency&period=${period}`).then((r) => r.rows);

/** After a store purchase: the server checks it with Google / Apple and credits the coins once. `bonus` is the
 *  first-buy gift, `campaignBonus` a campaign's extra coins (missing from an older server). */
export const verifyPurchase = (proof: StoreProof) =>
  call<{ user: ServerUser; replay: boolean; coins: number; bonus: number; campaignBonus?: number }>('POST', '/api/wallet/purchase', proof);

/** A paid Hareketli in a server room (server/api/room-fx.mjs): the server's price, then it tells the room itself. */
export const roomAnimation = (room: string, animationId: string, ref = newRef()) =>
  call<{ user: ServerUser; replay: boolean; eventId: number; price: number }>('POST', '/api/rooms/animation', { room, animationId, ref });

/** This phone's push token: an Expo one, or Firebase's own (kind 'fcm', lib/push), which the server sends to through Firebase. */
export const registerPush = (token: string, platform: 'ios' | 'android' | 'web', kind: 'expo' | 'fcm' = 'expo') =>
  call<{ registered: boolean }>('POST', '/api/push/register', { token, platform, kind });
export const unregisterPush = (token: string) => call<{ registered: boolean }>('POST', '/api/push/unregister', { token });

/** A signed address to PUT a photo or video to (with exactly `headers`); save `publicUrl` afterwards. */
export const uploadUrl = (kind: 'avatar' | 'moment' | 'dm' | 'album' | 'notice' | 'music' | 'ticket' | 'roombg' | 'roomcover', contentType: string, size: number) =>
  call<{ uploadUrl: string; method: 'PUT'; headers: Record<string, string>; publicUrl: string; expiresIn: number }>('POST', '/api/media/upload-url', { kind, contentType, size });

/**
 * A file picked on the phone, read as bytes with the type the phone gave it ('' when unknown). Bytes, not a Blob:
 * Expo's fetch sends a Blob with the Blob's own type, which is empty for files read from the phone, so the type
 * the server was asked for would be lost on the upload.
 */
export async function readFile(uri: string): Promise<{ data: ArrayBuffer; type: string }> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`read ${res.status}`);
  return { type: res.headers.get('content-type')?.split(';')[0].trim() ?? '', data: await res.arrayBuffer() };
}

/** Why the storage refused an upload: its status, and the reason word it gave when there is one ("403 AccessDenied"). */
export async function storageRefusal(res: Response): Promise<string> {
  const code = /<Code>([A-Za-z]{2,40})<\/Code>/.exec(await res.text().catch(() => ''))?.[1];
  return code ? `${res.status} ${code}` : String(res.status);
}

/** Listener counts of every voice room with people in it (LiveKit room names, e.g. oda-r1). */
export const liveRooms = () => call<{ rooms: { room: string; listeners: number }[] }>('GET', '/api/rooms/live').then((r) => r.rooms);

// --- Live mode (lib/live): profile, people, rooms, messages, follows and the Gelir wallet on the server.
export type ServerProfile = { username: string | null; gender: 'Kadın' | 'Erkek' | null; age: number | null; city: string | null; bio: string; interests: string[]; avatarUrl: string | null };
/** `genderHidden`: I chose "Gizli" (others don't get my gender; I still do). */
export type ServerMe = ServerUser & ServerProfile & { role?: string; genderHidden?: boolean };
/** How far someone is from me by our two profile cities (server/api/city-coords.mjs), rounded: never a location.
 *  Null when either city is unknown or their profile is private to me; an older server sends none. */
export type CityDistance = { km: number; sameCity: boolean };
/** `followers` / `following`: totals; `oneWay`: the same without the people who follow each other (friends), as the
 *  profile shows them (lib/follow-ties tieCounts; an older server sends none). */
export type PublicUser = { id: string; name: string } & ServerProfile & { followers: number; following: number; oneWay?: { followers: number; following: number }; isFollowing: boolean; blockedByMe: boolean } & Partial<ProfileMore> & { distance?: CityDistance | null };
export type UserCard = { id: string; name: string; avatarUrl: string | null };
/** `level` / `xp`: the owner's room level, earned on the server from gifts in their room. `micCount` / `layoutId`:
 *  the mics and layout the owner or a room admin chose (null = the default). `lockedSeats`: mics the staff locked;
 *  `micQueue`: members ask for a mic and the staff let them up. */
export type ServerRoom = {
  id: string;
  owner: UserCard;
  title: string;
  announcement: string;
  roomType: string;
  hasPassword: boolean;
  createdAt: string;
  closed: boolean;
  /** Resting for lack of staff (server/api/room-autoclose.mjs): only its owner and admins get in, and their coming
   *  opens it again. An older server sends none. */
  paused?: boolean;
  listeners: number;
  level?: number;
  xp?: number;
  micCount?: number | null;
  layoutId?: string | null;
  lockedSeats?: number[];
  micQueue?: boolean;
  /** The owner's choice of look: a room background id (null: none), the theme, gift effects on or off. */
  coverId?: string | null;
  theme?: string;
  giftEffects?: boolean;
  /** Oda süslemesi and Oda kapağı (server/api/room-decor.mjs): the free background chosen (null: the theme's
   *  stage), what every phone draws behind the stage now, and the uploaded card picture. An older server sends none. */
  bgId?: string | null;
  background?: RoomBackground;
  coverUrl?: string | null;
  /** Oda ayarları and Moderasyon, the same on every phone (server/api/room-rules.mjs). */
  rules?: RoomRules;
  /** Patron koltuğu's holder while their sitting runs (server/api/boss-seat.mjs; what older apps read). */
  boss?: UserCard | null;
  /** Patron koltuğu while it is on: its mode, the sitting and the numbers the sheet shows. An older server sends none. */
  bossSeat?: BossSeatView | null;
  /** The Odalar row's chips (server/api/room-social.mjs): the owner's agency or family, a running in-room PK, and
   *  the room's place in this week's gift ranking (1–3, else null). */
  agency?: { id: string; name: string } | null;
  family?: { id: string; name: string } | null;
  pk?: boolean;
  weekRank?: number | null;
  /** Following the room (server/api/room-follow.mjs), on the read of one room: how many follow it, and whether I do. */
  followers?: number;
  following?: boolean;
};
/**
 * Patron koltuğu as the server reads it (server/api/boss-seat.mjs). `mode`: Otomatik (gifts decide) or Davet (the owner
 * seats someone). `holder` while a sitting runs; `until` its end (null: Davet, no end), `left` seconds to it as of the
 * read, `spent` the holder's coins in this sitting. `minCoins` one send needs to sit on the empty seat, `minutes` a
 * sitting lasts and each further gift adds, `holdSeconds` before anyone may take the seat.
 */
export type BossSeatView = {
  mode: 'auto' | 'invite';
  holder: UserCard | null;
  since: string | null;
  until: string | null;
  left: number | null;
  spent: number;
  minCoins: number;
  minutes: number;
  holdSeconds: number;
};
/** Davet mode: the owner seats someone or takes them off; either mode: the holder gets up. */
export type BossAction = { action: 'seat'; user: string } | { action: 'clear' | 'leave' };
export const roomBoss = (room: string, body: BossAction) => call<{ room: ServerRoom }>('POST', '/api/rooms/boss', { room, ...body }).then((r) => r.room);
/** A server room's rules (server/api/room-rules.mjs). */
export type RoomRules = {
  micPermission: 'everyone' | 'members';
  bossSeat: boolean;
  /** An older server sends none (Otomatik). */
  bossMode?: 'auto' | 'invite';
  joinMode: 'open' | 'apply' | 'closed';
  manageMembers: 'owner' | 'admins';
  manageFunctions: 'owner' | 'admins';
  autoRemoveDays: 0 | 7 | 14 | 30;
  /** Most people in the room at once; null: the level's most. */
  limit: number | null;
  profileVisible: boolean;
  videoPrivacy: boolean;
  bot: boolean;
  slowMode: boolean;
  words: string[];
};
export type RoomMember = UserCard & { since: string };
export type RoomMembers = { members: RoomMember[]; total: number; cap: number; mine: 'owner' | 'member' | 'pending' | null; joinMode: RoomRules['joinMode']; canManage: boolean; pending: RoomMember[] };
/** `image`: a photo in the chat (its storage address), null for text only. */
export type DirectMessage = { id: number; from: string; to: string; text: string; image?: string | null; createdAt: string; readAt: string | null };
export type ServerConversation = { user: UserCard; last: DirectMessage; unread: number };
export type ServerLock = { id: number; amount: number; channel: string; channelLabel: string; unlockAt: string; createdAt: string; from: { id: string; name: string } | null; gift: { id: string; count: number } | null };
export type ServerEarnings = { diamonds: number; withdrawable: number; locked: number; lockDays: { store: number; jeton: number }; locks: ServerLock[] };

export type ProfilePatch = { name?: string; gender?: 'Kadın' | 'Erkek'; birthDate?: string; city?: string; bio?: string; interests?: string[]; avatarUrl?: string | null };
export const updateProfile = (p: ProfilePatch) => call<{ user: ServerMe }>('PATCH', '/api/me', p).then((r) => r.user);
/** Someone's agency (an approved one they stream in now) and family, on their profile. */
export type ProfileTies = { agency: { id: string; name: string } | null; family: { id: string; name: string; role: 'owner' | 'helper' | 'member' } | null };
/** `visit`: opened on the profile screen, so it counts as a visit (Profil ziyaretçileri); a person card doesn't. */
export const userProfile = (id: string, visit = false) =>
  call<{ user: PublicUser } & Partial<ProfileTies>>('GET', `/api/user?id=${encodeURIComponent(id)}${visit ? '&visit=1' : ''}`).then((r) => ({ ...r.user, agency: r.agency ?? null, family: r.family ?? null }));
/** Someone who opened my profile in the last 7 days. */
export type ServerVisitor = { id: string; name: string; avatarUrl: string | null; visits: number; lastAt: string };
/** Profil ziyaretçileri: how many came (everyone), and who (`visitors`, VIP only: null without it). */
export const myVisitors = () => call<{ count: number; visitors: ServerVisitor[] | null }>('GET', '/api/me/visitors');
export const follow = (to: string, on: boolean) => call<{ following: boolean }>('POST', '/api/follow', { to, follow: on }).then((r) => r.following);
/** Keşfet: real people, most recently active first, with how far each is from me by city (no location). */
export type DiscoverUser = { id: string; name: string } & ServerProfile & { online: boolean; levels?: Levels; country?: string | null; distance?: CityDistance | null };
/** Keşfet's lists (server/api/social.mjs): most recently active, newest accounts, or who 1v1 lifts. */
export type DiscoverList = 'home' | 'new' | 'featured';
export const discover = (list: DiscoverList = 'home') => call<{ users: DiscoverUser[] }>('GET', `/api/discover${list === 'home' ? '' : `?list=${list}`}`).then((r) => r.users);
/** Blocking also ends follows both ways on the server; the other person is not told. */
export const block = (to: string, on: boolean) => call<{ blocked: boolean }>('POST', '/api/block', { to, block: on }).then((r) => r.blocked);
export const followingList = () => call<{ users: UserCard[] }>('GET', '/api/following').then((r) => r.users);
export type FollowCard = UserCard & { followedAt: string };
/** Who follows me / whom I follow, newest first, both ways counted (the server refuses anyone else's lists). */
export const followList = (side: 'followers' | 'following') => call<{ users: FollowCard[] }>('GET', `/api/${side}`).then((r) => r.users);

export const serverRooms = () => call<{ rooms: ServerRoom[] }>('GET', '/api/rooms').then((r) => r.rooms);

/** Oda içi PK on the server (server/api/pk.mjs): ids are server user ids, times ISO; `now` is the server's clock. */
export type ServerPk = {
  id: string;
  room: string;
  mode: 'solo' | 'team';
  status: 'active' | 'done' | 'cancelled';
  startedBy: string;
  durationMin: number;
  participants: string[];
  red: string[];
  blue: string[];
  startAt: string;
  endAt: string;
  /** Points per sender → recipient (team: the recipient's team). */
  pairs: { from: string; to: string; team: 'red' | 'blue' | null; points: number; gifts: number }[];
  people: UserCard[];
};
export type ServerPkAnswer = { pk: ServerPk | null; now: string };
export type ServerPkStart = { room: string; mode: 'solo'; durationMin: number; participants: string[]; ref: string } | { room: string; mode: 'team'; durationMin: number; red: string[]; blue: string[]; ref: string };
export const roomPk = (room: string) => call<ServerPkAnswer>('GET', `/api/rooms/pk?room=${encodeURIComponent(room)}`);
export const startServerPk = (body: ServerPkStart) => call<ServerPkAnswer>('POST', '/api/rooms/pk', body);
export const cancelServerPk = (room: string) => call<ServerPkAnswer>('POST', '/api/rooms/pk/cancel', { room });
/** `password` (4–32 characters, optional): only people who type it get into the room's voice. */
export const createRoom = (title: string, announcement = '', roomType = 'free', password?: string) =>
  call<{ room: ServerRoom }>('POST', '/api/rooms', { title, announcement, roomType, ...(password ? { password } : {}) }).then((r) => r.room);
export const closeRoom = (id: string) => call<{ closed: boolean }>('POST', '/api/rooms/close', { id });
/** One room as everyone sees it now (listeners, level, mics, layout). */
export const serverRoom = (id: string) => call<{ room: ServerRoom }>('GET', `/api/room?id=${encodeURIComponent(id)}`).then((r) => r.room);
/** What the room screen can change on the server: the name and bulletin (owner and Süper Yönetici), the lock
 *  (owner only), the mics, the layout and the mic queue (owner or a room admin; null = back to the default). */
export type RoomPatch = {
  title?: string;
  announcement?: string;
  password?: string | null;
  micCount?: number | null;
  layoutId?: string | null;
  micQueue?: boolean;
  coverId?: string | null;
  theme?: string;
  giftEffects?: boolean;
  roomType?: string;
  rules?: Partial<RoomRules>;
};
export const updateRoom = (id: string, patch: RoomPatch) => call<{ room: ServerRoom }>('POST', '/api/rooms/update', { id, ...patch }).then((r) => r.room);
/**
 * Oda Süslemesi and Oda Kapağı as the room's settings show them (server/api/room-decor.mjs; the demo builds the same
 * from its own state, lib/room-decor). `pick`: what is chosen over the free background ('custom', a paid sku or
 * null); `showing`: what the room draws now. `paid.items[].until`: owned until then; `custom.until`: the paid term.
 */
export type RoomDecor = {
  level: number;
  canEdit: boolean;
  owner: boolean;
  bgId: string | null;
  pick: string | null;
  showing: RoomBackground;
  free: { id: string; minLevel: number; open: boolean }[];
  paid: { on: boolean; items: { sku: string; name: string; price: number; days: number; onSale: boolean; until: string | null }[] };
  custom: { on: boolean; price: number; days: number; until: string | null; url: string | null; changesLeft: number; removed: boolean };
  cover: { url: string | null };
};
type DecorAnswer = { room: ServerRoom; decor: RoomDecor };
export const roomDecor = (room: string) => call<{ decor: RoomDecor }>('GET', `/api/rooms/decor?room=${encodeURIComponent(room)}`).then((r) => r.decor);
/** A free background (`bgId` null: the theme's stage), or one of what the owner has: 'custom' or a paid sku. */
export const pickRoomBackground = (room: string, pick: { pick: 'free'; bgId: string | null } | { pick: string }) => call<DecorAnswer>('POST', '/api/rooms/decor/pick', { room, ...pick });
export const buyRoomBackground = (room: string, sku: string, price: number, ref: string) =>
  call<DecorAnswer & { user: ServerUser; replay: boolean }>('POST', '/api/rooms/decor/buy', { room, sku, price, ref });
/** The owner's own picture (already uploaded, kind 'roombg'): a purchase outside a term (`charged`), a free change inside one. */
export const setRoomCustomBackground = (room: string, url: string, price: number, ref: string) =>
  call<DecorAnswer & { user?: ServerUser; replay?: boolean; charged: boolean }>('POST', '/api/rooms/decor/custom', { room, url, price, ref });
export const removeRoomCustomBackground = (room: string) => call<DecorAnswer>('POST', '/api/rooms/decor/custom/remove', { room });
/** Oda Kapağı: an uploaded picture (kind 'roomcover') as the room's card picture; null takes it off. */
export const setRoomCover = (room: string, url: string | null) => call<{ room: ServerRoom }>('POST', '/api/rooms/cover', { room, url }).then((r) => r.room);
/** Oda üyeleri (server/api/rooms.mjs): the list, my membership and, for those who answer them, the requests. */
export const roomMembers = (room: string) => call<RoomMembers>('GET', `/api/rooms/members?room=${encodeURIComponent(room)}`);
export const joinRoomMembers = (room: string) => call<{ status: 'member' | 'pending' }>('POST', '/api/rooms/members/join', { room });
export const leaveRoomMembers = (room: string) => call<{ status: null }>('POST', '/api/rooms/members/leave', { room });
export const answerRoomMember = (room: string, user: string, accept: boolean) => call<{ status: 'member' | null }>('POST', '/api/rooms/members/answer', { room, user, accept });
export const removeRoomMember = (room: string, user: string) => call<{ status: null }>('POST', '/api/rooms/members/remove', { room, user });
/** The room card's member list (server/api/room-members.mjs): staff first, then members, a page at a time.
 *  `seenAt`: when they were last in the room (null: not known, or they don't show it). */
export type RoomMemberFilter = 'all' | 'in' | 'out' | 'pending';
export type RoomMemberRow = UserCard & { role: 'owner' | 'super' | 'admin' | 'member' | 'pending'; since: string | null; seenAt: string | null; inRoom: boolean };
export type RoomMemberPage = { rows: RoomMemberRow[]; counts: Record<RoomMemberFilter, number>; nextOffset: number | null; canManage: boolean };
export const roomMemberList = (room: string, filter: RoomMemberFilter, offset = 0) =>
  call<RoomMemberPage>('GET', `/api/rooms/members/list?room=${encodeURIComponent(room)}&filter=${filter}&offset=${offset}`);
/** Following a room (server/api/room-follow.mjs): the follow is on the room's account, so it stays when the room
 *  closes and opens again. `followedRooms`: open ones first, then the closed ones (`closed`). */
export type RoomFollowAnswer = { following: boolean; followers: number };
export const followRoom = (room: string) => call<RoomFollowAnswer>('POST', '/api/rooms/follow', { room });
export const unfollowRoom = (room: string) => call<RoomFollowAnswer>('POST', '/api/rooms/unfollow', { room });
export const followedRooms = () => call<{ rooms: ServerRoom[] }>('GET', '/api/rooms/followed').then((r) => r.rooms);
/** Oda etkinlikleri (server/api/room-events.mjs). */
export type ServerRoomEvent = { id: number; title: string; desc: string; when: string; type: string; by: { id: string; name: string }; going: boolean; attendees: number; cancelled: boolean; createdAt: string; mine: boolean };
export const roomEvents = (room: string) => call<{ events: ServerRoomEvent[] }>('GET', `/api/rooms/events?room=${encodeURIComponent(room)}`).then((r) => r.events);
export const addRoomEvent = (room: string, e: { title: string; desc: string; when: string; type: string }) => call<{ event: ServerRoomEvent }>('POST', '/api/rooms/events', { room, ...e }).then((r) => r.event);
export const cancelRoomEvent = (id: number) => call<{ event: ServerRoomEvent }>('POST', '/api/rooms/events/cancel', { id }).then((r) => r.event);
export const goRoomEvent = (id: number, going: boolean) => call<{ event: ServerRoomEvent }>('POST', '/api/rooms/events/going', { id, going }).then((r) => r.event);

// Bağlar (server/api/bonds.mjs). `partner` is the other person as the asker (or the profile owner) sees it.
export type ServerBond = {
  id: number; kind: string; label: string; status: 'pending' | 'active' | 'refused' | 'expired' | 'withdrawn' | 'ended'; requester: boolean;
  partner: UserCard; price: number; score: number; level: number; nextLevelAt: number | null; createdAt: string; expiresAt: string; since: string | null;
};
export const bonds = (user?: string) => call<{ hidden: boolean; bonds: ServerBond[] }>('GET', user ? `/api/bonds?user=${encodeURIComponent(user)}` : '/api/bonds');
export const bondRequests = () => call<{ incoming: ServerBond[]; outgoing: ServerBond[] }>('GET', '/api/bonds/requests');
export const requestBond = (to: string, kind: string, ref = newRef()) => call<{ user: ServerUser; replay: boolean; bond: ServerBond }>('POST', '/api/bonds/request', { to, kind, ref });
export const respondBond = (id: number, accept: boolean) => call<{ bond: ServerBond }>('POST', '/api/bonds/respond', { id, accept }).then((r) => r.bond);
export const withdrawBond = (id: number) => call<{ bond: ServerBond }>('POST', '/api/bonds/withdraw', { id }).then((r) => r.bond);
export const endBond = (id: number) => call<{ bond: ServerBond }>('POST', '/api/bonds/end', { id }).then((r) => r.bond);
export const bondsAmong = (ids: string[]) => call<{ bonds: { a: string; b: string; kind: string; level: number }[] }>('POST', '/api/bonds/among', { ids }).then((r) => r.bonds);
export const setBondsHidden =(hidden: boolean) => call<{ hidden: boolean }>('POST', '/api/bonds/privacy', { hidden }).then((r) => r.hidden);

// Rüzgâr Gülü (server/api/wheel.mjs): the server draws and pays; prizes are game coins.
export type ServerWheelSpin = { id: number; tier: string; count: number; cost: number; fromGame: number; payout: number; jackpot: number; slices: number[]; wins: number[]; at: string };
export type ServerWheelPerson = { id: string; name: string; avatarUrl: string | null };
export type ServerWheel = {
  tiers: { id: string; label: string; price: number; jackpot: number }[];
  dailyLimit: number; playedToday: number; needLevel: number; allowed: boolean; gameCoins: number;
  winners: (ServerWheelPerson & { tier: string; payout: number; jackpot: number; best: number; at: string })[];
  board: (ServerWheelPerson & { total: number })[];
  mine: ServerWheelSpin[];
};
export const wheel = () => call<ServerWheel>('GET', '/api/wheel');
export const wheelSpin = (tier: string, count: number, ref = newRef()) => call<{ spin: ServerWheelSpin; user: ServerUser; replay: boolean }>('POST', '/api/wheel/spin', { tier, count, ref });

// Şanslı hediyeler (server/api/lucky.mjs): the server draws and pays; rewards are game coins, the recipients get
// their share as diamonds. `draws`: one multiplier per gift, recipient by recipient (`count` each).
export type ServerLuckyTier = { mult: number; weight: number };
export type ServerLuckyGift = { id: string; name: string; emoji: string; price: number; enabled: boolean; tiers: ServerLuckyTier[]; open?: boolean };
export type ServerLuckySend = {
  id: number; ref: string; giftId: string; room: string | null; count: number; to: string[]; price: number; cost: number; shared: number;
  payout: number; best: number; draws: number[]; configVersion: number; odds: ServerLuckyTier[]; at: string;
};
export type ServerLucky = {
  version: number; gifts: ServerLuckyGift[]; announceFrom: number; share: number; counts: number[]; needLevel: number; allowed: boolean;
  minAge: number; gameCoins: number; mine: ServerLuckySend[];
};
export const lucky = () => call<ServerLucky>('GET', '/api/lucky');
export const luckySend = (giftId: string, to: string[], count: number, room?: string, ref = newRef()) =>
  call<{ send: ServerLuckySend; user: ServerUser; replay: boolean }>('POST', '/api/lucky/send', { giftId, to, count, room, ref });
export type ServerLuckyConfig = { gifts: ServerLuckyGift[]; dailyPayoutLimit: number; announceFrom: number };
export type ServerLuckyStats = { sends: number; spent: number; paid: number; shared: number };
export type ServerLuckyAdminSend = ServerLuckySend & { sender: { id: string; name: string } };
export type ServerLuckyAdmin = {
  config: ServerLuckyConfig; version: number; updatedAt: string | null; stats: { today: ServerLuckyStats; total: ServerLuckyStats };
  recent: ServerLuckyAdminSend[]; winners: ServerLuckyAdminSend[];
};
/** Admins only (403 otherwise). A save on an older version answers 409: read again and retry. */
export const luckyAdmin = () => call<ServerLuckyAdmin>('GET', '/api/admin/lucky');
/** Yönetim › Oyun Salonu raporu (server/api/casino.mjs, admin role). */
export type CasinoReportGame = { id: string; name: string; rounds: number; players: number; wagered: number; paid: number; house: number };
export type CasinoReportPeriod = { rounds: number; wagered: number; paid: number; house: number; games: CasinoReportGame[] };
export type CasinoReport = {
  /** The house book since the start: coins played, the house's 60 %, the payout pool now, what it paid, its opening advance. */
  book: { wagered: number; house: number; pool: number; paid: number; seed: number };
  jackpots: Record<string, number>;
  periods: Record<'today' | 'week' | 'month' | 'kept', CasinoReportPeriod>;
};
export const casinoReport = () => call<CasinoReport>('GET', '/api/admin/casino/report');
export const saveLuckyConfig = (config: ServerLuckyConfig, version: number) =>
  call<{ config: ServerLuckyConfig; version: number; updatedAt: string }>('POST', '/api/admin/lucky/config', { config, version });

export const sendDm = (to: string, text: string, ref = newRef(), image?: string) =>
  call<{ message: DirectMessage; replay: boolean }>('POST', '/api/messages', { to, text, ref, ...(image && { image }) }).then((r) => r.message);
export const dmThread = (peer: string) => call<{ messages: DirectMessage[] }>('GET', `/api/messages?with=${encodeURIComponent(peer)}`).then((r) => r.messages);
export const conversations = () => call<{ conversations: ServerConversation[] }>('GET', '/api/conversations').then((r) => r.conversations);
export const markDmRead = (peer: string) => call<{ read: number }>('POST', '/api/messages/read', { with: peer });
/**
 * A refusal the app made before sending (lib/contact-filter), for the moderators' count: the kind and the place,
 * never the text. It counts towards the automatic mute too; the answer (tries left, or that the mute began) goes
 * to the contact filter's note.
 */
export async function countContactRefusal(category: string, place: string) {
  const r = await call<{ counted: boolean } & ContactStrike>('POST', '/api/contact/refusals', { category, place });
  noteContactStrike(r);
  return r;
}

export const earnings = () => call<ServerEarnings>('GET', '/api/wallet/earnings');
/** An in-app purchase paid with coins (VIP, store items, game entries): the server takes the coins once. */
export const spend = (amount: number, reason: string, ref = newRef()) => call<{ user: ServerUser; replay: boolean }>('POST', '/api/wallet/spend', { amount, reason, ref });
/** Çevir. `usdTry`: the rate the screen showed; the server never gives less than it, and answers 409 rate_changed
 *  (nothing taken) when its own rate is lower now. */
export const exchange = (diamonds: number, ref = newRef(), usdTry?: number) =>
  call<{ user: ServerUser; replay: boolean; coins: number }>('POST', '/api/wallet/exchange', { diamonds, ref, ...(usdTry === undefined ? {} : { usdTry }) });

// Gizlilik, who may reach me and Arkadaşlarım (server/api/privacy.mjs); call history, heart points, the call figures and
// the call task (server/api/call-log.mjs).
export type ServerPrivacy = {
  profilePublic: boolean;
  showOnline: boolean;
  showLastSeen: boolean;
  showCurrentRoom: boolean;
  dmFrom: 'everyone' | 'following' | 'mutual';
  callsFrom: 'everyone' | 'following' | 'nobody';
  invitesFrom: 'everyone' | 'following' | 'nobody';
};
export const myPrivacy = () => call<{ privacy: ServerPrivacy }>('GET', '/api/me/privacy').then((r) => r.privacy);
/** Changes some settings; the answer is all of them as the server has them now. */
export const updatePrivacy = (patch: Partial<ServerPrivacy>) => call<{ privacy: ServerPrivacy }>('PATCH', '/api/me/privacy', patch).then((r) => r.privacy);
/** Someone I follow or who follows me; `online` and `lastSeenAt` only as far as they (and I) show them. */
export type ServerFriend = UserCard & { iFollow: boolean; followsMe: boolean; online: boolean; lastSeenAt: string | null };
export const myFriends = () => call<{ friends: ServerFriend[] }>('GET', '/api/me/friends').then((r) => r.friends);
/** A finished call (status: ended = answered, missed, declined, cancelled by the caller). */
export type ServerCallLog = {
  id: number;
  mode: 'voice' | 'video';
  outgoing: boolean;
  status: 'ended' | 'missed' | 'declined' | 'cancelled';
  seconds: number;
  coins: number;
  iPay: boolean;
  iEarn: boolean;
  other: UserCard;
  at: string;
};
/** My calls both ways, newest first; `next` is the `before` of the next page (null: no more). */
export const myCalls = (before?: number) => call<{ calls: ServerCallLog[]; next: number | null }>('GET', `/api/me/calls${before ? `?before=${before}` : ''}`);
export const clearMyCalls = () => call<{ cleared: boolean }>('POST', '/api/me/calls/clear', {});
/** Heart points with each person I share any (most first). */
export const myHearts = () => call<{ hearts: { id: string; points: number; level: number }[] }>('GET', '/api/me/hearts').then((r) => r.hearts);
/** This week's paid calls and matches I earned from: how many, their paid minutes, the diamonds. */
export type ServerCallStats = { calls: number; minutes: number; diamonds: number };
export const myCallStats = () => call<{ week: ServerCallStats }>('GET', '/api/me/call-stats').then((r) => r.week);
/** Görevler › "1 görüntülü arama yap" today, as the server counts it. */
export type ServerCallTask = { goal: number; done: number; reward: number; minSeconds: number; claimed: boolean };
export const myCallTask = () => call<{ task: ServerCallTask }>('GET', '/api/me/call-task').then((r) => r.task);
export const claimCallTask = () => call<{ user: ServerUser; replay: boolean; task: ServerCallTask; backpack?: { giftId: string; count: number } | null }>('POST', '/api/me/call-task/claim', {});
// Room social (server/api/room-social.mjs): mic invites, the room poll, upcoming events, my rooms, follower invites.
export type MicInviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'failed' | 'cancelled';
/** `expiresIn`: ms left to answer by the server's clock (0 once answered); `seat` null: any free mic. */
export type ServerMicInvite = { id: number; room: string; from: { id: string; name: string }; to: { id: string; name: string }; seat: number | null; status: MicInviteStatus; note: string; expiresIn: number; createdAt: string };
export const roomMicInvites = (room: string) => call<{ invites: ServerMicInvite[] }>('GET', `/api/rooms/invites?room=${encodeURIComponent(room)}`).then((r) => r.invites);
export const sendMicInvite = (room: string, user: string, seat?: number) => call<{ invite: ServerMicInvite }>('POST', '/api/rooms/invite', { room, user, ...(seat === undefined ? {} : { seat }) }).then((r) => r.invite);
export const answerMicInvite = (id: number, accept: boolean, seat?: number) =>
  call<{ invite: ServerMicInvite }>('POST', '/api/rooms/invite/answer', { id, accept, ...(seat === undefined ? {} : { seat }) }).then((r) => r.invite);
/** `votes` / `total` are null while the poll hides its results from me (not live, I haven't voted, still open). */
export type ServerPoll = { id: number; room: string; question: string; options: { text: string; votes: number | null }[]; total: number | null; myVote: number | null; live: boolean; endsIn: number; closed: boolean; by: { id: string; name: string } };
export const roomPoll = (room: string) => call<{ poll: ServerPoll | null }>('GET', `/api/rooms/poll?room=${encodeURIComponent(room)}`).then((r) => r.poll);
export const startRoomPoll = (room: string, p: { question: string; options: string[]; seconds: number; live: boolean }) => call<{ poll: ServerPoll }>('POST', '/api/rooms/poll', { room, ...p }).then((r) => r.poll);
export const voteRoomPoll = (id: number, option: number) => call<{ poll: ServerPoll }>('POST', '/api/rooms/poll/vote', { id, option }).then((r) => r.poll);
export const closeRoomPoll = (id: number) => call<{ poll: ServerPoll }>('POST', '/api/rooms/poll/close', { id }).then((r) => r.poll);
export type UpcomingEvent = { id: number; title: string; when: string; type: string; room: { id: string; title: string }; attendees: number; going: boolean; createdAt: string };
export const upcomingEvents = () => call<{ events: UpcomingEvent[] }>('GET', '/api/rooms/events/upcoming').then((r) => r.events);
export const joinedRooms = () => call<{ rooms: ServerRoom[] }>('GET', '/api/rooms/joined').then((r) => r.rooms);
/** `waitMs`: how long until the room's account may invite its followers again (0: now). */
export type FollowerInviteInfo = { count: number; lastAt: string | null; waitMs: number };
export const followerInviteInfo = (room: string) => call<FollowerInviteInfo>('GET', `/api/rooms/invite-followers?room=${encodeURIComponent(room)}`);
export const inviteFollowers = (room: string) => call<FollowerInviteInfo & { sent: number }>('POST', '/api/rooms/invite-followers', { room });
/** `kind: 'open'`: not an invite, a room I follow that opened (server/api/room-follow.mjs). */
export type FollowerRoomInvite = { id: number; kind?: 'open'; room: { id: string; title: string }; host: { id: string; name: string }; at: string };
export const myRoomInvites = () => call<{ invites: FollowerRoomInvite[] }>('GET', '/api/me/room-invites').then((r) => r.invites);
// Other people's profiles (server/api/profiles.mjs): levels, personal extras, the album and the Vitrin.
/** Cömertlik and Yankı levels as the server counts them (it never sends someone else's points); null: a level its
 *  owner hides ("Seviyeyi Gizle", a VIP right). */
export type Levels = { wealth: number | null; charm: number | null };
/** What a person filled in about themselves; null or [] when they didn't. */
export type ServerExtras = { height: number | null; weight: number | null; job: string | null; languages: string[]; zodiac: string | null; tags: string[]; relationship: string | null; education: string | null; slogan: string | null; country: string | null };
export type AlbumPhoto = { id: number; url: string };
/** What GET /api/user also carries for the profile screen (missing from an older server). Friends: people who follow
 *  each other. `levelsHidden`: on my own profile only, which of my levels others don't see now. */
export type ProfileMore = {
  levels: Levels;
  friends: number;
  giftsReceived: number;
  staff: 'admin' | 'moderator' | null;
  extras: ServerExtras;
  photos: AlbumPhoto[];
  levelsHidden?: { wealth: boolean; charm: boolean };
};
/** Vitrin: catalog gifts received (by id), the rides and entry effects owned now (shop skus), medals and titles earned. */
export type Showcase = { gifts: { id: string; count: number }[]; rides: string[]; entries: string[]; medals: string[]; titles: string[] };
export const showcase = (id: string) => call<Showcase>('GET', `/api/user/showcase?id=${encodeURIComponent(id)}`);
/** Only the fields sent change; null, '' or [] clears one. Hiding a level needs VIP (403 otherwise). */
export type ExtrasPatch = Partial<ServerExtras> & { genderHidden?: boolean; hideWealth?: boolean; hideCharm?: boolean };
export const saveExtras = (p: ExtrasPatch) =>
  call<{ extras: ServerExtras & { genderHidden: boolean; hideWealth: boolean; hideCharm: boolean } }>('PATCH', '/api/me/extras', p).then((r) => r.extras);
/** Albüm: a photo already in the storage (kind 'album'); the answer is my album, newest first. */
export const addAlbumPhoto = (url: string) => call<{ photos: AlbumPhoto[] }>('POST', '/api/me/photos', { url }).then((r) => r.photos);
export const removeAlbumPhoto = (id: number) => call<{ photos: AlbumPhoto[] }>('POST', '/api/me/photos/remove', { id }).then((r) => r.photos);
// Destek talepleri (server/api/support.mjs): my tickets and their threads; staff answer them in Yönetim › Destek.
// Staff lines reach me as 'support', never with a name. Evidence photos go up first (lib/live/profile uploadPhoto 'ticket').
export type ServerTicketStatus = 'open' | 'answered' | 'reopened' | 'closed';
export type ServerTicketLine = { id: string; from: 'user' | 'support'; text: string; createdAt: string; by?: { id: string; name: string } };
export type ServerTicket = {
  id: string; number: string; category: string; feedback: boolean; text: string; photos: string[]; status: ServerTicketStatus;
  createdAt: string; updatedAt: string; closedAt: string | null; messages: ServerTicketLine[];
};
/** A ticket as staff see it: whose it is, who closed it, and in the queue how many lines and the last one. */
export type StaffTicket = ServerTicket & {
  user: { id: string; name: string; username: string | null; since: string }; closedBy: string | null;
  lines?: number; last?: { from: 'user' | 'support'; text: string; createdAt: string } | null;
};
export type StaffQueue = 'waiting' | 'answered' | 'closed';
export const myTickets = () => call<{ tickets: ServerTicket[]; open: number; maxOpen: number }>('GET', '/api/support/tickets');
export const openTicket = (t: { category: string; text: string; photos?: string[]; feedback?: boolean }, ref = newRef()) =>
  call<{ ticket: ServerTicket; replay: boolean }>('POST', '/api/support/tickets', { ...t, ref }).then((r) => r.ticket);
export const replyTicket = (id: string, text: string) => call<{ ticket: ServerTicket }>('POST', '/api/support/reply', { id, text }).then((r) => r.ticket);
export const closeTicket = (id: string) => call<{ ticket: ServerTicket }>('POST', '/api/support/close', { id }).then((r) => r.ticket);
/** Staff only (403 otherwise). */
export const staffTickets = (status: StaffQueue) => call<{ tickets: StaffTicket[]; waiting: number }>('GET', `/api/admin/support?status=${status}`);
export const staffTicket = (id: string) => call<{ ticket: StaffTicket }>('GET', `/api/admin/support/ticket?id=${encodeURIComponent(id)}`).then((r) => r.ticket);
export const staffReply = (id: string, text: string, close = false) => call<{ ticket: StaffTicket }>('POST', '/api/admin/support/reply', { id, text, close }).then((r) => r.ticket);
export const staffTicketStatus = (id: string, status: 'open' | 'answered' | 'closed') =>
  call<{ ticket: StaffTicket }>('POST', '/api/admin/support/status', { id, status }).then((r) => r.ticket);

/** Verilerimin kopyası (server/api/my-data.mjs, UK GDPR right of access): once in 24 hours; 429 export_wait (data.nextAt) after that. */
export const myDataExport = () => call<{ format: string; generatedAt: string } & Record<string, unknown>>('GET', '/api/me/export');

/** Günlük harcama limiti (server/api/spend-limit.mjs). `limit` null: none; `next`: a raise or a lift waiting its hours. */
export type ServerSpendLimit = { limit: number | null; next: { limit: number | null; at: string } | null; spentToday: number; left: number | null; day: string; resetsAt: string; raiseHours: number };
export const spendLimit = () => call<ServerSpendLimit>('GET', '/api/me/spend-limit');
/** 0 lifts it. Lower applies now; higher (or 0) after `raiseHours`. */
export const setSpendLimit = (limit: number) => call<ServerSpendLimit & { applied: 'now' | 'later' }>('POST', '/api/me/spend-limit', { limit });

/** Çantam (server/api/backpack.mjs): free gifts from rewards. `sources`: what each reward puts in now. */
export type BackpackItem = { giftId: string; count: number; source: string; label: string };
export type BackpackSource = { key: string; label: string; giftId: string; count: number };
export type ServerBackpack = { items: BackpackItem[]; sources: BackpackSource[] };
export const backpack = () => call<ServerBackpack>('GET', '/api/backpack');
/** A free gift from my backpack in a server room: no coins; 409 bag_short when there aren't enough. */
export const backpackSend = (to: string, giftId: string, count: number, room: string, ref = newRef()) =>
  call<{ user: ServerUser; replay: boolean; total: number; items: BackpackItem[] }>('POST', '/api/backpack/send', { to, giftId, count, room, ref });

/** Jeton Noktası (server/api/jeton.mjs). `mine`: this account is a Jeton Noktası. Blocks either way are left out. */
export type JetonTransfer = {
  id: number;
  kind: 'bank_sale' | 'diamond_sale' | 'wholesale';
  from: { id: string; name: string | null } | null;
  to: { id: string; name: string | null };
  coins: number;
  diamonds: number | null;
  valueTl: number | null;
  paymentRef: string | null;
  note: string | null;
  createdAt: string;
};
export const jetonBanks = () => call<{ banks: UserCard[]; mine?: boolean }>('GET', '/api/jeton/banks');
export const jetonTransfers = () => call<{ rows: JetonTransfer[] }>('GET', '/api/jeton/transfers').then((r) => r.rows);
/** A Jeton Noktası's buyers: who wrote to it lately (blocks either way left out). */
export const jetonBuyers = () => call<{ buyers: UserCard[] }>('GET', '/api/jeton/buyers').then((r) => r.buyers);
/** A Jeton Noktası sends coins from its stock to someone who paid it outside the app (paymentRef: the receipt). */
export const jetonTransfer = (to: string, coins: number, paymentRef: string, note: string, ref = newRef()) =>
  call<{ user: ServerUser; replay: boolean; transfer: JetonTransfer }>('POST', '/api/jeton/transfer', { to, coins, paymentRef, note, ref });
/** Where my coins came from (server/api/wallet.mjs): a Jeton Noktası's stock by source. */
export const walletCoins = () => call<{ coins: number; channels: { channel: string; label: string; remaining: number }[] }>('GET', '/api/wallet/coins');
/**
 * Odalar arası PK (server/api/pk-cross.mjs): `red` is the inviting room, `blue` the invited one; `score` each room's
 * points from its own gifts. 'invite' waits for the blue room's answer until `inviteExpiresAt`; 'active' covers the
 * countdown (before `startAt`). `reason`: why it ended early ('staff': a room's staff ended or withdrew it).
 * `pairs` leaves out people I have blocked or who blocked me (the scores still count them).
 */
export type ServerCrossPk = {
  id: string;
  status: 'invite' | 'active' | 'done' | 'cancelled' | 'declined' | 'expired';
  reason: 'staff' | 'room_closed' | null;
  endedRoom: string | null;
  durationMin: number;
  createdAt: string;
  inviteExpiresAt: string;
  startAt: string | null;
  endAt: string | null;
  red: { room: ServerRoom | null; score: number };
  blue: { room: ServerRoom | null; score: number };
  pairs: { from: string; to: string; side: 'red' | 'blue'; points: number; gifts: number }[];
  people: UserCard[];
};
export type ServerCrossPkAnswer = { cross: ServerCrossPk | null; now: string };
/** GET /api/rooms/pk also carries the room's cross-room PK (an older server sends no `cross`). */
export type ServerPkRead = ServerPkAnswer & { cross?: ServerCrossPk | null };
/** Rooms my room may invite now (`q`: a room's 8-digit ID or part of its name). Room staff only. */
export const crossPkRooms = (room: string, q = '') =>
  call<{ rooms: ServerRoom[] }>('GET', `/api/rooms/pk/cross/rooms?room=${encodeURIComponent(room)}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.rooms);
export const inviteCrossPk = (body: { room: string; to: string; durationMin: number; ref: string }) => call<ServerCrossPkAnswer>('POST', '/api/rooms/pk/cross', body);
export const answerCrossPk = (room: string, id: string, accept: boolean) => call<ServerCrossPkAnswer>('POST', '/api/rooms/pk/cross/answer', { room, id, accept });
/** Either room's staff: withdraws or declines an invite, or ends a running PK early (no winner). */
export const endCrossPk = (room: string) => call<ServerCrossPkAnswer>('POST', '/api/rooms/pk/cross/end', { room });

/**
 * Oda Sahibi Merkezi (server/api/room-owner.mjs), the room's owner only. `session`: counted since I came into the
 * room this time (`minutes` ago); false: the last 24 hours (`minutes` null). Visitors and gifts leave my own out.
 * `hours`: different people in the room in each of the last 10 hours, the current one last.
 */
export type ServerOwnerStats = {
  session: boolean;
  since: string;
  minutes: number | null;
  listeners: number;
  peak: number;
  visitors: number;
  visits: number;
  avgStayMin: number;
  newMembers: number;
  gifts: { coins: number; count: number; senders: number };
  level: number;
  xp: number;
  levelXp: number;
  nextXp: number | null;
  hours: { at: string; people: number }[];
};
export const roomOwnerStats = (room: string) => call<ServerOwnerStats>('GET', `/api/rooms/owner-stats?room=${encodeURIComponent(room)}`);
// Yeni üye ödülleri (server/api/referrals.mjs): the welcome coins I got at sign-up (0: none), the packs whose
// first-purchase gift is still mine, and Arkadaşını Getir: my code, the code I entered, what my invites brought.
export type ServerRewards = {
  welcome: { coins: number; on: boolean; amount: number };
  firstBonus: { on: boolean; packs: { productId: string; bonus: number }[] };
  invite: { on: boolean; coins: number; canEnter: boolean };
};
export const myRewards = () => call<ServerRewards>('GET', '/api/rewards');
/** pending: waiting for the friend's first room; refused: no reward (device: their phone had another account). */
export type InviteStatus = 'pending' | 'paid' | 'refused' | 'revoked';
export type MyInvite = { by: { id: string; name: string } | null; status: InviteStatus | null; reason: 'device' | 'blocked' | 'staff' | null; coins: number; canEnter: boolean; enterUntil: string };
export type InviteStats = { invited: number; rewarded: number; waiting: number; earned: number };
export type ServerInvite = { code: string; on: boolean; coins: number; dailyCap: number; enterDays: number; stats: InviteStats; mine: MyInvite };
export const myInvite = () => call<ServerInvite>('GET', '/api/invite');
/** 404 unknown code; 409 with data.code already | invite_off | too_late | newer | device. */
export const redeemInvite = (code: string) => call<{ mine: MyInvite }>('POST', '/api/invite/redeem', { code }).then((r) => r.mine);
// Oyun Salonu (server/api/casino.mjs): the server draws and pays; winnings are game coins. `outcome` is the round
// as lib/casino-odds outcomeOf builds it, for the screen to replay.
export type ServerCasinoGame = { id: string; name: string; active: boolean; bets: number[]; dailyLimit: number; playedToday: number; jackpot: number | null };
export type ServerCasinoRound = {
  id: number;
  game: string;
  bet: number;
  fromGame: number;
  payout: number;
  jackpot: number;
  pick: string | null;
  bets: Record<string, number> | null;
  place: 'profile' | 'room';
  detail: string;
  at: string;
  outcome?: Outcome;
};
export type ServerCasino = { games: ServerCasinoGame[]; needLevel: number; allowed: boolean; gameCoins: number; mine: ServerCasinoRound[] };
export type CasinoPlayBody = { game: string; bet?: number; pick?: string; bets?: Record<string, number>; place: 'profile' | 'room' };
export const casino = () => call<ServerCasino>('GET', '/api/casino');
export const casinoPlay = (body: CasinoPlayBody, ref = newRef()) =>
  call<{ round: ServerCasinoRound & { outcome: Outcome }; user: ServerUser; replay: boolean; fund: number | null }>('POST', '/api/casino/play', { ...body, ref });
/**
 * Oda oyunları at a table in a room (server/api/room-games.mjs): the room's one table, as I see it; `mySeat` −1 when I
 * watch. `TableCommon` is what every table carries. Each game adds its own fields, as the server's
 * room-games/<game>.mjs keeps them, and `game` tells them apart: narrow on it before reading a game's fields. A new
 * game adds its own type to `ServerTable` and its move to `TableMove`.
 */
type TableCommon = {
  room: string;
  name: string;
  min: number;
  max: number;
  status: 'waiting' | 'playing' | 'over';
  seats: UserCard[];
  mySeat: number;
  openedBy: string | null;
  openedAt: string;
  turn: number;
  turnEndsAt: string | null;
  winner: number | null;
  log: string;
  version: number;
};
/** Ludo (lib/room-games/ludo): its fields come with the first hand; a table still waiting has only `mode`. */
export type LudoServerTable = TableCommon & { game: 'ludo' } & Partial<LudoState>;
/**
 * Renk Kartları (lib/room-games/cards): `mine` only for my own cards (null when I don't sit there), `counts` everyone's
 * card count, the top of the two piles; a card is its number in the deck. Its fields come with the first hand.
 */
export type CardsServerTable = TableCommon & { game: 'cards' } & Partial<CardsSeen>;
/** XOX (lib/room-games/xox): the board with each seat's mark and hands won. */
export type XoxServerTable = TableCommon & { game: 'xox' } & Partial<XoxState>;
/** Dört Taş (lib/room-games/four): the board with each seat's colour and hands won. */
export type FourServerTable = TableCommon & { game: 'four' } & Partial<FourState>;
export type ServerTable = LudoServerTable | CardsServerTable | XoxServerTable | FourServerTable;
/**
 * A move as each game takes it: XOX { cell }, Dört Taş { col }, Renk Kartları { card, color? }, { draw: true } or
 * { pass: true }, Ludo { roll: true } then { token }.
 */
export type TableMove = XoxMove | FourMove | CardsMove | LudoMove;
export type TableAction = 'open' | 'join' | 'start' | 'move' | 'leave' | 'again' | 'close';
export const roomTable = (room: string) => call<{ table: ServerTable | null }>('GET', `/api/rooms/table?room=${encodeURIComponent(room)}`).then((r) => r.table);
/** `options`: the opener's choices with `open` (Ludo: Hızlı or Klasik). */
export const roomTableAction = (room: string, action: TableAction, extra: { game?: ServerTable['game']; options?: { mode?: LudoMode }; move?: TableMove } = {}) =>
  call<{ table: ServerTable | null }>('POST', '/api/rooms/table', { room, action, ...extra }).then((r) => r.table);
/** Sıralama › Oda XP (server/api/room-xp.mjs): open rooms by the room XP their gifts earned in the period. */
export type RoomXpRow = { rank: number; room: ServerRoom; score: number };
export const roomXpRankings = (period: 'day' | 'week' | 'month') => call<{ rows: RoomXpRow[] }>('GET', `/api/rankings/room-xp?period=${period}`).then((r) => r.rows);

// --- Sanctions (server/api/sanctions.mjs). With an appeal session (after a ban) only these two work.
export type MyAppeal = { id: number; sanctionId: number; status: 'open' | 'needs_review' | 'upheld' | 'reduced' | 'lifted'; note: string | null; createdAt: string; decidedAt: string | null };
/** `as`: the appeal session a ban refusal gave (the normal session otherwise). */
async function withSession<T>(as: string | null | undefined, run: () => Promise<T>) {
  if (!as) return run();
  // Read the saved session first: it must not land on top of the appeal session while this runs.
  await restoreSession();
  const saved = session;
  session = as;
  try {
    return await run();
  } finally {
    if (session === as) session = saved;
  }
}
export const mySanctions = (as?: string | null) => withSession(as, () => call<{ serverNow: string; sanctions: SanctionView[]; appeals: MyAppeal[] }>('GET', '/api/sanctions/mine', undefined, !!as));
export const appealSanction = (sanction: number, text: string, as?: string | null) =>
  withSession(as, () => call<{ appeal: MyAppeal }>('POST', '/api/sanctions/appeal', { sanction, text }, !!as).then((r) => r.appeal));
/** Room staff: mute someone in this room (text = chat, voice = mic); `minutes` null = until lifted (owner only). */
export const roomMute = (room: string, user: string, kind: 'text' | 'voice', minutes: number | null, reason?: string) =>
  call<{ sanction: SanctionView }>('POST', '/api/rooms/mute', { room, user, kind, minutes, ...(reason ? { reason } : {}) });
export const roomUnmute = (sanction: number) => call<{ lifted: boolean }>('POST', '/api/rooms/unmute', { sanction });
export const roomMutes = (room: string) => call<{ mutes: (SanctionView & { userId: string; userName: string })[] }>('GET', `/api/rooms/mutes?room=${encodeURIComponent(room)}`).then((r) => r.mutes);

// --- Canlı ayarlar (server/api/live-settings.mjs): admin role only (403 otherwise). Every save sends the reason,
// the version it was based on (baseV) and this app's version; a stale baseV answers 409 stale, a big change
// without confirm 409 confirm_needed (ApiError.data.v / .preview).
export type LiveKey =
  | 'features_off'
  | 'notice'
  | 'min_version'
  | 'gifts_hidden'
  | 'shop_hidden'
  | 'packs_hidden'
  | 'campaign'
  | 'exchange_usd_try'
  | 'withdraw_max_diamonds'
  | 'withdraw_weekly_diamonds'
  | 'otp_global_per_hour'
  | 'backpack_call_task'
  | OneOnOneKey
  | RewardKey
  | CasinoKey
  | DecorKey
  | RoomKey;
/** Odalar (server/api/live-registry.mjs, "Odalar"): when a room without its staff closes, and the Patron koltuğu's coins and minutes. */
export type RoomKey = 'room_staff_away_minutes' | 'boss_seat_coins' | 'boss_seat_minutes';
/** Oda süslemesi (server/api/live-registry.mjs, "Oda süslemesi"): which sales are off, Özel süsleme's price and days. */
export type DecorKey = 'room_decor_off' | 'room_bg_custom_price' | 'room_bg_custom_days';
/** Yeni üye ödülleri (server/api/live-registry.mjs): which rewards are off, and their amounts and daily cap. */
export type RewardKey = 'rewards_off' | 'welcome_coins' | 'invite_coins' | 'invite_daily_cap';
/** Oyun Salonu (server/api/live-registry.mjs, "Oyun Salonu"): games switched off, who the coin games are open to, the top stake, the daily limit. */
export type CasinoKey = 'casino_off' | 'casino_open' | 'casino_max_bet' | 'casino_daily_rounds';
/** 1v1 and Eşleşme (server/api/live-registry.mjs, "Birebir ve eşleşme"): whole numbers. */
export type OneOnOneKey =
  | 'dm_price'
  | 'call_voice_price'
  | 'call_video_price'
  | 'call_free'
  | 'call_free_seconds'
  | 'call_plain_voice_price'
  | 'call_plain_video_price'
  | 'match_voice_price'
  | 'match_video_price'
  | 'match_free'
  | 'match_free_seconds'
  | 'heart_voice_level'
  | 'heart_video_level';
/** A setting's value: a list of ids, text, a number, a campaign, or null for the built-in default. */
export type LiveValue = string | number | string[] | CatalogCampaign | null;
export type LiveSetting = {
  key: LiveKey;
  group: string;
  label: string;
  help: string;
  type: string;
  bounds: Record<string, unknown>;
  default: LiveValue;
  /** The stored value (null: the default). */
  value: LiveValue;
  /** What applies now (the stored value, else the default and .env). */
  effective: LiveValue;
  /** The stored value no longer passes the server's rules: the default is used. */
  invalid: boolean;
  changedAt: string | null;
  changedBy: { id: string; name: string } | null;
  reason: string | null;
};
export type LiveSettingsView = {
  v: number;
  /** LIVE_SAFE_MODE=1 on the server: the table is ignored and nothing can be saved. */
  safeMode: boolean;
  env: { featuresOff: string[]; notice: string | null; minVersion: string | null };
  settings: LiveSetting[];
};
export type LivePreviewLine = { key: LiveKey; label: string; before: LiveValue; after: LiveValue; impact: string; big: boolean };
export type LivePreview = { preview: LivePreviewLine[]; needsConfirm: boolean };
export type LiveSaved = { batch: string; v: number; preview: LivePreviewLine[] };
type LiveWrite = { reason: string; baseV: number; confirm?: boolean; appVersion?: string };
export type LiveSaveBody = LiveWrite & { changes: Partial<Record<LiveKey, LiveValue>> };
export type LiveRollbackBody = LiveWrite & { batch: string };
export type LiveBatch = {
  /** Paging cursor for liveHistory(before) when the server sends it. */
  id?: number;
  batch: string;
  at: string;
  by: { id: string; name: string };
  reason: string;
  rollbackOf: string | null;
  changes: { key: LiveKey; label: string; before: LiveValue; after: LiveValue }[];
};

export const liveSettings = () => call<LiveSettingsView>('GET', '/api/admin/live-settings');
/** `dryRun: true` previews (nothing saved); without it the change is saved and every admin is told. */
export function setLiveSettings(body: LiveSaveBody & { dryRun: true }): Promise<LivePreview>;
export function setLiveSettings(body: LiveSaveBody & { dryRun?: false }): Promise<LiveSaved>;
export function setLiveSettings(body: LiveSaveBody & { dryRun?: boolean }) {
  return call<LivePreview | LiveSaved>('POST', '/api/admin/live-settings', body);
}
/** The newest saves first (at most 100); `before` pages back (an id from the server's order). */
export const liveHistory = (before?: number, limit = 30) =>
  call<{ batches: LiveBatch[] }>('GET', `/api/admin/live-settings/history?limit=${limit}${before === undefined ? '' : `&before=${before}`}`);
/** Undoes one save: each of its keys goes back to the value before it. `dryRun: true` previews. */
export function rollbackLive(body: LiveRollbackBody & { dryRun: true }): Promise<LivePreview>;
export function rollbackLive(body: LiveRollbackBody & { dryRun?: false }): Promise<LiveSaved>;
export function rollbackLive(body: LiveRollbackBody & { dryRun?: boolean }) {
  return call<LivePreview | LiveSaved>('POST', '/api/admin/live-settings/rollback', body);
}
