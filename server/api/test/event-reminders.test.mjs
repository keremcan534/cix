// Etkinlik Merkezi, Aşama 4 (events.mjs) against a real Postgres: reminders 1 hour and 15 minutes before and at the
// start, each sent once even with a second API sweeping the same database (two sweeps at once, a fresh start as after
// a restart); a place's and a person's choice to have none; Canlı ayarlar switching one kind off; an event sent to a
// friend as a message; a removed event opened from a link. Times are moved in the database.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { MINUTE, reminderDue, reminderText } from '../event-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', EVENT_SWEEP_MS: '200' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const plan = (room, over = {}) => ({ room, category: 'tanisma', title: 'Akustik Gece', startsAt: inMinutes(90), minutes: 60, capacity: null, ...over });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) {
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

/** A second API on this test's database, sweeping every 50 ms; resolves once it listens. Stopped at the end. */
const children = new Set();
after(() => {
  for (const c of children) c.kill();
});
function sweeper() {
  const env = {
    ...process.env,
    PGHOST: process.env.PGHOST ?? '127.0.0.1',
    PGPORT: process.env.PGPORT ?? '5432',
    POSTGRES_USER: process.env.POSTGRES_USER ?? 'postgres',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? '',
    POSTGRES_DB: `similar_test_${process.pid}`,
    LIVEKIT_KEYS: 'testkey: testsecret',
    API_PORT: String(19500 + (process.pid % 400)),
    LOG_REQUESTS: '0',
    PUSH_ENABLED: '0',
    UPLOAD_VERIFY: '0',
    EVENT_SWEEP_MS: '50',
  };
  const child = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'index.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  children.add(child);
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += String(d);
      if (out.includes('api on')) resolve(child);
    });
    child.on('exit', (code) => reject(new Error(`second api exited ${code}`)));
  });
}
const stop = (child) =>
  new Promise((resolve) => {
    child.removeAllListeners('exit');
    child.on('exit', () => {
      children.delete(child);
      resolve();
    });
    child.kill();
  });

describe('hatırlatma zamanı', () => {
  test('1 saat ve 15 dakika önce, başlarken; sonradan yer ayırtana geçmiş olanı gitmez', () => {
    const s = Date.UTC(2026, 10, 20, 18, 0);
    const early = s - 3 * 60 * MINUTE;
    const at = (min, reservedAt = early, startedAt = null) => reminderDue({ startsAt: s, startedAt, reservedAt }, s - min * MINUTE);
    assert.equal(at(61), null);
    assert.equal(at(60), 'hour');
    assert.equal(at(30), 'hour');
    assert.equal(at(15.01), 'hour');
    assert.equal(at(15), 'quarter');
    assert.equal(at(1), 'quarter');
    assert.equal(at(0), null, 'saati geldi ama başlamadı: başlayınca gider');
    assert.equal(at(-5), null);
    assert.equal(at(-5, early, s), 'start');
    assert.equal(at(12, early, s - 2 * MINUTE), 'start', 'erken başladı');
    // A place taken 40 minutes ahead: no hour reminder, the 15-minute one; 10 minutes ahead: only the start.
    assert.equal(at(30, s - 40 * MINUTE), null);
    assert.equal(at(10, s - 40 * MINUTE), 'quarter');
    assert.equal(at(5, s - 10 * MINUTE), null);
    assert.equal(at(-1, s - 10 * MINUTE, s), 'start');
    // The kinds Canlı ayarlar switched off are never due.
    assert.equal(reminderDue({ startsAt: s, startedAt: null, reservedAt: early }, s - 30 * MINUTE, ['quarter', 'start']), null);
    assert.equal(reminderDue({ startsAt: s, startedAt: s, reservedAt: early }, s, ['hour', 'quarter']), null);
  });

  test('metinler kalan süreyi söyler', () => {
    assert.deepEqual(reminderText('hour', 'Akustik Gece', 59.6 * MINUTE), { title: 'Etkinlik hatırlatması', body: '“Akustik Gece” 1 saat sonra başlıyor.' });
    assert.equal(reminderText('hour', 'Akustik Gece', 41.2 * MINUTE).body, '“Akustik Gece” 41 dakika sonra başlıyor.');
    assert.equal(reminderText('quarter', 'Akustik Gece', 14.7 * MINUTE).body, '“Akustik Gece” 15 dakika sonra başlıyor.');
    assert.deepEqual(reminderText('start', 'Akustik Gece', 0), { title: 'Etkinlik başladı', body: '“Akustik Gece” başladı, odasına girip katılabilirsin.' });
  });
});

