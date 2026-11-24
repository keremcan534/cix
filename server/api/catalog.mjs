// What things cost, decided by the server: gifts, the gift counts the panel offers, coin packs and the VIP
// subscription plans (store products) and the SVIP thresholds. Kept in step with the app (app/src/data/mock.ts GIFTS,
// app/src/components/room/gift-sheet.tsx COUNTS, app/src/data/status.ts PACK_LIST, VIP_PLANS and SVIP_LEVELS); the app
// test tests/server-catalog.test.ts fails when they drift. Lucky gifts are not here: they wait for the legal
// decision (docs/YAYIN_HAZIRLIGI.md, item 1).

/** [id, name, emoji (chat lines, and where no picture fits), price in coins, panel tab, minimum SVIP level (privilege gifts)] */
const GIFT_ROWS = [
  ['g1', 'Gül', '🌹', 10, 'hot'],
  ['g2', 'Kalp', '💖', 50, 'hot'],
  ['g3', 'Kahve', '☕', 99, 'hot'],
  ['g4', 'Pasta', '🎂', 200, 'hot'],
  ['g5', 'Taç', '👑', 500, 'hot'],
  ['g6', 'Roket', '🚀', 1_999, 'hot'],
  ['h15', 'Sevimli Panda', '🐼', 5_999, 'hot'],
  ['h16', 'Hazine Sandığı', '💰', 7_999, 'hot'],
  ['h17', 'Efsanevi Tek Boynuz', '🦄', 9_999, 'hot'],
  ['h18', 'Anka Kuşu', '🔥', 14_999, 'hot'],
  ['h19', 'Altın Gemi', '⛵', 19_999, 'hot'],
  ['h20', 'Kristal Saray', '🏰', 24_999, 'hot'],
  ['h21', 'Altın Süper Otomobil', '🏎️', 29_999, 'hot'],
  ['h22', 'Altın Aslan', '🦁', 39_999, 'hot'],
  ['g7', 'Elmas', '💎', 4_950, 'hot'],
  ['g8', 'Şato', '🏰', 19_999, 'hot'],
  ['h1', 'Oyun Zamanı', '🎮', 7_777, 'hot'],
  ['h2', 'Dünya Turu', '🌍', 249_999, 'hot'],
  ['h3', 'Seni Seviyorum', '🥰', 500, 'hot'],
  ['h4', 'Panda Sarılması', '🐼', 3_999, 'hot'],
  ['h5', 'Tatil Keyfi', '🏖️', 7_999, 'hot'],
  ['h6', 'Uçan Öpücük', '😘', 1_999, 'hot'],
  ['h7', 'Gece Kralı', '🤴', 39_999, 'hot'],
  ['h8', 'Birlikte Bisiklet', '🚲', 777, 'hot'],
  ['h9', 'Parti Zamanı', '🎉', 9_999, 'hot'],
  ['h10', 'Anı Fotoğrafı', '📸', 1_299, 'hot'],
  ['h11', 'Altın Çan', '🔔', 4_950, 'hot'],
  ['h12', 'Altın Kuğu', '🦢', 99_950, 'hot'],
  ['h13', 'Tatlı Ayıcık', '🧸', 2_999, 'hot'],
  ['h14', 'Kraliyet Tacı', '👑', 9_999, 'hot'],
  ['p1', 'Kar Topu', '❄️', 50, 'gameplay'],
  ['p2', 'Sulu Balon', '🎈', 99, 'gameplay'],
  ['p3', 'Domates At', '🍅', 200, 'gameplay'],
  ['p4', 'Kâğıt Uçak', '✈️', 200, 'gameplay'],
  ['p5', 'Su Kovası', '🪣', 500, 'gameplay'],
  ['p6', 'Pasta At', '🥧', 777, 'gameplay'],
  ['p7', 'Yumurta At', '🥚', 1_299, 'gameplay'],
  // Muzip hediyeler (docs/PROFIL_IZLERI.md): the pilot that leaves Kırık Cam once staff give it the rule in the panel.
  ['p8', 'Terlik Geldi!', '🩴', 1_299, 'gameplay'],
  ['p9', 'Konfeti Topu', '🎊', 1_999, 'gameplay'],
  ['p10', 'Aşk Oku', '💘', 2_399, 'gameplay'],
  // Profil izleri (profile-mark-rules.mjs APP_MARKS): Kaka Şakası leaves Kaka İzi on the receiver's profile photo,
  // Temizlik Suyu cleans it (the owners' names, 20 Nov 2026; the ids stay).
  ['k1', 'Kaka Şakası', '💩', 999, 'gameplay'],
  ['k2', 'Temizlik Suyu', '💧', 1_999, 'gameplay'],
  ['c1', 'Can Dostum', '💞', 5_000, 'couple'],
  ['c2', 'Dilek Kavanozu', '🫙', 8_999, 'couple'],
  ['c3', 'Masal Kalesi', '🏯', 99_999, 'couple'],
  ['c4', 'Aşk Mektubu', '💌', 7_999, 'couple'],
  ['c5', 'Sevgi Tatlısı', '🍰', 39_999, 'couple'],
  ['c6', 'Yıldız Faytonu', '🐎', 699_999, 'couple'],
  ['c7', 'Evlilik Teklifi', '💍', 19_999, 'couple'],
  ['c8', 'Düğün Günü', '👰', 399_999, 'couple'],
  ['c9', 'Sonsuz Öpücük', '💋', 777, 'couple'],
  ['c10', 'Kristal Kolye', '📿', 9_999, 'couple'],
  ['c11', 'Lunapark Randevusu', '🎡', 49_950, 'couple'],
  ['c12', 'Aşk Ateşi', '❤️‍🔥', 1_999, 'couple'],
  ['c13', 'Pırlanta Yüzük', '💍', 19_999, 'couple'],
  // Aile ve Dost. Koruma (guards.mjs): sending it makes the sender the receiver's guardian.
  ['koruma', 'Koruma Kartı', '🛡️', 999, 'family'],
  // The bond gifts (bond-rules.mjs, the same names and prices): sent from the shelf they are a bond request (bonds.mjs).
  ['bag-kardes', 'Kardeş Bilekliği', '📿', 1_000, 'family'],
  ['bag-baci', 'Bacı Kolyesi', '💛', 1_000, 'family'],
  ['bag-agabey', 'Ağabey Saati', '⌚', 1_000, 'family'],
  ['bag-abla', 'Abla Broşu', '🌸', 1_000, 'family'],
  ['bag-yenge', 'Yenge Çiçeği', '💐', 1_000, 'family'],
  ['bag-enishte', 'Enişte Kravatı', '👔', 1_000, 'family'],
  ['bag-kanka', 'Kanka Rozeti', '🏅', 500, 'family'],
  ['v1', 'Zümrüt Saat', '⌚', 4_950, 'privilege', 2],
  ['v2', 'Gizemli Gül', '🥀', 350, 'privilege', 2],
  ['v3', 'Sihirli Şapka', '🎩', 19_950, 'privilege', 3],
  ['v4', 'Kristal Ayakkabı', '👠', 49_950, 'privilege', 4],
  ['v5', 'Altın Kılıç', '🗡️', 777, 'privilege', 4],
  ['v6', 'Kartal', '🦅', 99_950, 'privilege', 5],
  ['v7', 'Uzay Yolculuğu', '👨‍🚀', 277_750, 'privilege', 6],
  ['v8', 'Gökyüzü Turu', '🚁', 549_950, 'privilege', 7],
  ['v9', 'Altın Kanatlar', '🪽', 199_999, 'privilege', 7],
  ['v10', 'Lüks Yat', '🛥️', 399_999, 'privilege', 8],
  ['v11', 'Altın Tavus', '🦚', 299_999, 'privilege', 8],
  ['v12', 'Atlıkarınca Gecesi', '🎠', 699_999, 'privilege', 9],
  // Çift's bond gift (bond-rules.mjs KINDS.cift), on the Aile ve Dost shelf with the others (the owners, 20 Nov 2026;
  // before, only the profile's "Bağ kur" sent it). Last, so no other gift's default order (custom-gifts.mjs APP_SORT) moves.
  // The Çift bond's gift on Çift (owners, 22 Nov 2026), the other bond gifts on Aile ve Dost.
  ['bag-cift', 'Bağ Yüzüğü', '💍', 5_000, 'couple'],
];

