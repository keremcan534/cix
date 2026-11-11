// Ludo's rules in the app: a copy of the server's (server/api/room-games/ludo.mjs, behind room-games-rules.mjs), for
// the board (which tokens may move, where they land) and for practice games against the app's own opponents. In a
// live room the server plays and the screens only read its state. tests/ludo.test.ts plays the same seeded games
// through this copy and through the server's files and fails when they differ. Pure: no React, nothing from expo.
//
// The board: a loop of 52 squares around a cross and four colours clockwise (0…3), each with a base, a start
// square (loop square 13 × colour), a home column of five squares and home. A token's place is its `step`:
//   −1 in base · 0…50 on the loop (0 is its start square) · 51…55 in its home column · 56 home.
// Two players sit on opposite colours (0 and 2).
//
// The rules:
//  - A turn is a throw, then a token to move when there is a choice. With one token to move (or several standing
//    together, which move alike) it is moved at once; with none the turn passes.
//  - Only a 6 takes a token out of base, onto its start square. Home needs the exact number.
//  - A 6 throws again; the third 6 in a row is not played and the turn passes.
//  - Landing where an opponent has one token alone sends it back to base and throws again. Two or more tokens of
//    one colour hold their square, and nothing is captured on the eight safe squares (the four start squares and
//    the four stars), which tokens share. Tokens pass each other freely.
//  - A token reaching home throws again. The first player with every token home wins and the hand ends.
//  - `mode`: 'quick' is two tokens each, 'classic' four.

export type LudoMode = 'quick' | 'classic';
/**
 * The event that made a state, for the screen to play: who (`color`), the die and whether it was thrown in this
 * event, the token moved (nulls when none was) and the tokens sent back to base. `note`: 'none' nothing could
 * move · 'sixes' the third 6 · 'left' that colour left the table.
 */
export type LudoEvent = {
  n: number;
  color: number;
  die: number | null;
  rolled: boolean;
  token: number | null;
  from: number | null;
  to: number | null;
  captured: { color: number; token: number; from: number }[];
  note: 'none' | 'sixes' | 'left' | null;
};
/** Ludo's own fields on a table once a hand has started. */
export type LudoState = {
  mode: LudoMode;
  /** Counts the table's hands. */
  hand: number;
  /** Seat → colour. */
  colors: number[];
  /** Seat → each token's step. */
  tokens: number[][];
  phase: 'roll' | 'move';
  /** The last die thrown. */
  die: number | null;
  /** Sixes in a row, this turn. */
  sixes: number;
  /** The tokens to choose from in phase 'move'. */
  movable: number[];
  /** Counts the hand's events. */
  n: number;
  last: LudoEvent | null;
};
/** What every table carries, whatever the game (server/api/room-games-rules.mjs). */
export type TableBase = { game: 'ludo'; seats: string[]; status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; log: string; misses: number[]; mode: LudoMode };
export type LudoTable = TableBase & LudoState;
export type LudoMove = { roll: true } | { token: number };
export type MoveResult = { ok: true; table: LudoTable } | { ok: false; reason: string };
/** A draw: 0…n−1. */
export type Rnd = (n: number) => number;

export const META = { name: 'Ludo', min: 2, max: 4 } as const;
export const LOOP = 52;
/** A token's last step on the loop; then the five squares of its home column, then home. */
export const LAST = 50;
export const HOME = 56;
export const BASE = -1;
/** Tokens each, by mode. */
export const MODES: Record<LudoMode, number> = { quick: 2, classic: 4 };
/** Loop squares where nothing is captured: the four start squares and, eight squares on, the four stars. */
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
/** After this many turns in a row that the table played for a seat, the seat leaves. */
export const MISSES = 3;

