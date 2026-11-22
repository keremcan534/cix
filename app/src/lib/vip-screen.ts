// The VIP tab's Ayrıcalıklar view (app/vip, components/vip): pure geometry and wording, so the node tests load it.
// The look follows the client's design (SimilarClub VIP Uygulama Paketi, 841 px wide source); the levels, points
// and rights stay the server's (lib/levels-live-core).
import type { ShownRight } from '@/data/status';

// --- Hero ("tabela") ------------------------------------------------------------------------------------------------
/** One background per VIP level (assets/vip/hero-1…10.webp); levels past the last reuse it. */
export const HERO_COUNT = 10;
/** The hero picture of a level: 1…10 (a level past 10 reuses 10; 0, a negative or a broken number: 1). */
export const heroFor = (level: number) => (Number.isFinite(level) ? Math.min(HERO_COUNT, Math.max(1, Math.floor(level))) : 1);

/**
 * The level's badge on the hero, where the design's winged ring was (the client, 20 Nov 2026), in source px of the
 * 812 px box: the ring's middle, a little smaller than the ring with its crown so it clears the border.
 */
export const HERO_BADGE = { left: 438, top: 56, size: 280 } as const;

/** The design's hero box (vip_hero slice, source px): the card with its outer glow margin. */
export const HERO_BOX = { w: 812, h: 404 } as const;
/** Where the hero picture (804×391, the card cut at its gold border) sits in that box, as fractions of it. */
export const HERO_ART = { left: 3 / 812, top: 6 / 404, width: 804 / 812, height: 391 / 404 } as const;
/**
 * The live text on the hero, in source px of the 812 px box (scale by box width / 812). The column starts where
 * the design's "VIP 1" and status line start and ends before the winged ring (its left wing reaches x ≈ 374).
 * `status` is the design's "✓ Açıldı · Kalıcı"; the lines the design doesn't draw (points so far, points left, with
 * Yükle under them) use the smaller `statusLocked`, so two lines and the button stay inside the border (its inner
 * edge is at y ≈ 384). The hero is a picture that keeps its shape, so its text and Yükle scale with it, not with the
 * phone's text size: 64 + 127.4 (title line) + 7 + 2 × 41.6 (status) + 16 + 64 (Yükle) ≈ 362 on every phone.
 */
export const HERO_TEXT = { left: 56, top: 64, width: 310, title: 108, status: 33.5, statusLocked: 32, statusGap: 7, ringLeft: 374 } as const;
/** Yükle under a locked level's line, in the same source px: gap above it, height, side padding, label size. */
export const HERO_LOAD = { gap: 16, h: 64, padX: 42, font: 30 } as const;
/**
 * A locked level's "Kilitli" chip over the title, in the same source px: it scales with the card like the title,
 * so on a 320 dp phone it keeps its gap above "VIP n" (a fixed-size chip nearly touched it there).
 */
export const HERO_LOCK = { top: 20, font: 26, icon: 24, padX: 17, padY: 6.5, gap: 8.5, radius: 17 } as const;
/**
 * The gold light around the sign (hero-glow.webp, 841×430): its place in the same 812 px box. It reaches past the
 * box on every side, so the carousel leaves room for it above and below the cards.
 */
export const HERO_GLOW = { left: -16, top: -13, w: 841, h: 430 } as const;

/**
 * How much the level's name shrinks so it stays one line left of the ring (1 = the design's size). The panel can
 * rename a level (up to 30 characters); the width is estimated per character of the heavy face, a little wide, so
 * it fits on every phone and on the web (where text can't shrink itself).
 */
