/// <reference types="node" />
// Altın Kasa (5×3 slot): line rules, Wild and Kasa, free spins, and the house rule. The expected return is computed
// exactly from the strips; a long seeded simulation of whole rounds must land on the same number.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { expectedReturn, maxMultiplier, outcomeOf } from '@/lib/casino-odds';
import { FORTUNE_MAX, FREE_MULT, FREE_SPINS, LINES, PAYTABLE, SCATTER, STRIPS, fortuneReturn, linePay, playRound, reelWindow, spin, type Sym } from '@/lib/fortune-slot';

/** Small deterministic generator, so the simulation is the same on every run. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 2 ** 32) * n);
  };
}
/** Draw function that returns the given stops in order. */
const fixed = (stops: number[]) => {
  let i = 0;
  return () => stops[i++ % stops.length];
};
/** Finds a stop on a reel whose window shows the symbol on the given row. */
const stopFor = (reel: number, sym: Sym, row: number) => {
  const n = STRIPS[reel].length;
  const at = STRIPS[reel].findIndex((s, i) => STRIPS[reel][(i + row) % n] === sym && s !== undefined);
  assert.ok(at >= 0, `${sym} makara ${reel + 1}'de yok`);
  return at;
};

describe('Altın Kasa: çizgi kuralları', () => {
  test('soldan 3, 4, 5 aynı sembol ödeme tablosu kadar öder; 2 aynı ödemez', () => {
    assert.equal(linePay(['crown', 'crown', 'crown', 'coin', 'coin'])?.pay, PAYTABLE.crown![0]);
    assert.equal(linePay(['crown', 'crown', 'crown', 'crown', 'coin'])?.pay, PAYTABLE.crown![1]);
    assert.equal(linePay(['crown', 'crown', 'crown', 'crown', 'crown'])?.pay, PAYTABLE.crown![2]);
    assert.equal(linePay(['crown', 'crown', 'coin', 'crown', 'crown']), null);
    assert.equal(linePay(['coin', 'crown', 'crown', 'crown', 'crown']), null, 'soldan başlamalı');
  });

  test('Servet (Wild) yerine geçer, Kasa geçmez ve çizgi başlatmaz', () => {
    assert.deepEqual(linePay(['yacht', 'wild', 'wild', 'yacht', 'coin']), { sym: 'yacht', count: 4, pay: PAYTABLE.yacht![1] });
    assert.equal(linePay(['yacht', 'vault', 'yacht', 'yacht', 'yacht']), null);
    assert.equal(linePay(['vault', 'vault', 'vault', 'vault', 'vault']), null);
  });

  test('Wild 1. ve 5. makarada yok; her makarada en az bir Kasa var', () => {
    assert.ok(!STRIPS[0].includes('wild') && !STRIPS[4].includes('wild'));
    STRIPS.forEach((s, r) => assert.ok(s.includes(SCATTER), `makara ${r + 1}`));
    assert.equal(LINES.length, 10);
  });

  test('pencere makaranın üç ardışık sembolüdür (dairesel)', () => {
    const n = STRIPS[0].length;
    assert.deepEqual(reelWindow([n - 1, 0, 0, 0, 0])[0], [STRIPS[0][n - 1], STRIPS[0][0], STRIPS[0][1]]);
  });
});

describe('Altın Kasa: bedava dönüş', () => {
  test('3 Kasa → 8 bedava dönüş, ödemeleri 2 katı; daha azı tetiklemez', () => {
    const three = [stopFor(0, SCATTER, 0), stopFor(1, SCATTER, 1), stopFor(2, SCATTER, 2), 0, 0];
    assert.ok(spin(three).scatters >= 3);
    const round = playRound(fixed(three));
    assert.equal(round.free.length, FREE_SPINS);
    const base = round.base.pay;
    const freePay = round.free.reduce((n, s) => n + s.pay, 0);
    assert.equal(round.multiplier, (base + FREE_MULT * freePay) / LINES.length);

    const two = [stopFor(0, SCATTER, 0), stopFor(1, SCATTER, 1), stopFor(2, 'coin', 0), stopFor(3, 'coin', 0), stopFor(4, 'coin', 0)];
    if (spin(two).scatters < 3) assert.equal(playRound(fixed(two)).free.length, 0);
  });
});

describe('Altın Kasa: kasa kuralı', () => {
  test('beklenen geri ödeme %40’ı aşmaz ve en fazla 0,1 puan altında', () => {
    const r = fortuneReturn();
    assert.ok(r.total <= 0.4 + 1e-12, `${r.total}`);
    assert.ok(r.total >= 0.399, `${r.total}`);
    assert.equal(expectedReturn('fortune'), r.total);
  });

  test('uzun simülasyon hesapla uyuşuyor', () => {
    const rnd = seeded(77);
    const n = 200_000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += playRound(rnd).multiplier;
    assert.ok(Math.abs(sum / n - fortuneReturn().total) < 0.01, `simülasyon ${sum / n}`);
  });

  test('havuzun karşılaması gereken en yüksek çarpan gerçek en yüksek kazancın üstünde', () => {
    assert.equal(maxMultiplier('fortune'), FORTUNE_MAX);
    const rnd = seeded(5);
    for (let i = 0; i < 20_000; i++) assert.ok(playRound(rnd).multiplier <= FORTUNE_MAX);
  });

  test('tur sonucu platform biçiminde gelir', () => {
    const o = outcomeOf('fortune', '', seeded(1));
    assert.ok(o.fortune);
    assert.equal(o.display.length, 15);
    assert.equal(o.multiplier, o.fortune!.multiplier);
  });
});
