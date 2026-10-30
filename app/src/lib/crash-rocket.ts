// Roket: a crash game. The rocket climbs from 1.00x and explodes at the round's crash point; your bet pays your
// cash-out multiplier when the rocket gets there first. The crash point is drawn before launch:
//   crash = ⌊ 0.4 · N / (d + 1) ⌋ / 100 for a uniform draw d in 0…N−1 (N = DRAW), capped at ROCKET_MAX,
// so P(crash ≥ x) ≤ 0.4 / x and a cash-out at x returns at most 0.4 (the house rule) whatever x is. Below 1.00x the
// rocket explodes on the pad.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export const DRAW = 100_000;
export const ROCKET_MAX = 1000;
/** Cash-out targets a player can set (the round is settled at launch, against the target). */
export const ROCKET_TARGETS = [1.2, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000];

/** Crash point (two decimals) for a draw 0…DRAW−1; 0 means it exploded on the pad. */
export function crashPoint(d: number): number {
  const x = Math.floor((0.4 * DRAW * 100) / (d + 1)) / 100;
  return x < 1 ? 0 : Math.min(x, ROCKET_MAX);
}
export const rocketMultiplier = (crash: number, target: number) => (crash >= target ? target : 0);

/** Exact expected return of a cash-out at `target`, over every draw. */
export function rocketReturn(target: number): number {
  // crash ≥ target exactly for the draws below a threshold, so count them instead of looping over all of them.
  let lo = 0;
  let hi = DRAW;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (crashPoint(mid) >= target) lo = mid + 1;
    else hi = mid;
  }
  return (lo * target) / DRAW;
}
