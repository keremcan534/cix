// What the room's person card (components/room/person-card) shows beyond the profile's basics, worked out here so it can
// be unit tested (tests/person-card.test.ts): the ID a profile shows (a special ID they wear, else their own number),
// their medals (the server's ids in the app's names and pictures), and the part of their look the card needs (frame,
// VIP level, special ID, and their entry, ride and noble rank for the entry box) when the room hasn't read it. The server's answer is read defensively: a missing or malformed
// field just isn't shown.
import { cosmeticById } from '@/data/catalog';
import { MEDALS, displayId, publicIdOf, type Medal } from '@/data/profile';

/** The ID a profile shows and whether it is a special ID they wear (drawn in gold with ✦). */
export type ShownId = { id: string | null; special: boolean };

/**
 * The ID on someone's profile and card. The demo (`live` false): the one made from their id. Live: a special ID they
 * wear (a shop 'specialId' item, its name without "ID "), else their own number from the server (an older server: the
 * one made from their server id, data/profile publicIdOf), which agency invites, the room search and the panel take.
 * The same rule as the profile screen's ID line (app/kullanici/[id].tsx publicId).
 */
export function shownPublicId(live: boolean, user: { id: string; publicNo?: string | null }, serverId: string | null, specialSku?: string | null): ShownId {
  if (!live) return { id: displayId(user.id), special: false };
  const item = cosmeticById(specialSku);
  if (item?.kind === 'specialId') return { id: item.name.replace('ID ', ''), special: true };
  return { id: publicIdOf(user, serverId), special: false };
}

/** The medal ids in GET /api/user's answer (`medals=1`); undefined when the server sent none (an older one). */
export function medalIds(x: unknown): string[] | undefined {
  if (!Array.isArray(x)) return undefined;
  return [...new Set(x.filter((m): m is string => typeof m === 'string' && m.length > 0 && m.length <= 16))];
}

/** Their medals as this app draws them, in the Vitrin's order; an id this app doesn't know is left out. */
export const medalsFrom = (ids: readonly string[] | undefined): Medal[] => (ids ? MEDALS.filter((m) => ids.includes(m.id)) : []);

/**
 * The look the card needs: their worn frame, their VIP level and a special ID they wear, and what shows when they come
 * into a room (their entry effect, ride and noble rank: the card's entry box, lib/entry-box). The server has sent all
 * of it in this answer all along (economy.mjs looksOf); a card before the entry box read only the first three.
 */
export type CardLook = { frame: string | null; vipLevel: number; specialId: string | null; entry: string | null; ride: string | null; noble: number | null };

const sku = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);
const level = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0);

/** GET /api/user's `looks` (economy.mjs looksOf): null when missing or not an object; a bad field counts as none. */
export function cardLookOf(x: unknown): CardLook | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  return { frame: sku(o.frame), vipLevel: level(o.vipLevel), specialId: sku(o.specialId), entry: sku(o.entry), ride: sku(o.ride), noble: level(o.noble) || null };
}

/** A country code GET /api/user sent (profile extras), or null: two capital letters only. */
export const countryCodeOf = (x: unknown): string | null => (typeof x === 'string' && /^[A-Z]{2}$/.test(x) ? x : null);
