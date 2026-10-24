import { USERS, type User } from '@/data/mock';

// --- Rates -----------------------------------------------------------------
// A gift worth N coins earns the receiver N diamonds. Diamond→USD and bonus rates live in rules.ts.
// 1 diamond = 1 coin when exchanging (minus 10%).
export const EXCHANGE_FEE = 0.1;

export const callPrice = (u: User) => (u.vip ? 120 : 60); // coins per minute

// --- Host levels -----------------------------------------------------------
export const HOST_LEVELS = [
  { level: 1, min: 0, name: 'Çaylak' },
  { level: 2, min: 5_000, name: 'Yükselen' },
  { level: 3, min: 20_000, name: 'Popüler' },
  { level: 4, min: 60_000, name: 'Yıldız' },
  { level: 5, min: 150_000, name: 'Süperstar' },
];
export const hostLevel = (totalDiamonds: number) => {
  let idx = 0;
  HOST_LEVELS.forEach((l, i) => totalDiamonds >= l.min && (idx = i));
  return { current: HOST_LEVELS[idx], next: HOST_LEVELS[idx + 1] };
};

// --- VIP 1–15 ---------------------------------------------------------------
// Titles/perks follow the product spec (our design, not a competitor's official table).
// Perks are cumulative: each level includes everything below it.
export type VipTier = { level: number; name: string; emoji: string; price: number; color: readonly [string, string]; perk: string };
const VIP_DEFS: [string, string, number, string, string, string][] = [
  ['Üye', '🔰', 100, '#64748B', '#94A3B8', 'VIP rozeti'],
  ['Bronz', '🥉', 300, '#B45309', '#D97706', 'İsim rengi'],
  ['Gümüş', '🥈', 600, '#94A3B8', '#E2E8F0', 'Profil çerçevesi'],
  ['Altın', '🥇', 1_000, '#F59E0B', '#FBBF24', 'Odaya giriş efekti'],
  ['Platin', '💿', 1_800, '#0EA5E9', '#67E8F9', 'Sohbet balonu'],
  ['Safir', '🔷', 3_000, '#2563EB', '#60A5FA', 'Profil kişiselleştirmesi'],
  ['Yakut', '♦️', 4_500, '#BE123C', '#F43F5E', 'Oda içi görsel efekt'],
  ['Zümrüt', '💚', 6_500, '#047857', '#34D399', 'Ek kozmetik paketi'],
  ['Elmas', '💎', 9_000, '#06B6D4', '#A5F3FC', 'Gelişmiş giriş animasyonu + gizli giriş'],
  ['Usta', '🎖️', 12_000, '#7C3AED', '#A78BFA', 'Özel VIP teması'],
  ['Asil', '⚜️', 16_000, '#9333EA', '#E879F9', 'Genişletilmiş kozmetik koleksiyonu'],
  ['Lord', '🗡️', 21_000, '#4338CA', '#818CF8', 'Özel isim efekti'],
  ['Kont', '💠', 27_000, '#8B5CF6', '#C084FC', 'Üst düzey profil/giriş efekti'],
  ['Dük', '👑', 35_000, '#D97706', '#FDE047', 'Nadir kozmetik seçenekleri'],
  ['İmparator', '🦁', 50_000, '#DC2626', '#F97316', 'En üst VIP rozeti ve özel tema'],
];
export const VIP_TIERS: VipTier[] = VIP_DEFS.map(([name, emoji, price, c1, c2, perk], i) => ({ level: i + 1, name, emoji, price, color: [c1, c2] as const, perk }));
export const vipTier = (level: number) => VIP_TIERS.find((t) => t.level === level);
export const vipPerks = (level: number) => VIP_TIERS.filter((t) => t.level <= level).map((t) => t.perk);
export const VIP_ENTRY_LEVEL = 4; // entry banner unlocks at Altın
export const VIP_INVISIBLE_LEVEL = 9; // invisible entry unlocks at Elmas

// --- Wealth & Charm (separate from VIP and room level) ----------------------
// Wealth: qualifying coins spent. Charm: diamonds received.
const levelFrom = (value: number, base: number) => {
  let lvl = 0;
  while (value >= base * (2 ** lvl - 1) && lvl < 50) lvl++;
  return Math.max(1, lvl);
};
export const wealthLevel = (spent: number) => levelFrom(spent, 100);
export const charmLevel = (diamonds: number) => levelFrom(diamonds, 200);

