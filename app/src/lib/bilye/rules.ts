// Bilye Şelalesi: what a launch pays. The same rules as the server's (server/api/casino-rules.mjs, the "Bilye
// Şelalesi" part); tests/bilye.test.ts keeps the two equal, draw for draw.
//
// A round is one draw: a number below BILYE_TOTAL picks the target (a pocket or a cup, board TARGETS) by the
// weights of the launch strength, and the target's multiplier is paid. The weights come from the board itself
// (lib/bilye/table: where the simulated balls of each strength really end), scaled so that every strength pays back
// at most 40 % of what is played (the house rule of every coin game). The path on the screen is then a real flight
// that ends in the drawn target (lib/bilye/path): the simulation shows the round, it never decides it.
//
// The share paid back can be lowered by a live setting (20–40 %): the paying targets then come up that much less
// often and the empty pockets more; what a target pays never changes.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.
import { LANES, LANE_NAME, TARGETS, type Lane } from '@/lib/bilye/board';
import { WEIGHTS } from '@/lib/bilye/table';

/** The weights of a strength add up to this; a round's draw is a number below it. */
export const BILYE_TOTAL = 100_000;
/** The share of the stakes paid back, in percent: the house rule's, and the lowest the setting goes. */
export const BILYE_RETURN = 40;
export const BILYE_RETURN_MIN = 20;
/** What each target pays, in tenths of the stake (whole numbers, so the sums are exact). */
export const BILYE_TENTHS: readonly number[] = TARGETS.map((t) => Math.round(t.mult * 10));
export const isLane = (v: unknown): v is Lane => typeof v === 'string' && (LANES as readonly string[]).includes(v);

/**
 * Shares `total` among the entries of `parts` in proportion to them, in whole numbers that add up to `total`
 * exactly: each gets its whole part, and what is left goes one by one to the largest remainders (the lower index
 * first when equal). Entries of 0 get nothing.
 */
export function shareOut(total: number, parts: readonly number[]): number[] {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return parts.map(() => 0);
  const out = parts.map((p) => (p * total - ((p * total) % sum)) / sum);
  const rest = parts.map((p, k) => ({ k, r: (p * total) % sum }));
  rest.sort((a, b) => b.r - a.r || a.k - b.k);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i++, left--) out[rest[i].k]++;
  return out;
}

/**
 * The weights of a launch strength when `rate` percent is paid back: the paying targets keep rate/40 of their
 * weight (rounded down, so the share is never exceeded) and the empty pockets take up what they give up.
 */
export function bilyeWeights(lane: Lane, rate: number = BILYE_RETURN): number[] {
  const base = WEIGHTS[lane];
  if (rate >= BILYE_RETURN) return [...base];
  const out = base.map((w, k) => (BILYE_TENTHS[k] ? (w * rate - ((w * rate) % BILYE_RETURN)) / BILYE_RETURN : 0));
  const freed = BILYE_TOTAL - out.reduce((a, b) => a + b, 0) - base.reduce((a, w, k) => a + (BILYE_TENTHS[k] ? 0 : w), 0);
  const extra = shareOut(freed, base.map((w, k) => (BILYE_TENTHS[k] ? 0 : w)));
  return out.map((w, k) => (BILYE_TENTHS[k] ? w : base[k] + extra[k]));
}

/** The target draw `d` (0 … BILYE_TOTAL − 1) picks. */
export function bilyeTarget(lane: Lane, d: number, rate: number = BILYE_RETURN): number {
  const w = bilyeWeights(lane, rate);
  let at = 0;
  for (let k = 0; k < w.length; k++) {
    at += w[k];
    if (d < at) return k;
  }
  return w.length - 1;
}

/** Exact share of the stake a strength pays back at `rate`. */
export function bilyeReturn(lane: Lane, rate: number = BILYE_RETURN): number {
  return bilyeWeights(lane, rate).reduce((a, w, k) => a + w * BILYE_TENTHS[k], 0) / (10 * BILYE_TOTAL);
}
/** The most a launch can pay, in stakes. */
export const BILYE_MAX = Math.max(...TARGETS.map((t) => t.mult));

export type BilyeRound = { lane: Lane; target: number; /** Which of the known paths into the target the screen shows. */ variant: number };
/** How many path choices a round carries (the screen takes it modulo the paths it knows). */
export const BILYE_VARIANTS = 1 << 16;
/** One round from a uniform draw function (rnd(n) → 0 … n − 1): the target first, then the path. */
export function playBilye(lane: Lane, rnd: (n: number) => number, rate: number = BILYE_RETURN): BilyeRound & { multiplier: number } {
  const target = bilyeTarget(lane, rnd(BILYE_TOTAL), rate);
  return { lane, target, variant: rnd(BILYE_VARIANTS), multiplier: BILYE_TENTHS[target] / 10 };
}
/** The history's line for a round. */
export function bilyeDetail(r: BilyeRound): string {
  const t = TARGETS[r.target];
  const pays = t.mult ? `${String(t.mult).replace('.', ',')}x` : 'boş';
  return `${LANE_NAME[r.lane]} atış · ${t.name} · ${pays}`;
}
