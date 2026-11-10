// Push notifications. A phone registers its token after sign-in; sending never blocks or fails the request
// that caused it. Two kinds of token:
//   expo  an Expo push token, sent through Expo's push service (older builds)
//   fcm   the phone's own Firebase token (app lib/push), sent straight through Firebase Cloud Messaging (HTTP v1)
//         with the project's service account key. A call rings on the phone's "calls" channel (highest
//         importance, ringtone), everything else on "default".
//
//   POST /api/push/register   { token, platform, kind? }   → { registered }
//   POST /api/push/unregister { token }                    → { registered: false }
//
// PUSH_URL overrides Expo's address (tests); EXPO_ACCESS_TOKEN is sent when push security is turned on in the
// Expo project. FCM_SERVICE_ACCOUNT_B64: the Firebase service account key (its JSON, base64; server.yml writes
// it from the FCM_SERVICE_ACCOUNT secret). Without it Firebase tokens are kept but nothing is sent to them.
// FCM_URL overrides Firebase's address (tests). PUSH_ENABLED=0 turns sending off.
import crypto from 'node:crypto';

import { HttpError, auth, db, env, readJson } from './core.mjs';
import { line } from './live-line.mjs';

const URL = env.PUSH_URL ?? 'https://exp.host/--/api/v2/push/send';
const ENABLED = env.PUSH_ENABLED !== '0';
const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,100}\]$/;
const FCM_TOKEN = /^[A-Za-z0-9_:-]{20,1024}$/;
const PLATFORMS = ['ios', 'android', 'web'];

/** The Firebase service account (project_id, client_email, private_key, token_uri), or null when not set. */
const ACCOUNT = (() => {
  const raw = String(env.FCM_SERVICE_ACCOUNT_B64 ?? '').trim();
  if (!raw) return null;
  try {
    const a = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (typeof a.project_id === 'string' && typeof a.client_email === 'string' && typeof a.private_key === 'string') return a;
  } catch {
    // Reported below without the value.
  }
  console.error('FCM_SERVICE_ACCOUNT_B64 is not a Firebase service account key: Firebase push is off');
  return null;
})();
export const fcmOn = () => !!ACCOUNT;
const FCM_BASE = env.FCM_URL ?? 'https://fcm.googleapis.com';

let access = null;
/** An OAuth access token for Firebase messaging from the service account (a signed JWT), reused until near its end. */
async function accessToken() {
  if (access && access.until > Date.now() + 60_000) return access.token;
  const tokenUri = typeof ACCOUNT.token_uri === 'string' && ACCOUNT.token_uri ? ACCOUNT.token_uri : 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: ACCOUNT.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat: now, exp: now + 3600 })}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(ACCOUNT.private_key, 'base64url');
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || typeof j.access_token !== 'string') throw new Error(`firebase auth ${res.status}`);
  access = { token: j.access_token, until: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  return access.token;
}

const short = (body) => (body.length > 140 ? `${body.slice(0, 139)}…` : body);

/** The Firebase message for one phone: a ringing call on the "calls" channel, the rest on "default". */
export function fcmMessage(token, { title, body, data = {} }) {
  const ringing = data.type === 'call' && !data.missed;
  return {
    message: {
      token,
      notification: { title, body: short(body) },
      // Firebase's data values are strings.
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'HIGH',
        // A call is only worth ringing while it can still be answered.
        ttl: ringing ? '45s' : '86400s',
        notification: { channel_id: ringing ? 'calls' : 'default', sound: 'default', ...(ringing ? { tag: `call-${data.call}` } : {}) },
      },
      apns: { payload: { aps: { sound: 'default' } } },
    },
  };
}

/** Sends to Firebase tokens one by one; tokens Firebase no longer knows are deleted. */
async function sendFcm(tokens, n) {
  const gone = [];
  for (const token of tokens) {
    const res = await fetch(`${FCM_BASE}/v1/projects/${encodeURIComponent(ACCOUNT.project_id)}/messages:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify(fcmMessage(token, n)),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) continue;
    const j = await res.json().catch(() => ({}));
    const codes = (j.error?.details ?? []).map((d) => d?.errorCode);
    if (res.status === 404 || codes.includes('UNREGISTERED') || codes.includes('INVALID_ARGUMENT')) gone.push(token);
    else if (res.status === 401) access = null;
    else console.error('firebase push', res.status);
  }
  if (gone.length) await db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [gone]);
}

/** Sends to Expo tokens in batches of 100; tokens Expo reports as unregistered are deleted. */
async function sendExpo(tokens, { title, body, data }) {
  for (let i = 0; i < tokens.length; i += 100) {
    const batch = tokens.slice(i, i + 100);
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(batch.map((to) => ({ to, title, body: short(body), data, sound: 'default', priority: 'high' }))),
      signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json().catch(() => ({}));
    const gone = (j.data ?? []).map((t, k) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? batch[k] : null)).filter(Boolean);
    if (gone.length) await db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [gone]);
  }
}

/**
 * Sends one notification to every phone of `userIds`. `data` reaches the app (e.g. { type: 'message', from })
 * so a tap can open the right screen.
 */
export function notify(userIds, { title, body, data = {} }) {
  // The open app hears of it at once on its live line (only the type and ids), whether or not pushes are on.
  line(userIds, data.type ?? 'note', data);
  if (!ENABLED || !userIds.length) return;
  (async () => {
    const r = await db.query('SELECT token, kind FROM push_tokens WHERE user_id = ANY($1::uuid[])', [userIds]);
    const of = (kind) => r.rows.filter((x) => x.kind === kind).map((x) => x.token);
    const n = { title, body, data };
    await Promise.all([
      of('expo').length ? sendExpo(of('expo'), n) : null,
      ACCOUNT && of('fcm').length ? sendFcm(of('fcm'), n) : null,
    ]);
  })().catch((e) => console.error('push failed', String(e).slice(0, 200)));
}

export const pushRoutes = {
  async 'POST /api/push/register'(req) {
    const u = await auth(req);
    const { token, platform, kind = 'expo' } = await readJson(req);
    if (!['expo', 'fcm'].includes(kind)) throw new HttpError(400, 'Geçersiz bildirim anahtarı');
    if (typeof token !== 'string' || !(kind === 'fcm' ? FCM_TOKEN : TOKEN).test(token)) throw new HttpError(400, 'Geçersiz bildirim anahtarı');
    if (!PLATFORMS.includes(platform)) throw new HttpError(400, 'Geçersiz platform');
    // A phone that signs in to another account moves its token there.
    await db.query(
      `INSERT INTO push_tokens (token, user_id, platform, kind) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, kind = EXCLUDED.kind, updated_at = now()`,
      [token, u.id, platform, kind],
    );
    return { registered: true };
  },

  async 'POST /api/push/unregister'(req) {
    const u = await auth(req);
    const { token } = await readJson(req);
    if (typeof token !== 'string') throw new HttpError(400, 'Geçersiz bildirim anahtarı');
    await db.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, u.id]);
    return { registered: false };
  },
};
