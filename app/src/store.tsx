import type Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Appearance as SystemAppearance, useColorScheme } from 'react-native';

import { agencyByCode, type AgencyRole } from '@/data/agency';
import { COSMETICS, FREE_PACK_IDS, ROOM_THEMES, ROOM_TYPES, STICKER_PACKS, type CosmeticKind, type RoomTheme, type RoomType, type TicketCategory } from '@/data/catalog';
import {
  CHECKIN_REWARDS,
  TASKS,
  type TaskKey,
} from '@/data/economy';
import { INITIAL_RBAC, type RbacState } from '@/data/rbac';
import { animById, isLive } from '@/lib/animations';
import { NOBLE_DAYS, RECHARGE_PACKS, SVIP_LEVELS, VIP_PLANS, nobleInfo, svipLevelOf } from '@/data/status';
import { RULES, type Rules } from '@/data/rules';
import { countsForWealth, wealthLevelOf } from '@/data/wealth';
import { charmBonusPct, charmLevelOf } from '@/data/charm';
import { showAlert } from '@/lib/alert';
import { exchangeOwnDiamonds } from '@/lib/coins-bank';
import { addLock, diamondSplit, fromServerLock, lockMs, lockedReason, locksFor, unlistedLocked, type DiamondLock } from '@/lib/diamond-locks';
import { clearState, loadState, saveState, today } from '@/lib/persist';
import { validAnyIban } from '@/lib/withdraw-rules';
import { DEMO_DECOR, DEMO_ROOM_COVER, demoDecorOf, type DemoDecor } from '@/lib/room-decor';
import { isFiniteNumber, oneOf, withDefaults } from '@/lib/saved-state';
import { ME_DEFAULT, parkAccount, readSnapshot, unparkAccount, type Snapshot } from '@/lib/snapshot';
import { setGameVolume } from '@/lib/game-sound';
import { setHapticsEnabled } from '@/lib/haptics';
import { CONVERSATIONS, GIFTS, ME, isServerId, type Conversation, type EventShareCard, type RoomInviteCard, type User } from '@/data/mock';
import type { ServerEarnings, ServerUser } from '@/lib/api';
import { block as serverBlock, follow } from '@/lib/api';
import { bindWallet, forgetLiveAccount, liveMode, liveSpend, myServerId, rememberUser, toLocal, toServer } from '@/lib/live';
import { forgetSeen, hideDms, markLiveRead } from '@/lib/live/messages';
import { noteSpent, serverLimitBlock } from '@/lib/live/spend-limit';
import { applyThread, markSent, type ServerDm, type ThreadSync } from '@/lib/dm-thread';
import type { CallsFrom, DmFrom } from '@/data/privacy';
import { ThemeScope, type Appearance, type Scheme } from '@/theme';

const DEMO_SVIP_XP = SVIP_LEVELS[2].xp;
/** Coins the server takes without a local spend (the answer's balance shows it): count them as today's spending. */
const SERVER_TAKES = /^(Hediye gönderildi|Rüzgâr Gülü|Şanslı hediye|Animasyon|Oyun Salonu)/;

