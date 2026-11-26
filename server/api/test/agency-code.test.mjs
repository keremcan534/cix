// Ajans kodları (owners, 27 Nov 2026; agency-lib.mjs AGENCY_CODE_LEN, freeJoinCode, codeMiss): a new agency gets a
// 4-character code, an older 8-character one still joins, and wrong codes are counted per person: past the hour's
// tries a 429, the right code too.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0', AGENCY_CODE_MISSES: '3' });
const { call, signUp } = h;

async function account(name, gender = 'Kadın') {
  const s = await signUp(name);
  if (gender) await h.sql.query('UPDATE users SET gender = $2 WHERE id = $1', [s.user.id, gender]);
  return { id: s.user.id, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};

describe('Ajans kodları', () => {
  test('yeni ajansın kodu 4 hane; eski 8 haneli kod çalışır; yanlış kod denemesi sınırlı', async () => {
    const admin = await account('Kod Merkez', null);
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const [o1, o2] = await Promise.all([account('Kod Sahip 1', null), account('Kod Sahip 2', null)]);
    const fresh = ok(await admin.post('/api/admin/agency/create', { name: `Kısa Kod ${rnd(3)}`, owner: o1.id }), 'yeni ajans').agency;
    const old = ok(await admin.post('/api/admin/agency/create', { name: `Uzun Kod ${rnd(3)}`, owner: o2.id }), 'eski ajans').agency;
    const code = (await h.sql.query('SELECT code FROM agencies WHERE id = $1', [fresh.id])).rows[0].code;
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
    const longCode = `K${rnd(7)}`.toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 8).padEnd(8, 'Q');
    await h.sql.query('UPDATE agencies SET code = $2 WHERE id = $1', [old.id, longCode]);

    const s = await account('Kod Arayan');
    assert.equal(ok(await s.get(`/api/agency/lookup?code=${code.toLowerCase()}`), '4 hane').agency.id, fresh.id);
    assert.equal(ok(await s.get(`/api/agency/lookup?code=${longCode}`), '8 hane').agency.id, old.id);

    // Three wrong codes in the hour; the fourth try is refused, a right code too.
    for (let i = 0; i < 3; i++) assert.equal((await s.get(`/api/agency/lookup?code=ZZ${i}9`))[0], 404);
    const [st, j] = await s.get(`/api/agency/lookup?code=${code}`);
    assert.equal(st, 429, j.error);
    assert.match(j.error, /Bir saat sonra/);
    assert.equal((await s.post('/api/agency/join', { code, method: 'code' }))[0], 429, 'katılma da');
    // Another person is not held by them.
    const t = await account('Başka Arayan');
    assert.equal(ok(await t.get(`/api/agency/lookup?code=${code}`), 'başkası').agency.id, fresh.id);
  });
});
