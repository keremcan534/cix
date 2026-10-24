import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import {
  AGENCIES,
  CHECKIN_REWARDS,
  EXCHANGE_FEE,
  MIN_WITHDRAW_DIAMONDS,
  TASKS,
  VIP_TIERS,
  type TaskKey,
} from '@/data/economy';
import { CONVERSATIONS, ME, type Conversation, type User } from '@/data/mock';

export type EarningSource = 'Hediye' | 'Arama' | 'Görev' | 'Ajans bonusu';
export type Earning = { id: string; amount: number; source: EarningSource; fromId?: string; time: string };
export type Withdrawal = { id: string; diamonds: number; iban: string; status: 'Beklemede' | 'Onaylandı'; time: string };

type AppState = {
  // auth & profile
  loggedIn: boolean;
  me: User;
  updateMe: (patch: Partial<User>) => void;
  login: () => void;
  logout: () => void;
  phone: string;
  setPhone: (phone: string) => void;
  // coins
  coins: number;
  addCoins: (n: number) => void;
  spendCoins: (n: number) => boolean;
  // host economy
  isHost: boolean;
  becomeHost: () => void;
  diamonds: number;
  totalDiamonds: number;
  weekly: number[];
  earnings: Earning[];
  receiveDiamonds: (n: number, source: EarningSource, fromId?: string) => void;
  withdrawals: Withdrawal[];
  requestWithdraw: (diamonds: number, iban: string) => string | null;
  exchangeDiamonds: (diamonds: number) => number;
  // tasks & check-in
  stats: Record<TaskKey, number>;
  bump: (key: TaskKey, n?: number) => void;
  claimedTasks: Set<string>;
  claimTask: (taskId: string) => void;
  checkInDay: number;
  checkedInToday: boolean;
  checkIn: () => number;
  inviteCode: string;
  // vip, agency, family
  vipLevel: number;
  buyVip: (level: number) => boolean;
  agencyId: string | null;
  joinAgency: (code: string) => boolean;
  leaveAgency: () => void;
  familyId: string | null;
  setFamily: (id: string | null) => void;
  // social
  following: Set<string>;
  toggleFollow: (userId: string) => void;
  blocked: Set<string>;
  toggleBlock: (userId: string) => void;
  conversations: Conversation[];
  sendMessage: (userId: string, text: string, fromMe?: boolean) => void;
  markRead: (userId: string) => void;
};

const Ctx = createContext<AppState | null>(null);

