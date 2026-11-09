// Aile (crew; code name kabile) mock data + a small module-level progress store for the Aile screens
// (Görevler, Kasa, Uyum Köşesi, Sohbet). In production this lives on the server; here it is
// kept in memory so all Kabile screens see the same task progress without touching the app store.
import type { Href } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { FAMILIES } from '@/data/economy';
import { USERS } from '@/data/mock';

export const KABILE_ROUTES = {
  profile: '/aile' as Href,
  sohbet: '/kabile/sohbet' as Href,
  merkez: '/kabile/merkez' as Href,
  kasa: '/kabile/kasa' as Href,
  iliski: '/kabile/iliski' as Href,
  rooms: '/(tabs)' as Href,
};

export type KabileFamily = { id: string; name: string; emoji: string; xp: number; weekly: number; members: number; leaderId: string; memberIds: string[] };

// Kabileler created by the user (kept at module level so they survive leaving the screen).
const CUSTOM: Record<string, KabileFamily> = {};
export const registerKabile = (f: KabileFamily) => {
  CUSTOM[f.id] = f;
};
export const findKabile = (id: string | null): KabileFamily | null => (id ? (FAMILIES.find((f) => f.id === id) ?? CUSTOM[id] ?? null) : null);

// --- Live builds ---------------------------------------------------------------
/**
 * The demo's Aile lives on this phone among sample people. A live build (server address set, like lib/live
 * liveMode) shows the server's instead (components/family-live, family-center-live → server/api families.mjs,
 * family-more.mjs), and the demo's money paths below refuse there: no real coin is taken for a sample aile or a
 * gift no one receives, and no chest coins are credited that the server never gave.
 */
export const tayfaAvailable = (live: boolean = !!process.env.EXPO_PUBLIC_API_URL) => !live;

type Spend = (amount: number, reason?: string) => boolean;
type Credit = (amount: number, reason?: string) => void;
export const KABILE_CREATE_COST = 500;

/** Aile kur: the fee, then my new aile. 'off' in a live build (nothing is charged), 'coins' when the fee is short. */
export function createKabile(name: string, spend: Spend, live?: boolean): KabileFamily | 'off' | 'coins' {
  if (!tayfaAvailable(live)) return 'off';
  if (!spend(KABILE_CREATE_COST, `Aile kurma: ${name}`)) return 'coins';
  const f: KabileFamily = { id: `custom-${Date.now()}`, name, emoji: '🏰', xp: 0, weekly: 0, members: 1, leaderId: 'me', memberIds: ['me'] };
  registerKabile(f);
  return f;
}

/** A gift in the aile chat or in Uyum Köşesi. 'off' in a live build: nothing is charged, its members are sample people. */
export const payKabileGift = (price: number, reason: string, spend: Spend, live?: boolean): 'ok' | 'off' | 'coins' =>
  !tayfaAvailable(live) ? 'off' : spend(price, reason) ? 'ok' : 'coins';

export const fmt = (n: number) => n.toLocaleString('tr-TR');
export const fmtK = (n: number) => (n >= 1_000 ? `${(n / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}k` : String(n));

// --- Per-kabile profile meta (mock) -----------------------------------------
export type KabileMeta = {
  tagId: number;
  badge: string; // short chip next to the name
  multiplier: number; // "×3114" power badge
  power: number; // total season power
  keep: number; // level-keeping progress this season
  weeklyPower: number;
  weeklyRank: number;
  treasure: number; // Aile Sandığı (🔮)
  chestValue: number; // Aile Kasası value (🪙) distributed at the weekly close
  announcement: string;
  tags: { emoji: string; label: string }[];
  roomId: string;
  online: number; // members online right now (whole kabile, not only the shown ones)
};

const DEFAULT_META: KabileMeta = {
  tagId: 1_000_001,
  badge: 'Yeni',
  multiplier: 12,
  power: 1_200,
  keep: 0,
  weeklyPower: 0,
  weeklyRank: 0,
  treasure: 0,
  chestValue: 2_000,
  announcement: 'Ailemize hoş geldin! Günlük görevleri birlikte tamamlayalım 💜',
  tags: [{ emoji: '🌱', label: 'Yeni Aile' }],
  roomId: 'r1',
  online: 1,
};

