// How a prize wheel turns to its slice and how the light runs round a bet board's options (components/games/fx/
// wheel-stage, components/games/board, components/games/wheel). The result of the round is known before any of
// this: these numbers only time how it is shown, and when the pegs tick. Pure, so it is unit tested
// (tests/spin-plan.test.ts).
import type { Board, BoardResult } from '@/lib/board-games';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mod = (a: number, n: number) => ((a % n) + n) % n;

// --- A wheel's spin -----------------------------------------------------------------------------------------

/** The share of a spin's time spent pulling the wheel back before it is let go. */
export const SPIN_WIND = 0.055;
/** The share of the run spent getting up to speed; the rest of it the wheel only slows. */
const RAMP = 0.07;
/**
 * How the wheel slows: its distance left falls as this power of the time left. 2 would be plain friction (it stops
 * abruptly), 3 creeps so slowly at the end that it looks stopped long before it is; 2.5 crawls over the last slice
 * and is still seen moving until it rests.
 */
const SLOW = 2.5;
/** Top speed of the run (ways per unit of time): the ramp covers RAMP / 2 of the way at it, the slowing (1 − RAMP) / SLOW. */
const TOP = 1 / (RAMP / 2 + (1 - RAMP) / SLOW);
const SLOWING = TOP / (SLOW * (1 - RAMP) ** (SLOW - 1));

/** The run itself, 0…1 over 0…1: up to speed within RAMP, then slowing all the way to the stop (no jump in speed). */
export function runEase(u: number): number {
  const x = clamp01(u);
  return x < RAMP ? (TOP * x * x) / (2 * RAMP) : 1 - SLOWING * (1 - x) ** SLOW;
}
/** When the run has covered `p` of its way: the inverse of runEase. */
export function runEaseAt(p: number): number {
  const y = clamp01(p);
  return y < (TOP * RAMP) / 2 ? Math.sqrt((2 * RAMP * y) / TOP) : 1 - ((1 - y) / SLOWING) ** (1 / SLOW);
}
/** How fast the run is at `u`, as a share of its top speed (1 at the end of the ramp, 0 at the stop). */
export const runSpeed = (u: number) => {
  const x = clamp01(u);
  return x < RAMP ? x / RAMP : ((1 - x) / (1 - RAMP)) ** (SLOW - 1);
};
/** The run's top speed in ways per unit of time: a run of `span` degrees over `ms` peaks at RUN_TOP × span / ms. */
export const RUN_TOP = TOP;

/** A whole spin over 0…1: the wheel is pulled back by `back` (a share of the way) and let go into the run. */
export const spinEase = (back: number) => (t: number) => {
  const x = clamp01(t);
  if (x < SPIN_WIND) return (-back * (1 - Math.cos((Math.PI * x) / SPIN_WIND))) / 2;
  return -back + (1 + back) * runEase((x - SPIN_WIND) / (1 - SPIN_WIND));
};

// Places within one slice, in slices from its middle (0) to the next one's (1). The peg between two slices sits at
// 0.5; the pointer bends from PEG_TOUCH, most at PEG_PEAK, and is free again at PEG_FREE.
export const PEG_TOUCH = 0.4;
export const PEG_PEAK = 0.56;
export const PEG_FREE = 0.64;
/** Where a wheel may come to rest: clear of the pegs, and far enough from one that the pull back never crosses it. */
export const REST_FROM = -0.14;
export const REST_TO = 0.3;
/** The pull back before the launch, in slices. */
export const SPIN_PULL = 0.2;
/** Pegs passing faster than this are not all heard (ms between two ticks). */
const TICK_GAP = 55;
/** A tick this long after the one before is slow enough to be felt as well (a light haptic). */
const TICK_FELT = 100;

export type SpinTick = { /** ms after the spin starts. */ at: number; gain: number; feel: boolean };
export type SpinPlan = {
  from: number;
  /** Where the wheel rests (degrees, turning clockwise; the same unit as `from`). */
  to: number;
  ms: number;
  /** For Animated.timing: the share of the way at each share of the time. */
  ease: (t: number) => number;
  /** When the pull back ends and the wheel is let go (ms). */
  launchAt: number;
  ticks: SpinTick[];
};

/** The angle (0…360) at which slice `slice` of `slices` stands under the pointer, `offset` slices past its middle. */
export const restAngle = (slice: number, slices: number, offset = 0) => mod((offset - slice) * (360 / slices), 360);

/** The slice under the pointer of a wheel turned to `angle`. */
export const sliceAt = (angle: number, slices: number) => mod(Math.round(-angle / (360 / slices)), slices);

/**
 * One spin from `from` (degrees) to slice `slice`: at least `turns` full turns, resting a little off the slice's
 * middle (drawn from `rnd`), with a tick for every peg that passes the pointer.
 */
export function planSpin(o: { from: number; slice: number; slices: number; turns: number; ms: number; rnd?: () => number }): SpinPlan {
  const step = 360 / o.slices;
  const offset = REST_FROM + (REST_TO - REST_FROM) * clamp01((o.rnd ?? Math.random)());
  const to = o.from + o.turns * 360 + mod(restAngle(o.slice, o.slices, offset) - o.from, 360);
  const span = to - o.from;
  const back = (SPIN_PULL * step) / span;
  const ticks: SpinTick[] = [];
  // Pegs stand half a slice past each slice's middle; every one between the two rests passes once, forwards.
  let last = -Infinity;
  for (let peg = (Math.floor((o.from - step / 2) / step) + 1) * step + step / 2; peg < to; peg += step) {
    const run = ((peg - o.from) / span + back) / (1 + back);
    const at = (SPIN_WIND + runEaseAt(run) * (1 - SPIN_WIND)) * o.ms;
    if (at - last < TICK_GAP) continue;
    const gap = at - last;
    ticks.push({ at: Math.round(at), gain: 0.28 + 0.22 * clamp01((gap - TICK_GAP) / 220), feel: gap >= TICK_FELT });
    last = at;
  }
  return { from: o.from, to, ms: o.ms, ease: spinEase(back), launchAt: Math.round(SPIN_WIND * o.ms), ticks };
}