export const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const uid = () => String(Date.now() + Math.random());
const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState<User>({ ...ME });
  const [phone, setPhone] = useState('');

  // Coins are read synchronously by spendCoins (e.g. from call timers), so mirror them in a ref.
  const [coins, setCoinsState] = useState(250);
  const coinsRef = useRef(250);
  const setCoins = (fn: (c: number) => number) => {
    coinsRef.current = fn(coinsRef.current);
    setCoinsState(coinsRef.current);
  };

  const [isHost, setIsHost] = useState(false);
  const [diamonds, setDiamonds] = useState(0);
  const [totalDiamonds, setTotalDiamonds] = useState(0);
  const [weekly, setWeekly] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  const [stats, setStats] = useState<Record<TaskKey, number>>({ roomMinutes: 0, giftsSent: 0, greetings: 0, moments: 0, calls: 0 });
  const [claimedTasks, setClaimedTasks] = useState<Set<string>>(new Set());
  const [checkInDay, setCheckInDay] = useState(2); // demo: user already has a 2-day streak
  const [checkedInToday, setCheckedInToday] = useState(false);

  const [vipLevel, setVipLevel] = useState(0);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);

  const [following, setFollowing] = useState<Set<string>>(new Set(['u1']));
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState(CONVERSATIONS);

  const receiveDiamonds = (n: number, source: EarningSource, fromId?: string) => {
    setDiamonds((d) => d + n);
    setTotalDiamonds((d) => d + n);
    setWeekly((w) => [...w.slice(0, 6), w[6] + n]);
    setEarnings((e) => [{ id: uid(), amount: n, source, fromId, time: now() }, ...e].slice(0, 100));
  };

  const value: AppState = {
    loggedIn,
    me,
    updateMe: (patch) => {
      // Prototype shortcut: mock lookups (userById('me')) read the shared ME object.
      Object.assign(ME, patch);
      setMe({ ...ME });
    },
    login: () => setLoggedIn(true),
    logout: () => setLoggedIn(false),
    phone,
    setPhone,

    coins,
    addCoins: (n) => setCoins((c) => c + n),
    spendCoins: (n) => {
      if (coinsRef.current < n) return false;
      setCoins((c) => c - n);
      return true;
    },

    isHost,
    becomeHost: () => {
      setIsHost(true);
      // Seed a believable history so the host center isn't empty in demos.
      setWeekly([1_240, 3_310, 860, 4_920, 2_150, 5_480, 0]);
      setDiamonds(12_450);
      setTotalDiamonds(17_960);
    },
    diamonds,
    totalDiamonds,
    weekly,
    earnings,
    receiveDiamonds,
    withdrawals,
    requestWithdraw: (amount, iban) => {
      if (amount < MIN_WITHDRAW_DIAMONDS) return `En az ${MIN_WITHDRAW_DIAMONDS.toLocaleString('tr-TR')} elmas çekebilirsin.`;
      if (amount > diamonds) return 'Yetersiz elmas bakiyesi.';
      if (iban.replace(/\s/g, '').length !== 26) return 'Geçerli bir IBAN gir (TR + 24 hane).';
      setDiamonds((d) => d - amount);
      const id = uid();
      setWithdrawals((w) => [{ id, diamonds: amount, iban, status: 'Beklemede', time: now() }, ...w]);
      // Demo: auto-approve after a few seconds.
      setTimeout(() => setWithdrawals((w) => w.map((x) => (x.id === id ? { ...x, status: 'Onaylandı' } : x))), 5000);
      return null;
    },
    exchangeDiamonds: (amount) => {
      const n = Math.min(amount, diamonds);
      const gained = Math.floor(n * (1 - EXCHANGE_FEE));
      setDiamonds((d) => d - n);
      setCoins((c) => c + gained);
      return gained;
    },

    stats,
    bump: (key, n = 1) => setStats((s) => ({ ...s, [key]: s[key] + n })),
    claimedTasks,
    claimTask: (taskId) => {
      const task = TASKS.find((t) => t.id === taskId);
      if (!task || claimedTasks.has(taskId) || stats[task.key] < task.goal) return;
      setClaimedTasks((s) => new Set(s).add(taskId));
      setCoins((c) => c + task.reward);
    },
    checkInDay,
    checkedInToday,
    checkIn: () => {
      if (checkedInToday) return 0;
      const reward = CHECKIN_REWARDS[checkInDay % CHECKIN_REWARDS.length];
      setCoins((c) => c + reward);
      setCheckedInToday(true);
      setCheckInDay((d) => d + 1);
      return reward;
    },
    inviteCode: 'VIBE-7K2Q',

    vipLevel,
    buyVip: (level) => {
      const tier = VIP_TIERS.find((t) => t.level === level);
      if (!tier || coinsRef.current < tier.price) return false;
      setCoins((c) => c - tier.price);
      setVipLevel(level);
      return true;
    },
    agencyId,
    joinAgency: (code) => {
      const a = AGENCIES.find((x) => x.code === code.trim().toUpperCase());
      if (!a) return false;
      setAgencyId(a.id);
      return true;
    },
    leaveAgency: () => setAgencyId(null),
    familyId,
    setFamily: setFamilyId,

    following,
    toggleFollow: (id) => setFollowing((prev) => toggle(prev, id)),
    blocked,
    toggleBlock: (id) => setBlocked((prev) => toggle(prev, id)),
    conversations,
    sendMessage: (userId, text, fromMe = true) =>
      setConversations((prev) => {
        const msg = { id: uid(), fromMe, text, time: now() };
        const existing = prev.find((c) => c.userId === userId);
        if (!existing) return [{ id: `c-${userId}`, userId, unread: 0, messages: [msg] }, ...prev];
        return [
          { ...existing, messages: [...existing.messages, msg] },
          ...prev.filter((c) => c.userId !== userId),
        ];
      }),
    markRead: (userId) =>
      setConversations((prev) => prev.map((c) => (c.userId === userId ? { ...c, unread: 0 } : c))),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