export const KABILE_META: Record<string, KabileMeta> = {
  f1: { tagId: 1_376_746, badge: 'Gece', multiplier: 3_114, power: 1_469_435, keep: 60_000, weeklyPower: 57_635, weeklyRank: 27, treasure: 166_523, chestValue: 220_998, announcement: 'Bu hafta hedefimiz bir üst seviye! Aile odasında her Cuma 21:00 buluşuyoruz 🌙', tags: [{ emoji: '🎁', label: 'Premium Sandık' }, { emoji: '💬', label: 'Sohbet Tutkunu' }, { emoji: '💞', label: 'Çift Dolu' }], roomId: 'r1', online: 15 },
  f2: { tagId: 1_208_310, badge: 'Karaoke', multiplier: 1_870, power: 842_500, keep: 41_200, weeklyPower: 38_420, weeklyRank: 41, treasure: 98_210, chestValue: 120_400, announcement: 'Her akşam 22:00 karaoke sırası aile odasında 🎤', tags: [{ emoji: '🎤', label: 'Karaoke' }, { emoji: '🎶', label: 'Müzik Sever' }], roomId: 'r2', online: 9 },
  f3: { tagId: 1_154_022, badge: 'Kurt', multiplier: 940, power: 515_200, keep: 22_000, weeklyPower: 21_900, weeklyRank: 63, treasure: 54_800, chestValue: 61_300, announcement: 'Quiz turnuvası Pazar 20:00 · herkes takımını kursun 🐺', tags: [{ emoji: '🎮', label: 'Oyuncu' }, { emoji: '🧠', label: 'Quiz' }], roomId: 'r3', online: 6 },
  f4: { tagId: 1_098_455, badge: 'İstanbul', multiplier: 410, power: 230_900, keep: 12_500, weeklyPower: 9_800, weeklyRank: 112, treasure: 21_450, chestValue: 24_900, announcement: 'Yeni üyelerimize hoş geldin hediyesi göndermeyi unutmayın 🌉', tags: [{ emoji: '🌉', label: 'Şehir' }, { emoji: '☕', label: 'Sohbet' }], roomId: 'r4', online: 4 },
};
export const kabileMeta = (id: string): KabileMeta => KABILE_META[id] ?? DEFAULT_META;

/** Members shown in the app (a sample of the full kabile; `members` holds the real total). */
export const kabileMemberIds = (f: KabileFamily) => {
  const extra = USERS.map((u) => u.id).filter((id) => !f.memberIds.includes(id));
  const sample = f.memberIds.length > 1 ? [...f.memberIds, ...extra].slice(0, Math.min(12, f.members)) : f.memberIds;
  return [...new Set(['me', ...sample])];
};

// --- Power tiers (season power) ---------------------------------------------
export const POWER_TIERS = [
  { name: 'Sandal I', min: 0 },
  { name: 'Sandal II', min: 10_000 },
  { name: 'Kayık I', min: 40_000 },
  { name: 'Kayık II', min: 90_000 },
  { name: 'Yelkenli I', min: 160_000 },
  { name: 'Yelkenli II', min: 260_000 },
  { name: 'Gulet I', min: 400_000 },
  { name: 'Gulet II', min: 600_000 },
  { name: 'Fırkateyn I', min: 900_000 },
  { name: 'Fırkateyn II', min: 1_200_000 },
  { name: 'Fırkateyn III', min: 1_523_000 },
  { name: 'Kalyon', min: 2_000_000 },
];
export const KEEP_GOAL = 60_000; // weekly power needed to keep the current tier
export const powerTier = (power: number) => {
  let i = 0;
  POWER_TIERS.forEach((t, j) => power >= t.min && (i = j));
  return { tier: POWER_TIERS[i], next: POWER_TIERS[i + 1] ?? null };
};

// --- Treasury (🔮 Aile Sandığı) chest levels by total treasure -----------
export const TREASURY_LEVELS = [0, 20_000, 50_000, 100_000, 160_000, 429_108, 700_000, 1_000_000];
export const treasuryLevel = (treasure: number) => {
  let lvl = 1;
  TREASURY_LEVELS.forEach((t, i) => treasure >= t && (lvl = i + 1));
  const next = TREASURY_LEVELS[lvl] ?? null;
  return { lvl, next };
};

/** Aile Kasası: if weekly power reaches the goal, the chest value is split by contribution. */
export const KASA_GOAL = 50_000;

