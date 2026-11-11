/// <reference types="node" />
// Oyun Salonu: a live build's rounds are the server's (server/api/casino-rules.mjs, casino-slots.mjs), and the screens
// replay them with the app's engines and show the app's catalog, paytables and rules. If one side changes without the
// other, a screen would draw a round the server didn't play, or promise prizes and stakes the server doesn't pay.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CASINO_GAMES, MIN_STAKE } from '@/data/games';
import { BOARDS } from '@/lib/board-games';
import { PICKS, maxMultiplier, outcomeOf, type CasinoId } from '@/lib/casino-odds';
import { DRAW as ROCKET_DRAW, ROCKET_TARGETS } from '@/lib/crash-rocket';
import { BRIGHTNESS, CARGO, CELL_WEIGHTS, FENER_MAX, ROW_PAIRS, STORM_SPINS, STORM_TRIGGER } from '@/lib/fener-slot';
import { FISH, FISH_HIT } from '@/lib/fish-hunt';
import { JACKPOT_SEEDS, POOL_SEED } from '@/lib/games';
import { TREE_PAYS, TREE_STRIPS } from '@/lib/gold-tree';
import { stripsOf } from '@/lib/line-slot';
import { bigChange, valueText } from '@/lib/live-settings-format';
import { SLOT_CONFIGS } from '@/lib/slot-configs';
import { LANES, LANE_NAME, TARGETS } from '@/lib/bilye/board';
import { BILYE_MAX, BILYE_TENTHS, BILYE_TOTAL, BILYE_VARIANTS } from '@/lib/bilye/rules';
import { WEIGHTS } from '@/lib/bilye/table';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as bilye from '../../server/api/casino-bilye.mjs';
import * as bilyeTable from '../../server/api/bilye-table.mjs';
import * as rules from '../../server/api/casino-rules.mjs';
import * as slots from '../../server/api/casino-slots.mjs';
import * as registry from '../../server/api/live-registry.mjs';

const serverIds = rules.GAMES.map((g) => g.id);

describe('Oyun Salonu kataloğu sunucuyla aynı', () => {
  test('sunucu demodaki açık oyunların hepsini, aynı sırayla, aynı ad ve bahislerle oynar', () => {
    const active = CASINO_GAMES.filter((g) => g.active);
    assert.deepEqual(serverIds, active.map((g) => g.id));
    for (const g of active) {
      const s = rules.gameById(g.id)!;
      assert.equal(s.name, g.name, g.id);
      assert.deepEqual([...s.bets], g.bets, g.id);
      assert.equal(rules.DAILY_ROUNDS * rules.topStake(s), g.dailyLimit, g.id);
      assert.equal(g.minWealth, 2, 'sunucu Lv.2 kapısını uygular');
    }
    assert.equal(rules.MIN_STAKE, MIN_STAKE);
    // The demo's switched-off games are never offered by the server.
    for (const g of CASINO_GAMES.filter((x) => !x.active)) assert.equal(rules.gameById(g.id), undefined, g.id);
  });

  test('havuz, JACKPOT tohumları ve kasa payı aynı', () => {
    assert.equal(rules.POOL_SEED, POOL_SEED);
    assert.deepEqual(rules.JACKPOT_SEEDS, JACKPOT_SEEDS);
    assert.equal(rules.HOUSE_SHARE, 0.6);
    for (const id of serverIds) {
      for (const pick of PICKS[id as CasinoId]) assert.equal(rules.maxMultiplier(id, pick), maxMultiplier(id as CasinoId, pick), `${id}/${pick}`);
      assert.deepEqual(rules.PICKS[id], PICKS[id as CasinoId], id);
    }
  });

  test('oyunların verileri aynı: makaralar, ödeme tabloları, balıklar, roket, ağaç, tahtalar, fener', () => {
    for (const [id, c] of Object.entries(SLOT_CONFIGS)) {
      assert.deepEqual(slots.SLOT_CONFIGS[id], c, id);
      assert.deepEqual(slots.stripsOf(slots.SLOT_CONFIGS[id]), stripsOf(c), id);
    }
    assert.deepEqual(rules.FISH, FISH);
    assert.equal(rules.FISH_HIT, FISH_HIT);
    assert.deepEqual(rules.ROCKET_TARGETS, ROCKET_TARGETS);
    assert.equal(rules.ROCKET_DRAW, ROCKET_DRAW);
    assert.deepEqual(rules.TREE_STRIPS, TREE_STRIPS);
    assert.deepEqual(
      rules.TREE_PAYS.map((p) => [p.name, p.pay]),
      TREE_PAYS.map((p) => [p.name, p.pay]),
    );
    assert.deepEqual(rules.BOARDS, BOARDS);
    assert.deepEqual([slots.CELL_WEIGHTS, slots.CARGO, slots.BRIGHTNESS, slots.ROW_PAIRS], [CELL_WEIGHTS, CARGO, BRIGHTNESS, ROW_PAIRS]);
    assert.deepEqual([slots.STORM_TRIGGER, slots.STORM_SPINS, slots.FENER_MAX], [STORM_TRIGGER, STORM_SPINS, FENER_MAX]);
  });

  test('Bilye Şelalesi: sunucunun tablosu uygulamanın tahtasından (scripts/bilye-table.ts yeniden çalıştırılmalı)', () => {
    assert.deepEqual(bilyeTable.LANES, [...LANES]);
    assert.deepEqual(bilyeTable.LANE_NAME, LANE_NAME);
    assert.deepEqual(bilyeTable.TARGET_NAMES, TARGETS.map((t) => t.name));
    assert.deepEqual(bilyeTable.TENTHS, [...BILYE_TENTHS]);
    assert.deepEqual(bilyeTable.WEIGHTS, WEIGHTS);
    assert.deepEqual([bilye.BILYE_TOTAL, bilye.BILYE_VARIANTS, bilye.BILYE_MAX], [BILYE_TOTAL, BILYE_VARIANTS, BILYE_MAX]);
  });
});

