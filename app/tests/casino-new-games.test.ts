/// <reference types="node" />
// The casino games from the client's reference screens: the payline slots (lib/line-slot + lib/slot-configs), Yıldız
// Avı (stars in the searchlight beam), Balon Avı (one round per shot), the bet boards (Gece Yarısı Çarkı, Lezzet Çarkı, Sihir Destesi),
// Roket (crash) and Bereket Ağacı. Each keeps the house rule; JACKPOT funds are part of the 40 %.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARDS, FOOD_WHEEL, LUCKY77, MAGIC_CARD, boardMaxPayout, boardPayout, boardResult, boardTotal, optionReturn } from '@/lib/board-games';
import { expectedReturn, maxMultiplier, outcomeOf } from '@/lib/casino-odds';
import { DRAW, ROCKET_MAX, ROCKET_TARGETS, crashPoint, rocketReturn } from '@/lib/crash-rocket';
import { FISH, FISH_HIT, fishDraw, fishReturn, shootFish } from '@/lib/fish-hunt';
import { JACKPOT_SEEDS, getGames, playBoard, playCasino, resetGames, setGameDeps } from '@/lib/games';
import { TREE_OPENING, TREE_PAYS, treePay, treeReturn, treeWindow } from '@/lib/gold-tree';
import { linePay, playSlot, slotMax, slotReturn, slotSpin, stripsOf, type SlotConfig } from '@/lib/line-slot';
import { CELLS, COLS, FENER_MAX, ROWS, STORM_SPINS, STORM_TRIGGER, cargoLabel, evaluateBoard, fenerReturn, playFener, type FCell } from '@/lib/fener-slot';
import { MEGA, SLOT_CONFIGS, SPELLBOOK, SUPER777 } from '@/lib/slot-configs';

function seeded(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 2 ** 32) * n);
  };
}
/** Finds a stop on a reel whose window shows the symbol on the given row. */
const stopFor = (c: SlotConfig, reel: number, sym: string, row: number) => {
  const strip = stripsOf(c)[reel];
  const at = strip.findIndex((_, i) => strip[(i + row) % strip.length] === sym);
  assert.ok(at >= 0, `${sym} makara ${reel + 1}'de yok`);
  return at;
};
const deps = (wallet: { n: number }, game: { n: number }) =>
  setGameDeps({
    wealthLevel: () => 5,
    coins: () => wallet.n,
    spend: (n) => (wallet.n >= n ? ((wallet.n -= n), true) : false),
    credit: (n) => void (wallet.n += n),
    gameCoins: () => game.n,
    spendGame: (n) => (game.n >= n ? ((game.n -= n), true) : false),
    creditGame: (n) => void (game.n += n),
  });

// Seeded simulations only cross-check the wiring (playSlot / playFener against the analytic return, which the
// tests check exactly). The default runs are short; `npm run test:sim` (SIM_FULL=1) adds the full-length runs.
const SIM_FULL = { skip: !process.env.SIM_FULL };
const simulateSlots = (n: number, tolerance: number) => {
  for (const c of Object.values(SLOT_CONFIGS)) {
    const r = slotReturn(c);
    const mx = slotMax(c);
    const rnd = seeded(c.id.length * 7);
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const m = playSlot(c, rnd).multiplier;
      sum += m;
      if (m > worst) worst = m;
    }
    assert.ok(worst <= mx, `${c.id} en yüksek kazancı aştı: ${worst} > ${mx}`);
    assert.ok(Math.abs(sum / n - (r.lines + r.scatter)) < tolerance, `${c.id} simülasyon ${sum / n} / hesap ${r.lines + r.scatter}`);
  }
};
const simulateFener = (n: number, tolerance: number) => {
  const r = fenerReturn();
  const rnd = seeded(21);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += playFener(rnd).multiplier;
  assert.ok(Math.abs(sum / n - r.total) < tolerance, `simülasyon ${sum / n} / hesap ${r.total}`);
};

