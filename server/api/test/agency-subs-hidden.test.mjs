// Referans ajans gizliliği (owners, 22 Nov 2026): a top agency's own people see its sub-agencies by name only: not
// their streamers, counts, earnings or scores, and they can't open a sub-agency's panel. The centre always sees
// them; the agency setting parent_sees_subs (off by default) opens them to the parent again.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0' });
const { call, signUp } = h;

async function account(name) {
  const s = await signUp(name);
  return { id: s.user.id, name, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const HIDDEN = 'Referans ajansların yayıncıları ve rakamları üst ajansa gösterilmez.';

describe('Referans ajans gizliliği', () => {
  test('üst ajans yalnız adları görür; merkez hepsini; ayarla açılır', async () => {
    const [admin, tOwner, sOwner, ayse] = await Promise.all(['Merkez', 'Üst Sahibi', 'Alt Sahibi', 'Alt Yayıncı Ayşe'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    await h.sql.query("UPDATE users SET gender = 'Kadın' WHERE id = $1", [ayse.id]);
    const T = ok(await admin.post('/api/admin/agency/create', { name: 'Üst Ajans', owner: tOwner.id })).agency;
    const S = ok(await admin.post('/api/agency/sub/create', { parentId: T.id, name: 'Alt Ajans', owner: sOwner.id, submit: true })).agency;
    ok(await admin.post('/api/admin/agency/decide', { id: S.id, approve: true, note: 'Tamam' }));
    const code = (await h.sql.query('SELECT code FROM agencies WHERE id = $1', [S.id])).rows[0].code;
    ok(await ayse.post('/api/agency/join', { code, method: 'code' }), 'alt ajansa katılım');

    // The parent: names only.
    const [st, j] = await tOwner.get(`/api/agency/streamers?id=${T.id}&scope=sub`);
    assert.deepEqual([st, j.error], [403, HIDDEN]);
    const subs = ok(await tOwner.get(`/api/agency/subagencies?id=${T.id}`));
    assert.equal(subs.hidden, true);
    assert.deepEqual(
      subs.subagencies.map((s) => [s.name, s.hidden, s.streamers, s.active, s.mine30, s.gifts.month, s.score, s.owner]),
      [['Alt Ajans', true, 0, 0, 0, 0, null, null]],
    );
    assert.equal(ok(await tOwner.get(`/api/agency/overview?id=${T.id}`)).counts.sub_streamers, 0);
    assert.deepEqual(ok(await tOwner.get(`/api/agency/performance?id=${T.id}`)).subagencies, []);
    for (const p of ['overview', 'streamers', 'performance', 'commissions']) assert.equal((await tOwner.get(`/api/agency/${p}?id=${S.id}`))[0], 403, `alt ajansın ${p}`);
    // Its own streamers stay its own business.
    assert.deepEqual(ok(await tOwner.get(`/api/agency/streamers?id=${T.id}`)).streamers, []);
    // The sub-agency's own owner sees its streamer.
    assert.deepEqual(ok(await sOwner.get(`/api/agency/streamers?id=${S.id}`)).streamers.map((x) => x.id), [ayse.id]);

    // The centre sees everything.
    assert.deepEqual(ok(await admin.get(`/api/agency/streamers?id=${T.id}&scope=sub`)).streamers.map((x) => x.id), [ayse.id]);
    const full = ok(await admin.get(`/api/agency/subagencies?id=${T.id}`));
    assert.equal(full.hidden, undefined);
    assert.equal(full.subagencies[0].streamers, 1);

    // The setting opens it to the parent again.
    ok(await admin.post('/api/admin/agency/settings', { key: 'parent_sees_subs', value: true, reason: 'Deneme' }));
    assert.deepEqual(ok(await tOwner.get(`/api/agency/streamers?id=${T.id}&scope=sub`)).streamers.map((x) => x.id), [ayse.id]);
    assert.equal(ok(await tOwner.get(`/api/agency/subagencies?id=${T.id}`)).subagencies[0].streamers, 1);
    assert.equal(ok(await tOwner.get(`/api/agency/overview?id=${T.id}`)).counts.sub_streamers, 1);
    ok(await admin.post('/api/admin/agency/settings', { key: 'parent_sees_subs', value: false, reason: 'Geri' }));
    assert.equal((await tOwner.get(`/api/agency/overview?id=${S.id}`))[0], 403);
  });
});
