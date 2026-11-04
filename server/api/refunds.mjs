// Store refunds that arrive on their own: Google Play's voided purchases (refunds, chargebacks, cancelled
// orders) are read with the Play Developer API (purchases.voidedpurchases.list) every GOOGLE_VOIDED_POLL_MIN
// minutes (default 60, 0 = off) once GOOGLE_SERVICE_ACCOUNT is set, and each one runs the same refund as the
// admin's button (jeton.mjs refundPurchase): coins and still-locked diamonds back, agency commission reversed.
//
//   POST /api/admin/purchases/voided-sync (admin) → { checked, refunded, unknown }   (one round now)
//   GET  /api/admin/purchases?q=          (admin) → { purchases, googleSync }   (find one to refund by hand)
//
// A purchase already refunded is skipped, so reading the same voided purchase twice changes nothing. The
// cursor (store_refund_sync) is the newest voided time seen, read again with a day of overlap; Google keeps 30
// days, the first round reads them all. A voided purchase we never credited (refused, another app) is counted as unknown and left alone.
import { HttpError, UUID, auth, db, env, sha, tx } from './core.mjs';
import { PACK_BY_PRODUCT } from './catalog.mjs';
import { refundPurchase } from './jeton.mjs';
import { googleAccessToken, googleAppUrl } from './purchases.mjs';

const EVERY_MIN = Number(env.GOOGLE_VOIDED_POLL_MIN ?? 60);
const DAYS_BACK = 30;
const MAX_PAGES = 20;

/** The voided purchases since `startMs`, all pages. */
async function voidedSince(startMs) {
  const headers = { authorization: `Bearer ${await googleAccessToken()}` };
  const out = [];
  let token = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({ startTime: String(startMs), endTime: String(Date.now()), maxResults: '1000', ...(token && { token }) });
    const r = await fetch(`${googleAppUrl()}/purchases/voidedpurchases?${q}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`google voided ${r.status}`);
    const j = await r.json();
    out.push(...(j.voidedPurchases ?? []));
    token = j.tokenPagination?.nextPageToken ?? '';
    if (!token) break;
  }
  return out;
}

let running = false;

/** One round: refunds every voided Google Play purchase we credited and haven't refunded yet. */
export async function syncVoidedOnce() {
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new HttpError(503, 'Google Play ödemesi henüz ayarlı değil');
  if (running) throw new HttpError(409, 'İade kontrolü zaten çalışıyor');
  running = true;
  try {
    await db.query("INSERT INTO store_refund_sync (store) VALUES ('google') ON CONFLICT DO NOTHING");
    const cursor = Number((await db.query("SELECT cursor_ms FROM store_refund_sync WHERE store = 'google'")).rows[0].cursor_ms);
    // A day of overlap: Google can list a void a little after its time. Reading one twice is harmless.
    const start = Math.max(cursor - 86_400_000, Date.now() - DAYS_BACK * 86_400_000);
    const list = await voidedSince(start);
    let refunded = 0;
    let unknown = 0;
    let newest = cursor;
    let failedAt = Infinity; // the oldest void that failed: the cursor stays behind it, so the next round tries it again
    let failed = 0;
    let lastError = null;
    for (const v of list) {
      const at = Number(v.voidedTimeMillis) || 0;
      newest = Math.max(newest, at);
      try {
        const keys = [v.orderId, v.purchaseToken && `token-${sha(v.purchaseToken)}`].filter((k) => typeof k === 'string' && k);
        const p = keys.length ? (await db.query("SELECT id, status FROM purchases WHERE platform = 'android' AND transaction_id = ANY($1::text[]) ORDER BY id LIMIT 1", [keys])).rows[0] : null;
        if (!p) {
          unknown++;
          continue;
        }
        if (p.status === 'refunded') continue;
        const r = await tx((c) => refundPurchase(c, Number(p.id), { source: 'google_voided' }));
        if (r) {
          refunded++;
          console.log(`google voided purchase ${p.id} refunded (${r.coins} coins, ${r.diamonds} diamonds back, ${r.unrecoveredDiamonds} unrecovered)`);
        }
      } catch (e) {
        // One bad purchase must not stop the others; it is retried next round.
        failed++;
        failedAt = Math.min(failedAt, at);
        lastError = String(e.message ?? e).slice(0, 500);
        console.error('google voided refund', lastError.slice(0, 200));
      }
    }
    const next = failed ? Math.max(cursor, Math.min(newest, failedAt)) : newest;
    await db.query("UPDATE store_refund_sync SET cursor_ms = $1, last_ok_at = now(), last_error = $2 WHERE store = 'google'", [next, lastError]);
    return { checked: list.length, refunded, unknown, failed };
  } catch (e) {
    await db.query("UPDATE store_refund_sync SET last_error = $1 WHERE store = 'google'", [String(e.message ?? e).slice(0, 500)]).catch(() => {});
    throw e;
  } finally {
    running = false;
  }
}

let timer = null;
const round = () => syncVoidedOnce().catch((e) => e.code !== 409 && console.error('google voided sync', String(e.message ?? e).slice(0, 200)));

/** Starts the rounds when Google Play is set up and the interval isn't 0. */
export function startRefundSync() {
  if (!env.GOOGLE_SERVICE_ACCOUNT || !(EVERY_MIN > 0) || timer) return;
  const ms = Math.max(1_000, EVERY_MIN * 60_000);
  timer = setInterval(round, ms);
  timer.unref();
  setTimeout(round, Math.min(ms, 60_000)).unref();
  console.log(`google voided purchases every ${EVERY_MIN} min`);
}
export const stopRefundSync = () => timer && (clearInterval(timer), (timer = null));

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

/**
 * `q`: a purchase number, a store order id (Google's GPA.…, as Play Console shows it) or an account id; empty =
 * the latest purchases. With the state of the automatic Google refund check, for the admin panel's İadeler.
 */
async function findPurchases(q) {
  const term = String(q ?? '').trim().slice(0, 200);
  const [where, args] = /^\d{1,15}$/.test(term)
    ? ['p.id = $1 OR p.transaction_id = $2', [Number(term), term]]
    : UUID.test(term.toLowerCase())
      ? ['p.user_id = $1', [term.toLowerCase()]]
      : term
        ? ['p.transaction_id = $1', [term]]
        : ['TRUE', []];
  const r = await db.query(`SELECT p.*, u.name FROM purchases p JOIN users u ON u.id = p.user_id WHERE ${where} ORDER BY p.id DESC LIMIT 50`, args);
  return r.rows.map((p) => ({
    id: Number(p.id),
    platform: p.platform,
    productId: p.product_id,
    transactionId: p.transaction_id,
    coins: Number(p.coins),
    bonus: Number(p.bonus),
    priceTl: PACK_BY_PRODUCT.get(p.product_id)?.tl ?? null,
    status: p.status,
    sandbox: p.sandbox,
    createdAt: p.created_at,
    user: { id: p.user_id, name: p.name },
  }));
}

export const refundSyncRoutes = {
  async 'POST /api/admin/purchases/voided-sync'(req) {
    await admin(req);
    return syncVoidedOnce();
  },

  async 'GET /api/admin/purchases'(req, url) {
    await admin(req);
    const s = (await db.query("SELECT last_ok_at, last_error FROM store_refund_sync WHERE store = 'google'")).rows[0];
    return {
      purchases: await findPurchases(url.searchParams.get('q')),
      googleSync: { enabled: !!env.GOOGLE_SERVICE_ACCOUNT, everyMin: EVERY_MIN, lastOkAt: s?.last_ok_at ?? null, lastError: s?.last_error ?? null },
    };
  },
};
