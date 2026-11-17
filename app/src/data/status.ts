// Status systems: VIP 1–10 (SVIP, recharge experience), VIP subscription (Abonelik), Rütbe (noble, monthly title).
import type { ArtName } from '@/components/Art';

// --- VIP 1–10 (SVIP): 1 recharged coin = 1 experience point; levels never expire ---------------
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
/** Ordered so that VIP n has the first `rights` entries (entry notice from VIP 1, gifts from VIP 2). */
export const SVIP_RIGHTS: { name: string; emoji: string; group: RightGroup; art?: ArtName; soon?: boolean }[] = [
  { name: 'Özel giriş duyurusu', emoji: '✨', group: 'Odada', art: 'ayricalik-giris-ekrani-kayan-yazi', soon: true },
  { name: 'VIP rozeti', emoji: '🎖️', group: 'Görünüm', art: 'ayricalik-svip-rozeti' },
  { name: 'Üyelere özel hediyeler', emoji: '🎁', group: 'Odada', art: 'ayricalik-svip-e-ozel-hediye' },
  { name: 'Renkli sohbet balonu', emoji: '🎨', group: 'Görünüm', art: 'ayricalik-genel-sohbet-balonu', soon: true },
  { name: 'Profil çerçevesi', emoji: '🖼️', group: 'Görünüm', art: 'ayricalik-profil-cercevesi' },
  { name: 'Puanla alışveriş', emoji: '🏪', group: 'Destek', art: 'ayricalik-puan-takas-magazasi', soon: true },
  { name: 'Profil kartı çerçevesi', emoji: '🪪', group: 'Görünüm', art: 'ayricalik-bilgi-karti-cercevesi', soon: true },
  { name: 'Hediye serisi efekti', emoji: '🔥', group: 'Odada', art: 'ayricalik-hediye-combo-skin', soon: true },
  { name: 'Kendi unvanını yaz', emoji: '✏️', group: 'Görünüm', art: 'ayricalik-diy-unvani', soon: true },
  { name: 'Sessiz ziyaret', emoji: '🥷', group: 'Sosyal', art: 'ayricalik-gizli-ziyaret' },
  { name: 'Dolu odaya girebilme', emoji: '🚪', group: 'Odada', art: 'ayricalik-tam-dolu-odalar', soon: true },
  { name: 'Mesaj çevirisi', emoji: '🔤', group: 'Sosyal', art: 'ayricalik-metin-cevirisi', soon: true },
  { name: 'Yüklemede indirim', emoji: '💸', group: 'Destek', art: 'ayricalik-yukleme-indirimi', soon: true },
  { name: 'Öncelikli destek', emoji: '🎧', group: 'Destek', art: 'ayricalik-ozel-musteri-temsilcisi', soon: true },
];

// --- Rütbe (noble): bought with coins for 30 days -------------------------------------
export const NOBLE_TIERS = [
  { tier: 1, name: 'Çavuş', emoji: '🛡️', art: 'asil-1-sovalye' as ArtName, price: 15_000, rights: 4, colors: ['#94A3B8', '#334155'] as [string, string] },
  { tier: 2, name: 'Yüzbaşı', emoji: '🗡️', art: 'asil-2-vikont' as ArtName, price: 60_000, rights: 6, colors: ['#2DD4BF', '#0F766E'] as [string, string] },
  { tier: 3, name: 'Binbaşı', emoji: '⚔️', art: 'asil-3-kont' as ArtName, price: 150_000, rights: 8, colors: ['#60A5FA', '#1D4ED8'] as [string, string] },
  { tier: 4, name: 'Albay', emoji: '🏹', art: 'asil-4-markiz' as ArtName, price: 400_000, rights: 10, colors: ['#F472B6', '#BE123C'] as [string, string] },
  { tier: 5, name: 'Paşa', emoji: '🦁', art: 'asil-5-duk' as ArtName, price: 1_000_000, rights: 12, colors: ['#FCD34D', '#B45309'] as [string, string] },
];
export const NOBLE_DAYS = 30;
/** Ordered so that tier n has the first `rights` entries; GATES below read rights by name. */
export const NOBLE_RIGHTS: { name: string; emoji: string; art?: ArtName; soon?: boolean }[] = [
  { name: 'Rütbe Nişanı', emoji: '🏅', art: 'ayricalik-asil-madalyasi' },
  { name: 'Rütbe etiketi', emoji: '🔖', art: 'ayricalik-asil-etiketi', soon: true },
  { name: 'Oda kilitleme', emoji: '🔒', art: 'ayricalik-oda-kilitleme' },
  { name: 'Giriş karşılaması', emoji: '🌟', art: 'ayricalik-giris-ekrani' },
  { name: 'Profil çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi' },
  { name: 'Sohbet balonu', emoji: '💬', art: 'ayricalik-sohbet-balonu', soon: true },
  { name: 'Odada ayrılmış koltuk', emoji: '🛋️', art: 'ayricalik-asil-koltugu', soon: true },
  { name: 'Binekler', emoji: '🚘', art: 'ayricalik-araclar', soon: true },
  { name: 'Gizli oda girişi', emoji: '👻', art: 'ayricalik-gizli-oda-girisi', soon: true },
  { name: 'Arkadaşına jeton gönder', emoji: '💗', art: 'ayricalik-jeton-hediye-et', soon: true },
  { name: 'Sıralamada gizli kalma', emoji: '🕵️', art: 'ayricalik-gizemli-kisi-kimligi', soon: true },
  { name: 'Aile içinde görünmezlik', emoji: '🎭', art: 'ayricalik-klan-gizliligi', soon: true },
];
export const nobleInfo = (tier: number) => NOBLE_TIERS.find((t) => t.tier === tier);

