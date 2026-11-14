// Abonelik: the VIP subscription, bought through the stores and checked here before it opens anything, the way coin
// packs are (purchases.mjs: the same store helpers, test and sandbox rules, account check, each store purchase once).
//
//   GET  /api/vip                                                          → { until, autoRenewing, subscriptions, plans }
//   POST /api/vip/subscribe { platform: 'android', productId, token }      → { user, replay, until, days }
//   POST /api/vip/subscribe { platform: 'ios', productId, transactionId }
//   POST /api/vip/subscribe { platform: 'test', productId, transactionId } (ALLOW_TEST_TOPUP=1 only)
//
// Plans: catalog.mjs VIP_SUBS (vip_7d, vip_30d, vip_90d), store subscriptions that renew on their own. Each store
// subscription is one row (vip_subscriptions, 065): Google's purchase token, Apple's original transaction id or the
// test transaction id, unique per platform, so it never counts for two accounts. A person's subscription runs to the
// latest end of their rows that aren't revoked (users.vip_sub_until, kept in step by syncUntil; GET /api/me
// vipSubUntil). It opens Profiline bakanlar (social.mjs seesVisitors) and, besides VIP 1+, Seviyeleri gizle
// (profiles.mjs). VIP 1–10 (SVIP) and Rütbe are separate and stay as they are.
//
// Google Play: the token is read with the Play Developer API (purchases.subscriptionsv2). It must hold the product
// asked for and be active, in its grace period, or cancelled but not ended yet (renewal turned off: it was paid
// until expiryTime); a pending payment is 402 and kept by the app. The app links the account
// (obfuscatedExternalAccountId = sha256 of the user id): another account's is 403. The end is the line item's
// expiryTime. It is acknowledged once stored; a failed acknowledge is only logged (the app acknowledges too).
// A license tester's purchase (testPurchase) only with ALLOW_SANDBOX_PURCHASES=1, else 402 and not acknowledged, so
// Google refunds it. Sending the same token again reads it from Google again (a replay; the end follows Google).
//
// Renewals: every VIP_RECHECK_MIN minutes (default 30, 0 = off; only with GOOGLE_SERVICE_ACCOUNT) the Google rows
// that end within the hour, or have ended while still renewing (a payment on hold, a pause: up to 100 days), are
// read again, each at most every RECHECK_GAP_MIN minutes; so are the caller's own on GET /api/me and GET /api/vip.
// What Google says then is the end: a renewal moves it on, an expired, paused or on-hold one ends now. A refund or
// revocation in Google's voided purchases (refunds.mjs) ends it for good (state 'revoked'); no later read brings
// it back.
// App Store: the transaction through purchases.mjs appleTransaction (same sandbox, product, revocation and account
// checks); its expiresDate is the end and its originalTransactionId the row. A renewal is a new transaction of the
// same subscription, sent by the app: it moves the end on, never back. No App Store notifications are read yet.
// Test (ALLOW_TEST_TOPUP=1): the plan's days on top of the current end, no store; never read again.
import { HttpError, auth, db, env, readJson, selfUser, sha, subUntil, tx } from './core.mjs';
import { VIP_SUBS, VIP_SUB_BY_PRODUCT } from './catalog.mjs';
import { appleTransaction, googleAccessToken, googleAppUrl } from './purchases.mjs';

const TEST = env.ALLOW_TEST_TOPUP === '1';
const SANDBOX = env.ALLOW_SANDBOX_PURCHASES === '1';
const EVERY_MIN = Number(env.VIP_RECHECK_MIN ?? 30);
/** A row is read from Google again at most this often (the job and the owner's own reads together). */
const RECHECK_GAP_MIN = 5;
const ROUND_MAX = 200;
const DAY = 86_400_000;
/** Google states in which the person holds the subscription now. CANCELED: renewal is off, but it was paid until expiryTime. */
const PAID = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
/** States after which Google doesn't renew it any more. */
const NO_RENEWAL = new Set(['SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']);
const PLANS = VIP_SUBS.map(({ productId, days }) => ({ productId, days }));
/** The Google rows due for another read: ending within the hour, or ended while still renewing. `$1`: the gap in minutes. */
const DUE = `SELECT id, user_id, store_ref FROM vip_subscriptions
  WHERE platform = 'android' AND state = 'active' AND checked_at < now() - $1::int * interval '1 minute'
    AND expires_at < now() + interval '1 hour' AND expires_at > now() - interval '100 days'
    AND (auto_renewing OR expires_at > now())`;

