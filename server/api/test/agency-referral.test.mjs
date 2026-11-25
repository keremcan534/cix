// Referans ajans (owners, 25 Nov 2026; agency-levels.mjs payReferral) against a real Postgres: the parent gets nothing
// for the week a referral agency joined it, then 5 % of the referral agency's whole weekly commission for the next 4
// weeks (paid when each week closes, on top: the referral agency keeps all of its own), and nothing after; once.
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

describe('Referans ajans: ilk hafta yok, sonraki 4 hafta %5, sonra yok', () => {
  let admin, P;
  /** A referral agency of P with one streamer, joined P `weeksAgo` weeks ago; returns it and its streamer. */
  async function referral(name, weeksAgo) {
    const owner = await account(`${name} sahibi`, null);
    const B = ok(await admin.post('/api/admin/agency/create', { name: `${name} ${rnd(3)}`, owner: owner.id, parentId: P.id }), name).agency;
    await q("UPDATE agency_parents SET valid_from = valid_from - make_interval(days => $2) WHERE agency_id = $1", [B.id, weeksAgo * 7]);
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [B.id]))[0].code;
    const star = await account(`${name} yayıncı`);
    ok(await star.post('/api/agency/join', { code, method: 'code' }), 'katıl');
    return { B, star };
  }
  const income = async (who, diamonds) => ok(await admin.post('/api/admin/agency/income', { streamer: who.id, type: 'gift', diamonds, ref: ref() }), 'gelir');
  const referralRows = async () => (await q("SELECT amount, rate, note, ref FROM agency_ledger WHERE agency_id = $1 AND kind = 'difference' ORDER BY ref", [P.id])).map((r) => ({ ...r, amount: num(r.amount), rate: num(r.rate) }));
  const own = async (B) => num((await q("SELECT coalesce(sum(amount), 0) AS n FROM agency_ledger WHERE agency_id = $1", [B.id]))[0].n);

  test('hafta kapanınca yalnız 2.–5. haftadaki referans ajanslardan %5', async () => {
    admin = await account('Merkez', null);
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    ok(
      await admin.post('/api/admin/agency/settings', {
        key: 'weekly_levels',
        value: { min_active: 1, active_usd: 1, new_weeks: 0, new_level: 'gonul', levels: [{ key: 'gonul', name: 'Gönül', rate: 0.3, from: 0, shown: false }, { key: 'ust', name: 'Üst', rate: 0.5, from: 10_000, shown: true }] },
        reason: 'Test',
      }),
    );
    const pOwner = await account('Üst sahibi', null);
    P = ok(await admin.post('/api/admin/agency/create', { name: `Üst ${rnd(3)}`, owner: pOwner.id })).agency;
    const fresh = await referral('Yeni', 0);
    const second = await referral('İkinci', 1);
    const fifth = await referral('Beşinci', 4);
    const old = await referral('Eski', 5);
    await income(fresh.star, 4000);
    await income(second.star, 12_000);
    await income(fifth.star, 2000);
    await income(old.star, 2000);
    assert.deepEqual(await referralRows(), [], 'hafta içinde üst ajansa bir şey yazılmaz');

    ok(await admin.post('/api/admin/agency/levels/run', { at: new Date(Date.now() + 7 * 86400e3).toISOString() }));
    const rows = await referralRows();
    // İkinci: 12.000 × %50 (Üst seviye) = 6.000 → %5 = 300. Beşinci: 2.000 × %30 = 600 → 30. Yeni (ilk hafta) ve Eski (6. hafta): yok.
    assert.deepEqual(
      rows.map((r) => [r.amount, r.rate, r.ref.split(':')[2]]).sort((a, b) => b[0] - a[0]),
      [
        [300, 0.05, second.B.id],
        [30, 0.05, fifth.B.id],
      ],
    );
    assert.match(rows.find((r) => r.amount === 300).note, /Referans ajans: İkinci .* 1\/4\. hafta %5/);
    assert.match(rows.find((r) => r.amount === 30).note, /4\/4\. hafta/);
    assert.equal(await own(second.B), 6000, 'referans ajansın kendi komisyonundan kesilmez');
    assert.equal(await own(fresh.B), 1200);

    ok(await admin.post('/api/admin/agency/levels/run', { at: new Date(Date.now() + 7 * 86400e3).toISOString() }));
    assert.equal((await referralRows()).length, 2, 'bir kez');
    const notes = await q("SELECT title FROM agency_notices WHERE agency_id = $1 AND kind = 'ledger'", [P.id]);
    assert.equal(notes.length, 2);
  });

  test('oran ve haftalar panelden; 0 hafta kapatır', async () => {
    const [st, j] = await admin.post('/api/admin/agency/settings', { key: 'referral_policy', value: { pct: 0.9, free_weeks: 1, weeks: 4 }, reason: 'Test' });
    assert.equal(st, 400, j.error);
    ok(await admin.post('/api/admin/agency/settings', { key: 'referral_policy', value: { pct: 0.1, free_weeks: 0, weeks: 0 }, reason: 'Test' }));
    const v = ok(await admin.get('/api/admin/agency/settings')).values.referral_policy;
    assert.deepEqual(v, { pct: 0.1, free_weeks: 0, weeks: 0 });
  });
});