// --- Weekly milestone chests (FIXED rewards, never random) -------------------
export type ChestReward = { coins: number; item?: { label: string; days: number } };
export const KABILE_CHESTS: { id: string; emoji: string; name: string; need: number; reward: ChestReward }[] = [
  { id: 'c1', emoji: '🟫', name: 'Ahşap Sandık', need: 10_000, reward: { coins: 20 } },
  { id: 'c2', emoji: '🟩', name: 'Yeşil Sandık', need: 25_000, reward: { coins: 50 } },
  { id: 'c3', emoji: '🟦', name: 'Mavi Sandık', need: 50_000, reward: { coins: 50, item: { label: 'Aile çerçevesi', days: 3 } } },
  { id: 'c4', emoji: '🟥', name: 'Kırmızı Sandık', need: 80_000, reward: { coins: 100, item: { label: 'Aile sohbet balonu', days: 7 } } },
];
export const chestRewardText = (r: ChestReward) => `${r.coins} 🪙${r.item ? ` + ${r.item.label} (${r.item.days} gün)` : ''}`;
/** At least this much personal power this week is needed to open milestone chests. */
export const CHEST_MIN_CONTRIBUTION = 1;

// --- My contribution level ---------------------------------------------------
export const CONTRIB_LEVELS = [
  { lv: 1, name: 'Büyüyor', min: 0 },
  { lv: 2, name: 'Aktif', min: 10 },
  { lv: 3, name: 'Destekçi', min: 30 },
  { lv: 4, name: 'Çekirdek', min: 80 },
  { lv: 5, name: 'Efsane', min: 200 },
];
export const contribLevel = (power: number) => {
  let i = 0;
  CONTRIB_LEVELS.forEach((l, j) => power >= l.min && (i = j));
  return { cur: CONTRIB_LEVELS[i], next: CONTRIB_LEVELS[i + 1] ?? null };
};

// --- Daily tasks -------------------------------------------------------------
// 'count' tasks finish at `goal`; 'rate' tasks give `power` for every `per` coins, unlimited.
// `source` says how progress is measured (see the Görevler screen).
export type TaskSource = 'chatMsgs' | 'roomMinutes' | 'giftsSent' | 'checkIn' | 'roomGiftCoins' | 'cpGiftCoins' | 'chatGiftCoins';
export type KabileTask = {
  id: string;
  emoji: string;
  title: string;
  source: TaskSource;
  kind: 'count' | 'rate';
  goal: number; // count tasks
  per: number; // rate tasks: coins per reward step
  power: number;
  treasure: number;
  doneBy: string[]; // mock: members who completed it today
  doneCount: number;
};
export const KABILE_TASKS: KabileTask[] = [
  { id: 'k-chat', emoji: '💬', title: 'Aile sohbetine mesaj at', source: 'chatMsgs', kind: 'count', goal: 1, per: 0, power: 1, treasure: 1, doneBy: ['u1', 'u5', 'u7', 'u11', 'u2'], doneCount: 21 },
  { id: 'k-room', emoji: '🎙️', title: 'Aile odasında 15 dakika kal', source: 'roomMinutes', kind: 'count', goal: 15, per: 0, power: 1, treasure: 1, doneBy: ['u2', 'u4', 'u9', 'u7', 'u12'], doneCount: 18 },
  { id: 'k-newbie', emoji: '🎁', title: 'Aileye yeni katılan üyeye hediye gönder', source: 'giftsSent', kind: 'count', goal: 1, per: 0, power: 3, treasure: 3, doneBy: ['u5', 'u11', 'u1', 'u9'], doneCount: 10 },
  { id: 'k-checkin', emoji: '📅', title: 'Aile yoklamasına katıl', source: 'checkIn', kind: 'count', goal: 1, per: 0, power: 1, treasure: 1, doneBy: ['u4', 'u7', 'u1', 'u2', 'u11'], doneCount: 17 },
  { id: 'k-roomgift', emoji: '🎉', title: 'Aile odasında hediye gönder', source: 'roomGiftCoins', kind: 'rate', goal: 0, per: 500, power: 2, treasure: 2, doneBy: ['u1', 'u11'], doneCount: 6 },
  { id: 'k-cp', emoji: '💞', title: 'Aile üyelerinden biriyle ikili kur ve İkili hediyesi gönder', source: 'cpGiftCoins', kind: 'rate', goal: 0, per: 350, power: 2, treasure: 2, doneBy: ['u5', 'u9'], doneCount: 4 },
  { id: 'k-chatgift', emoji: '💌', title: 'Aile sohbetinde hediye gönder', source: 'chatGiftCoins', kind: 'rate', goal: 0, per: 400, power: 2, treasure: 2, doneBy: ['u7'], doneCount: 3 },
];
/** Gifts that can be sent in the kabile chat (fixed price, no random rewards). */
export const CHAT_GIFT_IDS = ['g1', 'g2', 'g3', 'g4', 'g5'];
/** Pair (İkili) gifts offered in Uyum Köşesi. */
export const CP_GIFT_IDS = ['c9', 'c12', 'c1'];