// --- What the screens list (güncelleme 6, owner's call): only the rights the real app gives today --------------
// A right marked `soon` isn't built yet (or only shows on its owner's phone): the VIP and Rütbe pages leave it out
// until it is, instead of selling it. The lists above keep their order, which the gates (hasNobleRight) read.
/** A right as a page shows it: the level (VIP) or tier (Rütbe) it opens at. */
export type ShownRight = { name: string; emoji: string; art?: ArtName; level: number };
/** Rights the server already gives from VIP 1 that the list above never named. */
const SVIP_MORE: ShownRight[] = [
  { name: 'Seviyeleri gizle', emoji: '🙈', art: 'ayricalik-gizemli-kisi-kimligi', level: 1 },
  { name: 'Oda şifresi', emoji: '🔑', art: 'ayricalik-oda-kilitleme', level: 1 },
  { name: 'VIP mağaza eşyaları', emoji: '🛍️', art: 'ayricalik-puan-takas-magazasi', level: 1 },
];
/** Where the real app gives a right earlier than its place in the list says (the VIP ring: from VIP 1). */
const SVIP_FROM: Record<string, number> = { 'Profil çerçevesi': 1 };
/** VIP 1–10 rights to show, by the level they open at. */
export const SVIP_SHOWN: ShownRight[] = [
  ...SVIP_RIGHTS.map((r, i) => ({ name: r.name, emoji: r.emoji, art: r.art, level: SVIP_FROM[r.name] ?? SVIP_LEVELS.find((l) => l.rights > i)?.level ?? 99, soon: r.soon })).filter((r) => !r.soon),
  ...SVIP_MORE,
]
  .map(({ name, emoji, art, level }) => ({ name, emoji, art, level }))
  .sort((a, b) => a.level - b.level);
/** Where a Rütbe gives a right earlier than its place in the list says (its VIP ring: from Çavuş). */
const NOBLE_FROM: Record<string, number> = { 'Profil çerçevesi': 1 };
/** Rütbe rights to show, by the tier they open at. */
export const NOBLE_SHOWN: ShownRight[] = NOBLE_RIGHTS.map((r, i) => ({ name: r.name, emoji: r.emoji, art: r.art, level: NOBLE_FROM[r.name] ?? NOBLE_TIERS.find((t) => t.rights > i)?.tier ?? 99, soon: r.soon }))
  .filter((r) => !r.soon)
  .map(({ name, emoji, art, level }) => ({ name, emoji, art, level }))
  .sort((a, b) => a.level - b.level);
export const hasNobleRight = (tier: number, name: string) => {
  const t = nobleInfo(tier);
  return !!t && NOBLE_RIGHTS.findIndex((r) => r.name === name) < t.rights;
};

// --- VIP subscription (store subscription, priced in TRY) -------------------------------
// `tl` is the store price and `was` the struck-through list price; the badge shows the saving. The store product is
// `vip_<days>d` (server/api/catalog.mjs VIP_SUBS, which tests/server-catalog.test.ts keeps equal); a live build buys
// it through the server (lib/live/vip).
export const VIP_PLANS = [
  { days: 7, tl: 145, was: 299, label: '7 Gün' },
  { days: 30, tl: 285, was: 1_199, label: '1 Ay' },
  { days: 90, tl: 599, was: 3_599, label: '3 Ay' },
].map((p) => ({ ...p, save: Math.floor((1 - p.tl / p.was) * 100) }));
/**
 * Comparison table; `true` / `false` render as a check / cross. Only what the server gives a subscriber today
 * (güncelleme 6): the call and match discounts, gold name, VIP medal, extra login reward and welcome box aren't built
 * yet, so the page doesn't sell them.
 */
export const VIP_COMPARE: [string, string | boolean, string | boolean][] = [
  ['Profiline bakanları gör', false, true],
  ['Seviyeleri gizle', false, true],
];
/** "VIP Ayrıcalıkları" carousel (Ionicons names): the same two, as above. */
export const VIP_PERKS: { name: string; desc: string; icon: string }[] = [
  { name: 'Ziyaretçiler', desc: 'Profiline bakanları gör', icon: 'eye' },
  { name: 'Seviyeleri gizle', desc: 'Cömertlik ve Yankı seviyeni gizle', icon: 'eye-off' },
];
/** "Hoş Geldin Kutusu": meant to come with every plan; the server doesn't grant it yet, so the page doesn't show it. */
export const VIP_GIFT_PACK: { name: string; emoji: string; art: ArtName; days: number; qty: number }[] = [
  { name: 'VIP Sohbet Balonu', emoji: '💬', art: 'ayricalik-sohbet-balonu', days: 7, qty: 1 },
  { name: 'VIP Giriş Efekti', emoji: '✨', art: 'ayricalik-giris-ekrani', days: 7, qty: 1 },
];

// --- Gates used across the app (written here and on the server; not settable from a panel yet) -----------------
export const GATES = {
  /** Game center: VIP 2 (SVIP) or Yüzbaşı+ */
  games: (svip: number, noble: number) => svip >= 2 || noble >= 2,
  /** Invisible room entry: Rütbe right "Gizli oda girişi" (Albay+) */
  invisibleEntry: (noble: number) => hasNobleRight(noble, 'Gizli oda girişi'),
  /** Entry banner: Rütbe "Giriş karşılaması" or VIP (SVIP) "Özel giriş duyurusu" */
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
