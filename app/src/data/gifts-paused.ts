// Gifts off the shelf for now (the owner, 14 Nov): the ones with no animation of their own (no video, server/api/fx.mjs;
// no show, data/gift-shows), except the four standard gifts the price list keeps (Gül, Kalp, Kahve, Pasta). The same
// list as server/api/catalog.mjs GIFTS_PAUSED (tests/server-catalog.test.ts): the server leaves them out of the
// catalog, so older apps drop them too, and lib/live/catalog-live visibleGifts leaves them out here. A send from an
// older app still goes through. Taking an id out of both lists brings the gift back.
export const GIFTS_PAUSED: ReadonlySet<string> = new Set([
  // Popüler
  'g5', 'g7', 'g8', 'h1', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11',
  // Kutlama: thrown at a seat by the plain flight, no animation of their own
  'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10',
  // İkili
  'c1', 'c2', 'c4', 'c5', 'c7', 'c9', 'c10', 'c11', 'c12',
  // Özel
  'v1', 'v2', 'v3', 'v4', 'v5',
]);
