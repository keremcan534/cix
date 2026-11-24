// DJ modu (dj-live.mjs): only the room's owner and its DJs turn it on, on a mic in the voice room, one at a time in a
// room (dj_live_per_room), never while it is off (dj_live_kbps 0) or the room closed; on and off write the `dj`
// attribute in LiveKit; a DJ taken off the DJs or made admin is taken out of it. A fake LiveKit holds who is in the
// room, on which mic and with which attributes, and records what the API asks of it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
/** LiveKit room name → identity → attributes. */
const rooms = new Map();
const LK_PORT = 23000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    lkCalls.push({ method, body: b });
    const people = rooms.get(b.room);
    if (method === 'ListParticipants') {
      const participants = [...(people ?? new Map())].map(([identity, attributes]) => ({ identity, attributes }));
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ participants }));
    }
    if (method === 'UpdateParticipant') {
      const p = people?.get(b.identity);
      if (!p) return res.writeHead(404).end('{}');
      Object.assign(p, b.attributes ?? {});
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];
/** Someone in the LiveKit room, on mic `seat` (null: listening). */
const enter = (room, who, seat = null) => {
  const name = `oda-${room}`;
  if (!rooms.has(name)) rooms.set(name, new Map());
  rooms.get(name).set(who.user.id, { seat: seat === null ? '' : String(seat) });
};
const attr = (room, who) => rooms.get(`oda-${room}`)?.get(who.user.id)?.dj ?? '';
const djLive = (room, who, on) => call('POST', '/api/rooms/dj-live', { room, on }, who.session);
const view = (room, who) => ok(call('GET', `/api/rooms/dj-live?room=${room}`, null, who.session), 'durum');

describe('DJ modu', () => {
  test('kim açar: sahip ve DJ’ler, mikrofonda; yönetici ve dinleyici açamaz', async () => {
    const owner = await signUp('DJ Odası');
    const dj = await signUp('Dj Mikser');
    const admin = await signUp('Oda Yöneticisi');
    const guest = await signUp('Dinleyici');
    const room = (await ok(call('POST', '/api/rooms', { title: `DJ ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: true }, owner.session), 'dj');

    assert.equal((await view(room, guest)).may, false, 'dinleyici');
    assert.equal((await view(room, admin)).may, false, 'yönetici DJ değil');
    const v = await view(room, dj);
    assert.deepEqual([v.may, v.on, v.kbps, v.perRoom, v.live], [true, false, 96, 1, []]);

    assert.equal(await status(djLive(room, dj, true)), 409, 'odada değil');
    enter(room, dj);
    assert.equal(await status(djLive(room, dj, true)), 409, 'mikrofonda değil');
    enter(room, guest, 2);
    assert.equal(await status(djLive(room, guest, true)), 403, 'dinleyici mikrofonda olsa da');
    enter(room, admin, 3);
    assert.equal(await status(djLive(room, admin, true)), 403, 'yönetici');
    assert.equal(await status(call('POST', '/api/rooms/dj-live', { room, on: 'evet' }, dj.session)), 400);

    enter(room, dj, 1);
    assert.deepEqual(await ok(djLive(room, dj, true), 'aç'), { on: true, kbps: 96 });
    assert.equal(attr(room, dj), '1');
    const now = await view(room, guest);
    assert.equal(now.live.length, 1);
    assert.equal(now.live[0].name, 'Dj Mikser');
    assert.match(now.live[0].publicNo, /^\d{12}$/, 'uygulama ID’si');
    assert.equal((await view(room, dj)).on, true);

    // Someone who may not writes their own attribute (a phone can): not counted, not listed.
    rooms.get(`oda-${room}`).get(guest.user.id).dj = '1';
    assert.equal((await view(room, owner)).live.length, 1);

    // One at a time: the owner waits for the DJ.
    enter(room, owner, 0);
    assert.equal(await status(djLive(room, owner, true)), 409, 'odada başka DJ canlı');
    assert.deepEqual(await ok(djLive(room, dj, false), 'kapat'), { on: false, kbps: 96 });
    assert.equal(attr(room, dj), '');
    await ok(djLive(room, owner, true), 'sahip açar');
    assert.equal(attr(room, owner), '1');
    // Off is always allowed, even for someone who never may (it only clears their attribute).
    await ok(djLive(room, guest, false), 'kapatmak serbest');
    assert.equal(attr(room, guest), '');
  });

  test('DJ’likten alınan ya da yönetici yapılan DJ modundan çıkar; kapalı oda ve kapalı ayar', async () => {
    const owner = await signUp('İkinci Oda');
    const dj = await signUp('Dj Bir');
    const dj2 = await signUp('Dj İki');
    const room = (await ok(call('POST', '/api/rooms', { title: `DJ ${rnd(2)}` }, owner.session), 'oda')).room.id;
    for (const p of [dj, dj2]) await ok(call('POST', '/api/rooms/dj', { room, user: p.user.id, dj: true }, owner.session), 'dj');
    enter(room, dj, 1);
    enter(room, dj2, 2);

    await ok(djLive(room, dj, true), 'aç');
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: false }, owner.session), 'DJ’likten al');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(attr(room, dj), '', 'DJ’likten alınınca kapandı');
    assert.equal(await status(djLive(room, dj, true)), 403, 'artık DJ değil');

    await ok(djLive(room, dj2, true), 'ikinci DJ açar');
    await ok(call('POST', '/api/rooms/admin', { room, user: dj2.user.id }, owner.session), 'yönetici yap');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(attr(room, dj2), '', 'yönetici yapılınca DJ modundan çıktı');

    // The owners turn DJ modu off in Canlı ayarlar: nobody may turn it on.
    const admin = await signUp('Merkez');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    const settings = async (changes) => {
      const v = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
      await ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Test', baseV: v.v, confirm: true }, admin.session), 'ayar');
    };
    enter(room, owner, 0);
    await settings({ dj_live_kbps: 0 });
    assert.equal((await view(room, owner)).may, false);
    assert.equal(await status(djLive(room, owner, true)), 403, 'kapalı');
    await settings({ dj_live_kbps: 128, dj_live_per_room: 2 });
    assert.deepEqual(await ok(djLive(room, owner, true), 'açık'), { on: true, kbps: 128 });
    assert.equal((await view(room, owner)).perRoom, 2);
    await settings({ dj_live_kbps: 96, dj_live_per_room: 1 });

    // A closed room: no DJ modu (off still answers).
    await h.sql.query('UPDATE rooms SET closed_at = now() WHERE id = $1', [room]);
    assert.equal(await status(djLive(room, owner, true)), 410);
    await ok(djLive(room, owner, false), 'kapalı odada kapatmak');
    assert.equal((await view(room, owner)).may, false);
  });

  test('ses odasında kimse yoksa açılmaz', async () => {
    const owner = await signUp('Sunucusuz');
    const room = (await ok(call('POST', '/api/rooms', { title: `DJ ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const calls = lkCalls.length;
    assert.equal(await status(djLive(room, owner, true)), 409, 'LiveKit odayı tanımıyor: odada değil');
    assert.ok(lkCalls.slice(calls).some((c) => c.method === 'ListParticipants'));
  });
});