describe('Aynı çekilişler aynı turu verir', () => {
  /** A seeded draw sequence (rnd(n) → 0…n−1), the same for both sides. */
  const drawsFrom = (seed: number) => {
    let x = seed;
    return (n: number) => ((x = (x * 1103515245 + 12345) % 2 ** 31), x % n);
  };
  test('her oyun ve seçim, 300 tur', () => {
    for (const id of serverIds) {
      const picks = PICKS[id as CasinoId];
      for (let i = 0; i < 300; i++) {
        const pick = picks[i % picks.length];
        const app = outcomeOf(id as CasinoId, pick, drawsFrom(i * 7919 + id.length));
        const srv = rules.outcomeOf(id, pick, drawsFrom(i * 7919 + id.length));
        assert.deepEqual(srv, app, `${id}/${pick}/${i}`);
      }
    }
  });

  test('uç çekilişler: hep ilk, hep son', () => {
    for (const id of serverIds) {
      for (const pick of PICKS[id as CasinoId]) {
        for (const draw of [() => 0, (n: number) => n - 1]) assert.deepEqual(rules.outcomeOf(id, pick, draw), outcomeOf(id as CasinoId, pick, draw), `${id}/${pick}`);
      }
    }
  });
});

describe('Canlı ayarlar paneli Oyun Salonu’nu sunucu gibi okur', () => {
  test('ikinci onay ve değerlerin yazısı', () => {
    for (const [before, after] of [
      [40, 81],
      [40, 80],
      [40, 1],
    ])
      assert.equal(bigChange('casino_daily_rounds', before, after), registry.isBig('casino_daily_rounds', before, after), `${before} → ${after}`);
    assert.equal(bigChange('casino_max_bet', 25_000, 250), registry.isBig('casino_max_bet', 25_000, 250));
    assert.equal(valueText('casino_off', ['fish', 'neon'], { names: { game: (id) => rules.gameById(id)!.name } }), 'Kapalı: Mercan Avı, Neon Bulvar');
    assert.equal(valueText('casino_off', []), 'Hepsi açık');
    assert.equal(valueText('casino_max_bet', 25_000), '25.000 jeton');
    assert.equal(valueText('casino_daily_rounds', 40), 'En yüksek bahisle 40 tur');
    assert.deepEqual(registry.REGISTRY.casino_off.bounds.options, serverIds);
  });
});
