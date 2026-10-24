import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

import { agencyByCode, type AgencyRole } from '@/data/agency';
import { COSMETICS, EMOJI_PACKS, type CosmeticKind, type TicketCategory } from '@/data/catalog';
import {
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
export type LedgerRow = { id: string; currency: 'coin' | 'diamond'; amount: number; reason: string; time: string; status: 'Başarılı' | 'Beklemede' | 'İade' };
export type Notice = { id: string; kind: 'social' | 'finance' | 'security' | 'system'; icon: string; title: string; body: string; time: string; read: boolean; href?: string };
export type Ticket = { id: string; number: string; category: TicketCategory; text: string; status: 'Açık' | 'Yanıtlandı' | 'Çözüldü' | 'Yeniden açıldı'; time: string; replies: { from: 'me' | 'support'; text: string; time: string }[] };
export type Settings = { effectsOff: boolean; invisibleEntry: boolean; cityDiscovery: boolean; showOnline: boolean; profilePublic: boolean; notifySocial: boolean; notifyFinance: boolean; roomBot: boolean };
export type MyRoom = { title: string; announcement: string; cover: string; password: string; locked: boolean; limit: number; xp: number; adminIds: string[]; micMode: 'free' | 'request' | 'members' };
export type OwnedAgency = { name: string; code: string; status: 'İnceleniyor' | 'Onaylandı' };
export type TransferRequest = { toCode: string | null; reason: string; status: 'Beklemede' | 'Onaylandı'; created: string; decisionIn: string };

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
  vipLevel: number;
  buyVip: (level: number) => boolean;
  agencyId: string | null;
  agencyRole: AgencyRole | null;
  setAgencyRole: (r: AgencyRole) => void;
  pendingAgency: string | null;
  joinAgency: (code: string) => string | null;
  leaveAgency: () => void;
  ownedAgency: OwnedAgency | null;
  applyAgency: (name: string) => void;
  transfer: TransferRequest | null;
  requestTransfer: (toCode: string | null, reason: string) => string | null;
  referralCode: string;
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

  const [spentTotal, setSpentTotal] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const log = (currency: LedgerRow['currency'], amount: number, reason: string, status: LedgerRow['status'] = 'Başarılı') =>
    setLedger((l) => [{ id: uid(), currency, amount, reason, time: now(), status }, ...l].slice(0, 200));

  const [inventory, setInventory] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Partial<Record<CosmeticKind, string>>>({});
  const [emojiPacks, setEmojiPacks] = useState<Set<string>>(new Set(['basic']));
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);

  const [settings, setSettings] = useState<Settings>({
    effectsOff: false,
    invisibleEntry: false,
    cityDiscovery: false, // location-based discovery is opt-in (spec §31.7)
    showOnline: true,
    profilePublic: true,
    notifySocial: true,
    notifyFinance: true,
    roomBot: true,
  });
  const [notifications, setNotifications] = useState<Notice[]>([
    { id: 'n1', kind: 'social', icon: '👋', title: 'Ayşe sana selam verdi', body: 'Hemen cevap ver!', time: '19:40', read: false, href: '/sohbet/u7' },
    { id: 'n2', kind: 'system', icon: '🎉', title: "Vibe Club'a hoş geldin", body: 'Günlük giriş ödülünü almayı unutma.', time: '19:00', read: false, href: '/gorevler' },
    { id: 'n3', kind: 'social', icon: '🎤', title: 'Karaoke Akşamı başladı', body: 'Melis seni odaya davet ediyor.', time: '18:30', read: true, href: '/oda/r2' },
  ]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [deletionRequested, setDeletionRequested] = useState(false);

  const [myRoom, setMyRoom] = useState<MyRoom>({
    title: 'Benim Odam 🎙️',
    announcement: 'Hoş geldiniz! Saygılı olalım 💜',
    cover: 'https://picsum.photos/seed/myroom/600/400',
    password: '',
    locked: false,
    limit: 500,
    xp: 0,
    adminIds: [],
    micMode: 'request',
  });

  const [vipLevel, setVipLevel] = useState(0);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agencyRole, setAgencyRole] = useState<AgencyRole | null>(null);
  const [pendingAgency, setPendingAgency] = useState<string | null>(null);
  const [ownedAgency, setOwnedAgency] = useState<OwnedAgency | null>(null);
  const [transfer, setTransfer] = useState<TransferRequest | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);

  const [following, setFollowing] = useState<Set<string>>(new Set(['u1']));
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState(CONVERSATIONS);

  const receiveDiamonds = (n: number, source: EarningSource, fromId?: string) => {
    setDiamonds((d) => d + n);
    setTotalDiamonds((d) => d + n);
    setWeekly((w) => [...w.slice(0, 6), w[6] + n]);
    setEarnings((e) => [{ id: uid(), amount: n, source, fromId, time: now() }, ...e].slice(0, 100));
    log('diamond', n, source);
  };

  const notify = (n: Omit<Notice, 'id' | 'time' | 'read'>) => {
    const muted = (n.kind === 'social' && !settings.notifySocial) || (n.kind === 'finance' && !settings.notifyFinance);
    if (muted) return;
    setNotifications((l) => [{ ...n, id: uid(), time: now(), read: false }, ...l].slice(0, 100));
  };

  const spend = (n: number, reason = 'Harcama') => {
    if (coinsRef.current < n) return false;
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
      if (amount < MIN_WITHDRAW_DIAMONDS) return `En az ${MIN_WITHDRAW_DIAMONDS.toLocaleString('tr-TR')} elmas çekebilirsin.`;
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
      setCheckInDay((d) => d + 1);
      return reward;
    },
    inviteCode: 'VIBE-7K2Q',

    vipLevel,
    buyVip: (level) => {
      const tier = VIP_TIERS.find((t) => t.level === level);
      const ownedPrice = VIP_TIERS.find((t) => t.level === vipLevel)?.price ?? 0;
      if (!tier || level <= vipLevel || !spend(Math.max(0, tier.price - ownedPrice), `VIP ${tier.level} ${tier.name}`)) return false;
      setVipLevel(level);
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
    applyAgency: (name) => {
      const code = name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X') + String(Math.floor(Math.random() * 90) + 10);
      setOwnedAgency({ name, code, status: 'İnceleniyor' });
      setTimeout(() => {
        setOwnedAgency({ name, code, status: 'Onaylandı' });
        setAgencyId('own');
        setAgencyRole('owner');
        notify({ kind: 'system', icon: '✅', title: 'Ajans başvurun onaylandı', body: `${name} · Davet kodun: ${code}`, href: '/ajans/panel' });
      }, 4000);
    },
    transfer,
    requestTransfer: (toCode, reason) => {
      if (!agencyId) return 'Bir ajansa üye değilsin.';
      if (toCode) {
        const to = agencyByCode(toCode);
        if (!to) return 'Hedef ajans kodu geçersiz.';
        if (to.status !== 'active') return 'Hedef ajans yeni üye kabul etmiyor.';
      }
      if (reason.trim().length < 5) return 'Lütfen kısa bir gerekçe yaz.';
      setTransfer({ toCode: toCode ? toCode.toUpperCase() : null, reason, status: 'Beklemede', created: now(), decisionIn: '7 gün' });
      return null;
    },
    referralCode: 'NET-K7Q2',
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
