// Coins Bank – mock ledgers for the prototype (bonus credits, agency commission, BD commission).
// Past-period rows are built ONCE at module load with the rules in effect then and are never
// recalculated: a later rule change in the admin panel only affects the open (current) period.
import { AGENCY_MEMBERS } from '@/data/agency';
import { USERS } from '@/data/mock';
import { RULES, settlement } from '@/data/rules';
import { computeBdShares, type BdEarning, type BdRow } from '@/lib/bank';

export const PERIODS = ['Eki 2026 / H4', 'Eki 2026 / H3', 'Eki 2026 / H2', 'Eki 2026 / H1'] as const;
export type Period = (typeof PERIODS)[number];
export const CURRENT_PERIOD: Period = PERIODS[0];
export const PERIOD_RANGE: Record<Period, string> = {
  'Eki 2026 / H4': '19.10 – 25.10.2026',
  'Eki 2026 / H3': '12.10 – 18.10.2026',
  'Eki 2026 / H2': '05.10 – 11.10.2026',
  'Eki 2026 / H1': '28.09 – 04.10.2026',
};

// --- Bonus credits (promotion balance) ------------------------------------------
export type BonusRow = { id: string; ref: string; amount: number; reason: string; time: string; expires?: string; status: 'Aktif' | 'Kullanıldı' | 'Süresi doldu' | 'Düzeltme'; ruleVersion: number };
export const BONUS_LEDGER: BonusRow[] = [
  { id: 'b5', ref: 'BNS-8D1M0D', amount: -300, reason: 'Hediye gönderiminde kullanıldı', time: '20.10.2026', status: 'Kullanıldı', ruleVersion: 1 },
  { id: 'b4', ref: 'BNS-8D1M0C', amount: 500, reason: 'Etkinlik ödülü · Hafta sonu PK', time: '19.10.2026', expires: '19.11.2026', status: 'Aktif', ruleVersion: 1 },
  { id: 'b3', ref: 'BNS-7Q2K1A', amount: 1_000, reason: 'Hoş geldin kampanyası', time: '12.10.2026', expires: '12.11.2026', status: 'Aktif', ruleVersion: 1 },
  { id: 'b2', ref: 'BNS-2Z9P4F', amount: -200, reason: 'Süre sonu ters kaydı (BNS-2Z9P4E)', time: '08.10.2026', status: 'Düzeltme', ruleVersion: 1 },
  { id: 'b1', ref: 'BNS-2Z9P4E', amount: 200, reason: 'Giriş serisi bonusu', time: '01.10.2026', expires: '08.10.2026', status: 'Süresi doldu', ruleVersion: 1 },
];
export const BONUS_BALANCE = BONUS_LEDGER.reduce((s, r) => s + r.amount, 0);

// --- Agency commission ledger (own agency only) ------------------------------------
export type CommissionRow = { id: string; ref: string; period: Period; base: number; rate: number; amount: number; ruleVersion: number; status: 'Bekliyor' | 'Kesinleşti' | 'Ödendi' | 'Düzeltme'; note?: string };
export type MockPayout = { ref: string; period: Period; diamonds: number; status: 'Ödendi' | 'Reddedildi'; time: string; account: string; note?: string };

/** Eligible creator base of the own agency for the open period (gift + call diamonds, platform bonuses excluded). */
export const AGENCY_BASE = AGENCY_MEMBERS.reduce((s, m) => s + m.diamonds, 0);
const PAST_FACTORS = [0.92, 0.85, 0.78]; // H3, H2, H1 relative to the open period

export const AGENCY_PAST: CommissionRow[] = (() => {
  const rows: CommissionRow[] = PERIODS.slice(1).map((period, i) => {
    const base = Math.round(AGENCY_BASE * PAST_FACTORS[i]);
    return {
      id: `ac-${i + 1}`,
      ref: `AGC-${period.slice(-2)}-${String(4100 + i).padStart(4, '0')}`,
      period,
      base,
      rate: RULES.agencyCommission,
      amount: settlement(base, true).commission,
      ruleVersion: RULES.version,
      status: i === 0 ? 'Kesinleşti' : 'Ödendi',
    };
  });
  // A refunded gift in H3 is corrected with a reversal entry, not by editing the original row.
  const refunded = 12_000;
  rows.splice(1, 0, {
    id: 'ac-fix',
    ref: 'AGC-H3-FIX1',
    period: 'Eki 2026 / H3',
    base: -refunded,
    rate: RULES.agencyCommission,
    amount: -Math.round(refunded * RULES.agencyCommission),
    ruleVersion: RULES.version,
    status: 'Düzeltme',
    note: 'İade edilen hediye (GFT-••81) · ters kayıt',
  });
  return rows;
})();

/** The open period is recalculated with the rule in effect now (it isn't settled yet). */
export const agencyCurrentRow = (): CommissionRow => ({
  id: 'ac-0',
  ref: 'AGC-H4-4099',
  period: CURRENT_PERIOD,
  base: AGENCY_BASE,
  rate: RULES.agencyCommission,
  amount: settlement(AGENCY_BASE, true).commission,
  ruleVersion: RULES.version,
  status: 'Bekliyor',
});

