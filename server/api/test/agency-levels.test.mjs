// Ajans seviyeleri (agency-levels.mjs) against a real Postgres: the week's level difference goes to the agency in one
// row per group, the assistant gets her share of it in diamonds as with each income, the BD his rate on the pool's
// change; a refund in the week lowers the base; the money checks hold (harness.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0', ALLOW_TEST_TOPUP: '0', AGENCY_LEVELS_TEST_CLOCK: '1' });
const { call, signUp } = h;
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const num = Number;
const ref = () => `t${rnd(8)}`;

async function account(name, gender = 'Kadın') {
  const s = await signUp(name);
  if (gender) await q('UPDATE users SET gender = $2 WHERE id = $1', [s.user.id, gender]);
  return { id: s.user.id, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}

describe('Haftalık seviye farkı: asistan, BD, iade', () => {
  let admin, owner, helper, bd, s1, s2, A;
  const income = async (who, diamonds, type = 'gift') => ok(await admin.post('/api/admin/agency/income', { streamer: who.id, type, diamonds, ref: ref() }), 'gelir');

  test('hazırlık: seviyeler (%30, 10.000 elmasta %50), asistan %50, BD', async () => {
    admin = await account('Merkez', null);
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    owner = await account('Sahip', null);
    helper = await account('Asistan');
    bd = await account('BD', null);
    [s1, s2] = [await account('Yayıncı Bir'), await account('Yayıncı İki')];
    ok(
      await admin.post('/api/admin/agency/settings', {
        key: 'weekly_levels',
        value: { min_active: 1, active_usd: 1, new_weeks: 0, new_level: 'gonul', levels: [{ key: 'gonul', name: 'Gönül', rate: 0.3, from: 0, shown: false }, { key: 'ust', name: 'Üst', rate: 0.5, from: 10_000, shown: true }] },
        reason: 'Test',
      }),
    );
    A = ok(await admin.post('/api/admin/agency/create', { name: `Seviye ${rnd(3)}`, owner: owner.id })).agency;
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [A.id]))[0].code;
    ok(await helper.post('/api/agency/join', { code, method: 'code' }));
    const H = ok(await owner.post('/api/agency/assistants/add', { id: A.id, user: helper.id, pct: 50 })).assistant;
    ok(await s1.post('/api/agency/join', { code: H.code, method: 'code' }), 'asistanın koduyla');
    ok(await s2.post('/api/agency/join', { code, method: 'code' }));
    const roles = Object.fromEntries(ok(await admin.get('/api/agency/roles')).roles.map((r) => [r.name, r.id]));
    ok(await admin.post('/api/admin/agency/staff/set', { user: bd.id, roleId: roles['BD yöneticisi'] }));
    ok(await admin.post('/api/admin/agency/bd', { agencyId: A.id, bd: bd.id }));
  });

  test('hafta içi: %30 yazılır; ajans paneli bu haftanın seviyesini gösterir', async () => {
    await income(s1, 8000);
    await income(s2, 4000);
    await income(s2, -1000, 'refund');
    const ks = await q('SELECT agency_rate, base_diamonds, level_week FROM agency_commissions WHERE agency_id = $1 ORDER BY id', [A.id]);
    assert.ok(ks.every((k) => num(k.agency_rate) === 0.3 && k.level_week));
    const v = ok(await owner.get(`/api/agency/overview?id=${A.id}`)).level;
    assert.deepEqual([v.base, v.active, v.level.name, v.level.rate, v.next], [11_000, 2, 'Üst', 0.5, null]);
    assert.equal(ok(await owner.get(`/api/agency/overview?id=${A.id}`)).rate.rate, 0.5, 'eski uygulamaların oranı: bu haftanın seviyesi');
    const list = ok(await admin.get('/api/admin/agency/levels?week=' + v.week));
    assert.equal(list.preview, true);
    const row = list.rows.find((r) => r.agencyId === A.id);
    assert.deepEqual([row.levelKey, row.levelName, row.minActive, row.next], ['ust', 'Üst', 1, null], 'yönetim için ad, şart ve sonraki seviye (en üstte yok)');
    assert.equal(ok(await admin.get('/api/admin/agency/levels')).week, v.week, 'varsayılan: süren hafta');
  });

  test('hafta kapanınca: fark ajansa, payı asistana (elmas), BD’ye; bir kez', async () => {
    const helperBefore = num((await q('SELECT diamonds FROM users WHERE id = $1', [helper.id]))[0].diamonds);
    assert.equal(helperBefore, 1200, 'her gelirde: 8.000 × %30 × %50');
    ok(await admin.post('/api/admin/agency/levels/run', { at: new Date(Date.now() + 7 * 86400e3).toISOString() }));
    const rows = await q("SELECT kind, amount FROM agency_ledger WHERE agency_id = $1 AND kind IN ('level', 'assistant') AND commission_id IS NULL ORDER BY kind, amount", [A.id]);
    assert.deepEqual(rows.map((r) => [r.kind, num(r.amount)]), [['assistant', -800], ['level', 600], ['level', 1600]], 's1 8.000 × %20 = 1.600 (asistan yarısı); s2 3.000 × %20 = 600');
    assert.equal(num((await q('SELECT diamonds FROM users WHERE id = $1', [helper.id]))[0].diamonds), 2000, 'asistana 800 elmas daha');
    const [w] = await q('SELECT level_key, base, active, adjustment FROM agency_level_weeks WHERE agency_id = $1', [A.id]);
    assert.deepEqual([w.level_key, num(w.base), w.active, num(w.adjustment)], ['ust', 11_000, 2, 2200]);
    const bdRows = await q('SELECT basis, amount FROM bd_ledger WHERE bd_id = $1 AND commission_id IS NULL', [bd.id]);
    assert.deepEqual(bdRows.map((r) => [num(r.basis), num(r.amount)]), [[2200, 110]], 'BD: havuzdaki 2.200 artışın %5’i');
    ok(await admin.post('/api/admin/agency/levels/run', { at: new Date(Date.now() + 7 * 86400e3).toISOString() }));
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_ledger WHERE agency_id = $1 AND kind = 'level'", [A.id]))[0].n, 2, 'bir kez');
    const v = ok(await owner.get(`/api/agency/overview?id=${A.id}`));
    assert.equal(v.agency.tierName, 'Üst');
    assert.equal(v.level.last.name, 'Üst');
  });
});
