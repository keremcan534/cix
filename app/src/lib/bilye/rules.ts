// Pachinko: what a launch pays. The same rules as the server's (server/api/casino-bilye.mjs); tests keep the
// two equal, draw for draw (tests/casino-server.test.ts) and the table equal to the board (tests/bilye.test.ts).
//
// A round is one draw: a number below BILYE_TOTAL picks the target (a pocket or a cup, board TARGETS) by the
// weights of the launch strength, and the target's multiplier is paid. The weights come from the board itself
// (lib/bilye/table: where the simulated balls of each strength really end), scaled so that every strength pays back
// at most 40 % of what is played (the house rule of every coin game). The path on the screen is then a real flight
// that ends in the drawn target (lib/bilye/path): the simulation shows the round, it never decides it.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.
import { LANES, LANE_NAME, TARGETS, type Lane } from '@/lib/bilye/board';
import { WEIGHTS } from '@/lib/bilye/table';

/** The weights of a strength add up to this; a round's draw is a number below it. */
export const BILYE_TOTAL = 100_000;
/** What each target pays, in tenths of the stake (whole numbers, so the sums are exact). */
export const BILYE_TENTHS: readonly number[] = TARGETS.map((t) => Math.round(t.mult * 10));
/** The most a launch can pay, in stakes. */
export const BILYE_MAX = Math.max(...BILYE_TENTHS) / 10;
/** How many path choices a round carries (the screen takes it modulo the paths it knows). */
export const BILYE_VARIANTS = 1 << 16;
export const BILYE_PICKS: readonly string[] = LANES;
export const isLane = (v: unknown): v is Lane => typeof v === 'string' && (LANES as readonly string[]).includes(v);

/** The target draw `d` (0 … BILYE_TOTAL − 1) picks for a launch of strength `lane`. */
export function bilyeTarget(lane: Lane, d: number): number {
  const w = WEIGHTS[lane];
  let at = 0;
  for (let k = 0; k < w.length; k++) {
    at += w[k];
    if (d < at) return k;
  }
  return w.length - 1;
}

/** Exact share of the stake a strength pays back. */
export const bilyeReturn = (lane: Lane) => WEIGHTS[lane].reduce((a, w, k) => a + w * BILYE_TENTHS[k], 0) / (10 * BILYE_TOTAL);
/** The chance of each target for a strength (0 … 1), for the rules sheet. */
export const bilyeChances = (lane: Lane) => WEIGHTS[lane].map((w) => w / BILYE_TOTAL);

export type BilyeRound = { lane: Lane; target: number; /** Which of the known paths into the target the screen shows. */ variant: number };
/** One round from a uniform draw function (rnd(n) → 0 … n − 1): the target first, then the path. */
export function playBilye(lane: Lane, rnd: (n: number) => number): BilyeRound & { multiplier: number } {
  const target = bilyeTarget(lane, rnd(BILYE_TOTAL));
  return { lane, target, variant: rnd(BILYE_VARIANTS), multiplier: BILYE_TENTHS[target] / 10 };
}
/** A multiplier as the screens write it: 0,5x, 20x. */
export const multText = (m: number) => `${String(m).replace('.', ',')}x`;
/** The history's line for a round. */
export function bilyeDetail(r: BilyeRound): string {
  const t = TARGETS[r.target];
  return `${LANE_NAME[r.lane]} atış · ${t.name} · ${t.mult ? multText(t.mult) : 'boş'}`;
}
