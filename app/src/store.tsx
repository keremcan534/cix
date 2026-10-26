import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { agencyByCode, type AgencyRole } from '@/data/agency';
import { COSMETICS, EMOJI_PACKS, type CosmeticKind, type RoomTheme, type RoomType, type TicketCategory } from '@/data/catalog';
import {
  CHECKIN_REWARDS,
  EXCHANGE_FEE,
  TASKS,
  type TaskKey,
} from '@/data/economy';
import { INITIAL_RBAC, type RbacState } from '@/data/rbac';
import { NOBLE_DAYS, RECHARGE_PACKS, VIP_PLANS, nobleInfo, svipLevelOf } from '@/data/status';
import { RULES, type Rules } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import { clearState, loadState, saveState, today } from '@/lib/persist';
import { setHapticsEnabled } from '@/lib/haptics';
import { CONVERSATIONS, ME, type Conversation, type User } from '@/data/mock';
import type { CallsFrom, DmFrom } from '@/data/privacy';

export type EarningSource = 'Hediye' | 'Arama' | 'Görev' | 'Ajans bonusu' | 'Oda sahibi bonusu' | 'Aile bonusu' | 'Arama bonusu';
export type Earning = { id: string; amount: number; source: EarningSource; fromId?: string; time: string };
export type Withdrawal = { id: string; diamonds: number; iban: string; status: 'Beklemede' | 'Onaylandı'; time: string };
export type LedgerRow = { id: string; ref: string; currency: 'coin' | 'diamond'; amount: number; reason: string; time: string; status: 'Başarılı' | 'Beklemede' | 'İade' };
export type Notice = { id: string; kind: 'social' | 'finance' | 'security' | 'system'; icon: string; title: string; body: string; time: string; read: boolean; href?: string };
export type Ticket = { id: string; number: string; category: TicketCategory; text: string; status: 'Açık' | 'Yanıtlandı' | 'Çözüldü' | 'Yeniden açıldı'; time: string; replies: { from: 'me' | 'support'; text: string; time: string }[] };
export type NotifyType = 'live' | 'invite' | 'event' | 'agency' | 'fanclub' | 'game' | 'payment' | 'system';
export type Settings = {
  effectsOff: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  lowData: boolean;
  invisibleEntry: boolean;
  cityDiscovery: boolean;
  showOnline: boolean;
  /** Offline users show "son görülme"; off hides it (and you don't see others' either, like most messengers). */
  showLastSeen: boolean;
  /** Profile shows which room you are in. */
  showCurrentRoom: boolean;
  dmFrom: DmFrom;
  callsFrom: CallsFrom;
  profilePublic: boolean;
  notifySocial: boolean;
  notifyFinance: boolean;
  notifyTypes: Record<NotifyType, boolean>;
  snoozeUntil: number; // epoch ms; 0 = not snoozed
  roomBot: boolean;
  // personal room audio (affects only this user)
  roomMuted: boolean;
  musicVolume: number; // 0..1
  voiceVolume: number;
  giftSounds: boolean;
  bigGiftsOnly: boolean;
  micDenoise: boolean;
  invitesFrom: 'everyone' | 'following' | 'nobody';
  dailySpendLimit: number; // coins; 0 = no limit
  bigSpendConfirm: number; // coins; extra confirmation above this (0 = off, the default)
};
/** Block, unblock, report and data requests are kept as a record (spec: profile §5). */
export type SafetyLog = { id: string; action: 'Engelledi' | 'Engeli kaldırdı' | 'Şikâyet etti' | 'Veri dökümü istedi' | 'Fotoğraf incelemeye gönderildi' | 'Fotoğraf onaylandı'; targetId?: string; detail?: string; time: string };
export type RuleChange = { id: string; time: string; field: string; from: string; to: string; version: number };
export type InviteReward = { id: string; inviteeId: string; ref: string; status: 'Beklemede' | 'Onaylandı' | 'İptal edildi'; time: string };
export type Session = { id: string; device: string; place: string; last: string; current?: boolean };
export type FanClub = { points: number; history: { text: string; pts: number; time: string }[] };
export type GroupMsg = { id: string; userId: string; text: string; time: string; system?: boolean; actionLabel?: string; actionHref?: string };
export type MyRoom = { title: string; announcement: string; cover: string; password: string; locked: boolean; limit: number; xp: number; adminIds: string[]; micMode: 'free' | 'request' | 'members'; roomType: RoomType; giftEffects: boolean; joinSounds: boolean; lockedSeats: number[];
  theme: RoomTheme; micCount: number; micPermission: 'everyone' | 'members'; bossSeat: boolean;
  joinMode: 'open' | 'apply' | 'closed'; manageMembers: 'owner' | 'admins'; manageFunctions: 'owner' | 'admins';
  autoRemoveDays: 0 | 7 | 14 | 30; profileVisible: boolean; videoPrivacy: boolean; memberIds: string[]; blacklist: string[] };
