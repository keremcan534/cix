// Gelir and the wallet history in live mode, read straight from the server:
//   GET /api/wallet/earnings → the withdrawable and locked totals (summed by the server over every lock, not only
//                              the 100 it lists) and the locks that open soonest, with their channel and length;
//   GET /api/ledger          → the account's latest wallet rows, with the server's refs and the sender of a gift.
// The screens show these numbers as they are; nothing here changes a balance. Without a server address the hooks
// stay idle and the screens keep the store's demo data.
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { GIFTS, serverUserKnown } from '@/data/mock';
import { fromServerLock, type DiamondLock } from '@/lib/diamond-locks';
import { toLedgerEntry, type LedgerEntry, type RawLedgerRow } from '@/lib/ledger-view';
import { liveMode, loadProfile, message, myServerId, rememberUser, toLocal } from '@/lib/live';

type Load = 'idle' | 'loading' | 'ready' | 'error';
export type LiveEarnings = {
  status: Load;
  error: string | null;
  diamonds: number;
  withdrawable: number;
  locked: number;
  /** Soonest first; at most the server's page (100). The totals above count every lock. */
  locks: DiamondLock[];
};
export type LiveLedger = { status: Load; error: string | null; rows: LedgerEntry[] };

let earnings: LiveEarnings = { status: 'idle', error: null, diamonds: 0, withdrawable: 0, locked: 0, locks: [] };
let ledger: LiveLedger = { status: 'idle', error: null, rows: [] };
/** Bumped when a sender's name arrives, so rows that showed "Üye" re-render with it. */
let names = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const giftOf = (id: string) => GIFTS.find((g) => g.id === id);

/** The server's totals and locks. A failed read keeps the last good numbers and says why. */
export async function loadEarnings() {
  earnings = { ...earnings, status: earnings.status === 'ready' ? 'ready' : 'loading', error: null };
  emit();
  try {
    const r = await api.earnings();
    r.locks.forEach((l) => l.from && rememberUser(l.from));
    earnings = {
      status: 'ready',
      error: null,
      diamonds: r.diamonds,
      withdrawable: r.withdrawable,
      locked: r.locked,
      // Sender ids as the rest of the app names people (toLocal), so the lock row opens the right profile.
      locks: r.locks
        .map((l) => fromServerLock(l, giftOf))
        .map((x) => (x.fromId ? { ...x, fromId: toLocal(x.fromId) } : x))
        .sort((a, b) => a.unlockAt - b.unlockAt),
    };
  } catch (e) {
    earnings = { ...earnings, status: earnings.status === 'ready' ? 'ready' : 'error', error: message(e) };
  }
  emit();
  return earnings;
}

/** Senders the phone hasn't met yet: their names, a few at a time (the ledger only carries their id). */
async function learnNames(rows: LedgerEntry[]) {
  const me = myServerId();
  const unknown = [...new Set(rows.map((r) => r.counterparty).filter((id): id is string => !!id && id !== me && !serverUserKnown(id)))].slice(0, 10);
  if (!unknown.length) return;
  await Promise.all(unknown.map((id) => loadProfile(id).catch(() => null)));
  names += 1;
  emit();
}

/** The latest wallet rows (the server sends the newest 50). */
export async function loadLedger() {
  ledger = { ...ledger, status: ledger.status === 'ready' ? 'ready' : 'loading', error: null };
  emit();
  try {
    const r = await api.apiRequest<{ rows: RawLedgerRow[] }>('GET', '/api/ledger');
    ledger = { status: 'ready', error: null, rows: r.rows.map(toLedgerEntry) };
    void learnNames(ledger.rows);
  } catch (e) {
    ledger = { ...ledger, status: ledger.status === 'ready' ? 'ready' : 'error', error: message(e) };
  }
  emit();
  return ledger;
}

/** How many rows GET /api/ledger sends at most. */
export const LEDGER_PAGE = 50;

/**
 * Gelir's numbers from the server, re-read when the screen opens, when `diamonds` (the store's balance) changes and
 * every 30 seconds. Idle outside live mode.
 */
export function useLiveEarnings(diamonds?: number): LiveEarnings & { reload: () => void } {
  const s = useSyncExternalStore(subscribe, () => earnings, () => earnings);
  useEffect(() => {
    if (!liveMode()) return;
    void loadEarnings();
    const t = setInterval(() => void loadEarnings(), 30_000);
    return () => clearInterval(t);
  }, [diamonds]);
  return { ...s, reload: () => void loadEarnings() };
}

/** The server's wallet rows, read when the screen opens (and with `reload`). Idle outside live mode. */
export function useLiveLedger(active = true): LiveLedger & { names: number; reload: () => void } {
  const s = useSyncExternalStore(subscribe, () => ledger, () => ledger);
  const n = useSyncExternalStore(subscribe, () => names, () => names);
  useEffect(() => {
    if (!liveMode() || !active) return;
    void loadLedger();
  }, [active]);
  return { ...s, names: n, reload: () => void loadLedger() };
}
