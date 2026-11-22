// Ajans daveti kapalı (owners, 22 Nov 2026): no agency invites a streamer; a streamer joins with the agency's code or
// its invite link. Every app's invite and its search are refused, an invite still waiting can't be accepted, and
// migration 113 cancelled the ones that were waiting. AGENCY_INVITES=1 (agency-invite.test.mjs) opens them again.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
const CLOSED = 'Ajanslar yayıncıya davet gönderemez. Yayıncı, ajans koduyla ya da ajansın davet bağlantısıyla katılır.';

describe('Ajans daveti kapalı', () => {
  test('davet ve arama reddedilir; yayıncı kodla katılır', async () => {
    const [admin, owner, ayse] = await Promise.all(['Merkez', 'Ajans Sahibi', 'Kodla Ayşe'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    await h.sql.query("UPDATE users SET gender = 'Kadın' WHERE id = $1", [ayse.id]);
    const A = ok(await admin.post('/api/admin/agency/create', { name: 'Kod Ajans', owner: owner.id })).agency;

    for (const [st, j] of [await owner.post('/api/agency/invite', { id: A.id, user: ayse.id }), await owner.get(`/api/agency/invite/search?id=${A.id}&q=${encodeURIComponent('Kodla')}`)]) {
      assert.deepEqual([st, j.error], [403, CLOSED]);
    }
    assert.equal((await h.sql.query("SELECT count(*)::int AS n FROM agency_requests WHERE kind = 'invite' AND user_id = $1", [ayse.id])).rows[0].n, 0, 'davet yazılmadı');

    // The agency's code still brings her in.
    const joined = ok(await ayse.post('/api/agency/join', { code: A.code }), 'kodla katılım');
    assert.ok(joined.membership, JSON.stringify(joined));
    assert.equal((await h.sql.query('SELECT agency_id FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [ayse.id])).rows[0].agency_id, A.id);
  });

  test('bekleyen davet kabul edilemez, reddedilebilir; göç onları iptal eder', async () => {
    const [admin, owner, zeynep, elif] = await Promise.all(['Merkez 2', 'Ajans Sahibi 2', 'Bekleyen Zeynep', 'Bekleyen Elif'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    await h.sql.query("UPDATE users SET gender = 'Kadın' WHERE id = ANY($1::uuid[])", [[zeynep.id, elif.id]]);
    const A = ok(await admin.post('/api/admin/agency/create', { name: 'Eski Davet Ajans', owner: owner.id })).agency;
    const invite = async (u) =>
      Number((await h.sql.query("INSERT INTO agency_requests (agency_id, user_id, kind, method, created_by) VALUES ($1, $2, 'invite', 'invite', $3) RETURNING id", [A.id, u.id, owner.id])).rows[0].id);

    const z = await invite(zeynep);
    const [st, j] = await zeynep.post('/api/agency/requests/respond', { requestId: z, accept: true });
    assert.deepEqual([st, j.error], [409, CLOSED]);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM agency_streamers WHERE streamer_id = $1', [zeynep.id])).rows[0].n, 0, 'bağlanmadı');
    assert.equal(ok(await zeynep.post('/api/agency/requests/respond', { requestId: z, accept: false })).status, 'rejected');

    // Migration 113 (run once at start; its statement again here): every invite still waiting is cancelled, the
    // decided ones stay as they were.
    const e = await invite(elif);
    await h.sql.query(readFileSync(new URL('../migrations/113_agency_invites_closed.sql', import.meta.url), 'utf8'));
    const rows = (await h.sql.query('SELECT id, status FROM agency_requests WHERE id = ANY($1::bigint[]) ORDER BY id', [[z, e]])).rows;
    assert.deepEqual(
      rows.map((r) => r.status),
      ['rejected', 'cancelled'],
    );
  });
});
