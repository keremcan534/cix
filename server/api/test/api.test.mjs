// API tests against a real Postgres: each run creates an empty database, starts the API on it as a separate
// process and talks to it over HTTP, then drops the database.
//   PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const PG = { host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5432), user: process.env.POSTGRES_USER ?? 'postgres', password: process.env.POSTGRES_PASSWORD ?? '' };
const DB = `similar_test_${process.pid}`;
const PORT = 17000 + (process.pid % 2000);
const B = `http://127.0.0.1:${PORT}`;
let api;
let sql;

before(async () => {
  const root = new pg.Client({ ...PG, database: 'postgres' });
  await root.connect();
  await root.query(`CREATE DATABASE ${DB}`);
  await root.end();
  sql = new pg.Pool({ ...PG, database: DB });
  api = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'index.mjs')], {
    env: { ...process.env, PGHOST: PG.host, PGPORT: String(PG.port), POSTGRES_USER: PG.user, POSTGRES_PASSWORD: PG.password, POSTGRES_DB: DB, LIVEKIT_KEYS: 'testkey: testsecret', API_PORT: String(PORT), ALLOW_TEST_TOPUP: '1', RATE_AUTH: '100000', RATE_ALL: '100000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    api.stdout.on('data', (d) => String(d).includes('api on') && resolve());
    api.on('exit', (code) => reject(new Error(`api exited ${code}`)));
  });
});

after(async () => {
  api?.kill();
  await sql?.end();
  const root = new pg.Client({ ...PG, database: 'postgres' });
  await root.connect();
  await root.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await root.end();
});

const rnd = (n = 12) => crypto.randomBytes(n).toString('hex');
async function call(method, p, body, session) {
  const r = await fetch(B + p, { method, headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json()];
}
async function signUp(name = `Test ${rnd(2)}`, deviceKey = rnd(24)) {
  const [st, j] = await call('POST', '/api/auth/dev', { deviceKey, name });
  assert.equal(st, 200, j.error);
  return { ...j, deviceKey };
}
const tokenOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));

describe('Giriş ve cüzdan', () => {
  test('kayıt, tekrar giriş, test yüklemesi tek kez, hediye ve yetersiz bakiye', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    const [, again] = await call('POST', '/api/auth/dev', { deviceKey: b.deviceKey });
    assert.equal(again.user.id, b.user.id);
    assert.equal((await call('GET', '/api/me'))[0], 401);
    const ref = rnd(6);
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 5000, ref }, a.session))[1].user.coins, 5000);
    const [, replay] = await call('POST', '/api/wallet/test-topup', { amount: 5000, ref }, a.session);
    assert.ok(replay.replay && replay.user.coins === 5000);
    const g = rnd(6);
    await Promise.all([1, 2].map(() => call('POST', '/api/wallet/gift', { to: b.user.id, amount: 1200, ref: g }, a.session)));
    assert.equal((await call('GET', '/api/me', null, a.session))[1].user.coins, 3800);
    assert.equal((await call('GET', '/api/me', null, b.session))[1].user.diamonds, 1200);
    assert.equal((await call('POST', '/api/wallet/gift', { to: b.user.id, amount: 999999, ref: rnd(6) }, a.session))[0], 409);
    assert.equal((await call('POST', '/api/wallet/gift', { to: a.user.id, amount: 1, ref: rnd(6) }, a.session))[0], 400);
  });
});

