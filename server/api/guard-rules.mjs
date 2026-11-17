// Koruma's numbers (docs/KORUMA.md), apart from guards.mjs so tests and the app's drift test can read them without
// the server's database and LiveKit modules.

/** The gift that starts a Koruma (catalog.mjs GIFT_ROWS, app/src/data/mock.ts GIFTS). */
export const GUARD_CARD = 'koruma';
export const GUARD_RULES = Object.freeze({
  // The midnight drop: a tenth from this many points up, else this many points.
  dropFrom: 5000,
  dropShare: 0.1,
  dropFlat: 1000,
  listMax: 50,
  // The profile's threshold: at most this many points per Yankı level (+1), changed once a week.
  thresholdPerLevel: 50_000,
  thresholdEveryDays: 7,
});
