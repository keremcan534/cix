// Zeus Tapınağı: the 6×5 "pays anywhere" slot. Same house rule as every coin game: the expected return of a round,
// free spins included, is at most 40 % of the stake (see lib/casino-odds).
//
// Model:
//  - The server draws each of the 30 cells on its own from the symbol weights below.
//  - A symbol pays when 8 or more of it are anywhere on the screen (8–9, 10–11, 12+), in multiples of the stake.
//  - Multiplier orbs (×2…×50) add up and multiply the spin's symbol wins (only when it has one).
//  - Zeus (scatter) pays 4, 5 or 6+ anywhere and 4+ give FREE_SPINS free spins. Zeus does nothing during free spins
//    (no pay, no retrigger), so a round always ends.
//  - One round pays at most OLYMPUS_MAX times the stake.
//
// The expected return is computed exactly (olympusReturn): with J orbs on screen, the other 30 − J cells are
// independent draws, so each symbol's count is binomial and the orb total is independent of the symbol wins.
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export type OSym = 'crown' | 'hourglass' | 'ring' | 'goblet' | 'red' | 'purple' | 'gold' | 'green' | 'blue' | 'zeus' | 'orb';
export const SCATTER: OSym = 'zeus';
export const ORB: OSym = 'orb';
export const COLS = 6;
export const ROWS = 5;
export const CELLS = COLS * ROWS;

export const OSYMBOLS: Record<OSym, { name: string; emoji: string }> = {
  crown: { name: 'Taç', emoji: '👑' },
  hourglass: { name: 'Kum Saati', emoji: '⏳' },
  ring: { name: 'Yüzük', emoji: '💍' },
  goblet: { name: 'Kadeh', emoji: '🏆' },
  red: { name: 'Kırmızı Kalp', emoji: '❤️' },
  purple: { name: 'Mor Yonca', emoji: '💜' },
  gold: { name: 'Altın Kalp', emoji: '💛' },
  green: { name: 'Yeşil Maça', emoji: '💚' },
  blue: { name: 'Mavi Elmas', emoji: '💎' },
  zeus: { name: 'Zeus', emoji: '⚡' },
  orb: { name: 'Çarpan Küresi', emoji: '🔮' },
};

/** Pays in multiples of the stake for 8–9, 10–11 and 12+ anywhere. */
export const OPAYTABLE: Partial<Record<OSym, [number, number, number]>> = {
  crown: [10, 25, 50],
  hourglass: [2.5, 10, 25],
  ring: [2, 5, 15],
  goblet: [1.5, 2, 12],
  red: [1, 1.5, 10],
  purple: [0.8, 1.2, 8],
  gold: [0.5, 1, 5],
  green: [0.4, 0.9, 4],
  blue: [0.25, 0.75, 2],
};
export const MIN_COUNT = 8;
/** Zeus pays for 4, 5 and 6+ anywhere (base spin only). */
export const SCATTER_PAY: [number, number, number] = [3, 5, 100];
export const SCATTER_TRIGGER = 4;
export const FREE_SPINS = 10;
export const OLYMPUS_MAX = 500;

/** Relative weight of every symbol in a cell draw. */
export const WEIGHTS: Record<OSym, number> = {
  crown: 4,
  hourglass: 6,
  ring: 7,
  goblet: 8,
  red: 10,
  purple: 11,
  gold: 11,
  green: 14,
  blue: 12,
  zeus: 2,
  orb: 1,
};
/** Orb values and their weights. */
export const ORBS: { value: number; weight: number }[] = [
  { value: 2, weight: 40 },
  { value: 3, weight: 25 },
  { value: 5, weight: 15 },
  { value: 10, weight: 10 },
  { value: 15, weight: 5 },
  { value: 25, weight: 3 },
  { value: 50, weight: 2 },
];
const SYMS = Object.keys(WEIGHTS) as OSym[];
const WEIGHT_TOTAL = SYMS.reduce((n, s) => n + WEIGHTS[s], 0);
const ORB_TOTAL = ORBS.reduce((n, o) => n + o.weight, 0);

export type OCell = { sym: OSym; orb?: number };
export type OWin = { sym: OSym; count: number; pay: number };
export type OSpin = {
  /** grid[col][row] */
  grid: OCell[][];
  wins: OWin[];
  /** Sum of the orbs on screen (0 when none). */
  orbs: number;
  scatters: number;
  /** Total of this spin in multiples of the stake (symbol wins × orbs, plus Zeus pay on the base spin). */
  pay: number;
};
export type OlympusRound = { base: OSpin; free: OSpin[]; multiplier: number; capped: boolean };

