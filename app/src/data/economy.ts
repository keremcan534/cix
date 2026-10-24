import { USERS, type User } from '@/data/mock';

// --- Rates -----------------------------------------------------------------
// A gift worth N coins earns the receiver N diamonds.
// 100 diamonds = ₺1 when withdrawing; 1 diamond = 1 coin when exchanging (minus 10%).
export const DIAMONDS_PER_TL = 100;
export const MIN_WITHDRAW_DIAMONDS = 10_000;
export const EXCHANGE_FEE = 0.1;
export const tl = (diamonds: number) => `₺${(diamonds / DIAMONDS_PER_TL).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

// --- VIP / nobility ----------------------------------------------------------
export type VipTier = { level: number; name: string; emoji: string; price: number; color: readonly [string, string]; perks: string[] };
export const VIP_TIERS: VipTier[] = [
  { level: 1, name: 'Şövalye', emoji: '🛡️', price: 300, color: ['#64748B', '#94A3B8'], perks: ['Şövalye rozeti', 'Avatar çerçevesi'] },
  { level: 2, name: 'Baron', emoji: '🎖️', price: 1_000, color: ['#0EA5E9', '#38BDF8'], perks: ['Baron rozeti', 'Mavi çerçeve', 'Odaya giriş efekti'] },
  { level: 3, name: 'Kont', emoji: '💠', price: 3_000, color: ['#8B5CF6', '#C084FC'], perks: ['Kont rozeti', 'Mor çerçeve', 'Giriş efekti', 'Günlük 30 jeton'] },
  { level: 4, name: 'Dük', emoji: '👑', price: 8_000, color: ['#F59E0B', '#FBBF24'], perks: ['Dük rozeti', 'Altın çerçeve', 'Özel giriş efekti', 'Günlük 100 jeton', 'Odadan atılamaz'] },
  { level: 5, name: 'Kral', emoji: '🦁', price: 20_000, color: ['#EF4444', '#F97316'], perks: ['Kral rozeti', 'Ateş çerçeve', 'Efsane giriş efekti', 'Günlük 300 jeton', 'Odadan atılamaz', 'Sıralamada gizlenme'] },
];
export const vipTier = (level: number) => VIP_TIERS.find((t) => t.level === level);

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
export const INVITE_REWARD = 200;

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

// --- Agencies & families -----------------------------------------------------
export const AGENCIES = [
  { id: 'a1', code: 'STAR01', name: 'Star Ajans', commission: 0.1, hosts: 48, logo: '⭐' },
  { id: 'a2', code: 'MOON22', name: 'Moonlight Media', commission: 0.12, hosts: 31, logo: '🌙' },
  { id: 'a3', code: 'VIBE77', name: 'Vibe Talent', commission: 0.08, hosts: 19, logo: '💜' },
];

export const FAMILIES = [
  { id: 'f1', name: 'Gece Kuşları', emoji: '🦉', level: 12, members: 86, points: 1_284_000, leaderId: 'u1', memberIds: ['u1', 'u2', 'u9', 'u7', 'u4'] },
  { id: 'f2', name: 'Karaoke Ailesi', emoji: '🎤', level: 9, members: 54, points: 842_500, leaderId: 'u11', memberIds: ['u11', 'u4', 'u8', 'u5'] },
  { id: 'f3', name: 'Oyun Kurtları', emoji: '🐺', level: 7, members: 40, points: 515_200, leaderId: 'u2', memberIds: ['u2', 'u6', 'u10', 'u12'] },
  { id: 'f4', name: 'İstanbul Sohbet', emoji: '🌉', level: 5, members: 27, points: 230_900, leaderId: 'u5', memberIds: ['u5', 'u7', 'u3'] },
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
