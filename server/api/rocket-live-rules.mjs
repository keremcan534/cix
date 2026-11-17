// Canlı Yörünge (rocket-live.mjs): the numbers of Oyun Salonu's live rocket, which everyone plays at once. The same
// rules as the app's lib/rocket-live.ts (tests/rocket-live.test.ts keeps them equal), so a screen shows the climb the
// server pays. No database and no core.mjs, so the app's tests can import this file.
//
// A round: fuel goes on board while the betting window is open, then the rocket climbs from 1,00× at e^(rate · t)
// and blows up at the round's crash point. Fuel that left before (a tap on Kaç, or its automatic target) gets fuel ×
// the multiplier at that moment; fuel still on board when it blows up is lost.
//
// Every multiplier is kept in hundredths (an integer: 2,15× is 215), so the money never meets a rounding.
// The crash point is drawn before the round opens: c = ⌊ ret · N / (d + 1) ⌋ for a uniform draw d in 0…N−1, where
// ret is the share of the stakes that goes back (100 − the house share of the live setting rocket_house_pct). Then
// P(c ≥ 100·x) ≤ ret% / x, so an escape at any x, by hand or automatic, returns at most ret % of its fuel. Below
// 1,00× (a share of the rounds equal to the house share) the rocket blows up on the pad.

export const LIVE_DRAW = 1_000_000;
/** The highest crash point, in hundredths (1.000×). */
export const LIVE_MAX = 100_000;
/** Climb speed per second: the multiplier t seconds after launch is e^(RATE · t). 2× in 9,2 s, 10× in 31 s, 100× in 61 s. */
export const RATE = 0.075;
/** The lowest and highest automatic escape, in hundredths. */
export const AUTO_MIN = 101;
export const AUTO_MAX = 100_000;
/** The house share of the live rocket by default (live setting rocket_house_pct): the house rule of every coin game. */
export const HOUSE_PCT = 60;

/** Crash point in hundredths for a draw 0…LIVE_DRAW−1 and a return share in percent; 0: it blows up on the pad. */
export function crashOf(d, retPct) {
  const c = Math.floor((retPct * LIVE_DRAW) / (d + 1));
  return c < 100 ? 0 : Math.min(c, LIVE_MAX);
}

/** The exact chance (0…1) that a round's crash point is at least `x` hundredths, over every draw. */
export function reachChance(x, retPct) {
  if (x <= 0) return 1;
  if (x > LIVE_MAX) return 0;
  // crashOf is at least x exactly for the draws below a threshold; below 1,00× only the pad is lower.
  return Math.min(LIVE_DRAW, Math.floor((retPct * LIVE_DRAW) / Math.max(x, 100))) / LIVE_DRAW;
}

/** What an escape at `x` hundredths returns on average per coin of fuel (at most retPct / 100). */
export const escapeReturn = (x, retPct) => (x * reachChance(x, retPct)) / 100;

/** The multiplier in hundredths `ms` after launch, never rounded up. */
export const multAt = (ms, rate = RATE) => (ms <= 0 ? 100 : Math.floor(100 * Math.exp((rate * ms) / 1000) + 1e-9));

/** The first whole millisecond after launch at which the climb has reached `x` hundredths. */
export function msTo(x, rate = RATE) {
  if (x <= 100) return 0;
  let t = Math.ceil((1000 * Math.log(x / 100)) / rate);
  // Floating point may land a millisecond either side; the multiplier shown and paid is multAt's.
  while (t > 0 && multAt(t - 1, rate) >= x) t--;
  while (multAt(t, rate) < x) t++;
  return t;
}

/** What `fuel` coins pay when they leave at `x` hundredths (whole coins, rounded down). */
export const payoutOf = (fuel, x) => Math.floor((fuel * x) / 100);

/** The house's part of a stake at `housePct` percent, booked at launch; the rest joins the payout pool. */
export const houseOf = (fuel, housePct) => Math.round((fuel * housePct) / 100);

/**
 * How far the pool lets the round climb: `pool` (after this round's stakes joined it) shared out over `total` coins of
 * fuel, in hundredths. A crash point above it is cut there, so the round never owes more than the pool holds.
 */
export const poolCap = (pool, total) => (total > 0 ? Math.floor((pool * 100) / total) : LIVE_MAX);

/** A person's name as the round shows it to everyone: the first three letters and two stars ("Ahm**"). */
export function maskName(name) {
  const chars = Array.from(String(name ?? '').trim());
  if (!chars.length) return 'Oyuncu';
  return `${chars.slice(0, chars.length > 3 ? 3 : 1).join('')}**`;
}

/** An automatic escape from a request: hundredths within AUTO_MIN…AUTO_MAX, null for none, undefined when invalid. */
export function autoOf(v) {
  if (v === null || v === undefined || v === 0) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const x = Math.round(v * 100);
  if (Math.abs(x - v * 100) > 1e-6 || x < AUTO_MIN || x > AUTO_MAX) return undefined;
  return x;
}
