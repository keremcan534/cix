// Finance Control feed (finance-sync.mjs) against a real Postgres and a stand-in for the panel's
// POST /api/ingest/events: which ledger rows become which events, the panel down, refused events retried.
//   PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';
import { eventsOf } from '../finance-sync.mjs';

// The panel stand-in: keeps what it got, answers like the real one (created / duplicate / error per event).
const panel = { events: [], keys: new Set(), down: false, refuse: null, apiKeys: new Set() };
const srv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    panel.apiKeys.add(req.headers['x-api-key']);
    if (panel.down) return res.writeHead(503).end('{}');
    const { events } = JSON.parse(raw);
    const results = events.map((e) => {
      if (panel.refuse === e.type) return { key: e.idempotency_key, status: 'error', error: 'Tanımsız ödeme kanalı' };
      if (panel.keys.has(e.idempotency_key)) return { key: e.idempotency_key, status: 'duplicate' };
      panel.keys.add(e.idempotency_key);
      panel.events.push(e);
      return { key: e.idempotency_key, status: 'created' };
    });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
  });
});
const PANEL_PORT = 19000 + (process.pid % 1000);
srv.listen(PANEL_PORT, '127.0.0.1');
after(() => srv.close());

const h = startApi({
  FINANCE_API_KEY: 'fc_test_key',
  FINANCE_INGEST_URL: `http://127.0.0.1:${PANEL_PORT}/api/ingest/events`,
  FINANCE_SYNC_MS: '150',
  FINANCE_SYNC_LAG_S: '0',
});
const { call, signUp } = h;

async function until(fn, ms = 8000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 50));
  }
}
const of = (user) => panel.events.filter((e) => e.user_ref === user || e.sender_ref === user || e.publisher_ref === user);

describe('Finans paneline aktarım', () => {
  test('yükleme, hediye, harcama, çeviri ve test satın alması panele doğru türde ve bir kez gider', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, a.session);
    await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g1', count: 1, ref: rnd(6) }, a.session);
    await call('POST', '/api/wallet/spend', { amount: 300, reason: 'VIP 7 gün', ref: rnd(6) }, a.session);
    await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: `txn_${rnd(6)}` }, a.session);
    await call('POST', '/api/wallet/gift', { to: b.user.id, amount: 1500, ref: rnd(6) }, a.session);
    await h.sql.query('UPDATE diamond_locks SET unlock_at = now()');
    const [st, ex] = await call('POST', '/api/wallet/exchange', { diamonds: 1000, ref: rnd(6) }, b.session);
    assert.equal(st, 200, ex.error);

    const got = await until(() => (of(b.user.id).some((e) => e.campaign_ref === 'elmas_cevirme') ? of(a.user.id) : null));
    assert.ok(panel.apiKeys.has('fc_test_key'));
    const types = got.map((e) => `${e.type}:${e.campaign_ref ?? e.item_ref ?? e.gift_ref ?? ''}`);
    assert.ok(types.includes('promotion:test_yukleme'), types.join());
    assert.ok(types.includes('coin_spend:VIP 7 gün'), types.join());
    assert.ok(types.includes('promotion:test_satin_alma'), types.join());
    const gifts = got.filter((e) => e.type === 'gift');
    assert.equal(gifts.length, 2, 'hediye başına tek olay; gönderenin jeton satırı ayrıca gitmez');
    assert.ok(gifts.every((g) => g.sender_ref === a.user.id && g.publisher_ref === b.user.id));
    assert.ok(gifts.some((g) => g.gift_ref === 'g1') && gifts.some((g) => g.gift_ref === 'aktarim'));
    assert.ok(!got.some((e) => e.type === 'purchase'), 'test satın alması gerçek gelir sayılmaz');
    const conv = of(b.user.id).find((e) => e.campaign_ref === 'elmas_cevirme');
    assert.equal(conv.type, 'bonus_grant');
    assert.equal(conv.coins, ex.coins);
  });

  test('panel kapalıyken hiçbir şey kaybolmaz; reddedilen olay sonra yeniden denenir', async () => {
    const a = await signUp('A');
    panel.down = true;
    await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, a.session);
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(of(a.user.id).length, 0);
    const [, admin] = await until(async () => {
      const [, s] = await h.sql.query('SELECT last_error FROM finance_sync').then((r) => [0, r.rows[0]]);
      return s.last_error ? [0, s] : null;
    });
    assert.match(admin.last_error, /503/);

    panel.down = false;
    panel.refuse = 'coin_spend';
    await call('POST', '/api/wallet/spend', { amount: 100, reason: 'Rütbe', ref: rnd(6) }, a.session);
    await until(() => of(a.user.id).some((e) => e.campaign_ref === 'test_yukleme'));
    const failed = await until(async () => (await h.sql.query("SELECT * FROM finance_sync_failed WHERE event->>'type' = 'coin_spend'")).rows[0]);
    assert.match(failed.error, /Tanımsız/);

    // An admin sees it; once the panel accepts it and its wait is over, it goes and leaves the list.
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.user.id]);
    const [code, status] = await call('GET', '/api/admin/finance-sync', null, a.session);
    assert.equal(code, 200);
    assert.ok(status.enabled && status.failed >= 1 && status.lastError === null);
    panel.refuse = null;
    await h.sql.query('UPDATE finance_sync_failed SET next_try = now()');
    await until(() => of(a.user.id).some((e) => e.type === 'coin_spend'));
    await until(async () => (await h.sql.query('SELECT count(*)::int AS n FROM finance_sync_failed')).rows[0].n === 0);
    const b = await signUp('B');
    assert.equal((await call('GET', '/api/admin/finance-sync', null, b.session))[0], 403);
  });
});

