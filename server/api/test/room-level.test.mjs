// Room level, mics and layout on the server (rooms.mjs, gifts.mjs, admin.mjs) and the voice server's own counts
// (live.mjs): gifts in a room raise its owner's room level, an admin can set it (Yönetim › Kullanıcılar, found by
// the room's 8-digit ID), the owner or a room admin sets the mics and layout for every phone, the lists count the
// people LiveKit has in a room, and a voice mute reaches a room even when no webhook said who is in it.
// A fake LiveKit records what the API asks of it; ListRooms answers with `lkRooms`.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
let lkRooms = [];
const LK_PORT = 21000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    lkCalls.push({ method, body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(method === 'ListRooms' ? { rooms: lkRooms } : {}));
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;

const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
const packets = (from, type) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => p.type === type);

// The app shows the same levels and room IDs (app/src/data/catalog.ts): the two copies must not drift apart.
const catalog = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'app', 'src', 'data', 'catalog.ts'), 'utf8');
const rooms = fs.readFileSync(path.join(import.meta.dirname, '..', 'rooms.mjs'), 'utf8');
const listOf = (src) => /ROOM_XP_THRESHOLDS = (\[[^\]]+\])/.exec(src)[1].replace(/[_\s]/g, '');
const appRoomCode = new Function('id', `return ${/export const roomCode = \(id: string\) => (.+);\n/.exec(catalog)[1]}`);

