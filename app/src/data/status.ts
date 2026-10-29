// Status systems: SVIP (recharge experience), VIP (subscription), Asil/Noble (monthly title).
import type { ArtName } from '@/components/Art';

// --- SVIP: 1 recharged coin = 1 experience point; levels never expire ---------------
export const SVIP_LEVELS = [
  { level: 1, xp: 500_000, rights: 8, colors: ['#134E4A', '#0F172A'] as [string, string], emoji: '💠', art: 'svip-01' as ArtName },
  { level: 2, xp: 1_250_000, rights: 10, colors: ['#14532D', '#052E16'] as [string, string], emoji: '🟢', art: 'svip-02' as ArtName },
  { level: 3, xp: 2_500_000, rights: 12, colors: ['#065F46', '#022C22'] as [string, string], emoji: '🔷', art: 'svip-03' as ArtName },
  { level: 4, xp: 4_000_000, rights: 15, colors: ['#1E3A8A', '#0B1437'] as [string, string], emoji: '🔹', art: 'svip-04' as ArtName },
  { level: 5, xp: 7_500_000, rights: 18, colors: ['#78350F', '#1C0F05'] as [string, string], emoji: '🏵️', art: 'svip-05' as ArtName },
  { level: 6, xp: 15_000_000, rights: 21, colors: ['#7F1D1D', '#1F0707'] as [string, string], emoji: '🎖️', art: 'svip-06' as ArtName },
  { level: 7, xp: 40_000_000, rights: 23, colors: ['#4C1D95', '#140A2E'] as [string, string], emoji: '🔮', art: 'svip-07' as ArtName },
  { level: 8, xp: 100_000_000, rights: 26, colors: ['#3F3F46', '#09090B'] as [string, string], emoji: '⚜️', art: 'svip-08' as ArtName },
  { level: 9, xp: 210_000_000, rights: 27, colors: ['#9F1239', '#2A0510'] as [string, string], emoji: '👑', art: 'svip-09' as ArtName },
  { level: 10, xp: 400_000_000, rights: 28, colors: ['#BE185D', '#312E81'] as [string, string], emoji: '🌈', art: 'svip-10' as ArtName },
];
export const svipLevelOf = (xp: number) => SVIP_LEVELS.filter((l) => xp >= l.xp).length;
/** Ordered so that SVIP n has the first `rights` entries. */
export const SVIP_RIGHTS: { name: string; emoji: string; art?: ArtName }[] = [
  { name: 'Puan Takas Mağazası', emoji: '🏪', art: 'ayricalik-puan-takas-magazasi' },
  { name: 'SVIP Etiket', emoji: '🏷️', art: 'ayricalik-svip-etiket' },
  { name: 'Yükseltme bildirimleri', emoji: '📣', art: 'ayricalik-yukseltme-bildirimleri' },
  { name: 'SVIP rozeti', emoji: '🎖️', art: 'ayricalik-svip-rozeti' },
  { name: 'Genel sohbet balonu', emoji: '🎨', art: 'ayricalik-genel-sohbet-balonu' },
  { name: 'Profil çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi' },
  { name: 'Giriş ekranı kayan yazı', emoji: '✨', art: 'ayricalik-giris-ekrani-kayan-yazi' },
  { name: 'Özel ürünü satın al', emoji: '🛍️', art: 'ayricalik-ozel-urunu-satin-al' },
  { name: 'Araç', emoji: '🚗', art: 'ayricalik-arac' },
  { name: "SVIP'e özel hediye", emoji: '🎁', art: 'ayricalik-svip-e-ozel-hediye' },
  { name: 'Ücretsiz yayın sayısı', emoji: '🆓' },
  { name: 'Bilgi kartı çerçevesi', emoji: '🪪', art: 'ayricalik-bilgi-karti-cercevesi' },
  { name: 'Servet Puanı Bonusu', emoji: '💰', art: 'ayricalik-servet-puani-bonusu' },
  { name: 'DIY unvanı', emoji: '✏️', art: 'ayricalik-diy-unvani' },
  { name: 'Oda Profil Arka Planı', emoji: '🏞️', art: 'ayricalik-oda-profil-arka-plani' },
  { name: 'Profil hediyesi', emoji: '💝', art: 'ayricalik-profil-hediyesi' },
  { name: 'Özel müşteri temsilcisi', emoji: '🎧', art: 'ayricalik-ozel-musteri-temsilcisi' },
  { name: 'Kişisel albüm animasyonlu görsel', emoji: '🎞️', art: 'ayricalik-kisisel-album-animasyonlu-gorsel' },
  { name: 'Profil aracı', emoji: '🏎️', art: 'ayricalik-profil-araci' },
  { name: 'Yükleme indirimi', emoji: '💸', art: 'ayricalik-yukleme-indirimi' },
  { name: 'Hediye Combo Skin', emoji: '🔥', art: 'ayricalik-hediye-combo-skin' },
  { name: 'Gizli ziyaret', emoji: '🥷', art: 'ayricalik-gizli-ziyaret' },
  { name: 'Özel oda kapağı', emoji: '🖼️', art: 'ayricalik-ozel-oda-kapagi' },
  { name: 'Renkli takma ad', emoji: '🌈' },
  { name: 'AI hediye', emoji: '🤖' },
  { name: 'Doğum günü hediyesi', emoji: '🎂' },
  { name: 'Profil Sayfası Çerçevesi', emoji: '🪞' },
  { name: 'Profil Sayfası Arka Planı', emoji: '🌌' },
  { name: 'Özel ID', emoji: '🔢' },
  { name: 'Etkinlik önceliği', emoji: '⏫' },
  { name: 'Kişiye özel tasarım hediye', emoji: '💎' },
];

