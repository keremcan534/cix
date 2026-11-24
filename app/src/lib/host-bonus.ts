// Yayıncı haftalık bonusu (owners, 24 Nov 2026): an agency's streamer gets, every Monday 00:00 Türkiye time, the bonus
// of the highest tier their week's earned diamonds reached, in diamonds (server/api/host-bonus.mjs). Live: the
// server's answer (GET /api/wallet/host-bonus; its tiers are Canlı ayarlar); the demo counts its own week with the
// compiled tiers. Pure, so the node tests load it.

export type BonusTier = { from: number; bonus: number };

/** The owners' table (server/api/host-bonus-rules.mjs HOST_BONUS_TIERS; tests/host-bonus.test.ts keeps them equal). */
export const HOST_BONUS_TIERS: readonly BonusTier[] = [
  { from: 10_000, bonus: 5_000 },
  { from: 20_000, bonus: 10_000 },
  { from: 40_000, bonus: 20_000 },
  { from: 70_000, bonus: 35_000 },
  { from: 100_000, bonus: 50_000 },
  { from: 140_000, bonus: 70_000 },
  { from: 200_000, bonus: 100_000 },
  { from: 300_000, bonus: 150_000 },
  { from: 500_000, bonus: 250_000 },
  { from: 1_000_000, bonus: 500_000 },
  { from: 2_000_000, bonus: 1_000_000 },
  { from: 5_000_000, bonus: 2_500_000 },
];

/** What the card shows: this week so far, the tier reached, the next one, and last week's bonus. */
export type HostBonus = {
  on: boolean;
  /** An agency's streamer or a yönetim yayıncısı (no agency after her first days): the bonus is theirs. */
  eligible: boolean;
  kind: 'agency' | 'management' | null;
  earned: number;
  tier: BonusTier | null;
  next: (BonusTier & { left: number }) | null;
  last: { week: string; bonus: number; reversed: boolean } | null;
};

/** The tier `earned` reaches (the highest whose `from` it meets), or null below the first. */
export function tierOf(earned: number, tiers: readonly BonusTier[] = HOST_BONUS_TIERS): BonusTier | null {
  let hit: BonusTier | null = null;
  for (const t of tiers) if (earned >= t.from) hit = t;
  return hit;
}

/** The next tier above `earned`, with the diamonds still to earn, or null at the top. */
export function nextTierOf(earned: number, tiers: readonly BonusTier[] = HOST_BONUS_TIERS) {
  const t = tiers.find((x) => x.from > earned);
  return t ? { ...t, left: t.from - earned } : null;
}

const whole = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const tierFrom = (v: unknown): BonusTier | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const from = whole(r.from);
  const bonus = whole(r.bonus);
  return from !== null && bonus !== null && from > 0 ? { from, bonus } : null;
};

/** The server's answer, or null when it is not one (the card then stays hidden). */
export function parseHostBonus(raw: unknown): HostBonus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const earned = whole(r.earned);
  if (typeof r.on !== 'boolean' || typeof r.eligible !== 'boolean' || earned === null) return null;
  const kind = r.kind === 'agency' || r.kind === 'management' ? r.kind : null;
  const tier = r.tier === null || r.tier === undefined ? null : tierFrom(r.tier);
  const nextTier = r.next === null || r.next === undefined ? null : tierFrom(r.next);
  const left = r.next && typeof r.next === 'object' ? whole((r.next as Record<string, unknown>).left) : null;
  const l = r.last && typeof r.last === 'object' ? (r.last as Record<string, unknown>) : null;
  const lastBonus = l ? whole(l.bonus) : null;
  return {
    on: r.on,
    eligible: r.eligible,
    kind,
    earned,
    tier,
    next: nextTier && left !== null ? { ...nextTier, left } : null,
    last: l && typeof l.week === 'string' && lastBonus !== null ? { week: l.week, bonus: lastBonus, reversed: l.reversed === true } : null,
  };
}

/** The demo's card: its own week's diamonds with the compiled tiers; `agency` in one, `held` past her days to pick one. */
export function demoHostBonus(earned: number, agency: boolean, held: boolean): HostBonus {
  const n = Math.max(0, Math.floor(earned));
  const kind = agency ? 'agency' : held ? 'management' : null;
  return { on: true, eligible: kind !== null, kind, earned: n, tier: tierOf(n), next: nextTierOf(n), last: null };
}
