// Pachinko on the server (casino-bilye.mjs, through casino.mjs) against a real Postgres: a launch is one round,
// the stake through the pool like every coin game, the win paid as game coins, the history line and a retry.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { BILYE_MAX, BILYE_TOTAL, BILYE_WEIGHTS, bilyeReturn, bilyeTarget } from '../casino-bilye.mjs';
import { LANES, TENTHS } from '../bilye-table.mjs';

const h = startApi();
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
async function player(coins) {
  const p = await signUp('Bilye');
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  return p;
}
const launch = (s, lane, bet = 250, ref = rnd(8)) => call('POST', '/api/casino/play', { game: 'bilye', bet, pick: lane, ref }, s);

describe('Pachinko kuralları', () => {
  test('her atış gücü en çok %40 geri öder; en büyük ödül 20 kat', () => {
    for (const lane of LANES) {
      assert.equal(BILYE_WEIGHTS[lane].reduce((a, b) => a + b, 0), BILYE_TOTAL);
      const r = bilyeReturn(lane);
      assert.ok(r <= 0.4 && r > 0.399, `${lane}: ${r}`);
    }
    assert.equal(BILYE_MAX, 20);
    assert.equal(bilyeTarget('orta', 0), 0);
    assert.equal(bilyeTarget('orta', BILYE_TOTAL - 1), TENTHS.length - 1);
  });
});

describe('Pachinko sunucuda', () => {
  test('atış: bahis düşer, kazanç oyun jetonu olarak gelir; aynı istek bir kez', async () => {
    const p = await player(10_000);
    const ref = rnd(8);
    const [st, j] = await launch(p.session, 'guclu', 1000, ref);
    assert.equal(st, 200, j.error);
    assert.equal(j.round.game, 'bilye');
    assert.equal(j.round.pick, 'guclu');
    const o = j.round.outcome.bilye;
    assert.equal(o.lane, 'guclu');
    assert.ok(Number.isInteger(o.target) && o.target >= 0 && o.target < TENTHS.length);
    assert.ok(Number.isInteger(o.variant));
    assert.equal(j.round.payout, (1000 * TENTHS[o.target]) / 10);
    assert.match(j.round.detail, /^Güçlü atış · /);
    const u = await me(p.session);
    assert.equal(u.coins + u.gameCoins, 10_000 - 1000 + j.round.payout);
    assert.equal(u.gameCoins, j.round.payout);
    const [st2, again] = await launch(p.session, 'guclu', 1000, ref);
    assert.equal(st2, 200);
    assert.equal(again.replay, true);
    assert.equal(again.round.id, j.round.id);
    assert.equal((await me(p.session)).coins, u.coins);
  });

  test('bilinmeyen atış gücü ve bahis reddedilir, jeton düşmez', async () => {
    const p = await player(5_000);
    assert.equal((await launch(p.session, 'tilt'))[0], 400);
    assert.equal((await launch(p.session, undefined))[0], 400);
    assert.equal((await launch(p.session, 'orta', 300))[0], 400);
    const u = await me(p.session);
    assert.equal(u.coins + u.gameCoins, 5_000);
  });

  test('çok atış: her tur kayıtlı, ödemeler hedeflerin katı', async () => {
    const p = await player(25_000);
    let paid = 0;
    for (let i = 0; i < 40; i++) {
      const [st, j] = await launch(p.session, LANES[i % 3]);
      assert.equal(st, 200, j.error);
      assert.equal(j.round.payout, (250 * TENTHS[j.round.outcome.bilye.target]) / 10);
      paid += j.round.payout;
    }
    const u = await me(p.session);
    assert.equal(u.coins + u.gameCoins, 25_000 - 40 * 250 + paid);
    const [, hall] = await call('GET', '/api/casino', null, p.session);
    assert.ok(hall.games.some((g) => g.id === 'bilye' && g.active));
    assert.equal(hall.mine.filter((r) => r.game === 'bilye').length, 40);
  });
});

describe('Oyun Salonu raporu', () => {
  test('yalnız yönetici; oyun oyun oynanan, ödenen, kasa payı; defterle aynı', async () => {
    const p = await player(5_000);
    assert.equal((await call('GET', '/api/admin/casino/report', null, p.session))[0], 403);
    for (let i = 0; i < 4; i++) assert.equal((await launch(p.session, 'orta', 500))[0], 200);
    const admin = await h.account('Rapor yöneticisi', 'admin');
    const [st, r] = await call('GET', '/api/admin/casino/report', null, admin.session);
    assert.equal(st, 200, r.error);
    const today = r.periods.today;
    const b = today.games.find((g) => g.id === 'bilye');
    assert.ok(b.rounds >= 4 && b.players >= 1);
    assert.ok(b.wagered >= 2000);
    assert.equal(b.house, b.wagered * 0.6);
    for (const k of ['week', 'month', 'kept']) assert.ok(r.periods[k].wagered >= today.wagered, k);
    // The book holds every round ever played; the rounds kept are part of it.
    assert.ok(r.book.wagered >= r.periods.kept.wagered);
    assert.equal(r.book.house, r.book.wagered * 0.6);
    assert.ok(r.book.pool >= 0 && r.book.seed > 0);
    assert.equal(typeof r.jackpots.jackpot, 'number');
  });
});
