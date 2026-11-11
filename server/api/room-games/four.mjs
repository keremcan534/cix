// Dört Taş at a room's table: one of the free room games behind room-games-rules.mjs (the seam every game follows is
// written there). Pure functions over the table's state; nothing here is drawn. The app keeps a copy of these rules
// for its board and its practice games (app/src/lib/room-games/four.ts); app/tests/four.test.ts plays the same
// games through both and fails when they differ.
//
// The board stands upright: seven columns, six rows. A disc dropped in a column comes to rest on the lowest free
// row. A cell is row × 7 + column, row 0 at the bottom.
//
// The rules:
//  - Two players, a colour each (the first seat 0, the second 1), a disc a turn.
//  - Four of one colour in a line (across, up or diagonal) win the hand; a full board with no line is a draw.
//  - The first hand is started by the first seat, the next by the second, and so on in turn.
//  - A run-out turn is played by the table (`pickCol`), and counted against the seat like everywhere else.
//
// Its fields: board (42 cells: the colour of the disc there, or null), colors (seat → colour), wins (seat → hands
// won at this table), hand (counts the table's hands), line (the cells of the winning line, else null), n (counts
// the hand's discs) and last, the disc that made this state, for the screen to drop: { n, color, col, row }.
export const meta = { name: 'Dört Taş', min: 2, max: 2, autoStart: true };
export const seatFields = ['colors', 'wins'];
export const COLS = 7;
export const ROWS = 6;
/** How many discs ahead the table looks when it plays a run-out turn. */
export const DEPTH = 4;

export const cellOf = (col, row) => row * COLS + col;
/** The row a disc dropped in `col` comes to rest on; −1 when the column is full. */
export function restRow(board, col) {
  for (let row = 0; row < ROWS; row++) if (board[cellOf(col, row)] === null) return row;
  return -1;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
const inside = (col, row) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

/** The cells of every line of four or more through the disc at `cell`, in board order; null when it made none. */
export function lineThrough(board, cell) {
  const color = board[cell];
  if (color === null) return null;
  const col = cell % COLS;
  const row = Math.floor(cell / COLS);
  const cells = new Set();
  for (const [dc, dr] of DIRS) {
    const run = [cell];
    for (const way of [1, -1]) {
      for (let c = col + dc * way, r = row + dr * way; inside(c, r) && board[cellOf(c, r)] === color; c += dc * way, r += dr * way) run.push(cellOf(c, r));
    }
    if (run.length >= 4) for (const x of run) cells.add(x);
  }
  return cells.size ? [...cells].sort((a, b) => a - b) : null;
}

const winsOf = (t) => t.seats.map((_, i) => t.wins?.[i] ?? 0);

export function start(t) {
  const hand = (t.hand ?? 0) + 1;
  return {
    board: Array(COLS * ROWS).fill(null),
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
export function move(t, seat, m, names) {
  const who = names[seat];
  const col = m?.col;
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return { ok: false, reason: 'Bir sütun seç.' };
  const row = restRow(t.board, col);
  if (row < 0) return { ok: false, reason: 'Bu sütun dolu.' };
  const color = t.colors[seat];
  const cell = cellOf(col, row);
  const board = t.board.map((v, i) => (i === cell ? color : v));
  const next = { ...t, board, n: t.n + 1, last: { n: t.n + 1, color, col, row } };
  const line = lineThrough(board, cell);
  if (line) return { ok: true, table: { ...next, line, status: 'over', winner: seat, wins: winsOf(t).map((w, i) => (i === seat ? w + 1 : w)), log: `🏆 ${who} dört taşı dizdi!` } };
  if (board.every((v) => v !== null)) return { ok: true, table: { ...next, status: 'over', winner: null, log: 'Berabere: tahta doldu.' } };
  return { ok: true, table: { ...next, turn: 1 - seat, log: `${who} ${col + 1}. sütuna bıraktı` } };
}

// Every line of four the board has, as cells.
const WINDOWS = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    for (const [dc, dr] of DIRS) if (inside(col + 3 * dc, row + 3 * dr)) WINDOWS.push([0, 1, 2, 3].map((k) => cellOf(col + k * dc, row + k * dr)));
  }
}
/** The middle column first: lines through it are the most. */
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WON = 100_000;

/** How the board stands for `color`: the lines still open to one colour alone, longer ones counting for more. */
function standing(board, color) {
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
function search(board, color, depth, alpha, beta) {
  let best = null;
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

/** What each column is worth to `seat` looking `depth` discs ahead (its own first); null for a full column. */
export function colScores(t, seat, depth = DEPTH) {
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
 * away, and otherwise the board's middle. The table plays it on a run-out turn.
 */
export function pickCol(t, seat, depth = DEPTH) {
  const scores = colScores(t, seat, depth);
  let best = -1;
  for (const col of ORDER) if (scores[col] !== null && (best < 0 || scores[col] > scores[best])) best = col;
  return best;
}

/** A run-out turn: the table drops the disc `pickCol` names. */
export const auto = (t, names) => move(t, t.turn, { col: pickCol(t, t.turn) }, names).table;

/** `seat` leaves mid-hand: the one left takes the hand, and it counts. */
export const left = (t, seat) => ({ wins: winsOf(t).flatMap((w, i) => (i === seat ? [] : [w + 1])) });

export const view = (t) => t;