export function titleFit(name: string): number {
  let em = 0;
  for (const ch of name) em += /[\sIil1.,'!|:;]/.test(ch) ? 0.3 : /[MWmw@%]/.test(ch) ? 0.9 : /[A-ZĞÜŞİÖÇ0-9]/.test(ch) ? 0.68 : 0.56;
  const room = (HERO_TEXT.width - 20) / HERO_TEXT.title; // the column, less the slant and the shadow, in ems
  return em <= room ? 1 : Math.max(0.4, room / em);
}

export type HeroStatus = { kind: 'open'; text: string } | { kind: 'next'; text: string; progress: number } | { kind: 'locked'; text: string; left: number };

/**
 * The hero's line for one level: open (the member's level and below), the next level (points so far / needed,
 * with a bar), or a level further up (how many points are left). "Kalıcı" only when no level drop rule is on.
 */
export function statusLine(o: { level: number; points: number; myLevel: number; myPoints: number; decay: boolean }): HeroStatus {
  if (o.myLevel >= o.level) return { kind: 'open', text: o.decay ? '✓ Açıldı' : '✓ Açıldı · Kalıcı' };
  if (o.myLevel === o.level - 1) {
    const progress = o.points > 0 ? Math.max(0, Math.min(1, o.myPoints / o.points)) : 0;
    return { kind: 'next', text: `${compactPoints(o.myPoints)} / ${compactPoints(o.points)}`, progress };
  }
  // Short (12,4M) so the line fits left of the ring in two lines, broken before the number so no word is left alone
  // on the second line; the screen reader says the whole number.
  const left = Math.max(0, o.points - o.myPoints);
  return { kind: 'locked', text: `Bu seviyeye\n${compactPoints(left, true)} puan kaldı`, left };
}

/** 1.234.567 (Turkish grouping). */
export const groupDigits = (n: number) => Math.max(0, Math.floor(n)).toLocaleString('tr-TR');

/**
 * Points in a few characters: 999, 12,5k, 1,25M. Rounded down, so the bar's numbers never show the target reached
 * before it is (499.999 is "499,9k", not "500k"); `up` rounds up instead, for points still missing (never less
 * than what is left).
 */
export function compactPoints(n: number, up = false): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  const cut = (x: number, digits: number) => {
    const f = 10 ** digits;
    // The epsilon keeps a float like 12.4 * 10 = 123.99999 from losing a step.
    return String((up ? Math.ceil(x * f - 1e-9) : Math.floor(x * f + 1e-9)) / f).replace('.', ',');
  };
  if (v >= 1_000_000) return `${cut(v / 1_000_000, 2)}M`;
  if (v >= 1_000) return `${cut(v / 1_000, 1)}k`;
  return String(v);
}

/** The carousel card the screen opens on: the member's own level (VIP 1 for a member who has none yet). */
export function startIndex(myLevel: number, levels: readonly { level: number }[]): number {
  if (!levels.length) return 0;
  const at = levels.findIndex((l) => l.level === myLevel);
  if (at >= 0) return at;
  return myLevel > levels[levels.length - 1].level ? levels.length - 1 : 0;
}

/** The card a swipe stopped on. */
export const snapIndex = (offsetX: number, step: number, count: number) => (step > 0 && count > 0 ? Math.max(0, Math.min(count - 1, Math.round(offsetX / step))) : 0);

/**
 * Text drawn in the brand face at a heavy weight: its word space is narrow (0.18 em; the design's face has about
 * 0.25), so words run together ("VIP1Hakları5/7"). Spaces become four-per-em spaces (U+2005, 0.25 em, in the face;
 * a line can still break there). Only for what is drawn: what a screen reader gets keeps the plain text.
 */
export const wideSpaces = (text: string) => text.replace(/ /g, '\u2005');

// --- Rights grid ----------------------------------------------------------------------------------------------------
/** Three cards a row; two on a narrow phone or with the phone's text size turned well up. */
export const gridColumns = (width: number, fontScale: number): 2 | 3 => (width < 340 || fontScale >= 1.3 ? 2 : 3);

/** How far the app's text grows with the phone's text size (components/text MAX_FONT_SCALE). */
const TEXT_GROWTH_CAP = 1.15;

/**
 * The cards' size in dp. On a 390 dp phone, as in the design: 12 dp margins, 10.5 dp between columns, 12 between
 * rows and 115×107 dp cards, the picture at the design's size and a two-line name fitting under it. The name is
 * 13 dp on the design's 115 dp card and follows a narrower card down (so "Profil çerçevesi" stays one line on a
 * 360 dp phone), never past 13 on a wider one. A card grows only when the phone's text size is up, so two lines of
 * its name still fit; every card of the grid has the same height. `rim` is the card's gold rim, inside its size.
 */
