/// <reference types="node" />
// Bağlar: the app shows the server's bond kinds, prices, limits and level steps (server/api/bond-rules.mjs).
// If one side changes without the other, the app would show a price the server doesn't charge.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOND_KINDS, BOND_LEVELS, BOND_REWARDS, bondLevel, bondDays, bubbleBondOf, demoBondsOf, demoRoomBonds, jointEntries, micLinkOf, nextLevelAt, topBond, type RoomBond } from '@/data/bonds';
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

describe('Bağlar odada', () => {
  const list: RoomBond[] = [
    { a: 'me', b: 'u1', kind: 'cift', level: 8 },
    { a: 'u2', b: 'u3', kind: 'kanka', level: 3 },
    { a: 'u4', b: 'u5', kind: 'kardes', level: 10 },
    { a: 'u4', b: 'u9', kind: 'cift', level: 10 },
  ];
  test('mikrofon çizgisi Lv4 ve üstü, iki yönde', () => {
    assert.equal(micLinkOf(list, 'u1', 'me')?.kind, 'cift');
    assert.equal(micLinkOf(list, 'u2', 'u3'), null, 'Lv3 çizgi yok');
    assert.equal(micLinkOf(list, 'me', null), null);
    assert.equal(micLinkOf(list, 'me', 'me'), null);
  });
  test('özel balon Lv10, Çift önce', () => {
    assert.equal(bubbleBondOf(list, 'u4')?.kind, 'cift');
    assert.equal(bubbleBondOf(list, 'u5')?.kind, 'kardes');
    assert.equal(bubbleBondOf(list, 'me'), null, 'Lv8 balon yok');
  });
  test('birlikte giriş: ilk açılışta yalnızca benimki, sonra yeni gelen çift, her çift bir kez', () => {
    const first = jointEntries(list, new Set(['me', 'u1', 'u4', 'u5']), null);
    assert.deepEqual(first.show.map((r) => r.b), ['u1'], 'u4-u5 benden önce odadaydı');
    const later = jointEntries(list, new Set(['me', 'u1', 'u4', 'u5', 'u9']), first.state);
    assert.deepEqual(later.show.map((r) => `${r.a}-${r.b}`), ['u4-u9']);
    assert.deepEqual(jointEntries(list, new Set(['me', 'u1', 'u4', 'u5', 'u9']), later.state).show, []);
    // A pair already in the room that only now reaches Lv8 is not an entrance.
    const grown = jointEntries([{ a: 'u2', b: 'u3', kind: 'kanka', level: 8 }], new Set(['u2', 'u3']), { seen: new Set(), present: new Set(['u2', 'u3']) });
    assert.deepEqual(grown.show, []);
  });
  test('demo odası bağları her seferinde aynı', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const r = demoRoomBonds(['me', 'u3'], now);
    assert.ok(r.some((x) => x.a === 'me' && x.b === 'u1' && x.kind === 'cift'));
    assert.deepEqual(r, demoRoomBonds(['me', 'u3'], now));
  });
});