export type OwnedAgency = { name: string; code: string; status: 'İnceleniyor' | 'Onaylandı' };
export type TransferStep = { label: string; status: 'Bekliyor' | 'Onaylandı' | 'Reddedildi' | 'Tamamlandı'; time?: string; note?: string };
export type TransferRequest = {
  toCode: string | null;
  reason: string;
  status: 'Beklemede' | 'Onaylandı' | 'Reddedildi' | 'Tamamlandı';
  created: string;
  decisionIn: string;
  mode?: 'Ücretli' | 'Ücretsiz';
  fee?: number;
  feeRule: string;
  steps: TransferStep[];
};

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
  addCoins: (n: number, reason?: string) => void;
  spendCoins: (n: number, reason?: string) => boolean;
  spentTotal: number;
  ledger: LedgerRow[];
  // cosmetics & emoji
  inventory: Set<string>;
  equipped: Partial<Record<CosmeticKind, string>>;
  buyCosmetic: (id: string) => string | null;
  equip: (id: string | null, kind: CosmeticKind) => void;
  emojiPacks: Set<string>;
  buyEmojiPack: (id: string) => string | null;
  recentEmojis: string[];
  rememberEmoji: (e: string) => void;
  // settings, notifications, support
  settings: Settings;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  notifications: Notice[];
  notify: (n: Omit<Notice, 'id' | 'time' | 'read'>) => void;
  markNotificationsRead: () => void;
  tickets: Ticket[];
  createTicket: (category: TicketCategory, text: string) => string;
  replyTicket: (id: string, text: string) => void;
  setTicketStatus: (id: string, status: Ticket['status']) => void;
  deletionRequested: boolean;
  requestDeletion: () => void;
  // my room
  myRoom: MyRoom;
  updateMyRoom: (patch: Partial<MyRoom>) => void;
  addRoomXp: (n: number) => void;
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
  /** Visual status level (frames/badges), derived from SVIP, Asil and VIP subscription. */
  vipLevel: number;
  svipXp: number;
  svipLevel: number;
  firstBuys: Set<string>;
  buyPack: (packId: string) => number;
  nobleTier: number;
  nobleDays: number;
  buyNoble: (tier: number) => boolean;
  vipDays: number;
  buyVipPlan: (days: number) => boolean;
  // central role & permission center (demo state)
  rbac: RbacState;
  updateRbac: (fn: (s: RbacState) => RbacState) => void;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
  setAgencyRole: (r: AgencyRole) => void;
  pendingAgency: string | null;
  joinAgency: (code: string) => string | null;
  leaveAgency: () => void;
  ownedAgency: OwnedAgency | null;
  /** Called when an admin approves the demo user's own agency application (lib/agency-apps). */
  activateOwnedAgency: (name: string, code: string) => void;
  transfer: TransferRequest | null;
  requestTransfer: (toCode: string | null, reason: string) => string | null;
  agencyChat: GroupMsg[];
  sendAgencyMessage: (text: string) => void;
  // rules (admin demo), invites, security, fan clubs, rooms, family
  rules: Rules;
  setRule: <K extends keyof Rules>(k: K, v: Rules[K]) => void;
  ruleHistory: RuleChange[];
  inviteRewards: InviteReward[];
  simulateInviteePurchase: () => void;
  spentToday: number;
  sessions: Session[];
  endSession: (id: string) => void;
  fanClubs: Record<string, FanClub>;
  addFanPoints: (hostId: string, pts: number, text: string) => void;
  recentRooms: string[];
  visitRoom: (id: string) => void;
  familyRole: 'owner' | 'helper' | 'member' | null;
  setFamilyRole: (r: 'owner' | 'helper' | 'member' | null) => void;
  familyChat: GroupMsg[];
  sendFamilyMessage: (text: string, userId?: string) => void;
  familyMuted: boolean;
  setFamilyMuted: (v: boolean) => void;
  referralCode: string;
  familyId: string | null;
  setFamily: (id: string | null) => void;
  // social
  following: Set<string>;
  toggleFollow: (userId: string) => void;
  blocked: Set<string>;
  toggleBlock: (userId: string) => void;
  safetyLog: SafetyLog[];
  logSafety: (action: SafetyLog['action'], targetId?: string, detail?: string) => void;
  /** New profile photo waiting for moderation; others keep seeing the old one until it is approved. */
  pendingAvatar: string | null;
  submitAvatar: (uri: string) => void;
  requestDataExport: () => void;
  conversations: Conversation[];
  sendMessage: (userId: string, text: string, fromMe?: boolean) => void;
  markRead: (userId: string) => void;
  /** "İlk adımlar" card on the home tab: reward claimed once, or hidden by the user. */
  starter: { claimed: boolean; hidden: boolean };
  claimStarter: (reward: number) => void;
  hideStarter: () => void;
  /** Wipes the saved demo state and starts over with the defaults. */
  resetAll: () => void;
};