export function cardMetrics(width: number, cols: 2 | 3, fontScale: number) {
  const margin = 12;
  const gap = cols === 3 ? 10.5 : 12;
  const cardW = Math.floor(((width - margin * 2 - gap * (cols - 1)) / cols) * 2) / 2;
  const s = Math.min(1, cardW / 115);
  const font = Math.round(13 * s * 100) / 100;
  const lineH = Math.round(15 * s * 100) / 100;
  const rim = 1.5;
  const artTop = 2;
  // The tallest picture (the frame, 151 px of a 248 px card) is 0.61 of the card's width.
  const artH = Math.min(Math.round(cardW * 0.62), 85);
  // The name starts 2 dp over the picture's box (the pictures are centred in it, none reaches its bottom), so a
  // second line keeps its descenders clear of the rim, as in the design.
  const labelTop = artTop + artH - 2;
  const labelH = Math.ceil(lineH * 2 * Math.min(Math.max(fontScale, 1), TEXT_GROWTH_CAP));
  const padBottom = 3;
  const shape = cols === 3 ? 231 / 248 : 0.8;
  const cardH = Math.max(Math.round(cardW * shape), rim * 2 + labelTop + labelH + padBottom);
  return { margin, gap, rowGap: 12, cardW, cardH, rim, artTop, artH, labelTop, font, lineH, letterSpacing: -0.2, padX: 6, padBottom };
}

/** Source px of the design per dp of a card (its line box is 248 px wide), for the pictures' sizes. */
export const artScaleFor = (cardW: number) => Math.min(cardW / 248, 0.56);

/** The rights that have the design's own picture (assets/vip/right-<key>.png), by the picture the app gave them. */
export type RightArtKey = 'badge' | 'frame' | 'hide_levels' | 'room_password' | 'vip_store' | 'vip_gifts' | 'silent_visit';
const DESIGN_ART: Record<string, RightArtKey> = {
  'ayricalik-svip-rozeti': 'badge',
  'ayricalik-profil-cercevesi': 'frame',
  'ayricalik-gizemli-kisi-kimligi': 'hide_levels',
  'ayricalik-oda-kilitleme': 'room_password',
  'ayricalik-puan-takas-magazasi': 'vip_store',
  'ayricalik-svip-e-ozel-hediye': 'vip_gifts',
  'ayricalik-gizli-ziyaret': 'silent_visit',
};
/** The design picture of a right, or null for one the design doesn't draw (it keeps the app's own art or emoji). */
export const rightArtKey = (r: Pick<ShownRight, 'art'>): RightArtKey | null => (r.art ? (DESIGN_ART[r.art] ?? null) : null);

/**
 * Whether a card draws the warm light behind its picture. Not behind the profile frame: it is an empty ring, and
 * the light showed through its hole as a muddy disc where the design keeps the dark glass.
 */
export const artGlows = (key: RightArtKey | null) => key !== 'frame';

// --- VIP seti: each level's own pictures (components/vip/level-art, the client's "vip 1-10lvl sistem") ---------------
/** The set draws VIP 1–10; a level past the last shows the last one's. */
export const LEVEL_ART_TOP = 10;
/** The set's level a VIP level shows (1–10), or null for none (0, a negative or a broken number). */
export const levelArtFor = (level: number): number | null => (Number.isFinite(level) && level >= 1 ? Math.min(LEVEL_ART_TOP, Math.floor(level)) : null);
export type LevelPicKind = 'badge' | 'frame' | 'bubble' | 'entry';
/** A right as the VIP list shows it; `set`: the level's picture of the set it draws instead of its one picture. */
export type ListRight = ShownRight & { set?: LevelPicKind };
/**
 * The set's two rights the list adds after the server's: each level's chat bubble and entry effect, which reaching it
 * puts in Çantam (server vip-set.mjs, a Seviye ödülü per level). The badge and frame rights are the server's own.
 */
export const VIP_SET_RIGHTS: readonly ListRight[] = [
  { name: 'Sohbet balonu', emoji: '💬', art: 'ayricalik-genel-sohbet-balonu', level: 1, set: 'bubble' },
  { name: 'Giriş efekti', emoji: '✨', art: 'ayricalik-giris-efekti', level: 1, set: 'entry' },
];
/** The VIP list: the server's rights (the badge and frame ones drawing the level's own picture), then the set's two. */
export function withSetRights(rights: readonly ShownRight[]): ListRight[] {
  const own: ListRight[] = rights.map((r) => {
    const key = rightArtKey(r);
    return key === 'badge' || key === 'frame' ? { ...r, set: key } : r;
  });
  return [...own, ...VIP_SET_RIGHTS.filter((x) => !own.some((r) => r.set === x.set || r.name === x.name))];
}
/** What a tap on a right says: when it opens, and for a picture of the set that it comes to Çantam. */
export function rightNote(r: ListRight, open: boolean, levelName: string, opensAt: string): string {
  if (!open) return `${opensAt} ile açılır.`;
  if (r.set === 'frame' || r.set === 'bubble' || r.set === 'entry') return `${levelName} ile kullanabilirsin. Bu seviyenin ${r.name.toLocaleLowerCase('tr')} Çantam'a gelir; oradan takabilirsin.`;
  return `${levelName} ile kullanabilirsin.`;
}

