/// <reference types="node" />
// Yayıncı haftalık bonusu (owners, 24 Nov 2026): the tiers are the server's (server/api/host-bonus-rules.mjs), the
// tier is the highest one reached, and the server's answer is read defensively (lib/host-bonus).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { HOST_BONUS_TIERS, demoHostBonus, nextTierOf, parseHostBonus, tierOf } from '@/lib/host-bonus';
import * as server from '../../server/api/host-bonus-rules.mjs';

describe('Yayıncı haftalık bonusu', () => {
  test('baremler sunucununkiyle aynı (sahiplerin tablosu)', () => {
    assert.deepEqual(HOST_BONUS_TIERS, server.HOST_BONUS_TIERS);
    assert.equal(HOST_BONUS_TIERS.length, 12);
    assert.deepEqual(HOST_BONUS_TIERS.at(-1), { from: 5_000_000, bonus: 2_500_000 });
  });

  test('eşiği tamamlayamayan bir önceki baremin bonusunu alır', () => {
    const cases: [number, number][] = [
      [0, 0],
      [9_999, 0],
      [10_000, 5_000],
      [19_999, 5_000],
      [20_000, 10_000],
      [139_999, 50_000],
      [140_000, 70_000],
      [4_999_999, 1_000_000],
      [5_000_000, 2_500_000],
      [10_000_000, 2_500_000],
      [50_000_000, 2_500_000],
    ];
    for (const [earned, bonus] of cases) {
      assert.equal(tierOf(earned)?.bonus ?? 0, bonus, String(earned));
      assert.equal(server.tierOf(earned)?.bonus ?? 0, bonus, `sunucu ${earned}`);
    }
    assert.deepEqual(nextTierOf(25_000), { from: 40_000, bonus: 20_000, left: 15_000 });
    assert.equal(nextTierOf(5_000_000), null);
  });

  test('sunucunun cevabı okunur; bozuk cevap kartı gizler', () => {
    const ok = { on: true, week: '2026-11-23', eligible: true, kind: 'agency', earned: 25_000, tier: { from: 20_000, bonus: 10_000 }, next: { from: 40_000, bonus: 20_000, left: 15_000 }, tiers: [], last: { week: '2026-11-16', bonus: 5_000, earned: 12_000, reversed: false } };
    assert.deepEqual(parseHostBonus(ok), { on: true, eligible: true, kind: 'agency', earned: 25_000, tier: { from: 20_000, bonus: 10_000 }, next: { from: 40_000, bonus: 20_000, left: 15_000 }, last: { week: '2026-11-16', bonus: 5_000, reversed: false } });
    assert.deepEqual(parseHostBonus({ ...ok, kind: 'management', tier: null, next: null, last: null }), { on: true, eligible: true, kind: 'management', earned: 25_000, tier: null, next: null, last: null });
    for (const bad of [null, 'x', {}, { ...ok, on: 'evet' }, { ...ok, earned: -1 }, { ...ok, earned: 1.5 }, { ...ok, eligible: undefined }]) assert.equal(parseHostBonus(bad), null, JSON.stringify(bad));
    assert.equal(parseHostBonus({ ...ok, tier: { from: 'x' } })?.tier, null, 'bozuk barem yok sayılır');
  });

  test('demo kendi haftasını sayar', () => {
    assert.deepEqual(demoHostBonus(45_000, true, false), { on: true, eligible: true, kind: 'agency', earned: 45_000, tier: { from: 40_000, bonus: 20_000 }, next: { from: 70_000, bonus: 35_000, left: 25_000 }, last: null });
    assert.deepEqual([demoHostBonus(45_000, false, true).eligible, demoHostBonus(45_000, false, true).kind], [true, 'management'], 'yönetim yayıncısı');
    assert.equal(demoHostBonus(45_000, false, false).eligible, false, 'ilk günlerinde, ajanssız');
  });
});
