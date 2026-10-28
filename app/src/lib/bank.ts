// Coins Bank – prototype payout engine & audit trail (demo only, no real money moves).
// A tiny module-level store (useSyncExternalStore) that sits next to the app store and keeps the
// finance state the app store doesn't model: payout accounts, blocked amounts, payout statuses,
// a bank ledger of block/release entries and an audit log. Every record carries the rule version
// in effect when it was written; nothing is ever deleted — errors are fixed with reversal entries.
// In production all of this runs server-side (atomic balance + ledger updates, idempotency keys).
// The app only creates and tracks requests; review, approval, rejection and settlement are done by
// the finance team on the separate Finance Control platform.
import { useSyncExternalStore } from 'react';

import { RULES } from '@/data/rules';

export type Scope = 'creator' | 'agency' | 'bd';
export const SCOPE_LABEL: Record<Scope, string> = { creator: 'Yayıncı', agency: 'Ajans', bd: 'BD' };

export const PROVIDERS = ['Payoneer', 'Wise', 'Papara'] as const;
export type Provider = (typeof PROVIDERS)[number];
export type AccountKind = 'bank' | 'provider';
export type VerifyStatus = 'Doğrulanmadı' | 'Doğrulanıyor' | 'Doğrulandı';
export type PayoutAccount = {
  id: string;
  scope: Scope;
  kind: AccountKind;
  holder: string;
  iban?: string;
  provider?: Provider;
  handle?: string;
  status: VerifyStatus;
  created: string;
};

export type Actor = 'Kullanıcı' | 'Sistem';
export type PayoutStatus = 'Manuel inceleme' | 'Onaylandı' | 'Ödendi' | 'Başarısız' | 'Reddedildi';
/** Statuses whose amount is still blocked (reserved) and can't be spent or requested again. */
export const OPEN_STATUSES: PayoutStatus[] = ['Manuel inceleme', 'Onaylandı'];
export type PayoutStep = { label: string; time: string; actor: Actor; note?: string };
export type Payout = {
  id: string;
  ref: string;
  key: string; // idempotency key
  scope: Scope;
  diamonds: number;
  account: { id: string; label: string };
  status: PayoutStatus;
  review: 'Otomatik onay' | 'Manuel inceleme';
  createdTs: number;
  created: string;
  ruleVersion: number;
  steps: PayoutStep[];
  reason?: string;
};

export type EntryKind = 'Blokaj' | 'Blokaj çözüldü' | 'Ödeme çıkışı';
export type BankEntry = { id: string; ref: string; scope: Scope; kind: EntryKind; amount: number; payoutRef: string; time: string; ruleVersion: number };
export type AuditRow = { id: string; ref: string; time: string; actor: Actor; action: string; detail: string; ruleVersion: number };

export type BankState = {
  accounts: Partial<Record<Scope, PayoutAccount>>;
  payouts: Payout[];
  entries: BankEntry[];
  audit: AuditRow[];
  bdView: boolean;
};

let state: BankState = { accounts: {}, payouts: [], entries: [], audit: [], bdView: false };
const listeners = new Set<() => void>();
const emit = (next: BankState) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

