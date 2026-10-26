// Status systems: SVIP (recharge experience), VIP (subscription), Asil/Noble (monthly title).
import { DM_PRICE } from '@/data/mock';

// --- SVIP: 1 recharged coin = 1 experience point; levels never expire ---------------
export const SVIP_LEVELS = [
  { level: 1, xp: 500_000, rights: 8, colors: ['#134E4A', '#0F172A'] as [string, string], emoji: '💠' },
  { level: 2, xp: 1_250_000, rights: 10, colors: ['#14532D', '#052E16'] as [string, string], emoji: '🟢' },
  { level: 3, xp: 2_500_000, rights: 12, colors: ['#065F46', '#022C22'] as [string, string], emoji: '🔷' },
  { level: 4, xp: 4_000_000, rights: 15, colors: ['#1E3A8A', '#0B1437'] as [string, string], emoji: '🔹' },
  { level: 5, xp: 7_500_000, rights: 18, colors: ['#78350F', '#1C0F05'] as [string, string], emoji: '🏵️' },
  { level: 6, xp: 15_000_000, rights: 21, colors: ['#7F1D1D', '#1F0707'] as [string, string], emoji: '🎖️' },
  { level: 7, xp: 40_000_000, rights: 23, colors: ['#4C1D95', '#140A2E'] as [string, string], emoji: '🔮' },
  { level: 8, xp: 100_000_000, rights: 26, colors: ['#3F3F46', '#09090B'] as [string, string], emoji: '⚜️' },
  { level: 9, xp: 210_000_000, rights: 27, colors: ['#9F1239', '#2A0510'] as [string, string], emoji: '👑' },
  { level: 10, xp: 400_000_000, rights: 28, colors: ['#BE185D', '#312E81'] as [string, string], emoji: '🌈' },
];
export const svipLevelOf = (xp: number) => SVIP_LEVELS.filter((l) => xp >= l.xp).length;
/** Ordered so that SVIP n has the first `rights` entries. */
export const SVIP_RIGHTS: { name: string; emoji: string }[] = [
  { name: 'Puan Takas Mağazası', emoji: '🏪' },
  { name: 'SVIP Etiket', emoji: '🏷️' },
  { name: 'Yükseltme bildirimleri', emoji: '📣' },
  { name: 'SVIP rozeti', emoji: '🎖️' },
  { name: 'Genel sohbet balonu', emoji: '🎨' },
  { name: 'Profil çerçevesi', emoji: '🖼️' },
  { name: 'Giriş ekranı kayan yazı', emoji: '✨' },
  { name: 'Özel ürünü satın al', emoji: '🛍️' },
  { name: 'Araç', emoji: '🚗' },
  { name: "SVIP'e özel hediye", emoji: '🎁' },
  { name: 'Ücretsiz yayın sayısı', emoji: '🆓' },
  { name: 'Bilgi kartı çerçevesi', emoji: '🪪' },
  { name: 'Servet Puanı Bonusu', emoji: '💰' },
  { name: 'DIY unvanı', emoji: '✏️' },
  { name: 'Oda Profil Arka Planı', emoji: '🏞️' },
  { name: 'Profil hediyesi', emoji: '💝' },
  { name: 'Özel müşteri temsilcisi', emoji: '🎧' },
  { name: 'Kişisel albüm animasyonlu görsel', emoji: '🎞️' },
  { name: 'Profil aracı', emoji: '🏎️' },
  { name: 'Yükleme indirimi', emoji: '💸' },
  { name: 'Hediye Combo Skin', emoji: '🔥' },
  { name: 'Gizli ziyaret', emoji: '🥷' },
  { name: 'Özel oda kapağı', emoji: '🖼️' },
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
  { tier: 1, name: 'Şövalye', emoji: '🛡️', price: 15_000, rights: 9, colors: ['#94A3B8', '#334155'] as [string, string] },
  { tier: 2, name: 'Vikont', emoji: '🗡️', price: 60_000, rights: 15, colors: ['#2DD4BF', '#0F766E'] as [string, string] },
  { tier: 3, name: 'Kont', emoji: '⚔️', price: 150_000, rights: 19, colors: ['#60A5FA', '#1D4ED8'] as [string, string] },
  { tier: 4, name: 'Markiz', emoji: '🏹', price: 400_000, rights: 24, colors: ['#F472B6', '#BE123C'] as [string, string] },
  { tier: 5, name: 'Dük', emoji: '🦁', price: 1_000_000, rights: 27, colors: ['#FCD34D', '#B45309'] as [string, string] },
];
export const NOBLE_DAYS = 30;
export const NOBLE_RIGHTS: { name: string; emoji: string; isNew?: boolean }[] = [
  { name: 'Jeton Hediye Et', emoji: '💗', isNew: true },
  { name: 'VIP Listesi', emoji: '👑' },
  { name: 'Araçlar', emoji: '🚘' },
  { name: 'Noble Madalyası', emoji: '🏅' },
  { name: 'Asil Etiketi', emoji: '🔖' },
  { name: 'Profil Çerçevesi', emoji: '🖼️' },
  { name: 'Giriş Ekranı', emoji: '🌟' },
  { name: 'Oda Kilitleme', emoji: '🔒' },
  { name: 'Oda Üyesi Asil Koltuğu', emoji: '🛋️' },
  { name: 'Özel arka plan', emoji: '🏞️', isNew: true },
  { name: 'Özel Hediyeler', emoji: '🎁' },
  { name: 'Sohbet balonu', emoji: '💬' },
  { name: 'Profil kart çerçevesi', emoji: '🪪' },
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

// --- VIP subscription ----------------------------------------------------------------
export const VIP_PLANS = [
  { days: 30, price: 14_000, label: '1 ay' },
  { days: 90, price: 36_000, label: '3 ay', tag: 'Popüler' },
  { days: 180, price: 66_000, label: '6 ay', tag: 'En avantajlı' },
];
export const VIP_COMPARE: [string, string, string][] = [
  ['Özel mesaj', `${DM_PRICE} jeton / mesaj`, '320 ücretsiz mesaj'],
  ['Sesli sohbet', 'Dakika ücreti', '%20 indirim'],
  ['Görüntülü sohbet', 'Dakika ücreti', '%20 indirim'],
  ['Ses eşleşmesi', 'Dakika ücreti', 'Her gün ücretsiz 1 kez'],
  ['Video eşleşmesi', 'Dakika ücreti', 'Her gün ücretsiz 1 kez'],
  ['Ziyaretçileri görüntüle', '✕', '✓'],
  ['Altın takma adı', '✕', '✓'],
  ['Premium madalya', '✕', '✓'],
  ['Ekstra ödül', '✕', '✓'],
  ['VIP hediye paketi', '✕', '✓'],
  ['Seviyeleri gizle', '✕', '✓'],
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
export const RECHARGE_PACKS = [
  { id: 'p1', coins: 1_750, firstBonus: 750, price: 'TRY 27.99' },
  { id: 'p2', coins: 4_000, firstBonus: 1_500, price: 'TRY 63.99' },
  { id: 'p3', coins: 7_000, price: 'TRY 139' },
  { id: 'p4', coins: 20_000, firstBonus: 3_000, price: 'TRY 369' },
  { id: 'p5', coins: 40_000, price: 'TRY 729' },
  { id: 'p6', coins: 70_000, bonus: 10_500, price: 'TRY 1,429.99' },
  { id: 'p7', coins: 175_000, bonus: 26_250, price: 'TRY 3,449.99' },
  { id: 'p8', coins: 350_000, bonus: 52_500, price: 'TRY 6,899.99' },
];
export type RechargePack = (typeof RECHARGE_PACKS)[number] & { firstBonus?: number; bonus?: number };
