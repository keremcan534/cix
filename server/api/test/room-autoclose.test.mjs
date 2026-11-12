// A room needs its staff (room-autoclose.mjs) against a real Postgres and a fake LiveKit's API: the count starts when
// neither the owner nor an admin is in the voice room and stops when one comes; after the live minutes the phones get
// the notice, the voice room ends and the room rests (its settings, admins and members kept): only its staff get a
// voice token and their coming opens it again. What LiveKit can't answer restarts the count; nothing closes on it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
// The voice rooms LiveKit has open: name → identities in it; and whether it answers.
const voice = new Map();
let failList = false;
const failPeople = new Set();
const LK_PORT = 27000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    lkCalls.push({ method, body: b });
    const send = (status, j) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(j));
    if (method === 'ListRooms') return failList ? send(500, {}) : send(200, { rooms: [...voice].map(([name, ids]) => ({ name, num_participants: ids.length })) });
    if (method === 'ListParticipants') {
      if (failPeople.has(b.room)) return send(500, {});
      return send(200, { participants: (voice.get(b.room) ?? []).map((identity) => ({ identity, attributes: {} })) });
    }
    if (method === 'DeleteRoom') voice.delete(b.room);
    send(200, {});
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, ROOM_STAFF_SWEEP_MS: '150', ROOM_CLOSE_NOTICE_MS: '30' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
const rowOf = async (room) => (await h.sql.query('SELECT no_staff_since, paused_at, closed_at FROM rooms WHERE id = $1', [room])).rows[0];
/** Waits for two whole sweeps after now. */
const sweeps = async () => {
  const n = lkCalls.filter((c) => c.method === 'ListRooms').length;
  assert.ok(await until(() => lkCalls.filter((c) => c.method === 'ListRooms').length >= n + 2), 'tarama dönmüyor');
};
const token = (s, room) => call('GET', `/token?room=oda-${room}`, null, s.session);
const listed = async (s, room) => (await ok(call('GET', '/api/rooms', null, s.session), 'liste')).rooms.some((r) => r.id === room);
const packets = (from) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')));
let admin;
async function setLive(changes) {
  admin ??= await h.account('Yönetici', 'admin');
  const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
  const [st, j] = await call('POST', '/api/admin/live-settings', { changes, reason: 'Oda kapanma testi', baseV: view.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}
const ago = (room, minutes) => h.sql.query('UPDATE rooms SET no_staff_since = now() - make_interval(mins => $2) WHERE id = $1', [room, minutes]);

// LiveKit's signed webhook (as launch.test.mjs).
const sign = (body) => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
  return `${hp}.${crypto.createHmac('sha256', 'testsecret').update(hp).digest('base64url')}`;
};
const hook = (event, extra) => {
  const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
  return call('POST', '/api/livekit/webhook', body, null, { authorization: sign(body), 'content-type': 'application/webhook+json' });
};

describe('Yetkilisiz oda', () => {
  let owner, mod, guest, room, name;
  test('sahip ya da yönetici odadayken sayılmaz; ikisi de yokken sayım başlar', async () => {
    owner = await signUp('Oda Sahibi');
    mod = await signUp('Yönetici Kişi');
    guest = await signUp('Misafir');
    room = (await ok(call('POST', '/api/rooms', { title: 'Yetkili Odası' }, owner.session), 'oda')).room.id;
    name = `oda-${room}`;
    await ok(call('POST', '/api/rooms/admin', { room, user: mod.user.id }, owner.session), 'yönetici');
    await ok(call('POST', '/api/rooms/update', { id: room, rules: { joinMode: 'apply', bot: true } }, owner.session), 'kurallar');
    voice.set(name, [owner.user.id, guest.user.id]);
    await sweeps();
    assert.equal((await rowOf(room)).no_staff_since, null);
    voice.set(name, [guest.user.id]);
    await sweeps();
    assert.notEqual((await rowOf(room)).no_staff_since, null, 'sahip çıkınca sayım başlar');
    voice.set(name, [guest.user.id, mod.user.id]);
    await sweeps();
    assert.equal((await rowOf(room)).no_staff_since, null, 'yönetici gelince durur');
  });

  test('LiveKit cevap vermezse sayım baştan başlar, oda kapanmaz', async () => {
    voice.set(name, [guest.user.id]);
    await sweeps();
    await ago(room, 6);
    failPeople.add(name);
    await sweeps();
    assert.deepEqual(await rowOf(room), { no_staff_since: null, paused_at: null, closed_at: null });
    failPeople.delete(name);
    failList = true;
    await sweeps();
    await new Promise((r) => setTimeout(r, 400));
    await ago(room, 6);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal((await rowOf(room)).paused_at, null, 'bilinmeyen veriyle kapanmaz');
    assert.equal((await rowOf(room)).no_staff_since, null);
    failList = false;
  });

  test('süre Canlı ayarlardan: dolunca herkese haber, sesli oda biter, oda dinlenir', async () => {
    voice.set(name, [guest.user.id]);
    await sweeps();
    await setLive({ room_staff_away_minutes: 10 });
    await ago(room, 6);
    await sweeps();
    assert.equal((await rowOf(room)).paused_at, null, '10 dakika dolmadı');
    const from = lkCalls.length;
    await setLive({ room_staff_away_minutes: null });
    assert.ok(await until(async () => (await rowOf(room)).paused_at !== null), 'oda dinlenir');
    assert.ok(await until(() => lkCalls.slice(from).some((c) => c.method === 'DeleteRoom' && c.body.room === name)), 'sesli oda biter');
    const calls = lkCalls.slice(from);
    const notice = calls.findIndex((c) => c.method === 'SendData' && c.body.room === name);
    const del = calls.findIndex((c) => c.method === 'DeleteRoom' && c.body.room === name);
    assert.ok(notice >= 0 && notice < del, 'önce haber');
    assert.deepEqual(packets(from).find((p) => p.type === 'closed'), { type: 'closed', reason: 'no_staff', minutes: 5 });
    assert.equal((await rowOf(room)).closed_at, null, 'oda kapanmış sayılmaz: sahibinin odası olarak kalır');
  });

  test('dinlenen odaya yalnız yetkili girer; listeden çıkar; ayarları, yöneticisi duruyor', async () => {
    const [st, j] = await token(guest, room);
    assert.equal(st, 410);
    assert.equal(j.error, 'Oda şu an kapalı: yetkilisi gelince açılır');
    assert.equal(await listed(guest, room), false);
    assert.equal(await listed(owner, room), true, 'sahip kendi odasını görür');
    assert.equal(await listed(mod, room), true, 'yönetici de görür');
    const seen = (await ok(call('GET', `/api/room?id=${room}`, null, guest.session), 'oda')).room;
    assert.deepEqual([seen.paused, seen.closed, seen.rules.joinMode, seen.rules.bot], [true, false, 'apply', true]);
    const staff = await ok(call('GET', `/api/rooms/staff?room=${room}`, null, guest.session), 'yetkililer');
    assert.deepEqual(staff.admins.map((a) => a.id), [mod.user.id]);
    // Eski bir jetonla gelen misafir sesli odadan çıkarılır.
    const from = lkCalls.length;
    await ok(hook('participant_joined', { room: { name }, participant: { identity: guest.user.id, sid: `PA_${rnd(4)}` } }), 'katıldı');
    assert.ok(lkCalls.slice(from).some((c) => c.method === 'RemoveParticipant' && c.body.identity === guest.user.id));
    // "Oda oluştur" sahibe aynı odayı döndürür (yeni oda açılmaz).
    assert.equal((await call('POST', '/api/rooms', { title: 'Yeni' }, owner.session))[0], 409);
  });

  test('yönetici gelince oda açılır, misafir yeniden girer', async () => {
    await ok(token(mod, room), 'yönetici jetonu');
    // The room opens. The staff count itself may start again at once: the 150 ms sweep can run before the moderator
    // shows up in the voice room, which only restarts the count.
    const row = await rowOf(room);
    assert.deepEqual([row.paused_at, row.closed_at], [null, null]);
    await ok(token(guest, room), 'misafir jetonu');
    // Webhooks came (the guest's above): the list shows rooms someone is in.
    await ok(hook('participant_joined', { room: { name }, participant: { identity: mod.user.id, sid: `PA_${rnd(4)}` } }), 'yönetici katıldı');
    assert.equal(await listed(guest, room), true);
  });

  test('sesli odada görünen yetkili de açar; boş oda haber ve silme olmadan dinlenir', async () => {
    await h.sql.query('UPDATE rooms SET paused_at = now() WHERE id = $1', [room]);
    voice.set(name, [owner.user.id]);
    assert.ok(await until(async () => (await rowOf(room)).paused_at === null), 'sahip görülünce açılır');
    voice.delete(name);
    await sweeps();
    await ago(room, 6);
    const from = lkCalls.length;
    assert.ok(await until(async () => (await rowOf(room)).paused_at !== null));
    assert.equal(lkCalls.slice(from).filter((c) => (c.method === 'SendData' || c.method === 'DeleteRoom') && c.body.room === name).length, 0, 'kimse yokken haber de silme de yok');
  });
});
