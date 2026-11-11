// Dört Taş's rules in the app: a copy of the server's (server/api/room-games/four.mjs, behind the seam copied in
// lib/room-games/seam), for the board (where a disc comes to rest, the winning line) and for practice games against
// the app's own opponent. In a live room the server checks every disc; the screens only read its state.
// tests/four.test.ts plays the same games through this copy and through the server's files and fails when they
// differ. Pure.
//
// The board stands upright: seven columns, six rows. A disc dropped in a column comes to rest on the lowest free
// row. A cell is row × 7 + column, row 0 at the bottom.
//
// The rules:
//  - Two players, a colour each (the first seat 0, the second 1), a disc a turn.
//  - Four of one colour in a line (across, up or diagonal) win the hand; a full board with no line is a draw.
//  - The first hand is started by the first seat, the next by the second, and so on in turn.
//  - A run-out turn is played by the table (`pickCol`), and counted against the seat like everywhere else.
import * as seam from '@/lib/room-games/seam';
import type { Game, MoveResult, Rnd, TableBase } from '@/lib/room-games/seam';

/** The disc that made a state, for the screen to drop. */
export type FourEvent = { n: number; color: number; col: number; row: number };
/** Dört Taş's own fields on a table once a hand has started. */
export type FourState = {
  /** 42 cells: the colour of the disc there, or null. */
  board: (number | null)[];
  /** Seat → colour. */
  colors: number[];
  /** Seat → hands won at this table. */
  wins: number[];
  /** Counts the table's hands. */
  hand: number;
  /** The cells of the winning line. */
  line: number[] | null;
  /** Counts the hand's discs. */
  n: number;
  last: FourEvent | null;
};
export type FourTable = TableBase<'four'> & FourState;
export type FourMove = { col: number };

export const META = { name: 'Dört Taş', min: 2, max: 2, autoStart: true } as const;
export const COLS = 7;
export const ROWS = 6;
/** How many discs ahead the table looks when it plays a run-out turn. */
export const DEPTH = 4;
export { MISSES, TURN_MS, sitDown } from '@/lib/room-games/seam';

export const cellOf = (col: number, row: number) => row * COLS + col;
/** The row a disc dropped in `col` comes to rest on; −1 when the column is full. */
export function restRow(board: (number | null)[], col: number) {
  for (let row = 0; row < ROWS; row++) if (board[cellOf(col, row)] === null) return row;
  return -1;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
const inside = (col: number, row: number) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

/** The cells of every line of four or more through the disc at `cell`, in board order; null when it made none. */
export function lineThrough(board: (number | null)[], cell: number) {
  const color = board[cell];
  if (color === null) return null;
  const col = cell % COLS;
  const row = Math.floor(cell / COLS);
  const cells = new Set<number>();
  for (const [dc, dr] of DIRS) {
    const run = [cell];
    for (const way of [1, -1]) {
      for (let c = col + dc * way, r = row + dr * way; inside(c, r) && board[cellOf(c, r)] === color; c += dc * way, r += dr * way) run.push(cellOf(c, r));
    }
    if (run.length >= 4) for (const x of run) cells.add(x);
  }
  return cells.size ? [...cells].sort((a, b) => a - b) : null;
}

type Counted = { seats: string[]; wins?: number[] };
const winsOf = (t: Counted) => t.seats.map((_, i) => t.wins?.[i] ?? 0);

function start(t: TableBase<'four'> & Partial<FourState>): FourState & { log: string; turn: number } {
  const hand = (t.hand ?? 0) + 1;
  return {
    board: Array<number | null>(COLS * ROWS).fill(null),
    colors: [0, 1],
    wins: winsOf(t),
    hand,
    line: null,
    n: 0,
    last: null,
    // The seats take the first disc in turn, hand after hand.
    turn: (hand - 1) % 2,
    log: 'Taşını bir sütuna bırak: dördünü yan yana, üst üste ya da çapraz dizen kazanır.',
  };
}

/** { col }: 0…6. */
function move(t: FourTable, seat: number, m: FourMove, names: string[]): MoveResult<FourTable> {
  const who = names[seat];
  const col = (m as { col?: unknown } | null)?.col;
  if (typeof col !== 'number' || !Number.isInteger(col) || col < 0 || col >= COLS) return { ok: false, reason: 'Bir sütun seç.' };
  const row = restRow(t.board, col);
  if (row < 0) return { ok: false, reason: 'Bu sütun dolu.' };
  const color = t.colors[seat];
  const cell = cellOf(col, row);
  const board = t.board.map((v, i) => (i === cell ? color : v));
  const next: FourTable = { ...t, board, n: t.n + 1, last: { n: t.n + 1, color, col, row } };
  const line = lineThrough(board, cell);
  if (line) return { ok: true, table: { ...next, line, status: 'over', winner: seat, wins: winsOf(t).map((w, i) => (i === seat ? w + 1 : w)), log: `🏆 ${who} dört taşı dizdi!` } };
  if (board.every((v) => v !== null)) return { ok: true, table: { ...next, status: 'over', winner: null, log: 'Berabere: tahta doldu.' } };
  return { ok: true, table: { ...next, turn: 1 - seat, log: `${who} ${col + 1}. sütuna bıraktı` } };
}

// Every line of four the board has, as cells.
const WINDOWS: number[][] = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    for (const [dc, dr] of DIRS) if (inside(col + 3 * dc, row + 3 * dr)) WINDOWS.push([0, 1, 2, 3].map((k) => cellOf(col + k * dc, row + k * dr)));
  }
}
/** The middle column first: lines through it are the most. */
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WON = 100_000;

