// Diamond withdrawals (withdraw.mjs) against a real Postgres (harness.mjs), on a test server: play money is
// on (ALLOW_TEST_TOPUP=1), so requests work end to end but can never be marked paid. Paying out on a server
// with real money only is in hardening.test.mjs. The store lock is 0 days here, so gifted diamonds are unlocked.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { validIban } from '../withdraw.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ LOCK_DAYS_STORE: '0', TEST_TOPUP_DAILY: '1000000', AGENCY_JOBS: '0' });
const { call, signUp } = h;
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const ref = () => `w${rnd(8)}`;
const IBAN = 'GB82 WEST 1234 5698 7654 32';
const iban = (diamonds, r = ref()) => ({ diamonds, method: 'iban', details: { holder: 'Ada Yılmaz', account: IBAN }, ref: r });

let host, fan, admin, other;
const withdraw = (body, s = host.session) => call('POST', '/api/wallet/withdraw', body, s);
const diamonds = async (s = host.session) => (await ok(call('GET', '/api/me', null, s))).user.diamonds;

describe('para çekme', () => {
  test('hazırlık: yayıncıya 99.995 açık elmas', async () => {
    [host, fan, admin, other] = await Promise.all(['Yayıncı', 'Hayran', 'Yönetici', 'Başkası'].map((n) => signUp(n)));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    for (let i = 0; i < 10; i++) await ok(call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: ref() }, fan.session));
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g8', count: 5, ref: ref() }, fan.session));
    const e = await ok(call('GET', '/api/wallet/earnings', null, host.session));
    assert.equal(e.diamonds, 99_995);
    assert.equal(e.withdrawable, 99_995);
  });

  test('IBAN: her ülkeden, kontrol basamağıyla', () => {
    for (const v of ['GB82WEST12345698765432', 'GB82 WEST 1234 5698 7654 32', 'DE89370400440532013000', 'TR330006100519786457841326', 'fr1420041010050500013m02606']) assert.ok(validIban(v), v);
    for (const v of ['GB83WEST12345698765432', 'TR', 'TR330006100519786457841327', '1234567890123456', 'GB82-WEST-1234']) assert.ok(!validIban(v), v);
  });

  test('kurallar: en az, en çok, yöntem, hesap bilgisi', async () => {
    assert.equal((await withdraw(iban(49_999)))[0], 400, 'en az 50.000');
    assert.equal((await withdraw(iban(5_000_001)))[0], 400, 'en çok 5.000.000');
    assert.equal((await withdraw({ ...iban(50_000), method: 'paypal' }))[0], 400, 'yöntem');
    assert.equal((await withdraw({ ...iban(50_000), details: { holder: 'Ada', account: 'TR330006100519786457841327' } }))[0], 400, 'IBAN kontrol basamağı');
    assert.equal((await withdraw({ ...iban(50_000), details: { holder: 'A', account: IBAN } }))[0], 400, 'ad kısa');
    assert.equal((await withdraw({ ...iban(50_000), method: 'other', details: { holder: 'Ada Yılmaz', account: 'abc' } }))[0], 400, 'hesap kısa');
    assert.equal((await withdraw({ ...iban(50_000), ref: 'kısa' }))[0], 400, 'istek kimliği');
    assert.equal(await diamonds(), 99_995, 'hiçbiri elmas almadı');
  });

  test('kilitli elmas çekilemez', async () => {
    await h.sql.query("UPDATE diamond_locks SET unlock_at = now() + interval '7 days' WHERE user_id = $1", [host.user.id]);
    const [st, j] = await withdraw(iban(50_000));
    assert.equal(st, 409);
    assert.match(j.error, /kilidi henüz açılmadı/);
    await h.sql.query('UPDATE diamond_locks SET unlock_at = now() WHERE user_id = $1', [host.user.id]);
  });

  let first;
  test('talep: elmaslar hemen tutulur, aynı istek bir kez işlenir, ikinci talep beklemede', async () => {
    const r = ref();
    const j = await ok(withdraw(iban(60_000, r)));
    first = j.withdrawal;
    assert.equal(j.replay, false);
    assert.equal(j.user.diamonds, 39_995);
    assert.deepEqual(
      { diamonds: first.diamonds, usd: first.usd, method: first.method, holder: first.holder, account: first.account, status: first.status, statusLabel: first.statusLabel },
      { diamonds: 60_000, usd: 12, method: 'iban', holder: 'Ada Yılmaz', account: IBAN, status: 'pending', statusLabel: 'Beklemede' },
    );
    const again = await ok(withdraw(iban(60_000, r)));
    assert.equal(again.replay, true);
    assert.equal(again.withdrawal.id, first.id);
    assert.equal(again.user.diamonds, 39_995);
    const rows = (await h.sql.query("SELECT amount, channel, detail FROM ledger WHERE user_id = $1 AND reason = 'Para çekme talebi'", [host.user.id])).rows;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].amount), -60_000);
    assert.equal(rows[0].channel, 'cekim');
    assert.equal(rows[0].detail.withdrawal, first.id);

    const [st, e] = await withdraw(iban(50_000));
    assert.equal(st, 409, 'bekleyen talep varken');
    assert.match(e.error, /Bekleyen/);
    // The held diamonds can't be spent a second time.
    assert.equal((await call('POST', '/api/wallet/exchange', { diamonds: 40_000, ref: ref() }, host.session))[0], 409);
    const list = await ok(call('GET', '/api/wallet/withdrawals', null, host.session));
    assert.equal(list.withdrawals[0].id, first.id);
    assert.equal(list.withdrawable, 39_995);
    assert.equal(list.rules.minDiamonds, 50_000);
    assert.equal(list.rules.weekUsed, 60_000);
    assert.equal((await ok(call('GET', '/api/wallet/withdrawals', null, other.session))).withdrawals.length, 0, 'başkasının talepleri görünmez');
  });

  test('iptal: yalnızca sahibi, yalnızca beklemedeyken; elmaslar geri gelir', async () => {
    assert.equal((await call('POST', '/api/wallet/withdrawals/cancel', { id: first.id }, other.session))[0], 404);
    const j = await ok(call('POST', '/api/wallet/withdrawals/cancel', { id: first.id }, host.session));
    assert.equal(j.withdrawal.status, 'cancelled');
    assert.equal(j.user.diamonds, 99_995);
    assert.equal((await call('POST', '/api/wallet/withdrawals/cancel', { id: first.id }, host.session))[0], 409, 'ikinci iptal');
    assert.equal(await diamonds(), 99_995);
    assert.equal((await ok(call('GET', '/api/wallet/withdrawals', null, host.session))).rules.weekUsed, 0);
  });

  test('yönetici: liste, ret elmasları geri verir; test parasıyla ödeme yapılamaz', async () => {
    const w = (await ok(withdraw({ diamonds: 50_000, method: 'other', details: { holder: 'Ada Yılmaz', account: 'Wise: ada@example.com' }, ref: ref() }))).withdrawal;
    assert.equal(w.account, 'Wise: ada@example.com');
    assert.equal((await call('GET', '/api/admin/withdrawals', null, host.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: false, note: 'x' }, host.session))[0], 403);
    const list = await ok(call('GET', '/api/admin/withdrawals?status=pending', null, admin.session));
    assert.equal(list.playMoney, true);
    const row = list.rows.find((x) => x.id === w.id);
    assert.equal(row.user.id, host.user.id);
    assert.equal(row.play, true);
    assert.equal(row.payable, false);
    assert.equal((await call('GET', '/api/admin/withdrawals?status=x', null, admin.session))[0], 400);

    const [st, e] = await call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: true }, admin.session);
    assert.equal(st, 409, 'test parası ödenmez');
    assert.match(e.error, /test jetonu/);
    assert.equal((await call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: false }, admin.session))[0], 400, 'ret nedeni');
    const d = await ok(call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: false, note: 'Hesap bilgisi eksik' }, admin.session));
    assert.equal(d.withdrawal.status, 'rejected');
    assert.equal(d.withdrawal.note, 'Hesap bilgisi eksik');
    assert.equal(await diamonds(), 99_995, 'elmaslar geri döndü');
    assert.equal((await call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: false, note: 'tekrar' }, admin.session))[0], 409, 'ikinci karar');
    const audit = (await h.sql.query("SELECT actor, detail FROM audit_events WHERE action = 'withdrawal.reject' AND target = $1", [host.user.id])).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor, admin.user.id);
    assert.equal(audit[0].detail.withdrawal, w.id);
  });

  test('kimse kendi talebine karar veremez; haftalık sınır', async () => {
    const w = (await ok(withdraw(iban(50_000)))).withdrawal;
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [host.user.id]);
    assert.equal((await call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: false, note: 'kendim' }, host.session))[0], 403);
    await h.sql.query("UPDATE users SET role = 'user' WHERE id = $1", [host.user.id]);
    await ok(call('POST', '/api/wallet/withdrawals/cancel', { id: w.id }, host.session));

    // 9.980.000 paid this week already: a new 50.000 is past the 10.000.000 a week.
    await h.sql.query("INSERT INTO withdrawals (user_id, diamonds, usd, method, holder, account, status, ref) VALUES ($1, 9980000, 1996, 'other', 'Ada Yılmaz', 'önceki ödeme', 'paid', $2)", [host.user.id, ref()]);
    const [st, e] = await withdraw(iban(50_000));
    assert.equal(st, 409);
    assert.match(e.error, /7 günde en çok 10\.000\.000 elmas/);
    assert.equal(await diamonds(), 99_995);
  });
});
