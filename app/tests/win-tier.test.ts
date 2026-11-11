// The size of a win's celebration (lib/win-tier): by stakes paid, never by the amount; coins stay inside the stage.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BIG_WIN_X, WIN_SHOW, WIN_TITLE, coinPaths, winTierOf } from '@/lib/win-tier';

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
});
