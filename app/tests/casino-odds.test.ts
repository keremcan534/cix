/// <reference types="node" />
// House rule for coin games: of all coins played, 60 % stays with the house and 40 % is paid back as random
// winnings. Every game and pick is checked over all of its outcomes, not by sampling.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CASINO_HOUSE_SHARE, CASINO_RETURN_SHARE, DRAWS, PICKS, WHEEL, duelMultiplier, evaluate, expectedReturn, maxMultiplier, type CasinoId } from '@/lib/casino-odds';

const GAMES = Object.keys(PICKS) as CasinoId[];
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe('Kasa kuralı: %60 kasa, %40 dağıtım', () => {
  test('pay oranları toplamı 1', () => {
    assert.equal(CASINO_HOUSE_SHARE + CASINO_RETURN_SHARE, 1);
  });

  test('her oyun ve her seçimde beklenen geri ödeme %40 (Dragon Tiger kenar seçimleri ve Altın Kasa en fazla 0,1 puan altında)', () => {
    for (const g of GAMES)
      for (const p of PICKS[g]) {
        const r = expectedReturn(g, p);
        assert.ok(r <= CASINO_RETURN_SHARE + 1e-12, `${g}/${p}: ${r} %40'ı aşıyor`);
        assert.ok(close(r, CASINO_RETURN_SHARE, 0.001), `${g}/${p}: ${r}`);
      }
    assert.equal(expectedReturn('wheel'), 0.4);
    assert.equal(expectedReturn('slot'), 0.4);
    assert.ok(close(expectedReturn('dice', 'big'), 0.4, 1e-12));
    assert.ok(close(expectedReturn('dice', 'small'), 0.4, 1e-12));
    assert.ok(close(expectedReturn('dragon', 'tie'), 0.4, 1e-12));
  });

  test('oda içi Zar Düellosu da %40', () => {
    assert.ok(close(expectedReturn('duel'), 0.4, 1e-12));
    assert.equal(duelMultiplier(6, 3), 2.4);
    assert.equal(duelMultiplier(5, 3), 0, '2 fark kazandırmaz');
    assert.equal(duelMultiplier(3, 3), 0, 'beraberlik kasaya');
  });

  test('çark ağırlıkları 1000 eder; seçimin olmadığı oyunlarda tek seçim var', () => {
    assert.equal(WHEEL.reduce((n, s) => n + s.weight, 0), 1000);
    assert.deepEqual(PICKS.wheel, ['']);
    assert.deepEqual(PICKS.slot, ['']);
  });

  test('sonuçlar: zar 5–9 kasa, slot iki 7 kazandırmaz, Dragon Tiger fark 4’ten azsa kasa', () => {
    assert.equal(evaluate('dice', 'big', [3, 4]).multiplier, 0, '4+5=9');
    assert.equal(evaluate('dice', 'big', [4, 4]).multiplier, 2.4, '5+5=10');
    assert.equal(evaluate('dice', 'small', [0, 2]).multiplier, 2.4, '1+3=4');
    assert.equal(evaluate('slot', '', [0, 0, 1]).multiplier, 0);
    assert.equal(evaluate('slot', '', [0, 0, 0]).multiplier, 30);
    assert.equal(evaluate('slot', '', [2, 2, 2]).multiplier, 5);
    assert.equal(evaluate('dragon', 'dragon', [5, 2]).multiplier, 0, 'fark 3');
    assert.equal(evaluate('dragon', 'dragon', [6, 2]).multiplier, 1.5, 'fark 4');
    assert.equal(evaluate('dragon', 'tiger', [6, 2]).multiplier, 0);
    assert.equal(evaluate('dragon', 'tie', [7, 7]).multiplier, 5.2);
  });

  test('havuzun karşılaması gereken en yüksek çarpan', () => {
    assert.equal(maxMultiplier('wheel'), 20);
    assert.equal(maxMultiplier('slot'), 30);
    assert.equal(maxMultiplier('dragon', 'tie'), 5.2);
    assert.equal(maxMultiplier('duel'), 2.4);
    assert.deepEqual(DRAWS.dice, [6, 6]);
  });
});
