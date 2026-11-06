// Yönetim › Kullanıcılar (admin.mjs): the account list and deleting accounts, one or the smoke-test ones.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi();
const { call } = h;

describe('Kullanıcılar', () => {
  test('only an admin lists and deletes; tests: true removes the smoke-test accounts only', async () => {
    const owner = await h.signUp('Sahip');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [owner.user.id]);
    const mod = await h.signUp('Moderatör');
    await h.sql.query("UPDATE users SET role = 'moderator' WHERE id = $1", [mod.user.id]);
    const ta = await h.signUp('Test A');
    const tb = await h.signUp('Test B');
    const real = await h.signUp('Gerçek Kişi');
    // Named like a test account but signed in with e-mail: a real person, kept.
    const named = await h.signUp('Test A');
    await h.sql.query("INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('email', 'x@example.com', $1, 'x@example.com')", [named.user.id]);

    let [st] = await call('GET', '/api/admin/users', null, mod.session);
    assert.equal(st, 403);
    [st] = await call('POST', '/api/admin/users/delete', { id: real.user.id }, real.session);
    assert.equal(st, 403);

    let [, j] = await call('GET', '/api/admin/users', null, owner.session);
    assert.equal(j.total, 6);
    assert.equal(j.tests, 2);
    assert.deepEqual(j.users.filter((u) => u.test).map((u) => u.id).sort(), [ta.user.id, tb.user.id].sort());
    assert.deepEqual(j.users.find((u) => u.id === named.user.id).signIn, ['email']);

    [, j] = await call('GET', '/api/admin/users?q=ger%C3%A7ek', null, owner.session);
    assert.deepEqual(j.users.map((u) => u.id), [real.user.id]);

    [st, j] = await call('POST', '/api/admin/users/delete', { id: mod.user.id }, owner.session);
    assert.equal(st, 403);
    [st] = await call('POST', '/api/admin/users/delete', { id: owner.user.id }, owner.session);
    assert.equal(st, 400);

    [st, j] = await call('POST', '/api/admin/users/delete', { tests: true }, owner.session);
    assert.equal(st, 200);
    assert.equal(j.deleted, 2);
    [st] = await call('GET', '/api/me', null, ta.session);
    assert.equal(st, 401);

    [st, j] = await call('POST', '/api/admin/users/delete', { id: real.user.id }, owner.session);
    assert.equal(j.deleted, 1);
    [st] = await call('POST', '/api/admin/users/delete', { id: real.user.id }, owner.session);
    assert.equal(st, 404);

    [, j] = await call('GET', '/api/admin/users', null, owner.session);
    assert.deepEqual(j.users.map((u) => u.id).sort(), [owner.user.id, mod.user.id, named.user.id].sort());
    const log = await h.sql.query("SELECT count(*) AS n FROM sanction_audit_logs WHERE action = 'account_delete'");
    assert.equal(Number(log.rows[0].n), 3);
  });
});
