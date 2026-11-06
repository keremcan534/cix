// The money handlers under Canlı ayarlar (live-settings.mjs), against a real Postgres: a hidden gift refused
// with nothing moved while an earlier ref still replays; Çevir at the live rate (more coins when it rises, 409
// rate_changed / update_required when it falls below what the screen showed, replays at the original amount);
// the campaign on test-store and Google purchases by the store's purchase time, its 'kampanya' lot, the daily
// play-coin cap, a refund taking it back and the finance feed sending it once; a hidden pack still credited;
// lowered withdrawal limits; SMS sign-in switched off with the hourly cap at 0.
//   PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { EXCHANGE, GIFTS, PACKS, exchangeCoins } from '../catalog.mjs';
import { eventsOf } from '../finance-sync.mjs';
import { campaignRef } from '../live-registry.mjs';
import { fakeStores } from './fake-stores.mjs';
import { rnd, startApi } from './harness.mjs';

// The finance panel stand-in: keeps every event it got, answers created / duplicate like the real one.
const panel = { events: [], keys: new Set() };
const srv = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const { events } = JSON.parse(raw);
    const results = events.map((e) => {
      panel.events.push(e);
      if (panel.keys.has(e.idempotency_key)) return { key: e.idempotency_key, status: 'duplicate' };
      panel.keys.add(e.idempotency_key);
      return { key: e.idempotency_key, status: 'created' };
    });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ results }));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
srv.unref();
after(() => srv.close());

const stores = await fakeStores();
// The daily play-coin cap is set so the campaign test can show both today's and the new campaign coins count.
const DAILY = 820_000;
const h = startApi({
  ...stores.env,
  ALLOW_SANDBOX_PURCHASES: '1',
  TEST_TOPUP_DAILY: String(DAILY),
  SMS_PROVIDER: 'log',
  PHONE_SIGN_IN: '1',
  LIVE_POLL_MS: '200',
  FINANCE_API_KEY: 'fc_test_key',
  FINANCE_INGEST_URL: `http://127.0.0.1:${srv.address().port}/api/ingest/events`,
  FINANCE_SYNC_MS: '150',
  FINANCE_SYNC_LAG_S: '0',
  AGENCY_JOBS: '0',
});
const { call } = h;

const SETTINGS = '/api/admin/live-settings';
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 50));
  }
};
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const balance = async (id) => {
  const [u] = await q('SELECT coins, diamonds, svip_xp FROM users WHERE id = $1', [id]);
  return { coins: Number(u.coins), diamonds: Number(u.diamonds), svipXp: Number(u.svip_xp) };
};
/** Every lock of the account's diamonds made free now, so they can be exchanged or withdrawn. */
const unlock = (id) => h.sql.query("UPDATE diamond_locks SET unlock_at = now() - interval '1 second' WHERE user_id = $1", [id]);
const catalog = async () => ok(call('GET', '/api/catalog'));

let admin;
/** A save as the admin panel makes it: on top of the version it read, confirmed. */
async function setLive(changes) {
  const view = await ok(call('GET', SETTINGS, null, admin.session));
  return ok(call('POST', SETTINGS, { changes, reason: 'Canlı para testi', baseV: view.v, confirm: true }, admin.session));
}

