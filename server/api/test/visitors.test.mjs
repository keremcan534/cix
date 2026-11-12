// Profil ziyaretçileri (social.mjs): opening someone's profile from the profile screen (GET /api/user?visit=1) is a
// visit; GET /api/me/visitors tells everyone how many came in the last 7 days and, with VIP, who. Against a real
// Postgres.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const visit = (who, owner) => ok(call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, who.session), 'profil');
const visitors = (who) => ok(call('GET', '/api/me/visitors', null, who.session), 'ziyaretçiler');
const vip = (u, xp = 500_000) => q('UPDATE users SET svip_xp = $2 WHERE id = $1', [u.user.id, xp]);
const backdate = (owner, visitor, interval) =>
  q(`UPDATE profile_visits SET last_at = now() - interval '${interval}' WHERE owner_id = $1 AND visitor_id = $2`, [owner.user.id, visitor.user.id]);

describe('Profil ziyaretçileri', () => {
  test('profil ekranından açılan profil ziyaret sayılır; sayı herkese, kim olduğu VIP’e', async () => {
    const a = await signUp('Ziyaretçi A');
    const b = await signUp('Profil B');
    await visit(a, b);
    const plain = await visitors(b);
    assert.equal(plain.count, 1);
    assert.equal(plain.visitors, null, 'VIP değilken kim olduğu gelmez');
    await vip(b);
    const shown = await visitors(b);
    assert.equal(shown.count, 1);
    assert.equal(shown.visitors.length, 1);
    assert.equal(shown.visitors[0].id, a.user.id);
    assert.equal(shown.visitors[0].name, 'Ziyaretçi A');
    assert.equal(shown.visitors[0].visits, 1);
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
    await vip(b);
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
    await vip(a, 40_000_000);
    await visit(a, b);
    assert.equal((await visitors(b)).count, 0);
  });

  test('engellenen kişi listeden çıkar; silinen hesabın ziyaretleri gider', async () => {
    const a = await signUp('Engel A');
    const b = await signUp('Engel B');
    const c = await signUp('Silinen C');
    await vip(b);
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
