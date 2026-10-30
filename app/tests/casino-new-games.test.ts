/// <reference types="node" />
// The casino games from the client's reference screens: the payline slots (lib/line-slot + lib/slot-configs), Olympus
// Slot (6×5, pays anywhere), Balık Avı (one round per shot), the bet boards (Lucky 77, Lezzet Çarkı, Büyücü Kartı),
// Roket (crash) and Altın Ağacı. Each keeps the house rule; JACKPOT funds are part of the 40 %.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARDS, FOOD_WHEEL, LUCKY77, MAGIC_CARD, boardMaxPayout, boardPayout, boardResult, boardTotal, optionReturn } from '@/lib/board-games';
import { expectedReturn, maxMultiplier, outcomeOf } from '@/lib/casino-odds';
import { DRAW, ROCKET_MAX, ROCKET_TARGETS, crashPoint, rocketReturn } from '@/lib/crash-rocket';
import { FISH, FISH_HIT, fishDraw, fishReturn, shootFish } from '@/lib/fish-hunt';
import { JACKPOT_SEEDS, getGames, playBoard, playCasino, resetGames, setGameDeps } from '@/lib/games';
import { TREE_PAYS, treePay, treeReturn } from '@/lib/gold-tree';
import { linePay, playSlot, slotMax, slotReturn, slotSpin, stripsOf, type SlotConfig } from '@/lib/line-slot';
import { CELLS, FREE_SPINS, OLYMPUS_MAX, evaluateGrid, olympusReturn, playOlympus, scatterPay, symbolPay, type OCell, type OSym } from '@/lib/olympus-slot';
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

describe('Çizgili slotlar', () => {
  test('Wild her sembolün yerine geçer, 1. makarada da; tamamı Wild olan çizgi JACKPOT', () => {
    assert.deepEqual(linePay(MEGA, ['wild', 'wild', 'seven', 'cherry', 'bell']), { sym: 'seven', count: 3, pay: MEGA.paytable.seven[0] });
    assert.deepEqual(linePay(MEGA, ['cherry', 'wild', 'cherry', 'cherry', 'wild']), { sym: 'cherry', count: 5, pay: MEGA.paytable.cherry[2] });
    assert.equal(linePay(MEGA, ['cherry', 'cherry', 'bell', 'cherry', 'cherry']), null);
    assert.equal(linePay(MEGA, ['wild', 'wild', 'wild', 'wild', 'wild']), 'jackpot');
    const mid = [0, 1, 2, 3, 4].map((r) => stopFor(MEGA, r, 'wild', 1));
    assert.ok(slotSpin(MEGA, mid).jackpotLines.includes(0), 'orta çizgi');
  });

  test('Süper 777: 3 makara, 5 çizgi, üç aynı sembol', () => {
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
      const rnd = seeded(c.id.length * 7);
      const n = 60_000;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const sp = playSlot(c, rnd);
        assert.ok(sp.multiplier <= slotMax(c), `${c.id} en yüksek kazancı aştı`);
        sum += sp.multiplier;
      }
      assert.ok(Math.abs(sum / n - (r.lines + r.scatter)) < 0.03, `${c.id} simülasyon ${sum / n} / hesap ${r.lines + r.scatter}`);
    }
    assert.equal(maxMultiplier('jackpot'), slotMax(MEGA));
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

describe('Bahis tahtaları', () => {
  test('her seçenek tek başına tam %40 öder; ağırlıklar doğru', () => {
    for (const b of Object.values(BOARDS)) for (const o of b.options) assert.ok(Math.abs(optionReturn(b, o.id) - 0.4) < 1e-12, `${b.id}/${o.id}`);
    assert.equal(boardTotal(LUCKY77), 20);
    assert.equal(boardTotal(FOOD_WHEEL), 9000);
    assert.equal(boardTotal(MAGIC_CARD), 3000);
  });

  test('Lezzet Çarkı: Salata bütün sebzeleri, Pizza bütün et ve deniz ürünlerini öder; Boş Tabak kimseyi', () => {
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
    const r = playBoard('slot', { seven: 100, apple: 200 }, { from: 'profile' }, 'req-board-1');
    mock.restoreAll();
    assert.ok(r.ok);
    assert.equal(r.row.bet, 300);
    assert.equal(r.row.payout, 800);
    assert.deepEqual([wallet.n, game.n], [9_700, 800]);
    assert.equal(boardResult(LUCKY77, 0).id, 'seven');
    assert.equal(playBoard('slot', { seven: 150 }, { from: 'profile' }, 'req-board-2').ok, false, 'fişin katı olmalı');
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

describe('Altın Ağacı', () => {
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
    playCasino('jackpot', 100, '', { from: 'profile' }, 'req-jp-1');
    const b = getGames().bank;
    assert.equal(b.jackpots.jackpot, JACKPOT_SEEDS.jackpot + 2);
    assert.equal(b.jackpots.jungle, JACKPOT_SEEDS.jungle, 'başka oyunun fonu değişmez');
    assert.equal(b.house, before.house + 60);
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
    const r = playCasino('jackpot', 100, '', { from: 'profile' }, 'req-jp-2');
    assert.ok(r.ok);
    const fund = JACKPOT_SEEDS.jackpot + 2;
    const won = Math.floor((fund * 100) / 200);
    assert.ok(r.row.payout >= won);
    assert.equal(getGames().bank.jackpots.jackpot, fund - won);
    assert.match(r.row.detail, /JACKPOT/);
  });
});
