/// <reference types="node" />
// Para çek (lib/withdraw-form): the quick amounts and the pre-filled amount never go below the 50.000-diamond
// minimum or above the balance, so the form never shows a payout the server would refuse.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RULES } from '@/data/rules';
import { suggestedWithdraw, withdrawPresets } from '@/lib/withdraw-form';

const r = DEFAULT_RULES;
const min = r.minWithdrawDiamonds;

describe('Para çek formu', () => {
  test('quick amounts start at the minimum and stop at the balance', () => {
    assert.deepEqual(withdrawPresets(0, r), []);
    assert.deepEqual(withdrawPresets(min - 1, r), []);
    assert.deepEqual(withdrawPresets(min, r), [min]);
    assert.deepEqual(withdrawPresets(min * 3, r), [min, min * 2]);
    assert.deepEqual(withdrawPresets(min * 10, r), [min, min * 2, min * 5]);
    for (const p of withdrawPresets(1e9, r)) assert.ok(p >= min && p <= r.maxWithdrawDiamonds);
  });

  test('a balance below the minimum pre-fills nothing', () => {
    assert.equal(suggestedWithdraw(0, r), 0);
    assert.equal(suggestedWithdraw(min - 1, r), 0);
    assert.equal(suggestedWithdraw(Number.NaN, r), 0);
  });

  test('otherwise the balance in whole thousands, at most one request', () => {
    assert.equal(suggestedWithdraw(min, r), min);
    assert.equal(suggestedWithdraw(73_456, r), 73_000);
    assert.equal(suggestedWithdraw(r.maxWithdrawDiamonds * 3, r), r.maxWithdrawDiamonds);
  });
});
