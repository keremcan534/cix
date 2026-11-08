// Client for the agency network on our server (server/api/agency.mjs and agency-admin.mjs, docs/AJANS_HIYERARSI.md):
// top and sub agencies, streamers, the commission ledger, performance tiers, payouts, transfers and the centre's
// management. Every rule and every amount is decided by the server; the screens only show what it returns.
//
// A build without a server address shows a labelled example dataset (data/agency-net-demo) with actions disabled.
// A live build never does: when its server cannot be reached the panels say so and offer a retry.
import { useCallback, useEffect, useRef, useState } from 'react';

import { displayId } from '@/data/profile';
import { AGENCY_LEDGER_LABEL } from '@/lib/admin-format';
import { ApiError, apiEnabled, apiRequest, discover, ensureSignedIn, followingList, newRef } from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { refusalTitle } from '@/lib/contact-filter';
import { parseInviteInput, pickByPublicId } from '@/lib/invite-target';

// --- Types (mirroring the server's responses) ---------------------------------------------------------------
export type AgencyStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'closed';
export type Viewer = 'owner' | 'staff' | 'parent' | 'center' | 'bd';
export type Named = { id: string; name: string };

export type AgencyCard = {
  id: string;
  code: string;
  name: string;
  level: number;
  status: AgencyStatus;
  parentId: string | null;
  tier: string | null;
  tierName: string | null;
  country: string | null;
  region: string | null;
  createdAt: string;
  approvedAt: string | null;
};
export type MyAgency = AgencyCard & { viewer: Viewer | null; perms: string[] };

export type Upcoming = { effectiveFrom: string; rate: number; tier: string | null; source: string; reason: string | null };
/** Commission rates of an agency now: its own rate, the parent's difference share, the total and the pool cap. */
export type RateView = { rate: number; parentShare: number; total: number; poolCap: number; upcoming: Upcoming | null };
export type Balances = { earned: number; paid: number; in_payout: number; available: number; calculating: number; direct: number; difference: number; transition: number; pending: number };

export type NextTier = { key: string; name: string; subRate: number; needScore: number; needActive: number; needOvertake: boolean; periodsInRow: number };
export type TierChange = 'up' | 'down' | 'same' | 'held' | 'waiting';
export type Perf = {
  runId: number;
  asOf: string;
  score: number;
  rank: number | null;
  parentScore: number | null;
  overtakes: boolean;
  change: TierChange;
  streak: number;
  flags: string[];
  metrics: Record<string, number>;
  normalized: Record<string, number>;
  qualifiedTier: string | null;
  next: NextTier | null;
};
export type Tier = { key: string; name: string; min_score: number; sub_rate: number; min_active: number; overtake: boolean };

export type TransferKind = 'streamer_move' | 'streamer_leave' | 'independence' | 'change_parent' | 'sub_close';
export type TransferStatus = 'pending' | 'completed' | 'rejected' | 'cancelled';
export type Transfer = {
  id: number;
  kind: TransferKind;
  status: TransferStatus;
  streamer: Named | null;
  agency: Named | null;
  from: Named | null;
  to: Named | null;
  needs: string[];
  approvals: Record<string, { by: string; at: string; approve?: boolean; mode?: string }>;
  mode: 'free' | 'paid' | null;
  fee: number;
  feeRule: { base: number; rate: number; threshold: number; fee: number; payer: string; account: string; rule: string } | null;
  transition: { rate: number; endsAt: string; scope: string } | null;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  myParty?: string[];
};

export type Notice = { id: number; kind: string; title: string; body: string; createdAt: string };

export type Overview = {
  agency: AgencyCard;
  owner: Named | null;
  viewer: Viewer;
  perms: string[];
  counts: { streamers: number; active: number; subs: number; active_subs: number; pending_subs: number; sub_streamers: number; pending_requests: number; pending_transfers: number };
  rate: RateView;
  earnings: {
    today: number;
    week: number;
    month: number;
    prev_month: number;
    direct30: number;
    difference30: number;
    transition30: number;
    balances: Balances;
    usd: { month: number; available: number };
  } | null;
  performance: Perf | null;
  parent: { id: string; name: string; score: number | null } | null;
  request: Transfer | null;
  notices: Notice[];
  tiers: Tier[];
  poolCap: number;
};

