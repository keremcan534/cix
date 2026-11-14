// Profil ziyaretçileri (social.mjs): opening someone's profile from the profile screen (GET /api/user?visit=1) is a
// visit; GET /api/me/visitors shows everyone their visits of the last 7 days and, with the Abonelik (the VIP
// subscription, vip.mjs; bought here as a test purchase), who made them (without it the visits come without anything
// that names the visitor). The owner is told of a visit, at most once a day per visitor, by name only with the
// subscription. Against a real Postgres and a stand-in for Expo's push service.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

// A stand-in for Expo's push service: records what it gets.
const pushed = [];
const pushMock = http.createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  const batch = JSON.parse(body);
  pushed.push(...batch);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ data: batch.map(() => ({ status: 'ok', id: rnd(4) })) }));
});
await new Promise((r) => pushMock.listen(0, '127.0.0.1', r));
pushMock.unref();

const h = startApi({ PUSH_ENABLED: '1', PUSH_URL: `http://127.0.0.1:${pushMock.address().port}/push` });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
const visit = (who, owner) => ok(call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, who.session), 'profil');
const visitors = (who) => ok(call('GET', '/api/me/visitors', null, who.session), 'ziyaretçiler');
/** The Abonelik, as the test APKs buy it (ALLOW_TEST_TOPUP=1): 7 days. */
const subscribe = (u) => ok(call('POST', '/api/vip/subscribe', { platform: 'test', productId: 'vip_7d', transactionId: `t${rnd(8)}` }, u.session), 'abonelik');
/** VIP 1–10 by SVIP points (Sessiz ziyaret is VIP 7). */
const svip = (u, xp) => q('UPDATE users SET svip_xp = $2 WHERE id = $1', [u.user.id, xp]);
const backdate = (owner, visitor, interval) =>
  q(`UPDATE profile_visits SET last_at = now() - interval '${interval}' WHERE owner_id = $1 AND visitor_id = $2`, [owner.user.id, visitor.user.id]);
/** An account with a phone that takes pushes: its token. */
const withPhone = async (u) => {
  const token = `ExponentPushToken[${rnd(10)}]`;
  await ok(call('POST', '/api/push/register', { token, platform: 'android' }, u.session), 'bildirim anahtarı');
  return token;
};
const pushesTo = (token) => pushed.filter((m) => m.to === token);

