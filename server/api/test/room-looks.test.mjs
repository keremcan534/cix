// A look changed in the middle of a room (economy.mjs announceLook) against a real Postgres and a fake LiveKit:
// wearing or taking off a frame, buying an item, a new photo or name, hiding the gender. Every voice room the person
// is in hears the new look at once, in one packet from the server with what GET /api/looks answers (the photo too);
// a new name also becomes their LiveKit name. A room they are not in, and a 1v1 call, hear nothing.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 23000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
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
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
/** Coins straight into the account, as bought coins. */
async function credit(u, amount) {
  await q("INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, 'test', $2, $2, 0, $3)", [u.user.id, amount, `t-${rnd(6)}`]);
  await q('UPDATE users SET coins = coins + $2 WHERE id = $1', [u.user.id, amount]);
}
/** The person is connected to this voice room (what LiveKit's webhook writes). */
const enter = (u, room) => q("INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, 'PA_test')", [room, u.user.id]);
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

describe('Odada görünüm değişince', () => {
  test('çerçeve takılınca ve çıkarılınca odaya hemen duyurulur; görünüm GET /api/looks ile aynı', async () => {
    const u = await signUp('Çerçeveli');
    const other = await signUp('Bakan');
    await credit(u, 5_000);
    const room = `oda-${crypto.randomUUID()}`;
    await enter(u, room);
    await enter(other, room);

    let mark = lkCalls.length;
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-silver', price: 800, ref: rnd(6) }, u.session), 'satın alma');
    assert.ok(await until(() => looksPackets(mark).length === 1), 'satın alınca duyurulmadı');
    const bought = looksPackets(mark)[0];
    assert.equal(bought.room, room);
    assert.equal(bought.user, u.user.id);
    assert.equal(bought.look.frame, 'fr-silver', 'alınınca giyilir');
    const read = (await ok(call('GET', `/api/looks?ids=${u.user.id}`, null, other.session), 'görünüm')).looks[u.user.id];
    assert.deepEqual(bought.look, read);
    assert.ok('avatarUrl' in read, 'fotoğraf da görünümde');

    mark = lkCalls.length;
    await ok(call('POST', '/api/shop/equip', { slot: 'frame', sku: null }, u.session), 'çıkarma');
    assert.ok(await until(() => looksPackets(mark).length === 1), 'çıkarınca duyurulmadı');
    assert.equal(looksPackets(mark)[0].look.frame, null);

    mark = lkCalls.length;
    await ok(call('POST', '/api/shop/equip', { slot: 'frame', sku: 'fr-silver' }, u.session), 'takma');
    assert.ok(await until(() => looksPackets(mark).length === 1), 'takınca duyurulmadı');
    assert.equal(looksPackets(mark)[0].look.frame, 'fr-silver');
  });

  test('yeni fotoğraf ve ad odaya gider; ad LiveKit adı da olur; gizlenen cinsiyet halkanın rengini siler', async () => {
    const u = await signUp('Eski Ad');
    const roomA = `oda-${crypto.randomUUID()}`;
    const roomB = `oda-${crypto.randomUUID()}`;
    await enter(u, roomA);
    await enter(u, roomB);

    let mark = lkCalls.length;
    const photo = `https://depo.example/avatar/${u.user.id}/yeni.jpg`;
    await ok(call('PATCH', '/api/me', { avatarUrl: photo }, u.session), 'fotoğraf');
    assert.ok(await until(() => looksPackets(mark).length === 2), 'iki odaya da duyurulmalı');
    assert.deepEqual(looksPackets(mark).map((p) => p.room).sort(), [roomA, roomB].sort());
    assert.ok(looksPackets(mark).every((p) => p.look.avatarUrl === photo));
    assert.equal(lkCalls.slice(mark).filter((c) => c.method === 'UpdateParticipant').length, 0, 'ad değişmedi');

    mark = lkCalls.length;
    await ok(call('PATCH', '/api/me', { name: 'Yeni Ad' }, u.session), 'ad');
    assert.ok(await until(() => looksPackets(mark).length === 2));
    const renames = lkCalls.slice(mark).filter((c) => c.method === 'UpdateParticipant').map((c) => c.body);
    assert.deepEqual(renames.map((b) => [b.room, b.identity, b.name]).sort(), [roomA, roomB].sort().map((r) => [r, u.user.id, 'Yeni Ad']));

    // The same name again, or a field others don't see in the room: nothing goes out.
    mark = lkCalls.length;
    await ok(call('PATCH', '/api/me', { name: 'Yeni Ad', bio: 'Merhaba' }, u.session), 'aynı ad');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(looksPackets(mark).length, 0);

    mark = lkCalls.length;
    await ok(call('PATCH', '/api/me', { gender: 'Kadın' }, u.session), 'cinsiyet');
    assert.ok(await until(() => looksPackets(mark).length === 2), 'cinsiyet seçilince duyurulmadı');
    assert.ok(looksPackets(mark).every((p) => p.look.gender === 'Kadın'));
    mark = lkCalls.length;
    await ok(call('PATCH', '/api/me/extras', { genderHidden: true }, u.session), 'gizle');
    assert.ok(await until(() => looksPackets(mark).length === 2), 'gizlenince duyurulmadı');
    assert.ok(looksPackets(mark).every((p) => p.look.gender === null));
  });

  test('odada olmayan ve bire bir görüşmedeki kişi için paket gitmez', async () => {
    const u = await signUp('Odasız');
    await credit(u, 1_000);
    await q("INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, 'PA_call')", [`call-${rnd(6)}`, u.user.id]);
    const mark = lkCalls.length;
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-neon', price: 150, ref: rnd(6) }, u.session), 'satın alma');
    await ok(call('PATCH', '/api/me', { avatarUrl: `https://depo.example/avatar/${u.user.id}/a.jpg` }, u.session), 'fotoğraf');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(looksPackets(mark).length, 0);
  });
});