describe('Etkinlik hatırlatmaları', () => {
  test('zamanında ve bir kez; etkinlik için ve tümü için kapatılır', async () => {
    const { owner, room } = await owned();
    const admin = await h.account('Yönetim', 'admin');
    const [a, b, c, d] = [await signUp('Ayşe'), await signUp('Bora'), await signUp('Cem'), await signUp('Defne')];
    const { event } = await ok(call('POST', '/api/events', plan(room), owner.session), 'başvuru');
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: true }, admin.session), 'onay');
    for (const u of [a, b, c, d]) await ok(call('POST', '/api/events/reserve', { id: event.id }, u.session), 'yer');

    // A place's own switch needs a place.
    const stranger = await signUp('Elif');
    assert.equal((await call('POST', '/api/events/remind', { id: event.id, on: false }, stranger.session))[0], 409);
    assert.equal((await call('POST', '/api/events/remind', { id: event.id, on: 'hayır' }, b.session))[0], 400);
    assert.equal((await ok(call('GET', `/api/events/one?id=${event.id}`, null, stranger.session), 'yer yok')).event.remind, null);
    // Bora: none for this event. Cem: no event reminders at all.
    const off = (await ok(call('POST', '/api/events/remind', { id: event.id, on: false }, b.session), 'bu etkinlik')).event;
    assert.deepEqual([off.remind, off.remindersOff, off.reminders], [false, false, ['hour', 'quarter', 'start']]);
    assert.deepEqual(await ok(call('POST', '/api/events/reminders', { on: false }, c.session), 'hepsi'), { on: false, kinds: ['hour', 'quarter', 'start'] });
    assert.deepEqual(await ok(call('GET', '/api/events/reminders', null, c.session), 'okunur'), { on: false, kinds: ['hour', 'quarter', 'start'] });
    const cv = (await ok(call('GET', `/api/events/one?id=${event.id}`, null, c.session), 'detay')).event;
    assert.deepEqual([cv.remind, cv.remindersOff], [true, true]);

    const sent = async (kind) => (await h.sql.query('SELECT user_id FROM event_reminders_sent WHERE event_id = $1 AND kind = $2 ORDER BY user_id', [event.id, kind])).rows.map((x) => x.user_id);
    const notices = async (u) => (await h.sql.query("SELECT title, body, link FROM team_notices WHERE target = $1 AND kind = 'event' ORDER BY id", [u.user.id])).rows;
    const ids = (...us) => us.map((u) => u.user.id).sort();

    // 50 minutes to go: the places taken long ago get the hour reminder; Defne reserved 8 minutes ago, after its moment
    // (10 minutes ago), and before the 15-minute one's.
    // (The places first: the sweep may run between two statements.)
    await h.sql.query("UPDATE event_reservations SET created_at = CASE WHEN user_id = $2 THEN now() - interval '8 minutes' ELSE now() - interval '2 hours' END WHERE event_id = $1", [event.id, d.user.id]);
    await h.sql.query("UPDATE events SET starts_at = now() + interval '50 minutes', ends_at = now() + interval '110 minutes' WHERE id = $1", [event.id]);
    await until(async () => (await sent('hour')).length > 0);
    // A second API sweeps the same database every 50 ms: two sweeps at once, never a second reminder.
    let other = await sweeper();
    await wait(1200);
    assert.deepEqual(await sent('hour'), ids(a));
    const first = await notices(a);
    assert.equal(first.length, 1);
    assert.equal(first[0].title, 'Etkinlik hatırlatması');
    assert.match(first[0].body, /^“Akustik Gece” (49|50) dakika sonra başlıyor\.$/);
    assert.equal(first[0].link, `/?etkinlik=${event.id}`);
    for (const u of [b, c, d]) assert.deepEqual(await notices(u), [], u.user.name);

    // 9 minutes to go: the 15-minute one, Defne's too (her place was there at its moment).
    await h.sql.query("UPDATE events SET starts_at = now() + interval '9 minutes', ends_at = now() + interval '69 minutes' WHERE id = $1", [event.id]);
    await until(async () => (await sent('quarter')).length === 2);
    // As after a restart: the second API stops and starts again; nothing goes twice.
    await stop(other);
    other = await sweeper();
    await wait(800);
    assert.deepEqual(await sent('quarter'), ids(a, d));
    assert.deepEqual((await notices(d)).map((n) => n.body), ['“Akustik Gece” 9 dakika sonra başlıyor.']);
    assert.equal((await notices(a)).length, 2);

    // The organiser starts it: the start reminder goes at once, once.
    await ok(call('POST', '/api/events/start', { id: event.id }, owner.session), 'başlat');
    await until(async () => (await sent('start')).length === 2);
    await wait(800);
    await stop(other);
    assert.deepEqual(await sent('start'), ids(a, d));
    assert.deepEqual((await notices(a)).map((n) => n.title), ['Etkinlik hatırlatması', 'Etkinlik hatırlatması', 'Etkinlik başladı']);
    for (const u of [b, c]) assert.deepEqual(await notices(u), [], u.user.name);
    // The key holds the start: the same reminder can't be written twice.
    const [x] = (await h.sql.query("SELECT event_id, user_id, kind, starts_at FROM event_reminders_sent WHERE event_id = $1 AND kind = 'start' LIMIT 1", [event.id])).rows;
    await assert.rejects(h.sql.query('INSERT INTO event_reminders_sent (event_id, user_id, kind, starts_at) VALUES ($1, $2, $3, $4)', [x.event_id, x.user_id, x.kind, x.starts_at]), /duplicate key/);

    // Cem turns them back on.
    assert.deepEqual(await ok(call('POST', '/api/events/reminders', { on: true }, c.session), 'aç'), { on: true, kinds: ['hour', 'quarter', 'start'] });
  });

  test('Canlı ayarlar bir hatırlatmayı herkes için kapatır; iptal bildirilir', async () => {
    const { owner, room } = await owned('İkinci');
    const admin = await h.account('Yönetim', 'admin');
    const fan = await signUp('Hande');
    const { event } = await ok(call('POST', '/api/events', plan(room, { title: 'Bilgi Kupası' }), owner.session), 'başvuru');
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: true }, admin.session), 'onay');
    await ok(call('POST', '/api/events/reserve', { id: event.id }, fan.session), 'yer');
    const { v } = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
    await ok(call('POST', '/api/admin/live-settings', { changes: { event_reminders_off: ['hour'] }, reason: 'Hatırlatma deneme', baseV: v, confirm: true }, admin.session), 'ayar');
    await until(async () => (await ok(call('GET', '/api/events/reminders', null, fan.session), 'türler')).kinds.join() === 'quarter,start');
    assert.deepEqual((await ok(call('GET', `/api/events/one?id=${event.id}`, null, fan.session), 'detay')).event.reminders, ['quarter', 'start']);

    await h.sql.query("UPDATE event_reservations SET created_at = now() - interval '2 hours' WHERE event_id = $1", [event.id]);
    await h.sql.query("UPDATE events SET starts_at = now() + interval '40 minutes', ends_at = now() + interval '100 minutes' WHERE id = $1", [event.id]);
    await wait(1000);
    const kinds = async () => (await h.sql.query('SELECT kind FROM event_reminders_sent WHERE event_id = $1 ORDER BY kind', [event.id])).rows.map((x) => x.kind);
    assert.deepEqual(await kinds(), [], 'saat hatırlatması kapalı');
    await h.sql.query("UPDATE events SET starts_at = now() + interval '12 minutes', ends_at = now() + interval '72 minutes' WHERE id = $1", [event.id]);
    await until(async () => (await kinds()).length === 1);
    assert.deepEqual(await kinds(), ['quarter']);

    // Cancelled before it starts: the place is told in a personal notice too, with the reason.
    await ok(call('POST', '/api/events/cancel', { id: event.id, reason: 'Sunucu bakımda' }, owner.session), 'iptal');
    const n = await h.sql.query("SELECT title, body FROM team_notices WHERE target = $1 AND kind = 'event' ORDER BY id DESC LIMIT 1", [fan.user.id]);
    assert.deepEqual(n.rows[0], { title: 'Etkinlik iptal edildi', body: '“Bilgi Kupası” iptal edildi. Neden: Sunucu bakımda' });
    const { v: v2 } = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
    await ok(call('POST', '/api/admin/live-settings', { changes: { event_reminders_off: null }, reason: 'Geri al', baseV: v2, confirm: true }, admin.session), 'geri');
  });
});

