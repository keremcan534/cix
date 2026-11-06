// Rüzgâr Gülü (wheel.mjs) against a real Postgres: the odds (40 % back, JACKPOT included), Cömertlik Lv.2,
// paying from game coins first, prizes only as game coins, one charge per request, the daily limit and the lists.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { JACKPOT_SEED_SPINS, JACKPOT_SHARE_MILLI, SLICES, TIERS, WEIGHT_TOTAL, jackpotSeed, playSpins, sliceAt } from '../wheel-rules.mjs';

const h = startApi({ WHEEL_DAILY: '600000' });
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
const spin = (s, tier, count, ref = rnd(8)) => call('POST', '/api/wheel/spin', { tier, count, ref }, s);
/** A signed-up person past Cömertlik Lv.2: tops up and spends 1000 coins in the shop. */
async function player(name, coins) {
  const p = await signUp(name);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) {
    assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  }
  return p;
}

describe('Rüzgâr Gülü oranları', () => {
  test('dilimler bir milyon, sabit dilimler %37,994, JACKPOT ile ~%40', () => {
    assert.equal(SLICES.reduce((s, x) => s + x.weight, 0), WEIGHT_TOTAL);
    assert.equal(SLICES.filter((x) => x.milli === null).length, 1);
    const fixed = SLICES.reduce((s, x) => s + (x.milli ?? 0) * x.weight, 0) / (1000 * WEIGHT_TOTAL);
    assert.ok(Math.abs(fixed - 0.37994) < 1e-9, String(fixed));
    const jp = SLICES.find((x) => x.milli === null).weight / WEIGHT_TOTAL;
    const total = fixed + JACKPOT_SHARE_MILLI / 1000 + JACKPOT_SEED_SPINS * jp;
    assert.ok(total <= 0.4 && total > 0.399, String(total));
    for (const t of Object.keys(TIERS)) for (const x of SLICES) if (x.milli !== null) assert.equal((TIERS[t].price * x.milli) % 1000, 0, 'ödül tam jeton');
  });

  test('her çekiliş doğru dilime düşer ve JACKPOT fonu öder, sonra tohumdan başlar', () => {
    let at = 0;
    for (let i = 0; i < SLICES.length; i++) {
      assert.equal(sliceAt(at), i);
      at += SLICES[i].weight;
      assert.equal(sliceAt(at - 1), i);
    }
    const jpAt = SLICES.slice(0, SLICES.findIndex((x) => x.milli === null)).reduce((s, x) => s + x.weight, 0);
    const r = playSpins('kiyi', 2, 1000, () => jpAt);
    assert.deepEqual(r.wins, [1003, jackpotSeed('kiyi') + 3]);
    assert.equal(r.jackpot, r.payout);
    assert.equal(r.fund, jackpotSeed('kiyi'));
  });

  test('uzun oyunda geri ödeme %40 civarı', () => {
    let seed = 7;
    const draw = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % WEIGHT_TOTAL);
    let fund = jackpotSeed('kiyi');
    let paid = 0;
    const N = 400_000;
    for (let i = 0; i < N / 50; i++) {
      const r = playSpins('kiyi', 50, fund, draw);
      fund = r.fund;
      paid += r.payout;
    }
    const back = paid / (N * TIERS.kiyi.price);
    assert.ok(back > 0.35 && back < 0.45, String(back));
  });
});