/**
 * The gifts as the app has them. The admins may change any of them from the panel (custom-gifts.mjs: name, emoji,
 * price, shelf, VIP level, order, on the shelves or not, icon, video); what is sent, listed and charged goes through
 * custom-gifts.mjs giftOf / builtinGift, never these values alone.
 */
export const GIFTS = new Map(GIFT_ROWS.map(([id, name, emoji, price, cat, minSvip = 0]) => [id, Object.freeze({ id, name, emoji, price, cat, minSvip })]));
/** The bond gifts on the Aile ve Dost shelf: never sent as a plain gift, their price is the bond's (bond-rules.mjs). */
export const BOND_GIFTS = new Set([...GIFTS.keys()].filter((id) => id.startsWith('bag-')));
/**
 * Off the shelf for now (the owner, 14 Nov): every gift with no animation of their own (no video in fx.mjs, no show in
 * the app's data/gift-shows); the four standard ones (Gül, Kalp, Kahve, Pasta) went too, the same evening. GET
 * /api/catalog leaves them out, so every app's shelf drops them, older ones too; a send from an older app still goes
 * through (unlike a gift hidden in Canlı ayarlar). The same list as app/src/data/gifts-paused.ts; taking an id out of
 * both brings the gift back. These are only the defaults: Yönetim › Hediyeler puts any of them back on the shelves
 * (or takes another off) without a deploy (custom-gifts.mjs `enabled`).
 */
