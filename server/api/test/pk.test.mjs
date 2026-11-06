// Oda içi PK (pk.mjs) against a real Postgres: only room staff start or cancel, one PK per room, gifts in the
// room score once for someone competing after the countdown, the same view for everyone, the end closes it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ PK_PREP_MS: '300' });
const { call, signUp } = h;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const topUp = async (s) => assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 10000, ref: rnd(6) }, s))[0], 200);
const gift = (s, to, room, ref = rnd(6)) => call('POST', '/api/gifts/send', { to, giftId: 'g4', count: 1, room, ref }, s);
const read = async (s, room) => (await call('GET', `/api/rooms/pk?room=${room}`, null, s))[1].pk;

async function setUp() {
  const owner = await signUp('PK Sahibi');
  const admin = await signUp('PK Yönetici');
  const a = await signUp('Ada');
  const b = await signUp('Bora');
  const fan = await signUp('Destekçi');
  const [, j] = await call('POST', '/api/rooms', { title: 'PK Odası' }, owner.session);
  await call('POST', '/api/rooms/admin', { room: j.room.id, user: admin.user.id, admin: true }, owner.session);
  await topUp(fan.session);
  return { owner, admin, a, b, fan, room: j.room.id };
}

describe('Oda içi PK', () => {
  test('sahip veya yönetici başlatır; üye başlatamaz; odada tek PK; tekrar istek aynı PK', async () => {
    const { owner, admin, a, b, room } = await setUp();
    const body = { room, mode: 'solo', durationMin: 15, participants: [a.user.id, b.user.id] };
    const [st0, e0] = await call('POST', '/api/rooms/pk', { ...body, ref: rnd(6) }, a.session);
    assert.equal(st0, 403);
    assert.equal(e0.error, 'PK’yı oda sahibi veya yöneticiler başlatabilir');
    assert.equal((await call('POST', '/api/rooms/pk', { ...body, durationMin: 20, ref: rnd(6) }, owner.session))[0], 400, 'izinsiz süre');
    assert.equal((await call('POST', '/api/rooms/pk', { ...body, participants: [a.user.id], ref: rnd(6) }, owner.session))[0], 400, 'tek kişi');
    assert.equal((await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 15, red: [a.user.id], blue: [a.user.id], ref: rnd(6) }, owner.session))[0], 400, 'iki takımda aynı kişi');
    const ref = rnd(6);
    const [st, r] = await call('POST', '/api/rooms/pk', { ...body, ref }, admin.session);
    assert.equal(st, 200, r.error);
    assert.equal(r.pk.mode, 'solo');
    assert.equal(r.pk.status, 'active');
    assert.deepEqual(r.pk.participants, [a.user.id, b.user.id]);
    assert.ok(Date.parse(r.pk.endAt) - Date.parse(r.pk.startAt) === 15 * 60_000);
    assert.ok(r.pk.people.some((p) => p.id === a.user.id && p.name === 'Ada'), 'isimler gelir');
    const [st2, again] = await call('POST', '/api/rooms/pk', { ...body, ref }, admin.session);
    assert.equal(st2, 200);
    assert.equal(again.pk.id, r.pk.id, 'aynı istek kimliği aynı PK');
    const [st3, e3] = await call('POST', '/api/rooms/pk', { ...body, ref: rnd(6) }, owner.session);
    assert.equal(st3, 409);
    assert.equal(e3.error, 'Bu odada zaten devam eden bir PK var');
    assert.equal((await read(a.session, room)).id, r.pk.id, 'odadaki herkes aynı PK’yı görür');
  });

  test('hediyeler: geri sayımda sayılmaz, yarışana bir kez sayılır, yarışmayana ve oda dışına sayılmaz', async () => {
    const { owner, a, b, fan, room } = await setUp();
    const [, r] = await call('POST', '/api/rooms/pk', { room, mode: 'solo', durationMin: 15, participants: [a.user.id, b.user.id], ref: rnd(6) }, owner.session);
    assert.equal((await gift(fan.session, a.user.id, room))[0], 200);
    assert.deepEqual((await read(fan.session, room)).pairs, [], 'geri sayımda sayılmaz');
    await wait(400);
    const ref = rnd(6);
    const [gs, g] = await gift(fan.session, a.user.id, room, ref);
    assert.equal(gs, 200, g.error);
    assert.equal((await gift(fan.session, a.user.id, room, ref))[1].replay, true);
    await gift(fan.session, a.user.id, room);
    await gift(fan.session, owner.user.id, room); // not competing
    await gift(fan.session, b.user.id); // not in the room
    const pk = await read(b.session, room);
    assert.equal(pk.id, r.pk.id);
    assert.deepEqual(pk.pairs, [{ from: fan.user.id, to: a.user.id, team: null, points: 400, gifts: 2 }]);
    assert.ok(pk.people.some((p) => p.id === fan.user.id), 'gönderenin adı da gelir');
  });

  test('Takım PK: puan alanın takımına yazılır', async () => {
    const { owner, a, b, fan, room } = await setUp();
    const [st, r] = await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 30, red: [a.user.id], blue: [b.user.id], ref: rnd(6) }, owner.session);
    assert.equal(st, 200, r.error);
    await wait(400);
    await gift(fan.session, b.user.id, room);
    const pk = await read(owner.session, room);
    assert.deepEqual(pk.red, [a.user.id]);
    assert.deepEqual(pk.pairs.map((p) => [p.to, p.team, p.points]), [[b.user.id, 'blue', 200]]);
  });

  test('iptal: yalnız oda yetkilisi; sonra hediye sayılmaz; süresi biten PK kapanır ve yenisi başlar', async () => {
    const { owner, a, b, fan, room } = await setUp();
    const body = { room, mode: 'solo', durationMin: 15, participants: [a.user.id, b.user.id] };
    await call('POST', '/api/rooms/pk', { ...body, ref: rnd(6) }, owner.session);
    assert.equal((await call('POST', '/api/rooms/pk/cancel', { room }, a.session))[0], 403);
    const [cs, c] = await call('POST', '/api/rooms/pk/cancel', { room }, owner.session);
    assert.equal(cs, 200, c.error);
    assert.equal(c.pk.status, 'cancelled');
    await wait(400);
    await gift(fan.session, a.user.id, room);
    const after = await read(a.session, room);
    assert.equal(after.status, 'cancelled', 'iptal edilen son PK bir süre görünür');
    assert.deepEqual(after.pairs, []);
    assert.equal((await call('POST', '/api/rooms/pk/cancel', { room }, owner.session))[0], 404, 'iptal edilecek PK yok');

    const [, r2] = await call('POST', '/api/rooms/pk', { ...body, ref: rnd(6) }, owner.session);
    await h.sql.query("UPDATE room_pks SET start_at = now() - interval '16 minutes', end_at = now() - interval '1 minute' WHERE id = $1", [r2.pk.id]);
    const done = await read(fan.session, room);
    assert.equal(done.id, r2.pk.id);
    assert.equal(done.status, 'done', 'süresi bitince sonuçlanır');
    const [st3, r3] = await call('POST', '/api/rooms/pk', { ...body, ref: rnd(6) }, owner.session);
    assert.equal(st3, 200, r3.error);
    assert.notEqual(r3.pk.id, r2.pk.id);
  });
});
