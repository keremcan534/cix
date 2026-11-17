// Mic sizes on the room's stage (lib/seat-fit): every mic count gets the same face (as in other apps), smaller only
// when the row is narrow or the height the chat leaves can't hold it; nothing gets wider than its row.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_LAYOUTS } from '@/data/room-layouts';
import { MIC_COUNT_OPTIONS } from '@/data/catalog';
import { FACE_MAX, FACE_MIN, FACE_STD, PK_LINE, fitFace, fitGrid, fitLayout, gridCols, layoutHeight, layoutPlan, layoutSizes, nameLine, seatHeight } from '@/lib/seat-fit';

const PHONES = [360, 390, 412];

describe('Mikrofon sayısı değişince koltuklar aynı boyda kalır', () => {
  test('klasik düzen: her mikrofon sayısında aynı yüz, oda sahibi de; yalnız satırlar değişir', () => {
    for (const width of [390, 412])
      for (const mics of MIC_COUNT_OPTIONS)
        for (const boss of [false, true]) {
          const f = fitGrid(mics, width, 700, { boss });
          assert.equal(f.face, FACE_STD, `${width} px, ${mics} mikrofon`);
          assert.equal(f.host, f.face, 'oda sahibinin koltuğu da aynı boyda');
          assert.equal(f.cols, gridCols(mics));
        }
    // Past what the options offer the row's width sets the face, never the height the chat leaves.
    for (let mics = 1; mics <= 30; mics++) {
      const f = fitGrid(mics, 390, 2_000);
      assert.equal(f.face, Math.min(FACE_STD, Math.floor(374 / f.cols) - 14), `${mics} mikrofon`);
    }
  });

  test('simetrik: her seçenekte satırlar dolu (diğer uygulamalardaki gibi)', () => {
    // 5 in a row, 8 = 4 + 4, 10 = 5 + 5, 12 = 4 + 4 + 4, 15 = 5 + 5 + 5: no short row on one side.
    assert.deepEqual(MIC_COUNT_OPTIONS.map((n) => gridCols(n)), [5, 4, 5, 4, 5]);
    for (const n of MIC_COUNT_OPTIONS) assert.equal(n % gridCols(n), 0, `${n} mikrofon`);
    assert.deepEqual([2, 6, 9, 16, 18, 20, 24, 25, 30].map((n) => gridCols(n)), [2, 3, 3, 4, 6, 5, 6, 5, 6]);
  });

  test('seçilen düzen: yer yettiğinde yüz yüksekliğe göre değişmez', () => {
    for (const l of ROOM_LAYOUTS) {
      const plan = layoutPlan(l.layoutSchema, 390, false);
      const want = Math.min(FACE_STD, plan.maxFace);
      assert.equal(fitLayout(l.layoutSchema, plan, 900).face, want, l.id);
      assert.equal(fitLayout(l.layoutSchema, plan, 1400).face, want, l.id);
    }
  });
});

describe('Klasik mikrofon düzeni', () => {
  test('az mikrofon da çok mikrofon da aynı yüz; yer yetmezse küçülür ama sığar', () => {
    const few = fitGrid(2, 390, 300);
    assert.equal(few.face, FACE_STD, `2 mikrofon: ${few.face}`);
    assert.ok(few.height <= 300);
    // Every row also keeps its PK points line (15 px), so 20 mics need a little more than the 300 px they used to.
    const many = fitGrid(19, 390, 320);
    assert.ok(many.height <= 320, `20 mikrofon ${many.height} px`);
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

  test('Patron koltuğu yüksekliğe katılır; PK puan satırı her koltukta baştan ayrılmış', () => {
    const plain = fitGrid(8, 390, 1000);
    assert.ok(fitGrid(8, 390, 1000, { boss: true }).height >= plain.height - 60);
    // The points line is part of every seat, with or without a PK.
    assert.equal(seatHeight(48), 48 + 4 + nameLine(48) + PK_LINE);
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
    // Five rows, each with its PK points line (15 px): 75 px more than before, so the chat gives a little way.
    assert.ok(least <= 380, `${least} px`);
    assert.ok(fitLayout(l.layoutSchema, plan, 420).face > FACE_MIN);
  });

  test('az mikrofonlu düzende yüzler büyür, oda sahibi tek başına satırdaysa daha büyük', () => {
    const l = ROOM_LAYOUTS.find((x) => x.id === 'audio-6')!;
    const plan = layoutPlan(l.layoutSchema, 390, false);
    const f = fitLayout(l.layoutSchema, plan, 400);
    assert.equal(f.face, Math.min(FACE_STD, plan.maxFace), 'her düzende aynı yüz');
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

describe('PK başlayınca sahne aynı kalır (güncelleme 6)', () => {
  test('her düzende ve her mikrofon sayısında: PK açılınca yüz, sütun, yuva ve yükseklik değişmez', () => {
    // A PK is not an input of the fit any more: the same call gives the same stage. The Seat always draws the points
    // line (components/room/parts pkLine), so what the owner saw — gaps opening between the seats in the top and bottom
    // rows when a PK started — can't happen.
    for (const width of PHONES)
      for (let guests = 0; guests <= 29; guests++)
        for (const height of [220, 300, 420]) {
          const a = fitGrid(guests, width, height, { boss: guests % 2 === 0 });
          const b = fitGrid(guests, width, height, { boss: guests % 2 === 0 }, a);
          assert.deepEqual(b, a, `${width} px, ${guests} konuk, ${height} px`);
        }
  });
  test('bir pano gelince (odalar arası PK tablosu) yüz önceki boyu geçmez, sütunlar aynı kalır', () => {
    const before = fitGrid(6, 360, 290, { boss: true });
    const tight = fitGrid(6, 360, 230, { boss: true }, before);
    assert.equal(tight.cols, before.cols);
    assert.ok(tight.face <= before.face && tight.face >= FACE_MIN);
    assert.equal(fitGrid(6, 360, 5_000, { boss: true }, before).face, before.face, 'fazla yer yüzü büyütmez');
  });
  test('seçilen düzen: yüz pano öncesini geçmez', () => {
    const s = ROOM_LAYOUTS[0].layoutSchema;
    const plan = layoutPlan(s, 360, false);
    const before = fitLayout(s, plan, 260);
    assert.equal(fitLayout(s, plan, 5_000, {}, before).face, before.face);
  });
});
