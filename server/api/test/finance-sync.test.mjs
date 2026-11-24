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
    assert.equal((await call('POST', '/api/shop/buy', { sku: 'fr-neon', price: 150, ref: rnd(6) }, a.session))[0], 200);
    await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: `txn_${rnd(6)}` }, a.session);
    await call('POST', '/api/wallet/gift', { to: b.user.id, amount: 1500, ref: rnd(6) }, a.session);
    await h.sql.query('UPDATE diamond_locks SET unlock_at = now()');
    const [st, ex] = await call('POST', '/api/wallet/exchange', { diamonds: 1000, ref: rnd(6) }, b.session);
    assert.equal(st, 200, ex.error);

    const got = await until(() => (of(b.user.id).some((e) => e.campaign_ref === 'elmas_cevirme') ? of(a.user.id) : null));
    assert.ok(panel.apiKeys.has('fc_test_key'));
    const types = got.map((e) => `${e.type}:${e.campaign_ref ?? e.item_ref ?? e.gift_ref ?? ''}`);
    assert.ok(types.includes('promotion:test_yukleme'), types.join());
    assert.ok(types.includes('coin_spend:fr-neon'), types.join());
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
    assert.equal((await call('POST', '/api/shop/buy', { sku: 'fr-neon', price: 150, ref: rnd(6) }, a.session))[0], 200);
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

  test('biten günlerin konuşma, dinleme ve arama dakikaları panele kullanım olarak gider; panel reddederse gün bekler', async () => {
    const day = async (n) => (await h.sql.query("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date - $1::int, 'YYYY-MM-DD') AS d", [n])).rows[0].d;
    const [d3, d2, d1, d0] = [await day(3), await day(2), await day(1), await day(0)];
    const sent = () => h.sql.query("SELECT to_char(usage_day, 'YYYY-MM-DD') AS day, usage_error, last_error FROM finance_sync WHERE id = 1").then((r) => r.rows[0]);
    // Two days ago: 10 minutes in voice rooms, 2 of them speaking, and a minute and a half of video call. Yesterday
    // nothing; today isn't over.
    await h.sql.query("INSERT INTO media_minutes (day, kind, seconds) VALUES ($1, 'room', 600), ($1, 'speaker', 120), ($1, 'call_video', 90), ($2, 'room', 60)", [d2, d0]);

    // The panel refuses (no such provider there yet): the day waits, the money feed stays healthy.
    panel.refuse = 'usage';
    await h.sql.query('UPDATE finance_sync SET usage_day = $1, usage_error = NULL WHERE id = 1', [d3]);
    const waiting = await until(async () => ((await sent()).usage_error ? sent() : null));
    assert.match(waiting.usage_error, new RegExp(`^${d2}: Tanımsız`));
    assert.deepEqual([waiting.day, waiting.last_error], [d3, null]);
    assert.ok(!panel.events.some((e) => e.type === 'usage'));

    panel.refuse = null;
    const usage = await until(() => {
      const u = panel.events.filter((e) => e.type === 'usage');
      return u.length >= 8 ? u : null;
    });
    const of = (d) => Object.fromEntries(usage.filter((e) => e.idempotency_key.endsWith(d)).map((e) => [e.service, e.quantity]));
    assert.deepEqual(of(d2), { oda_konusan_dk: '2.00', oda_dinleyen_dk: '8.00', sesli_gorusme_dk: '0.00', goruntulu_gorusme_dk: '1.50' });
    assert.deepEqual(of(d1), { oda_konusan_dk: '0.00', oda_dinleyen_dk: '0.00', sesli_gorusme_dk: '0.00', goruntulu_gorusme_dk: '0.00' }, 'ölçüldü, yok');
    assert.deepEqual(of(d0), {}, 'bugün bitmedi');
    const one = usage.find((e) => e.idempotency_key === `usage-oda_dinleyen_dk-${d2}`);
    assert.deepEqual([one.provider_code, one.period, one.occurred_at], ['oracle', d2.slice(0, 7), `${d2}T20:59:59Z`]);
    await until(async () => {
      const s = await sent();
      return s.day === d1 && s.usage_error === null;
    });

    // The admin sees where it stands; sent days go once.
    const a = await signUp('Bakan');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.user.id]);
    const [, status] = await call('GET', '/api/admin/finance-sync', null, a.session);
    assert.deepEqual([status.usageDay, status.usageError], [d1, null]);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(panel.events.filter((e) => e.type === 'usage').length, 8);
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

  test('oyun turu oyunun kimliğiyle gider (panel kullanımını sayar); paketin ek jetonu ayrı hediye; yönetim yüklemesi gönderilmez', () => {
    const [g] = eventsOf(row({ currency: 'coin', amount: -500, reason: 'Uygulama içi: Gece Yarısı Çarkı · tur (500)', detail: { game: 'slot' } }));
    assert.deepEqual([g.type, g.item_ref, g.coins], ['coin_spend', 'slot', 500]);
    const [old] = eventsOf(row({ currency: 'coin', amount: -500, reason: 'Uygulama içi: Gece Yarısı Çarkı · tur (500)' }));
    assert.equal(old.item_ref, 'Gece Yarısı Çarkı · tur (500)');
    const buy = eventsOf(row({ currency: 'coin', amount: 5500, channel: 'mixed', detail: { purchase: 43 }, platform: 'android', product_id: 'coins_5000', p_coins: 5000, p_bonus: 0, p_extra: 500 }));
    assert.deepEqual(buy.map((e) => [e.type, e.idempotency_key, e.campaign_ref ?? e.channel, e.coins]), [
      ['purchase', 'purchase-43', 'google', 5000],
      ['bonus_grant', 'purchase-43-ek', 'paket_ek_jeton', 500],
    ]);
    for (const x of [
      { amount: -1000, reason: 'Yönetim jeton yüklemesi', channel: 'toptan', detail: { transfer: 1, valueTl: 50 } },
      { amount: 1000, reason: 'Jeton yüklemesi (yönetim)', channel: 'jeton_noktasi', detail: { transfer: 1, valueTl: 50 } },
      { amount: -1000, reason: 'Yanlış jeton yüklemesi geri alındı', channel: 'jeton_noktasi', detail: { transfer: 2, reverses: 1 } },
      { amount: 1000, reason: 'Geri alınan yönetim yüklemesi', channel: 'toptan', detail: { transfer: 2, reverses: 1 } },
    ])
      assert.deepEqual(eventsOf(row({ currency: 'coin', ...x })), [], x.reason);
  });

  test('toptan alım satıştır; Jeton Noktası → kullanıcı aktarımı ve elmas düşüşleri gönderilmez', () => {
    const [w] = eventsOf(row({ currency: 'coin', amount: 100000, channel: 'toptan', detail: { priceTl: 2350.5 } }));
    assert.deepEqual([w.type, w.channel, w.amount, w.coins], ['purchase', 'jeton_noktasi', '2350.50', 100000]);
    assert.deepEqual(eventsOf(row({ currency: 'coin', amount: 500, channel: 'jeton_noktasi', reason: 'Jeton Noktası yüklemesi' })), []);
    assert.deepEqual(eventsOf(row({ currency: 'coin', amount: -500, reason: 'Jeton Noktası satışı' })), []);
    assert.deepEqual(eventsOf(row({ currency: 'diamond', amount: -500, reason: 'Jetona çevrildi' })), []);
    assert.deepEqual(eventsOf(row({ currency: 'game', amount: 50, reason: 'Oyun' })), []);
  });

  test('ücretli mesaj hediye, arama dakikası arama olarak; kazananın elmas satırı ikinci kez gitmez', () => {
    const [m] = eventsOf(row({ currency: 'coin', amount: -240, counterparty: 'star', reason: 'Mesaj ücreti', ref: 'msg:5', detail: { oneOnOne: 'message', message: 5 } }));
    assert.deepEqual([m.type, m.sender_ref, m.publisher_ref, m.coins, m.gift_ref], ['gift', 'u1', 'star', 240, 'mesaj_ucreti']);
    const [k] = eventsOf(row({ currency: 'coin', amount: -2000, counterparty: 'star', reason: 'Görüntülü arama · 2. dakika', ref: 'call:9:2', detail: { oneOnOne: 'video_call', call: 9 } }));
    assert.deepEqual([k.type, k.user_ref, k.publisher_ref, k.coins, k.minutes, k.kind], ['call', 'u1', 'star', 2000, '1', 'video']);
    const [e] = eventsOf(row({ currency: 'coin', amount: -500, reason: 'Sesli eşleşme · 1. dakika', detail: { oneOnOne: 'match_voice' } }));
    assert.deepEqual([e.type, e.coins, e.item_ref], ['coin_spend', 500, 'match_voice'], 'kimse kazanmazsa harcama');
    assert.deepEqual(eventsOf(row({ currency: 'diamond', amount: 240, counterparty: 'u1', reason: 'Mesaj ücreti', ref: 'msg:5-in' })), []);
    // Özel albüm (private-album.mjs): a gift to the streamer named 'ozel_album'; the streamer's diamond row isn't sent again.
    const [a] = eventsOf(row({ currency: 'coin', amount: -500, counterparty: 'star', reason: 'Özel albüm: Yıldız', ref: 'alb1', detail: { privateAlbum: 'star' } }));
    assert.deepEqual([a.type, a.sender_ref, a.publisher_ref, a.coins, a.gift_ref], ['gift', 'u1', 'star', 500, 'ozel_album']);
    assert.deepEqual(eventsOf(row({ currency: 'diamond', amount: 500, counterparty: 'u1', reason: 'Özel albüm açıldı: Kaan', ref: 'alb1-in' })), []);
  });

  test('ödül jetonu kampanya, geri alınması harcama; uygulama içi harcamalar ve çanta hediyesi gider', () => {
    const grant = (reason) => eventsOf(row({ currency: 'coin', amount: 100, channel: 'odul', reason }))[0];
    assert.deepEqual(['Hoş geldin hediyesi', 'Davet ödülü: arkadaşın katıldı', 'Görev ödülü: 1 görüntülü arama yap', 'Aile sandığı: Bronz'].map((x) => [grant(x).type, grant(x).campaign_ref]), [
      ['bonus_grant', 'hos_geldin'],
      ['bonus_grant', 'davet_odulu'],
      ['bonus_grant', 'gorev_odulu'],
      ['bonus_grant', 'aile_sandigi'],
    ]);
    const spend = (reason, detail = {}) => eventsOf(row({ currency: 'coin', amount: -500, reason, detail })).map((x) => [x.type, x.coins, x.item_ref]);
    assert.deepEqual(spend('Aile kurma: Kartallar'), [['coin_spend', 500, 'aile_kurma']]);
    assert.deepEqual(spend('Animasyon: Konfeti', { animation: 'confetti' }), [['coin_spend', 500, 'oda_animasyonu:confetti']]);
    assert.deepEqual(spend('Koltuk rengi: Pembe', { seatColor: 'pink' }), [['coin_spend', 500, 'koltuk_rengi:pink']]);
    assert.deepEqual(spend('Oda süslemesi: özel görsel (30 gün)'), [['coin_spend', 500, 'oda_ozel_gorsel']]);
    assert.deepEqual(spend('Davet ödülü geri alındı'), [['coin_spend', 500, 'davet_odulu_geri_alindi']]);
    // Held coins: a bond request and a bag change hands later (the accepted bond and the bag's gifts are gifts).
    assert.deepEqual(spend('Bağ isteği: Kanka (Kanka)'), []);
    assert.deepEqual(spend('Jeton çantası: 1.000 jeton'), []);
    const [b] = eventsOf(row({ currency: 'diamond', amount: 1999, counterparty: 'giver', reason: 'Şanslı çanta: Roket ×1', ref: 'bag:3:0-in', gift_id: 'g6', gift_room: 'oda-x' }));
    assert.deepEqual([b.type, b.sender_ref, b.publisher_ref, b.coins, b.gift_ref, b.room_ref], ['gift', 'giver', 'u1', 1999, 'g6', 'oda-x']);
  });
});
