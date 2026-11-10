// How far other people are from me in a live build: the server's rounded distance between our two profile cities
// (server/api/city-coords.mjs), by server id, for Keşfet's cards, the profile and Anlar. Put by the lists and the
// profile screen when they read someone. Never worked out here (the phone has no location and no city table), so
// someone not read yet, with an unknown city or a profile private to me shows none.
import type { CityDistance } from '@/lib/api';

const known = new Map<string, CityDistance | null>();

/** What a server answer said about them; `undefined` (an older server sends no field) keeps what was known. */
export function putDistance(serverId: string, d: CityDistance | null | undefined) {
  if (d !== undefined) known.set(serverId, d ? { km: d.km, sameCity: d.sameCity } : null);
}

/** Their distance, or null when there is none to show or it hasn't been read. */
export const distanceOf = (serverId: string) => known.get(serverId) ?? null;

/** As the screens show it: "Aynı şehir", "40 km", "1.250 km"; null when there is none. */
export function cityDistanceText(d: CityDistance | null | undefined): string | null {
  if (!d) return null;
  if (d.sameCity) return 'Aynı şehir';
  return Number.isFinite(d.km) && d.km > 0 ? `${Math.round(d.km).toLocaleString('tr-TR')} km` : null;
}