const paidRow = (period: Period) => AGENCY_PAST.find((r) => r.period === period && r.status === 'Ödendi')!;
export const AGENCY_PAYOUT_HISTORY: MockPayout[] = [
  { ref: 'PO-AG-0931', period: 'Eki 2026 / H2', diamonds: paidRow('Eki 2026 / H2').amount, status: 'Ödendi', time: '14.10.2026', account: 'IBAN TR33 •••• 4410' },
  { ref: 'PO-AG-0902', period: 'Eki 2026 / H1', diamonds: paidRow('Eki 2026 / H1').amount, status: 'Ödendi', time: '07.10.2026', account: 'IBAN TR33 •••• 4410' },
  { ref: 'PO-AG-0877', period: 'Eki 2026 / H1', diamonds: paidRow('Eki 2026 / H1').amount, status: 'Reddedildi', time: '06.10.2026', account: 'IBAN TR90 •••• 0071', note: 'Hesap sahibi adı eşleşmedi · blokaj çözüldü, yeni hesapla tekrar talep edildi' },
];

// --- BD ↔ agency relationships & BD earnings feed ----------------------------------
export type BdLink = { agencyId: string; contract: string; since: string; status: 'Aktif' | 'Askıda'; mine: boolean; source: string };
export const BD_LINKS: BdLink[] = [
  { agencyId: 'a1', contract: 'BD-2025-014', since: '03.2025', status: 'Aktif', mine: true, source: 'BD davet kodu ile kuruldu' },
  { agencyId: 'a3', contract: 'BD-2026-031', since: '06.2026', status: 'Aktif', mine: true, source: 'BD başvuru formu' },
  { agencyId: 'a2', contract: 'BD-2025-022', since: '11.2025', status: 'Aktif', mine: false, source: 'Başka bir BD' },
];
export const MY_BD_AGENCIES = new Set(BD_LINKS.filter((l) => l.mine).map((l) => l.agencyId));

const AGENCY_SCALE: Record<string, number> = { a1: 240_000, a2: 150_000, a3: 95_000 };
/** Creator earnings of the BD's agencies (eligible base). Ids are stable so the duplicate guard can work. */
export const BD_FEED: BdEarning[] = (() => {
  const feed: BdEarning[] = [];
  PERIODS.forEach((period, p) => {
    Object.entries(AGENCY_SCALE).forEach(([agencyId, scale], a) => {
      for (let i = 0; i < 5; i++) {
        const h = (i * 7 + p * 13 + a * 5) % 9;
        feed.push({
          earningId: `ERN-${period.slice(-2)}-${agencyId}-${i}`,
          agencyId,
          host: USERS[(a * 5 + i) % USERS.length].name,
          diamonds: Math.round(scale * (0.6 + h * 0.1)),
          period,
        });
      }
    });
  });
  // Host transferred a1 → a3 mid-period: the same earning arrives in both agencies' feeds.
  const moved = feed.find((e) => e.earningId === 'ERN-H4-a1-3')!;
  feed.push({ ...moved, agencyId: 'a3', note: 'Ajans transferi · aynı kazanç iki ajansın akışında' });
  // Event re-delivered by the gift service (retry) in a settled period.
  const retried = feed.find((e) => e.earningId === 'ERN-H3-a1-1')!;
  feed.push({ ...retried, note: 'Olay tekrar iletildi (retry)' });
  return feed;
})();

export type BdLedgerRow = BdRow & { status: 'Bekliyor' | 'Kesinleşti' | 'Ödendi' };
/** Settled BD periods (H1–H3), frozen with the BD rate in effect when they were settled. */
export const BD_PAST = (() => {
  const own = BD_FEED.filter((e) => e.period !== CURRENT_PERIOD && MY_BD_AGENCIES.has(e.agencyId));
  // Oldest first, so the original earning wins over a later retry.
  const ordered = [...own].sort((x, y) => PERIODS.indexOf(y.period as Period) - PERIODS.indexOf(x.period as Period));
  const res = computeBdShares(ordered, RULES.bdCommission, RULES.version);
  const rows: BdLedgerRow[] = res.rows.map((r) => ({ ...r, status: r.period === 'Eki 2026 / H3' ? 'Kesinleşti' : 'Ödendi' }));
  return { rows, blocked: res.blocked, seen: res.seen };
})();

/** Open BD period, computed with the current rule; earnings already counted in past periods are excluded. */
export const bdCurrent = () => {
  const own = BD_FEED.filter((e) => e.period === CURRENT_PERIOD && MY_BD_AGENCIES.has(e.agencyId));
  const res = computeBdShares(own, RULES.bdCommission, RULES.version, BD_PAST.seen);
  return { rows: res.rows.map((r): BdLedgerRow => ({ ...r, status: 'Bekliyor' })), blocked: res.blocked };
};
export const BD_HIDDEN_ENTRIES = BD_FEED.filter((e) => !MY_BD_AGENCIES.has(e.agencyId)).length;

const bdPaid = (period: Period) => BD_PAST.rows.filter((r) => r.period === period).reduce((s, r) => s + r.amount, 0);
export const BD_PAYOUT_HISTORY: MockPayout[] = [
  { ref: 'PO-BD-0412', period: 'Eki 2026 / H2', diamonds: bdPaid('Eki 2026 / H2'), status: 'Ödendi', time: '14.10.2026', account: 'Wise · bd@similar.club' },
  { ref: 'PO-BD-0398', period: 'Eki 2026 / H1', diamonds: bdPaid('Eki 2026 / H1'), status: 'Ödendi', time: '07.10.2026', account: 'Wise · bd@similar.club' },
];
