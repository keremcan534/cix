// Coin purchases through the stores, verified by the server before any coin is credited.
//
//   POST /api/wallet/purchase { platform: 'android', productId, token }          → { user, replay, coins, bonus }
//   POST /api/wallet/purchase { platform: 'ios', productId, transactionId }
//   POST /api/wallet/purchase { platform: 'test', productId, transactionId }     (ALLOW_TEST_TOPUP=1 only)
//
// Google Play: the purchase token is looked up with the Play Developer API (service account in
// GOOGLE_SERVICE_ACCOUNT, JSON), must be "purchased", and is consumed after crediting so the pack can be
// bought again. App Store: the transaction is fetched from the App Store Server API (In-App Purchase key:
// APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY), production first, then sandbox (TestFlight and
// review). Data fetched from the store itself over TLS is trusted as is. If the app passed the account id at
// purchase (Play obfuscatedAccountId = sha256 of the user id, Apple appAccountToken = the user id), it must
// match the signed-in account.
//
// Each store transaction credits once (purchases.UNIQUE(platform, transaction_id)); the first purchase of a
// pack adds its first-purchase bonus; purchased coins (not the bonus) count as SVIP points.
import crypto from 'node:crypto';

import { HttpError, auth, db, env, move, readJson, selfUser, sha, tx } from './core.mjs';
import { PACK_BY_PRODUCT } from './catalog.mjs';

const TEST = env.ALLOW_TEST_TOPUP === '1';
const PACKAGE = env.GOOGLE_PLAY_PACKAGE ?? 'com.similarclub.app';
const BUNDLE = env.APPLE_BUNDLE_ID ?? 'com.similarclub.app';
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const jwtPart = (jws, i) => JSON.parse(Buffer.from(jws.split('.')[i], 'base64url').toString('utf8'));

// --- Google Play ------------------------------------------------------------------------------------------
let googleToken = { value: '', until: 0 };

async function googleAccessToken() {
  if (googleToken.until > Date.now()) return googleToken.value;
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${body}.${crypto.sign('sha256', Buffer.from(body), sa.private_key).toString('base64url')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`google token ${r.status} ${j.error ?? ''}`);
  googleToken = { value: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 };
  return googleToken.value;
}

async function verifyGoogle(u, productId, token) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new HttpError(503, 'Google Play ödemesi henüz ayarlı değil');
  if (typeof token !== 'string' || token.length < 20 || token.length > 500) throw new HttpError(400, 'Geçersiz satın alma');
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const headers = { authorization: `Bearer ${await googleAccessToken()}` };
  const r = await fetch(base, { headers, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404 || r.status === 400) throw new HttpError(400, 'Satın alma bulunamadı');
  if (!r.ok) throw new Error(`google verify ${r.status}`);
  const p = await r.json();
  if (p.purchaseState !== 0) throw new HttpError(402, p.purchaseState === 2 ? 'Ödeme bekleniyor; tamamlanınca jetonlar yüklenir' : 'Ödeme tamamlanmadı');
  if (p.obfuscatedExternalAccountId && p.obfuscatedExternalAccountId !== sha(u.id)) throw new HttpError(403, 'Bu satın alma başka bir hesaba ait');
  return {
    transactionId: p.orderId || `token-${sha(token)}`,
    // Consumed after crediting; a failure only means the next purchase of this pack waits for a retry.
    finish: () => fetch(`${base}:consume`, { method: 'POST', headers, signal: AbortSignal.timeout(10_000) }).then((x) => !x.ok && console.error('google consume', x.status)),
  };
}

