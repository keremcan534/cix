// Ajans seviyeleri (owners, 24 Nov 2026) as the server says it (server/api/agency-levels.mjs levelView, the overview's
// `level`): this week's diamonds and active streamers, the level they give now, the next one, the new-agency days and
// last week's level. A level the owners keep out of the app (Gönül Bağı, Başlangıç) comes without its name. Pure, so
// the node tests load it.

export type LevelRef = { name: string | null; rate: number };
export type AgencyLevel = {
  week: string;
  base: number;
  active: number;
  minActive: number;
  activeUsd: number;
  level: LevelRef;
  reason: 'new' | 'threshold' | 'active';
  /** A higher level whose diamonds were reached, held back by too few active streamers. */
  reached: LevelRef | null;
  next: (LevelRef & { from: number; left: number }) | null;
  isNew: boolean;
  newUntil: string | null;
  last: (LevelRef & { week: string; base: number; active: number }) | null;
};

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const whole = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);
const rateOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);
const nameOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 30) : null);
function ref(v: unknown): LevelRef | null {
  const r = obj(v);
  const rate = r ? rateOf(r.rate) : null;
  return r && rate !== null ? { name: nameOf(r.name), rate } : null;
}

/** The server's answer, or null when it is none or malformed (the card then stays hidden). */
export function parseAgencyLevel(raw: unknown): AgencyLevel | null {
  const r = obj(raw);
  if (!r) return null;
  const base = whole(r.base);
  const active = whole(r.active);
  const minActive = whole(r.minActive);
  const activeUsd = whole(r.activeUsd);
  const level = ref(r.level);
  if (typeof r.week !== 'string' || base === null || active === null || minActive === null || activeUsd === null || !level) return null;
  const reason = r.reason === 'new' || r.reason === 'active' ? r.reason : 'threshold';
  const n = obj(r.next);
  const nextRef = ref(r.next);
  const from = n ? whole(n.from) : null;
  const left = n ? whole(n.left) : null;
  const l = obj(r.last);
  const lastRef = ref(r.last);
  return {
    week: r.week,
    base,
    active,
    minActive,
    activeUsd,
    level,
    reason,
    reached: ref(r.reached),
    next: nextRef && from !== null && left !== null ? { ...nextRef, from, left } : null,
    isNew: r.isNew === true,
    newUntil: typeof r.newUntil === 'string' ? r.newUntil : null,
    last: l && lastRef && typeof l.week === 'string' ? { ...lastRef, week: l.week, base: whole(l.base) ?? 0, active: whole(l.active) ?? 0 } : null,
  };
}

const n = (x: number) => x.toLocaleString('tr-TR');
export const pctText = (r: number) => `%${(Math.round(r * 10_000) / 100).toLocaleString('tr-TR')}`;
/** "Bronz · %60", or "%35" for a level the app doesn't name. */
export const levelText = (l: LevelRef) => (l.name ? `${l.name} · ${pctText(l.rate)}` : pctText(l.rate));

/** The card's sentences, in order. `date` formats the new-agency end. */
export function levelLines(v: AgencyLevel, date: (iso: string) => string): string[] {
  const out: string[] = [];
  if (v.isNew) {
    out.push(`Yeni ajans: ${v.newUntil ? `${date(v.newUntil)} tarihine kadar` : 'ilk haftalarında'} komisyonun sabit ${pctText(v.level.rate)}; elmas ve yayıncı şartı aranmaz.`);
  } else {
    out.push(`Bu hafta yayıncıların ${n(v.base)} elmas kazandı; ${n(v.active)} aktif yayıncı (haftada en az ${n(v.activeUsd)} USD kazanan).`);
    if (v.reason === 'active' && v.reached)
      out.push(`${v.reached.name ? `${v.reached.name} (${pctText(v.reached.rate)})` : pctText(v.reached.rate)} için elmas eşiğine ulaştın; ${n(v.minActive)} aktif yayıncı şartı tutunca o seviyeye geçersin (${n(Math.max(0, v.minActive - v.active))} yayıncı daha).`);
    if (v.next) out.push(`${n(v.next.left)} elmas daha kazanılırsa ${v.next.name ? `${v.next.name} (${pctText(v.next.rate)})` : pctText(v.next.rate)}.`);
    else out.push('En yüksek seviyedesin.');
  }
  out.push('Seviye her Pazartesi 00:00’da (Türkiye) o haftanın elmasıyla kesinleşir; hafta içinde komisyon en alt orandan yazılır, farkı hafta kapanınca tek satırda eklenir.');
  if (v.last) out.push(`Geçen hafta: ${levelText(v.last)}.`);
  return out;
}
