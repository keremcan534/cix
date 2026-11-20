// Profil izleri (docs/PROFIL_IZLERI.md, server/api/profile-marks.mjs), Muzip hediyeler: 💩 Kaka Şakası leaves Kaka İzi
// on the receiver's profile photo for a while (24 hours, Canlı ayarlar) or until someone sends 💧 Temizlik Suyu, which
// costs more; 🩴 Terlik Geldi! leaves Kırık Cam the same way. The kinds are data (server/api/mark-kinds.mjs): a kind's
// name, the overlay picture staff uploaded, its minutes; this app since 1.1.0 reads them (catalog marks=2). One mark at
// a time: the same kind again starts its time again, another kind takes its place. Someone may limit who marks them in
// Gizlilik ("Kimler profilime iz bırakabilir": everyone, the people they follow — the default —, nobody), and the gift
// sheet says so before anyone taps; the marks they have stay. Pure: the server's answers read defensively (a malformed
// one shows no mark, never throws), the lines the room and the profile say, which picture a mark is drawn with, and
// the sheet's rule. The store and the screens are lib/mark-store and components/profile-mark;
// tests/profile-marks.test.ts.

/** What a gift does to a profile: 'leave' a mark of `kind` (for `minutes`, `hours` from a server before minutes), or 'clean' it. */
export type GiftMark = { role: 'leave' | 'clean'; kind: string; hours?: number; minutes?: number };
/** A mark on someone's photo: its kind, the gift that left it (its badge), until when (ms), on my own profile who. */
export type ProfileMark = { kind: string; gift: string; emoji: string; until: number; from?: { id: string; name: string } | null };
/** A gift packet's (or a send's answer's) `mark`: what that gift just did (`replaced`: the kinds it took the place of). */
export type MarkNews = {
  role: 'leave' | 'clean';
  kind: string;
  gift: string;
  emoji: string;
  until?: number;
  hours?: number;
  minutes?: number;
  clean?: string | null;
  again?: boolean;
  replaced?: string[];
};
/** A kind as the server says it is now (marks=2): its name, its overlay (url + version), its own minutes. */
export type MarkKind = { name: string; stack: 'refresh' | 'replace'; minutes?: number; art?: { url: string; v: string; px?: number } };

/** The app's own two gifts' rules (server/api/profile-mark-rules.mjs APP_MARKS; tests/server-catalog.test.ts). */
export const APP_MARKS: Readonly<Record<string, GiftMark>> = Object.freeze({
  k1: Object.freeze({ role: 'leave', kind: 'kaka', hours: 24 }),
  k2: Object.freeze({ role: 'clean', kind: 'kaka' }),
});
/** How long a mark stays when nothing else says (the Canlı ayar's default). */
export const MARK_HOURS = 24;
/** The kinds this app has a picture of its own for (components/profile-mark): drawn when the server gives none. */
export const COMPILED_MARKS: ReadonlySet<string> = new Set(['kaka', 'kirik-cam']);

