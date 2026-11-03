// Remote control from .env (features.mjs): the public app config, switched-off features refused on the server
// while reads stay open, and quiet health warnings / admin alerts when nothing is wrong.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { configOf } from '../features.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({
  APP_MIN_VERSION: '1.2.0',
  APP_UPDATE_URL: 'https://example.com/similar.apk',
  APP_NOTICE: '  Bu gece 02:00–02:15 bakım var.  ',
  FEATURES_OFF: 'gifts, Topup,dm,rooms,exchange,jeton,purchases,unknown',
  // Nothing should warn here: no disk check, and the refused features must not count as server errors.
  ALERT_DISK_FREE_PCT: '0',
  ALERT_5XX_15M: '0',
  ALERT_CACHE_S: '0',
});
const { call } = h;

describe('app config', () => {
  test('GET /api/config: public, from .env, cacheable 30 s', async () => {
    const r = await fetch(`${h.base}/api/config`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=30');
    assert.deepEqual(await r.json(), {
      minVersion: '1.2.0',
      updateUrl: 'https://example.com/similar.apk',
      notice: 'Bu gece 02:00–02:15 bakım var.',
      featuresOff: ['gifts', 'topup', 'dm', 'rooms', 'exchange', 'jeton', 'purchases'],
    });
  });

  test('configOf: bad values are dropped, empty means nothing set', () => {
    assert.deepEqual(configOf({}), { minVersion: null, updateUrl: null, notice: null, featuresOff: [] });
    assert.deepEqual(configOf({ APP_MIN_VERSION: 'v1', APP_UPDATE_URL: 'http://insecure', FEATURES_OFF: ' ,games,games' }), { minVersion: null, updateUrl: null, notice: null, featuresOff: ['games'] });
    assert.equal(configOf({ APP_NOTICE: 'x'.repeat(400) }).notice.length, 300);
  });
});

describe('switched-off features', () => {
  test('money, messages and rooms are refused with 503; reads keep working', async () => {
    const a = await h.signUp();
    const b = await h.signUp();
    const off = [
      ['POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }],
      ['POST', '/api/gifts/send', { to: b.user.id, giftId: 'g1', count: 1, ref: rnd(6) }],
      ['POST', '/api/wallet/gift', { to: b.user.id, amount: 10, ref: rnd(6) }],
      ['POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(6) }],
      ['POST', '/api/wallet/exchange', { diamonds: 1000, ref: rnd(6) }],
      ['POST', '/api/jeton/transfer', { to: b.user.id, coins: 10, ref: rnd(6) }],
      ['POST', '/api/jeton/sell-diamonds', { bank: b.user.id, diamonds: 1000, ref: rnd(6) }],
      ['POST', '/api/messages', { to: b.user.id, text: 'selam', ref: rnd(6) }],
      ['POST', '/api/rooms', { title: 'Oda' }],
      ['GET', '/token?room=oda-r1'],
    ];
    for (const [m, p, body] of off) {
      const [st, j] = await call(m, p, body, a.session);
      assert.equal(st, 503, `${m} ${p}`);
      assert.equal(j.error, 'Bu özellik geçici olarak kapalı');
    }
    // Nothing moved.
    const [, me] = await call('GET', '/api/me', null, a.session);
    assert.equal(me.user.coins, 0);
    for (const p of ['/api/ledger', '/api/rooms', '/api/conversations', '/api/wallet/earnings', '/api/catalog']) assert.equal((await call('GET', p, null, a.session))[0], 200, p);
    // Spending on in-app items is not one of the switches.
    assert.equal((await call('POST', '/api/wallet/spend', { amount: 5, reason: 'VIP', ref: rnd(6) }, a.session))[0], 409);
  });
});

describe('alarms when all is well', () => {
  test('health has an empty warnings list, and refused features are not server errors', async () => {
    const [st, j] = await call('GET', '/api/health');
    assert.equal(st, 200);
    assert.equal(j.ok, true);
    assert.deepEqual(j.warnings, []);
  });

  test('GET /api/admin/alerts: admins only', async () => {
    const u = await h.signUp();
    assert.equal((await call('GET', '/api/admin/alerts'))[0], 401);
    assert.equal((await call('GET', '/api/admin/alerts', null, u.session))[0], 403);
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [u.user.id]);
    const [st, j] = await call('GET', '/api/admin/alerts', null, u.session);
    assert.equal(st, 200);
    assert.deepEqual(j.warnings, []);
    assert.equal(j.thresholds.diamonds1h, 500_000);
    assert.equal(j.financeSync, false);
  });
});
