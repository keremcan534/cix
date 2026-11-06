// Coin purchases through the stores, verified by the server before any coin is credited.
//
//   POST /api/wallet/purchase { platform: 'android', productId, token }          → { user, replay, coins, bonus, campaignBonus }
//   POST /api/wallet/purchase { platform: 'ios', productId, transactionId }
//   POST /api/wallet/purchase { platform: 'test', productId, transactionId }     (ALLOW_TEST_TOPUP=1 only)
//
// Test and sandbox purchases are play money (wallet.mjs PLAY_MONEY): a test purchase only with
// ALLOW_TEST_TOPUP=1, a store test purchase (Google Play purchaseType 0 = test, 1 = promo; App Store sandbox)
// only with ALLOW_SANDBOX_PURCHASES=1. Both credit coins on the 'test' channel and share the daily cap of test
// top-ups (TEST_TOPUP_DAILY, bonus included). Without the switch a store test purchase is refused and not
// consumed, so Google Play refunds it on its own.
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
// pack adds its first-purchase bonus; purchased coins (not the bonus) count as SVIP points. The coins are
// lots with the store's channel (google / apple / test, and bonus): gifted, they lock the recipient's diamonds
// for the store lock (wallet.mjs), and a refund (jeton.mjs) can follow them.
//
// Campaign (Canlı ayarlar, live-settings.mjs): a purchase made while a campaign ran, by the store's purchase
// time (a future time counts as now; a missing one gets no campaign), gets its percent of the pack's coins on
// top, as a 'kampanya' lot with the store lock. `bonus` stays the first-purchase gift only, so old apps don't
// mislabel it; the campaign coins are `campaignBonus`. Ending a campaign early never takes them back from
// purchases made before the end, however late they are verified; a purchase made before the campaign was set
// never gets them, even if verified later. Store sandbox purchases
// get no campaign; test-store purchases do (to try it), inside the daily play-coin cap. A hidden pack
// (packs_hidden) is only left out of the catalog: verifying one still credits it.
import crypto from 'node:crypto';

import { HttpError, auth, db, env, readJson, selfUser, sha, tx } from './core.mjs';
import { PACK_BY_PRODUCT } from './catalog.mjs';
import { campaignBonus, campaignRef } from './live-registry.mjs';
import { campaignAt } from './live-settings.mjs';
import { TEST_DAILY, creditCoins, playCoinsToday } from './wallet.mjs';

const TEST = env.ALLOW_TEST_TOPUP === '1';
const SANDBOX = env.ALLOW_SANDBOX_PURCHASES === '1';
/** Store addresses. An override is for the tests only and honoured just for a local stand-in (like google.mjs). */
const local = (v, real) => (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(v ?? '') ? v : real).replace(/\/$/, '');
const GOOGLE_API = local(env.GOOGLE_API_URL, 'https://androidpublisher.googleapis.com');
const GOOGLE_TOKEN_URL = local(env.GOOGLE_TOKEN_URL, 'https://oauth2.googleapis.com/token');
const APPLE_API = local(env.APPLE_API_URL, 'https://api.storekit.itunes.apple.com');
const APPLE_SANDBOX_API = local(env.APPLE_SANDBOX_API_URL, 'https://api.storekit-sandbox.itunes.apple.com');
/** The coin channel of each store (wallet.mjs CHANNELS): where the coins came from, in every record. */
const STORE_CHANNEL = { android: 'google', ios: 'apple', test: 'test' };
const PACKAGE = env.GOOGLE_PLAY_PACKAGE ?? 'com.similarclub.app';
const BUNDLE = env.APPLE_BUNDLE_ID ?? 'com.similarclub.app';
/**
 * The store's purchase time (ms) the campaign is decided by. A time in the future (clock skew) counts as now; any
 * past time stays as it is, since live_settings rows are never changed or deleted and campaignAt() answers for
 * any moment. A missing or broken time gives null: no campaign, rather than whatever runs at verify time.
 */
const purchaseTimeOf = (t, now = Date.now()) => (Number.isFinite(t) && t > 0 ? Math.min(now, t) : null);
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const jwtPart = (jws, i) => JSON.parse(Buffer.from(jws.split('.')[i], 'base64url').toString('utf8'));

