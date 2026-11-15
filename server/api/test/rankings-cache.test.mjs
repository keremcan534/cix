// Sıralama under load (gifts.mjs topBoard, docs/YUK_TESTI.md): a board is read once and kept RANKINGS_CACHE_MS, so
// hundreds of people opening it at once share one query; after that it shows the gifts sent meanwhile.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ RANKINGS_CACHE_MS: '1500' });
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Sıralama önbelleği', () => {
  test('pano bir kez okunur, süresi dolunca yeni hediyeleri gösterir', async () => {
    const a = await h.signUp('Cömert');
    const b = await h.signUp('Alan');
    await ok(h.call('POST', '/api/wallet/test-topup', { amount: 10000, ref: rnd(8) }, a.session));
    const board = () => ok(h.call('GET', '/api/rankings?board=wealth&period=day', null, b.session)).then((j) => j.rows);
    assert.deepEqual(await board(), []);
    await ok(h.call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g6', count: 1, ref: rnd(8) }, a.session));
    // Within the kept time: the board read before the gift, for everyone.
    assert.deepEqual(await board(), []);
    await sleep(1700);
    const rows = await board();
    assert.equal(rows[0]?.user.id, a.user.id);
    assert.equal(rows[0]?.score, 1999);
  });
});