// --- Uyum Köşesi ---------------------------------------------------------
export type Pair = { a: string; b: string; level: number; score: number };
export const KABILE_COUPLES: Pair[] = [
  { a: 'u2', b: 'u1', level: 27, score: 126_510 },
  { a: 'u4', b: 'u11', level: 19, score: 64_200 },
  { a: 'u8', b: 'u5', level: 14, score: 31_870 },
  { a: 'u12', b: 'u9', level: 9, score: 12_400 },
  { a: 'u6', b: 'u7', level: 6, score: 5_930 },
];
export const KABILE_FRIENDS: Pair[] = [
  { a: 'u1', b: 'u5', level: 22, score: 88_300 },
  { a: 'u2', b: 'u4', level: 17, score: 47_150 },
  { a: 'u9', b: 'u7', level: 11, score: 19_800 },
  { a: 'u11', b: 'u3', level: 8, score: 9_420 },
];

// --- Themes (Tema tab) --------------------------------------------------------
export const KABILE_THEMES: { id: string; name: string; colors: readonly [string, string]; minLevel: number }[] = [
  { id: 'gece', name: 'Gece Moru', colors: ['#3B1D6E', '#080F1E'], minLevel: 1 },
  { id: 'ates', name: 'Kızıl Ay', colors: ['#7F1D1D', '#080F1E'], minLevel: 1 },
  { id: 'orman', name: 'Zümrüt Orman', colors: ['#14532D', '#080F1E'], minLevel: 4 },
  { id: 'okyanus', name: 'Derin Okyanus', colors: ['#0C4A6E', '#080F1E'], minLevel: 7 },
  { id: 'altin', name: 'Altın Saray', colors: ['#78350F', '#080F1E'], minLevel: 10 },
  { id: 'galaksi', name: 'Galaksi', colors: ['#581C87', '#0B1026'], minLevel: 13 },
];

// --- Mock weekly contribution (power) per member -------------------------------
export const memberPower = (id: string, i: number) => (id === 'me' ? 0 : Math.max(40, Math.round(((i * 7_919) % 97) * 61 + 300 - i * 37)));
export const KASA_HISTORY_MOCK = [
  { id: 'h1', userId: 'u1', text: 'Aile odasında hediye', power: 24, treasure: 24, time: 'Bugün 14:20' },
  { id: 'h2', userId: 'u5', text: 'Yoklama', power: 1, treasure: 1, time: 'Bugün 12:05' },
  { id: 'h3', userId: 'u11', text: 'İkili hediyesi', power: 12, treasure: 12, time: 'Dün 23:41' },
  { id: 'h4', userId: 'u2', text: 'Aile odasında 15 dakika', power: 1, treasure: 1, time: 'Dün 22:10' },
];

// --- Module-level progress store ------------------------------------------------
export type KabileHistory = { id: string; text: string; power: number; treasure: number; time: string };
export type KabileProgress = {
  day: string; // UTC+3 date of the daily counters
  week: number; // UTC+3 Monday-based week index of the weekly counters
  chatMsgs: number;
  chatGiftCoins: number;
  cpGiftCoins: number;
  baselines: Partial<Record<TaskSource, number>>; // app-store counter value when "Git" was pressed
  claimed: string[]; // count tasks claimed today
  claimedSteps: Record<string, number>; // rate tasks: reward steps already claimed today
  myPower: number; // my power this week
  addedPower: number; // power added to the kabile this week (by me)
  addedTreasure: number;
  chests: string[]; // milestone chests claimed this week
  items: { label: string; until: string }[];
  history: KabileHistory[];
};

const DAY_MS = 86_400_000;
const shifted = () => Date.now() + 3 * 3_600_000; // UTC+3: tasks reset at 0:00
const dayKey = () => new Date(shifted()).toISOString().slice(0, 10);
const weekKey = () => Math.floor((Math.floor(shifted() / DAY_MS) + 3) / 7); // 1970-01-01 was a Thursday

