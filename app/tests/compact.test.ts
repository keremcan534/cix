// Big numbers in their short form (güncelleme 6): PK, the room's ranking, gift values. The owner's examples: 1k, 1.1k,
// 10k, 10.12k, 100k, 100.10k (written here 100.1k: trailing zeros go), 1m, 1.1m.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { compact, compactFit } from '@/lib/compact';

describe('K, M ve B kısaltması', () => {
  test('sahibin örnekleri', () => {
    assert.equal(compact(1_000), '1k');
    assert.equal(compact(1_100), '1.1k');
    assert.equal(compact(10_000), '10k');
    assert.equal(compact(10_120), '10.12k');
    assert.equal(compact(100_000), '100k');
    assert.equal(compact(100_100), '100.1k');
    assert.equal(compact(1_000_000), '1m');
    assert.equal(compact(1_100_000), '1.1m');
    assert.equal(compact(2_500_000_000), '2.5b');
  });

  test('1.000’in altı olduğu gibi; aşağı yuvarlanır, kimse olduğundan fazla görünmez', () => {
    assert.equal(compact(0), '0');
    assert.equal(compact(7), '7');
    assert.equal(compact(999), '999');
    assert.equal(compact(999.9), '999');
    assert.equal(compact(1_099), '1.09k');
    assert.equal(compact(61_990), '61.99k');
    assert.equal(compact(999_999), '999.99k', '1m’ye yuvarlanmaz');
    assert.equal(compact(999_999_999), '999.99m');
    assert.equal(compact(-1_500), '-1.5k');
    assert.equal(compact(Number.NaN), '0');
  });

  test('ondalık sayısı seçilebilir; dar yerde daha kısa biçim', () => {
    assert.equal(compact(61_990, 1), '61.9k');
    assert.equal(compact(61_990, 0), '61k');
    assert.equal(compactFit(61_990, 6), '61.99k');
    assert.equal(compactFit(61_990, 5), '61.9k');
    assert.equal(compactFit(61_990, 3), '61k');
    assert.equal(compactFit(123_456, 4), '123k');
    assert.equal(compactFit(123_456, 2), '123k', 'en kısa biçimden kısası yok');
  });

  test('ondalıklar kayan noktadan kaymaz', () => {
    for (let v = 1_000; v < 200_000; v += 37) {
      const s = compact(v);
      const n = Math.round(Number(s.slice(0, -1)) * 1_000);
      assert.ok(n <= v && v - n < 10, `${v} → ${s}`);
    }
  });
});
