// Mic sizes on the room's stage (lib/seat-fit): the stage never scrolls, so its seats fit the height the chat
// leaves them; few mics get big faces, many get small ones and still fit; nothing gets wider than its row.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_LAYOUTS } from '@/data/room-layouts';
import { FACE_MAX, FACE_MIN, fitFace, fitGrid, fitLayout, layoutHeight, layoutPlan, layoutSizes, seatHeight } from '@/lib/seat-fit';

const PHONES = [360, 390, 412];

describe('Klasik mikrofon düzeni', () => {
  test('az mikrofon: büyük yüzler; çok mikrofon: küçük ama sığar', () => {
    const few = fitGrid(2, 390, 300);
    assert.ok(few.face >= 80, `2 konuk: ${few.face}`);
    assert.ok(few.host > few.face, 'oda sahibi biraz daha büyük');
    assert.ok(few.height <= 300);
    const many = fitGrid(19, 390, 300);
    assert.ok(many.height <= 300, `20 mikrofon ${many.height} px`);
    assert.ok(many.face < few.face && many.face >= FACE_MIN);
  });

  test('yer büyüdükçe yüz küçülmez; verilen yükseklik aşılmaz (en küçükler bile sığmıyorsa hariç)', () => {
    for (const width of PHONES) {
      for (let guests = 0; guests <= 29; guests++) {
        let last = 0;
        for (let height = 120; height <= 700; height += 7) {
          const f = fitGrid(guests, width, height);
          assert.ok(f.face >= last, `${width} px, ${guests} konuk, ${height} px: ${f.face} < ${last}`);
          last = f.face;
          if (f.face > FACE_MIN) assert.ok(f.height <= height, `${guests} konuk ${height} px: ${f.height}`);
          assert.ok(f.face <= FACE_MAX && f.face <= f.slot - 14, 'yüz yuvasına sığar');
          assert.ok(f.cols * f.slot <= Math.min(width, 640) - 16, 'satır ekrana sığar');
        }
      }
    }
  });

  test('hiçbiri sığmıyorsa en kısası seçilir (en çok sütun)', () => {
    const f = fitGrid(29, 390, 0);
    assert.equal(f.face, FACE_MIN);
    for (let cols = 3; cols < f.cols; cols++) assert.ok(Math.ceil(29 / cols) >= Math.ceil(29 / f.cols));
  });

  test('Dümen koltuğu ve PK puanı yüksekliğe katılır', () => {
    const plain = fitGrid(8, 390, 1000);
    assert.ok(fitGrid(8, 390, 1000, { boss: true }).height >= plain.height - 60);
    assert.ok(fitGrid(8, 390, 1000, { pk: true }).height > plain.height);
    const tight = fitGrid(8, 390, plain.height);
    assert.ok(fitGrid(8, 390, plain.height, { pk: true }).face <= tight.face, 'PK sürerken yüzler küçülür, taşmaz');
  });
});

describe('Seçilen sahne düzeni', () => {
  test('her düzen, her telefonda: genişliğe ve yüksekliğe sığar, yer büyüdükçe yüz küçülmez', () => {
    for (const l of ROOM_LAYOUTS) {
      for (const width of PHONES) {
        for (const pkRoom of [false, true]) {
          const plan = layoutPlan(l.layoutSchema, width, pkRoom);
          assert.ok(plan.maxFace >= FACE_MIN, `${l.id}: ${plan.maxFace}`);
          let last = 0;
          for (let height = 150; height <= 800; height += 11) {
            const f = fitLayout(l.layoutSchema, plan, height);
            assert.ok(f.face >= last, `${l.id} ${width} px ${height} px`);
            last = f.face;
            assert.ok(f.face <= plan.maxFace);
            if (f.face > FACE_MIN) assert.ok(f.height <= height, `${l.id} ${height}: ${f.height}`);
          }
        }
      }
    }
  });

  test('30 mikrofon en küçük yüzlerle telefonun sahnesine sığar', () => {
    const l = ROOM_LAYOUTS.find((x) => x.id === 'audio-30')!;
    const plan = layoutPlan(l.layoutSchema, 390, false);
    const least = layoutHeight(l.layoutSchema, plan, FACE_MIN);
    assert.ok(least <= 310, `${least} px`);
    // A typical stage height: the 30 mics fit it with faces a little above the smallest.
    assert.ok(fitLayout(l.layoutSchema, plan, 360).face > FACE_MIN);
  });

  test('az mikrofonlu düzende yüzler büyür, oda sahibi tek başına satırdaysa daha büyük', () => {
    const l = ROOM_LAYOUTS.find((x) => x.id === 'audio-6')!;
    const plan = layoutPlan(l.layoutSchema, 390, false);
    const f = fitLayout(l.layoutSchema, plan, 400);
    assert.equal(f.face, plan.maxFace, 'genişliğin izin verdiği en büyük yüz');
    assert.ok(f.face > 48, `${f.face}`);
    assert.ok(layoutSizes(plan, f.face).host.size > f.face);
  });

  test('PK odasında takım bantları yükseklik ister', () => {
    const l = ROOM_LAYOUTS.find((x) => x.id === 'audio-12-team')!;
    const plain = layoutHeight(l.layoutSchema, layoutPlan(l.layoutSchema, 390, false), 40);
    assert.ok(layoutHeight(l.layoutSchema, layoutPlan(l.layoutSchema, 390, true), 40) > plain);
  });
});

describe('fitFace', () => {
  test('sığan en büyük yüz; hiçbiri sığmazsa en küçük', () => {
    const at = (f: number) => 3 * seatHeight(f) + 20;
    const f = fitFace(at, 250, FACE_MAX);
    assert.ok(at(f) <= 250 && at(f + 1) > 250);
    assert.equal(fitFace(at, 10, FACE_MAX), FACE_MIN);
    assert.equal(fitFace(at, 10_000, 64), 64);
  });
});
