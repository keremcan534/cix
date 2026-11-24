// The streamers' 60-day rule and the return (agency-activity.mjs, owners 24 Nov 2026) against a real Postgres: a
// streamer offline for 60 days leaves her agency; when she comes back she has the days to pick an agency (3) with a
// code; past them she is a yönetim yayıncısı (streamer-rule.mjs) and moves only by a transfer. The aday ajans rule
// is gone: an agency with few streamers asks for its payout like any other (agency.test.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { heldWomanSql, streamerKindSql } from '../streamer-rule.mjs';

const h = startApi({ AGENCY_JOBS: '0', ALLOW_TEST_TOPUP: '0' });
const { call, signUp } = h;
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const refused = ([st, j], code, msg = '') => {
  assert.equal(st, code, `${msg}: beklenen ${code}, gelen ${st} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;

async function account(name, gender = 'Kadın') {
  const s = await signUp(name);
  if (gender) await q('UPDATE users SET gender = $2 WHERE id = $1', [s.user.id, gender]);
  return { id: s.user.id, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}

let admin;
const jobs = async () => ok(await admin.post('/api/admin/agency/jobs/run', {}), 'işler');
/** Last online `days` days ago (sessions and devices), as the job reads it. */
const offline = (u, days) =>
  Promise.all([
    q(`UPDATE sessions SET last_seen_at = now() - make_interval(days => $2) WHERE user_id = $1`, [u.id, days]),
    q(`UPDATE device_accounts SET last_seen_at = now() - make_interval(days => $2) WHERE user_id = $1`, [u.id, days]),
  ]);
const kindOf = async (u) => (await q(`SELECT ${streamerKindSql('$1::uuid')} AS k, ${heldWomanSql('$1::uuid')} AS held`, [u.id]))[0];
const codeOf = async (id) => (await q('SELECT code FROM agencies WHERE id = $1', [id]))[0].code;

describe('Pasif yayıncı: 60 gün ve geri dönüş', () => {
  let A, B, idle, near, busy, late;

  test('hazırlık: iki ajans; dört yayıncı 70 gün önce katılmış', async () => {
    admin = await account('Merkez', null);
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const [oa, ob] = [await account('Sahip A', null), await account('Sahip B', null)];
    A = ok(await admin.post('/api/admin/agency/create', { name: `Pasif A ${rnd(3)}`, owner: oa.id })).agency;
    B = ok(await admin.post('/api/admin/agency/create', { name: `Pasif B ${rnd(3)}`, owner: ob.id })).agency;
    [idle, near, busy, late] = [await account('Uzun Süre Yok'), await account('59 Gün'), await account('Her Gün'), await account('Geç Dönen')];
    for (const s of [idle, near, busy, late]) ok(await s.post('/api/agency/join', { code: await codeOf(A.id) }), 'katıl');
    await q("UPDATE agency_streamers SET joined_at = now() - interval '70 days' WHERE agency_id = $1", [A.id]);
    await q("UPDATE users SET created_at = now() - interval '80 days' WHERE id = ANY($1::uuid[])", [[idle, near, busy, late].map((x) => x.id)]);
  });

  test('60 gün çevrimiçi olmayan düşer (para çekmek saymaz); 59 gün olan ve her gün giren kalır', async () => {
    await offline(idle, 61);
    await offline(late, 61);
    await offline(near, 59);
    const r = await jobs();
    assert.equal(r.inactive, 2);
    const links = await q("SELECT streamer_id, end_reason FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NOT NULL", [A.id]);
    assert.deepEqual(new Set(links.map((l) => l.streamer_id)), new Set([idle.id, late.id]));
    assert.ok(links.every((l) => l.end_reason === 'inactive'));
    const open = await q('SELECT streamer_id FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL', [A.id]);
    assert.deepEqual(new Set(open.map((l) => l.streamer_id)), new Set([near.id, busy.id]));
    const [note] = await q("SELECT title, body FROM agency_notices WHERE agency_id = $1 AND kind = 'status' ORDER BY id DESC LIMIT 1", [A.id]);
    assert.match(note.title, /2 yayıncı 60 gün çevrimiçi olmadığı için ajanstan düştü/);
    assert.match(note.body, /3 gün içinde bir ajansa katılabilir/);
    // Not back yet: not a yönetim yayıncısı (her days start when she returns).
    assert.deepEqual(await kindOf(idle), { k: null, held: false });
  });

  test('dönünce 3 gün içinde kodla başka bir ajansa katılabilir', async () => {
    await offline(idle, 0);
    const r = await jobs();
    assert.equal(r.returned, 1);
    const [l] = await q("SELECT returned_at FROM agency_streamers WHERE streamer_id = $1 AND end_reason = 'inactive'", [idle.id]);
    assert.ok(l.returned_at);
    const me = ok(await idle.get('/api/agency/me'));
    assert.equal(me.membership, null);
    assert.equal(me.streamer.held, false, 'süresi var');
    const left = new Date(me.streamer.pickUntil).getTime() - Date.now();
    assert.ok(left > 2.9 * 86400e3 && left <= 3 * 86400e3, 'dönüşten 3 gün');
    assert.deepEqual(await kindOf(idle), { k: null, held: false }, 'süre içinde yönetim yayıncısı değil');
    ok(await idle.post('/api/agency/join', { code: await codeOf(B.id) }), 'başka ajansa kodla');
    assert.equal(ok(await idle.get('/api/agency/me')).membership?.agencyId ?? (await q('SELECT agency_id FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [idle.id]))[0].agency_id, B.id);
    assert.equal((await kindOf(idle)).k, 'agency');
  });

  test('3 günde katılmayan yönetim yayıncısı olur; artık kodla katılamaz, yalnız transferle', async () => {
    await offline(late, 0);
    await jobs();
    await q("UPDATE agency_streamers SET returned_at = now() - interval '4 days' WHERE streamer_id = $1 AND end_reason = 'inactive'", [late.id]);
    assert.deepEqual(await kindOf(late), { k: 'management', held: true });
    const me = ok(await late.get('/api/agency/me'));
    assert.equal(me.streamer.held, true);
    const r = refused(await late.post('/api/agency/join', { code: await codeOf(B.id) }), 409, 'süre doldu');
    assert.match(r.error, /transfer talebi/);
    assert.equal((await jobs()).returned, 0, 'dönüş bir kez yazılır');
  });
});
