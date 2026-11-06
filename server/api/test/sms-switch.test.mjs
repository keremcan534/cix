// OTP_GLOBAL_PER_HOUR=0 turns SMS off in one place (auth.mjs, features.mjs): no code goes out (503, feature
// 'sms'), /api/config says so, and codes already sent can still be checked.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ SMS_PROVIDER: 'log', OTP_GLOBAL_PER_HOUR: '0', PHONE_SIGN_IN: '1', MAIL_PROVIDERS: undefined });
const { call } = h;

describe('SMS kapalı (OTP_GLOBAL_PER_HOUR=0)', () => {
  test('kod istenemez (503 sms); kod kontrolü 503 değil; /api/config SMS ve telefonla girişi kapalı söyler', async () => {
    const u = await h.account('Kapalı');
    for (const [p, s] of [
      ['/api/auth/otp/start', null],
      ['/api/me/phone/start', u.session],
    ]) {
      const [st, j] = await call('POST', p, { phone: '+905321112233' }, s);
      assert.equal(st, 503, p);
      assert.deepEqual(j, { error: 'Telefon doğrulama henüz açık değil', feature: 'sms' });
    }
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM otp_sends')).rows[0].n, 0);
    for (const [p, s] of [
      ['/api/auth/otp/verify', null],
      ['/api/me/phone/verify', u.session],
    ]) {
      const [st, j] = await call('POST', p, { phone: '+905321112233', code: '123456', challenge: 'A'.repeat(22) }, s);
      assert.equal(st, 400, `${p} ${j.error}`);
      assert.equal(j.error, 'Kodun süresi doldu, yeni kod iste');
    }
    const [, cfg] = await call('GET', '/api/config');
    assert.equal(cfg.verify.sms, false);
    assert.equal(cfg.signIn.phone, false);
  });
});
