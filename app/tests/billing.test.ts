/// <reference types="node" />
// Google Play coin purchases (lib/live/billing-core): the catalog and packs the wallet shows, the store's error
// codes, and the purchase flow against a stand-in store and server. The coins only ever come from the server's
// answer; a paid purchase is never dropped on a network error; Play's purchase is finished only after it.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  COIN_PRODUCT,
  KEEP_MS,
  SHOP_NOTICE,
  createBilling,
  keepForRetry,
  outcomeAlert,
  parseCatalog,
  parseSaved,
  purchaseReason,
  shopPacks,
  shopStatus,
  storeCode,
  storeErrorKind,
  type Outcome,
  type SavedToken,
  type StoreAdapter,
  type StoreError,
  type StorePurchase,
  type Verified,
} from '@/lib/live/billing-core';

const TOKEN = 'tok_'.padEnd(40, 'x');
const TOKEN2 = 'tok2_'.padEnd(40, 'y');
const ACCOUNT = 'a'.repeat(64);
const flush = () => new Promise((r) => setTimeout(r, 0));
const httpError = (status: number, message = `Sunucu hatası (${status})`) => Object.assign(new Error(message), { status });

describe('Jeton paketleri: katalog ve mağaza fiyatı', () => {
  test('yeni sunucu: test paketi ve Play doğrulaması ne diyorsa o', () => {
    const c = parseCatalog({
      packs: [
        { id: 'p1', productId: 'coins_1000', coins: 1000, firstBonus: 1000 },
        { id: 'p2', productId: 'coins_5000', coins: 5000 },
        { productId: 'kötü', coins: 5 },
        null,
      ],
      purchases: { testTopup: false, stores: { android: true, ios: false } },
    });
    assert.deepEqual(c, {
      packs: [
        { productId: 'coins_1000', coins: 1000, firstBonus: 1000 },
        { productId: 'coins_5000', coins: 5000, firstBonus: 0 },
      ],
      testTopup: false,
      android: true,
    });
  });

  test('eski sunucu (purchases yok): test paketleri eskisi gibi açık, Play bilinmiyor; bozuk cevap boş', () => {
    assert.deepEqual(parseCatalog({ packs: [] }), { packs: [], testTopup: true, android: null });
    for (const raw of [null, 'x', 42, []]) assert.deepEqual(parseCatalog(raw), { packs: [], testTopup: true, android: null });
    assert.equal(parseCatalog({ purchases: { testTopup: 'evet' } }).testTopup, false, 'yalnızca açıkça true');
  });

  test('yalnızca Play’de olan paketler, katalog sırasıyla ve Play’in fiyatıyla', () => {
    const cat = [
      { productId: 'coins_1000', coins: 1000, firstBonus: 1000 },
      { productId: 'coins_5000', coins: 5000, firstBonus: 2500 },
      { productId: 'coins_10000', coins: 10000, firstBonus: 0 },
    ];
    const packs = shopPacks(cat, [
      { id: 'coins_10000', price: '₺269,99' },
      { id: 'coins_1000', price: '₺29,99' },
      { id: 'coins_5000', price: '' },
      { id: 'baska_urun', price: '₺1' },
    ]);
    assert.deepEqual(
      packs.map((p) => [p.productId, p.price]),
      [
        ['coins_1000', '₺29,99'],
        ['coins_10000', '₺269,99'],
      ],
    );
  });

  test('ürün kimlikleri sunucunun coins_<adet> biçiminde', () => {
    assert.ok(COIN_PRODUCT.test('coins_1000000'));
    for (const bad of ['coins_', 'coin_1000', 'coins_10a', 'COINS_1000']) assert.ok(!COIN_PRODUCT.test(bad), bad);
  });

  test('cüzdanın durumu: her eksik için sakin bir satır', () => {
    const cat = { packs: [], testTopup: false, android: true };
    const one = [{ productId: 'coins_1000', coins: 1000, firstBonus: 0, price: '₺29,99' }];
    assert.equal(shopStatus({ android: false, catalog: cat, storeReady: null, packs: null }), 'not-android');
    assert.equal(shopStatus({ android: true, catalog: null, storeReady: null, packs: null }), 'loading');
    assert.equal(shopStatus({ android: true, catalog: 'failed', storeReady: null, packs: null }), 'offline');
    assert.equal(shopStatus({ android: true, catalog: { ...cat, android: false }, storeReady: true, packs: one }), 'not-configured');
    assert.equal(shopStatus({ android: true, catalog: { ...cat, android: null }, storeReady: true, packs: one }), 'ready', 'eski sunucu: Play paketleri varsa gösterilir');
    assert.equal(shopStatus({ android: true, catalog: cat, storeReady: false, packs: null }), 'no-store');
    assert.equal(shopStatus({ android: true, catalog: cat, storeReady: true, packs: null }), 'loading');
    assert.equal(shopStatus({ android: true, catalog: cat, storeReady: true, packs: [] }), 'no-products');
    assert.equal(shopStatus({ android: true, catalog: cat, storeReady: true, packs: one }), 'ready');
    for (const line of Object.values(SHOP_NOTICE)) {
      assert.ok(line.length > 10 && line.length < 140, line);
      assert.doesNotMatch(line, /error|hata kodu|undefined|null|\{/i, line);
    }
  });
});

describe('Mağaza hata kodları', () => {
  test('her yazılışı aynı koda iner', () => {
    for (const c of ['E_USER_CANCELLED', 'E_USER_CANCELED', 'UserCancelled', 'user-cancelled']) assert.equal(storeCode(c), 'user-cancelled', c);
    assert.equal(storeCode('E_ALREADY_OWNED'), 'already-owned');
    assert.equal(storeCode(undefined), '');
  });

  test('vazgeçme, bekleyen ödeme, zaten sahip olunan, Play yok, ağ', () => {
    assert.equal(storeErrorKind('E_USER_CANCELLED'), 'cancelled');
    assert.equal(storeErrorKind('pending'), 'pending');
    assert.equal(storeErrorKind('deferred-payment'), 'pending');
    assert.equal(storeErrorKind('already-owned'), 'owned');
    assert.equal(storeErrorKind('billing-unavailable'), 'unavailable');
    assert.equal(storeErrorKind('E_IAP_NOT_AVAILABLE'), 'unavailable');
    assert.equal(storeErrorKind('sku-not-found'), 'missing');
    assert.equal(storeErrorKind('item-unavailable'), 'missing');
    assert.equal(storeErrorKind('network-error'), 'network');
    assert.equal(storeErrorKind('developer-error'), 'failed');
    assert.equal(storeErrorKind('başka bir şey'), 'failed');
  });

  test('ödemeden sonra sunucu cevabı: belirsizse belirteç saklanır, kesin retse bırakılır', () => {
    for (const s of [0, 401, 408, 429, 500, 502, 503, 504]) assert.equal(keepForRetry(httpError(s)), true, String(s));
    for (const s of [400, 403, 404, 409]) assert.equal(keepForRetry(httpError(s)), false, String(s));
    assert.equal(keepForRetry(new TypeError('JSON')), true, 'anlaşılmayan hata: kaybetme');
  });
});

describe('Saklanan belirteçler', () => {
  test('bozuk ve bir haftadan eski olanlar atılır', () => {
    const now = 10 * KEEP_MS;
    const raw = JSON.stringify([
      { productId: 'coins_1000', token: TOKEN, at: now - 1000 },
      { productId: 'coins_1000', token: TOKEN2, at: now - KEEP_MS - 1 },
      { productId: 'coins_1000', token: 'kısa', at: now },
      { productId: 'baska', token: TOKEN, at: now },
      { token: TOKEN, at: now },
      7,
    ]);
    assert.deepEqual(parseSaved(raw, now), [{ productId: 'coins_1000', token: TOKEN, at: now - 1000 }]);
    for (const bad of [null, '', '{', '{"a":1}', '42']) assert.deepEqual(parseSaved(bad, now), [], String(bad));
  });
});

describe('Satın alma sonrası sözler', () => {
  test('yüklendi, ilk alım hediyesi, daha önce eklenmiş, bekleyen, saklanan', () => {
    assert.deepEqual(outcomeAlert({ kind: 'done', coins: 5000, bonus: 2500, replay: false }), {
      title: 'Jetonlar yüklendi',
      body: '5.000 jeton hesabına eklendi. İlk alım hediyesi olarak +2.500 jeton da eklendi.',
    });
    assert.equal(outcomeAlert({ kind: 'done', coins: 1000, bonus: 0, replay: false })?.body, '1.000 jeton hesabına eklendi.');
    assert.equal(outcomeAlert({ kind: 'done', coins: 1000, bonus: 0, replay: true })?.title, 'Jetonlar hesabında');
    assert.equal(outcomeAlert({ kind: 'pending' })?.title, 'Ödeme onay bekliyor');
    assert.equal(outcomeAlert({ kind: 'saved' })?.title, 'Ödemen alındı');
    assert.equal(outcomeAlert({ kind: 'failed', message: 'Bu satın alma başka bir hesaba ait' })?.body, 'Bu satın alma başka bir hesaba ait');
    assert.equal(outcomeAlert({ kind: 'cancelled' }), null, 'vazgeçmek sessiz');
    assert.equal(outcomeAlert({ kind: 'busy' }), null);
    assert.equal(purchaseReason(0), 'Jeton satın alma');
    assert.equal(purchaseReason(1000), 'Jeton satın alma (+1.000 ilk alım hediyesi)', 'sunucunun hareket satırıyla aynı');
  });

  test('kampanya hediyesi yalnızca kampanya jetonu varsa söylenir; ilk alım sözü aynı kalır', () => {
    assert.equal(
      outcomeAlert({ kind: 'done', coins: 100_000, bonus: 0, replay: false, campaignBonus: 20_000 })?.body,
      '100.000 jeton hesabına eklendi. Kampanya hediyesi olarak +20.000 jeton da eklendi.',
    );
    assert.equal(
      outcomeAlert({ kind: 'done', coins: 5000, bonus: 2500, replay: false, campaignBonus: 750 })?.body,
      '5.000 jeton hesabına eklendi. İlk alım hediyesi olarak +2.500 jeton da eklendi. Kampanya hediyesi olarak +750 jeton da eklendi.',
    );
    for (const campaignBonus of [0, undefined, -5, 1.5, NaN]) {
      assert.equal(outcomeAlert({ kind: 'done', coins: 5000, bonus: 2500, replay: false, campaignBonus })?.body, '5.000 jeton hesabına eklendi. İlk alım hediyesi olarak +2.500 jeton da eklendi.', String(campaignBonus));
    }
    assert.equal(outcomeAlert({ kind: 'done', coins: 1000, bonus: 0, replay: true, campaignBonus: 200 })?.body, 'Bu ödeme daha önce hesabına eklenmişti; bakiyen güncel.', 'tekrar: yeni jeton yok');
    assert.equal(purchaseReason(0, 20_000), 'Jeton satın alma (+20.000 kampanya)');
    assert.equal(purchaseReason(1000, 200), 'Jeton satın alma (+1.000 ilk alım hediyesi, +200 kampanya)', 'sunucunun hareket satırıyla aynı');
    assert.equal(purchaseReason(1000, 0), 'Jeton satın alma (+1.000 ilk alım hediyesi)');
    assert.equal(purchaseReason(0, 0), 'Jeton satın alma');
    assert.equal(purchaseReason(0, -3), 'Jeton satın alma');
  });
});

// --- The flow ---------------------------------------------------------------------------------------------
type User = { id: string; coins: number };

/** A stand-in for Google Play and the server, recording the order of what happened. */
function rig(opts: { saved?: SavedToken[]; owned?: StorePurchase[] } = {}) {
  const log: string[] = [];
  const s = {
    saved: [...(opts.saved ?? [])],
    owned: [...(opts.owned ?? [])],
    connectOk: true,
    applied: [] as { coins: number; reason: string }[],
    late: [] as Outcome[],
    bought: [] as [string, string][],
    onBuy: null as null | ((productId: string) => void),
    verify: null as null | ((productId: string, token: string) => Promise<Verified<User>>),
    account: ACCOUNT as string | null,
    emitPurchase: (_p: StorePurchase) => {},
    emitError: (_e: StoreError) => {},
  };
  let balance = 0;
  const credited = new Set<string>();
  const store: StoreAdapter = {
    connect: async () => s.connectOk,
    products: async (ids) => ids.map((id) => ({ id, price: '₺29,99' })),
    async buy(productId, accountId) {
      s.bought.push([productId, accountId]);
      log.push(`buy:${productId}`);
      s.onBuy?.(productId);
    },
    owned: async () => s.owned,
    async finish(p) {
      log.push(`finish:${p.token}`);
      s.owned = s.owned.filter((x) => x.token !== p.token);
    },
    listen(onPurchase, onError) {
      s.emitPurchase = onPurchase;
      s.emitError = onError;
      return () => {};
    },
  };
  // The server: credits a token once (1.000 coins), answers replay after that.
  const server = async (productId: string, token: string): Promise<Verified<User>> => {
    log.push(`verify:${token}`);
    if (s.verify) return s.verify(productId, token);
    const replay = credited.has(token);
    if (!replay) {
      credited.add(token);
      balance += 1000;
    }
    return { user: { id: 'u1', coins: balance }, replay, coins: 1000, bonus: 0 };
  };
  const billing = createBilling<User>({
    store,
    verify: (productId, token) => server(productId, token),
    apply: (r, reason) => {
      log.push(`apply:${r.user.coins}`);
      s.applied.push({ coins: r.user.coins, reason });
    },
    accountId: async () => s.account,
    load: async () => s.saved,
    save: async (list) => void (s.saved = list),
    onLate: (o) => s.late.push(o),
    waitMs: 200,
  });
  const purchase = (token = TOKEN, state: StorePurchase['state'] = 'purchased'): StorePurchase => ({ productId: 'coins_1000', token, state, raw: { token } });
  return { s, log, billing, purchase, credited };
}

describe('Satın alma akışı', () => {
  test('ödeme → sunucu doğrular → bakiye sunucudan → sonra Play’de tüketilir', async () => {
    const { s, log, billing, purchase } = rig();
    assert.equal(await billing.start(), true);
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 0);
    const o = await billing.buy('coins_1000');
    assert.deepEqual(o, { kind: 'done', coins: 1000, bonus: 0, replay: false });
    assert.deepEqual(s.bought, [['coins_1000', ACCOUNT]], 'hesap kimliği Play’e gider');
    assert.deepEqual(log, ['buy:coins_1000', `verify:${TOKEN}`, 'apply:1000', `finish:${TOKEN}`], 'jeton sunucunun cevabından önce yazılmaz');
    assert.deepEqual(s.applied, [{ coins: 1000, reason: 'Jeton satın alma' }]);
    assert.deepEqual(s.saved, [], 'cevap gelince belirteç silinir');
  });

  test('kampanyalı alım: kampanya jetonu sonuçta ve hareket satırında; bozuk değer yok sayılır', async () => {
    const { s, billing, purchase } = rig();
    await billing.start();
    s.verify = async () => ({ user: { id: 'u1', coins: 1200 }, replay: false, coins: 1000, bonus: 0, campaignBonus: 200 });
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 0);
    assert.deepEqual(await billing.buy('coins_1000'), { kind: 'done', coins: 1000, bonus: 0, replay: false, campaignBonus: 200 });
    assert.deepEqual(s.applied, [{ coins: 1200, reason: 'Jeton satın alma (+200 kampanya)' }]);

    // An older server (no campaignBonus) or a malformed one: no campaign words, the same outcome as before.
    for (const campaignBonus of [undefined, '200', -1, 2.5]) {
      const r = rig();
      await r.billing.start();
      r.s.verify = async () => ({ user: { id: 'u1', coins: 1000 }, replay: false, coins: 1000, bonus: 0, campaignBonus: campaignBonus as number });
      r.s.onBuy = () => setTimeout(() => r.s.emitPurchase(r.purchase()), 0);
      assert.deepEqual(await r.billing.buy('coins_1000'), { kind: 'done', coins: 1000, bonus: 0, replay: false }, String(campaignBonus));
      assert.deepEqual(r.s.applied, [{ coins: 1000, reason: 'Jeton satın alma' }]);
    }
  });

  test('vazgeçmek sessiz: doğrulama yok, bakiye yok', async () => {
    const { s, log, billing } = rig();
    await billing.start();
    s.onBuy = () => setTimeout(() => s.emitError({ code: 'E_USER_CANCELLED', productId: 'coins_1000' }), 0);
    const o = await billing.buy('coins_1000');
    assert.deepEqual(o, { kind: 'cancelled' });
    assert.equal(outcomeAlert(o), null);
    assert.deepEqual(log, ['buy:coins_1000']);
  });

  test('Play isteği reddederse de (buy hata atar) sonuç aynı yerden gelir', async () => {
    const { billing, s } = rig();
    await billing.start();
    s.onBuy = () => {
      throw Object.assign(new Error('x'), { code: 'user-cancelled' });
    };
    assert.deepEqual(await billing.buy('coins_1000'), { kind: 'cancelled' });
  });

  test('bekleyen ödeme: sakin not; tamamlanınca jetonlar kendiliğinden yüklenir', async () => {
    const { s, log, billing, purchase } = rig();
    await billing.start();
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase(TOKEN, 'pending')), 0);
    assert.deepEqual(await billing.buy('coins_1000'), { kind: 'pending' });
    assert.ok(!log.some((l) => l.startsWith('verify')), 'bekleyen ödeme sunucuya gitmez');
    // Later the bank approves it: Play sends the purchase again.
    s.emitPurchase(purchase(TOKEN, 'purchased'));
    await flush();
    await flush();
    assert.deepEqual(s.late, [{ kind: 'done', coins: 1000, bonus: 0, replay: false }]);
    assert.deepEqual(s.applied.map((a) => a.coins), [1000]);
  });

  test('ödemeden sonra ağ yok: belirteç saklanır, bitirilmez; sonraki açılışta doğrulanıp yüklenir', async () => {
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
    const o = await first.billing.buy('coins_1000');
    assert.deepEqual(o, { kind: 'saved' });
    assert.equal(outcomeAlert(o)?.title, 'Ödemen alındı');
    assert.deepEqual(first.s.applied, [], 'sunucu cevap vermeden jeton yok');
    assert.ok(!first.log.some((l) => l.startsWith('finish')), 'Play’de tüketilmez');
    assert.deepEqual(
      first.s.saved.map((x) => x.token),
      [TOKEN],
    );

    // The next app start: Play still holds the purchase, the phone still has the token.
    const next = rig({ saved: first.s.saved, owned: first.s.owned });
    await next.billing.start();
    await flush();
    await flush();
    assert.deepEqual(next.log, [`verify:${TOKEN}`, 'apply:1000', `finish:${TOKEN}`], 'bir kez doğrulanır');
    assert.deepEqual(next.s.late, [{ kind: 'done', coins: 1000, bonus: 0, replay: false }]);
    assert.deepEqual(next.s.saved, []);
  });

  test('yalnızca telefonda saklanan belirteç (Play’de yok): yine sunucuya sorulur', async () => {
    const { log, billing, s } = rig({ saved: [{ productId: 'coins_1000', token: TOKEN, at: Date.now() }] });
    await billing.start();
    await flush();
    await flush();
    assert.deepEqual(log, [`verify:${TOKEN}`, 'apply:1000']);
    assert.deepEqual(s.saved, []);
  });

  test('zaten sahip olunan paket: Play’deki eski satın alma yeniden doğrulanır ve tüketilir', async () => {
    const { s, log, billing, purchase, credited } = rig();
    credited.add(TOKEN); // the server credited it earlier; its answer and the consume were lost
    await billing.start();
    s.owned = [purchase()];
    s.onBuy = () => setTimeout(() => s.emitError({ code: 'already-owned', productId: 'coins_1000' }), 0);
    const o = await billing.buy('coins_1000');
    assert.deepEqual(o, { kind: 'done', coins: 1000, bonus: 0, replay: true });
    assert.equal(outcomeAlert(o)?.title, 'Jetonlar hesabında');
    assert.deepEqual(log.slice(1), [`verify:${TOKEN}`, 'apply:0', `finish:${TOKEN}`]);
    assert.deepEqual(s.owned, []);
  });

  test('sunucu kesin reddederse (başka hesabın ödemesi): jeton yok, tüketilmez, belirteç bırakılır', async () => {
    const { s, log, billing, purchase } = rig();
    await billing.start();
    s.verify = async () => {
      throw httpError(403, 'Bu satın alma başka bir hesaba ait');
    };
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 0);
    const o = await billing.buy('coins_1000');
    assert.deepEqual(o, { kind: 'failed', message: 'Bu satın alma başka bir hesaba ait' });
    assert.deepEqual(s.applied, []);
    assert.ok(!log.some((l) => l.startsWith('finish')));
    assert.deepEqual(s.saved, []);
  });

  test('sunucu "ödeme bekleniyor" (402) derse belirteç saklanır', async () => {
    const { s, billing, purchase } = rig();
    await billing.start();
    s.verify = async () => {
      throw httpError(402, 'Ödeme bekleniyor; tamamlanınca jetonlar yüklenir');
    };
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 0);
    assert.deepEqual(await billing.buy('coins_1000'), { kind: 'pending' });
    assert.deepEqual(
      s.saved.map((x) => x.token),
      [TOKEN],
    );
  });

  test('aynı belirteç iki yoldan gelse de sunucuya bir kez gider', async () => {
    const { s, log, billing, purchase } = rig();
    await billing.start();
    s.onBuy = () =>
      setTimeout(() => {
        s.owned = [purchase()];
        s.emitPurchase(purchase());
        void billing.reconcile();
      }, 0);
    await billing.buy('coins_1000');
    await flush();
    assert.equal(log.filter((l) => l === `verify:${TOKEN}`).length, 1);
    assert.deepEqual(s.late, [], 'ekrandaki satın alma bir kez söylenir');
  });

  test('bir anda tek satın alma; oturum yoksa Play açılmaz; Play yoksa satın alma yok', async () => {
    const { s, billing, purchase } = rig();
    await billing.start();
    s.onBuy = () => setTimeout(() => s.emitPurchase(purchase()), 20);
    const first = billing.buy('coins_1000');
    assert.deepEqual(await billing.buy('coins_5000'), { kind: 'busy' });
    assert.equal((await first).kind, 'done');

    s.account = null;
    const o = await billing.buy('coins_1000');
    assert.equal(o.kind, 'failed');
    assert.equal(s.bought.length, 1, 'hesap kimliği yokken Play açılmaz');

    const off = rig();
    off.s.connectOk = false;
    assert.equal(await off.billing.start(), false);
    assert.deepEqual(await off.billing.buy('coins_1000'), { kind: 'unavailable' });
    assert.deepEqual(await off.billing.products(['coins_1000']), []);
  });

  test('Play sonucu gecikirse ekran bekleyen notuyla kapanır; sonuç gelince yine yüklenir', async () => {
    const { s, billing, purchase } = rig();
    await billing.start();
    const o = await billing.buy('coins_1000'); // nothing comes back within waitMs (200 ms)
    assert.deepEqual(o, { kind: 'pending' });
    s.emitPurchase(purchase());
    await flush();
    await flush();
    assert.deepEqual(s.late, [{ kind: 'done', coins: 1000, bonus: 0, replay: false }]);
  });
});
