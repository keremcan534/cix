// Global hediye's numbers (global-gifts.mjs, docs/HEDIYE_YONETIMI.md "Global hediye") as Canlı ayarlar entries
// (live-registry.mjs, the room keys' shape): the price from which the admins may mark a gift global, and how long the
// platform waits between two announcements. Pure, like the registry, so the app's tests can import it.
export const GLOBAL_GIFT_GROUP = 'Global hediye';
export const GLOBAL_GIFT_AMOUNTS = {
  global_gift_min_price: {
    group: GLOBAL_GIFT_GROUP,
    field: 'globalGiftMinPrice',
    label: 'Global hediye: en düşük fiyat',
    default: 300_000,
    // Up to the highest gift price Yönetim › Hediyeler allows (custom-gifts.mjs LIMITS.priceMax); doubling or halving
    // it asks twice.
    bounds: { min: 1_000, max: 1_000_000, step: 1_000, money: true },
    unit: ' jeton',
    help: 'Yönetim › Hediyeler’de bir hediye yalnız bu fiyattan itibaren "Global" işaretlenebilir; global hediye gönderilince ülkedeki bütün odalarda duyurulur. Yükseltirseniz altında kalan global hediyeler duyurulmaz (işaretleri durur).',
    text: (a, b) => `Global hediye en az ${a} → ${b} jeton. Altında kalan global hediyeler duyurulmaz.`,
  },
  global_gift_gap_seconds: {
    group: GLOBAL_GIFT_GROUP,
    field: 'globalGiftGapSeconds',
    label: 'Global hediye: iki duyuru arası (saniye)',
    default: 10,
    bounds: { min: 0, max: 600, step: 1 },
    unit: ' saniye',
    help: 'Bütün odalara en çok bu kadar saniyede bir global hediye duyurusu gider. Beklerken aynı kişinin aynı kişiye aynı hediyesi tek duyuruda toplanır (×3 gibi). 0: beklemeden.',
    text: (a, b) => `Global hediye duyuruları arası ${a} → ${b} saniye.`,
  },
};
