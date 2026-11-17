// The size of a win's celebration (lib/win-tier): by stakes paid, never by the amount; coins stay inside the stage.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BIG_WIN_X, WIN_SHOW, WIN_TITLE, coinPaths, winStageAt, winTierOf } from '@/lib/win-tier';

describe('Kazanç kademesi', () => {
  test('bahsin katına göre; tutara göre değil', () => {
    assert.equal(winTierOf(0, 1000), null);
    assert.equal(winTierOf(-5, 1000), null);
    assert.equal(winTierOf(400, 1000), null, 'bahsin altında kalan ödeme kazanç değildir: kutlanmaz');
    assert.equal(winTierOf(1000, 1000), null, 'bahsi geri almak da kazanç değildir');
    assert.equal(winTierOf(1001, 1000), 'small');
    assert.equal(winTierOf(1000 * BIG_WIN_X - 1, 1000), 'small');
    assert.equal(winTierOf(1000 * BIG_WIN_X, 1000), 'big');
    assert.equal(winTierOf(250 * 15, 250), 'mega');
    assert.equal(winTierOf(250 * 40, 250), 'epic');
    assert.equal(winTierOf(25_000 * 2, 25_000), 'small', 'büyük bahsin 2 katı büyük kazanç sayılmaz');
    assert.equal(winTierOf(300, 1000, true), 'jackpot');
    assert.equal(winTierOf(500, 0), 'small', 'bahis bilinmiyorsa küçük');
  });
  test('büyüdükçe daha uzun ve daha çok jeton; küçük kazanç sıradaki turu bekletmez', () => {
    const order = ['small', 'big', 'mega', 'epic', 'jackpot'] as const;
    for (let i = 1; i < order.length; i++) {
      assert.ok(WIN_SHOW[order[i]].ms > WIN_SHOW[order[i - 1]].ms);
      assert.ok(WIN_SHOW[order[i]].coins > WIN_SHOW[order[i - 1]].coins);
    }
    assert.ok(WIN_SHOW.small.ms <= 1000);
    assert.deepEqual(Object.keys(WIN_TITLE).sort(), ['big', 'epic', 'jackpot', 'mega']);
  });
  test('jetonlar sahnenin içinde kalır', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const kind of ['fountain', 'rain'] as const) {
      const ps = coinPaths(60, kind, rnd);
      assert.equal(ps.length, 60);
      for (const p of ps) {
        assert.ok(p.x0 >= 0 && p.x0 <= 1 && p.x1 >= 0 && p.x1 <= 1, `${kind} x`);
        assert.ok(p.delay >= 0 && p.delay < 0.7, `${kind} delay`);
        assert.ok(p.rise >= 0 && p.rise <= 1);
        assert.ok(p.size >= 16 && p.size <= 32);
      }
    }
    assert.deepEqual(coinPaths(0, 'rain'), []);
  });
  test('büyük kazançta başlık sayılan tutarla yükselir: Büyük → Dev → Efsane, kazancın kendi kademesini geçmez', () => {
    const bet = 1000;
    // A 60-stake win counting up.
    assert.equal(winStageAt(0, bet, 'epic'), 'big', 'sayım başlarken Büyük Kazanç');
    assert.equal(winStageAt(bet * 3, bet, 'epic'), 'big');
    assert.equal(winStageAt(bet * 15, bet, 'epic'), 'mega');
    assert.equal(winStageAt(bet * 39, bet, 'epic'), 'mega');
    assert.equal(winStageAt(bet * 40, bet, 'epic'), 'epic');
    // Never past the win's own tier, never down to "small", and a JACKPOT or a small win keeps its own.
    assert.equal(winStageAt(bet * 25, bet, 'big'), 'big', 'kazancın kendi kademesini geçmez');
    assert.equal(winStageAt(bet * 60, bet, 'mega'), 'mega');
    assert.equal(winStageAt(bet * 2, bet, 'mega'), 'big');
    assert.equal(winStageAt(bet * 2, bet, 'jackpot'), 'jackpot');
    assert.equal(winStageAt(bet * 2, bet, 'small'), 'small');
  });
  test('patlama: jetonlar ortadan her yöne saçılır, hemen çıkar', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const ps = coinPaths(40, 'burst', rnd);
    assert.equal(ps.length, 40);
    const quarters = new Set<number>();
    for (const p of ps) {
      assert.equal(p.x0, 0.5, 'ortadan çıkar');
      assert.ok(p.delay >= 0 && p.delay < 0.1, 'hemen');
      assert.ok(p.dy !== undefined);
      const dx = p.x1 - 0.5;
      const dy = p.dy!;
      assert.ok(Math.hypot(dx, dy / 0.8) >= 0.55 - 1e-9, 'sahnenin kenarına kadar uçar');
      quarters.add((dx >= 0 ? 1 : 0) + (dy >= 0 ? 2 : 0));
    }
    assert.equal(quarters.size, 4, 'dört yöne de');
  });
});
