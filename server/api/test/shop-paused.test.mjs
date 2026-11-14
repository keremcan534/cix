// Shop items no longer sold (catalog.mjs SHOP_PAUSED, the default list): left out of the shop, a purchase refused with
// nothing charged, the old apps' spend route too; an item someone already owns stays theirs and can still be worn.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SHOP_PAUSED_DEFAULT } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ SHOP_PAUSED: undefined });
const { call } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('animasyonu olmayan giriş efektleri satıştan kalktı', () => {
  test('mağazada yok, satın alınamaz, jeton düşmez; sahibi olan takmaya devam eder', async () => {
    const u = await h.account('Alıcı');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(8) }, u.session), 'jeton');
    const shop = (await ok(call('GET', '/api/economy', null, u.session), 'mağaza')).shop;
    for (const sku of SHOP_PAUSED_DEFAULT) assert.ok(!shop.some((x) => x.sku === sku), `${sku} mağazada`);
    for (const sku of ['en-dragon', 'en-aslan', 'en-roket']) assert.ok(shop.some((x) => x.sku === sku), `${sku} mağazada yok`);

    const before = (await ok(call('GET', '/api/me', null, u.session), 'bakiye')).user.coins;
    const [st, j] = await call('POST', '/api/shop/buy', { sku: 'en-sparkle', price: 200, ref: rnd(8) }, u.session);
    assert.deepEqual([st, j.error], [400, 'Bu ürün artık satışta değil']);
    const [st2] = await call('POST', '/api/wallet/spend', { amount: 200, reason: 'Mağaza: Işıltı', ref: rnd(8) }, u.session);
    assert.equal(st2, 409);
    assert.equal((await ok(call('GET', '/api/me', null, u.session), 'bakiye')).user.coins, before, 'jeton düşmedi');

    // Someone who bought it before: it stays theirs and is worn as before.
    await h.sql.query(
      `INSERT INTO entitlements (user_id, sku, kind, price, ends_at, source, ref) VALUES ($1, 'en-sparkle', 'entry', 200, now() + interval '5 days', 'buy', $2)`,
      [u.user.id, rnd(8)],
    );
    await ok(call('POST', '/api/shop/equip', { slot: 'entry', sku: 'en-sparkle' }, u.session), 'tak');
    const other = await h.account('Bakan');
    const looks = (await ok(call('GET', `/api/looks?ids=${u.user.id}`, null, other.session), 'görünüm')).looks;
    assert.equal(looks[u.user.id].entry, 'en-sparkle');
  });
});
