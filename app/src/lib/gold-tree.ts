// Altın Ağacı: three reels, one line. The middle row pays by its combination, in multiples of the stake:
//   🌳🌳🌳 188 · three red coins 58 · three blue coins 28 · three green coins 18 · 🌳 on reel 1 with any two coins 8 ·
//   any three coins 2. Blanks pay nothing. The best combination pays.
// Every stop combination is listed (small strips), so the expected return is exact and at most 40 % (house rule).
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export type TreeSym = 'tree' | 'red' | 'blue' | 'green' | 'blank';
export const TREE_LABEL: Record<TreeSym, string> = { tree: '🌳', red: '🔴', blue: '🔵', green: '🟢', blank: '' };
export const TREE_NAME: Record<TreeSym, string> = { tree: 'Altın Ağaç', red: 'Kırmızı Para', blue: 'Mavi Para', green: 'Yeşil Para', blank: 'Boş' };

/** Combination pays, best first; `test` gets the three middle symbols. */
export const TREE_PAYS: { name: string; pay: number; test: (s: TreeSym[]) => boolean }[] = [
  { name: '🌳🌳🌳', pay: 188, test: (s) => s.every((x) => x === 'tree') },
  { name: '🔴🔴🔴', pay: 58, test: (s) => s.every((x) => x === 'red') },
  { name: '🔵🔵🔵', pay: 28, test: (s) => s.every((x) => x === 'blue') },
  { name: '🟢🟢🟢', pay: 18, test: (s) => s.every((x) => x === 'green') },
  { name: '🌳 + iki para', pay: 8, test: (s) => s[0] === 'tree' && s.slice(1).every((x) => x !== 'blank') },
  { name: 'Herhangi üç para', pay: 2, test: (s) => s.every((x) => x !== 'blank' && x !== 'tree') },
];

const strip = (counts: Record<TreeSym, number>): TreeSym[] => {
  const placed: { sym: TreeSym; at: number }[] = [];
  (Object.keys(counts) as TreeSym[]).forEach((sym, k) => {
    for (let i = 0; i < counts[sym]; i++) placed.push({ sym, at: (i + 0.5) / counts[sym] + k * 1e-3 });
  });
  return placed.sort((a, b) => a.at - b.at).map((p) => p.sym);
};
export const TREE_STRIPS: TreeSym[][] = [
  strip({ tree: 1, red: 2, blue: 3, green: 4, blank: 13 }),
  strip({ tree: 1, red: 2, blue: 3, green: 4, blank: 13 }),
  strip({ tree: 1, red: 2, blue: 3, green: 4, blank: 12 }),
];

/** The visible column of each reel: the stop is the middle (paying) row. */
export const treeWindow = (stops: number[]) => stops.map((s, r) => [-1, 0, 1].map((k) => TREE_STRIPS[r][(s + k + TREE_STRIPS[r].length) % TREE_STRIPS[r].length]));
export function treePay(middle: TreeSym[]) {
  const hit = TREE_PAYS.find((p) => p.test(middle));
  return hit ? { name: hit.name, pay: hit.pay } : null;
}
export type TreeSpin = { stops: number[]; grid: TreeSym[][]; win: { name: string; pay: number } | null; multiplier: number };
export function treeSpin(stops: number[]): TreeSpin {
  const grid = treeWindow(stops);
  const win = treePay(grid.map((c) => c[1]));
  return { stops, grid, win, multiplier: win?.pay ?? 0 };
}
export const playTree = (rnd: (n: number) => number) => treeSpin(TREE_STRIPS.map((s) => rnd(s.length)));

/** Exact expected return over every stop combination. */
export function treeReturn(): number {
  let sum = 0;
  let n = 0;
  for (let a = 0; a < TREE_STRIPS[0].length; a++)
    for (let b = 0; b < TREE_STRIPS[1].length; b++)
      for (let c = 0; c < TREE_STRIPS[2].length; c++) {
        sum += treeSpin([a, b, c]).multiplier;
        n++;
      }
  return sum / n;
}
export const TREE_MAX = TREE_PAYS[0].pay;
