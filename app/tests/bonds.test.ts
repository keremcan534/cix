/// <reference types="node" />
// Bağlar: the app shows the server's bond kinds, prices, limits and level steps (server/api/bond-rules.mjs).
// If one side changes without the other, the app would show a price the server doesn't charge.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOND_KINDS, BOND_LEVELS, BOND_REWARDS, bondLevel, bondDays, demoBondsOf, nextLevelAt, topBond } from '@/data/bonds';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/bond-rules.mjs';

describe('Bağlar uygulamada sunucuyla aynı', () => {
  test('türler, bağ hediyesi, fiyat ve sınır', () => {
    const app = Object.fromEntries(Object.entries(BOND_KINDS).map(([id, k]) => [id, { label: k.label, gift: k.gift, price: k.price, max: k.max }]));
    assert.deepEqual(app, server.KINDS);
  });
  test('seviye basamakları ve ödüller', () => {
    assert.deepEqual(BOND_LEVELS, server.LEVELS);
    assert.deepEqual(
      BOND_REWARDS.map((r) => [r.level, r.id]),
      (server.REWARDS as { level: number; key: string }[]).map((r) => [r.level, r.key]),
    );
    for (const score of [0, 9, 10, 29, 30, 50, 1999, 2000, 99999]) assert.equal(bondLevel(score), server.levelOf(score), `puan ${score}`);
    assert.equal(nextLevelAt(3), 60);
    assert.equal(nextLevelAt(10), null);
  });
});

describe('Bağlar yardımcıları', () => {
  test('gün sayısı ilk gün 1', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    assert.equal(bondDays(null, now), 0);
    assert.equal(bondDays('2026-11-04T11:00:00Z', now), 1);
    assert.equal(bondDays('2026-11-01T12:00:00Z', now), 3);
  });
  test('en yüksek bağ yalnızca etkin olanlardan', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const list = demoBondsOf('me', now);
    assert.equal(topBond(list)?.kind, 'cift');
    assert.equal(topBond(list.map((b) => ({ ...b, status: 'pending' as const }))), null);
    assert.deepEqual(demoBondsOf('u3', now), demoBondsOf('u3', now), 'aynı kişi her seferinde aynı');
  });
});
