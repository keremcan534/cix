// Güncelleme 7, item 15 when LiveKit's webhooks don't reach the API (room_presence stays empty, live.mjs
// presenceTracked false): the profile's "Şu an odada" and the token's `via` ask LiveKit itself. Profiles opened
// close together share one look at LiveKit (presence-room.mjs voiceWhere: one ListRooms, a ListParticipants per
// room with people), never one per profile.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startApi, tokenOf } from './harness.mjs';

/** Who LiveKit says is in which room (identity → LiveKit room name). */
const inRoom = new Map();
const lkCalls = [];
const LK_PORT = 25000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    lkCalls.push({ method, body: b });
    const json = (code, x) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(x));
    const rooms = [...new Set(inRoom.values())];
    if (method === 'ListRooms') return json(200, { rooms: [...rooms.map((name) => ({ name, num_participants: [...inRoom.values()].filter((r) => r === name).length })), { name: 'call-x1', num_participants: 2 }] });
    if (method === 'ListParticipants') return json(200, { participants: [...inRoom].filter(([, r]) => r === b.room).map(([identity]) => ({ identity, attributes: {} })) });
    if (method === 'GetParticipant') return inRoom.get(b.identity) === b.room ? json(200, { identity: b.identity }) : json(404, { code: 'not_found', msg: 'participant not found' });
    json(200, {});
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const calls = (method, from = 0) => lkCalls.slice(from).filter((c) => c.method === method).length;

describe('Webhook gelmese de "Şu an odada"', () => {
  test('oda LiveKit’ten okunur; yakın zamanda açılan profiller tek okumayı paylaşır; via LiveKit’e sorulur', async () => {
    const owner = await signUp('Oda Sahibi');
    const artemis = await signUp('Artemis');
    const kaan = await signUp('Kaan');
    const ayla = await signUp('Ayla');
    const room = (await ok(call('POST', '/api/rooms', { title: 'Webhooksuz Oda' }, owner.session), 'oda')).room;
    inRoom.set(artemis.user.id, `oda-${room.id}`);
    assert.equal((await h.sql.query('SELECT 1 FROM room_presence')).rowCount, 0, 'kayıt yok');

    const mark = lkCalls.length;
    const [a, b] = await Promise.all([kaan, ayla].map((v) => ok(call('GET', `/api/user?id=${artemis.user.id}`, null, v.session), 'profil')));
    assert.deepEqual(a.room, { id: room.id, title: 'Webhooksuz Oda', locked: false });
    assert.deepEqual(b.room, a.room);
    assert.equal((await ok(call('GET', `/api/user?id=${owner.user.id}`, null, kaan.session), 'sahip')).room, null, 'odada değil');
    assert.equal(calls('ListParticipants', mark), 1, 'oda başına bir okuma, profiller paylaşır (görüşme odası sorulmaz)');

    const t = await ok(call('GET', `/token?room=oda-${room.id}&via=${artemis.user.id}`, null, kaan.session), 'token');
    assert.deepEqual(tokenOf(t.token).attributes, { via: artemis.user.id });
    inRoom.delete(artemis.user.id);
    const gone = await ok(call('GET', `/token?room=oda-${room.id}&via=${artemis.user.id}`, null, kaan.session), 'çıktı');
    assert.equal(gone.via, null, 'LiveKit odada değil diyor');
  });
});
