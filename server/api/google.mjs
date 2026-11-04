// Checks a Google ID token (Sign in with Google on the phone) without any Google library: the signature
// against Google's published keys (JWKS, RS256), the issuer, the audience (one of GOOGLE_CLIENT_IDS), the
// expiry and a verified e-mail. The keys are fetched once and kept as long as Google's Cache-Control says
// (an unknown key id fetches them again, at most once a minute, for Google's key rotation).
//
// GOOGLE_JWKS_URL is for the tests only: it is honoured just for an http://127.0.0.1 or http://localhost
// address, so a production server always asks Google itself.
import crypto from 'node:crypto';

import { HttpError, env } from './core.mjs';

const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
const JWKS_URL = LOCAL.test(env.GOOGLE_JWKS_URL ?? '') ? env.GOOGLE_JWKS_URL : GOOGLE_JWKS;
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
/** Clock difference allowed between Google and this server. */
const SKEW_S = 60;
const REFETCH_MS = 60_000;

/** The client ids whose tokens are accepted (the web client id; the Android one too if it is listed). */
export const googleClientIds = () =>
  (env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

let keys = new Map();
let keysUntil = 0;
let lastFetch = 0;
let fetching = null;

async function fetchKeys() {
  lastFetch = Date.now();
  let res;
  try {
    res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new HttpError(503, "Google'a şu an ulaşılamıyor, biraz sonra tekrar dene");
  }
  if (!res.ok) throw new HttpError(503, "Google'a şu an ulaşılamıyor, biraz sonra tekrar dene");
  const body = await res.json().catch(() => ({}));
  const next = new Map();
  for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
    if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || (jwk.alg && jwk.alg !== 'RS256')) continue;
    try {
      next.set(jwk.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
    } catch {
      // A malformed key is skipped; the others still work.
    }
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  keys = next;
  keysUntil = Date.now() + Math.min(Math.max(maxAge, 60), 86_400) * 1000;
}

/** Google's key for `kid`; fresh keys when the cache is old or the id is new (Google rotated its keys). */
async function keyFor(kid) {
  const stale = Date.now() > keysUntil;
  if (stale || (!keys.has(kid) && Date.now() - lastFetch > REFETCH_MS)) {
    fetching ??= fetchKeys().finally(() => (fetching = null));
    try {
      await fetching;
    } catch (e) {
      // Google unreachable: keys that are only a little old still verify.
      if (!keys.size) throw e;
    }
  }
  return keys.get(kid) ?? null;
}

const bad = () => new HttpError(401, 'Google girişi doğrulanamadı, tekrar dene');
const part = (s) => {
  try {
    return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  } catch {
    throw bad();
  }
};

/**
 * The checked claims of a Google ID token: `{ sub, email, name, givenName }`. Anything wrong is a 401; Google
 * unreachable (and no keys kept) is a 503.
 */
export async function verifyGoogleIdToken(idToken, audiences = googleClientIds(), now = Date.now()) {
  if (typeof idToken !== 'string' || idToken.length > 4096) throw bad();
  const pieces = idToken.split('.');
  if (pieces.length !== 3 || pieces.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw bad();
  const [h, p, s] = pieces;
  const header = part(h);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw bad();
  const key = await keyFor(header.kid);
  if (!key) throw bad();
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) throw bad();

  const c = part(p);
  const t = now / 1000;
  if (!ISSUERS.has(c.iss)) throw bad();
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.some((a) => audiences.includes(a))) throw bad();
  if (typeof c.exp !== 'number' || c.exp + SKEW_S < t) throw bad();
  if (typeof c.iat === 'number' && c.iat - SKEW_S > t) throw bad();
  if (c.email_verified !== true && c.email_verified !== 'true') throw bad();
  if (typeof c.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(c.sub)) throw bad();
  return {
    sub: c.sub,
    email: typeof c.email === 'string' ? c.email.slice(0, 320) : null,
    name: typeof c.name === 'string' ? c.name : '',
    givenName: typeof c.given_name === 'string' ? c.given_name : '',
  };
}
