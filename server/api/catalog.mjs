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
export const GIFT_COUNTS = [1, 10, 66, 99, 188, 520, 1314];

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

/** SVIP level n needs SVIP_XP[n - 1] points (1 purchased coin = 1 point). */
export const SVIP_XP = [500_000, 1_250_000, 2_500_000, 4_000_000, 7_500_000, 15_000_000, 40_000_000, 100_000_000, 210_000_000, 400_000_000];
export const svipLevel = (xp) => SVIP_XP.filter((t) => xp >= t).length;