/** Seat → colour: two players face each other across the board. */
export const seatColors = (n: number) => (n === 2 ? [0, 2] : Array.from({ length: n }, (_, i) => i));
/** The loop square under a token of `color` at `step`; null in base, in the home column and home. */
export const squareOf = (color: number, step: number) => (step >= 0 && step <= LAST ? (color * 13 + step) % LOOP : null);
const isMode = (m: unknown): m is LudoMode => typeof m === 'string' && Object.hasOwn(MODES, m);

/** The opener's choice: { mode } ('quick' when not said); null when it is not a mode. */
export function tableOptions(o?: { mode?: unknown } | null): { mode: LudoMode } | null {
  const mode = o?.mode ?? 'quick';
  return isMode(mode) ? { mode } : null;
}

/** A new table with its opener on the first seat. */
export const openTable = (opener: string, options?: { mode?: unknown } | null): TableBase => ({
  game: 'ludo',
  seats: [opener],
  status: 'waiting',
  turn: 0,
  winner: null,
  log: 'Oyuncular bekleniyor.',
  misses: [0],
  ...(tableOptions(options) ?? { mode: 'quick' }),
});

/** Starts (or starts again) the hand with the seated players. */
export function startTable(t: TableBase & Partial<LudoState>): LudoTable {
  const mode = isMode(t.mode) ? t.mode : 'quick';
  const n = t.seats.length;
  return {
    ...t,
    status: 'playing',
    turn: 0,
    winner: null,
    misses: Array<number>(n).fill(0),
    mode,
    hand: (t.hand ?? 0) + 1,
    colors: seatColors(n),
    tokens: Array.from({ length: n }, () => Array<number>(MODES[mode]).fill(BASE)),
    phase: 'roll',
    die: null,
    sixes: 0,
    movable: [],
    n: 0,
    last: null,
    log: 'Zar at. 6 atınca taşın yola çıkar.',
  };
}

/** The tokens `seat` may move with `die`. */
export const legalTokens = (t: Pick<LudoState, 'tokens'>, seat: number, die: number) => t.tokens[seat].flatMap((step, i) => ((step === BASE ? die === 6 : step < HOME && step + die <= HOME) ? [i] : []));

/** One move by seat `seat` (`names[seat]` for the log): { roll: true } throws the die; { token } moves that token when there was a choice. */
export function moveTable(t: LudoTable, seat: number, m: LudoMove, names: string[], rnd: Rnd): MoveResult {
  if (t.status !== 'playing') return { ok: false, reason: 'Oyun başlamadı.' };
  if (t.turn !== seat) return { ok: false, reason: 'Sıra sende değil.' };
  // A move of one's own clears the turns the table played for that seat.
  const mine = { ...t, misses: t.misses.map((x, i) => (i === seat ? 0 : x)) };
  const token = (m as { token?: number | null } | null)?.token;
  if (t.phase === 'roll') return (m as { roll?: unknown } | null)?.roll === true ? { ok: true, table: roll(mine, seat, names, rnd) } : { ok: false, reason: 'Önce zar at.' };
  if (token === undefined || token === null) return { ok: false, reason: 'Oynayacağın taşı seç.' };
  if (!t.movable.includes(token)) return { ok: false, reason: 'Bu taş oynanamaz.' };
  return { ok: true, table: play(mine, seat, token, names, false) };
}

const pass = (t: LudoTable, seat: number, last: LudoEvent, log: string): LudoTable => ({ ...t, phase: 'roll', sixes: 0, movable: [], turn: (seat + 1) % t.seats.length, last, log });