/** How many of the rights a level has. */
export const rightsOpen = (rights: readonly Pick<ShownRight, 'level'>[], level: number) => rights.filter((r) => r.level <= level).length;

/** Empty cells left on the grid's last row (0 when it is full). They stay empty: no filler cards. */
export const emptyCells = (count: number, cols: number) => (count > 0 && count % cols ? cols - (count % cols) : 0);

/**
 * Whether the design's crown (drawn at the panel's top right) has room in the last row's empty cells, so it never
 * covers a card: the empty part of the row must be wider than the crown and a margin.
 */
export function lowerCrownFits(count: number, cols: number, cardW: number, gap: number, crownW: number) {
  const empty = emptyCells(count, cols);
  return empty > 0 && empty * cardW + (empty - 1) * gap + gap >= crownW + 8;
}

// --- Abonelik tab ---------------------------------------------------------------------------------------------------
// The client's light-pink design (SimilarClub VIP Abonelik Paketi, 941 px wide source, 2.413 px per dp). Plans, prices,
// savings and rights stay the server's (levels-live-core subPlansOf / subRightsOf); the words are the owners': the
// subscription is "Abonelik" / "Abone" on this tab, the VIP level system keeps "VIP".

/** "Abonelik aktif · 27 gün kaldı"; null without days left (the line is not shown then). */
export function subStatusText(days: number): string | null {
  if (!Number.isFinite(days) || days <= 0) return null;
  return `Abonelik aktif · ${Math.ceil(days)} gün kaldı`;
}

/** A TRY amount as Turkish writes it: 1.199, 149,99. */
export const tryAmount = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/** The badge on a plan: "%76 daha uygun", or null when the plan saves nothing. */
export const saveText = (save: number) => (Number.isFinite(save) && save >= 1 ? `%${Math.floor(save)} daha uygun` : null);

type PlanShown = { days: number; label: string; tl: number; was: number; save: number };

/** The plan the tab opens on: the month, as it always did; without it (hidden in the panel), the first one shown. */
export const defaultPlanDays = (plans: readonly Pick<PlanShown, 'days'>[]) => (plans.find((p) => p.days === 30) ?? plans[0])?.days ?? 0;

/** What a screen reader says for a plan card; whether it is picked comes with its radio role. */
export function planA11y(p: PlanShown): string {
  const parts = [`Abonelik ${p.label}`, `${tryAmount(p.tl)} TL`];
  if (p.was > p.tl) parts.push(`önceki fiyat ${tryAmount(p.was)} TL`);
  const save = saveText(p.save);
  if (save) parts.push(save);
  return parts.join(', ');
}

/** The purchase dialogs' words (the owners': "Abonelik", not "VIP"). */
export const SUB_BUY_TITLE = 'Abonelik satın al';
export const testBuyText = (p: Pick<PlanShown, 'label' | 'days'>) => `Abonelik ${p.label} · Test sürümü: ücretsiz, gerçek ödeme alınmaz. ${p.days} gün eklensin mi?`;
export const demoBuyText = (p: Pick<PlanShown, 'label' | 'tl'>, store: string) => `Abonelik ${p.label} · ${tryAmount(p.tl)} TL (${store}). Onaylıyor musun?`;

/**
 * The plan cards in dp, at the design's 390 dp phone: 111.5 dp wide (the picked one 121), 6.2 dp apart, 102.4 dp tall
 * (the picked one 113.6: 9.5 higher at the top, 1.7 lower at the bottom, so the texts of all three line up). `padX`
 * is the room kept free at each side of the price.
 */
export const PLAN = { w: 111.5, wOn: 121, gap: 6.2, rowGap: 12, h: 102.4, hOn: 113.6, lift: 9.5, drop: 1.7, padX: 5, price: 27, priceOn: 28.3, maxUnit: 1.3 } as const;

/**
 * Columns and scale of the plan cards. Three in a row, as in the design; two on a narrow phone or with the phone's
 * text size well up (more plans than columns go on the next row). `unit` scales the design's widths so a row with the
 * picked card fills the content width (1 dp is kept free, so rounding never pushes a card out); a lone plan or two
 * don't grow past 1.3 times the design.
 */
