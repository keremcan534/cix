// What every room game's table shares, in the app: a copy of the server's seam (server/api/room-games-rules.mjs) for
// the games whose rules the app also keeps (Renk Kartları, XOX, Dört Taş: lib/room-games/cards, xox, four). A
// practice game is played with these on the phone; in a live room the server plays and the screens only read its
// state. Each game's test (tests/cards.test.ts, xox.test.ts, four.test.ts) plays the same games through this copy
// and through the server's files and fails when they differ. Pure: no React, nothing from expo.

/** A draw: 0…n−1. */
export type Rnd = (n: number) => number;
/** What every table carries, whatever the game. */
export type TableBase<G extends string> = { game: G; seats: string[]; status: 'waiting' | 'playing' | 'over'; turn: number; winner: number | null; log: string; misses: number[] };
export type MoveResult<T> = { ok: true; table: T } | { ok: false; reason: string };

/** A turn's time; then the table plays for that seat. After MISSES such turns in a row the seat goes. */
export const TURN_MS = 30_000;
export const MISSES = 3;

/** A game as the seam calls it: what its file on the server exports (see the header of room-games-rules.mjs). */
export type Game<G extends string, S extends object, M> = {
  id: G;
  meta: { name: string; min: number; max: number; autoStart?: boolean };
  /** Its fields kept per seat: they leave with the seat. */
  seatFields: readonly (keyof S)[];
  start: (t: TableBase<G> & Partial<S>, rnd: Rnd) => S & { log: string; turn?: number };
  move: (t: TableBase<G> & S, seat: number, m: M, names: string[], rnd: Rnd) => MoveResult<TableBase<G> & S>;
  /** The table after it played for the seat on turn; or, instead of it, `timeout`: a run-out turn ends the hand. */
  auto?: (t: TableBase<G> & S, names: string[], rnd: Rnd) => TableBase<G> & S;
  timeout?: (t: TableBase<G> & S, names: string[]) => TableBase<G> & S;
  /** Its fields to change when `seat` leaves mid-hand (and `turn`, when the seats aren't played in rising order). */
  left?: (t: TableBase<G> & S, seat: number) => Partial<S> & { turn?: number };
};

/** A new table with its opener on the first seat. */
export const openTable = <G extends string>(game: G, opener: string): TableBase<G> => ({ game, seats: [opener], status: 'waiting', turn: 0, winner: null, log: 'Oyuncular bekleniyor.', misses: [0] });

/** Sitting down: a seat and its count of run-out turns (the table's own code on the server, room-games.mjs). */
export const sitDown = <T extends TableBase<string>>(t: T, id: string): T => ({ ...t, seats: [...t.seats, id], misses: [...t.misses, 0] });

/** Starts (or starts again) the hand with the seated players. */
export const startTable = <G extends string, S extends object, M>(g: Game<G, S, M>, t: TableBase<G> & Partial<S>, rnd: Rnd): TableBase<G> & S => ({
  ...t,
  status: 'playing',
  turn: 0,
  winner: null,
  misses: Array<number>(t.seats.length).fill(0),
  ...g.start(t, rnd),
});

/** One move by seat `seat` (`names[seat]` for the log). */
export function moveTable<G extends string, S extends object, M>(g: Game<G, S, M>, t: TableBase<G> & S, seat: number, m: M, names: string[], rnd: Rnd): MoveResult<TableBase<G> & S> {
  if (t.status !== 'playing') return { ok: false, reason: 'Oyun başlamadı.' };
  if (t.turn !== seat) return { ok: false, reason: 'Sıra sende değil.' };
  // A move of one's own clears the turns the table played for that seat.
  return g.move({ ...t, misses: t.misses.map((x, i) => (i === seat ? 0 : x)) }, seat, m, names, rnd);
}

/** The turn's time ran out: the table plays for that seat, and after MISSES such turns in a row the seat leaves; or the game ends the hand. */
export function timeoutTable<G extends string, S extends object, M>(g: Game<G, S, M>, t: TableBase<G> & S, names: string[], rnd: Rnd): TableBase<G> & S {
  const seat = t.turn;
  if (!g.auto) return g.timeout ? g.timeout(t, names) : t;
  if (t.misses[seat] + 1 >= MISSES) return leaveTable(g, t, seat, names);
  const next = g.auto(t, names, rnd);
  return { ...next, misses: next.misses.map((m, i) => (i === seat ? t.misses[seat] + 1 : m)) };
}

/**
 * Seat `seat` leaves. While waiting, or after a hand, the seat just goes. In a hand the game goes on without them,
 * and the last one left wins it.
 */
export function leaveTable<G extends string, S extends object, M, T extends TableBase<G> & Partial<S>>(g: Game<G, S, M>, t: T, seat: number, names: string[]): T {
  const who = names[seat];
  const rest = <X>(xs: X[]) => xs.filter((_, i) => i !== seat);
  const left = rest(names);
  // The seat goes with whatever the game keeps per seat.
  const kept = Object.fromEntries(g.seatFields.filter((k) => Array.isArray(t[k as keyof T])).map((k) => [k, rest(t[k as keyof T] as unknown[])]));
  const next = { ...t, ...kept, seats: rest(t.seats), misses: rest(t.misses) };
  if (t.status !== 'playing') return { ...next, winner: t.winner === null || t.winner === seat ? null : t.winner - (t.winner > seat ? 1 : 0), ...(t.status === 'over' ? {} : { log: `${who} masadan kalktı.` }) };
  const more: Partial<S> & { turn?: number } = g.left?.(t as unknown as TableBase<G> & S, seat) ?? {};
  if (next.seats.length === 1) return { ...next, ...more, status: 'over', turn: 0, winner: 0, log: `${who} masadan kalktı · 🏆 ${left[0]} kazandı!` };
  // The turn stays on whoever came after the one who left, unless the game names it.
  const turn = t.turn > seat ? t.turn - 1 : t.turn === seat ? seat % next.seats.length : t.turn;
  return { ...next, ...more, turn: more.turn ?? turn, log: `${who} masadan kalktı.` };
}
