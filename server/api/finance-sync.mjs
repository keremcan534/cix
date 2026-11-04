// Finance Control (the separate finance panel, github.com/keremcan534/similarclup-finance-control) gets every
// money movement from here. The ledger is append-only and every balance change goes through it (core.mjs
// move), so this reads it in id order behind a cursor (finance_sync.last_id) and posts each movement to the
// panel's POST /api/ingest/events as one of its event types. No endpoint has to remember to report anything.
//
//  - Each event's idempotency key comes from the ledger (`ledger-<id>`, or `purchase-<id>` for a store
//    purchase), so sending one twice is harmless: the panel answers "duplicate".
//  - Rows younger than FINANCE_SYNC_LAG_S (60 s) wait: ids are handed out before commit, so a slower
//    transaction can commit a lower id after a higher one was already readable.
//  - The panel unreachable → nothing moves and the next round tries again. An event the panel refuses (say a
//    payment channel not defined there yet) goes to finance_sync_failed and is retried with a growing wait.
//  - FINANCE_API_KEY empty → off. One API process per server, so a flag is enough to keep rounds apart.
//
//   GET /api/admin/finance-sync (admin) → { enabled, lastId, behind, lastOkAt, lastError, failed, failures }
//
// Ledger → panel:
//   store purchase (Google/Apple)  → purchase (pack list price, TRY) [+ bonus_grant for the first-buy gift]
//   gift received (diamonds)       → gift (sender, recipient as publisher, coins); the sender's coin row is in it
//   in-app spend (VIP, store…)     → coin_spend
//   store refund                   → refund of that purchase
//   wholesale to a Jeton Noktası   → purchase on channel "jeton_noktasi" (the price the bank paid)
//   diamonds → coins (Çevir/bozdurma) → bonus_grant (campaign elmas_cevirme / elmas_bozdurma)
//   test top-up / test purchase    → promotion (campaign test_yukleme / test_satin_alma); store sandbox the same
//   not sent: Jeton Noktası → user transfers (coins change hands, none are created), diamond debits other than refunds
//   gifts (withdrawals included: the panel has no payout event type and records payouts itself), game coins.
import { HttpError, auth, db, env } from './core.mjs';
import { PACK_BY_PRODUCT } from './catalog.mjs';

const KEY = env.FINANCE_API_KEY ?? '';
const URL_ = env.FINANCE_INGEST_URL || 'http://127.0.0.1:4300/api/ingest/events';
const EVERY_MS = Number(env.FINANCE_SYNC_MS ?? 30_000);
const LAG_S = Number(env.FINANCE_SYNC_LAG_S ?? 60);
const BATCH = 500;
const STORE = { android: 'google', ios: 'apple' };

const money = (n) => Number(n).toFixed(2);

/** The panel events one ledger row stands for (often none). */
export function eventsOf(r) {
  const at = new Date(r.created_at).toISOString();
  const base = { idempotency_key: `ledger-${r.id}`, occurred_at: at };
  const amount = Number(r.amount);
  const d = r.detail ?? {};
  // A store sandbox purchase (Play test or promo, App Store sandbox) paid nothing: play money like a test one.
  const store = r.p_sandbox ? undefined : STORE[r.platform];

  if (r.currency === 'diamond') {
    // A refund whose coins were already spent takes back only gift diamonds: it is still the purchase's refund.
    if (amount < 0 && r.reason.startsWith('İade') && d.purchase && store) return [refundOf(d.purchase, at)];
    if (amount > 0 && r.counterparty && r.ref.endsWith('-in') && r.reason.startsWith('Hediye alındı'))
      return [{ ...base, type: 'gift', sender_ref: r.counterparty, publisher_ref: r.user_id, coins: amount, gift_ref: r.gift_id ?? 'aktarim', room_ref: r.gift_room ?? null }];
    return [];
  }
  if (r.currency !== 'coin') return [];

  if (amount > 0) {
    if (d.purchase && store) {
      const pack = PACK_BY_PRODUCT.get(r.product_id);
      const out = [];
      if (pack) out.push({ type: 'purchase', idempotency_key: `purchase-${d.purchase}`, occurred_at: at, user_ref: r.user_id, channel: store, amount: money(pack.tl), currency: 'TRY', coins: Number(r.p_coins), product_ref: r.product_id });
      if (Number(r.p_bonus) > 0) out.push({ type: 'bonus_grant', idempotency_key: `purchase-${d.purchase}-bonus`, occurred_at: at, user_ref: r.user_id, coins: Number(r.p_bonus), campaign_ref: 'ilk_alim_hediyesi' });
      return out;
    }
    if (d.purchase) return [{ ...base, type: 'promotion', user_ref: r.user_id, coins: amount, campaign_ref: 'test_satin_alma' }];
    if (r.channel === 'test') return [{ ...base, type: 'promotion', user_ref: r.user_id, coins: amount, campaign_ref: 'test_yukleme' }];
    if (r.channel === 'cevir') return [{ ...base, type: 'bonus_grant', user_ref: r.user_id, coins: amount, campaign_ref: 'elmas_cevirme' }];
    if (r.channel === 'bozdurma') return [{ ...base, type: 'bonus_grant', user_ref: r.user_id, coins: amount, campaign_ref: 'elmas_bozdurma' }];
    if (r.channel === 'toptan' && d.priceTl !== undefined)
      return [{ ...base, type: 'purchase', user_ref: r.user_id, channel: 'jeton_noktasi', amount: money(d.priceTl), currency: 'TRY', coins: amount, product_ref: 'toptan' }];
    return [];
  }

  if (r.reason.startsWith('Uygulama içi:')) return [{ ...base, type: 'coin_spend', user_ref: r.user_id, coins: -amount, item_ref: r.reason.slice(13).trim().slice(0, 100) }];
  if (r.reason.startsWith('İade') && d.purchase && store) return [refundOf(d.purchase, at)];
  return [];
}

