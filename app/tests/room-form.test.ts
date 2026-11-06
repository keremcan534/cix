/// <reference types="node" />
// Opening and joining a room in a live build (odalar-2, odalar-7, odalar-8): the "Oda oluştur" form's limits, the
// password I typed for a room (kept only in memory) and the home screen never leading with an empty room.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Room, User } from '@/data/mock';
import { closestRooms } from '@/lib/closest';
import { ROOM_FORM, roomFormError } from '@/lib/live/room-form';
import { forgetRoomPassword, forgetRoomPasswords, roomPassword, setRoomPassword } from '@/lib/live/room-password';

describe('Oda oluşturma formu', () => {
  test('ad zorunlu, şifre boş ya da 4–32 karakter (boşluklar sayılmaz)', () => {
    assert.equal(roomFormError('   ', ''), 'Odana bir ad ver.');
    assert.equal(roomFormError('Gece', ''), null);
    assert.equal(roomFormError('Gece', '   '), null);
    assert.equal(roomFormError('Gece', 'abc'), 'Şifre 4–32 karakter olmalı.');
    assert.equal(roomFormError('Gece', ' abcd '), null);
    assert.equal(roomFormError('Gece', 'x'.repeat(ROOM_FORM.passwordMax + 1)), 'Şifre 4–32 karakter olmalı.');
  });
});

describe('Oda şifresi', () => {
  test('oda başına tutulur, tek tek ya da hepsi birden unutulur', () => {
    setRoomPassword('a', '1234');
    setRoomPassword('b', '5678');
    assert.equal(roomPassword('a'), '1234');
    forgetRoomPassword('a');
    assert.equal(roomPassword('a'), undefined);
    assert.equal(roomPassword('b'), '5678');
    forgetRoomPasswords();
    assert.equal(roomPassword('b'), undefined);
  });
});

describe('Sana en yakın oda: boş oda', () => {
  const person = (over: Partial<User>): User => ({ id: 'x', name: 'X', age: 25, avatar: '', ...over }) as User;
  const room = (id: string, listeners: number): Room => ({ id, title: id, category: 'Sohbet', cover: '', hostId: 'h', listeners, seatUserIds: [], tags: [] }) as Room;
  test('içinde kimse olmayan oda önerilmez', () => {
    const list = closestRooms(person({ id: 'me' }), [room('bos', 0), room('dolu', 3)], () => person({ id: 'h' }), { following: new Set(), recent: [] });
    assert.deepEqual(
      list.map((m) => m.room.id),
      ['dolu'],
    );
  });
});