// --- Asil (Noble): bought with coins for 30 days -------------------------------------
export const NOBLE_TIERS = [
  { tier: 1, name: 'Şövalye', emoji: '🛡️', art: 'asil-1-sovalye' as ArtName, price: 15_000, rights: 9, colors: ['#94A3B8', '#334155'] as [string, string] },
  { tier: 2, name: 'Vikont', emoji: '🗡️', art: 'asil-2-vikont' as ArtName, price: 60_000, rights: 15, colors: ['#2DD4BF', '#0F766E'] as [string, string] },
  { tier: 3, name: 'Kont', emoji: '⚔️', art: 'asil-3-kont' as ArtName, price: 150_000, rights: 19, colors: ['#60A5FA', '#1D4ED8'] as [string, string] },
  { tier: 4, name: 'Markiz', emoji: '🏹', art: 'asil-4-markiz' as ArtName, price: 400_000, rights: 24, colors: ['#F472B6', '#BE123C'] as [string, string] },
  { tier: 5, name: 'Dük', emoji: '🦁', art: 'asil-5-duk' as ArtName, price: 1_000_000, rights: 27, colors: ['#FCD34D', '#B45309'] as [string, string] },
];
export const NOBLE_DAYS = 30;
export const NOBLE_RIGHTS: { name: string; emoji: string; art?: ArtName; isNew?: boolean }[] = [
  { name: 'Jeton Hediye Et', emoji: '💗', art: 'ayricalik-jeton-hediye-et', isNew: true },
  { name: 'VIP Listesi', emoji: '👑', art: 'ayricalik-vip-listesi' },
  { name: 'Araçlar', emoji: '🚘', art: 'ayricalik-araclar' },
  { name: 'Noble Madalyası', emoji: '🏅', art: 'ayricalik-asil-madalyasi' },
  { name: 'Asil Etiketi', emoji: '🔖', art: 'ayricalik-asil-etiketi' },
  { name: 'Profil Çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi' },
  { name: 'Giriş Ekranı', emoji: '🌟', art: 'ayricalik-giris-ekrani' },
  { name: 'Oda Kilitleme', emoji: '🔒', art: 'ayricalik-oda-kilitleme' },
  { name: 'Oda Üyesi Asil Koltuğu', emoji: '🛋️', art: 'ayricalik-asil-koltugu' },
  { name: 'Özel arka plan', emoji: '🏞️', art: 'ayricalik-ozel-arka-plan', isNew: true },
  { name: 'Özel Hediyeler', emoji: '🎁', art: 'ayricalik-ozel-hediyeler' },
  { name: 'Sohbet balonu', emoji: '💬', art: 'ayricalik-sohbet-balonu' },
  { name: 'Profil kart çerçevesi', emoji: '🪪', art: 'ayricalik-profil-kart-cercevesi' },
  { name: 'Oda Kartı', emoji: '🗂️' },
  { name: 'Oda Kenarlığı', emoji: '🔲' },
  { name: 'Özel Emoji Paketleri', emoji: '😊' },
  { name: 'Dinamik Oda Kapağı', emoji: '🎞️', isNew: true },
  { name: 'Renkli kullanıcı adı', emoji: '🌈' },
  { name: 'Gizli Ziyaret', emoji: '🎭' },
  { name: 'Tam Dolu Odalar', emoji: '🚪' },
  { name: 'Çevrimiçi Gizlilik', emoji: '🫥' },
  { name: 'Ulusal Dolaşım', emoji: '🌍' },
  { name: 'Lider Tablosu Gizemli Kişi Kimliği', emoji: '🕵️' },
  { name: 'Gizli Oda Girişi', emoji: '👻' },
  { name: 'Yayın Engelleme', emoji: '🔇' },
  { name: 'Klan Gizliliği', emoji: '🎭', isNew: true },
  { name: 'Metin Çevirisi', emoji: '🔤' },
];
export const nobleInfo = (tier: number) => NOBLE_TIERS.find((t) => t.tier === tier);
export const hasNobleRight = (tier: number, name: string) => {
  const t = nobleInfo(tier);
  return !!t && NOBLE_RIGHTS.findIndex((r) => r.name === name) < t.rights;
};

