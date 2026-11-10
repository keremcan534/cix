/// <reference types="node" />
// Odalar arası PK from the server (server/api/pk-cross.mjs) in the PK store: the invite, the countdown, each room's
// score and the result are the server's, the same in both rooms; the end reasons read as the demo's.
import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { putServerRoom, type Room } from '@/data/mock';
import type { ServerCrossPk, ServerPk, ServerRoom } from '@/lib/api';
import { applyServerCrossPk, applyServerPk, getPk, pkOfRoom, pkPointsFor, resetPk, serverCrossSession, serverPkSession } from '@/lib/pk';
import { pushTarget } from '@/lib/push-target';

const RED = '11111111-1111-4111-8111-111111111111';
const BLUE = '22222222-2222-4222-8222-222222222222';
const T0 = Date.parse('2026-11-10T18:00:00Z');
const iso = (t: number) => new Date(t).toISOString();
const room = (id: string, title: string): ServerRoom => ({ id, owner: { id: `o-${id}`, name: 'Sahip', avatarUrl: null }, title, announcement: '', roomType: 'free', hasPassword: false, createdAt: iso(T0), closed: false, listeners: 3 });
const local = (id: string) => (id === 'u-me' ? 'me' : id);
const base = (over: Partial<ServerCrossPk> = {}): ServerCrossPk => ({
  id: '9',
  status: 'active',
  reason: null,
  endedRoom: null,
  durationMin: 15,
  createdAt: iso(T0 - 30_000),
  inviteExpiresAt: iso(T0 + 30_000),
  startAt: iso(T0),
  endAt: iso(T0 + 15 * 60_000),
  red: { room: room(RED, 'Kırmızı Oda'), score: 600 },
  blue: { room: room(BLUE, 'Mavi Oda'), score: 250 },
  pairs: [
    { from: 'u-fan', to: 'u-red1', side: 'red', points: 400, gifts: 2 },
    { from: 'u-me', to: 'u-red1', side: 'red', points: 200, gifts: 1 },
    { from: 'u-fan', to: 'u-blue1', side: 'blue', points: 250, gifts: 5 },
  ],
  people: [],
  ...over,
});
const known = (r: ServerRoom): Room => ({ id: r.id, title: r.title, category: 'Sohbet', cover: '', hostId: r.owner.id, listeners: r.listeners, seatUserIds: [], tags: [] });

beforeEach(() => {
  resetPk();
  putServerRoom(known(room(RED, 'Kırmızı Oda')));
  putServerRoom(known(room(BLUE, 'Mavi Oda')));
});