const refundOf = (purchase, at) => ({ type: 'refund', idempotency_key: `refund-${purchase}`, occurred_at: at, original_key: `purchase-${purchase}`, reason: 'Mağaza iadesi' });

/** Posts events; returns the panel's per-event results. Throws when the panel can't be reached or says no. */
async function post(events) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ events }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`panel ${r.status}: ${body.error ?? ''}`.trim());
  if (!Array.isArray(body.results) || body.results.length !== events.length) throw new Error('panel: beklenmeyen yanıt');
  return body.results;
}

const failLater = (key, ledgerId, event, error) =>
  db.query(
    `INSERT INTO finance_sync_failed (key, ledger_id, event, error, next_try) VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
     ON CONFLICT (key) DO UPDATE SET error = EXCLUDED.error`,
    [key, ledgerId, JSON.stringify(event), String(error).slice(0, 500)],
  );

/** One round: new ledger rows, then refused events whose wait is over. Returns how many events went out. */
export async function syncOnce() {
  const cur = Number((await db.query('SELECT last_id FROM finance_sync WHERE id = 1')).rows[0].last_id);
  const rows = (
    await db.query(
      `SELECT l.id, l.user_id, l.currency, l.amount, l.reason, l.ref, l.counterparty, l.channel, l.detail, l.created_at,
              p.platform, p.product_id, p.coins AS p_coins, p.bonus AS p_bonus, p.sandbox AS p_sandbox, g.gift_id, g.room AS gift_room
         FROM ledger l
         LEFT JOIN purchases p ON p.id = (l.detail->>'purchase')::bigint
         LEFT JOIN gift_events g ON g.id = (l.detail->>'gift')::bigint
        WHERE l.id > $1 AND l.created_at < now() - make_interval(secs => $2)
        ORDER BY l.id LIMIT $3`,
      [cur, LAG_S, BATCH],
    )
  ).rows;
  let sent = 0;
  if (rows.length) {
    const seen = new Set();
    const batch = [];
    for (const r of rows)
      for (const e of eventsOf(r)) if (!seen.has(e.idempotency_key)) (seen.add(e.idempotency_key), batch.push({ e, ledgerId: r.id }));
    if (batch.length) {
      const results = await post(batch.map((b) => b.e));
      for (const [i, res] of results.entries()) if (res.status === 'error') await failLater(batch[i].e.idempotency_key, batch[i].ledgerId, batch[i].e, res.error);
      sent += batch.length;
    }
    await db.query('UPDATE finance_sync SET last_id = $1 WHERE id = 1', [rows.at(-1).id]);
  }

  const due = (await db.query('SELECT key, event, attempts FROM finance_sync_failed WHERE next_try <= now() ORDER BY next_try LIMIT 200')).rows;
  if (due.length) {
    const results = await post(due.map((f) => f.event));
    for (const [i, res] of results.entries()) {
      if (res.status === 'error')
        await db.query(`UPDATE finance_sync_failed SET attempts = attempts + 1, error = $2, next_try = now() + make_interval(mins => LEAST(360, 5 * power(2, attempts)::int)) WHERE key = $1`, [
          due[i].key,
          String(res.error).slice(0, 500),
        ]);
      else await db.query('DELETE FROM finance_sync_failed WHERE key = $1', [due[i].key]);
    }
    sent += due.length;
  }
  await db.query('UPDATE finance_sync SET last_ok_at = now(), last_error = NULL WHERE id = 1');
  return sent;
}

let timer = null;
let running = false;
async function round() {
  if (running) return;
  running = true;
  try {
    // A full batch means more is waiting: keep going until caught up.
    while ((await syncOnce()) >= BATCH);
  } catch (e) {
    console.error('finance sync', e.message);
    await db.query('UPDATE finance_sync SET last_error = $1 WHERE id = 1', [String(e.message).slice(0, 500)]).catch(() => {});
  } finally {
    running = false;
  }
}

/** Starts the rounds when a key is set. */
export function startFinanceSync() {
  if (!KEY || timer) return;
  timer = setInterval(round, EVERY_MS);
  timer.unref();
  setTimeout(round, 2_000).unref();
  console.log(`finance sync on → ${URL_}`);
}
export const stopFinanceSync = () => timer && (clearInterval(timer), (timer = null));

export const financeSyncRoutes = {
  async 'GET /api/admin/finance-sync'(req) {
    const u = await auth(req);
    if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const s = (await db.query('SELECT last_id, last_ok_at, last_error FROM finance_sync WHERE id = 1')).rows[0];
    const behind = Number((await db.query('SELECT count(*) AS n FROM ledger WHERE id > $1', [s.last_id])).rows[0].n);
    const failures = (await db.query('SELECT key, error, attempts, next_try FROM finance_sync_failed ORDER BY created_at LIMIT 20')).rows;
    const failed = Number((await db.query('SELECT count(*) AS n FROM finance_sync_failed')).rows[0].n);
    return { enabled: !!KEY, lastId: Number(s.last_id), behind, lastOkAt: s.last_ok_at, lastError: s.last_error, failed, failures };
  },
};
