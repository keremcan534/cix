// Profil izleri (docs/PROFIL_IZLERI.md, server/api/profile-marks.mjs): 💩 Kaka leaves some dirt on the receiver's
// profile photo for a while (24 hours, Canlı ayarlar) or until someone sends 💧 Su, which costs more. A second Kaka
// starts the time again; Su on a clean photo is a plain gift; someone may refuse marks in Gizlilik ("Profilime iz
// bırakılmasın"), and then the gift sheet says so before anyone taps. Pure: the server's answers read defensively (a
// malformed one shows no mark, never throws), the lines the room and the profile say, and the sheet's rule. The store
// and the screens are lib/mark-store and components/profile-mark; tests/profile-marks.test.ts.

/** What a gift does to a profile: 'leave' a mark of `kind` (for `hours`), or 'clean' it. */
export type GiftMark = { role: 'leave' | 'clean'; kind: string; hours?: number };
/** A mark on someone's photo: its kind, the gift that left it (its badge), until when (ms), on my own profile who. */
export type ProfileMark = { kind: string; gift: string; emoji: string; until: number; from?: { id: string; name: string } | null };
/** A gift packet's (or a send's answer's) `mark`: what that gift just did. */
export type MarkNews = { role: 'leave' | 'clean'; kind: string; gift: string; emoji: string; until?: number; hours?: number; clean?: string | null; again?: boolean };

/** The app's own two gifts' rules (server/api/profile-mark-rules.mjs APP_MARKS; tests/server-catalog.test.ts). */
export const APP_MARKS: Readonly<Record<string, GiftMark>> = Object.freeze({
  k1: Object.freeze({ role: 'leave', kind: 'kaka', hours: 24 }),
  k2: Object.freeze({ role: 'clean', kind: 'kaka' }),
});
/** How long a mark stays when nothing else says (the Canlı ayar's default). */
export const MARK_HOURS = 24;

