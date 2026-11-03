// Locked diamonds (Gelir: "Çekilebilir kazanç" / "Kilitli elmas"). The diamonds a gift earns stay locked until
// the coins behind it can no longer be refunded: coins bought in the store (Google Play / App Store) lock them for
// RULES.pendingDays (7), coins bought at a Jeton Noktası for RULES.jetonPendingDays (1). Locked diamonds count in
// the balance but can't be withdrawn, exchanged or sold until they open. The server keeps the real locks
// (server/api/wallet.mjs, diamond_locks) and refuses the same moves with the same message; the app mirrors them so
// the Gelir screen can show both parts. Kept pure so node --test can load it (tests/diamond-locks.test.ts).
import { RULES, type Rules } from '@/data/rules';
import type { EarningGift, EarningSource } from '@/store';

/** Where the sender's coins came from: the store (refundable for a week) or a Jeton Noktası. */
export type LockChannel = 'store' | 'jeton';
export type DiamondLock = {
  id: string;
  amount: number;
  /** Epoch ms when these diamonds become withdrawable. */
  unlockAt: number;
  channel: LockChannel;
  source: EarningSource;
  fromId?: string;
  gift?: EarningGift;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const fmt = (n: number) => n.toLocaleString('tr-TR');

export const lockDays = (channel: LockChannel, r: Rules = RULES) => (channel === 'jeton' ? r.jetonPendingDays : r.pendingDays);
export const lockMs = (channel: LockChannel, r: Rules = RULES) => lockDays(channel, r) * DAY;
export const channelLabel = (channel: LockChannel) => (channel === 'jeton' ? 'Jeton Noktası' : 'Mağaza jetonu');

/** Earnings paid with someone's coins (a gift, a call, and the bonuses on them) can be refunded, so they lock.
 *  Platform payouts (tasks, agency and family bonuses) are settled weekly and don't. */
export const LOCKED_SOURCES: readonly EarningSource[] = ['Hediye', 'Arama', 'Cazibe bonusu', 'Oda sahibi bonusu', 'Arama bonusu'];
export const locksFor = (source: EarningSource) => LOCKED_SOURCES.includes(source);

export const activeLocks = (locks: readonly DiamondLock[], now: number) => locks.filter((l) => l.unlockAt > now);

/** Most lock rows kept on the device; past it the soonest ones fold into one row (lib/persist saves them all). */
export const MAX_LOCKS = 300;

/**
 * Adds a lock, newest first. The same gift from the same person within the hour joins the earlier row (a combo
 * shows as one ×N line); the joined row opens with the later of the two. Past MAX_LOCKS the rows that open
 * soonest fold into one that opens with the last of them, so nothing ever opens early.
 */
export function addLock(locks: readonly DiamondLock[], lock: DiamondLock): DiamondLock[] {
  const i = locks.findIndex(
    (l) => l.channel === lock.channel && l.source === lock.source && l.fromId === lock.fromId && l.gift?.id === lock.gift?.id && Math.abs(lock.unlockAt - l.unlockAt) < HOUR,
  );
  let next: DiamondLock[];
  if (i >= 0) {
    const m = locks[i];
    const gift = m.gift && lock.gift ? { ...m.gift, count: m.gift.count + lock.gift.count } : m.gift;
    next = [{ ...m, amount: m.amount + lock.amount, unlockAt: Math.max(m.unlockAt, lock.unlockAt), ...(gift && { gift }) }, ...locks.slice(0, i), ...locks.slice(i + 1)];
  } else next = [lock, ...locks];
  if (next.length <= MAX_LOCKS) return next;
  const byLatest = [...next].sort((a, b) => b.unlockAt - a.unlockAt);
  const keep = byLatest.slice(0, MAX_LOCKS - 1);
  const rest = byLatest.slice(MAX_LOCKS - 1);
  const last = rest[0];
  const folded: DiamondLock = { id: last.id, amount: rest.reduce((t, l) => t + l.amount, 0), unlockAt: last.unlockAt, channel: last.channel, source: last.source };
  const kept = new Set(keep);
  return [...next.filter((l) => kept.has(l)), folded];
}

/** The balance in two parts. Locks never count for more than the balance itself. */
export function diamondSplit(diamonds: number, locks: readonly DiamondLock[], now: number) {
  const pending = locks.reduce((t, l) => (l.unlockAt > now ? t + l.amount : t), 0);
  const locked = Math.max(0, Math.min(diamonds, pending));
  return { locked, withdrawable: Math.max(0, diamonds - locked) };
}

/** Why `amount` diamonds can't leave yet because some are locked, or null. Same wording as the server. */
export function lockedReason(amount: number, diamonds: number, locked: number): string | null {
  const withdrawable = Math.max(0, diamonds - locked);
  if (amount <= withdrawable || amount > diamonds) return null;
  return `${fmt(locked)} elmasın kilidi henüz açılmadı; çekilebilir bakiyen ${fmt(withdrawable)} elmas.`;
}

/** The earliest moment a lock opens, or null when nothing is locked. */
export function nextUnlock(locks: readonly DiamondLock[], now: number): number | null {
  let next: number | null = null;
  for (const l of locks) if (l.unlockAt > now && (next === null || l.unlockAt < next)) next = l.unlockAt;
  return next;
}

/** "2 gün 4 saat", "14 saat", "35 dk"; "Açıldı" once the time has passed. */
export function timeLeft(unlockAt: number, now: number): string {
  const ms = unlockAt - now;
  if (ms <= 0) return 'Açıldı';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (days > 0) return hours > 0 ? `${days} gün ${hours} saat` : `${days} gün`;
  if (hours > 0) return `${hours} saat`;
  return `${Math.max(1, Math.ceil(ms / 60_000))} dk`;
}

/** How much of the lock period has passed, 0…1 (for the progress bar). */
export function lockProgress(lock: DiamondLock, now: number, r: Rules = RULES): number {
  const total = lockMs(lock.channel, r);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (lock.unlockAt - now) / total));
}
