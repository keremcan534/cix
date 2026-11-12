// Pachinko on the server: a launch's round. The same rules as the app's (app/src/lib/bilye/rules.ts); the
// app's tests/casino-server.test.ts keeps them equal, draw for draw, so the screen flies the ball into the target
// the server drew. The weights come from the app's simulation of the board (bilye-table.mjs, generated) and give
// every launch strength an expected return of at most 40 % (the house rule of every coin game).
// No database and no core.mjs, so the app's tests can import this file.
import { LANES, LANE_NAME, TARGET_NAMES, TENTHS, WEIGHTS } from './bilye-table.mjs';

export const BILYE_TOTAL = 100_000;
export const BILYE_VARIANTS = 1 << 16;
export const BILYE_TENTHS = TENTHS;
export const BILYE_MAX = Math.max(...TENTHS) / 10;
export const BILYE_PICKS = LANES;
export { WEIGHTS as BILYE_WEIGHTS };

/** The target draw `d` (0 … BILYE_TOTAL − 1) picks for a launch of strength `lane`. */
export function bilyeTarget(lane, d) {
  const w = WEIGHTS[lane];
  let at = 0;
  for (let k = 0; k < w.length; k++) {
    at += w[k];
    if (d < at) return k;
  }
  return w.length - 1;
}
/** Exact share of the stake a strength pays back. */
export const bilyeReturn = (lane) => WEIGHTS[lane].reduce((a, w, k) => a + w * TENTHS[k], 0) / (10 * BILYE_TOTAL);
/** One round from a uniform draw function (rnd(n) → 0 … n − 1): the target first, then the path. */
export function playBilye(lane, rnd) {
  const target = bilyeTarget(lane, rnd(BILYE_TOTAL));
  return { lane, target, variant: rnd(BILYE_VARIANTS), multiplier: TENTHS[target] / 10 };
}
const multText = (m) => `${String(m).replace('.', ',')}x`;
/** The history's line for a round. */
export function bilyeDetail(r) {
  const m = TENTHS[r.target] / 10;
  return `${LANE_NAME[r.lane]} atış · ${TARGET_NAMES[r.target]} · ${m ? multText(m) : 'boş'}`;
}
