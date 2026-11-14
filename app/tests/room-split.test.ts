// The room in two parts (lib/room-split): the top (header, mics, Balkon bar) never moves or changes size for the
// keyboard, a note or the chat; the bottom (chat, notes, controls) takes what is left, and a sheet over the room rises
// at most to the Balkon line. Numbers from a 1080×2340 phone (411×891 dp, 3-button navigation, Samsung keyboard).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CHAT_LEAST, STAGE_PAD, fitMics, sheetMax, sheetSpace, stageHeight, steadyBox, steadyNext } from '@/lib/room-split';
import { fitGrid, type Fitted } from '@/lib/seat-fit';

const PHONE = { width: 411, screen: 891, status: 40, nav: 48, header: 49, controls: 60, bar: 38, keyboard: 285 };
const roomH = PHONE.screen - PHONE.status - PHONE.nav;
const basis = Math.round(0.36 * PHONE.screen);
const grid = (guests: number, o = {}) => (h: number, like?: Fitted) => fitGrid(guests, PHONE.width, h, o, like);

describe('Oda iki parça: üst kısım yerinden oynamaz', () => {
  test('klavye açıkken ölçülen kısa oda alınmaz; klavye yokken ya da oda büyüyünce alınır', () => {
    assert.equal(steadyNext(803, 518, true), 803);
    assert.equal(steadyNext(803, 900, true), 900);
    assert.equal(steadyNext(803, 760, false), 760);
    assert.equal(steadyNext(0, 803, false), 803);
  });

  test('mikrofonların payı: oda eksi başlık ve alttaki düğmeler; hepsi ölçülene kadar 0', () => {
    assert.equal(steadyBox(0, 49, 60), 0);
    assert.equal(steadyBox(803, 0, 60), 0);
    assert.equal(steadyBox(803, 49, 0), 0);
    assert.equal(steadyBox(803, 49, 60), 694);
  });

  test('mikrofon boyları klavyeye, emoji paneline, sohbetin altındaki notlara bakmaz: yalnız odanın sabit payına', () => {
    const box = steadyBox(roomH, PHONE.header, PHONE.controls);
    const a = fitMics(grid(14), null, box, PHONE.bar, basis, 0);
    // The same room with the keyboard up, the emoji panel open or a mute note over the controls: the same box.
    const b = fitMics(grid(14), null, steadyBox(steadyNext(roomH, roomH - PHONE.keyboard, true), PHONE.header, PHONE.controls), PHONE.bar, basis, 0);
    assert.deepEqual(b, a);
    assert.ok(a.height <= box - PHONE.bar - basis - STAGE_PAD, `${a.height}`);
  });

  test('yazarken: koltuklar ve Balkon yerinde, Balkon ile yazı alanı arasında son mesaj satırları görünür', () => {
    const box = steadyBox(roomH, PHONE.header, PHONE.controls);
    const mics = fitMics(grid(14), null, box, PHONE.bar, basis, 0);
    const stage = stageHeight(mics.height + STAGE_PAD, box, PHONE.bar);
    // The room over the keyboard: the header, the stage and the Balkon bar as they were, the field over the keyboard
    // (its row 8 dp lower while typing). Two short lines (17 dp each, 2 dp apart, 2 dp padding) fit.
    const chatWhileTyping = roomH - PHONE.keyboard - PHONE.header - stage - PHONE.bar - (PHONE.controls - 8);
    assert.ok(chatWhileTyping >= 2 * 17 + 2 + 4, `yazarken sohbete ${chatWhileTyping} dp kalıyor`);
    // Without the keyboard the chat has at least the height the person chose.
    assert.ok(box - stage - PHONE.bar >= basis, `${box - stage - PHONE.bar}`);
  });

  test('bir pano (müzik, anket) gelince mikrofonlar küçülmez, yer sohbetten alınır; sohbet en aza inince küçülür', () => {
    const box = steadyBox(roomH, PHONE.header, PHONE.controls);
    const calm = fitMics(grid(14), null, box, PHONE.bar, basis, 0);
    const music = fitMics(grid(14), null, box, PHONE.bar, basis, 52);
    assert.equal(music.face, calm.face);
    assert.equal(music.cols, calm.cols);
    // Boards taller than the chat can give (its basis down to its least): the faces get smaller, the chat keeps its least.
    const boards = basis - CHAT_LEAST + 75;
    const huge = fitMics(grid(14), null, box, PHONE.bar, basis, boards);
    assert.ok(huge.face < calm.face, `${huge.face} < ${calm.face}`);
    const stage = stageHeight(boards + huge.height + STAGE_PAD, box, PHONE.bar);
    assert.ok(box - stage - PHONE.bar >= CHAT_LEAST, `sohbete ${box - stage - PHONE.bar} dp`);
  });

  test('PK: yüzler PK yokkenki boyda kalır, puanlar sohbetten yer alır', () => {
    const box = steadyBox(roomH, PHONE.header, PHONE.controls);
    const before = fitMics(grid(14), null, box, PHONE.bar, basis, 0);
    const during = fitMics(grid(14, { pk: true }), grid(14), box, PHONE.bar, basis, 0);
    assert.equal(during.face, before.face);
    assert.ok(during.height > before.height, 'puanlar sahneyi uzatır');
  });

  test('sahne: tuttuğu kadar, sohbete en azını bırakarak; takım PK alanı sohbetin seçtiği boya dokunmaz', () => {
    assert.equal(stageHeight(300, 694, 38), 300);
    assert.equal(stageHeight(900, 694, 38), 694 - 38 - CHAT_LEAST);
    assert.equal(stageHeight(500, 694, 38, 321), 694 - 38 - 321);
    assert.equal(stageHeight(500, 400, 38, 321, 120), 120);
    assert.equal(stageHeight(90, 400, 38, 321, 120), 90);
  });
});

describe('Alttan açılan pencereler Balkon çizgisine kadar', () => {
  test('pencerenin yeri: ekranın altından Balkon çizgisine', () => {
    const line = 345 + PHONE.bar;
    assert.equal(sheetSpace(roomH, PHONE.nav, PHONE.header, line), roomH + PHONE.nav - PHONE.header - line);
    assert.equal(sheetSpace(roomH, PHONE.nav, PHONE.header, line), 419);
    assert.equal(sheetSpace(0, PHONE.nav, PHONE.header, line), null);
    assert.equal(sheetSpace(roomH, PHONE.nav, PHONE.header, 0), null);
  });

  test('odada en fazla Balkon çizgisine kadar; oda dışında kendi payı', () => {
    assert.equal(sheetMax(0.82, PHONE.screen, null), '82%');
    assert.equal(sheetMax(0.82, PHONE.screen, 419), 419);
    assert.equal(sheetMax(0.3, PHONE.screen, 419), Math.round(0.3 * PHONE.screen));
  });
});
