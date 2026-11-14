/// <reference types="node" />
// The server sets gift prices and pack contents (server/api/catalog.mjs); the app shows them. If one side
// changes without the other, the app would show a price the server doesn't charge. This keeps them equal.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ANIMATION_SEED } from '@/data/animations';
import { COSMETICS, ROOM_BACKGROUNDS, ROOM_THEMES, STICKER_PACKS, roomCoverUrl } from '@/data/catalog';
import { GIFTS } from '@/data/mock';
import { RULES } from '@/data/rules';
import { SEAT_COLORS } from '@/data/seat-colors';
import { convertDiamonds, diamondValueTl, exchangeOwnDiamonds, selfExchangeRate, wholesaleQuote } from '@/lib/coins-bank';
import { NOBLE_DAYS, NOBLE_TIERS, RECHARGE_PACKS, SVIP_LEVELS, VIP_PLANS } from '@/data/status';
import { vipProductOf } from '@/lib/live/vip-core';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/catalog.mjs';
import * as family from '../../server/api/family-rules.mjs';
import { CHEST_MIN_CONTRIBUTION, CP_GIFT_IDS, KABILE_CHESTS, KABILE_TASKS, KABILE_THEMES } from '@/data/kabile';

type ServerGift = { id: string; name: string; price: number; cat: string; minSvip: number };
type ServerPack = { id: string; productId: string; coins: number; firstBonus: number };
type ServerShopItem = { sku: string; kind: string; name: string; price: number; days: number | null; minVip: number };

