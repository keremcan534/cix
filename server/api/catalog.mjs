// What things cost, decided by the server: gifts, the gift counts the panel offers, coin packs (store
// products) and the SVIP thresholds. Kept in step with the app (app/src/data/mock.ts GIFTS,
// app/src/components/room/gift-sheet.tsx COUNTS, app/src/data/status.ts PACK_LIST and SVIP_LEVELS); the app
// test tests/server-catalog.test.ts fails when they drift. Lucky gifts are not here: they wait for the legal
// decision (docs/YAYIN_HAZIRLIGI.md, item 1).

/** [id, name, price in coins, panel tab, minimum SVIP level (privilege gifts)] */
const GIFT_ROWS = [
  ['g1', 'Gül', 10, 'hot'],
  ['g2', 'Kalp', 50, 'hot'],
  ['g3', 'Kahve', 99, 'hot'],
  ['g4', 'Pasta', 200, 'hot'],
  ['g5', 'Taç', 500, 'hot'],
  ['g6', 'Roket', 1_999, 'hot'],
  ['g7', 'Elmas', 4_950, 'hot'],
  ['g8', 'Şato', 19_999, 'hot'],
  ['h1', 'Oyun Zamanı', 7_777, 'hot'],
  ['h2', 'Dünya Turu', 249_999, 'hot'],
  ['h3', 'Seni Seviyorum', 500, 'hot'],
  ['h4', 'Panda Sarılması', 3_999, 'hot'],
  ['h5', 'Tatil Keyfi', 7_999, 'hot'],
  ['h6', 'Uçan Öpücük', 1_999, 'hot'],
  ['h7', 'Gece Kralı', 39_999, 'hot'],
  ['h8', 'Birlikte Bisiklet', 777, 'hot'],
  ['h9', 'Parti Zamanı', 9_999, 'hot'],
  ['h10', 'Anı Fotoğrafı', 1_299, 'hot'],
  ['h11', 'Altın Çan', 4_950, 'hot'],
  ['h12', 'Altın Kuğu', 99_950, 'hot'],
  ['p1', 'Kar Topu', 50, 'gameplay'],
  ['p2', 'Sulu Balon', 99, 'gameplay'],
  ['p3', 'Domates At', 200, 'gameplay'],
  ['p4', 'Kâğıt Uçak', 200, 'gameplay'],
  ['p5', 'Su Kovası', 500, 'gameplay'],
  ['p6', 'Pasta At', 777, 'gameplay'],
  ['p7', 'Yumurta At', 1_299, 'gameplay'],
  ['p8', 'Terlik At', 1_299, 'gameplay'],
  ['p9', 'Konfeti Topu', 1_999, 'gameplay'],
  ['p10', 'Aşk Oku', 2_399, 'gameplay'],
  ['c1', 'Can Dostum', 5_000, 'couple'],
  ['c2', 'Dilek Kavanozu', 8_999, 'couple'],
  ['c3', 'Masal Kalesi', 99_999, 'couple'],
  ['c4', 'Aşk Mektubu', 7_999, 'couple'],
  ['c5', 'Sevgi Tatlısı', 39_999, 'couple'],
  ['c6', 'Yıldız Faytonu', 699_999, 'couple'],
  ['c7', 'Evlilik Teklifi', 19_999, 'couple'],
  ['c8', 'Düğün Günü', 399_999, 'couple'],
  ['c9', 'Sonsuz Öpücük', 777, 'couple'],
  ['c10', 'Kristal Kolye', 9_999, 'couple'],
  ['c11', 'Lunapark Randevusu', 49_950, 'couple'],
  ['c12', 'Aşk Ateşi', 1_999, 'couple'],
  ['v1', 'Zümrüt Saat', 4_950, 'privilege', 2],
  ['v2', 'Gizemli Gül', 350, 'privilege', 2],
  ['v3', 'Sihirli Şapka', 19_950, 'privilege', 3],
  ['v4', 'Kristal Ayakkabı', 49_950, 'privilege', 4],
  ['v5', 'Altın Kılıç', 777, 'privilege', 4],
  ['v6', 'Kartal', 99_950, 'privilege', 5],
  ['v7', 'Uzay Yolculuğu', 277_750, 'privilege', 6],
  ['v8', 'Gökyüzü Turu', 549_950, 'privilege', 7],
  ['v9', 'Altın Kanatlar', 199_999, 'privilege', 7],
  ['v10', 'Lüks Yat', 399_999, 'privilege', 8],
  ['v11', 'Altın Tavus', 299_999, 'privilege', 8],
  ['v12', 'Atlıkarınca Gecesi', 699_999, 'privilege', 9],
];

export const GIFTS = new Map(GIFT_ROWS.map(([id, name, price, cat, minSvip = 0]) => [id, { id, name, price, cat, minSvip }]));

