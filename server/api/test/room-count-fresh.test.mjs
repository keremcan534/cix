// Odalar's people count right after someone leaves (owners, 22 Nov 2026): two people in a room, one left, the room
// showed 1 inside but 2 on Odalar for a while. The lists read LiveKit's count at most every 10 s; a room whose people
// changed (a webhook) after that count was asked for now shows room_presence, which already has the change.
// A fake LiveKit says how many people each room has, and keeps saying it until the test changes it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const people = new Map();
const lk = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const body = method === 'ListRooms' ? { rooms: [...people].map(([name, n]) => ({ name, num_participants: n })) } : {};
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
});
await new Promise((r) => lk.listen(0, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${lk.address().port}` });
const { call, signUp } = h;

const sign = (body) => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
  return `${hp}.${crypto.createHmac('sha256', 'testsecret').update(hp).digest('base64url')}`;
};
const hook = async (event, extra = {}) => {
  const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
  const [st, j] = await call('POST', '/api/livekit/webhook', body, null, { authorization: sign(body), 'content-type': 'application/webhook+json' });
  assert.equal(st, 200, j.error);
};
const joined = (name, u, sid) => hook('participant_joined', { room: { name }, participant: { identity: u.user.id, sid } });
const left = (name, u, sid) => hook('participant_left', { room: { name }, participant: { identity: u.user.id, sid } });

describe('Oda listesindeki kişi sayısı', () => {
  test('biri çıkınca liste beklemeden 1 gösterir; dokunulmayan odada LiveKit sayısı kalır', async () => {
    const [owner, guest, viewer, other] = await Promise.all(['Sahip', 'Misafir', 'Bakan', 'Öbür Sahip'].map((n) => signUp(n)));
    const [, a] = await call('POST', '/api/rooms', { title: 'İki Kişilik' }, owner.session);
    const [, b] = await call('POST', '/api/rooms', { title: 'Öbür Oda' }, other.session);
    const nameA = `oda-${a.room.id}`;
    const nameB = `oda-${b.room.id}`;
    await joined(nameA, owner, 'PA_o');
    await joined(nameA, guest, 'PA_g');
    await joined(nameB, other, 'PA_x');
    people.set(nameA, 2);
    // LiveKit also counts someone our webhooks never told of (they reach us late or not at all).
    people.set(nameB, 3);
    const count = async (id) => (await call('GET', '/api/rooms', null, viewer.session))[1].rooms.find((r) => r.id === id)?.listeners;
    // Let the count be read after the joins: LiveKit's numbers.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(await count(a.room.id), 2);
    assert.equal(await count(b.room.id), 3, 'LiveKit sayısı');

    // The guest leaves; LiveKit's count in our cache (10 s) still says 2.
    await left(nameA, guest, 'PA_g');
    assert.equal(await count(a.room.id), 1, 'çıkış hemen görünür');
    assert.equal(await count(b.room.id), 3, 'öbür oda LiveKit sayısıyla kalır');
    // Back in at once: 2 again, at once.
    await joined(nameA, guest, 'PA_g2');
    assert.equal(await count(a.room.id), 2);
  });
});
