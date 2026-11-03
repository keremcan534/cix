// Status systems: İnci (SVIP, recharge experience), VIP (subscription), Rütbe (noble, monthly title).
import type { ArtName } from '@/components/Art';

// --- İnci (SVIP): 1 recharged coin = 1 experience point; levels never expire ---------------
export const SVIP_LEVELS = [
  { level: 1, xp: 500_000, rights: 2, colors: ['#134E4A', '#0F172A'] as [string, string], emoji: '💠', art: 'svip-01' as ArtName },
  { level: 2, xp: 1_250_000, rights: 3, colors: ['#14532D', '#052E16'] as [string, string], emoji: '🟢', art: 'svip-02' as ArtName },
  { level: 3, xp: 2_500_000, rights: 4, colors: ['#065F46', '#022C22'] as [string, string], emoji: '🔷', art: 'svip-03' as ArtName },
  { level: 4, xp: 4_000_000, rights: 6, colors: ['#1E3A8A', '#0B1437'] as [string, string], emoji: '🔹', art: 'svip-04' as ArtName },
  { level: 5, xp: 7_500_000, rights: 7, colors: ['#78350F', '#1C0F05'] as [string, string], emoji: '🏵️', art: 'svip-05' as ArtName },
  { level: 6, xp: 15_000_000, rights: 8, colors: ['#7F1D1D', '#1F0707'] as [string, string], emoji: '🎖️', art: 'svip-06' as ArtName },
  { level: 7, xp: 40_000_000, rights: 10, colors: ['#4C1D95', '#140A2E'] as [string, string], emoji: '🔮', art: 'svip-07' as ArtName },
  { level: 8, xp: 100_000_000, rights: 11, colors: ['#3F3F46', '#09090B'] as [string, string], emoji: '⚜️', art: 'svip-08' as ArtName },
  { level: 9, xp: 210_000_000, rights: 12, colors: ['#9F1239', '#2A0510'] as [string, string], emoji: '👑', art: 'svip-09' as ArtName },
  { level: 10, xp: 400_000_000, rights: 14, colors: ['#BE185D', '#312E81'] as [string, string], emoji: '🌈', art: 'svip-10' as ArtName },
];
export const svipLevelOf = (xp: number) => SVIP_LEVELS.filter((l) => xp >= l.xp).length;
export type RightGroup = 'Görünüm' | 'Odada' | 'Sosyal' | 'Destek';
/** Ordered so that İnci n has the first `rights` entries (entry notice from İnci 1, gifts from İnci 2). */
export const SVIP_RIGHTS: { name: string; emoji: string; group: RightGroup; art?: ArtName }[] = [
  { name: 'Özel giriş duyurusu', emoji: '✨', group: 'Odada', art: 'ayricalik-giris-ekrani-kayan-yazi' },
  { name: 'İnci rozeti', emoji: '🎖️', group: 'Görünüm', art: 'ayricalik-svip-rozeti' },
  { name: 'Üyelere özel hediyeler', emoji: '🎁', group: 'Odada', art: 'ayricalik-svip-e-ozel-hediye' },
  { name: 'Renkli sohbet balonu', emoji: '🎨', group: 'Görünüm', art: 'ayricalik-genel-sohbet-balonu' },
  { name: 'Profil çerçevesi', emoji: '🖼️', group: 'Görünüm', art: 'ayricalik-profil-cercevesi' },
  { name: 'Puanla alışveriş', emoji: '🏪', group: 'Destek', art: 'ayricalik-puan-takas-magazasi' },
  { name: 'Profil kartı çerçevesi', emoji: '🪪', group: 'Görünüm', art: 'ayricalik-bilgi-karti-cercevesi' },
  { name: 'Hediye serisi efekti', emoji: '🔥', group: 'Odada', art: 'ayricalik-hediye-combo-skin' },
  { name: 'Kendi unvanını yaz', emoji: '✏️', group: 'Görünüm', art: 'ayricalik-diy-unvani' },
  { name: 'Sessiz ziyaret', emoji: '🥷', group: 'Sosyal', art: 'ayricalik-gizli-ziyaret' },
  { name: 'Dolu odaya girebilme', emoji: '🚪', group: 'Odada' },
  { name: 'Mesaj çevirisi', emoji: '🔤', group: 'Sosyal' },
  { name: 'Yüklemede indirim', emoji: '💸', group: 'Destek', art: 'ayricalik-yukleme-indirimi' },
  { name: 'Öncelikli destek', emoji: '🎧', group: 'Destek', art: 'ayricalik-ozel-musteri-temsilcisi' },
];

