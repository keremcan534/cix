// Gifts during a call (lib/call-gifts): the beat's summary as the call's screen reads it, an older server's answer
// and malformed ones included.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { callGifts } from '@/lib/call-gifts';

const NONE = { received: 0, sent: 0, last: null };

describe('Aramada hediye', () => {
  test('sunucunun özeti olduğu gibi okunur', () => {
    const gifts = { received: 400, sent: 200, last: { id: 9, fromMe: false, giftId: 'g4', count: 2, total: 400 } };
    assert.deepEqual(callGifts({ gifts }), gifts);
  });

  test('eski sunucu, çalan arama ve bozuk yanıtlar hediyesiz sayılır', () => {
    for (const c of [null, {}, { gifts: null }, { gifts: 'x' }, { gifts: [] }, { gifts: { received: -5, sent: '3', last: 7 } }]) assert.deepEqual(callGifts(c), NONE, JSON.stringify(c));
  });

  test('son hediyenin eksik alanları güvenli değere döner', () => {
    assert.deepEqual(callGifts({ gifts: { received: 10.7, last: { id: 3, giftId: 'g1', count: 0, total: 'çok' } } }), {
      received: 10,
      sent: 0,
      last: { id: 3, fromMe: false, giftId: 'g1', count: 1, total: 0 },
    });
    assert.equal(callGifts({ gifts: { last: { id: '3', giftId: 'g1' } } }).last, null, 'kimliği sayı olmayan hediye yok sayılır');
  });
});
