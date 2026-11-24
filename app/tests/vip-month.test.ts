/// <reference types="node" />
// VIP aylık değerlendirme as the app shows it (lib/vip-month): the owners' keep and next-level table follows the
// level points, the server's month is read defensively, the card says what the month needs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SVIP_LEVELS } from '@/data/status';
import { demoVipMonth, keepTable, monthLines, parseVipMonth } from '@/lib/vip-month';

const levels = SVIP_LEVELS.map((l) => ({ level: l.level, xp: l.xp, name: `VIP ${l.level}` }));
const date = (iso: string) => iso.slice(0, 10);

describe('VIP aylık koruma (uygulama)', () => {
  test('koruma ve sonraki seviye tablosu sahiplerin tablosu', () => {
    const t = keepTable(levels);
    assert.deepEqual(
      t.map((r) => [r.level, r.keep, r.next]),
      [
        [1, 25_000, 37_500],
        [2, 37_500, 62_500],
        [3, 62_500, 75_000],
        [4, 75_000, 175_000],
        [5, 175_000, 375_000],
        [6, 375_000, 1_250_000],
        [7, 1_250_000, 3_000_000],
        [8, 3_000_000, 5_500_000],
        [9, 5_500_000, 9_500_000],
        [10, 9_500_000, null],
      ],
    );
  });

  test('sunucunun cevabı okunur; bozuk cevap kartı gizler', () => {
    const raw = { active: true, level: 2, periodLevel: 2, first: false, periodStart: '2026-12-01T00:00:00Z', evalAt: '2026-12-31T21:00:00.000Z', points: 10_000, keep: 37_500, kept: false, misses: 1, next: { level: 3, need: 62_500 }, extension: { offered: false, price: 0, days: 7, bought: false } };
    const m = parseVipMonth(raw);
    assert.ok(m);
    assert.deepEqual([m.level, m.keep, m.misses, m.next, m.extension?.days], [2, 37_500, 1, { level: 3, need: 62_500 }, 7]);
    for (const bad of [null, 'x', {}, { ...raw, active: 'yes' }, { ...raw, level: -1 }, { ...raw, points: 1.5 }]) assert.equal(parseVipMonth(bad), null, JSON.stringify(bad));
    const lines = monthLines(m, date);
    assert.match(lines[0], /VIP 2 seviyesini korumak için 2026-12-31 tarihine kadar 27\.500 puan daha yükle/);
    assert.match(lines[1], /bu ay da tutmazsa VIP statün tamamen sıfırlanır/);
    assert.match(lines[2], /VIP 3 için 62\.500 puan daha/);
  });

  test('ilk ay ve yükselen ay; demo ayı', () => {
    const first = parseVipMonth({ active: true, level: 1, periodLevel: 0, first: true, evalAt: '2026-12-31T21:00:00Z', points: 30_000, keep: 0, kept: true, misses: 0, next: { level: 2, need: 32_500 }, extension: null })!;
    assert.match(monthLines(first, date)[0], /ilk ay: bu ay değerlendirilmez/);
    const up = parseVipMonth({ active: true, level: 3, periodLevel: 2, first: false, evalAt: '2026-12-31T21:00:00Z', points: 62_500, keep: 37_500, kept: true, misses: 0, next: { level: 4, need: 75_000 }, extension: null })!;
    assert.match(monthLines(up, date)[0], /VIP 2 seviyesinden VIP 3 seviyesine yükseldin/);
    const demo = demoVipMonth(3, 130_000, levels);
    assert.deepEqual([demo.active, demo.keep, demo.next], [true, 62_500, { level: 4, need: 70_000 }]);
  });
});
