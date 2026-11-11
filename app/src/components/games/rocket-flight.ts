// Yörünge's flight as plain numbers: how long a climb takes, where the rocket is on the stage at each part of it and
// how far the stars have drifted by then. The stage (rocket-stage) only turns these into Animated interpolations.
// Nothing here decides a round: the crash point comes settled from playRound, and these only say how it is shown.
// Pure (no React, no app imports).

/** How sharply the path bends upward: the climb leaves along the ramp and is steep by the time it meets the orbit. */
const BEND = 1.7;

/**
 * Seconds a climb from 1× to `target` takes. 1× → 2× is three seconds; higher targets take longer but ever less so
 * (10× ≈ 5,8 s, 100× ≈ 8,5 s, 1000× ≈ 10,6 s), so a round never drags. The pace depends only on the target the player
 * picked, never on where the rocket will stop: watching the speed tells nothing about the result.
 */
export const climbSeconds = (target: number) => 3 * Math.log2(target) ** 0.55;

export type FlightPlan = {
  target: number;
  /** Where the multiplier stops: the target when the rocket got there, else the crash point (below 1: on the ramp). */
  stop: number;
  /** How much of the path the rocket covers, 0 (never left the ramp) … 1 (reached the orbit). */
  uStop: number;
  /** How long that takes. */
  ms: number;
  /** The multiplier `t` ms into the flight is e^(rate · t): exponential, so it speeds up as it climbs. */
  rate: number;
};

export function flightPlan(target: number, crash: number): FlightPlan {
  const stop = crash >= target ? target : crash;
  const total = climbSeconds(target) * 1000;
  const uStop = stop <= 1 ? 0 : Math.min(1, Math.log(stop) / Math.log(target));
  return { target, stop, uStop, ms: Math.round(total * uStop), rate: Math.log(target) / total };
}

/** The multiplier shown `ms` into a flight (never past where it stops). */
export const multiplierAt = (plan: FlightPlan, ms: number) => Math.min(Math.max(1, plan.stop), Math.exp(plan.rate * Math.max(0, ms)));

// --- The stage ------------------------------------------------------------------------------------------------

export type Geo = {
  w: number;
  h: number;
  /** The rocket on the ramp. */
  ax: number;
  ay: number;
  /** Where the path meets the escape orbit. */
  bx: number;
  by: number;
  /** The planet (its top edge shows at the bottom of the stage) and the escape orbit around the same centre. */
  cx: number;
  cy: number;
  planet: number;
  orbit: number;
};

export function stageGeo(w: number, h: number): Geo {
  const ax = w * 0.17;
  const ay = h - 80;
  const bx = w * 0.8;
  const by = h * 0.27;
  const planet = w * 0.92;
  const cx = w * 0.2;
  const cy = h - 54 + planet;
  return { w, h, ax, ay, bx, by, cx, cy, planet, orbit: Math.hypot(bx - cx, by - cy) };
}

const rise = (u: number) => (Math.exp(BEND * u) - 1) / (Math.exp(BEND) - 1);
const slope = (u: number) => (BEND * Math.exp(BEND * u)) / (Math.exp(BEND) - 1);

/** The rocket `u` of the way up (0 ramp … 1 orbit): its place on the stage and where its nose points (degrees clockwise from straight up). */
export function pathAt(g: Geo, u: number): { x: number; y: number; deg: number } {
  return {
    x: g.ax + (g.bx - g.ax) * u,
    y: g.ay - (g.ay - g.by) * rise(u),
    deg: (Math.atan2(g.bx - g.ax, (g.ay - g.by) * slope(u)) * 180) / Math.PI,
  };
}

/** `n` + 1 points of the path, evenly spread over the flight. */
export const pathSamples = (g: Geo, n: number) => Array.from({ length: n + 1 }, (_, i) => ({ u: i / n, ...pathAt(g, i / n) }));

/** Height of the orbit line at `x` (the upper arc of the circle). */
export const orbitY = (g: Geo, x: number) => g.cy - Math.sqrt(Math.max(0, g.orbit ** 2 - (x - g.cx) ** 2));

// --- Milestones -----------------------------------------------------------------------------------------------

const LADDER = [1.5, 2, 3, 5, 10, 20, 50, 100, 200, 500];

/** Multipliers the rocket passes on its way to `target`, each with its place on the path. */
export const milestones = (target: number) => LADDER.filter((m) => m < target).map((m) => ({ m, u: Math.log(m) / Math.log(target) }));

/** At most three of them to write beside the path: far enough from each other and from both ends to be read. */
export function routeMarks(target: number): { m: number; u: number }[] {
  const picked: { m: number; u: number }[] = [];
  for (const x of milestones(target).reverse()) {
    if (x.u < 0.2 || x.u > 0.82) continue;
    if (picked.length && picked[picked.length - 1].u - x.u < 0.2) continue;
    picked.push(x);
    if (picked.length === 3) break;
  }
  return picked.reverse();
}

// --- Stars ----------------------------------------------------------------------------------------------------

/** The nearest stars start at this many px a second and gain speed like the multiplier does. */
const DRIFT_SPEED = 46;
const DRIFT_TIME = 3.2;

/** Pixels the nearest stars have drifted `sec` seconds into a climb. */
export const driftAt = (sec: number) => DRIFT_SPEED * DRIFT_TIME * (Math.exp(sec / DRIFT_TIME) - 1);
const driftTime = (px: number) => DRIFT_TIME * Math.log(1 + px / (DRIFT_SPEED * DRIFT_TIME));

/**
 * A star layer's drift over a climb, as an interpolation of the flight (u: 0 … 1) onto the part of its tile it has
 * moved (0 … 1): the star field repeats every `period` px, so the offset wraps there (a step in the ranges, which
 * nobody sees) and the layer can drift for ever. `from` is where the layer stood (px, below `period`); `speed` is
 * the layer's share of the nearest stars' speed.
 */
export function driftRanges(totalSec: number, speed: number, period: number, from: number): { input: number[]; output: number[] } {
  const px = (u: number) => from + speed * driftAt(u * totalSec);
  const input = [0];
  const output = [from / period];
  let last = 0;
  const add = (u: number, s: number) => {
    input.push(u);
    output.push(s);
  };
  for (let k = 1; k * period < px(1); k++) {
    const u = driftTime((k * period - from) / speed) / totalSec;
    const mid = (last + u) / 2;
    add(mid, px(mid) / period - (k - 1));
    add(u, 1);
    add(u, 0);
    last = u;
  }
  const wraps = Math.floor(px(1) / period);
  const mid = (last + 1) / 2;
  if (mid > last) add(mid, px(mid) / period - wraps);
  add(1, px(1) / period - wraps);
  return { input, output };
}

/** Where the layer stands (px, below `period`) once the flight has stopped at `uStop`. */
export const driftEnd = (totalSec: number, speed: number, period: number, from: number, uStop: number) => (from + speed * driftAt(uStop * totalSec)) % period;

// --- A fixed scatter ------------------------------------------------------------------------------------------

/** A small repeatable random stream (0 … 1), so the star field is the same on every render. */
export function scatter(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
