// Abonelik (vip.mjs): the VIP subscription bought through the stores, against a real Postgres (harness.mjs) and a
// stand-in for Google Play and the App Store (fake-stores.mjs). Test purchases on the test server, Google
// subscriptions (account link, license testers, each token once), renewals read again (the caller's own and the
// timer's), refunds and expiry ending it, App Store renewals, and what it opens: Profiline bakanlar and Seviyeleri
// gizle.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { fakeStores } from './fake-stores.mjs';
import { rnd, startApi } from './harness.mjs';

const stores = await fakeStores();
const h = startApi({ ...stores.env, VIP_RECHECK_MIN: '0.01', GOOGLE_VOIDED_POLL_MIN: '0' });
const { call, signUp } = h;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const DAY = 86_400_000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const subscribe = (u, body) => call('POST', '/api/vip/subscribe', body, u.session);
const testBuy = (u, productId = 'vip_7d', transactionId = `t${rnd(8)}`) => subscribe(u, { platform: 'test', productId, transactionId });
const googleBuy = (u, productId, token) => subscribe(u, { platform: 'android', productId, token });
const appleBuy = (u, productId, transactionId) => subscribe(u, { platform: 'ios', productId, transactionId });
const me = async (u) => (await ok(call('GET', '/api/me', null, u.session), 'me')).user;
const status = (u) => ok(call('GET', '/api/vip', null, u.session), 'abonelik');
const near = (iso, ms, slack = 60_000) => assert.ok(Math.abs(Date.parse(iso) - ms) < slack, `${iso} ≈ ${new Date(ms).toISOString()}`);
/** A paid Google subscription in the stand-in store, linked to `u` (as the app links it). */
const googleSub = (u, productId = 'vip_30d', extra = {}) => {
  const token = `sub${rnd(12)}`;
  stores.subs.set(token, { productId, expiry: Date.now() + 30 * DAY, account: sha(u.user.id), ...extra });
  return token;
};
/** Makes a stored Google row due for another read: it ended a minute ago and was last read long ago. */
const makeDue = (token, ends = "now() - interval '1 minute'") => q(`UPDATE vip_subscriptions SET expires_at = ${ends}, checked_at = now() - interval '1 hour' WHERE store_ref = $1`, [token]);

describe('Abonelik kataloğu', () => {
  test('planlar katalogda: ürün kimlikleri ve günler; mağaza seçenekleri aynı', async () => {
    const [st, c] = await call('GET', '/api/catalog');
    assert.equal(st, 200);
    assert.deepEqual(c.vipPlans, [
      { productId: 'vip_7d', days: 7 },
      { productId: 'vip_30d', days: 30 },
      { productId: 'vip_90d', days: 90 },
    ]);
    assert.deepEqual(c.purchases, { testTopup: true, stores: { android: true, ios: true } });
  });
});

