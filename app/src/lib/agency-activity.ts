// Aday ajans / aktif ajans as the server says it (server/api/agency-activity.mjs, GET /api/agency/overview
// `activity`): the status, the streamers and earners against the rule, this month's new streamers and the month's
// commission cut. Read defensively: an older server sends none, anything malformed is left out (no card shown).
export type AgencyActivity = {
  status: 'candidate' | 'active';
  /** The rule is switched off (Canlı ayarlar: 0 streamers): every agency is active, nothing to show. */
  off: boolean;
  hosts: number;
  earners: number;
  newThisMonth: number;
  /** This month's cut of the agency's own share (0.05 = 5 points); 0 when none. */
  penalty: number;
  need: { hosts: number; earners: number; earnUsd: number; demoteBelow: number; monthlyNew: number; penaltyPct: number };
};

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000 ? v : null);

export function parseAgencyActivity(x: unknown): AgencyActivity | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  const n = (r.need && typeof r.need === 'object' ? r.need : {}) as Record<string, unknown>;
  const nums = [r.hosts, r.earners, r.newThisMonth, n.hosts, n.earners, n.earnUsd, n.demoteBelow, n.monthlyNew, n.penaltyPct].map(count);
  if (r.status !== 'candidate' && r.status !== 'active') return null;
  if (nums.some((v) => v === null)) return null;
  const [hosts, earners, newThisMonth, needHosts, needEarners, earnUsd, demoteBelow, monthlyNew, penaltyPct] = nums as number[];
  const penalty = typeof r.penalty === 'number' && Number.isFinite(r.penalty) && r.penalty >= 0 && r.penalty <= 1 ? r.penalty : 0;
  return { status: r.status, off: r.off === true, hosts, earners, newThisMonth, penalty, need: { hosts: needHosts, earners: needEarners, earnUsd, demoteBelow, monthlyNew, penaltyPct } };
}

/** The sentence under the card: what the agency needs next, or what keeps it active. */
export function activityText(a: AgencyActivity): string {
  if (a.status === 'candidate') {
    const parts = [`${a.need.hosts} yayıncı`];
    if (a.need.earners > 0) parts.push(`bunlardan ${a.need.earners} tanesinin bu ajansta en az ${a.need.earnUsd} USD kazanması`);
    return `Aday ajanssın. Aktif olmak için ${parts.join(' ve ')} gerekir. Komisyonun birikir; aktif olunca ödenebilir.`;
  }
  const keep = `Yayıncı sayın ${a.need.demoteBelow}'nin altına inerse yeniden aday ajans olursun.`;
  return a.need.monthlyNew > 0 ? `${keep} Her ay en az ${a.need.monthlyNew} yeni yayıncı getirmezsen bir sonraki ay komisyonun ${a.need.penaltyPct} puan düşer.` : keep;
}