// --- A light running round a board's options ------------------------------------------------------------------

export type LightPlan = {
  /** When each step begins (ms) and which option it lights; the first is where the light stood. */
  steps: { at: number; index: number }[];
  /** When the light has come to rest, or gone out (ms). */
  ms: number;
  /** The option it rests on; null when it goes out (the result is not one of the options). */
  rest: number | null;
};

/**
 * The light's run round `count` options from `from` to `target`: `laps` full rounds and then on to the target,
 * every step slower than the one before, never slow enough to look as if it had stopped. Without a target it runs
 * a drawn number of steps more and goes out one beat after the last (the middle of the board takes over).
 */
export function planLight(o: { count: number; from: number; target: number | null; laps?: number; fast?: number; slow?: number; rnd?: () => number }): LightPlan {
  const { count, target } = o;
  const fast = o.fast ?? 55;
  const slow = o.slow ?? 330;
  const more = target === null ? Math.floor(clamp01((o.rnd ?? Math.random)()) * count) % count : mod(target - o.from, count);
  const n = (o.laps ?? 3) * count + more;
  const steps = [{ at: 0, index: mod(o.from, count) }];
  let at = 0;
  for (let k = 1; k <= n; k++) {
    at += fast + (slow - fast) * (k / n) ** 3;
    steps.push({ at: Math.round(at), index: mod(o.from + k, count) });
  }
  return { steps, ms: Math.round(target === null ? at + slow : at), rest: target };
}

/**
 * How brightly option `index` is lit over a run, as the two ranges of an Animated interpolation of the run's time
 * (ms): on at once when the light steps onto it, fading over `tail` ms when it steps off (a short trail behind the
 * light), and staying on at the end only where the light rests.
 */
export function litRange(plan: LightPlan, index: number, tail = 70): { inputRange: number[]; outputRange: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => {
    // Never backwards in time: a point that would be goes where the last one is.
    xs.push(Math.max(x, xs.length ? xs[xs.length - 1] : 0));
    ys.push(y);
  };
  plan.steps.forEach((s, k) => {
    if (s.index !== index) return;
    const next = plan.steps[k + 1];
    if (s.at > 0) add(s.at - 1, 0);
    add(s.at, 1);
    if (next) {
      add(next.at, 1);
      add(next.at + tail, 0);
    } else if (plan.rest === null) {
      // Goes out with the run's last beat.
      add(plan.ms - tail, 1);
      add(plan.ms, 0);
    }
  });
  if (!xs.length) return { inputRange: [0, 1], outputRange: [0, 0] };
  if (xs[0] > 0) {
    xs.unshift(0);
    ys.unshift(0);
  }
  if (xs.length < 2) {
    xs.push(xs[0] + 1);
    ys.push(ys[0]);
  }
  return { inputRange: xs, outputRange: ys };
}

// --- Small things the screens share -------------------------------------------------------------------------------

/** 2.500 → "2,5K", 1.250.000 → "1,2M" (Turkish decimals, rounded down like the balance pill). */
export const shortCoins = (n: number) => (n >= 1_000_000 ? `${(Math.floor(n / 100_000) / 10).toLocaleString('tr-TR')}M` : n >= 1_000 ? `${(Math.floor(n / 100) / 10).toLocaleString('tr-TR')}K` : String(n));

/** A share as Turkish percent text: "%20", "%8", "%0,49". */
export const percentText = (share: number) => `%${(share * 100).toLocaleString('tr-TR', { maximumFractionDigits: share < 0.1 ? 2 : 1 })}`;

const boardWeight = (b: Board) => b.results.reduce((n, r) => n + r.weight, 0);
/** The share of rounds in which a bet on `option` wins (every result that pays it). */
export const optionShare = (b: Board, option: string) => b.results.reduce((n, r) => n + (r.pays.includes(option) ? r.weight : 0), 0) / boardWeight(b);
/** The share of rounds that end on `result`. */
export const resultShare = (b: Board, r: BoardResult) => r.weight / boardWeight(b);

/** A result worth marking among the last ones: it pays, and it is rare (at most 2,5 % of rounds) or pays the board's top multiplier. */
export function isHotResult(b: Board, r: BoardResult): boolean {
  if (!r.pays.length) return false;
  const top = Math.max(...b.options.map((o) => o.mult));
  return resultShare(b, r) <= 0.025 || r.pays.some((id) => b.options.find((o) => o.id === id)?.mult === top);
}

/** The biggest chip of `chips` that `amount` holds (the smallest when it holds none): the chip a stack is shown as. */
export const chipOf = (chips: readonly number[], amount: number) => [...chips].sort((a, b) => b - a).find((c) => c <= amount) ?? Math.min(...chips);

/** How many times each value came up, the highest `rank` first. */
export function tally(items: number[], rank: (x: number) => number): { item: number; times: number }[] {
  const times = new Map<number, number>();
  for (const x of items) times.set(x, (times.get(x) ?? 0) + 1);
  return [...times].map(([item, n]) => ({ item, times: n })).sort((a, b) => rank(b.item) - rank(a.item));
}
