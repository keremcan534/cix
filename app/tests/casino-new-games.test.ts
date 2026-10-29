/// <reference types="node" />
// The launch casino games beyond Lucky 77: Mega Jackpot (5×3 with a JACKPOT fund), Olympus Slot (6×5, pays anywhere)
// and Balık Avı (one round per shot). Each keeps the house rule; the JACKPOT is part of the 40 %.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { expectedReturn, maxMultiplier, outcomeOf } from '@/lib/casino-odds';
import { FISH, FISH_HIT, fishDraw, fishReturn, shootFish } from '@/lib/fish-hunt';
import { JACKPOT_SEED, getGames, playCasino, resetGames, setGameDeps } from '@/lib/games';
import { JACKPOT_SHARE, LINES, MEGA_MAX, PAYTABLE, STRIPS, jackpotReturn, linePay, megaSpin, playMega, type Sym } from '@/lib/mega-jackpot';
import { CELLS, FREE_SPINS, OLYMPUS_MAX, evaluateGrid, olympusReturn, playOlympus, scatterPay, symbolPay, type OCell, type OSym } from '@/lib/olympus-slot';

function seeded(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 2 ** 32) * n);
  };
}
/** Finds a stop on a reel whose window shows the symbol on the given row. */
const stopFor = (reel: number, sym: Sym, row: number) => {
  const n = STRIPS[reel].length;
  const at = STRIPS[reel].findIndex((_, i) => STRIPS[reel][(i + row) % n] === sym);
  assert.ok(at >= 0);
  return at;
};

describe('Mega Jackpot', () => {
  test('77 her sembolün yerine geçer, 1. makarada da; beş 77 JACKPOT', () => {
    assert.deepEqual(linePay(['wild', 'wild', 'seven', 'cherry', 'bell']), { sym: 'seven', count: 3, pay: PAYTABLE.seven![0] });
    assert.deepEqual(linePay(['cherry', 'wild', 'cherry', 'cherry', 'wild']), { sym: 'cherry', count: 5, pay: PAYTABLE.cherry![2] });
    assert.equal(linePay(['cherry', 'cherry', 'bell', 'cherry', 'cherry']), null);
    assert.equal(linePay(['wild', 'wild', 'wild', 'wild', 'wild']), 'jackpot');
    const mid = [0, 1, 2, 3, 4].map((r) => stopFor(r, 'wild', 1));
    const s = megaSpin(mid);
    assert.ok(s.jackpotLines.includes(0), 'orta çizgi');
  });

  test('çizgi kazançları %38 altında, JACKPOT payıyla %40’ı aşmaz', () => {
    const r = jackpotReturn();
    assert.ok(r.lines <= 0.4 - JACKPOT_SHARE + 1e-12, `${r.lines}`);
    assert.ok(r.lines >= 0.379, `${r.lines}`);
    assert.equal(expectedReturn('jackpot'), r.lines + JACKPOT_SHARE);
    const rnd = seeded(9);
    let sum = 0;
    for (let i = 0; i < 100_000; i++) sum += playMega(rnd).multiplier;
    assert.ok(Math.abs(sum / 100_000 - r.lines) < 0.01, `simülasyon ${sum / 100_000}`);
  });

  test('havuzun karşılaması gereken çarpan her çizgi kazancının üstünde', () => {
    assert.equal(maxMultiplier('jackpot'), MEGA_MAX);
    const rnd = seeded(3);
    for (let i = 0; i < 20_000; i++) assert.ok(playMega(rnd).multiplier <= MEGA_MAX);
    assert.equal(LINES.length, 10);
  });
});

