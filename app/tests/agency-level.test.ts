/// <reference types="node" />
// Ajans seviyeleri as the app reads them (lib/agency-level): the server's answer is read defensively, a level the
// owners keep out of the app has no name, and the card's sentences say what the week needs.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { levelLines, levelText, parseAgencyLevel } from '@/lib/agency-level';
import { WEEKLY_LEVELS_DEFAULT, levelFor } from '../../server/api/agency-level-rules.mjs';

const server = {
  week: '2026-11-23',
  weekLabel: '23–29 Kasım 2026',
  base: 350_000,
  active: 18,
  minActive: 20,
  activeUsd: 10,
  activeDiamonds: 10_000,
  level: { key: 'gonul_bagi', name: null, rate: 0.35, shown: false },
  reason: 'active',
  reached: { name: 'Bronz', rate: 0.6 },
  next: { name: 'Gümüş', rate: 0.7, from: 500_000, left: 150_000 },
  isNew: false,
  newUntil: null,
  last: { week: '2026-11-16', name: null, rate: 0.5, base: 250_000, active: 21, reason: 'threshold' },
};
const date = (iso: string) => iso.slice(0, 10);

describe('Ajans seviyeleri (uygulama)', () => {
  test('sahiplerin tablosu: eşik, 20 aktif yayıncı, yeni ajans %50', () => {
    const at = (base: number, active = 20, isNew = false) => levelFor({ base, active, isNew }).level.key;
    assert.deepEqual([at(0), at(199_999), at(200_000), at(299_999), at(300_000), at(749_999), at(750_000), at(1_499_999), at(1_500_000), at(50_000_000)], [
      'gonul_bagi',
      'gonul_bagi',
      'baslangic',
      'baslangic',
      'bronz',
      'gumus',
      'altin',
      'platin',
      'elmas',
      'elmas',
    ]);
    assert.equal(at(1_000_000, 19), 'gonul_bagi', '20 aktif yayıncı yoksa 0. seviye');
    assert.equal(at(0, 0, true), 'baslangic', 'yeni ajans sabit Başlangıç');
    assert.deepEqual(
      WEEKLY_LEVELS_DEFAULT.levels.map((l) => [l.rate, l.shown]),
      [
        [0.35, false],
        [0.5, false],
        [0.6, true],
        [0.7, true],
        [0.8, true],
        [0.9, true],
        [1, true],
      ],
    );
  });

  test('sunucunun cevabı okunur; bozuk cevap kartı gizler', () => {
    const v = parseAgencyLevel(server);
    assert.ok(v);
    assert.deepEqual([v.base, v.active, v.level, v.reason, v.reached, v.next?.left, v.last?.rate], [350_000, 18, { name: null, rate: 0.35 }, 'active', { name: 'Bronz', rate: 0.6 }, 150_000, 0.5]);
    for (const bad of [null, 'x', {}, { ...server, base: -1 }, { ...server, level: { rate: 2 } }, { ...server, week: 5 }]) assert.equal(parseAgencyLevel(bad), null, JSON.stringify(bad));
    assert.equal(parseAgencyLevel({ ...server, next: { name: 'X' } })?.next, null, 'bozuk sonraki seviye yok sayılır');
  });

  test('kartın cümleleri: adı gösterilmeyen seviye yalnız oranla', () => {
    const v = parseAgencyLevel(server)!;
    assert.equal(levelText(v.level), '%35');
    assert.equal(levelText({ name: 'Bronz', rate: 0.6 }), 'Bronz · %60');
    const lines = levelLines(v, date);
    assert.match(lines[0], /350\.000 elmas/);
    assert.match(lines[1], /Bronz \(%60\) için elmas eşiğine ulaştın; 20 aktif yayıncı şartı tutunca .* \(2 yayıncı daha\)/);
    assert.match(lines[2], /150\.000 elmas daha kazanılırsa Gümüş \(%70\)/);
    assert.match(lines.at(-1)!, /Geçen hafta: %50/);
    const fresh = levelLines(parseAgencyLevel({ ...server, isNew: true, reason: 'new', newUntil: '2026-12-20T10:00:00Z', level: { name: null, rate: 0.5 } })!, date);
    assert.match(fresh[0], /Yeni ajans: 2026-12-20 tarihine kadar komisyonun sabit %50/);
  });
});