const tier = (count: number) => (count >= 12 ? 2 : count >= 10 ? 1 : 0);
export const symbolPay = (sym: OSym, count: number) => (count >= MIN_COUNT && OPAYTABLE[sym] ? OPAYTABLE[sym]![tier(count)] : 0);
export const scatterPay = (count: number) => (count >= SCATTER_TRIGGER ? SCATTER_PAY[Math.min(2, count - SCATTER_TRIGGER)] : 0);

/** Evaluates a filled grid; `free` = a free spin (Zeus neither pays nor retriggers). */
export function evaluateGrid(grid: OCell[][], free: boolean): OSpin {
  const counts = new Map<OSym, number>();
  let orbs = 0;
  grid.flat().forEach((c) => {
    counts.set(c.sym, (counts.get(c.sym) ?? 0) + 1);
    if (c.sym === ORB) orbs += c.orb ?? 0;
  });
  const wins: OWin[] = [];
  counts.forEach((count, sym) => {
    const pay = symbolPay(sym, count);
    if (pay) wins.push({ sym, count, pay });
  });
  const symbolWin = wins.reduce((n, w) => n + w.pay, 0);
  const scatters = counts.get(SCATTER) ?? 0;
  const pay = symbolWin * (symbolWin && orbs ? orbs : 1) + (free ? 0 : scatterPay(scatters));
  return { grid, wins: wins.sort((a, b) => b.pay - a.pay), orbs, scatters, pay };
}

/** One spin from a uniform draw function (rnd(n) → 0…n−1). */
export function olympusSpin(rnd: (n: number) => number, free: boolean): OSpin {
  const cell = (): OCell => {
    let r = rnd(WEIGHT_TOTAL);
    const sym = SYMS.find((s) => (r -= WEIGHTS[s]) < 0)!;
    if (sym !== ORB) return { sym };
    let o = rnd(ORB_TOTAL);
    return { sym, orb: ORBS.find((x) => (o -= x.weight) < 0)!.value };
  };
  return evaluateGrid(
    Array.from({ length: COLS }, () => Array.from({ length: ROWS }, cell)),
    free,
  );
}

/** One round: the base spin and, with 4+ Zeus, the free spins. */
export function playOlympus(rnd: (n: number) => number): OlympusRound {
  const base = olympusSpin(rnd, false);
  const free = base.scatters >= SCATTER_TRIGGER ? Array.from({ length: FREE_SPINS }, () => olympusSpin(rnd, true)) : [];
  const total = base.pay + free.reduce((n, s) => n + s.pay, 0);
  return { base, free, multiplier: Math.min(total, OLYMPUS_MAX), capped: total > OLYMPUS_MAX };
}

/** Binomial probabilities P(k) for k = 0…n. */
function binomial(n: number, p: number): number[] {
  const out: number[] = [];
  let c = 1;
  for (let k = 0; k <= n; k++) {
    out.push(c * p ** k * (1 - p) ** (n - k));
    c = (c * (n - k)) / (k + 1);
  }
  return out;
}

/**
 * Exact expected return of one round, as a share of the stake, ignoring the OLYMPUS_MAX cap (the cap only lowers
 * it, so this is an upper bound): symbol wins × orbs per spin, Zeus pays, and the free-spin chance.
 */
export function olympusReturn(weights: Record<OSym, number> = WEIGHTS): { spin: number; scatter: number; trigger: number; total: number } {
  const total = SYMS.reduce((n, s) => n + weights[s], 0);
  const pOrb = weights.orb / total;
  const orbMean = ORBS.reduce((n, o) => n + o.value * o.weight, 0) / ORB_TOTAL;
  let spin = 0;
  binomial(CELLS, pOrb).forEach((pj, j) => {
    // The other cells are drawn from the remaining symbols; each count is binomial over CELLS − j.
    let win = 0;
    for (const s of SYMS) {
      if (!OPAYTABLE[s]) continue;
      binomial(CELLS - j, weights[s] / (total - weights.orb)).forEach((pk, k) => (win += pk * symbolPay(s, k)));
    }
    spin += pj * win * (j ? j * orbMean : 1);
  });
  const sc = binomial(CELLS, weights.zeus / total);
  const scatter = sc.reduce((n, p, k) => n + p * scatterPay(k), 0);
  const trigger = sc.slice(SCATTER_TRIGGER).reduce((a, b) => a + b, 0);
  return { spin, scatter, trigger, total: spin + scatter + trigger * FREE_SPINS * spin };
}
