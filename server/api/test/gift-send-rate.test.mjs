// Fast gift combos (owners, 21 Nov 2026: "hızlı gönderim yapınca çok fazla istek diyor, atıcıyı durduruyor"): gift
// sends have their own per-session budget, apart from the room's reads, and a newer app sends the combo taps made
// while the last send was on its way as one Şanslı request (`times`).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

// A small general budget, so the test can use it up; gift sends keep the default wide one.
const h = startApi({ RATE_ALL: '40', RATE_SEND: undefined });
const { call, signUp } = h;

const topUp = async (s, amount) => {
  for (; amount >= 10000; amount -= 10000) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 10000, ref: rnd(6) }, s))[0], 200);
};
async function player(name) {
  const p = await signUp(name);
  await h.sql.query("UPDATE users SET birth_date = '1990-01-01' WHERE id = $1", [p.user.id]);
  await topUp(p.session, 50000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) {
    assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  }
  return p;
}
const lucky = (s, body) => call('POST', '/api/lucky/send', { giftId: 'lk2', count: 1, ref: rnd(8), ...body }, s);

describe('Hızlı hediye gönderimi', () => {
  test('odanın okumaları kotayı doldursa da hediye gönderimi durmaz', async () => {
    const a = await player('Hızlı');
    const b = await signUp('Alıcı');
    // The room's reads use up the session's general budget…
    let refused = 0;
    for (let i = 0; i < 45; i++) if ((await call('GET', '/api/me', null, a.session))[0] === 429) refused++;
    assert.ok(refused > 0, 'the general budget is used up');
    // …and a fast combo still goes out, Şanslı and plain gifts alike.
    for (let i = 0; i < 60; i++) {
      const [st, j] = await lucky(a.session, { to: [b.user.id] });
      assert.equal(st, 200, j.error);
    }
    for (let i = 0; i < 20; i++) {
      const [st, j] = await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, a.session);
      assert.equal(st, 200, j.error);
    }
  });

  test('times: birikmiş basışlar tek istekte, adet × tekrar kadar hediye; geçersiz tekrar reddedilir, eski uygulama 1 sayılır', async () => {
    const a = await player('Kombo');
    const b = await signUp('Alıcı 1');
    const c = await signUp('Alıcı 2');
    const ref = rnd(8);
    let [st, j] = await lucky(a.session, { to: [b.user.id, c.user.id], count: 5, times: 3, ref });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.count, 15);
    assert.equal(j.send.draws.length, 30);
    assert.equal(j.send.cost, 100 * 15 * 2);
    const ev = (await h.sql.query('SELECT count, total FROM gift_events WHERE sender = $1 ORDER BY id', [a.user.id])).rows;
    assert.deepEqual(ev.map((x) => x.count), [15, 15]);
    // The same request again (a lost answer): played once.
    [st, j] = await lucky(a.session, { to: [b.user.id, c.user.id], count: 5, times: 3, ref });
    assert.equal(st, 200);
    assert.equal(j.replay, true);
    // An older app sends no times: one tap, as before.
    [st, j] = await lucky(a.session, { to: [b.user.id], count: 10 });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.count, 10);
    for (const times of [0, 51, 1.5, '2', -1]) {
      [st, j] = await lucky(a.session, { to: [b.user.id], times });
      assert.equal(st, 400, `times ${times}`);
      assert.match(j.error, /tekrar/);
    }
    // At most 16.000 gifts drawn in one send (5.000 before ×777, 22 Nov 2026): 250 × 33 × 2 = 16.500.
    [st, j] = await lucky(a.session, { to: [b.user.id, c.user.id], count: 250, times: 33 });
    assert.deepEqual([st, j.error], [400, 'Geçersiz tekrar sayısı']);
    // Nothing moved for the refused ones.
    assert.equal(Number((await h.sql.query('SELECT count(*) FROM lucky_sends WHERE user_id = $1', [a.user.id])).rows[0].count), 2);
  });
});