// --- Daily check-in & tasks --------------------------------------------------
export const CHECKIN_REWARDS = [10, 15, 20, 30, 40, 50, 100];

export type TaskKey = 'roomMinutes' | 'giftsSent' | 'greetings' | 'moments' | 'calls';
export const TASKS: { id: string; key: TaskKey; title: string; goal: number; reward: number; icon: string }[] = [
  { id: 't1', key: 'roomMinutes', title: 'Bir odada 5 dakika kal', goal: 5, reward: 20, icon: '🎙️' },
  { id: 't2', key: 'giftsSent', title: '3 hediye gönder', goal: 3, reward: 30, icon: '🎁' },
  { id: 't3', key: 'greetings', title: '5 kişiye selam ver', goal: 5, reward: 15, icon: '👋' },
  { id: 't4', key: 'moments', title: '1 an paylaş', goal: 1, reward: 10, icon: '📸' },
  { id: 't5', key: 'calls', title: '1 görüntülü arama yap', goal: 1, reward: 25, icon: '📹' },
];

// --- Lucky wheel -------------------------------------------------------------
export const WHEEL_COST = 20;
export type WheelPrize = { label: string; emoji: string; coins: number; weight: number };
export const WHEEL_PRIZES: WheelPrize[] = [
  { label: '5 jeton', emoji: '🪙', coins: 5, weight: 30 },
  { label: '20 jeton', emoji: '🪙', coins: 20, weight: 22 },
  { label: 'Tekrar dene', emoji: '😅', coins: 0, weight: 20 },
  { label: '50 jeton', emoji: '💰', coins: 50, weight: 14 },
  { label: '100 jeton', emoji: '💎', coins: 100, weight: 8 },
  { label: '500 jeton', emoji: '🚀', coins: 500, weight: 4 },
  { label: '10 jeton', emoji: '🪙', coins: 10, weight: 25 },
  { label: 'BÜYÜK ÖDÜL 2000', emoji: '🏆', coins: 2_000, weight: 1 },
];
export const spinWheel = () => {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  return WHEEL_PRIZES.findIndex((p) => (r -= p.weight) < 0);
};

// --- Families -----------------------------------------------------------------
export const FAMILIES = [
  { id: 'f1', name: 'Gece Kuşları', emoji: '🦉', level: 12, xp: 142_000, weekly: 100_000, members: 86, points: 1_284_000, leaderId: 'u1', memberIds: ['u1', 'u2', 'u9', 'u7', 'u4'] },
  { id: 'f2', name: 'Karaoke Ailesi', emoji: '🎤', level: 9, xp: 58_000, weekly: 64_000, members: 54, points: 842_500, leaderId: 'u11', memberIds: ['u11', 'u4', 'u8', 'u5'] },
  { id: 'f3', name: 'Oyun Kurtları', emoji: '🐺', level: 7, xp: 27_500, weekly: 38_000, members: 40, points: 515_200, leaderId: 'u2', memberIds: ['u2', 'u6', 'u10', 'u12'] },
  { id: 'f4', name: 'İstanbul Sohbet', emoji: '🌉', level: 5, xp: 12_400, weekly: 17_500, members: 27, points: 230_900, leaderId: 'u5', memberIds: ['u5', 'u7', 'u3'] },
];

// --- Leaderboards (mock) -----------------------------------------------------
const board = (seed: number) =>
  [...USERS]
    .map((u, i) => ({ user: u, score: Math.round(((i * 7919 + seed * 104729) % 97) * 1_013 + 2_000) }))
    .sort((a, b) => b.score - a.score);
export const LEADERBOARDS = {
  zengin: { daily: board(1), weekly: board(2).map((r) => ({ ...r, score: r.score * 6 })) },
  yayinci: { daily: board(3), weekly: board(4).map((r) => ({ ...r, score: r.score * 7 })) },
};

// Bot gifts while the user hosts a room / is in a call.
export const INCOMING_GIFT_POOL = [1, 1, 1, 5, 5, 10, 10, 50, 100];
