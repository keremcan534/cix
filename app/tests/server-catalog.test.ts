/// <reference types="node" />
// The server sets gift prices and pack contents (server/api/catalog.mjs); the app shows them. If one side
// changes without the other, the app would show a price the server doesn't charge. This keeps them equal.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GIFTS } from '@/data/mock';
import { RULES } from '@/data/rules';
import { exchangeOwnDiamonds } from '@/lib/coins-bank';
import { RECHARGE_PACKS, SVIP_LEVELS } from '@/data/status';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/catalog.mjs';

type ServerGift = { id: string; name: string; price: number; cat: string; minSvip: number };
type ServerPack = { id: string; productId: string; coins: number; firstBonus: number };

describe('Sunucu kataloğu uygulamayla aynı', () => {
  test('her hediyenin adı, fiyatı, kategorisi ve SVIP sınırı', () => {
    const app = GIFTS.map((g) => ({ id: g.id, name: g.name, price: g.price, cat: g.cat, minSvip: g.minSvip ?? 0 }));
    assert.deepEqual([...(server.GIFTS as Map<string, ServerGift>).values()], app);
  });

  test('hediye adetleri (hediye paneli)', () => {
    const sheet = fs.readFileSync(path.join(import.meta.dirname, '..', 'src/components/room/gift-sheet.tsx'), 'utf8');
    const counts = /const COUNTS = \[([\d,\s]+)\]/.exec(sheet)?.[1].split(',').map(Number);
    assert.deepEqual(server.GIFT_COUNTS, counts);
  });

  test('jeton paketleri, ilk alım hediyesi ve mağaza ürün kimlikleri', () => {
    const packs = server.PACKS as ServerPack[];
    assert.deepEqual(
      packs.map((p) => [p.id, p.coins, p.firstBonus, p.productId]),
      RECHARGE_PACKS.map((p) => [p.id, p.coins, p.firstBonus ?? 0, `coins_${p.coins}`]),
    );
  });

  test('elmas → jeton çevirisi: aynı kur, aynı alt sınır, aynı yuvarlama', () => {
    const ex = server.EXCHANGE as { diamondsPerUsd: number; usdTry: number; minDiamonds: number };
    assert.deepEqual([ex.diamondsPerUsd, ex.usdTry, ex.minDiamonds], [RULES.diamondsPerUsd, RULES.usdTry, RULES.exchangeMinDiamonds]);
    const best = (server.PACKS as (ServerPack & { tl: number })[]).at(-1)!;
    assert.equal(best.coins / best.tl, RULES.coinsBankRetailCoinsPerTl, 'en iyi paketin fiyatı');
    for (const d of [100, 101, 999, 5_000, 88_959, 1_000_000, 123_456_789]) {
      const q = exchangeOwnDiamonds(d, d);
      assert.ok(q.ok);
      if (q.ok) assert.equal((server.exchangeCoins as (n: number) => number)(d), q.coins, `${d} elmas`);
    }
  });

  test('SVIP eşikleri', () => {
    assert.deepEqual(server.SVIP_XP, SVIP_LEVELS.map((l) => l.xp));
  });
});
