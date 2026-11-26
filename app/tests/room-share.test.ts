/// <reference types="node" />
// Odayı paylaş › Aileye / Ajansta paylaş: the message is the invite line with the room's ID (lib/room-social
// roomShareText), and the family and agency chats find that ID in it for "Odaya git"; any other text has none.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { roomShareText, sharedRoomCode, sharedRoomInvite } from '@/lib/room-social';

describe('Odayı paylaş', () => {
  test('paylaşılan odanın ID’si mesajdan okunur', () => {
    const text = roomShareText('Keyfe keder', '101532746207');
    assert.equal(sharedRoomCode(text), '101532746207');
  });
  test('başka mesajda oda yok', () => {
    assert.equal(sharedRoomCode('Merhaba, akşam odada mısın?'), null);
    assert.equal(sharedRoomCode('Oda ID: 12345'), null, 'kısa sayı');
    assert.equal(sharedRoomCode('Oda ID: 1015327462071'), null, '13 hane');
    assert.equal(sharedRoomCode('ID: 101532746207'), null, 'yalnız ID');
  });
  test('sohbette davet kartı: satır numarasız, oda adı okunur', () => {
    const inv = sharedRoomInvite(roomShareText('Keyfe keder', '106259304304'));
    assert.deepEqual(inv, { code: '106259304304', line: 'Seni "Keyfe keder" odasına davet ediyorum!'.replace(/^/, '🎙️ '), title: 'Keyfe keder' });
    assert.equal(sharedRoomInvite('Merhaba'), null);
  });
});
