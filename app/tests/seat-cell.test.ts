// What a room seat draws around its face (lib/seat-cell): every illustrated frame of the shop stays inside the seat's
// cell (no wing over the next seat, no crown past the row above's points line, the hanging gems behind the seat's own
// name), and the speaking ring is one size for every wave: outside the photo, within the same reach. Checked on the
// stage's real sizes (lib/seat-fit). The rule (19 Nov 2026): no cut on the classic grid; the ring may cover up to 30%
// of the photo; a frame that still doesn't fit shrinks the photo to no less than 80%; a cut only past that.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { COSMETICS } from '@/data/catalog';
import { FRAME_ART_SIZES, type FrameArtSize } from '@/data/frame-art';
import {
  ART_BREATHE,
  CELL_GAP,
  NAME_GAP,
  PHOTO_MIN,
  RING_GAP,
  RING_OVER,
  SEAT_TOP,
  artFit,
  artScaleIn,
  ringOf,
  ringReach,
  seatArt,
  seatRoom,
  type SeatArt,
  type SeatRoom,
} from '@/lib/seat-cell';
import { FACE_MAX, FACE_MIN, PK_LINE, ROW_GAP, fitGrid, gridSlot, layoutPlan, nameLine } from '@/lib/seat-fit';
import { ROOM_LAYOUTS } from '@/data/room-layouts';

const SRC = resolve(import.meta.dirname, '..', 'src');
const FRAMES = Object.entries(FRAME_ART_SIZES);

/** Every face size with the slots the classic grid and the layouts give it on common phones. */
function seats() {
  const out: { size: number; slot: number }[] = [];
  for (const width of [360, 390, 412]) {
    for (let guests = 1; guests <= 29; guests += 2) {
      for (let height = 160; height <= 640; height += 40) {
        const f = fitGrid(guests, width, height);
        out.push({ size: f.face, slot: f.slot }, { size: f.host, slot: Math.max(96, f.host + 28) });
      }
    }
    for (const l of ROOM_LAYOUTS) {
      const plan = layoutPlan(l.layoutSchema, width, false);
      for (let face = FACE_MIN; face <= plan.maxFace; face += 6) out.push({ size: face, slot: plan.micW });
    }
  }
  return out;
}

/** How much of the photo's radius the picture's ring covers. */
const cover = (art: FrameArtSize, s: SeatArt) => 1 - (art.hole * s.frame) / (s.avatar / 2);

/** Where the picture goes past the face (px), at the top of its breath when it breathes (a cut one stands still). */
function past(art: FrameArtSize, size: number, s: SeatArt) {
  const big = s.frame * (s.clip ? 1 : ART_BREATHE);
  return { x: art.reach.x * big - size / 2, top: art.reach.top * big - size / 2, bottom: art.reach.bottom * big - size / 2 };
}

/** The picture stays inside the seat's cell (the rule's "fits" allows half a pixel of the picture's side). */
function assertInside(art: FrameArtSize, size: number, room: SeatRoom, s: SeatArt, at: string) {
  const p = past(art, size, s);
  assert.ok(p.x <= room.side + 0.3, `${at}: yana ${p.x.toFixed(1)} px taşar (yer ${room.side})`);
  assert.ok(p.top <= room.top + 0.3, `${at}: yukarı ${p.top.toFixed(1)} px taşar (yer ${room.top})`);
  assert.ok(p.bottom <= room.bottom + 0.3, `${at}: aşağı ${p.bottom.toFixed(1)} px taşar (yer ${room.bottom})`);
}

