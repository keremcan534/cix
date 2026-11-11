// How a slot's reels move (components/games/fx/reel): every reel runs at the same speed and the later ones run
// longer, so they stop one after another, each settling with a small overshoot. Pure numbers, unit tested; the
// result of the round is known before any of this and is only shown by it.

export type ReelPace = {
  /** Reel speed at full run, px per ms. */
  speed: number;
  /** Symbols that pass on the first reel before it settles, and how many more on each next reel. */
  first: number;
  step: number;
  /** Symbols the reel travels while it settles (slowing down, then the overshoot). */
  settle: number;
};

export const REEL_PACE: Record<'normal' | 'turbo', ReelPace> = {
  normal: { speed: 0.95, first: 8, step: 3, settle: 3 },
  turbo: { speed: 2.4, first: 4, step: 1, settle: 2 },
};
/**
 * A reel that is being waited for (the reels before it promise something) runs this many symbols longer, and each
 * further one that many more again (`tease` 1, 2, …), so the wait builds from reel to reel.
 */
export const TEASE_EXTRA = 14;
/** The overshoot of the settling curve (Easing.back): the reel slips this little past its place and returns. */
export const SETTLE_BACK = 1;

export type ReelRun = {
  /** Symbols scrolled past before the result is in the window. */
  filler: number;
  /** The run at full speed, then the settling (ms). */
  runMs: number;
  settleMs: number;
};

/**
 * The run of reel `reel` (0 = leftmost) of `rows` symbols, each `cell` px tall: the filler and then the result
 * scroll in, so it travels filler + rows symbols; `tease` is how many waits it carries (0 for none). The settling starts at the full speed (an ease-out-back curve
 * starts SETTLE_BACK + 3 times faster than its average), so the reel never visibly brakes or jumps where the two
 * parts meet.
 */
export function reelRun(reel: number, cell: number, rows: number, pace: ReelPace, tease = 0): ReelRun {
  const filler = pace.first + reel * pace.step + Math.max(0, tease) * TEASE_EXTRA;
  const settlePx = Math.min(pace.settle, filler + rows) * cell;
  const runPx = (filler + rows) * cell - settlePx;
  return { filler, runMs: Math.round(runPx / pace.speed), settleMs: Math.round(((SETTLE_BACK + 3) * settlePx) / pace.speed) };
}

/** When reel `reel` comes to rest after its run starts (ms). */
export const reelStopAt = (reel: number, cell: number, rows: number, pace: ReelPace, tease = 0) => {
  const r = reelRun(reel, cell, rows, pace, tease);
  return r.runMs + r.settleMs;
};

/**
 * Which reels are worth waiting for, as the number of waits each carries (0: none). A reel is waited for when the
 * reels before it already show `need` or more of the scatter (one more pays), or when every reel before it shows
 * the wild and a line of wilds is the top prize (`wildLine`, from the fourth reel on). The first of them waits
 * once, the next twice, and so on.
 */
export function teasedReels(grid: string[][], o: { scatter?: string; wild?: string; wildLine?: boolean; need?: number }): number[] {
  const need = o.need ?? 2;
  let scatters = 0;
  let allWild = true;
  let waits = 0;
  return grid.map((col, reel) => {
    const byScatter = !!o.scatter && reel >= need && scatters >= need;
    const byWild = !!o.wild && !!o.wildLine && reel >= 3 && allWild;
    if (o.scatter) scatters += col.filter((x) => x === o.scatter).length;
    if (o.wild && !col.includes(o.wild)) allWild = false;
    return byScatter || byWild ? ++waits : 0;
  });
}

/** `n` symbols for the part of a reel that only flies past, taken in order from its strip starting at `from`. */
export function fillerOf(strip: string[], from: number, n: number): string[] {
  const len = strip.length;
  return Array.from({ length: n }, (_, i) => strip[(((from + i) % len) + len) % len]);
}