/** The person's end as the latest end of their rows that aren't revoked, written to the account (inside `c`). */
async function syncUntil(c, uid) {
  const r = await c.query(
    "UPDATE users SET vip_sub_until = (SELECT max(expires_at) FROM vip_subscriptions WHERE user_id = $1 AND state = 'active') WHERE id = $1 RETURNING vip_sub_until",
    [uid],
  );
  return r.rows[0]?.vip_sub_until ?? null;
}

// --- Google Play ------------------------------------------------------------------------------------------
/** subscriptionsv2 for a token: Google's answer, or null when Google doesn't know it (or not any more: 410). */
async function googleSub(token, { strict = false } = {}) {
  const headers = { authorization: `Bearer ${await googleAccessToken()}` };
  const r = await fetch(`${googleAppUrl()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers, signal: AbortSignal.timeout(10_000) });
  // 400 is an unknown token only when it comes from a phone; a stored token Google once knew is retried instead.
  if (r.status === 404 || r.status === 410 || (strict && r.status === 400)) return null;
  if (!r.ok) throw new Error(`google subscription ${r.status}`);
  return r.json();
}

/** The line item for `productId`, or the one that ends last when no product is named. */
function lineOf(s, productId) {
  const items = (s?.lineItems ?? []).filter((x) => x && (!productId || x.productId === productId));
  return items.sort((a, b) => (Date.parse(b.expiryTime) || 0) - (Date.parse(a.expiryTime) || 0))[0] ?? null;
}

const renewsOf = (s, item) => !NO_RENEWAL.has(s.subscriptionState) && !!item?.autoRenewingPlan?.autoRenewEnabled;

async function acknowledge(productId, token) {
  try {
    const headers = { authorization: `Bearer ${await googleAccessToken()}`, 'content-type': 'application/json' };
    const url = `${googleAppUrl()}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
    const r = await fetch(url, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) console.error('google subscription acknowledge', r.status);
  } catch (e) {
    console.error('google subscription acknowledge', String(e.message ?? e).slice(0, 200));
  }
}

async function verifyGoogle(u, plan, token) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new HttpError(503, 'Google Play ödemesi henüz ayarlı değil');
  if (typeof token !== 'string' || token.length < 20 || token.length > 500) throw new HttpError(400, 'Geçersiz satın alma');
  const s = await googleSub(token, { strict: true });
  if (!s) throw new HttpError(400, 'Satın alma bulunamadı');
  const item = lineOf(s, plan.productId);
  if (!item) throw new HttpError(400, 'Satın alma bu ürüne ait değil');
  const end = Date.parse(item.expiryTime);
  if (s.subscriptionState === 'SUBSCRIPTION_STATE_PENDING') throw new HttpError(402, 'Ödeme bekleniyor; tamamlanınca abonelik açılır');
  if (!PAID.has(s.subscriptionState) || !(end > Date.now())) throw new HttpError(402, 'Bu abonelik etkin değil');
  const account = s.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (account && account !== sha(u.id)) throw new HttpError(403, 'Bu satın alma başka bir hesaba ait');
  // testPurchase is only there for license testers: nobody paid.
  const sandbox = !!s.testPurchase;
  if (sandbox && !SANDBOX) throw new HttpError(402, 'Test satın alması bu sunucuda kapalı');
  return {
    sandbox,
    storeRef: token,
    orderId: s.latestOrderId ?? null,
    expiresAt: new Date(end),
    autoRenewing: renewsOf(s, item),
    finish: s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' ? async () => {} : () => acknowledge(plan.productId, token),
  };
}

// --- App Store --------------------------------------------------------------------------------------------
async function verifyApple(u, plan, transactionId) {
  const { info, sandbox } = await appleTransaction(u, plan.productId, transactionId);
  const end = Number(info.expiresDate);
  if (!Number.isFinite(end) || end <= 0) throw new HttpError(400, 'Satın alma bir abonelik değil');
  if (end <= Date.now()) throw new HttpError(402, 'Bu aboneliğin süresi dolmuş');
  return {
    sandbox,
    storeRef: String(info.originalTransactionId ?? info.transactionId),
    orderId: String(info.transactionId),
    expiresAt: new Date(end),
    // A transaction doesn't say whether it renews (that is the renewal info, not read here).
    autoRenewing: null,
    finish: async () => {},
  };
}