describe('Koltuk çerçeveleri', () => {
  test('mağazadaki her resimli çerçevenin ölçüsü var', () => {
    const framed = COSMETICS.filter((c) => c.kind === 'frame' && !c.fx).map((c) => c.id);
    assert.ok(framed.length >= 8);
    for (const id of framed) assert.ok(FRAME_ART_SIZES[id], `${id} ölçüsü yok`);
  });

  test('koltuğun hücresi: yanda yuvanın kenarından 2 px içeride, üstte satır arası ve puan satırı, altta kendi isminin satırı', () => {
    assert.equal(CELL_GAP, 2);
    assert.equal(SEAT_TOP, ROW_GAP + PK_LINE);
    assert.equal(RING_OVER, 0.3);
    assert.equal(PHOTO_MIN, 0.8);
    for (const { size, slot } of seats()) {
      const room = seatRoom(size, slot);
      const at = `yüz ${size}, yuva ${slot}`;
      assert.equal(room.side, Math.floor((slot - size) / 2) - CELL_GAP, at);
      assert.equal(room.top, SEAT_TOP, at);
      assert.equal(room.bottom, NAME_GAP + nameLine(size), at);
      // Each cell keeps CELL_GAP from its slot's edge, so two neighbours' cells are never closer than that.
      const { box } = seatArt(FRAME_ART_SIZES['fr-silver'], size, room);
      assert.ok(slot - box.width >= 2 * CELL_GAP, `${at}: hücreler birbirine değer`);
      assert.equal(box.width, size + 2 * room.side);
    }
    // No slot known: an eighth of the face to each side, as before.
    assert.equal(seatRoom(48).side, 6);
    assert.equal(seatRoom(48, undefined, 4).top, 4);
  });

  test('klasik ızgarada (360 ve 390 px, sırada 5 ve 6) hiçbir çerçeve kesilmez, fotoğraf yüzü doldurur, halka en çok %30 örter', () => {
    const shrunk: string[] = [];
    for (const width of [360, 390]) {
      for (const [cols, mics] of [
        [5, 10],
        [6, 18],
      ] as const) {
        const f = fitGrid(mics, width, 2_000);
        assert.equal(f.cols, cols);
        if (cols === 5) assert.equal(f.face, 52);
        const size = f.face;
        const room = seatRoom(size, f.slot);
        for (const [id, art] of FRAMES) {
          const at = `${id}, ${width} px, sırada ${cols}`;
          const s = seatArt(art, size, room);
          assert.equal(s.clip, false, `${at}: kesilir`);
          assert.ok(cover(art, s) <= RING_OVER + 1e-9, `${at}: halka fotoğrafın %${(cover(art, s) * 100).toFixed(0)}’ini örter`);
          assert.ok(art.hole * s.frame <= s.avatar / 2 + 1e-9, `${at}: fotoğrafla halka arasında boşluk`);
          assertInside(art, size, room, s, at);
          if (s.avatar !== size) shrunk.push(`${at}: ${s.avatar.toFixed(1)}/${size}`);
        }
      }
    }
    // The one picture the 2 px gap leaves short: the gold crown six to a row on a 390 px phone (48 px faces) needs 5.4
    // px beside the face and has 5, so its photo is drawn under a pixel smaller (47.4 of 48) rather than cut.
    assert.deepEqual(shrunk, ['fr-crown-gold, 390 px, sırada 6: 47.4/48']);
  });

  test('her koltuk boyunda çerçeve hücrede kalır; sığmayanda önce halka biner, sonra fotoğraf en çok %80’e küçülür, kesim yalnız en son', () => {
    let cut = 0;
    for (const { size, slot } of seats()) {
      for (const top of [undefined, 25, 16, 10, 8, 3, 0]) {
        const room = seatRoom(size, slot, top);
        for (const [id, art] of FRAMES) {
          const at = `${id}, yüz ${size}, yuva ${slot}, üstte ${room.top}`;
          const s = seatArt(art, size, room);
          assert.ok(s.avatar <= size + 1e-9, `${at}: fotoğraf yüzden büyük`);
          assert.ok(s.avatar >= PHOTO_MIN * size - 1e-9, `${at}: fotoğraf %${((s.avatar / size) * 100).toFixed(0)}`);
          assert.ok(cover(art, s) <= RING_OVER + 1e-9, `${at}: halka fazla örter`);
          assert.ok(art.hole * s.frame <= s.avatar / 2 + 1e-9, `${at}: fotoğrafla halka arasında boşluk`);
          // The photo only shrinks when the ring already covers all it may.
          if (s.avatar < size - 1e-9) assert.ok(Math.abs(cover(art, s) - RING_OVER) < 1e-9, `${at}: fotoğraf erken küçülür`);
          if (s.clip) {
            cut++;
            // A cut only when even the smallest photo's picture doesn't fit; it is cut to the cell, never onto the name.
            assert.equal(s.avatar, PHOTO_MIN * size, at);
            assert.ok((2 * art.hole * artScaleIn(art, size, room) * size) / (1 - RING_OVER) < PHOTO_MIN * size, `${at}: gereksiz kesim`);
            assert.deepEqual(s.box, { left: -room.side, top: -room.top, width: size + 2 * room.side, height: size + room.top + room.bottom });
          } else assertInside(art, size, room, s, at);
          // With a row's room above nothing is cut, on any face a stage draws (up to a video tile's seat, 72 px).
          if (top === undefined && size <= 72) assert.equal(s.clip, false, `${at}: kesilir`);
        }
      }
    }
    assert.ok(cut > 0, 'çok dar üstte en son çare kesim');
  });

  test('üstte az yer (3 px): fotoğraf kesilmeden küçülür, yalnız %80’in altına inecekse kesilir', () => {
    const size = 52;
    const slot = gridSlot(374, 5);
    const room = seatRoom(size, slot, 3);
    const shrinks: string[] = [];
    const cuts: string[] = [];
    for (const [id, art] of FRAMES) {
      const s = seatArt(art, size, room);
      if (s.clip) cuts.push(id);
      else if (s.avatar < size) shrinks.push(id);
      if (!s.clip) assert.ok(s.avatar >= PHOTO_MIN * size, id);
    }
    assert.ok(shrinks.length > 0, 'kesmeden küçülen çerçeve yok');
    assert.ok(shrinks.includes('fr-silver'), 'gümüş çerçeve kesilmeden sığar');
    assert.ok(cuts.includes('fr-crown-gold'), 'altın taç %80’de bile sığmaz: kesilir');
  });

  test('çerçeve resmi oda dışında (profil, listeler) eski ölçüsünde; artScaleIn hücrede tutar', () => {
    const silver = FRAME_ART_SIZES['fr-silver'];
    assert.equal(artFit(silver, 96, 1.8).avatar, 96, 'profil: 1.8 sınırıyla');
    const roomy = { side: 200, top: 200, bottom: 200 };
    assert.ok(Math.abs(artFit(silver, 60, Math.min(1.8, artScaleIn(silver, 60, roomy))).avatar - 60) < 1e-9);
    for (const { size, slot } of seats()) {
      const room = seatRoom(size, slot);
      for (const [id, art] of FRAMES) {
        const { frame, avatar } = artFit(art, size, Math.min(1.8, artScaleIn(art, size, room)));
        const big = frame * ART_BREATHE;
        const at = `${id}, yüz ${size}, yuva ${slot}`;
        assert.ok(art.reach.x * big <= size / 2 + room.side + 1e-9, `${at}: yana taşar`);
        assert.ok(art.reach.top * big <= size / 2 + room.top + 1e-9, `${at}: üst sıraya taşar`);
        assert.ok(art.reach.bottom * big <= size / 2 + room.bottom + 1e-9, `${at}: isimden aşağı taşar`);
        assert.ok(avatar <= size + 1e-9, `${at}: fotoğraf yüzden büyük`);
      }
    }
  });

  test('sahnenin üst payı fit-stage ile aynı', () => {
    const fit = readFileSync(resolve(SRC, 'components/room/fit-stage.tsx'), 'utf8');
    const room = readFileSync(resolve(SRC, 'components/room/live-room.tsx'), 'utf8');
    const a = fit.match(/const HEADROOM = (\d+);/)?.[1];
    const b = room.match(/const STAGE_HEADROOM = (\d+);/)?.[1];
    assert.ok(a && b && a === b, `fit-stage HEADROOM ${a}, live-room STAGE_HEADROOM ${b}`);
  });
});

