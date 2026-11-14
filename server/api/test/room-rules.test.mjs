// A server room's rules, members and Patron koltuğu (rooms.mjs, room-rules.mjs) against a real Postgres and a fake
// LiveKit: who may change which rule and at what level, the Sahne room's mic queue, members in open, apply and closed
// rooms, private rooms and the people limit at the voice token, mics for members only, and the Patron koltuğu's
// switch and mode (who sits: boss-seat.test.mjs).
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import fs from 'node:fs';
import path from 'node:path';

import { BOSS_SEAT_MIN_LEVEL, LIMIT_OPTIONS, MIC_PERMISSION_MIN_LEVEL, ROOM_MEMBER_CAPS, applyRules, memberCap, rulesOf } from '../room-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
let lkRooms = [];
const LK_PORT = 23000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    lkCalls.push({ method, body: JSON.parse(body || '{}') });
    const answer = method === 'ListRooms' ? { rooms: lkRooms } : method === 'ListParticipants' ? { participants: [] } : {};
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer));
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
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
const roomPackets = (from) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')))
    .filter((p) => p.type === 'room');
async function roomOf(owner, extra = {}) {
  const j = await ok(call('POST', '/api/rooms', { title: `Kural ${rnd(2)}`, ...extra }, owner.session), 'oda');
  return j.room.id;
}
const setLevelXp = (owner, xp) => h.sql.query('UPDATE users SET room_xp = $2 WHERE id = $1', [owner.user.id, xp]);
const update = (s, body) => call('POST', '/api/rooms/update', body, s);
const token = (s, room, q = '') => call('GET', `/token?room=oda-${room}${q}`, null, s);

