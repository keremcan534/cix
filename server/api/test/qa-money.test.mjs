// QA fixes (money and account) against a real Postgres, on a server with play money (ALLOW_TEST_TOPUP=1 from
// harness.mjs) and a small daily test cap: a NUL byte in text is a 400, the cap's message, agency payouts of
// play money, deleting an account while a sanction is on, and a second report on the same person.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ TEST_TOPUP_DAILY: '2000', AGENCY_JOBS: '0' });
const { call, signUp } = h;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const NUL = 'a\u0000b';

describe('NUL baytı içeren metin 400 döner, 500 değil', () => {
  test('profil, oda adı, şikâyet sebebi ve kayıt adı', async () => {
    const a = await signUp('Nul');
    const b = await signUp('Hedef');
    const cases = [
      ['PATCH', '/api/me', { name: NUL }, a.session],
      ['PATCH', '/api/me', { bio: NUL }, a.session],
      ['POST', '/api/rooms', { title: NUL }, a.session],
      ['POST', '/api/report', { type: 'user', id: b.user.id, reason: NUL }, a.session],
      ['POST', '/api/auth/dev', { deviceKey: rnd(24), name: NUL }, null],
    ];
    for (const [m, p, body, s] of cases) {
      const [st, j] = await call(m, p, body, s);
      assert.equal(st, 400, `${m} ${p} ${JSON.stringify(j)}`);
      assert.equal(j.error, 'Geçersiz metin');
    }
    // The same requests without the byte still work.
    assert.equal((await call('PATCH', '/api/me', { name: 'Temiz Ad', bio: 'Merhaba' }, a.session))[0], 200);
    assert.equal((await call('POST', '/api/rooms', { title: 'Temiz oda' }, a.session))[0], 200);
  });
});

describe('Günlük test yükleme sınırı metni', () => {
  test('yükleme ve test satın alması: biçimli sayı', async () => {
    const u = await signUp('Sınır');
    for (let i = 0; i < 2; i++) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, u.session))[0], 200);
    const [st, j] = await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, u.session);
    assert.equal(st, 429);
    assert.equal(j.error, 'Günlük test yükleme sınırı: 2.000 jeton');
    const [st2, j2] = await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, u.session);
    assert.equal(st2, 429);
    assert.equal(j2.error, 'Günlük test yükleme sınırı: 2.000 jeton');
  });
});

describe('Test jetonlu sunucuda ajans ödemesi', () => {
  test('talep, onay ve ödeme reddedilir; liste ödenemez gösterir; ret ve iptal açık', async () => {
    const admin = await signUp('Merkez');
    const admin2 = await signUp('Finans');
    await q("UPDATE users SET role = 'admin' WHERE id = ANY($1)", [[admin.user.id, admin2.user.id]]);
    const owner = await signUp('Ajans Sahibi');
    const [stA, ag] = await call('POST', '/api/admin/agency/create', { name: 'QA Test Ajansı', owner: owner.user.id }, admin.session);
    assert.equal(stA, 200, ag.error);
    const agency = ag.agency;

    const [st0, j0] = await call('POST', '/api/agency/payouts/request', { id: agency.id, currency: 'USD', ref: `t${rnd(8)}` }, owner.session);
    assert.equal(st0, 409, JSON.stringify(j0));
    assert.equal(j0.error, 'Test jetonundan gelen kazanç ödenemez');

    // A request written before the guard existed: it can't be approved, only rejected.
    const pending = (await q("INSERT INTO agency_payouts (agency_id, ref, amount, usd, currency, requested_by) VALUES ($1, $2, 5000, 1, 'USD', $3) RETURNING id", [agency.id, `t${rnd(8)}`, owner.user.id]))[0];
    const [stL, list] = await call('GET', '/api/admin/agency/payouts', null, admin.session);
    assert.equal(stL, 200, list.error);
    assert.equal(list.playMoney, true);
    const row = list.payouts.find((p) => p.id === Number(pending.id));
    assert.equal(row.payable, false);
    const [st1, j1] = await call('POST', '/api/admin/agency/payouts/decide', { payoutId: Number(pending.id), action: 'approve' }, admin.session);
    assert.equal(st1, 409, JSON.stringify(j1));
    assert.equal(j1.error, 'Test jetonundan gelen kazanç ödenemez');
    assert.equal((await q('SELECT status FROM agency_payouts WHERE id = $1', [pending.id]))[0].status, 'pending');
    const [st2, j2] = await call('POST', '/api/admin/agency/payouts/decide', { payoutId: Number(pending.id), action: 'reject', note: 'Test jetonu ödenemez' }, admin.session);
    assert.equal(st2, 200, j2.error);

    // One already approved by someone else: it can't be marked paid either.
    const ready = (
      await q("INSERT INTO agency_payouts (agency_id, ref, amount, usd, currency, requested_by, status, approved_by, approved_at) VALUES ($1, $2, 5000, 1, 'USD', $3, 'ready', $4, now()) RETURNING id", [
        agency.id,
        `t${rnd(8)}`,
        owner.user.id,
        admin2.user.id,
      ])
    )[0];
    const [st3, j3] = await call('POST', '/api/admin/agency/payouts/decide', { payoutId: Number(ready.id), action: 'pay', paymentRef: 'BANKA-QA-1' }, admin.session);
    assert.equal(st3, 409, JSON.stringify(j3));
    assert.equal(j3.error, 'Test jetonundan gelen kazanç ödenemez');
    const after = (await q('SELECT status, payment_ref FROM agency_payouts WHERE id = $1', [ready.id]))[0];
    assert.equal(after.status, 'ready');
    assert.equal(after.payment_ref, null);
    assert.equal((await call('POST', '/api/admin/agency/payouts/decide', { payoutId: Number(ready.id), action: 'cancel', note: 'Test jetonu ödenemez' }, admin.session))[0], 200);
  });
});

