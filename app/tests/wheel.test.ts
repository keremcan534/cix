/// <reference types="node" />
// Rüzgâr Gülü: the app shows the server's tiers, slices and odds (server/api/wheel-rules.mjs). If one side changes
// without the other, the odds table would promise prizes the server doesn't pay.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WHEEL_COUNTS,
  WHEEL_JACKPOT_SEED_SPINS,
  WHEEL_JACKPOT_SHARE_MILLI,
  WHEEL_SLICES,
  WHEEL_TIERS,
  WHEEL_WEIGHT_TOTAL,
  jackpotSeed,
  playSpins,
  sliceAt,
  sliceChance,
  sliceLabel,
} from '@/data/wheel';
import { countsForWealth } from '@/data/wealth';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/wheel-rules.mjs';

describe('Rüzgâr Gülü uygulamada sunucuyla aynı', () => {
  test('alanlar, çevirme sayıları, dilimler ve JACKPOT fonu', () => {
    assert.deepEqual(WHEEL_TIERS, server.TIERS);
    assert.deepEqual([...WHEEL_COUNTS], server.COUNTS);
    assert.deepEqual(WHEEL_SLICES, server.SLICES);
    assert.equal(WHEEL_WEIGHT_TOTAL, server.WEIGHT_TOTAL);
    assert.equal(WHEEL_JACKPOT_SHARE_MILLI, server.JACKPOT_SHARE_MILLI);
    assert.equal(WHEEL_JACKPOT_SEED_SPINS, server.JACKPOT_SEED_SPINS);
  });

  test('aynı çekilişler aynı sonucu verir', () => {
    for (const draw of [0, 373_399, 373_400, 600_000, 845_100, 999_999]) assert.equal(sliceAt(draw), server.sliceAt(draw), `çekiliş ${draw}`);
    const draws = [5, 400_000, 999_900, 538_000, 845_000, 846_000, 999_999];
    for (const tier of Object.keys(WHEEL_TIERS) as (keyof typeof WHEEL_TIERS)[]) {
      let i = 0;
      let j = 0;
      const app = playSpins(tier, draws.length, jackpotSeed(tier), () => draws[i++]);
      const srv = server.playSpins(tier, draws.length, server.jackpotSeed(tier), () => draws[j++]);
      assert.deepEqual(app, srv, tier);
    }
  });
});

describe('Rüzgâr Gülü yazıları', () => {
  test('dilim etiketi ve şans', () => {
    assert.equal(sliceLabel(0), '×0,1');
    assert.equal(sliceLabel(11), '×100');
    assert.equal(sliceLabel(WHEEL_SLICES.findIndex((s) => s.milli === null)), 'JACKPOT');
    assert.equal(sliceChance(0), '%37,34');
    assert.equal(sliceChance(11), '%0,015');
  });

  test('çevirme harcaması Cömertlik puanı saymaz', () => {
    assert.equal(countsForWealth('Rüzgâr Gülü · tur (Klasik ×10)'), false);
    // Rows from before the tiers were renamed (Kıyı, Açık Deniz, Derin Okyanus) read the same.
    assert.equal(countsForWealth('Rüzgâr Gülü · tur (Kıyı ×10)'), false);
  });
});