describe('Profil', () => {
  test('güncelleme, benzersiz kullanıcı adı, 18 yaş, doğum tarihi bir kez', async () => {
    const a = await signUp('Ada');
    const b = await signUp('Bora');
    const name = `ada_${rnd(3)}`;
    const [st, j] = await call('PATCH', '/api/me', { username: name.toUpperCase(), gender: 'Kadın', birthDate: '2000-05-20', city: 'İzmir', bio: 'Merhaba', interests: ['🎧 Müzik', '☕ Kahve'] }, a.session);
    assert.equal(st, 200, j.error);
    assert.equal(j.user.username, name, 'küçük harfe çevrilir');
    assert.ok(j.user.age >= 26);
    assert.equal((await call('PATCH', '/api/me', { username: name }, b.session))[0], 409, 'alınmış ad');
    const young = new Date(Date.now() - 17 * 365.25 * 864e5).toISOString().slice(0, 10);
    assert.equal((await call('PATCH', '/api/me', { birthDate: young }, b.session))[0], 403, '18 yaş altı');
    assert.equal((await call('PATCH', '/api/me', { birthDate: '1999-01-01' }, a.session))[0], 409, 'doğum tarihi değişmez');
    assert.equal((await call('PATCH', '/api/me', { interests: ['🦄 Yok'] }, a.session))[0], 400);
    assert.equal((await call('PATCH', '/api/me', { avatarUrl: 'http://x.com/a.png' }, a.session))[0], 400, 'yalnız https');
  });

  test('herkese açık profil bakiye ve doğum tarihi göstermez', async () => {
    const a = await signUp('Can');
    const b = await signUp('Deniz');
    await call('PATCH', '/api/me', { birthDate: '1995-03-03' }, a.session);
    const [, j] = await call('GET', `/api/user?id=${a.user.id}`, null, b.session);
    assert.equal(j.user.name, 'Can');
    assert.equal(j.user.coins, undefined);
    assert.equal(j.user.birthDate, undefined);
    assert.equal(j.user.role, undefined);
    assert.equal(typeof j.user.age, 'number');
  });
});

describe('Takip ve engelleme', () => {
  test('takip sayıları; engelleme takipleri bitirir ve iki yönde de kapatır', async () => {
    const a = await signUp('Ece');
    const b = await signUp('Fatih');
    await call('POST', '/api/follow', { to: b.user.id }, a.session);
    await call('POST', '/api/follow', { to: a.user.id }, b.session);
    let [, j] = await call('GET', `/api/user?id=${b.user.id}`, null, a.session);
    assert.deepEqual([j.user.followers, j.user.following, j.user.isFollowing], [1, 1, true]);
    assert.equal((await call('GET', '/api/following', null, a.session))[1].users[0].id, b.user.id);

    assert.equal((await call('POST', '/api/block', { to: b.user.id }, a.session))[1].blocked, true);
    [, j] = await call('GET', `/api/user?id=${b.user.id}`, null, a.session);
    assert.deepEqual([j.user.followers, j.user.following, j.user.blockedByMe], [0, 0, true], 'takipler bitti; engelleyen açabilir');
    assert.equal((await call('GET', `/api/user?id=${a.user.id}`, null, b.session))[0], 404, 'engellenen için yok');
    assert.equal((await call('POST', '/api/follow', { to: a.user.id }, b.session))[0], 403);
    assert.equal((await call('GET', '/api/blocks', null, a.session))[1].users.length, 1);
    await call('POST', '/api/block', { to: b.user.id, block: false }, a.session);
    assert.equal((await call('POST', '/api/follow', { to: a.user.id }, b.session))[0], 200, 'engel kalkınca takip edilebilir');
  });
});

describe('Mesajlar', () => {
  test('gönderme bir kez, sohbet listesi, okunmamış ve okundu; engelde kapalı', async () => {
    const a = await signUp('Gül');
    const b = await signUp('Hakan');
    const ref = rnd(6);
    const [st, m] = await call('POST', '/api/messages', { to: b.user.id, text: '  Selam!  ', ref }, a.session);
    assert.equal(st, 200, m.error);
    assert.equal(m.message.text, 'Selam!');
    assert.equal((await call('POST', '/api/messages', { to: b.user.id, text: 'Selam!', ref }, a.session))[1].replay, true);
    await call('POST', '/api/messages', { to: a.user.id, text: 'Selam, nasılsın?', ref: rnd(6) }, b.session);
    await call('POST', '/api/messages', { to: b.user.id, text: 'İyiyim', ref: rnd(6) }, a.session);

    const [, list] = await call('GET', `/api/messages?with=${a.user.id}`, null, b.session);
    assert.deepEqual(list.messages.map((x) => x.text), ['İyiyim', 'Selam, nasılsın?', 'Selam!']);
    const [, older] = await call('GET', `/api/messages?with=${a.user.id}&before=${list.messages[1].id}`, null, b.session);
    assert.deepEqual(older.messages.map((x) => x.text), ['Selam!']);

    let [, conv] = await call('GET', '/api/conversations', null, b.session);
    assert.equal(conv.conversations.length, 1);
    assert.deepEqual([conv.conversations[0].user.id, conv.conversations[0].last.text, conv.conversations[0].unread], [a.user.id, 'İyiyim', 2]);
    assert.equal((await call('POST', '/api/messages/read', { with: a.user.id }, b.session))[1].read, 2);
    [, conv] = await call('GET', '/api/conversations', null, b.session);
    assert.equal(conv.conversations[0].unread, 0);

    await call('POST', '/api/block', { to: a.user.id }, b.session);
    assert.equal((await call('POST', '/api/messages', { to: b.user.id, text: 'Hey', ref: rnd(6) }, a.session))[0], 403);
    assert.equal((await call('POST', '/api/messages', { to: a.user.id, text: 'x'.repeat(1001), ref: rnd(6) }, b.session))[0], 400);
  });
});

