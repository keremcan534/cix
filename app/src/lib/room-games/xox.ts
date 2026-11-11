// XOX's rules in the app: a copy of the server's (server/api/room-games/xox.mjs, behind the seam copied in
// lib/room-games/seam), for the board (the winning line) and for practice games against the app's own opponent. In
// a live room the server checks every mark; the screens only read its state. tests/xox.test.ts plays the same games
// through this copy and through the server's files and fails when they differ. Pure.
//
// The rules: the first seat is X and starts; three in a line win; nine marks with no line are a draw. Nobody plays
// for the one whose time ran out: they lose the hand.
import * as seam from '@/lib/room-games/seam';
import type { Game, MoveResult, Rnd, TableBase } from '@/lib/room-games/seam';

export type Mark = 'X' | 'O';
/** XOX's own fields on a table once a hand has started. */
export type XoxState = {
  board: (Mark | null)[];
  /** Seat → its mark, so the board still reads right once a seat has gone. */
  marks: Mark[];
  /** Seat → hands won at this table. */
  wins: number[];
};
export type XoxTable = TableBase<'xox'> & XoxState;
export type XoxMove = { cell: number };

export const META = { name: 'XOX', min: 2, max: 2, autoStart: true } as const;
export { TURN_MS, sitDown } from '@/lib/room-games/seam';
export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
export const xoxLine = (b: (Mark | null)[]) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) ?? null;

type Counted = { seats: string[]; wins?: number[] };
const winsOf = (t: Counted) => t.seats.map((_, i) => t.wins?.[i] ?? 0);
const won = (t: Counted, seat: number) => winsOf(t).map((w, i) => (i === seat ? w + 1 : w));

const start = (t: TableBase<'xox'> & Partial<XoxState>): XoxState & { log: string } => ({ board: Array<Mark | null>(9).fill(null), marks: ['X', 'O'], wins: winsOf(t), log: 'Sıra X’te.' });

/** { cell }: 0…8. */
function move(t: XoxTable, seat: number, m: XoxMove, names: string[]): MoveResult<XoxTable> {
  const who = names[seat];
  const cell = (m as { cell?: unknown } | null)?.cell;
  if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 8 || t.board[cell]) return { ok: false, reason: 'Bu kare dolu.' };
  const board = t.board.map((v, i) => (i === cell ? (seat === 0 ? 'X' : 'O') : v));
  if (xoxLine(board)) return { ok: true, table: { ...t, board, status: 'over', winner: seat, wins: won(t, seat), log: `🏆 ${who} kazandı!` } };
  if (board.every(Boolean)) return { ok: true, table: { ...t, board, status: 'over', winner: null, log: 'Berabere' } };
  return { ok: true, table: { ...t, board, turn: 1 - seat, log: `Sıra ${names[1 - seat]}’de.` } };
}

/** Nobody plays for the one whose time ran out: they lose. */
const timeout = (t: XoxTable, names: string[]): XoxTable => ({ ...t, status: 'over', winner: 1 - t.turn, wins: won(t, 1 - t.turn), log: `${names[t.turn]} için süre doldu · 🏆 ${names[1 - t.turn]} kazandı!` });

/** `seat` leaves mid-hand: the one left takes the hand, and it counts. */
const left = (t: XoxTable, seat: number) => ({ wins: winsOf(t).flatMap((w, i) => (i === seat ? [] : [w + 1])) });

const GAME: Game<'xox', XoxState, XoxMove> = { id: 'xox', meta: META, seatFields: ['marks', 'wins'], start, move, timeout, left };

const none: Rnd = () => 0;
/** A new table with its opener on the first seat. */
export const openTable = (opener: string) => seam.openTable('xox', opener);
/** Starts (or starts again) the hand with the seated players. */
export const startTable = (t: TableBase<'xox'> & Partial<XoxState>) => seam.startTable(GAME, t, none);
/** One move by seat `seat` (`names[seat]` for the log). */
export const moveTable = (t: XoxTable, seat: number, m: XoxMove, names: string[]) => seam.moveTable(GAME, t, seat, m, names, none);
/** The turn's time ran out: whoever's turn it was loses the hand. */
export const timeoutTable = (t: XoxTable, names: string[]) => seam.timeoutTable(GAME, t, names, none);
/** Seat `seat` leaves; mid-hand the one left wins it. */
export const leaveTable = <T extends TableBase<'xox'> & Partial<XoxState>>(t: T, seat: number, names: string[]) => seam.leaveTable(GAME, t, seat, names);

/**
 * A practice opponent's cell for `mark`: its own line of three when there is one, the other's stopped, then the
 * middle, then any free cell (`rnd`). It can be beaten with two lines opened at once.
 */
export function botCell(board: (Mark | null)[], mark: Mark, rnd: Rnd) {
  for (const who of [mark, mark === 'X' ? 'O' : 'X']) {
    for (const line of LINES) {
      const empty = line.filter((i) => !board[i]);
      if (empty.length === 1 && line.filter((i) => board[i] === who).length === 2) return empty[0];
    }
  }
  if (!board[4]) return 4;
  const free = board.flatMap((v, i) => (v ? [] : [i]));
  return free[rnd(free.length)];
}