// --- Recording --------------------------------------------------------------------------------------------
/**
 * Stores one store subscription (or test purchase) for `u` and moves their end. A row already there is the same
 * subscription again: Google's end is taken as Google says it now, Apple's only moves on (a newer transaction is a
 * renewal), a test purchase changes nothing. `replay` unless something new was bought.
 */
async function record(u, platform, plan, proof) {
  const taken = (e) => {
    if (e.code === '23505' && /store_ref/.test(e.constraint ?? e.detail ?? '')) throw new HttpError(409, 'Bu satın alma başka bir hesapta kullanıldı');
    throw e;
  };
  return tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
    const prev = (await c.query('SELECT * FROM vip_subscriptions WHERE platform = $1 AND store_ref = $2 FOR UPDATE', [platform, proof.storeRef])).rows[0];
    if (prev && prev.user_id !== u.id) throw new HttpError(409, 'Bu satın alma başka bir hesapta kullanıldı');
    let replay = !!prev;
    if (!prev) {
      let expires = proof.expiresAt;
      if (platform === 'test') {
        // Test days stack on the end that runs now, whatever gave it.
        const cur = (await c.query('SELECT vip_sub_until FROM users WHERE id = $1', [u.id])).rows[0].vip_sub_until;
        expires = new Date(Math.max(Date.now(), cur ? new Date(cur).getTime() : 0) + plan.days * DAY);
      }
      await c.query(
        'INSERT INTO vip_subscriptions (user_id, platform, product_id, store_ref, order_id, expires_at, auto_renewing, test) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [u.id, platform, plan.productId, proof.storeRef, proof.orderId, expires, proof.autoRenewing, proof.sandbox],
      );
    } else if (platform !== 'test' && prev.state === 'active') {
      const newer = proof.expiresAt > prev.expires_at;
      // Apple: an older transaction of the same subscription never moves its end back.
      if (platform === 'ios') replay = !newer;
      if (platform === 'android' || newer) {
        await c.query(
          'UPDATE vip_subscriptions SET product_id = $2, order_id = coalesce($3, order_id), expires_at = $4, auto_renewing = $5, checked_at = now(), updated_at = now() WHERE id = $1',
          [prev.id, plan.productId, proof.orderId, proof.expiresAt, proof.autoRenewing],
        );
      }
    }
    return { replay, until: await syncUntil(c, u.id) };
  }).catch(taken);
}

/** Reads one Google row again and stores what Google says now (inside its own transaction). */
async function recheck(row) {
  const s = await googleSub(row.store_ref);
  const item = s && lineOf(s);
  const end = item ? Date.parse(item.expiryTime) : NaN;
  // Paid: Google's end (a renewal moved it on). Expired, paused, on hold, or gone: over now.
  const paid = !!s && PAID.has(s.subscriptionState) && Number.isFinite(end);
  const product = item && VIP_SUB_BY_PRODUCT.has(item.productId) ? item.productId : null;
  await tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [row.user_id]);
    const r = await c.query(
      `UPDATE vip_subscriptions SET expires_at = CASE WHEN $2::timestamptz IS NULL THEN least(expires_at, now()) ELSE $2::timestamptz END,
         auto_renewing = $3, order_id = coalesce($4, order_id), product_id = coalesce($5, product_id), checked_at = now(), updated_at = now()
        WHERE id = $1 AND state = 'active' RETURNING id`,
      [row.id, paid ? new Date(end) : null, !!s && renewsOf(s, item), s?.latestOrderId ?? null, product],
    );
    if (r.rowCount) await syncUntil(c, row.user_id);
  });
}

/** Reads the rows `sql` finds again; one failure doesn't stop the others (it is tried again next time). */
async function recheckDue(sql, args) {
  const rows = (await db.query(sql, args)).rows;
  let checked = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await recheck(row);
      checked++;
    } catch (e) {
      failed++;
      console.error('vip subscription recheck', String(e.message ?? e).slice(0, 200));
    }
  }
  return { checked, failed };
}

