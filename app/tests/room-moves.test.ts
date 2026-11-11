// Hamle (lib/room-moves): the room's mic reactions that do something. What a pick makes, what another phone may
// send, the chat line of a result, and where a kiss or a punch lands.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { STICKER_PACKS } from '@/data/catalog';
import { decodeSignal, encodeSignal, parseSignal } from '@/lib/live/room-bus';
import { MIRRORED_ART, MOVE_ART, RPS, diceFace, isMovePick, moveArt, moveLine, moveOfPick, moveShuffle, needsMic, parseMove, sideTarget, type Move } from '@/lib/room-moves';

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

describe('Hamle: mikrofonda görünen', () => {
  test('mikrofon, paneldeki seçimin görselini gösterir: sola öpücük sola, sağa öpücük sağa bakar', () => {
    assert.equal(moveArt({ a: 'kiss', d: 'l' }), 'hamle-opucuk-sol');
    assert.equal(moveArt({ a: 'kiss', d: 'r' }), 'hamle-opucuk-sag');
    assert.equal(moveArt({ a: 'punch', d: 'l' }), 'hamle-yumruk-sol');
    assert.equal(moveArt({ a: 'punch', d: 'r' }), 'hamle-yumruk-sag');
    // The two kisses share one animation; only the left one is turned round, in the panel and on the mic alike.
    assert.equal(MIRRORED_ART.has('hamle-opucuk-sol'), true);
    assert.equal(MIRRORED_ART.has('hamle-opucuk-sag'), false);
    // Every pick of the tab draws itself on the mic (what the panel shows is what the room sees).
    const picks = STICKER_PACKS.find((p) => p.id === 'hamle')!.stickers.map((x) => x.id);
    for (const id of picks.filter((x) => /-(sol|sag)$/.test(x))) assert.equal(moveArt(moveOfPick(id)!), id);
  });

  test('zar: mikrofonda atılan yüz durur (hep 1 değil); dönerken o yüz görünmez', () => {
    for (let n = 1; n <= 6; n++) {
      const m: Move = { a: 'dice', n };
      assert.equal(moveArt(m), diceFace(n));
      assert.equal(moveArt(m), `hamle-zar-${n}`);
      assert.ok(MOVE_ART[moveArt(m)], `zar ${n}: adı ve yedek emojisi`);
      const tumble = moveShuffle(m);
      assert.ok(tumble.length >= 6, `zar ${n}: dönüş`);
      assert.ok(!tumble.includes(diceFace(n)), `zar ${n}: sonuç erken görünmez`);
      tumble.forEach((f, i) => assert.notEqual(f, tumble[i - 1], `zar ${n}: aynı yüz üst üste`));
      for (const f of tumble) assert.match(f, /^hamle-zar-[1-6]$/);
    }
  });

  test('Taş Kağıt Makas: çıkan el durur; eller karışırken her telefonda aynı sırayla', () => {
    for (let n = 0; n < 3; n++) {
      assert.equal(moveArt({ a: 'rps', n }), RPS[n].id);
      assert.deepEqual(moveShuffle({ a: 'rps', n }), ['hamle-tas', 'hamle-kagit', 'hamle-makas', 'hamle-tas', 'hamle-kagit', 'hamle-makas']);
    }
    assert.deepEqual(moveShuffle({ a: 'kiss', d: 'l' }), []);
  });

  test('sonuç bir kez, atanın telefonunda çekilir ve mesajla gider: odadaki herkes aynı yüzü görür', () => {
    for (const x of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      for (const pick of ['hamle-zar', 'hamle-tkm']) {
        const mine = moveOfPick(pick, () => x)!;
        // The other phone gets the packet as it travels (room-bus wire format) and draws from it, without a new draw.
        const theirs = parseSignal(decodeSignal(encodeSignal({ t: 'act', ...mine })));
        assert.ok(theirs && theirs.t === 'act', pick);
        const { t: _t, ...move } = theirs;
        assert.equal(moveArt(move as Move), moveArt(mine), `${pick} ${x}`);
        assert.equal(moveLine('Ece', move as Move), moveLine('Ece', mine));
      }
    }
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