describe('Canlı ayarlar para uçlarında', () => {
  test('başlangıç: katalog derlenmiş değerlerle, kur ve sürüm bilgisiyle', async () => {
    admin = await h.account('Yönetici', 'admin');
    const cat = await catalog();
    assert.equal(cat.gifts.length, GIFTS.size);
    assert.equal(cat.packs.length, PACKS.length);
    assert.deepEqual(cat.exchange, { usdTry: EXCHANGE.usdTry, minDiamonds: EXCHANGE.minDiamonds });
    assert.equal(cat.campaign, null);
    assert.equal(cat.v, 0);
  });

  test('gizlenen hediye: 400, jeton ve elmas yerinde; önceki ref yine tekrar olarak döner', async () => {
    const s = await h.signUp('Gönderen');
    const r = await h.signUp('Alan');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: rnd(6) }, s.session));
    const ref = rnd(8);
    const first = await ok(call('POST', '/api/gifts/send', { to: r.user.id, giftId: 'g2', count: 5, ref }, s.session));
    assert.deepEqual([first.replay, first.total], [false, 250]);

    const saved = await setLive({ gifts_hidden: ['g2'] });
    const cat = await catalog();
    assert.equal(cat.v, saved.v);
    assert.ok(!cat.gifts.some((g) => g.id === 'g2'), 'gizli hediye katalogda yok');
    assert.equal(cat.gifts.length, GIFTS.size - 1);

    const [sb, rb] = [await balance(s.user.id), await balance(r.user.id)];
    const [st, j] = await call('POST', '/api/gifts/send', { to: r.user.id, giftId: 'g2', count: 1, ref: rnd(8) }, s.session);
    assert.equal(st, 400);
    assert.equal(j.error, 'Bu hediye artık yok');
    assert.deepEqual([await balance(s.user.id), await balance(r.user.id)], [sb, rb], 'hiçbir şey kımıldamadı');

    // The retry of the send that went through, even with another count in the body: its own total.
    const again = await ok(call('POST', '/api/gifts/send', { to: r.user.id, giftId: 'g2', count: 10, ref }, s.session));
    assert.deepEqual([again.replay, again.total], [true, 250]);
    assert.deepEqual(await balance(s.user.id), sb);
    assert.equal(Number((await q('SELECT count(*) FROM gift_events WHERE sender = $1', [s.user.id]))[0].count), 1);

    await setLive({ gifts_hidden: null });
    assert.ok((await catalog()).gifts.some((g) => g.id === 'g2'));
    await ok(call('POST', '/api/gifts/send', { to: r.user.id, giftId: 'g2', count: 1, ref: rnd(8) }, s.session));
  });

  test('Çevir canlı kurla: yükselen kur daha çok verir, düşen kur ekranda görüneni korur, tekrar ilk tutarı verir', async () => {
    const fan = await h.signUp('Hayran');
    const host = await h.signUp('Yayıncı');
    await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_100000', transactionId: rnd(8) }, fan.session));
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g8', count: 5, ref: rnd(8) }, fan.session));
    await unlock(host.user.id);
    const n = 10_000;
    const exchange = (body) => call('POST', '/api/wallet/exchange', { diamonds: n, ref: rnd(8), ...body }, host.session);

    // The compiled rate: old apps (no usdTry) and new ones get the same.
    assert.equal((await ok(exchange({}))).coins, exchangeCoins(n));
    assert.equal((await ok(exchange({ usdTry: EXCHANGE.usdTry }))).coins, exchangeCoins(n));

    await setLive({ exchange_usd_try: 52 });
    assert.equal((await catalog()).exchange.usdTry, 52);
    const up = exchangeCoins(n, 52);
    assert.ok(up > exchangeCoins(n));
    assert.equal((await ok(exchange({}))).coins, up, 'eski uygulama yüksek kurdan alır');
    assert.equal((await ok(exchange({ usdTry: EXCHANGE.usdTry }))).coins, up, 'ekranda eski kur görünse de yenisi verilir');
    const kept = rnd(8);
    const first = await ok(call('POST', '/api/wallet/exchange', { diamonds: n, ref: kept, usdTry: 52 }, host.session));
    assert.deepEqual([first.replay, first.coins], [false, up]);
    const [row] = await q("SELECT detail FROM ledger WHERE user_id = $1 AND currency = 'diamond' AND ref = $2", [host.user.id, kept]);
    assert.deepEqual([row.detail.coins, row.detail.usdTry], [up, 52]);

    // The screen showed more than the server gives now: refused, nothing moves.
    let before = await balance(host.user.id);
    let [st, j] = await exchange({ usdTry: 55 });
    assert.equal(st, 409);
    assert.deepEqual(j, { error: 'Kur değişti, yeni tutarı kontrol et', code: 'rate_changed', usdTry: 52, coins: up });
    [st, j] = await exchange({ usdTry: '52' });
    assert.equal(st, 409, 'sayı olmayan kur');
    assert.equal(j.code, 'rate_changed');
    assert.deepEqual(await balance(host.user.id), before);

    await setLive({ exchange_usd_try: 47 });
    before = await balance(host.user.id);
    [st, j] = await exchange({});
    assert.equal(st, 409);
    assert.deepEqual(j, { error: 'Çevirme kuru değişti. Güncel tutar için uygulamayı güncelle', code: 'update_required' });
    assert.deepEqual(await balance(host.user.id), before, 'eski uygulamadan hiçbir şey alınmadı');
    assert.equal((await ok(exchange({ usdTry: 47 }))).coins, exchangeCoins(n, 47));

    // The ref that went through at 52: its own coins, not today's amount or body.
    const again = await ok(call('POST', '/api/wallet/exchange', { diamonds: 20_000, ref: kept, usdTry: 47 }, host.session));
    assert.deepEqual([again.replay, again.coins], [true, up]);
    // Old apps work again once the rate is back at the compiled one.
    await setLive({ exchange_usd_try: null });
    assert.equal((await ok(exchange({}))).coins, exchangeCoins(n));
  });

  test('gizlenen paket katalogda yok, satın alınmışsa yine yüklenir', async () => {
    await setLive({ packs_hidden: ['p2'] });
    const cat = await catalog();
    assert.ok(!cat.packs.some((p) => p.id === 'p2'));
    assert.equal(cat.packs.length, PACKS.length - 1);
    const u = await h.signUp('Paket');
    const out = await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_5000', transactionId: rnd(8) }, u.session));
    assert.deepEqual([out.coins, out.bonus, out.campaignBonus], [5_000, 2_500, 0]);
    assert.equal((await balance(u.user.id)).coins, 7_500);
    await setLive({ packs_hidden: null });
    assert.equal((await catalog()).packs.length, PACKS.length);
  });

  test('para çekme sınırları düşünce kurallar yeni değerleri gösterir, üstü 400; önceki talep yine tekrar olarak döner', async () => {
    const fan = await h.signUp('Çekim hayranı');
    const host = await h.signUp('Çekim yayıncısı');
    await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_100000', transactionId: rnd(8) }, fan.session));
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g8', count: 5, ref: rnd(8) }, fan.session));
    await unlock(host.user.id);
    const details = { holder: 'Deniz Yıldız', account: 'TR330006100519786457841326' };
    const ask = (diamonds, ref = rnd(8)) => call('POST', '/api/wallet/withdraw', { diamonds, method: 'iban', details, ref }, host.session);

    await setLive({ withdraw_weekly_diamonds: 60_000 });
    let rules = (await ok(call('GET', '/api/wallet/withdrawals', null, host.session))).rules;
    assert.deepEqual(rules, { minDiamonds: 50_000, maxDiamonds: 5_000_000, weeklyDiamonds: 60_000, weekUsed: 0 });
    const before = await balance(host.user.id);
    let [st, j] = await ask(70_000);
    assert.equal(st, 400);
    assert.equal(j.error, '7 günde en çok 60.000 elmas çekilebilir');
    assert.deepEqual(await balance(host.user.id), before);

    const ref = rnd(8);
    const w = await ok(ask(60_000, ref));
    assert.equal(w.withdrawal.diamonds, 60_000);

    await setLive({ withdraw_max_diamonds: 50_000 });
    rules = (await ok(call('GET', '/api/wallet/withdrawals', null, host.session))).rules;
    assert.deepEqual(rules, { minDiamonds: 50_000, maxDiamonds: 50_000, weeklyDiamonds: 60_000, weekUsed: 60_000 });
    // The request made under the old limit: a retry is its replay, not a 400.
    const again = await ok(ask(60_000, ref));
    assert.deepEqual([again.replay, again.withdrawal.id], [true, w.withdrawal.id]);
    [st, j] = await ask(55_000);
    assert.equal(st, 400);
    assert.equal(j.error, 'Tek seferde en az 50.000, en çok 50.000 elmas çekilebilir');

    await setLive({ withdraw_max_diamonds: null, withdraw_weekly_diamonds: null });
    rules = (await ok(call('GET', '/api/wallet/withdrawals', null, host.session))).rules;
    assert.deepEqual([rules.maxDiamonds, rules.weeklyDiamonds], [5_000_000, 10_000_000]);
  });

  test('saatlik SMS sınırı 0: kod gönderimi 503, geri açınca çalışır', async () => {
    const phone = () => `+90532${String(1_000_000 + Math.floor(Math.random() * 8_999_999))}`;
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: phone() }))[0], 200);
    await setLive({ otp_global_per_hour: 0 });
    const [st, j] = await call('POST', '/api/auth/otp/start', { phone: phone() });
    assert.equal(st, 503);
    assert.deepEqual(j, { error: 'Telefon doğrulama henüz açık değil', feature: 'sms' });
    await setLive({ otp_global_per_hour: null });
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: phone() }))[0], 200);
  });
});

