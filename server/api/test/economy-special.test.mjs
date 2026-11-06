// Special IDs on sale (SHOP_SPECIAL_IDS=1, economy.mjs): one owner per number, only bought coins pay for one, and a
// deleted account frees its number. The rest of the shop is in economy-shop.test.mjs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ SHOP_SPECIAL_IDS: '1', AGENCY_JOBS: '0' });
const { call, signUp } = h;

const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const buy = (s, sku, price, ref = rnd(6)) => call('POST', '/api/shop/buy', { sku, price, ref }, s);
const coins = async (u) => Number((await h.sql.query('SELECT coins FROM users WHERE id = $1', [u.user.id])).rows[0].coins);
async function person(name, amount, channel = 'test') {
  const u = await signUp(name);
  await h.sql.query('INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, $2, $3, $3, 0, $4)', [u.user.id, channel, amount, `t-${rnd(6)}`]);
  await h.sql.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [u.user.id, amount]);
  return u;
}

describe('Özel numara', () => {
  test('satışta: listede var, alınır ve giyilir', async () => {
    const u = await person('Numaracı', 5000);
    const before = (await ok(call('GET', '/api/economy', null, u.session))).shop;
    assert.ok(before.some((x) => x.sku === 'id-1001'));
    const e = (await ok(buy(u.session, 'id-1001', 2000))).economy;
    assert.equal(e.equipped.specialId, 'id-1001');
    assert.equal(await coins(u), 3000);
    const [st, j] = await buy(u.session, 'id-1001', 2000);
    assert.deepEqual([st, j.code], [409, 'owned']);
  });

  test('aynı numarayı iki kişi aynı anda: tek kazanan, kaybeden ödemez', async () => {
    const a = await person('Yarışan A', 10_000);
    const b = await person('Yarışan B', 10_000);
    const both = await Promise.all([a, b].map((u) => buy(u.session, 'id-777', 8000)));
    assert.deepEqual(both.map(([st]) => st).sort(), [200, 409]);
    assert.equal(both.find(([st]) => st === 409)[1].code, 'taken');
    assert.deepEqual([await coins(a), await coins(b)].sort((x, y) => x - y), [2000, 10_000]);
    assert.equal((await h.sql.query("SELECT 1 FROM entitlements WHERE sku = 'id-777'")).rowCount, 1);
  });

  test('yalnız ödül jetonu: numara "reward_coins_only", ücret yok; çerçeve alınır', async () => {
    const u = await person('Ödüllü Numaracı', 5000, 'odul');
    const [st, j] = await buy(u.session, 'id-2026', 3000);
    assert.deepEqual([st, j.code], [409, 'reward_coins_only']);
    assert.equal(await coins(u), 5000);
    assert.equal((await h.sql.query('SELECT 1 FROM entitlements WHERE user_id = $1', [u.user.id])).rowCount, 0);
    await ok(buy(u.session, 'fr-silver', 800));
    assert.equal(await coins(u), 4200);
  });

  test('hesap silinince numara boşa çıkar', async () => {
    const a = await person('Silinecek', 5000);
    const b = await person('Bekleyen', 5000);
    await ok(buy(a.session, 'id-2026', 3000));
    assert.equal((await buy(b.session, 'id-2026', 3000))[1].code, 'taken');
    await ok(call('DELETE', '/api/me', null, a.session));
    await ok(buy(b.session, 'id-2026', 3000));
    const r = (await h.sql.query("SELECT user_id, revoked_why FROM entitlements WHERE sku = 'id-2026' ORDER BY id")).rows;
    assert.deepEqual(r.map((x) => [x.user_id, x.revoked_why]), [[a.user.id, 'hesap silindi'], [b.user.id, null]]);
  });

  test('eski uygulama: "Mağaza: ID 1001" köprüden geçer (bayrak açıkken)', async () => {
    const u = await person('Eski Numaracı', 5000);
    // id-1001 is taken (first test); the bridge answers that, not update_required.
    const [st, j] = await call('POST', '/api/wallet/spend', { amount: 2000, reason: 'Mağaza: ID 1001', ref: rnd(6) }, u.session);
    assert.deepEqual([st, j.code], [409, 'taken']);
    assert.equal(await coins(u), 5000);
  });
});
