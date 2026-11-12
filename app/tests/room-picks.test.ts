/// <reference types="node" />
// The leave sheet's "Şu an popüler" (lib/room-picks): the busiest rooms one can walk straight into.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Room } from '@/data/mock';
import { popularRooms } from '@/lib/room-picks';

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
