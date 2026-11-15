// The money checks on a running server (money-check.mjs, alerts.mjs money_mismatch, GET /api/admin/money-check):
// a clean database passes, a balance changed behind the ledger's back is found, and the live server watches only
// the ledger after migration 071 while ?all=1 still sees everything. This file breaks the money on purpose, so the
// harness's own check after it is off.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { checkMoney } from '../money-check.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ ALERT_CACHE_S: '0', MONEY_CHECK_MIN: '0.002' }, { moneyCheck: 'bu dosya parayı bilerek bozar' });
const { call, signUp } = h;
const q = (sql, args) => h.sql.query(sql, args);
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 100));
  }
};
const health = async () => (await ok(call('GET', '/api/health'))).warnings;

describe('Para denetimi', () => {
  let admin;
  let a;
  let b;

  test('temiz veritabanı: sorun yok, yalnız yönetici çalıştırır', async () => {
    admin = await signUp('Yönetici');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    a = await signUp('A');
    b = await signUp('B');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, a.session));
    await ok(call('POST', '/api/wallet/gift', { to: b.user.id, amount: 1200, ref: rnd(6) }, a.session));
    const r = await ok(call('GET', '/api/admin/money-check', null, admin.session));
    assert.deepEqual(r.problems, []);
    assert.equal(r.since, 0, 'yeni veritabanında her şey izlenir');
    assert.equal(r.error, null);
    assert.equal((await call('GET', '/api/admin/money-check', null, a.session))[0], 403);
    await until(async () => !(await health()).includes('alerts_error') && (await ok(call('GET', '/api/admin/alerts', null, admin.session))).warnings.every((w) => w.code !== 'money_mismatch'));
  });

  test('kayıt defterine yazılmadan değişen bakiye bulunur ve alarm olur', async () => {
    await q('UPDATE users SET coins = coins + 77 WHERE id = $1', [a.user.id]);
    const r = await ok(call('GET', '/api/admin/money-check', null, admin.session));
    const codes = r.problems.map((p) => p.code).sort();
    assert.deepEqual(codes, ['balance', 'lots']);
    const balance = r.problems.find((p) => p.code === 'balance');
    assert.equal(balance.count, 1);
    assert.deepEqual(balance.rows[0], { user_id: a.user.id, currency: 'coin', balance: 3877, ledger: 3800 });
    assert.match(balance.message, /1 hesapta bakiye/);
    await until(async () => (await health()).includes('money_mismatch'));
    const w = (await ok(call('GET', '/api/admin/alerts', null, admin.session))).warnings.find((x) => x.code === 'money_mismatch');
    assert.match(w.message, /Para kayıtlarında 2 tutarsızlık/);
    assert.equal(w.details.problems.length, 2);
  });

  test('canlıda 071 öncesi izlenmez, istenince her şey denetlenir', async () => {
    // As if the bad balance had come before migration 071 on the live server: the watched part starts after it.
    const last = (await q('SELECT max(id) AS m FROM ledger')).rows[0].m;
    await q('UPDATE money_check_from SET ledger_id = $1 WHERE id = 1', [last]);
    assert.deepEqual(await checkMoney(h.sql, { since: Number(last) }), []);
    await until(async () => !(await health()).includes('money_mismatch'));
    const all = await ok(call('GET', '/api/admin/money-check?all=1', null, admin.session));
    assert.deepEqual(all.problems.map((p) => p.code).sort(), ['balance', 'lots'], '?all=1 geçmişi de görür');
    // A new movement of that account brings it back into the watched part. Its row carries on from the edited
    // balance, so the gap shows in the chain now (the balance matches the last row again), and in the lots still.
    await ok(call('POST', '/api/wallet/gift', { to: b.user.id, amount: 100, ref: rnd(6) }, a.session));
    const watched = await ok(call('GET', '/api/admin/money-check', null, admin.session));
    assert.deepEqual(watched.problems.map((p) => p.code).sort(), ['chain', 'lots']);
    assert.deepEqual(watched.problems.find((p) => p.code === 'chain').rows.map((x) => [x.user_id, x.amount, x.balance, x.prev]), [[a.user.id, -100, 3777, 3800]]);
    assert.equal(watched.since, Number(last));
  });

  test('zincir: araya yazılmış ya da eksik satır bulunur', async () => {
    const c = await signUp('C');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, c.session));
    // A row whose balance doesn't follow from the one before it (a row lost in between, or written by hand).
    await q("INSERT INTO ledger (user_id, currency, amount, balance, reason, ref, detail) VALUES ($1, 'diamond', 5, 50, 'el ile', $2, '{}')", [c.user.id, rnd(8)]);
    const r = await checkMoney(h.sql, { only: ['chain'] });
    assert.equal(r.length, 1);
    assert.equal(r[0].rows.some((x) => x.user_id === c.user.id && x.currency === 'diamond' && x.prev === 0 && x.balance === 50), true);
  });
});
