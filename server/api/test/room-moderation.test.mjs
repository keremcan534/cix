// Room moderation on the server (rooms.mjs) and the room's gift announcement (gifts.mjs): admins and bans only
// for real accounts, who runs a room (GET /api/rooms/staff), mic changes by room staff (POST /api/rooms/seat,
// LiveKit UpdateParticipant / UpdateRoomMetadata) and the paid gift sent to the room's voice connection
// (LiveKit SendData). A fake LiveKit records what the API asks of it and can answer 404, 500 or slowly.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi, tokenOf } from './harness.mjs';

const lkCalls = [];
/** Per method: 'gone' answers 404 (LiveKit doesn't know the room or person), 'fail' 500, 'slow' after 3 s. */
const lkMode = {};
const LK_PORT = 20000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    lkCalls.push({ method, body: JSON.parse(body || '{}'), grant: tokenOf(String(req.headers.authorization).replace(/^Bearer /, '')).video });
    const answer = () => {
      if (lkMode[method] === 'gone') return res.writeHead(404, { 'content-type': 'application/json' }).end('{"code":"not_found"}');
      if (lkMode[method] === 'fail') return res.writeHead(500, { 'content-type': 'application/json' }).end('{"code":"internal"}');
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    };
    if (lkMode[method] === 'slow') setTimeout(answer, 3000);
    else answer();
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;

