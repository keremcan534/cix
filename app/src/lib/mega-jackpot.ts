// Mega Jackpot: the 5×3 jackpot slot (10 paylines, 77 Wild, progressive JACKPOT). Same house rule as every coin game:
// 40 % of the stake comes back to players. Here it is split in two parts:
//  - the line wins: their expected return is computed exactly (jackpotReturn) and stays under LINE_RETURN;
//  - the JACKPOT: JACKPOT_SHARE of every stake is set aside into the jackpot fund (lib/games) and the fund is paid
//    out, all of it eventually, to whoever lines up five 77s. LINE_RETURN + JACKPOT_SHARE = 40 %.
//
// Model:
//  - Each reel has a fixed strip; the server draws one stop per reel, uniformly. The window shows the stop and the
//    two symbols after it (circular).
//  - The stake is spread evenly over the 10 lines (line bet = bet / 10). A line pays when 3+ of the same symbol run
//    from the leftmost reel. 77 (Wild) stands in for every symbol, also on reel 1: the line's symbol is its first
//    symbol that is not 77.
//  - Five 77s on a line win the JACKPOT instead of a line pay: bet / max bet of the fund (lib/games pays it).
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.
import { LINES, REELS, ROWS } from '@/lib/fortune-slot';

export { LINES, REELS, ROWS };
export type Sym = 'cherry' | 'bell' | 'bar' | 'bar2' | 'dollar' | 'seven' | 'wild';
export const WILD: Sym = 'wild';

export const SYMBOLS: Record<Sym, { name: string; label: string }> = {
  cherry: { name: 'Kiraz', label: '🍒' },
  bell: { name: 'Çan', label: '🔔' },
  bar: { name: 'BAR', label: 'BAR' },
  bar2: { name: 'Çift BAR', label: 'BAR BAR' },
  dollar: { name: 'Dolar', label: '$' },
  seven: { name: 'Yedi', label: '7' },
  wild: { name: '77 (Wild)', label: '77' },
};

/** Line pays in line bets for 3, 4 and 5 in a row. */
export const PAYTABLE: Partial<Record<Sym, [number, number, number]>> = {
  cherry: [1, 3, 8],
  bell: [2, 4, 10],
  bar: [2, 5, 12],
  bar2: [3, 8, 20],
  dollar: [5, 12, 30],
  seven: [6, 20, 60],
};

/** Share of every stake set aside for the JACKPOT; the line wins return at most the rest of the 40 %. */
export const JACKPOT_SHARE = 0.02;
export const LINE_RETURN = 0.4 - JACKPOT_SHARE;

/** How many of each symbol sit on each reel's strip (30 stops). */
const COUNTS: Record<Sym, number>[] = [
  { cherry: 8, bell: 6, bar: 5, bar2: 3, dollar: 3, seven: 2, wild: 3 },
  { cherry: 8, bell: 6, bar: 5, bar2: 3, dollar: 3, seven: 2, wild: 3 },
  { cherry: 8, bell: 6, bar: 4, bar2: 4, dollar: 3, seven: 2, wild: 3 },
  { cherry: 8, bell: 6, bar: 4, bar2: 4, dollar: 3, seven: 2, wild: 3 },
  { cherry: 8, bell: 6, bar: 4, bar2: 4, dollar: 3, seven: 2, wild: 3 },
];

/** Lays the counts out as a strip, spreading each symbol evenly so equal symbols don't bunch up. */
function buildStrip(counts: Record<Sym, number>): Sym[] {
  const placed: { sym: Sym; at: number }[] = [];
  (Object.keys(counts) as Sym[]).forEach((sym, k) => {
    for (let i = 0; i < counts[sym]; i++) placed.push({ sym, at: (i + 0.5) / counts[sym] + k * 1e-3 });
  });
  return placed.sort((a, b) => a.at - b.at).map((p) => p.sym);
}
export const STRIPS: Sym[][] = COUNTS.map(buildStrip);

export type LineWin = { line: number; sym: Sym; count: number; pay: number };
export type MegaSpin = {
  stops: number[];
  grid: Sym[][];
  wins: LineWin[];
  /** Lines with five 77s (the round wins the JACKPOT when there is at least one). */
  jackpotLines: number[];
  /** Line wins in multiples of the stake. */
  multiplier: number;
};

/** Pay of one line in line bets, from the five symbols it crosses (left to right); 'jackpot' for five 77s. */
export function linePay(syms: Sym[]): { sym: Sym; count: number; pay: number } | 'jackpot' | null {
  const first = syms.findIndex((s) => s !== WILD);
  if (first < 0) return 'jackpot';
  const sym = syms[first];
  let count = first + 1;
  while (count < syms.length && (syms[count] === sym || syms[count] === WILD)) count++;
  return count >= 3 ? { sym, count, pay: PAYTABLE[sym]![count - 3] } : null;
}

/** The visible 3 symbols of each reel for the given stops: grid[reel][row]. */
export const reelWindow = (stops: number[]): Sym[][] => stops.map((s, r) => [0, 1, 2].map((k) => STRIPS[r][(s + k) % STRIPS[r].length]));

export function megaSpin(stops: number[]): MegaSpin {
  const grid = reelWindow(stops);
  const wins: LineWin[] = [];
  const jackpotLines: number[] = [];
  LINES.forEach((rows, line) => {
    const w = linePay(rows.map((row, reel) => grid[reel][row]));
    if (w === 'jackpot') jackpotLines.push(line);
    else if (w) wins.push({ line, ...w });
  });
  return { stops, grid, wins, jackpotLines, multiplier: wins.reduce((n, w) => n + w.pay, 0) / LINES.length };
}

/** One round from a uniform draw function (rnd(n) → 0…n−1). */
export const playMega = (rnd: (n: number) => number): MegaSpin => megaSpin(STRIPS.map((s) => rnd(s.length)));

/** Exact expected return of the line wins, as a share of the stake, and the chance of five 77s on one line. */
export function jackpotReturn(): { lines: number; jackpotLine: number } {
  const syms = Object.keys(SYMBOLS) as Sym[];
  const p = STRIPS.map((strip) => Object.fromEntries(syms.map((s) => [s, strip.filter((x) => x === s).length / strip.length])) as Record<Sym, number>);
  // Every cell is distributed as its reel strip, so one line's expected pay (in line bets) is the round's expected
  // line return as a share of the stake.
  let lines = 0;
  let jackpotLine = 0;
  const walk = (reel: number, picked: Sym[], prob: number) => {
    if (prob === 0) return;
    if (reel === REELS) {
      const w = linePay(picked);
      if (w === 'jackpot') jackpotLine += prob;
      else lines += prob * (w?.pay ?? 0);
      return;
    }
    for (const s of syms) walk(reel + 1, [...picked, s], prob * p[reel][s]);
  };
  walk(0, [], 1);
  return { lines, jackpotLine };
}

/** Highest line win of one round, in multiples of the stake (every line at the top pay). */
export const MEGA_MAX = Math.max(...Object.values(PAYTABLE).map((t) => t![2]));
