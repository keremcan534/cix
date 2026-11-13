// Koltuk rengi (room-seat-color.mjs): only the room's owner picks the empty mics' color. A paid color is bought once
// for the room with the owner's coins and kept; the free turquoise and an owned color cost nothing. The color goes
// into the LiveKit metadata so every phone repaints. A fake LiveKit records what the API asks of it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { SEAT_COLORS } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 23000 + ((process.pid + 450) % 900);
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
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];
const lastMeta = (room) => {
  const c = lkCalls.filter((x) => x.method === 'UpdateRoomMetadata' && x.body.room === `oda-${room}`).pop();
  return c && JSON.parse(c.body.metadata);
};
async function credit(u, amount, channel = 'test') {
  await q('INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, $2, $3, $3, 0, $4)', [u.user.id, channel, amount, `t-${rnd(6)}`]);
  await q('UPDATE users SET coins = coins + $2 WHERE id = $1', [u.user.id, amount]);
}
const coinsOf = async (u) => Number((await q('SELECT coins FROM users WHERE id = $1', [u.user.id])).rows[0].coins);
const PINK = SEAT_COLORS.get('pembe').price;

describe('Koltuk rengi', () => {
  test('sahip bir kez satın alır, herkes metadatadan görür; sahip olunan renge dönmek ücretsiz', async () => {
    const owner = await signUp('Renk Sahibi');
    await credit(owner, PINK + 500);
    const room = (await ok(call('POST', '/api/rooms', { title: `Renk ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const set = (color, ref = rnd(6)) => call('POST', '/api/rooms/seat-color', { room, color, ref }, owner.session);

    assert.deepEqual(await ok(call('GET', `/api/rooms/seat-color?room=${room}`, null, owner.session), 'oku'), { color: 'turkuaz', owned: [] });

    const ref = rnd(6);
    const bought = await ok(set('pembe', ref), 'pembe');
    assert.equal(bought.color, 'pembe');
    assert.deepEqual(bought.owned, ['pembe']);
    assert.equal(bought.price, PINK);
    assert.equal(bought.user.coins, 500);
    assert.equal(lastMeta(room).seatColor, 'pembe', 'metadata taşır');
    const ledger = (await q("SELECT amount, reason FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [owner.user.id, ref])).rows;
    assert.deepEqual(ledger.map((x) => [Number(x.amount), x.reason]), [[-PINK, 'Koltuk rengi: Pembe']]);

    const back = await ok(set('turkuaz'), 'turkuaz ücretsiz');
    assert.equal(back.price, 0);
    assert.equal(lastMeta(room).seatColor, null, 'turkuaz: boş');
    const again = await ok(set('pembe'), 'sahip olunan pembe');
    assert.equal(again.price, 0, 'ikinci kez ödenmez');
    assert.equal(await coinsOf(owner), 500);
    assert.equal(lastMeta(room).seatColor, 'pembe');
    assert.deepEqual(await ok(call('GET', `/api/rooms/seat-color?room=${room}`, null, owner.session), 'oku'), { color: 'pembe', owned: ['pembe'] });
  });

  test('yetersiz jeton 409 ve hiçbir şey değişmez; yönetici ve üye değiştiremez; bozuk renk 400; kapalı oda 410', async () => {
    const owner = await signUp('Fakir Sahip');
    const admin = await signUp('Renk Yöneticisi');
    await credit(owner, 100);
    const room = (await ok(call('POST', '/api/rooms', { title: `Fakir ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id, super: true }, owner.session), 'süper yönetici');
    const set = (color, who = owner) => call('POST', '/api/rooms/seat-color', { room, color, ref: rnd(6) }, who.session);

    const [st, j] = await set('gumus');
    assert.equal(st, 409);
    assert.equal(j.code, 'insufficient');
    assert.equal(await coinsOf(owner), 100);
    assert.equal((await q('SELECT count(*)::int AS n FROM room_seat_colors WHERE room_id = $1', [room])).rows[0].n, 0);
    assert.equal((await q('SELECT seat_color FROM rooms WHERE id = $1', [room])).rows[0].seat_color, null);

    assert.equal(await status(set('turkuaz', admin)), 403, 'süper yönetici değil');
    assert.equal(await status(set('mor')), 400);
    assert.equal(await status(call('POST', '/api/rooms/seat-color', { room, color: 'pembe', ref: 'kısa' }, owner.session)), 400, 'bozuk istek kimliği');
    await q('UPDATE rooms SET closed_at = now() WHERE id = $1', [room]);
    assert.equal(await status(set('turkuaz')), 410);
  });

  test('aynı istek kimliği iki kez ücret almaz; başka işin kimliği reddedilir', async () => {
    const owner = await signUp('Çift Tık');
    await credit(owner, PINK * 3);
    const room = (await ok(call('POST', '/api/rooms', { title: `Çift ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const ref = rnd(6);
    const [a, b] = await Promise.all([1, 2].map(() => call('POST', '/api/rooms/seat-color', { room, color: 'yesil', ref }, owner.session)));
    assert.equal(a[0], 200);
    assert.equal(b[0], 200);
    assert.equal(await coinsOf(owner), PINK * 3 - SEAT_COLORS.get('yesil').price, 'bir kez');

    // A ref the shop already used: never a free color.
    const shopRef = rnd(6);
    await ok(call('POST', '/api/shop/buy', { sku: 'bb-candy', price: 120, ref: shopRef }, owner.session), 'mağaza');
    assert.equal(await status(call('POST', '/api/rooms/seat-color', { room, color: 'turuncu', ref: shopRef }, owner.session)), 409);
    assert.equal((await q('SELECT count(*)::int AS n FROM room_seat_colors WHERE room_id = $1', [room])).rows[0].n, 1);
  });
});
