// Oda içi PK (pk.mjs) against a real Postgres: only room staff start or cancel, one PK per room, any number of
// people (none too), gifts in the room score once for someone competing after the countdown, whoever takes a mic
// later joins (Takım PK: the team with fewer people), the same view for everyone, the end closes it. No voice server
// here, so who is on a mic isn't checked (pk-voice.test.mjs checks it against a fake LiveKit).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ PK_PREP_MS: '300' });
const { call, signUp } = h;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const topUp = async (s) => assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 10000, ref: rnd(6) }, s))[0], 200);
const gift = (s, to, room, ref = rnd(6)) => call('POST', '/api/gifts/send', { to, giftId: 'g4', count: 1, room, ref }, s);
const read = async (s, room) => (await call('GET', `/api/rooms/pk?room=${room}`, null, s))[1].pk;
const join = (s, room) => call('POST', '/api/rooms/pk/join', { room }, s);
const people = (n, name) => Promise.all(Array.from({ length: n }, (_, i) => signUp(`${name} ${i + 1}`)));

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
    assert.equal((await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 15, red: [a.user.id], blue: [a.user.id], ref: rnd(6) }, owner.session))[0], 400, 'iki takımda aynı kişi');
    assert.equal((await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 15, red: [a.user.id], blue: [], out: [a.user.id], ref: rnd(6) }, owner.session))[0], 400, 'takımdaki biri dışarıda');
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

  test('kişi sayısı önemsiz: Normal PK tek kişiyle ya da kimse yokken, Takım PK boş takımla başlar', async () => {
    const one = await setUp();
    const [s1, r1] = await call('POST', '/api/rooms/pk', { room: one.room, mode: 'solo', durationMin: 15, participants: [one.a.user.id], ref: rnd(6) }, one.owner.session);
    assert.equal(s1, 200, r1.error);
    assert.deepEqual(r1.pk.participants, [one.a.user.id]);
    const none = await setUp();
    const [s2, r2] = await call('POST', '/api/rooms/pk', { room: none.room, mode: 'solo', durationMin: 30, participants: [], ref: rnd(6) }, none.owner.session);
    assert.equal(s2, 200, r2.error);
    assert.deepEqual(r2.pk.participants, []);
    const team = await setUp();
    const [s3, r3] = await call('POST', '/api/rooms/pk', { room: team.room, mode: 'team', durationMin: 15, red: [team.a.user.id], blue: [], ref: rnd(6) }, team.owner.session);
    assert.equal(s3, 200, r3.error);
    assert.deepEqual([r3.pk.red, r3.pk.blue, r3.pk.out], [[team.a.user.id], [], []]);
    const empty = await setUp();
    const [s4, r4] = await call('POST', '/api/rooms/pk', { room: empty.room, mode: 'team', durationMin: 15, red: [], blue: [], ref: rnd(6) }, empty.owner.session);
    assert.equal(s4, 200, r4.error);
    const nine = await people(9, 'Kırmızı');
    const [s5, e5] = await call('POST', '/api/rooms/pk', { room: one.room, mode: 'team', durationMin: 15, red: nine.map((p) => p.user.id), blue: [], ref: rnd(6) }, one.owner.session);
    assert.equal(s5, 400, 'takım en fazla 8 kişi');
    assert.equal(e5.error, 'Kırmızı Takım en fazla 8 kişi olabilir');
  });

  test('Normal PK: sonradan mikrofona geçen katılır ve puan alır; ikinci kez katılmak bir şey değiştirmez', async () => {
    const { owner, a, b, fan, room } = await setUp();
    assert.equal((await join(b.session, room))[0], 404, 'odada PK yokken katılınmaz');
    await call('POST', '/api/rooms/pk', { room, mode: 'solo', durationMin: 15, participants: [a.user.id], ref: rnd(6) }, owner.session);
    await wait(400);
    await gift(fan.session, b.user.id, room); // before b joined: not competing yet
    const [js, j] = await join(b.session, room);
    assert.equal(js, 200, j.error);
    assert.deepEqual(j.pk.participants, [a.user.id, b.user.id]);
    assert.deepEqual((await join(b.session, room))[1].pk.participants, [a.user.id, b.user.id], 'ikinci kez: aynı');
    await gift(fan.session, b.user.id, room);
    const pk = await read(a.session, room);
    assert.deepEqual(pk.participants, [a.user.id, b.user.id], 'herkes aynı listeyi görür');
    assert.deepEqual(pk.pairs, [{ from: fan.user.id, to: b.user.id, team: null, points: 200, gifts: 1 }]);
    assert.ok(pk.people.some((p) => p.id === b.user.id && p.name === 'Bora'));
  });

  test('Takım PK: sonradan gelen az kişili takıma girer (eşitse ikisinden biri), takımlar dolunca ve dışarıda bırakılan katılmaz', async () => {
    const { owner, a, b, fan, room } = await setUp();
    const [late1, late2, out] = await people(3, 'Geç');
    const [st, r] = await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 15, red: [a.user.id, b.user.id], blue: [], out: [out.user.id], ref: rnd(6) }, owner.session);
    assert.equal(st, 200, r.error);
    assert.deepEqual(r.pk.out, [out.user.id]);
    const j1 = (await join(late1.session, room))[1].pk;
    assert.deepEqual([j1.red, j1.blue], [[a.user.id, b.user.id], [late1.user.id]], 'az kişili takım: Mavi');
    const j2 = (await join(late2.session, room))[1].pk;
    assert.deepEqual(j2.blue, [late1.user.id, late2.user.id], 'yine Mavi (1 < 2)');
    assert.deepEqual(j2.participants.sort(), [a.user.id, b.user.id, late1.user.id, late2.user.id].sort());
    const [os, o] = await join(out.session, room);
    assert.equal(os, 200, o.error);
    assert.ok(!o.pk.participants.includes(out.user.id), 'dışarıda bırakılan katılmaz');
    // 2–2: the next one goes to either team.
    const [late3] = await people(1, 'Eşit');
    const j3 = (await join(late3.session, room))[1].pk;
    assert.equal(j3.red.length + j3.blue.length, 5);
    assert.ok(Math.abs(j3.red.length - j3.blue.length) === 1);
    await wait(400);
    await gift(fan.session, late1.user.id, room);
    assert.deepEqual((await read(owner.session, room)).pairs.map((p) => [p.to, p.team, p.points]), [[late1.user.id, 'blue', 200]], 'puan takımına yazılır');

    const full = await setUp();
    const sixteen = await people(16, 'Dolu');
    const [fs, f] = await call('POST', '/api/rooms/pk', { room: full.room, mode: 'team', durationMin: 15, red: sixteen.slice(0, 8).map((p) => p.user.id), blue: sixteen.slice(8).map((p) => p.user.id), ref: rnd(6) }, full.owner.session);
    assert.equal(fs, 200, f.error);
    const [ls, l] = await join(full.a.session, full.room);
    assert.equal(ls, 200, l.error);
    assert.ok(!l.pk.participants.includes(full.a.user.id), 'iki takım da dolu: dışarıda kalır');
    assert.deepEqual([l.pk.red.length, l.pk.blue.length], [8, 8]);
  });

  test('aynı anda katılan sekiz kişi takımları dengeli doldurur', async () => {
    const { owner, room } = await setUp();
    await call('POST', '/api/rooms/pk', { room, mode: 'team', durationMin: 15, red: [], blue: [], ref: rnd(6) }, owner.session);
    const many = await people(8, 'Akın');
    const answers = await Promise.all(many.map((p) => join(p.session, room)));
    assert.ok(answers.every(([s]) => s === 200));
    const pk = await read(owner.session, room);
    assert.deepEqual([pk.red.length, pk.blue.length], [4, 4]);
    assert.equal(new Set([...pk.red, ...pk.blue]).size, 8);
  });
});