/** How the board stands for `color`: the lines still open to one colour alone, longer ones counting for more. */
function standing(board: (number | null)[], color: number) {
  let v = 0;
  for (const w of WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const cell of w) {
      if (board[cell] === color) mine++;
      else if (board[cell] !== null) theirs++;
    }
    if (mine && theirs) continue;
    v += mine === 3 ? 50 : mine === 2 ? 10 : mine;
    v -= theirs === 3 ? 50 : theirs === 2 ? 10 : theirs;
  }
  return v;
}

/** The best `color` can reach from here looking `depth` discs ahead (it is to move); the board is put back as it was. */
function search(board: (number | null)[], color: number, depth: number, alpha: number, beta: number): number {
  let best: number | null = null;
  for (const col of ORDER) {
    const row = restRow(board, col);
    if (row < 0) continue;
    const cell = cellOf(col, row);
    board[cell] = color;
    // A line sooner is worth more than one later.
    const s = lineThrough(board, cell) ? WON + depth : depth <= 1 ? standing(board, color) : -search(board, 1 - color, depth - 1, -beta, -alpha);
    board[cell] = null;
    if (best === null || s > best) best = s;
    if (s > alpha) alpha = s;
    if (alpha >= beta) break;
  }
  // No column left: a draw.
  return best ?? 0;
}

type Standing = Pick<FourState, 'board' | 'colors'>;
/** What each column is worth to `seat` looking `depth` discs ahead (its own first); null for a full column. */
export function colScores(t: Standing, seat: number, depth = DEPTH) {
  const board = [...t.board];
  const color = t.colors[seat];
  return Array.from({ length: COLS }, (_, col) => {
    const row = restRow(board, col);
    if (row < 0) return null;
    const cell = cellOf(col, row);
    board[cell] = color;
    const s = lineThrough(board, cell) ? WON + depth : depth <= 1 ? standing(board, color) : -search(board, 1 - color, depth - 1, -Infinity, Infinity);
    board[cell] = null;
    return s;
  });
}

/**
 * The column a careful player would take: a line of four when there is one, the opponent's stopped, nothing given
 * away, and otherwise the board's middle. The server's table plays it on a run-out turn.
 */
export function pickCol(t: Standing, seat: number, depth = DEPTH) {
  const scores = colScores(t, seat, depth);
  let best = -1;
  for (const col of ORDER) {
    const s = scores[col];
    if (s !== null && (best < 0 || s > (scores[best] as number))) best = col;
  }
  return best;
}

/**
 * A practice opponent's column: it looks a little less far than the table does and, among columns about as good,
 * takes any (`rnd`), so no two games go the same way.
 */
export function botCol(t: Standing, seat: number, rnd: Rnd) {
  const scores = colScores(t, seat, 3);
  const best = Math.max(...scores.map((s) => s ?? -Infinity));
  // A line to finish or to stop leaves no choice.
  const near = scores.flatMap((s, col) => (s !== null && (Math.abs(best) >= WON ? s === best : s >= best - 4) ? [col] : []));
  return near[rnd(near.length)];
}

/** A run-out turn: the table drops the disc `pickCol` names. */
function auto(t: FourTable, names: string[]): FourTable {
  const r = move(t, t.turn, { col: pickCol(t, t.turn) }, names);
  return r.ok ? r.table : t;
}

/** `seat` leaves mid-hand: the one left takes the hand, and it counts. */
const left = (t: FourTable, seat: number) => ({ wins: winsOf(t).flatMap((w, i) => (i === seat ? [] : [w + 1])) });

const GAME: Game<'four', FourState, FourMove> = { id: 'four', meta: META, seatFields: ['colors', 'wins'], start, move, auto, left };

const none: Rnd = () => 0;
/** A new table with its opener on the first seat. */
export const openTable = (opener: string) => seam.openTable('four', opener);
/** Starts (or starts again) the hand with the seated players. */
export const startTable = (t: TableBase<'four'> & Partial<FourState>) => seam.startTable(GAME, t, none);
/** One move by seat `seat` (`names[seat]` for the log). */
export const moveTable = (t: FourTable, seat: number, m: FourMove, names: string[]) => seam.moveTable(GAME, t, seat, m, names, none);
/** The turn's time ran out: the table drops a disc for that seat, and after MISSES such turns in a row the seat leaves. */
export const timeoutTable = (t: FourTable, names: string[]) => seam.timeoutTable(GAME, t, names, none);
/** Seat `seat` leaves; mid-hand the one left wins it. */
export const leaveTable = <T extends TableBase<'four'> & Partial<FourState>>(t: T, seat: number, names: string[]) => seam.leaveTable(GAME, t, seat, names);
