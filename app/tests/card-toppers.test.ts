/// <reference types="node" />
// The person card's VIP ornaments (components/person-card-art CARD_TOPPERS, 22 Nov 2026). The first cut of the
// package's mockup stopped at the card's top line, so on the phone the card's edge seemed to cover every ornament
// ("kişi kartı üst çerçevesi süsleri kapatmış"). Each ornament is now cut whole and sits where the mockup puts it:
// these checks read the source and the pictures, as the component itself needs React Native.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ART = readFileSync(join(APP, 'src/components/person-card-art.tsx'), 'utf8');
const DIR = join(APP, 'assets/vip/card-topper');

/** A WebP picture's width and height (VP8X, VP8L or VP8). */
function webpSize(buf: Buffer): { w: number; h: number } {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
  }
  assert.equal(kind, 'VP8 ');
  return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
}

const ROW = /topper-(\d+)\.webp'\), ratio: (\d+) \/ (\d+), left: (-?[\d.]+), top: (-?[\d.]+), width: (-?[\d.]+) \}/g;
const rows = [...ART.matchAll(ROW)].map((m) => ({
  level: Number(m[1]),
  w: Number(m[2]),
  h: Number(m[3]),
  left: Number(m[4]),
  top: Number(m[5]),
  width: Number(m[6]),
}));

test('VIP 1–10 each have an ornament, VIP 0 none, in level order', () => {
  assert.deepEqual(
    rows.map((r) => r.level),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.match(ART, /export const CARD_TOPPERS = \[\n {2}null,\n/);
  // Only the pictures in use ship (the first cut's PNGs are gone).
  assert.deepEqual(
    readdirSync(DIR).sort(),
    rows.map((r) => `topper-${r.level}.webp`).sort(),
  );
});

test('each ratio is its picture’s own, sharp enough for a 3x phone', () => {
  for (const r of rows) {
    const size = webpSize(readFileSync(join(DIR, `topper-${r.level}.webp`)));
    assert.deepEqual(size, { w: r.w, h: r.h }, `VIP ${r.level}`);
    assert.ok(r.w >= 1000, `VIP ${r.level}: ${r.w} px is too narrow for a card on a 3x screen`);
  }
});

test('each ornament lies over the card’s top edge as in the mockup, not above it', () => {
  for (const r of rows) {
    const bottom = r.top + r.width / (r.w / r.h);
    assert.ok(r.top < 0 && r.top > -0.12, `VIP ${r.level}: rises ${r.top} card widths`);
    // The regression: an ornament cut at the card's line ended at the edge (bottom ≈ 0).
    assert.ok(bottom > 0.02 && bottom < 0.1, `VIP ${r.level}: reaches ${bottom.toFixed(3)} card widths into the card`);
    assert.ok(r.width > 0.95 && r.width < 1.05 && Math.abs(r.left) < 0.03, `VIP ${r.level}: spans the card`);
  }
});

test('the card draws the ornament after its content, never catching a tap', () => {
  const panel = ART.slice(ART.indexOf('export function CardPanel'), ART.indexOf('export const PANEL_RADIUS'));
  assert.ok(panel.indexOf('{children}') > 0 && panel.indexOf('{children}') < panel.indexOf('top.src'));
  assert.match(panel, /style=\{\[s\.topper, ornament\.box\]\} pointerEvents="none"/);
  // Its size: the picture's own width-to-height, from the card's measured width.
  assert.match(panel, /style=\{\{ width: ornament\.box\.width, height: ornament\.box\.height \}\}/);
});
