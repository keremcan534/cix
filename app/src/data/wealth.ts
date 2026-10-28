// Servet Seviyesi (wealth level): Lv.0–50 from wealth points. Points come from qualifying coin spending
// (gifts, Lucky gifts at the coins actually spent, paid messages and calls, store, family, room activities).
// Coin games and coin hand-outs (room envelopes, transfers) never add points.
// Thresholds are product data; Lv.35 and Lv.36 are interpolated until the product team confirms them.
import type { ArtName } from '@/components/Art';

export const WEALTH_XP = [
  0, 10, 30, 55, 88, 130, 160, 195, 345, 555, // 0–9
  950, 1_550, 2_560, 4_160, 6_000, 9_000, 13_100, 17_900, 25_900, 38_400, // 10–19
  55_000, 79_000, 113_500, 154_000, 200_000, 253_000, 317_000, 390_000, 489_000, 609_000, // 20–29
  745_000, 915_500, 1_188_000, 1_529_000, 1_955_000, 2_520_000, 3_250_000, 4_185_000, 5_540_000, 7_240_000, // 30–39
  9_240_000, 11_230_000, 13_630_000, 16_280_000, 19_180_000, 22_500_000, 25_620_000, 29_120_000, 33_020_000, 37_320_000, // 40–49
  42_000_000, // 50
];
export const WEALTH_MAX = WEALTH_XP.length - 1;
/** Levels whose threshold still needs confirmation. */
export const WEALTH_ESTIMATED = [35, 36];

/** Highest level whose threshold is reached. */
export const levelFromTable = (table: number[], xp: number) => {
  let lvl = 0;
  while (lvl < table.length - 1 && xp >= table[lvl + 1]) lvl++;
  return lvl;
};
export const wealthLevelOf = (xp: number) => levelFromTable(WEALTH_XP, xp);

/** Spending that does not count: coin games and coin hand-outs. */
const NOT_COUNTED = [/· tur /, /Zar Düellosu/i, /zarf/i, /transfer/i, /jeton gönder/i];
export const countsForWealth = (reason: string) => !NOT_COUNTED.some((r) => r.test(reason));

/** Level groups share an emblem; each has its own colors and symbol. */
export type LevelIcon = 'leaf' | 'diamond-outline' | 'diamond' | 'flower' | 'ribbon' | 'flame' | 'sparkles' | 'shield' | 'star' | 'planet' | 'trophy' | 'flash' | 'moon' | 'heart' | 'musical-notes' | 'color-palette' | 'rose';
/** A group of levels sharing one emblem (used by Servet and Cazibe). */
export type LevelTier = { from: number; to: number; name: string; icon: LevelIcon; colors: [string, string]; ink: string };
export type WealthTier = LevelTier;
export type LevelPerk = { key: string; title: string; detail: string; emoji: string; art?: ArtName; from: number; kind: 'privilege' | 'costume' };
export const WEALTH_TIERS: WealthTier[] = [
  { from: 0, to: 4, name: 'Filiz', icon: 'leaf', colors: ['#2DD4BF', '#0F766E'], ink: '#ECFEFF' },
  { from: 5, to: 9, name: 'Kristal', icon: 'diamond-outline', colors: ['#38BDF8', '#1D4ED8'], ink: '#EFF6FF' },
  { from: 10, to: 14, name: 'Safir', icon: 'diamond', colors: ['#6366F1', '#312E81'], ink: '#EEF2FF' },
  { from: 15, to: 19, name: 'Gül', icon: 'flower', colors: ['#F472B6', '#9D174D'], ink: '#FDF2F8' },
  { from: 20, to: 24, name: 'Kızıl Taç', icon: 'ribbon', colors: ['#F97316', '#9A3412'], ink: '#FFF7ED' },
  { from: 25, to: 28, name: 'Yakut', icon: 'flame', colors: ['#F43F5E', '#881337'], ink: '#FFF1F2' },
  { from: 29, to: 32, name: 'Ametist', icon: 'sparkles', colors: ['#C084FC', '#6B21A8'], ink: '#FAF5FF' },
  { from: 33, to: 36, name: 'Hanedan', icon: 'shield', colors: ['#EAB308', '#7C2D12'], ink: '#FEFCE8' },
  { from: 37, to: 40, name: 'Altın Kanat', icon: 'star', colors: ['#FDE047', '#A16207'], ink: '#422006' },
  { from: 41, to: 45, name: 'Gece Yıldızı', icon: 'planet', colors: ['#818CF8', '#1E1B4B'], ink: '#E0E7FF' },
  { from: 46, to: 50, name: 'Efsane', icon: 'trophy', colors: ['#FACC15', '#18181B'], ink: '#FEF9C3' },
];
export const wealthTier = (level: number) => WEALTH_TIERS.find((t) => level >= t.from && level <= t.to) ?? WEALTH_TIERS[0];

export type WealthPerk = LevelPerk;
/** What a level opens. Each perk applies from its level up. */
export const WEALTH_PERKS: WealthPerk[] = [
  { key: 'badge', title: 'Seviye rozeti', detail: 'Profilde, odada ve sohbette adının yanında', emoji: '🏅', from: 1, kind: 'privilege' },
  { key: 'rank', title: 'Öne çıkma', detail: 'Oda dinleyici listesinde ve aramalarda üst sıralar', emoji: '⬆️', from: 1, kind: 'privilege' },
  { key: 'gift', title: 'Seviye hediyesi', detail: 'Hediye panelinde seviyene özel hediye', emoji: '🎁', from: 3, kind: 'privilege' },
  { key: 'notice', title: 'Odada seviye duyurusu', detail: 'Seviye atladığında bulunduğun odada duyurulur', emoji: '📣', from: 10, kind: 'privilege' },
  { key: 'broadcast', title: 'Platform duyurusu', detail: 'Seviye atlaman tüm platformda kayan yazıyla görünür', emoji: '📡', from: 33, kind: 'privilege' },
  { key: 'entry', title: 'Giriş efekti', detail: 'Odaya girişte seviye renginde efekt', emoji: '✨', from: 5, kind: 'costume' },
  { key: 'medal', title: 'Seviye madalyası', detail: 'Profil vitrininde seviye grubunun amblemi', emoji: '🎖️', from: 10, kind: 'costume' },
  { key: 'frame', title: 'Profil çerçevesi', detail: 'Seviye grubunun renklerinde avatar çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi', from: 20, kind: 'costume' },
];

/** Level gift names by group (shown in the perk card). */
export const levelGiftOf = (level: number) => (level >= 41 ? 'Yıldız Gemisi' : level >= 25 ? 'Yakut Taç' : level >= 10 ? 'Kristal Küre' : 'Altın Fidan');