/** Gift counts the panel offers; any other count is refused. */
export const GIFT_COUNTS = [1, 5, 10, 25, 50, 100, 250];

/** Coin packs. The store product id is `coins_<coins>` on both stores; firstBonus is paid on the first purchase of that pack. */
export const PACKS = [
  { id: 'p1', coins: 1_000, firstBonus: 1_000, tl: 29.99 },
  { id: 'p2', coins: 5_000, firstBonus: 2_500, tl: 139.99 },
  { id: 'p3', coins: 10_000, tl: 269.99 },
  { id: 'p4', coins: 20_000, tl: 519.99 },
  { id: 'p5', coins: 50_000, tl: 1_279.99 },
  { id: 'p6', coins: 100_000, tl: 2_499.99 },
  { id: 'p7', coins: 200_000, tl: 4_899.99 },
  { id: 'p8', coins: 500_000, tl: 11_999.99 },
  { id: 'p9', coins: 1_000_000, tl: 23_599.99 },
].map((p) => ({ firstBonus: 0, ...p, productId: `coins_${p.coins}` }));
export const PACK_BY_PRODUCT = new Map(PACKS.map((p) => [p.productId, p]));

/**
 * Diamonds → coins (Gelir > Çevir): a diamond's official value (5.000 💎 = 1 USD, at USD_TRY) priced like the
 * best pack, no fee, coins rounded down. The same sum as app/src/lib/coins-bank.ts exchangeOwnDiamonds with
 * the rules in app/src/data/rules.ts; tests/server-catalog.test.ts fails when they drift. `usdTry` is the
 * rate in effect: Çevir passes the live one (live-settings.mjs, Canlı ayarlar); the default is the compiled rate.
 */
export const EXCHANGE = { diamondsPerUsd: 5_000, usdTry: 49.8, minDiamonds: 100, bankFee: 0.03, wholesaleFee: 0.02 };
const BEST = PACKS.at(-1);
const COINS_PER_TL = BEST.coins / BEST.tl;
export const exchangeCoins = (diamonds, usdTry = EXCHANGE.usdTry) => Math.floor(diamonds * ((1 / EXCHANGE.diamondsPerUsd) * usdTry * COINS_PER_TL));

/** What diamonds are worth in TL (5.000 💎 = 1 USD at USD_TRY): what a Jeton Noktası pays a host for them. */
export const diamondValueTl = (diamonds) => Math.round((diamonds / EXCHANGE.diamondsPerUsd) * EXCHANGE.usdTry * 100) / 100;
/**
 * A host sells diamonds to a Jeton Noktası: the bank gets coins worth their value plus its fee (3 %), rounded
 * down. Same sum as app/src/lib/coins-bank.ts convertDiamonds.
 */
export const bankExchangeCoins = (diamonds) => Math.floor(diamonds * ((1 / EXCHANGE.diamondsPerUsd) * EXCHANGE.usdTry * COINS_PER_TL * (1 + EXCHANGE.bankFee)));
/** What a Jeton Noktası pays management for coins: the best pack's price minus its fee (2 %). app wholesaleQuote. */
export const wholesaleTl = (coins) => Math.round((coins / COINS_PER_TL) * (1 - EXCHANGE.wholesaleFee) * 100) / 100;

/**
 * Withdrawals (withdraw.mjs): the smallest and largest request and the most diamonds one person may ask for in
 * 7 days. Same as app/src/data/rules.ts minWithdrawDiamonds, maxWithdrawDiamonds, weeklyWithdrawLimitDiamonds.
 */
export const WITHDRAW = { minDiamonds: 50_000, maxDiamonds: 5_000_000, weeklyDiamonds: 10_000_000 };
export const diamondValueUsd = (diamonds) => Math.floor((diamonds / EXCHANGE.diamondsPerUsd) * 100) / 100;

/** SVIP level n needs SVIP_XP[n - 1] points (1 purchased coin = 1 point). */
export const SVIP_XP = [500_000, 1_250_000, 2_500_000, 4_000_000, 7_500_000, 15_000_000, 40_000_000, 100_000_000, 210_000_000, 400_000_000];
export const svipLevel = (xp) => SVIP_XP.filter((t) => xp >= t).length;