describe('Çizgili slotlar', () => {
  test('Wild her sembolün yerine geçer, 1. makarada da; tamamı Wild olan çizgi JACKPOT', () => {
    assert.deepEqual(linePay(MEGA, ['wild', 'wild', 'seven', 'cherry', 'bell']), { sym: 'seven', count: 3, pay: MEGA.paytable.seven[0] });
    assert.deepEqual(linePay(MEGA, ['cherry', 'wild', 'cherry', 'cherry', 'wild']), { sym: 'cherry', count: 5, pay: MEGA.paytable.cherry[2] });
    assert.equal(linePay(MEGA, ['cherry', 'cherry', 'bell', 'cherry', 'cherry']), null);
    assert.equal(linePay(MEGA, ['wild', 'wild', 'wild', 'wild', 'wild']), 'jackpot');
    const mid = [0, 1, 2, 3, 4].map((r) => stopFor(MEGA, r, 'wild', 1));
    assert.ok(slotSpin(MEGA, mid).jackpotLines.includes(0), 'orta çizgi');
  });

  test('Kızıl Yedi: 3 makara, 5 çizgi, üç aynı sembol', () => {
    assert.equal(SUPER777.lines.length, 5);
    assert.deepEqual(linePay(SUPER777, ['seven', 'seven', 'seven']), { sym: 'seven', count: 3, pay: SUPER777.paytable.seven[0] });
    assert.equal(linePay(SUPER777, ['seven', 'seven', 'cherry']), null);
  });

  test('Büyü Kitabı: kitaplar her yerde öder (3 MINI, 4 MINOR, 5 MAJOR)', () => {
    const stops = [0, 1, 2, 3, 4].map((r) => (r < 4 ? stopFor(SPELLBOOK, r, 'book', 1) : stopFor(SPELLBOOK, r, 'candle', 0)));
    const sp = slotSpin(SPELLBOOK, stops);
    assert.ok(sp.scatters >= 4);
    assert.ok(sp.multiplier >= SPELLBOOK.scatterPays![4]);
  });

  test('her slotun beklenen geri ödemesi %40’ı aşmaz, en fazla 0,1 puan altında; simülasyon hesapla uyuşur', () => {
    for (const c of Object.values(SLOT_CONFIGS)) {
      const r = slotReturn(c);
      assert.ok(r.total <= 0.4 + 1e-12, `${c.id}: ${r.total}`);
      assert.ok(r.total >= 0.399, `${c.id}: ${r.total}`);
      assert.equal(expectedReturn(c.id as never), r.total);
    }
    assert.equal(maxMultiplier('jackpot'), slotMax(MEGA));
    simulateSlots(10_000, 0.05);
  });

  test('tam uzunlukta simülasyon (SIM_FULL=1)', SIM_FULL, () => simulateSlots(60_000, 0.03));
});

describe('Yıldız Avı', () => {
  // A board from a compact map: '.' empty sky, 'k' kuyruklu yıldız, a number = a star worth that many tenths of the stake.
  const board = (rows: (string | number)[][]): FCell[][] =>
    Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => {
        const v = rows[r]?.[c] ?? '.';
        return v === 'k' ? { kind: 'lamp' } : typeof v === 'number' ? { kind: 'ship', cargo: v } : { kind: 'sea' };
      }),
    );

  test('yalnızca ışıktaki sıranın yıldızları öder, parlaklıkla çarpılır', () => {
    const g = board([
      [10, '.', 5],
      ['.', 500],
      [2, 2, 2, 2, 2],
    ]);
    assert.equal(evaluateBoard(g, [0], 1).pay, 1.5);
    assert.equal(evaluateBoard(g, [0], 3).pay, 4.5);
    assert.equal(evaluateBoard(g, [2], 5).pay, 5);
    assert.equal(evaluateBoard(g, [3], 5).pay, 0, 'boş sıra ödemez');
    // Yıldız Yağmuru: two rows at once.
    assert.equal(evaluateBoard(g, [0, 1], 2).pay, 103);
    // Tenths stay integers until the end: 0,1 × 3 is exactly 0,3.
    assert.equal(evaluateBoard(board([[1, 1, 1]]), [0], 1).pay, 0.3);
    assert.equal(cargoLabel(1), '×0,1');
    assert.equal(cargoLabel(500), '×50');
  });

  test('3+ kuyruklu yıldız Yıldız Yağmuru’nu açar; yağmurda iki sıra yanar, parlaklık 1’den 6’ya çıkar', () => {
    assert.equal(evaluateBoard(board([['k', 'k', '.', 'k']]), [0], 1).lamps, 3);
    assert.equal(STORM_TRIGGER, 3);
    const rnd = seeded(11);
    let storms = 0;
    for (let i = 0; i < 20_000; i++) {
      const r = playFener(rnd);
      assert.equal(r.storm.length, r.base.lamps >= STORM_TRIGGER ? STORM_SPINS : 0);
      assert.equal(r.base.lit.length, 1);
      assert.ok(r.base.grid.flat().length === CELLS);
      assert.ok(r.multiplier <= FENER_MAX);
      if (r.storm.length) {
        storms++;
        r.storm.forEach((s, k) => {
          assert.equal(s.brightness, k + 1);
          assert.equal(s.lit.length, 2);
          assert.notEqual(s.lit[0], s.lit[1]);
        });
      }
    }
    assert.ok(storms > 100, `yıldız yağmuru sayısı ${storms}`);
  });

  test('beklenen geri ödeme %40’ı aşmaz; simülasyon hesapla uyuşur', () => {
    const r = fenerReturn();
    assert.ok(r.total <= 0.4 + 1e-12, `${r.total}`);
    assert.ok(r.total >= 0.399, `${r.total}`);
    simulateFener(30_000, 0.06);
    assert.ok(outcomeOf('olympus', '', seeded(2)).fener);
    assert.equal(expectedReturn('olympus'), r.total);
    assert.equal(maxMultiplier('olympus'), FENER_MAX);
  });

  test('tam uzunlukta simülasyon (SIM_FULL=1)', SIM_FULL, () => simulateFener(200_000, 0.02));
});

