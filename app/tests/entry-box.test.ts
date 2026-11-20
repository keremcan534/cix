/// <reference types="node" />
// The person card's entry box (lib/entry-box, components/room/entry-box; the owners' design, 20 Nov 2026): beside the
// name, the person's own room entrance plays round, what everyone sees when they come in (lib/room-entrance
// entryPlanOf). Their clip when it is on the phone and may play (the team's own with its name plate), else the drawn
// banner; "Hareketi azalt" or effects off: the banner standing still; Düşük veri modu: never the clip; nothing worn: no
// box. On a phone too narrow for it beside the name (or with large text) it is a strip under the head.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { COSMETICS, setLiveCosmetics } from '@/data/catalog';
import { vipTier } from '@/data/economy';
import { CARD_HEAD, ENTRY_BOX, clipStage, entryBoxPlace, entryBoxShow, type EntryBoxSettings } from '@/lib/entry-box';
import { cardLookOf } from '@/lib/person-card';
import { entryPlanOf } from '@/lib/room-entrance';
import { PLATE_LOOK, mergeShop, parseLiveShop } from '@/lib/shop-live-core';

const PLAIN: EntryBoxSettings = { reduceMotion: false, lowData: false, effectsOff: false, clipKept: false };
const PLATE = { x: 0.5, y: 0.7, w: 0.5, size: 0.04, color: '#FFD700', bold: true };

describe('Kişi kartı giriş kutusu: ne gösterir', () => {
  test('hiçbir şey takmayan: kutu yok', () => {
    assert.equal(entryBoxShow(entryPlanOf(undefined), PLAIN), null, 'görünüşü okunmamış (demo kişileri de)');
    assert.equal(entryBoxShow(entryPlanOf({ entry: null, ride: null, noble: null, vipLevel: 0 }), { ...PLAIN, clipKept: true }), null);
    // The profile answer's look with nothing worn (GET /api/user `looks`, lib/person-card cardLookOf).
    const card = cardLookOf({ frame: 'fr-rose', entry: null, ride: null, noble: null, vipLevel: 0, specialId: null });
    assert.equal(entryBoxShow(entryPlanOf(card ?? undefined), PLAIN), null);
  });

  test('yalnız VIP: odada görünen VIP bandı, kendi renkleriyle', () => {
    const plan = entryPlanOf({ vipLevel: 3 });
    assert.equal(plan?.fx, 'vip');
    assert.equal(plan?.badge, 'VIP 3');
    assert.deepEqual(plan?.tint, vipTier(3)?.color);
    assert.deepEqual(entryBoxShow(plan, PLAIN), { kind: 'banner', still: false });
  });

  test('videolu giriş: klip telefondaysa video, değilse çizili bant (kart indirmez)', () => {
    const plan = entryPlanOf(cardLookOf({ entry: 'en-dragon', ride: 'rd-sport', vipLevel: 7 }) ?? undefined);
    assert.equal(plan?.fx, 'dragon');
    assert.equal(plan?.ride, '🏎️');
    assert.deepEqual(entryBoxShow(plan, { ...PLAIN, clipKept: true }), { kind: 'video', plate: null });
    assert.deepEqual(entryBoxShow(plan, PLAIN), { kind: 'banner', still: false }, 'klip telefonda yok');
  });

  test('ekibin kendi efekti: klip ve ismin yazıldığı plaka', () => {
    setLiveCosmetics(
      mergeShop(
        COSMETICS,
        parseLiveShop({
          items: [
            { sku: 'se1', kind: 'entry', name: 'Altın Ejderha', price: 5000, days: null, minVip: 0, video: true, plate: PLATE },
            { sku: 'se2', kind: 'entry', name: 'Plakasız', price: 5000, days: null, minVip: 0, video: true },
          ],
        }),
      ),
    );
    try {
      const plan = entryPlanOf({ entry: 'se1', vipLevel: 0 });
      assert.equal(plan?.clip, 'se1');
      assert.deepEqual(entryBoxShow(plan, { ...PLAIN, clipKept: true }), { kind: 'video', plate: { ...PLATE, ...PLATE_LOOK } });
      assert.deepEqual(entryBoxShow(entryPlanOf({ entry: 'se2', vipLevel: 0 }), { ...PLAIN, clipKept: true }), { kind: 'video', plate: null }, 'plakasız: ismi altında');
      // The clip not on the phone: the drawn banner, as the room shows when it can't play it.
      assert.deepEqual(entryBoxShow(plan, PLAIN), { kind: 'banner', still: false });
    } finally {
      setLiveCosmetics(null);
    }
  });

  test('Hareketi azalt ya da efektler kapalı: duran bant, video yok; Düşük veri: video yok', () => {
    const plan = entryPlanOf({ entry: 'en-dragon', vipLevel: 7 });
    assert.deepEqual(entryBoxShow(plan, { ...PLAIN, clipKept: true, reduceMotion: true }), { kind: 'banner', still: true });
    assert.deepEqual(entryBoxShow(plan, { ...PLAIN, clipKept: true, effectsOff: true }), { kind: 'banner', still: true });
    assert.deepEqual(entryBoxShow(plan, { ...PLAIN, clipKept: true, lowData: true }), { kind: 'banner', still: false });
    assert.deepEqual(entryBoxShow(entryPlanOf({ vipLevel: 2 }), { ...PLAIN, reduceMotion: true, lowData: true }), { kind: 'banner', still: true });
  });

  test('yalnız binek ya da rütbe de girişte görünür, kutuda da', () => {
    assert.deepEqual(entryBoxShow(entryPlanOf({ ride: 'rd-sport', vipLevel: 0 }), PLAIN), { kind: 'banner', still: false });
    assert.equal(entryPlanOf({ noble: 2, vipLevel: 0 })?.fx, 'vip');
    assert.deepEqual(entryBoxShow(entryPlanOf({ noble: 2, vipLevel: 0 }), PLAIN), { kind: 'banner', still: false });
  });
});