describe('Odalar ve ses token’ı', () => {
  test('oda açma, tek açık oda, şifre, yönetici, atma, kara liste, kapanma', async () => {
    const owner = await signUp('Sahip');
    const admin = await signUp('Yönetici');
    const guest = await signUp('Misafir');
    const [st, j] = await call('POST', '/api/rooms', { title: 'Gece Sohbeti', password: '1234' }, owner.session);
    assert.equal(st, 200, j.error);
    const room = j.room;
    assert.ok(room.hasPassword);
    assert.equal((await call('POST', '/api/rooms', { title: 'İkinci' }, owner.session))[0], 409);
    assert.ok((await call('GET', '/api/rooms', null, guest.session))[1].rooms.some((r) => r.id === room.id));

    const lk = `oda-${room.id}`;
    assert.equal((await call('GET', `/token?room=${lk}`, null, guest.session))[0], 403, 'şifresiz');
    assert.equal((await call('GET', `/token?room=${lk}&password=0000`, null, guest.session))[0], 403, 'yanlış şifre');
    const [, t] = await call('GET', `/token?room=${lk}&password=1234`, null, guest.session);
    assert.equal(tokenOf(t.token).video.room, lk);
    assert.equal((await call('GET', `/token?room=${lk}`, null, owner.session))[0], 200, 'sahip şifresiz girer');
    assert.equal((await call('GET', '/token?room=oda-r1', null, guest.session))[0], 200, 'prototip odaları etkilenmez');

    assert.equal((await call('POST', '/api/rooms/ban', { room: room.id, user: guest.user.id, minutes: 10 }, guest.session))[0], 403, 'yetkisiz');
    await call('POST', '/api/rooms/admin', { room: room.id, user: admin.user.id }, owner.session);
    assert.equal((await call('POST', '/api/rooms/ban', { room: room.id, user: guest.user.id, minutes: 10 }, admin.session))[0], 200);
    assert.equal((await call('GET', `/token?room=${lk}&password=1234`, null, guest.session))[0], 403, 'atılan giremez');
    assert.equal((await call('POST', '/api/rooms/ban', { room: room.id, user: owner.user.id, minutes: 10 }, admin.session))[0], 400, 'sahip atılamaz');
    await call('POST', '/api/rooms/unban', { room: room.id, user: guest.user.id }, admin.session);
    assert.equal((await call('GET', `/token?room=${lk}&password=1234`, null, guest.session))[0], 200, 'yasak kalkınca girer');
    await call('POST', '/api/rooms/ban', { room: room.id, user: guest.user.id, minutes: null }, owner.session);
    assert.equal((await call('GET', `/token?room=${lk}&password=1234`, null, guest.session))[1].error, 'Bu odaya giremezsin', 'kara liste');

    assert.equal((await call('POST', '/api/rooms/close', { id: room.id }, admin.session))[0], 403, 'kapatmak sahibin işi');
    await call('POST', '/api/rooms/close', { id: room.id }, owner.session);
    assert.equal((await call('GET', `/token?room=${lk}`, null, owner.session))[0], 410);
    assert.equal((await call('POST', '/api/rooms', { title: 'Yeni oda' }, owner.session))[0], 200, 'kapanınca yeni oda açılır');
  });

  test('sahibini engellediğin oda listede yok ve girilmez', async () => {
    const owner = await signUp('Oda Sahibi');
    const other = await signUp('Diğer');
    const [, j] = await call('POST', '/api/rooms', { title: 'Müzik' }, owner.session);
    await call('POST', '/api/block', { to: owner.user.id }, other.session);
    assert.ok(!(await call('GET', '/api/rooms', null, other.session))[1].rooms.some((r) => r.id === j.room.id));
    assert.equal((await call('GET', `/token?room=oda-${j.room.id}`, null, other.session))[0], 403);
  });
});