describe('Oda seviyesi, mikrofonlar ve düzen', () => {
  let owner;
  let roomAdmin;
  let member;
  let sender;
  let boss;
  let room;
  before(async () => {
    owner = await signUp('Oda Sahibi');
    roomAdmin = await signUp('Oda Yöneticisi');
    member = await signUp('Dinleyici');
    sender = await signUp('Gönderen');
    boss = await signUp('Platform Yöneticisi');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [boss.user.id]);
    const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session);
    assert.equal(st, 200, j.error);
    room = j.room.id;
    assert.equal((await call('POST', '/api/rooms/admin', { room, user: roomAdmin.user.id }, owner.session))[0], 200);
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, sender.session))[0], 200);
    lkRooms = [{ name: `oda-${room}`, num_participants: 3 }];
  });

  test('uygulamadaki seviye eşikleri ve oda ID formülü sunucudakiyle aynı', () => {
    assert.equal(listOf(rooms), listOf(catalog));
    const serverRoomCode = new Function('id', `return ${/export const roomCode = \(id\) => (.+);\n/.exec(rooms)[1]}`);
    for (const id of [room, '00000000-0000-4000-8000-000000000000', 'ffffffff-ffff-4fff-bfff-ffffffffffff']) assert.equal(serverRoomCode(id), appRoomCode(id));
  });

  test('kişi sayısı ses sunucusunun saydığı (webhook gelmese de 0 görünmez)', async () => {
    const [, list] = await call('GET', '/api/rooms', null, member.session);
    assert.equal(list.rooms.find((r) => r.id === room).listeners, 3);
    const [, one] = await call('GET', `/api/room?id=${room}`, null, member.session);
    assert.equal(one.room.listeners, 3);
    assert.equal(one.room.level, 1);
  });

  test('odadaki hediye sahibinin oda seviyesini artırır; seviye atlayınca odaya haber gider', async () => {
    let from = lkCalls.length;
    const [st, j] = await call('POST', '/api/gifts/send', { to: owner.user.id, giftId: 'g4', count: 1, room, ref: rnd(6) }, sender.session);
    assert.equal(st, 200, j.error);
    assert.ok(await until(() => packets(from, 'room').length === 1), 'seviye atlama duyurusu gitti');
    assert.equal(packets(from, 'room')[0].room, `oda-${room}`);
    const [, one] = await call('GET', `/api/room?id=${room}`, null, member.session);
    assert.equal(one.room.xp, 200);
    assert.equal(one.room.level, 2);

    from = lkCalls.length;
    assert.equal((await call('POST', '/api/gifts/send', { to: owner.user.id, giftId: 'g1', count: 1, room, ref: rnd(6) }, sender.session))[0], 200);
    assert.ok(await until(() => packets(from, 'gift').length === 1));
    assert.equal(packets(from, 'room').length, 0, 'seviye değişmedi, haber yok');
    // A gift outside any room raises nobody's room.
    assert.equal((await call('POST', '/api/gifts/send', { to: owner.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, sender.session))[0], 200);
    assert.equal((await call('GET', `/api/room?id=${room}`, null, member.session))[1].room.xp, 210);
  });

  test('yönetici odayı 8 haneli ID ile bulur ve Lv. MAX yapar; kayıt düşer, odaya haber gider', async () => {
    const code = appRoomCode(room);
    assert.match(code, /^\d{8}$/);
    assert.equal((await call('GET', `/api/admin/users?q=${code}`, null, member.session))[0], 403);
    const [, found] = await call('GET', `/api/admin/users?q=${code}`, null, boss.session);
    assert.deepEqual(found.users.map((u) => u.id), [owner.user.id]);
    assert.deepEqual(found.users[0].room, { id: room, code });
    assert.equal(found.users[0].roomLevel, 2);

    assert.equal((await call('POST', '/api/admin/users/room-level', { id: owner.user.id, level: 15 }, owner.session))[0], 403, 'oda sahibi kendi seviyesini değiştiremez');
    assert.equal((await call('POST', '/api/admin/users/room-level', { id: owner.user.id, level: 16 }, boss.session))[0], 400);
    const from = lkCalls.length;
    const [st, j] = await call('POST', '/api/admin/users/room-level', { id: owner.user.id, level: 15 }, boss.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual(j, { level: 15, xp: 23_000 });
    assert.ok(await until(() => packets(from, 'room').length === 1), 'odadaki telefonlara haber gitti');
    assert.equal((await call('GET', `/api/room?id=${room}`, null, member.session))[1].room.level, 15);
    const log = await h.sql.query("SELECT detail FROM sanction_audit_logs WHERE action = 'room_level' AND target_user = $1", [owner.user.id]);
    assert.equal(log.rowCount, 1);
  });

  test('mikrofon sayısını ve düzeni sahip ya da oda yöneticisi değiştirir; herkese haber gider', async () => {
    let from = lkCalls.length;
    let [st, j] = await call('POST', '/api/rooms/update', { id: room, layoutId: 'audio-12-grid' }, owner.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.room.layoutId, 'audio-12-grid');
    assert.equal(j.room.listeners, 3);
    assert.ok(await until(() => packets(from, 'room').length === 1));

    from = lkCalls.length;
    [st, j] = await call('POST', '/api/rooms/update', { id: room, micCount: 12, layoutId: null }, roomAdmin.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.room.micCount, 12);
    assert.equal(j.room.layoutId, null);
    assert.ok(await until(() => packets(from, 'room').length === 1));

    assert.equal((await call('POST', '/api/rooms/update', { id: room, micCount: 8 }, member.session))[0], 403, 'dinleyici değiştiremez');
    assert.equal((await call('POST', '/api/rooms/update', { id: room, title: 'Yöneticiden ad' }, roomAdmin.session))[0], 403, 'adı yalnızca sahip değiştirir');
    assert.equal((await call('POST', '/api/rooms/update', { id: room, micCount: 16 }, owner.session))[0], 400);
    assert.equal((await call('POST', '/api/rooms/update', { id: room, layoutId: '../kötü' }, owner.session))[0], 400);
    const [, one] = await call('GET', `/api/room?id=${room}`, null, member.session);
    assert.equal(one.room.micCount, 12, 'reddedilenler bir şey değiştirmedi');
  });

  test('oda şifresini yalnızca sahip koyar ve kaldırır; şifreli odaya şifreyle girilir', async () => {
    const lk = `oda-${room}`;
    assert.equal((await call('POST', '/api/rooms/update', { id: room, password: '1234' }, roomAdmin.session))[0], 403, 'yönetici şifre koyamaz');
    assert.equal((await call('POST', '/api/rooms/update', { id: room, password: '123' }, owner.session))[0], 400, 'çok kısa');
    let [st, j] = await call('POST', '/api/rooms/update', { id: room, password: '4321' }, owner.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.room.hasPassword, true);
    assert.equal(j.room.micCount, 12, 'şifre mikrofonları değiştirmedi');
    assert.equal((await call('GET', `/token?room=${lk}`, null, member.session))[0], 403, 'şifresiz');
    assert.equal((await call('GET', `/token?room=${lk}&password=4321`, null, member.session))[0], 200);

    [st, j] = await call('POST', '/api/rooms/update', { id: room, password: null }, owner.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.room.hasPassword, false);
    assert.equal((await call('GET', `/token?room=${lk}`, null, member.session))[0], 200, 'kilit kalktı');
  });

  test('sesli susturma, kimin odada olduğu bilinmese de ses sunucusundaki odaya ulaşır', async () => {
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM room_presence WHERE identity = $1', [member.user.id])).rows[0].n, 0);
    const from = lkCalls.length;
    const [st, j] = await call('POST', '/api/rooms/mute', { room, user: member.user.id, kind: 'voice', minutes: 15, reason: 'disruption' }, owner.session);
    assert.equal(st, 200, j.error);
    assert.ok(await until(() => lkCalls.slice(from).some((c) => c.method === 'UpdateParticipant')), 'ses sunucusuna gitti');
    const sent = lkCalls.slice(from).find((c) => c.method === 'UpdateParticipant');
    assert.equal(sent.body.room, `oda-${room}`);
    assert.equal(sent.body.identity, member.user.id);
    assert.equal(sent.body.permission.canPublish, false);
  });
});