const callsOf = (method, from) => lkCalls.slice(from).filter((c) => c.method === method);
/** The gift announcements only (a gift can also raise the room's level, which sends `{ type: 'room' }`). */
const giftsOf = (from) => callsOf('SendData', from).filter((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')).type === 'gift');
const openRoom = async (owner, title = `Oda ${rnd(2)}`) => {
  const [st, j] = await call('POST', '/api/rooms', { title }, owner.session);
  assert.equal(st, 200, j.error);
  return j.room.id;
};
const NOBODY = '00000000-0000-4000-8000-000000000000';

describe('Oda yönetimi', () => {
  let owner;
  let admin;
  let member;
  let room;
  before(async () => {
    owner = await signUp('Oda Sahibi');
    admin = await signUp('Oda Yöneticisi');
    member = await signUp('Dinleyici');
    room = await openRoom(owner);
    assert.equal((await call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session))[0], 200);
  });

  test('yönetici ve kara liste yalnızca var olan hesaplar için (uydurma ya da silinmiş kimlik 404)', async () => {
    const [st, j] = await call('POST', '/api/rooms/admin', { room, user: NOBODY }, owner.session);
    assert.equal(st, 404);
    assert.equal(j.error, 'Kullanıcı bulunamadı');
    const [bst, bj] = await call('POST', '/api/rooms/ban', { room, user: NOBODY, minutes: 10 }, owner.session);
    assert.equal(bst, 404);
    assert.equal(bj.error, 'Kullanıcı bulunamadı');
    assert.equal((await call('POST', '/api/rooms/ban', { room, user: NOBODY, minutes: null }, admin.session))[0], 404, 'yönetici de uydurma kimliği kara listeye ekleyemez');

    const gone = await signUp('Silinecek');
    await h.sql.query('UPDATE users SET deleted_at = now() WHERE id = $1', [gone.user.id]);
    assert.equal((await call('POST', '/api/rooms/admin', { room, user: gone.user.id }, owner.session))[0], 404, 'silinmiş hesap yönetici olmaz');
    assert.equal((await call('POST', '/api/rooms/ban', { room, user: gone.user.id, minutes: null }, owner.session))[0], 404, 'silinmiş hesap kara listeye girmez');

    const rows = await h.sql.query('SELECT (SELECT count(*) FROM room_admins WHERE room_id = $1 AND user_id <> $2)::int AS admins, (SELECT count(*) FROM room_bans WHERE room_id = $1)::int AS bans', [room, admin.user.id]);
    assert.deepEqual(rows.rows[0], { admins: 0, bans: 0 }, 'hiçbir kayıt yazılmadı');
    // Taking the role away from an id that no longer exists still works (nothing to look up).
    assert.equal((await call('POST', '/api/rooms/admin', { room, user: NOBODY, admin: false }, owner.session))[0], 200);
    // A real account still works as before.
    assert.equal((await call('POST', '/api/rooms/ban', { room, user: member.user.id, minutes: 5 }, admin.session))[0], 200);
    await call('POST', '/api/rooms/unban', { room, user: member.user.id }, admin.session);
  });

  test('oda yetkilileri: herkes yöneticileri görür, yasaklıları yalnızca sahip ve yöneticiler', async () => {
    const kicked = await signUp('Atılan');
    assert.equal((await call('POST', '/api/rooms/ban', { room, user: kicked.user.id, minutes: 30 }, owner.session))[0], 200);

    const [st, mine] = await call('GET', `/api/rooms/staff?room=${room}`, null, owner.session);
    assert.equal(st, 200, mine.error);
    assert.equal(mine.owner, owner.user.id);
    assert.deepEqual(mine.admins, [{ id: admin.user.id, name: 'Oda Yöneticisi' }]);
    assert.deepEqual(
      mine.bans.map((b) => [b.userId, b.name, !!b.until]),
      [[kicked.user.id, 'Atılan', true]],
    );
    const [, adm] = await call('GET', `/api/rooms/staff?room=${room}`, null, admin.session);
    assert.equal(adm.bans.length, 1, 'yönetici de görür');
    const [, guest] = await call('GET', `/api/rooms/staff?room=${room}`, null, member.session);
    assert.deepEqual(guest.admins.map((a) => a.id), [admin.user.id], 'üye rolleri görür');
    assert.equal('bans' in guest, false, 'üye yasak listesini görmez');

    // A ban that ran out is not listed.
    await h.sql.query("UPDATE room_bans SET until = now() - interval '1 minute' WHERE room_id = $1 AND user_id = $2", [room, kicked.user.id]);
    assert.equal((await call('GET', `/api/rooms/staff?room=${room}`, null, owner.session))[1].bans.length, 0);
    assert.equal((await call('GET', '/api/rooms/staff?room=nope', null, owner.session))[0], 400);
    assert.equal((await call('GET', `/api/rooms/staff?room=${room}`))[0], 401);
  });

  test('mikrofondan indirme ve koltuk değiştirme LiveKit’te kişinin koltuğunu değiştirir', async () => {
    const from = lkCalls.length;
    const lkName = `oda-${room}`;
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'remove', user: admin.user.id }, member.session))[0], 403, 'üye yapamaz');

    const [st, j] = await call('POST', '/api/rooms/seat', { room, action: 'move', user: member.user.id, seat: 3 }, admin.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual(j, { done: true });
    const [moved] = callsOf('UpdateParticipant', from);
    assert.deepEqual(moved.body, { room: lkName, identity: member.user.id, attributes: { seat: '3' } });
    assert.deepEqual(moved.grant, { roomAdmin: true, room: lkName }, 'yalnızca bu odaya yetkili kısa anahtar');

    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'remove', user: member.user.id }, owner.session))[0], 200);
    assert.deepEqual(callsOf('UpdateParticipant', from)[1].body.attributes, { seat: '' }, 'koltuk boşalır');

    for (const seat of [0, 100, '3', null, 2.5]) assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'move', user: member.user.id, seat }, owner.session))[0], 400, `koltuk ${seat}`);
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'move', user: owner.user.id, seat: 2 }, admin.session))[0], 403, 'yönetici sahibi taşıyamaz');
    const admin2 = await signUp('İkinci Yönetici');
    await call('POST', '/api/rooms/admin', { room, user: admin2.user.id }, owner.session);
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'remove', user: admin2.user.id }, admin.session))[0], 403, 'yönetici yöneticiyi indiremez');
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'remove', user: admin2.user.id }, owner.session))[0], 200, 'sahip indirebilir');
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'jump', user: member.user.id }, owner.session))[0], 400);
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'remove', user: 'x' }, owner.session))[0], 400);

    // Not connected (LiveKit doesn't know them) or LiveKit down: a clear answer, nothing pretends to work.
    lkMode.UpdateParticipant = 'gone';
    const [gst, gj] = await call('POST', '/api/rooms/seat', { room, action: 'remove', user: member.user.id }, owner.session);
    assert.equal(gst, 409);
    assert.match(gj.error, /odada değil/);
    lkMode.UpdateParticipant = 'fail';
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'remove', user: member.user.id }, owner.session))[0], 502);
    delete lkMode.UpdateParticipant;

    const audits = await h.sql.query("SELECT action, target_user FROM sanction_audit_logs WHERE action LIKE 'room_seat_%' AND detail->>'room' = $1 ORDER BY id", [room]);
    assert.deepEqual(
      audits.rows.map((r) => r.action),
      ['room_seat_move', 'room_seat_remove', 'room_seat_remove'],
      'yapılan her değişiklik kayıtlı',
    );
  });

  test('mikrofon kilidi LiveKit odasının bilgisine yazılır', async () => {
    const from = lkCalls.length;
    const lkName = `oda-${room}`;
    const [st, j] = await call('POST', '/api/rooms/seat', { room, action: 'lock', seat: 5, locked: [2] }, admin.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual(j.lockedSeats, [2, 5]);
    const [meta] = callsOf('UpdateRoomMetadata', from);
    assert.equal(meta.body.room, lkName);
    assert.deepEqual(JSON.parse(meta.body.metadata), { lockedSeats: [2, 5] });
    assert.deepEqual(meta.grant, { roomAdmin: true, room: lkName });

    const [, un] = await call('POST', '/api/rooms/seat', { room, action: 'unlock', seat: 2, locked: [2, 5, 0, 'x', 400] }, owner.session);
    assert.deepEqual(un.lockedSeats, [5], 'geçersiz koltuklar atılır');
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'lock', seat: 0 }, owner.session))[0], 400, 'sahibin koltuğu kilitlenmez');
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'lock', seat: 4 }, member.session))[0], 403);

    lkMode.UpdateRoomMetadata = 'gone';
    assert.equal((await call('POST', '/api/rooms/seat', { room, action: 'lock', seat: 4 }, owner.session))[0], 409, 'sesli oda açık değil');
    delete lkMode.UpdateRoomMetadata;

    const other = await signUp('Başka Sahip');
    const closed = await openRoom(other);
    await call('POST', '/api/rooms/close', { id: closed }, other.session);
    assert.equal((await call('POST', '/api/rooms/seat', { room: closed, action: 'lock', seat: 4 }, other.session))[0], 410, 'kapanan oda');
  });
});