describe('Rüzgâr Gülü sunucuda', () => {
  test('Cömertlik Lv.2 altında kapalı', async () => {
    const a = await signUp('A');
    await topUp(a.session, 1000);
    const [, info] = await call('GET', '/api/wheel', null, a.session);
    assert.equal(info.allowed, false);
    assert.equal(info.tiers.length, 3);
    assert.equal(info.tiers[0].jackpot, jackpotSeed('kiyi'));
    const [st, why] = await spin(a.session, 'kiyi', 1);
    assert.equal(st, 403);
    assert.match(why.error, /Cömertlik/);
    assert.equal((await me(a.session)).coins, 1000);
  });

  test('önce oyun jetonu, sonra jeton; ödül oyun jetonu; aynı istek bir kez', async () => {
    const a = await player('A', 5000);
    const [st0, i0] = await call('GET', '/api/wheel', null, a.session);
    assert.equal(st0, 200, i0.error);
    assert.equal(i0.allowed, true);
    const ref = rnd(8);
    const both = await Promise.all([1, 2].map(() => spin(a.session, 'kiyi', 10, ref)));
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.equal(both.filter(([, j]) => j.replay).length, 1, 'ikinci kopya tekrar sayılır');
    const s1 = both[0][1].spin;
    assert.deepEqual(both[1][1].spin, s1);
    assert.equal(s1.cost, 2500);
    assert.equal(s1.fromGame, 0);
    assert.equal(s1.slices.length, 10);
    assert.equal(s1.payout, s1.wins.reduce((x, y) => x + y, 0));
    assert.ok(s1.payout >= 250, 'her dilim bir şey öder');
    let u = await me(a.session);
    assert.equal(u.coins, 5000 - 2500);
    assert.equal(u.gameCoins, s1.payout, 'kazanç oyun jetonu olarak');
    // Next spin uses game coins first.
    const [, r2] = await spin(a.session, 'kiyi', 1);
    assert.equal(r2.spin.fromGame, Math.min(250, s1.payout));
    u = await me(a.session);
    assert.equal(u.coins, 2500 - (250 - r2.spin.fromGame));
    assert.equal(u.gameCoins, s1.payout - r2.spin.fromGame + r2.spin.payout);
    const spends = await h.sql.query("SELECT reason FROM ledger WHERE user_id = $1 AND currency = 'coin' AND amount < 0 AND reason LIKE '%Rüzgâr%'", [a.user.id]);
    assert.ok(spends.rows.every((r) => r.reason.startsWith('Uygulama içi: Rüzgâr Gülü · tur')));
    // Fund grew by each spin's share.
    const fund = await h.sql.query("SELECT jackpot FROM wheel_funds WHERE tier = 'kiyi'");
    const jp = s1.slices.concat(r2.spin.slices).some((x) => SLICES[x].milli === null);
    if (!jp) assert.equal(Number(fund.rows[0].jackpot), jackpotSeed('kiyi') + 11 * Math.floor((250 * JACKPOT_SHARE_MILLI) / 1000));
    const [, info] = await call('GET', '/api/wheel', null, a.session);
    assert.equal(info.mine.length, 2);
    assert.equal(info.playedToday, 2750);
    assert.equal(info.board[0].id, a.user.id);
  });

  test('yetersiz jeton, geçersiz alan ve sayı, günlük sınır', async () => {
    const a = await player('A', 20000);
    assert.equal((await spin(a.session, 'yok', 1))[0], 400);
    assert.equal((await spin(a.session, 'kiyi', 5))[0], 400);
    assert.equal((await spin(a.session, 'kiyi', 1, 'kisa'))[0], 400);
    const [st, why] = await spin(a.session, 'okyanus', 10);
    assert.equal(st, 409);
    assert.match(why.error, /Yetersiz/);
    assert.equal((await me(a.session)).coins, 20000, 'reddedilen istek jeton almaz');
    // WHEEL_DAILY=600000: a 50 × 10.000 request fits, the next 10 × 10.000 doesn't.
    await h.sql.query('UPDATE users SET coins = coins + 1000000 WHERE id = $1', [a.user.id]);
    assert.equal((await spin(a.session, 'okyanus', 50))[0], 200);
    const [st2, why2] = await spin(a.session, 'okyanus', 50);
    assert.equal(st2, 409);
    assert.match(why2.error, /günlük sınır/);
  });

  test('kazananlar listesi: büyük kazanç ve JACKPOT görünür', async () => {
    const a = await player('A', 1000);
    const b = await signUp('B');
    await h.sql.query(
      `INSERT INTO wheel_spins (user_id, ref, tier, spins, cost, payout, jackpot, best_milli, slices, wins) VALUES ($1, 'x-big-0001', 'acik', 1, 2500, 25000, 0, 10000, '{9}', '{25000}')`,
      [a.user.id],
    );
    const [, info] = await call('GET', '/api/wheel', null, b.session);
    assert.ok(info.winners.some((w) => w.id === a.user.id && w.payout === 25000 && w.tier === 'acik'));
    assert.equal(info.allowed, false);
  });

  test('Jeton Noktası satışı ve iade geri alımı Cömertlik saymaz', async () => {
    const a = await signUp('Satıcı');
    const debit = (amount, reason) =>
      h.sql.query("INSERT INTO ledger (user_id, currency, amount, balance, reason, ref) VALUES ($1, 'coin', $2, 0, $3, $4)", [a.user.id, -amount, reason, rnd(8)]);
    await debit(10000, 'Jeton Noktası satışı');
    await debit(5000, 'İade: satın alınan jeton geri alındı');
    assert.equal((await call('GET', '/api/wheel', null, a.session))[1].allowed, false, 'satış ve iade harcama değil');
    assert.equal((await spin(a.session, 'kiyi', 1))[0], 403);
    // GET /api/me carries the same points, so the app gates the games with the server's value.
    assert.equal((await me(a.session)).wealthXp, 0);
    // A real purchase of 50 coins counts.
    await topUp(a.session, 1000);
    assert.equal((await call('POST', '/api/wallet/spend', { amount: 50, reason: 'Çıkartma paketi: Eğlence', ref: rnd(6) }, a.session))[0], 200);
    assert.equal((await call('GET', '/api/wheel', null, a.session))[1].allowed, true);
    assert.equal((await me(a.session)).wealthXp, 50);
  });

  test('başka bir işlemin ref’i: çark 500 vermez, sonraki hediye gerçekten gider', async () => {
    const a = await player('A', 5000);
    const b = await signUp('B');
    // A store purchase, then a spin with the same ref: the spin is its own request.
    const r1 = rnd(8);
    assert.equal((await call('POST', '/api/wallet/spend', { amount: 120, reason: 'Mağaza: Şeker', ref: r1 }, a.session))[0], 200);
    const coins0 = (await me(a.session)).coins;
    const [st1, s1] = await spin(a.session, 'kiyi', 1, r1);
    assert.equal(st1, 200, s1.error);
    assert.equal(s1.replay, false);
    assert.equal(s1.user.coins, coins0 - 250);
    // A spin, then a gift with the same ref: the gift is sent, not taken for a replay of the spin.
    const r2 = rnd(8);
    assert.equal((await spin(a.session, 'kiyi', 1, r2))[0], 200);
    const before = await me(a.session);
    const [st2, g] = await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g1', count: 1, ref: r2 }, a.session);
    assert.equal(st2, 200, g.error);
    assert.equal(g.replay, false);
    assert.equal(g.user.coins, before.coins - 10, 'hediyenin jetonu alındı');
    assert.equal((await me(b.session)).diamonds, 10, 'alıcıya elmas geçti');
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM gift_events WHERE sender = $1 AND ref = $2', [a.user.id, r2])).rows[0].n, 1);
    // The spin's own replay still answers with its row.
    const [st3, again] = await spin(a.session, 'kiyi', 1, r2);
    assert.equal(st3, 200);
    assert.equal(again.replay, true);
    // The wheel's ledger rows carry their own prefix.
    const refs = (await h.sql.query("SELECT ref FROM ledger WHERE user_id = $1 AND reason LIKE '%Rüzgâr%'", [a.user.id])).rows.map((r) => r.ref);
    assert.ok(refs.length > 0 && refs.every((r) => r.startsWith('wheel:')), refs.join(','));
  });
});