describe('Defter satırı → panel olayı', () => {
  const row = (x) => ({ id: 7, user_id: 'u1', counterparty: null, channel: null, detail: {}, created_at: '2026-11-01T10:00:00Z', ref: 'r', reason: '', ...x });

  test('mağaza satın alması: liste fiyatıyla satış + ilk alım hediyesi; iadesi aynı satışa bağlanır', () => {
    const buy = eventsOf(row({ currency: 'coin', amount: 2000, channel: 'mixed', detail: { purchase: 42 }, platform: 'android', product_id: 'coins_1000', p_coins: 1000, p_bonus: 1000 }));
    assert.deepEqual(
      buy.map((e) => [e.type, e.idempotency_key, e.channel ?? e.campaign_ref, e.amount, e.coins]),
      [
        ['purchase', 'purchase-42', 'google', '29.99', 1000],
        ['bonus_grant', 'purchase-42-bonus', 'ilk_alim_hediyesi', undefined, 1000],
      ],
    );
    const back = eventsOf(row({ currency: 'coin', amount: -800, reason: 'İade: satın alınan jeton geri alındı', detail: { purchase: 42 }, platform: 'ios' }));
    assert.deepEqual(back.map((e) => [e.type, e.idempotency_key, e.original_key]), [['refund', 'refund-42', 'purchase-42']]);
    // Coins already spent: only gift diamonds come back, and it is still the purchase's refund.
    const dia = eventsOf(row({ currency: 'diamond', amount: -500, reason: 'İade: hediye elması geri alındı', counterparty: 'u2', detail: { purchase: 42 }, platform: 'android' }));
    assert.deepEqual(dia.map((e) => [e.type, e.idempotency_key]), [['refund', 'refund-42']]);
  });

  test('toptan alım satıştır; Jeton Noktası → kullanıcı aktarımı ve elmas düşüşleri gönderilmez', () => {
    const [w] = eventsOf(row({ currency: 'coin', amount: 100000, channel: 'toptan', detail: { priceTl: 2350.5 } }));
    assert.deepEqual([w.type, w.channel, w.amount, w.coins], ['purchase', 'jeton_noktasi', '2350.50', 100000]);
    assert.deepEqual(eventsOf(row({ currency: 'coin', amount: 500, channel: 'jeton_noktasi', reason: 'Jeton Noktası yüklemesi' })), []);
    assert.deepEqual(eventsOf(row({ currency: 'coin', amount: -500, reason: 'Jeton Noktası satışı' })), []);
    assert.deepEqual(eventsOf(row({ currency: 'diamond', amount: -500, reason: 'Jetona çevrildi' })), []);
    assert.deepEqual(eventsOf(row({ currency: 'game', amount: 50, reason: 'Oyun' })), []);
  });
});
