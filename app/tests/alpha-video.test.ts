/// <reference types="node" />
// Şeffaf video testi (lib/alpha-video): the stacked format's visible size, the aspect fit the Android renderer
// also uses, the overlays' offsets, the readout's FPS and mount → onReady summary.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ALPHA_COUNTS, ALPHA_VARIANTS, alphaCacheName, fitRect, fpsOf, overlayOffset, readySummary, visibleSize } from '@/lib/alpha-video';

describe('alpha video', () => {
  test('four variants, 1/3/5 overlays, cache names', () => {
    assert.deepEqual(
      ALPHA_VARIANTS.map((v) => v.key),
      ['720p24', '720p30', '1080p24', '1080p30'],
    );
    assert.deepEqual([...ALPHA_COUNTS], [1, 3, 5]);
    assert.equal(alphaCacheName('1080p30'), 'alpha_1080p30.mp4');
  });

  test('the visible picture is the top half', () => {
    assert.deepEqual(visibleSize(1280, 1440), { width: 1280, height: 720 });
    assert.deepEqual(visibleSize(1920, 2160), { width: 1920, height: 1080 });
    assert.deepEqual(visibleSize(1920, 2161), { width: 1920, height: 1080 });
  });

  test('aspect fit: full width in a tall box, full height in a wide one, centred', () => {
    assert.deepEqual(fitRect(400, 800, 1280, 720), { x: 0, y: 400 - 112.5, width: 400, height: 225 });
    const wide = fitRect(1000, 300, 1920, 1080);
    assert.equal(wide.height, 300);
    assert.equal(Math.round(wide.width), 533);
    assert.equal(Math.round(wide.x), 233);
    assert.deepEqual(fitRect(0, 300, 1920, 1080), { x: 0, y: 0, width: 0, height: 0 });
  });

  test('overlays step down and alternate sides', () => {
    assert.deepEqual(overlayOffset(0, 5), { dx: 0, dy: 0 });
    assert.deepEqual(overlayOffset(1, 5), { dx: 13, dy: 26 });
    assert.deepEqual(overlayOffset(2, 5), { dx: -13, dy: 52 });
    assert.deepEqual(overlayOffset(3, 5), { dx: 26, dy: 78 });
    assert.deepEqual(overlayOffset(2, 1), { dx: 0, dy: 0 });
  });

  test('FPS over the last second of frames', () => {
    const stamps = Array.from({ length: 61 }, (_, i) => 1000 + i * (1000 / 60));
    assert.equal(fpsOf(stamps, 2000), 60);
    assert.equal(fpsOf([0, 500], 5000), 0);
    assert.equal(fpsOf([], 0), 0);
    const slow = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    assert.equal(fpsOf(slow, 1000), 10);
  });

  test('mount → ready summary', () => {
    assert.equal(readySummary([]), '–');
    assert.equal(readySummary([120.4]), '120 ms');
    assert.equal(readySummary([100, 200, 300]), 'ort. 200 ms · en yavaş 300 ms');
  });
});
