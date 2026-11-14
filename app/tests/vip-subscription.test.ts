/// <reference types="node" />
// Abonelik in a live build (lib/live/vip-core): the catalog's plans, how the VIP screen sells (free on a test server,
// Google Play otherwise), the days left from the server's end, the words, and the Play flow against a stand-in store
// and server. The subscription only ever comes from the server's answer; Play's copy is finished only after it.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { VIP_PLANS } from '@/data/status';
import { createBilling, type StoreAdapter, type StoreError, type StorePurchase } from '@/lib/live/billing-core';
import {
  SALE_NOTICE,
  VIP_PRODUCT,
  baseOfferToken,
  createVipBilling,
  daysLeft,
  liveUntil,
  parseVipCatalog,
  testAlert,
  vipOutcomeAlert,
  vipProductOf,
  vipSale,
  type SubPurchase,
  type SubsStore,
  type VipCatalog,
  type VipOutcome,
  type VipVerified,
} from '@/lib/live/vip-core';

const DAY = 86_400_000;
const TOKEN = 'subtok_'.padEnd(40, 'x');
const ACCOUNT = 'a'.repeat(64);
const flush = () => new Promise((r) => setTimeout(r, 0));
const httpError = (status: number, message = `Sunucu hatası (${status})`) => Object.assign(new Error(message), { status });

