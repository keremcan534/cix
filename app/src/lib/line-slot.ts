// Generic payline slot (Mega Jackpot, Süper 777, Orman Avı, Piñata, Büyü Kitabı, Neon Jackpot): one engine, one data
// object per game (lib/slot-configs). Same house rule as every coin game: the expected return of a round is at most
// 40 % of the stake, computed exactly (slotReturn) and checked by tests.
//
// Model:
//  - Each reel has a fixed strip (counts per symbol, spread evenly); the server draws one stop per reel, uniformly.
//    The window shows the stop and the rows − 1 symbols after it (circular).
//  - The stake is spread evenly over the lines. A line pays when 3+ of the same symbol run from the leftmost reel.
//    Wild stands in for every symbol except the scatter, also on reel 1: the line's symbol is its first non-wild.
//  - Scatter pays anywhere on the screen, in multiples of the whole stake (scatterPays).
//  - With `jackpotShare`, a line of only wilds wins the game's JACKPOT instead of a line pay; that share of every
//    stake goes into the game's jackpot fund (lib/games), so line wins + scatter + jackpotShare ≤ 40 %.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export type SlotConfig = {
  id: string;
  rows: number;
  symbols: Record<string, { name: string; label: string }>;
  wild?: string;
  scatter?: string;
  /** Line pays in line bets for 3, 4, 5 … in a row (index = count − 3). */
  paytable: Record<string, number[]>;
  /** Scatter count → pay in multiples of the stake; the highest key not above the count applies. */
  scatterPays?: Record<number, number>;
  jackpotShare?: number;
  /** Symbol counts on each reel's strip. */
  counts: Record<string, number>[];
  /** Row of each reel for every payline (0 = top). */
  lines: number[][];
};

export type LineWin = { line: number; sym: string; count: number; pay: number };
export type SlotSpin = {
  stops: number[];
  /** grid[reel][row] */
  grid: string[][];
  wins: LineWin[];
  scatters: number;
  /** Lines made only of wilds (the round wins the JACKPOT when there is at least one and the game has one). */
  jackpotLines: number[];
  /** Line wins plus scatter pay, in multiples of the stake. */
  multiplier: number;
};

/** Lays counts out as a strip, spreading each symbol evenly so equal symbols don't bunch up. */
export function buildStrip(counts: Record<string, number>): string[] {
  const placed: { sym: string; at: number }[] = [];
  Object.keys(counts).forEach((sym, k) => {
    for (let i = 0; i < counts[sym]; i++) placed.push({ sym, at: (i + 0.5) / counts[sym] + k * 1e-3 });
  });
  return placed.sort((a, b) => a.at - b.at).map((p) => p.sym);
}

const stripCache = new Map<string, string[][]>();
export const stripsOf = (c: SlotConfig) => {
  let s = stripCache.get(c.id);
  if (!s) stripCache.set(c.id, (s = c.counts.map(buildStrip)));
  return s;
};

/** Pay of one line in line bets from the symbols it crosses (left to right); 'jackpot' for a line of wilds. */
export function linePay(c: SlotConfig, syms: string[]): { sym: string; count: number; pay: number } | 'jackpot' | null {
  const first = syms.findIndex((s) => s !== c.wild);
  if (first < 0) {
    if (c.jackpotShare) return 'jackpot';
    const t = c.paytable[c.wild!];
    return t ? { sym: c.wild!, count: syms.length, pay: t[syms.length - 3] } : null;
  }
  const sym = syms[first];
  const table = c.paytable[sym];
  if (!table) return null;
  let count = first + 1;
  while (count < syms.length && (syms[count] === sym || syms[count] === c.wild)) count++;
  return count >= 3 ? { sym, count, pay: table[count - 3] ?? 0 } : null;
}

export const scatterPay = (c: SlotConfig, n: number) => {
  if (!c.scatterPays) return 0;
  const keys = Object.keys(c.scatterPays)
    .map(Number)
    .filter((k) => k <= n);
  return keys.length ? c.scatterPays[Math.max(...keys)] : 0;
};

