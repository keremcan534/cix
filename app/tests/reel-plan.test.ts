// How the slot reels move (lib/reel-plan): same speed, later reels longer, a seamless join into the settling.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { REEL_PACE, SETTLE_BACK, TEASE_EXTRA, fillerOf, reelRun, reelStopAt, teasedReels } from '@/lib/reel-plan';

describe('Makaraların dönüşü', () => {
  test('makaralar sırayla durur; turbo çok daha kısa sürer', () => {
    for (const cell of [50, 56, 76]) {
      const stops = [0, 1, 2, 3, 4].map((r) => reelStopAt(r, cell, 3, REEL_PACE.normal));
      for (let i = 1; i < stops.length; i++) assert.ok(stops[i] - stops[i - 1] >= 120 && stops[i] - stops[i - 1] <= 320, `${cell}: ${stops}`);
      assert.ok(stops[0] >= 900 && stops[4] <= 2600, `${cell}: ${stops}`);
      const turbo = [0, 1, 2, 3, 4].map((r) => reelStopAt(r, cell, 3, REEL_PACE.turbo));
      assert.ok(turbo[4] <= 800, `turbo ${turbo}`);
      assert.ok(turbo[4] > turbo[0]);
    }
  });
  test('yavaşlama tam hızda başlar: iki parçanın birleştiği yerde hız değişmez', () => {
    const cell = 56;
    const p = REEL_PACE.normal;
    const r = reelRun(2, cell, 3, p);
    // The settling curve starts at (back + 3) × its average speed.
    const settleStart = ((SETTLE_BACK + 3) * p.settle * cell) / r.settleMs;
    assert.ok(Math.abs(settleStart - p.speed) < 0.01, `${settleStart} ≠ ${p.speed}`);
    assert.ok(Math.abs(((r.filler + 3) * cell - p.settle * cell) / r.runMs - p.speed) < 0.01);
  });
  test('beklenen makara daha uzun döner; ikincisi daha da uzun', () => {
    const plain = reelRun(4, 50, 3, REEL_PACE.normal);
    const once = reelRun(4, 50, 3, REEL_PACE.normal, 1);
    const twice = reelRun(4, 50, 3, REEL_PACE.normal, 2);
    assert.equal(once.filler - plain.filler, TEASE_EXTRA);
    assert.equal(twice.filler - once.filler, TEASE_EXTRA);
    assert.ok(once.runMs - plain.runMs > 500);
    assert.equal(once.settleMs, plain.settleMs);
  });
  test('beklenti: önceki makaralarda iki scatter varsa sonrakiler sırayla beklenir', () => {
    const g = (cols: string[]) => cols.map((c) => c.split(''));
    assert.deepEqual(teasedReels(g(['Sab', 'abS', 'abc', 'abc', 'abc']), { scatter: 'S' }), [0, 0, 1, 2, 3]);
    assert.deepEqual(teasedReels(g(['Sab', 'abc', 'abS', 'abc', 'abc']), { scatter: 'S' }), [0, 0, 0, 1, 2]);
    assert.deepEqual(teasedReels(g(['SSb', 'abc', 'abc', 'abc', 'abc']), { scatter: 'S' }), [0, 0, 1, 2, 3], 'aynı makarada iki tane de sayılır');
    assert.deepEqual(teasedReels(g(['abc', 'abc', 'abc', 'Sbc', 'Sbc']), { scatter: 'S' }), [0, 0, 0, 0, 0], 'geç gelenler kimseyi bekletmez');
    assert.deepEqual(teasedReels(g(['Sab', 'Sab', 'abc']), {}), [0, 0, 0]);
  });
  test('beklenti: ilk üç makarada da wild varsa (wild çizgisi büyük ödülse) son ikisi beklenir', () => {
    const g = (cols: string[]) => cols.map((c) => c.split(''));
    const o = { wild: 'W', wildLine: true };
    assert.deepEqual(teasedReels(g(['Wab', 'aWb', 'abW', 'abc', 'abc']), o), [0, 0, 0, 1, 0], 'dördüncüde wild yoksa beşinci beklenmez');
    assert.deepEqual(teasedReels(g(['Wab', 'aWb', 'abW', 'Wbc', 'abc']), o), [0, 0, 0, 1, 2]);
    assert.deepEqual(teasedReels(g(['Wab', 'abc', 'abW', 'Wbc', 'abc']), o), [0, 0, 0, 0, 0]);
    assert.deepEqual(teasedReels(g(['Wab', 'aWb', 'abW', 'Wbc', 'abc']), { wild: 'W' }), [0, 0, 0, 0, 0], 'wild çizgisi ödül değilse beklenmez');
  });
  test('uçup geçen semboller şeritten sırayla alınır', () => {
    assert.deepEqual(fillerOf(['a', 'b', 'c'], 2, 5), ['c', 'a', 'b', 'c', 'a']);
    assert.deepEqual(fillerOf(['a', 'b', 'c'], -1, 2), ['c', 'a']);
    assert.deepEqual(fillerOf(['a'], 0, 0), []);
  });
});
