// Şanslı hediye packages as the server says they are (server/api/lucky.mjs GET /api/lucky, lucky-art.mjs; Güncelleme 7
// madde 10): read without trusting the answer, each package's own icon from the panel (components/GiftArt draws it
// before the app's picture; a package with neither shows its emoji), and when my own send's result card waits for
// the package's video. Pure: lib/live/lucky reads the server and fills this; the room asks it.
import type { Cue, Stage } from '@/lib/fx-queue';
import type { LuckyGift, LuckyTier } from '@/lib/lucky';

/** A package from the server, with what only the server knows: whether it takes sends today and its `since`. */
export type ServerLuckyPackage = LuckyGift & { open: boolean; icon: string | null };

const LUCKY_ID = /^lk[a-z0-9]{1,20}$/;
const ICON_URL = /^https?:\/\/[^\s"'<>\\]{1,600}$/;
/** Nothing the server lists is near these; anything past them is a mistake, not a package to show. */
const MAX_PACKAGES = 20;
const PRICE_MAX = 10_000_000;
// lib/lucky's ODDS_TOTAL and LUCKY_MULTS (server/api/lucky-rules.mjs), kept here so the room's packet reader
// (lib/live/room-bus) doesn't load the whole Şanslı module; tests/lucky-art.test.ts holds them equal.
export const ODDS_TOTAL = 100_000;
const MULTS = new Set<number>([0, 2, 5, 10, 20, 50, 100, 200, 500, 1000]);
export const LUCKY_ART_MULTS = [...MULTS].filter((m) => m > 0);

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const whole = (x: unknown, min: number, max: number) => (typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max ? x : null);

/** An icon address the server gave, or null (none, or not one this phone would load). */
export const parseLuckyIcon = (x: unknown): string | null => (typeof x === 'string' && ICON_URL.test(x) ? x : null);

/** An odds table: whole weights of known multipliers, each once, adding up to 100 %; null otherwise. */
function tiersOf(x: unknown): LuckyTier[] | null {
  if (!Array.isArray(x) || !x.length || x.length > MULTS.size) return null;
  const seen = new Set<number>();
  const out: LuckyTier[] = [];
  for (const t of x) {
    const mult = whole(obj(t).mult, 0, 1000);
    const weight = whole(obj(t).weight, 0, ODDS_TOTAL);
    if (mult === null || weight === null || !MULTS.has(mult) || seen.has(mult)) return null;
    seen.add(mult);
    out.push({ mult, weight });
  }
  return out.reduce((n, t) => n + t.weight, 0) === ODDS_TOTAL ? out : null;
}

/**
 * GET /api/lucky `gifts`: the packages on sale, in the server's order. One with anything malformed (an odds table that
 * doesn't add up included: it could never be shown truthfully) or that comes twice is left out; never thrown. A
 * malformed icon is no icon.
 */
export function parseLuckyPackages(list: unknown): ServerLuckyPackage[] {
  if (!Array.isArray(list)) return [];
  const out: ServerLuckyPackage[] = [];
  const seen = new Set<string>();
  for (const x of list.slice(0, MAX_PACKAGES * 2)) {
    const g = obj(x);
    if (typeof g.id !== 'string' || !LUCKY_ID.test(g.id) || seen.has(g.id)) continue;
    const name = typeof g.name === 'string' ? g.name.replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    const emoji = typeof g.emoji === 'string' && g.emoji.trim() && g.emoji.length <= 16 ? g.emoji.trim() : '🍀';
    const price = whole(g.price, 1, PRICE_MAX);
    const tiers = tiersOf(g.tiers);
    if (!name || price === null || !tiers) continue;
    seen.add(g.id);
    out.push({ id: g.id, name, emoji, price, enabled: g.enabled !== false, tiers, open: g.open !== false, icon: parseLuckyIcon(g.icon) });
    if (out.length >= MAX_PACKAGES) break;
  }
  return out;
}

/**
 * What a send carries (server/api/lucky-rules.mjs checkShownLucky): the package's price the sheet showed and the
 * settings' version the packages came with. A moved one is refused there with nothing moved (409 price_changed /
 * odds_changed). None for a package the sheet never had.
 */
export const luckyShown = (gift: { price: number } | undefined, version: number): { price: number; version: number } | undefined =>
  gift && Number.isSafeInteger(gift.price) && gift.price > 0 && Number.isSafeInteger(version) && version >= 1 ? { price: gift.price, version } : undefined;

// --- The packages' own icons -------------------------------------------------------------------------------------
let icons = new Map<string, string>();
/** A package's icon from the panel, when the server gave one (GiftArt draws it before the app's own picture). */
export const luckyIconOf = (id: string): string | undefined => icons.get(id);
/** The icons of the packages the server listed (GET /api/lucky): the whole set, so one taken off goes. */
export function setLuckyIcons(list: readonly { id: string; icon: string | null }[]) {
  icons = new Map(list.filter((g) => g.icon).map((g) => [g.id, g.icon as string]));
}
/**
 * A package's icon as a room's Şanslı packet carries it (someone else's send of a package this phone hasn't read):
 * a string sets it, null takes it off, undefined (an older server's packet) says nothing.
 */
export function noteLuckyIcon(id: string, icon: string | null | undefined) {
  if (icon === undefined || !LUCKY_ID.test(id)) return;
  const next = new Map(icons);
  if (icon) next.set(id, icon);
  else next.delete(id);
  icons = next;
}

// --- My send's result after its video ---------------------------------------------------------------------------
/**
 * Whether my send of package `giftId` still has its video on the stage (lib/fx-queue: playing, or waiting its turn
 * behind the gifts before it): the result card (components/room/lucky-result) shows once it is over, so the
 * animation and then the win, never both at once. A cue the line dropped to stay short no longer holds it.
 */
export function luckyVideoPending<P>(stage: Stage<P>, giftId: string): boolean {
  const mine = (c: Cue<P> | null) => !!c && c.from === 'me' && c.what === giftId;
  return mine(stage.now) || stage.next.some(mine);
}