const KIND = /^[a-z][a-z0-9-]{0,23}$/;
const GIFT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const emojiOf = (x: unknown, fallback: string) => (typeof x === 'string' && x.trim() && x.length <= 16 ? x.trim() : fallback);
const hoursOf = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 168 ? x : undefined);
const timeOf = (x: unknown) => {
  const t = typeof x === 'string' ? Date.parse(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** A catalog gift's `mark` (GET /api/catalog marks=1); null for none or anything malformed. */
export function parseGiftMark(x: unknown): GiftMark | null {
  const m = obj(x);
  if ((m.role !== 'leave' && m.role !== 'clean') || typeof m.kind !== 'string' || !KIND.test(m.kind)) return null;
  const hours = m.role === 'leave' ? hoursOf(m.hours) : undefined;
  return { role: m.role, kind: m.kind, ...(hours ? { hours } : {}) };
}

/** Profil izleri as the catalog says (marks=1): on or off, the hours, each gift's rule. Null from an older server. */
export type MarkRules = { on: boolean; hours: number; gifts: Record<string, GiftMark> };
/**
 * The catalog's `marks` ({ on, hours }) with the rules on its gift list (`list`: entries with `id` and `mark`), or a
 * saved copy's (`gifts` kept on it). Null when the server said nothing (an older one: no marks there).
 */
export function parseMarkRules(raw: unknown, list?: unknown): MarkRules | null {
  const m = obj(raw);
  if (typeof m.on !== 'boolean') return null;
  const hours = typeof m.hours === 'number' && Number.isInteger(m.hours) && m.hours >= 0 && m.hours <= 168 ? m.hours : MARK_HOURS;
  const gifts: Record<string, GiftMark> = {};
  const entries: [unknown, unknown][] = Array.isArray(list) ? list.map((g) => [obj(g).id, obj(g).mark]) : Object.entries(obj(m.gifts));
  for (const [id, mark] of entries) {
    const rule = typeof id === 'string' && GIFT_ID.test(id) ? parseGiftMark(mark) : null;
    if (rule && !Object.hasOwn(gifts, id as string)) gifts[id as string] = rule;
  }
  return { on: m.on, hours, gifts };
}

/** The marks in a look or a profile (`marks`); [] for anything malformed. At most a few, the newest kept per kind. */
export function parseMarks(x: unknown): ProfileMark[] {
  if (!Array.isArray(x)) return [];
  const byKind = new Map<string, ProfileMark>();
  for (const raw of x.slice(0, 20)) {
    const m = obj(raw);
    const until = timeOf(m.until);
    if (typeof m.kind !== 'string' || !KIND.test(m.kind) || typeof m.gift !== 'string' || !GIFT_ID.test(m.gift) || until === null) continue;
    const f = obj(m.from);
    const from = m.from === undefined ? undefined : typeof f.id === 'string' && typeof f.name === 'string' && f.name.trim() ? { id: f.id, name: f.name.trim().slice(0, 40) } : null;
    const mark: ProfileMark = { kind: m.kind, gift: m.gift, emoji: emojiOf(m.emoji, '💩'), until, ...(from !== undefined ? { from } : {}) };
    const had = byKind.get(m.kind);
    if (!had || had.until < until) byKind.set(m.kind, mark);
  }
  return [...byKind.values()];
}

/** A gift packet's `mark` (server/api/gifts.mjs announceGift) or a send's answer's; null for none or malformed. */
export function parseMarkNews(x: unknown): MarkNews | null {
  const m = obj(x);
  if ((m.role !== 'leave' && m.role !== 'clean') || typeof m.kind !== 'string' || !KIND.test(m.kind) || typeof m.gift !== 'string' || !GIFT_ID.test(m.gift)) return null;
  const base = { role: m.role, kind: m.kind, gift: m.gift, emoji: emojiOf(m.emoji, m.role === 'leave' ? '💩' : '💧') } as const;
  if (m.role === 'clean') return base;
  const until = timeOf(m.until);
  if (until === null) return null;
  return { ...base, until, hours: hoursOf(m.hours) ?? MARK_HOURS, clean: typeof m.clean === 'string' && m.clean.trim() && m.clean.length <= 16 ? m.clean.trim() : null, again: m.again === true };
}

/** The mark showing on a photo now (the one that lasts longest), or null. */
export function activeMark(marks: readonly ProfileMark[] | undefined, now = Date.now()): ProfileMark | null {
  let best: ProfileMark | null = null;
  for (const m of marks ?? []) if (m.until > now && (!best || m.until > best.until)) best = m;
  return best;
}

/** `marks` after a gift's news: a leave replaces its kind's mark, a clean takes its kind off. */
export function marksAfter(marks: readonly ProfileMark[], news: MarkNews): ProfileMark[] {
  const rest = marks.filter((m) => m.kind !== news.kind);
  if (news.role === 'clean' || news.until === undefined) return rest;
  return [...rest, { kind: news.kind, gift: news.gift, emoji: news.emoji, until: news.until }];
}

/** "24 saat" or, under an hour, "35 dakika": how long is left until `until`. */
export function leftText(until: number, now = Date.now()): string {
  const min = Math.max(1, Math.ceil((until - now) / 60_000));
  return min >= 60 ? `${Math.ceil(min / 60)} saat` : `${min} dakika`;
}

/**
 * The receiver's line (the room, a notice): "X sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar". The name
 * stands alone (no suffix after a name anyone chose); without a cleaning gift only the time.
 */
export const markNotice = (fromName: string, emoji: string, hours: number, clean: string | null | undefined) =>
  `${fromName} sana ${emoji} attı; ${hours} saat kalır${clean ? ` ya da biri ${clean} gönderene kadar` : ''}`;

/**
 * The room's chat line for a gift's news, or null when there is nothing to say. `to` is 'me' for my own photo; names
 * stand alone (no suffix after them).
 */
export function markLine(news: MarkNews, fromName: string, to: 'me' | string, toName: string): string | null {
  if (news.role === 'leave') {
    const hours = news.hours ?? MARK_HOURS;
    if (to === 'me') return markNotice(fromName, news.emoji, hours, news.clean);
    return `${news.emoji} ${toName}: profilinde ${hours} saat iz kalır${news.clean ? ` ya da biri ${news.clean} gönderene kadar` : ''}`;
  }
  return to === 'me' ? `${news.emoji} ${fromName} profilindeki izi temizledi` : `${news.emoji} ${fromName}, ${toName} kişisinin profilindeki izi temizledi`;
}

/** My own profile's line under my photo while a mark shows: how long is left and how it comes off. */
export function ownMarkNote(mark: ProfileMark, clean: string | null, now = Date.now()): string {
  const who = mark.from?.name ? `${mark.from.name} bıraktı. ` : '';
  return `${who}Profilindeki ${mark.emoji} izi ${leftText(mark.until, now)} sonra gider${clean ? ` ya da biri ${clean} gönderince temizlenir` : ''}.`;
}

/**
 * The gift sheet's rule for a gift that leaves a mark: the picked people who refuse marks (Gizlilik), whom it can't
 * go to. `refuses(id)`: whether that person said no (their look's noMarks).
 */
export const refusingMarks = (rule: GiftMark | null, targets: readonly string[], refuses: (id: string) => boolean) => (rule?.role === 'leave' ? targets.filter(refuses) : []);

/** The sheet's line when some of the picked people refuse marks (never a "spend more" nudge). */
export function refusalLine(gift: { name: string }, refusing: readonly string[], nameOf: (id: string) => string, all: number): string {
  if (refusing.length === 1 && all === 1) return `${nameOf(refusing[0])}, profiline iz bırakılmasını kapattı. ${gift.name} ona gönderilemez.`;
  if (refusing.length === all) return `Seçtiğin kişiler profillerine iz bırakılmasını kapattı. ${gift.name} onlara gönderilemez.`;
  return `${refusing.length} kişi profiline iz bırakılmasını kapattı; ${gift.name} yalnız diğer ${all - refusing.length} kişiye gider.`;
}