describe('Abonelik planları ve satış yolu', () => {
  test('katalogdaki planlar uygulamanın planlarıyla aynı ürünler; bozuk satırlar atlanır', () => {
    const c = parseVipCatalog({
      vipPlans: [{ productId: 'vip_7d', days: 7 }, { productId: 'vip_30d', days: 30 }, { productId: 'vip_90d', days: 90 }, { productId: 'coins_1000', days: 1 }, { productId: 'vip_1d', days: 0 }, null],
      purchases: { testTopup: false, stores: { android: true, ios: false } },
    });
    assert.deepEqual(c.plans, VIP_PLANS.map((p) => ({ productId: vipProductOf(p.days), days: p.days })));
    assert.equal(c.testTopup, false);
    assert.equal(c.android, true);
    assert.deepEqual(parseVipCatalog(null), { plans: [], testTopup: false, android: null }, 'eski ya da bozuk cevap: plan yok');
    assert.ok(VIP_PRODUCT.test('vip_30d') && !VIP_PRODUCT.test('coins_1000') && !VIP_PRODUCT.test('vip_'));
  });

  test('test sunucusu ücretsiz test aboneliği satar; yoksa Google Play, ancak sunucu doğrulayabiliyorsa', () => {
    const plans = [{ productId: 'vip_7d', days: 7 }];
    const cat = (x: Partial<VipCatalog>): VipCatalog => ({ plans, testTopup: false, android: true, ...x });
    const prices = { vip_7d: '₺145,00' };
    assert.equal(vipSale({ android: true, catalog: null, storeReady: null, prices: null }).mode, 'loading');
    assert.equal(vipSale({ android: true, catalog: 'failed', storeReady: null, prices: null }).notice, SALE_NOTICE.offline);
    assert.equal(vipSale({ android: false, catalog: cat({ testTopup: true }), storeReady: null, prices: null }).mode, 'test', 'test APK’sı ve web: test platformu');
    assert.equal(vipSale({ android: true, catalog: cat({ testTopup: true, android: false }), storeReady: false, prices: null }).mode, 'test');
    assert.equal(vipSale({ android: true, catalog: cat({ plans: [] }), storeReady: true, prices }).notice, SALE_NOTICE['old-server']);
    assert.equal(vipSale({ android: false, catalog: cat({}), storeReady: null, prices: null }).notice, SALE_NOTICE['not-android']);
    assert.equal(vipSale({ android: true, catalog: cat({ android: false }), storeReady: null, prices: null }).notice, SALE_NOTICE['not-configured']);
    assert.equal(vipSale({ android: true, catalog: cat({}), storeReady: null, prices: null }).mode, 'loading');
    assert.equal(vipSale({ android: true, catalog: cat({}), storeReady: false, prices: null }).notice, SALE_NOTICE['no-store']);
    assert.equal(vipSale({ android: true, catalog: cat({}), storeReady: true, prices: {} }).notice, SALE_NOTICE['no-products']);
    assert.deepEqual(vipSale({ android: true, catalog: cat({}), storeReady: true, prices }), { mode: 'play', notice: null });
  });

  test('kalan gün sunucunun bitişinden: başlamış gün tam sayılır; geçmiş, bozuk ya da boş bitiş 0', () => {
    const now = Date.parse('2026-11-14T10:00:00Z');
    assert.equal(daysLeft(new Date(now + 7 * DAY).toISOString(), now), 7);
    assert.equal(daysLeft(new Date(now + 6 * DAY + 60_000).toISOString(), now), 7);
    assert.equal(daysLeft(new Date(now + 3600_000).toISOString(), now), 1);
    for (const x of [null, undefined, '', 'yarın', new Date(now - 1).toISOString()]) assert.equal(daysLeft(x, now), 0, String(x));
    assert.equal(liveUntil(42, now), null);
    assert.equal(liveUntil(new Date(now + DAY).toISOString(), now), new Date(now + DAY).toISOString());
  });

  test('sözler: başladı, zaten var, bekliyor, saklandı, test aboneliği; vazgeçmek sessiz', () => {
    const until = '2026-12-14T10:00:00.000Z';
    const day = new Date(until).toLocaleDateString('tr-TR');
    assert.deepEqual(vipOutcomeAlert({ kind: 'done', until, days: 30, replay: false }), { title: 'VIP aktif 🎉', body: `Aboneliğin başladı. Bitiş: ${day}.` });
    assert.equal(vipOutcomeAlert({ kind: 'done', until, days: 30, replay: true })?.title, 'VIP aktif');
    assert.equal(vipOutcomeAlert({ kind: 'done', until: null, days: 30, replay: true })?.title, 'Abonelik bitmiş');
    assert.equal(vipOutcomeAlert({ kind: 'pending' })?.title, 'Ödeme onay bekliyor');
    assert.equal(vipOutcomeAlert({ kind: 'saved' })?.title, 'Ödemen alındı');
    assert.equal(vipOutcomeAlert({ kind: 'owned' })?.title, 'Aboneliğin zaten var');
    assert.equal(vipOutcomeAlert({ kind: 'failed', message: 'Bu satın alma başka bir hesaba ait' })?.body, 'Bu satın alma başka bir hesaba ait');
    assert.equal(vipOutcomeAlert({ kind: 'cancelled' }), null);
    assert.equal(vipOutcomeAlert({ kind: 'busy' }), null);
    assert.deepEqual(testAlert({ replay: false, until, days: 7 }), { title: 'VIP aktif 🎉', body: `7 gün eklendi (test sürümü, ödeme alınmadı). Bitiş: ${day}.` });
    assert.match(testAlert({ replay: true, until, days: 7 }).body, /daha önce eklenmişti/);
  });

  test('Play’de taban planın teklif belirteci seçilir', () => {
    assert.equal(baseOfferToken([{ id: 'deneme', basePlanIdAndroid: 'aylik', offerTokenAndroid: 'promo' }, { id: 'aylik', basePlanIdAndroid: 'aylik', offerTokenAndroid: 'taban' }]), 'taban');
    assert.equal(baseOfferToken([{ id: null, basePlanIdAndroid: 'aylik', offerTokenAndroid: 'taban' }]), 'taban');
    assert.equal(baseOfferToken([{ id: 'deneme', basePlanIdAndroid: 'aylik', offerTokenAndroid: 'promo' }]), 'promo', 'tek teklif varsa o');
    assert.equal(baseOfferToken([{ id: 'x', offerTokenAndroid: '' }]), null);
    assert.equal(baseOfferToken([]), null);
  });
});

// --- The Play flow ----------------------------------------------------------------------------------------
type User = { id: string; vipSubUntil: string | null };