describe('Odanın görünümü: kapak, tema, hediye efektleri', () => {
  test('kapağı sahip ya da Süper Yönetici, temayı ve hediye efektlerini yalnızca sahip değiştirir; herkese haber gider', async () => {
    const owner = await signUp('Görünüm Sahibi');
    const superAdmin = await signUp('Süper');
    const plainAdmin = await signUp('Yönetici');
    const member = await signUp('Dinleyici');
    const [st0, j0] = await call('POST', '/api/rooms', { title: `Görünüm ${rnd(2)}` }, owner.session);
    assert.equal(st0, 200, j0.error);
    const room = j0.room.id;
    assert.deepEqual([j0.room.coverId, j0.room.theme, j0.room.giftEffects], [null, 'chat', true]);
    assert.equal((await call('POST', '/api/rooms/admin', { room, user: superAdmin.user.id, super: true }, owner.session))[0], 200);
    assert.equal((await call('POST', '/api/rooms/admin', { room, user: plainAdmin.user.id }, owner.session))[0], 200);

    let from = lkCalls.length;
    let [st, j] = await call('POST', '/api/rooms/update', { id: room, coverId: 'bg1' }, superAdmin.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.room.coverId, 'bg1');
    assert.ok(await until(() => packets(from, 'room').length === 1), 'odadaki telefonlara haber gitti');
    // A level-1 room: the Galaksi cover opens at Lv.7.
    [st, j] = await call('POST', '/api/rooms/update', { id: room, coverId: 'bg4' }, owner.session);
    assert.equal(st, 403);
    assert.match(j.error, /Lv\.7/);
    assert.equal((await call('POST', '/api/rooms/update', { id: room, coverId: 'yok' }, owner.session))[0], 400);
    assert.equal((await call('POST', '/api/rooms/update', { id: room, coverId: 'bg1' }, plainAdmin.session))[0], 403, 'yönetici kapağı değiştiremez');

    from = lkCalls.length;
    [st, j] = await call('POST', '/api/rooms/update', { id: room, theme: 'party', giftEffects: false }, owner.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual([j.room.theme, j.room.giftEffects, j.room.coverId], ['party', false, 'bg1']);
    assert.ok(await until(() => packets(from, 'room').length === 1));
    assert.equal((await call('POST', '/api/rooms/update', { id: room, theme: 'chat' }, superAdmin.session))[0], 403, 'temayı yalnızca sahip değiştirir');
    assert.equal((await call('POST', '/api/rooms/update', { id: room, giftEffects: true }, plainAdmin.session))[0], 403);
    assert.equal((await call('POST', '/api/rooms/update', { id: room, theme: 'disko' }, owner.session))[0], 400);
    assert.equal((await call('POST', '/api/rooms/update', { id: room, giftEffects: 'evet' }, owner.session))[0], 400);

    // What every phone reads; null takes the cover off.
    const seen = (await call('GET', `/api/room?id=${room}`, null, member.session))[1].room;
    assert.deepEqual([seen.coverId, seen.theme, seen.giftEffects], ['bg1', 'party', false]);
    [st, j] = await call('POST', '/api/rooms/update', { id: room, coverId: null }, owner.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.room.coverId, null);
  });
});