const KIND = /^[a-z][a-z0-9-]{0,23}$/;
const GIFT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const ART_URL = /^https?:\/\/[^\s"'<>\\]{1,600}$/;
const ART_V = /^[0-9a-f]{12}$/;
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const emojiOf = (x: unknown, fallback: string) => (typeof x === 'string' && x.trim() && x.length <= 16 ? x.trim() : fallback);
const hoursOf = (x: unknown) => (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 168 ? x : undefined);
const minutesOf = (x: unknown, min = 5) => (typeof x === 'number' && Number.isInteger(x) && x >= min && x <= 10_080 ? x : undefined);
const timeOf = (x: unknown) => {
  const t = typeof x === 'string' ? Date.parse(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(t) && t > 0 ? t : null;
};

/** A catalog gift's `mark` (GET /api/catalog marks=1, marks=2); null for none or anything malformed. */
export function parseGiftMark(x: unknown): GiftMark | null {
  const m = obj(x);
  if ((m.role !== 'leave' && m.role !== 'clean') || typeof m.kind !== 'string' || !KIND.test(m.kind)) return null;
  const hours = m.role === 'leave' ? hoursOf(m.hours) : undefined;
  const minutes = m.role === 'leave' ? minutesOf(m.minutes) : undefined;
  return { role: m.role, kind: m.kind, ...(hours ? { hours } : {}), ...(minutes ? { minutes } : {}) };
}

/** The catalog's kinds (marks=2 `marks.kinds`): each well-formed one; a malformed picture is left off (the app's own then). */
export function parseMarkKinds(x: unknown): Record<string, MarkKind> {
  const out: Record<string, MarkKind> = {};
  for (const [kind, raw] of Object.entries(obj(x)).slice(0, 100)) {
    const k = obj(raw);
    const name = typeof k.name === 'string' ? k.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (!KIND.test(kind) || !name) continue;
    const a = obj(k.art);
    const art = typeof a.url === 'string' && ART_URL.test(a.url) && typeof a.v === 'string' && ART_V.test(a.v) ? { url: a.url, v: a.v, ...(typeof a.px === 'number' && Number.isInteger(a.px) && a.px >= 64 && a.px <= 1024 ? { px: a.px } : {}) } : undefined;
    const minutes = minutesOf(k.minutes);
    out[kind] = { name, stack: k.stack === 'replace' ? 'replace' : 'refresh', ...(minutes ? { minutes } : {}), ...(art ? { art } : {}) };
  }
  return out;
}

/**
 * Profil izleri as the catalog says: on or off, the hours, each gift's rule, and (marks=2) the kinds. Null from a
 * server before them (no marks there).
 */
export type MarkRules = { on: boolean; hours: number; gifts: Record<string, GiftMark>; kinds: Record<string, MarkKind> };
/**
 * The catalog's `marks` ({ on, hours, kinds? }) with the rules on its gift list (`list`: entries with `id` and
 * `mark`), or a saved copy's (`gifts` kept on it). Null when the server said nothing (an older one: no marks there).
 * A server before kinds (marks=1 only) gives none: every mark is drawn with the app's own picture or the gift's badge.
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
  return { on: m.on, hours, gifts, kinds: parseMarkKinds(m.kinds) };
}

/** How long a mark `rule` leaves stays, in minutes: the gift's, else its kind's, else the Canlı ayar's (`rules`). */
export function markMinutes(rule: GiftMark, rules?: MarkRules | null): number {
  return rule.minutes ?? (rule.hours ? rule.hours * 60 : (rules?.kinds[rule.kind]?.minutes ?? (rules?.hours || MARK_HOURS) * 60));
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
  const minutes = minutesOf(m.minutes, 1);
  const replaced = Array.isArray(m.replaced) ? m.replaced.filter((k): k is string => typeof k === 'string' && KIND.test(k)).slice(0, 5) : [];
  return {
    ...base,
    until,
    hours: hoursOf(m.hours) ?? (minutes ? Math.min(168, Math.ceil(minutes / 60)) : MARK_HOURS),
    ...(minutes ? { minutes } : {}),
    clean: typeof m.clean === 'string' && m.clean.trim() && m.clean.length <= 16 ? m.clean.trim() : null,
    again: m.again === true,
    ...(replaced.length ? { replaced } : {}),
  };
}

/** The mark showing on a photo now (the one that lasts longest), or null. */
export function activeMark(marks: readonly ProfileMark[] | undefined, now = Date.now()): ProfileMark | null {
  let best: ProfileMark | null = null;
  for (const m of marks ?? []) if (m.until > now && (!best || m.until > best.until)) best = m;
  return best;
}

/** `marks` after a gift's news: a leave is the one mark now (one at a time), a clean takes its kind off. */
export function marksAfter(marks: readonly ProfileMark[], news: MarkNews): ProfileMark[] {
  if (news.role === 'clean' || news.until === undefined) return marks.filter((m) => m.kind !== news.kind);
  return [{ kind: news.kind, gift: news.gift, emoji: news.emoji, until: news.until }];
}

/** "24 saat", "90 dakika" → "1 saat 30 dakika", "2 gün": a mark's time (server/api/profile-mark-rules.mjs durationText). */
export function durationText(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} dakika`;
  if (m % 1440 === 0 && m > 1440) return `${m / 1440} gün`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} saat ${m % 60} dakika` : `${h} saat`;
}
/** A news' time in minutes (an older server's packet: its hours). */
const newsMinutes = (n: MarkNews) => n.minutes ?? (n.hours ?? MARK_HOURS) * 60;

/** "24 saat" or, under an hour, "35 dakika": how long is left until `until`. */
export function leftText(until: number, now = Date.now()): string {
  const min = Math.max(1, Math.ceil((until - now) / 60_000));
  return min >= 60 ? `${Math.ceil(min / 60)} saat` : `${min} dakika`;
}

/**
 * The receiver's line (the room, a notice): "X sana 💩 attı; 24 saat kalır ya da biri 💧 gönderene kadar". The name
 * stands alone (no suffix after a name anyone chose); without a cleaning gift only the time.
 */
export const markNotice = (fromName: string, emoji: string, minutes: number, clean: string | null | undefined) =>
  `${fromName} sana ${emoji} attı; ${durationText(minutes)} kalır${clean ? ` ya da biri ${clean} gönderene kadar` : ''}`;

/**
 * The room's chat line for a gift's news, or null when there is nothing to say. `to` is 'me' for my own photo; names
 * stand alone (no suffix after them).
 */
export function markLine(news: MarkNews, fromName: string, to: 'me' | string, toName: string): string | null {
  if (news.role === 'leave') {
    const minutes = newsMinutes(news);
    if (to === 'me') return markNotice(fromName, news.emoji, minutes, news.clean);
    return `${news.emoji} ${toName}: profilinde ${durationText(minutes)} iz kalır${news.clean ? ` ya da biri ${news.clean} gönderene kadar` : ''}`;
  }
  return to === 'me' ? `${news.emoji} ${fromName} profilindeki izi temizledi` : `${news.emoji} ${fromName}, ${toName} kişisinin profilindeki izi temizledi`;
}

/**
 * My own profile's line under my photo while a mark shows: who left it, how long is left and how it comes off. Never
 * a "spend more" nudge, and never a free removal (the owners' decision): it goes by itself or when someone cleans it.
 */
export function ownMarkNote(mark: ProfileMark, clean: string | null, now = Date.now()): string {
  const who = mark.from?.name ? `${mark.from.name} bıraktı. ` : '';
  return `${who}Profilindeki ${mark.emoji} izi ${leftText(mark.until, now)} sonra gider${clean ? ` ya da biri ${clean} gönderince temizlenir` : ''}.`;
}

// --- Drawing ---------------------------------------------------------------------------------------------------
/**
 * Which picture a mark of `kind` is drawn with (components/profile-mark): the overlay staff uploaded (the catalog's,
 * with its version so a new one is fetched), else the app's own picture for that kind, else none (the gift's badge
 * alone). `badge`: whether the gift's small picture goes on the photo too: always for the badge alone and for the app's
 * own Kaka İzi (as before 1.1.0), never over a drawn overlay (staff design it whole). `failed`: a picture address that
 * didn't load on this phone (the next one down is used).
 */
export type MarkLayer = { art: { uri: string } | null; compiled: string | null; badge: boolean; wash: 'water' | 'sparkle' };
export function markLayerOf(kind: string, kinds: Record<string, MarkKind> | undefined, failed?: string | null): MarkLayer {
  const a = kinds?.[kind]?.art;
  const uri = a ? `${a.url}${a.url.includes('?') ? '&' : '?'}v=${a.v}` : null;
  const wash = kind === 'kaka' ? 'water' : 'sparkle';
  if (uri && uri !== failed) return { art: { uri }, compiled: null, badge: false, wash };
  if (COMPILED_MARKS.has(kind)) return { art: null, compiled: kind, badge: kind === 'kaka', wash };
  return { art: null, compiled: null, badge: true, wash };
}

// --- The gift sheet -------------------------------------------------------------------------------------------
/** Why someone refuses my mark: 'nobody' (they let nobody), 'following' (only the people they follow, and not me). */
export type MarkRefusal = 'nobody' | 'following';
/**
 * The gift sheet's rule for a gift that leaves a mark: the picked people who refuse it from me (Gizlilik), whom it
 * can't go to. `refuses(id)`: whether that person does (their look's noMarks). Each picked person on their own: the
 * others still get it, each paid apart.
 */
export const refusingMarks = (rule: GiftMark | null, targets: readonly string[], refuses: (id: string) => boolean) => (rule?.role === 'leave' ? targets.filter(refuses) : []);

/**
 * The sheet's line when some of the picked people refuse the mark (never a "spend more" nudge). `why(id)`: their
 * reason (none known: nobody, as before 1.1.0).
 */
export function refusalLine(gift: { name: string }, refusing: readonly string[], nameOf: (id: string) => string, all: number, why: (id: string) => MarkRefusal = () => 'nobody'): string {
  const off = refusing.every((id) => why(id) === 'nobody');
  if (refusing.length === 1 && all === 1) {
    return why(refusing[0]) === 'following'
      ? `${nameOf(refusing[0])}, profiline yalnız takip ettiği kişilerin iz bırakmasına izin veriyor. ${gift.name} ona gönderilemez.`
      : `${nameOf(refusing[0])}, profiline iz bırakılmasını kapattı. ${gift.name} ona gönderilemez.`;
  }
  if (refusing.length === all) return off ? `Seçtiğin kişiler profillerine iz bırakılmasını kapattı. ${gift.name} onlara gönderilemez.` : `Seçtiğin kişiler senden iz kabul etmiyor. ${gift.name} onlara gönderilemez.`;
  return off ? `${refusing.length} kişi profiline iz bırakılmasını kapattı; ${gift.name} yalnız diğer ${all - refusing.length} kişiye gider.` : `${refusing.length} kişi senden iz kabul etmiyor; ${gift.name} yalnız diğer ${all - refusing.length} kişiye gider.`;
}

/** A pair on the Muzip shelf: the gift that leaves a mark, how long, and the gift that cleans it (none: time alone). */
export type MarkPair = { leave: { emoji: string; name: string }; minutes: number; clean: { emoji: string; name: string } | null };
/**
 * The Muzip shelf's note while gifts on it leave a mark: what they do, how long, what cleans them and that anyone may
 * choose who marks them. Null for none. Never a "spend more" nudge.
 */
export function shelfNoteOf(pairs: readonly MarkPair[]): string | null {
  if (!pairs.length) return null;
  const tail = ' Kimlerin iz bırakabileceğini herkes Ayarlar › Gizlilik’ten seçer.';
  if (pairs.length === 1) {
    const [p] = pairs;
    return `${p.leave.emoji} ${p.leave.name} alıcının profil fotoğrafında ${durationText(p.minutes)} iz bırakır${p.clean ? `; ${p.clean.emoji} ${p.clean.name} izi temizler` : ''}.${tail}`;
  }
  const shown = pairs.slice(0, 3).map((p) => `${p.leave.emoji} ${p.leave.name} (${durationText(p.minutes)}${p.clean ? `, ${p.clean.emoji} temizler` : ''})`);
  const more = pairs.length > 3 ? ` ve ${pairs.length - 3} hediye daha` : '';
  return `Bazı hediyeler alıcının profil fotoğrafında iz bırakır: ${shown.join(', ')}${more}. Aynı anda tek iz kalır.${tail}`;
}
