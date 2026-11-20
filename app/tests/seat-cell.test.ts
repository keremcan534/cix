// What a room seat draws around its face (lib/seat-cell): every illustrated frame of the shop stays inside the seat's
// cell (no wing over the next seat, no crown past the row above's points line, the hanging gems behind the seat's own
// name, 2 px short of each so an upper seat's gems and a lower seat's crown never meet), the photo shows only inside
// the frame's hole, and the speaking ring is one size for every wave: outside the photo, behind the frame, within the
// same reach. Checked on the stage's real sizes (lib/seat-fit). The rule (19 Nov 2026): no cut on any row; the ring may
// cover up to 30% of the photo; a frame that still doesn't fit shrinks the photo to no less than 80%, then stands still
// if that is what lets it fit; a cut only past that.
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
  TUCK,
  artFit,
  artScaleIn,
  ringOf,
  ringReach,
  seatArt,
  seatPhotoDisc,
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

/** Where the picture goes past the face (px), at the top of its breath when it breathes (a still or cut one doesn't). */
function past(art: FrameArtSize, size: number, s: SeatArt) {
  const big = s.frame * (s.clip || s.still ? 1 : ART_BREATHE);
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

  test('koltuğun hücresi: yanda yuvanın kenarından, üstte üst sıranın puan satırının başından, altta kendi isminin satırının sonundan 2 px içeride', () => {
    assert.equal(CELL_GAP, 2);
    assert.equal(SEAT_TOP, ROW_GAP + PK_LINE - CELL_GAP);
    assert.equal(SEAT_TOP, 23);
    assert.equal(RING_OVER, 0.3);
    assert.equal(PHOTO_MIN, 0.8);
    for (const { size, slot } of seats()) {
      const room = seatRoom(size, slot);
      const at = `yüz ${size}, yuva ${slot}`;
      assert.equal(room.side, Math.floor((slot - size) / 2) - CELL_GAP, at);
      assert.equal(room.top, SEAT_TOP, at);
      assert.equal(room.bottom, NAME_GAP + nameLine(size) - CELL_GAP, at);
      // An upper seat's gems (its cell's bottom) and the crown of the seat under it (its cell's top) never meet: between
      // the two faces are the name gap, the name's line, the points line and the row gap.
      assert.ok(NAME_GAP + nameLine(size) + PK_LINE + ROW_GAP - room.bottom - room.top >= 2 * CELL_GAP, `${at}: üst sıranın taşı alttakinin tacına değer`);
      // Each cell keeps CELL_GAP from its slot's edge, so two neighbours' cells are never closer than that.
      const { box } = seatArt(FRAME_ART_SIZES['fr-silver'], size, room);
      assert.ok(slot - box.width >= 2 * CELL_GAP, `${at}: hücreler birbirine değer`);
      assert.equal(box.width, size + 2 * room.side);
    }
    // No slot known: an eighth of the face to each side, as before.
    assert.equal(seatRoom(48).side, 6);
    assert.equal(seatRoom(48, undefined, 4).top, 4);
  });

  test('klasik ızgarada (360 ve 390 px, sırada 5 ve 6) hiçbir çerçeve kesilmez ya da durmaz, fotoğraf yüzü doldurur, halka en çok %30 örter', () => {
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
          assert.equal(s.still, false, `${at}: nefes almaz`);
          assert.ok(cover(art, s) <= RING_OVER + 1e-9, `${at}: halka fotoğrafın %${(cover(art, s) * 100).toFixed(0)}’ini örter`);
          assert.ok(art.hole * s.frame <= s.avatar / 2 + 1e-9, `${at}: fotoğrafla halka arasında boşluk`);
          assertInside(art, size, room, s, at);
          if (s.avatar !== size) shrunk.push(`${at}: ${s.avatar.toFixed(1)}/${size}`);
        }
      }
    }
    // The one picture the cell leaves short: the gold crown (the tallest crown and the smallest hole) gets its photo
    // drawn a pixel or so smaller (under 3%) rather than cut.
    assert.deepEqual(shrunk, ['fr-crown-gold, 360 px, sırada 5: 50.8/52', 'fr-crown-gold, 390 px, sırada 5: 50.8/52', 'fr-crown-gold, 390 px, sırada 6: 47.4/48']);
  });

  test('her koltuk boyunda çerçeve hücrede kalır; sığmayanda önce halka biner, sonra fotoğraf en çok %80’e küçülür, sonra durur, kesim yalnız en son', () => {
    let cut = 0;
    let calm = 0;
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
          // The photo the smallest picture that fits would need: breathing, and standing still (no margin for a breath).
          const fit = artScaleIn(art, size, room) * size;
          const photoAt = (frame: number) => (2 * art.hole * frame) / (1 - RING_OVER);
          if (s.clip) {
            cut++;
            // A cut only when even the smallest photo's picture doesn't fit standing still; it is cut to the cell, never
            // onto the name, and stands still.
            assert.equal(s.avatar, PHOTO_MIN * size, at);
            assert.equal(s.still, true, at);
            assert.ok(photoAt(fit * ART_BREATHE) < PHOTO_MIN * size, `${at}: gereksiz kesim`);
            assert.deepEqual(s.box, { left: -room.side, top: -room.top, width: size + 2 * room.side, height: size + room.top + room.bottom });
          } else {
            assertInside(art, size, room, s, at);
            // It stands still only when breathing, even its smallest photo wouldn't fit.
            if (s.still) {
              calm++;
              assert.ok(photoAt(fit) < PHOTO_MIN * size, `${at}: gereksiz yere durur`);
              assert.ok(s.avatar >= PHOTO_MIN * size - 1e-9, at);
            }
          }
          // With a row's room above nothing is cut or held still, on any face a stage draws (up to a video tile's seat, 72 px).
          if (top === undefined && size <= 72) assert.ok(!s.clip && !s.still, `${at}: kesilir ya da durur`);
        }
      }
    }
    assert.ok(cut > 0, 'çok dar üstte en son çare kesim');
    assert.ok(calm > 0, 'nefes payı kadar sığmayan, durarak kesilmeden sığar');
  });

  test('koltukta fotoğraf yalnız çerçevenin deliğinde görünür: ince halkanın dışına taşmaz', () => {
    for (const { size, slot } of seats()) {
      for (const top of [undefined, 16, 3]) {
        const room = seatRoom(size, slot, top);
        for (const [id, art] of FRAMES) {
          const at = `${id}, yüz ${size}, yuva ${slot}, üstte ${room.top}`;
          const s = seatArt(art, size, room);
          const d = seatPhotoDisc(art, s.frame, s.avatar);
          assert.ok(d <= s.avatar + 1e-9, `${at}: görünen fotoğraf çizilenden büyük`);
          // Never past the hole (with its tuck under the ring), and still under the ring at the top of its breath.
          assert.ok(d / 2 <= art.hole * s.frame * TUCK + 1e-9, `${at}: fotoğraf halkanın dışında görünür`);
          if (d < s.avatar) assert.ok(d / 2 >= art.hole * s.frame * ART_BREATHE - 1e-9, `${at}: halkayla fotoğraf arasında boşluk`);
          // A ring on the photo's edge (the photo fills the face): all of it shows.
          if (Math.abs(s.frame - size / (2 * art.hole * TUCK)) < 1e-9) assert.ok(Math.abs(d - size) < 1e-6, at);
        }
      }
    }
    assert.equal(TUCK, 1.04);
    assert.ok(TUCK > ART_BREATHE, 'fotoğraf nefes alan halkanın altında kalır');
    // The seat draws it so (components/fx/frame-art ArtFrame): the photo at its size in a round mask of the disc, the
    // glow round the disc; off a seat as before.
    const fa = readFileSync(resolve(SRC, 'components/fx/frame-art.tsx'), 'utf8');
    assert.match(fa, /const disc = seat \? seatPhotoDisc\(art, frame, avatar\) : avatar;/);
    assert.match(fa, /const glow = disc \* 1\.16;/);
    assert.match(fa, /width: disc, height: disc, borderRadius: disc \/ 2, overflow: 'hidden'/);
    assert.match(fa, /left: -\(avatar - disc\) \/ 2, top: -\(avatar - disc\) \/ 2, width: avatar, height: avatar/);
    // A picture held still or cut doesn't breathe (nor play its moving file).
    assert.match(fa, /const calm = !!still \|\| !!seat\?\.still \|\| !!seat\?\.clip;/);
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

  test('isim, çerçeve resmi olan yüzde koyu bir kapsülde; satırın yüksekliği değişmez', () => {
    const parts = readFileSync(resolve(SRC, 'components/room/parts.tsx'), 'utf8');
    assert.match(parts, /const capsule = !!user && !mini && !!frameArtOf\(frameId\);/);
    assert.match(parts, /capsule && styles\.nameCapsule/);
    const style = parts.match(/nameCapsule: \{([^}]*)\}/)?.[1] ?? '';
    assert.match(style, /backgroundColor: 'rgba\(10,6,20,0\.55\)'/);
    assert.match(style, /borderRadius: 8/);
    assert.match(style, /paddingHorizontal: CAPSULE_PAD/);
    assert.doesNotMatch(style, /padding(Vertical|Top|Bottom)?:/, 'kapsül isim satırını uzatmaz');
    // The name's line keeps its height (lib/seat-fit nameLine); a capsule uses the slot's edge air, so a framed name
    // is cut only 2 px sooner than a plain one (6-to-a-row: "Zeynep" still fits).
    assert.match(parts, /lineHeight: nameLine\(size\),/);
    assert.match(parts, /maxWidth: Math\.max\(24, \(slotWidth \? slotWidth - \(capsule \? 2 \+ 2 \* CAPSULE_PAD : 6\) : 64\) - marks\)/);
    assert.match(parts, /const CAPSULE_PAD = 3;/);
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

  test('halka her yüzde, çerçeveli ya da değil, fotoğrafın ve çerçevenin arkasında (güncelleme 5: dalgalar çerçeveyi kesmesin)', () => {
    const parts = readFileSync(resolve(SRC, 'components/room/parts.tsx'), 'utf8');
    const ring = parts.indexOf('{speaking && <VoiceWave ');
    const framed = parts.indexOf('<FramedAvatar uri={user.avatar}');
    assert.ok(ring > 0 && framed > ring, 'konuşma halkası çerçeveden önce (arkasında) çizilir');
    assert.equal(parts.match(/<VoiceWave /g)?.length, 1, 'tek halka, her yüzde aynı yerde');
    assert.doesNotMatch(parts, /framed && ring/);
  });
});
