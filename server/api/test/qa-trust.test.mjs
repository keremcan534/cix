// Server trust fixes from the end-user QA run, against a real Postgres:
//   - a bond accept under load can't take the whole API down (its block check runs on its own connection; the
//     pool is kept small here so the old self-deadlock would show at once),
//   - lifting a sanction follows the rank rules of applying one (no self-lift, no peer, nothing a higher rank gave),
//     the panel's "Askıyı kaldır" too, and 'Süresiz' from a report is a lifetime ban with the report's category,
//   - an empty room closes: when LiveKit says it finished, and in the cleanup when it was never joined.
// A fake LiveKit answers ListRooms with the rooms a test says are open.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkOpen = new Set();
let listCalls = 0;
const lk = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const method = req.url.split('/').pop();
    if (method === 'ListRooms') listCalls++;
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(method === 'ListRooms' ? { rooms: [...lkOpen].map((name) => ({ name })) } : {}));
  });
});
// Port 0: the system picks a free one, so parallel test files never collide.
await new Promise((r) => lk.listen(0, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${lk.address().port}`, PG_POOL: '3', PRESENCE_SWEEP_MS: '150' });
const { call, signUp } = h;

/** One request that gives up after `ms` (status 0) instead of waiting forever on a stuck server. */
const timed = async (method, p, body, session, ms = 15_000) => {
  try {
    const r = await fetch(h.base + p, {
      method,
      headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(ms),
    });
    return [r.status, await r.json()];
  } catch {
    return [0, {}];
  }
};
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
/** Waits until the cleanup has run `n` more times. */
const sweeps = async (n = 2) => {
  const from = listCalls;
  assert.ok(await until(() => listCalls >= from + n), 'temizlik çalıştı');
  // The last run's queries finish after LiveKit answered.
  await new Promise((r) => setTimeout(r, 100));
};

describe('Bağ kabulü yük altında API’yi kilitlemez (sunucu-1)', () => {
  const pair = async () => {
    const a = await signUp('İsteyen');
    const b = await signUp('Kabul Eden');
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, a.session))[0], 200);
    const [st, req] = await call('POST', '/api/bonds/request', { to: b.user.id, kind: 'kanka', ref: rnd(6) }, a.session);
    assert.equal(st, 200, req.error);
    return { a, b, id: req.bond.id };
  };
  const lockWaits = async () =>
    Number((await h.sql.query("SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")).rows[0].n);

  test('iki hesap başka bir işlemde kilitliyken 12 kabul gelir: kilit açılınca hepsi cevaplanır, tek biri geçer', async () => {
    const { a, b, id } = await pair();
    // Another transaction (a gift, say) holds both accounts: every accept that gets a connection waits on it, the
    // rest wait for a connection. Once it ends, the first accept must finish on its own connection.
    const hold = await h.sql.connect();
    let pending;
    try {
      await hold.query('BEGIN');
      await hold.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) FOR UPDATE', [[a.user.id, b.user.id]]);
      pending = Promise.all(Array.from({ length: 12 }, () => timed('POST', '/api/bonds/respond', { id, accept: true }, b.session)));
      assert.ok(await until(async () => (await lockWaits()) >= 3), 'havuzdaki bağlantıların hepsi kilitte bekliyor');
    } finally {
      await hold.query('COMMIT');
      hold.release();
    }
    const codes = (await pending).map(([s]) => s);
    assert.ok(!codes.includes(0), `her istek cevaplandı: ${codes.join(',')}`);
    assert.deepEqual(codes.toSorted(), [200, ...Array(11).fill(409)], codes.join(','));
    assert.equal((await timed('GET', '/api/health', null, null, 5000))[0], 200, 'API cevap vermeye devam ediyor');
    assert.deepEqual([(await me(a.session)).coins, (await me(b.session)).diamonds], [500, 500]);
  });

  test('aynı bağa 12 kabul + 6 geri alma aynı anda: hepsi cevaplanır, tek biri geçer, para tutarlı', async () => {
    const { a, b, id } = await pair();
    const all = await Promise.all([
      ...Array.from({ length: 12 }, () => timed('POST', '/api/bonds/respond', { id, accept: true }, b.session)),
      ...Array.from({ length: 6 }, () => timed('POST', '/api/bonds/withdraw', { id }, a.session)),
    ]);
    const codes = all.map(([s]) => s);
    assert.ok(!codes.includes(0), `her istek cevaplandı: ${codes.join(',')}`);
    assert.equal(codes.filter((s) => s === 200).length, 1, `tek kabul ya da tek geri alma: ${codes.join(',')}`);
    assert.ok(codes.every((s) => s === 200 || s === 409), codes.join(','));
    assert.equal((await timed('GET', '/api/health', null, null, 5000))[0], 200, 'API cevap vermeye devam ediyor');
    const accepted = codes.slice(0, 12).includes(200);
    const [ua, ub] = [await me(a.session), await me(b.session)];
    assert.deepEqual([ua.coins, ub.diamonds], accepted ? [500, 500] : [1000, 0]);
  });
});

describe('Yaptırım kaldırmada rütbe (sunucu-3, yonetim-2)', () => {
  let admin;
  let mod1;
  let mod2;
  const give = async (who, body) => {
    const [st, j] = await call('POST', '/api/admin/sanctions', { reason: 'spam', description: 'Kurallara aykırı davranış', type: 'mute_global_text', minutes: 60, ...body }, who.session);
    assert.equal(st, 200, j.error);
    return j.sanctions[0];
  };
  const lift = (who, id) => call('POST', '/api/admin/sanctions/lift', { id, reason: 'Kaldırma denemesi' }, who.session);
  const statusOf = async (id) => (await h.sql.query('SELECT status FROM user_sanctions WHERE id = $1', [id])).rows[0].status;
  const denials = async (id) => (await h.sql.query("SELECT detail->>'why' AS why FROM sanction_audit_logs WHERE sanction_id = $1 AND action = 'lift' AND result = 'denied' ORDER BY id", [id])).rows.map((x) => x.why);

  test('moderatör kendi cezasını da, başka moderatörünkini de, yöneticinin verdiğini de kaldıramaz', async () => {
    admin = await h.account('Yönetici', 'admin');
    mod1 = await h.account('Moderatör Bir', 'moderator');
    mod2 = await h.account('Moderatör İki', 'moderator');
    const onMod = await give(admin, { user: mod1.user.id });
    const [self, why] = await lift(mod1, onMod.id);
    assert.equal(self, 403, 'kendi cezasını kaldıramaz');
    assert.match(why.error, /Kendi yaptırımını/);
    assert.equal((await lift(mod2, onMod.id))[0], 403, 'eşit rütbedekinin cezasını kaldıramaz');
    assert.equal(await statusOf(onMod.id), 'active');
    assert.deepEqual(await denials(onMod.id), ['self', 'rank'], 'reddedilen denemeler kayıtta');
    assert.equal((await lift(admin, onMod.id))[0], 200, 'üst rütbe kaldırır');

    const u = await signUp('Kullanıcı');
    const byAdmin = await give(admin, { user: u.user.id });
    assert.equal((await lift(mod1, byAdmin.id))[0], 403, 'yöneticinin verdiğini moderatör kaldıramaz');
    assert.equal(await statusOf(byAdmin.id), 'active');
    assert.equal((await lift(admin, byAdmin.id))[0], 200);
    const byMod = await give(mod1, { user: u.user.id });
    assert.equal((await lift(mod2, byMod.id))[0], 200, 'moderatörün verdiği süreli yaptırımı başka moderatör kaldırır');

    // Even an admin can't lift one on themselves (one given by the system, say).
    const own = await h.sql.query(
      "INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, expires_at, created_role, source) VALUES ($1, 'mute_global_text', 'global', 'spam', 'Deneme', now() + interval '1 hour', 'system', 'auto') RETURNING id",
      [admin.user.id],
    );
    assert.equal((await lift(admin, Number(own.rows[0].id)))[0], 403);
  });

  test('"Askıyı kaldır" (ban days=null): yöneticinin verdiği askıyı moderatör kaldıramaz, moderatörünkini kaldırır', async () => {
    const u = await signUp('Askıda');
    const ban = (who, body) => call('POST', '/api/admin/ban', { user: u.user.id, ...body }, who.session);
    assert.equal((await ban(admin, { days: 7 }))[0], 200);
    assert.equal((await ban(mod1, { days: null }))[0], 403);
    const live = async () => Number((await h.sql.query("SELECT count(*) AS n FROM user_sanctions WHERE user_id = $1 AND sanction_type = 'account_ban' AND status = 'active'", [u.user.id])).rows[0].n);
    assert.equal(await live(), 1, 'askı sürüyor');
    assert.equal((await ban(admin, { days: null }))[0], 200);
    assert.equal(await live(), 0);
    assert.equal((await ban(mod1, { days: 3 }))[0], 200);
    assert.equal((await ban(mod2, { days: null }))[0], 200, 'moderatörün verdiği askıyı moderatör kaldırır');
    assert.equal(await live(), 0);
  });

  test('"Süresiz" ömür boyu ban olur, şikâyetin kategorisiyle (yonetim-8)', async () => {
    const reporter = await signUp('Şikâyetçi');
    const bad = await signUp('Hakaretçi');
    assert.equal((await call('POST', '/api/report', { type: 'user', id: bad.user.id, reason: 'Taciz veya hakaret' }, reporter.session))[0], 200);
    const [, q] = await call('GET', '/api/admin/reports', null, admin.session);
    const rep = q.reports.find((r) => r.target.id === bad.user.id);
    const handle = (who, body) => call('POST', '/api/admin/reports/handle', { id: rep.id, status: 'actioned', ...body }, who.session);
    assert.equal((await handle(mod1, { banDays: 3650, permanent: true }))[0], 403, 'moderatör ömür boyu ban veremez');
    assert.equal((await call('GET', '/api/admin/reports', null, admin.session))[1].reports.some((r) => r.id === rep.id), true, 'şikâyet açık kalır');
    const [st, done] = await handle(admin, { banDays: 3650, permanent: true });
    assert.equal(st, 200, done.error);
    assert.deepEqual([done.permanent, done.bannedUntil], [true, null]);
    const row = (await h.sql.query("SELECT is_permanent, expires_at, reason_code, report_id FROM user_sanctions WHERE user_id = $1 AND sanction_type = 'account_ban'", [bad.user.id])).rows;
    assert.deepEqual(row, [{ is_permanent: true, expires_at: null, reason_code: 'harassment', report_id: String(rep.id) }]);
    const [, list] = await call('GET', '/api/admin/reports?status=actioned', null, admin.session);
    assert.equal(list.reports.find((r) => r.id === rep.id).target.bannedForever, true);
    assert.equal((await call('POST', '/api/admin/ban', { user: bad.user.id, days: null }, mod1.session))[0], 403, 'ömür boyu banı moderatör kaldıramaz');

    // The ban route: a chosen category is kept; an unknown one is refused; permanent without days works too.
    const other = await signUp('Spamcı');
    assert.equal((await call('POST', '/api/admin/ban', { user: other.user.id, days: 7, reason: 'yok' }, admin.session))[0], 400);
    assert.equal((await call('POST', '/api/admin/ban', { user: other.user.id, days: 7, reason: 'spam' }, mod1.session))[0], 200);
    assert.equal((await call('POST', '/api/admin/ban', { user: other.user.id, permanent: true }, admin.session))[0], 200);
    const rows = (await h.sql.query("SELECT reason_code, is_permanent FROM user_sanctions WHERE user_id = $1 AND sanction_type = 'account_ban' ORDER BY id", [other.user.id])).rows;
    assert.deepEqual(rows, [
      { reason_code: 'spam', is_permanent: false },
      { reason_code: 'other', is_permanent: true },
    ]);
    assert.equal((await call('POST', '/api/admin/ban', { user: other.user.id, days: null, permanent: true }, admin.session))[0], 400, 'kaldırma mı ban mı belli değil');
  });
});

describe('Boş oda kapanır (odalar-8)', () => {
  const sign = (body) => {
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
    return `${hp}.${crypto.createHmac('sha256', 'testsecret').update(hp).digest('base64url')}`;
  };
  const hook = async (event, extra = {}) => {
    const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
    const [st, j] = await call('POST', '/api/livekit/webhook', body, null, { authorization: sign(body), 'content-type': 'application/webhook+json' });
    assert.equal(st, 200, j.error);
  };
  const openRoom = async (owner, title = `Oda ${rnd(2)}`) => {
    const [st, j] = await call('POST', '/api/rooms', { title }, owner.session);
    assert.equal(st, 200, j.error);
    return j.room.id;
  };
  const closed = async (id) => !!(await h.sql.query('SELECT closed_at FROM rooms WHERE id = $1', [id])).rows[0].closed_at;
  const listed = async (s, id) => (await call('GET', '/api/rooms', null, s))[1].rooms.some((r) => r.id === id);
  const age = (id) => h.sql.query("UPDATE rooms SET created_at = now() - interval '31 minutes' WHERE id = $1", [id]);

  test('herkes çıkıp LiveKit odayı bitirince oda kapanır; sahibi yenisini açar', async () => {
    const owner = await signUp('Sahip');
    const guest = await signUp('Misafir');
    const id = await openRoom(owner, 'Benim Odam');
    const name = `oda-${id}`;
    lkOpen.add(name);
    await hook('participant_joined', { room: { name }, participant: { identity: owner.user.id, sid: 'PA_o' } });
    await hook('participant_joined', { room: { name }, participant: { identity: guest.user.id, sid: 'PA_g' } });
    await hook('participant_left', { room: { name }, participant: { identity: owner.user.id, sid: 'PA_o' } });
    await sweeps();
    assert.equal(await closed(id), false, 'içeride biri varken açık');
    await hook('participant_left', { room: { name }, participant: { identity: guest.user.id, sid: 'PA_g' } });
    lkOpen.delete(name);
    await hook('room_finished', { room: { name } });
    assert.equal(await closed(id), true, 'LiveKit bitirince kapandı');
    assert.equal(await listed(guest.session, id), false, 'listede yok');
    assert.equal((await call('POST', '/api/rooms', { title: 'Yeni Odam' }, owner.session))[0], 200, 'sahibi yeni oda açabilir');
    await hook('room_finished', { room: { name: 'oda-r1' } });
  });

  test('temizlik: hiç girilmeyen oda hemen değil 30 dakika sonra kapanır; LiveKit’te açık olan kalır', async () => {
    const [o1, o2] = await Promise.all([signUp('Yeni Sahip'), signUp('Canlı Sahip')]);
    const fresh = await openRoom(o1);
    const busy = await openRoom(o2);
    const name = `oda-${busy}`;
    lkOpen.add(name);
    await hook('participant_joined', { room: { name }, participant: { identity: o2.user.id, sid: 'PA_b' } });
    await age(busy);
    await sweeps();
    assert.equal(await closed(fresh), false, 'yeni açılan oda hemen kapanmaz');
    assert.equal(await closed(busy), false, 'LiveKit’te açık ve içinde biri olan oda kalır');
    await age(fresh);
    assert.ok(await until(() => closed(fresh)), 'boş ve eski oda kapandı');
    assert.equal(await listed(o2.session, fresh), false);
    // A missed "room_finished": LiveKit no longer has it, so the cleanup forgets its people and closes it.
    lkOpen.delete(name);
    assert.ok(await until(() => closed(busy)), 'kaçırılan webhook sonrası da kapandı');
  });
});