/** The caller's own Google rows that are due, read again (GET /api/me, GET /api/vip). Whether any was read. */
export async function refreshOwnSubscription(u) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) return false;
  const r = await recheckDue(`${DUE} AND user_id = $2`, [RECHECK_GAP_MIN, u.id]);
  return r.checked > 0;
}

/** One round of the renewal check over everyone. */
export const recheckSubscriptionsOnce = () => recheckDue(`${DUE} ORDER BY expires_at LIMIT ${ROUND_MAX}`, [RECHECK_GAP_MIN]);

/**
 * A voided purchase from Google (refunds.mjs) that is one of our subscriptions: it ends now, for good. Null when the
 * token isn't a subscription of ours, false when it had already ended this way.
 */
export async function endVoidedSubscription(token) {
  if (typeof token !== 'string' || !token) return null;
  return tx(async (c) => {
    const row = (await c.query("SELECT id, user_id, state FROM vip_subscriptions WHERE platform = 'android' AND store_ref = $1", [token])).rows[0];
    if (!row) return null;
    if (row.state === 'revoked') return false;
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [row.user_id]);
    await c.query("UPDATE vip_subscriptions SET state = 'revoked', expires_at = least(expires_at, now()), auto_renewing = false, updated_at = now() WHERE id = $1", [row.id]);
    await syncUntil(c, row.user_id);
    console.log(`google voided subscription ${row.id} ended`);
    return true;
  });
}

let timer = null;
let running = false;
const round = async () => {
  if (running) return;
  running = true;
  try {
    await recheckSubscriptionsOnce();
  } catch (e) {
    console.error('vip subscription round', String(e.message ?? e).slice(0, 200));
  } finally {
    running = false;
  }
};

/** Starts the renewal check when Google Play is set up and VIP_RECHECK_MIN isn't 0. */
export function startVipRecheck() {
  if (!env.GOOGLE_SERVICE_ACCOUNT || !(EVERY_MIN > 0) || timer) return;
  const ms = Math.max(1_000, EVERY_MIN * 60_000);
  timer = setInterval(round, ms);
  timer.unref();
  setTimeout(round, Math.min(ms, 60_000)).unref();
  console.log(`vip subscriptions re-checked every ${EVERY_MIN} min`);
}
export const stopVipRecheck = () => timer && (clearInterval(timer), (timer = null));

export const vipRoutes = {
  /** My subscription: its end (null when none runs), whether a store renews it, the rows that run now and the plans. */
  async 'GET /api/vip'(req) {
    let u = await auth(req);
    if (await refreshOwnSubscription(u)) u = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
    const rows = (
      await db.query("SELECT platform, product_id, expires_at, auto_renewing, test FROM vip_subscriptions WHERE user_id = $1 AND state = 'active' AND expires_at > now() ORDER BY expires_at DESC", [u.id])
    ).rows;
    const subscriptions = rows.map((x) => ({ platform: x.platform, productId: x.product_id, until: x.expires_at.toISOString(), autoRenewing: x.auto_renewing, test: x.test }));
    return { until: subUntil(u), autoRenewing: subscriptions.some((x) => x.autoRenewing === true), subscriptions, plans: PLANS };
  },

  async 'POST /api/vip/subscribe'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const plan = VIP_SUB_BY_PRODUCT.get(b.productId);
    if (!plan) throw new HttpError(400, 'Bilinmeyen abonelik');
    let proof;
    if (b.platform === 'android') proof = await verifyGoogle(u, plan, b.token);
    else if (b.platform === 'ios') proof = await verifyApple(u, plan, b.transactionId);
    else if (b.platform === 'test') {
      if (!TEST) throw new HttpError(403, 'Test satın alması kapalı');
      if (typeof b.transactionId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.transactionId)) throw new HttpError(400, 'Geçersiz satın alma');
      proof = { sandbox: true, storeRef: b.transactionId, orderId: null, expiresAt: null, autoRenewing: false, finish: async () => {} };
    } else throw new HttpError(400, 'Geçersiz platform');
    const out = await record(u, b.platform, plan, proof);
    await proof.finish();
    const me = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
    return { user: selfUser(me), replay: out.replay, until: subUntil(me), days: plan.days };
  },
};