describe('Odada hediye duyurusu', () => {
  let sender;
  let host;
  let room;
  before(async () => {
    sender = await signUp('Gönderen');
    host = await signUp('Ev Sahibi');
    room = await openRoom(host);
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, sender.session))[0], 200);
  });
  const until = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await new Promise((r) => setTimeout(r, 20));
    }
    return false;
  };

  test('ödenen hediye odanın ses bağlantısına sunucudan gider; tekrar ve oda dışı hediye gitmez', async () => {
    const from = lkCalls.length;
    const ref = rnd(6);
    const [st, j] = await call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g4', count: 5, room, ref }, sender.session);
    assert.equal(st, 200, j.error);
    assert.ok(await until(() => giftsOf(from).length === 1), 'duyuru gitti');
    const [sent] = giftsOf(from);
    const lkName = `oda-${room}`;
    assert.equal(sent.body.room, lkName);
    assert.equal(sent.body.kind, 'RELIABLE');
    assert.deepEqual(sent.grant, { roomAdmin: true, room: lkName });
    const event = (await h.sql.query('SELECT id FROM gift_events WHERE ref = $1', [ref])).rows[0];
    assert.deepEqual(JSON.parse(Buffer.from(sent.body.data, 'base64').toString('utf8')), { type: 'gift', giftId: 'g4', count: 5, from: sender.user.id, to: host.user.id, eventId: Number(event.id) });

    const [, replay] = await call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g4', count: 5, room, ref }, sender.session);
    assert.equal(replay.replay, true);
    // The LiveKit name works too; a sample room, no room and a made-up name announce nothing.
    assert.equal((await call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g1', count: 1, room: lkName, ref: rnd(6) }, sender.session))[0], 200);
    for (const r of [undefined, 'oda-r1', 'baska-oda']) assert.equal((await call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g1', count: 1, room: r, ref: rnd(6) }, sender.session))[0], 200);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(
      giftsOf(from).map((c) => c.body.room),
      [lkName, lkName],
      'yalnızca sunucu odalarında, tekrarda değil',
    );
  });

  test('LiveKit hata verse ya da geç kalsa da hediye hemen ve bir kez gider', async () => {
    const before = (await call('GET', '/api/me', null, sender.session))[1].user.coins;
    lkMode.SendData = 'fail';
    assert.equal((await call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g4', count: 1, room, ref: rnd(6) }, sender.session))[0], 200, 'hata hediyeyi bozmaz');
    lkMode.SendData = 'slow';
    const t0 = Date.now();
    assert.equal((await call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g4', count: 1, room, ref: rnd(6) }, sender.session))[0], 200);
    assert.ok(Date.now() - t0 < 2000, 'yavaş LiveKit hediyeyi bekletmez');
    delete lkMode.SendData;
    assert.equal((await call('GET', '/api/me', null, sender.session))[1].user.coins, before - 400, 'iki hediye de ödendi');
  });
});