export type Streamer = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  agencyId: string;
  joinedAt: string;
  method: string;
  contract: string | null;
  verified: boolean;
  diamonds30: number;
  usd30: number;
  /** Diamonds this week and this month (Turkey's calendar, since joining this agency). */
  week: number;
  month: number;
  onlineHours30: number;
  active: boolean;
  agencyName: string;
};

export type Periods = { day: number; week: number; month: number };

export type SubAgency = AgencyCard & {
  owner: string | null;
  pendingWith: string | null;
  streamers: number;
  active: number;
  volume30: number;
  earned30: number | null;
  mine30: number;
  /** Today, this week and this month: the gifts its streamers received, and the commission that passed to me. */
  gifts: Periods;
  mine: Periods;
  rate: number | null;
  parentShare: number | null;
  upcoming: Upcoming | null;
  payoutStatus: string | null;
  score: number | null;
  overallRank: number | null;
  overtakes: boolean;
  next: NextTier | null;
  rank: number | null;
};

export type LedgerKind = 'direct' | 'difference' | 'transition' | 'transfer_fee' | 'adjustment' | 'reversal' | 'bd';
export type LedgerRow = {
  id: number;
  kind: LedgerKind;
  amount: number;
  rate: number;
  period: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  note: string | null;
  txn: string | null;
  streamer: Named | null;
  sourceAgency: Named | null;
  base: number | null;
  incomeType: string | null;
  totalRate: number | null;
  subRate: number | null;
  parentRate: number | null;
  subAmount: number | null;
  parentAmount: number | null;
  transitionAmount: number | null;
  poolCap: number | null;
  ruleVersion: string | null;
  occurredAt: string | null;
  calculatedAt: string | null;
};
export type LedgerTotals = { direct: number; difference: number; transition: number; fees: number; adjustments: number };

export type PerfHistory = { runId: number; asOf: string; score: number; rank: number | null; tier: string | null; tierName: string | null; change: TierChange; overtakes: boolean; volume: number; orgVolume: number; active: number };
export type TierHistory = { from: string | null; fromName: string | null; to: string; toName: string | null; fromRate: number | null; toRate: number; effectiveFrom: string; source: string; reason: string | null; at: string };
export type RateHistory = { rate: number; parentFloor: number | null; tier: string | null; source: string; effectiveFrom: string; reason: string | null };
export type SubScore = { id: string; name: string; score: number; overallRank: number | null; rank: number; overtakes: boolean; tier: string | null; tierName: string | null; change: TierChange; active: number; volume: number };
export type Performance = {
  latest: Perf | null;
  history: PerfHistory[];
  tierHistory: TierHistory[];
  rateHistory: RateHistory[];
  subagencies: SubScore[];
  weights: Record<string, number>;
  tiers: Tier[];
};

export type Report = {
  volume: { bucket: string; direct: number; org: number }[];
  joins: { bucket: string; count: number }[];
  earnings: { bucket: string; direct: number; difference: number; transition: number; total: number }[];
};

/** Someone "Yayıncı davet et" can invite; `agency`: 'this' or 'other' when they already belong to one. */
export type Invitee = { id: string; name: string; username: string | null; avatarUrl: string | null; agency: 'this' | 'other' | null };
export type JoinRequest = { id: number; kind: 'invite' | 'join'; method: string; status: string; user: { id: string; name: string; username: string | null }; note: string | null; createdAt: string; decidedAt: string | null };
export type StaffRole = { id: number; name: string; permissions: string[] };
export type StaffMember = { user: Named; roleId: number | null; role: string | null; extra: string[]; denied: string[]; perms: string[]; since: string };
export type Payout = {
  id: number;
  amount: number;
  usd: number;
  currency: string;
  status: string;
  statusLabel: string;
  requestedAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  paymentRef: string | null;
  note: string | null;
  history?: { from: string | null; to: string; note: string | null; at: string }[];
};
export type Payouts = { balances: Balances; policy: { min_diamonds: number; currencies: string[]; two_person: boolean }; payouts: Payout[] };

