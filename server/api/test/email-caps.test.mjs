// E-mail providers and the hourly caps (mail.mjs, auth.mjs): Brevo first, Resend when Brevo is used up for the
// day or fails, 429 / 502 when neither can send, and caps over everyone and per connection that keep e-mail and
// SMS apart. Brevo and Resend are played by one local HTTP server (BREVO_URL / RESEND_URL).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

/** What each provider answers: 'ok' or an HTTP status. */
const mode = { brevo: 'ok', resend: 'ok' };
const got = { brevo: [], resend: [] };
const fake = http.createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  const p = req.url.slice(1);
  got[p].push({ headers: req.headers, body: JSON.parse(body) });
  res.setHeader('content-type', 'application/json');
  if (mode[p] === 'ok') return res.end(JSON.stringify({ id: rnd(4) }));
  res.statusCode = mode[p];
  res.end(JSON.stringify({ message: 'refused for test@example.com' }));
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
fake.unref();
const at = `http://127.0.0.1:${fake.address().port}`;

const h = startApi({
  MAIL_PROVIDERS: 'brevo, resend',
  MAIL_FROM: 'Similar Club <kod@example.com>',
  MAIL_REPLY_TO: 'destek@example.com',
  BREVO_API_KEY: 'brevo-test-key',
  RESEND_API_KEY: 'resend-test-key',
  BREVO_URL: `${at}/brevo`,
  RESEND_URL: `${at}/resend`,
  BREVO_DAILY: '1',
  RESEND_DAILY: '2',
  EMAIL_MX_CHECK: '0',
  EMAIL_GLOBAL_PER_HOUR: '3',
  OTP_IP_PER_HOUR: '4',
  EMAIL_IP_PER_HOUR: '2',
  SMS_PROVIDER: 'log',
  PHONE_SIGN_IN: '1',
  ALERT_CACHE_S: '0',
  ALERT_DISK_FREE_PCT: '0',
});
const { call } = h;

const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
let ipN = 0;
/** A different connection each time unless `ip` is given (the caps per connection read X-Forwarded-For). */
const from = (ip = `203.0.113.${++ipN}`) => ({ 'x-forwarded-for': ip });
const address = () => `kisi.${rnd(3)}@example.com`;
const start = (email, ip) => call('POST', '/api/auth/email/start', { email }, null, from(ip));
const quota = async () => Object.fromEntries((await q("SELECT provider, sent FROM mail_quota WHERE day = (now() AT TIME ZONE 'UTC')::date")).map((r) => [r.provider, r.sent]));
/** A fresh hour and day: nothing sent yet. */
const reset = async () => {
  await q('DELETE FROM otp_sends');
  await q('DELETE FROM mail_quota');
  mode.brevo = mode.resend = 'ok';
  got.brevo.length = got.resend.length = 0;
};