describe('Odalar arası PK (sunucu)', () => {
  test('davet: rakip oda yanıtlayana kadar "davet", süre sunucunun saatiyle', () => {
    const s = serverCrossSession(base({ status: 'invite', startAt: null, endAt: null, red: { room: room(RED, 'Kırmızı Oda'), score: 0 }, blue: { room: room(BLUE, 'Mavi Oda'), score: 0 }, pairs: [] }), local, 2_000, T0);
    assert.equal(s.id, 'XPK-9');
    assert.equal(s.kind, 'cross');
    assert.equal(s.status, 'invite');
    assert.deepEqual([s.roomId, s.opponentRoomId], [RED, BLUE]);
    assert.equal(s.inviteExpiresAt, T0 + 28_000, 'sunucu 2 sn ileride: yerel saate çevrilir');
    assert.equal(s.startAt, undefined);
  });

  test('geri sayım, sonra aktif; skorlar sunucudan; kişi puanı odasına göre', () => {
    assert.equal(serverCrossSession(base(), local, 0, T0 - 1).status, 'prep');
    const s = serverCrossSession(base(), local, 0, T0 + 60_000);
    assert.equal(s.status, 'active');
    assert.deepEqual(s.teams.map((t) => [t.roomId, t.score]), [
      [RED, 600],
      [BLUE, 250],
    ]);
    assert.equal(pkPointsFor(s, RED, 'u-red1'), 600);
    assert.equal(pkPointsFor(s, BLUE, 'u-red1'), 0, 'öbür odadan bakınca yok');
    assert.ok(s.records.some((r) => r.senderId === 'me'), 'benim kimliğim "me"');
  });

  test('bitince sonuç iki odada da aynı: kazanan oda ve onun tacı', () => {
    const a = serverCrossSession(base({ status: 'done' }), local, 0, T0 + 20 * 60_000);
    const b = serverCrossSession(base({ status: 'done' }), local, 4_000, T0 + 30 * 60_000);
    assert.deepEqual(a.result, b.result);
    assert.equal(a.result!.winner, 'red');
    assert.equal(a.result!.diff, 350);
    assert.equal(a.result!.validGifts, 8);
    assert.deepEqual(a.result!.crowned, ['u-red1']);
    assert.equal(a.result!.crowns.find((c) => c.top)?.senderId, 'u-fan');
  });

  test('bitiş nedenleri: ret, zaman aşımı, geri alma, erken bitirme, oda kapandı', () => {
    const why = (over: Partial<ServerCrossPk>) => serverCrossSession(base(over), local, 0, T0).cancelReason;
    assert.equal(why({ status: 'declined', startAt: null }), 'Mavi Oda daveti reddetti. PK başlamadı.');
    assert.equal(why({ status: 'expired', startAt: null }), 'Rakip oda zamanında yanıt vermedi. PK başlamadı.');
    assert.equal(why({ status: 'cancelled', reason: 'staff', endedRoom: RED, startAt: null }), 'Kırmızı Oda daveti geri aldı. PK başlamadı.');
    assert.equal(why({ status: 'cancelled', reason: 'staff', endedRoom: BLUE }), 'Mavi Oda PK’yı erken bitirdi.');
    assert.equal(why({ status: 'cancelled', reason: 'room_closed', endedRoom: RED }), 'Kırmızı Oda kapandı; PK bitti.');
    const c = serverCrossSession(base({ status: 'cancelled', reason: 'staff', endedRoom: BLUE }), local, 0, T0);
    assert.equal(c.status, 'cancelled');
    assert.equal(c.result, undefined, 'iptalde kazanan yok');
  });

  test('mağazada: iki odadan da aynı PK; yenisi eskisinin yerine; en yenisi önde', () => {
    applyServerCrossPk(BLUE, serverCrossSession(base(), local, 0, T0 + 1));
    assert.equal(pkOfRoom(BLUE)?.id, 'XPK-9');
    assert.equal(pkOfRoom(RED)?.id, 'XPK-9', 'aynı PK iki odada');
    applyServerCrossPk(RED, serverCrossSession(base({ red: { room: room(RED, 'Kırmızı Oda'), score: 900 } }), local, 0, T0 + 1));
    assert.equal(getPk().sessions.filter((x) => x.id === 'XPK-9').length, 1);
    assert.equal(pkOfRoom(RED)?.teams[0].score, 900);
    // An Oda içi PK of the red room that ended before this one stays behind it.
    const old: ServerPk = { id: '3', room: RED, mode: 'solo', status: 'done', startedBy: 'u-x', durationMin: 15, participants: ['u-a', 'u-b'], red: [], blue: [], startAt: iso(T0 - 40 * 60_000), endAt: iso(T0 - 25 * 60_000), pairs: [], people: [] };
    applyServerPk(RED, serverPkSession(old, local, 0, T0));
    applyServerCrossPk(RED, serverCrossSession(base({ status: 'done' }), local, 0, T0 + 20 * 60_000));
    assert.deepEqual(getPk().sessions.map((x) => x.id), ['XPK-9', 'SPK-3']);
    applyServerCrossPk(BLUE, null);
    assert.deepEqual(getPk().sessions.map((x) => x.id), ['SPK-3']);
  });

  test('davet bildirimi davet edilen odayı açar', () => {
    assert.equal(pushTarget({ type: 'pk_invite', room: BLUE }), `/oda/${BLUE}`);
  });
});