export type Me = {
  membership: { agency: { id: string; name: string; code: string; level: number; parentName: string | null }; joinedAt: string; method: string } | null;
  requests: { id: number; kind: 'invite' | 'join'; method: string; agency: { id: string; name: string; code: string }; note: string | null; createdAt: string }[];
  transfer: Transfer | null;
  agencies: MyAgency[];
  platform: string[];
  /** The streamer rules for this account (server agency-ops.mjs streamerState); older servers send none. */
  streamer?: { eligible: boolean; gender: string | null; held: boolean; pickUntil: string | null; pickDays: number; canLeave: boolean; womenOnly: boolean };
};

// --- Centre (platform) types ----------------------------------------------------------------------------------
export type TreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  level: number;
  status: AgencyStatus;
  owner: string | null;
  tier: string | null;
  tierName: string | null;
  streamers: number;
  volume30: number;
  orgVolume30: number;
  earned30: number;
  rate: number | null;
  parentShare: number | null;
  upcoming: Upcoming | null;
  score: number | null;
  rank: number | null;
  overtakes: boolean;
  flags: string[];
  bd: string | null;
};
export type AdminOverview = {
  tops: number;
  subs: number;
  suspended: number;
  pending: number;
  streamers: number;
  base30: number;
  commission30: number;
  bd30: number;
  payouts_open: number;
  payouts_open_count: number;
  transfers_waiting: number;
  appeals_open: number;
  calc_pending: number;
  usd: { base30: number; commission30: number };
  poolCap: number;
};
export type AdminAgency = {
  id: string;
  code: string;
  name: string;
  level: number;
  status: AgencyStatus;
  pendingWith: string | null;
  parent: Named | null;
  owner: Named | null;
  country: string | null;
  region: string | null;
  contact: { name: string | null; phone: string | null; email: string | null } | null;
  expectedStreamers: number | null;
  description: string | null;
  tier: string | null;
  tierName: string | null;
  createdAt: string;
};
export type SettingRecord = { id: number; key: string; value: unknown; reason: string; created_at: string; set_by: string | null };
export type AdminSettings = { values: Record<string, unknown>; defaults: Record<string, unknown>; criteria: string[]; incomeTypes: string[]; history: SettingRecord[] };
export type PerfRun = { id: number; asOf: string; windowFrom: string; effectiveFrom: string; dryRun: boolean; cadenceKey: string; runBy: string | null; note: string | null };
export type AdminScore = {
  agencyId: string;
  name: string;
  level: number;
  parent: Named | null;
  score: number;
  rank: number | null;
  parentScore: number | null;
  overtakes: boolean;
  qualified: string | null;
  current: string | null;
  assigned: string | null;
  assignedName: string | null;
  change: TierChange;
  streak: number;
  flags: string[];
  metrics: Record<string, number>;
  normalized: Record<string, number>;
};
export type AdminPayout = Payout & { agency: { id: string; name: string; code: string; status: AgencyStatus }; requestedBy: string | null; approvedBy: string | null };
export type AuditRow = { id: number; actor: Named | null; action: string; targetType: string; targetId: string; before: unknown; after: unknown; result: string; reason: string | null; at: string };
export type Simulation = { base: number; poolCap: number; totalRate: number; pool: number; shares: { agency: string; kind: string; rate: number; amount: number }[]; platformKeeps: number; usd: { base: number; pool: number } };

// --- Client ---------------------------------------------------------------------------------------------------
const qs = (p: Record<string, string | number | undefined | null>) => {
  const e = Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};
const get = <T>(path: string, p: Record<string, string | number | undefined | null> = {}) => apiRequest<T>('GET', `${path}${qs(p)}`);
const post = <T = { ok: boolean }>(path: string, body: object) => apiRequest<T>('POST', path, body);