describe('Test satın alması (ALLOW_TEST_TOPUP=1)', () => {
  test('planın günleri eklenir, üst üste biner; aynı işlem bir kez; başka hesapta 409', async () => {
    const a = await signUp('Test Abone');
    const b = await signUp('Başka Abone');
    assert.equal((await me(a)).vipSubUntil, null, 'abonelik yokken null');
    const txn = `t${rnd(8)}`;
    const first = await ok(testBuy(a, 'vip_7d', txn), 'ilk');
    assert.equal(first.replay, false);
    assert.equal(first.days, 7);
    near(first.until, Date.now() + 7 * DAY);
    assert.equal(first.user.vipSubUntil, first.until);
    assert.equal((await me(a)).vipSubUntil, first.until);

    const again = await ok(testBuy(a, 'vip_7d', txn), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(again.until, first.until, 'aynı işlem gün eklemez');
    assert.equal((await testBuy(b, 'vip_7d', txn))[0], 409);

    const more = await ok(testBuy(a, 'vip_30d'), 'ikinci plan');
    near(more.until, Date.parse(first.until) + 30 * DAY, 5_000);
    const s = await status(a);
    assert.equal(s.until, more.until);
    assert.equal(s.autoRenewing, false);
    assert.deepEqual(s.plans.map((p) => p.productId), ['vip_7d', 'vip_30d', 'vip_90d']);
    assert.deepEqual(s.subscriptions.map((x) => [x.platform, x.productId, x.test]), [
      ['test', 'vip_30d', true],
      ['test', 'vip_7d', true],
    ]);
  });

  test('bilinmeyen plan, bozuk işlem kimliği ve bilinmeyen platform reddedilir', async () => {
    const a = await signUp('Hatalı Abone');
    assert.equal((await testBuy(a, 'vip_365d'))[0], 400);
    assert.equal((await testBuy(a, 'coins_1000'))[0], 400);
    assert.equal((await testBuy(a, 'vip_7d', 'kısa'))[0], 400);
    assert.equal((await subscribe(a, { platform: 'web', productId: 'vip_7d', transactionId: rnd(8) }))[0], 400);
    assert.equal((await call('POST', '/api/vip/subscribe', { platform: 'test', productId: 'vip_7d', transactionId: rnd(8) }))[0], 401);
    assert.equal((await me(a)).vipSubUntil, null);
  });
});

describe('Google Play aboneliği', () => {
  test('ödenmiş abonelik açılır, bitişi Google’ın; onaylanır; aynı belirteç bir kez, başka hesapta 403 / 409', async () => {
    const a = await signUp('Play Abone');
    const b = await signUp('Play Başka');
    const token = googleSub(a);
    const r = await ok(googleBuy(a, 'vip_30d', token), 'play');
    assert.equal(r.replay, false);
    assert.equal(r.until, new Date(stores.subs.get(token).expiry).toISOString());
    assert.ok(stores.acknowledged.includes(token), 'onaylandı');
    const [row] = await q('SELECT platform, product_id, order_id, auto_renewing, test, state FROM vip_subscriptions WHERE store_ref = $1', [token]);
    assert.deepEqual(row, { platform: 'android', product_id: 'vip_30d', order_id: `GPA.${token.slice(0, 20)}`, auto_renewing: true, test: false, state: 'active' });
    const s = await status(a);
    assert.equal(s.autoRenewing, true);

    const again = await ok(googleBuy(a, 'vip_30d', token), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(again.until, r.until);
    assert.equal(stores.acknowledged.filter((t) => t === token).length, 1, 'onaylı olan yeniden onaylanmaz');
    assert.equal((await googleBuy(b, 'vip_30d', token))[0], 403, 'a’ya bağlı');
    // Not linked to an account (an older app): the first account to send it keeps it.
    const open = googleSub(a, 'vip_30d', { account: undefined });
    await ok(googleBuy(a, 'vip_30d', open));
    assert.equal((await googleBuy(b, 'vip_30d', open))[0], 409);
  });

  test('başka hesaba bağlı satın alma 403; hesap bağlanmamışsa kabul', async () => {
    const a = await signUp('Bağlı A');
    const b = await signUp('Bağlı B');
    const token = googleSub(a);
    const [st, j] = await googleBuy(b, 'vip_30d', token);
    assert.equal(st, 403);
    assert.match(j.error, /başka bir hesaba/);
    assert.ok(!stores.acknowledged.includes(token));
    const open = googleSub(a, 'vip_7d', { account: undefined });
    await ok(googleBuy(b, 'vip_7d', open), 'bağsız');
  });

  test('lisans testçisi bu sunucuda reddedilir, onaylanmaz; bekleyen, bitmiş, bilinmeyen ve başka ürünün belirteci', async () => {
    const a = await signUp('Play Hatalar');
    const tester = googleSub(a, 'vip_30d', { test: true });
    const [st, j] = await googleBuy(a, 'vip_30d', tester);
    assert.equal(st, 402);
    assert.match(j.error, /Test satın alması/);
    assert.ok(!stores.acknowledged.includes(tester), 'Google kendisi iade eder');
    const pending = googleSub(a, 'vip_30d', { state: 'SUBSCRIPTION_STATE_PENDING' });
    assert.match((await googleBuy(a, 'vip_30d', pending))[1].error, /Ödeme bekleniyor/);
    const expired = googleSub(a, 'vip_30d', { state: 'SUBSCRIPTION_STATE_EXPIRED', expiry: Date.now() - DAY });
    assert.equal((await googleBuy(a, 'vip_30d', expired))[0], 402);
    assert.equal((await googleBuy(a, 'vip_30d', `nope${rnd(12)}`))[0], 400);
    const weekly = googleSub(a, 'vip_7d');
    assert.match((await googleBuy(a, 'vip_30d', weekly))[1].error, /bu ürüne ait değil/);
    assert.equal((await googleBuy(a, 'vip_30d', 'kısa'))[0], 400);
    assert.equal((await q('SELECT count(*)::int AS n FROM vip_subscriptions WHERE user_id = $1', [a.user.id]))[0].n, 0);
    assert.equal((await me(a)).vipSubUntil, null);
  });

  test('yenilemeyi kapatmış (iptal, süresi bitmemiş) abonelik açılır, kendiliğinden yenilenmez', async () => {
    const a = await signUp('İptal Eden');
    const token = googleSub(a, 'vip_7d', { state: 'SUBSCRIPTION_STATE_CANCELED', autoRenew: false, expiry: Date.now() + 3 * DAY });
    const r = await ok(googleBuy(a, 'vip_7d', token));
    near(r.until, Date.now() + 3 * DAY);
    assert.equal((await status(a)).autoRenewing, false);
  });
});

describe('Yenileme, iade ve bitiş', () => {
  test('kendi durumunu okuyunca bitmek üzere olan belirteç yeniden okunur; en çok 5 dakikada bir', async () => {
    const a = await signUp('Yenilenen');
    const token = googleSub(a, 'vip_30d');
    await ok(googleBuy(a, 'vip_30d', token));
    // Google renewed it; here it ended a minute ago.
    const renewed = Date.now() + 60 * DAY;
    stores.subs.get(token).expiry = renewed;
    stores.subs.get(token).orderId = 'GPA.1234-5678..1';
    await makeDue(token);
    const reads = stores.subReads.get(token);
    const u = await me(a);
    assert.equal(u.vipSubUntil, new Date(renewed).toISOString(), 'yenileme okundu');
    const after = stores.subReads.get(token);
    assert.ok(after > reads);
    assert.equal((await q('SELECT order_id FROM vip_subscriptions WHERE store_ref = $1', [token]))[0].order_id, 'GPA.1234-5678..1');
    // Due again by its end, but read a moment ago: not read again.
    await q("UPDATE vip_subscriptions SET expires_at = now() + interval '10 minutes' WHERE store_ref = $1", [token]);
    await me(a);
    await status(a);
    assert.equal(stores.subReads.get(token), after);
  });

  test('zamanlayıcı bitmek üzere olanları kendisi okur: yenilenen uzar, biten kapanır', async () => {
    const a = await signUp('Zamanlayıcı Uzayan');
    const b = await signUp('Zamanlayıcı Biten');
    const longer = googleSub(a, 'vip_7d');
    const ending = googleSub(b, 'vip_7d');
    await ok(googleBuy(a, 'vip_7d', longer));
    await ok(googleBuy(b, 'vip_7d', ending));
    const renewed = Date.now() + 14 * DAY;
    stores.subs.get(longer).expiry = renewed;
    Object.assign(stores.subs.get(ending), { state: 'SUBSCRIPTION_STATE_EXPIRED', autoRenew: false, expiry: Date.now() - 60_000 });
    await makeDue(longer, "now() + interval '20 minutes'");
    await makeDue(ending, "now() + interval '20 minutes'");
    const until_ = async (id) => (await q('SELECT vip_sub_until FROM users WHERE id = $1', [id]))[0].vip_sub_until;
    assert.ok(await until(async () => (await until_(a.user.id))?.getTime() === renewed), 'yenilenen uzadı');
    assert.ok(await until(async () => (await until_(b.user.id)) < new Date()), 'biten kapandı');
    assert.equal((await me(b)).vipSubUntil, null);
    const [row] = await q('SELECT auto_renewing, state FROM vip_subscriptions WHERE store_ref = $1', [ending]);
    assert.deepEqual(row, { auto_renewing: false, state: 'active' });
    // Ended and no longer renewing: not read again.
    const reads = stores.subReads.get(ending);
    await q("UPDATE vip_subscriptions SET checked_at = now() - interval '1 hour' WHERE store_ref = $1", [ending]);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(stores.subReads.get(ending), reads);
  });

  test('ödemesi askıda (on hold) olan kapanır, ödeme düzelince yeniden açılır; Google’ın unuttuğu belirteç kapanır', async () => {
    const a = await signUp('Askıda');
    const token = googleSub(a, 'vip_30d');
    await ok(googleBuy(a, 'vip_30d', token));
    Object.assign(stores.subs.get(token), { state: 'SUBSCRIPTION_STATE_ON_HOLD', expiry: Date.now() - 3600_000 });
    await makeDue(token);
    assert.equal((await me(a)).vipSubUntil, null, 'askıdayken kapalı');
    Object.assign(stores.subs.get(token), { state: 'SUBSCRIPTION_STATE_ACTIVE', expiry: Date.now() + 30 * DAY });
    await makeDue(token, "now() - interval '1 hour'");
    assert.equal((await me(a)).vipSubUntil, new Date(stores.subs.get(token).expiry).toISOString(), 'ödeme düzeldi');

    const b = await signUp('Unutulan');
    const old = googleSub(b, 'vip_7d');
    await ok(googleBuy(b, 'vip_7d', old));
    stores.gone.add(old);
    await makeDue(old, "now() + interval '30 minutes'");
    assert.equal((await me(b)).vipSubUntil, null);
  });

  test('Google iadesi (voided) aboneliği hemen ve kalıcı olarak bitirir', async () => {
    const admin = await h.account('İade Yöneticisi', 'admin');
    const a = await signUp('İade Edilen');
    const token = googleSub(a, 'vip_90d', { expiry: Date.now() + 90 * DAY });
    await ok(googleBuy(a, 'vip_90d', token));
    stores.voided.push({ orderId: `GPA.${token.slice(0, 20)}`, purchaseToken: token, voidedTimeMillis: String(Date.now()), voidedReason: 1 });
    const r = await ok(call('POST', '/api/admin/purchases/voided-sync', null, admin.session), 'iade');
    assert.equal(r.subscriptionsEnded, 1);
    assert.equal(r.refunded, 0);
    assert.equal((await me(a)).vipSubUntil, null);
    assert.equal((await q('SELECT state FROM vip_subscriptions WHERE store_ref = $1', [token]))[0].state, 'revoked');
    // Read again (the next round, the app sending the token again): it stays ended.
    const again = await ok(call('POST', '/api/admin/purchases/voided-sync', null, admin.session));
    assert.equal(again.subscriptionsEnded, 0);
    const resend = await ok(googleBuy(a, 'vip_90d', token));
    assert.equal(resend.replay, true);
    assert.equal(resend.until, null);
    stores.voided.length = 0;
  });
});

describe('App Store aboneliği', () => {
  test('bitişi işlemin expiresDate’i; yenileme aynı aboneliği uzatır, eskisi geri götürmez; iade, bitmiş ve abonelik olmayan reddedilir', async () => {
    const a = await signUp('Apple Abone');
    const b = await signUp('Apple Başka');
    const end1 = Date.now() + 30 * DAY;
    stores.apple.prod.set('500000001', { productId: 'vip_30d', originalTransactionId: '500000001', expiresDate: end1 });
    const r = await ok(appleBuy(a, 'vip_30d', '500000001'));
    assert.equal(r.replay, false);
    assert.equal(r.until, new Date(end1).toISOString());
    const end2 = end1 + 30 * DAY;
    stores.apple.prod.set('500000002', { productId: 'vip_30d', originalTransactionId: '500000001', expiresDate: end2 });
    const renewed = await ok(appleBuy(a, 'vip_30d', '500000002'));
    assert.equal(renewed.replay, false);
    assert.equal(renewed.until, new Date(end2).toISOString());
    const old = await ok(appleBuy(a, 'vip_30d', '500000001'));
    assert.equal(old.replay, true);
    assert.equal(old.until, new Date(end2).toISOString(), 'eski işlem bitişi geri almaz');
    assert.equal((await q("SELECT count(*)::int AS n FROM vip_subscriptions WHERE platform = 'ios'"))[0].n, 1, 'tek abonelik satırı');
    assert.equal((await appleBuy(b, 'vip_30d', '500000002'))[0], 409, 'başka hesapta');

    stores.apple.prod.set('500000003', { productId: 'vip_7d', originalTransactionId: '500000003', expiresDate: Date.now() + DAY, revocationDate: Date.now() });
    assert.match((await appleBuy(b, 'vip_7d', '500000003'))[1].error, /iade/);
    stores.apple.prod.set('500000004', { productId: 'vip_7d', originalTransactionId: '500000004', expiresDate: Date.now() - DAY });
    assert.equal((await appleBuy(b, 'vip_7d', '500000004'))[0], 402);
    stores.apple.prod.set('500000005', { productId: 'vip_7d' });
    assert.equal((await appleBuy(b, 'vip_7d', '500000005'))[0], 400);
    stores.apple.sandbox.set('500000006', { productId: 'vip_7d', originalTransactionId: '500000006', expiresDate: Date.now() + DAY });
    assert.equal((await appleBuy(b, 'vip_7d', '500000006'))[0], 402, 'sandbox bu sunucuda kapalı');
    stores.apple.prod.set('500000007', { productId: 'vip_7d', originalTransactionId: '500000007', expiresDate: Date.now() + DAY, appAccountToken: a.user.id });
    assert.equal((await appleBuy(b, 'vip_7d', '500000007'))[0], 403);
    assert.equal((await me(b)).vipSubUntil, null);
  });
});

describe('Aboneliğin açtıkları', () => {
  const visit = (who, owner) => ok(call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, who.session), 'ziyaret');
  const visitors = (who) => ok(call('GET', '/api/me/visitors', null, who.session), 'ziyaretçiler');

  test('Profiline bakanlar yalnız abonelikle: VIP seviyesi ve Rütbe açmaz; abonelik bitince yine bulanık', async () => {
    const a = await signUp('Bakan Kişi');
    const b = await signUp('Bakılan Kişi');
    await visit(a, b);
    await q('UPDATE users SET svip_xp = 4000000 WHERE id = $1', [b.user.id]);
    await q(
      "INSERT INTO entitlements (user_id, sku, kind, tier, price, ends_at, source, ref) VALUES ($1, 'noble-5', 'noble', 5, 0, now() + interval '30 days', 'admin', $2)",
      [b.user.id, `admin:${rnd(6)}`],
    );
    assert.equal((await visitors(b)).visitors, null, 'VIP 4 ve Paşa: yine bulanık');
    await ok(testBuy(b, 'vip_7d'));
    assert.equal((await visitors(b)).visitors[0].id, a.user.id, 'abonelikle kim baktığı görünür');
    await q("UPDATE users SET vip_sub_until = now() - interval '1 second' WHERE id = $1", [b.user.id]);
    const after = await visitors(b);
    assert.equal(after.visitors, null, 'abonelik bitti');
    assert.equal(after.hidden.length, 1);
  });

  test('Seviyeleri gizle aboneliği de kabul eder; abonelik bitince seviye görünür', async () => {
    const a = await signUp('Gizleyen Abone');
    const viewer = await signUp('Seviyeye Bakan');
    assert.equal((await call('PATCH', '/api/me/extras', { hideWealth: true }, a.session))[0], 403, 'aboneliksiz ve VIP’siz gizlenmez');
    await ok(testBuy(a, 'vip_7d'));
    await ok(call('PATCH', '/api/me/extras', { hideWealth: true }, a.session), 'gizle');
    const profile = async () => (await ok(call('GET', `/api/user?id=${a.user.id}`, null, viewer.session))).user.levels;
    assert.equal((await profile()).wealth, null);
    await q("UPDATE users SET vip_sub_until = now() - interval '1 second' WHERE id = $1", [a.user.id]);
    assert.equal((await profile()).wealth, 0, 'abonelik bitti, seviye görünür');
  });

  test('verilerimin kopyasında abonelik var, mağaza belirteci yok', async () => {
    const a = await signUp('Kopya Abone');
    const token = googleSub(a, 'vip_7d');
    await ok(googleBuy(a, 'vip_7d', token));
    const copy = await ok(call('GET', '/api/me/export', null, a.session), 'kopya');
    assert.deepEqual(copy.wallet.vipSubscriptions.map((x) => [x.platform, x.productId, x.state, x.orderId]), [['android', 'vip_7d', 'active', `GPA.${token.slice(0, 20)}`]]);
    assert.ok(!JSON.stringify(copy).includes(token), 'belirteç kopyada yok');
  });
});
