// The owner's Yönetim panel (components/admin) on the server's admin routes: the report queue and bans
// (admin.mjs), diamond withdrawals (withdraw.mjs), agency payouts (agency-admin.mjs), store refunds (jeton.mjs,
// refunds.mjs), alarms (alerts.mjs), the finance panel feed (finance-sync.mjs) and one account's money record
// (jeton.mjs wallet/audit) and sanctions (sanctions.mjs: search, one person's record, apply / lift / approve,
// appeals, policies, permissions, device review). The server checks the role or permission on every call; the
// phone only decides whether to show the way in (useIsAdmin) and which sanction actions to offer (meta.perms).
import { useEffect, useSyncExternalStore } from 'react';

import { banBody } from '@/lib/admin-format';
import * as api from '@/lib/api';
import { liveMode } from '@/lib/live';
import type { AppealOutcome, ApplyBody, DeviceRisk, SanctionAppeal, SanctionAudit, SanctionDevice, SanctionMeta, SanctionPolicy, SanctionType, StaffSanction } from '@/lib/sanction-format';

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
  return useStaffRole() === 'admin';
}
/** admin or moderator in a live build (a moderator's panel holds only Yaptırımlar); null for everyone else. */
export function useStaffRole(): 'admin' | 'moderator' | null {
  const r = useSyncExternalStore(subscribeRole, () => role, () => role);
  useEffect(() => void readRole(), []);
  return liveMode() && (r === 'admin' || r === 'moderator') ? r : null;
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
  /** bannedUntil: when the running timed account ban ends; bannedForever: a lifetime ban runs (bannedUntil may be null then). */
  target: { type: 'user' | 'room' | 'message' | 'moment'; id: string; name: string | null; staff: boolean; bannedUntil: string | null; bannedForever: boolean };
  reason: string;
  note: string;
  status: ReportStatus;
  reportsOnTarget: number;
  createdAt: string;
  handledAt: string | null;
};
export const reports = (status: ReportStatus = 'open') => get<{ reports: Report[] }>(`/api/admin/reports${q({ status })}`).then((r) => r.reports);
/** actioned (with an optional ban of the reported person) or dismissed. 'Süresiz' also sends permanent: true (banBody). */
export const handleReport = (id: number, status: 'actioned' | 'dismissed', banDays?: number) => {
  const b = banDays ? banBody(banDays) : null;
  return post<{ report: { id: number; status: ReportStatus }; bannedUntil: string | null }>('/api/admin/reports/handle', { id, status, ...(b ? { banDays: b.days, permanent: b.permanent } : {}) });
};
/** days = null lifts the ban; 'Süresiz' also sends permanent: true (banBody). */
export const ban = (user: string, days: number | null) => post<{ bannedUntil: string | null }>('/api/admin/ban', { user, ...(days === null ? { days } : banBody(days)) });

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
  /** false when the commission came from test coins on this server: the server refuses approve/pay then (as with user withdrawals). Older servers leave it out. */
  payable?: boolean;
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

// --- Sanctions (sanctions.mjs; shapes and wording in lib/sanction-format) ---------------------------------------
export type SanctionSearchUser = { id: string; name: string; phone: string | null; role: string; deleted: boolean; liveSanctions: number; totalSanctions: number };
export type SanctionUserDetail = {
  user: { id: string; name: string; phone: string | null; role: string; createdAt: string; deleted: boolean };
  sanctions: StaffSanction[];
  /** Device bans given over other accounts on this person's devices. */
  deviceSanctions: StaffSanction[];
  devices: SanctionDevice[];
  appeals: SanctionAppeal[];
  audit: SanctionAudit[];
};
export type StaffAppeal = SanctionAppeal & { sanction: StaffSanction };
export type SanctionPerms = { role: string; permissions: string[]; granted: string[] };

/** 403 when this staff member has no sanction.view (the panel then hides Yaptırımlar). */
export const sanctionMeta = () => get<SanctionMeta>('/api/admin/sanctions/meta');
/** By name, username, phone, e-mail, account id, #sanction id or #device id. */
export const sanctionSearch = (text: string) => get<{ users: SanctionSearchUser[] }>(`/api/admin/sanctions/search${q({ q: text.trim() || undefined })}`).then((r) => r.users);
export const sanctionUser = (id: string) => get<SanctionUserDetail>(`/api/admin/sanctions/user${q({ id })}`);
export const pendingSanctions = () => get<{ sanctions: StaffSanction[] }>('/api/admin/sanctions/pending').then((r) => r.sanctions);
/** The body is lib/sanction-format applyBody; a device ban comes back as one sanction per device. */
export const applySanction = (body: ApplyBody) => post<{ sanctions: StaffSanction[] }>('/api/admin/sanctions', body).then((r) => r.sanctions);
export const liftSanction = (id: number, reason: string) => post<{ sanction: StaffSanction }>('/api/admin/sanctions/lift', { id, reason }).then((r) => r.sanction);
export const approveSanction = (id: number, approve: boolean, note: string) => post<{ sanction: StaffSanction }>('/api/admin/sanctions/approve', { id, approve, note }).then((r) => r.sanction);
export const addEvidence = (id: number, kind: 'note' | 'link', content: string) => post<{ evidence: { id: number } }>('/api/admin/sanctions/evidence', { id, kind, content });
export const appeals = (status: 'open' | 'decided') => get<{ appeals: StaffAppeal[] }>(`/api/admin/appeals${q({ status })}`).then((r) => r.appeals);
/** minutes: the new total length from the sanction's start (outcome reduced only). */
export const decideAppeal = (id: number, outcome: AppealOutcome, note: string, minutes?: number) =>
  post<{ appeal: SanctionAppeal; sanction: StaffSanction }>('/api/admin/appeals/decide', { id, outcome, note, ...(outcome === 'reduced' ? { minutes } : {}) });
export const savePolicy = (reason: string, steps: { type: SanctionType; minutes: number | null; auto: boolean; requiresApproval: boolean }[], windowDays: number) =>
  post<{ policies: SanctionPolicy[] }>('/api/admin/sanction-policies', { reason, steps, windowDays }).then((r) => r.policies);
export const sanctionPerms = (user: string) => get<SanctionPerms>(`/api/admin/sanction-permissions${q({ user })}`);
export const setSanctionPerm = (user: string, permission: string, grant: boolean) =>
  post<{ permissions: string[] }>('/api/admin/sanction-permissions', { user, permission, grant }).then((r) => r.permissions);
export const reviewDevice = (device: number, status: DeviceRisk, note: string) => post<{ device: SanctionDevice }>('/api/admin/devices/risk', { device, status, note }).then((r) => r.device);