export const agencyNet = {
  // Streamer side
  me: () => get<Me>('/api/agency/me'),
  lookup: (code: string) => get<{ agency: { id: string; name: string; code: string; level: number; parentName: string | null } }>('/api/agency/lookup', { code }).then((r) => r.agency),
  join: (code: string, method: 'code' | 'link' | 'application', note?: string) => post<{ request?: { id: number; status: string }; membership?: { agency: { id: string; name: string; code: string } }; sameDevice?: boolean }>('/api/agency/join', { code, method, note }),
  respond: (requestId: number, accept: boolean) => post('/api/agency/requests/respond', { requestId, accept }),
  cancelRequest: (requestId: number) => post('/api/agency/requests/cancel', { requestId }),
  transfer: (toCode: string | null, reason: string) => post<{ transfer: Transfer }>('/api/agency/transfer', { ...(toCode ? { toCode } : {}), reason, ref: newRef() }),
  apply: (b: { name: string; parentCode?: string; country?: string; region?: string; contactName?: string; contactPhone?: string; expectedStreamers?: number; description?: string }) => post<{ agency: AgencyCard }>('/api/agency/apply', b),

  // Agency panel
  overview: (id: string) => get<Overview>('/api/agency/overview', { id }),
  streamers: (id: string, scope: 'direct' | 'sub' = 'direct') => get<{ streamers: Streamer[] }>('/api/agency/streamers', { id, scope }).then((r) => r.streamers),
  subagencies: (id: string) => get<{ subagencies: SubAgency[]; nearPromotion: string[] }>('/api/agency/subagencies', { id }),
  commissions: (id: string, f: { from?: string; to?: string; kind?: string; sub?: string; streamer?: string } = {}) => get<{ rows: LedgerRow[]; totals: LedgerTotals }>('/api/agency/commissions', { id, ...f }),
  commissionsCsv: (id: string, f: { from?: string; to?: string } = {}) => get<{ csv: string; rows: number }>('/api/agency/commissions', { id, ...f, format: 'csv' }),
  performance: (id: string) => get<Performance>('/api/agency/performance', { id }),
  report: (id: string, group: 'day' | 'week' | 'month' = 'week') => get<Report>('/api/agency/report', { id, group }),
  requests: (id: string) => get<{ requests: JoinRequest[] }>('/api/agency/requests', { id }).then((r) => r.requests),
  /** The server finds the streamer by account id (`user`) or by username. */
  invite: (id: string, to: { user: string } | { username: string }, note?: string) => post('/api/agency/invite', { id, ...to, note }),
  /** Whom to invite: people found by name or username (at most 20; 2 letters at least). */
  inviteSearch: (id: string, q: string) => get<{ users: Invitee[] }>('/api/agency/invite/search', { id, q }).then((r) => r.users),
  decideRequest: (id: string, requestId: number, approve: boolean, note?: string) => post('/api/agency/requests/decide', { id, requestId, approve, note }),
  staff: (id: string) => get<{ staff: StaffMember[]; roles: StaffRole[]; catalog: Record<string, string> }>('/api/agency/staff', { id }),
  setStaff: (id: string, user: string, roleId: number | null) => post('/api/agency/staff/set', { id, user, roleId }),
  removeStaff: (id: string, user: string) => post('/api/agency/staff/remove', { id, user }),
  payouts: (id: string) => get<Payouts>('/api/agency/payouts', { id }),
  requestPayout: (id: string, currency: string) => post('/api/agency/payouts/request', { id, currency, ref: newRef() }),
  cancelPayout: (id: string, payoutId: number) => post('/api/agency/payouts/cancel', { id, payoutId }),
  transfers: (id: string) => get<{ transfers: Transfer[] }>('/api/agency/transfers', { id }).then((r) => r.transfers),
  approveTransfer: (id: string, transferId: number, approve: boolean, mode?: 'free' | 'paid', note?: string) => post('/api/agency/transfers/approve', { id, transferId, approve, mode, note }),
  independence: (id: string, reason: string) => post<{ transfer: Transfer }>('/api/agency/independence', { id, reason, ref: newRef() }),
  changeParent: (id: string, toCode: string, reason: string) => post<{ transfer: Transfer }>('/api/agency/change-parent', { id, toCode, reason, ref: newRef() }),
  closeSub: (id: string, reason: string) => post<{ transfer: Transfer }>('/api/agency/sub/close', { id, reason, ref: newRef() }),
  appeal: (id: string, subject: 'tier' | 'commission' | 'transfer' | 'other', body: string) => post('/api/agency/appeal', { id, subject, body }),
  notices: (id: string) => get<{ notices: Notice[] }>('/api/agency/notices', { id }).then((r) => r.notices),
};

