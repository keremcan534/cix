/// <reference types="node" />
// Bilye Şelalesi (lib/bilye): the board, the simulation, the odds table and the path the screen shows. The table
// (lib/bilye/table, written by scripts/bilye-table.ts) must still match the board and the physics: every recorded
// path has to land where the table says, or the screen would fly the ball somewhere the round didn't end.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { LANES, TARGETS } from '@/lib/bilye/board';
import { bilyePath } from '@/lib/bilye/path';
import { fly } from '@/lib/bilye/physics';
import { BILYE_MAX, BILYE_TENTHS, BILYE_TOTAL, BILYE_VARIANTS, bilyeChances, bilyeDetail, bilyeReturn, bilyeTarget, playBilye } from '@/lib/bilye/rules';
import { COUNTS, SEEDS, WEIGHTS } from '@/lib/bilye/table';

describe('Bilye Şelalesi tablosu', () => {
  test('kayıtlı her yol tablonun söylediği hedefe iner (tahta ve fizik değişmedi)', () => {
    for (const lane of LANES) {
      assert.equal(SEEDS[lane].length, TARGETS.length);
      SEEDS[lane].forEach((seeds, target) => {
        assert.ok(seeds.length >= 10, `${lane}/${target}: yol az`);
        for (const seed of seeds) assert.equal(fly(lane, seed, false).target, target, `${lane}/${target}/${seed}`);
      });
    }
  });

  test('aynı atış her seferinde aynı yolu çizer', () => {
    for (const lane of LANES) {
      const a = fly(lane, 4242);
      const b = fly(lane, 4242);
      assert.deepEqual(a, b);
      assert.ok(a.points.length > 100 && a.hits.length > 3, 'gerçek bir uçuş');
    }
  });

  test('her atış gücü bahsin en çok %40’ını geri öder; ağırlıklar tam', () => {
    for (const lane of LANES) {
      assert.equal(WEIGHTS[lane].reduce((a, b) => a + b, 0), BILYE_TOTAL, lane);
      const r = bilyeReturn(lane);
      assert.ok(r <= 0.4 && r > 0.3995, `${lane}: ${r}`);
      // Every target can come up, the rare cups included.
      for (const w of WEIGHTS[lane]) assert.ok(w > 0, lane);
      assert.ok(Math.abs(bilyeChances(lane).reduce((a, b) => a + b, 0) - 1) < 1e-12);
    }
    assert.equal(BILYE_MAX, 20);
    assert.deepEqual(BILYE_TENTHS, TARGETS.map((t) => Math.round(t.mult * 10)));
  });

  test('olasılıklar tahtanın kendisinden: ödeyen hedeflerin payı simülasyondakiyle orantılı', () => {
    for (const lane of LANES) {
      const counts = COUNTS[lane];
      const flown = counts.reduce((a, b) => a + b, 0);
      // The scale that brings the board's own return to 40 %.
      const natural = counts.reduce((a, n, k) => a + n * BILYE_TENTHS[k], 0) / (10 * flown);
      const scale = 0.4 / natural;
      counts.forEach((n, k) => {
        if (!BILYE_TENTHS[k]) return;
        const want = (n / flown) * scale * BILYE_TOTAL;
        assert.ok(Math.abs(WEIGHTS[lane][k] - want) <= 1, `${lane}/${k}`);
      });
    }
  });

  test('Altın kupa nadir, alttaki cepler sık', () => {
    for (const lane of LANES) {
      const c = bilyeChances(lane);
      const altin = TARGETS.findIndex((t) => t.name.startsWith('Altın'));
      assert.ok(c[altin] < 0.01, `${lane}: Altın ${c[altin]}`);
      const pockets = TARGETS.reduce((a, t, k) => a + (t.kind === 'pocket' ? c[k] : 0), 0);
      assert.ok(pockets > 0.8, `${lane}: cepler ${pockets}`);
    }
  });
});

describe('Bilye Şelalesi turu', () => {
  test('çekiliş hedefi ağırlıklara göre seçer: sınırlar', () => {
    for (const lane of LANES) {
      const w = WEIGHTS[lane];
      let at = 0;
      w.forEach((x, k) => {
        assert.equal(bilyeTarget(lane, at), k);
        assert.equal(bilyeTarget(lane, at + x - 1), k);
        at += x;
      });
      assert.equal(bilyeTarget(lane, BILYE_TOTAL - 1), w.length - 1);
    }
  });

  test('tur önce hedefi, sonra yolu çeker; ödeme hedefin katı', () => {
    const draws: number[] = [];
    const r = playBilye('orta', (n) => (draws.push(n), n - 1));
    assert.deepEqual(draws, [BILYE_TOTAL, BILYE_VARIANTS]);
    assert.equal(r.target, TARGETS.length - 1);
    assert.equal(r.multiplier, TARGETS[r.target].mult);
    assert.match(bilyeDetail(r), /^Orta atış · Zümrüt kupa · 2x$/);
    assert.match(bilyeDetail({ lane: 'hafif', target: 3, variant: 0 }), /^Hafif atış · 4\. cep · boş$/);
    assert.match(bilyeDetail({ lane: 'guclu', target: 0, variant: 0 }), /^Güçlü atış · 1\. cep · 0,5x$/);
  });

  test('ekrandaki yol çekilen hedefe iner, kanaldan başlar', () => {
    for (const lane of LANES) {
      for (let target = 0; target < TARGETS.length; target++) {
        for (const variant of [0, 7, BILYE_VARIANTS - 1]) {
          const p = bilyePath({ lane, target, variant });
          assert.equal(p.target, target, `${lane}/${target}/${variant}`);
          assert.ok(p.points.length % 2 === 0 && p.lead > 0);
          assert.ok(p.hits.every((h) => h.frame >= p.lead && h.frame < p.points.length / 2));
        }
      }
    }
  });
});
