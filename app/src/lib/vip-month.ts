// VIP aylık değerlendirme (owners, 24 Nov 2026; server/api/vip-month.mjs) as the app shows it: the month's points
// against the level's keep amount, what the next level needs, the evaluation date, a missed month, the protection
// period offer; and the table of every level's keep and next-level amounts. Pure, so the node tests load it.

export type VipMonth = {
  active: boolean;
  level: number;
  points: number;
  first: boolean;
  periodLevel: number;
  evalAt: string | null;
  keep: number;
  kept: boolean;
  misses: number;
  next: { level: number; need: number } | null;
  extension: { offered: boolean; price: number; days: number; bought: boolean } | null;
};

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const whole = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** The server's answer, or null when it is none or malformed (the card then stays hidden). */
export function parseVipMonth(raw: unknown): VipMonth | null {
  const r = obj(raw);
  if (!r || typeof r.active !== 'boolean') return null;
  const level = whole(r.level);
  const points = whole(r.points);
  if (level === null || points === null) return null;
  const n = obj(r.next);
  const nl = n ? whole(n.level) : null;
  const need = n ? whole(n.need) : null;
  const x = obj(r.extension);
  const price = x ? whole(x.price) : null;
  const days = x ? whole(x.days) : null;
  return {
    active: r.active,
    level,
    points,
    first: r.first === true,
    periodLevel: whole(r.periodLevel) ?? level,
    evalAt: typeof r.evalAt === 'string' && !Number.isNaN(Date.parse(r.evalAt)) ? r.evalAt : null,
    keep: whole(r.keep) ?? 0,
    kept: r.kept === true,
    misses: whole(r.misses) ?? 0,
    next: nl !== null && need !== null ? { level: nl, need } : null,
    extension: x && price !== null && days !== null ? { offered: x.offered === true, price, days, bought: x.bought === true } : null,
  };
}

/** Each level's keep amount (its own step) and what moving up from it takes (the next level's step). */
export function keepTable(levels: { level: number; xp: number; name: string }[]) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  return sorted.map((l, i) => ({ level: l.level, name: l.name, points: l.xp, keep: l.xp - (i ? sorted[i - 1].xp : 0), next: i + 1 < sorted.length ? sorted[i + 1].xp - l.xp : null }));
}

const n = (x: number) => x.toLocaleString('tr-TR');

/** The card's sentences, in order. `date` formats the evaluation time. */
export function monthLines(m: VipMonth, date: (iso: string) => string): string[] {
  if (!m.active) return m.next ? [`VIP ${m.next.level} için ${n(m.next.need)} puan daha yükle. VIP olduğun ilk ay değerlendirilmez.`] : [];
  const out: string[] = [];
  const when = m.evalAt ? date(m.evalAt) : 'ay sonunda';
  if (m.first) out.push(`VIP olduğun ilk ay: bu ay değerlendirilmez. Bu ayın puanı sonraki aya taşınır ve sonraki ayın sonunda birlikte değerlendirilir.`);
  else if (m.level > m.periodLevel) out.push(`Bu ay VIP ${m.periodLevel} seviyesinden VIP ${m.level} seviyesine yükseldin; ${when} tarihinde yeni seviyen korunur.`);
  else if (m.kept) out.push(`VIP ${m.periodLevel} seviyeni bu ay korudun (${n(m.points)} / ${n(m.keep)} puan).`);
  else out.push(`VIP ${m.periodLevel} seviyesini korumak için ${when} tarihine kadar ${n(Math.max(0, m.keep - m.points))} puan daha yükle (${n(m.points)} / ${n(m.keep)}).`);
  if (m.misses > 0 && !m.kept) out.push('Geçen ay koruma puanı tutmadı: bu ay da tutmazsa VIP statün tamamen sıfırlanır.');
  if (m.next) out.push(`VIP ${m.next.level} için ${n(m.next.need)} puan daha.`);
  out.push('Her ayın 1’i 00:00’da önceki ay değerlendirilir. Koruma puanı yüklenmezse seviye bir düşer; iki ay üst üste tutmazsa VIP sıfırlanır.');
  return out;
}

/** The rule in one line (the VIP page's info panel). */
export const VIP_MONTH_RULE = 'Her ay seviyenin koruma puanını yüklemezsen seviyen bir düşer; iki ay üst üste tutmazsa VIP sıfırlanır.';

/** The demo's month: its own level, nothing loaded this month yet (the demo keeps no months). */
export function demoVipMonth(level: number, xp: number, levels: { level: number; xp: number }[]): VipMonth {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const at = (l: number) => (l <= 0 ? 0 : (sorted.find((x) => x.level === l)?.xp ?? 0));
  const next = sorted.find((x) => x.level === level + 1);
  const d = new Date(Date.now() + 3 * 3_600_000);
  const evalAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 3 * 3_600_000).toISOString();
  return {
    active: level >= 1,
    level,
    points: 0,
    first: false,
    periodLevel: level,
    evalAt: level >= 1 ? evalAt : null,
    keep: level >= 1 ? at(level) - at(level - 1) : 0,
    kept: false,
    misses: 0,
    next: next ? { level: next.level, need: Math.max(0, next.xp - xp) } : null,
    extension: null,
  };
}