function rig(opts: { owned?: SubPurchase[] } = {}) {
  const log: string[] = [];
  const s = {
    owned: [...(opts.owned ?? [])],
    applied: [] as (string | null)[],
    late: [] as VipOutcome[],
    bought: [] as [string, string][],
    onBuy: null as null | ((productId: string) => void),
    verify: null as null | ((productId: string, token: string) => Promise<VipVerified<User>>),
    emitPurchase: (_p: SubPurchase) => {},
    emitError: (_e: StoreError) => {},
  };
  const counted = new Set<string>();
  const store: SubsStore = {
    connect: async () => true,
    products: async (ids) => ids.map((id) => ({ id, price: '₺285,00' })),
    async buy(productId, accountId) {
      s.bought.push([productId, accountId]);
      log.push(`buy:${productId}`);
      s.onBuy?.(productId);
    },
    owned: async () => s.owned,
    async finish(p) {
      log.push(`finish:${p.token}`);
      s.owned = s.owned.map((x) => (x.token === p.token ? { ...x, acknowledged: true } : x));
    },
    listen(onPurchase, onError) {
      s.emitPurchase = onPurchase;
      s.emitError = onError;
      return () => {};
    },
  };
  const until = new Date(Date.now() + 30 * DAY).toISOString();
  const billing = createVipBilling<User>({
    store,
    async verify(productId, token) {
      log.push(`verify:${token}`);
      if (s.verify) return s.verify(productId, token);
      const replay = counted.has(token);
      counted.add(token);
      return { user: { id: 'u1', vipSubUntil: until }, replay, until, days: 30 };
    },
    apply: (r) => {
      log.push('apply');
      s.applied.push(r.until);
    },
    accountId: async () => ACCOUNT,
    onLate: (o) => s.late.push(o),
    waitMs: 200,
  });
  const purchase = (token = TOKEN, state: SubPurchase['state'] = 'purchased', productId = 'vip_30d'): SubPurchase => ({ productId, token, state, raw: { token } });
  return { s, log, billing, purchase, until, counted };
}