describe('Balon Avı', () => {
  test('her balonda beklenen geri ödeme tam %40; büyük balon daha zor vurulur', () => {
    for (const f of FISH) assert.ok(Math.abs(fishReturn(f) - 0.4) < 1e-12, f.id);
    assert.equal(shootFish(FISH[0], FISH_HIT - 1).caught, true);
    assert.equal(shootFish(FISH[0], FISH_HIT).caught, false);
    const big = FISH[FISH.length - 1];
    assert.ok(FISH_HIT / fishDraw(big) < FISH_HIT / fishDraw(FISH[0]));
    assert.equal(maxMultiplier('fish', big.id), big.mult);
  });
});

describe('Bahis tahtaları', () => {
  // A failed assertion must not leave Math.random mocked for the tests after it.
  afterEach(() => mock.restoreAll());

  test('her seçenek tek başına tam %40 öder; ağırlıklar doğru', () => {
    for (const b of Object.values(BOARDS)) for (const o of b.options) assert.ok(Math.abs(optionReturn(b, o.id) - 0.4) < 1e-12, `${b.id}/${o.id}`);
    assert.equal(boardTotal(LUCKY77), 20);
    assert.equal(boardTotal(FOOD_WHEEL), 9000);
    assert.equal(boardTotal(MAGIC_CARD), 3000);
  });

  test('Lezzet Çarkı: Salata bütün sebzeleri, Pizza bütün et yemeklerini öder; Boş Tabak kimseyi', () => {
    const salad = FOOD_WHEEL.results.find((r) => r.id === 'salad')!;
    const pizza = FOOD_WHEEL.results.find((r) => r.id === 'pizza')!;
    const empty = FOOD_WHEEL.results.find((r) => r.id === 'empty')!;
    const bets = { tomato: 100, cabbage: 100, crab: 10 };
    assert.equal(boardPayout(FOOD_WHEEL, bets, salad), 1_000);
    assert.equal(boardPayout(FOOD_WHEEL, bets, pizza), 450);
    assert.equal(boardPayout(FOOD_WHEEL, bets, empty), 0);
    assert.equal(boardMaxPayout(FOOD_WHEEL, bets), 1_000);
  });

  test('bir turda birden fazla bahis tek sonuçla ödenir', () => {
    resetGames();
    const wallet = { n: 10_000 };
    const game = { n: 0 };
    deps(wallet, game);
    // Draw 0 of 20 → the 77 slice.
    mock.method(Math, 'random', () => 0);
    const r = playBoard('slot', { seven: 250, apple: 500 }, { from: 'profile' }, 'req-board-1');
    assert.ok(r.ok);
    assert.equal(r.row.bet, 750);
    assert.equal(r.row.payout, 2_000);
    assert.deepEqual([wallet.n, game.n], [9_250, 2_000]);
    assert.equal(boardResult(LUCKY77, 0).id, 'seven');
    assert.equal(playBoard('slot', { seven: 300 }, { from: 'profile' }, 'req-board-2').ok, false, 'fişin katı olmalı');
    assert.equal(playBoard('slot', {}, { from: 'profile' }, 'req-board-3').ok, false, 'boş tur yok');
  });
});

