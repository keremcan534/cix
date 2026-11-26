// Yörünge's multiplier and Kaç's payout are drawn on the UI thread (fx/climb-label) from worklets that cannot lean on
// toLocaleString: they must still say exactly what lib/rocket-live's mulText and payoutOf say.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { climbText, groupTr } from '@/components/games/fx/climb-format';
import { mulText, payoutOf } from '@/lib/rocket-live';

describe('climb label words', () => {
  test('thousands with a dot', () => {
    assert.equal(groupTr(0), '0');
    assert.equal(groupTr(999), '999');
    assert.equal(groupTr(1000), '1.000');
    assert.equal(groupTr(1234567), '1.234.567');
  });

  test('the multiplier matches mulText', () => {
    for (const x of [100, 101, 109, 110, 152, 215, 999, 1000, 12345, 100000, 123456789]) assert.equal(climbText(x, { kind: 'mult' }), mulText(x), `x=${x}`);
  });

  test("Kaç's payout matches payoutOf", () => {
    for (const [fuel, x] of [[100, 100], [100, 152], [1000, 215], [50000, 1234], [7, 333]]) {
      assert.equal(climbText(x, { kind: 'pay', fuel, prefix: 'KAÇ · ' }), `KAÇ · ${payoutOf(fuel, x).toLocaleString('tr-TR')}`, `fuel=${fuel} x=${x}`);
    }
  });
});
