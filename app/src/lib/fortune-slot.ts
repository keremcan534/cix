// Altın Kasa: the 5×3 casino slot (10 paylines, Wild, Kasa scatter → free spins). Same house rule as every coin game:
// the expected return of a round, free spins included, is 40 % of the stake (see lib/casino-odds).
//
// Model:
//  - Each reel has a fixed strip; the server draws one stop per reel, uniformly. The window shows the stop and the
//    two symbols after it (circular).
//  - The stake is spread evenly over the 10 lines (line bet = bet / 10). A line pays when 3+ of the same symbol run
//    from the leftmost reel; Servet (Wild) stands in for every symbol except Kasa. Wild never sits on reel 1, so a
//    line's symbol is always the one on reel 1.
//  - 3+ Kasa anywhere on the base spin give FREE_SPINS free spins that pay FREE_MULT×. Kasa does nothing during
//    free spins (no retrigger), so a round always ends.
//
// The expected return is computed exactly (fortuneReturn): every cell's symbol is distributed as its reel strip, so
// one line's expected pay is a sum over symbol counts, and the free-spin chance comes from the strip windows.
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export type Sym = 'coin' | 'cash' | 'ring' | 'watch' | 'gem' | 'crown' | 'car' | 'yacht' | 'wild' | 'vault';
export const WILD: Sym = 'wild';
export const SCATTER: Sym = 'vault';

export const SYMBOLS: Record<Sym, { name: string; emoji: string }> = {
  coin: { name: 'Jeton', emoji: '🪙' },
  cash: { name: 'Banknot', emoji: '💵' },
  ring: { name: 'Yüzük', emoji: '💍' },
  watch: { name: 'Saat', emoji: '⌚' },
  gem: { name: 'Elmas', emoji: '💎' },
  crown: { name: 'Taç', emoji: '👑' },
  car: { name: 'Spor Araba', emoji: '🏎️' },
  yacht: { name: 'Yat', emoji: '🛥️' },
  wild: { name: 'Servet', emoji: '💰' },
  vault: { name: 'Kasa', emoji: '🏦' },
};

/** Line pays in line bets for 3, 4 and 5 in a row. */
export const PAYTABLE: Partial<Record<Sym, [number, number, number]>> = {
  coin: [3, 6, 15],
  cash: [3, 6, 15],
  ring: [4, 8, 20],
  watch: [4, 8, 20],
  gem: [5, 10, 25],
  crown: [6, 15, 30],
  car: [8, 20, 40],
  yacht: [10, 25, 50],
};

