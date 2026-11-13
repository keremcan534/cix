// The test-max button (POST /api/wallet/test-max, index.mjs): on a test server one press puts the account at the top
// of everything (coins, Cömertlik, Yankı, VIP 10, Rütbe Paşa). Closed with test top-ups off: hardening.test.mjs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const me = async (s) => (await ok(call('GET', '/api/me', null, s), 'me')).user;

describe('Test hesabı: her şey son seviye', () => {
  test('jeton 6 milyona, Cömertlik ve Yankı Lv.50 puanına, VIP 10 ve Rütbe Paşa', async () => {
    const a = await signUp('Test Hesabı');
    const other = await signUp('Başkası');
    const r = await ok(call('POST', '/api/wallet/test-max', { ref: rnd(6) }, a.session), 'test-max');
    assert.equal(r.user.coins, 6_000_000);
    assert.equal(r.user.svipXp, 400_000_000);

    const u = await me(a.session);
    assert.equal(u.wealthXp, 30_000_000);
    assert.equal(u.charmXp, 60_000_000);
    const eco = await ok(call('GET', '/api/economy', null, a.session), 'ekonomi');
    assert.equal(eco.noble?.tier, 5, 'Rütbe Paşa');
    assert.equal(eco.vipLevel, 15);
    const until = eco.noble.until;

    // Pressing again: coins topped back up to 6 million, Rütbe not stacked a second month.
    await ok(call('POST', '/api/wallet/test-max', { ref: rnd(6) }, a.session), 'ikinci basış');
    assert.equal((await me(a.session)).coins, 6_000_000);
    assert.equal((await ok(call('GET', '/api/economy', null, a.session), 'ekonomi')).noble.until, until);

    // Someone else is untouched.
    const o = await me(other.session);
    assert.equal(o.wealthXp, 0);
    assert.equal(o.charmXp, 0);
  });

  test('aynı istek kimliği tekrar gelirse tekrar yazılmaz', async () => {
    const a = await signUp('Tekrar');
    const ref = rnd(6);
    await ok(call('POST', '/api/wallet/test-max', { ref }, a.session), 'ilk');
    const again = await ok(call('POST', '/api/wallet/test-max', { ref }, a.session), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(again.user.coins, 6_000_000);
  });
});

