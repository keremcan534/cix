// Güncelleme 6: "fotoğraf ve çerçeve değişince mikrofonda ve balkonda değişmiyor, odadan çıkıp girmek gerekiyor".
// On the live server LiveKit's webhooks may not reach the API, so room_presence stays empty and a changed look was
// never announced. The rooms now also come from LiveKit itself (ListRooms, then GetParticipant per open room), and the
// packet's photo address is the one phones load (core.mjs filesOut), the same as GET /api/looks answers.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const ROOM_IN = `oda-${crypto.randomUUID()}`;
const ROOM_OUT = `oda-${crypto.randomUUID()}`;
/** Who LiveKit says is in which room (set per test). */
const inRoom = new Map();
const lkCalls = [];
const LK_PORT = 24000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    lkCalls.push({ method, body: b });
    const json = (code, x) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(x));
    if (method === 'ListRooms') return json(200, { rooms: [{ name: ROOM_IN, num_participants: 2 }, { name: ROOM_OUT, num_participants: 3 }, { name: `call-${rnd(6)}`, num_participants: 2 }] });
    if (method === 'GetParticipant') return inRoom.get(b.identity) === b.room ? json(200, { identity: b.identity }) : json(404, { code: 'not_found', msg: 'participant not found' });
    json(200, {});
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const CDN = 'https://pub-test.r2.dev';
const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, S3_PUBLIC_URL: CDN, PUBLIC_URL: 'https://api.example' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const looksPackets = (from) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => p.type === 'look');
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

describe('Webhook gelmese de görünüm odaya anında duyurulur', () => {
  test('room_presence boşken: kişi hangi odadaysa yalnız oraya, tek paket', async () => {
    const u = await signUp('Webhooksuz');
    await h.credit(u.user.id, 5_000);
    inRoom.set(u.user.id, ROOM_IN);
    assert.equal((await h.sql.query('SELECT 1 FROM room_presence WHERE identity = $1', [u.user.id])).rowCount, 0, 'kayıt yok');

    const mark = lkCalls.length;
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-silver', price: 800, ref: rnd(6) }, u.session), 'satın alma');
    assert.ok(await until(() => looksPackets(mark).length >= 1), 'çerçeve duyurulmadı');
    await new Promise((r) => setTimeout(r, 150));
    const sent = looksPackets(mark);
    assert.deepEqual(
      sent.map((p) => p.room),
      [ROOM_IN],
      'yalnız bulunduğu oda (diğer açık oda ve bire bir görüşme hariç)',
    );
    assert.equal(sent[0].look.frame, 'fr-silver');
  });

  test('yeni fotoğrafın adresi telefonların açtığı adres: GET /api/looks ile aynı, depo adresi değil', async () => {
    const u = await signUp('Fotoğraflı');
    const other = await signUp('Bakan');
    inRoom.set(u.user.id, ROOM_IN);
    const mark = lkCalls.length;
    await ok(call('PATCH', '/api/me', { avatarUrl: `${CDN}/avatar/${u.user.id}/yeni.jpg` }, u.session), 'fotoğraf');
    assert.ok(await until(() => looksPackets(mark).length === 1), 'fotoğraf duyurulmadı');
    const packet = looksPackets(mark)[0];
    const read = (await ok(call('GET', `/api/looks?ids=${u.user.id}`, null, other.session), 'görünüm')).looks[u.user.id];
    assert.equal(packet.look.avatarUrl, read.avatarUrl);
    assert.ok(!packet.look.avatarUrl.startsWith(CDN), `depo adresi gitti: ${packet.look.avatarUrl}`);
    assert.ok(packet.look.avatarUrl.startsWith('https://api.example/'), packet.look.avatarUrl);
  });

  test('hiçbir odada değilse paket gitmez', async () => {
    const u = await signUp('Dışarıda');
    await h.credit(u.user.id, 1_000);
    inRoom.delete(u.user.id);
    const mark = lkCalls.length;
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-neon', price: 150, ref: rnd(6) }, u.session), 'satın alma');
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(looksPackets(mark).length, 0);
  });
});