describe('Kampanya', () => {
  let campaign;
  let createdAt;
  const tokBefore = `before${rnd(10)}`;
  const tokIn = `inside${rnd(10)}`;
  const google = (s, productId, token) => call('POST', '/api/wallet/purchase', { platform: 'android', productId, token }, s);
  const lotsOf = (purchase) => q('SELECT channel, amount, remaining, purchase_id FROM coin_lots WHERE purchase_id = $1 ORDER BY id', [purchase]);
  const purchaseOf = async (user, productId) => (await q('SELECT * FROM purchases WHERE user_id = $1 AND product_id = $2 ORDER BY id DESC LIMIT 1', [user, productId]))[0];

  test('kampanya açılınca katalogda görünür; kurulmadan önce yapılan alım kampanya almaz', async () => {
    const start = new Date(Date.now() - 4 * 60_000).toISOString();
    const end = new Date(Date.now() + 24 * 3600_000).toISOString();
    await setLive({ campaign: { percent: 20, startsAt: start, endsAt: end, label: 'Hafta sonu' } });
    campaign = (await catalog()).campaign;
    assert.equal(campaign.percent, 20);
    assert.equal(campaign.label, 'Hafta sonu');
    createdAt = new Date((await q("SELECT created_at FROM live_settings WHERE key = 'campaign' ORDER BY id DESC LIMIT 1"))[0].created_at).getTime();

    // Bought inside the campaign's window but before it was set: verified now, still no campaign.
    const u = await h.signUp('Erken alıcı');
    stores.purchaseTimes.set(tokBefore, createdAt - 60_000);
    const out = await ok(google(u.session, 'coins_10000', tokBefore));
    assert.deepEqual([out.coins, out.bonus, out.campaignBonus], [10_000, 0, 0]);
    const p = await purchaseOf(u.user.id, 'coins_10000');
    assert.deepEqual([Number(p.campaign_bonus), p.campaign_ref], [0, null]);
    assert.deepEqual((await lotsOf(p.id)).map((l) => l.channel), ['google']);
  });

  test('test mağazası alımı: kampanya lotu, sütunlar, yanıt; SVIP puanı yalnız paket', async () => {
    const u = await h.signUp('Kampanya alıcısı');
    const out = await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, u.session));
    assert.deepEqual([out.coins, out.bonus, out.campaignBonus], [1_000, 1_000, 200]);
    const p = await purchaseOf(u.user.id, 'coins_1000');
    assert.equal(Number(p.campaign_bonus), 200);
    assert.equal(p.campaign_ref, campaignRef(campaign));
    assert.match(p.campaign_ref, /^kampanya_\d{8}_20$/);
    assert.deepEqual(
      (await lotsOf(p.id)).map((l) => [l.channel, Number(l.amount), Number(l.purchase_id)]),
      [
        ['test', 1_000, Number(p.id)],
        ['bonus', 1_000, Number(p.id)],
        ['kampanya', 200, Number(p.id)],
      ],
    );
    const b = await balance(u.user.id);
    assert.deepEqual([b.coins, b.svipXp], [2_200, 1_000], 'SVIP puanı kampanya ve hediye jetonunu saymaz');
    const [led] = await q("SELECT reason, amount FROM ledger WHERE user_id = $1 AND currency = 'coin'", [u.user.id]);
    assert.deepEqual([led.reason, Number(led.amount)], ['Jeton satın alma (+1000 ilk alım hediyesi, +200 kampanya)', 2_200]);
    const coins = await ok(call('GET', '/api/wallet/coins', null, u.session));
    assert.ok(coins.channels.some((c) => c.channel === 'kampanya' && c.label === 'Kampanya hediyesi'));
  });

  test('günlük test jetonu sınırı kampanya jetonlarını da sayar', async () => {
    const u = await h.signUp('Sınır');
    const buy = (productId) => call('POST', '/api/wallet/purchase', { platform: 'test', productId, transactionId: rnd(8) }, u.session);
    assert.equal((await ok(buy('coins_500000'))).campaignBonus, 100_000);
    // 600.000 today with the campaign; 200.000 more and its 40.000 make 840.000, over 820.000. Without either
    // campaign part it would be 800.000 or 740.000 and pass.
    const [st, j] = await buy('coins_200000');
    assert.equal(st, 429);
    assert.match(j.error, /Günlük test yükleme sınırı/);
    assert.equal((await ok(buy('coins_100000'))).campaignBonus, 20_000, '720.000 sınırın altında');
    assert.equal((await balance(u.user.id)).coins, 720_000);
  });

  test('mağaza deneme alımı kampanya almaz', async () => {
    const u = await h.signUp('Deneme');
    const out = await ok(google(u.session, 'coins_1000', `test-${rnd(10)}`));
    assert.equal(out.campaignBonus, 0);
    const p = await purchaseOf(u.user.id, 'coins_1000');
    assert.deepEqual([p.sandbox, Number(p.campaign_bonus)], [true, 0]);
  });

  test('Google: kampanya içinde alınıp bittikten sonra doğrulanan alım kampanyayı alır; tekrar ikinci kez vermez', async () => {
    const u = await h.signUp('Google alıcısı');
    stores.purchaseTimes.set(tokIn, Date.now());
    await new Promise((r) => setTimeout(r, 20));
    await setLive({ campaign: null });
    assert.equal((await catalog()).campaign, null);

    const out = await ok(google(u.session, 'coins_20000', tokIn));
    assert.deepEqual([out.replay, out.coins, out.campaignBonus], [false, 20_000, 4_000]);
    const again = await ok(google(u.session, 'coins_20000', tokIn));
    assert.deepEqual([again.replay, again.campaignBonus], [true, 4_000]);
    const p = await purchaseOf(u.user.id, 'coins_20000');
    assert.equal(p.campaign_ref, campaignRef(campaign));
    assert.deepEqual(
      (await lotsOf(p.id)).map((l) => [l.channel, Number(l.amount)]),
      [
        ['google', 20_000],
        ['kampanya', 4_000],
      ],
    );
    assert.equal((await balance(u.user.id)).coins, 24_000);

    // Bought after the end: nothing.
    const late = await ok(google(u.session, 'coins_1000', `after${rnd(10)}`));
    assert.equal(late.campaignBonus, 0);
  });

  test('iade kampanya lotunu ve ondan gelen elmas kilidini geri alır', async () => {
    // A campaign again, running now (a new row, so this purchase gets it).
    await setLive({ campaign: { percent: 20, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), label: 'İade testi' } });
    const buyer = await h.signUp('İade alıcısı');
    const host = await h.signUp('İade yayıncısı');
    const out = await ok(google(buyer.session, 'coins_10000', `refund${rnd(10)}`));
    assert.equal(out.campaignBonus, 2_000);
    const p = await purchaseOf(buyer.user.id, 'coins_10000');
    // 10.000 store coins, then 1.000 of the campaign's.
    for (let i = 0; i < 2; i++) await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'c1', count: 1, ref: rnd(8) }, buyer.session));
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g4', count: 5, ref: rnd(8) }, buyer.session));
    const kLot = (await lotsOf(p.id)).find((l) => l.channel === 'kampanya');
    assert.equal(Number(kLot.remaining), 1_000);
    const kLock = (await q("SELECT l.status, l.amount FROM diamond_locks l JOIN coin_lots c ON c.id = l.coin_lot WHERE c.purchase_id = $1 AND c.channel = 'kampanya'", [p.id]))[0];
    assert.deepEqual([kLock.status, Number(kLock.amount)], ['active', 1_000]);

    const r = await ok(call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session));
    assert.deepEqual(r, { coins: 1_000, diamonds: 11_000, unrecoveredDiamonds: 0 });
    assert.equal(Number((await lotsOf(p.id)).find((l) => l.channel === 'kampanya').remaining), 0);
    const locks = await q('SELECT l.status, c.channel FROM diamond_locks l JOIN coin_lots c ON c.id = l.coin_lot WHERE c.purchase_id = $1', [p.id]);
    assert.ok(locks.length >= 3 && locks.every((l) => l.status === 'reversed'));
    assert.ok(locks.some((l) => l.channel === 'kampanya'));
    assert.deepEqual([(await balance(buyer.user.id)).coins, (await balance(host.user.id)).diamonds], [0, 0]);
    const audit = await ok(call('GET', `/api/admin/wallet/audit?user=${buyer.user.id}`, null, admin.session));
    assert.equal(audit.purchases[0].campaign_bonus, 2_000);
    await setLive({ campaign: null });
  });

  test('finans paneline kampanya jetonu bir kez bonus_grant olarak gider', async () => {
    const p = (await q("SELECT id, user_id, campaign_bonus, campaign_ref FROM purchases WHERE platform = 'android' AND campaign_bonus > 0 ORDER BY id LIMIT 1"))[0];
    const key = `purchase-${p.id}-kampanya`;
    const got = await until(() => panel.events.filter((e) => e.idempotency_key === key).length && panel.events.filter((e) => e.idempotency_key === key));
    assert.equal(got.length, 1, 'bir kez gönderildi');
    assert.deepEqual([got[0].type, got[0].coins, got[0].campaign_ref, got[0].user_ref], ['bonus_grant', Number(p.campaign_bonus), p.campaign_ref, p.user_id]);
    assert.ok(panel.keys.has(`purchase-${p.id}`), 'satın almanın kendisi de gitti');
    // Nothing else for the campaign coins: no other event carries them.
    await until(async () => Number((await q('SELECT last_id FROM finance_sync WHERE id = 1'))[0].last_id) >= Number((await q('SELECT max(id) AS m FROM ledger'))[0].m));
    assert.equal(panel.events.filter((e) => e.idempotency_key === key).length, 1);
    assert.ok(!panel.events.some((e) => e.campaign_ref === 'kampanya'));
  });

  test('eventsOf: mağaza alımının kampanyası ayrı bonus_grant, ilk alım hediyesi gibi', () => {
    const row = {
      id: 7,
      user_id: 'u1',
      currency: 'coin',
      amount: 12_000,
      reason: 'Jeton satın alma (+2000 kampanya)',
      ref: 'buy_x',
      channel: 'mixed',
      detail: { purchase: 42 },
      created_at: '2026-11-05T10:00:00Z',
      platform: 'android',
      product_id: 'coins_10000',
      p_coins: 10_000,
      p_bonus: 0,
      p_sandbox: false,
      p_campaign_bonus: 2_000,
      p_campaign_ref: 'kampanya_20261105_20',
    };
    assert.deepEqual(
      eventsOf(row).map((e) => [e.type, e.idempotency_key, e.coins, e.campaign_ref ?? null]),
      [
        ['purchase', 'purchase-42', 10_000, null],
        ['bonus_grant', 'purchase-42-kampanya', 2_000, 'kampanya_20261105_20'],
      ],
    );
    assert.deepEqual(eventsOf({ ...row, p_campaign_bonus: 0, p_campaign_ref: null }).map((e) => e.type), ['purchase']);
  });

  test('ileride başlayacak kampanya katalogda henüz görünmez', async () => {
    const start = Date.now() + 3600_000;
    await setLive({ campaign: { percent: 10, startsAt: new Date(start).toISOString(), endsAt: new Date(start + 3600_000).toISOString(), label: 'Gelecek' } });
    assert.equal((await catalog()).campaign, null);
    const u = await h.signUp('Erkenci');
    assert.equal((await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, u.session))).campaignBonus, 0);
    await setLive({ campaign: null });
  });

  // Campaign rows saved days ago. live_settings only takes new rows, so they are written with an old created_at;
  // newer rows exist, so today's settings stay as they are. These come last: earlier tests buy at times these
  // rows would cover.
  const DAY = 24 * 3600_000;
  const savedAt = (value, at) =>
    h.sql.query("INSERT INTO live_settings (batch, key, value, reason, set_by, created_at) VALUES (gen_random_uuid(), 'campaign', $1, 'Eski kampanya', $2, $3)", [
      JSON.stringify(value),
      admin.user.id,
      new Date(at),
    ]);

  test('7 günden eski alım, ondan sonra kurulan kampanyayı almaz', async () => {
    const now = Date.now();
    await savedAt({ percent: 20, startsAt: new Date(now - 8 * DAY).toISOString(), endsAt: new Date(now + DAY).toISOString(), label: 'Sekiz gün önce' }, now - 8 * DAY);
    const u = await h.signUp('Çok eski alıcı');
    const tok = `old${rnd(12)}`;
    stores.purchaseTimes.set(tok, now - 30 * DAY);
    const out = await ok(google(u.session, 'coins_10000', tok));
    assert.deepEqual([out.coins, out.bonus, out.campaignBonus], [10_000, 0, 0]);
    const p = await purchaseOf(u.user.id, 'coins_10000');
    assert.deepEqual([Number(p.campaign_bonus), p.campaign_ref], [0, null]);
    assert.deepEqual((await lotsOf(p.id)).map((l) => l.channel), ['google']);
    assert.equal((await catalog()).campaign, null, 'bugünkü ayar değişmedi');
  });

  test('7 günden önce biten kampanya içinde alınıp şimdi doğrulanan alım kampanyasını alır', async () => {
    const now = Date.now();
    const old = { percent: 10, startsAt: new Date(now - 20 * DAY).toISOString(), endsAt: new Date(now - 19 * DAY).toISOString(), label: 'Yirmi gün önce' };
    await savedAt(old, now - 20 * DAY);
    await savedAt(null, now - 19 * DAY);
    const u = await h.signUp('Geç doğrulanan');
    const tok = `late${rnd(12)}`;
    stores.purchaseTimes.set(tok, now - 19.5 * DAY);
    const out = await ok(google(u.session, 'coins_20000', tok));
    assert.deepEqual([out.coins, out.bonus, out.campaignBonus], [20_000, 0, 2_000]);
    const p = await purchaseOf(u.user.id, 'coins_20000');
    assert.deepEqual([Number(p.campaign_bonus), p.campaign_ref], [2_000, campaignRef(old)]);
    assert.deepEqual(
      (await lotsOf(p.id)).map((l) => [l.channel, Number(l.amount)]),
      [
        ['google', 20_000],
        ['kampanya', 2_000],
      ],
    );
  });

  test('mağaza alım zamanı bozuksa kampanya verilmez', async () => {
    await setLive({ campaign: { percent: 20, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), label: 'Zaman testi' } });
    const u = await h.signUp('Zamansız');
    const tok = `notime${rnd(10)}`;
    stores.purchaseTimes.set(tok, 'yok');
    assert.equal((await ok(google(u.session, 'coins_10000', tok))).campaignBonus, 0);
    // The same campaign for a purchase with its time: it does pay.
    assert.equal((await ok(google(u.session, 'coins_1000', `withtime${rnd(10)}`))).campaignBonus, 200);
    await setLive({ campaign: null });
  });
});
