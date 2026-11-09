// Hareketli in rooms (room-fx.mjs) against a real Postgres and a fake LiveKit: a paid room animation is charged at
// the server's price and announced to the room once; a free reaction, a mic effect, a campaign outside its window,
// a short balance and a closed room charge nothing and announce nothing.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { ROOM_ANIMS } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 22000 + (process.pid % 900);
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
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const topUp = (s, amount = 10_000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s), 'yükleme');
async function room(owner) {
  const j = await ok(call('POST', '/api/rooms', { title: `Efekt ${rnd(2)}` }, owner.session), 'oda');
  return j.room.id;
}
const send = (s, body) => call('POST', '/api/rooms/animation', { ref: rnd(6), ...body }, s);
const packets = (from) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => p.type === 'anim');
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

describe('Odada ücretli animasyon', () => {
  test('sunucunun fiyatıyla ödenir, odaya bir kez duyurulur, aynı istek tekrar ödenmez', async () => {
    const owner = await signUp('Oda Sahibi');
    const id = await room(owner);
    const fan = await signUp('Cömert');
    await topUp(fan.session);
    const before = (await me(fan.session)).coins;
    const mark = lkCalls.length;
    const ref = rnd(6);
    // A price in the body is ignored: the catalog's is taken.
    const r = await ok(send(fan.session, { room: id, animationId: 'an-coin-rain', price: 1, ref }), 'animasyon');
    assert.equal(r.price, ROOM_ANIMS.get('an-coin-rain').price);
    assert.equal(r.user.coins, before - 1_999);
    assert.equal((await me(fan.session)).coins, before - 1_999);
    assert.ok(await until(() => packets(mark).length === 1), 'odaya duyurulmadı');
    assert.deepEqual(packets(mark)[0], { room: `oda-${id}`, type: 'anim', animationId: 'an-coin-rain', from: fan.user.id, eventId: r.eventId });
    const row = (await h.sql.query('SELECT room, sender, animation_id, price FROM room_animations WHERE id = $1', [r.eventId])).rows[0];
    assert.deepEqual(row, { room: `oda-${id}`, sender: fan.user.id, animation_id: 'an-coin-rain', price: 1_999 });
    const led = (await h.sql.query("SELECT amount, reason FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [fan.user.id, ref])).rows;
    assert.deepEqual(led.map((x) => [Number(x.amount), x.reason]), [[-1_999, 'Animasyon: Altın Yağmuru']]);

    // The same request again (a retry after a lost answer): nothing more is taken or announced.
    const again = await ok(send(fan.session, { room: id, animationId: 'an-coin-rain', ref }), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(again.eventId, r.eventId);
    assert.equal((await me(fan.session)).coins, before - 1_999);
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(packets(mark).length, 1);
  });

  test('ücretsiz tepki, mikrofon efekti, bilinmeyen ve süresi dışındaki kampanya reddedilir; hiçbir şey alınmaz', async () => {
    const owner = await signUp('Oda Sahibi');
    const id = await room(owner);
    const fan = await signUp('Deneyen');
    await topUp(fan.session);
    const before = (await me(fan.session)).coins;
    const mark = lkCalls.length;
    for (const animationId of ['an-hearts', 'an-mic-neon', 'yok', 42]) {
      const [st] = await send(fan.session, { room: id, animationId });
      assert.equal(st, 400, String(animationId));
    }
    // The New Year one sells only from 20 December (UTC) to 7 January.
    const ny = ROOM_ANIMS.get('an-newyear');
    const today = new Date().toISOString().slice(0, 10);
    if (today < ny.from || today > ny.until) {
      const [st, j] = await send(fan.session, { room: id, animationId: 'an-newyear' });
      assert.equal(st, 400);
      assert.match(j.error, /kullanılamıyor/);
    }
    assert.equal((await me(fan.session)).coins, before);
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(packets(mark).length, 0);
  });

  test('yetersiz jeton, kapalı oda ve oda dışı: hiçbir şey alınmaz, duyurulmaz', async () => {
    const owner = await signUp('Oda Sahibi');
    const id = await room(owner);
    const poor = await signUp('Az Jetonlu');
    const mark = lkCalls.length;
    const [st, j] = await send(poor.session, { room: id, animationId: 'an-dragon' });
    assert.equal(st, 409);
    assert.equal(j.code, 'insufficient');
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM room_animations WHERE sender = $1', [poor.user.id])).rows[0].n, 0);

    const rich = await signUp('Zengin');
    await topUp(rich.session);
    const before = (await me(rich.session)).coins;
    assert.equal((await send(rich.session, { animationId: 'an-bouquet' }))[0], 400);
    assert.equal((await send(rich.session, { room: 'herhangi-bir-yer', animationId: 'an-bouquet' }))[0], 400);
    await ok(call('POST', '/api/rooms/close', { id }, owner.session), 'kapat');
    assert.equal((await send(rich.session, { room: id, animationId: 'an-bouquet' }))[0], 404);
    assert.equal((await me(rich.session)).coins, before);
    await new Promise((res) => setTimeout(res, 100));
    assert.equal(packets(mark).length, 0);
  });
});