describe('Şikâyet ve moderasyon', () => {
  test('şikâyet bir kez; yetkili kuyruğu görür, askıya alır; askıdaki hesap kullanılamaz', async () => {
    const reporter = await signUp('Şikâyetçi');
    const bad = await signUp('Kötü');
    const mod = await signUp('Moderatör');
    for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/api/report', { type: 'user', id: bad.user.id, reason: 'Taciz' }, reporter.session))[0], 200);
    assert.equal((await call('POST', '/api/report', { type: 'kedi', id: 'x', reason: 'a' }, reporter.session))[0], 400);

    assert.equal((await call('GET', '/api/admin/reports', null, reporter.session))[0], 403, 'kullanıcı kuyruğu göremez');
    await sql.query("UPDATE users SET role = 'moderator' WHERE id = $1", [mod.user.id]);
    const [, q] = await call('GET', '/api/admin/reports', null, mod.session);
    const mine = q.reports.filter((r) => r.target.id === bad.user.id);
    assert.equal(mine.length, 1, 'aynı kişi aynı hedefi bir kez şikâyet eder');
    assert.equal((await call('POST', '/api/admin/reports/handle', { id: mine[0].id, status: 'actioned', banDays: 0 }, mod.session))[0], 400);
    assert.equal((await call('GET', '/api/admin/reports', null, mod.session))[1].reports.some((r) => r.id === mine[0].id), true, 'geçersiz istek şikâyeti açık bırakır');
    const [st, h] = await call('POST', '/api/admin/reports/handle', { id: mine[0].id, status: 'actioned', banDays: 7 }, mod.session);
    assert.equal(st, 200, h.error);
    assert.ok(h.bannedUntil);
    const [code, err] = await call('GET', '/api/me', null, bad.session);
    assert.equal(code, 403);
    assert.match(err.error, /askıya alındı/);
    await call('POST', '/api/admin/ban', { user: bad.user.id, days: null }, mod.session);
    assert.equal((await call('GET', '/api/me', null, bad.session))[0], 200, 'yasak kaldırılınca açılır');
    assert.equal((await call('POST', '/api/admin/ban', { user: mod.user.id, days: 1 }, mod.session))[0], 404, 'yetkili askıya alınamaz');
  });
});

describe('Hesap silme', () => {
  test('kişisel veriler gider, işlem kaydı kalır, aynı cihaz yeni hesap açar', async () => {
    const a = await signUp('Silinecek');
    const b = await signUp('Arkadaş');
    await call('PATCH', '/api/me', { username: `sil_${rnd(3)}`, bio: 'gizli', birthDate: '1990-01-01' }, a.session);
    await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, a.session);
    await call('POST', '/api/follow', { to: b.user.id }, a.session);
    await call('POST', '/api/messages', { to: b.user.id, text: 'merhaba', ref: rnd(6) }, a.session);
    const [, r] = await call('POST', '/api/rooms', { title: 'Odam' }, a.session);

    assert.equal((await call('DELETE', '/api/me', null, a.session))[1].deleted, true);
    assert.equal((await call('GET', '/api/me', null, a.session))[0], 401, 'oturum kapandı');
    assert.equal((await call('GET', `/api/user?id=${a.user.id}`, null, b.session))[0], 404);
    assert.equal((await call('GET', '/api/conversations', null, b.session))[1].conversations.length, 0, 'mesajlar silindi');
    assert.equal((await call('GET', `/api/room?id=${r.room.id}`, null, b.session))[1].room.closed, true);
    const row = (await sql.query('SELECT name, username, bio, birth_date, device_key_hash FROM users WHERE id = $1', [a.user.id])).rows[0];
    assert.deepEqual(row, { name: 'Silinmiş hesap', username: null, bio: '', birth_date: null, device_key_hash: null });
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM ledger WHERE user_id = $1', [a.user.id])).rows[0].n, 1, 'mali kayıt saklanır');
    const again = await signUp('Yeni', a.deviceKey);
    assert.notEqual(again.user.id, a.user.id, 'aynı cihaz yeni ve boş hesap');
    assert.equal(again.user.coins, 0);
  });
});
