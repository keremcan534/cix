// Yayıncı haftalık bonusu (owners, 24 Nov 2026): a streamer of an agency earns a bonus in diamonds for the diamonds they
// earned in the app's week (Monday 00:00 to Sunday 23:59:59, Türkiye time). The bonus is the one of the highest tier
// they reached ("eşiği tamamlayamayan bir önceki baremin bonusunu alır"). Pure: no database, so the app's tests and the
// registry import it.

/**
 * The owners' table: from this many diamonds earned in the week, this bonus. Below the first tier nothing; above the
 * last one, the last one's bonus (the table's top row is "5.000.000–10.000.000 → 2.500.000").
 */
export const HOST_BONUS_TIERS = Object.freeze([
  { from: 10_000, bonus: 5_000 },
  { from: 20_000, bonus: 10_000 },
  { from: 40_000, bonus: 20_000 },
  { from: 70_000, bonus: 35_000 },
  { from: 100_000, bonus: 50_000 },
  { from: 140_000, bonus: 70_000 },
  { from: 200_000, bonus: 100_000 },
  { from: 300_000, bonus: 150_000 },
  { from: 500_000, bonus: 250_000 },
  { from: 1_000_000, bonus: 500_000 },
  { from: 2_000_000, bonus: 1_000_000 },
  { from: 5_000_000, bonus: 2_500_000 },
]);

/** The setting's default: on, with the owners' table. */
export const HOST_BONUS_DEFAULT = Object.freeze({ on: true, tiers: HOST_BONUS_TIERS });

/** The tier `earned` diamonds reach (the highest whose `from` it meets), or null below the first. */
export function tierOf(earned, tiers = HOST_BONUS_TIERS) {
  let hit = null;
  for (const t of tiers) if (earned >= t.from) hit = t;
  return hit;
}

/** The next tier above `earned`, or null at the top. */
export function nextTierOf(earned, tiers = HOST_BONUS_TIERS) {
  return tiers.find((t) => t.from > earned) ?? null;
}

/** 'YYYY-MM-DD' of the Monday that starts the app's week `at` falls in (Türkiye, UTC+3 all year since 2016). */
export function weekStartOf(at = Date.now()) {
  const t = new Date(+at + 3 * 3_600_000);
  const back = (t.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back)).toISOString().slice(0, 10);
}

/** The week's bounds as instants: Monday 00:00 Türkiye (inclusive) to the next Monday 00:00 (exclusive). */
export function weekBounds(weekStart) {
  const from = Date.parse(`${weekStart}T00:00:00+03:00`);
  return { from: new Date(from), to: new Date(from + 7 * 86_400_000) };
}

/** 'YYYY-MM-DD' `days` days from a date string. */
export const addDays = (d, days) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
