// A room needs its staff (room-autoclose.mjs) on a server without LiveKit's API: who is in a room is known only from
// LiveKit's webhooks (room_presence), and only once one came. Before that no count runs and nothing closes.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ ROOM_STAFF_SWEEP_MS: '100' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await wait(25);
  }
  return false;
};
const rowOf = async (room) => (await h.sql.query('SELECT no_staff_since, paused_at FROM rooms WHERE id = $1', [room])).rows[0];
const ago = (room, minutes) => h.sql.query('UPDATE rooms SET no_staff_since = now() - make_interval(mins => $2) WHERE id = $1', [room, minutes]);
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
const joined = (room, who) => ok(hook('participant_joined', { room: { name: `oda-${room}` }, participant: { identity: who.user.id, sid: `PA_${rnd(4)}` } }), 'katıldı');

describe('Yetkilisiz oda, yalnız webhooklarla', () => {
  test('webhook gelmeden kimse sayılmaz; gelince sayılır, dolunca dinlenir, sahip gelince açılır', async () => {
    const owner = await signUp('Kanca Sahibi');
    const guest = await signUp('Kanca Misafiri');
    const room = (await ok(call('POST', '/api/rooms', { title: 'Kanca Odası' }, owner.session), 'oda')).room.id;
    await ago(room, 6);
    await wait(400);
    assert.deepEqual(await rowOf(room), { no_staff_since: null, paused_at: null }, 'bilinmeyen: sayılmaz, kapanmaz');

    await ok(call('GET', `/token?room=oda-${room}`, null, guest.session), 'misafir jetonu');
    await joined(room, guest);
    assert.ok(await until(async () => (await rowOf(room)).no_staff_since !== null), 'sayım başlar');
    await ago(room, 6);
    assert.ok(await until(async () => (await rowOf(room)).paused_at !== null), 'oda dinlenir');
    assert.equal((await call('GET', `/token?room=oda-${room}`, null, guest.session))[0], 410);

    await joined(room, owner);
    assert.ok(await until(async () => (await rowOf(room)).paused_at === null), 'sahip görülünce açılır');
    assert.equal((await rowOf(room)).no_staff_since, null);
  });
});
