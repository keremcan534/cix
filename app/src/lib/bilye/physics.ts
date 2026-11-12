// Pachinko: the ball. A small 2D simulation: gravity, a round ball, round pegs and posts, the side walls.
//
// A launch is fully decided by its strength and a seed: the same pair gives the same path on every phone and in
// node. To keep that true the sums use only + − × ÷ and Math.sqrt (exactly rounded everywhere); no sin, cos or pow,
// whose last digits differ between engines.
//
// The simulation never decides what a round pays. The pocket is drawn by the rules (lib/bilye/rules, the server in
// a live build) and the screen then shows a real path that ends in that pocket (lib/bilye/path).
//
// Pure functions only (no app, storage or React imports).
import { BALL_R, CUPS, CUP_DEPTH, FIELD, LAUNCH, PEGS, POCKETS, POCKET_Y, RAIL_Y, pocketOf, type Lane } from '@/lib/bilye/board';

/** Simulation step and how many of them make one recorded frame (60 a second). */
export const STEP = 1 / 120;
export const FRAME_STEPS = 2;
export const FRAME_MS = 1000 * STEP * FRAME_STEPS;
const GRAVITY = 900;
/** How much of its speed along the line of centres the ball keeps off a peg, and off a wall. */
const BOUNCE = 0.52;
const WALL_BOUNCE = 0.45;
/** Rolling loss along the peg's surface. */
const GRIP = 0.985;
const MAX_SPEED = 680;
/** A launch still in the air after this many steps is thrown away (a ball balanced on a peg). */
const MAX_STEPS = 1560;

/** A small seeded generator (mulberry32): integers only, the same on every engine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Flight = {
  /** The target (board TARGETS index) the ball came to rest in, or -1 when the launch was thrown away. */
  target: number;
  /** x0, y0, x1, y1, …: the ball's centre, one pair per frame, from the rail to where it came to rest. */
  points: number[];
  /** The pegs it struck: frame and index in PEGS. */
  hits: { frame: number; peg: number }[];
};

/**
 * One launch of strength `lane` with `seed`. `record` false skips the points and hits (the table script counts
 * pockets over many launches).
 */
export function fly(lane: Lane, seed: number, record = true): Flight {
  const rnd = seeded(seed);
  const from = LAUNCH[lane];
  let x = from.x + (rnd() * 2 - 1) * from.spread;
  let y = RAIL_Y;
  let vx = from.vx * (0.75 + rnd() * 0.5);
  let vy = 0;
  const points: number[] = [];
  const hits: Flight['hits'] = [];
  let last = -1;
  for (let step = 0; step < MAX_STEPS; step++) {
    if (record && step % FRAME_STEPS === 0) points.push(x, y);
    vy += GRAVITY * STEP;
    x += vx * STEP;
    y += vy * STEP;
    if (x < BALL_R) {
      x = BALL_R;
      vx = -vx * WALL_BOUNCE;
    } else if (x > FIELD - BALL_R) {
      x = FIELD - BALL_R;
      vx = -vx * WALL_BOUNCE;
    }
    for (let i = 0; i < PEGS.length; i++) {
      const p = PEGS[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const reach = BALL_R + p.r;
      // Cheap rejections first: most pegs are far away.
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;
      const d = Math.sqrt(d2);
      // Dead centre (never in practice): pushed straight up.
      const nx = d > 1e-9 ? dx / d : 0;
      const ny = d > 1e-9 ? dy / d : -1;
      x = p.x + nx * reach;
      y = p.y + ny * reach;
      const into = vx * nx + vy * ny;
      if (into < 0) {
        // Off the peg: the part along the line of centres turns back with a loss, the rest rolls on.
        const tx = vx - into * nx;
        const ty = vy - into * ny;
        // A small turn either way stands for the peg's roughness (a turn by a small angle, then back to length).
        const turn = (rnd() * 2 - 1) * 0.16;
        let bx = tx * GRIP - into * BOUNCE * nx;
        let by = ty * GRIP - into * BOUNCE * ny;
        const before = Math.sqrt(bx * bx + by * by);
        const rx = bx - turn * by;
        const ry = by + turn * bx;
        const after = Math.sqrt(rx * rx + ry * ry);
        if (after > 1e-9) {
          bx = (rx / after) * before;
          by = (ry / after) * before;
        }
        // A ball that has all but stopped on top of a peg rolls off to one side.
        if (before < 14) bx += rnd() < 0.5 ? -22 : 22;
        vx = bx;
        vy = by;
        if (record && i !== last) hits.push({ frame: Math.floor(step / FRAME_STEPS), peg: i });
        last = i;
      }
    }
    const speed2 = vx * vx + vy * vy;
    if (speed2 > MAX_SPEED * MAX_SPEED) {
      const k = MAX_SPEED / Math.sqrt(speed2);
      vx *= k;
      vy *= k;
    }
    // Dropped into a cup: between its posts, below its rim, on the way down.
    if (vy > 0) {
      for (let c = 0; c < CUPS.length; c++) {
        const cup = CUPS[c];
        const off = x - cup.x;
        if (y > cup.y && y < cup.y + CUP_DEPTH && off < cup.w / 2 && off > -cup.w / 2) {
          if (record) points.push(x, y, cup.x, cup.y + CUP_DEPTH);
          return { target: POCKETS + c, points, hits };
        }
      }
    }
    if (y > POCKET_Y) {
      if (record) points.push(x, y);
      return { target: pocketOf(x), points, hits };
    }
  }
  return { target: -1, points: [], hits: [] };
}
