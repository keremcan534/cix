// The device save (lib/persist) is checked here before the store uses it: wrong types, rows missing a field a
// list draws, unknown choices and links to agencies the app doesn't know are dropped or reset, so an old or
// broken save never crashes a launch. Kept out of store.tsx so node --test can load it (tests/snapshot.test.ts).
import { AGENCIES, type AgencyRole } from '@/data/agency';
import type { CosmeticKind } from '@/data/catalog';
import type { TaskKey } from '@/data/economy';
import { ME, type Conversation, type User } from '@/data/mock';
import { entriesWhere, isFiniteNumber, isRecord, itemsShaped, oneOf, pickValid, withDefaults, type Kind } from '@/lib/saved-state';
import type { Earning, FanClub, LedgerRow, MyRoom, Notice, OwnedAgency, SafetyLog, Settings, Withdrawal } from '@/store';

/** What survives an app restart (lib/persist). Sets are stored as arrays. */
export type Snapshot = {
  loggedIn: boolean;
  me: User;
  coins: number;
  gameCoins?: number;
  spentTotal: number;
  wealthXp?: number;
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
  charmXp?: number;
  weekly: number[];
  earnings: Earning[];
  withdrawals: Withdrawal[];
  stats: Record<TaskKey, number>;
  giftWall?: Record<string, Record<string, number>>;
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
  followerInvites: Record<string, number>;
  starter: { claimed: boolean; hidden: boolean };
  safetyLog: SafetyLog[];
  ownedAnims: string[];
  micFx: string | null;
};

/** The built-in profile before any saved data is applied (the store's reset puts it back). */
export const ME_DEFAULT = { ...ME };
const AGENCY_ROLES: readonly AgencyRole[] = ['owner', 'assistant', 'member'];
const FAMILY_ROLES = ['owner', 'helper', 'member'] as const;

/** The kind of value each saved field must hold (lib/saved-state); anything else is dropped on load. */
const SNAPSHOT_SPEC: Record<keyof Snapshot, Kind> = {
  loggedIn: 'boolean', me: 'object', coins: 'number', gameCoins: 'number', spentTotal: 'number', wealthXp: 'number', ledger: 'objects',
  spentDay: 'object', inventory: 'strings', equipped: 'object', emojiPacks: 'strings', recentEmojis: 'strings', settings: 'object',
  notifications: 'objects', myRoom: 'object', isHost: 'boolean', diamonds: 'number', totalDiamonds: 'number', charmXp: 'number',
  weekly: 'numbers', earnings: 'objects', withdrawals: 'objects', stats: 'object', giftWall: 'object', claimedTasks: 'strings',
  checkInDay: 'number', checkInDate: 'string', svipXp: 'number', firstBuys: 'strings', nobleTier: 'number', nobleDays: 'number',
  vipDays: 'number', agencyId: 'string?', agencyRole: 'string?', ownedAgency: 'object?', familyRole: 'string?', familyId: 'string?',
  fanClubs: 'object', recentRooms: 'strings', following: 'strings', blocked: 'strings', conversations: 'objects',
  followerInvites: 'object', starter: 'object', safetyLog: 'objects', ownedAnims: 'strings', micFx: 'string?',
};

/** The saved state with every field checked; null when nothing usable was saved. */
export function readSnapshot(raw: unknown): Partial<Snapshot> | null {
  const s = pickValid<Snapshot>(raw, SNAPSHOT_SPEC);
  if (!s) return null;
  if (s.me) s.me = withDefaults(ME_DEFAULT, s.me);
  if (s.weekly && s.weekly.length !== 7) delete s.weekly;
  // A row missing a field the list draws (or one a later version renamed) would crash that list's screen.
  if (s.ledger) s.ledger = itemsShaped(s.ledger, { id: 'string', ref: 'string', currency: 'string', amount: 'number', reason: 'string', time: 'string', status: 'string' });
  if (s.notifications) s.notifications = itemsShaped(s.notifications, { id: 'string', kind: 'string', icon: 'string', title: 'string', body: 'string', time: 'string', read: 'boolean' });
  if (s.earnings) {
    s.earnings = itemsShaped<Earning>(s.earnings, { id: 'string', amount: 'number', source: 'string', time: 'string' }).filter(
      (e) => e.gift === undefined || itemsShaped([e.gift], { name: 'string', emoji: 'string', count: 'number' }).length === 1,
    );
  }
  if (s.withdrawals) s.withdrawals = itemsShaped(s.withdrawals, { id: 'string', diamonds: 'number', iban: 'string', status: 'string', time: 'string' });
  if (s.safetyLog) s.safetyLog = itemsShaped(s.safetyLog, { id: 'string', action: 'string', time: 'string' });
  // A chat without its message list (or with a broken message) would crash the inbox and the chat screen.
  if (s.conversations) {
    s.conversations = itemsShaped<Conversation>(s.conversations, { id: 'string', userId: 'string', messages: 'objects' }).map((c) => ({
      ...c,
      unread: isFiniteNumber(c.unread) ? c.unread : 0,
      messages: itemsShaped(c.messages, { text: 'string' }),
    }));
  }
  if (s.fanClubs) {
    s.fanClubs = entriesWhere(s.fanClubs, (v): v is FanClub => isRecord(v) && isFiniteNumber(v.points) && Array.isArray(v.history));
    for (const club of Object.values(s.fanClubs)) club.history = itemsShaped(club.history, { text: 'string', pts: 'number', time: 'string' });
  }
  if (s.giftWall) s.giftWall = entriesWhere(s.giftWall, (v): v is Record<string, number> => isRecord(v) && Object.values(v).every(isFiniteNumber));
  if (s.followerInvites) s.followerInvites = entriesWhere(s.followerInvites, isFiniteNumber);
  if (s.equipped) s.equipped = entriesWhere(s.equipped, (v): v is string => typeof v === 'string');
  if (s.ownedAgency && itemsShaped([s.ownedAgency], { name: 'string', code: 'string', status: 'string' }).length === 0) s.ownedAgency = null;
  // Membership must point at an agency the app knows ('own' = the user's own, which needs its record).
  if (s.agencyId && (s.agencyId === 'own' ? !s.ownedAgency : !AGENCIES.some((a) => a.id === s.agencyId))) {
    s.agencyId = null;
    s.agencyRole = null;
  }
  // Choices from a fixed list: an unknown value (renamed in a later version) is dropped, so its default is used.
  if (s.agencyRole !== undefined && s.agencyRole !== null) s.agencyRole = oneOf(s.agencyRole, AGENCY_ROLES) ?? null;
  if (s.familyRole !== undefined && s.familyRole !== null) s.familyRole = oneOf(s.familyRole, FAMILY_ROLES) ?? null;
  return s;
}
