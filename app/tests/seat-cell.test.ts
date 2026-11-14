// What a room seat draws around its face (lib/seat-cell): every illustrated frame of the shop stays inside the seat's
// cell (no wing over the next seat, no crown in the row above, no hanging gem on the name), and the speaking ring is
// one size for every wave: outside the photo, within the same reach. Checked on the stage's real sizes (lib/seat-fit).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { COSMETICS } from '@/data/catalog';
import { FRAME_ART_SIZES } from '@/data/frame-art';
import { ART_BREATHE, NAME_GAP, RING_GAP, artFit, artScaleIn, ringOf, ringReach, seatRoom } from '@/lib/seat-cell';
import { FACE_MAX, FACE_MIN, ROW_GAP, fitGrid, gridSlot, layoutPlan } from '@/lib/seat-fit';
import { ROOM_LAYOUTS } from '@/data/room-layouts';

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

describe('Koltuk çerçeveleri', () => {
  test('mağazadaki her resimli çerçevenin ölçüsü var', () => {
    const framed = COSMETICS.filter((c) => c.kind === 'frame' && !c.fx).map((c) => c.id);
    assert.ok(framed.length >= 8);
    for (const id of framed) assert.ok(FRAME_ART_SIZES[id], `${id} ölçüsü yok`);
  });

  test('çerçeve resmi koltuğun hücresinden taşmaz: yan koltuğa, üst sıraya, isme binmez', () => {
    for (const { size, slot } of seats()) {
      const room = seatRoom(size, slot);
      for (const [id, art] of Object.entries(FRAME_ART_SIZES)) {
        const { frame, avatar } = artFit(art, size, Math.min(1.8, artScaleIn(art, size, room)));
        const big = frame * ART_BREATHE;
        const at = `${id}, yüz ${size}, yuva ${slot}`;
        assert.ok(art.reach.x * big <= size / 2 + room.side + 1e-9, `${at}: yana taşar`);
        assert.ok(2 * (size / 2 + room.side) <= slot, `${at}: hücre yuvadan geniş`);
        assert.ok(art.reach.top * big <= size / 2 + ROW_GAP + 1e-9, `${at}: üst sıraya taşar`);
        assert.ok(art.reach.bottom * big <= size / 2 + NAME_GAP + 1e-9, `${at}: isme biner`);
        assert.ok(avatar <= size + 1e-9, `${at}: fotoğraf yüzden büyük`);
        // The photo shrinks for the widest pictures but stays a face, not a dot.
        assert.ok(avatar >= size * 0.41, `${at}: fotoğraf ${avatar.toFixed(1)} px`);
      }
    }
  });

  test('yer varken fotoğraf yüzü doldurur; profil gibi hücresiz yerlerde eski ölçü kalır', () => {
    const silver = FRAME_ART_SIZES['fr-silver'];
    assert.equal(artFit(silver, 96, 1.8).avatar, 96, 'profil: 1.8 sınırıyla');
    const roomy = { side: 200, top: 200, bottom: 200 };
    assert.ok(Math.abs(artFit(silver, 60, Math.min(1.8, artScaleIn(silver, 60, roomy))).avatar - 60) < 1e-9);
  });
});

describe('Konuşma halkası', () => {
  test('her yüz boyunda fotoğrafın dışında başlar, tam seste payı kadar büyür, hücreden çıkmaz', () => {
    for (const { size, slot } of seats()) {
      const room = seatRoom(size, slot);
      const reach = ringReach(size, room);
      const r = ringOf(size, reach);
      const at = `yüz ${size}, yuva ${slot}`;
      assert.equal(r.side / 2 - r.width, size / 2 + RING_GAP, `${at}: iç kenarı yüzün hemen dışında`);
      assert.ok(r.max >= 1);
      assert.ok((r.side / 2) * r.max <= size / 2 + Math.max(reach, RING_GAP + r.width) + 1e-9, `${at}: payından büyük`);
      assert.ok(reach <= Math.max(3, room.side) && reach <= ROW_GAP, `${at}: hücreden taşar`);
    }
  });

  test('aynı yüzde her dalga aynı ölçüde (çerçeveden bağımsız)', () => {
    const a = ringOf(48, ringReach(48, seatRoom(48, 74)));
    assert.deepEqual(a, ringOf(48, 7));
    assert.ok(a.width >= 2 && a.width <= 4);
    assert.ok(ringOf(FACE_MAX, 14).width === 4 && ringOf(FACE_MIN, 4).width === 2);
  });

  test('ızgara yuvası: geniş yüzde de pay yan koltuğa uzanmaz', () => {
    const slot = gridSlot(374, 5, 60);
    assert.ok(ringReach(60, seatRoom(60, slot)) <= (slot - 60) / 2);
  });
});