describe('Etkinlik paylaşımı', () => {
  test('arkadaşa mesajla gider; kaldırılan etkinlik bağlantıda durumunu söyler', async () => {
    const { owner, room } = await owned('Paylaşan');
    const admin = await h.account('Yönetim', 'admin');
    const friend = await signUp('Arkadaş');
    const sharer = await signUp('Gönderen');
    const { event } = await ok(call('POST', '/api/events', plan(room, { title: 'Şiir Akşamı' }), owner.session), 'başvuru');
    // Not approved yet: it can't be sent.
    const text = '📅 “Şiir Akşamı” etkinliğine gel! Etkinlik Merkezi’nde ara: Şiir Akşamı';
    assert.equal((await call('POST', '/api/messages', { to: friend.user.id, text, event: event.id, ref: rnd(8) }, sharer.session))[0], 400);
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: true }, admin.session), 'onay');
    assert.equal((await call('POST', '/api/messages', { to: friend.user.id, text, event: 'x', ref: rnd(8) }, sharer.session))[0], 400);

    const ref = rnd(8);
    const { message } = await ok(call('POST', '/api/messages', { to: friend.user.id, text, event: event.id, ref }, sharer.session), 'gönder');
    assert.equal(message.text, text, 'eski uygulama metni okur');
    assert.deepEqual([message.event.id, message.event.title, typeof message.event.startsAt], [event.id, 'Şiir Akşamı', 'string']);
    // A retry answers the same message with its event.
    const again = await ok(call('POST', '/api/messages', { to: friend.user.id, text, event: event.id, ref }, sharer.session), 'tekrar');
    assert.deepEqual([again.replay, again.message.id, again.message.event.id], [true, message.id, event.id]);
    const thread = (await ok(call('GET', `/api/messages?with=${sharer.user.id}`, null, friend.session), 'sohbet')).messages;
    assert.equal(thread[0].event.title, 'Şiir Akşamı');
    const conv = (await ok(call('GET', '/api/conversations', null, friend.session), 'sohbetler')).conversations;
    assert.equal(conv.find((x) => x.user.id === sharer.user.id).last.event.id, event.id);
    // A plain message stays as it was.
    const plain = (await ok(call('POST', '/api/messages', { to: friend.user.id, text: 'Görüşürüz', ref: rnd(8) }, sharer.session), 'düz')).message;
    assert.equal('event' in plain, false);
    // The friend's data copy holds the event the message carried.
    const copy = await ok(call('GET', '/api/me/export', null, friend.session), 'kopya');
    assert.ok(JSON.stringify(copy).includes(`"event":${event.id}`));

    // Taken down by the platform: the link opens it as removed, with the reason; it can't be shared any more.
    await ok(call('POST', '/api/admin/events/remove', { id: event.id, reason: 'Kurallara aykırı' }, admin.session), 'kaldır');
    const gone = (await ok(call('GET', `/api/events/one?id=${event.id}`, null, friend.session), 'bağlantı')).event;
    assert.deepEqual([gone.state, gone.removed, gone.cancelReason], ['cancelled', true, 'Kurallara aykırı']);
    assert.equal((await call('POST', '/api/messages', { to: friend.user.id, text, event: event.id, ref: rnd(8) }, sharer.session))[0], 400);
    // Cancelled by its organiser is not "removed".
    const other = (await ok(call('POST', '/api/events', plan(room, { title: 'Masal Gecesi', startsAt: inMinutes(400) }), owner.session), 'ikinci')).event;
    await ok(call('POST', '/api/admin/events/review', { id: other.id, approve: true }, admin.session), 'onay');
    await ok(call('POST', '/api/events/cancel', { id: other.id }, owner.session), 'iptal');
    assert.equal((await ok(call('GET', `/api/events/one?id=${other.id}`, null, friend.session), 'iptal görünür')).event.removed, false);
  });
});