export const REELS = 5;
export const ROWS = 3;
/** Row of each reel for the 10 paylines (0 = top). */
export const LINES: number[][] = [
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
export const FREE_SPINS = 8;
export const FREE_MULT = 2;
export const SCATTER_TRIGGER = 3;

/** How many of each symbol sit on each reel's strip (30 stops). Wild only on reels 2–4. */
const COUNTS: Record<Sym, number>[] = [
  { coin: 6, cash: 6, ring: 5, watch: 5, gem: 3, crown: 2, car: 1, yacht: 1, wild: 0, vault: 1 },
  { coin: 4, cash: 4, ring: 5, watch: 4, gem: 3, crown: 2, car: 2, yacht: 1, wild: 4, vault: 1 },
  { coin: 4, cash: 4, ring: 4, watch: 4, gem: 3, crown: 3, car: 2, yacht: 1, wild: 4, vault: 1 },
  { coin: 4, cash: 4, ring: 5, watch: 4, gem: 3, crown: 2, car: 2, yacht: 1, wild: 4, vault: 1 },
  { coin: 6, cash: 6, ring: 5, watch: 5, gem: 3, crown: 2, car: 1, yacht: 1, wild: 0, vault: 1 },
];

/** Lays the counts out as a strip, spreading each symbol evenly so equal symbols don't bunch up. */
function buildStrip(counts: Record<Sym, number>): Sym[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const placed: { sym: Sym; at: number }[] = [];
  (Object.keys(counts) as Sym[]).forEach((sym, k) => {
    const n = counts[sym];
    for (let i = 0; i < n; i++) placed.push({ sym, at: (i + 0.5) / n + k * 1e-3 });
  });
  placed.sort((a, b) => a.at - b.at);
  if (placed.length !== total) throw new Error('strip');
  return placed.map((p) => p.sym);
}
export const STRIPS: Sym[][] = COUNTS.map(buildStrip);

export type LineWin = { line: number; sym: Sym; count: number; pay: number };
export type Spin = { stops: number[]; grid: Sym[][]; wins: LineWin[]; /** In line bets. */ pay: number; scatters: number };
export type FortuneRound = {
  base: Spin;
  free: Spin[];
  /** Total won, in multiples of the stake (base + FREE_MULT × free spins). */
  multiplier: number;
};

/** Pay of one line in line bets, from the five symbols it crosses (left to right). */
export function linePay(syms: Sym[]): { sym: Sym; count: number; pay: number } | null {
  const sym = syms[0];
  const table = PAYTABLE[sym];
  if (!table) return null;
  let count = 1;
  while (count < syms.length && (syms[count] === sym || syms[count] === WILD)) count++;
  return count >= 3 ? { sym, count, pay: table[count - 3] } : null;
}

/** The visible 3 symbols of each reel for the given stops: grid[reel][row]. */
export const reelWindow = (stops: number[]): Sym[][] => stops.map((s, r) => [0, 1, 2].map((k) => STRIPS[r][(s + k) % STRIPS[r].length]));

export function spin(stops: number[]): Spin {
  const grid = reelWindow(stops);
  const wins: LineWin[] = [];
  LINES.forEach((rows, line) => {
    const w = linePay(rows.map((row, reel) => grid[reel][row]));
    if (w) wins.push({ line, ...w });
  });
  const scatters = grid.flat().filter((s) => s === SCATTER).length;
  return { stops, grid, wins, pay: wins.reduce((n, w) => n + w.pay, 0), scatters };
}

/** One round from a uniform draw function (rnd(n) → 0…n−1): the base spin and any free spins. */
export function playRound(rnd: (n: number) => number): FortuneRound {
  const draw = () => STRIPS.map((s) => rnd(s.length));
  const base = spin(draw());
  const free = base.scatters >= SCATTER_TRIGGER ? Array.from({ length: FREE_SPINS }, () => spin(draw())) : [];
  const freePay = free.reduce((n, s) => n + s.pay, 0);
  return { base, free, multiplier: (base.pay + FREE_MULT * freePay) / LINES.length };
}

/** Exact expected return of one round, as a share of the stake. */
export function fortuneReturn(): { line: number; trigger: number; total: number } {
  const syms = Object.keys(SYMBOLS) as Sym[];
  const p = STRIPS.map((strip) => Object.fromEntries(syms.map((s) => [s, strip.filter((x) => x === s).length / strip.length])) as Record<Sym, number>);
  // One line's expected pay (in line bets) = the base spin's expected pay as a share of the stake.
  let line = 0;
  const walk = (reel: number, picked: Sym[], prob: number) => {
    if (prob === 0) return;
    if (reel === REELS) {
      line += prob * (linePay(picked)?.pay ?? 0);
      return;
    }
    for (const s of syms) walk(reel + 1, [...picked, s], prob * p[reel][s]);
  };
  walk(0, [], 1);
  // Chance of SCATTER_TRIGGER+ Kasa: distribution of Kasa per reel window, combined over the reels.
  let dist = [1];
  STRIPS.forEach((strip, r) => {
    const perWindow: number[] = [];
    strip.forEach((_, s) => {
      const n = reelWindow(STRIPS.map((_, i) => (i === r ? s : 0)))[r].filter((x) => x === SCATTER).length;
      perWindow[n] = (perWindow[n] ?? 0) + 1 / strip.length;
    });
    const next: number[] = [];
    dist.forEach((a, i) => perWindow.forEach((b = 0, j) => (next[i + j] = (next[i + j] ?? 0) + a * b)));
    dist = next;
  });
  const trigger = dist.slice(SCATTER_TRIGGER).reduce((a, b) => a + (b ?? 0), 0);
  return { line, trigger, total: line * (1 + trigger * FREE_SPINS * FREE_MULT) };
}

/** Highest multiple of the stake one round can pay: every line at the top pay, on the base and every free spin. */
export const FORTUNE_MAX = (Math.max(...Object.values(PAYTABLE).map((t) => t![2])) * (1 + FREE_SPINS * FREE_MULT));