// --- Rütbe (noble): bought with coins for 30 days -------------------------------------
export const NOBLE_TIERS = [
  { tier: 1, name: 'Gemici', emoji: '🛡️', art: 'asil-1-sovalye' as ArtName, price: 15_000, rights: 4, colors: ['#94A3B8', '#334155'] as [string, string] },
  { tier: 2, name: 'Dümenci', emoji: '🗡️', art: 'asil-2-vikont' as ArtName, price: 60_000, rights: 6, colors: ['#2DD4BF', '#0F766E'] as [string, string] },
  { tier: 3, name: 'Lostromo', emoji: '⚔️', art: 'asil-3-kont' as ArtName, price: 150_000, rights: 8, colors: ['#60A5FA', '#1D4ED8'] as [string, string] },
  { tier: 4, name: 'Amiral', emoji: '🏹', art: 'asil-4-markiz' as ArtName, price: 400_000, rights: 10, colors: ['#F472B6', '#BE123C'] as [string, string] },
  { tier: 5, name: 'Kaptan-ı Derya', emoji: '🦁', art: 'asil-5-duk' as ArtName, price: 1_000_000, rights: 12, colors: ['#FCD34D', '#B45309'] as [string, string] },
];
export const NOBLE_DAYS = 30;
/** Ordered so that tier n has the first `rights` entries; GATES below read rights by name. */
export const NOBLE_RIGHTS: { name: string; emoji: string; art?: ArtName }[] = [
  { name: 'Rütbe Nişanı', emoji: '🏅', art: 'ayricalik-asil-madalyasi' },
  { name: 'Rütbe etiketi', emoji: '🔖', art: 'ayricalik-asil-etiketi' },
  { name: 'Oda kilitleme', emoji: '🔒', art: 'ayricalik-oda-kilitleme' },
  { name: 'Giriş karşılaması', emoji: '🌟', art: 'ayricalik-giris-ekrani' },
  { name: 'Profil çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi' },
  { name: 'Sohbet balonu', emoji: '💬', art: 'ayricalik-sohbet-balonu' },
  { name: 'Odada ayrılmış koltuk', emoji: '🛋️', art: 'ayricalik-asil-koltugu' },
  { name: 'Binekler', emoji: '🚘', art: 'ayricalik-araclar' },
  { name: 'Gizli oda girişi', emoji: '👻' },
  { name: 'Arkadaşına jeton gönder', emoji: '💗', art: 'ayricalik-jeton-hediye-et' },
  { name: 'Sıralamada gizli kalma', emoji: '🕵️' },
  { name: 'Tayfa içinde görünmezlik', emoji: '🎭' },
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
  ['Sesli eşleşme', '1.750 Jeton / dakika', 'Günde 1 ücretsiz'],
  ['Görüntülü eşleşme', '2.500 Jeton / dakika', 'Günde 1 ücretsiz'],
  ['Profiline bakanları gör', false, true],
  ['Altın renkli isim', false, true],
  ['VIP madalyası', false, true],
  ['Ek giriş ödülü', false, true],
  ['Hoş Geldin Kutusu', false, true],
  ['Seviyeleri gizle', false, true],
];
/** "VIP Ayrıcalıkları" carousel (Ionicons names). */
export const VIP_PERKS: { name: string; desc: string; icon: string }[] = [
  { name: 'Arama indirimi', desc: 'Aramalarda %20 indirim', icon: 'call' },
  { name: 'Ziyaretçiler', desc: 'Profiline bakanları gör', icon: 'eye' },
  { name: 'Altın renkli isim', desc: 'Adın her yerde altın renginde görünür', icon: 'sparkles' },
  { name: 'Ek ödül', desc: 'Günlük girişte fazladan ödül', icon: 'ribbon' },
  { name: 'Eşleşme', desc: 'Her gün 1 ücretsiz sesli ve görüntülü eşleşme', icon: 'shuffle' },
  { name: 'VIP madalyası', desc: 'Profilinde parlayan madalya', icon: 'medal' },
  { name: 'Hoş Geldin Kutusu', desc: 'Her planla gelen hediyeler', icon: 'gift' },
  { name: 'Seviyeleri gizle', desc: 'Cömertlik ve Yankı seviyeni gizle', icon: 'eye-off' },
];
/** "Hoş Geldin Kutusu": granted with every plan. */
export const VIP_GIFT_PACK: { name: string; emoji: string; art: ArtName; days: number; qty: number }[] = [
  { name: 'VIP Sohbet Balonu', emoji: '💬', art: 'ayricalik-sohbet-balonu', days: 7, qty: 1 },
  { name: 'VIP Giriş Efekti', emoji: '✨', art: 'ayricalik-giris-ekrani', days: 7, qty: 1 },
];

// --- Gates used across the app (admin-configurable in the real product) -------------------
export const GATES = {
  /** Game center: İnci 2 or Dümenci+ */
  games: (svip: number, noble: number) => svip >= 2 || noble >= 2,
  /** Invisible room entry: Rütbe right "Gizli oda girişi" (Amiral+) */
  invisibleEntry: (noble: number) => hasNobleRight(noble, 'Gizli oda girişi'),
  /** Entry banner: Rütbe "Giriş karşılaması" or İnci "Özel giriş duyurusu" */
  entryBanner: (svip: number, noble: number) => noble >= 1 || svip >= 1,
  /** Room lock via a Rütbe tier */
  roomLock: (noble: number) => hasNobleRight(noble, 'Oda kilitleme'),
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
