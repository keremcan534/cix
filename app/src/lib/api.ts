// Client for the Similar Club API on our server (server/api, docs/SUNUCU.md): development sign-in, the server
// wallet and voice tokens. Active when EXPO_PUBLIC_API_URL is set; otherwise apiEnabled() is false and the app
// keeps its local prototype state.
//
// Sign-in: a random device key is created once and kept on the device; the server knows only its hash. The
// session it returns is kept too, so the app stays signed in. SMS and Google/Apple will replace this later.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ServerUser = { id: string; name: string; coins: number; diamonds: number; gameCoins: number; createdAt: string };
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

const randomId = (bytes: number) => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
};
/** Request id for a wallet change; sending the same id again is applied once by the server. */
export const newRef = () => randomId(12);

let session: string | null = null;
let signingIn: Promise<ServerUser> | null = null;

async function call<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
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

/** Signs in with this device (creating the account with `name` the first time). */
export async function signIn(name: string): Promise<ServerUser> {
  let key = await AsyncStorage.getItem(DEVICE_KEY);
  if (!key) {
    key = randomId(24);
    await AsyncStorage.setItem(DEVICE_KEY, key);
  }
  const r = await call<{ session: string; user: ServerUser }>('POST', '/api/auth/dev', { deviceKey: key, name });
  session = r.session;
  await AsyncStorage.setItem(SESSION_KEY, r.session);
  return r.user;
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
