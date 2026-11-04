// ALLOW_SANDBOX_PURCHASES=1 (a test server that takes store test purchases), against a real Postgres
// (harness.mjs) and a local stand-in for the stores (fake-stores.mjs): license tester and App Store sandbox
// purchases are credited, but as play money (the 'test' channel, no SVIP points, the test daily cap), and no
// withdrawal can be paid on such a server.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeStores } from './fake-stores.mjs';
import { rnd, startApi } from './harness.mjs';

const stores = await fakeStores();
const h = startApi({ ...stores.env, ALLOW_SANDBOX_PURCHASES: '1', ALLOW_TEST_TOPUP: '0', TEST_TOPUP_DAILY: '10000', LOCK_DAYS_STORE: '0', AGENCY_JOBS: '0' });
const { call } = h;
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;

describe('mağaza test satın alması açık', () => {
  let buyer, host, admin;
  test('lisans testçisi ve sandbox: test jetonu olarak yüklenir, SVIP puanı vermez, günlük sınıra sayılır', async () => {
    [buyer, host, admin] = await Promise.all([h.account('Testçi'), h.account('Yayıncı'), h.account('Yönetici', 'admin')]);
    const token = `test-${rnd(12)}`;
    const g = await ok(call('POST', '/api/wallet/purchase', { platform: 'android', productId: 'coins_1000', token }, buyer.session));
    assert.equal(g.coins + g.bonus, 2_000);
    assert.ok(stores.consumed.includes(token));
    stores.apple.sandbox.set('300000001', { productId: 'coins_5000' });
    const a = await ok(call('POST', '/api/wallet/purchase', { platform: 'ios', productId: 'coins_5000', transactionId: '300000001' }, buyer.session));
    assert.equal(a.user.coins, 9_500);
    const rows = await q('SELECT platform, sandbox FROM purchases ORDER BY id');
    assert.deepEqual(rows, [
      { platform: 'android', sandbox: true },
      { platform: 'ios', sandbox: true },
    ]);
    const lots = await q('SELECT DISTINCT channel FROM coin_lots WHERE user_id = $1 ORDER BY channel', [buyer.user.id]);
    assert.deepEqual(lots.map((l) => l.channel), ['bonus', 'test']);
    assert.equal(Number((await q('SELECT svip_xp FROM users WHERE id = $1', [buyer.user.id]))[0].svip_xp), 0);
    const [st, j] = await call('POST', '/api/wallet/purchase', { platform: 'android', productId: 'coins_1000', token: `test-${rnd(12)}` }, buyer.session);
    assert.equal(st, 429, '9.500 + 1.000 > 10.000');
    assert.match(j.error, /Günlük test/);
  });

  test('bu sunucuda çekim ödenemez (yönetici listesi bunu söyler)', async () => {
    const list = await ok(call('GET', '/api/admin/withdrawals', null, admin.session));
    assert.equal(list.playMoney, true);
    assert.equal((await call('GET', '/api/admin/withdrawals', null, host.session))[0], 403);
  });
});