function roll(t: LudoTable, seat: number, names: string[], rnd: Rnd): LudoTable {
  const die = rnd(6) + 1;
  const who = names[seat];
  const sixes = die === 6 ? t.sixes + 1 : 0;
  const thrown: LudoTable = { ...t, die, sixes, movable: [], n: t.n + 1 };
  const last: LudoEvent = { n: t.n + 1, color: t.colors[seat], die, rolled: true, token: null, from: null, to: null, captured: [], note: null };
  if (sixes === 3) return pass(thrown, seat, { ...last, note: 'sixes' }, `${who} üst üste üçüncü 6’yı attı, sıra geçti`);
  const can = legalTokens(t, seat, die);
  if (!can.length) {
    // A 6 throws again even with nothing to move.
    if (die === 6) return { ...thrown, last: { ...last, note: 'none' }, log: `${who} 6 attı, oynayacak taşı yok · tekrar atıyor` };
    return pass(thrown, seat, { ...last, note: 'none' }, `${who} ${die} attı, oynayacak taşı yok`);
  }
  // Tokens standing together move alike: there is no choice between them.
  if (new Set(can.map((i) => t.tokens[seat][i])).size === 1) return play(thrown, seat, can[0], names, true);
  return { ...thrown, phase: 'move', movable: can, last, log: `${who} ${die} attı, taşını seçiyor` };
}

/** Moves `token` by the die on the table. `rolled`: in the same event as the throw (nobody chose). */
function play(t: LudoTable, seat: number, token: number, names: string[], rolled: boolean): LudoTable {
  const who = names[seat];
  const color = t.colors[seat];
  const die = t.die ?? 0;
  const from = t.tokens[seat][token];
  const to = from === BASE ? 0 : from + die;
  const tokens = t.tokens.map((ts) => [...ts]);
  tokens[seat][token] = to;
  const captured: LudoEvent['captured'] = [];
  const square = squareOf(color, to);
  if (square !== null && !SAFE.includes(square)) {
    tokens.forEach((ts, s) => {
      if (s === seat) return;
      const there = ts.flatMap((step, i) => (squareOf(t.colors[s], step) === square ? [i] : []));
      // Two or more of one colour hold the square; a token alone goes back to base.
      if (there.length !== 1) return;
      captured.push({ color: t.colors[s], token: there[0], from: ts[there[0]] });
      ts[there[0]] = BASE;
    });
  }
  const n = rolled ? t.n : t.n + 1;
  const next: LudoTable = { ...t, tokens, phase: 'roll', movable: [], n, last: { n, color, die, rolled, token, from, to, captured, note: null } };
  if (tokens[seat].every((step) => step === HOME)) return { ...next, status: 'over', winner: seat, log: `🏆 ${who} kazandı!` };
  let log = from === BASE ? `${who} 6 attı, taşını yola çıkardı` : `${who} ${die} attı`;
  if (captured.length === 1) log += ` ve ${names[t.colors.indexOf(captured[0].color)]} oyuncusunun taşını kırdı!`;
  else if (captured.length) log += ` ve ${captured.length} taş kırdı!`;
  else if (to === HOME) log += ', taşı bitişe ulaştı';
  if (die === 6 || captured.length || to === HOME) return { ...next, log: `${log} · tekrar atıyor` };
  return { ...next, sixes: 0, turn: (seat + 1) % t.seats.length, log };
}

/** How many opponent tokens stand 1…6 squares behind loop square `square` and could still land on it. */
function threats(t: LudoTable, seat: number, square: number) {
  let n = 0;
  t.tokens.forEach((ts, s) => {
    if (s === seat) return;
    for (const step of ts) {
      const at = squareOf(t.colors[s], step);
      if (at === null) continue;
      const gap = (square - at + LOOP) % LOOP;
      if (gap >= 1 && gap <= 6 && step + gap <= LAST) n++;
    }
  });
  return n;
}

