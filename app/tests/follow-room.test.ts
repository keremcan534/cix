/// <reference types="node" />
// "Şu an odada" and "takip ederek geldi" (lib/follow-room, Güncelleme 7 item 15): the profile's room parsed
// defensively, the follow line in Turkish with the name's suffix, the voice token's `via` taken once per visit, and
// the line only while the followed person is still in the room.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { accusative, followLine, followedHere, parseHereRoom, parseVia, takeVia, wantVia } from '@/lib/follow-room';

const ROOM = '11111111-2222-4333-8444-555555555555';
const A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const B = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const ME = 'aaaaaaaa-0000-4000-8000-0000000000ee';

describe('Profildeki oda', () => {
  test('sunucunun odası okunur; bozuk ya da eski sunucunun cevabı oda değil', () => {
    assert.deepEqual(parseHereRoom({ id: ROOM, title: ' Gece Sohbeti ', locked: true }), { id: ROOM, title: 'Gece Sohbeti', locked: true });
    assert.deepEqual(parseHereRoom({ id: ROOM, title: '', locked: 'evet' }), { id: ROOM, title: 'Oda', locked: false });
    for (const bad of [undefined, null, 'oda', 42, [], {}, { id: 'r1', title: 'Demo' }, { id: 7, title: 'x' }]) assert.equal(parseHereRoom(bad), null, JSON.stringify(bad));
    assert.equal(parseHereRoom({ id: ROOM, title: 'x'.repeat(200) })?.title.length, 80);
  });

  test('via yalnız bir hesap kimliği', () => {
    assert.equal(parseVia(A), A);
    for (const bad of [undefined, '', 'me', 'u1', 12, `${A} `]) assert.equal(parseVia(bad), undefined);
  });
});

describe('Takip ederek geldi', () => {
  test('ismin eki ünlü uyumuyla', () => {
    assert.equal(accusative('Artemis'), 'Artemis’i');
    assert.equal(accusative('Kaan'), 'Kaan’ı');
    assert.equal(accusative('Ayşe'), 'Ayşe’yi');
    assert.equal(accusative('Okan'), 'Okan’ı');
    assert.equal(accusative('Uğur'), 'Uğur’u');
    assert.equal(accusative('Göktürk'), 'Göktürk’ü');
    assert.equal(accusative('Ali'), 'Ali’yi');
    assert.equal(accusative('Hülya'), 'Hülya’yı');
    assert.equal(accusative('BURAK'), 'BURAK’ı');
    assert.equal(accusative('Deniz Su'), 'Deniz Su’yu');
    assert.equal(accusative('Selin 🌸'), null, 'harfle bitmeyen ad');
    assert.equal(accusative('Xyz'), null, 'ünlüsüz');
    assert.equal(accusative(''), null);
  });

  test('satır: "Kaan, Artemis’i takip ederek geldi"; eki olmayan adda "kişisini"', () => {
    assert.equal(followLine('Kaan', 'Artemis'), 'Kaan, Artemis’i takip ederek geldi');
    assert.equal(followLine('Kaan', 'Selin 🌸'), 'Kaan, Selin 🌸 kişisini takip ederek geldi');
    assert.equal(followLine('Kaan', '  '), 'Kaan, birini takip ederek geldi');
  });

  test('ses anahtarı takip edileni bir kez alır; eskisi ve başka oda almaz', () => {
    const t0 = 1_000_000;
    wantVia(ROOM, A, t0);
    assert.equal(takeVia(ROOM, t0 + 1_000), A);
    assert.equal(takeVia(ROOM, t0 + 2_000), null, 'yeniden bağlanma yeni giriş değil');
    wantVia(ROOM, A, t0);
    assert.equal(takeVia('başka', t0), null);
    assert.equal(takeVia(ROOM, t0 + 3 * 60_000), null, 'iki dakikadan eski istek');
    wantVia(ROOM, A, t0);
    wantVia(ROOM, undefined, t0);
    assert.equal(takeVia(ROOM, t0), null, 'takipsiz açılış eskisini unutur');
    wantVia(ROOM, 'u1', t0);
    assert.equal(takeVia(ROOM, t0), null, 'demo kimliği gitmez');
  });

  test('satır yalnız takip edilen hâlâ odadayken (ben de sayılırım)', () => {
    const peers = [
      { identity: A, via: B },
      { identity: B },
    ];
    assert.equal(followedHere(peers, A, ME), B);
    assert.equal(followedHere([{ identity: A, via: B }], A, ME), null, 'takip edilen çıktı');
    assert.equal(followedHere([{ identity: A, via: ME }], A, ME), ME, 'beni takip ederek geldi');
    assert.equal(followedHere([{ identity: A }, { identity: B }], A, ME), null, 'eski uygulama: via yok');
    assert.equal(followedHere([{ identity: A, via: A }], A, ME), null);
    assert.equal(followedHere(peers, 'yok', ME), null);
  });
});
