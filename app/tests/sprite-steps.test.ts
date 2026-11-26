// Yörünge's Blender sprite sheets (the rolling rocket, its flame, the explosion) are played by one Animated value 0 → 1
// through step ranges (lib/sprite-steps): each frame must hold for its share, in order, and the ranges must rise
// strictly or the native driver refuses them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { cellOf, frameSteps } from '@/lib/sprite-steps';

/** What the step ranges show at `x` (the same reading the interpolation makes: the segment x falls in). */
const shown = (s: ReturnType<typeof frameSteps>, x: number) => {
  let i = 0;
  while (i < s.input.length - 2 && s.input[i + 1] <= x) i++;
  return { col: s.col[i], row: s.row[i] };
};

describe('sprite sheet steps', () => {
  test('cells run left to right, row by row, and wrap', () => {
    const g = { cols: 6, frames: 24 };
    assert.deepEqual(cellOf(g, 0), { col: 0, row: 0 });
    assert.deepEqual(cellOf(g, 5), { col: 5, row: 0 });
    assert.deepEqual(cellOf(g, 6), { col: 0, row: 1 });
    assert.deepEqual(cellOf(g, 23), { col: 5, row: 3 });
    assert.deepEqual(cellOf(g, 24), { col: 0, row: 0 });
    assert.deepEqual(cellOf(g, -1), { col: 5, row: 3 });
  });

  test('ranges rise strictly from 0 to 1, two points a frame', () => {
    for (const [g, cycles] of [[{ cols: 6, frames: 27 }, 1], [{ cols: 8, frames: 16 }, 2], [{ cols: 6, frames: 24 }, 1]] as const) {
      const s = frameSteps(g, cycles);
      assert.equal(s.input.length, g.frames * cycles * 2);
      assert.equal(s.input[0], 0);
      assert.equal(s.input[s.input.length - 1], 1);
      for (let i = 1; i < s.input.length; i++) assert.ok(s.input[i] > s.input[i - 1], `input ${i} rises`);
      assert.equal(s.col.length, s.input.length);
      assert.equal(s.row.length, s.input.length);
    }
  });

  test('each frame shows for its share, in order; the last holds at 1', () => {
    const g = { cols: 6, frames: 27 };
    const s = frameSteps(g);
    for (let k = 0; k < g.frames; k++) {
      const mid = (k + 0.5) / g.frames;
      assert.deepEqual(shown(s, mid), cellOf(g, k), `frame ${k}`);
    }
    assert.deepEqual(shown(s, 1), cellOf(g, 26));
  });

  test('cycles play the frames again within the same 0 → 1', () => {
    const g = { cols: 8, frames: 16 };
    const s = frameSteps(g, 2);
    assert.deepEqual(shown(s, 0.01), cellOf(g, 0));
    assert.deepEqual(shown(s, 0.49), cellOf(g, 15));
    assert.deepEqual(shown(s, 0.51), cellOf(g, 0));
    assert.deepEqual(shown(s, 0.99), cellOf(g, 15));
  });
});
