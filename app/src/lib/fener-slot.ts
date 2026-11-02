// Fener Kayalığı: a night sea under a lighthouse. Ships land on a 5×4 sea, each carrying cargo worth a share of the
// stake; then the lighthouse beam sweeps the rows and stops on one. The ships in the light reach the harbour: their
// cargo is paid, times the beam's brightness. Same house rule as every coin game: the expected return of a round,
// the storm included, is at most 40 % of the stake (see lib/casino-odds).
//
// Model:
//  - The server draws each of the 20 cells on its own: open sea, a ship (with a cargo value) or a kandil.
//  - The beam stops on one of the 4 rows, uniformly; its brightness (×1, ×2, ×3, ×5) is a separate draw.
//    Neither depends on where the ships are, so a ship just outside the light is chance, never steering.
//  - 3+ kandil anywhere start Fırtına Gecesi: STORM_SPINS spins where the beam lights two rows at once and burns
//    one step brighter every spin (×1, ×2 … ×6). Kandil do nothing during the storm, so a round always ends.
//  - One round pays at most FENER_MAX times the stake.
//
// The expected return is exact (fenerReturn): every cell is an independent draw and the beam ignores the cells,
// so a lit row's expected cargo is COLS × (ship chance × mean cargo), whatever else is on the board.
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export const COLS = 5;
export const ROWS = 4;
export const CELLS = COLS * ROWS;

export type FCell = { kind: 'sea' } | { kind: 'ship'; cargo: number } | { kind: 'lamp' };

/** Relative weight of each cell kind in a draw. */
export const CELL_WEIGHTS = { sea: 202, ship: 23, lamp: 5 } as const;
/**
 * Cargo in tenths of the stake (1 = ×0.1 … 500 = ×50) and its weight. Kept in tenths so a row's total is an exact
 * integer before the single division at the end.
 */
export const CARGO: { tenths: number; weight: number }[] = [
  { tenths: 1, weight: 900 },
  { tenths: 2, weight: 600 },
  { tenths: 5, weight: 280 },
  { tenths: 10, weight: 110 },
  { tenths: 20, weight: 45 },
  { tenths: 50, weight: 14 },
  { tenths: 100, weight: 5 },
  { tenths: 250, weight: 2 },
  { tenths: 500, weight: 1 },
];
/** Beam brightness on a base spin and its weight. */
export const BRIGHTNESS: { value: number; weight: number }[] = [
  { value: 1, weight: 60 },
  { value: 2, weight: 24 },
  { value: 3, weight: 11 },
  { value: 5, weight: 5 },
];
export const STORM_TRIGGER = 3;
export const STORM_SPINS = 6;
export const STORM_ROWS = 2;
export const FENER_MAX = 500;

/** The six ways the storm beam can light two different rows. */
export const ROW_PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

const CELL_TOTAL = CELL_WEIGHTS.sea + CELL_WEIGHTS.ship + CELL_WEIGHTS.lamp;
const CARGO_TOTAL = CARGO.reduce((n, c) => n + c.weight, 0);
const BRIGHT_TOTAL = BRIGHTNESS.reduce((n, b) => n + b.weight, 0);

export type FSpin = {
  /** grid[row][col] */
  grid: FCell[][];
  /** Rows the beam lit, top = 0. */
  lit: number[];
  brightness: number;
  /** Cargo of the lit ships in multiples of the stake, before brightness. */
  cargo: number;
  /** Kandil on the board (they only count on the base spin). */
  lamps: number;
  /** cargo × brightness, in multiples of the stake. */
  pay: number;
};
export type FenerRound = { base: FSpin; storm: FSpin[]; multiplier: number; capped: boolean };

/** Scores a board for the given lit rows and brightness. */
export function evaluateBoard(grid: FCell[][], lit: number[], brightness: number): FSpin {
  let tenths = 0;
  for (const r of lit) for (const c of grid[r]) if (c.kind === 'ship') tenths += c.cargo;
  const lamps = grid.flat().filter((c) => c.kind === 'lamp').length;
  return { grid, lit, brightness, cargo: tenths / 10, lamps, pay: (tenths * brightness) / 10 };
}

function drawCell(rnd: (n: number) => number): FCell {
  const r = rnd(CELL_TOTAL);
  if (r < CELL_WEIGHTS.sea) return { kind: 'sea' };
  if (r >= CELL_WEIGHTS.sea + CELL_WEIGHTS.ship) return { kind: 'lamp' };
  let w = rnd(CARGO_TOTAL);
  return { kind: 'ship', cargo: CARGO.find((c) => (w -= c.weight) < 0)!.tenths };
}
const drawBoard = (rnd: (n: number) => number) => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => drawCell(rnd)));

/** A base spin: the board, then the beam's row, then its brightness. */
export function baseSpin(rnd: (n: number) => number): FSpin {
  const grid = drawBoard(rnd);
  const row = rnd(ROWS);
  let b = rnd(BRIGHT_TOTAL);
  return evaluateBoard(grid, [row], BRIGHTNESS.find((x) => (b -= x.weight) < 0)!.value);
}

/** Storm spin `n` (1-based): two rows lit, brightness n. */
export function stormSpin(rnd: (n: number) => number, n: number): FSpin {
  const grid = drawBoard(rnd);
  return evaluateBoard(grid, [...ROW_PAIRS[rnd(ROW_PAIRS.length)]], n);
}

/** One round: the base spin and, with 3+ kandil, the storm. */
export function playFener(rnd: (n: number) => number): FenerRound {
  const base = baseSpin(rnd);
  const storm = base.lamps >= STORM_TRIGGER ? Array.from({ length: STORM_SPINS }, (_, i) => stormSpin(rnd, i + 1)) : [];
  const total = base.pay + storm.reduce((n, s) => n + s.pay, 0);
  return { base, storm, multiplier: Math.min(total, FENER_MAX), capped: total > FENER_MAX };
}

/**
 * Exact expected return of one round, as a share of the stake, ignoring the FENER_MAX cap (the cap only lowers it,
 * so this is an upper bound).
 */
export function fenerReturn(): { cell: number; base: number; trigger: number; storm: number; total: number } {
  // Expected cargo of one cell, in multiples of the stake.
  const cell = (CELL_WEIGHTS.ship / CELL_TOTAL) * (CARGO.reduce((n, c) => n + c.tenths * c.weight, 0) / CARGO_TOTAL / 10);
  const bright = BRIGHTNESS.reduce((n, b) => n + b.value * b.weight, 0) / BRIGHT_TOTAL;
  const base = bright * COLS * cell;
  // P(at least STORM_TRIGGER kandil among CELLS independent cells).
  const p = CELL_WEIGHTS.lamp / CELL_TOTAL;
  let pk = (1 - p) ** CELLS;
  let below = 0;
  for (let k = 0; k < STORM_TRIGGER; k++) {
    below += pk;
    pk = (pk * (CELLS - k) * p) / ((k + 1) * (1 - p));
  }
  const trigger = 1 - below;
  // Storm spin n lights STORM_ROWS rows at brightness n.
  const storm = ((STORM_SPINS * (STORM_SPINS + 1)) / 2) * STORM_ROWS * COLS * cell;
  return { cell, base, trigger, storm, total: base + trigger * storm };
}

/** Short Turkish label of a cargo value: "×0,1", "×2", "×50". */
export const cargoLabel = (tenths: number) => `×${(tenths / 10).toLocaleString('tr-TR')}`;