/**
 * What the app may offer (GET /api/catalog `purchases`): free test packs only with ALLOW_TEST_TOPUP=1, and a
 * store's real packs only when this server can verify that store's payments. A store the server can't check
 * stays hidden, so nobody pays for coins that would wait unverified until Google refunds them.
 */
export const purchaseOptions = (e = env) => ({
  testTopup: e.ALLOW_TEST_TOPUP === '1',
  stores: {
    android: !!e.GOOGLE_SERVICE_ACCOUNT,
    ios: !!(e.APPLE_IAP_KEY_ID && e.APPLE_IAP_ISSUER_ID && e.APPLE_IAP_PRIVATE_KEY),
  },
});

// --- Google Play ------------------------------------------------------------------------------------------
let googleToken = { value: '', until: 0 };

/** The Play Developer API base for our app (purchases, voided purchases). */
export const googleAppUrl = () => `${GOOGLE_API}/androidpublisher/v3/applications/${PACKAGE}`;

export async function googleAccessToken() {
  if (googleToken.until > Date.now()) return googleToken.value;
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const assertion = `${body}.${crypto.sign('sha256', Buffer.from(body), sa.private_key).toString('base64url')}`;
  const r = await fetch(GOOGLE_TOKEN_URL, {
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
  const base = `${googleAppUrl()}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const headers = { authorization: `Bearer ${await googleAccessToken()}` };
  const r = await fetch(base, { headers, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404 || r.status === 400) throw new HttpError(400, 'Satın alma bulunamadı');
  if (!r.ok) throw new Error(`google verify ${r.status}`);
  const p = await r.json();
  if (p.purchaseState !== 0) throw new HttpError(402, p.purchaseState === 2 ? 'Ödeme bekleniyor; tamamlanınca jetonlar yüklenir' : 'Ödeme tamamlanmadı');
  if (p.obfuscatedExternalAccountId && p.obfuscatedExternalAccountId !== sha(u.id)) throw new HttpError(403, 'Bu satın alma başka bir hesaba ait');
  // purchaseType is only there for purchases nobody paid for: 0 = license tester, 1 = promo code, 2 = rewarded.
  const sandbox = p.purchaseType !== undefined && p.purchaseType !== null;
  if (sandbox && !SANDBOX) throw new HttpError(402, 'Test satın alması bu sunucuda kapalı');
  return {
    sandbox,
    transactionId: p.orderId || `token-${sha(token)}`,
    purchaseTime: Number(p.purchaseTimeMillis),
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
  let sandbox = false;
  for (const host of [APPLE_API, APPLE_SANDBOX_API]) {
    const r = await fetch(`${host}/inApps/v1/transactions/${transactionId}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`apple verify ${r.status}`);
    info = jwtPart((await r.json()).signedTransactionInfo, 1);
    sandbox = host === APPLE_SANDBOX_API;
    break;
  }
  if (!info) throw new HttpError(400, 'Satın alma bulunamadı');
  // TestFlight, review and sandbox testers: no money was paid.
  sandbox ||= info.environment !== undefined && info.environment !== 'Production';
  if (sandbox && !SANDBOX) throw new HttpError(402, 'Test satın alması bu sunucuda kapalı');
  if (info.bundleId !== BUNDLE || info.productId !== productId) throw new HttpError(400, 'Satın alma bu ürüne ait değil');
  if (info.revocationDate) throw new HttpError(402, 'Bu satın alma iade edilmiş');
  if (info.appAccountToken && info.appAccountToken.toLowerCase() !== u.id) throw new HttpError(403, 'Bu satın alma başka bir hesaba ait');
  return { sandbox, transactionId: String(info.transactionId), purchaseTime: Number(info.purchaseDate), finish: () => {} };
}

// --- Crediting --------------------------------------------------------------------------------------------
/**
 * `play`: a test or sandbox purchase, credited as play money on the 'test' channel (wallet.mjs PLAY_MONEY).
 * `purchaseTime`: when the store says it was bought (ms), which decides the campaign.
 */