export const centerNet = {
  tree: () => get<{ nodes: TreeNode[]; poolCap: number; topRate: number }>('/api/admin/agency/tree'),
  overview: () => get<AdminOverview>('/api/admin/agency/overview'),
  list: (f: { status?: string; pendingWith?: string; q?: string } = {}) => get<{ agencies: AdminAgency[] }>('/api/admin/agency/list', f).then((r) => r.agencies),
  decide: (id: string, approve: boolean, note: string) => post('/api/admin/agency/decide', { id, approve, note }),
  /** A new agency, approved at once (agencies.manage): a top agency, or a sub agency under `parentId`. */
  create: (b: { name: string; owner?: string; parentId?: string }) =>
    post<{ agency: { id: string; code: string; name: string; level: number; status: AgencyStatus } }>('/api/admin/agency/create', b),
  /** Links a streamer to an agency (or, without one, ends their membership) with a written reason. */
  assign: (b: { streamer: string; agencyId?: string; reason: string }) => post<{ agencyId: string | null }>('/api/admin/agency/assign', b),
  setStatus: (id: string, status: 'suspended' | 'approved' | 'closed', reason: string) => post('/api/admin/agency/status', { id, status, reason }),
  setRate: (id: string, rate: number, reason: string, effectiveFrom?: string) => post('/api/admin/agency/rate', { id, rate, reason, effectiveFrom }),
  setTier: (id: string, tier: string, reason: string, effectiveFrom?: string) => post('/api/admin/agency/tier', { id, tier, reason, effectiveFrom }),
  settings: () => get<AdminSettings>('/api/admin/agency/settings'),
  saveSetting: (key: string, value: unknown, reason: string) => post('/api/admin/agency/settings', { key, value, reason }),
  runPerformance: (dryRun: boolean, note: string) => post<{ rows: unknown[]; effectiveFrom: string }>('/api/admin/agency/performance/run', { dryRun, note }),
  performance: (runId?: number) => get<{ runs: PerfRun[]; runId: number | null; scores: AdminScore[] }>('/api/admin/agency/performance', { runId }),
  payouts: (status?: string) => get<{ payouts: AdminPayout[] }>('/api/admin/agency/payouts', { status }).then((r) => r.payouts),
  decidePayout: (payoutId: number, action: 'approve' | 'pay' | 'reject' | 'cancel', note: string, paymentRef?: string) => post('/api/admin/agency/payouts/decide', { payoutId, action, note, paymentRef }),
  transfers: (status?: string) => get<{ transfers: Transfer[] }>('/api/admin/agency/transfers', { status }).then((r) => r.transfers),
  decideTransfer: (transferId: number, approve: boolean, note: string, transition?: { rate: number; days: number; scope: 'existing' | 'all' }) =>
    post('/api/admin/agency/transfers/decide', { transferId, approve, note, ...(transition ? { transition } : {}) }),
  audit: (f: { type?: string; target?: string } = {}) => get<{ rows: AuditRow[] }>('/api/admin/agency/audit', f).then((r) => r.rows),
  simulate: (b: { base: number; agencyId?: string; subRate?: number; tier?: string }) => post<Simulation>('/api/admin/agency/simulate', b),
};

// --- Loading with the example-data fallback --------------------------------------------------------------------
/** The server cannot answer at all (vs. a real refusal such as 403, which is shown as it is). */
export function unavailable(e: unknown) {
  if (e instanceof TypeError) return true; // fetch: offline, DNS, CORS
  if (!(e instanceof ApiError)) return false;
  if (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504) return true;
  // An older server without the agency routes answers its generic 404.
  return e.status === 404 && e.message === 'Bulunamadı';
}
export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Beklenmeyen hata');

/** `forbidden`: the server refused with 403 (no right to this screen), so the screen shows one "no access" state. */
export type Loaded<T> = { data: T | null; demo: boolean; error: string | null; forbidden: boolean; loading: boolean; reload: () => void };
const NO_SERVER = 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.';

/**
 * Loads `load()` from the server as the signed-in user. Without a server address `demo()` is shown with demo = true
 * (the screen labels it and disables actions); in a live build an unreachable server is an error with a retry, never
 * example data. `deps` reloads when they change.
 */