/** What survives an app restart (lib/persist). Sets are stored as arrays. */
type Snapshot = {
  loggedIn: boolean;
  me: User;
  coins: number;
  spentTotal: number;
  ledger: LedgerRow[];
  spentDay: { date: string; amount: number };
  inventory: string[];
  equipped: Partial<Record<CosmeticKind, string>>;
  emojiPacks: string[];
  recentEmojis: string[];
  settings: Partial<Settings>;
  notifications: Notice[];
  myRoom: Partial<MyRoom>;
  isHost: boolean;
  diamonds: number;
  totalDiamonds: number;
  weekly: number[];
  earnings: Earning[];
  withdrawals: Withdrawal[];
  stats: Record<TaskKey, number>;
  claimedTasks: string[];
  checkInDay: number;
  checkInDate: string;
  svipXp: number;
  firstBuys: string[];
  nobleTier: number;
  nobleDays: number;
  vipDays: number;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
  ownedAgency: OwnedAgency | null;
  familyRole: 'owner' | 'helper' | 'member' | null;
  familyId: string | null;
  fanClubs: Record<string, FanClub>;
  recentRooms: string[];
  following: string[];
  blocked: string[];
  conversations: Conversation[];
  starter: { claimed: boolean; hidden: boolean };
  safetyLog: SafetyLog[];
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

const ME_DEFAULT = { ...ME };

/** Loads the saved state first (the splash screen stays up meanwhile), then mounts the store. */
export function AppProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [boot, setBoot] = useState<{ gen: number; initial: Partial<Snapshot> | null } | null>(null);
  useEffect(() => {
    loadState<Partial<Snapshot>>().then((initial) => {
      // Prototype shortcut: mock lookups (userById('me')) read the shared ME object.
      if (initial?.me) Object.assign(ME, initial.me);
      setBoot({ gen: 0, initial });
    });
  }, []);
  const ready = !!boot;
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);
  if (!boot) return null;
  const reset = () => {
    clearState();
    Object.assign(ME, ME_DEFAULT);
    setBoot((b) => ({ gen: (b?.gen ?? 0) + 1, initial: null }));
  };
  return (
    <StateProvider key={boot.gen} initial={boot.initial ?? {}} onReset={reset}>
      {children}
    </StateProvider>
  );
}

