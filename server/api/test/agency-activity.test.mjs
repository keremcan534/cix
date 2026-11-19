// Aday ajans / aktif ajans (agency-activity.mjs, docs/AJANS_STATUSU.md) against a real Postgres: an agency is a
// candidate until it has enough streamers and earners, then active; a candidate's commission is kept but not paid;
// a streamer inactive for the set days leaves the agency, which falls back to candidate below the line; an active
// agency that brought too few new streamers last month gets fewer points of its own share this month.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

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
const ref = () => `t${rnd(8)}`;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;

async function account(name, gender = 'Kadın') {
  const s = await signUp(name);
  if (gender) await q('UPDATE users SET gender = $2 WHERE id = $1', [s.user.id, gender]);
  return { id: s.user.id, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}

let admin;
async function setLive(changes) {
  const view = ok(await admin.get('/api/admin/live-settings'));
  return ok(await admin.post('/api/admin/live-settings', { changes, reason: 'Ajans statüsü testi', baseV: view.v, confirm: true }), 'ayar');
}
const jobs = async () => ok(await admin.post('/api/admin/agency/jobs/run', {}), 'işler');
const income = async (streamer, diamonds) => ok(await admin.post('/api/admin/agency/income', { streamer: streamer.id, type: 'gift', diamonds, ref: ref() }), 'gelir');

describe('Ajans statüsü', () => {
  let owner, A, streamers;
  const overview = async () => ok(await owner.get(`/api/agency/overview?id=${A.id}`), 'özet');

  test('hazırlık: kural 3 yayıncı, 2 kazanan × 1 USD, 3 altında aday; bir ajans ve üç yayıncı', async () => {
    admin = await account('Merkez', null);
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    await setLive({ agency_activation_hosts: 3, agency_activation_earners: 2, agency_activation_earn_usd: 1, agency_demote_below: 3, agency_monthly_new_hosts: 5, agency_monthly_penalty_pct: 5, agency_inactive_days: 90 });
    owner = await account('Statü Sahibi', null);
    A = ok(await admin.post('/api/admin/agency/create', { name: `Statü Ajans ${rnd(3)}`, owner: owner.id })).agency;
    assert.equal((await q('SELECT activity FROM agencies WHERE id = $1', [A.id]))[0].activity, 'candidate', 'yeni ajans aday');
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [A.id]))[0].code;
    streamers = [];
    for (const n of ['Bir', 'İki', 'Üç']) {
      const s = await account(`Yayıncı ${n}`);
      ok(await s.post('/api/agency/join', { code }), 'katıl');
      streamers.push(s);
    }
  });

  test('yayıncı tamam ama kazanç yok: aday; kazanç gelince aktif; aday ajans ödeme alamaz, aktif alır', async () => {
    let o = await overview();
    assert.deepEqual([o.activity.status, o.activity.hosts, o.activity.earners, o.activity.need.hosts], ['candidate', 3, 0, 3]);
    // A candidate's commission is kept like any other.
    await income(streamers[0], 6_000);
    const kept = await q('SELECT sum(amount)::numeric AS s FROM agency_ledger WHERE agency_id = $1', [A.id]);
    assert.ok(Number(kept[0].s) > 0, 'komisyon birikir');
    const period = (await q('SELECT DISTINCT period FROM agency_ledger WHERE agency_id = $1', [A.id]))[0].period;
    await q('INSERT INTO agency_periods (period) VALUES ($1) ON CONFLICT DO NOTHING', [period]);
    ok(await admin.post('/api/admin/agency/settings', { key: 'payout_policy', value: { min_diamonds: 0 }, reason: 'Test' }), 'alt limit');
    const cand = refused(await owner.post('/api/agency/payouts/request', { id: A.id, currency: 'USD', ref: ref() }), 409, 'aday');
    assert.equal(cand.code, 'agency_candidate');
    assert.match(cand.error, /3 yayıncıya ve bunlardan 2 tanesi 1 USD kazanınca/);
    await income(streamers[1], 5_000);
    o = await overview();
    assert.deepEqual([o.activity.status, o.activity.earners], ['active', 2]);
    const r = await jobs();
    assert.equal(r.activated, 1);
    assert.equal((await q('SELECT activity FROM agencies WHERE id = $1', [A.id]))[0].activity, 'active');
    const notes = await q("SELECT title FROM agency_notices WHERE agency_id = $1 AND kind = 'status'", [A.id]);
    assert.ok(notes.some((n) => /aktif oldu/.test(n.title)));
    const paid = await owner.post('/api/agency/payouts/request', { id: A.id, currency: 'USD', ref: ref() });
    assert.notEqual(paid[1].code, 'agency_candidate', 'aktif ajans aday diye reddedilmez');
  });

  test('aylık şart: geçen ay 5 yeni yayıncı yoksa bu ay kendi payı 5 puan düşük; üst ajansa dokunmaz', async () => {
    // Approved before last month: the month's rule applies. All its streamers joined this month: last month 0 new.
    await q("UPDATE agencies SET approved_at = now() - interval '70 days', created_at = now() - interval '70 days' WHERE id = $1", [A.id]);
    const r = await jobs();
    assert.ok(r.monthRules >= 1);
    const [rule] = await q('SELECT new_hosts, needed, penalty FROM agency_month_rules WHERE agency_id = $1', [A.id]);
    assert.deepEqual([rule.new_hosts, rule.needed, Number(rule.penalty)], [0, 5, 0.05]);
    assert.equal((await jobs()).monthRules, 0, 'ayda bir kez');
    const before = (await q('SELECT count(*)::int AS n FROM agency_commissions WHERE agency_id = $1', [A.id]))[0].n;
    await income(streamers[2], 10_000);
    const [k] = await q('SELECT total_rate, agency_rate, penalty_rate, agency_amount FROM agency_commissions WHERE agency_id = $1 ORDER BY id DESC LIMIT 1', [A.id]);
    assert.equal((await q('SELECT count(*)::int AS n FROM agency_commissions WHERE agency_id = $1', [A.id]))[0].n, before + 1);
    assert.deepEqual([Number(k.total_rate), Number(k.agency_rate), Number(k.penalty_rate), Number(k.agency_amount)], [0.35, 0.35, 0.05, 3_500]);
    assert.equal((await overview()).activity.penalty, 0.05);
  });

  test('90 gün pasif yayıncı düşer, yönetim yayıncısı olur; ajans 3 altına inince adaya düşer', async () => {
    const idle = streamers[2];
    await q("UPDATE agency_streamers SET joined_at = now() - interval '100 days' WHERE streamer_id = $1 AND ended_at IS NULL", [idle.id]);
    await q("UPDATE sessions SET last_seen_at = now() - interval '100 days' WHERE user_id = $1", [idle.id]);
    await q("UPDATE device_accounts SET last_seen_at = now() - interval '100 days' WHERE user_id = $1", [idle.id]);
    // One still active (a recent sign-in) stays even with an old link.
    await q("UPDATE agency_streamers SET joined_at = now() - interval '100 days' WHERE streamer_id = $1 AND ended_at IS NULL", [streamers[0].id]);
    const r = await jobs();
    assert.equal(r.inactive, 1);
    assert.equal(r.demoted, 1);
    const [link] = await q('SELECT end_reason FROM agency_streamers WHERE streamer_id = $1 ORDER BY id DESC LIMIT 1', [idle.id]);
    assert.equal(link.end_reason, 'inactive');
    const me = ok(await idle.get('/api/agency/me'));
    assert.equal(me.membership, null);
    assert.equal(me.streamer.held, true, 'yönetim yayıncısı: yalnız transferle geçer');
    const o = await overview();
    assert.deepEqual([o.activity.status, o.activity.hosts], ['candidate', 2]);
    assert.equal(o.agency.activity, 'candidate');
    const notes = await q("SELECT title FROM agency_notices WHERE agency_id = $1 AND kind = 'status' ORDER BY id DESC LIMIT 3", [A.id]);
    assert.ok(notes.some((n) => /aday ajansa düştü/.test(n.title)));
    assert.ok(notes.some((n) => /pasif kaldığı için/.test(n.title)));
  });

  test('kural kapalı (0): her ajans aktif', async () => {
    await setLive({ agency_activation_hosts: 0 });
    assert.equal((await overview()).activity.status, 'active');
    await setLive({ agency_activation_hosts: null, agency_activation_earners: null, agency_activation_earn_usd: null, agency_demote_below: null, agency_monthly_new_hosts: null, agency_monthly_penalty_pct: null, agency_inactive_days: null });
  });
});