describe('Konuşma halkası', () => {
  /** The reach the ring had before the frames' cell grew (güncelleme 6): it must not move. */
  const before = (size: number, slot?: number) => Math.max(3, Math.min(Math.round(size / 7), slot === undefined ? Math.round(size / 8) : Math.floor((slot - size) / 2), ROW_GAP, NAME_GAP + 3));

  test('her yüz boyunda fotoğrafın dışında başlar, tam seste payı kadar büyür, hücreden çıkmaz', () => {
    for (const { size, slot } of seats()) {
      const room = seatRoom(size, slot);
      const reach = ringReach(size, room);
      const r = ringOf(size, reach);
      const at = `yüz ${size}, yuva ${slot}`;
      assert.equal(r.side / 2 - r.width, size / 2 + RING_GAP, `${at}: iç kenarı yüzün hemen dışında`);
      assert.ok(r.max >= 1);
      assert.ok((r.side / 2) * r.max <= size / 2 + Math.max(reach, RING_GAP + r.width) + 1e-9, `${at}: payından büyük`);
      assert.ok(reach <= Math.max(3, Math.floor((slot - size) / 2)) && reach <= ROW_GAP && reach <= NAME_GAP + 3, `${at}: hücreden taşar`);
    }
  });

  test('çerçevenin hücresi büyüdü, konuşma halkasının payı değişmedi; üstte satır arasından az yer varsa o kadar', () => {
    for (const { size, slot } of seats()) {
      for (const top of [undefined, 25, 10]) assert.equal(ringReach(size, seatRoom(size, slot, top)), before(size, slot), `yüz ${size}, yuva ${slot}, üstte ${top}`);
      // A container with less room above than the row gap (a team PK's halves, a video tile): the ring keeps to it.
      for (const top of [5, 3, 0]) assert.equal(ringReach(size, seatRoom(size, slot, top)), Math.max(3, Math.min(before(size, slot), top)), `yüz ${size}, yuva ${slot}, üstte ${top}`);
    }
    for (const size of [30, 48, 60, 96]) assert.equal(ringReach(size, seatRoom(size)), before(size));
  });

  test('aynı yüzde her dalga aynı ölçüde (çerçeveden bağımsız)', () => {
    const a = ringOf(48, ringReach(48, seatRoom(48, 74)));
    assert.deepEqual(a, ringOf(48, 7));
    assert.ok(a.width >= 2 && a.width <= 4);
    assert.ok(ringOf(FACE_MAX, 14).width === 4 && ringOf(FACE_MIN, 4).width === 2);
  });

  test('ızgara yuvası: geniş yüzde de pay yan koltuğa uzanmaz', () => {
    const slot = gridSlot(374, 5);
    assert.ok(ringReach(60, seatRoom(60, slot)) <= (slot - 60) / 2);
  });

  test('çerçeveli koltukta halka çerçeve resminin üstünde, çerçevesizde fotoğrafın arkasında', () => {
    const parts = readFileSync(resolve(SRC, 'components/room/parts.tsx'), 'utf8');
    const behind = parts.indexOf('{!framed && ring}');
    const framed = parts.indexOf('<FramedAvatar uri={user.avatar}');
    const over = parts.indexOf('{framed && ring}');
    assert.ok(behind > 0 && framed > behind && over > framed, 'konuşma halkasının sırası');
  });
});