describe('Kişi kartı giriş kutusu: nerede durur', () => {
  test('390 genişlikte adın yanında, fotoğraf boyunda; isim, ID ve ülkeye yer kalır', () => {
    const p = entryBoxPlace(390, 1);
    assert.equal(p.beside, true);
    assert.equal(p.h, CARD_HEAD.avatar);
    const who = 390 - CARD_HEAD.inset - CARD_HEAD.avatar - CARD_HEAD.gap - ENTRY_BOX.gap - ENTRY_BOX.closeCol - p.w;
    assert.ok(who >= ENTRY_BOX.whoMin, `isim sütunu ${who}`);
    assert.ok(p.w >= 80, `kutu ${p.w}`);
  });

  test('360 genişlikte de yanında, daha dar; büyük yazıda ya da daha dar telefonda başlığın altında şerit', () => {
    const p = entryBoxPlace(360, 1);
    assert.equal(p.beside, true);
    assert.ok(p.w >= ENTRY_BOX.minW && p.w < entryBoxPlace(390, 1).w);
    for (const [w, scale] of [
      [360, 1.15],
      [340, 1],
    ] as const) {
      const below = entryBoxPlace(w, scale);
      assert.equal(below.beside, false, `${w} @${scale}`);
      assert.equal(below.w, w - CARD_HEAD.inset, 'kartın genişliğinde');
      assert.equal(below.h, ENTRY_BOX.belowH);
    }
    // The app caps the phone's text size (components/text MAX_FONT_SCALE): 2× text counts as 1.15.
    assert.deepEqual(entryBoxPlace(412, 2), entryBoxPlace(412, 1.15));
    // A phone that makes text smaller doesn't give the box more than the usual room.
    assert.deepEqual(entryBoxPlace(390, 0.85), entryBoxPlace(390, 1));
  });

  test('geniş telefonda (tablet) kutu en fazla kendi genişliği', () => {
    assert.deepEqual(entryBoxPlace(800, 1), { beside: true, w: ENTRY_BOX.maxW, h: ENTRY_BOX.h });
  });

  test('klip kutunun ortasında, tamamı görünür (9 × 16)', () => {
    assert.deepEqual(clipStage(90, 104), { w: 59, h: 104, left: 16, top: 0 });
    assert.deepEqual(clipStage(312, 76), { w: 43, h: 76, left: 135, top: 0 });
    // Narrower than tall enough: fitted by its width.
    assert.deepEqual(clipStage(45, 104), { w: 45, h: 80, left: 0, top: 12 });
    assert.deepEqual(clipStage(0, 0), { w: 0, h: 0, left: 0, top: 0 });
  });
});