export function useNet<T>(name: string, load: () => Promise<T>, demo: () => T, deps: unknown[] = []): Loaded<T> {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([name, tick, ...deps]);
  const [res, setRes] = useState<{ key: string; data: T | null; demo: boolean; error: string | null; forbidden: boolean } | null>(null);
  const fns = useRef({ load, demo });
  useEffect(() => {
    fns.current = { load, demo };
  });
  useEffect(() => {
    let live = true;
    (async () => {
      const { load: l, demo: d } = fns.current;
      if (!apiEnabled()) return { data: d(), demo: true, error: null, forbidden: false };
      try {
        await ensureSignedIn(name);
        return { data: await l(), demo: false, error: null, forbidden: false };
      } catch (e) {
        if (unavailable(e)) return { data: null, demo: false, error: NO_SERVER, forbidden: false };
        return { data: null, demo: false, error: errorText(e), forbidden: e instanceof ApiError && e.status === 403 };
      }
    })().then((r) => live && setRes({ key, ...r }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = !res || res.key !== key;
  // While reloading, the previous data stays on screen (no flash); a previous error does not.
  return { data: res?.data ?? null, demo: res?.demo ?? false, error: loading ? null : (res?.error ?? null), forbidden: !loading && !!res?.forbidden, loading, reload };
}

/**
 * "Yayıncı davet et": `raw` is what the owner typed: the profile ID the app shows ("ID:…"), an account id or a
 * username. The server knows only account ids and usernames, so a profile ID is looked up among the people this
 * phone can list (followed accounts and Keşfet) and, when no one matches, tried as a username. "Kullanıcı
 * bulunamadı" comes back only after both ways found no one.
 */
export async function inviteStreamer(agencyId: string, raw: string, note?: string) {
  const t = parseInviteInput(raw);
  if (!t) throw new ApiError(400, 'Profil ID’sini ya da kullanıcı adını yaz.');
  if (t.kind === 'user') return agencyNet.invite(agencyId, { user: t.id }, note);
  if (t.kind === 'public') {
    const [following, nearby] = await Promise.all([followingList().catch(() => []), discover().catch(() => [])]);
    const hits = pickByPublicId(t.publicId, [...following, ...nearby], displayId);
    if (hits.length === 1) return agencyNet.invite(agencyId, { user: hits[0].id }, note);
  }
  try {
    return await agencyNet.invite(agencyId, { username: t.username }, note);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && t.kind === 'public')
      throw new ApiError(404, 'Kullanıcı bulunamadı. Bu profil ID’si takip ettiklerin ve Keşfet’tekiler arasında yok; yayıncıyı takip edip tekrar dene ya da kullanıcı adını yaz.');
    throw e;
  }
}

/**
 * Live "Yayıncı davet et" search over what the owner typed. A name (as the app shows it) or a username is looked up
 * on the server. A profile ID number has no server lookup (people see their own on their profile and may pass it
 * on), so it is matched among the people this phone can list (followed accounts and Keşfet), else searched as text.
 */
export async function findInvitees(agencyId: string, raw: string): Promise<Invitee[]> {
  const t = parseInviteInput(raw);
  if (!t || t.kind === 'user') return [];
  if (t.kind === 'public') {
    const [following, nearby] = await Promise.all([followingList().catch(() => []), discover().catch(() => [])]);
    const hits = pickByPublicId(t.publicId, [...following, ...nearby], displayId);
    if (hits.length) return hits.map((u) => ({ id: u.id, name: u.name, username: null, avatarUrl: u.avatarUrl ?? null, agency: null }));
  }
  return agencyNet.inviteSearch(agencyId, t.username);
}

/**
 * Runs a server action with feedback: the server's message on refusal, `done` on success, then `after`.
 * In example mode nothing is sent.
 */
export async function runAction(demo: boolean, fn: () => Promise<unknown>, done?: string, after?: () => void) {
  if (demo) {
    showAlert('Örnek veri', 'Sunucuya bağlanılamadığı için bu ekran örnek veri gösteriyor; işlem yapılamaz.');
    return false;
  }
  try {
    await fn();
    if (done) showAlert('Tamam', done);
    after?.();
    return true;
  } catch (e) {
    // A contact refusal (code contact_blocked) reads as the friendly note, under its own title.
    showAlert(unavailable(e) ? 'Sunucuya ulaşılamadı' : refusalTitle(e, 'İşlem yapılmadı'), unavailable(e) ? 'Bağlantını kontrol edip tekrar dene.' : errorText(e));
    return false;
  }
}

// --- Labels and formatting ------------------------------------------------------------------------------------
/** 5000 diamonds = 1 USD (the server's DIAMONDS_PER_USD); shown next to amounts, computed there too. */
export const DIAMONDS_PER_USD = 5000;
export const fmtD = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }));
export const fmtUsd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const usdOf = (diamonds: number) => diamonds / DIAMONDS_PER_USD;
export const fmtPct = (r: number | null | undefined) => (r === null || r === undefined ? '—' : `%${(r * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`);
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtScore = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('tr-TR', { maximumFractionDigits: 1 }));