describe('Yaptırım sürerken hesap silinmez', () => {
  test('susturulan hesap silinemez; yaptırım bitince silinir', async () => {
    const admin = await h.account('Yönetici', 'admin');
    const u = await signUp('Susturulan');
    const [stS, js] = await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_all', minutes: 60, reason: 'harassment', description: 'Kurallara aykırı davranış' }, admin.session);
    assert.equal(stS, 200, js.error);
    const [st, j] = await call('DELETE', '/api/me', null, u.session);
    assert.equal(st, 409, JSON.stringify(j));
    assert.equal(j.error, 'Yaptırım bitince hesabını silebilirsin');
    assert.equal(j.code, 'sanction_active');
    assert.equal(j.sanction.type, 'mute_all');
    const row = (await q('SELECT deleted_at, device_key_hash FROM users WHERE id = $1', [u.user.id]))[0];
    assert.equal(row.deleted_at, null);
    assert.ok(row.device_key_hash, 'cihaz anahtarı kaldı');
    // The same phone signs in to the same account, still muted.
    const [, again] = await call('POST', '/api/auth/dev', { deviceKey: u.deviceKey });
    assert.equal(again.user.id, u.user.id);
    // Once it has run out the account can go.
    await q("UPDATE user_sanctions SET start_at = now() - interval '2 hours', expires_at = now() - interval '1 second' WHERE user_id = $1", [u.user.id]);
    const [st2, j2] = await call('DELETE', '/api/me', null, u.session);
    assert.equal(st2, 200, j2.error);
    assert.equal(j2.deleted, true);
  });
});

describe('Aynı kişiye ikinci şikâyet', () => {
  test('yeni sebep ve not kaydedilir, not verilmezse eski not kalır', async () => {
    const a = await signUp('Şikâyetçi');
    const b = await signUp('Şikâyet Edilen');
    const report = (body) => call('POST', '/api/report', { type: 'user', id: b.user.id, ...body }, a.session);
    const [st1, j1] = await report({ reason: 'Spam' });
    assert.equal(st1, 200, j1.error);
    assert.equal(j1.updated, false);
    const [st2, j2] = await report({ reason: 'Taciz veya hakaret', note: 'Mesajda küfür' });
    assert.equal(st2, 200, j2.error);
    assert.equal(j2.updated, true);
    const rows = () => q("SELECT reason, note, status FROM reports WHERE reporter = $1 AND target_type = 'user' AND target_id = $2", [a.user.id, b.user.id]);
    assert.deepEqual(await rows(), [{ reason: 'Taciz veya hakaret', note: 'Mesajda küfür', status: 'open' }]);
    const [, j3] = await report({ reason: 'Taciz veya hakaret' });
    assert.equal(j3.updated, true);
    assert.deepEqual(await rows(), [{ reason: 'Taciz veya hakaret', note: 'Mesajda küfür', status: 'open' }]);
  });
});
