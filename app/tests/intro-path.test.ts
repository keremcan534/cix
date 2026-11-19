// The opening's geometry and layers (scripts/intro-layers.py writes both): the paths must follow the mark the layers
// draw, in the same 200 dp box, and the layers must all be drawn in that box at 3x.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMET_LEFT,
  COMET_OFFSET,
  COMET_RIGHT,
  EDGE_LEFT,
  EDGE_RIGHT,
  FILL_BOX,
  HEAD_CORAL,
  HEAD_CORAL_CLIP,
  HEAD_CYAN,
  HEAD_CYAN_CLIP,
  LOGO_MARK,
  MARK_BOX,
  MARK_SHAPE,
  RING_BOX,
  TIP,
  type Box,
  type Circle,
  type Edge,
} from '@/lib/intro-path';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(APP, 'assets/intro');

/** Width and height from a PNG's header. */
function pngSize(file: string): [number, number] {
  const b = readFileSync(resolve(ASSETS, file));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const sides: [string, Edge, Circle][] = [
  ['sol', EDGE_LEFT, HEAD_CYAN_CLIP],
  ['sağ', EDGE_RIGHT, HEAD_CORAL_CLIP],
];

describe('açılış: logonun yolları', () => {
  test('kafalar logodaki yerinde: turkuaz solda, mercan sağda, ikisi aynı boyda', () => {
    assert.equal(MARK_BOX, 200);
    assert.ok(HEAD_CYAN.cx < MARK_BOX / 2 && HEAD_CORAL.cx > MARK_BOX / 2);
    assert.ok(Math.abs(HEAD_CYAN.cy - HEAD_CORAL.cy) < 2);
    for (const h of [HEAD_CYAN, HEAD_CORAL]) assert.ok(h.r > 18 && h.r < 25, String(h.r));
  });

  test('parlama maskesi kafanın içinde: tepesi aynı, dibi lobun kenarına inmiyor', () => {
    for (const [h, c] of [
      [HEAD_CYAN, HEAD_CYAN_CLIP],
      [HEAD_CORAL, HEAD_CORAL_CLIP],
    ]) {
      assert.equal(c.cx, h.cx);
      assert.ok(Math.abs(c.cy - c.r - (h.cy - h.r)) <= 0.11, 'aynı tepe');
      assert.ok(c.r < h.r && h.r - c.r < 1.5);
    }
  });

  for (const [name, e, head] of sides) {
    test(`${name} kenar: kafanın dibinden uca, eşit aralıklı 24 nokta`, () => {
      assert.equal(e.x.length, 24);
      assert.equal(e.y.length, 24);
      assert.equal(e.angle.length, 24);
      for (let i = 0; i < 24; i++) {
        assert.ok(e.x[i] >= 0 && e.x[i] <= MARK_BOX && e.y[i] >= 0 && e.y[i] <= MARK_BOX, `${i} kutunun içinde`);
      }
      // It starts where the head meets the heart: just outside the head's glass (its clip circle), below its middle.
      const gap = Math.hypot(e.x[0] - head.cx, e.y[0] - head.cy) - head.r;
      assert.ok(gap > -0.5 && gap < 2, `başlangıç kafaya ${gap.toFixed(2)} dp`);
      assert.ok(e.y[0] > head.cy);
      // It ends on the tip, the lowest point of the path.
      assert.deepEqual([e.x[23], e.y[23]], [TIP.x, TIP.y]);
      assert.ok(e.y.every((y) => y <= TIP.y));
      // Evenly spaced along the edge: each step a 23rd of its length (a chord is a touch shorter than its arc).
      const step = e.length / 23;
      for (let i = 0; i < 23; i++) {
        const d = Math.hypot(e.x[i + 1] - e.x[i], e.y[i + 1] - e.y[i]);
        assert.ok(d > step * 0.9 && d < step * 1.03, `adım ${i}: ${d.toFixed(2)} / ${step.toFixed(2)}`);
      }
    });

    test(`${name} kenar: açı gidiş yönünü gösteriyor ve sıçramıyor`, () => {
      for (let i = 0; i < 23; i++) {
        const chord = (Math.atan2(e.y[i + 1] - e.y[i], e.x[i + 1] - e.x[i]) * 180) / Math.PI;
        const off = ((((e.angle[i] - chord) % 360) + 540) % 360) - 180;
        assert.ok(Math.abs(off) < 20, `nokta ${i}: açı ${e.angle[i]}, yön ${chord.toFixed(1)}`);
        assert.ok(Math.abs(e.angle[i + 1] - e.angle[i]) < 30, `nokta ${i}: ${e.angle[i]} → ${e.angle[i + 1]}`);
      }
    });
  }

  /** The shortest distance from a point to a polyline. */
  const toLine = (x: number, y: number, e: Edge) => {
    let best = Infinity;
    for (let i = 0; i + 1 < e.x.length; i++) {
      const [ax, ay, bx, by] = [e.x[i], e.y[i], e.x[i + 1], e.y[i + 1]];
      const k = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      best = Math.min(best, Math.hypot(x - ax - k * (bx - ax), y - ay - k * (by - ay)));
    }
    return best;
  };

  for (const [name, path, e] of [
    ['sol', COMET_LEFT, EDGE_LEFT],
    ['sağ', COMET_RIGHT, EDGE_RIGHT],
  ] as const) {
    test(`${name} ışığın yolu: kenarın hemen dışında (kenarın parıltısında, camdan kopuk değil), boyundan uca, eşit aralıklı`, () => {
      // About 1 dp out: on the rim's own glow, touching the glass (2.5 dp left a dark gap: a spark beside the heart).
      assert.ok(COMET_OFFSET >= 0.75 && COMET_OFFSET <= 1.5);
      assert.equal(path.x.length, 24);
      assert.equal(path.y.length, 24);
      assert.equal(path.angle.length, 24);
      // It sets off where its edge does (the head's neck) and meets the other light on the tip.
      assert.deepEqual([path.x[0], path.y[0]], [e.x[0], e.y[0]]);
      assert.deepEqual([path.x[23], path.y[23]], [TIP.x, TIP.y]);
      // Along its middle it runs COMET_OFFSET dp off the rim, on its outer side (farther from the heart's middle).
      for (let i = 4; i <= 19; i++) {
        const d = toLine(path.x[i], path.y[i], e);
        assert.ok(Math.abs(d - COMET_OFFSET) < 0.35, `nokta ${i}: kenardan ${d.toFixed(2)} dp`);
        const out = Math.hypot(path.x[i] - MARK_SHAPE.cx, path.y[i] - MARK_SHAPE.cy);
        const rim = Math.hypot(e.x[i] - MARK_SHAPE.cx, e.y[i] - MARK_SHAPE.cy);
        assert.ok(out > rim, `nokta ${i} kalbin içinde`);
      }
      // Never further off than that, and in the box.
      for (let i = 0; i < 24; i++) {
        assert.ok(toLine(path.x[i], path.y[i], e) <= COMET_OFFSET + 0.3, String(i));
        assert.ok(path.x[i] >= 0 && path.x[i] <= MARK_BOX && path.y[i] >= 0 && path.y[i] <= TIP.y, String(i));
      }
      // Evenly spaced, and its heading follows it without a jump.
      const step = path.length / 23;
      for (let i = 0; i < 23; i++) {
        const d = Math.hypot(path.x[i + 1] - path.x[i], path.y[i + 1] - path.y[i]);
        assert.ok(d > step * 0.9 && d < step * 1.03, `adım ${i}: ${d.toFixed(2)} / ${step.toFixed(2)}`);
        const chord = (Math.atan2(path.y[i + 1] - path.y[i], path.x[i + 1] - path.x[i]) * 180) / Math.PI;
        const off = ((((path.angle[i] - chord) % 360) + 540) % 360) - 180;
        assert.ok(Math.abs(off) < 20, `nokta ${i}: açı ${path.angle[i]}, yön ${chord.toFixed(1)}`);
        assert.ok(Math.abs(path.angle[i + 1] - path.angle[i]) < 30, `nokta ${i}: ${path.angle[i]} → ${path.angle[i + 1]}`);
      }
      assert.ok(path.length > e.length && path.length < e.length + 10);
    });
  }

  test('iki kenar logonun iki yanında, uçta buluşuyor', () => {
    assert.ok(Math.max(...EDGE_LEFT.x) <= TIP.x && Math.min(...EDGE_RIGHT.x) >= TIP.x);
    assert.ok(Math.min(...EDGE_LEFT.x) < 40 && Math.max(...EDGE_RIGHT.x) > 160, 'kalbin dış kenarları');
    assert.ok(Math.abs(TIP.x - MARK_BOX / 2) < 3 && TIP.y > 160);
  });
});

describe('açılış: katmanlar', () => {
  test('logonun katmanları aynı 200 dp kutuda, 3x (600 px); parlama 300 px', () => {
    for (const f of ['head-cyan.png', 'head-coral.png', 'heart.png']) {
      assert.deepEqual(pngSize(f), [600, 600], f);
    }
    assert.deepEqual(pngSize('mark-aura.png'), [300, 300]);
  });

  test('klasörde yalnız açılışın kullandığı resimler var (APK’ya boşuna dosya girmez)', () => {
    const code = readFileSync(resolve(APP, 'src/components/fx/intro.tsx'), 'utf8');
    const used = new Set([...code.matchAll(/require\('\.\.\/\.\.\/\.\.\/assets\/intro\/([^']+)'\)/g)].map((m) => m[1]));
    assert.deepEqual(readdirSync(ASSETS).sort(), [...used].sort());
  });

  test('dolum aşamaları ve halka kendi kutularında (tam dp, kutunun içinde), 3x', () => {
    const inside = (b: Box) =>
      [b.left, b.top, b.width, b.height].every(Number.isInteger) && b.left >= 0 && b.top >= 0 && b.left + b.width <= MARK_BOX && b.top + b.height <= MARK_BOX;
    assert.ok(inside(FILL_BOX) && inside(RING_BOX));
    for (const f of ['fill-1.png', 'fill-2.png', 'fill-3.png']) assert.deepEqual(pngSize(f), [3 * FILL_BOX.width, 3 * FILL_BOX.height], f);
    assert.deepEqual(pngSize('heart-ring.png'), [3 * RING_BOX.width, 3 * RING_BOX.height]);
    // The fill covers the heart's glass from its lobes to its tip; the ring, both edges with room for its soft line.
    assert.ok(FILL_BOX.left <= Math.min(...EDGE_LEFT.x) && FILL_BOX.left + FILL_BOX.width >= Math.max(...EDGE_RIGHT.x));
    assert.ok(FILL_BOX.top + FILL_BOX.height >= TIP.y);
    for (const e of [EDGE_LEFT, EDGE_RIGHT]) {
      for (let i = 0; i < e.x.length; i++) {
        assert.ok(e.x[i] - RING_BOX.left >= 4 && RING_BOX.left + RING_BOX.width - e.x[i] >= 4);
        assert.ok(e.y[i] - RING_BOX.top >= 4 && RING_BOX.top + RING_BOX.height - e.y[i] >= 4);
      }
    }
  });

  test('ışık parçaları küçük ve 600 pikseli geçmiyor', () => {
    for (const f of ['shine.png', 'comet-cyan.png', 'comet-coral.png', 'streak-cyan.png', 'streak-coral.png', 'spark.png']) {
      const [w, h] = pngSize(f);
      assert.ok(w <= 300 && h <= 300, `${f} ${w}x${h}`);
    }
    // The comets: 64 x 14 dp at 3x (the head at the centre, a 28 dp tail behind it); the streaks 18 x 8 dp.
    assert.deepEqual(pngSize('comet-cyan.png'), [192, 42]);
    assert.deepEqual(pngSize('comet-coral.png'), [192, 42]);
    assert.deepEqual(pngSize('streak-cyan.png'), [54, 24]);
    assert.deepEqual(pngSize('streak-coral.png'), [54, 24]);
  });

  test('çizili logo kutunun ortasında; giriş ekranının logosu aynı çizim', () => {
    assert.ok(Math.abs(MARK_SHAPE.cx - MARK_BOX / 2) < 2 && Math.abs(MARK_SHAPE.cy - MARK_BOX / 2) < 2);
    assert.ok(MARK_SHAPE.width > 130 && MARK_SHAPE.width < 150);
    assert.ok(Math.abs(LOGO_MARK.cx - 0.5) < 0.01 && Math.abs(LOGO_MARK.cy - 0.5) < 0.01);
    assert.ok(LOGO_MARK.width > 0.6 && LOGO_MARK.width < 0.8);
    // The head tops and the tip are inside the drawn shape's height.
    assert.ok(TIP.y <= MARK_SHAPE.cy + MARK_SHAPE.width);
  });
});