/**
 * Shop items no longer sold (the owner, 14 Nov): the entry effects with no animation of their own, only the drawn
 * banner, and the gift clips that were sold as entries for a few hours (entries are not to be the gifts). Left out of the shop list and refused as a purchase (economy.mjs sellable); whoever owns one keeps wearing
 * it until it runs out. The same list as the app's COSMETICS `retired`. SHOP_PAUSED in .env replaces it (comma
 * separated; empty sells them all again, as the tests' server does: test/harness.mjs).
 */
export const SHOP_PAUSED_DEFAULT = [
  ...['en-sparkle', 'en-thunder', 'en-comet'],
  ...['en-roket', 'en-ayicik', 'en-panda', 'en-tac', 'en-tekboynuz', 'en-anka', 'en-gemi', 'en-saray', 'en-otomobil', 'en-aslan'],
];
export const SHOP_PAUSED = new Set(
  process.env.SHOP_PAUSED === undefined ? SHOP_PAUSED_DEFAULT : process.env.SHOP_PAUSED.split(',').map((x) => x.trim()).filter(Boolean),
);
/**
 * The app's gifts that start as "Yakında" (owners, 22 Nov 2026): on their shelf, greyed, not sent; the panel turns each
 * on or off (custom-gifts.mjs, custom_gifts.soon). The Aile ve Dost bond gifts but Çift's: their bonds wait too.
 */
export const GIFTS_SOON_DEFAULT = ['bag-kanka', 'bag-kardes', 'bag-baci', 'bag-agabey', 'bag-abla', 'bag-yenge', 'bag-enishte'];
export const GIFTS_SOON = new Set(
  process.env.GIFTS_SOON === undefined ? GIFTS_SOON_DEFAULT : process.env.GIFTS_SOON.split(',').map((x) => x.trim()).filter(Boolean),
);

