/// <reference types="node" />
// Mic queue ("Mikrofon kuyruğu"), the speak request list kept to the Balkon, and the managers' once-a-day
// room invite to every follower of the room's account.
import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FOLLOWER_INVITE_COOLDOWN_MS,
  balconyOnly,
  canInviteFollowers,
  defaultMicQueue,
  followerInviteLeft,
  formatWait,
  knownFollowers,
  seatAccess,
} from '@/lib/room-invites';
import { deriveView, getRoom, join, leave, leaveSeat, resetPresence, seedRoom, setBoss, takeSeat } from '@/lib/room-presence';

const R = 'room-invites-test';
const view = () => deriveView(getRoom(R)!);
const HOUR = 60 * 60 * 1000;

describe('Mikrofon kuyruğu', () => {
  test('kapalı: herkes boş mikrofona onaysız çıkar', () => {
    assert.equal(seatAccess(false, 'member'), 'direct');
    assert.equal(seatAccess(false, 'admin'), 'direct');
    assert.equal(seatAccess(false, 'owner'), 'direct');
  });
  test('açık: üye istek gönderir ve onay bekler; sahip ve yönetici doğrudan oturur', () => {
    assert.equal(seatAccess(true, 'member'), 'request');
    assert.equal(seatAccess(true, 'admin'), 'direct');
    assert.equal(seatAccess(true, 'owner'), 'direct');
  });
  test('ayarlanmamış odalar: yalnızca "Serbest sohbet" kuyruksuz', () => {
    assert.equal(defaultMicQueue('free'), false);
    assert.equal(defaultMicQueue(undefined), false);
    assert.equal(defaultMicQueue('stage'), true);
    assert.equal(defaultMicQueue('music'), true);
  });
});

describe('Balkon ve konuşma istekleri', () => {
  beforeEach(() => {
    resetPresence();
    seedRoom(R, { ownerId: 'host', adminIds: ['adm'], seats: ['host', 'a', null, null], capacity: 4, total: 6, regulars: ['b', 'c', 'd', 'adm'] });
  });

  test('mikrofondakiler (numaralı veya patron koltuğu) Balkon’da görünmez', () => {
    assert.deepEqual(view().balconyIds.slice(0, 4), ['b', 'c', 'd', 'adm']);
    assert.ok(takeSeat(R, 'b', 2).ok);
    setBoss(R, 'c');
    const v = view();
    for (const uid of ['host', 'a', 'b', 'c']) assert.ok(!v.balconyIds.includes(uid), `${uid} is on a mic`);
    assert.ok(v.micIds.includes('b') && v.micIds.includes('c'));
    assert.equal(v.total, v.mic + v.balcony);
  });

  test('odadan ayrılan Balkon’da görünmez; mikrofondan inen Balkon’a döner', () => {
    assert.ok(leave(R, 'd').ok);
    assert.ok(!view().balconyIds.includes('d'));
    assert.ok(takeSeat(R, 'b', 2).ok);
    leaveSeat(R, 'b');
    assert.ok(view().balconyIds.includes('b'));
    assert.ok(leave(R, 'b').ok);
    assert.ok(!view().balconyIds.includes('b') && !view().micIds.includes('b'));
  });

  test('konuşma isteklerinden mikrofona çıkan ve ayrılan düşer; sıra korunur, tekrar yok', () => {
    const requests = ['b', 'c', 'd', 'b'];
    assert.deepEqual(balconyOnly(requests, view()), ['b', 'c', 'd']);
    assert.ok(takeSeat(R, 'c', 2).ok);
    assert.ok(leave(R, 'd').ok);
    assert.deepEqual(balconyOnly(requests, view()), ['b']);
    assert.ok(join(R, 'd').ok);
    assert.deepEqual(balconyOnly(requests, view()), ['b', 'd']);
  });
});

describe('Takipçilere oda daveti (oda başına 24 saat)', () => {
  const t0 = Date.UTC(2026, 9, 28, 12);

  test('yalnızca oda sahibi ve yöneticiler gönderebilir', () => {
    assert.equal(canInviteFollowers('member', undefined, t0).ok, false);
    assert.equal(canInviteFollowers('admin', undefined, t0).ok, true);
    assert.equal(canInviteFollowers('owner', undefined, t0).ok, true);
  });

  test('24 saatte bir; beklerken kalan süre söylenir', () => {
    assert.equal(followerInviteLeft(undefined, t0), 0);
    const r = canInviteFollowers('owner', t0, t0 + 18 * HOUR + 30 * 60_000);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.left === 5 * HOUR + 30 * 60_000);
    assert.ok(!r.ok && r.reason.includes('5 sa 30 dk'));
    assert.equal(canInviteFollowers('admin', t0, t0 + FOLLOWER_INVITE_COOLDOWN_MS - 1).ok, false);
    assert.equal(canInviteFollowers('admin', t0, t0 + FOLLOWER_INVITE_COOLDOWN_MS).ok, true);
  });

  test('gönderimden geride kalan saat 24 saatten fazla göstermez', () => {
    assert.equal(followerInviteLeft(t0, t0 - 5 * 60_000), FOLLOWER_INVITE_COOLDOWN_MS);
  });

  test('kalan süre hiçbir zaman "0 dk" yazmaz', () => {
    assert.equal(formatWait(1), '1 dk');
    assert.equal(formatWait(59 * 60_000), '59 dk');
    assert.equal(formatWait(2 * HOUR), '2 sa');
    assert.equal(formatWait(24 * HOUR), '24 sa');
    assert.equal(formatWait(3 * HOUR + 61_000), '3 sa 2 dk');
  });

  test('hesap kendi takipçisi sayılmaz', () => {
    for (const acc of ['me', 'u1', 'u7']) assert.ok(!knownFollowers(acc).includes(acc));
  });
});
