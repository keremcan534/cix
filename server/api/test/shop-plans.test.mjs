// Çarşı'da süre paketleri (Güncelleme 8, madde 6; shop-items.mjs plansOf, 110): an item's other durations (7, 15, 30
// gün …), each with its own price, set in Yönetim › Mağaza. The catalog sends them to a new app; a buy names the days
// it showed and pays that package's price; an older app (no days) buys the main term as before.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi();
const { call } = h;
const rnd = () => Math.random().toString(36).slice(2, 10);
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
let admin;
const staff = async () => (admin ??= await h.account(`Mağaza ${rnd().slice(0, 4)}`, 'admin'));
const update = async (body) => call('POST', '/api/admin/shop/update', body, (await staff()).session);
const SKU = 'fr-neon';

describe('Çarşı süre paketleri', () => {
  test('panelden paket: kurallar; katalogda yalnız yeni uygulamaya; alım gösterilen günle', async () => {
    const items = (await ok(call('GET', '/api/admin/shop', null, (await staff()).session), 'panel')).items;
    const item = items.find((x) => x.id === SKU);
    assert.ok(item && item.days > 0, 'süreli bir çerçeve');
    assert.deepEqual(item.plans, []);
    // Two durations that aren't its main term (its main term may be 7 or 30 days).
    const [A, B] = [3, 10, 20, 45].filter((d) => d !== item.days);
    // Rules: at most 3, none twice (the main term counts), priced, within 365 days.
    for (const [plans, re] of [
      [[{ days: A, price: 10 }, { days: B, price: 10 }, { days: 60, price: 10 }, { days: 90, price: 10 }], /en fazla 3/],
      [[{ days: item.days, price: 10 }], /iki kez/],
      [[{ days: A, price: 0 }], /fiyatı/],
      [[{ days: 400, price: 10 }], /1–365/],
    ]) {
      const [st, j] = await update({ id: SKU, plans });
      assert.equal(st, 400, JSON.stringify(plans));
      assert.match(j.error, re);
    }
    const plans = [
      { days: B, price: Math.round(item.price * 0.6) + 1 },
      { days: A, price: Math.round(item.price * 0.35) + 1 },
    ];
    const saved = (await ok(update({ id: SKU, plans }), 'paket kaydı')).item;
    assert.deepEqual(saved.plans.map((p) => p.days), [A, B], 'günlerine göre sıralı');
    assert.ok(saved.changed.includes('plans'));
    const cat = (await ok(call('GET', '/api/catalog?shop=1'), 'katalog')).shop.items.find((x) => x.sku === SKU);
    assert.deepEqual(cat.plans, saved.plans);

    const u = await h.signUp('Paketli Alıcı');
    await h.credit(u.user.id, 100_000);
    const buy = (body) => call('POST', '/api/shop/buy', { sku: SKU, ref: rnd(), ...body }, u.session);
    const week = saved.plans[0];
    // The week at its own price; the week at the main price is a 409 and nothing moves.
    let [st, j] = await buy({ price: week.price - 1, days: A });
    assert.deepEqual([st, j.code], [409, 'price_changed'], 'gösterilen fiyat düşük');
    const before = (await ok(call('GET', '/api/me', null, u.session))).user.coins;
    assert.equal(before, 100_000, 'hiçbir şey düşmedi');
    j = await ok(buy({ price: week.price, days: A }), 'kısa paket');
    const after = (await ok(call('GET', '/api/me', null, u.session))).user.coins;
    assert.equal(before - after, week.price);
    const mine = j.economy.items.find((x) => x.sku === SKU);
    assert.ok(mine, 'çantada');
    // A package that isn't sold: the main term's days are asked for (409), nothing moves.
    [st, j] = await buy({ price: week.price, days: 45 });
    assert.equal(st, 409);
    // An older app sends no days: the main term at its price.
    await ok(buy({ price: item.price }), 'eski uygulama');
    assert.equal((await ok(call('GET', '/api/me', null, u.session))).user.coins, after - item.price);
    // Back to the app's values: the packages go too.
    await ok(call('POST', '/api/admin/shop/reset', { id: SKU }, (await staff()).session), 'orijinale dön');
    assert.equal((await ok(call('GET', '/api/catalog?shop=1'))).shop.items.find((x) => x.sku === SKU).plans, undefined);
  });
});