describe('Roket', () => {
  test('patlama noktası: her kaçış çarpanında geri ödeme %40’ı aşmaz', () => {
    for (const t of ROCKET_TARGETS) {
      const r = rocketReturn(t);
      assert.ok(r <= 0.4 + 1e-12 && r >= 0.399, `${t}x: ${r}`);
      assert.equal(expectedReturn('rocket', String(t)), r);
    }
    assert.equal(crashPoint(DRAW - 1), 0, 'en çok çekiliş rampada patlar');
    assert.equal(crashPoint(0), ROCKET_MAX);
    assert.equal(maxMultiplier('rocket', '20'), 20);
  });

  test('kaçışa ulaşırsa bahis × kaçış öder, önce patlarsa ödemez', () => {
    const o = outcomeOf('rocket', '2', () => 0);
    assert.equal(o.multiplier, 2);
    const b = outcomeOf('rocket', '2', () => DRAW - 1);
    assert.equal(b.multiplier, 0);
    assert.equal(b.rocket!.crash, 0);
  });
});

describe('Bereket Ağacı', () => {
  test('kombinasyonlar ve kasa kuralı', () => {
    assert.equal(treePay(['tree', 'tree', 'tree'])!.pay, 188);
    assert.equal(treePay(['tree', 'red', 'blue'])!.pay, 8);
    assert.equal(treePay(['red', 'blue', 'green'])!.pay, 2);
    assert.equal(treePay(['red', 'red', 'red'])!.pay, 58);
    assert.equal(treePay(['blank', 'red', 'red']), null);
    assert.equal(TREE_PAYS.length, 6);
    const r = treeReturn();
    assert.ok(r <= 0.4 + 1e-12 && r >= 0.395, `${r}`);
  });

  test('açılış görüntüsü: her makarada sembol var, orta çizgi kazanç göstermez', () => {
    const grid = treeWindow(TREE_OPENING);
    for (const col of grid) assert.ok(col.some((x) => x !== 'blank'), 'boş makara');
    const middle = grid.map((col) => col[1]);
    assert.equal(treePay(middle), null);
    // Not a jackpot tease either: no tree in view.
    assert.ok(!grid.flat().includes('tree'));
  });
});

describe('JACKPOT fonları', () => {
  const wallet = { n: 0 };
  const game = { n: 0 };
  beforeEach(() => {
    resetGames();
    wallet.n = 10_000;
    game.n = 0;
    deps(wallet, game);
  });
  afterEach(() => mock.restoreAll());

  test('her bahsin %2’si havuzdan oyunun JACKPOT fonuna geçer', () => {
    mock.method(Math, 'random', () => 0.5);
    const before = getGames().bank;
    playCasino('jackpot', 250, '', { from: 'profile' }, 'req-jp-1');
    const b = getGames().bank;
    assert.equal(b.jackpots.jackpot, JACKPOT_SEEDS.jackpot + 5);
    assert.equal(b.jackpots.jungle, JACKPOT_SEEDS.jungle, 'başka oyunun fonu değişmez');
    assert.equal(b.house, before.house + 150);
  });

  test('beş 77 bahis / en yüksek bahis kadar JACKPOT öder', () => {
    // Every reel stops where 77 is on the middle row.
    const stops = [0, 1, 2, 3, 4].map((r) => stopFor(MEGA, r, 'wild', 1));
    const lens = stripsOf(MEGA).map((x) => x.length);
    let i = 0;
    mock.method(Math, 'random', () => {
      const k = i++ % 5;
      return (stops[k] + 0.5) / lens[k];
    });
    const r = playCasino('jackpot', 250, '', { from: 'profile' }, 'req-jp-2');
    assert.ok(r.ok);
    const fund = JACKPOT_SEEDS.jackpot + 5;
    const won = Math.floor((fund * 250) / 25_000);
    assert.ok(r.row.payout >= won);
    assert.equal(getGames().bank.jackpots.jackpot, fund - won);
    assert.match(r.row.detail, /JACKPOT/);
  });
});