export const slotWindow = (c: SlotConfig, stops: number[]): string[][] => {
  const strips = stripsOf(c);
  return stops.map((s, r) => Array.from({ length: c.rows }, (_, k) => strips[r][(s + k) % strips[r].length]));
};

export function slotSpin(c: SlotConfig, stops: number[]): SlotSpin {
  const grid = slotWindow(c, stops);
  const wins: LineWin[] = [];
  const jackpotLines: number[] = [];
  c.lines.forEach((rows, line) => {
    const w = linePay(
      c,
      rows.map((row, reel) => grid[reel][row]),
    );
    if (w === 'jackpot') jackpotLines.push(line);
    else if (w && w.pay) wins.push({ line, ...w });
  });
  const scatters = c.scatter ? grid.flat().filter((s) => s === c.scatter).length : 0;
  const lineWin = wins.reduce((n, w) => n + w.pay, 0) / c.lines.length;
  return { stops, grid, wins, scatters, jackpotLines, multiplier: lineWin + scatterPay(c, scatters) };
}

/** One round from a uniform draw function (rnd(n) → 0…n−1). */
export const playSlot = (c: SlotConfig, rnd: (n: number) => number): SlotSpin => slotSpin(
  c,
  stripsOf(c).map((s) => rnd(s.length)),
);

/**
 * Exact expected return of one round, as a share of the stake: line wins (every cell is distributed as its reel
 * strip, so one line's expected pay in line bets is the round's line return), scatter pays (from the distribution of
 * scatters per reel window) and the jackpot share. `jackpotLine` is the chance that a given line is all wilds.
 */
export function slotReturn(c: SlotConfig): { lines: number; scatter: number; jackpot: number; total: number; jackpotLine: number } {
  const strips = stripsOf(c);
  const syms = Object.keys(c.symbols);
  const p = strips.map((strip) => Object.fromEntries(syms.map((s) => [s, strip.filter((x) => x === s).length / strip.length])));
  let lines = 0;
  let jackpotLine = 0;
  const walk = (reel: number, picked: string[], prob: number) => {
    if (prob === 0) return;
    if (reel === strips.length) {
      const w = linePay(c, picked);
      if (w === 'jackpot') jackpotLine += prob;
      else lines += prob * (w?.pay ?? 0);
      return;
    }
    for (const s of syms) walk(reel + 1, [...picked, s], prob * p[reel][s]);
  };
  walk(0, [], 1);
  let scatter = 0;
  if (c.scatter && c.scatterPays) {
    let dist = [1];
    strips.forEach((strip) => {
      const per: number[] = [];
      strip.forEach((_, s) => {
        const n = Array.from({ length: c.rows }, (_, k) => strip[(s + k) % strip.length]).filter((x) => x === c.scatter).length;
        per[n] = (per[n] ?? 0) + 1 / strip.length;
      });
      const next: number[] = [];
      dist.forEach((a, i) => per.forEach((b = 0, j) => (next[i + j] = (next[i + j] ?? 0) + a * b)));
      dist = next;
    });
    scatter = dist.reduce((n, pr = 0, k) => n + pr * scatterPay(c, k), 0);
  }
  const jackpot = c.jackpotShare ?? 0;
  return { lines, scatter, jackpot, total: lines + scatter + jackpot, jackpotLine };
}

/** Highest win of one round from lines and scatter, in multiples of the stake (every line at the top pay). */
export const slotMax = (c: SlotConfig) =>
  Math.max(...Object.values(c.paytable).map((t) => t[t.length - 1])) + Math.max(0, ...Object.values(c.scatterPays ?? {}));

// --- Payline sets ------------------------------------------------------------------------------------------------
/** 5×3, 10 lines. */
export const LINES_10: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
];
/** 5×3, 15 lines. */
export const LINES_15: number[][] = [
  ...LINES_10,
  [1, 0, 1, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
];
/** 5×3, 20 lines. */
export const LINES_20: number[][] = [
  ...LINES_15,
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 0, 2, 0],
];
/** 3×3, 5 lines: the three rows and the two diagonals. */
export const LINES_3x3: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];
