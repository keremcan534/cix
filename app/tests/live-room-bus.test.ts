/// <reference types="node" />
// Live room bus (lib/live/room-bus): the signals the phones send each other in a server room, and the mic
// attribute. Wire format must survive Turkish letters and emoji; anything malformed from another phone is dropped.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeSignal, encodeSignal, onSignal, parseSeat, parseSignal, reportPeers, reportSignal, type RoomSignal } from '@/lib/live/room-bus';

test('sinyal: Türkçe harf ve emoji bozulmadan gider gelir', () => {
  const msg: RoomSignal = { t: 'chat', text: 'Çağrı şöyle dedi: ğüşiöç İĞÜŞÖÇ 🌹🎉' };
  const bytes = encodeSignal(msg);
  assert.deepEqual(decodeSignal(bytes), msg);
  // Same bytes as the platform's own UTF-8 encoder.
  assert.deepEqual([...bytes], [...new TextEncoder().encode(JSON.stringify(msg))]);
});

test('sinyal: bozuk veya eksik olan atılır, uzun yazı kısaltılır', () => {
  assert.equal(parseSignal(null), null);
  assert.equal(parseSignal({ t: 'chat', text: '   ' }), null);
  assert.equal(parseSignal({ t: 'gift', giftId: 'g1', count: 0, to: ['a'] }), null);
  assert.equal(parseSignal({ t: 'gift', giftId: 'g1', count: 1.5, to: ['a'] }), null);
  assert.equal(parseSignal({ t: 'gift', giftId: 'g1', count: 1, to: [] }), null);
  assert.equal(parseSignal({ t: 'para', amount: 1000 }), null);
  assert.equal(decodeSignal(new Uint8Array([123, 34])), null);
  const long = parseSignal({ t: 'chat', text: 'a'.repeat(1000) });
  assert.equal(long?.t === 'chat' && long.text.length, 300);
  assert.deepEqual(parseSignal({ t: 'gift', giftId: 'g1', count: 5, to: ['x', 7, 'y'] }), { t: 'gift', giftId: 'g1', count: 5, to: ['x', 'y'] });
});

test('koltuk özelliği: yalnızca sayı bir mikrofondur', () => {
  assert.equal(parseSeat('0'), 0);
  assert.equal(parseSeat('8'), 8);
  assert.equal(parseSeat(''), null);
  assert.equal(parseSeat(undefined), null);
  assert.equal(parseSeat('-1'), null);
  assert.equal(parseSeat('abc'), null);
});

test('sinyaller yalnızca kendi odasının dinleyicisine gider', () => {
  const got: string[] = [];
  const off = onSignal('oda-a', (from, msg) => got.push(`${from}:${msg.t}`));
  reportSignal('oda-a', 'u1', { t: 'chat', text: 'selam' });
  reportSignal('oda-b', 'u2', { t: 'chat', text: 'başka oda' });
  reportSignal('oda-a', 'u3', { t: 'bozuk' });
  off();
  reportSignal('oda-a', 'u4', { t: 'chat', text: 'kapandıktan sonra' });
  assert.deepEqual(got, ['u1:chat']);
  reportPeers(null, []);
});