// --- Mağaza (economy.mjs): what the shop sells, in step with the app (app/src/data/catalog.ts COSMETICS and
// STICKER_PACKS, data/animations.ts mic effects, data/status.ts NOBLE_TIERS); tests/server-catalog.test.ts
// fails when they drift. Sticker packs are 'pack-<id>'. Prices and durations change only with a deploy.
/** [sku, kind, name, price in coins, days (null: permanent), minimum VIP level] */
const SHOP_ROWS = [
  ['fr-neon', 'frame', 'Ses Dalgası', 150, 7, 0],
  ['fr-ocean', 'frame', 'Yörünge', 300, 30, 0],
  ['fr-aurora', 'frame', 'Aurora', 600, 30, 0],
  ['fr-fire', 'frame', 'Ateş', 900, 30, 0],
  ['fr-gold', 'frame', 'Altın Taç', 2_500, null, 4],
  ['fr-silver', 'frame', 'Gümüş Kristal', 800, 30, 0],
  ['fr-frost', 'frame', 'Buz Kristali', 1_200, 30, 0],
  ['fr-rose', 'frame', 'Gül Kalpler', 1_200, 30, 0],
  ['fr-laurel', 'frame', 'Altın Defne', 2_000, 30, 0],
  ['fr-crown-silver', 'frame', 'Gümüş Taç', 4_000, 30, 2],
  ['fr-crown-gold', 'frame', 'Kraliyet Kanatları', 9_000, null, 4],
  ['fr-wing-coral', 'frame', 'Melek Kalp · Mercan', 3_000, 30, 0],
  ['fr-wing-sky', 'frame', 'Melek Kalp · Turkuaz', 3_000, 30, 0],
  ['en-sparkle', 'entry', 'Işıltı', 200, 7, 0],
  ['en-thunder', 'entry', 'Şimşek', 600, 30, 0],
  ['en-comet', 'entry', 'Kuyruklu Yıldız', 1_200, 30, 0],
  ['en-dragon', 'entry', 'Ejderha', 3_000, 30, 7],
  ['rd-scooter', 'ride', 'Scooter', 250, 7, 0],
  ['rd-sport', 'ride', 'Spor Araba', 1_200, 30, 0],
  ['rd-jet', 'ride', 'Özel Jet', 5_000, 30, 9],
  ['bb-candy', 'bubble', 'Şeker', 120, 7, 0],
  ['bb-galaxy', 'bubble', 'Galaksi', 450, 30, 0],
  ['bb-gold', 'bubble', 'Altın', 1_500, null, 5],
  ['id-777', 'specialId', 'ID 777', 8_000, null, 0],
  ['id-2026', 'specialId', 'ID 2026', 3_000, null, 0],
  ['id-1001', 'specialId', 'ID 1001', 2_000, null, 0],
  ['pack-fun', 'sticker', 'Eğlence', 50, null, 0],
  ['pack-love', 'sticker', 'Aşk', 80, null, 0],
  ['pack-animals', 'sticker', 'Hayvanlar', 60, null, 0],
  ['pack-anim', 'sticker', 'Animasyonlu', 150, null, 0],
  ['an-mic-neon', 'micfx', 'Neon Halka', 500, null, 0],
  ['an-mic-stars', 'micfx', 'Dönen Yıldızlar', 800, null, 0],
  ['an-mic-notes', 'micfx', 'Müzik Notaları', 600, null, 0],
  ['noble-1', 'noble', 'Gemici', 15_000, 30, 0],
  ['noble-2', 'noble', 'Dümenci', 60_000, 30, 0],
  ['noble-3', 'noble', 'Lostromo', 150_000, 30, 0],
  ['noble-4', 'noble', 'Amiral', 400_000, 30, 0],
  ['noble-5', 'noble', 'Kaptan-ı Derya', 1_000_000, 30, 0],
];
export const SHOP = new Map(
  SHOP_ROWS.map(([sku, kind, name, price, days, minVip]) => [sku, Object.freeze({ sku, kind, name, price, days, minVip, tier: kind === 'noble' ? Number(sku.slice(6)) : null })]),
);
/** What a person wears, one each (users.equipped). Sticker packs and noble rank are owned, not worn. */
export const SLOTS = ['frame', 'entry', 'ride', 'bubble', 'specialId', 'micfx'];
/** One of a kind: bought coins only, never reward coins. */
export const PAID_ONLY = ['specialId'];
/** Mic effects anyone may wear without buying. */
export const FREE_MICFX = ['an-mic-wave'];
/** A timed term may not end further ahead than this. */
export const MAX_AHEAD_DAYS = 365;
/** VIP level as the app shows it (store.tsx): the higher of the SVIP level and three per noble tier, at most 15. */
export const vipLevelOf = (svipXp, nobleTier) => Math.min(15, Math.max(svipLevel(Number(svipXp) || 0), (nobleTier ?? 0) * 3));
/** The history line of a shop charge. Never 'Uygulama içi:' (the old apps' free-text spends). */
export function labelOf(item) {
  if (item.kind === 'sticker') return `Çıkartma paketi: ${item.name}`;
  if (item.kind === 'micfx') return `Mikrofon efekti: ${item.name}`;
  if (item.kind === 'noble') return `Rütbe: ${item.name} (${item.days} gün)`;
  return `Mağaza: ${item.name}${item.days ? ` (${item.days} gün)` : ''}`;
}
