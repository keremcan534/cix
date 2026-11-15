// Finance Control acting on this API (panel.mjs): with PANEL_API_KEY, from this machine only (never a forwarded
// request), on the listed routes only, naming its user in every audit row; on this side it is the Finance Control
// account (067), an admin that is no person and appears in no list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { PANEL_ACTOR, PANEL_ROUTES } from '../panel.mjs';
import { startApi } from './harness.mjs';

const KEY = 'a'.repeat(64);
const h = startApi({
  PANEL_API_KEY: KEY,
  // A stand-in storage: upload addresses are signed without reaching it, and uploads aren't looked up (UPLOAD_VERIFY 0).
  S3_ENDPOINT: 'http://127.0.0.1:9',
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: 'https://pub-test.r2.dev',
});
const q = (s, p) => h.sql.query(s, p);
const WHO = { id: 7, email: 'ayse@panel.test', name: 'Ayşe Finans', role: 'operations_manager' };
const user = (who = WHO) => Buffer.from(JSON.stringify(who)).toString('base64url');
/** [status, json] of a call the way the panel's server makes it (or with `headers` changed). */
async function panel(method, path, body, headers = {}) {
  const r = await fetch(h.base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-panel-key': KEY, 'x-panel-user': user(), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return [r.status, await r.json()];
}
const lastPanelRows = async (n = 5) => (await q("SELECT detail FROM audit_events WHERE action = 'panel.request' ORDER BY id DESC LIMIT $1", [n])).rows.map((x) => x.detail);

describe('Finans paneli API’de', () => {
  test('anahtar, sunucunun içinden ve listedeki uçlarda; panel kullanıcısı zorunlu', async () => {
    const [ok, list] = await panel('GET', '/api/admin/gifts');
    assert.equal(ok, 200, list.error);
    assert.deepEqual(list.gifts, []);
    // A wrong key, a forwarded request (it came through Caddy), a route not on the list, no panel user.
    assert.equal((await panel('GET', '/api/admin/gifts', undefined, { 'x-panel-key': 'b'.repeat(64) }))[0], 401);
    const [fwd, fj] = await panel('GET', '/api/admin/gifts', undefined, { 'x-forwarded-for': '203.0.113.9' });
    assert.equal(fwd, 403);
    assert.match(fj.error, /sunucunun kendi içinden/);
    const [off, oj] = await panel('GET', '/api/admin/users');
    assert.equal(off, 403);
    assert.match(oj.error, /finans panelinden yapılamaz/);
    assert.ok(!PANEL_ROUTES.has('GET /api/admin/users'));
    assert.equal((await panel('GET', '/api/admin/gifts', undefined, { 'x-panel-user': 'bozuk' }))[0], 400);
    assert.equal((await panel('GET', '/api/admin/gifts', undefined, { 'x-panel-user': user({ id: 0, email: '' }) }))[0], 400);
    // Without the header the route is the app's own: a session is needed.
    assert.equal((await fetch(`${h.base}/api/admin/gifts`)).status, 401);
  });

  test('panelden hediye eklenir: Finance Control hesabıyla, denetimde panel kullanıcısının adıyla', async () => {
    const [st, up] = await panel('POST', '/api/media/upload-url', { kind: 'gifticon', contentType: 'image/png', size: 1000 });
    assert.equal(st, 200, up.error);
    assert.match(up.publicUrl, new RegExp(`/gifticon/${PANEL_ACTOR}/`));
    const [cs, created] = await panel('POST', '/api/admin/gifts', { name: 'Panel Yıldızı', price: 777, cat: 'hot', icon: up.publicUrl });
    assert.equal(cs, 200, created.error);
    const row = (await q('SELECT created_by, updated_by FROM custom_gifts WHERE id = $1', [created.gift.id])).rows[0];
    assert.deepEqual(row, { created_by: PANEL_ACTOR, updated_by: PANEL_ACTOR });
    const audit = (await q("SELECT actor, detail FROM audit_events WHERE action = 'gift.create' AND detail->>'gift' = $1", [created.gift.id])).rows[0];
    assert.equal(audit.actor, PANEL_ACTOR);
    assert.deepEqual(audit.detail.panelUser, WHO);
    // Every panel change is also a 'panel.request' row, and so is a refusal; a plain read is not.
    const [bad] = await panel('POST', '/api/admin/gifts/update', { id: created.gift.id, price: 0 });
    assert.equal(bad, 400);
    const rows = await lastPanelRows(3);
    assert.deepEqual(rows[0], { method: 'POST', path: '/api/admin/gifts/update', status: 400, panelUser: WHO });
    assert.deepEqual(rows[1], { method: 'POST', path: '/api/admin/gifts', status: 200, panelUser: WHO });
    assert.deepEqual(rows[2], { method: 'POST', path: '/api/media/upload-url', status: 200, panelUser: WHO });
    await panel('GET', '/api/admin/gifts');
    assert.deepEqual((await lastPanelRows(1))[0], rows[0]);
  });

  test('Finance Control hesabı bir kişi değil: listelerde görünmez, oturumu yok', async () => {
    const admin = await h.account('Yönetici', 'admin');
    const r = await fetch(`${h.base}/api/admin/users?q=Finance`, { headers: { authorization: `Bearer ${admin.session}` } });
    assert.equal((await r.json()).total, 0);
    const acct = (await q('SELECT name, role, deleted_at FROM users WHERE id = $1', [PANEL_ACTOR])).rows[0];
    assert.equal(acct.name, 'Finance Control');
    assert.equal(acct.role, 'admin');
    assert.ok(acct.deleted_at);
    assert.equal((await q('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [PANEL_ACTOR])).rows[0].n, 0);
  });
});