describe('Olympus Slot', () => {
  const grid = (cells: OSym[], orbs: number[] = []): OCell[][] => {
    let o = 0;
    const flat = Array.from({ length: CELLS }, (_, i) => {
      const sym = cells[i] ?? (['blue', 'green', 'gold', 'purple', 'red', 'goblet', 'ring'] as OSym[])[i % 7];
      return sym === 'orb' ? { sym, orb: orbs[o++] } : { sym };
    });
    return Array.from({ length: 6 }, (_, c) => flat.slice(c * 5, c * 5 + 5));
  };

  test('8+ aynı sembol ekranın her yerinde öder; küreler toplanıp çarpar', () => {
    assert.equal(symbolPay('crown', 7), 0);
    assert.equal(symbolPay('crown', 8), 10);
    assert.equal(symbolPay('crown', 12), 50);
    const crowns = Array<OSym>(8).fill('crown');
    // Filler: 22 cells of 7 symbols, at most 4 of each, so only the crowns pay.
    assert.equal(evaluateGrid(grid(crowns), false).pay, 10);
    const withOrbs = evaluateGrid(grid([...crowns, 'orb', 'orb'], [2, 5]), false);
    assert.equal(withOrbs.orbs, 7);
    assert.equal(withOrbs.pay, 70);
    assert.equal(evaluateGrid(grid(['orb'], [10]), false).pay, 0, 'kazanç yoksa küre ödemez');
  });

  test('4+ Zeus öder ve bedava dönüş verir; bedava dönüşte Zeus ödemez', () => {
    assert.equal(scatterPay(3), 0);
    assert.equal(scatterPay(4), 3);
    assert.equal(scatterPay(9), 100);
    const zeus = Array<OSym>(4).fill('zeus');
    assert.equal(evaluateGrid(grid(zeus), false).pay, 3);
    assert.equal(evaluateGrid(grid(zeus), true).pay, 0);
    const rnd = seeded(11);
    for (let i = 0; i < 3_000; i++) {
      const r = playOlympus(rnd);
      assert.equal(r.free.length, r.base.scatters >= 4 ? FREE_SPINS : 0);
      assert.ok(r.multiplier <= OLYMPUS_MAX);
    }
  });

  test('beklenen geri ödeme %40’ı aşmaz; simülasyon hesapla uyuşur', () => {
    const r = olympusReturn();
    assert.ok(r.total <= 0.4 + 1e-12, `${r.total}`);
    assert.ok(r.total >= 0.399, `${r.total}`);
    const rnd = seeded(21);
    const n = 200_000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += playOlympus(rnd).multiplier;
    assert.ok(Math.abs(sum / n - r.total) < 0.02, `simülasyon ${sum / n} / hesap ${r.total}`);
    assert.ok(outcomeOf('olympus', '', seeded(2)).olympus);
  });
});

describe('Balık Avı', () => {
  test('her balıkta beklenen geri ödeme tam %40; büyük balık daha zor yakalanır', () => {
    for (const f of FISH) assert.ok(Math.abs(fishReturn(f) - 0.4) < 1e-12, f.id);
    assert.equal(shootFish(FISH[0], FISH_HIT - 1).caught, true);
    assert.equal(shootFish(FISH[0], FISH_HIT).caught, false);
    const big = FISH[FISH.length - 1];
    assert.ok(FISH_HIT / fishDraw(big) < FISH_HIT / fishDraw(FISH[0]));
    assert.equal(maxMultiplier('fish', big.id), big.mult);
  });
});

describe('JACKPOT fonu', () => {
  let wallet = 0;
  let game = 0;
  beforeEach(() => {
    resetGames();
    wallet = 10_000;
    game = 0;
    setGameDeps({
      wealthLevel: () => 5,
      coins: () => wallet,
      spend: (n) => (wallet >= n ? ((wallet -= n), true) : false),
      credit: (n) => void (wallet += n),
      gameCoins: () => game,
      spendGame: (n) => (game >= n ? ((game -= n), true) : false),
      creditGame: (n) => void (game += n),
    });
  });
  afterEach(() => mock.restoreAll());

  test('her bahsin %2’si havuzdan JACKPOT’a geçer', () => {
    mock.method(Math, 'random', () => 0.5);
    const before = getGames().bank;
    playCasino('jackpot', 100, '', { from: 'profile' }, 'req-jp-1');
    const b = getGames().bank;
    assert.equal(b.jackpot, JACKPOT_SEED + 2);
    assert.equal(b.house, before.house + 60);
  });

  test('beş 77 bahis / en yüksek bahis kadar JACKPOT öder', () => {
    // Every reel stops where 77 is on the middle row.
    const stops = [0, 1, 2, 3, 4].map((r) => stopFor(r, 'wild', 1));
    let i = 0;
    mock.method(Math, 'random', () => (stops[i++ % 5] + 0.5) / STRIPS[0].length);
    const r = playCasino('jackpot', 100, '', { from: 'profile' }, 'req-jp-2');
    assert.ok(r.ok);
    const fund = JACKPOT_SEED + 2;
    const won = Math.floor((fund * 100) / 200);
    assert.ok(r.row.payout >= won);
    assert.equal(getGames().bank.jackpot, fund - won);
    assert.match(r.row.detail, /JACKPOT/);
  });
});