export function planGrid(contentW: number, fontScale: number, count: number): { cols: number; unit: number } {
  const n = Math.max(1, Math.floor(count) || 1);
  const cols = Math.min(n, contentW >= 318 && fontScale < 1.3 ? 3 : 2);
  const unit = Math.min(PLAN.maxUnit, (contentW - 1 - PLAN.gap * (cols - 1)) / (PLAN.wOn + PLAN.w * (cols - 1)));
  return { cols, unit: Math.max(0.5, unit) };
}

/** A card's width at that scale (to a tenth of a dp, rounded down). */
export const planWidth = (unit: number, on: boolean) => Math.floor((on ? PLAN.wOn : PLAN.w) * unit * 10) / 10;

/** Plus Jakarta Sans ExtraBold advances (em) of what a price or a badge holds; other letters count as 0.62 (a little
 * wide: "daha uygun" averages 0.61). */
const HEAVY_EM: Record<string, number> = { '0': 0.7, '1': 0.413, '2': 0.596, '3': 0.612, '4': 0.662, '5': 0.614, '6': 0.604, '7': 0.564, '8': 0.633, '9': 0.604, '.': 0.408, ',': 0.386, '%': 1.07, ' ': 0.18 };
const heavyEm = (text: string) => [...text].reduce((sum, ch) => sum + (HEAVY_EM[ch] ?? 0.62), 0);
/** "TRY" before the number: SemiBold at 11.7 dp (1.824 em), then 3 dp. */
export const PRICE_PREFIX = { size: 11.7, width: 1.824 * 11.7, gap: 3 } as const;

/**
 * The price's size: the design's (27 dp, 28.3 picked) while "TRY" and the number fit the card, smaller for a long
 * price (the panel allows up to 100.000), never under 45 % of it. Computed, so the web (which can't shrink text to
 * fit) draws it the same.
 */
export function priceSize(amount: string, room: number, size: number): number {
  const em = heavyEm(amount);
  const avail = room - PRICE_PREFIX.width - PRICE_PREFIX.gap;
  if (em <= 0 || em * size <= avail) return size;
  return Math.max(Math.round(size * 0.45 * 10) / 10, Math.floor((avail / em) * 10) / 10);
}

/** A badge's text size: the design's while the text and its side padding fit `room`, smaller otherwise (≥ 8.5 dp). */
export function badgeSize(text: string, room: number, size: number, padX: number): number {
  const em = heavyEm(text);
  // 1 dp kept free: a text that only just fits would be cut with "…".
  const avail = room - 2 * padX - 1;
  if (em <= 0 || em * size <= avail) return size;
  return Math.max(8.5, Math.floor((avail / em) * 10) / 10);
}

/** The badges: on a card (centred, 5 dp over its top) and on the picked one (inside its top left, by the crown tab). */
export const BADGE = { h: 18.6, size: 10.3, padX: 8.4, sizeOn: 10.8, padXOn: 3.6, leftOn: 4.4, crownTab: 20 } as const;

/** Rows of `cols` (the last one may be shorter). */
export function rowsOf<T>(list: readonly T[], cols: number): T[][] {
  const n = Math.max(1, Math.floor(cols) || 1);
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += n) rows.push(list.slice(i, i + n));
  return rows;
}

/**
 * The rights panel: two rights a row as in the design (its icon circle 15.7 dp from the panel's edge or the divider,
 * the words 10 dp after it); tighter where that leaves the words less than 104 dp (a phone under ~385 dp), so
 * "Profiline bakanları gör" stays one line; one right a row where two leave too little room for a word.
 */
const PERK_DESIGN = { padL: 15.7, padR: 10, circle: 35.6, icon: 19, gap: 10, divider: 0.75 } as const;
const PERK_TIGHT = { padL: 10, padR: 6, circle: 30, icon: 17, gap: 8, divider: 0.75 } as const;
const roomIn = (panelW: number, cols: number, m: typeof PERK_DESIGN | typeof PERK_TIGHT) => (panelW - (cols - 1) * m.divider) / cols - m.padL - m.circle - m.gap - m.padR;
export function perkMetrics(panelW: number) {
  const cols = panelW < 300 ? 1 : 2;
  return { cols, ...(cols === 2 && roomIn(panelW, cols, PERK_DESIGN) < 104 ? PERK_TIGHT : PERK_DESIGN) };
}
/** The room a right's words get in its column. */
export const perkTextRoom = (panelW: number) => {
  const m = perkMetrics(panelW);
  return roomIn(panelW, m.cols, m);
};

