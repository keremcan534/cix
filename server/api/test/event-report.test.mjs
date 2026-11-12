// Etkinlik Merkezi raporları (events.mjs, § 14) against a real Postgres: the room owner's report covers only the rooms
// they own, the platform's covers every room; the numbers (applications and their outcome, places, the people who
// came, the attendance rate, the average per event that ran, the categories, how events ended, the latest starts and
// ends) and the 7 / 30 / 90 day period.
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
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const plan = (room, over = {}) => ({ room, category: 'tanisma', title: 'Akustik Gece', startsAt: inMinutes(90), minutes: 60, capacity: null, ...over });
async function owned(name) {
  const owner = await signUp(`${name} ${rnd(2)}`);
  const room = (await ok(call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session), 'oda')).room.id;
  return { owner, room };
}

describe('Etkinlik raporları', () => {
  test('oda sahibi yalnız kendi odalarını, yönetim hepsini görür; sayılar doğru', async () => {
    const admin = await h.account('Yönetim', 'admin');
    const { owner, room } = await owned('Sahip');
    const { owner: rival, room: rivalRoom } = await owned('Diğer');
    const fans = [await signUp('Ayşe'), await signUp('Bora'), await signUp('Cem')];
    const review = (id, approve, reason) => ok(call('POST', '/api/admin/events/review', { id, approve, reason }, admin.session), 'inceleme');

    // Ran: three places, two came (and the organiser who started it); ended by the owner.
    const ran = (await ok(call('POST', '/api/events', plan(room, { category: 'muzik', title: 'Müzik Gecesi' }), owner.session), 'a')).event;
    await review(ran.id, true);
    for (const f of fans) await ok(call('POST', '/api/events/reserve', { id: ran.id }, f.session), 'yer');
    await h.sql.query("UPDATE events SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes' WHERE id = $1", [ran.id]);
    await ok(call('POST', '/api/events/start', { id: ran.id }, owner.session), 'başlat');
    for (const f of fans.slice(0, 2)) await ok(call('POST', '/api/events/here', { id: ran.id }, f.session), 'geldi');
    await ok(call('POST', '/api/events/end', { id: ran.id }, owner.session), 'bitir');
    // Rejected; approved and then cancelled (one place); waiting for review; a draft never sent.
    const rejected = (await ok(call('POST', '/api/events', plan(room, { startsAt: inMinutes(300), title: 'Ret Gecesi' }), owner.session), 'b')).event;
    await review(rejected.id, false, 'Kapak uygun değil.');
    const cancelled = (await ok(call('POST', '/api/events', plan(room, { category: 'eglence', startsAt: inMinutes(500), title: 'İptal Gecesi' }), owner.session), 'c')).event;
    await review(cancelled.id, true);
    await ok(call('POST', '/api/events/reserve', { id: cancelled.id }, fans[0].session), 'yer');
    await ok(call('POST', '/api/events/cancel', { id: cancelled.id }, owner.session), 'iptal');
    await ok(call('POST', '/api/events', plan(room, { startsAt: inMinutes(700), title: 'Bekleyen Gece' }), owner.session), 'd');
    await ok(call('POST', '/api/events', plan(room, { startsAt: inMinutes(900), title: 'Taslak Gece', draft: true }), owner.session), 'taslak');
    // The other owner's event, which ran with nobody else.
    const theirs = (await ok(call('POST', '/api/events', plan(rivalRoom, { title: 'Başka Oda' }), rival.session), 'e')).event;
    await review(theirs.id, true);
    await h.sql.query("UPDATE events SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes' WHERE id = $1", [theirs.id]);
    await ok(call('POST', '/api/events/start', { id: theirs.id }, rival.session), 'başlat');

    const mine = await ok(call('GET', '/api/events/report?days=30', null, owner.session), 'rapor');
    const r = mine.report;
    assert.deepEqual(mine.rooms.map((x) => x.id), [room]);
    assert.deepEqual(
      [r.days, r.events, r.approved, r.rejected, r.cancelled, r.review, r.started],
      [30, 4, 2, 1, 1, 1, 1],
      'başvuru, onay, ret, iptal, inceleme, başlayan (taslak sayılmaz)',
    );
    assert.deepEqual([r.reservations, r.attended, r.missed, r.participants], [4, 2, 1, 3]);
    assert.equal(r.attendanceRate, 0.667, 'gelen / yer ayırtan (biten etkinliklerde)');
    assert.equal(r.avgParticipants, 3);
    assert.deepEqual(
      r.categories.map((c) => [c.id, c.events, c.reservations, c.participants]),
      [
        ['muzik', 1, 3, 3],
        ['eglence', 1, 1, 0],
        ['tanisma', 2, 0, 0],
      ],
    );
    assert.deepEqual(r.ends, { owner: 1, time: 0, room_closed: 0, not_started: 0, admin: 0 });
    assert.deepEqual(
      r.records.map((x) => [x.event.id, x.action, x.reason]),
      [
        [ran.id, 'end', 'owner'],
        [ran.id, 'start', null],
      ],
    );
    assert.ok(r.records.every((x) => x.by === owner.user.name && x.room));
    assert.equal(JSON.stringify(r).includes('Başka Oda'), false, 'başka odanın etkinliği yok');

    // One room of mine; never someone else's; the period is 7, 30 or 90 days.
    assert.equal((await ok(call('GET', `/api/events/report?days=7&room=${room}`, null, owner.session), 'oda')).report.events, 4);
    const [st, j] = await call('GET', `/api/events/report?room=${rivalRoom}`, null, owner.session);
    assert.deepEqual([st, j.error], [403, 'Odanın raporunu oda sahibi görür']);
    assert.equal((await call('GET', '/api/events/report?days=14', null, owner.session))[0], 400);
    // A fan's own report: no room, nothing.
    const fan = await ok(call('GET', '/api/events/report', null, fans[0].session), 'boş');
    assert.deepEqual([fan.report.days, fan.report.events, fan.report.attendanceRate, fan.report.avgParticipants, fan.rooms], [30, 0, null, null, []]);

    // An application older than the period, whose time also passed then, falls out of 30 days, into 90.
    await h.sql.query("UPDATE events SET created_at = now() - interval '40 days', submitted_at = now() - interval '40 days', starts_at = now() - interval '39 days', ends_at = now() - interval '39 days' + interval '1 hour' WHERE id = $1", [rejected.id]);
    assert.equal((await ok(call('GET', '/api/events/report?days=30', null, owner.session), '30')).report.rejected, 0);
    assert.equal((await ok(call('GET', '/api/events/report?days=90', null, owner.session), '90')).report.rejected, 1);

    // The platform: admins only, every room.
    assert.equal((await call('GET', '/api/admin/events/report', null, owner.session))[0], 403);
    const all = (await ok(call('GET', '/api/admin/events/report?days=90', null, admin.session), 'yönetim')).report;
    assert.deepEqual([all.events, all.approved, all.started, all.participants], [5, 3, 2, 4]);
    assert.equal(all.avgParticipants, 2);
    assert.ok(all.records.some((x) => x.event.id === theirs.id && x.action === 'start'));
  });
});
