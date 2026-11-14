// Oda içi PK (pk.mjs) with a voice server (a fake LiveKit): who is on a mic is the LiveKit `seat` attribute, or the
// room's Patron seat while its holder is in the voice room. A PK starts with the people on the mics; whoever takes a
// mic later joins it from their own phone, a listener in the Balkon can't, and the room hears of the change.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
/** Who is in each LiveKit room, as ListParticipants answers: { identity, seat } (seat null: not on a mic). */
const voice = new Map();
const LK_PORT = 28000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    lkCalls.push({ method, body: b });
    const send = (j) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(j));
    if (method === 'ListParticipants')
      return send({ participants: (voice.get(b.room) ?? []).map((p) => ({ identity: p.identity, attributes: p.seat === null ? {} : { seat: String(p.seat) } })) });
    if (method === 'ListRooms') return send({ rooms: [] });
    send({});
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, PK_PREP_MS: '300' });
const { call, signUp } = h;
const inVoice = (room, ...people) => voice.set(`oda-${room}`, people.map(([u, seat = null]) => ({ identity: u.user.id, seat })));
/** The server's 'pk' packets to a room since call `from`. */
const pkPackets = (from, room) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData' && c.body.room === `oda-${room}`)
    .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')))
    .filter((p) => p.type === 'pk');
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

async function setUp() {
  const owner = await signUp('Ses Sahibi');
  const a = await signUp('Ayla');
  const b = await signUp('Berk');
  const [, j] = await call('POST', '/api/rooms', { title: `Ses PK ${rnd(2)}` }, owner.session);
  return { owner, a, b, room: j.room.id };
}

describe('Oda içi PK, ses sunucusuyla', () => {
  test('başlatma: listedekiler mikrofonda olmalı; Patron koltuğundaki de mikrofonda sayılır', async () => {
    const { owner, a, b, room } = await setUp();
    inVoice(room, [owner, 0], [a, 3], [b]);
    const start = (participants) => call('POST', '/api/rooms/pk', { room, mode: 'solo', durationMin: 15, participants, ref: rnd(6) }, owner.session);
    const [s1, e1] = await start([a.user.id, b.user.id]);
    assert.equal(s1, 409);
    assert.equal(e1.error, 'Berk artık mikrofonda değil. Yeniden dene.');
    // Berk on the Patron seat (a sitting that runs, in a room with the seat on): on a mic for the PK.
    await h.sql.query(
      `UPDATE rooms SET rules = rules || '{"bossSeat": true}'::jsonb, boss_id = $2, boss_since = now(), boss_until = now() + interval '10 minutes' WHERE id = $1`,
      [room, b.user.id],
    );
    const [s2, r2] = await start([owner.user.id, a.user.id, b.user.id]);
    assert.equal(s2, 200, r2.error);
    assert.deepEqual(r2.pk.participants, [owner.user.id, a.user.id, b.user.id]);
  });

  test('katılma: Balkon’daki katılamaz; mikrofona geçince katılır ve odaya haber gider', async () => {
    const { owner, a, b, room } = await setUp();
    inVoice(room, [owner, 0], [a], [b]);
    const [st, r] = await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 15, red: [owner.user.id], blue: [], ref: rnd(6) }, owner.session);
    assert.equal(st, 200, r.error);
    const [s1, e1] = await call('POST', '/api/rooms/pk/join', { room }, a.session);
    assert.equal(s1, 409);
    assert.equal(e1.error, 'PK’ya katılmak için mikrofonda olmalısın');
    inVoice(room, [owner, 0], [a, 2], [b]);
    const from = lkCalls.length;
    const [s2, j2] = await call('POST', '/api/rooms/pk/join', { room }, a.session);
    assert.equal(s2, 200, j2.error);
    assert.deepEqual([j2.pk.red, j2.pk.blue], [[owner.user.id], [a.user.id]]);
    assert.ok(await until(() => pkPackets(from, room).length === 1), 'oda yeniden okur');
    const again = lkCalls.length;
    assert.equal((await call('POST', '/api/rooms/pk/join', { room }, a.session))[0], 200);
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(pkPackets(again, room).length, 0, 'değişiklik yoksa haber de yok');
  });
});