describe('Profil ziyaretçileri', () => {
  test('profil ekranından açılan profil ziyaret sayılır; liste herkese, kim olduğu aboneye', async () => {
    const a = await signUp('Ziyaretçi A');
    const b = await signUp('Profil B');
    await visit(a, b);
    const plain = await visitors(b);
    assert.equal(plain.count, 1);
    assert.equal(plain.visitors, null, 'abonelik yokken kim olduğu gelmez');
    // The visit is there, blurred: how many times and when (to the minute), nothing that names the visitor.
    assert.equal(plain.hidden.length, 1);
    assert.deepEqual(Object.keys(plain.hidden[0]).sort(), ['lastAt', 'visits']);
    assert.equal(plain.hidden[0].visits, 1);
    assert.equal(new Date(plain.hidden[0].lastAt).getUTCSeconds(), 0, 'dakikaya yuvarlı');
    assert.ok(Date.now() - Date.parse(plain.hidden[0].lastAt) < 2 * 60_000);
    const raw = JSON.stringify(plain);
    assert.ok(!raw.includes(a.user.id) && !raw.includes('Ziyaretçi A'), 'kimlik hiçbir alanda yok');
    await subscribe(b);
    const shown = await visitors(b);
    assert.equal(shown.count, 1);
    assert.equal(shown.visitors.length, 1);
    assert.equal(shown.visitors[0].id, a.user.id);
    assert.equal(shown.visitors[0].name, 'Ziyaretçi A');
    assert.equal(shown.visitors[0].visits, 1);
    assert.deepEqual(shown.hidden, []);
  });

  test('VIP seviyesi ve Rütbe kimin baktığını açmaz, yalnız abonelik; abonelik bitince yine bulanık', async () => {
    const a = await signUp('Rütbe Ziyaretçi');
    const b = await signUp('Rütbe Sahibi');
    await visit(a, b);
    await svip(b, 500_000);
    await q(
      "INSERT INTO entitlements (user_id, sku, kind, tier, price, ends_at, source, ref) VALUES ($1, 'noble-1', 'noble', 1, 0, now() + interval '30 days', 'admin', $2)",
      [b.user.id, `admin:${rnd(6)}`],
    );
    const ranked = await visitors(b);
    assert.equal(ranked.visitors, null, 'VIP 1 ve Rütbe ile bulanık');
    assert.equal(ranked.hidden.length, 1);
    await subscribe(b);
    assert.equal((await visitors(b)).visitors[0].id, a.user.id);
    await q("UPDATE users SET vip_sub_until = now() - interval '1 second' WHERE id = $1", [b.user.id]);
    assert.equal((await visitors(b)).visitors, null, 'abonelik bitti');
  });

  test('başka yerden açılan profil ve kendi profilin sayılmaz', async () => {
    const a = await signUp('Kart A');
    const b = await signUp('Kart B');
    await ok(call('GET', `/api/user?id=${b.user.id}`, null, a.session), 'kişi kartı');
    await visit(b, b);
    assert.equal((await visitors(b)).count, 0);
  });

  test('10 dakika içinde tekrar açmak bir kez sayılır, sonra artar; bir hafta sessizlikten sonra baştan başlar', async () => {
    const a = await signUp('Tekrar A');
    const b = await signUp('Tekrar B');
    await subscribe(b);
    await visit(a, b);
    await visit(a, b);
    assert.equal((await visitors(b)).visitors[0].visits, 1);
    await backdate(b, a, '20 minutes');
    await visit(a, b);
    assert.equal((await visitors(b)).visitors[0].visits, 2);
    await backdate(b, a, '8 days');
    assert.equal((await visitors(b)).count, 0, 'yedi günden eski ziyaret listede yok');
    await visit(a, b);
    assert.equal((await visitors(b)).visitors[0].visits, 1, 'sayı baştan');
  });

  test('Sessiz ziyaret (VIP 7) iz bırakmaz', async () => {
    const a = await signUp('Sessiz A');
    const b = await signUp('Sessiz B');
    await svip(a, 40_000_000);
    await visit(a, b);
    assert.equal((await visitors(b)).count, 0);
  });

  test('engellenen kişi listeden çıkar; silinen hesabın ziyaretleri gider', async () => {
    const a = await signUp('Engel A');
    const b = await signUp('Engel B');
    const c = await signUp('Silinen C');
    await subscribe(b);
    await visit(a, b);
    await visit(c, b);
    assert.equal((await visitors(b)).count, 2);
    await ok(call('POST', '/api/block', { to: a.user.id, block: true }, b.session), 'engelle');
    const left = await visitors(b);
    assert.deepEqual(left.visitors.map((v) => v.id), [c.user.id]);
    await ok(call('DELETE', '/api/me', null, c.session), 'hesabı sil');
    assert.equal((await visitors(b)).count, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM profile_visits WHERE visitor_id = $1 OR owner_id = $1', [c.user.id])).rows[0].n, 0);
  });
});

describe('Ziyaret bildirimi', () => {
  test('abonelik yoksa "biri baktı": bildirimde ad da kimlik de yok', async () => {
    const a = await signUp('Gizli Bakan');
    const b = await signUp('Bildirim Sahibi');
    const phone = await withPhone(b);
    await visit(a, b);
    assert.ok(await until(() => pushesTo(phone).length === 1), 'bildirim gitti');
    const [n] = pushesTo(phone);
    assert.equal(n.title, 'Profil ziyareti');
    assert.match(n.body, /^Biri profiline baktı/);
    assert.deepEqual(n.data, { type: 'visit' });
    assert.ok(!JSON.stringify(n).includes(a.user.id) && !JSON.stringify(n).includes('Gizli Bakan'), 'kim olduğu bildirimden okunmaz');
  });

  test('abonelikle kimin baktığı yazar ve dokununca o kişi açılır', async () => {
    const a = await signUp('Açık Bakan');
    const b = await signUp('Abone Sahibi');
    await subscribe(b);
    const phone = await withPhone(b);
    await visit(a, b);
    assert.ok(await until(() => pushesTo(phone).length === 1));
    const [n] = pushesTo(phone);
    assert.equal(n.body, 'Açık Bakan profiline baktı');
    assert.deepEqual(n.data, { type: 'visit', from: a.user.id });
  });

  test('aynı kişi için günde en çok bir bildirim; bir gün geçince yeniden', async () => {
    const a = await signUp('Sık Bakan');
    const c = await signUp('Başka Bakan');
    const b = await signUp('Günlük Sahip');
    await subscribe(b);
    const phone = await withPhone(b);
    await visit(a, b);
    assert.ok(await until(() => pushesTo(phone).length === 1));
    // Again now and after 20 minutes (a second visit in the list): no second notice. Another visitor still rings.
    await visit(a, b);
    await backdate(b, a, '20 minutes');
    await visit(a, b);
    await visit(c, b);
    assert.ok(await until(() => pushesTo(phone).some((m) => m.data.from === c.user.id)));
    assert.equal(pushesTo(phone).filter((m) => m.data.from === a.user.id).length, 1, 'aynı gün ikinci bildirim yok');
    assert.equal((await visitors(b)).visitors.find((v) => v.id === a.user.id).visits, 2, 'ziyaret yine sayılır');
    await q("UPDATE profile_visits SET notified_at = now() - interval '25 hours' WHERE owner_id = $1 AND visitor_id = $2", [b.user.id, a.user.id]);
    await visit(a, b);
    assert.ok(await until(() => pushesTo(phone).filter((m) => m.data.from === a.user.id).length === 2), 'ertesi gün yeniden');
  });

  test('sessiz ziyaret, engel ve kendi profilin bildirim göndermez', async () => {
    const silent = await signUp('Sessiz Bakan');
    const blocked = await signUp('Engelli Bakan');
    const blocker = await signUp('Engelleyen Bakan');
    const last = await signUp('Son Bakan');
    const b = await signUp('Korunan Sahip');
    await svip(silent, 40_000_000);
    await subscribe(b);
    const phone = await withPhone(b);
    await ok(call('POST', '/api/block', { to: blocked.user.id, block: true }, b.session), 'sahip engeller');
    await ok(call('POST', '/api/block', { to: b.user.id, block: true }, blocker.session), 'bakan engeller');
    await visit(silent, b);
    assert.equal((await call('GET', `/api/user?id=${b.user.id}&visit=1`, null, blocked.session))[0], 404, 'engellenen profili açamaz');
    await visit(blocker, b);
    await visit(b, b);
    // A visit that does ring, last: the ones before it would have arrived first.
    await visit(last, b);
    assert.ok(await until(() => pushesTo(phone).length > 0));
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(pushesTo(phone).map((m) => m.data.from), [last.user.id]);
  });
});
