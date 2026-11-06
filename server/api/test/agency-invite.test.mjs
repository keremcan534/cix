// "Yayıncı davet et" (Ajans → Ofis → Yayıncılar): accounts get no username at sign-up, so the owner finds the
// streamer by the name the app shows (GET /api/agency/invite/search) and invites that account by id.
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
const search = (who, id, q) => who.get(`/api/agency/invite/search?id=${id}&q=${encodeURIComponent(q)}`);

describe('Ajans daveti: yayıncıyı adıyla bul', () => {
  test('ad ile bulunur, kimlikle davet edilir; engel, yetki ve ajans durumu', async () => {
    const [admin, owner, deniz, other, outsider] = await Promise.all(['Merkez', 'Ajans Sahibi', 'Davet Deniz', 'Deniz Kaya', 'Yabancı'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const A = ok(await admin.post('/api/admin/agency/create', { name: 'Deniz Ajans', owner: owner.id })).agency;

    // No username on any of them: the name the app shows finds them, case aside; the exact name comes first.
    const { rows } = await h.sql.query('SELECT count(username)::int AS n FROM users WHERE id = ANY($1)', [[deniz.id, other.id]]);
    assert.equal(rows[0].n, 0);
    const found = ok(await search(owner, A.id, 'davet deniz')).users;
    assert.deepEqual(found.map((u) => u.id), [deniz.id]);
    assert.equal(found[0].agency, null);
    const both = ok(await search(owner, A.id, 'Deniz')).users.map((u) => u.id);
    assert.deepEqual(both.sort(), [deniz.id, other.id].sort());
    assert.deepEqual(ok(await search(owner, A.id, 'd')).users, [], 'tek harf aranmaz');
    assert.deepEqual(ok(await search(owner, A.id, '%_')).users, [], 'joker karakter her şeyi getirmez');

    // A username still works, with or without @.
    await h.sql.query("UPDATE users SET username = 'denizcik' WHERE id = $1", [deniz.id]);
    assert.deepEqual(ok(await search(owner, A.id, '@denizcik')).users.map((u) => u.id), [deniz.id]);

    // Someone who blocked the owner (or whom the owner blocked) is not listed.
    ok(await other.post('/api/block', { to: owner.id, block: true }));
    assert.deepEqual(ok(await search(owner, A.id, 'Deniz')).users.map((u) => u.id), [deniz.id]);

    // Only who may invite in this agency can search it.
    assert.equal((await search(outsider, A.id, 'Deniz'))[0], 403);

    // The pick is invited by id; once they accept, the search says they are in this agency.
    const inv = ok(await owner.post('/api/agency/invite', { id: A.id, user: found[0].id }), 'davet').request;
    ok(await deniz.post('/api/agency/requests/respond', { requestId: inv.id, accept: true }), 'kabul');
    assert.equal(ok(await search(owner, A.id, 'Davet Deniz')).users[0].agency, 'this');
  });
});