describe('Oda kuralları: okuma ve doğrulama', () => {
  test('uygulamadaki sınırlar ve seviye kilitleri sunucudakiyle aynı', () => {
    const app = path.join(import.meta.dirname, '..', '..', '..', 'app', 'src');
    const catalog = fs.readFileSync(path.join(app, 'data', 'catalog.ts'), 'utf8');
    const num = (name) => Number(new RegExp(`export const ${name} = ([0-9_]+);`).exec(catalog)[1].replace(/_/g, ''));
    const members = [...catalog.slice(catalog.indexOf('export const ROOM_LIMITS')).matchAll(/members: ([0-9_]+)/g)].slice(0, 15).map((m) => Number(m[1].replace(/_/g, '')));
    assert.deepEqual(members, ROOM_MEMBER_CAPS);
    assert.equal(num('MIC_PERMISSION_MIN_LEVEL'), MIC_PERMISSION_MIN_LEVEL);
    assert.equal(num('BOSS_SEAT_MIN_LEVEL'), BOSS_SEAT_MIN_LEVEL);
    const owner = fs.readFileSync(path.join(app, 'components', 'room', 'owner.tsx'), 'utf8');
    const limits = /options=\{\[([0-9_, ]+)\]\.map\(\(n\) => \(\{ value: n, label: `\$\{n\.toLocaleString\('tr-TR'\)\} kişi`/.exec(owner)[1];
    assert.deepEqual(limits.split(',').map((x) => Number(x.trim().replace(/_/g, ''))), LIMIT_OPTIONS);
  });

  test('bozuk kayıt varsayılana düşer; kelimeler küçük harf ve tekil', () => {
    const r = rulesOf({ joinMode: 'herkes', limit: 7, bot: 'evet', words: ['  KÖTÜ  ', 'kötü', 'x', 42, 'İyi Değil'] });
    assert.equal(r.joinMode, 'open');
    assert.equal(r.limit, null);
    assert.equal(r.bot, false);
    assert.deepEqual(r.words, ['kötü', 'iyi değil']);
  });

  test('kim neyi değiştirir, seviye kilitleri', () => {
    const now = rulesOf({});
    assert.equal(applyRules(now, { slowMode: true }, { rank: 1, level: 1 }).slowMode, true);
    assert.throws(() => applyRules(now, { bot: true }, { rank: 2, level: 1 }), /yalnızca oda sahibi/);
    assert.throws(() => applyRules({ ...now, manageFunctions: 'owner' }, { words: ['spam'] }, { rank: 1, level: 1 }), /yetkili yöneticiler/);
    assert.throws(() => applyRules(now, { micPermission: 'members' }, { rank: 3, level: 3 }), /Lv\.4/);
    assert.throws(() => applyRules(now, { bossSeat: true }, { rank: 3, level: 2 }), /Lv\.3/);
    assert.throws(() => applyRules(now, { limit: 500 }, { rank: 3, level: 1 }), /en fazla 50 kişi/);
    assert.equal(applyRules(now, { limit: 500 }, { rank: 3, level: 5 }).limit, 500);
    assert.throws(() => applyRules(now, { words: ['a'] }, { rank: 3, level: 1 }), /2–20/);
    assert.throws(() => applyRules(now, { hız: 3 }, { rank: 3, level: 1 }), /Bilinmeyen/);
    assert.equal(memberCap(1), 50);
    assert.equal(memberCap(15), 5_000);
  });
});

describe('Oda kuralları sunucuda', () => {
  test('sahip kuralları değiştirir, herkes aynısını okur; yönetici yalnızca yavaş modu ve kelimeleri', async () => {
    const owner = await signUp('Kural Sahibi');
    const admin = await signUp('Kural Yöneticisi');
    const guest = await signUp('Misafir');
    const room = await roomOf(owner);
    const named = lkCalls.length;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    // Naming an admin tells the room as well (sent without waiting): it lands before the packets below are counted.
    assert.ok(await until(() => roomPackets(named).length === 1), 'yönetici atanınca da haber gider');
    const from = lkCalls.length;
    let j = await ok(update(owner.session, { id: room, rules: { bot: true, joinMode: 'apply', words: ['Spam', 'reklam'] } }), 'kural');
    assert.equal(j.room.rules.bot, true);
    assert.equal(j.room.rules.joinMode, 'apply');
    assert.deepEqual(j.room.rules.words, ['spam', 'reklam']);
    assert.ok(await until(() => roomPackets(from).length === 1), 'odadaki telefonlar yeniden okur');
    j = await ok(update(admin.session, { id: room, rules: { slowMode: true } }), 'yavaş mod');
    assert.equal(j.room.rules.slowMode, true);
    assert.equal((await update(admin.session, { id: room, rules: { bot: false } }))[0], 403);
    assert.equal((await update(guest.session, { id: room, rules: { slowMode: false } }))[0], 403);
    const seen = (await ok(call('GET', `/api/room?id=${room}`, null, guest.session), 'oda')).room.rules;
    assert.deepEqual([seen.slowMode, seen.bot, seen.words], [true, true, ['spam', 'reklam']]);
  });

  test('Sahne odasında mikrofon kuyruğu hep açık; oda tipini yalnızca sahip değiştirir', async () => {
    const owner = await signUp('Sahne Sahibi');
    const admin = await signUp('Sahne Yöneticisi');
    const room = await roomOf(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id, super: true }, owner.session), 'süper');
    assert.equal((await update(admin.session, { id: room, roomType: 'stage' }))[0], 403);
    let j = await ok(update(owner.session, { id: room, roomType: 'stage' }), 'sahne');
    assert.deepEqual([j.room.roomType, j.room.micQueue], ['stage', true]);
    assert.equal((await update(owner.session, { id: room, micQueue: false }))[0], 400);
    assert.equal((await update(owner.session, { id: room, roomType: 'disko' }))[0], 400);
    j = await ok(update(owner.session, { id: room, roomType: 'free', micQueue: false }), 'serbest');
    assert.deepEqual([j.room.roomType, j.room.micQueue], ['free', false]);
  });
});

describe('Oda üyeleri', () => {
  test('açık odada hemen üye, başvurulu odada onayla, kapalı oda almaz; yetkili çıkarılamaz', async () => {
    const owner = await signUp('Üye Sahibi');
    const admin = await signUp('Üye Yöneticisi');
    const a = await signUp('Ayşe');
    const b = await signUp('Burak');
    const c = await signUp('Cem');
    const room = await roomOf(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    assert.deepEqual(await ok(call('POST', '/api/rooms/members/join', { room }, a.session), 'katıl'), { status: 'member' });

    await ok(update(owner.session, { id: room, rules: { joinMode: 'apply' } }), 'başvurulu');
    assert.deepEqual(await ok(call('POST', '/api/rooms/members/join', { room }, b.session), 'başvur'), { status: 'pending' });
    // The count is the room's people: the owner and the admin with the one member (a pending request isn't one).
    let list = await ok(call('GET', `/api/rooms/members?room=${room}`, null, b.session), 'liste');
    assert.deepEqual([list.mine, list.total, list.pending.length, list.canManage], ['pending', 3, 0, false]);
    assert.equal((await call('POST', '/api/rooms/members/answer', { room, user: b.user.id, accept: true }, a.session))[0], 403, 'üye cevaplayamaz');
    list = await ok(call('GET', `/api/rooms/members?room=${room}`, null, admin.session), 'yönetici listesi');
    assert.deepEqual(list.pending.map((p) => p.id), [b.user.id]);
    assert.equal(list.mine, 'admin', 'yönetici üyeliğini yetkili olarak görür');
    await ok(call('POST', '/api/rooms/members/answer', { room, user: b.user.id, accept: true }, admin.session), 'onay');
    list = await ok(call('GET', `/api/rooms/members?room=${room}`, null, owner.session), 'sahip listesi');
    assert.deepEqual([list.mine, list.total, list.cap], ['owner', 4, 50]);
    assert.deepEqual(list.members.map((m) => m.id), [owner.user.id, admin.user.id, a.user.id, b.user.id], 'önce sahip ve yönetici, sonra üyeler');

    // Only the owner answers members now.
    await ok(update(owner.session, { id: room, rules: { joinMode: 'closed', manageMembers: 'owner' } }), 'kapalı');
    assert.equal((await call('POST', '/api/rooms/members/join', { room }, c.session))[0], 403);
    assert.equal((await call('POST', '/api/rooms/members/remove', { room, user: a.user.id }, admin.session))[0], 403, 'yönetici artık çıkaramaz');
    await ok(call('POST', '/api/rooms/members/remove', { room, user: a.user.id }, owner.session), 'çıkar');
    assert.equal((await call('POST', '/api/rooms/members/remove', { room, user: admin.user.id }, owner.session))[0], 403, 'yetkili çıkarılamaz');
    await ok(call('POST', '/api/rooms/members/leave', { room }, b.session), 'ayrıl');
    assert.equal((await ok(call('GET', `/api/rooms/members?room=${room}`, null, owner.session), 'son')).total, 2, 'sahip ve yönetici kalır');
  });

  test('oda üyeleri sayısı listedekilerle aynı: sahip ve yöneticiler sayılır; kapasite de onları sayar', async () => {
    // The client's card: the owner and a Yönetici, nobody joined yet. It read "Oda üyeleri (0 / 5.000)".
    const owner = await signUp('Sayı Sahibi');
    const admin = await signUp('Sayı Yöneticisi');
    const room = await roomOf(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    const card = await ok(call('GET', `/api/rooms/members?room=${room}`, null, owner.session), 'kart');
    assert.deepEqual([card.total, card.members.map((m) => m.id)], [2, [owner.user.id, admin.user.id]]);
    const all = await ok(call('GET', `/api/rooms/members/list?room=${room}`, null, owner.session), 'tam liste');
    assert.equal(all.counts.all, card.total, 'kart ile liste aynı sayar');
    // An admin who had joined before is counted once.
    await ok(call('POST', '/api/rooms/members/join', { room }, admin.session), 'yönetici üye olur');
    assert.equal((await ok(call('GET', `/api/rooms/members?room=${room}`, null, owner.session), 'yine')).total, 2);
    // Following the room is not membership: followers have their own count.
    const fan = await signUp('Sayı Takipçisi');
    await ok(call('POST', '/api/rooms/follow', { room }, fan.session), 'takip');
    assert.equal((await ok(call('GET', `/api/rooms/members?room=${room}`, null, fan.session), 'takipçi okur')).total, 2);
    // The cap (50 at Lv.1) counts the same people: 48 members fill it with the owner and the admin.
    await h.sql.query(
      `WITH made AS (INSERT INTO users (name) SELECT 'Dolu ' || g FROM generate_series(1, 48) g RETURNING id)
       INSERT INTO room_members (room_id, user_id, status) SELECT $1, id, 'member' FROM made`,
      [room],
    );
    assert.equal((await ok(call('GET', `/api/rooms/members?room=${room}`, null, owner.session), 'dolu')).total, 50);
    const [st, j] = await call('POST', '/api/rooms/members/join', { room }, fan.session);
    assert.deepEqual([st, j.error], [403, 'Üye kapasitesi dolu (50)']);
    // A deleted account isn't counted.
    const gone = (await h.sql.query("SELECT user_id FROM room_members WHERE room_id = $1 AND user_id <> $2 LIMIT 1", [room, admin.user.id])).rows[0].user_id;
    await h.sql.query('UPDATE users SET deleted_at = now() WHERE id = $1', [gone]);
    assert.equal((await ok(call('GET', `/api/rooms/members?room=${room}`, null, owner.session), 'silinen')).total, 49);
    assert.deepEqual(await ok(call('POST', '/api/rooms/members/join', { room }, fan.session), 'yer açıldı'), { status: 'member' });
  });

  test('Özel oda: yalnızca yetkili ve üyeler, şifre varsa şifreyle; katılımcı limiti dolunca yetkili dışı giremez', async () => {
    const owner = await signUp('Özel Sahip');
    const member = await signUp('Özel Üye');
    const stranger = await signUp('Yabancı');
    const room = await roomOf(owner);
    await ok(call('POST', '/api/rooms/members/join', { room }, member.session), 'üye');
    await ok(update(owner.session, { id: room, roomType: 'private' }), 'özel');
    assert.equal((await token(stranger.session, room))[0], 403);
    assert.equal((await token(member.session, room))[0], 200);
    assert.equal((await token(owner.session, room))[0], 200);
    // A Lv.4 room may lock with a password; then a stranger with it gets in.
    await setLevelXp(owner, 600);
    await ok(update(owner.session, { id: room, password: '4321' }), 'şifre');
    assert.equal((await token(stranger.session, room, '&password=4321'))[0], 200);
    assert.equal((await token(member.session, room))[0], 200, 'üye şifresiz girer');

    await ok(update(owner.session, { id: room, roomType: 'free', password: null }), 'açık');
    await ok(update(owner.session, { id: room, rules: { limit: 50 } }), 'limit');
    lkRooms = [{ name: `oda-${room}`, num_participants: 50 }];
    await new Promise((r) => setTimeout(r, 10_100)); // the voice counts are kept 10 seconds
    const [st, j] = await token(stranger.session, room);
    assert.equal(st, 403);
    assert.match(j.error, /Oda dolu/);
    assert.equal((await token(owner.session, room))[0], 200, 'sahip girer');
    lkRooms = [];
  });

  test('mikrofon yalnız üyelere: üye olmayanın sesi kapalı, üye olunca açık', async () => {
    const owner = await signUp('Mik Sahibi');
    const fan = await signUp('Mik Dinleyici');
    const room = await roomOf(owner);
    await setLevelXp(owner, 600); // Lv.4
    await ok(update(owner.session, { id: room, rules: { micPermission: 'members' } }), 'izin');
    assert.equal((await ok(token(fan.session, room), 'token')).canPublish, false);
    assert.equal((await ok(token(owner.session, room), 'sahip')).canPublish, true);
    await ok(call('POST', '/api/rooms/members/join', { room }, fan.session), 'üye');
    assert.equal((await ok(token(fan.session, room), 'üye token')).canPublish, true);
  });
});

describe('Patron koltuğu', () => {
  test('Lv.3 odada açılır; mod yalnızca sahibin, açılınca otomatik ve boş başlar; kapanınca okunmaz', async () => {
    const owner = await signUp('Patron Sahibi');
    const admin = await signUp('Patron Yöneticisi');
    const room = await roomOf(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    assert.equal((await update(owner.session, { id: room, rules: { bossSeat: true } }))[0], 403, 'Lv.3 gerekir');
    await setLevelXp(owner, 300); // Lv.3
    const from = lkCalls.length;
    let j = await ok(update(owner.session, { id: room, rules: { bossSeat: true } }), 'patron koltuğu');
    assert.equal(j.room.rules.bossMode, 'auto');
    assert.equal(j.room.boss, null);
    assert.deepEqual([j.room.bossSeat.mode, j.room.bossSeat.holder, j.room.bossSeat.minCoins, j.room.bossSeat.minutes], ['auto', null, 25_000, 10]);
    assert.ok(await until(() => roomPackets(from).length >= 1), 'odadaki telefonlar yeniden okur');
    assert.equal((await update(admin.session, { id: room, rules: { bossMode: 'invite' } }))[0], 403, 'modu yalnızca sahip değiştirir');
    assert.equal((await update(owner.session, { id: room, rules: { bossMode: 'herkes' } }))[0], 400);
    j = await ok(update(owner.session, { id: room, rules: { bossMode: 'invite' } }), 'davet modu');
    assert.equal(j.room.bossSeat.mode, 'invite');
    await ok(update(owner.session, { id: room, rules: { bossSeat: false } }), 'kapat');
    j = await ok(call('GET', `/api/room?id=${room}`, null, owner.session), 'oda');
    assert.deepEqual([j.room.boss, j.room.bossSeat], [null, null]);
  });
});
