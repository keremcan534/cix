// Bilye Şelalesi: the board. One board for now; a second one is another module of this shape with its own
// tables (lib/bilye/table), so nothing else has to change.
//
// Lengths are board units (the screen scales them). The field of pegs is FIELD wide; right of it runs the launch
// channel the ball is shot up before it comes over the top rail. A ball ends in one of the TARGETS: the three cups
// set among the pegs (the prizes worth aiming for) or one of the nine pockets along the bottom.
//
// Pure data and sums only (no app, storage or React imports): the screen, the tests and the table script
// (scripts/bilye-table.ts) read the same board.

export type Peg = { x: number; y: number; r: number; /** A post of a cup or a pocket: drawn as part of it, not lit like a field peg. */ post?: boolean };
export type Lane = 'hafif' | 'orta' | 'guclu';
export const LANES: readonly Lane[] = ['hafif', 'orta', 'guclu'];
export const LANE_NAME: Record<Lane, string> = { hafif: 'Hafif', orta: 'Orta', guclu: 'Güçlü' };

/** Whole board, the launch channel included. */
export const WIDTH = 320;
export const HEIGHT = 440;
/** The peg field and the pockets: x from 0 to FIELD. */
export const FIELD = 296;
export const BALL_R = 6;
/** The top rail the ball rides before it drops into the field. */
export const RAIL_Y = 22;
/** A ball whose centre passes this line is in a pocket. */
export const POCKET_Y = 402;
export const POCKETS = 9;
export const POCKET_W = FIELD / POCKETS;

/**
 * Where a launch of each strength leaves the rail (the stronger the shot, the further over the top it gets) and how
 * fast it is still moving left there. `spread`: the widest a single launch lands from `x`, either way.
 */
export const LAUNCH: Record<Lane, { x: number; vx: number; spread: number }> = {
  hafif: { x: 238, vx: -30, spread: 13 },
  orta: { x: 158, vx: -30, spread: 13 },
  guclu: { x: 74, vx: -30, spread: 13 },
};

/** A cup among the pegs: its mouth is `w` wide at (x, y); a ball that drops into it stays. */
export type Cup = {
  id: 'yakut' | 'altin' | 'zumrut';
  name: string;
  x: number;
  y: number;
  w: number;
  mult: number;
  /** Pegs beside the one above the cup, as offsets from it: a roof that leaves only a side way in. */
  roof: number[];
};
export const CUP_DEPTH = 9;
/**
 * Each cup hangs right under a peg of the row above, which turns most balls aside: the closer the cup is to that
 * peg and the narrower its mouth, the rarer a ball finds its way in.
 */
export const CUPS: readonly Cup[] = [
  { id: 'yakut', name: 'Yakut', x: 68, y: 223, w: 13, mult: 5, roof: [-9] },
  { id: 'altin', name: 'Altın', x: 148, y: 301, w: 12.6, mult: 20, roof: [-9] },
  { id: 'zumrut', name: 'Zümrüt', x: 228, y: 230, w: 16, mult: 2, roof: [] },
];

/** What each bottom pocket pays, in stakes, left to right. */
export const POCKET_MULT: readonly number[] = [0.5, 0.2, 0.2, 0, 0.2, 0, 0.2, 0, 0.2];
/**
 * Everything a ball can end in, by index: the nine pockets (0–8), then the cups (9–11). The rules, the tables and
 * the history speak of a target by this index.
 */
export type Target = { kind: 'pocket' | 'cup'; mult: number; x: number; y: number; name: string };
export const TARGETS: readonly Target[] = [
  ...POCKET_MULT.map((mult, k): Target => ({ kind: 'pocket', mult, x: (k + 0.5) * POCKET_W, y: POCKET_Y + 14, name: `${k + 1}. cep` })),
  ...CUPS.map((c): Target => ({ kind: 'cup', mult: c.mult, x: c.x, y: c.y + CUP_DEPTH, name: `${c.name} kupa` })),
];
export const pocketOf = (x: number) => Math.max(0, Math.min(POCKETS - 1, Math.floor(x / POCKET_W)));

const ROWS = 10;
const ROW_Y = 72;
const ROW_GAP = 27;
const COL_GAP = 32;
const PEG_R = 3.4;
const POST_R = 2.6;

function build(): Peg[] {
  const pegs: Peg[] = [];
  for (let row = 0; row < ROWS; row++) {
    const even = row % 2 === 0;
    const count = even ? 9 : 10;
    const first = even ? 20 : 4;
    const y = ROW_Y + row * ROW_GAP;
    for (let i = 0; i < count; i++) {
      // The outermost pegs of the wider rows sit against the walls, so no ball falls straight down a wall.
      const x = first + i * COL_GAP;
      // Around a cup the field is clear (no peg close enough to hold a ball against its posts); the peg right
      // above it stays.
      if (CUPS.some((c) => y > c.y - 8 && y < c.y + 34 && Math.abs(c.x - x) < 24)) continue;
      pegs.push({ x, y, r: PEG_R });
    }
  }
  // A cup: a post either side of its mouth and one under it, so the only way in is from above; and its roof.
  for (const c of CUPS) {
    const above = ROW_Y + Math.floor((c.y - ROW_Y) / ROW_GAP) * ROW_GAP;
    // A little lower than the peg in the middle, so a ball rolls off the roof instead of resting on it.
    for (const dx of c.roof) pegs.push({ x: c.x + dx, y: above + 4, r: PEG_R });
    pegs.push(
      { x: c.x - c.w / 2 - POST_R, y: c.y + 2, r: POST_R, post: true },
      { x: c.x + c.w / 2 + POST_R, y: c.y + 2, r: POST_R, post: true },
      { x: c.x, y: c.y + CUP_DEPTH + 7, r: 3.2, post: true },
    );
  }
  // Pocket dividers: a column of posts, so a ball below their tops stays in its pocket.
  for (let k = 1; k < POCKETS; k++) {
    for (let y = 358; y <= POCKET_Y + 4; y += 9) pegs.push({ x: k * POCKET_W, y, r: POST_R, post: true });
  }
  return pegs;
}
export const PEGS: readonly Peg[] = build();