export function useBank() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// --- helpers -------------------------------------------------------------------
let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}${(++seq).toString(36).toUpperCase().padStart(2, '0')}`;
const clock = () => {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, '0')).join(':');
};
const fmt = (n: number) => n.toLocaleString('tr-TR');
const auditRow = (actor: Actor, action: string, detail: string, ref: string): AuditRow => ({
  id: nextId('AUD'),
  ref,
  time: clock(),
  actor,
  action,
  detail,
  ruleVersion: RULES.version,
});
const sum = (xs: { diamonds: number }[]) => xs.reduce((s, x) => s + x.diamonds, 0);

export const cleanIban = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const validIban = (raw: string) => /^TR\d{24}$/.test(cleanIban(raw));
export const accountLabel = (a: Pick<PayoutAccount, 'kind' | 'iban' | 'provider' | 'handle'>) =>
  a.kind === 'bank' ? `IBAN ${cleanIban(a.iban ?? '').slice(0, 4)} •••• ${cleanIban(a.iban ?? '').slice(-4)}` : `${a.provider} · ${a.handle}`;

const byScope = (s: BankState, scope: Scope) => s.payouts.filter((p) => p.scope === scope);
export const blockedFor = (s: BankState, scope: Scope) => sum(byScope(s, scope).filter((p) => OPEN_STATUSES.includes(p.status)));
export const paidFor = (s: BankState, scope: Scope) => sum(byScope(s, scope).filter((p) => p.status === 'Ödendi'));
export const rejectedFor = (s: BankState, scope: Scope) => sum(byScope(s, scope).filter((p) => p.status === 'Başarısız' || p.status === 'Reddedildi'));
/**
 * Amount counted against the weekly limit (open + paid requests). A demo session is shorter than a
 * week, so every request of the session counts; the real system uses a rolling 7-day window server-side.
 */
export const weeklyUsedFor = (s: BankState, scope: Scope) => blockedFor(s, scope) + paidFor(s, scope);

// --- payout accounts -------------------------------------------------------------
export type AccountInput = { kind: AccountKind; holder: string; iban?: string; provider?: Provider; handle?: string };

export function saveAccount(scope: Scope, input: AccountInput): string | null {
  const holder = input.holder.trim();
  if (holder.length < 3) return 'Hesap sahibinin adını gir.';
  if (input.kind === 'bank' && !validIban(input.iban ?? '')) return 'Geçerli bir IBAN gir (TR + 24 hane).';
  const handle = (input.handle ?? '').trim();
  if (input.kind === 'provider' && (!input.provider || handle.length < 4)) return 'Sağlayıcıyı seç ve hesap kimliğini (e-posta / hesap no) gir.';
  const prev = state.accounts[scope];
  const acc: PayoutAccount = {
    id: nextId('ACC'),
    scope,
    kind: input.kind,
    holder,
    iban: input.kind === 'bank' ? cleanIban(input.iban ?? '') : undefined,
    provider: input.kind === 'provider' ? input.provider : undefined,
    handle: input.kind === 'provider' ? handle : undefined,
    // A new or changed account always starts unverified (re-verification on every change).
    status: 'Doğrulanmadı',
    created: clock(),
  };
  const row = prev
    ? auditRow('Kullanıcı', 'Ödeme hesabı değiştirildi', `${SCOPE_LABEL[scope]}: ${accountLabel(prev)} → ${accountLabel(acc)} · yeniden doğrulama gerekli`, acc.id)
    : auditRow('Kullanıcı', 'Ödeme hesabı eklendi', `${SCOPE_LABEL[scope]}: ${accountLabel(acc)}`, acc.id);
  emit({ ...state, accounts: { ...state.accounts, [scope]: acc }, audit: [row, ...state.audit] });
  return null;
}

export function verifyAccount(scope: Scope) {
  const acc = state.accounts[scope];
  if (!acc || acc.status !== 'Doğrulanmadı') return;
  emit({
    ...state,
    accounts: { ...state.accounts, [scope]: { ...acc, status: 'Doğrulanıyor' } },
    audit: [auditRow('Kullanıcı', 'Hesap doğrulaması başlatıldı', `${SCOPE_LABEL[scope]}: ${accountLabel(acc)} · ad-soyad eşleşmesi + mikro transfer (demo)`, acc.id), ...state.audit],
  });
  // Demo: the provider confirms shortly after. If the account changed meanwhile, the old check is void.
  setTimeout(() => {
    const cur = state.accounts[scope];
    if (!cur || cur.id !== acc.id || cur.status !== 'Doğrulanıyor') return;
    emit({
      ...state,
      accounts: { ...state.accounts, [scope]: { ...cur, status: 'Doğrulandı' } },
      audit: [auditRow('Sistem', 'Hesap doğrulandı', `${SCOPE_LABEL[scope]}: ${accountLabel(cur)}`, cur.id), ...state.audit],
    });
  }, 1500);
}

// --- payout requests -------------------------------------------------------------
export function validatePayout(s: BankState, scope: Scope, diamonds: number, available: number, legacyWeekly = 0): string | null {
  if (!Number.isInteger(diamonds) || diamonds <= 0) return 'Geçerli bir tutar gir.';
  if (diamonds < RULES.minWithdrawDiamonds) return `Talep başına en az ${fmt(RULES.minWithdrawDiamonds)} 💎 çekebilirsin.`;
  if (diamonds > RULES.maxWithdrawDiamonds) return `Talep başına en fazla ${fmt(RULES.maxWithdrawDiamonds)} 💎 çekebilirsin.`;
  if (diamonds > available) return `Çekilebilir bakiye yetersiz (${fmt(available)} 💎). Ödeme sürecindeki tutarlar bloke edilmiştir.`;
  const used = weeklyUsedFor(s, scope) + legacyWeekly;
  if (used + diamonds > RULES.weeklyWithdrawLimitDiamonds)
    return `Haftalık limit aşılıyor. Bu hafta kalan: ${fmt(Math.max(0, RULES.weeklyWithdrawLimitDiamonds - used))} 💎.`;
  const acc = s.accounts[scope];
  if (!acc) return 'Önce bir ödeme hesabı ekle.';
  if (acc.status !== 'Doğrulandı') return 'Ödeme hesabın doğrulanmadan talep oluşturamazsın.';
  return null;
}

export type CreateResult = { ok: true; payout: Payout; duplicate: boolean } | { ok: false; error: string };

/**
 * Creates a payout request and blocks the amount in the same (atomic) state update.
 * The idempotency key makes repeated taps / retries return the original request instead of a new one.
 */
export function createPayout(input: { scope: Scope; diamonds: number; available: number; key: string; legacyWeekly?: number }): CreateResult {
  const existing = state.payouts.find((p) => p.key === input.key);
  if (existing) return { ok: true, payout: existing, duplicate: true };
  const error = validatePayout(state, input.scope, input.diamonds, input.available, input.legacyWeekly);
  if (error) return { ok: false, error };
  const acc = state.accounts[input.scope]!;
  const auto = input.diamonds < RULES.autoApproveUnderDiamonds;
  const t = clock();
  const ref = nextId('PO');
  const payout: Payout = {
    id: nextId('PAY'),
    ref,
    key: input.key,
    scope: input.scope,
    diamonds: input.diamonds,
    account: { id: acc.id, label: accountLabel(acc) },
    status: auto ? 'Onaylandı' : 'Manuel inceleme',
    review: auto ? 'Otomatik onay' : 'Manuel inceleme',
    createdTs: Date.now(),
    created: t,
    ruleVersion: RULES.version,
    steps: [
      { label: 'Talep oluşturuldu', time: t, actor: 'Kullanıcı', note: `İdempotency anahtarı: ${input.key}` },
      { label: 'Tutar bloke edildi', time: t, actor: 'Sistem', note: `${fmt(input.diamonds)} 💎 aynı bakiye ikinci kez kullanılamaz` },
      auto
        ? { label: 'Otomatik onaylandı', time: t, actor: 'Sistem', note: `${fmt(RULES.autoApproveUnderDiamonds)} 💎 altı` }
        : { label: 'Manuel incelemeye alındı', time: t, actor: 'Sistem', note: `${fmt(RULES.autoApproveUnderDiamonds)} 💎 ve üzeri` },
    ],
  };
  const entry: BankEntry = { id: nextId('ENT'), ref: nextId('TX'), scope: input.scope, kind: 'Blokaj', amount: input.diamonds, payoutRef: ref, time: t, ruleVersion: RULES.version };
  const label = SCOPE_LABEL[input.scope];
  emit({
    ...state,
    payouts: [payout, ...state.payouts],
    entries: [entry, ...state.entries],
    audit: [
      auditRow('Sistem', auto ? 'Ödeme otomatik onaylandı' : 'Manuel incelemeye alındı', `${label} · ${ref}`, ref),
      auditRow('Sistem', 'Tutar bloke edildi', `${label} · ${fmt(input.diamonds)} 💎 · ${entry.ref}`, ref),
      auditRow('Kullanıcı', 'Ödeme talebi oluşturuldu', `${label} · ${fmt(input.diamonds)} 💎 → ${payout.account.label}`, ref),
      ...state.audit,
    ],
  });
  return { ok: true, payout, duplicate: false };
}

export function setBdView(v: boolean) {
  emit({ ...state, bdView: v, audit: [auditRow('Kullanıcı', v ? 'BD görünümü açıldı (demo)' : 'BD görünümü kapatıldı (demo)', 'Kapsam: yalnızca kendi ajansları', 'BD'), ...state.audit] });
}

// --- BD commission engine ----------------------------------------------------------
export type BdEarning = { earningId: string; agencyId: string; host: string; diamonds: number; period: string; note?: string };
export type BdRow = { id: string; agencyId: string; period: string; base: number; rate: number; amount: number; count: number; ruleVersion: number };

/**
 * BD share = agency's eligible creator base (creator diamonds) × rate — never computed on the agency
 * commission. Each earning id produces a BD share exactly once; duplicates (retries, an earning that
 * shows up under two agencies after a transfer) are rejected and reported.
 */
export function computeBdShares(feed: BdEarning[], rate: number, ruleVersion: number, alreadyCounted: Set<string> = new Set()) {
  const seen = new Set(alreadyCounted);
  const blocked: BdEarning[] = [];
  const groups = new Map<string, BdRow>();
  for (const e of feed) {
    if (seen.has(e.earningId)) {
      blocked.push(e);
      continue;
    }
    seen.add(e.earningId);
    const k = `${e.period}|${e.agencyId}`;
    const g = groups.get(k) ?? { id: `BD-${k}`, agencyId: e.agencyId, period: e.period, base: 0, rate, amount: 0, count: 0, ruleVersion };
    g.base += e.diamonds;
    g.count += 1;
    groups.set(k, g);
  }
  const rows = [...groups.values()].map((g) => ({ ...g, amount: Math.round(g.base * rate) }));
  return { rows, blocked, seen };
}
