/// <reference types="node" />
// Gifts sent from a chat (Güncelleme 7, item 16; lib/dm-gift-fx, lib/dm-thread): the server's `gift` on a line is the
// only thing that draws a gift's card and plays its animation, a malformed one falls back to a plain line, and on the
// receiving phone each gift plays once: the newest on opening the chat, then each new one.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFT_FX_FRESH_MS, giftFxToPlay, giftNameOfText, parseDmGift, type FxLine } from '@/lib/dm-gift-fx';
import { mergeThread, type ChatMessage, type ServerDm } from '@/lib/dm-thread';

const PEER = 'p1';
const NOW = Date.parse('2026-11-19T12:00:00.000Z');
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const line = (sid: number, extra: Partial<FxLine> = {}): FxLine => ({ fromMe: false, sid, at: at(60_000), gift: { id: 'g4', count: 1 }, ...extra });

describe('Sohbet hediyesi alanı (parseDmGift)', () => {
  test('sunucunun alanı okunur; bozuk olan düz mesaja düşer', () => {
    assert.deepEqual(parseDmGift({ id: 'g4', count: 5 }), { id: 'g4', count: 5 });
    assert.deepEqual(parseDmGift({ id: 'c13', count: 'x' }), { id: 'c13', count: 1 }, 'adet bozuksa 1');
    assert.deepEqual(parseDmGift({ id: 'a1', count: 0 }), { id: 'a1', count: 1 });
    for (const bad of [null, undefined, 'g4', 42, [], {}, { id: '' }, { id: 'g 4' }, { id: 'x'.repeat(65) }, { id: 7, count: 1 }]) assert.equal(parseDmGift(bad), null, JSON.stringify(bad));
  });

  test('eşitlemede yalnız sunucunun alanı hediye kartı yapar; yazıyla taklit düz mesaj kalır', () => {
    const dm = (id: number, from: string, text: string, extra: Partial<ServerDm> = {}): ServerDm => ({ id, from, to: from === PEER ? 'me1' : PEER, text, createdAt: at(1000), ...extra });
    const r = mergeThread([], [dm(1, PEER, 'Hediye gönderdi: Kahve ×5', { gift: { id: 'g4', count: 5 } }), dm(2, PEER, 'Hediye gönderdi: Aslan'), dm(3, PEER, 'Selam', { gift: 'bozuk' })], { peer: PEER, after: 0 });
    assert.deepEqual(r.messages.map((m) => m.gift), [{ id: 'g4', count: 5 }, undefined, undefined]);
  });

  test('benim hediye satırım, aynı yazılı bekleyen mesajımın yerini almaz', () => {
    const local: ChatMessage[] = [{ id: 'l1', fromMe: true, text: 'Hediye gönderdi: Kahve', time: '10:00', ref: 'r1' }];
    const r = mergeThread(local, [{ id: 9, from: 'me1', to: PEER, text: 'Hediye gönderdi: Kahve', createdAt: at(1000), gift: { id: 'g4', count: 1 } }], { peer: PEER, after: 0 });
    assert.deepEqual(r.messages.map((m) => [m.id, m.sid, m.gift?.id]), [
      ['l1', undefined, undefined],
      ['s9', 9, 'g4'],
    ]);
  });

  test('kart adı: katalog bilmiyorsa yazıdan', () => {
    assert.equal(giftNameOfText('Hediye gönderdi: Aşk Ateşi ×10'), 'Aşk Ateşi');
    assert.equal(giftNameOfText('Hediye gönderdi: Kahve'), 'Kahve');
    assert.equal(giftNameOfText('garip'), 'Hediye');
  });
});

describe('Alıcıda bir kez oynatma (giftFxToPlay)', () => {
  test('sohbet açılınca yalnız en yeni oynatılmamış hediye; hepsi oynatılmış sayılır', () => {
    const r = giftFxToPlay([line(3), line(5), line(4)], 0, true, NOW);
    assert.deepEqual(r.play.map((m) => m.sid), [5]);
    assert.equal(r.played, 5);
    // Opened again: nothing plays twice.
    assert.deepEqual(giftFxToPlay([line(3), line(5), line(4)], r.played, true, NOW).play, []);
  });

  test('sohbet açıkken gelen her yeni hediye sırayla oynar', () => {
    const r = giftFxToPlay([line(5), line(7), line(6)], 5, false, NOW);
    assert.deepEqual(r.play.map((m) => m.sid), [6, 7]);
    assert.equal(r.played, 7);
  });

  test('benim hediyelerim, hediyesiz satırlar ve kimliksiz satırlar oynamaz', () => {
    const r = giftFxToPlay([line(8, { fromMe: true }), line(9, { gift: undefined }), line(0, { sid: undefined }), { fromMe: false, text: 'Hediye gönderdi: Aslan' } as FxLine], 0, false, NOW);
    assert.deepEqual(r.play, []);
    assert.equal(r.played, 0);
  });

  test('eski hediye açılışta oynamaz ama oynatılmış sayılır', () => {
    const r = giftFxToPlay([line(2, { at: at(GIFT_FX_FRESH_MS + 1000) })], 0, true, NOW);
    assert.deepEqual(r.play, []);
    assert.equal(r.played, 2);
    assert.deepEqual(giftFxToPlay([line(2, { at: 'bozuk' })], 0, false, NOW).play, [], 'zamanı okunamayan oynamaz');
  });
});