let state: KabileProgress = {
  day: '',
  week: -1,
  chatMsgs: 0,
  chatGiftCoins: 0,
  cpGiftCoins: 0,
  baselines: {},
  claimed: [],
  claimedSteps: {},
  myPower: 0,
  addedPower: 0,
  addedTreasure: 0,
  chests: [],
  items: [],
  history: [],
};
const listeners = new Set<() => void>();
const set = (patch: Partial<KabileProgress>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/** Roll daily/weekly counters over. Call from handlers or effects (never during render). */
export const ensureFresh = () => {
  const d = dayKey();
  const w = weekKey();
  if (state.day === d && state.week === w) return;
  const daily: Partial<KabileProgress> = state.day === d ? {} : { day: d, chatMsgs: 0, chatGiftCoins: 0, cpGiftCoins: 0, baselines: {}, claimed: [], claimedSteps: {} };
  const weekly: Partial<KabileProgress> = state.week === w ? {} : { week: w, myPower: 0, addedPower: 0, addedTreasure: 0, chests: [] };
  set({ ...daily, ...weekly });
};

const clock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const kabile = {
  trackChatMessage: () => (ensureFresh(), set({ chatMsgs: state.chatMsgs + 1 })),
  trackChatGift: (coins: number) => (ensureFresh(), set({ chatGiftCoins: state.chatGiftCoins + coins })),
  trackCpGift: (coins: number) => (ensureFresh(), set({ cpGiftCoins: state.cpGiftCoins + coins })),
  /** Start measuring an app-store counter (room minutes, gifts sent, coins spent) from now. */
  startMeasuring: (source: TaskSource, value: number) => {
    ensureFresh();
    if (state.baselines[source] === undefined) set({ baselines: { ...state.baselines, [source]: value } });
  },
  addPower: (text: string, power: number, treasure: number) => {
    ensureFresh();
    set({
      myPower: state.myPower + power,
      addedPower: state.addedPower + power,
      addedTreasure: state.addedTreasure + treasure,
      history: [{ id: `${Date.now()}-${state.history.length}`, text, power, treasure, time: `Bugün ${clock()}` }, ...state.history],
    });
  },
  claimCount: (task: KabileTask) => {
    ensureFresh();
    if (state.claimed.includes(task.id)) return false;
    set({ claimed: [...state.claimed, task.id] });
    kabile.addPower(task.title, task.power, task.treasure);
    return true;
  },
  claimSteps: (task: KabileTask, steps: number) => {
    ensureFresh();
    const already = state.claimedSteps[task.id] ?? 0;
    if (steps <= already) return 0;
    const n = steps - already;
    set({ claimedSteps: { ...state.claimedSteps, [task.id]: steps } });
    kabile.addPower(`${task.title} ×${n}`, task.power * n, task.treasure * n);
    return n;
  },
  claimChest: (chestId: string) => {
    ensureFresh();
    const chest = KABILE_CHESTS.find((c) => c.id === chestId);
    if (!chest || state.chests.includes(chestId)) return null;
    const item = chest.reward.item;
    const until = item ? new Date(Date.now() + item.days * DAY_MS).toLocaleDateString('tr-TR') : '';
    set({ chests: [...state.chests, chestId], items: item ? [{ label: item.label, until }, ...state.items] : state.items });
    return chest.reward;
  },
};

/** Opens a weekly milestone chest and credits its coins. A live build gets nothing (chest rewards are not on the server). */
export function openKabileChest(chestId: string, credit: Credit, live?: boolean): ChestReward | null {
  if (!tayfaAvailable(live)) return null;
  const r = kabile.claimChest(chestId);
  if (r) credit(r.coins, `Aile sandığı: ${KABILE_CHESTS.find((c) => c.id === chestId)?.name ?? chestId}`);
  return r;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => state;
export const useKabileProgress = () => useSyncExternalStore(subscribe, snapshot, snapshot);

/** Progress of a task given the app-store counters. Pure: safe during render. */
export const taskProgress = (task: KabileTask, p: KabileProgress, counters: { roomMinutes: number; giftsSent: number; spentTotal: number }) => {
  const delta = (src: TaskSource, value: number) => (p.baselines[src] === undefined ? 0 : Math.max(0, value - (p.baselines[src] ?? 0)));
  const value =
    task.source === 'chatMsgs' ? p.chatMsgs
    : task.source === 'roomMinutes' ? delta('roomMinutes', counters.roomMinutes)
    : task.source === 'giftsSent' ? delta('giftsSent', counters.giftsSent)
    : task.source === 'checkIn' ? 1 // check-in is a single tap, once per day
    : task.source === 'roomGiftCoins' ? delta('roomGiftCoins', counters.spentTotal)
    : task.source === 'cpGiftCoins' ? p.cpGiftCoins
    : p.chatGiftCoins;
  if (task.kind === 'count') {
    const claimed = p.claimed.includes(task.id);
    return { value: Math.min(value, task.goal), claimed, claimable: !claimed && value >= task.goal, steps: 0, newSteps: 0 };
  }
  const steps = Math.floor(value / task.per);
  const newSteps = steps - (p.claimedSteps[task.id] ?? 0);
  return { value, claimed: false, claimable: newSteps > 0, steps, newSteps };
};
