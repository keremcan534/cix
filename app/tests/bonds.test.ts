/// <reference types="node" />
// Bağlar: the app shows the server's bond kinds, prices, limits and level steps (server/api/bond-rules.mjs).
// If one side changes without the other, the app would show a price the server doesn't charge.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BOND_KINDS, BOND_LEVELS, BOND_REWARDS, JOINT_WINDOW_MS, bondLevel, bondDays, bubbleBondOf, demoBondsOf, demoRoomBonds, jointEntries, micLinkOf, nextLevelAt, topBond, type RoomBond } from '@/data/bonds';
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
    for (const score of [0, 9, 10, 29, 30, 50, 1999, 2000, 2999, 3000, 44999, 45000, 99999]) assert.equal(bondLevel(score), server.levelOf(score), `puan ${score}`);
    assert.equal(nextLevelAt(3), 60);
    assert.equal(nextLevelAt(10), 3000, 'Lv20’ye kadar');
    assert.equal(nextLevelAt(20), null);
    assert.equal(BOND_LEVELS.length, 20);
  });
});

describe('Bağlar: Lv20 puanları ve eski APK', () => {
  test('uygulama her bağ isteğinde lv=20 der: sunucu gerçek puanı ve sonraki basamağı verir', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../src/lib/api.ts'), 'utf8');
    const calls = [...src.matchAll(/'(GET|POST)', [`'](\/api\/bonds[^'`]*)/g)].map((m) => ({ route: `${m[1]} ${m[2].replace(/\?.*$/, '')}`, path: m[2] }));
    assert.deepEqual(calls.map((c) => c.route).sort(), ['GET /api/bonds', 'GET /api/bonds/requests', 'POST /api/bonds/among', 'POST /api/bonds/end', 'POST /api/bonds/privacy', 'POST /api/bonds/request', 'POST /api/bonds/respond', 'POST /api/bonds/withdraw']);
    assert.match(src, /const BOND_LV = 'lv=20';/);
    // among and privacy answer no points; every other one asks for the real ones (the list's query is built with it).
    for (const c of calls) {
      if (/\/(among|privacy)$/.test(c.route)) continue;
      if (c.path === '/api/bonds?${q}') assert.match(src, /offset > 0 \? `offset=\$\{offset\}` : '', BOND_LV\]/);
      else assert.ok(c.path.endsWith('?${BOND_LV}'), c.path);
    }
  });
  test('eski APK’nin çubuğu (kendi 10 basamağıyla) seviyenin içindeki gerçek ilerlemeyi gösterir', () => {
    // The f9671d9 APK: from = its BOND_LEVELS[level - 1] ?? 0; bar = (score - from) / (nextLevelAt - from).
    const OLD = [0, 10, 30, 60, 100, 200, 400, 700, 1200, 2000];
    const oldBar = (score: number, level: number, next: number | null) => (next ? (score - (OLD[level - 1] ?? 0)) / (next - (OLD[level - 1] ?? 0)) : 1);
    for (const score of [0, 15, 1999, 2000, 2999, 3000, 3200, 12_345, 44_999, 45_000, 99_999]) {
      const level = server.levelOf(score);
      const next = server.LEVELS[level] ?? null;
      const shown = server.oldAppPoints(score, level, server.LEVELS);
      const real = next ? (score - server.LEVELS[level - 1]) / (next - server.LEVELS[level - 1]) : 1;
      assert.ok(Math.abs(oldBar(shown.score, level, shown.nextLevelAt) - real) < 1e-9, `puan ${score}`);
      // Its text: the points still needed for the next level stay true; up to Lv10 nothing moves.
      if (next) assert.equal(shown.nextLevelAt! - shown.score, next - score);
      if (level <= 10) assert.deepEqual(shown, { score, nextLevelAt: next });
    }
    // Lv11, 3.200 points (the review's case): 13 %, not 71 %; the text says 200 / 1.500, Lv.12 için 1.300.
    assert.deepEqual(server.oldAppPoints(3200, 11, server.LEVELS), { score: 200, nextLevelAt: 1500 });
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
  test('mikrofon işareti Lv1’den, iki yönde', () => {
    assert.equal(micLinkOf(list, 'u1', 'me')?.kind, 'cift');
    assert.equal(micLinkOf(list, 'u2', 'u3')?.level, 3, 'Lv3 de çizilir (Güncelleme 7)');
    assert.equal(micLinkOf([{ a: 'x', b: 'y', kind: 'kanka', level: 1 }], 'y', 'x')?.level, 1);
    assert.equal(micLinkOf(list, 'u2', 'u9'), null, 'bağ yoksa yok');
    assert.equal(micLinkOf(list, 'me', null), null);
    assert.equal(micLinkOf(list, 'me', 'me'), null);
  });
  test('özel balon Lv10, Çift önce', () => {
    assert.equal(bubbleBondOf(list, 'u4')?.kind, 'cift');
    assert.equal(bubbleBondOf(list, 'u5')?.kind, 'kardes');
    assert.equal(bubbleBondOf(list, 'me'), null, 'Lv8 balon yok');
  });
  test('birlikte giriş: yalnız aynı anda gelen çift, benden önce içeride olan değil, her çift bir kez', () => {
    const T = 1_000_000;
    const s = 1000;
    // I came in at T; my Çift (u1) 5 s before me: we came in together. u4 and u5 came in together a minute before me.
    const arrivals = new Map([
      ['me', T],
      ['u1', T - 5 * s],
      ['u4', T - 60 * s],
      ['u5', T - 58 * s],
    ]);
    const first = jointEntries(list, new Set(['me', 'u1', 'u4', 'u5']), arrivals, T, null);
    assert.deepEqual(first.show.map((r) => r.b), ['u1'], 'u4-u5 benden önce odadaydı');
    // u9 joins u4 (in the room for a while): u9's own entrance only, no joint one.
    arrivals.set('u9', T + 30 * s);
    const later = jointEntries(list, new Set(['me', 'u1', 'u4', 'u5', 'u9']), arrivals, T, first.state);
    assert.deepEqual(later.show, [], 'eşi zaten odadaydı');
    // u4 leaves and comes back with u9 (who also left): the two came in together.
    const broken = jointEntries(list, new Set(['me', 'u1', 'u5']), arrivals, T, later.state);
    arrivals.set('u4', T + 300 * s);
    arrivals.set('u9', T + 312 * s);
    const together = jointEntries(list, new Set(['me', 'u1', 'u4', 'u5', 'u9']), arrivals, T, broken.state);
    assert.deepEqual(together.show.map((r) => `${r.a}-${r.b}`), ['u4-u9']);
    assert.deepEqual(jointEntries(list, new Set(['me', 'u1', 'u4', 'u5', 'u9']), arrivals, T, together.state).show, [], 'bir kez');
    // Once per visit, however often the two come in together again.
    const out = jointEntries(list, new Set(['me', 'u1', 'u5']), arrivals, T, together.state);
    arrivals.set('u4', T + 900 * s);
    arrivals.set('u9', T + 901 * s);
    assert.deepEqual(jointEntries(list, new Set(['me', 'u1', 'u4', 'u5', 'u9']), arrivals, T, out.state).show, [], 'aynı ziyarette ikinci kez yok');
    // More than JOINT_WINDOW_MS apart is not "together"; someone not known to have come in (here before me) never is.
    const pair: RoomBond[] = [{ a: 'u7', b: 'u8', kind: 'cift', level: 9 }];
    const apart = new Map([['u7', T + 10 * s], ['u8', T + 10 * s + JOINT_WINDOW_MS + 1]]);
    assert.deepEqual(jointEntries(pair, new Set(['me', 'u7', 'u8']), apart, T, null).show, []);
    assert.deepEqual(jointEntries(pair, new Set(['me', 'u7', 'u8']), new Map([['u8', T + s]]), T, null).show, []);
    assert.equal(jointEntries(pair, new Set(['me', 'u7', 'u8']), new Map([['u7', T], ['u8', T + JOINT_WINDOW_MS]]), T, null).show.length, 1);
    // A pair already in the room that only now reaches Lv8 is not an entrance.
    const low = jointEntries([{ a: 'u2', b: 'u3', kind: 'kanka', level: 7 }], new Set(['u2', 'u3']), new Map([['u2', T + s], ['u3', T + s]]), T, null);
    assert.deepEqual(low.show, []);
    const grown = jointEntries([{ a: 'u2', b: 'u3', kind: 'kanka', level: 8 }], new Set(['u2', 'u3']), new Map([['u2', T + s], ['u3', T + s]]), T, low.state);
    assert.deepEqual(grown.show, []);
  });
  test('demo odası bağları her seferinde aynı', () => {
    const now = Date.parse('2026-11-04T12:00:00Z');
    const r = demoRoomBonds(['me', 'u3'], now);
    assert.ok(r.some((x) => x.a === 'me' && x.b === 'u1' && x.kind === 'cift'));
    assert.deepEqual(r, demoRoomBonds(['me', 'u3'], now));
  });
});
