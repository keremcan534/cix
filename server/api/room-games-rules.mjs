// The free room games played at a table in a room (room-games.mjs), as pure functions over a table's state. No
// database and no core.mjs. Each game is a file of its own (room-games/<id>.mjs); this file is what the table
// calls: it keeps what every game shares (the seats, whose turn it is, the turns the table played for someone,
// who is left) and hands the rest to the game. Every draw (a die, a card) comes from `rnd(n)` → 0…n−1, crypto
// randomness on the server.
//
// State: { game, seats: [user ids], status: 'waiting' | 'playing' | 'over', turn (seat), winner (seat or null),
// log, misses (turns in a row the table played for each seat) } plus the game's own fields (XOX `board`, Renk
// Kartları `hands` and `top`, Ludo's tokens: see each file). Nothing here is money: the games are free.
//
// A game's file exports:
//   meta                 { name, min, max, autoStart? }  (autoStart: the hand starts when the last seat is taken)
//   seatFields           the names of its fields kept per seat, arrays in seat order: they leave with the seat
//   options(o)           optional: the opener's choices, checked and completed (kept on the table); null if wrong
//   stale(t)             optional: true for a state an older version left that this one can't play on
//   start(t, rnd)        its fields for a new hand, with the first `log`
//   move(t, seat, move, names, rnd) → { ok: true, table } | { ok: false, reason }  (called for the seat on turn)
//   auto(t, names, rnd)  the table after it played for the seat on turn, whose time ran out; or, instead of it,
//   timeout(t, names)    the table when a run-out turn ends the hand (XOX: that player loses)
//   left(t, seat)        optional: its fields to change when `seat` leaves a hand that goes on
//   view(t, seat)        the state as that seat sees it (−1: someone watching)
// Adding a game: its file, a line in GAMES below, its id in the room_tables check (a migration), and the app's
// screen for it (app/src/components/games/room/).
import * as cards from './room-games/cards.mjs';
import * as ludo from './room-games/ludo.mjs';
import * as xox from './room-games/xox.mjs';

const GAMES = { ludo, cards, xox };

export const TABLE_GAMES = { ludo: ludo.meta, cards: cards.meta, xox: xox.meta };
/** A turn's time; then the table plays for that seat (timeoutTable). After MISSES such turns in a row the seat goes. */
export const TURN_MS = 30_000;
export const MISSES = 3;
// The games' own pieces, for the callers and tests that read them from here.
export { HAND, newCard, playable } from './room-games/cards.mjs';
export { LINES, xoxLine } from './room-games/xox.mjs';

/** The opener's choices for `game`, checked (none for a game that takes none); null when they are not valid. */
export const tableOptions = (game, options) => (GAMES[game].options ? GAMES[game].options(options) : {});
/** True for a table an older version left in a state its game can't play on: the room has no table then. */
export const staleTable = (t) => !Object.hasOwn(GAMES, t?.game ?? '') || !!GAMES[t.game].stale?.(t);

/** A new table with its opener on the first seat. */
export const openTable = (game, opener, options) => ({ game, seats: [opener], status: 'waiting', turn: 0, winner: null, log: 'Oyuncular bekleniyor.', misses: [0], ...(tableOptions(game, options) ?? {}) });

/** Starts (or starts again) the hand with the seated players. */
export const startTable = (t, rnd) => ({ ...t, status: 'playing', turn: 0, winner: null, misses: Array(t.seats.length).fill(0), ...GAMES[t.game].start(t, rnd) });

/**
 * One move by seat `seat` (`names[seat]` for the log). XOX: { cell }; Ludo: { roll: true }, then { token } when
 * there is a choice; Renk Kartları: { card } (an index in the hand) or { card: null } to draw. Returns
 * { ok: true, table } or { ok: false, reason }.
 */
export function moveTable(t, seat, move, names, rnd) {
  if (t.status !== 'playing') return { ok: false, reason: 'Oyun başlamadı.' };
  if (t.turn !== seat) return { ok: false, reason: 'Sıra sende değil.' };
  // A move of one's own clears the turns the table played for that seat.
  return GAMES[t.game].move({ ...t, misses: t.misses.map((m, i) => (i === seat ? 0 : m)) }, seat, move, names, rnd);
}

/**
 * The turn's time ran out: the table plays for that seat (Ludo throws and moves, Renk Kartları plays its first card
 * that fits or draws), and after MISSES such turns in a row the seat leaves. In XOX the one whose time ran out loses.
 */
export function timeoutTable(t, names, rnd) {
  const g = GAMES[t.game];
  const seat = t.turn;
  if (!g.auto) return g.timeout(t, names);
  if (t.misses[seat] + 1 >= MISSES) return leaveTable(t, seat, names);
  const next = g.auto(t, names, rnd);
  return { ...next, misses: next.misses.map((m, i) => (i === seat ? t.misses[seat] + 1 : m)) };
}

/**
 * Seat `seat` leaves. While waiting, or after a hand, the seat just goes. In a hand the game goes on without them,
 * and the last one left wins it (so in XOX the other player does).
 */
export function leaveTable(t, seat, names) {
  const g = GAMES[t.game];
  const who = names[seat];
  const rest = (xs) => xs.filter((_, i) => i !== seat);
  const left = rest(names);
  // The seat goes with whatever the game keeps per seat.
  const kept = Object.fromEntries(g.seatFields.filter((k) => Array.isArray(t[k])).map((k) => [k, rest(t[k])]));
  const next = { ...t, ...kept, seats: rest(t.seats), misses: rest(t.misses) };
  if (t.status !== 'playing') return { ...next, winner: t.winner === null || t.winner === seat ? null : t.winner - (t.winner > seat ? 1 : 0), ...(t.status === 'over' ? {} : { log: `${who} masadan kalktı.` }) };
  const more = g.left?.(t, seat) ?? {};
  if (next.seats.length === 1) return { ...next, ...more, status: 'over', turn: 0, winner: 0, log: `${who} masadan kalktı · 🏆 ${left[0]} kazandı!` };
  // The turn stays on whoever came after the one who left.
  const turn = t.turn > seat ? t.turn - 1 : t.turn === seat ? seat % next.seats.length : t.turn;
  return { ...next, ...more, turn, log: `${who} masadan kalktı.` };
}

/** One seat's view: never another player's cards (their counts only). */
export const viewOf = (t, seat) => GAMES[t.game].view(t, seat);