describe('e-posta sağlayıcıları', () => {
  test('Brevo gönderir: gönderen, alıcı, konu, düz metin ve HTML; anahtar yalnızca başlıkta; kod girişe yarar', async () => {
    await reset();
    const email = address();
    const [st, j] = await start(email);
    assert.equal(st, 200, j.error);
    assert.deepEqual([j.sent, j.retryAfter], [true, 60]);
    assert.match(j.challenge, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(got.brevo.length, 1);
    assert.equal(got.resend.length, 0);
    const { headers, body } = got.brevo[0];
    assert.equal(headers['api-key'], 'brevo-test-key');
    assert.deepEqual(body.sender, { name: 'Similar Club', email: 'kod@example.com' });
    assert.deepEqual(body.to, [{ email }]);
    assert.deepEqual(body.replyTo, { email: 'destek@example.com' });
    const code = /^Similar Club kodun: (\d{6})$/.exec(body.subject)?.[1];
    assert.ok(code, body.subject);
    assert.match(body.textContent, new RegExp(`giriş kodun: ${code}\\. Kod 10 dakika geçerli`));
    assert.ok(body.htmlContent.includes(code) && !/<a |<img /i.test(body.htmlContent), 'bağlantı ve resim yok');
    assert.ok(!JSON.stringify(body).includes('brevo-test-key'));
    assert.deepEqual(await quota(), { brevo: 1 });

    const [vst, v] = await call('POST', '/api/auth/email/verify', { email, code, challenge: j.challenge, deviceInfo: { installId: rnd(20), platform: 'android' } });
    assert.equal(vst, 200, v.error);
    assert.equal(v.isNew, true);
    assert.equal(v.user.email, email);
  });

  test('Brevo günlük kotası dolunca Resend; ikisi de dolunca 429', async () => {
    // BREVO_DAILY=1 was used by the test before.
    await q('DELETE FROM otp_sends');
    const email = address();
    assert.equal((await start(email))[0], 200);
    assert.equal(got.brevo.length, 1, 'Brevo bir daha denenmez');
    assert.equal(got.resend.length, 1);
    const { headers, body } = got.resend[0];
    assert.equal(headers.authorization, 'Bearer resend-test-key');
    assert.equal(body.from, 'Similar Club <kod@example.com>');
    assert.deepEqual(body.to, [email]);
    assert.equal(body.reply_to, 'destek@example.com');
    assert.match(body.subject, /^Similar Club kodun: \d{6}$/);
    assert.match(body.text, /Kimseyle paylaşma/);

    assert.equal((await start(address()))[0], 200);
    assert.deepEqual(await quota(), { brevo: 1, resend: 2 });
    await q('DELETE FROM otp_sends');
    const late = address();
    const [st, j] = await start(late);
    assert.equal(st, 429);
    assert.equal(j.error, 'Bugün çok fazla kod gönderildi; Google ile gir ya da yarın tekrar dene');
    assert.equal(got.resend.length, 2);
    // Nothing went out: the same address may ask again at once (and is refused again until the quota resets).
    assert.equal((await start(late))[1].error, j.error);
  });

  test('Brevo 429 verirse Resend; ikisi de bozuksa 502 ve hemen yeniden istenebilir; mail_failing alarmı', async () => {
    await reset();
    mode.brevo = 429;
    assert.equal((await start(address()))[0], 200);
    assert.equal(got.brevo.length, 1);
    assert.equal(got.resend.length, 1);
    assert.deepEqual(await quota(), { brevo: 0, resend: 1 }, 'reddedilen gönderim kotadan düşülmez');

    mode.brevo = 500;
    mode.resend = 503;
    const email = address();
    const [st, j] = await start(email);
    assert.equal(st, 502);
    assert.equal(j.error, 'E-posta gönderilemedi, biraz sonra tekrar dene');
    assert.equal((await start(email))[0], 502, 'beklemeden yeniden denenebilir');
    // Failed codes still count for the hourly caps (3 so far).
    assert.equal((await start(email))[0], 429);
    await q('DELETE FROM otp_sends');
    mode.brevo = 'ok';
    assert.equal((await start(email))[0], 200);

    // Ten codes in a row that no provider could send: the owner hears about it.
    const admin = await h.account('Yönetici', 'admin');
    mode.brevo = mode.resend = 500;
    for (let i = 0; i < 10; i++) {
      await q('DELETE FROM otp_sends');
      assert.equal((await start(address()))[0], 502);
    }
    const [, alerts] = await call('GET', '/api/admin/alerts', null, admin.session);
    assert.ok(alerts.warnings.some((w) => w.code === 'mail_failing'), JSON.stringify(alerts.warnings));
    const [, health] = await call('GET', '/api/health');
    assert.ok(health.warnings.includes('mail_failing'));
    mode.brevo = mode.resend = 'ok';
    await q('DELETE FROM otp_sends');
    assert.equal((await start(address()))[0], 200);
    assert.ok(!(await call('GET', '/api/admin/alerts', null, admin.session))[1].warnings.some((w) => w.code === 'mail_failing'));
  });

  test('mail_quota_high: günlük ücretsiz kotanın %80i geçilince', async () => {
    await reset();
    const admin = await h.account('Yönetici', 'admin');
    const warn = async () => (await call('GET', '/api/admin/alerts', null, admin.session))[1].warnings.find((w) => w.code === 'mail_quota_high');
    assert.equal((await start(address()))[0], 200);
    assert.equal(await warn(), undefined, '1/3');
    assert.equal((await start(address()))[0], 200);
    assert.equal(await warn(), undefined, '2/3 = %66,7');
    assert.equal((await start(address()))[0], 200);
    const w = await warn();
    assert.ok(w, '3/3');
    assert.equal(w.value, 100);
    assert.equal(w.threshold, 80);
    assert.deepEqual(w.details, { brevo: { sent: 1, cap: 1 }, resend: { sent: 2, cap: 2 } });
    assert.match(w.message, /e-posta kotasının %100 kullanıldı \(3\/3\)/);
  });
});

describe('saatlik sınırlar', () => {
  test('EMAIL_GLOBAL_PER_HOUR: e-posta sınırı SMS kodlarını etkilemez, SMS de e-postayı', async () => {
    await reset();
    for (let i = 0; i < 3; i++) assert.equal((await start(address()))[0], 200, `kod ${i + 1}`);
    const [st, j] = await start(address());
    assert.equal(st, 429);
    assert.equal(j.error, 'Şu an çok fazla kod isteniyor, biraz sonra tekrar dene');
    // SMS has its own cap (OTP_GLOBAL_PER_HOUR, 300).
    const [sst, sj] = await call('POST', '/api/auth/otp/start', { phone: '+905321112233' }, null, from());
    assert.equal(sst, 200, sj.error);
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_sends WHERE channel = 'email'"))[0].n, 3);
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_sends WHERE channel = 'sms'"))[0].n, 1);
  });

  test('OTP_IP_PER_HOUR: bir bağlantıdan saatte en çok 4 kod, e-posta ve SMS birlikte', async () => {
    await reset();
    const ip = '198.51.100.7';
    assert.equal((await start(address(), ip))[0], 200);
    assert.equal((await start(address(), ip))[0], 200);
    for (const p of ['+905321112244', '+905321112255']) assert.equal((await call('POST', '/api/auth/otp/start', { phone: p }, null, from(ip)))[0], 200, p);
    const [st, j] = await start(address(), ip);
    assert.equal(st, 429);
    assert.equal(j.error, 'Bu bağlantıdan çok fazla kod istendi, biraz sonra tekrar dene');
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: '+905321112266' }, null, from(ip)))[0], 429, 'SMS de');
    assert.equal((await start(address()))[0], 200, 'başka bağlantı');
  });

  test('EMAIL_IP_PER_HOUR: bir bağlantıdan saatte en çok 2 e-posta; bir IPv6 /64 tek bağlantıdır; SMS etkilenmez', async () => {
    await reset();
    assert.equal((await start(address(), '2001:db8:aa:1::1'))[0], 200);
    assert.equal((await start(address(), '2001:DB8:AA:1:ffff:1:2:3'))[0], 200);
    const [st, j] = await start(address(), '2001:db8:aa:1::99');
    assert.equal(st, 429);
    assert.equal(j.error, 'Bu bağlantıdan çok fazla kod istendi, biraz sonra tekrar dene');
    // The e-mail cap is its own: an SMS code from the same /64 still goes out (OTP_IP_PER_HOUR=4 over both).
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: '+905321112277' }, null, from('2001:db8:aa:1::5')))[0], 200);
    // Another /64 is another connection.
    assert.equal((await start(address(), '2001:db8:aa:2::1'))[0], 200);
    assert.deepEqual((await q("SELECT DISTINCT ip FROM otp_sends WHERE ip LIKE '2001:db8:aa:%' ORDER BY ip")).map((r) => r.ip), ['2001:db8:aa:1::/64', '2001:db8:aa:2::/64']);
  });
});
