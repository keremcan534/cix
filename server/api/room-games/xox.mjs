// XOX at a room's table: one of the free room games behind room-games-rules.mjs (the seam every game follows is
// written there). Pure functions over the table's state; nothing here is drawn. The app keeps a copy of these rules
// for its board and its practice games (app/src/lib/room-games/xox.ts); app/tests/xox.test.ts plays the same games
// through both and fails when they differ.
//
// Its fields: `board`, nine cells of 'X' (the first seat), 'O' or null; `marks` (seat → its mark, so the board still
// reads right once a seat has gone) and `wins` (seat → hands won at this table).
export const meta = { name: 'XOX', min: 2, max: 2, autoStart: true };
export const seatFields = ['marks', 'wins'];
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
export const xoxLine = (b) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) ?? null;

const winsOf = (t) => t.seats.map((_, i) => t.wins?.[i] ?? 0);
const won = (t, seat) => winsOf(t).map((w, i) => (i === seat ? w + 1 : w));

export const start = (t) => ({ board: Array(9).fill(null), marks: ['X', 'O'], wins: winsOf(t), log: 'Sıra X’te.' });

/** { cell }: 0…8. */
export function move(t, seat, move, names) {
  const who = names[seat];
  const cell = move?.cell;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || t.board[cell]) return { ok: false, reason: 'Bu kare dolu.' };
  const board = t.board.map((v, i) => (i === cell ? (seat === 0 ? 'X' : 'O') : v));
  if (xoxLine(board)) return { ok: true, table: { ...t, board, status: 'over', winner: seat, wins: won(t, seat), log: `🏆 ${who} kazandı!` } };
  if (board.every(Boolean)) return { ok: true, table: { ...t, board, status: 'over', winner: null, log: 'Berabere' } };
  return { ok: true, table: { ...t, board, turn: 1 - seat, log: `Sıra ${names[1 - seat]}’de.` } };
}

/** Nobody plays for the one whose time ran out: they lose. */
export const timeout = (t, names) => ({ ...t, status: 'over', winner: 1 - t.turn, wins: won(t, 1 - t.turn), log: `${names[t.turn]} için süre doldu · 🏆 ${names[1 - t.turn]} kazandı!` });

/** `seat` leaves mid-hand: the one left takes the hand, and it counts. */
export const left = (t, seat) => ({ wins: winsOf(t).flatMap((w, i) => (i === seat ? [] : [w + 1])) });

export const view = (t) => t;
