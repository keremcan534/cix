// The owner's Yönetim panel (components/admin) on the server's admin routes: the report queue and bans
// (admin.mjs), diamond withdrawals (withdraw.mjs), agency payouts (agency-admin.mjs), store refunds (jeton.mjs,
// refunds.mjs), alarms (alerts.mjs), the finance panel feed (finance-sync.mjs) and one account's money record
// (jeton.mjs wallet/audit). The server checks the role on every call; the phone only decides whether to show
// the way in (useIsAdmin).
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { liveMode } from '@/lib/live';

const get = <T>(path: string) => api.apiRequest<T>('GET', path);
const post = <T>(path: string, body: object) => api.apiRequest<T>('POST', path, body);
const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};

// --- Who may open it ---------------------------------------------------------------------------------------
let role: string | null = null;
const roleListeners = new Set<() => void>();
const subscribeRole = (l: () => void) => {
  roleListeners.add(l);
  return () => roleListeners.delete(l);
};
/** Reads my server role (GET /api/me) once per app start; a failed read leaves the panel hidden. */
let roleRead: Promise<void> | null = null;
export function readRole(force = false) {
  if (!liveMode()) return Promise.resolve();
  if (roleRead && !force) return roleRead;
  roleRead = get<{ user: api.ServerMe }>('/api/me')
    .then((r) => {
      role = r.user.role ?? 'user';
      roleListeners.forEach((l) => l());
    })
    .catch(() => {
      roleRead = null;
    });
  return roleRead;
}
/** True for an admin account in a live build. */
export function useIsAdmin() {
  const r = useSyncExternalStore(subscribeRole, () => role, () => role);
  useEffect(() => void readRole(), []);
  return liveMode() && r === 'admin';
}

// --- Health ------------------------------------------------------------------------------------------------
export type Health = { ok: boolean; db: boolean; version: string; uptime: number; warnings: string[] };
export type AlertWarning = { code: string; message: string; value: unknown; threshold: unknown; details?: unknown };
export type Alerts = { warnings: AlertWarning[]; financeSync: boolean };
export type FinanceSync = { enabled: boolean; lastId: number; behind: number; lastOkAt: string | null; lastError: string | null; failed: number };

export const health = () => get<Health>('/api/health');
export const alerts = () => get<Alerts>('/api/admin/alerts');
export const financeSync = () => get<FinanceSync>('/api/admin/finance-sync');

// --- Reports -----------------------------------------------------------------------------------------------
export type ReportStatus = 'open' | 'actioned' | 'dismissed';
export type Report = {
  id: number;
  reporter: { id: string; name: string };
  target: { type: 'user' | 'room' | 'message' | 'moment'; id: string; name: string | null; staff: boolean; bannedUntil: string | null };
  reason: string;
  note: string;
  status: ReportStatus;
  reportsOnTarget: number;
  createdAt: string;
  handledAt: string | null;
};
export const reports = (status: ReportStatus = 'open') => get<{ reports: Report[] }>(`/api/admin/reports${q({ status })}`).then((r) => r.reports);
/** actioned (with an optional ban of the reported person) or dismissed. */
export const handleReport = (id: number, status: 'actioned' | 'dismissed', banDays?: number) =>
  post<{ report: { id: number; status: ReportStatus }; bannedUntil: string | null }>('/api/admin/reports/handle', { id, status, ...(banDays ? { banDays } : {}) });
/** days = null lifts the ban. */
export const ban = (user: string, days: number | null) => post<{ bannedUntil: string | null }>('/api/admin/ban', { user, days });

// --- Withdrawals -------------------------------------------------------------------------------------------
export type WithdrawalStatus = 'pending' | 'paid' | 'rejected' | 'cancelled';
export type AdminWithdrawal = {
  id: number;
  diamonds: number;
  usd: number;
  method: 'iban' | 'other';
  holder: string;
  account: string;
  status: WithdrawalStatus;
  statusLabel: string;
  note: string;
  createdAt: string;
  decidedAt: string | null;
  user: { id: string; name: string; phone: string | null };
  play: boolean;
  payable: boolean;
};
export const withdrawals = (status: WithdrawalStatus | 'all' = 'pending') => get<{ playMoney: boolean; rows: AdminWithdrawal[] }>(`/api/admin/withdrawals${q({ status })}`);
/** approve = paid by hand already; a rejection needs a note and gives the diamonds back. */
export const decideWithdrawal = (id: number, approve: boolean, note = '') => post<{ withdrawal: AdminWithdrawal }>('/api/admin/withdrawals/decide', { id, approve, note });

// --- Agency payouts ----------------------------------------------------------------------------------------
export type PayoutStatus = 'pending' | 'ready' | 'paid' | 'rejected' | 'cancelled';
export type AgencyPayout = {
  id: number;
  agency: { id: string; name: string; code: string; status: string };
  amount: number;
  usd: number;
  currency: 'USD' | 'TRY';
  status: PayoutStatus;
  statusLabel: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  note: string;
};
export const agencyPayouts = (status?: PayoutStatus) => get<{ payouts: AgencyPayout[] }>(`/api/admin/agency/payouts${q({ status })}`).then((r) => r.payouts);
export type PayoutAction = 'approve' | 'pay' | 'reject' | 'cancel';
export const decidePayout = (payoutId: number, action: PayoutAction, extra: { note?: string; paymentRef?: string } = {}) =>
  post<{ status: PayoutStatus }>('/api/admin/agency/payouts/decide', { payoutId, action, ...extra });
/** Whether the person who approved a payout may also mark it paid (payout_policy.two_person). */
export const twoPersonPayouts = () =>
  get<{ values: { payout_policy?: { two_person?: boolean } } }>('/api/admin/agency/settings').then((r) => r.values.payout_policy?.two_person ?? false);

// --- Refunds -----------------------------------------------------------------------------------------------
export type AdminPurchase = {
  id: number;
  platform: 'android' | 'ios' | 'test';
  productId: string;
  transactionId: string;
  coins: number;
  bonus: number;
  priceTl: number | null;
  status: 'credited' | 'refunded';
  sandbox: boolean;
  createdAt: string;
  user: { id: string; name: string };
};
export type GoogleSync = { enabled: boolean; everyMin: number; lastOkAt: string | null; lastError: string | null };
/** By purchase number, store order id or account id; empty = the latest purchases. */
export const purchases = (search = '') => get<{ purchases: AdminPurchase[]; googleSync: GoogleSync }>(`/api/admin/purchases${q({ q: search.trim() || undefined })}`);
export const refund = (purchase: number) => post<{ coins: number; diamonds: number; unrecoveredDiamonds: number }>('/api/admin/purchases/refund', { purchase });
export const syncGoogleRefunds = () => post<{ checked: number; refunded: number; unknown: number }>('/api/admin/purchases/voided-sync', {});

// --- One account -------------------------------------------------------------------------------------------
export type WalletAudit = {
  user: api.ServerUser & { withdrawable: number; locked: number; coinsInLots: number; role?: string };
  purchases: { id: number; platform: string; product_id: string; coins: number; bonus: number; status: string; created_at: string }[];
  ledger: { id: number; currency: 'coin' | 'diamond' | 'game'; amount: number; balance: number; reason: string; created_at: string }[];
};
export const walletAudit = (user: string) => get<WalletAudit>(`/api/admin/wallet/audit${q({ user })}`);
