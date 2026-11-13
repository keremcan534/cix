// Koltuk rengi: the color of a room's empty mics (server/api/room-seat-color.mjs), bought once per room by its owner
// and kept; turquoise is the free default. In step with the server's catalog (server/api/catalog.mjs SEAT_COLORS);
// tests/server-catalog.test.ts fails when they drift. The pictures: components/RoomArt SEAT_COLOR_ART.
export type SeatColorId = 'turkuaz' | 'pembe' | 'kirmizi' | 'turuncu' | 'yesil' | 'gumus';

export const SEAT_COLORS: readonly { id: SeatColorId; name: string; price: number }[] = [
  { id: 'turkuaz', name: 'Turkuaz', price: 0 },
  { id: 'pembe', name: 'Pembe', price: 2_000 },
  { id: 'kirmizi', name: 'Kırmızı', price: 2_000 },
  { id: 'turuncu', name: 'Turuncu', price: 2_000 },
  { id: 'yesil', name: 'Yeşil', price: 2_000 },
  { id: 'gumus', name: 'Gümüş', price: 3_000 },
];

export const isSeatColor = (v: unknown): v is SeatColorId => SEAT_COLORS.some((c) => c.id === v);
export const seatColorName = (id: SeatColorId | null | undefined) => SEAT_COLORS.find((c) => c.id === (id ?? 'turkuaz'))?.name ?? 'Turkuaz';
