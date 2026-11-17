/// <reference types="node" />
// Everyone's own number (lib/public-no, data/profile publicIdOf, data/catalog roomIdText; server/api/public-no.mjs):
// a profile shows the number the server gave the account and a room its owner's; with an older server, which sends
// none, the numbers made from the ids as before. GET /api/lookup's answer is read defensively: a malformed one is
// nobody, never a crash.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { roomCode, roomIdText } from '@/data/catalog';
import { displayId, publicIdOf } from '@/data/profile';
import { parseLookup, serverNo } from '@/lib/public-no';

const ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ROOM = 'cccccccc-0000-4000-8000-000000000003';

describe('Kimlik numarası', () => {
  test('sunucunun numarası yalnızca 12 hane', () => {
    assert.equal(serverNo('100000007919'), '100000007919');
    for (const v of [100000007919, '10000000791', '1000000079190', ' 100000007919', 'ID100000007919', '', null, undefined, {}])
      assert.equal(serverNo(v), null, String(v));
  });

  test('profil sunucunun verdiği numarayı gösterir; eski sunucuda id’den yapılanı', () => {
    assert.equal(publicIdOf({ publicNo: '100000007919' }, ID), '100000007919');
    assert.equal(publicIdOf({}, ID), displayId(ID));
    assert.equal(publicIdOf({ publicNo: null }, ID), displayId(ID));
    assert.equal(publicIdOf({ publicNo: 'bozuk' }, ID), displayId(ID));
    assert.equal(publicIdOf(null, null), null);
  });

  test('id’den yapılan numara sunucunun biçiminde (082 app_public_no ile aynı formül)', () => {
    const n = Number(displayId(ID));
    assert.ok(n >= 100_000_000_000 && n <= 107_999_999_999);
    assert.equal((n - 100_000_000_000) % 7919, 0);
  });

  test('oda ID’si sahibinin numarası; eski sunucuda odanın kendi kodu', () => {
    assert.equal(roomIdText({ id: ROOM, code: '100000007919' }), '100000007919');
    assert.equal(roomIdText({ id: ROOM }), roomCode(ROOM));
    assert.equal(roomIdText({ id: ROOM, code: '1234' }), roomCode(ROOM));
  });
});

describe('Numarayla arama cevabı', () => {
  test('kişi ve açık odası', () => {
    assert.deepEqual(
      parseLookup({ user: { id: ID, name: 'Zeynep', avatarUrl: 'https://cdn.test/a.jpg', publicNo: '100000007919' }, room: { id: ROOM, title: 'Sohbet', code: '100000007919' } }),
      { user: { id: ID, name: 'Zeynep', avatarUrl: 'https://cdn.test/a.jpg', publicNo: '100000007919' }, room: { id: ROOM, title: 'Sohbet', code: '100000007919' } },
    );
  });

  test('odası kapalıysa oda yok', () => {
    assert.equal(parseLookup({ user: { id: ID, name: 'Zeynep', avatarUrl: null, publicNo: '100000007919' }, room: null })?.room, null);
    assert.equal(parseLookup({ user: { id: ID, name: 'Zeynep' } })?.room, null);
  });

  test('bozuk cevap kimse değildir; eksik alanlar boş kalır, çökmez', () => {
    for (const raw of [null, undefined, 'x', 7, [], {}, { user: null }, { user: { name: 'Adsız' } }, { user: { id: '' } }, { user: { id: 5 } }])
      assert.equal(parseLookup(raw), null, JSON.stringify(raw));
    assert.deepEqual(parseLookup({ user: { id: ID, name: 7, avatarUrl: 3, publicNo: 100000007919 }, room: { title: 'Kimliksiz' } }), {
      user: { id: ID, name: 'Kullanıcı', avatarUrl: null, publicNo: null },
      room: null,
    });
    assert.deepEqual(parseLookup({ user: { id: ID, name: 'Zeynep' }, room: { id: ROOM, code: 'x' } })?.room, { id: ROOM, title: 'Oda', code: null });
  });
});
