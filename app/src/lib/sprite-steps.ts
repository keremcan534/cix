// A sprite sheet's frames as a step interpolation: a picture made of `frames` frames laid out `cols` to a row, played
// by one Animated value going 0 → 1 (on the native driver, so it keeps playing while JS is busy). Each frame holds for
// an equal share of the way; `cycles` plays the frames that many times over 0 → 1 (a loop drawn faster than its
// driver). Pure (no React): the sheet component (components/games/fx/sprite-sheet) only turns these into transforms.

export type SheetGrid = { cols: number; frames: number };

/** Where frame `k` sits in the sheet (column and row). */
export const cellOf = (g: SheetGrid, k: number) => {
  const f = ((Math.floor(k) % g.frames) + g.frames) % g.frames;
  return { col: f % g.cols, row: Math.floor(f / g.cols) };
};

/**
 * The step ranges: `input` rises strictly (a frame starts exactly at its share and holds until just before the next
 * one's), `col` / `row` say which cell shows there. The last frame holds through 1.
 */
export function frameSteps(g: SheetGrid, cycles = 1): { input: number[]; col: number[]; row: number[] } {
  const n = Math.max(1, Math.round(g.frames * Math.max(1, cycles)));
  const hold = 1 / n / 1000;
  const input: number[] = [];
  const col: number[] = [];
  const row: number[] = [];
  for (let i = 0; i < n; i++) {
    const { col: c, row: r } = cellOf(g, i);
    input.push(i / n, i === n - 1 ? 1 : (i + 1) / n - hold);
    col.push(c, c);
    row.push(r, r);
  }
  return { input, col, row };
}