/** A comparison cell in words: a tick is "var", a cross "yok"; a text cell says itself. */
export const compareCellA11y = (v: string | boolean) => (typeof v === 'boolean' ? (v ? 'var' : 'yok') : v);
/** A comparison row, read as one: "Seviyeleri gizle: abone olmayan yok, abone var". */
export const compareRowA11y = (name: string, free: string | boolean, sub: string | boolean) => `${name}: abone olmayan ${compareCellA11y(free)}, abone ${compareCellA11y(sub)}`;

// --- The picked level's colours (the client, 20 Nov 2026: "match the main screens to the VIP badge's colour") -------
/** A level's colours as the VIP set has them (components/vip/level-art card): the bubble's inner tones and its rim's. */
export type LevelColors = { inner: readonly [string, string]; rim: readonly [string, string] };
/**
 * Each VIP level's badge colour: the median of the badge shield's saturated, non-gold pixels (scripts/vip-hero-assets.py
 * prints them; the heroes are recoloured to the same). The page, the cards and the panel take it.
 */
export const BADGE_COLORS: Record<number, string> = {
  1: '#011a49',
  2: '#01164b',
  3: '#034603',
  4: '#021177',
  5: '#630600',
  6: '#510200',
  7: '#49025e',
  8: '#011e56',
  9: '#4a025c',
  10: '#620400',
};
/**
 * Ben's VIP tile in the level's colour, the one the VIP tab draws that level in (its badge's): a little lighter at the
 * top left, deep at the bottom right. Null under VIP 1: the tile keeps its own pink (owners, 22 Nov 2026).
 */
export function vipCardColors(level: number): [string, string] | null {
  const at = levelArtFor(level);
  const base = at ? BADGE_COLORS[at] : undefined;
  return base ? [mixHex(base, '#ffffff', 0.15), mixHex(base, '#000000', 0.3)] : null;
}
/** The VIP tab drawn in a level's colours: the page, the rights' cards and the points panel. */
export type VipTint = {
  page: readonly [string, string, string, string];
  pageTop: string;
  rim: readonly [string, string, string, string];
  glass: readonly [string, string, string, string];
  corner: string;
  glow: string;
  infoRim: readonly [string, string, string, string, string];
  info: readonly [string, string, string, string, string, string];
  infoSide: readonly [string, string, string];
};

const rgbOf = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** `a` moved `t` (0…1) of the way to `b`, as #rrggbb; `a` itself when either isn't #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return a;
  const k = Math.max(0, Math.min(1, t));
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}
/** `hex` with alpha `a`, as rgba(). */
export function alphaHex(hex: string, a: number): string {
  const x = rgbOf(hex) ?? [0, 0, 0];
  return `rgba(${x[0]},${x[1]},${x[2]},${a})`;
}

/**
 * The VIP tab in a level's colours: the page a deep shade of the level's colour, the cards' glass and the points
 * panel in it (lighter at the top, as the design's purple), their rims in the level's rim tones. Null (the design's
 * purple) without colours or with a broken one.
 */
export function vipTint(c: LevelColors | null | undefined): VipTint | null {
  if (!c || ![...c.inner, ...c.rim].every((h) => rgbOf(h))) return null;
  const base = c.inner[1];
  const [rimTop, rimLow] = c.rim;
  const dark = (t: number) => mixHex(base, '#000000', t);
  const light = (t: number) => mixHex(base, '#ffffff', t);
  return {
    page: [dark(0.62), dark(0.78), dark(0.8), dark(0.66)],
    pageTop: alphaHex(light(0.3), 0.12),
    rim: [rimTop, mixHex(rimTop, base, 0.45), mixHex(rimLow, base, 0.5), rimLow],
    glass: [light(0.14), base, dark(0.3), dark(0.5)],
    corner: alphaHex(light(0.2), 0.6),
    glow: light(0.5),
    infoRim: [rimTop, mixHex(rimTop, base, 0.3), mixHex(rimLow, base, 0.45), mixHex(rimLow, base, 0.3), rimLow],
    info: [light(0.18), light(0.06), dark(0.25), dark(0.45), dark(0.45), dark(0.3)],
    infoSide: [alphaHex(light(0.25), 0), alphaHex(light(0.25), 0.45), alphaHex(light(0.35), 0.8)],
  };
}
