/// <reference types="node" />
// Tayfa has no server yet, so a live build must never charge or credit coins for it on the phone: founding a
// tayfa, a tayfa gift and a chest all refuse before touching the balance. The demo build keeps working.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { KABILE_CHESTS, KABILE_CREATE_COST, createKabile, findKabile, openKabileChest, payKabileGift, tayfaAvailable } from '@/data/kabile';

const spy = <T,>(answer: T) => {
  const calls: [number, string | undefined][] = [];
  const fn = (amount: number, reason?: string) => {
    calls.push([amount, reason]);
    return answer;
  };
  return { fn, calls };
};

describe('Tayfa canlı sürümde jeton oynatmaz', () => {
  test('canlıda kapalı, demoda açık', () => {
    assert.equal(tayfaAvailable(true), false);
    assert.equal(tayfaAvailable(false), true);
  });

  test('canlıda tayfa kurmak jeton almaz, tayfa oluşmaz', () => {
    const spend = spy(true);
    assert.equal(createKabile('Deneme', spend.fn, true), 'off');
    assert.deepEqual(spend.calls, []);
  });

  test('demoda tayfa kurmak ücreti alır; jeton yetmezse kurulmaz', () => {
    const spend = spy(true);
    const made = createKabile('Gece', spend.fn, false);
    assert.ok(typeof made === 'object');
    assert.equal(spend.calls[0][0], KABILE_CREATE_COST);
    assert.equal(findKabile(made.id)?.name, 'Gece');
    const broke = spy(false);
    assert.equal(createKabile('Boş', broke.fn, false), 'coins');
  });

  test('canlıda tayfa hediyesi jeton almaz', () => {
    const spend = spy(true);
    assert.equal(payKabileGift(100, 'Tayfa sohbeti hediyesi: Gül', spend.fn, true), 'off');
    assert.deepEqual(spend.calls, []);
    assert.equal(payKabileGift(100, 'x', spy(true).fn, false), 'ok');
    assert.equal(payKabileGift(100, 'x', spy(false).fn, false), 'coins');
  });

  test('canlıda sandık jeton vermez; demoda bir kez verir', () => {
    const chest = KABILE_CHESTS[0];
    const live = spy(undefined);
    assert.equal(openKabileChest(chest.id, live.fn, true), null);
    assert.deepEqual(live.calls, []);
    const demo = spy(undefined);
    assert.equal(openKabileChest(chest.id, demo.fn, false)?.coins, chest.reward.coins);
    assert.equal(openKabileChest(chest.id, demo.fn, false), null);
    assert.deepEqual(
      demo.calls.map((c) => c[0]),
      [chest.reward.coins],
    );
  });
});
