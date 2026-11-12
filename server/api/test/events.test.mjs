// Etkinlik Merkezi (events.mjs) against a real Postgres: an owner applies, the platform reviews, people reserve, the
// owner starts and ends it in the room, and the sweep starts, ends and strikes on its own. Times are moved in the
// database where a test needs an event "now".
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', EVENT_SWEEP_MS: '200' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const plan = (room, over = {}) => ({ room, category: 'tanisma', title: 'Akustik Gece', description: 'Gitarla şarkılar', rules: 'Saygılı ol', startsAt: inMinutes(90), minutes: 60, capacity: 3, ...over });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await wait(100);
  }
  throw new Error('zaman aşımı');
}

async function owned(name = 'Sahip') {
  const owner = await signUp(`${name} ${rnd(2)}`);
  const room = (await ok(call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session), 'oda')).room.id;
  return { owner, room };
}

describe('Etkinlik Merkezi', () => {
  test('başvuru, inceleme, liste, yer ayırtma ve kontenjan', async () => {
    const { owner, room } = await owned();
    const admin = await h.account('Yönetim', 'admin');
    const fans = [await signUp('Ayşe'), await signUp('Can'), await signUp('Ela'), await signUp('Deniz')];

    // Only the owner applies; contact details never get in; a theme above the room's level is refused.
    assert.equal((await call('POST', '/api/events', plan(room), fans[0].session))[0], 403);
    assert.equal((await call('POST', '/api/events', plan(room, { title: 'Ara 0532 123 45 67' }), owner.session))[0], 400);
    assert.equal((await call('POST', '/api/events', plan(room, { theme: 'altin-gala' }), owner.session))[0], 403);
    assert.equal((await call('POST', '/api/events', plan(room, { theme: 'sahne' }), owner.session))[0], 403, 'Lv.2 teması');
    assert.equal((await call('POST', '/api/events', plan(room, { startsAt: inMinutes(5) }), owner.session))[0], 400, 'en erken 30 dakika sonra');
    assert.equal((await call('POST', '/api/events', plan(room, { minutes: 600 }), owner.session))[0], 400, 'en uzun 180 dakika');

    const { event } = await ok(call('POST', '/api/events', plan(room), owner.session), 'başvuru');
    assert.deepEqual([event.state, event.stateLabel, event.theme, event.category.id, event.capacity], ['review', 'İncelemede', 'ilk-selam', 'tanisma', 3]);
    assert.equal(event.can.edit, true);
    // The same hours in the same room can't be applied for twice.
    assert.equal((await call('POST', '/api/events', plan(room, { title: 'Çakışan' }), owner.session))[0], 409);
    // An application isn't public: nobody else sees it, it isn't listed.
    assert.equal((await call('GET', `/api/events/one?id=${event.id}`, null, fans[0].session))[0], 404);
    assert.equal((await ok(call('GET', '/api/events', null, fans[0].session), 'liste')).events.some((e) => e.id === event.id), false);
    assert.equal((await call('POST', '/api/events/reserve', { id: event.id }, fans[0].session))[0], 409);

    // Review: admins only; a refusal needs its reason and tells the owner.
    assert.equal((await call('POST', '/api/admin/events/review', { id: event.id, approve: true }, owner.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/events/review', { id: event.id, approve: false }, admin.session))[0], 400);
    const queue = await ok(call('GET', '/api/admin/events?status=review', null, admin.session), 'kuyruk');
    assert.ok(queue.events.some((e) => e.id === event.id));
    assert.ok(queue.counts.review >= 1);
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: false, reason: 'Kapak görseli eksik.' }, admin.session), 'ret');
    const rejected = (await ok(call('GET', `/api/events/one?id=${event.id}`, null, owner.session), 'ret görünür')).event;
    assert.deepEqual([rejected.state, rejected.rejectReason], ['rejected', 'Kapak görseli eksik.']);
    const notice = await h.sql.query("SELECT title, link FROM team_notices WHERE target = $1 AND kind = 'event'", [owner.user.id]);
    assert.deepEqual(notice.rows.map((x) => [x.title, x.link]), [['Etkinlik başvurun reddedildi', `/?etkinlik=${event.id}`]]);

    // Edited, it goes back to review; approved, it is listed and open for places.
    const edited = (await ok(call('POST', '/api/events/edit', { id: event.id, ...plan(room, { title: 'Akustik Gece 2' }) }, owner.session), 'düzenle')).event;
    assert.deepEqual([edited.state, edited.title, edited.rejectReason], ['review', 'Akustik Gece 2', null]);
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: true }, admin.session), 'onay');
    const listed = await ok(call('GET', '/api/events?status=upcoming&cat=tanisma', null, fans[0].session), 'liste');
    assert.ok(listed.events.some((e) => e.id === event.id && e.state === 'upcoming'));
    assert.equal((await ok(call('GET', '/api/events?q=akustik', null, fans[0].session), 'arama')).events.some((e) => e.id === event.id), true);
    assert.equal((await ok(call('GET', '/api/events?q=bulunmayan-kelime', null, fans[0].session), 'arama')).events.length, 0);
    assert.equal((await ok(call('GET', '/api/events?when=tomorrow', null, fans[0].session), 'yarın')).events.some((e) => e.id === event.id), false);
    assert.equal((await call('GET', '/api/events?when=yarin-sabah', null, fans[0].session))[0], 400);

    // Places: one each, up to the capacity of 3.
    for (const f of fans.slice(0, 3)) assert.equal((await ok(call('POST', '/api/events/reserve', { id: event.id }, f.session), 'yer')).event.mine, 'confirmed');
    assert.equal((await call('POST', '/api/events/reserve', { id: event.id }, fans[0].session))[0], 409, 'ikinci kez');
    const [full, fj] = await call('POST', '/api/events/reserve', { id: event.id }, fans[3].session);
    assert.deepEqual([full, fj.error], [409, 'Etkinliğin kontenjanı doldu']);
    await ok(call('POST', '/api/events/unreserve', { id: event.id }, fans[2].session), 'yer iptal');
    await ok(call('POST', '/api/events/reserve', { id: event.id }, fans[3].session), 'boşalan yer');
    const one = (await ok(call('GET', `/api/events/one?id=${event.id}`, null, fans[3].session), 'detay')).event;
    assert.deepEqual([one.reserved, one.mine, one.can.reserve, one.can.edit, one.history], [3, 'confirmed', false, false, undefined]);
    // The room's staff see who reserved; others don't.
    assert.equal((await call('GET', `/api/events/people?id=${event.id}`, null, fans[0].session))[0], 403);
    const people = await ok(call('GET', `/api/events/people?id=${event.id}`, null, owner.session), 'katılımcılar');
    assert.equal(people.reservations.filter((x) => x.status === 'confirmed').length, 3);
    const mine = await ok(call('GET', '/api/events/mine', null, fans[3].session), 'benim');
    assert.ok(mine.reserved.some((e) => e.id === event.id));
    assert.ok((await ok(call('GET', '/api/events/mine', null, owner.session), 'odam')).events.some((e) => e.id === event.id));
  });

  test('odada başlatma, katılım, bitirme; oda kapanınca iptal', async () => {
    const { owner, room } = await owned();
    const admin = await h.account('Yönetim', 'admin');
    const fan = await signUp('Gelen');
    const late = await signUp('Gelmeyen');
    const sup = await signUp('Süper');
    await ok(call('POST', '/api/rooms/admin', { room, user: sup.user.id, super: true }, owner.session), 'süper');
    const { event } = await ok(call('POST', '/api/events', plan(room, { capacity: null }), owner.session), 'başvuru');
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: true }, admin.session), 'onay');
    for (const u of [fan, late]) await ok(call('POST', '/api/events/reserve', { id: event.id }, u.session), 'yer');

    const [early, ej] = await call('POST', '/api/events/start', { id: event.id }, owner.session);
    assert.deepEqual([early, ej.error], [409, 'Etkinlik başlangıçtan en erken 10 dakika önce başlatılabilir']);
    await h.sql.query("UPDATE events SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes' WHERE id = $1", [event.id]);
    assert.equal((await call('POST', '/api/events/start', { id: event.id }, fan.session))[0], 403);
    const started = (await ok(call('POST', '/api/events/start', { id: event.id }, sup.session), 'başlat')).event;
    assert.deepEqual([started.state, started.came], ['live', 1]);
    // Reserving is closed once it runs; the one in the room counts as come.
    assert.equal((await call('POST', '/api/events/reserve', { id: event.id }, admin.session))[0], 409);
    assert.deepEqual(await ok(call('POST', '/api/events/here', { id: event.id }, fan.session), 'burada'), { counted: true });
    const roomNow = (await ok(call('GET', `/api/room?id=${room}`, null, fan.session), 'oda')).room;
    assert.deepEqual([roomNow.event.id, roomNow.event.state, roomNow.event.title], [event.id, 'live', 'Akustik Gece']);
    assert.equal((await ok(call('GET', `/api/events/room?room=${room}`, null, fan.session), 'oda etkinlikleri')).running.id, event.id);
    assert.ok((await ok(call('GET', '/api/events?when=now', null, fan.session), 'şu an')).events.some((e) => e.id === event.id));

    const ended = (await ok(call('POST', '/api/events/end', { id: event.id }, owner.session), 'bitir')).event;
    assert.deepEqual([ended.state, ended.endReason, ended.came], ['ended', 'owner', 2], 'başlatan ve gelen');
    const res = await h.sql.query('SELECT user_id, status FROM event_reservations WHERE event_id = $1', [event.id]);
    const st = Object.fromEntries(res.rows.map((x) => [x.user_id, x.status]));
    assert.deepEqual([st[fan.user.id], st[late.user.id]], ['attended', 'missed']);
    const hist = (await ok(call('GET', `/api/events/one?id=${event.id}`, null, owner.session), 'geçmiş')).event.history.map((x) => x.action);
    assert.deepEqual(hist, ['end', 'start', 'approve', 'apply']);

    // Closing the room cancels the events still to come and tells those with a place.
    const next = (await ok(call('POST', '/api/events', plan(room, { startsAt: inMinutes(240) }), owner.session), 'ikinci')).event;
    await ok(call('POST', '/api/admin/events/review', { id: next.id, approve: true }, admin.session), 'onay');
    await ok(call('POST', '/api/events/reserve', { id: next.id }, fan.session), 'yer');
    await ok(call('POST', '/api/rooms/close', { id: room }, owner.session), 'oda kapat');
    const gone = (await ok(call('GET', `/api/events/one?id=${next.id}`, null, fan.session), 'iptal')).event;
    assert.deepEqual([gone.state, gone.cancelReason], ['cancelled', 'Oda kapatıldı']);
  });

  test('zamanlayıcı: açık odada kendiliğinden başlar, süresi dolunca biter, başlatılmayana ihlal', async () => {
    const { owner, room } = await owned();
    const admin = await h.account('Yönetim', 'admin');
    const a = (await ok(call('POST', '/api/events', plan(room), owner.session), 'a')).event;
    await ok(call('POST', '/api/admin/events/review', { id: a.id, approve: true }, admin.session), 'onay');
    // Due now and someone is in the voice room: the sweep starts it.
    await h.sql.query("UPDATE events SET starts_at = now() - interval '1 minute', ends_at = now() + interval '59 minutes' WHERE id = $1", [a.id]);
    await h.sql.query("INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, 'PA_test')", [`oda-${room}`, owner.user.id]);
    await until(async () => (await h.sql.query('SELECT started_at FROM events WHERE id = $1', [a.id])).rows[0].started_at !== null);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM event_participants WHERE event_id = $1', [a.id])).rows[0].n, 1);
    // Past its end: it ends on its own.
    await h.sql.query("UPDATE events SET ends_at = now() - interval '1 second' WHERE id = $1", [a.id]);
    await until(async () => (await h.sql.query('SELECT end_reason FROM events WHERE id = $1', [a.id])).rows[0].end_reason === 'time');

    // Left unstarted past the grace: ended as not started, a strike; at the limit, applications stop.
    const { owner: o2, room: r2 } = await owned('İhmalci');
    for (let i = 0; i < 3; i++) {
      const e = (await ok(call('POST', '/api/events', plan(r2, { startsAt: inMinutes(60 + i * 120), title: `Gece ${i + 1}` }), o2.session), 'b')).event;
      await ok(call('POST', '/api/admin/events/review', { id: e.id, approve: true }, admin.session), 'onay');
      await h.sql.query("UPDATE events SET starts_at = now() - interval '2 hours' - make_interval(mins => $2), ends_at = now() - interval '1 hour' - make_interval(mins => $2) WHERE id = $1", [e.id, i * 120]);
    }
    await until(async () => (await h.sql.query("SELECT count(*)::int AS n FROM events WHERE owner_id = $1 AND end_reason = 'not_started'", [o2.user.id])).rows[0].n === 3);
    const [st, j] = await call('POST', '/api/events', plan(r2, { startsAt: inMinutes(600) }), o2.session);
    assert.equal(st, 403);
    assert.match(j.error, /tarihine kadar yeni başvuru yapamazsın/);
    // A not-started event isn't listed as done.
    assert.equal((await ok(call('GET', '/api/events?status=ended', null, owner.session), 'biten')).events.some((e) => e.host.id === o2.user.id), false);
  });

  test('yönetim: türler, yayından kaldırma, ayar sınırları', async () => {
    const { owner, room } = await owned();
    const admin = await h.account('Yönetim', 'admin');
    const fan = await signUp('İzleyici');
    assert.equal((await call('GET', '/api/admin/events/categories', null, owner.session))[0], 403);
    const added = (await ok(call('POST', '/api/admin/events/categories', { name: 'Şiir Gecesi', icon: 'book', theme: 'ilk-selam', sort: 15 }, admin.session), 'tür')).category;
    assert.deepEqual([added.id, added.name, added.active], ['siir-gecesi', 'Şiir Gecesi', true]);
    const meta = await ok(call('GET', '/api/events/meta', null, owner.session), 'meta');
    assert.ok(meta.categories.some((c) => c.id === 'siir-gecesi'));
    assert.deepEqual(meta.rooms.map((r) => [r.id, r.level]), [[room, 1]]);
    assert.equal(meta.rules.maxMinutes, 180);
    const e = (await ok(call('POST', '/api/events', plan(room, { category: 'siir-gecesi', theme: undefined }), owner.session), 'başvuru')).event;
    assert.equal(e.theme, 'ilk-selam', 'türün teması');
    // A used category can't be deleted, only closed; a closed one takes no application.
    assert.equal((await call('POST', '/api/admin/events/categories/remove', { id: 'siir-gecesi' }, admin.session))[0], 409);
    await ok(call('POST', '/api/admin/events/categories', { id: 'siir-gecesi', name: 'Şiir Gecesi', icon: 'book', theme: 'ilk-selam', sort: 15, active: false }, admin.session), 'kapat');
    assert.equal((await call('POST', '/api/events', plan(room, { category: 'siir-gecesi', startsAt: inMinutes(400) }), owner.session))[0], 400);

    await ok(call('POST', '/api/admin/events/review', { id: e.id, approve: true }, admin.session), 'onay');
    await ok(call('POST', '/api/events/reserve', { id: e.id }, fan.session), 'yer');
    assert.equal((await call('POST', '/api/admin/events/remove', { id: e.id }, admin.session))[0], 400, 'gerekçe');
    const removed = (await ok(call('POST', '/api/admin/events/remove', { id: e.id, reason: 'Kurallara aykırı içerik' }, admin.session), 'kaldır')).event;
    assert.deepEqual([removed.state, removed.cancelReason], ['cancelled', 'Kurallara aykırı içerik']);
    assert.equal((await ok(call('GET', '/api/events', null, fan.session), 'liste')).events.some((x) => x.id === e.id), false);

    // Canlı ayarlar: the room level for applying.
    const { v } = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
    await ok(call('POST', '/api/admin/live-settings', { changes: { event_min_room_level: 3 }, reason: 'Etkinlik deneme', baseV: v, confirm: true }, admin.session), 'ayar');
    await until(async () => (await call('POST', '/api/events', plan(room, { startsAt: inMinutes(700) }), owner.session))[0] === 403);
  });
});
