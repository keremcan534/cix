// Oyun Salonu on the server (casino.mjs, casino-rules.mjs, casino-slots.mjs) against a real Postgres: the odds
// (at most 40 % back, JACKPOT share included), Cömertlik Lv.2, the stake from game coins first and through the
// spending limit, winnings only as game coins, one charge per request, the payout pool, the JACKPOT funds, the
// live settings (games off, top stake, daily limit), the data copy and account deletion. And Sıralama › Oda XP.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import {
  BOARDS,
  GAMES,
  JACKPOT_SEEDS,
  PICKS,
  POOL_SEED,
  RETURN_SHARE,
  boardMaxPayout,
  boardPayout,
  expectedReturn,
  isBoard,
  isLineSlot,
  jackpotShareOf,
  maxMultiplier,
  outcomeOf,
  topStake,
} from '../casino-rules.mjs';
import { SLOT_CONFIGS } from '../casino-slots.mjs';
import { DEFAULTS, LiveError, isBig, snapshotOf, validate } from '../live-registry.mjs';

const h = startApi();
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const q = async (sql, args = []) => (await h.sql.query(sql, args)).rows;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
const play = (s, body, ref = rnd(8)) => call('POST', '/api/casino/play', { ref, ...body }, s);
/** A signed-up person past Cömertlik Lv.2: tops up and spends 1000 coins in the shop. */
async function player(name, coins) {
  const p = await signUp(name);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) {
    assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  }
  return p;
}
const SETTINGS = '/api/admin/live-settings';
let admin;
async function setLive(changes) {
  admin ??= await h.account('Yönetici', 'admin');
  const [, view] = await call('GET', SETTINGS, null, admin.session);
  const [st, j] = await call('POST', SETTINGS, { changes, reason: 'Oyun Salonu testi', baseV: view.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}
/** The bet body of one round of `g` at its smallest stake. */
const smallest = (g) => (isBoard(g.id) ? { game: g.id, bets: { [BOARDS[g.id].options[0].id]: g.bets[0] } } : { game: g.id, bet: g.bets[0], pick: PICKS[g.id][0] || undefined });

describe('Oyun Salonu oranları', () => {
  test('her oyun ve seçim en çok %40 geri öder (JACKPOT payı dahil)', () => {
    for (const g of GAMES) {
      for (const pick of PICKS[g.id]) {
        const r = expectedReturn(g.id, pick);
        assert.ok(r <= RETURN_SHARE + 1e-12, `${g.id}/${pick}: ${r}`);
        assert.ok(r > 0.3, `${g.id}/${pick}: ${r}`);
      }
    }
  });

  test('bahisler 250’den başlar, en çok 25.000; günlük sınır 40 tur', () => {
    for (const g of GAMES) {
      assert.equal(g.bets[0], 250, g.id);
      assert.ok(topStake(g) <= 25_000, g.id);
      for (const b of g.bets) if (jackpotShareOf(g.id, b)) assert.equal(Number.isInteger(b * SLOT_CONFIGS[g.id].jackpotShare), true);
    }
  });

  test('bir turun sonucu oyunun kendi alanını taşır ve ödemesi çarpandan gelir', () => {
    let seed = 11;
    const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (const g of GAMES) {
      for (let i = 0; i < 200; i++) {
        const pick = PICKS[g.id][i % PICKS[g.id].length];
        const o = outcomeOf(g.id, pick, rand);
        assert.ok(o.multiplier >= 0 && o.multiplier <= maxMultiplier(g.id, pick), g.id);
        assert.ok(o.detail.length > 0 && o.detail.length <= 200);
        if (isLineSlot(g.id)) assert.ok(o.slot);
        else if (isBoard(g.id)) assert.ok(o.board);
        else assert.ok(o.tree || o.rocket || o.fener || o.bilye || typeof o.caught === 'boolean', g.id);
      }
    }
  });
});

describe('Oyun Salonu canlı ayarları', () => {
  const refused = (fn) => assert.throws(fn, (e) => e instanceof LiveError);
  test('varsayılanlar demodaki değerler; sınırlar', () => {
    assert.deepEqual([DEFAULTS.casino_off, DEFAULTS.casino_max_bet, DEFAULTS.casino_daily_rounds], [[], 25_000, 40]);
    assert.deepEqual(validate('casino_off', ['neon', 'slot']), ['slot', 'neon']);
    assert.equal(validate('casino_off', []), null);
    refused(() => validate('casino_off', ['wheel']));
    assert.equal(validate('casino_max_bet', 1000), 1000);
    for (const v of [0, 249, 300, 25_250, '1000']) refused(() => validate('casino_max_bet', v));
    for (const v of [0, 201, 1.5]) refused(() => validate('casino_daily_rounds', v));
    assert.equal(isBig('casino_daily_rounds', 40, 81), true);
    assert.equal(isBig('casino_daily_rounds', 40, 80), false);
    const s = snapshotOf([{ key: 'casino_off', value: ['fish'] }, { key: 'casino_max_bet', value: 5000 }]);
    assert.deepEqual([[...s.casinoOff], s.casinoMaxBet, s.casinoDailyRounds], [['fish'], 5000, 40]);
  });
});

describe('Oyun Salonu sunucuda', () => {
  test('Cömertlik Lv.2 altında oynanamaz; jeton düşmez', async () => {
    const a = await signUp('A');
    await topUp(a.session, 1000);
    const [, info] = await call('GET', '/api/casino', null, a.session);
    assert.equal(info.allowed, false);
    assert.equal(info.needLevel, 2);
    assert.equal(info.games.length, GAMES.length);
    const [st, why] = await play(a.session, { game: 'goldtree', bet: 250 });
    assert.equal(st, 403);
    assert.match(why.error, /Cömertlik Lv\.2/);
    assert.equal((await me(a.session)).coins, 1000);
  });

  test('her oyun bir tur oynar: önce oyun jetonu, kazanç oyun jetonu, aynı istek bir kez', async () => {
    const a = await player('A', 30000);
    const [, info] = await call('GET', '/api/casino', null, a.session);
    assert.equal(info.allowed, true);
    assert.deepEqual(
      info.games.map((g) => [g.id, g.active, g.bets, g.dailyLimit, g.jackpot]),
      GAMES.map((g) => [g.id, true, g.bets, 40 * topStake(g), JACKPOT_SEEDS[g.id] ?? null]),
    );
    let u = await me(a.session);
    for (const g of GAMES) {
      const body = smallest(g);
      const ref = rnd(8);
      const both = await Promise.all([1, 2].map(() => play(a.session, { ...body, place: 'room' }, ref)));
      for (const [st, j] of both) assert.equal(st, 200, `${g.id}: ${j.error}`);
      assert.equal(both.filter(([, j]) => j.replay).length, 1, 'ikinci kopya tekrar sayılır');
      const r = both[0][1].round;
      assert.deepEqual(both[1][1].round, r);
      assert.equal(r.game, g.id);
      assert.equal(r.bet, 250);
      assert.equal(r.place, 'room');
      assert.equal(r.fromGame, Math.min(250, u.gameCoins), `${g.id}: önce oyun jetonu`);
      const o = r.outcome;
      const expected = isBoard(g.id) ? boardPayout(BOARDS[g.id], body.bets, o.board) : Math.floor(250 * o.multiplier);
      assert.equal(r.payout, expected + r.jackpot, g.id);
      const after = both[0][1].user;
      assert.equal(after.coins, u.coins - (250 - r.fromGame), `${g.id}: jeton`);
      assert.equal(after.gameCoins, u.gameCoins - r.fromGame + r.payout, `${g.id}: oyun jetonu`);
      u = after;
    }
    // The coin part is a coin_spend that never counts for Cömertlik; wins only ever go to game coins.
    const rows = await q("SELECT currency, amount, reason, ref FROM ledger WHERE user_id = $1 AND ref LIKE 'casino:%'", [a.user.id]);
    assert.ok(rows.length > 0);
    for (const x of rows) {
      if (x.currency === 'coin') assert.ok(Number(x.amount) < 0 && /^Uygulama içi: .+ · tur \(250\)$/.test(x.reason), x.reason);
      else assert.equal(x.currency, 'game');
    }
    assert.equal((await me(a.session)).wealthXp, 1000, 'oyun harcaması Cömertlik saymaz');
    const [, info2] = await call('GET', '/api/casino', null, a.session);
    assert.equal(info2.mine.length, GAMES.length);
    assert.equal(info2.mine[0].outcome, undefined, 'liste sonuç ayrıntısı taşımaz');
    assert.ok(info2.games.every((g) => g.playedToday === 250));
    // The house book: 60 % of each stake to the house, the rest in the pool less what it paid.
    const [bank] = await q('SELECT * FROM casino_bank');
    assert.equal(Number(bank.wagered), 250 * GAMES.length);
    assert.equal(Number(bank.house), 150 * GAMES.length);
    const shares = GAMES.reduce((n, g) => n + jackpotShareOf(g.id, 250), 0);
    const paidFromPool = Number(bank.paid) - Number((await q('SELECT coalesce(sum(jackpot), 0) AS n FROM casino_rounds'))[0].n);
    assert.equal(Number(bank.pool), POOL_SEED + 100 * GAMES.length - paidFromPool - shares);
  });

  test('geçersiz oyun, bahis, seçim ve ref; yetersiz jeton; ödül jetonu oynanmaz', async () => {
    const a = await player('B', 1000);
    for (const body of [{ game: 'wheel', bet: 250 }, { game: 'dice', bet: 250 }, { game: 'goldtree', bet: 300 }, { game: 'goldtree', bet: '250' }, { game: 'fish', bet: 250, pick: 'shark2' }, { game: 'rocket', bet: 250, pick: '7' }, { game: 'rocket', bet: 250 }]) {
      assert.equal((await play(a.session, body))[0], 400, JSON.stringify(body));
    }
    assert.equal((await play(a.session, { game: 'goldtree', bet: 250 }, 'kisa'))[0], 400);
    for (const bets of [{}, { melon: 300 }, { kiwi: 250 }, { melon: -250 }, [250], { melon: 250.5 }]) assert.equal((await play(a.session, { game: 'slot', bets }))[0], 400, JSON.stringify(bets));
    const [st, why] = await play(a.session, { game: 'goldtree', bet: 5000 });
    assert.equal(st, 409);
    assert.match(why.error, /Yetersiz/);
    // Reward coins (daily check-in, tasks) are for the shop only.
    await h.sql.query('UPDATE users SET coins = coins + 5000 WHERE id = $1', [a.user.id]);
    await h.sql.query("INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, 'odul', 5000, 5000, 168, $2)", [a.user.id, rnd(6)]);
    const [st2, why2] = await play(a.session, { game: 'goldtree', bet: 5000 });
    assert.equal(st2, 409);
    assert.equal(why2.code, 'reward_coins_only');
    assert.equal((await q('SELECT count(*)::int AS n FROM casino_rounds WHERE user_id = $1', [a.user.id]))[0].n, 0, 'reddedilen tur yazılmaz');
  });

  test('bahis tahtası: birden çok seçenek, her biri en çok en yüksek bahis', async () => {
    const a = await player('C', 30000);
    const bets = { crab: 250, fish: 500, cabbage: 1000 };
    const [st, j] = await play(a.session, { game: 'foodwheel', bets });
    assert.equal(st, 200, j.error);
    assert.equal(j.round.bet, 1750);
    assert.deepEqual(j.round.bets, bets);
    assert.equal(j.round.payout, boardPayout(BOARDS.foodwheel, bets, j.round.outcome.board));
    assert.ok(boardMaxPayout(BOARDS.foodwheel, bets) >= j.round.payout);
    const [st2, why] = await play(a.session, { game: 'foodwheel', bets: { crab: 25_250 } });
    assert.equal(st2, 409);
    assert.match(why.error, /en çok 25\.000/);
  });

  test('günlük harcama limiti oyunda da geçerli', async () => {
    const a = await player('D', 5000);
    assert.equal((await call('POST', '/api/me/spend-limit', { limit: 1500 }, a.session))[0], 200);
    assert.equal((await play(a.session, { game: 'olympus', bet: 250 }))[0], 200);
    const [st, why] = await play(a.session, { game: 'olympus', bet: 1000 });
    assert.equal(st, 409);
    assert.equal(why.code, 'daily_limit');
  });

  test('ödül havuzu en yüksek ödülü karşılamazsa tur başlamaz, jeton düşmez', async () => {
    const a = await player('E', 30000);
    const coins = (await me(a.session)).coins;
    const [st, why] = await play(a.session, { game: 'rocket', bet: 25_000, pick: '1000' });
    assert.equal(st, 409, 'havuz 25 milyonu karşılamaz');
    assert.match(why.error, /Ödül havuzu/);
    assert.equal((await me(a.session)).coins, coins);
    await h.sql.query('UPDATE casino_bank SET pool = 1000');
    assert.equal((await play(a.session, { game: 'goldtree', bet: 250 }))[0], 409, '250 × 188 > 1000');
    await h.sql.query('UPDATE casino_bank SET pool = $1', [POOL_SEED]);
    assert.equal((await play(a.session, { game: 'goldtree', bet: 250 }))[0], 200);
  });

  test('JACKPOT payı fona gider; beş wild fonun bahis / en yüksek bahis kadarını öder', async () => {
    const a = await player('F', 5000);
    const fund0 = Number((await q("SELECT fund FROM casino_jackpots WHERE game = 'neon'"))[0].fund);
    const [, j] = await play(a.session, { game: 'neon', bet: 1000 });
    const fund1 = Number((await q("SELECT fund FROM casino_jackpots WHERE game = 'neon'"))[0].fund);
    if (j.round.jackpot) assert.equal(j.round.jackpot, Math.floor(((fund0 + 20) * 1000) / 10_000));
    else assert.equal(fund1, fund0 + 20);
    assert.equal(j.fund, fund1);
    const [, info] = await call('GET', '/api/casino', null, a.session);
    assert.equal(info.games.find((g) => g.id === 'neon').jackpot, fund1);
    assert.equal((await play(a.session, { game: 'goldtree', bet: 250 }))[1].fund, null);
  });

  test('canlı ayarlar: oyun kapatılır, en yüksek bahis ve günlük sınır değişir', async () => {
    const a = await player('G', 30000);
    await setLive({ casino_off: ['fish'], casino_max_bet: 1000, casino_daily_rounds: 2 });
    const [, info] = await call('GET', '/api/casino', null, a.session);
    const fish = info.games.find((g) => g.id === 'fish');
    assert.equal(fish.active, false);
    assert.deepEqual(info.games.find((g) => g.id === 'rocket').bets, [250, 500, 1000]);
    assert.equal(info.games.find((g) => g.id === 'olympus').dailyLimit, 2000);
    const [st, why] = await play(a.session, { game: 'fish', bet: 250, pick: 'clown' });
    assert.equal(st, 409);
    assert.match(why.error, /Balon Avı şu an kapalı/);
    assert.equal((await play(a.session, { game: 'rocket', bet: 5000, pick: '2' }))[0], 400, 'en yüksek bahsin üstü');
    assert.equal((await play(a.session, { game: 'olympus', bet: 1000 }))[0], 200);
    assert.equal((await play(a.session, { game: 'olympus', bet: 1000 }))[0], 200);
    const [st2, why2] = await play(a.session, { game: 'olympus', bet: 250 });
    assert.equal(st2, 409);
    assert.match(why2.error, /günlük sınır 2\.000 jeton/);
    await setLive({ casino_off: null, casino_max_bet: null, casino_daily_rounds: null });
    assert.equal((await play(a.session, { game: 'fish', bet: 250, pick: 'clown' }))[0], 200);
    // Acil durum's Oyunlar stops every game, Rüzgâr Gülü with them.
    await setLive({ features_off: ['games'] });
    assert.equal((await play(a.session, { game: 'goldtree', bet: 250 }))[0], 503);
    assert.equal((await call('GET', '/api/casino', null, a.session))[1].games.every((g) => !g.active), true);
    await setLive({ features_off: null });
  });

  test('istek sınırı: dakikada 90 tur', async () => {
    const a = await signUp('H');
    let last;
    for (let i = 0; i < 91; i++) last = await play(a.session, { game: 'yok' });
    assert.equal(last[0], 429);
  });

  test('verilerimin kopyasında turlar var; hesap silinince turlar gider', async () => {
    const a = await player('I', 5000);
    assert.equal((await play(a.session, { game: 'goldtree', bet: 250 }))[0], 200);
    const [st, data] = await call('GET', '/api/me/export', null, a.session);
    assert.equal(st, 200, data.error);
    assert.equal(data.games.casino.length, 1);
    assert.equal(data.games.casino[0].game, 'goldtree');
    assert.equal(data.games.casino[0].bet, 250);
    assert.equal((await call('DELETE', '/api/me', null, a.session))[1].deleted, true);
    assert.equal((await q('SELECT count(*)::int AS n FROM casino_rounds WHERE user_id = $1', [a.user.id]))[0].n, 0);
  });
});

describe('Sıralama › Oda XP', () => {
  test('dönemin oda XP’si hediyelerden; engellenen sahibin odası görünmez', async () => {
    const owner = await signUp('Oda Sahibi');
    const other = await signUp('Öteki Sahip');
    const sender = await signUp('Gönderen');
    const viewer = await signUp('Bakan');
    await topUp(sender.session, 5000);
    const open = async (s) => {
      const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, s);
      assert.equal(st, 200, j.error);
      return j.room.id;
    };
    const room = await open(owner.session);
    const room2 = await open(other.session);
    const gift = async (to, r, giftId) => assert.equal((await call('POST', '/api/gifts/send', { to, giftId, count: 1, room: r, ref: rnd(6) }, sender.session))[0], 200);
    await gift(owner.user.id, room, 'g4');
    await gift(owner.user.id, room, 'g1');
    await gift(other.user.id, room2, 'g1');
    // Outside a room: no room XP.
    assert.equal((await call('POST', '/api/gifts/send', { to: owner.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, sender.session))[0], 200);
    const [st, j] = await call('GET', '/api/rankings/room-xp?period=day', null, viewer.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual(
      j.rows.map((r) => [r.rank, r.room.id, r.score]),
      [
        [1, room, 210],
        [2, room2, 10],
      ],
    );
    assert.equal(j.rows[0].room.level, 2);
    assert.equal(j.rows[0].room.owner.id, owner.user.id);
    assert.equal((await call('GET', '/api/rankings/room-xp?period=year', null, viewer.session))[0], 400);
    // Blocks, both ways.
    assert.equal((await call('POST', '/api/block', { to: owner.user.id }, viewer.session))[0], 200);
    assert.deepEqual((await call('GET', '/api/rankings/room-xp?period=week', null, viewer.session))[1].rows.map((r) => r.room.id), [room2]);
    assert.equal((await call('POST', '/api/block', { to: sender.user.id }, other.session))[0], 200);
    assert.equal((await call('POST', '/api/block', { to: viewer.user.id }, other.session))[0], 200);
    assert.deepEqual((await call('GET', '/api/rankings/room-xp?period=month', null, viewer.session))[1].rows, []);
    // A closed room leaves the board.
    assert.equal((await call('POST', '/api/rooms/close', { id: room }, owner.session))[0], 200);
    assert.deepEqual((await call('GET', '/api/rankings/room-xp?period=day', null, sender.session))[1].rows.map((r) => r.room.id), []);
  });
});
