/// <reference types="node" />
// The server sets gift prices and pack contents (server/api/catalog.mjs); the app shows them. If one side
// changes without the other, the app would show a price the server doesn't charge. This keeps them equal.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { GIFTS } from '@/data/mock';
import { RULES } from '@/data/rules';
import { convertDiamonds, diamondValueTl, exchangeOwnDiamonds, selfExchangeRate, wholesaleQuote } from '@/lib/coins-bank';
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

  test('Çevir canlı kurla: uygulamanın gösterdiği jeton sunucunun verdiğiyle aynı (yanlış "kur değişti" olmaz)', () => {
    const coinsAt = server.exchangeCoins as (n: number, usdTry?: number) => number;
    for (const usdTry of [40, 49.8, 55.55, 75]) {
      const rules = { ...RULES, usdTry };
      for (const d of [100, 101, 999, 5_000, 88_959, 1_000_000, 123_456_789]) {
        const shown = Math.floor(d * selfExchangeRate(rules));
        assert.equal(coinsAt(d, usdTry), shown, `${d} elmas, kur ${usdTry}`);
        const q = exchangeOwnDiamonds(d, d, rules);
        assert.ok(q.ok);
        if (q.ok) assert.equal(q.coins, shown, `${d} elmas, kur ${usdTry} (Çevir ekranı)`);
      }
    }
    // Without a rate the server uses the compiled one, as before.
    assert.equal(coinsAt(10_000), coinsAt(10_000, RULES.usdTry));
  });

  test('Jeton Noktası: elmas bozdurma ve toptan fiyat sunucuyla aynı', () => {
    const ex = server.EXCHANGE as { bankFee: number; wholesaleFee: number };
    assert.deepEqual([ex.bankFee, ex.wholesaleFee], [RULES.coinsBankExchangeFee, RULES.coinsBankWholesaleFee]);
    const num = (f: unknown) => f as (n: number) => number;
    for (const d of [100, 101, 999, 5_000, 88_959, 1_000_000, 123_456_789]) {
      const q = convertDiamonds('coins_bank_main', d);
      assert.ok(q.ok);
      if (q.ok) assert.equal(num(server.bankExchangeCoins)(d), q.coins, `${d} elmas → banka jetonu`);
      assert.equal(num(server.diamondValueTl)(d), Math.round(diamondValueTl(d) * 100) / 100, `${d} elmasın TL değeri`);
    }
    for (const c of [1, 999, 50_000, 1_000_000, 123_456_789]) {
      const q = wholesaleQuote('coins_bank_main', c);
      assert.ok(q.ok);
      if (q.ok) assert.equal(num(server.wholesaleTl)(c), Math.round(q.priceTl * 100) / 100, `${c} jeton toptan`);
    }
  });

  test('SVIP eşikleri', () => {
    assert.deepEqual(server.SVIP_XP, SVIP_LEVELS.map((l) => l.xp));
  });
});
