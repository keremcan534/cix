/// <reference types="node" />
// Çarşı's frame preview (Güncelleme 7, components/frame-preview, lib/frame-preview): the seat view uses a room's own
// numbers (a full room of ten mics on this phone's width, the seat's cell), so a frame is drawn there as on a mic; the
// large view stays in its box; the profile view is the profile header's size. Source checks: the sheet draws every
// frame through FramedAvatar (the team's frames through frameArtOf), and Çarşı opens it for frames and buys through
// its own path.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FRAME_ART_SIZES } from '@/data/frame-art';
import { LARGE_BOX_MAX, PREVIEW_ROOM_MICS, PROFILE_FACE, framePreviewSizes } from '@/lib/frame-preview';
import { SEAT_TOP, seatArt, seatRoom } from '@/lib/seat-cell';
import { FACE_STD, fitGrid } from '@/lib/seat-fit';

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

describe('Çerçeve önizlemesi: boyutlar', () => {
  test('koltuk görünümü odanın kendi sayıları: on mikrofonlu dolu oda, beşerli sıra, koltuğun hücresi', () => {
    for (const width of [320, 360, 390, 430, 800]) {
      const s = framePreviewSizes(width);
      const grid = fitGrid(PREVIEW_ROOM_MICS, Math.min(width, 640), 10_000);
      assert.equal(s.seat.face, grid.face, `${width}`);
      assert.equal(s.seat.slot, grid.slot, `${width}`);
      assert.deepEqual(s.seat.room, seatRoom(grid.face, grid.slot));
      assert.equal(s.seat.top, SEAT_TOP);
      // The sheet holds three seats side by side (its padding: 16 each side).
      assert.ok(3 * s.seat.slot <= Math.min(width, 640) - 32, `${width}: üç koltuk sığar`);
    }
    // A common phone: the standard face, five to a row.
    const p = framePreviewSizes(390);
    assert.equal(p.seat.face, FACE_STD);
    assert.equal(p.seat.slot, 74);
    assert.equal(p.seat.nameSize, 12);
  });

  test('her çizili çerçeve koltukta hücresinde kalır (odadaki kuralın aynısı)', () => {
    const { seat } = framePreviewSizes(390);
    for (const [id, art] of Object.entries(FRAME_ART_SIZES)) {
      const a = seatArt(art, seat.face, seat.room);
      assert.ok(a.avatar <= seat.face + 0.01, `${id}: fotoğraf yüzden büyük değil`);
      assert.ok(a.frame > 0, id);
    }
  });

  test('büyük görünüm kutusunda, profil görünümü profil başlığının boyu', () => {
    for (const width of [280, 320, 390, 1024, Number.NaN]) {
      const { large, profile } = framePreviewSizes(width);
      assert.ok(large.box <= LARGE_BOX_MAX && large.box >= 160, `${width}: ${large.box}`);
      assert.ok(Math.abs(large.size * large.artScale - large.box) < 0.001);
      assert.ok(large.size >= 80);
      assert.deepEqual(profile, { size: PROFILE_FACE.size, artScale: PROFILE_FACE.artScale });
    }
  });

  test('profil görünümü profil ekranının çerçeveli fotoğrafıyla aynı', () => {
    assert.match(read('app/kullanici/[id].tsx'), new RegExp(`FramedAvatar uri=\\{pendingAvatar \\?\\? user\\.avatar\\} size=\\{${PROFILE_FACE.size}\\}[^>]*artScale=\\{${PROFILE_FACE.artScale}\\}`));
  });
});

describe('Çerçeve önizlemesi: ekran', () => {
  test('her çerçeve FramedAvatar ile çizilir; koltukta odanın hücresiyle', () => {
    const src = read('components/frame-preview.tsx');
    assert.equal((src.match(/<FramedAvatar /g) ?? []).length, 3, 'büyük, koltuk, profil');
    assert.match(src, /frameId=\{item\.id\} room=\{seat\.room\}/);
    // The team's frames: the same path as everywhere (components/ui FramedAvatar → frame-art frameArtOf).
    assert.match(read('components/ui.tsx'), /frameArtOf\(/);
    // Local only: the sheet buys, wears and sends nothing itself.
    assert.doesNotMatch(src, /buyCosmetic|equip\(|@\/lib\/api|apiRequest/);
  });

  test('Çarşı çerçeve kartından açar; satın alma Çarşı\'nın kendi yolu', () => {
    const src = read('app/magaza.tsx');
    assert.match(src, /<FramePreviewSheet item=\{framePreview\}/);
    assert.match(src, /c\.kind === 'frame' \? setFrameShown\(c\.id\) : playPreview\(c\)/);
    assert.match(src, /footer=\{framePreview \? cta\(framePreview/);
    assert.match(src, /onPress=\{\(\) => buy\(c\)\}/);
  });
});
