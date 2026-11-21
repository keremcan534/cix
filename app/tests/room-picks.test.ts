/// <reference types="node" />
// The leave sheet's "Şu an popüler" (lib/room-picks): the busiest rooms one can walk straight into.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Room } from '@/data/mock';
import { popularRooms, swipeRoom } from '@/lib/room-picks';

describe('Çıkışta popüler odalar', () => {
  const room = (id: string, listeners: number, extra: Partial<Room> = {}): Room => ({ id, title: id, category: 'Sohbet', cover: '', hostId: `h-${id}`, listeners, seatUserIds: [], tags: [], ...extra });
  const rooms = [
    room('a', 40),
    room('b', 500),
    room('here', 900),
    room('locked', 800, { password: '1234' }),
    room('mine', 700, { hostId: 'me' }),
    room('blocked', 600, { hostId: 'bad' }),
    room('c', 120),
    room('d', 120),
    room('e', 90),
  ];
  const pick = (needsPassword = (r: Room) => !!r.password) => popularRooms(rooms, { current: 'here', blocked: new Set(['bad']), needsPassword }).map((r) => r.id);

  test('en kalabalık dört oda; bulunduğum, kendi odam, şifresini bilmediğim ve engellediğimin odası yok', () => {
    assert.deepEqual(pick(), ['b', 'c', 'd', 'e']);
  });
  test('şifresini bildiğim oda önerilir; az oda varsa olan kadar', () => {
    assert.deepEqual(pick(() => false), ['locked', 'b', 'c', 'd']);
    assert.deepEqual(popularRooms([room('here', 3), room('x', 0)], { current: 'here', blocked: new Set(), needsPassword: () => false }).map((r) => r.id), ['x']);
  });
});

describe('Odalar arası kaydırma', () => {
  const room = (id: string, listeners: number, extra: Partial<Room> = {}): Room => ({ id, title: id, category: 'Sohbet', cover: '', hostId: `h-${id}`, listeners, seatUserIds: [], tags: [], ...extra });
  // Fullest first: here 900, locked 800, mine 700, blocked 600, b 500, c 120, d 120, a 40.
  const rooms = [room('a', 40), room('b', 500), room('here', 900), room('locked', 800, { password: '1' }), room('mine', 700, { hostId: 'me' }), room('blocked', 600, { hostId: 'bad' }), room('c', 120), room('d', 120)];
  const go = (current: string, dir: 1 | -1, list = rooms) => swipeRoom(list, { current, blocked: new Set(['bad']), needsPassword: (r) => !!r.password }, dir)?.id ?? null;

  test('yukarı kaydırma sıradaki girilebilir odaya, aşağı bir öncekine gider; şifreli, kendi ve engellediğimin odası atlanır', () => {
    assert.equal(go('here', 1), 'b');
    assert.equal(go('b', 1), 'c');
    assert.equal(go('c', 1), 'd');
    assert.equal(go('d', -1), 'c');
    assert.equal(go('b', -1), 'here');
  });
  test('listenin ucunda oda yok; kendi odamdan da geçilir; listede olmayan odadan baştan başlanır', () => {
    assert.equal(go('a', 1), null);
    assert.equal(go('here', -1), null);
    assert.equal(go('mine', 1), 'b');
    assert.equal(go('mine', -1), 'here');
    assert.equal(go('gone', 1), 'here');
    assert.equal(go('gone', -1), 'a');
    assert.equal(go('here', 1, [room('here', 5)]), null);
  });
});
