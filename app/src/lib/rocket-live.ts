// Canlı Yörünge's numbers: the same rules as the server's server/api/rocket-live-rules.mjs (tests/rocket-live.test.ts
// keeps them equal), so the screen draws the climb the server pays. Nothing here decides a round: the server draws the
// crash point, pays every escape and tells the screen where the round stands (lib/live/rocket-live).
//
// Every multiplier is in hundredths (2,15× is 215). The multiplier t seconds after launch is e^(rate · t); the rate
// comes from the server (RATE until it answers). The crash point is drawn so that P(crash ≥ x) ≤ ret% / x: an escape at
// any x gives back at most ret % of the fuel on average, and the rest of the rounds (the house share) blow up on the pad.
// Pure (no React, no app imports).

export const LIVE_DRAW = 1_000_000;
export const LIVE_MAX = 100_000;
export const RATE = 0.075;
export const AUTO_MIN = 101;
export const AUTO_MAX = 100_000;
export const HOUSE_PCT = 60;

/** Crash point in hundredths for a draw 0…LIVE_DRAW−1 and a return share in percent; 0: it blows up on the pad. */
export function crashOf(d: number, retPct: number): number {
  const c = Math.floor((retPct * LIVE_DRAW) / (d + 1));
  return c < 100 ? 0 : Math.min(c, LIVE_MAX);
}

/** The exact chance (0…1) that a round's crash point is at least `x` hundredths. */
export function reachChance(x: number, retPct: number): number {
  if (x <= 0) return 1;
  if (x > LIVE_MAX) return 0;
  return Math.min(LIVE_DRAW, Math.floor((retPct * LIVE_DRAW) / Math.max(x, 100))) / LIVE_DRAW;
}

/** The multiplier in hundredths `ms` after launch, never rounded up. */
export const multAt = (ms: number, rate = RATE) => (ms <= 0 ? 100 : Math.floor(100 * Math.exp((rate * ms) / 1000) + 1e-9));

/** The first whole millisecond after launch at which the climb has reached `x` hundredths. */
export function msTo(x: number, rate = RATE): number {
  if (x <= 100) return 0;
  let t = Math.ceil((1000 * Math.log(x / 100)) / rate);
  while (t > 0 && multAt(t - 1, rate) >= x) t--;
  while (multAt(t, rate) < x) t++;
  return t;
}

/** What `fuel` coins pay when they leave at `x` hundredths (whole coins, rounded down). */
export const payoutOf = (fuel: number, x: number) => Math.floor((fuel * x) / 100);

/** A multiplier in hundredths as the screen writes it: 2,15×, 1.000,00×. Never rounded up. */
export function mulText(x: number): string {
  const c = Math.max(0, Math.floor(x));
  return `${Math.floor(c / 100).toLocaleString('tr-TR')},${String(c % 100).padStart(2, '0')}×`;
}

/** The automatic escapes the screen offers, in hundredths. */
export const AUTO_CHOICES = [120, 150, 200, 300, 500, 1000, 2000, 5000];
