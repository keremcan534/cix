// Koltuk rengi (room-seat-color.mjs): only the room's owner picks the empty mics' color. Silver is every room's free
// default; the other colors (Yönetim › Mağaza › Koltuk renkleri: the app's own and the admins') are bought for the room
// with the owner's coins for their days (none: for good), at the price and days the phone showed; an older app buys an
// app's own color only at its old price, for good. A color that runs out leaves the room (the sweep). The color goes
// into the LiveKit metadata so every phone repaints. A fake LiveKit records what the API asks of it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { SEAT_COLORS, SEAT_DEFAULT } from '../catalog.mjs';
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

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, SEAT_COLOR_SWEEP_MS: '200', SHOP_ITEMS_POLL_MS: '200' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j.error}`);
  if (re) assert.match(j.error, re);
  return j;
};
const status = async (p) => (await p)[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastMeta = (room) => {
  const c = lkCalls.filter((x) => x.method === 'UpdateRoomMetadata' && x.body.room === `oda-${room}`).pop();
  return c && JSON.parse(c.body.metadata);
};
async function credit(u, amount, channel = 'test') {
  await h.credit(u.user.id, amount, { channel });
}
const coinsOf = async (u) => Number((await q('SELECT coins FROM users WHERE id = $1', [u.user.id])).rows[0].coins);
const PINK = SEAT_COLORS.get('pembe').price;
const roomOf = async (owner, title) => (await ok(call('POST', '/api/rooms', { title: `${title} ${rnd(2)}` }, owner.session), 'oda')).room.id;
const seats = async () => (await ok(call('GET', '/api/catalog?shop=1'), 'katalog')).shop.items.filter((x) => x.kind === 'seat');

describe('Koltuk rengi', () => {
  test('sahip bir kez satın alır, herkes metadatadan görür; sahip olunan renge ve gümüşe dönmek ücretsiz', async () => {
    const owner = await signUp('Renk Sahibi');
    await credit(owner, PINK + 500);
    const room = await roomOf(owner, 'Renk');
    const set = (color, ref = rnd(6)) => call('POST', '/api/rooms/seat-color', { room, color, ref }, owner.session);

    assert.deepEqual(await ok(call('GET', `/api/rooms/seat-color?room=${room}`, null, owner.session), 'oku'), { color: SEAT_DEFAULT, owned: [], until: {} });

    const ref = rnd(6);
    const bought = await ok(set('pembe', ref), 'pembe');
    assert.deepEqual([bought.color, bought.owned, bought.until, bought.price, bought.user.coins], ['pembe', ['pembe'], {}, PINK, 500]);
    assert.equal(lastMeta(room).seatColor, 'pembe', 'metadata taşır');
    const ledger = (await q("SELECT amount, reason FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [owner.user.id, ref])).rows;
    assert.deepEqual(ledger.map((x) => [Number(x.amount), x.reason]), [[-PINK, 'Koltuk rengi: Açık Pembe']]);

    const back = await ok(set(SEAT_DEFAULT), 'gümüş ücretsiz');
    assert.equal(back.price, 0);
    assert.equal(lastMeta(room).seatColor, SEAT_DEFAULT, 'varsayılan adıyla: eski uygulama da gümüş çizer');
    const again = await ok(set('pembe'), 'sahip olunan pembe');
    assert.equal(again.price, 0, 'ikinci kez ödenmez');
    assert.equal(await coinsOf(owner), 500);
    assert.equal(lastMeta(room).seatColor, 'pembe');
    assert.deepEqual(await ok(call('GET', `/api/rooms/seat-color?room=${room}`, null, owner.session), 'oku'), { color: 'pembe', owned: ['pembe'], until: {} });
  });

  test('yetersiz jeton 409 ve hiçbir şey değişmez; yönetici ve üye değiştiremez; bozuk renk 400; kapalı oda 410', async () => {
    const owner = await signUp('Fakir Sahip');
    const admin = await signUp('Renk Yöneticisi');
    await credit(owner, 100);
    const room = await roomOf(owner, 'Fakir');
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id, super: true }, owner.session), 'süper yönetici');
    const set = (color, who = owner) => call('POST', '/api/rooms/seat-color', { room, color, ref: rnd(6) }, who.session);

    const j = await refused(set('kirmizi'), 409);
    assert.equal(j.code, 'insufficient');
    assert.equal(await coinsOf(owner), 100);
    assert.equal((await q('SELECT count(*)::int AS n FROM room_seat_colors WHERE room_id = $1', [room])).rows[0].n, 0);
    assert.equal((await q('SELECT seat_color FROM rooms WHERE id = $1', [room])).rows[0].seat_color, null);

    assert.equal(await status(set(SEAT_DEFAULT, admin)), 403, 'süper yönetici değil');
    assert.equal(await status(set('mor')), 400);
    assert.equal(await status(call('POST', '/api/rooms/seat-color', { room, color: 'pembe', ref: 'kısa' }, owner.session)), 400, 'bozuk istek kimliği');
    await q('UPDATE rooms SET closed_at = now() WHERE id = $1', [room]);
    assert.equal(await status(set(SEAT_DEFAULT)), 410);
  });

  test('aynı istek kimliği iki kez ücret almaz; başka işin kimliği reddedilir', async () => {
    const owner = await signUp('Çift Tık');
    await credit(owner, PINK * 3);
    const room = await roomOf(owner, 'Çift');
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

  test('panelden: ad, fiyat, süre, renk; yeni uygulama gösterdiğiyle alır, eski uygulama güncellemeye yönlenir; süre bitince gümüş', async () => {
    const admin = await h.account(`Koltuk Yöneticisi ${rnd(3)}`, 'admin');
    const shop = (p, body) => call('POST', `/api/admin/shop${p}`, body, admin.session);
    const owner = await signUp('Süreli Sahip');
    await credit(owner, 20_000);
    const room = await roomOf(owner, 'Süreli');
    const buy = (color, shown, ref = rnd(6)) => call('POST', '/api/rooms/seat-color', { room, color, ref, ...shown }, owner.session);

    // The list the phones read: silver free and first, the others paid, each with its color.
    const list = await seats();
    assert.deepEqual(list[0], { sku: 'gumus', kind: 'seat', name: 'Gümüş', price: 0, days: null, minVip: 0, builtin: true, look: { color: SEAT_COLORS.get('gumus').color }, default: true });
    assert.deepEqual(list.map((x) => [x.sku, x.price > 0]), [['gumus', false], ['pembe', true], ['kirmizi', true], ['turuncu', true], ['yesil', true], ['turkuaz', true]]);
    // Turquoise was the free default: an older app still shows it free, so it is told to update instead of paying.
    assert.equal((await refused(buy('turkuaz', {}), 409, /güncelle/)).code, 'update_required');

    // The default stays free and for sale; its name and color change.
    await refused(shop('/update', { id: 'gumus', price: 500 }), 400, /ücretsiz/);
    await refused(shop('/update', { id: 'gumus', enabled: false }), 400, /satıştan kalkmaz/);
    await refused(shop('/update', { id: 'pembe', minVip: 3 }), 400, /VIP/);
    const silver = (await ok(shop('/update', { id: 'gumus', name: 'Açık Gümüş', price: 0, days: 0, look: { color: '#e0e4ea' } }), 'gümüş rengi')).item;
    assert.deepEqual([silver.name, silver.price, silver.days, silver.enabled, silver.look, silver.changed.sort()], ['Açık Gümüş', 0, null, true, { color: '#E0E4EA' }, ['look', 'name']]);
    assert.equal((await seats())[0].name, 'Açık Gümüş', 'telefonlar yeni adı görür');

    // Light pink for 30 days at 1.500: a newer app buys with what it showed; the price it showed before is refused.
    const pink = (await ok(shop('/update', { id: 'pembe', price: 1500, days: 30, look: { color: '#f7c5d5' } }), 'pembe')).item;
    assert.deepEqual([pink.price, pink.days, pink.look, pink.changed.sort()], [1500, 30, { color: '#F7C5D5' }, ['days', 'look', 'price']]);
    await sleep(500);
    const moved = await refused(buy('pembe', { price: 2000, days: 0 }), 409, /Süre değişti/);
    assert.deepEqual([moved.code, moved.price, moved.days], ['price_changed', 1500, 30]);
    assert.equal((await refused(buy('pembe', {}), 409, /güncelle/)).code, 'update_required', 'eski uygulama süreli rengi alamaz');
    const before = await coinsOf(owner);
    const got = await ok(buy('pembe', { price: 1500, days: 30 }), 'süreli pembe');
    assert.deepEqual([got.price, got.owned, before - (await coinsOf(owner))], [1500, ['pembe'], 1500]);
    const until = Date.parse(got.until.pembe);
    assert.ok(Math.abs(until - (Date.now() + 30 * 86_400_000)) < 60_000, '30 gün');
    assert.equal(lastMeta(room).seatColor, 'pembe');

    // It runs out: the room is silver again on every phone, and buying it again pays again.
    await q("UPDATE room_seat_colors SET ends_at = now() - interval '1 minute' WHERE room_id = $1 AND color = 'pembe'", [room]);
    await sleep(800);
    assert.equal(lastMeta(room).seatColor, SEAT_DEFAULT, 'süre bitti');
    assert.deepEqual(await ok(call('GET', `/api/rooms/seat-color?room=${room}`, null, owner.session), 'oku'), { color: SEAT_DEFAULT, owned: [], until: {} });
    const rebought = await ok(buy('pembe', { price: 1500, days: 30 }), 'yeniden');
    assert.deepEqual([rebought.price, rebought.owned], [1500, ['pembe']]);

    // The admins' own color: sold to a newer app; an older app doesn't know it.
    await refused(shop('', { kind: 'seat', name: 'Lavanta', price: 900, days: 0, minVip: 2, look: { color: '#B9A7E0' } }), 400, /VIP/);
    await refused(shop('', { kind: 'seat', name: 'Lavanta', price: 900, days: 0, look: { color: 'mor' } }), 400, /#RRGGBB/);
    const lav = (await ok(shop('', { kind: 'seat', name: 'Lavanta', price: 900, days: 0, look: { color: '#b9a7e0' } }), 'lavanta')).item;
    assert.match(lav.id, /^sc[0-9]+$/);
    await sleep(500);
    assert.deepEqual((await seats()).find((x) => x.sku === lav.id), { sku: lav.id, kind: 'seat', name: 'Lavanta', price: 900, days: null, minVip: 0, look: { color: '#B9A7E0' } });
    assert.equal((await refused(buy(lav.id, {}), 409)).code, 'update_required');
    await ok(buy(lav.id, { price: 900, days: 0 }), 'lavanta al');
    assert.equal(lastMeta(room).seatColor, lav.id);
    // Not a thing a person buys or is given in the shop.
    assert.equal(await status(call('POST', '/api/shop/buy', { sku: lav.id, price: 900, ref: rnd(6) }, owner.session)), 400);
    // Taken off the shelf: not sold, the room that has it keeps it; with a room having it, it isn't deleted.
    await ok(shop('/update', { id: lav.id, enabled: false }), 'kapat');
    await refused(shop('/delete', { id: lav.id }), 409, /1 odada var/);
    const other = await signUp('İkinci Sahip');
    await credit(other, 5000);
    const room2 = await roomOf(other, 'İkinci');
    await sleep(500);
    await refused(call('POST', '/api/rooms/seat-color', { room: room2, color: lav.id, ref: rnd(6), price: 900, days: 0 }, other.session), 400, /satılmıyor/);
    assert.equal((await ok(call('POST', '/api/rooms/seat-color', { room, color: lav.id, ref: rnd(6) }, owner.session), 'kendi rengi')).price, 0);
    // The panel lists how many rooms have each color.
    const listed = (await ok(call('GET', '/api/admin/shop', null, admin.session), 'panel')).items.find((x) => x.id === lav.id);
    assert.equal(listed.owners, 1);
    const audit = (await q("SELECT action FROM audit_events WHERE action LIKE 'shop.%' AND actor = $1 ORDER BY id", [admin.user.id])).rows.map((x) => x.action);
    assert.ok(audit.includes('shop.create') && audit.includes('shop.update'));
    await ok(shop('/reset', { id: 'pembe' }), 'orijinaline dön');
    assert.deepEqual((await seats()).find((x) => x.sku === 'pembe'), { sku: 'pembe', kind: 'seat', name: 'Açık Pembe', price: PINK, days: null, minVip: 0, builtin: true, look: { color: SEAT_COLORS.get('pembe').color } });
  });
});