export type EarningSource = 'Hediye' | 'Arama' | 'Görev' | 'Ajans bonusu' | 'Oda sahibi bonusu' | 'Aile bonusu' | 'Arama bonusu' | 'Cazibe bonusu';
/** The gift behind a gift earning, stored with it (a price can belong to several gifts; Lucky pays a share). */
export type EarningGift = { id: string; name: string; emoji: string; count: number; lucky?: boolean };
/** `day` is the local calendar day (persist.today); rows saved before it existed have only `time`. */
export type Earning = { id: string; amount: number; source: EarningSource; fromId?: string; time: string; day?: string; gift?: EarningGift };
export type Withdrawal = { id: string; diamonds: number; iban: string; status: 'Beklemede' | 'Onaylandı'; time: string };
export type LedgerRow = { id: string; ref: string; currency: 'coin' | 'diamond' | 'game'; amount: number; reason: string; time: string; day?: string; status: 'Başarılı' | 'Beklemede' | 'İade' };
/** `icon` is an Ionicons glyph; notices saved before that held an emoji, and the list falls back to the kind's icon for them. */
export type Notice = { id: string; kind: 'social' | 'finance' | 'security' | 'system'; icon: keyof typeof Ionicons.glyphMap; title: string; body: string; time: string; read: boolean; href?: string };
export type Ticket = { id: string; number: string; category: TicketCategory; text: string; status: 'Açık' | 'Yanıtlandı' | 'Çözüldü' | 'Yeniden açıldı'; time: string; replies: { from: 'me' | 'support'; text: string; time: string }[] };
export type NotifyType = 'live' | 'invite' | 'event' | 'agency' | 'fanclub' | 'game' | 'payment' | 'system';
export type Settings = {
  /** Ayarlar › Görünüm: follow the phone, or always light / dark. */
  appearance: Appearance;
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
  /** Game sound effects, separate from voice chat; games never duck or mute voices. */
  gameVolume: number;
  voiceVolume: number;
  giftSounds: boolean;
  bigGiftsOnly: boolean;
  /** Room effects on this phone (Efekt ayarları), each under `effectsOff`: gift shows and flights, entry
   *  banners, the mic effect while I talk, emoji reactions over the seats. */
  giftFx: boolean;
  entryFx: boolean;
  micAnim: boolean;
  seatReactions: boolean;
  micDenoise: boolean;
  invitesFrom: 'everyone' | 'following' | 'nobody';
  dailySpendLimit: number; // coins; 0 = no limit
  /** My wins (Lucky, games) are announced in every room with my name (off: "Bir kullanıcı"). */
  luckyAnnounce: boolean;
  /** VIP "Seviyeleri gizle": hide my Cömertlik / Yankı badges from others while VIP is active. */
  hideWealth: boolean;
  hideCharm: boolean;
};
/** Block, unblock, report and data requests are kept as a record (spec: profile §5). */
export type SafetyLog = { id: string; action: 'Engelledi' | 'Engeli kaldırdı' | 'Şikâyet etti' | 'Veri dökümü istedi' | 'Fotoğraf incelemeye gönderildi' | 'Fotoğraf onaylandı'; targetId?: string; detail?: string; time: string };
export type InviteReward = { id: string; inviteeId: string; ref: string; status: 'Beklemede' | 'Onaylandı' | 'İptal edildi'; time: string };
export type Session = { id: string; device: string; place: string; last: string; current?: boolean };
export type FanClub = { points: number; history: { text: string; pts: number; time: string }[] };
export type GroupMsg = { id: string; userId: string; text: string; time: string; system?: boolean; actionLabel?: string; actionHref?: string };
export type MyRoom = { title: string; announcement: string; cover: string; password: string; locked: boolean; limit: number; xp: number; adminIds: string[];
  /** "Mikrofon kuyruğu": on = a member's tap on a free mic is a speak request the owner/admins approve. */
  micQueue: boolean; roomType: RoomType; giftEffects: boolean; joinSounds: boolean; lockedSeats: number[];
  theme: RoomTheme; micCount: number; /** Selected mic layout (data/room-layouts); null = classic grid. */ layoutId: string | null; micPermission: 'everyone' | 'members'; bossSeat: boolean;
  /** Patron koltuğu: Otomatik (gifts decide, lib/patron-seat bossStep) or Davet (the owner seats someone). */
  bossMode: 'auto' | 'invite';
  joinMode: 'open' | 'apply' | 'closed'; manageMembers: 'owner' | 'admins'; manageFunctions: 'owner' | 'admins';
  autoRemoveDays: 0 | 7 | 14 | 30; profileVisible: boolean; videoPrivacy: boolean; memberIds: string[]; blacklist: string[];
  /** Oda Süslemesi in the demo (lib/room-decor): the free background, what is chosen over it and what I paid for. `cover` is the card picture (Oda Kapağı). */
  decor: DemoDecor };
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
  /** Live mode: the account's e-mail address and whether `phone` was checked (from the server, not saved here). */
  email: string | null;
  phoneVerified: boolean;
  // coins
  coins: number;
  addCoins: (n: number, reason?: string) => void;
  spendCoins: (n: number, reason?: string) => boolean;
  /** Why `n` coins can't be spent right now (balance or daily limit), or null when they can. */
  spendBlock: (n: number) => string | null;
  /** Casino winnings: playable only in the games; never gifted, exchanged or withdrawn. */
  gameCoins: number;
  addGameCoins: (n: number, reason?: string) => void;
  spendGameCoins: (n: number, reason?: string) => boolean;
  spentTotal: number;
  /** Cömertlik puanı (wealth): qualifying spending only (data/wealth). */
  wealthXp: number;
  wealthLevel: number;
  /**
   * Whether the coin games (Oyun Salonu, Rüzgâr Gülü) are open to this account: the server's answer in a live build
   * (GET /api/me; admin accounts only until they are opened to everyone), always true in the demo. Screens pass it
   * to casinoVisible; the server refuses the rounds either way.
   */
  paidGames: boolean;
  ledger: LedgerRow[];
  // cosmetics & emoji
  inventory: Set<string>;
  equipped: Partial<Record<CosmeticKind, string>>;
  buyCosmetic: (id: string) => string | null;
  equip: (id: string | null, kind: CosmeticKind) => void;
  /** Bought sticker pack ids (persisted under the old name, so earlier purchases carry over). */
  emojiPacks: Set<string>;
  /** Owned, free, or opened by the user's VIP level. */
  packUnlocked: (id: string) => boolean;
  buyEmojiPack: (id: string) => string | null;
  recentEmojis: string[];
  rememberEmoji: (e: string) => void;
  // settings, notifications, support
  settings: Settings;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  notifications: Notice[];
  notify: (n: Omit<Notice, 'id' | 'time' | 'read'>) => void;
  markNotificationsRead: () => void;
  /** One notice was opened. */
  markNoticeRead: (id: string) => void;
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
  /** The balance in two parts (lib/diamond-locks): what may leave now (withdraw, Çevir, Jeton Noktası) and what
   *  is still locked because the coins behind it can be refunded (store 7 days, Jeton Noktası 1 day). */
  withdrawableDiamonds: number;
  lockedDiamonds: number;
  /** Open locks, newest first. */
  diamondLocks: DiamondLock[];
  totalDiamonds: number;
  /** Yankı puanı (charm) and level (data/charm): drives the earnings bonus and Keşfet ranking. */
  charmXp: number;
  charmLevel: number;
  weekly: number[];
  earnings: Earning[];
  receiveDiamonds: (n: number, source: EarningSource, fromId?: string, gift?: EarningGift) => void;
  withdrawals: Withdrawal[];
  requestWithdraw: (diamonds: number, iban: string) => string | null;
  /** Gelir > Çevir: own diamonds → coins at the in-app coin price (lib/coins-bank); the coins, or why not. */
  exchangeDiamonds: (diamonds: number) => { ok: true; coins: number } | { ok: false; reason: string };
  // tasks & check-in
  stats: Record<TaskKey, number>;
  bump: (key: TaskKey, n?: number) => void;
  /** Gifts each user has received through this app (userId → giftId → count); 'me' is my own gift wall. */
  giftWall: Record<string, Record<string, number>>;
  /** Puts `count` of a gift on `toId`'s gift wall. */
  recordGift: (toId: string, giftId: string, count: number) => void;
  claimedTasks: Set<string>;
  claimTask: (taskId: string) => void;
  checkInDay: number;
  checkedInToday: boolean;
  checkIn: () => number;
  inviteCode: string;
  // vip, agency, family
  /** Visual status level (frames/badges), derived from the VIP 1–10 level (SVIP), Rütbe (noble) and VIP subscription. */
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
  /** Test accounts (Sunucu hesabı screen): Rütbe Paşa, a year of Abonelik and VIP 10 on this phone too. */
  maxOutForTest: () => void;
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
  // rules (fixed defaults; edited only on the Finance Control platform), invites, security, fan clubs, rooms, family
  rules: Rules;
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
  /** `room` turns the message into a room invite card that opens the room; `event` into an event card (Etkinlik Merkezi). */
  sendMessage: (userId: string, text: string, fromMe?: boolean, room?: RoomInviteCard, ref?: string, event?: EventShareCard) => void;
  /** Live mode: marks my message (by its request id) as not sent with the reason, or sent again (null).
   *  `retry: false`: the refusal won't change (too long, blocked), so the bubble offers no "tekrar dene". */
  setMessageFailed: (userId: string, ref: string, reason: string | null, retry?: boolean) => void;
  /** Live mode: the server stored my message (by its request id); it takes the server's id and time. */
  markMessageSent: (userId: string, ref: string, message: { id: number; createdAt: string }) => void;
  /** A message from someone else arrived; counts as unread. */
  receiveMessage: (userId: string, text: string) => void;
  /** Live mode (lib/live/messages): a thread read from the server joins the local copy (lib/dm-thread). */
  importDms: (userId: string, dms: readonly ServerDm[], sync: ThreadSync, unread: number | null) => void;
  /** Deletes a message on this phone only (a live chat's server copy stays; a sync doesn't bring it back). */
  deleteMessage: (userId: string, messageId: string) => void;
  /** Deletes a whole chat on this phone only; a new message starts it again. */
  deleteConversation: (userId: string) => void;
  /** Live mode, after signing in: the server's follow and block lists replace the ones on this phone. */
  takeServerSocial: (lists: { following?: string[]; blocked?: string[] }) => void;
  /** Last "invite all followers" per room id (ms); managers can send it once every 24 hours. */
  followerInvites: Record<string, number>;
  markFollowerInvite: (roomId: string, at: number) => void;
  markRead: (userId: string) => void;
  /** Mic effects (animation catalog, display_type mic_effect): owned ids and the one in use. */
  ownedAnims: Set<string>;
  micFx: string | null;
  /** Buys (price read from the catalog) or claims a free mic effect, then equips it. */
  buyMicFx: (animationId: string) => string | null;
  setMicFx: (animationId: string | null) => void;
  /** "İlk adımlar" card on the home tab: reward claimed once, or hidden by the user. */
  starter: { claimed: boolean; hidden: boolean };
  claimStarter: (reward: number) => void;
  hideStarter: () => void;
  /** Wipes the saved demo state and starts over with the defaults. */
  resetAll: () => void;
};


