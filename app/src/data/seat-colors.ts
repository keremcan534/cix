// Koltuk rengi: the color of a room's empty mics (server/api/room-seat-color.mjs), bought for the room by its owner
// for the color's days (none: for good); silver is every room's free default. A seat is drawn in any color
// (components/room/seat-pouf: its cushion tinted, its gold kept), so Yönetim › Mağaza › Koltuk renkleri changes these
// (name, price, days, color) and adds more: the shop's list (GET /api/catalog?shop=1, kind seat, lib/shop-live-core)
// is what the app shows; this compiled list stands in before it comes (and from an older server). In step with the
// server's catalog (server/api/catalog.mjs SEAT_COLORS); tests/server-catalog.test.ts fails when they drift.
export type SeatColorId = string;
/** A seat color as the app shows it: its price for `days` (null: for good), its cushion's color, off the shelf or not. */
export type SeatColor = { id: SeatColorId; name: string; price: number; days: number | null; color: string; off?: true; isDefault?: true };

/** Every room's color until its owner picks another (the server writes it by this id). */
export const SEAT_DEFAULT: SeatColorId = 'gumus';

export const SEAT_COLORS: readonly { id: SeatColorId; name: string; price: number; color: string }[] = [
  { id: 'gumus', name: 'Gümüş', price: 0, color: '#D5DAE1' },
  { id: 'pembe', name: 'Açık Pembe', price: 2_000, color: '#F4B6C8' },
  { id: 'kirmizi', name: 'Kırmızı', price: 2_000, color: '#D2453F' },
  { id: 'turuncu', name: 'Turuncu', price: 2_000, color: '#EE9447' },
  { id: 'yesil', name: 'Haki', price: 2_000, color: '#9C9A6A' },
  { id: 'turkuaz', name: 'Turkuaz', price: 2_000, color: '#46B3B0' },
];
const COMPILED: readonly SeatColor[] = SEAT_COLORS.map((c) => ({ ...c, days: null, ...(c.id === SEAT_DEFAULT ? { isDefault: true as const } : {}) }));

/** A seat color's id as the server writes one (the app's own, or an admin's 'sc…'). */
export const isSeatColorId = (v: unknown): v is SeatColorId => typeof v === 'string' && /^[a-z][a-z0-9-]{1,31}$/.test(v);

let live: readonly SeatColor[] | null = null;
/** The shop's seat colors (lib/live/catalog-live, as it reads the shop); null or none: the compiled ones. */
export function setLiveSeatColors(list: readonly SeatColor[] | null) {
  live = list && list.length ? list : null;
}
/** Every seat color, in the shop's order: the default first unless the panel moved it, those off the shelf too. */
export const seatColors = (): readonly SeatColor[] => live ?? COMPILED;
/** A seat color by its id; an unknown or missing one is the default (an older list, a color deleted since). */
export function seatColorOf(id: SeatColorId | null | undefined): SeatColor {
  const all = seatColors();
  return all.find((c) => c.id === (id ?? SEAT_DEFAULT)) ?? all.find((c) => c.isDefault) ?? COMPILED[0];
}
export const seatColorName = (id: SeatColorId | null | undefined) => seatColorOf(id).name;

const lastByRoom = new Map<string, SeatColorId>();
/**
 * A room's seat color as this phone draws it: its metadata's (lib/live/room-bus); while there is none (joining, or the
 * voice connection coming back, when the room's state is read again) the last one this phone saw in the room, so the
 * seats don't flash to the default and back.
 */
export function roomSeatColorShown(room: string, fromMeta: SeatColorId | null | undefined): SeatColorId | null {
  if (!fromMeta) return lastByRoom.get(room) ?? null;
  if (lastByRoom.get(room) !== fromMeta) {
    lastByRoom.delete(room);
    lastByRoom.set(room, fromMeta);
    if (lastByRoom.size > 100) lastByRoom.delete(lastByRoom.keys().next().value!);
  }
  return fromMeta;
}