async function credit(u, platform, pack, transactionId, play, purchaseTime) {
  const ref = `buy_${sha(`${platform}:${transactionId}`).slice(0, 40)}`;
  // The same store transaction sent by two accounts at once: each locks only its own row, so the second one
  // trips the unique (platform, transaction_id). Same answer as when the first had already committed.
  const taken = (e) => {
    if (e.code === '23505' && /transaction/.test(e.constraint ?? e.detail ?? '')) throw new HttpError(409, 'Bu satın alma başka bir hesapta kullanıldı');
    throw e;
  };
  return tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
    const prev = (await c.query('SELECT user_id, coins, bonus, campaign_bonus FROM purchases WHERE platform = $1 AND transaction_id = $2', [platform, transactionId])).rows[0];
    if (prev) {
      if (prev.user_id !== u.id) throw new HttpError(409, 'Bu satın alma başka bir hesapta kullanıldı');
      return { replay: true, coins: Number(prev.coins), bonus: Number(prev.bonus), campaignBonus: Number(prev.campaign_bonus) };
    }
    const first = !(await c.query('SELECT 1 FROM purchases WHERE user_id = $1 AND product_id = $2', [u.id, pack.productId])).rowCount;
    const bonus = first ? pack.firstBonus : 0;
    const sandbox = play && platform !== 'test';
    // The campaign set at the purchase time and running then: one ended since still pays (however late the verify),
    // one set later doesn't. No usable purchase time: no campaign.
    const at = purchaseTimeOf(purchaseTime);
    const campaign = sandbox || at === null ? null : await campaignAt(c, at);
    const kampanya = campaign ? campaignBonus(pack.coins, campaign, at) : 0;
    // Play coins share one daily cap with test top-ups (index.mjs), so test purchases can't mint more.
    if (play && (await playCoinsToday(c, u.id)) + pack.coins + bonus + kampanya > TEST_DAILY) throw new HttpError(429, `Günlük test yüklemesi sınırı ${TEST_DAILY}`);
    const p = await c.query(
      'INSERT INTO purchases (user_id, platform, product_id, transaction_id, coins, bonus, sandbox, campaign_bonus, campaign_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [u.id, platform, pack.productId, transactionId, pack.coins, bonus, sandbox, kampanya, kampanya ? campaignRef(campaign) : null],
    );
    const purchaseId = Number(p.rows[0].id);
    const gifts = [bonus && `+${bonus} ilk alım hediyesi`, kampanya && `+${kampanya} kampanya`].filter(Boolean);
    // Up to three lots, all with the store lock (wallet.mjs): the store's coins, the first-purchase gift and
    // the campaign's.
    await creditCoins(
      c,
      u.id,
      [
        { channel: play ? 'test' : STORE_CHANNEL[platform], amount: pack.coins, purchaseId },
        { channel: 'bonus', amount: bonus, purchaseId },
        { channel: 'kampanya', amount: kampanya, purchaseId },
      ],
      gifts.length ? `Jeton satın alma (${gifts.join(', ')})` : 'Jeton satın alma',
      ref,
      null,
      { detail: { purchase: purchaseId, platform, product: pack.productId, transaction: transactionId, ...(sandbox && { sandbox }) } },
    );
    // SVIP points are for coins someone paid for: the pack only, not the first-purchase or campaign gift.
    if (!sandbox) await c.query('UPDATE users SET svip_xp = svip_xp + $2 WHERE id = $1', [u.id, pack.coins]);
    return { replay: false, coins: pack.coins, bonus, campaignBonus: kampanya };
  }).catch(taken);
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
    else if (b.platform === 'test') {
      if (!TEST) throw new HttpError(403, 'Test satın alması kapalı');
      if (typeof b.transactionId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.transactionId)) throw new HttpError(400, 'Geçersiz satın alma');
      proof = { sandbox: true, transactionId: b.transactionId, purchaseTime: Date.now(), finish: () => {} };
    } else throw new HttpError(400, 'Geçersiz platform');
    const out = await credit(u, b.platform, pack, proof.transactionId, proof.sandbox, proof.purchaseTime);
    await proof.finish();
    const me = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
    return { user: selfUser(me), ...out };
  },
};