const Ctx = createContext<AppState | null>(null);
// Settings change rarely while the rest of the store changes often (coins, diamonds, room gifts). Animated
// leaf components that only read settings subscribe here, so a balance tick doesn't re-render them.
const SettingsCtx = createContext<Settings | null>(null);

export const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const uid = () => String(Date.now() + Math.random());
/** Messages kept on the phone per chat; older ones drop off the saved copy (the server keeps real chats). */
const MAX_SAVED_MESSAGES = 200;
/** The demo's sample notices (store defaults below); a live build never shows them. */
const DEMO_NOTICE_IDS = ['n1', 'n2', 'n3'];
const toggle = (set: Set<string>, id: string) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};

/** Forgets everything saved on this device (the store's reset and the crash screen's way out). */
export async function resetLocalData() {
  // The profile first: a store mounted while the save is being removed must not read (and save) the old one.
  for (const key of Object.keys(ME)) if (!(key in ME_DEFAULT)) delete (ME as Record<string, unknown>)[key];
  Object.assign(ME, ME_DEFAULT);
  await clearState();
}

/** Loads the saved state first (the splash screen stays up meanwhile), then mounts the store. */
export function AppProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [boot, setBoot] = useState<{ gen: number; initial: Partial<Snapshot> | null } | null>(null);
  useEffect(() => {
    // Whatever goes wrong reading the save, the app still starts (with the defaults); a rejected promise here
    // would leave the splash screen up for good.
    loadState<unknown>()
      .then(readSnapshot)
      .catch(() => null)
      .then((initial) => {
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
  // The new store mounts only once the save is gone, so it starts from the defaults and saves those.
  // `keep` (signing out of a live account, or back in): what the next store starts from instead of the defaults.
  const reset = (keep?: Partial<Snapshot>) =>
    void resetLocalData().then(() => {
      if (keep?.me) Object.assign(ME, keep.me);
      setBoot((b) => ({ gen: (b?.gen ?? 0) + 1, initial: keep ?? null }));
    });
  return (
    <StateProvider key={boot.gen} initial={boot.initial ?? {}} onReset={reset}>
      {children}
    </StateProvider>
  );
}

function StateProvider({ children, initial: s, onReset }: { children: ReactNode; initial: Partial<Snapshot>; onReset: (keep?: Partial<Snapshot>) => void }) {
  const [loggedIn, setLoggedIn] = useState(s.loggedIn ?? false);
  const [me, setMe] = useState<User>({ ...ME });
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  // Coins are read synchronously by spendCoins (e.g. from call timers), so mirror them in a ref.
  const [coins, setCoinsState] = useState(s.coins ?? 250);
  const coinsRef = useRef(s.coins ?? 250);
  const setCoins = (fn: (c: number) => number) => {
    coinsRef.current = fn(coinsRef.current);
    setCoinsState(coinsRef.current);
  };

  // Separate balance for casino winnings, mirrored in a ref for the same synchronous reads.
  const [gameCoins, setGameCoinsState] = useState(s.gameCoins ?? 0);
  const gameCoinsRef = useRef(s.gameCoins ?? 0);
  const setGameCoins = (fn: (c: number) => number) => {
    gameCoinsRef.current = fn(gameCoinsRef.current);
    setGameCoinsState(gameCoinsRef.current);
  };

  const [isHost, setIsHost] = useState(s.isHost ?? false);
  const [diamonds, setDiamonds] = useState(s.diamonds ?? 0);
  // Read by Çevir so two quick taps can't spend the same diamonds twice before the state updates.
  const diamondsRef = useRef(diamonds);
  useEffect(() => {
    diamondsRef.current = diamonds;
  }, [diamonds]);
  // Gift diamonds stay locked through the refund window (lib/diamond-locks), mirrored in a ref for the same
  // synchronous reads as the balance. Locks that opened while the app was closed are dropped (with a notice) by the
  // timer below; until then `lockNow` keeps them out of the locked part.
  const [diamondLocks, setDiamondLocksState] = useState<DiamondLock[]>(s.diamondLocks ?? []);
  const locksRef = useRef(diamondLocks);
  const setDiamondLocks = (fn: (l: DiamondLock[]) => DiamondLock[]) => {
    locksRef.current = fn(locksRef.current);
    setDiamondLocksState(locksRef.current);
  };
  const [lockNow, setLockNow] = useState(() => Date.now());
  // Live mode: locked diamonds the server counted but did not list (lib/diamond-locks unlistedLocked).
  const [unlisted, setUnlisted] = useState(0);
  const { locked: lockedDiamonds, withdrawable: withdrawableDiamonds } = diamondSplit(diamonds, diamondLocks, lockNow, unlisted);
  const [totalDiamonds, setTotalDiamonds] = useState(s.totalDiamonds ?? 0);
  const [charmXp, setCharmXp] = useState(s.charmXp ?? s.totalDiamonds ?? 0);
  const charmRef = useRef(charmXp);
  const [weekly, setWeekly] = useState(s.weekly ?? [0, 0, 0, 0, 0, 0, 0]);
  const [earnings, setEarnings] = useState<Earning[]>(s.earnings ?? []);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(s.withdrawals ?? []);

  // Merged with the defaults: a save from before a counter existed would otherwise make it NaN on the first bump.
  const [stats, setStats] = useState<Record<TaskKey, number>>(() => withDefaults({ roomMinutes: 0, giftsSent: 0, greetings: 0, moments: 0, calls: 0 }, s.stats));
  const [giftWall, setGiftWall] = useState<Record<string, Record<string, number>>>(s.giftWall ?? {});
  const recordGift = (toId: string, giftId: string, count: number) =>
    setGiftWall((w) => ({ ...w, [toId]: { ...w[toId], [giftId]: (w[toId]?.[giftId] ?? 0) + count } }));
  const [claimedTasks, setClaimedTasks] = useState<Set<string>>(new Set(s.claimedTasks));
  // Demo: the user already has a 2-day streak. A live account starts at day 0.
  const [checkInDay, setCheckInDay] = useState(s.checkInDay ?? (liveMode() ? 0 : 2));
  const [checkInDate, setCheckInDate] = useState(s.checkInDate ?? '');
  const [checkedInToday, setCheckedInToday] = useState(() => s.checkInDate === today());

  const [spentTotal, setSpentTotal] = useState(s.spentTotal ?? 0);
  // Older saves have no wealth points yet; start them from total spending.
  const [wealthXp, setWealthXp] = useState(s.wealthXp ?? s.spentTotal ?? 0);
  const wealthRef = useRef(wealthXp);
  // A live build keeps the coin games hidden until the server has said they are open to this account.
  const [paidGames, setPaidGames] = useState(s.paidGames ?? !liveMode());
  const [ledger, setLedger] = useState<LedgerRow[]>(s.ledger ?? []);
  const log = (currency: LedgerRow['currency'], amount: number, reason: string, status: LedgerRow['status'] = 'Başarılı') =>
    setLedger((l) => [{ id: uid(), ref: `TX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, currency, amount, reason, time: now(), day: today(), status }, ...l].slice(0, 200));
  const spentStart = s.spentDay?.date === today() && Number.isFinite(s.spentDay.amount) ? s.spentDay.amount : 0;
  const spentTodayRef = useRef(spentStart);
  const [spentToday, setSpentToday] = useState(spentStart);

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
  const [emojiPacks, setEmojiPacks] = useState<Set<string>>(new Set([...FREE_PACK_IDS, ...(s.emojiPacks ?? [])]));
  const [recentEmojis, setRecentEmojis] = useState<string[]>(s.recentEmojis ?? []);

  const [settings, setSettings] = useState<Settings>(() => {
    const defaults: Settings = {
      appearance: 'system',
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
      gameVolume: 0.4,
      voiceVolume: 1,
      giftSounds: true,
      bigGiftsOnly: false, micDenoise: true,
      giftFx: true,
      entryFx: true,
      micAnim: true,
      seatReactions: true,
      invitesFrom: 'everyone',
      dailySpendLimit: 0,
      luckyAnnounce: true,
      hideWealth: false,
      hideCharm: false,
    };
    const saved = withDefaults(defaults, s.settings);
    return {
      ...saved,
      appearance: oneOf(saved.appearance, APPEARANCES) ?? defaults.appearance,
      notifyTypes: withDefaults(defaults.notifyTypes, saved.notifyTypes),
    };
  });
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    setHapticsEnabled(settings.haptics);
    setGameVolume(settings.gameVolume);
  }, [settings]);
  // The demo starts with three sample notices about sample people and rooms. A live build starts empty, and
  // drops the samples once from a save made before (their ids are only ever used by these samples).
  const [notifications, setNotifications] = useState<Notice[]>(() =>
    liveMode()
      ? (s.notifications ?? []).filter((n) => !DEMO_NOTICE_IDS.includes(n.id))
      : (s.notifications ?? [
          { id: 'n1', kind: 'social', icon: 'hand-left', title: 'Ayşe sana selam verdi', body: 'Hemen cevap ver!', time: '19:40', read: false, href: '/sohbet/u7' },
          { id: 'n2', kind: 'system', icon: 'sparkles', title: "Similar Club'a hoş geldin", body: 'Günlük giriş ödülünü almayı unutma.', time: '19:00', read: false, href: '/gorevler' },
          { id: 'n3', kind: 'social', icon: 'mic', title: 'Karaoke Akşamı başladı', body: 'Melis seni odaya davet ediyor.', time: '18:30', read: true, href: '/oda/r2' },
        ]),
  );
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [deletionRequested, setDeletionRequested] = useState(false);

  const [myRoom, setMyRoom] = useState<MyRoom>(() => {
    const room = withDefaults<MyRoom>(
      {
        title: 'Benim Odam 🎙️',
        announcement: 'Hoş geldiniz! Saygılı olalım 💜',
        cover: DEMO_ROOM_COVER,
        password: '',
        locked: false,
        limit: 50,
        xp: 600, // starts at Lv.4 so lock / mic permission / boss seat can be tried in the demo
        adminIds: [],
        // Saves from before the switch kept "Mikrofon kontrolü" (micMode); only "Serbest" meant no queue.
        micQueue: (s.myRoom as { micMode?: string } | undefined)?.micMode !== 'free',
        roomType: 'stage',
        giftEffects: true,
        joinSounds: true,
        lockedSeats: [],
        theme: 'chat',
        micCount: 10,
        layoutId: null,
        micPermission: 'everyone',
        bossSeat: true,
        bossMode: 'auto',
        joinMode: 'apply',
        manageMembers: 'admins',
        manageFunctions: 'admins',
        autoRemoveDays: 14,
        profileVisible: true,
        videoPrivacy: true,
        memberIds: ['u3', 'u5', 'u8', 'u10', 'u12', 'u1', 'u4'],
        blacklist: ['u6'],
        decor: DEMO_DECOR,
      },
      s.myRoom,
    );
    room.decor = demoDecorOf(room.decor);
    // The room screen looks these up in fixed lists; a saved value the lists no longer have falls back.
    room.roomType = oneOf(room.roomType, ROOM_TYPES.map((t) => t.id)) ?? 'stage';
    room.theme = oneOf(room.theme, ROOM_THEMES.map((t) => t.id)) ?? 'chat';
    room.bossMode = oneOf(room.bossMode, ['auto', 'invite'] as const) ?? 'auto';
    for (const key of ['adminIds', 'memberIds', 'blacklist'] as const) room[key] = room[key].filter((id) => typeof id === 'string');
    room.lockedSeats = room.lockedSeats.filter(isFiniteNumber);
    return room;
  });

  // Demo account starts at VIP 3 (SVIP 3 threshold) so VIP-gated features and their limits can be tested;
  // older saves below it are raised once, higher saves are kept. A live build shows the server's points only.
  const [svipXp, setSvipXp] = useState(liveMode() ? (s.svipXp ?? 0) : Math.max(s.svipXp ?? 0, DEMO_SVIP_XP));
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

  // The demo account follows sample Elif. A live account follows nobody until the server's list arrives after
  // signing in (takeServerSocial); sample ids from an older save don't count there.
  const [following, setFollowing] = useState<Set<string>>(() => new Set(liveMode() ? (s.following ?? []).filter(isServerId) : (s.following ?? ['u1'])));
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set(liveMode() ? (s.blocked ?? []).filter(isServerId) : s.blocked));
  // A live build starts with real chats only: the sample conversations belong to the demo.
  const [conversations, setConversations] = useState(() => {
    const saved = s.conversations ?? CONVERSATIONS;
    return liveMode() ? saved.filter((c) => isServerId(c.userId)) : saved;
  });
  const [followerInvites, setFollowerInvites] = useState<Record<string, number>>(s.followerInvites ?? {});
  const [starter, setStarter] = useState(() => withDefaults({ claimed: false, hidden: false }, s.starter));
  const [safetyLog, setSafetyLog] = useState<SafetyLog[]>(s.safetyLog ?? []);
  const logSafety = (action: SafetyLog['action'], targetId?: string, detail?: string) =>
    setSafetyLog((l) => [{ id: uid(), action, targetId, detail, time: `${new Date().toLocaleDateString('tr-TR')} ${now()}` }, ...l].slice(0, 100));
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [ownedAnims, setOwnedAnims] = useState<Set<string>>(new Set(s.ownedAnims));
  const [micFx, setMicFx] = useState<string | null>(s.micFx ?? null);

  // The server account this phone's state belongs to (saved): another one must not inherit it.
  const [serverId, setServerId] = useState<string | null>(s.serverId ?? null);
  const serverIdRef = useRef(serverId);
  // Signed out of a live account: its state, kept for when the same account signs in here again (login below).
  const [parked, setParked] = useState(s.parked ?? null);

  /** Everything on this phone goes back to the defaults, including what lib/live remembers of the account.
   *  `keep` survives it (signing out keeps this phone's settings, and parks the account's own state). */
  const forgetAccount = (keep?: Partial<Snapshot>) => {
    forgetLiveAccount();
    forgetSeen();
    onReset(keep);
  };

  // Save after every change (debounced in lib/persist). Pending demo timers (withdrawal approval etc.)
  // are not resumed after a restart; their records keep the last saved status.
  const snapshot: Snapshot = {
    loggedIn, me, coins, gameCoins, spentTotal, wealthXp, paidGames, ledger: ledger.slice(0, 100), spentDay: { date: today(), amount: spentToday },
    inventory: [...inventory], equipped, emojiPacks: [...emojiPacks], recentEmojis, settings, notifications: notifications.slice(0, 50),
    myRoom, isHost, diamonds, diamondLocks, totalDiamonds, charmXp, weekly, earnings: earnings.slice(0, 50), withdrawals, stats, giftWall,
    claimedTasks: [...claimedTasks], checkInDay, checkInDate, svipXp, firstBuys: [...firstBuys], nobleTier, nobleDays, vipDays,
    agencyId, agencyRole, ownedAgency, familyRole, familyId, fanClubs, recentRooms,
    serverId, following: [...following], blocked: [...blocked], conversations: conversations.map((c) => (c.messages.length > MAX_SAVED_MESSAGES ? { ...c, messages: c.messages.slice(-MAX_SAVED_MESSAGES) } : c)), followerInvites, starter, safetyLog, ownedAnims: [...ownedAnims], micFx,
    ...(parked && { parked }),
  };
  useEffect(() => {
    // Each render reschedules the write with the newest snapshot.
    saveState(() => snapshot);
  });

  const creditDiamonds = (n: number, source: EarningSource, fromId?: string, gift?: EarningGift) => {
    setDiamonds((d) => d + n);
    setTotalDiamonds((d) => d + n);
    setWeekly((w) => [...w.slice(0, 6), w[6] + n]);
    setEarnings((e) => [{ id: uid(), amount: n, source, fromId, time: now(), day: today(), ...(gift && { gift }) }, ...e].slice(0, 100));
    log('diamond', n, source);
    // The app can't see where the sender's coins came from, so it assumes the store (the longer lock); the server
    // knows the real source and its locks are the ones that count.
    if (locksFor(source)) setDiamondLocks((l) => addLock(l, { id: uid(), amount: n, unlockAt: Date.now() + lockMs('store'), channel: 'store', source, fromId, ...(gift && { gift }) }));
  };
  const receiveDiamonds = (n: number, source: EarningSource, fromId?: string, gift?: EarningGift) => {
    creditDiamonds(n, source, fromId, gift);
    if (source === 'Hediye' && gift) recordGift('me', gift.id, gift.count);
    if (source !== 'Hediye' && source !== 'Arama') return;
    // Yankı (charm): gifts and calls from others raise it; gift diamonds also earn the level's bonus (own row).
    const before = charmLevelOf(charmRef.current);
    const bonus = source === 'Hediye' ? Math.floor((n * charmBonusPct(before)) / 100) : 0;
    if (bonus > 0) creditDiamonds(bonus, 'Cazibe bonusu', fromId);
    charmRef.current += n;
    setCharmXp(charmRef.current);
    const after = charmLevelOf(charmRef.current);
    if (after > before) notify({ kind: 'system', icon: 'rose', title: `Yankı seviyen Lv.${after} oldu`, body: charmBonusPct(after) > charmBonusPct(before) ? `Hediye kazanç bonusun artık %${charmBonusPct(after)}.` : 'Keşfette daha üst sıralarda görüneceksin.', href: '/seviye?tab=charm' });
  };

  // Read the ref, not `settings`: timers and room intervals call a notify captured renders ago, and a snooze or
  // mute the user set since then must still hold.
  const notify = (n: Omit<Notice, 'id' | 'time' | 'read'>) => {
    const cur = settingsRef.current;
    const snoozed = cur.snoozeUntil > Date.now() && n.kind !== 'security' && n.kind !== 'finance';
    const muted = snoozed || (n.kind === 'social' && !cur.notifySocial) || (n.kind === 'finance' && !cur.notifyFinance);
    if (muted) return;
    setNotifications((l) => [{ ...n, id: uid(), time: now(), read: false }, ...l].slice(0, 100));
  };

  // Opens the locks when their time comes: drops them and tells the host the diamonds can now leave. Runs at once
  // for locks that opened while the app was closed. `notify` only reads refs and setters, so a stale copy is fine.
  useEffect(() => {
    if (!diamondLocks.length) return;
    const first = Math.min(...diamondLocks.map((l) => l.unlockAt));
    // setTimeout holds at most ~24.8 days; a longer wait just re-arms when it fires.
    const t = setTimeout(() => {
      const at = Date.now();
      const opened = locksRef.current.filter((l) => l.unlockAt <= at).reduce((sum, l) => sum + l.amount, 0);
      setDiamondLocks((l) => l.filter((x) => x.unlockAt > at));
      setLockNow(at);
      if (opened > 0) notify({ kind: 'finance', icon: 'lock-open', title: 'Kilitli elmasların açıldı', body: `${opened.toLocaleString('tr-TR')} elmas artık çekilebilir; çekebilir ya da jetona çevirebilirsin.`, href: '/gelir' });
    }, Math.min(2_000_000_000, Math.max(0, first - Date.now()) + 50));
    return () => clearTimeout(t);
  }, [diamondLocks]);

  const limitBlock = (n: number) => {
    // Live mode: the limit is the server's (lib/live/spend-limit); its last known state is checked here too.
    if (liveMode() && !settingsRef.current.dailySpendLimit) return serverLimitBlock(n);
    const limit = settingsRef.current.dailySpendLimit;
    if (!limit || spentTodayRef.current + n <= limit) return null;
    return `Günlük harcama limitin ${limit.toLocaleString('tr-TR')} jeton (Ayarlar > Harcama kontrolü). Bugün kalan: ${Math.max(0, limit - spentTodayRef.current).toLocaleString('tr-TR')} jeton.`;
  };
  const spendBlock = (n: number) => (coinsRef.current < n ? 'Yetersiz bakiye.' : limitBlock(n));
  const spend = (n: number, reason = 'Harcama') => {
    if (coinsRef.current < n) return false;
    const limited = limitBlock(n);
    if (limited) {
      showAlert('Günlük harcama limiti', limited);
      return false;
    }
    setCoins((c) => c - n);
    log('coin', -n, reason);
    // Live mode: the server takes the same coins (expected here, so its answer doesn't take them twice).
    if (liveMode() && myServerId() && serverBalRef.current) {
      serverBalRef.current = { ...serverBalRef.current, coins: serverBalRef.current.coins - n };
      liveSpend(n, reason);
    }
    countSpend(n, reason);
    return true;
  };
  // Coins that left the balance: today's spending (the daily limit), the total and Cömertlik. Shared by `spend`
  // and live gifts, which the server takes without a local spend.
  const countSpend = (n: number, reason: string) => {
    if (liveMode()) noteSpent(n);
    spentTodayRef.current += n;
    setSpentToday(spentTodayRef.current);
    setSpentTotal((t) => t + n);
    if (countsForWealth(reason)) {
      const before = wealthLevelOf(wealthRef.current);
      wealthRef.current += n;
      setWealthXp(wealthRef.current);
      const after = wealthLevelOf(wealthRef.current);
      if (after > before) notify({ kind: 'system', icon: 'trending-up', title: `Cömertlik seviyen Lv.${after} oldu`, body: 'Yeni ayrıcalıklarını Cömertlik sayfasında gör.', href: '/seviye' });
    }
  };

  // Live mode (lib/live): the server's balances and Gelir locks. A new balance is applied as the change since the
  // last one, so purchases already taken here (and mirrored with api.spend, see `spend`) aren't taken twice. The
  // first balance after a start replaces the local one.
  const serverBalRef = useRef<{ coins: number; diamonds: number; gameCoins: number } | null>(null);
  const applyServer = (u: ServerUser, reason?: string, returned = 0) => {
    if (serverIdRef.current !== u.id) {
      const switched = serverIdRef.current !== null;
      serverIdRef.current = u.id;
      setServerId(u.id);
      // Another account's balance replaces the one held; as a change it would show up as a gift.
      serverBalRef.current = null;
      // Signed in as someone else: start over (the remounted store signs in again and reads its balance). While
      // signed out the switch is the sign-in itself, on a phone that signing out already cleared.
      if (switched && loggedIn) return forgetAccount();
    }
    if (isFiniteNumber(u.svipXp)) setSvipXp(u.svipXp);
    // Wallet answers carry no e-mail: only an answer that has the field changes it.
    if (u.email !== undefined) setEmail(u.email ?? null);
    if (u.phone !== undefined) {
      setPhone(u.phone ?? '');
      setPhoneVerified(u.phoneVerified ?? !!u.phone);
    }
    // Cömertlik as the server counts it (GET /api/me): the games open on the same value the server checks, also
    // after signing in again on a phone that signing out cleared.
    if (isFiniteNumber(u.wealthXp)) {
      wealthRef.current = u.wealthXp;
      setWealthXp(u.wealthXp);
    }
    if (typeof u.paidGames === 'boolean') setPaidGames(u.paidGames);
    // Yankı as the server counts it (diamonds received in gifts): posting in Anlar opens on the same value.
    if (isFiniteNumber(u.charmXp)) {
      charmRef.current = u.charmXp;
      setCharmXp(u.charmXp);
    }
    const prev = serverBalRef.current;
    serverBalRef.current = { coins: u.coins, diamonds: u.diamonds, gameCoins: u.gameCoins ?? 0 };
    // Game coins: only server games (Rüzgâr Gülü) move them there, the other games here, so the server's change
    // is added to the local balance (the first balance after a start is only noted, not taken over).
    const dg = prev ? (u.gameCoins ?? 0) - prev.gameCoins : 0;
    if (dg) {
      setGameCoins((c) => Math.max(0, c + dg));
      log('game', dg, reason ?? (dg > 0 ? 'Oyun kazancı' : 'Oyun'));
    }
    if (!prev) {
      setCoins(() => u.coins);
      diamondsRef.current = u.diamonds;
      setDiamonds(u.diamonds);
      return;
    }
    const dc = u.coins - prev.coins;
    let dd = u.diamonds - prev.diamonds;
    if (dc) {
      setCoins((c) => Math.max(0, c + dc));
      log('coin', dc, reason ?? (dc > 0 ? 'Jeton eklendi' : 'Harcama'));
      // Purchases the store took locally were expected above (dc is 0 for them); a live gift or a Rüzgâr Gülü spin
      // is only taken here.
      if (dc < 0 && reason && SERVER_TAKES.test(reason)) countSpend(-dc, reason);
    }
    if (!dd) return;
    diamondsRef.current = Math.max(0, diamondsRef.current + dd);
    setDiamonds(diamondsRef.current);
    // A change this phone asked for (Çevir, a withdrawal and its cancel) is logged as it is, not as a gift.
    if (dd < 0 || reason) return void log('diamond', dd, reason ?? 'Elmas düştü');
    // A rejected withdrawal's diamonds came back (lib/live/withdraw): not earnings either.
    const back = Math.min(dd, returned);
    if (back > 0) {
      log('diamond', back, 'Para çekme talebi reddedildi');
      dd -= back;
      if (!dd) return;
    }
    // More diamonds from the server: someone sent me a gift (the server wrote its lock; refreshEarnings reads it).
    setTotalDiamonds((t) => t + dd);
    setWeekly((w) => [...w.slice(0, 6), w[6] + dd]);
    setEarnings((e) => [{ id: uid(), amount: dd, source: 'Hediye' as const, time: now(), day: today() }, ...e].slice(0, 100));
    log('diamond', dd, 'Hediye');
    // Yankı: GET /api/me carries the server's count (taken above, this gift included); other answers don't.
    if (!isFiniteNumber(u.charmXp)) {
      charmRef.current += dd;
      setCharmXp(charmRef.current);
    }
    notify({ kind: 'finance', icon: 'gift', title: 'Hediye aldın', body: `${dd.toLocaleString('tr-TR')} elmas kazandın. Kilidi açılınca çekebilir ya da jetona çevirebilirsin.`, href: '/gelir' });
  };
  const applyLocks = (e: ServerEarnings) => {
    const at = Date.now();
    setLockNow(at);
    // The server's channel names, labels and lock lengths (lib/diamond-locks fromServerLock), sender ids as this phone
    // names people. The server lists only the soonest 100; the locked diamonds it left off stay counted.
    setUnlisted(unlistedLocked(e));
    setDiamondLocks(() =>
      e.locks.map((l): DiamondLock => {
        if (l.from) rememberUser(l.from);
        const x = fromServerLock(l, (id) => GIFTS.find((g) => g.id === id));
        return x.fromId ? { ...x, fromId: toLocal(x.fromId) } : x;
      }),
    );
  };
  useEffect(() => bindWallet({ apply: applyServer, locks: applyLocks }));

  const value: AppState = {
    loggedIn,
    me,
    updateMe: (patch) => {
      // Prototype shortcut: mock lookups (userById('me')) read the shared ME object.
      Object.assign(ME, patch);
      setMe({ ...ME });
    },
    login: () => {
      const back = liveMode() ? unparkAccount(parked, myServerId()) : null;
      if (!back) {
        // Another account signed in here: the parked one stays gone.
        if (parked) setParked(null);
        return setLoggedIn(true);
      }
      // The same account signed in again: the store starts from what it had on this phone (items, VIP, progress,
      // notices), as after an app restart, with the profile and balance the sign-in just read from the server.
      onReset({ ...back, settings, me: { ...ME }, coins: coinsRef.current, diamonds: diamondsRef.current, loggedIn: true });
    },
    // Live mode: the next account on this phone must not inherit this one's chats, follows, items or balance.
    // The phone's settings (theme, sounds, privacy choices) stay, and this account's own state is parked until it
    // signs in here again (login); follows, blocks and chats come back from the server.
    logout: () => (liveMode() ? forgetAccount(parkAccount(snapshot)) : setLoggedIn(false)),
    phone,
    setPhone,
    email,
    phoneVerified,

    coins,
    addCoins: (n, reason = 'Jeton yükleme') => {
      setCoins((c) => c + n);
      log('coin', n, reason);
    },
    spendCoins: spend,
    spendBlock,
    gameCoins,
    addGameCoins: (n, reason = 'Oyun kazancı') => {
      setGameCoins((c) => c + n);
      log('game', n, reason);
    },
    spendGameCoins: (n, reason = 'Oyun') => {
      if (gameCoinsRef.current < n) return false;
      setGameCoins((c) => c - n);
      log('game', -n, reason);
      return true;
    },
    spentTotal,
    wealthXp,
    wealthLevel: wealthLevelOf(wealthXp),
    paidGames,
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
    packUnlocked: (id) => {
      const pack = STICKER_PACKS.find((p) => p.id === id);
      return !!pack && (emojiPacks.has(id) || (!pack.price && !pack.minVip) || (!!pack.minVip && vipLevel >= pack.minVip));
    },
    buyEmojiPack: (id) => {
      const pack = STICKER_PACKS.find((p) => p.id === id);
      if (!pack) return 'Paket bulunamadı';
      if (emojiPacks.has(id)) return 'Zaten sahipsin';
      if (pack.minVip && vipLevel < pack.minVip) return `VIP ${pack.minVip} ile açılır`;
      if (!spend(pack.price, `Çıkartma paketi: ${pack.name}`)) return 'Yetersiz jeton';
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
    markNoticeRead: (id) => setNotifications((l) => l.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n))),
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
        notify({ kind: 'system', icon: 'help-buoy', title: `Destek yanıtı · #${number}`, body: 'Talebine yanıt geldi.', href: '/destek' });
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
      // …with part of it still locked: two store-coin gifts (7 days) and one paid with Jeton Noktası coins (1 day).
      const at = Date.now();
      const h = 3_600_000;
      setLockNow(at);
      setDiamondLocks(() => [
        { id: uid(), amount: 640, unlockAt: at + 14 * h, channel: 'jeton', source: 'Hediye', fromId: 'u5' },
        { id: uid(), amount: 3_200, unlockAt: at + 53 * h, channel: 'store', source: 'Hediye', fromId: 'u2' },
        { id: uid(), amount: 1_150, unlockAt: at + 121 * h, channel: 'store', source: 'Arama', fromId: 'u7' },
      ]);
    },
    diamonds,
    withdrawableDiamonds,
    lockedDiamonds,
    diamondLocks,
    totalDiamonds,
    charmXp,
    charmLevel: charmLevelOf(charmXp),
    weekly,
    earnings,
    receiveDiamonds,
    withdrawals,
    requestWithdraw: (amount, iban) => {
      if (amount < RULES.minWithdrawDiamonds) return `En az ${RULES.minWithdrawDiamonds.toLocaleString('tr-TR')} elmas çekebilirsin.`;
      if (amount > diamondsRef.current) return 'Yetersiz elmas bakiyesi.';
      const locked = lockedReason(amount, diamondsRef.current, diamondSplit(diamondsRef.current, locksRef.current, Date.now()).locked);
      if (locked) return locked;
      // Check digits too: a single mistyped digit would send the payout to a dead or wrong account.
      if (!validAnyIban(iban)) return 'IBAN geçersiz. Harfleri ve rakamları tek tek kontrol et.';
      diamondsRef.current -= amount;
      setDiamonds((d) => d - amount);
      const id = uid();
      setWithdrawals((w) => [{ id, diamonds: amount, iban, status: 'Beklemede', time: now() }, ...w]);
      // Demo: auto-approve after a few seconds.
      log('diamond', -amount, 'Para çekme talebi', 'Beklemede');
      setTimeout(() => {
        setWithdrawals((w) => w.map((x) => (x.id === id ? { ...x, status: 'Onaylandı' } : x)));
        notify({ kind: 'finance', icon: 'card', title: 'Para çekme onaylandı', body: `${amount.toLocaleString('tr-TR')} elmas hesabına aktarılıyor.`, href: '/yayinci/cek' });
      }, 5000);
      return null;
    },

    exchangeDiamonds: (amount) => {
      const q = exchangeOwnDiamonds(amount, diamondsRef.current);
      if (!q.ok) return q;
      // Locked diamonds can't become coins either: that would move refundable value out of the lock.
      const locked = lockedReason(amount, diamondsRef.current, diamondSplit(diamondsRef.current, locksRef.current, Date.now()).locked);
      if (locked) return { ok: false, reason: locked };
      diamondsRef.current -= amount;
      setDiamonds((d) => d - amount);
      setCoins((c) => c + q.coins);
      log('diamond', -amount, 'Jetona çevrildi');
      log('coin', q.coins, 'Elmastan çevrildi');
      return { ok: true, coins: q.coins };
    },

    stats,
    bump: (key, n = 1) => setStats((s) => ({ ...s, [key]: s[key] + n })),
    giftWall,
    recordGift,
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
      const first = pack.firstBonus && !firstBuys.has(pack.id) ? pack.firstBonus : 0;
      const total = pack.coins + first;
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
      if (!t || !spend(t.price, `Rütbe: ${t.name} (${NOBLE_DAYS} gün)`)) return false;
      setNobleTier(tier);
      setNobleDays(NOBLE_DAYS);
      return true;
    },
    rbac,
    updateRbac: (fn) => setRbac((s) => fn(s)),
    vipDays,
    buyVipPlan: (days) => {
      // Paid through the store (TRY), so no coins are spent; the receipt is verified on the server.
      const plan = VIP_PLANS.find((p) => p.days === days);
      if (!plan) return false;
      setVipDays((d) => d + days);
      return true;
    },
    maxOutForTest: () => {
      setNobleTier(5);
      setNobleDays(NOBLE_DAYS);
      setVipDays((d) => Math.max(d, 365));
      setSvipXp((x) => Math.max(x, SVIP_LEVELS[SVIP_LEVELS.length - 1].xp));
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
        notify({ kind: 'system', icon: 'business', title: `${a.name} başvurunu kabul etti`, body: 'Artık ajans yayıncısısın.', href: '/ajans' });
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
      notify({ kind: 'system', icon: 'paper-plane', title: 'Transfer talebin mevcut ajansa iletildi', body: 'Ajans sahibine bildirim gitti.', href: '/ajans' });
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
        notify({ kind: 'system', icon: 'checkmark-circle', title: 'Mevcut ajans transferi onayladı', body: to ? `Ücretli transfer · ${fee.toLocaleString('tr-TR')} elmas (hedef ajans öder)` : 'Ayrılma onaylandı', href: '/ajans' });
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
        notify({ kind: 'system', icon: 'business', title: to ? `${to.name} ajansına geçişin tamamlandı` : 'Ajanstan ayrıldın', body: 'Geçmiş kazançların ve komisyon dönemlerin ayrı ayrı korunuyor.', href: '/ajans' });
      }, 6000);
      return null;
    },
    agencyChat,
    sendAgencyMessage: (text) => setAgencyChat((m) => [...m, { id: uid(), userId: 'me', text, time: now() }]),
    rules: RULES,
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
    toggleFollow: (id) => {
      const on = !following.has(id);
      setFollowing((prev) => toggle(prev, id));
      // Live mode: real people are followed on the server (they get a notification); a refusal undoes it here.
      const sid = liveMode() ? toServer(id) : null;
      if (sid && id !== 'me') follow(sid, on).catch((e) => {
        setFollowing((prev) => (prev.has(id) === on ? toggle(prev, id) : prev));
        showAlert('Takip edilemedi', e instanceof Error ? e.message : String(e));
      });
    },
    blocked,
    toggleBlock: (id) => {
      const on = !blocked.has(id);
      logSafety(on ? 'Engelledi' : 'Engeli kaldırdı', id);
      setBlocked((prev) => toggle(prev, id));
      // Live mode: the server keeps the block too (no messages, follows or room entry either way).
      const sid = liveMode() ? toServer(id) : null;
      if (sid && id !== 'me') {
        if (on) setFollowing((prev) => (prev.has(id) ? toggle(prev, id) : prev));
        serverBlock(sid, on).catch((e) => {
          setBlocked((prev) => (prev.has(id) === on ? toggle(prev, id) : prev));
          showAlert(on ? 'Engellenemedi' : 'Engel kaldırılamadı', e instanceof Error ? e.message : String(e));
        });
      }
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
        notify({ kind: 'system', icon: 'image', title: 'Profil fotoğrafın onaylandı', body: 'Yeni fotoğrafın artık herkese görünüyor.', href: '/kullanici/me' });
      }, 4000);
    },
    requestDataExport: () => {
      logSafety('Veri dökümü istedi');
      notify({ kind: 'security', icon: 'archive', title: 'Veri dökümü talebin alındı', body: 'Kişisel verilerinin bir kopyası en geç 30 gün içinde kayıtlı e-postana gönderilir (UK GDPR, veriye erişim hakkı).' });
    },
    conversations,
    sendMessage: (userId, text, fromMe = true, room, ref, event) =>
      setConversations((prev) => {
        const msg = { id: uid(), fromMe, text, time: now(), at: new Date().toISOString(), ...(room ? { room } : {}), ...(event ? { event } : {}), ...(ref ? { ref } : {}) };
        const existing = prev.find((c) => c.userId === userId);
        if (!existing) return [{ id: `c-${userId}`, userId, unread: 0, messages: [msg] }, ...prev];
        return [
          { ...existing, messages: [...existing.messages, msg] },
          ...prev.filter((c) => c.userId !== userId),
        ];
      }),
    setMessageFailed: (userId, ref, reason, retry = true) =>
      setConversations((prev) =>
        prev.map((c) => {
          if (c.userId !== userId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => {
              if (m.ref !== ref) return m;
              const { failed: _failed, noRetry: _noRetry, ...rest } = m;
              return reason ? { ...rest, failed: reason, ...(retry ? {} : { noRetry: true }) } : rest;
            }),
          };
        }),
      ),
    markMessageSent: (userId, ref, message) => setConversations((prev) => markSent(prev, userId, ref, message)),
    receiveMessage: (userId, text) =>
      setConversations((prev) => {
        const msg = { id: uid(), fromMe: false, text, time: now(), at: new Date().toISOString() };
        const existing = prev.find((c) => c.userId === userId);
        if (!existing) return [{ id: `c-${userId}`, userId, unread: 1, messages: [msg] }, ...prev];
        return [{ ...existing, unread: existing.unread + 1, messages: [...existing.messages, msg] }, ...prev.filter((c) => c.userId !== userId)];
      }),
    followerInvites,
    markFollowerInvite: (roomId, at) => setFollowerInvites((m) => ({ ...m, [roomId]: at })),
    markRead: (userId) => {
      // Live mode: the server hears it too (read receipts, the unread count on another phone or after signing in).
      const c = conversations.find((x) => x.userId === userId);
      if (c && (c.unread > 0 || c.messages.some((m) => !m.fromMe))) markLiveRead(userId);
      setConversations((prev) => (prev.some((x) => x.userId === userId && x.unread > 0) ? prev.map((x) => (x.userId === userId ? { ...x, unread: 0 } : x)) : prev));
    },
    importDms: (userId, dms, sync, unread) => setConversations((prev) => applyThread(prev, userId, dms, sync, unread)),
    deleteMessage: (userId, messageId) => {
      const m = conversations.find((c) => c.userId === userId)?.messages.find((x) => x.id === messageId);
      if (m?.sid !== undefined) void hideDms(userId, [m.sid]);
      setConversations((prev) => prev.map((c) => (c.userId === userId ? { ...c, messages: c.messages.filter((x) => x.id !== messageId) } : c)));
    },
    deleteConversation: (userId) => {
      const c = conversations.find((x) => x.userId === userId);
      if (c) void hideDms(userId, c.messages.map((m) => m.sid));
      setConversations((prev) => prev.filter((x) => x.userId !== userId));
    },
    takeServerSocial: ({ following: f, blocked: b }) => {
      if (f) setFollowing(new Set(f));
      if (b) setBlocked(new Set(b));
    },
    ownedAnims,
    micFx,
    buyMicFx: (animationId) => {
      const a = animById(animationId);
      if (!a || a.display_type !== 'mic_effect' || !isLive(a)) return 'Bu efekt şu an satışta değil.';
      if (!ownedAnims.has(animationId)) {
        if (!a.is_free && !spend(a.coin_price, `Mikrofon efekti: ${a.name}`)) return 'Yetersiz jeton.';
        setOwnedAnims((o) => new Set(o).add(animationId));
      }
      setMicFx(animationId);
      return null;
    },
    setMicFx,
    starter,
    claimStarter: (reward) => {
      if (starter.claimed) return;
      setStarter((st) => ({ ...st, claimed: true }));
      setCoins((c) => c + reward);
      log('coin', reward, 'İlk adımlar ödülü');
    },
    hideStarter: () => setStarter((st) => ({ ...st, hidden: true })),
    resetAll: () => forgetAccount(),
  };

  return (
    <Ctx.Provider value={value}>
      <SettingsCtx.Provider value={settings}>
        <AppTheme appearance={settings.appearance}>{children}</AppTheme>
      </SettingsCtx.Provider>
    </Ctx.Provider>
  );
}

const APPEARANCES = ['system', 'light', 'dark'] as const;

/**
 * The app's color scheme: the Görünüm setting, or the phone's when it is `system`. Native views (alerts, the
 * keyboard) follow the same choice. The status bar here is mounted after the root layout's, so it decides the
 * bar's style; rooms and calls, which stay dark, mount their own on top while they are open.
 */
function AppTheme({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
  const system = useColorScheme();
  const scheme: Scheme = appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance;
  useEffect(() => {
    // Web has no app-level override; the browser's own setting is what `system` reads there.
    SystemAppearance.setColorScheme?.(appearance === 'system' ? 'auto' : appearance);
  }, [appearance]);
  return (
    <ThemeScope scheme={scheme}>
      {children}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeScope>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Only the settings; re-renders when a setting changes, not on every store update. */
export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used inside AppProvider');
  return ctx;
}
