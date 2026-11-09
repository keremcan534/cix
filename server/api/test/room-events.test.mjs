// Oda etkinlikleri (room-events.mjs) against a real Postgres: the owner or a Süper Yönetici plans and cancels, anyone
// says they are going, plain admins and listeners can't plan, and contact details never get into an activity.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('Oda etkinlikleri', () => {
  test('sahip ve Süper Yönetici ekler, herkes katılır, iptal herkeste görünür', async () => {
    const owner = await signUp('Etkinlik Sahibi');
    const sup = await signUp('Süper Yönetici');
    const admin = await signUp('Yönetici');
    const fan = await signUp('Dinleyici');
    const room = (await ok(call('POST', '/api/rooms', { title: `Etkinlik ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: sup.user.id, super: true }, owner.session), 'süper');
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');

    const { event } = await ok(call('POST', '/api/rooms/events', { room, title: 'Oyun gecesi', desc: 'Doğruluk mu cesaret mi', when: 'Cuma 22:00', type: 'Oyun' }, sup.session), 'ekle');
    assert.deepEqual([event.title, event.when, event.type, event.attendees, event.going, event.cancelled], ['Oyun gecesi', 'Cuma 22:00', 'Oyun', 1, true, false]);
    assert.equal((await call('POST', '/api/rooms/events', { room, title: 'Yöneticiden', when: 'Bugün' }, admin.session))[0], 403);
    assert.equal((await call('POST', '/api/rooms/events', { room, title: 'Dinleyiciden', when: 'Bugün' }, fan.session))[0], 403);
    const [st, j] = await call('POST', '/api/rooms/events', { room, title: 'Ara beni 0532 123 45 67', when: 'Bugün' }, owner.session);
    assert.equal(st, 400, 'iletişim bilgisi girmez');
    assert.ok(j.error);

    const going = await ok(call('POST', '/api/rooms/events/going', { id: event.id, going: true }, fan.session), 'katıl');
    assert.deepEqual([going.event.going, going.event.attendees], [true, 2]);
    const list = await ok(call('GET', `/api/rooms/events?room=${room}`, null, fan.session), 'liste');
    assert.deepEqual(list.events.map((e) => [e.title, e.going, e.attendees]), [['Oyun gecesi', true, 2]]);

    assert.equal((await call('POST', '/api/rooms/events/cancel', { id: event.id }, admin.session))[0], 403);
    const cancelled = await ok(call('POST', '/api/rooms/events/cancel', { id: event.id }, owner.session), 'iptal');
    assert.equal(cancelled.event.cancelled, true);
    assert.equal((await call('POST', '/api/rooms/events/going', { id: event.id, going: true }, admin.session))[0], 409);
    assert.equal((await ok(call('GET', `/api/rooms/events?room=${room}`, null, admin.session), 'liste')).events[0].cancelled, true);
  });
});
