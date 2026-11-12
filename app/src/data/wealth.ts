// Cömertlik Seviyesi (wealth level): Lv.0–50 from wealth points. Points come from qualifying coin spending
// (gifts, Lucky gifts at the coins actually spent, paid messages and calls, store, family, room activities).
// Coin games and coin hand-outs (room envelopes, transfers) never add points.
import type { ArtName } from '@/components/Art';

/** Readable threshold: to the nearest 5 below 100, otherwise two significant digits (1.700, 30.000, 1.100.000). */
export const readablePoints = (x: number) => {
  if (x < 100) return Math.max(5, Math.round(x / 5) * 5);
  const step = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / step) * step;
};

/**
 * Our level curve, shared by Cömertlik and Yankı: Lv.L needs about A · L^1.5 · G^L points, made readable.
 * Two anchors set it, the points for Lv.1 and for the top level; G and A follow from them. The L^1.5 part makes
 * the first levels come quickly (one small gift opens Lv.1), and from the middle on each level asks for roughly
 * a quarter more than the one before. Retuning the levels means changing the two anchors, not a table.
 */
export function levelCurve(first: number, last: number, max = 50): number[] {
  const g = (last / (first * max ** 1.5)) ** (1 / (max - 1));
  const a = first / g;
  return Array.from({ length: max + 1 }, (_, l) => (l === 0 ? 0 : readablePoints(a * l ** 1.5 * g ** l)));
}

/** Lv.1 at 10 points (one Gül), Lv.50 at 30 million. */
export const WEALTH_XP = levelCurve(10, 30_000_000);
export const WEALTH_MAX = WEALTH_XP.length - 1;

/** Highest level whose threshold is reached. */
export const levelFromTable = (table: number[], xp: number) => {
  let lvl = 0;
  while (lvl < table.length - 1 && xp >= table[lvl + 1]) lvl++;
  return lvl;
};
export const wealthLevelOf = (xp: number) => levelFromTable(WEALTH_XP, xp);

/** Spending that does not count: coin games and coin hand-outs. */
const NOT_COUNTED = [/· tur /, /Zar Düellosu/i, /zarf/i, /çantası/i, /transfer/i, /jeton gönder/i];
export const countsForWealth = (reason: string) => !NOT_COUNTED.some((r) => r.test(reason));

/** Level groups share an emblem; each has its own colors and symbol. */
export type LevelIcon = 'leaf' | 'diamond-outline' | 'diamond' | 'flower' | 'ribbon' | 'flame' | 'sparkles' | 'shield' | 'star' | 'planet' | 'trophy' | 'flash' | 'moon' | 'heart' | 'musical-notes' | 'color-palette' | 'rose';
/** A group of levels sharing one emblem (used by Cömertlik and Yankı). */
export type LevelTier = { from: number; to: number; name: string; icon: LevelIcon; colors: [string, string]; ink: string };
export type WealthTier = LevelTier;
export type LevelPerk = { key: string; title: string; detail: string; emoji: string; art?: ArtName; from: number; kind: 'privilege' | 'costume' };
export const WEALTH_TIERS: WealthTier[] = [
  { from: 0, to: 4, name: 'Kuvars', icon: 'leaf', colors: ['#2DD4BF', '#0F766E'], ink: '#ECFEFF' },
  { from: 5, to: 9, name: 'Opal', icon: 'diamond-outline', colors: ['#38BDF8', '#1D4ED8'], ink: '#EFF6FF' },
  { from: 10, to: 14, name: 'Akik', icon: 'diamond', colors: ['#6366F1', '#312E81'], ink: '#EEF2FF' },
  { from: 15, to: 19, name: 'Ametist', icon: 'flower', colors: ['#F472B6', '#9D174D'], ink: '#FDF2F8' },
  { from: 20, to: 24, name: 'Topaz', icon: 'ribbon', colors: ['#F97316', '#9A3412'], ink: '#FFF7ED' },
  { from: 25, to: 28, name: 'Zümrüt', icon: 'flame', colors: ['#F43F5E', '#881337'], ink: '#FFF1F2' },
  { from: 29, to: 32, name: 'Yakut', icon: 'sparkles', colors: ['#C084FC', '#6B21A8'], ink: '#FAF5FF' },
  { from: 33, to: 36, name: 'Safir', icon: 'shield', colors: ['#EAB308', '#7C2D12'], ink: '#FEFCE8' },
  { from: 37, to: 40, name: 'Pırlanta', icon: 'star', colors: ['#FDE047', '#A16207'], ink: '#422006' },
  { from: 41, to: 45, name: 'Hazine', icon: 'planet', colors: ['#818CF8', '#1E1B4B'], ink: '#E0E7FF' },
  { from: 46, to: 50, name: 'Efsane', icon: 'trophy', colors: ['#FACC15', '#18181B'], ink: '#FEF9C3' },
];
export const wealthTier = (level: number) => WEALTH_TIERS.find((t) => level >= t.from && level <= t.to) ?? WEALTH_TIERS[0];

export type WealthPerk = LevelPerk;
/** What a level opens. Each perk applies from its level up. */
export const WEALTH_PERKS: WealthPerk[] = [
  { key: 'badge', title: 'Seviye rozeti', detail: 'Profilde, odada ve sohbette adının yanında', emoji: '🏅', art: 'ayricalik-seviye-rozeti', from: 1, kind: 'privilege' },
  { key: 'rank', title: 'Öne çıkma', detail: 'Oda dinleyici listesinde ve aramalarda üst sıralar', emoji: '⬆️', art: 'ayricalik-one-cikma', from: 1, kind: 'privilege' },
  { key: 'gift', title: 'Seviye hediyesi', detail: 'Hediye panelinde seviyene özel hediye', emoji: '🎁', art: 'ayricalik-seviye-hediyesi', from: 3, kind: 'privilege' },
  { key: 'notice', title: 'Odada seviye duyurusu', detail: 'Seviye atladığında bulunduğun odada duyurulur', emoji: '📣', art: 'ayricalik-odada-seviye-duyurusu', from: 10, kind: 'privilege' },
  { key: 'broadcast', title: 'Platform duyurusu', detail: 'Seviye atlaman tüm platformda kayan yazıyla görünür', emoji: '📡', art: 'ayricalik-platform-duyurusu', from: 33, kind: 'privilege' },
  { key: 'entry', title: 'Giriş efekti', detail: 'Odaya girişte seviye renginde efekt', emoji: '✨', art: 'ayricalik-giris-efekti', from: 5, kind: 'costume' },
  { key: 'medal', title: 'Seviye madalyası', detail: 'Profil vitrininde seviye grubunun amblemi', emoji: '🎖️', art: 'ayricalik-seviye-madalyasi', from: 10, kind: 'costume' },
  { key: 'frame', title: 'Profil çerçevesi', detail: 'Seviye grubunun renklerinde avatar çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi', from: 20, kind: 'costume' },
];

/** Level gift names by group (shown in the perk card). */
export const levelGiftOf = (level: number) => (level >= 41 ? 'Uzay Mekiği' : level >= 25 ? 'Yakut Taç' : level >= 10 ? 'Kristal Küre' : 'Altın Fidan');