function score(t: LudoTable, seat: number, token: number) {
  const color = t.colors[seat];
  const from = t.tokens[seat][token];
  const to = from === BASE ? 0 : from + (t.die ?? 0);
  const square = squareOf(color, to);
  const open = square !== null && !SAFE.includes(square);
  if (open) {
    // A capture; the further the token sent back had come, the better.
    let hits = 0;
    let undone = 0;
    t.tokens.forEach((ts, s) => {
      if (s === seat) return;
      const there = ts.filter((step) => squareOf(t.colors[s], step) === square);
      if (there.length !== 1) return;
      hits++;
      undone += there[0];
    });
    if (hits) return 4000 + undone;
  }
  if (from === BASE) return 3000;
  if (to === HOME) return 2000;
  // A step forward: onto a square nobody can take it from, away from a square where it can be taken, further on.
  const here = squareOf(color, from);
  const fleeing = here !== null && !SAFE.includes(here) ? Math.min(3, threats(t, seat, here)) : 0;
  const held = open && t.tokens[seat].some((step, i) => i !== token && step === to);
  return 1000 + (open && !held ? -200 * threats(t, seat, square) : 300) + 150 * fleeing + to;
}

/**
 * The token a careful player would move among `movable`: capture first, then leave base, then reach home, then
 * the safest step forward. The practice opponents play it, and so does the server's table on a run-out turn.
 */
export function pickToken(t: LudoTable, seat: number) {
  let best = t.movable[0];
  let top = -Infinity;
  for (const i of t.movable) {
    const s = score(t, seat, i);
    if (s > top) [best, top] = [i, s];
  }
  return best;
}

/** A run-out turn: the table throws for the seat and, where there is a choice, moves the token `pickToken` names. */
function auto(t: LudoTable, names: string[], rnd: Rnd): LudoTable {
  const seat = t.turn;
  const thrown = t.phase === 'roll' ? roll(t, seat, names, rnd) : t;
  if (thrown.status !== 'playing' || thrown.turn !== seat || thrown.phase !== 'move') return thrown;
  return play(thrown, seat, pickToken(thrown, seat), names, t.phase === 'roll');
}

/** The turn's time ran out: the table plays for that seat, and after MISSES such turns in a row the seat leaves. */
export function timeoutTable(t: LudoTable, names: string[], rnd: Rnd): LudoTable {
  const seat = t.turn;
  if (t.misses[seat] + 1 >= MISSES) return leaveTable(t, seat, names);
  const next = auto(t, names, rnd);
  return { ...next, misses: next.misses.map((m, i) => (i === seat ? t.misses[seat] + 1 : m)) };
}

/**
 * Seat `seat` leaves, and its tokens with it. While waiting, or after a hand, the seat just goes. In a hand the game
 * goes on without them (a turn of theirs is over) and the last one left wins it.
 */
export function leaveTable<T extends TableBase & Partial<LudoState>>(t: T, seat: number, names: string[]): T {
  const who = names[seat];
  const rest = <X>(xs: X[]) => xs.filter((_, i) => i !== seat);
  const left = rest(names);
  const next = { ...t, ...(t.colors ? { colors: rest(t.colors) } : {}), ...(t.tokens ? { tokens: rest(t.tokens) } : {}), seats: rest(t.seats), misses: rest(t.misses) };
  if (t.status !== 'playing') return { ...next, winner: t.winner === null || t.winner === seat ? null : t.winner - (t.winner > seat ? 1 : 0), ...(t.status === 'over' ? {} : { log: `${who} masadan kalktı.` }) };
  const n = (t.n ?? 0) + 1;
  const last: LudoEvent = { n, color: t.colors?.[seat] ?? 0, die: null, rolled: false, token: null, from: null, to: null, captured: [], note: 'left' };
  const more = t.turn === seat ? { phase: 'roll' as const, sixes: 0, movable: [], n, last } : { n, last };
  if (next.seats.length === 1) return { ...next, ...more, status: 'over', turn: 0, winner: 0, log: `${who} masadan kalktı · 🏆 ${left[0]} kazandı!` };
  // The turn stays on whoever came after the one who left.
  const turn = t.turn > seat ? t.turn - 1 : t.turn === seat ? seat % next.seats.length : t.turn;
  return { ...next, ...more, turn, log: `${who} masadan kalktı.` };
}
