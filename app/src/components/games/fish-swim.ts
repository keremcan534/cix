// Balon Avı's flight as plain numbers (the code still says swim and fish, the game's first names): where a balloon
// is at each part of its crossing, and where a shot fired now will meet it. The stage (fish-stage) turns the same numbers into Animated interpolations, so what the eye sees and
// what a tap is aimed at never disagree. Nothing here decides a round. Pure (no React, no app imports).

export type Swim = {
  /** 1 swims to the right, −1 to the left. */
  dir: 1 | -1;
  /** Where the crossing starts and ends (px, the fish's centre; both off the scene). */
  x0: number;
  x1: number;
  /** The depth it keeps, how far it bobs around it, how many times in a crossing, and where in a bob it starts (0 … 1). */
  y: number;
  amp: number;
  bobs: number;
  phase: number;
};

const TAU = Math.PI * 2;

/** The fish `p` of the way across (0 … 1): its centre, and how its nose tips as it rises and sinks (degrees clockwise). */
export function swimAt(s: Swim, p: number): { x: number; y: number; tilt: number } {
  const a = TAU * (s.bobs * p + s.phase);
  const slope = (s.amp * TAU * s.bobs * Math.cos(a)) / (s.x1 - s.x0);
  // The tip is drawn stronger than the path is steep: a fish that barely rises would otherwise look like a board.
  return { x: s.x0 + (s.x1 - s.x0) * p, y: s.y + s.amp * Math.sin(a), tilt: Math.max(-16, Math.min(16, ((Math.atan(slope) * 180) / Math.PI) * 2.2)) };
}

/** The crossing as interpolation ranges: eight points to a bob, which reads as a smooth wave. */
export function swimRanges(s: Swim): { input: number[]; x: number[]; y: number[]; tilt: string[] } {
  const n = Math.max(8, Math.ceil(s.bobs * 8));
  const input: number[] = [];
  const x: number[] = [];
  const y: number[] = [];
  const tilt: string[] = [];
  for (let i = 0; i <= n; i++) {
    const at = swimAt(s, i / n);
    input.push(i / n);
    x.push(at.x);
    y.push(at.y);
    tilt.push(`${at.tilt.toFixed(2)}deg`);
  }
  return { input, x, y, tilt };
}

/** A shot's speed (px a second) and how long one may take at least and at most (ms). */
const SHOT_SPEED = 1300;
const SHOT_MIN = 110;
const SHOT_MAX = 320;
export const shotMs = (dist: number) => Math.max(SHOT_MIN, Math.min(SHOT_MAX, (dist / SHOT_SPEED) * 1000));

/**
 * Where a shot fired from (`fx`, `fy`) meets the fish: the fish keeps swimming while the shot is in the air, so the
 * shot is aimed ahead of it. `p` is where the fish is now and `perMs` how much of its crossing it covers in a ms
 * (0 while the sky is frozen).
 */
export function leadShot(s: Swim, p: number, perMs: number, fx: number, fy: number): { x: number; y: number; ms: number } {
  let at = swimAt(s, p);
  let ms = shotMs(Math.hypot(at.x - fx, at.y - fy));
  for (let i = 0; i < 2; i++) {
    at = swimAt(s, Math.min(1, p + perMs * ms));
    ms = shotMs(Math.hypot(at.x - fx, at.y - fy));
  }
  return { x: at.x, y: at.y, ms };
}

/** The cannon's turn toward a point, in degrees clockwise from straight up; it never points below the horizon. */
export const aimDeg = (cx: number, cy: number, x: number, y: number) => Math.max(-82, Math.min(82, (Math.atan2(x - cx, cy - y) * 180) / Math.PI));

/**
 * A depth for a new fish: of a few random ones, the one furthest from the fish already swimming, so the flock
 * spreads over the sky instead of bunching up.
 */
export function freeDepth(taken: number[], top: number, bottom: number, rnd: () => number = Math.random): number {
  let best = top + rnd() * (bottom - top);
  let room = -1;
  for (let i = 0; i < 5; i++) {
    const y = top + rnd() * (bottom - top);
    const r = taken.length ? Math.min(...taken.map((t) => Math.abs(t - y))) : Infinity;
    if (r > room) {
      room = r;
      best = y;
    }
  }
  return best;
}
