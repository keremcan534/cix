// Para çekme in live mode: requests go to the server (server/api withdraw.mjs), which holds the diamonds at
// once and gives them back on a cancel or a rejection. The balance after each step is the server's answer; the
// history is the server's list. Without a server address the store's demo withdrawals are used instead.
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { applyServerUser, expectReturn, liveMode, once } from '@/lib/live';
import type { WithdrawMethod, WithdrawStatus } from '@/lib/withdraw-rules';

export type ServerWithdrawal = {
  id: number;
  diamonds: number;
  usd: number;
  method: WithdrawMethod;
  holder: string;
  account: string;
  status: WithdrawStatus;
  statusLabel: string;
  note: string;
  createdAt: string;
  decidedAt: string | null;
};
type Rules = { minDiamonds: number; maxDiamonds: number; weeklyDiamonds: number; weekUsed: number };
type ListAnswer = { withdrawals: ServerWithdrawal[]; withdrawable: number; locked: number; rules: Rules };
export type WithdrawState = { list: ServerWithdrawal[]; withdrawable: number; locked: number; rules: Rules | null; loaded: boolean };

let state: WithdrawState = { list: [], withdrawable: 0, locked: 0, rules: null, loaded: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<WithdrawState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** One request in the list, replacing the old copy. */
const put = (w: ServerWithdrawal) => set({ list: [w, ...state.list.filter((x) => x.id !== w.id)].sort((a, b) => b.id - a.id) });

/**
 * Reads my requests and what can be withdrawn now. A request that was pending and is now rejected gave its
 * diamonds back: the wallet is told, so the next balance shows them as returned, not as a gift.
 */
export async function loadWithdrawals() {
  const r = await api.apiRequest<ListAnswer>('GET', '/api/wallet/withdrawals');
  const wasPending = new Set(state.list.filter((w) => w.status === 'pending').map((w) => w.id));
  const back = r.withdrawals.filter((w) => w.status === 'rejected' && wasPending.has(w.id)).reduce((s, w) => s + w.diamonds, 0);
  if (back) expectReturn(back);
  set({ list: r.withdrawals, withdrawable: r.withdrawable, locked: r.locked, rules: r.rules, loaded: true });
  return r;
}

let checked = false;
/**
 * For the live sync, before it reads the balance: my requests once after the start, then only while one is
 * pending (the owner's decision is the only change the server makes on its own).
 */
export async function settleWithdrawals() {
  if (checked && !state.list.some((w) => w.status === 'pending')) return;
  checked = true;
  await loadWithdrawals();
}

/** My requests, re-read when a screen shows them and every 30 seconds while it does. */
export function useServerWithdrawals(): WithdrawState {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (!liveMode()) return;
    const tick = () => void loadWithdrawals().catch(() => {});
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return s;
}

export type WithdrawRequest = { diamonds: number; method: WithdrawMethod; holder: string; account: string };

/** A new request. The diamonds leave the balance now (the server's answer reaches the wallet). */
export async function liveWithdraw(w: WithdrawRequest) {
  const body = { diamonds: w.diamonds, method: w.method, details: { holder: w.holder.trim(), account: w.account.trim() } };
  const r = await once(`withdraw:${w.diamonds}:${w.method}:${body.details.account}`, (ref) =>
    api.apiRequest<{ user: api.ServerUser; replay: boolean; withdrawal: ServerWithdrawal }>('POST', '/api/wallet/withdraw', { ...body, ref }),
  );
  applyServerUser(r, 'Para çekme talebi');
  put(r.withdrawal);
  void loadWithdrawals().catch(() => {});
  return r.withdrawal;
}

export type JetonBank = { id: string; name: string; avatarUrl: string | null };
export type DiamondSale = { id: number; coins: number; diamonds: number | null; valueTl: number | null; to: { id: string; name: string | null }; createdAt: string };

/** The active Jeton Noktası accounts (server jeton.mjs GET /api/jeton/banks). */
export const loadBanks = () => api.apiRequest<{ banks: JetonBank[] }>('GET', '/api/jeton/banks').then((r) => r.banks);

/**
 * Para çek → Jeton Noktası: the diamonds go to the chosen Jeton Noktası at once (server POST sell-diamonds); it
 * pays their value in TL outside the app and gets coins for them. Only unlocked diamonds can go.
 */
export async function sellToBank(bank: string, diamonds: number) {
  const r = await once(`sell:${bank}:${diamonds}`, (ref) =>
    api.apiRequest<{ user: api.ServerUser; replay: boolean; transfer: DiamondSale }>('POST', '/api/jeton/sell-diamonds', { bank, diamonds, ref }),
  );
  applyServerUser(r, "Jeton Noktası'na aktarıldı");
  void loadWithdrawals().catch(() => {});
  return r.transfer;
}

/** Cancels a pending request; its diamonds come back. */
export async function cancelWithdraw(id: number) {
  const r = await api.apiRequest<{ user: api.ServerUser; withdrawal: ServerWithdrawal }>('POST', '/api/wallet/withdrawals/cancel', { id });
  applyServerUser(r, 'Para çekme iptali');
  put(r.withdrawal);
  void loadWithdrawals().catch(() => {});
  return r.withdrawal;
}
