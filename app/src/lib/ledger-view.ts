// The server's wallet history (GET /api/ledger) as the Gelir and Cüzdan screens show it: which rows are gift
// income, platform payouts or diamonds that left, and the gifts grouped by name with their senders. The rows are
// the server's own (its refs, its times), so support can find any of them. Pure, for node --test.

export type LedgerCurrency = 'coin' | 'diamond' | 'game';
/** One ledger row, as GET /api/ledger sends it (snake_case created_at) and the screens read it. */
export type LedgerEntry = {
  id: number;
  currency: LedgerCurrency;
  amount: number;
  balance: number;
  reason: string;
  ref: string;
  counterparty: string | null;
  channel: string | null;
  createdAt: string;
};
export type RawLedgerRow = Omit<LedgerEntry, 'createdAt' | 'channel'> & { channel?: string | null; created_at: string };

export const toLedgerEntry = (r: RawLedgerRow): LedgerEntry => ({
  id: Number(r.id),
  currency: r.currency,
  amount: Number(r.amount),
  balance: Number(r.balance),
  reason: r.reason,
  ref: r.ref,
  counterparty: r.counterparty ?? null,
  channel: r.channel ?? null,
  createdAt: r.created_at,
});

/** "Hediye alındı: Gül ×25" → { name: 'Gül', count: 25 } (server/api/wallet.mjs giftDiamonds); null for other rows. */
export function giftOfReason(reason: string): { name: string; count: number } | null {
  const m = /^Hediye alındı(?::\s*(.*?))?(?:\s×(\d+))?$/.exec(reason.trim());
  if (!m) return null;
  return { name: m[1]?.trim() || 'Hediye', count: m[2] ? Number(m[2]) : 1 };
}

/** Kazanç Detayları tabs: gift income (Sosyal), diamonds that left or came back from a withdrawal (Elmas
 *  Giderleri), and everything else the platform credited (Sistem Ödülleri). Null for coin and game rows. */
export type IncomeKind = 'social' | 'spend' | 'system';
export function incomeKind(e: LedgerEntry): IncomeKind | null {
  if (e.currency !== 'diamond') return null;
  if (e.amount > 0 && giftOfReason(e.reason)) return 'social';
  if (e.amount < 0 || e.channel === 'cekim') return 'spend';
  return 'system';
}

/** Diamonds that came in (Gelir "Elmas Detayları"), newest first as the server sends them. */
export const diamondIncome = (rows: readonly LedgerEntry[]) => rows.filter((e) => e.currency === 'diamond' && e.amount > 0 && incomeKind(e) !== 'spend');

export type GiftGroup = { name: string; count: number; total: number; senders: [string, number][] };
/** Gift income grouped by gift name (largest first), with the senders who sent each one most often. */
export function groupGifts(rows: readonly LedgerEntry[], topSenders = 3): GiftGroup[] {
  const groups = new Map<string, { count: number; total: number; senders: Map<string, number> }>();
  for (const e of rows) {
    if (incomeKind(e) !== 'social') continue;
    const g = giftOfReason(e.reason)!;
    const cur = groups.get(g.name) ?? { count: 0, total: 0, senders: new Map<string, number>() };
    cur.count += g.count;
    cur.total += e.amount;
    if (e.counterparty) cur.senders.set(e.counterparty, (cur.senders.get(e.counterparty) ?? 0) + 1);
    groups.set(g.name, cur);
  }
  return [...groups.entries()]
    .map(([name, g]) => ({ name, count: g.count, total: g.total, senders: [...g.senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, topSenders) }))
    .sort((a, b) => b.total - a.total);
}

/** Coins added today (local calendar day) according to the server rows. */
export function coinsAddedOn(rows: readonly LedgerEntry[], now: Date = new Date()) {
  const day = now.toDateString();
  return rows.reduce((t, e) => (e.currency === 'coin' && e.amount > 0 && new Date(e.createdAt).toDateString() === day ? t + e.amount : t), 0);
}

/** "6 Kas 14:05": a ledger row's time on this phone's clock. */
export const ledgerTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};
