// Ludo at a room's table: one of the free room games behind room-games-rules.mjs (the seam every game follows is
// written there). Pure functions over the table's state; every die comes from `rnd(n)` → 0…n−1. The app keeps a
// copy of these rules for its board and its practice games (app/src/lib/room-games/ludo.ts); app/tests/ludo.test.ts
// plays the same seeded games through both and fails when they differ.
//
// The board: a loop of 52 squares around a cross and four colours clockwise (0…3), each with a base, a start
// square (loop square 13 × colour), a home column of five squares and home. A token's place is its `step`:
//   −1 in base · 0…50 on the loop (0 is its start square) · 51…55 in its home column · 56 home.
// Two players sit on opposite colours (0 and 2).
//
// The rules:
//  - A turn is a throw, then a token to move when there is a choice. With one token to move (or several standing
//    together, which move alike) the table moves it at once; with none the turn passes.
//  - Only a 6 takes a token out of base, onto its start square. Home needs the exact number.
//  - A 6 throws again; the third 6 in a row is not played and the turn passes.
//  - Landing where an opponent has one token alone sends it back to base and throws again. Two or more tokens of
//    one colour hold their square, and nothing is captured on the eight safe squares (the four start squares and
//    the four stars), which tokens share. Tokens pass each other freely.
//  - A token reaching home throws again. The first player with every token home wins and the hand ends.
//  - `mode`: 'quick' is two tokens each (the default: a voice room's game is a short one), 'classic' four.
//
// Its fields: mode, hand (counts the table's hands), colors (seat → colour), tokens (seat → each token's step),
// phase ('roll' | 'move'), die (the last one thrown), sixes (in a row, this turn), movable (the tokens to choose
// from in phase 'move'), n (counts the hand's events) and last, the event that made this state, for the screen to
// play: { n, color, die, rolled (thrown in this event), token, from, to (the token moved, or nulls), captured
// [{ color, token, from }], note ('none': nothing could move · 'sixes': the third 6 · 'left': that colour left) }.
export const meta = { name: 'Ludo', min: 2, max: 4 };
export const seatFields = ['colors', 'tokens'];

export const LOOP = 52;
/** A token's last step on the loop; then the five squares of its home column, then home. */
export const LAST = 50;
export const HOME = 56;
export const BASE = -1;
/** Tokens each, by mode. */
export const MODES = { quick: 2, classic: 4 };
/** Loop squares where nothing is captured: the four start squares and, eight squares on, the four stars. */
export const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];

/** Seat → colour: two players face each other across the board. */
export const seatColors = (n) => (n === 2 ? [0, 2] : Array.from({ length: n }, (_, i) => i));
/** The loop square under a token of `color` at `step`; null in base, in the home column and home. */
export const squareOf = (color, step) => (step >= 0 && step <= LAST ? (color * 13 + step) % LOOP : null);

/** The opener's choice: { mode } ('quick' when not said). */
export function options(o) {
  const mode = o?.mode ?? 'quick';
  return typeof mode === 'string' && Object.hasOwn(MODES, mode) ? { mode } : null;
}

/** A table kept from the version with one token each on a line: this one can't play it on. */
export const stale = (t) => t.status !== 'waiting' && !Array.isArray(t.tokens);