export const STATUS_TEXT: Record<AgencyStatus, string> = { draft: 'Taslak', pending: 'Onay bekliyor', approved: 'Aktif', rejected: 'Reddedildi', suspended: 'Askıda', closed: 'Kapatıldı' };
export const VIEWER_TEXT: Record<Viewer, string> = { owner: 'Sahip', staff: 'Ekip', parent: 'Üst ajans görünümü', center: 'Merkez görünümü', bd: 'BD görünümü' };
export const LEVEL_TEXT = (level: number) => (level <= 1 ? 'Üst ajans' : 'Alt ajans');
/** Commission ledger kinds as the server writes them (agency_ledger.kind); the words live in lib/admin-format. */
export const KIND_TEXT: Record<string, string> = AGENCY_LEDGER_LABEL;
export const TRANSFER_TEXT: Record<TransferKind, string> = { streamer_move: 'Yayıncı transferi', streamer_leave: 'Ajanstan ayrılma', independence: 'Bağımsızlık', change_parent: 'Üst ajans değişikliği', sub_close: 'Alt ajans kapatma' };
export const TRANSFER_STATUS: Record<TransferStatus, string> = { pending: 'Onay bekliyor', completed: 'Tamamlandı', rejected: 'Reddedildi', cancelled: 'İptal edildi' };
export const PARTY_TEXT: Record<string, string> = { from: 'Mevcut ajans', to: 'Yeni ajans', parent: 'Üst ajans', streamer: 'Yayıncı', center: 'Merkez' };
export const CHANGE_TEXT: Record<TierChange, string> = { up: 'Seviye yükseldi', down: 'Seviye düştü', same: 'Seviye korundu', held: 'Merkez sabitledi', waiting: 'Kesinleşmesi bekleniyor' };
export const FLAG_TEXT: Record<string, string> = { decline: 'Puanı hızlı düştü', low_active: 'Aktif yayıncı az', review: 'İnceleme önerilir', spike: 'Ani hacim artışı (inceleniyor)', overtaken: 'Alt ajansı geçti' };
export const CRITERIA_TEXT: Record<string, string> = {
  volume: 'Hacim',
  active: 'Aktif yayıncı',
  average: 'Yayıncı başı ortalama',
  growth: 'Büyüme',
  retention: 'Yayıncı tutma',
  acquisition: 'Yeni yayıncı',
  operations: 'Operasyon',
  reliability: 'Güvenilirlik',
};
export const SOURCE_TEXT: Record<string, string> = { engine: 'Performans motoru', center: 'Merkez kararı', initial: 'Başlangıç', default: 'Varsayılan', manual: 'Merkez kararı' };
export const INCOME_TEXT: Record<string, string> = { gift: 'Hediye', lucky_gift: 'Şans hediyesi', campaign: 'Kampanya', bonus: 'Bonus', task_reward: 'Görev ödülü', refund: 'İade', other: 'Diğer' };
export const PERM_TEXT: Record<string, string> = {
  'streamers.view': 'Yayıncıları görme',
  'streamers.invite': 'Yayıncı davet etme',
  'streamers.approve': 'Katılım onaylama',
  'subagencies.view': 'Alt ajansları görme',
  'subagencies.manage': 'Alt ajans yönetimi',
  'subagencies.earnings': 'Alt ajans kazançları',
  'reports.performance': 'Performans raporları',
  'reports.commission': 'Komisyon raporları',
  'reports.export': 'Rapor dışa aktarma',
  'payouts.request': 'Ödeme talebi',
  'transfers.manage': 'Transfer işlemleri',
  'staff.manage': 'Ekip yönetimi',
};
