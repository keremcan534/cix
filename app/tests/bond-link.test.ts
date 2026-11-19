/// <reference types="node" />
// The bond line between two bonded people side by side on the mics, from Lv1 (lib/bond-link, components/room/room-bonds;
// Güncelleme 7, madde 13): it passes behind both their frames, and its knot is in front of both. The left seat draws
// the line before its own face; the right seat draws the knot after its own face.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { RoomBond } from '@/data/bonds';
import { bondParts, knotBox, lineBox, markSize } from '@/lib/bond-link';

const SRC = resolve(import.meta.dirname, '../src');
const couple: RoomBond = { a: 'u-acm', b: 'u-artemis', kind: 'cift', level: 4 };
const weak: RoomBond = { a: 'u-x', b: 'u-y', kind: 'kanka', level: 3 };

describe('Bağ çizgisi iki çerçevenin arkasından, düğümü önde', () => {
  test('soldaki koltuk çizgiyi, sağdaki düğümü çizer; ikisi aynı bağ', () => {
    const seats = ['u-host', 'u-acm', 'u-artemis', null];
    const left = bondParts([couple], seats, 1, { index: 2, gap: 6 }, { index: 0, gap: 6 });
    const right = bondParts([couple], seats, 2, { index: 3, gap: 6 }, { index: 1, gap: 6 });
    assert.deepEqual(left, { line: { bond: couple, gap: 6 }, knot: null });
    assert.deepEqual(right, { line: null, knot: { bond: couple, gap: 6 } });
  });

  test('ters sırada oturunca da (bağın b ucu solda) aynı', () => {
    const seats = ['u-artemis', 'u-acm'];
    assert.equal(bondParts([couple], seats, 0, { index: 1, gap: 0 }).line?.bond, couple);
    assert.equal(bondParts([couple], seats, 1, undefined, { index: 0, gap: 0 }).knot?.bond, couple);
  });

  test('Lv1 bağ da çizilir (Güncelleme 7); boş koltuk, yan yana olmayan (satır sonu) koltuk: ne çizgi ne işaret', () => {
    assert.deepEqual(bondParts([weak], ['u-x', 'u-y'], 0, { index: 1, gap: 0 }), { line: { bond: weak, gap: 0 }, knot: null });
    assert.deepEqual(bondParts([{ ...weak, level: 1 }], ['u-x', 'u-y'], 1, undefined, { index: 0, gap: 0 }).knot?.bond.level, 1);
    assert.deepEqual(bondParts([couple], ['u-acm', null], 0, { index: 1, gap: 0 }), { line: null, knot: null });
    assert.deepEqual(bondParts([couple], ['u-acm', 'u-artemis'], 1), { line: null, knot: null }, 'önceki koltuk bilinmiyorsa düğüm yok');
  });

  test('düğüm iki koltuğun tam ortasında, yüzlerin orta çizgisinde; çizgi yüzden yüze', () => {
    for (const [size, gap] of [[48, 0], [56, 6], [60, 10]]) {
      const k = knotBox(size, gap);
      const m = markSize(size);
      assert.equal(k.width, m);
      assert.equal(k.left + m / 2 + gap / 2, 0, 'sağ koltuğun sol kenarından boşluğun yarısı kadar solda');
      assert.equal(k.top + m / 2, size / 2);
      const l = lineBox(size, gap);
      assert.equal(l.top + l.height / 2, size / 2, 'aynı çizgide');
      assert.equal(l.marginLeft, size / 2 - 1, 'soldaki yüzün kenarından');
      assert.equal(l.marginRight, size / 2 - 1 - gap, 'sağdaki yüzün kenarına');
    }
  });

  test('koltukta çizim sırası: çizgi yüzden ve çerçeveden önce, düğüm her şeyden sonra', () => {
    const parts = readFileSync(resolve(SRC, 'components/room/parts.tsx'), 'utf8');
    const seat = parts.slice(parts.indexOf('export function Seat('), parts.indexOf('export function PkPoints('));
    const line = seat.indexOf('<BondLine ');
    const body = seat.indexOf('styles.seatBody');
    const frame = seat.indexOf('<FramedAvatar ');
    const knot = seat.indexOf('<BondKnot ');
    const end = seat.lastIndexOf('</Pressable>');
    assert.ok(line > 0 && line < body && body < frame, 'çizgi koltuğun yüzünden ve çerçevesinden önce (arkasında)');
    assert.ok(knot > frame && knot < end, 'düğüm koltuğun son çizimi (önde)');
    assert.equal(seat.match(/<BondLine /g)?.length, 1);
    assert.equal(seat.match(/<BondKnot /g)?.length, 1);
    assert.doesNotMatch(seat, /<BondLink /, 'eski tek parça çizgi kalmadı');
  });

  test('iki düzen de düğüm için önceki koltuğu verir (ızgara ve sahne düzeni)', () => {
    const room = readFileSync(resolve(SRC, 'components/room/live-room.tsx'), 'utf8');
    assert.match(room, /prev: i > 0 && i % f\.cols !== 0 \? \{ index: i - 1, gap: 0 \} : undefined/);
    assert.match(room, /renderSeat=\{\(i, slot, next, prev\) => renderSeat\(i, \{ slot, next, prev \}\)\}/);
    const layout = readFileSync(resolve(SRC, 'components/room/stage-layout.tsx'), 'utf8');
    assert.match(layout, /const behind = x\.kind === 'mic' && prev\?\.kind === 'mic' && !x\.host && !prev\.host/);
  });
});