describe('Play aboneliği akışı', () => {
  test('ödeme → sunucu doğrular → bitiş sunucudan → sonra Play’de onaylanır (tüketilmez)', async () => {
    const { s, log, billing, purchase, until } = rig();
    assert.equal(await billing.start(), true);
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 0);
    assert.deepEqual(await billing.buy('vip_30d'), { kind: 'done', until, days: 30, replay: false });
    assert.deepEqual(s.bought, [['vip_30d', ACCOUNT]], 'hesap kimliği Play’e gider');
    assert.deepEqual(log, ['buy:vip_30d', `verify:${TOKEN}`, 'apply', `finish:${TOKEN}`]);
    assert.deepEqual(s.applied, [until]);
  });

  test('jeton paketi aynı dinleyiciden gelse de aboneliğe karışmaz', async () => {
    const { s, log, billing, purchase } = rig();
    await billing.start();
    s.emitPurchase(purchase('coin_'.padEnd(40, 'c'), 'purchased', 'coins_1000'));
    await flush();
    assert.deepEqual(log, []);
    assert.deepEqual(s.late, []);
  });

  test('vazgeçmek sessiz; bekleyen ödeme sakin not; ağ yoksa saklandı, sonraki açılışta onaylanmamış olan yeniden gider', async () => {
    const a = rig();
    await a.billing.start();
    a.s.onBuy = () => setTimeout(() => a.s.emitError({ code: 'E_USER_CANCELLED', productId: 'vip_30d' }), 0);
    assert.deepEqual(await a.billing.buy('vip_30d'), { kind: 'cancelled' });
    a.s.onBuy = () => setTimeout(() => a.s.emitPurchase(a.purchase(TOKEN, 'pending')), 0);
    assert.deepEqual(await a.billing.buy('vip_30d'), { kind: 'pending' });
    assert.ok(!a.log.some((l) => l.startsWith('verify')), 'bekleyen ödeme sunucuya gitmez');

    const first = rig();
    await first.billing.start();
    first.s.verify = async () => {
      throw httpError(0, 'Sunucuya ulaşılamadı.');
    };
    first.s.onBuy = () =>
      setTimeout(() => {
        first.s.owned = [first.purchase()];
        first.s.emitPurchase(first.purchase());
      }, 0);
    assert.deepEqual(await first.billing.buy('vip_30d'), { kind: 'saved' });
    assert.deepEqual(first.s.applied, []);
    assert.ok(!first.log.some((l) => l.startsWith('finish')), 'Play’de onaylanmaz');

    // Next start: Play still holds it unacknowledged; an acknowledged one (already counted) isn't sent again.
    const next = rig({ owned: [...first.s.owned, { ...first.purchase('done_'.padEnd(40, 'd')), acknowledged: true }] });
    await next.billing.start();
    await flush();
    await flush();
    assert.deepEqual(next.log, [`verify:${TOKEN}`, 'apply', `finish:${TOKEN}`]);
    assert.equal(next.s.late.length, 1);
  });

  test('sunucu kesin reddederse (başka hesabın ödemesi) abonelik yok, onaylanmaz; 402 bekliyor sayılır', async () => {
    const { s, log, billing, purchase } = rig();
    await billing.start();
    s.verify = async () => {
      throw httpError(403, 'Bu satın alma başka bir hesaba ait');
    };
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 0);
    assert.deepEqual(await billing.buy('vip_30d'), { kind: 'failed', message: 'Bu satın alma başka bir hesaba ait' });
    assert.ok(!log.some((l) => l.startsWith('finish')));
    s.verify = async () => {
      throw httpError(402, 'Ödeme bekleniyor');
    };
    assert.deepEqual(await billing.buy('vip_30d'), { kind: 'pending' });
  });

  test('Play "zaten sahipsin" derse: sunucu biliyorsa "zaten var", bilmiyorsa şimdi başlar', async () => {
    const known = rig();
    known.counted.add(TOKEN);
    await known.billing.start();
    known.s.owned = [{ ...known.purchase(), acknowledged: true }];
    known.s.onBuy = () => setTimeout(() => known.s.emitError({ code: 'already-owned', productId: 'vip_30d' }), 0);
    assert.deepEqual(await known.billing.buy('vip_30d'), { kind: 'owned' });

    const lost = rig();
    await lost.billing.start();
    lost.s.owned = [lost.purchase()];
    lost.s.onBuy = () => setTimeout(() => lost.s.emitError({ code: 'already-owned', productId: 'vip_30d' }), 0);
    assert.equal((await lost.billing.buy('vip_30d')).kind, 'done');
  });

  test('bir anda tek satın alma', async () => {
    const { billing } = rig();
    await billing.start();
    const first = billing.buy('vip_30d');
    assert.deepEqual(await billing.buy('vip_7d'), { kind: 'busy' });
    assert.deepEqual(await first, { kind: 'pending' }, 'Play cevap vermezse ekran beklemeyi bırakır');
  });
});

describe('Jeton akışı abonelikleri görmez', () => {
  test('aynı Play dinleyicisinden gelen abonelik jeton cüzdanına "başarısız" diye düşmez', async () => {
    let emit: (p: StorePurchase) => void = () => {};
    const late: unknown[] = [];
    const store: StoreAdapter = {
      connect: async () => true,
      products: async () => [],
      buy: async () => {},
      owned: async () => [],
      finish: async () => {},
      listen(onPurchase) {
        emit = onPurchase;
        return () => {};
      },
    };
    const coins = createBilling({
      store,
      verify: async () => {
        throw new Error('çağrılmamalı');
      },
      apply: () => {},
      accountId: async () => ACCOUNT,
      load: async () => [],
      save: async () => {},
      onLate: (o) => late.push(o),
    });
    await coins.start();
    emit({ productId: 'vip_30d', token: TOKEN, state: 'purchased' });
    await flush();
    assert.deepEqual(late, []);
  });
});