describe('Sunucu kataloğu uygulamayla aynı', () => {
  test('satıştan kalkan giriş efektleri iki tarafta aynı: çizimliler ve hediye klipleri; satışta yalnız Ejderha', () => {
    const retired = COSMETICS.filter((c) => c.retired).map((c) => c.id).sort();
    assert.deepEqual(retired, [...(server.SHOP_PAUSED_DEFAULT as string[])].sort());
    assert.equal(retired.length, 13);
    assert.deepEqual(COSMETICS.filter((c) => c.kind === 'entry' && !c.retired).map((c) => c.id), ['en-dragon']);
  });

  test('şimdilik raftan kalkan hediyeler iki tarafta aynı: animasyonu olmayanlar, dört standart hariç', async () => {
    const { GIFTS_PAUSED } = await import('@/data/gifts-paused');
    const { giftShowOf } = await import('@/data/gift-shows');
    const { FX_VIDEOS } = await import('../../server/api/fx.mjs');
    assert.deepEqual([...GIFTS_PAUSED].sort(), [...(server.GIFTS_PAUSED as Set<string>)].sort());
    const animated = (id: string) => id in FX_VIDEOS.gift || !!giftShowOf(id);
    const standard = new Set(['g1', 'g2', 'g3', 'g4']);
    assert.deepEqual([...GIFTS_PAUSED].sort(), GIFTS.filter((g) => !animated(g.id) && !standard.has(g.id)).map((g) => g.id).sort());
  });

  test('her hediyenin adı, fiyatı, kategorisi ve SVIP sınırı', () => {
    const app = GIFTS.map((g) => ({ id: g.id, name: g.name, price: g.price, cat: g.cat, minSvip: g.minSvip ?? 0 }));
    assert.deepEqual([...(server.GIFTS as Map<string, ServerGift>).values()], app);
  });

  test('oda kapakları (seviyeleriyle) ve temalar sunucudakiyle aynı', () => {
    assert.deepEqual(server.ROOM_COVERS, ROOM_BACKGROUNDS.map((b) => ({ id: b.id, minLevel: b.minLevel })));
    assert.deepEqual(server.ROOM_THEMES, ROOM_THEMES.map((t) => t.id));
    assert.equal(roomCoverUrl('bg3'), 'https://picsum.photos/seed/sea/600/400');
    assert.equal(roomCoverUrl(null), '');
    assert.equal(roomCoverUrl('yok'), '');
  });

  test('odada ücretli Hareketli: her animasyonun adı, fiyatı ve kampanya günleri', () => {
    type ServerAnim = { id: string; name: string; price: number; from: string | null; until: string | null };
    const app = ANIMATION_SEED.filter((a) => !a.is_free && (a.display_type === 'reaction' || a.display_type === 'gift' || a.display_type === 'fullscreen')).map((a) => ({
      id: a.animation_id,
      name: a.name,
      price: a.coin_price,
      from: a.starts_at ?? null,
      until: a.ends_at ?? null,
    }));
    assert.deepEqual([...(server.ROOM_ANIMS as Map<string, ServerAnim>).values()], app);
  });

  test('mağaza: her ürünün adı, fiyatı, süresi ve VIP sınırı', () => {
    const app = [
      ...COSMETICS.map((c) => [c.id, c.kind, c.name, c.price, c.days, c.minVip ?? 0]),
      ...STICKER_PACKS.filter((p) => p.price > 0).map((p) => [`pack-${p.id}`, 'sticker', p.name, p.price, null, p.minVip ?? 0]),
      ...ANIMATION_SEED.filter((a) => a.display_type === 'mic_effect' && !a.is_free).map((a) => [a.animation_id, 'micfx', a.name, a.coin_price, null, 0]),
      ...NOBLE_TIERS.map((t) => [`noble-${t.tier}`, 'noble', t.name, t.price, NOBLE_DAYS, 0]),
    ];
    const shop = [...(server.SHOP as Map<string, ServerShopItem>).values()].map((x) => [x.sku, x.kind, x.name, x.price, x.days, x.minVip]);
    assert.deepEqual(shop, app);
    const free = ANIMATION_SEED.filter((a) => a.display_type === 'mic_effect' && a.is_free).map((a) => a.animation_id);
    assert.deepEqual(server.FREE_MICFX, free);
  });

  test('koltuk renkleri: kimlik, ad ve fiyat', () => {
    assert.deepEqual([...(server.SEAT_COLORS as Map<string, { id: string; name: string; price: number }>).values()], SEAT_COLORS.map((c) => ({ ...c })));
  });

  test('hediye adetleri (hediye paneli)', () => {
    const sheet = fs.readFileSync(path.join(import.meta.dirname, '..', 'src/components/room/gift-sheet.tsx'), 'utf8');
    const counts = /const COUNTS = \[([\d,\s]+)\]/.exec(sheet)?.[1].split(',').map(Number);
    assert.deepEqual(server.GIFT_COUNTS, counts);
  });

  test('Abonelik planları: gün, fiyat ve mağaza ürün kimlikleri', () => {
    type ServerSub = { days: number; tl: number; productId: string };
    assert.deepEqual(
      (server.VIP_SUBS as ServerSub[]).map((p) => [p.days, p.tl, p.productId]),
      VIP_PLANS.map((p) => [p.days, p.tl, vipProductOf(p.days)]),
    );
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

  test('Aile görevleri, sandıkları, temaları ve bonus oranları sunucudakiyle aynı', () => {
    const pick = ({ id, source, kind, goal, per, power, treasure }: (typeof KABILE_TASKS)[number]) => ({ id, source, kind, goal, per, power, treasure });
    assert.deepEqual(family.FAMILY_TASKS, KABILE_TASKS.map(pick));
    assert.deepEqual(
      family.FAMILY_CHESTS,
      KABILE_CHESTS.map((c) => ({ id: c.id, name: c.name, need: c.need, coins: c.reward.coins })),
    );
    assert.equal(family.CHEST_MIN_CONTRIBUTION, CHEST_MIN_CONTRIBUTION);
    assert.deepEqual(family.FAMILY_THEMES, KABILE_THEMES.map((t) => ({ id: t.id, minLevel: t.minLevel })));
    assert.deepEqual(family.CP_GIFT_IDS, CP_GIFT_IDS);
    assert.deepEqual(family.FAMILY_RATES, RULES.familyRates);
  });
});