export const GIFTS_PAUSED = new Set([
  ...['g1', 'g2', 'g3', 'g4', 'g5', 'g7', 'g8', 'h1', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11'],
  ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'],
  ...['c1', 'c2', 'c4', 'c5', 'c7', 'c9', 'c10', 'c11', 'c12'],
  ...['v1', 'v2', 'v3', 'v4', 'v5'],
]);

/** Gift counts the panel offers; any other count is refused. */
export const GIFT_COUNTS = [1, 5, 10, 25, 50, 100, 250];

/**
 * What 1.000 coins are worth in TL (owners, 24 Nov 2026: "1000 jeton 220₺"): the packs' list price, Çevir's and the
 * Jeton Noktası's sums. The live value is Canlı ayarlar › coin_value_tl (live-registry.mjs); this is its default.
 */
export const COIN_VALUE_TL = 220;
/** TL for `coins` at `per1000` TL per 1.000 coins, to the kuruş. */
export const tlOfCoins = (coins, per1000 = COIN_VALUE_TL) => Math.round(coins * per1000 * 100 / 1000) / 100;

/**
 * Coin packs. The store product id is `coins_<coins>` on both stores; firstBonus is paid on the first purchase of that
 * pack; `tl` is the list price at the default coin value (Play Console holds the price the buyer pays). Owners, 24 Nov
 * 2026: 1.000 coins = 220 TL for every pack, and Google Play sells nothing above 11.000 TL in Türkiye, so the nine packs
 * run from 1.000 to 50.000 coins. The ids of the packs that stayed keep their coins (Canlı ayarlar › pack_setup is
 * stored by id); the new sizes took new ids.
 */
export const PACKS = [
  { id: 'p1', coins: 1_000, firstBonus: 1_000 },
  { id: 'p10', coins: 2_500 },
  { id: 'p2', coins: 5_000, firstBonus: 2_500 },
  { id: 'p11', coins: 7_500 },
  { id: 'p3', coins: 10_000 },
  { id: 'p12', coins: 15_000 },
  { id: 'p4', coins: 20_000 },
  { id: 'p13', coins: 30_000 },
  { id: 'p5', coins: 50_000 },
].map((p) => ({ firstBonus: 0, ...p, tl: tlOfCoins(p.coins), productId: `coins_${p.coins}` }));
/**
 * Packs no longer sold (24 Nov 2026: above Google Play's 11.000 TL): never in the catalog, but a purchase of one the
 * store still delivers (bought before its product was turned off, acknowledged late) is credited, refunded and booked
 * like any pack, at the price it had.
 */
export const RETIRED_PACKS = [
  { id: 'p6', coins: 100_000, tl: 2_499.99 },
  { id: 'p7', coins: 200_000, tl: 4_899.99 },
  { id: 'p8', coins: 500_000, tl: 11_999.99 },
  { id: 'p9', coins: 1_000_000, tl: 23_599.99 },
].map((p) => ({ firstBonus: 0, ...p, productId: `coins_${p.coins}`, retired: true }));
export const PACK_BY_PRODUCT = new Map([...PACKS, ...RETIRED_PACKS].map((p) => [p.productId, p]));
/**
 * What each pack cost before 24 Nov 2026, by store product: a purchase made before its price was written on it
 * (migration 119) is booked and refunded at this price.
 */
export const PACK_TL_BEFORE = Object.freeze({
  coins_1000: 29.99,
  coins_5000: 139.99,
  coins_10000: 269.99,
  coins_20000: 519.99,
  coins_50000: 1_279.99,
  coins_100000: 2_499.99,
  coins_200000: 4_899.99,
  coins_500000: 11_999.99,
  coins_1000000: 23_599.99,
});
/**
 * Jeton paketleri as the panel set them up (Canlı ayarlar › pack_setup, owners, 22 Nov 2026): each pack keeps its
 * store product and its coins (Play Console sells `coins_<coins>`), and gets `extra` coins on every purchase, its own
 * first-purchase gift (`firstBonus`) and its place in the list (`order`). `setup` null or a pack missing from it: the
 * compiled values. The packs come out in their order (ties: the compiled order).
 */
export function packsSetUp(setup) {
  return PACKS.map((p, i) => {
    const x = setup?.[p.id];
    return { ...p, firstBonus: x?.first ?? p.firstBonus, extra: x?.extra ?? 0, order: x?.order ?? i + 1, i };
  })
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map(({ i, ...p }) => p);
}

/**
 * Abonelik (vip.mjs): the VIP subscription plans, store subscriptions priced in TRY that renew on their own. The
 * store product id is `vip_<days>d` on both stores; a test purchase (ALLOW_TEST_TOPUP=1) gives `days`. In step with
 * app/src/data/status.ts VIP_PLANS; tests/server-catalog.test.ts fails when they drift.
 */
export const VIP_SUBS = [
  { days: 7, tl: 145 },
  { days: 30, tl: 285 },
  { days: 90, tl: 599 },
].map((p) => ({ ...p, productId: `vip_${p.days}d` }));
export const VIP_SUB_BY_PRODUCT = new Map(VIP_SUBS.map((p) => [p.productId, p]));

/**
 * Diamonds → coins (Gelir > Çevir): a diamond's official value (5.000 💎 = 1 USD, at USD_TRY) priced at the coin value
 * (1.000 coins = `coinValueTl` TL), no fee, coins rounded down. The same sum as app/src/lib/coins-bank.ts
 * exchangeOwnDiamonds with the rules in app/src/data/rules.ts; tests/server-catalog.test.ts fails when they drift.
 * `usdTry` and `coinValueTl` are the values in effect: Çevir passes the live ones (live-settings.mjs, Canlı ayarlar);
 * the defaults are the compiled ones. Owners, 24 Nov 2026: USD_TRY 50,62.
 */
// Owners, 24 Nov 2026: 1.000 💎 = 1 USD (was 5.000); the live value is Canlı ayarlar › diamonds_per_usd.
export const EXCHANGE = { diamondsPerUsd: 1_000, usdTry: 50.62, minDiamonds: 100, bankFee: 0.03 };
/** Coins one TL buys at `coinValueTl` TL per 1.000 coins. */
const coinsPerTl = (coinValueTl = COIN_VALUE_TL) => 1000 / coinValueTl;
export const exchangeCoins = (diamonds, usdTry = EXCHANGE.usdTry, coinValueTl = COIN_VALUE_TL, perUsd = EXCHANGE.diamondsPerUsd) =>
  Math.floor(diamonds * ((1 / perUsd) * usdTry * coinsPerTl(coinValueTl)));

/**
 * Ödeme kuru (owners, 24 Nov 2026): the TL a USD is paid at to hosts and agencies (withdrawals, agency payouts, a
 * Jeton Noktası buying a host's diamonds). Canlı ayarlar › payout_usd_try sets it by hand; this is its default.
 */
export const PAYOUT_USD_TRY = 49;
/** TL for `usd` at the payout rate, to the kuruş. */
export const payoutTl = (usd, rate = PAYOUT_USD_TRY) => Math.round(usd * rate * 100) / 100;
/** What diamonds are paid in TL (5.000 💎 = 1 USD at the payout rate): what a Jeton Noktası pays a host for them. */
export const diamondValueTl = (diamonds, rate = PAYOUT_USD_TRY, perUsd = EXCHANGE.diamondsPerUsd) => Math.round((diamonds / perUsd) * rate * 100) / 100;
/**
 * A host sells diamonds to a Jeton Noktası: the bank pays their value at the payout rate and gets coins worth that plus
 * its fee (3 %) at the coin value, rounded down. Same sum as app/src/lib/coins-bank.ts convertDiamonds.
 */
export const bankExchangeCoins = (diamonds, coinValueTl = COIN_VALUE_TL, rate = PAYOUT_USD_TRY, perUsd = EXCHANGE.diamondsPerUsd) =>
  Math.floor(diamonds * ((1 / perUsd) * rate * coinsPerTl(coinValueTl) * (1 + EXCHANGE.bankFee)));
/**
 * What a Jeton Noktası pays management for coins: the wholesale price the panel sets (Canlı ayarlar ›
 * jeton_wholesale_tl, TL per 1.000 coins; owners, 24 Nov 2026: "elle girebilelim, şu an 220₺").
 */
export const WHOLESALE_TL = 220;
export const wholesaleTl = (coins, per1000 = WHOLESALE_TL) => tlOfCoins(coins, per1000);

/**
 * Withdrawals (withdraw.mjs): the smallest and largest request and the most diamonds one person may ask for in
 * 7 days. Same as app/src/data/rules.ts minWithdrawDiamonds, maxWithdrawDiamonds, weeklyWithdrawLimitDiamonds.
 */
// Owners, 24 Nov 2026 (with 1.000 💎 = 1 USD): at least 10 USD, at most 1.000 USD a request, 10.000 USD a week.
export const WITHDRAW = { minDiamonds: 10_000, maxDiamonds: 1_000_000, weeklyDiamonds: 10_000_000 };
export const diamondValueUsd = (diamonds, perUsd = EXCHANGE.diamondsPerUsd) => Math.floor((diamonds / perUsd) * 100) / 100;

/**
 * SVIP level n needs SVIP_XP[n - 1] points (1 purchased coin = 1 point): the compiled values, as the app has them. The
 * server decides with Seviye ayarları (levels.mjs svipLevel), which start from these.
 */
export const SVIP_XP = [500_000, 1_250_000, 2_500_000, 4_000_000, 7_500_000, 15_000_000, 40_000_000, 100_000_000, 210_000_000, 400_000_000];
export const svipLevel = (xp) => SVIP_XP.filter((t) => xp >= t).length;

// --- Mağaza (economy.mjs): what the shop sells, in step with the app (app/src/data/catalog.ts COSMETICS and
// STICKER_PACKS, data/animations.ts mic effects, data/status.ts NOBLE_TIERS); tests/server-catalog.test.ts
// fails when they drift. Sticker packs are 'pack-<id>'. Prices and durations change only with a deploy.
/** [sku, kind, name, price in coins, days (null: permanent), minimum VIP level] */
const SHOP_ROWS = [
  ['fr-neon', 'frame', 'Ses Halkası', 150, 7, 0],
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
  ['fr-wing-rose', 'frame', 'Aşk Kanatları', 3_000, 30, 0],
  ['fr-wing-coral', 'frame', 'Melek Kalp · Pembe', 3_000, 30, 0],
  ['fr-wing-sky', 'frame', 'Melek Kalp · Turkuaz', 3_000, 30, 0],
  ['en-sparkle', 'entry', 'Işıltı', 200, 7, 0],
  ['en-thunder', 'entry', 'Şimşek', 600, 30, 0],
  ['en-comet', 'entry', 'Kuyruklu Yıldız', 1_200, 30, 0],
  ['en-dragon', 'entry', 'Ejderha', 3_000, 30, 7],
  ['en-roket', 'entry', 'Roket', 2_000, 30, 0],
  ['en-ayicik', 'entry', 'Tatlı Ayıcık', 2_500, 30, 0],
  ['en-panda', 'entry', 'Sevimli Panda', 3_000, 30, 0],
  ['en-tac', 'entry', 'Kraliyet Tacı', 4_000, 30, 0],
  ['en-tekboynuz', 'entry', 'Efsanevi Tek Boynuz', 4_000, 30, 0],
  ['en-anka', 'entry', 'Anka Kuşu', 5_000, 30, 0],
  ['en-gemi', 'entry', 'Altın Gemi', 6_000, 30, 0],
  ['en-saray', 'entry', 'Kristal Saray', 7_000, 30, 0],
  ['en-otomobil', 'entry', 'Altın Süper Otomobil', 8_000, 30, 0],
  ['en-aslan', 'entry', 'Altın Aslan', 10_000, 30, 0],
  ['rd-scooter', 'ride', 'Scooter', 250, 7, 0],
  ['rd-sport', 'ride', 'Spor Araba', 1_200, 30, 0],
  ['rd-jet', 'ride', 'Özel Jet', 5_000, 30, 9],
  ['bb-candy', 'bubble', 'Şeker', 120, 7, 0],
  ['bb-galaxy', 'bubble', 'Galaksi', 450, 30, 0],
  ['bb-gold', 'bubble', 'Altın', 1_500, null, 5],
  ['id-777', 'specialId', 'ID 777', 8_000, null, 0],
  ['id-2026', 'specialId', 'ID 2026', 3_000, null, 0],
  ['id-1001', 'specialId', 'ID 1001', 2_000, null, 0],
  // Ses dalgası: the ring around the seat while one talks (app components/room/voice-wave.tsx). Kept for good.
  ['wv-sparkle', 'wave', 'Parıltı', 1_500, null, 0],
  ['wv-flame', 'wave', 'Alev', 2_500, null, 0],
  ['wv-rainbow', 'wave', 'Gökkuşağı', 3_500, null, 0],
  ['wv-gold', 'wave', 'Altın Halka', 5_000, null, 0],
  ['pack-fun', 'sticker', 'Eğlence', 50, null, 0],
  ['pack-love', 'sticker', 'Aşk', 80, null, 0],
  ['pack-animals', 'sticker', 'Hayvanlar', 60, null, 0],
  ['pack-anim', 'sticker', 'Animasyonlu', 150, null, 0],
  ['pack-voice', 'sticker', 'Ses Odası', 80, null, 0],
  ['pack-tea', 'sticker', 'Çay Ocağı', 60, null, 0],
  ['pack-feels', 'sticker', 'Duygular+', 50, null, 0],
  ['pack-party', 'sticker', 'Kutlama', 80, null, 0],
  ['pack-costume', 'sticker', 'Maskot Hayvanlar', 100, null, 0],
  ['pack-penguen', 'sticker', 'Penguen', 150, null, 0],
  ['an-mic-neon', 'micfx', 'Neon Halka', 500, null, 0],
  ['an-mic-stars', 'micfx', 'Dönen Yıldızlar', 800, null, 0],
  ['an-mic-notes', 'micfx', 'Müzik Notaları', 600, null, 0],
  // Rütbe's tiers (21 Nov 2026, the owners' sample screens: Şövalye … Dük; before, Çavuş … Paşa). The 30-day term an
  // older app buys; Seviye ayarları add the 7- and 90-day packages (levels.mjs nobleDefaultPlans).
  ['noble-1', 'noble', 'Şövalye', 15_000, 30, 0],
  ['noble-2', 'noble', 'Vikont', 60_000, 30, 0],
  ['noble-3', 'noble', 'Kont', 150_000, 30, 0],
  ['noble-4', 'noble', 'Markiz', 400_000, 30, 0],
  ['noble-5', 'noble', 'Dük', 1_000_000, 30, 0],
];
export const SHOP = new Map(
  SHOP_ROWS.map(([sku, kind, name, price, days, minVip]) => [sku, Object.freeze({ sku, kind, name, price, days, minVip, tier: kind === 'noble' ? Number(sku.slice(6)) : null })]),
);
/** What a person wears, one each (users.equipped). Sticker packs and noble rank are owned, not worn. */
export const SLOTS = ['frame', 'entry', 'ride', 'bubble', 'specialId', 'micfx', 'wave'];
/** One of a kind: bought coins only, never reward coins. */
export const PAID_ONLY = ['specialId'];
/** Mic effects anyone may wear without buying. */
export const FREE_MICFX = ['an-mic-wave'];
/** A timed term may not end further ahead than this. */
export const MAX_AHEAD_DAYS = 365;
/** VIP level as the app shows it (store.tsx) by the compiled values; the server's is levels.mjs vipLevelOf. */
// Rütbe adds nothing to it (levels.mjs vipLevelOf, 21 Nov 2026); `nobleTier` is kept for the callers.
export const vipLevelOf = (svipXp, nobleTier) => svipLevel(Number(svipXp) || 0);
/** The history line of a shop charge. Never 'Uygulama içi:' (the old apps' free-text spends). */
export function labelOf(item) {
  if (item.kind === 'sticker') return `Çıkartma paketi: ${item.name}`;
  if (item.kind === 'micfx') return `Mikrofon efekti: ${item.name}`;
  if (item.kind === 'noble') return `Rütbe: ${item.name} (${item.days} gün)`;
  return `Mağaza: ${item.name}${item.days ? ` (${item.days} gün)` : ''}`;
}

// --- Koltuk rengi (room-seat-color.mjs): the color of a room's empty mics, bought for the room by its owner; silver
// is the free default (the owner's request, 17 Nov: soft colors, light pink, khaki, silver for every room). The app
// draws a seat in any color (its cushion tinted, its gold kept), so Yönetim › Mağaza › Koltuk renkleri changes these
// (name, price, days, color) and adds more (shop-items.mjs kind seat). In step with the app (app/src/data/
// seat-colors.ts SEAT_COLORS); the catalog test fails when they drift.
/** [id, name, price in coins, color] */
const SEAT_COLOR_ROWS = [
  ['gumus', 'Gümüş', 0, '#D5DAE1'],
  ['pembe', 'Açık Pembe', 2_000, '#F4B6C8'],
  ['kirmizi', 'Kırmızı', 2_000, '#D2453F'],
  ['turuncu', 'Turuncu', 2_000, '#EE9447'],
  ['yesil', 'Haki', 2_000, '#9C9A6A'],
  ['turkuaz', 'Turkuaz', 2_000, '#46B3B0'],
];
export const SEAT_COLORS = new Map(SEAT_COLOR_ROWS.map(([id, name, price, color]) => [id, Object.freeze({ id, name, price, color })]));
/** Every room's color until its owner picks another (stored as none). */
export const SEAT_DEFAULT = 'gumus';
/**
 * What an older app shows for each color (its compiled list, before the panel): it sends no price, so it may buy a
 * color only while the server's price is this one and the color is kept for good; else it is told to update.
 */
export const SEAT_PRICES_OLD_APP = Object.freeze({ turkuaz: 0, pembe: 2_000, kirmizi: 2_000, turuncu: 2_000, yesil: 2_000, gumus: 3_000 });

// --- Hareketli in rooms (room-fx.mjs): the paid room animations, in step with the app (app/src/data/animations.ts
// rows of type reaction, gift and fullscreen with a price); tests/server-catalog.test.ts fails when they drift.
// Free reactions go phone to phone and never reach the server. A campaign row sells only inside its window
// (UTC dates, like the app's isLive). Prices change only with a deploy.
/** [id, name, price in coins, first day (null: always), last day] */
const ROOM_ANIM_ROWS = [
  ['an-butterfly', 'Kelebekler', 20, null, null],
  ['an-bouquet', 'Gül Buketi', 99, null, null],
  ['an-panda', 'Dans Eden Panda', 150, null, null],
  ['an-crown', 'Kraliyet Tacı', 500, null, null],
  ['an-chest', 'Hazine Sandığı', 300, null, null],
  ['an-heart-rain', 'Kalp Yağmuru', 999, null, null],
  ['an-coin-rain', 'Altın Yağmuru', 1_999, null, null],
  ['an-diamond-rain', 'Elmas Yağmuru', 2_999, null, null],
  ['an-supercar', 'Spor Araba', 4_999, null, null],
  ['an-jet', 'Özel Jet', 9_999, null, null],
  ['an-dragon', 'Ejderha', 19_999, null, null],
  ['an-rocket', 'Roket Fırlatma', 2_499, null, null],
  ['an-fireworks', 'Havai Fişek', 1_499, null, null],
  ['an-newyear', 'Yılbaşı Kutlaması', 999, '2026-12-20', '2027-01-07'],
];
export const ROOM_ANIMS = new Map(ROOM_ANIM_ROWS.map(([id, name, price, from, until]) => [id, Object.freeze({ id, name, price, from, until })]));
/** On sale on `now`'s UTC date (the app's lib/animations isLive reads the same date). */
export const animOnSale = (a, now = new Date()) => {
  const d = now.toISOString().slice(0, 10);
  return !(a.from && d < a.from) && !(a.until && d > a.until);
};

// --- A server room's look (rooms.mjs POST /api/rooms/update), in step with app/src/data/catalog.ts ROOM_BACKGROUNDS
// and ROOM_THEMES; tests/server-catalog.test.ts fails when they drift. A cover opens at its room level.
export const ROOM_COVERS = [
  { id: 'bg1', minLevel: 1 },
  { id: 'bg2', minLevel: 2 },
  { id: 'bg3', minLevel: 4 },
  { id: 'bg4', minLevel: 7 },
];
export const ROOM_THEMES = ['chat', 'pk', 'music', 'game', 'party', 'friends'];

// --- Oda süslemesi › Ücretli (room-decor.mjs): the paid room backgrounds, in step with the app (app/src/data/catalog.ts
// ROOM_BG_PAID); tests/server-catalog.test.ts fails when they drift. Owned like a shop item (entitlements, kind
// 'roombg'), at the shop's 30-day price levels. `sale`: the picture is in the released app, so it may be bought. None
// is yet (docs/GORSEL_URETIM_LISTESI.md §14 asks for them): the shelf shows them as "yakında". A test or staging
// server sells them all with ROOM_BG_PREVIEW=1. Prices and durations change only with a deploy.
/** [sku, name, price in coins, days, on sale] */
const ROOM_BG_ROWS = [
  ['rb-yildiz', 'Yıldızlı Gece', 600, 30, false],
  ['rb-neon', 'Neon Sokak', 900, 30, false],
  ['rb-konser', 'Konser Sahnesi', 900, 30, false],
  ['rb-teras', 'Teras Partisi', 1_200, 30, false],
  ['rb-galaksi', 'Galaksi', 1_200, 30, false],
  ['rb-salon', 'Altın Salon', 2_000, 30, false],
];
export const ROOM_BGS = new Map(ROOM_BG_ROWS.map(([sku, name, price, days, sale]) => [sku, Object.freeze({ sku, kind: 'roombg', name, price, days, tier: null, minVip: 0, sale })]));