// --- App Store --------------------------------------------------------------------------------------------
function appleJwt() {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url({ alg: 'ES256', kid: env.APPLE_IAP_KEY_ID, typ: 'JWT' })}.${b64url({ iss: env.APPLE_IAP_ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1', bid: BUNDLE })}`;
  const sig = crypto.sign('sha256', Buffer.from(body), { key: env.APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' });
  return `${body}.${sig.toString('base64url')}`;
}

async function verifyApple(u, productId, transactionId) {
  if (!env.APPLE_IAP_KEY_ID || !env.APPLE_IAP_ISSUER_ID || !env.APPLE_IAP_PRIVATE_KEY) throw new HttpError(503, 'App Store ödemesi henüz ayarlı değil');
  if (typeof transactionId !== 'string' || !/^\d{1,30}$/.test(transactionId)) throw new HttpError(400, 'Geçersiz satın alma');
  const headers = { authorization: `Bearer ${appleJwt()}` };
  let info = null;
  for (const host of ['api.storekit.itunes.apple.com', 'api.storekit-sandbox.itunes.apple.com']) {
    const r = await fetch(`https://${host}/inApps/v1/transactions/${transactionId}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`apple verify ${r.status}`);
    info = jwtPart((await r.json()).signedTransactionInfo, 1);
    break;
  }
  if (!info) throw new HttpError(400, 'Satın alma bulunamadı');
  if (info.bundleId !== BUNDLE || info.productId !== productId) throw new HttpError(400, 'Satın alma bu ürüne ait değil');
  if (info.revocationDate) throw new HttpError(402, 'Bu satın alma iade edilmiş');
  if (info.appAccountToken && info.appAccountToken.toLowerCase() !== u.id) throw new HttpError(403, 'Bu satın alma başka bir hesaba ait');
  return { transactionId: String(info.transactionId), finish: () => {} };
}

// --- Crediting --------------------------------------------------------------------------------------------
async function credit(u, platform, pack, transactionId) {
  const ref = `buy_${sha(`${platform}:${transactionId}`).slice(0, 40)}`;
  return tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
    const prev = (await c.query('SELECT user_id, coins, bonus FROM purchases WHERE platform = $1 AND transaction_id = $2', [platform, transactionId])).rows[0];
    if (prev) {
      if (prev.user_id !== u.id) throw new HttpError(409, 'Bu satın alma başka bir hesapta kullanıldı');
      return { replay: true, coins: Number(prev.coins), bonus: Number(prev.bonus) };
    }
    const first = !(await c.query('SELECT 1 FROM purchases WHERE user_id = $1 AND product_id = $2', [u.id, pack.productId])).rowCount;
    const bonus = first ? pack.firstBonus : 0;
    await c.query('INSERT INTO purchases (user_id, platform, product_id, transaction_id, coins, bonus) VALUES ($1,$2,$3,$4,$5,$6)', [u.id, platform, pack.productId, transactionId, pack.coins, bonus]);
    await move(c, u.id, 'coin', pack.coins + bonus, bonus ? `Jeton satın alma (+${bonus} ilk alım hediyesi)` : 'Jeton satın alma', ref);
    await c.query('UPDATE users SET svip_xp = svip_xp + $2 WHERE id = $1', [u.id, pack.coins]);
    return { replay: false, coins: pack.coins, bonus };
  });
}

export const purchaseRoutes = {
  async 'POST /api/wallet/purchase'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const pack = PACK_BY_PRODUCT.get(b.productId);
    if (!pack) throw new HttpError(400, 'Bilinmeyen paket');
    let proof;
    if (b.platform === 'android') proof = await verifyGoogle(u, pack.productId, b.token);
    else if (b.platform === 'ios') proof = await verifyApple(u, pack.productId, b.transactionId);
    else if (b.platform === 'test' && TEST) {
      if (typeof b.transactionId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.transactionId)) throw new HttpError(400, 'Geçersiz satın alma');
      proof = { transactionId: b.transactionId, finish: () => {} };
    } else throw new HttpError(400, 'Geçersiz platform');
    const out = await credit(u, b.platform, pack, proof.transactionId);
    await proof.finish();
    const me = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
    return { user: selfUser(me), ...out };
  },
};
