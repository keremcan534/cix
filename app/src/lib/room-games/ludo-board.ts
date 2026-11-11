// The Ludo board as a 15 × 15 grid, for the screen that draws it (components/games/room/ludo-board): where each loop
// square, home column, base and home is, and where a token stands. Pure geometry, tested in tests/ludo.test.ts.
//
// The layout as the rules number it (lib/room-games/ludo): colour 0's base in the top-left corner and the colours
// clockwise from it (1 top-right, 2 bottom-right, 3 bottom-left); play runs clockwise. The screen turns the board in
// quarter turns so that the viewer's own colour is bottom-left, by the thumb.
import { BASE, HOME, LAST, LOOP, SAFE } from '@/lib/room-games/ludo';

export const GRID = 15;
/** A point in grid units: (0, 0) is the board's top-left corner; a square's centre is its column and row + 0.5. */
export type Point = { x: number; y: number };

const quarter = (n: number) => ((n % 4) + 4) % 4;
/** `p` after `turns` quarter turns clockwise about the board's centre. */
export function turned(p: Point, turns: number): Point {
  let q = p;
  for (let i = quarter(turns); i > 0; i--) q = { x: GRID - q.y, y: q.x };
  return q;
}
/** The corner a colour's base is drawn in after `turns`: 0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left. */
export const cornerOf = (color: number, turns: number) => quarter(color + turns);
/** The quarter turns that put `color`'s base bottom-left. */
export const turnsFor = (color: number) => quarter(3 - color);

// The thirteen loop squares from colour 0's start square to the one before colour 1's, as [column, row]: along the
// left arm's upper row, up the top arm's left column and across its tip. The other three quarters are this one turned.
const QUARTER: [number, number][] = [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0], [8, 0]];
/** The 52 loop squares' centres, by loop square number. */
export const LOOP_POINTS: Point[] = Array.from({ length: LOOP }, (_, i) => turned({ x: QUARTER[i % 13][0] + 0.5, y: QUARTER[i % 13][1] + 0.5 }, Math.floor(i / 13)));

const YARD: Point[] = [{ x: 3, y: 3 }, { x: 12, y: 3 }, { x: 12, y: 12 }, { x: 3, y: 12 }];
/** Where the tokens wait in a base, around its centre: a row of two, or two rows of two. */
const BASE_SPOTS: Record<number, [number, number][]> = {
  2: [[-1, 0], [1, 0]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
};
export const BASE_SPREAD = 1.08;
/** The centre of the base drawn in `corner`. */
export const yardCentre = (corner: number) => YARD[quarter(corner)];

/**
 * Where token `index` (of `count`) of `color` stands at `step`, on a board turned `turns`: its place in base, the
 * centre of its loop or home column square, or its place in its colour's triangle at home.
 */
export function tokenPoint(color: number, step: number, index: number, count: number, turns: number): Point {
  if (step <= BASE) {
    const [dx, dy] = (BASE_SPOTS[count] ?? BASE_SPOTS[4])[index % 4];
    const c = yardCentre(cornerOf(color, turns));
    return { x: c.x + dx * BASE_SPREAD, y: c.y + dy * BASE_SPREAD };
  }
  if (step >= HOME) return turned({ x: 6.42, y: 7.5 + (index - (count - 1) / 2) * 0.56 }, color + turns);
  if (step > LAST) return turned({ x: step - LAST + 0.5, y: 7.5 }, color + turns);
  return turned(LOOP_POINTS[(color * 13 + step) % LOOP], turns);
}

/** The steps a token stands on, one after the other, from `from` to `to`: leaving base is one hop onto the start square. */
export const hopSteps = (from: number, to: number) => (from <= BASE ? [to] : Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i + 1));

/**
 * A square of the track, as drawn: `start` (a colour's start square), `star` (the other safe squares), `gate` (the
 * last loop square before a colour's home column), `lane` (a home column square) or `plain`. `heading` is the way a
 * token of that colour moves there, for the arrow on a start square and a gate: 0 right, 1 down, 2 left, 3 up.
 */
export type Square = { col: number; row: number; kind: 'plain' | 'start' | 'star' | 'gate' | 'lane'; color: number | null; heading: number };

/** The 72 squares of the track (the loop and the four home columns) on a board turned `turns`. */
export function trackSquares(turns: number): Square[] {
  const at = (p: Point) => ({ col: Math.floor(p.x), row: Math.floor(p.y) });
  const out: Square[] = [];
  for (let i = 0; i < LOOP; i++) {
    const q = Math.floor(i / 13);
    const spot = at(turned(LOOP_POINTS[i], turns));
    if (i % 13 === 0) out.push({ ...spot, kind: 'start', color: q, heading: quarter(q + turns) });
    else if (i % 13 === 11) out.push({ ...spot, kind: 'gate', color: (q + 1) % 4, heading: quarter(q + 1 + turns) });
    else out.push({ ...spot, kind: SAFE.includes(i) ? 'star' : 'plain', color: null, heading: 0 });
  }
  for (let color = 0; color < 4; color++) for (let step = LAST + 1; step < HOME; step++) out.push({ ...at(tokenPoint(color, step, 0, 1, turns)), kind: 'lane', color, heading: quarter(color + turns) });
  return out;
}

/**
 * How tokens sharing one square stand in it: each one's offset from the centre (in squares) and the size they are
 * drawn at (1 = a token alone).
 */
export function stackSpots(n: number): { spots: Point[]; scale: number } {
  if (n <= 1) return { spots: [{ x: 0, y: 0 }], scale: 1 };
  if (n === 2) return { spots: [{ x: -0.2, y: 0 }, { x: 0.2, y: 0 }], scale: 0.8 };
  if (n === 3) return { spots: [{ x: -0.2, y: -0.17 }, { x: 0.2, y: -0.17 }, { x: 0, y: 0.19 }], scale: 0.72 };
  if (n === 4) return { spots: [{ x: -0.2, y: -0.2 }, { x: 0.2, y: -0.2 }, { x: -0.2, y: 0.2 }, { x: 0.2, y: 0.2 }], scale: 0.68 };
  // A crowd (only a safe square can hold one): a ring.
  return { spots: Array.from({ length: n }, (_, i) => ({ x: 0.25 * Math.cos((2 * Math.PI * i) / n), y: 0.25 * Math.sin((2 * Math.PI * i) / n) })), scale: 0.56 };
}
