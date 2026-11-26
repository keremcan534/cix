// Günlük harcama limiti off (owners, 26 Nov 2026; spend-limit.mjs SPEND_LIMITS, the default): a limit an older app
// sets is kept but nothing is refused, and every phone reads "no limit".
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ SPEND_LIMITS: '0' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('Günlük harcama limiti kapalı', () => {
  test('eski uygulamanın koyduğu limit harcamayı durdurmaz, limit yok görünür', async () => {
    const [a, b] = await Promise.all([signUp('Özgür'), signUp('Alan')]);
    await h.credit(a.user.id, 10_000);
    await ok(call('POST', '/api/me/spend-limit', { limit: 100 }, a.session), 'eski uygulama limit koyar');
    const s = await ok(call('GET', '/api/me/spend-limit', null, a.session), 'okuma');
    assert.deepEqual([s.limit, s.next, s.left], [null, null, null]);
    await ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g5', count: 1, ref: rnd(6) }, a.session), 'limitin üstünde hediye');
  });
});
