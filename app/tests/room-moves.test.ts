// Hamle (lib/room-moves): the room's mic reactions that do something. What a pick makes, what another phone may
// send, the chat line of a result, and where a kiss or a punch lands.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { STICKER_PACKS } from '@/data/catalog';
import { parseSignal } from '@/lib/live/room-bus';
import { RPS, isMovePick, moveLine, moveOfPick, needsMic, parseMove, sideTarget } from '@/lib/room-moves';

describe('Hamle: seçim ve sonuç', () => {
  test('Hamle sekmesindeki her seçim bir hamle yapar; başka çıkartma yapmaz', () => {
    const picks = STICKER_PACKS.find((p) => p.id === 'hamle')!.stickers.map((x) => x.id);
    assert.equal(picks.length, 6);
    for (const id of picks) {
      assert.ok(isMovePick(id), id);
      assert.ok(moveOfPick(id), id);
    }
    assert.equal(isMovePick('duygu-opucuk'), false);
    assert.equal(moveOfPick('muzik-dans'), null);
    assert.equal(moveOfPick(null), null);
  });

  test('zar 1 ile 6, el 0 ile 2 arasında; uç değerlerde de', () => {
    for (const x of [0, 0.01, 0.5, 0.999999, 1]) {
      const d = moveOfPick('hamle-zar', () => x);
      assert.ok(d?.a === 'dice' && d.n >= 1 && d.n <= 6, `zar ${x}`);
      const r = moveOfPick('hamle-tkm', () => x);
      assert.ok(r?.a === 'rps' && r.n >= 0 && r.n <= 2, `el ${x}`);
    }
    assert.deepEqual(moveOfPick('hamle-zar', () => 0), { a: 'dice', n: 1 });
    assert.deepEqual(moveOfPick('hamle-zar', () => 0.99), { a: 'dice', n: 6 });
    assert.deepEqual(moveOfPick('hamle-opucuk-sol'), { a: 'kiss', d: 'l' });
    assert.deepEqual(moveOfPick('hamle-yumruk-sag'), { a: 'punch', d: 'r' });
  });

  test('öpücük ve yumruk mikrofon ister; zar ve el istemez', () => {
    assert.equal(needsMic({ a: 'kiss', d: 'l' }), true);
    assert.equal(needsMic({ a: 'punch', d: 'r' }), true);
    assert.equal(needsMic({ a: 'dice', n: 3 }), false);
    assert.equal(needsMic({ a: 'rps', n: 0 }), false);
  });

  test('sonuç sohbet satırı olur; öpücük ve yumruk satır yazmaz', () => {
    assert.equal(moveLine('Ece', { a: 'dice', n: 5 }), '🎲 Ece zar attı: 5');
    assert.equal(moveLine('Ece', { a: 'rps', n: 2 }), "✊ Ece Taş Kağıt Makas'ta Makas çıkardı");
    assert.equal(moveLine('Ece', { a: 'kiss', d: 'r' }), null);
    assert.deepEqual(RPS.map((h) => h.name), ['Taş', 'Kağıt', 'Makas']);
  });
});

describe('Hamle: başka telefondan gelen', () => {
  test('yalnız bilinen biçim ve aralık çizilir', () => {
    assert.deepEqual(parseMove({ a: 'dice', n: 6 }), { a: 'dice', n: 6 });
    assert.deepEqual(parseMove({ a: 'kiss', d: 'l', extra: 'x' }), { a: 'kiss', d: 'l' });
    for (const bad of [null, 'dice', {}, { a: 'dice', n: 7 }, { a: 'dice', n: 0 }, { a: 'dice', n: 2.5 }, { a: 'dice', n: '3' }, { a: 'rps', n: 3 }, { a: 'rps', n: -1 }, { a: 'kiss', d: 'up' }, { a: 'slap', d: 'l' }]) {
      assert.equal(parseMove(bad), null, JSON.stringify(bad));
    }
  });

  test('oda sinyali olarak gider ve gelir; bozuk olan düşer', () => {
    assert.deepEqual(parseSignal({ t: 'act', a: 'rps', n: 1 }), { t: 'act', a: 'rps', n: 1 });
    assert.deepEqual(parseSignal({ t: 'act', a: 'punch', d: 'r' }), { t: 'act', a: 'punch', d: 'r' });
    assert.equal(parseSignal({ t: 'act', a: 'dice', n: 9 }), null);
    assert.equal(parseSignal({ t: 'act' }), null);
  });
});

describe('Hamle: yandaki mikrofon', () => {
  const at = (x: number, y: number) => ({ x, y, w: 60, h: 60 });
  // A row of three mics, and a second row under it.
  const slots = [
    { index: 1, rect: at(20, 100) },
    { index: 2, rect: at(120, 100) },
    { index: 3, rect: at(220, 100) },
    { index: 4, rect: at(20, 200) },
    { index: 5, rect: at(120, 200) },
  ];
  const others = (i: number) => slots.filter((s) => s.index !== i);

  test('aynı sıradaki en yakın mikrofona gider', () => {
    assert.deepEqual(sideTarget(slots[1].rect, others(2), 'l'), { index: 1, to: { x: 50, y: 130 } });
    assert.deepEqual(sideTarget(slots[1].rect, others(2), 'r'), { index: 3, to: { x: 250, y: 130 } });
    // From the left end to the right: the next one, not the far one.
    assert.equal(sideTarget(slots[0].rect, others(1), 'r').index, 2);
  });

  test('o tarafta mikrofon yoksa boşa gider; alt sıradaki sayılmaz', () => {
    const left = sideTarget(slots[0].rect, others(1), 'l');
    assert.equal(left.index, null);
    assert.ok(left.to.x < 50 && left.to.y === 130);
    const right = sideTarget(slots[2].rect, others(3), 'r');
    assert.equal(right.index, null);
    assert.ok(right.to.x > 250);
    // The last mic of the second row has nothing on its right, though the row above reaches further.
    assert.equal(sideTarget(slots[4].rect, others(5), 'r').index, null);
  });
});