// --- VIP subscription (store subscription, priced in TRY) -------------------------------
// `tl` is the store price and `was` the struck-through list price; the badge shows the saving.
export const VIP_PLANS = [
  { days: 7, tl: 145, was: 299, label: '7 Gün' },
  { days: 30, tl: 285, was: 1_199, label: '1 Ay' },
  { days: 90, tl: 599, was: 3_599, label: '3 Ay' },
].map((p) => ({ ...p, save: Math.floor((1 - p.tl / p.was) * 100) }));
/** Comparison table; `true` / `false` render as a check / cross. */
export const VIP_COMPARE: [string, string | boolean, string | boolean][] = [
  ['Sesli sohbet', '2.000 Jeton / dakika', '%20 indirim'],
  ['Görüntülü sohbet', '3.000 Jeton / dakika', '%20 indirim'],
  ['Ses eşleşmesi', '1.750 Jeton / dakika', 'Her gün ücretsiz 1 kez'],
  ['Video eşleşmesi', '2.500 Jeton / dakika', 'Her gün ücretsiz 1 kez'],
  ['Ziyaretçileri görüntüle', false, true],
  ['Altın takma adı', false, true],
  ['Premium madalya', false, true],
  ['Ekstra ödül', false, true],
  ['VIP hediye paketi', false, true],
  ['Seviyeleri gizle', false, true],
];
/** "VIP Ayrıcalıkları" carousel (Ionicons names). */
export const VIP_PERKS: { name: string; desc: string; icon: string }[] = [
  { name: 'Çağrı İndirimi', desc: 'Özel indirimden yararlanarak her aramada %20 indirim kazanmak', icon: 'call' },
  { name: 'Ziyaretçiler', desc: 'Sizi ziyaret eden kullanıcıları bulundurun', icon: 'eye' },
  { name: 'Altın Takma Adı', desc: 'Gösterilen özel takma adı', icon: 'sparkles' },
  { name: 'Ekstra ödül', desc: 'Ekstra check-in ödülü', icon: 'ribbon' },
  { name: 'Eşleşme', desc: 'Her gün 1 ücretsiz ses ve video eşleşmesi', icon: 'shuffle' },
  { name: 'Premium Madalya', desc: 'Profilde parlayan VIP madalyası', icon: 'medal' },
  { name: 'Hediye Paketi', desc: 'Üyelik büyük hediye paketi', icon: 'gift' },
  { name: 'Seviyeleri gizle', desc: 'Zenginlik ve cazibe seviyeni gizle', icon: 'eye-off' },
];
/** "Üyelik Büyük Hediye Paketi": granted with every plan. */
export const VIP_GIFT_PACK: { name: string; emoji: string; days: number; qty: number }[] = [
  { name: 'LOVE', emoji: '💝', days: 7, qty: 1 },
  { name: 'vip', emoji: '🏷️', days: 7, qty: 1 },
  { name: 'VIP Sohbet Balonu', emoji: '💬', days: 7, qty: 1 },
  { name: 'VIP Giriş Efekti', emoji: '✨', days: 7, qty: 1 },
];
/** Masked "x***y N Gün pakete abone oldu" ticker lines. */
export const VIP_TICKER: [string, number][] = [
  ['s***n', 7],
  ['N***0', 90],
  ['Y***z', 30],
  ['e***n', 90],
  ['M***a', 7],
];

// --- Gates used across the app (admin-configurable in the real product) -------------------
export const GATES = {
  /** Game center: SVIP2 or Vikont+ */
  games: (svip: number, noble: number) => svip >= 2 || noble >= 2,
  /** Invisible room entry: Asil right "Gizli Oda Girişi" (Markiz+) */
  invisibleEntry: (noble: number) => hasNobleRight(noble, 'Gizli Oda Girişi'),
  /** Entry banner: Asil "Giriş Ekranı" or SVIP "Giriş ekranı kayan yazı" */
  entryBanner: (svip: number, noble: number) => noble >= 1 || svip >= 1,
  /** Room lock via nobility ("veya soyluluk") */
  roomLock: (noble: number) => hasNobleRight(noble, 'Oda Kilitleme'),
};

// --- Recharge packs (TRY, store prices) -------------------------------------------------
// Priced for 5.000 diamonds = 1 USD: small packs cost a little more per coin, big packs cost the least
// (1.000.000 coins = 23.599,99 TL). Every pack leaves the company a margin even if all its coins are gifted.
// `tl` is the store price; prices are snapped to the App Store's TRY price points before release.
const PACK_LIST: { id: string; coins: number; tl: number; firstBonus?: number }[] = [
  { id: 'p1', coins: 1_000, firstBonus: 1_000, tl: 29.99 },
  { id: 'p2', coins: 5_000, firstBonus: 2_500, tl: 139.99 },
  { id: 'p3', coins: 10_000, tl: 269.99 },
  { id: 'p4', coins: 20_000, tl: 519.99 },
  { id: 'p5', coins: 50_000, tl: 1_279.99 },
  { id: 'p6', coins: 100_000, tl: 2_499.99 },
  { id: 'p7', coins: 200_000, tl: 4_899.99 },
  { id: 'p8', coins: 500_000, tl: 11_999.99 },
  { id: 'p9', coins: 1_000_000, tl: 23_599.99 },
];
export const RECHARGE_PACKS = PACK_LIST.map((p) => ({ ...p, price: `${p.tl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` }));
export type RechargePack = (typeof RECHARGE_PACKS)[number] & { bonus?: number };
