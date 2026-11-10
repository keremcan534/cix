// How far other people are from the viewer, by their two profile cities (city-coords.mjs), for lists that don't
// read each person's city already: Anlar's writers (moments.mjs). Keşfet and the profile work it out from the city
// they show (social.mjs).
import { db } from './core.mjs';
import { cityDistance } from './city-coords.mjs';
import { shownToViewer } from './privacy.mjs';

/**
 * From `viewer` (a users row) to each of `ids`: id → { km, sameCity } or null (missing ids too). None to the viewer
 * themselves, when either city is empty or not one we know, or when the profile isn't public to the viewer
 * ("Profilim herkese açık" off hides the city, privacy.mjs shownToViewer, so the distance goes with it).
 */
export async function distancesFrom(viewer, ids) {
  const out = new Map();
  const list = [...new Set(ids)].filter((id) => id !== viewer.id);
  if (!viewer.city || !list.length) return out;
  const r = await db.query('SELECT id, city FROM users WHERE id = ANY($1::uuid[]) AND city IS NOT NULL AND deleted_at IS NULL', [list]);
  for (const p of await shownToViewer(db, viewer.id, r.rows)) out.set(p.id, cityDistance(viewer.city, p.city));
  return out;
}
