/// <reference types="node" />
// "%82 benzer": the score behind the app's name.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { Room, User } from '@/data/mock';
import { closestRooms } from '@/lib/closest';
import { similarity } from '@/lib/similarity';

const person = (over: Partial<User>): User => ({ id: 'x', name: 'X', age: 25, avatar: '', ...over }) as User;

describe('Benzerlik skoru', () => {
  test('ortak ilgi alanı, şehir ve yaş skoru artırır, nedenleri yazılır', () => {
    const me = person({ interests: ['Müzik', 'Kahve', 'Sohbet'], city: 'İzmir', age: 25 });
    const close = person({ interests: ['Müzik', 'Kahve', 'Dans'], city: 'İzmir', age: 27 });
    const far = person({ interests: ['Futbol'], city: 'Van', age: 40 });
    const a = similarity(me, close);
    const b = similarity(me, far);
    assert.ok(a.score > b.score);
    assert.deepEqual(a.shared, ['Müzik', 'Kahve']);
    assert.ok(a.reasons.some((r) => r.includes('İzmir')));
    assert.deepEqual(b.reasons, []);
  });

  test('skor 30 ile 98 arasında kalır; en iyi eşleşme 93', () => {
    const me = person({ interests: ['A', 'B'], city: 'Ankara', age: 30 });
    assert.equal(similarity(me, person({ interests: ['A', 'B'], city: 'Ankara', age: 30 })).score, 93);
    assert.ok(similarity(me, person({ interests: [], age: 60 })).score >= 30);
    // No interests on either side still gives a number, never NaN.
    assert.ok(Number.isFinite(similarity(person({}), person({})).score));
  });
});

describe('Sana en yakın oda', () => {
  const me = person({ id: 'me', interests: ['Müzik', 'Kahve'], city: 'İzmir', age: 25 });
  const hosts: Record<string, User> = {
    a: person({ id: 'a', name: 'Ada', interests: ['Müzik', 'Kahve'], city: 'İzmir', age: 26 }),
    b: person({ id: 'b', name: 'Bora', interests: ['Futbol'], city: 'Van', age: 45 }),
    c: person({ id: 'c', name: 'Cem', interests: ['Kahve'], city: 'Ankara', age: 30 }),
  };
  const room = (id: string, hostId: string, extra: Partial<Room> = {}): Room => ({ id, title: id, category: 'Sohbet', cover: '', hostId, listeners: 10, seatUserIds: [], tags: [], ...extra }) as Room;
  const hostOf = (id: string) => hosts[id] ?? person({ id });
  const ctx = { following: new Set<string>(), recent: [] as string[] };

  test('en çok ortak noktası olan ev sahibinin odası önde, gerekçesiyle', () => {
    const [first] = closestRooms(me, [room('r1', 'b', { listeners: 900 }), room('r2', 'a'), room('r3', 'c')], hostOf, ctx);
    assert.equal(first.room.id, 'r2');
    assert.equal(first.reason, '2 ortak ilgi: Müzik, Kahve');
    assert.equal(first.why, 'sparkles');
  });

  test('şifreli oda, kendi odan ve engellediğin ev sahibi çıkmaz', () => {
    const list = closestRooms(me, [room('r1', 'a', { password: '1234' }), room('r2', 'me'), room('r3', 'c'), room('r4', 'b')], hostOf, { ...ctx, blocked: new Set(['c']) });
    assert.deepEqual(list.map((m) => m.room.id), ['r4']);
  });

  test('takip ettiğin kişi yakın skorları öne geçirir', () => {
    const [first] = closestRooms(me, [room('r1', 'a'), room('r2', 'c')], hostOf, { ...ctx, following: new Set(['c']) });
    // Ada still matches far better (skor farkı > takip payı), so Cem doesn't jump her.
    assert.equal(first.room.id, 'r1');
    // Bora and X are both far from you; following X decides it.
    const near = closestRooms(me, [room('r1', 'b'), room('r2', 'x')], hostOf, { ...ctx, following: new Set(['x']) });
    assert.equal(near[0].room.id, 'r2');
    assert.equal(near[0].reason, 'Takip ettiğin X burada');
  });

  test('ortak ilgi yoksa şehir, o da yoksa kalabalık söylenir', () => {
    const sameCity = person({ id: 'd', name: 'Deniz', interests: ['Yüzme'], city: 'İzmir', age: 50 });
    const [m] = closestRooms(me, [room('r1', 'd')], () => sameCity, ctx);
    assert.equal(m.reason, 'İkiniz de İzmir’desiniz');
    const [n] = closestRooms(me, [room('r2', 'b', { listeners: 1250 })], hostOf, ctx);
    assert.equal(n.reason, 'Şu an 1.250 kişi sohbette');
  });
});