export function start(t) {
  const mode = typeof t.mode === 'string' && Object.hasOwn(MODES, t.mode) ? t.mode : 'quick';
  const n = t.seats.length;
  return {
    mode,
    hand: (t.hand ?? 0) + 1,
    colors: seatColors(n),
    tokens: Array.from({ length: n }, () => Array(MODES[mode]).fill(BASE)),
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
export const legalTokens = (t, seat, die) => t.tokens[seat].flatMap((step, i) => ((step === BASE ? die === 6 : step < HOME && step + die <= HOME) ? [i] : []));

/** { roll: true } throws the die; { token } moves that token when there was a choice. */
export function move(t, seat, m, names, rnd) {
  if (t.phase === 'roll') return m?.roll === true ? { ok: true, table: roll(t, seat, names, rnd) } : { ok: false, reason: 'Önce zar at.' };
  if (m?.token === undefined || m?.token === null) return { ok: false, reason: 'Oynayacağın taşı seç.' };
  if (!t.movable.includes(m.token)) return { ok: false, reason: 'Bu taş oynanamaz.' };
  return { ok: true, table: play(t, seat, m.token, names, false) };
}

const pass = (t, seat, last, log) => ({ ...t, phase: 'roll', sixes: 0, movable: [], turn: (seat + 1) % t.seats.length, last, log });

function roll(t, seat, names, rnd) {
  const die = rnd(6) + 1;
  const who = names[seat];
  const sixes = die === 6 ? t.sixes + 1 : 0;
  const thrown = { ...t, die, sixes, movable: [], n: t.n + 1 };
  const last = { n: t.n + 1, color: t.colors[seat], die, rolled: true, token: null, from: null, to: null, captured: [], note: null };
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
function play(t, seat, token, names, rolled) {
  const who = names[seat];
  const color = t.colors[seat];
  const die = t.die;
  const from = t.tokens[seat][token];
  const to = from === BASE ? 0 : from + die;
  const tokens = t.tokens.map((ts) => [...ts]);
  tokens[seat][token] = to;
  const captured = [];
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
  const next = { ...t, tokens, phase: 'roll', movable: [], n, last: { n, color, die, rolled, token, from, to, captured, note: null } };
  if (tokens[seat].every((step) => step === HOME)) return { ...next, status: 'over', winner: seat, log: `🏆 ${who} kazandı!` };
  let log = from === BASE ? `${who} 6 attı, taşını yola çıkardı` : `${who} ${die} attı`;
  if (captured.length === 1) log += ` ve ${names[t.colors.indexOf(captured[0].color)]} oyuncusunun taşını kırdı!`;
  else if (captured.length) log += ` ve ${captured.length} taş kırdı!`;
  else if (to === HOME) log += ', taşı bitişe ulaştı';
  if (die === 6 || captured.length || to === HOME) return { ...next, log: `${log} · tekrar atıyor` };
  return { ...next, sixes: 0, turn: (seat + 1) % t.seats.length, log };
}

/** How many opponent tokens stand 1…6 squares behind loop square `square` and could still land on it. */
function threats(t, seat, square) {
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

function score(t, seat, token) {
  const color = t.colors[seat];
  const from = t.tokens[seat][token];
  const to = from === BASE ? 0 : from + t.die;
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
 * the safest step forward. The table plays it on a run-out turn, and so do the app's practice opponents.
 */
export function pickToken(t, seat) {
  let best = t.movable[0];
  let top = -Infinity;
  for (const i of t.movable) {
    const s = score(t, seat, i);
    if (s > top) [best, top] = [i, s];
  }
  return best;
}

/** A run-out turn: the table throws for the seat and, where there is a choice, moves the token `pickToken` names. */
export function auto(t, names, rnd) {
  const seat = t.turn;
  const thrown = t.phase === 'roll' ? roll(t, seat, names, rnd) : t;
  if (thrown.status !== 'playing' || thrown.turn !== seat || thrown.phase !== 'move') return thrown;
  return play(thrown, seat, pickToken(thrown, seat), names, t.phase === 'roll');
}

/** `seat` leaves a hand that goes on: their tokens come off the board with them, and a turn of theirs is over. */
export function left(t, seat) {
  const last = { n: t.n + 1, color: t.colors[seat], die: null, rolled: false, token: null, from: null, to: null, captured: [], note: 'left' };
  return t.turn === seat ? { phase: 'roll', sixes: 0, movable: [], n: t.n + 1, last } : { n: t.n + 1, last };
}

export const view = (t) => t;