function StateProvider({ children, initial: s, onReset }: { children: ReactNode; initial: Partial<Snapshot>; onReset: () => void }) {
  const [loggedIn, setLoggedIn] = useState(s.loggedIn ?? false);
  const [me, setMe] = useState<User>({ ...ME });
  const [phone, setPhone] = useState('');

  // Coins are read synchronously by spendCoins (e.g. from call timers), so mirror them in a ref.
  const [coins, setCoinsState] = useState(s.coins ?? 250);
  const coinsRef = useRef(s.coins ?? 250);
  const setCoins = (fn: (c: number) => number) => {
    coinsRef.current = fn(coinsRef.current);
    setCoinsState(coinsRef.current);
  };

  const [isHost, setIsHost] = useState(s.isHost ?? false);
  const [diamonds, setDiamonds] = useState(s.diamonds ?? 0);
  const [totalDiamonds, setTotalDiamonds] = useState(s.totalDiamonds ?? 0);
  const [weekly, setWeekly] = useState(s.weekly ?? [0, 0, 0, 0, 0, 0, 0]);
  const [earnings, setEarnings] = useState<Earning[]>(s.earnings ?? []);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(s.withdrawals ?? []);

  const [stats, setStats] = useState<Record<TaskKey, number>>(s.stats ?? { roomMinutes: 0, giftsSent: 0, greetings: 0, moments: 0, calls: 0 });
  const [claimedTasks, setClaimedTasks] = useState<Set<string>>(new Set(s.claimedTasks));
  const [checkInDay, setCheckInDay] = useState(s.checkInDay ?? 2); // demo: user already has a 2-day streak
  const [checkInDate, setCheckInDate] = useState(s.checkInDate ?? '');
  const [checkedInToday, setCheckedInToday] = useState(() => s.checkInDate === today());

  const [spentTotal, setSpentTotal] = useState(s.spentTotal ?? 0);
  const [ledger, setLedger] = useState<LedgerRow[]>(s.ledger ?? []);
  const log = (currency: LedgerRow['currency'], amount: number, reason: string, status: LedgerRow['status'] = 'Başarılı') =>
    setLedger((l) => [{ id: uid(), ref: `TX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, currency, amount, reason, time: now(), status }, ...l].slice(0, 200));
  const spentStart = s.spentDay?.date === today() ? s.spentDay.amount : 0;
  const spentTodayRef = useRef(spentStart);
  const [spentToday, setSpentToday] = useState(spentStart);

  const [rules, setRules] = useState<Rules>({ ...RULES });
  const [ruleHistory, setRuleHistory] = useState<RuleChange[]>([]);
  const [inviteRewards, setInviteRewards] = useState<InviteReward[]>([
    { id: 'ir1', inviteeId: 'u3', ref: 'PUR-••41', status: 'Onaylandı', time: 'Pzt' },
    { id: 'ir2', inviteeId: 'u3', ref: 'PUR-••58', status: 'Onaylandı', time: 'Sal' },
    { id: 'ir3', inviteeId: 'u10', ref: 'PUR-••77', status: 'İptal edildi', time: 'Çar' },
  ]);
  const [sessions, setSessions] = useState<Session[]>([
    { id: 's1', device: 'Bu cihaz', place: 'İstanbul', last: 'Şimdi', current: true },
    { id: 's2', device: 'Android · Samsung', place: 'İstanbul', last: 'Dün 23:10' },
    { id: 's3', device: 'Web · Chrome', place: 'Ankara', last: '3 gün önce' },
  ]);
  const [fanClubs, setFanClubs] = useState<Record<string, FanClub>>(s.fanClubs ?? {});
  const [recentRooms, setRecentRooms] = useState<string[]>(s.recentRooms ?? []);
  const [familyRole, setFamilyRole] = useState<'owner' | 'helper' | 'member' | null>(s.familyRole ?? null);
  const [familyChat, setFamilyChat] = useState<GroupMsg[]>([
    { id: 'f1', userId: 'u1', text: 'Bu hafta hedefimiz LV11! Herkes odaya 🎯', time: '20:10' },
    { id: 'f2', userId: 'u9', text: 'Akşam aile odasında buluşalım mı?', time: '20:14' },
  ]);
  const [familyMuted, setFamilyMuted] = useState(false);
  const [agencyChat, setAgencyChat] = useState<GroupMsg[]>([
    { id: 'a1', userId: 'u1', text: '📢 Hafta sonu PK turnuvası Cumartesi 21:00, herkes hazır olsun!', time: '18:00' },
    { id: 'a2', userId: 'u2', text: 'Ben varım 💪', time: '18:05' },
    { id: 'a3', userId: 'u5', text: 'Yayın saatlerimi panelden güncelledim.', time: '18:20' },
  ]);

  const [inventory, setInventory] = useState<Set<string>>(new Set(s.inventory));
  const [equipped, setEquipped] = useState<Partial<Record<CosmeticKind, string>>>(s.equipped ?? {});
  const [emojiPacks, setEmojiPacks] = useState<Set<string>>(new Set(s.emojiPacks ?? ['basic']));
  const [recentEmojis, setRecentEmojis] = useState<string[]>(s.recentEmojis ?? []);

  const [settings, setSettings] = useState<Settings>(() => ({
    effectsOff: false,
    haptics: true,
    invisibleEntry: false,
    cityDiscovery: false, // location-based discovery is opt-in (spec §31.7)
    showOnline: true,
    showLastSeen: true,
    showCurrentRoom: true,
    dmFrom: 'everyone',
    callsFrom: 'everyone',
    profilePublic: true,
    notifySocial: true,
    notifyFinance: true,
    roomBot: true,
    reduceMotion: false,
    lowData: false,
    notifyTypes: { live: true, invite: true, event: true, agency: true, fanclub: true, game: true, payment: true, system: true },
    snoozeUntil: 0,
    roomMuted: false,
    musicVolume: 0.7,
    voiceVolume: 1,
    giftSounds: true,
    bigGiftsOnly: false, micDenoise: true,
    invitesFrom: 'everyone',
    dailySpendLimit: 0,
    bigSpendConfirm: 0,
    ...s.settings,
  }));
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    setHapticsEnabled(settings.haptics);
  }, [settings]);
  const [notifications, setNotifications] = useState<Notice[]>(s.notifications ?? [
    { id: 'n1', kind: 'social', icon: '👋', title: 'Ayşe sana selam verdi', body: 'Hemen cevap ver!', time: '19:40', read: false, href: '/sohbet/u7' },
    { id: 'n2', kind: 'system', icon: '🎉', title: "Similar Club'a hoş geldin", body: 'Günlük giriş ödülünü almayı unutma.', time: '19:00', read: false, href: '/gorevler' },
    { id: 'n3', kind: 'social', icon: '🎤', title: 'Karaoke Akşamı başladı', body: 'Melis seni odaya davet ediyor.', time: '18:30', read: true, href: '/oda/r2' },
  ]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [deletionRequested, setDeletionRequested] = useState(false);

  const [myRoom, setMyRoom] = useState<MyRoom>(() => ({
    title: 'Benim Odam 🎙️',
    announcement: 'Hoş geldiniz! Saygılı olalım 💜',
    cover: 'https://picsum.photos/seed/myroom/600/400',
    password: '',
    locked: false,
    limit: 50,
    xp: 600, // starts at Lv.4 so lock / mic permission / boss seat can be tried in the demo
    adminIds: [],
    micMode: 'request',
    roomType: 'stage',
    giftEffects: true,
    joinSounds: true,
    lockedSeats: [],
    theme: 'chat',
    micCount: 10,
    micPermission: 'everyone',
    bossSeat: true,
    joinMode: 'apply',
    manageMembers: 'admins',
    manageFunctions: 'admins',
    autoRemoveDays: 14,
    profileVisible: true,
    videoPrivacy: true,
    memberIds: ['u3', 'u5', 'u8', 'u10', 'u12', 'u1', 'u4'],
    blacklist: ['u6'],
    ...s.myRoom,
  }));

  const [svipXp, setSvipXp] = useState(s.svipXp ?? 0);
  const [firstBuys, setFirstBuys] = useState<Set<string>>(new Set(s.firstBuys));
  const [nobleTier, setNobleTier] = useState(s.nobleTier ?? 0);
  const [nobleDays, setNobleDays] = useState(s.nobleDays ?? 0);
  const [vipDays, setVipDays] = useState(s.vipDays ?? 0);
  const [rbac, setRbac] = useState<RbacState>(INITIAL_RBAC);
  const svipLevel = svipLevelOf(svipXp);
  const vipLevel = Math.min(15, Math.max(svipLevel, nobleTier * 3, vipDays > 0 ? 1 : 0));
  const [agencyId, setAgencyId] = useState<string | null>(s.agencyId ?? null);
  const [agencyRole, setAgencyRole] = useState<AgencyRole | null>(s.agencyRole ?? null);
  const [pendingAgency, setPendingAgency] = useState<string | null>(null);
  const [ownedAgency, setOwnedAgency] = useState<OwnedAgency | null>(s.ownedAgency ?? null);
  const [transfer, setTransfer] = useState<TransferRequest | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(s.familyId ?? null);

  const [following, setFollowing] = useState<Set<string>>(new Set(s.following ?? ['u1']));
  const [blocked, setBlocked] = useState<Set<string>>(new Set(s.blocked));
  const [conversations, setConversations] = useState(s.conversations ?? CONVERSATIONS);
  const [starter, setStarter] = useState(s.starter ?? { claimed: false, hidden: false });
  const [safetyLog, setSafetyLog] = useState<SafetyLog[]>(s.safetyLog ?? []);
  const logSafety = (action: SafetyLog['action'], targetId?: string, detail?: string) =>
    setSafetyLog((l) => [{ id: uid(), action, targetId, detail, time: `${new Date().toLocaleDateString('tr-TR')} ${now()}` }, ...l].slice(0, 100));
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);

  // Save after every change (debounced in lib/persist). Pending demo timers (withdrawal approval etc.)
  // are not resumed after a restart; their records keep the last saved status.
  const snapshot: Snapshot = {
    loggedIn, me, coins, spentTotal, ledger: ledger.slice(0, 100), spentDay: { date: today(), amount: spentToday },
    inventory: [...inventory], equipped, emojiPacks: [...emojiPacks], recentEmojis, settings, notifications: notifications.slice(0, 50),
    myRoom, isHost, diamonds, totalDiamonds, weekly, earnings: earnings.slice(0, 50), withdrawals, stats,
    claimedTasks: [...claimedTasks], checkInDay, checkInDate, svipXp, firstBuys: [...firstBuys], nobleTier, nobleDays, vipDays,
    agencyId, agencyRole, ownedAgency, familyRole, familyId, fanClubs, recentRooms,
    following: [...following], blocked: [...blocked], conversations, starter, safetyLog,
  };
  useEffect(() => {
    // Each render reschedules the write with the newest snapshot.
    saveState(() => snapshot);
  });

  const receiveDiamonds = (n: number, source: EarningSource, fromId?: string) => {
    setDiamonds((d) => d + n);
    setTotalDiamonds((d) => d + n);
    setWeekly((w) => [...w.slice(0, 6), w[6] + n]);
    setEarnings((e) => [{ id: uid(), amount: n, source, fromId, time: now() }, ...e].slice(0, 100));
    log('diamond', n, source);
  };

  const notify = (n: Omit<Notice, 'id' | 'time' | 'read'>) => {
    const snoozed = settings.snoozeUntil > Date.now() && n.kind !== 'security' && n.kind !== 'finance';
    const muted = snoozed || (n.kind === 'social' && !settings.notifySocial) || (n.kind === 'finance' && !settings.notifyFinance);
    if (muted) return;
    setNotifications((l) => [{ ...n, id: uid(), time: now(), read: false }, ...l].slice(0, 100));
  };

  const spend = (n: number, reason = 'Harcama') => {
    if (coinsRef.current < n) return false;
    const limit = settingsRef.current.dailySpendLimit;
    if (limit && spentTodayRef.current + n > limit) {
      showAlert('Günlük harcama limiti', `Bugün en fazla ${limit.toLocaleString('tr-TR')} jeton harcayabilirsin (Ayarlar > Harcama kontrolü). Kalan: ${Math.max(0, limit - spentTodayRef.current)}`);
      return false;
    }
    spentTodayRef.current += n;
    setSpentToday(spentTodayRef.current);
    setCoins((c) => c - n);
    setSpentTotal((t) => t + n);
    log('coin', -n, reason);
    return true;
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
    addCoins: (n, reason = 'Jeton yükleme') => {
      setCoins((c) => c + n);
      log('coin', n, reason);
    },
    spendCoins: spend,
    spentTotal,
    ledger,

    inventory,
    equipped,
    buyCosmetic: (id) => {
      const item = COSMETICS.find((c) => c.id === id);
      if (!item) return 'Ürün bulunamadı';
      if (inventory.has(id)) return 'Zaten sahipsin';
      if (item.minVip && vipLevel < item.minVip) return `Bu ürün VIP ${item.minVip} ve üzeri için`;
      if (!spend(item.price, `Mağaza: ${item.name}`)) return 'Yetersiz jeton';
      setInventory((s) => new Set(s).add(id));
      setEquipped((e) => ({ ...e, [item.kind]: id }));
      return null;
    },
    equip: (id, kind) => setEquipped((e) => ({ ...e, [kind]: id ?? undefined })),
    emojiPacks,
    buyEmojiPack: (id) => {
      const pack = EMOJI_PACKS.find((p) => p.id === id);
      if (!pack) return 'Paket bulunamadı';
      if (pack.minVip && vipLevel < pack.minVip) return `VIP ${pack.minVip} ile açılır`;
      if (!spend(pack.price, `Emoji paketi: ${pack.name}`)) return 'Yetersiz jeton';
      setEmojiPacks((s) => new Set(s).add(id));
      return null;
    },
    recentEmojis,
    rememberEmoji: (e) => setRecentEmojis((r) => [e, ...r.filter((x) => x !== e)].slice(0, 16)),

    settings,
    setSetting: (k, v) => setSettings((s) => ({ ...s, [k]: v })),
    notifications,
    notify,
    markNotificationsRead: () => setNotifications((l) => l.map((n) => ({ ...n, read: true }))),
    tickets,
    createTicket: (category, text) => {
      const number = `TK-${String(10_000 + Math.floor(Math.random() * 89_999))}`;
      const id = uid();
      setTickets((t) => [{ id, number, category, text, status: 'Açık', time: now(), replies: [] }, ...t]);
      // Demo: support answers after a few seconds.
      setTimeout(() => {
        setTickets((t) =>
          t.map((x) =>
            x.id === id
              ? { ...x, status: 'Yanıtlandı', replies: [...x.replies, { from: 'support', text: `Merhaba, #${number} numaralı talebini aldık. ${category} ekibimiz inceliyor; ek bilgi gerekirse buradan yazacağız.`, time: now() }] }
              : x,
          ),
        );
        notify({ kind: 'system', icon: '🛟', title: `Destek yanıtı · #${number}`, body: 'Talebine yanıt geldi.', href: '/destek' });
      }, 4000);
      return number;
    },
    replyTicket: (id, text) => setTickets((t) => t.map((x) => (x.id === id ? { ...x, status: 'Yeniden açıldı', replies: [...x.replies, { from: 'me', text, time: now() }] } : x))),
    setTicketStatus: (id, status) => setTickets((t) => t.map((x) => (x.id === id ? { ...x, status } : x))),
    deletionRequested,
    requestDeletion: () => setDeletionRequested(true),

    myRoom,
    updateMyRoom: (patch) => setMyRoom((r) => ({ ...r, ...patch })),
    addRoomXp: (n) => setMyRoom((r) => ({ ...r, xp: r.xp + n })),

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
      if (amount < RULES.minWithdrawDiamonds) return `En az ${RULES.minWithdrawDiamonds.toLocaleString('tr-TR')} elmas çekebilirsin.`;
      if (amount > diamonds) return 'Yetersiz elmas bakiyesi.';
      if (iban.replace(/\s/g, '').length !== 26) return 'Geçerli bir IBAN gir (TR + 24 hane).';
      setDiamonds((d) => d - amount);
      const id = uid();
      setWithdrawals((w) => [{ id, diamonds: amount, iban, status: 'Beklemede', time: now() }, ...w]);
      // Demo: auto-approve after a few seconds.
      log('diamond', -amount, 'Para çekme talebi', 'Beklemede');
      setTimeout(() => {
        setWithdrawals((w) => w.map((x) => (x.id === id ? { ...x, status: 'Onaylandı' } : x)));
        notify({ kind: 'finance', icon: '🏦', title: 'Para çekme onaylandı', body: `${amount.toLocaleString('tr-TR')} elmas hesabına aktarılıyor.`, href: '/yayinci/cek' });
      }, 5000);
      return null;
    },
    exchangeDiamonds: (amount) => {
      const n = Math.min(amount, diamonds);
      const gained = Math.floor(n * (1 - EXCHANGE_FEE));
      setDiamonds((d) => d - n);
      setCoins((c) => c + gained);
      log('diamond', -n, 'Jetona çevrildi');
      log('coin', gained, 'Elmas dönüşümü');
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
      setCheckInDate(today());
      setCheckInDay((d) => d + 1);
      return reward;
    },
    inviteCode: 'SIMI-7K2Q',

    vipLevel,
    svipXp,
    svipLevel,
    firstBuys,
    buyPack: (packId) => {
      const pack = RECHARGE_PACKS.find((p) => p.id === packId);
      if (!pack) return 0;
      // First-purchase bonus applies once per pack; SVIP experience counts the purchased coins only.
      const first = 'firstBonus' in pack && pack.firstBonus && !firstBuys.has(pack.id) ? pack.firstBonus : 0;
      const extra = 'bonus' in pack && pack.bonus ? pack.bonus : 0;
      const total = pack.coins + first + extra;
      setCoins((c) => c + total);
      setSvipXp((x) => x + pack.coins);
      setFirstBuys((f) => new Set(f).add(pack.id));
      log('coin', total, `Yükleme: ${pack.coins.toLocaleString('tr-TR')} paket (${pack.price})${first ? ' · ilk alım bonusu' : ''}`);
      return total;
    },
    nobleTier,
    nobleDays,
    buyNoble: (tier) => {
      const t = nobleInfo(tier);
      if (!t || !spend(t.price, `Asil: ${t.name} (${NOBLE_DAYS} gün)`)) return false;
      setNobleTier(tier);
      setNobleDays(NOBLE_DAYS);
      return true;
    },
    rbac,
    updateRbac: (fn) => setRbac((s) => fn(s)),
    vipDays,
    buyVipPlan: (days) => {
      const plan = VIP_PLANS.find((p) => p.days === days);
      if (!plan || !spend(plan.price, `VIP ${plan.label}`)) return false;
      setVipDays((d) => d + days);
      return true;
    },
    agencyId,
    agencyRole,
    setAgencyRole,
    pendingAgency,
    joinAgency: (code) => {
      const a = agencyByCode(code);
      if (!a) return 'Bu koda ait bir ajans bulunamadı.';
      if (a.status !== 'active') return 'Bu ajans şu anda yeni üye kabul etmiyor (kapalı veya askıda).';
      if (agencyId) return 'Zaten bir ajansa üyesin. Önce ajans değiştirme talebi oluşturmalısın.';
      if (pendingAgency) return 'Bekleyen bir başvurun var.';
      // Demo: the agency approves the application shortly after.
      setPendingAgency(a.id);
      setTimeout(() => {
        setPendingAgency(null);
        setAgencyId(a.id);
        setAgencyRole('member');
        notify({ kind: 'system', icon: '🏢', title: `${a.name} başvurunu kabul etti`, body: 'Artık ajans yayıncısısın.', href: '/ajans' });
      }, 3000);
      return null;
    },
    leaveAgency: () => {
      setAgencyId(null);
      setAgencyRole(null);
    },
    ownedAgency,
    activateOwnedAgency: (name, code) => {
      setPendingAgency(null);
      setOwnedAgency({ name, code, status: 'Onaylandı' });
      setAgencyId('own');
      setAgencyRole('owner');
    },
    transfer,
    requestTransfer: (toCode, reason) => {
      if (!agencyId) return 'Bir ajansa üye değilsin.';
      const to = toCode ? agencyByCode(toCode) : null;
      if (toCode) {
        if (!to) return 'Hedef ajans kodu geçersiz.';
        if (to.status !== 'active') return 'Hedef ajans yeni üye kabul etmiyor.';
        if (to.id === agencyId) return 'Zaten bu ajanstasın.';
      }
      if (reason.trim().length < 5) return 'Lütfen kısa bir gerekçe yaz.';
      // Fee formula (versioned, shown before the request): last 30 days diamonds × 10%.
      const last30 = weekly.reduce((x, y) => x + y, 0) * 4;
      const fee = Math.round(last30 * 0.1);
      const feeRule = 'Son 30 gün elmas × %10 (transfer kuralı v1)';
      const base: TransferRequest = {
        toCode: to ? to.code : null,
        reason,
        status: 'Beklemede',
        created: now(),
        decisionIn: '7 gün',
        feeRule,
        steps: [
          { label: 'Talep oluşturuldu', status: 'Tamamlandı', time: now() },
          { label: 'Mevcut ajans sahibi onayı', status: 'Bekliyor' },
          ...(to ? [{ label: `${to.name} kabulü`, status: 'Bekliyor' as const }] : []),
          { label: to ? 'Bağlantı güncellemesi (tek atomik işlem)' : 'Ajanstan ayrılma', status: 'Bekliyor' },
        ],
      };
      setTransfer(base);
      notify({ kind: 'system', icon: '📨', title: 'Transfer talebin mevcut ajansa iletildi', body: 'Ajans sahibine bildirim gitti.', href: '/ajans' });
      // Demo timeline: owner approves (paid if moving to another agency), target accepts, link switches.
      setTimeout(() => {
        setTransfer((t) =>
          t && {
            ...t,
            mode: to ? 'Ücretli' : 'Ücretsiz',
            fee: to ? fee : 0,
            steps: t.steps.map((st, i) => (i === 1 ? { ...st, status: 'Onaylandı', time: now(), note: to ? `Ücretli transfer · ${fee.toLocaleString('tr-TR')} 💎` : 'Ücretsiz ayrılma' } : st)),
          },
        );
        notify({ kind: 'system', icon: '✅', title: 'Mevcut ajans transferi onayladı', body: to ? `Ücretli transfer · ${fee.toLocaleString('tr-TR')} elmas (hedef ajans öder)` : 'Ayrılma onaylandı', href: '/ajans' });
      }, 2500);
      setTimeout(() => {
        setTransfer((t) => t && { ...t, status: 'Tamamlandı', steps: t.steps.map((st) => (st.status === 'Bekliyor' ? { ...st, status: 'Tamamlandı', time: now() } : st)) });
        if (to) {
          setAgencyId(to.id);
          setAgencyRole('member');
        } else {
          setAgencyId(null);
          setAgencyRole(null);
        }
        notify({ kind: 'system', icon: '🏢', title: to ? `${to.name} ajansına geçişin tamamlandı` : 'Ajanstan ayrıldın', body: 'Geçmiş kazançların ve komisyon dönemlerin ayrı ayrı korunuyor.', href: '/ajans' });
      }, 6000);
      return null;
    },
    agencyChat,
    sendAgencyMessage: (text) => setAgencyChat((m) => [...m, { id: uid(), userId: 'me', text, time: now() }]),
    rules,
    setRule: (k, v) => {
      const from = JSON.stringify(RULES[k]);
      (RULES as Record<string, unknown>)[k] = v;
      RULES.version += 1;
      setRules({ ...RULES });
      setRuleHistory((h) => [{ id: uid(), time: now(), field: String(k), from, to: JSON.stringify(v), version: RULES.version }, ...h]);
    },
    ruleHistory,
    inviteRewards,
    simulateInviteePurchase: () => {
      const id = uid();
      const invitee = ['u3', 'u10', 'u12'][Math.floor(Math.random() * 3)];
      setInviteRewards((r) => [{ id, inviteeId: invitee, ref: `PUR-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, status: 'Beklemede', time: now() }, ...r]);
      // Confirmed after the store payment settles; each successful purchase = 1 unit.
      setTimeout(() => setInviteRewards((r) => r.map((x) => (x.id === id ? { ...x, status: 'Onaylandı' } : x))), 3000);
    },
    spentToday,
    sessions,
    endSession: (id) => setSessions((l) => l.filter((x) => x.id !== id || x.current)),
    fanClubs,
    addFanPoints: (hostId, pts, text) =>
      setFanClubs((f) => {
        const club = f[hostId] ?? { points: 0, history: [] };
        return { ...f, [hostId]: { points: club.points + pts, history: [{ text, pts, time: now() }, ...club.history].slice(0, 50) } };
      }),
    recentRooms,
    visitRoom: (id) => setRecentRooms((r) => [id, ...r.filter((x) => x !== id)].slice(0, 10)),
    familyRole,
    setFamilyRole,
    familyChat,
    sendFamilyMessage: (text, userId = 'me') => setFamilyChat((m) => [...m, { id: uid(), userId, text, time: now() }]),
    familyMuted,
    setFamilyMuted,
    referralCode: 'NET-K7Q2',
    familyId,
    setFamily: setFamilyId,

    following,
    toggleFollow: (id) => setFollowing((prev) => toggle(prev, id)),
    blocked,
    toggleBlock: (id) => {
      logSafety(blocked.has(id) ? 'Engeli kaldırdı' : 'Engelledi', id);
      setBlocked((prev) => toggle(prev, id));
    },
    safetyLog,
    logSafety,
    pendingAvatar,
    submitAvatar: (uri) => {
      // Demo moderation: the photo is "reviewed" for a few seconds, then goes live.
      setPendingAvatar(uri);
      logSafety('Fotoğraf incelemeye gönderildi');
      setTimeout(() => {
        Object.assign(ME, { avatar: uri });
        setMe({ ...ME });
        setPendingAvatar((p) => (p === uri ? null : p));
        logSafety('Fotoğraf onaylandı');
        notify({ kind: 'system', icon: '🖼️', title: 'Profil fotoğrafın onaylandı', body: 'Yeni fotoğrafın artık herkese görünüyor.', href: '/kullanici/me' });
      }, 4000);
    },
    requestDataExport: () => {
      logSafety('Veri dökümü istedi');
      notify({ kind: 'security', icon: '📦', title: 'Veri dökümü talebin alındı', body: 'Kişisel verilerinin bir kopyası 30 gün içinde kayıtlı e-postana gönderilir (KVKK md. 11).' });
    },
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
    starter,
    claimStarter: (reward) => {
      if (starter.claimed) return;
      setStarter((st) => ({ ...st, claimed: true }));
      setCoins((c) => c + reward);
      log('coin', reward, 'İlk adımlar ödülü');
    },
    hideStarter: () => setStarter((st) => ({ ...st, hidden: true })),
    resetAll: onReset,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
