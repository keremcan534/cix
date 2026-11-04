// Sign in with Google (auth.mjs, google.mjs) against a real Postgres (harness.mjs). Google is played by a local
// key pair and a JWKS server on 127.0.0.1 (GOOGLE_JWKS_URL, honoured only for local addresses).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const WEB_ID = 'web-123.apps.googleusercontent.com';
const ANDROID_ID = 'android-456.apps.googleusercontent.com';

const google = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const stranger = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
let jwksHits = 0;
const jwks = http.createServer((req, res) => {
  jwksHits++;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'public, max-age=3600');
  res.end(JSON.stringify({ keys: [{ ...google.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] }));
});
await new Promise((r) => jwks.listen(0, '127.0.0.1', r));
jwks.unref();

const h = startApi({ GOOGLE_CLIENT_IDS: ` ${WEB_ID}, ${ANDROID_ID} `, GOOGLE_JWKS_URL: `http://127.0.0.1:${jwks.address().port}/oauth2/v3/certs` });
const { call, signUp } = h;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** An ID token as Google would sign it; `over` changes claims, `opts` the header or the signing key. */
function idToken(over = {}, { kid = KID, alg = 'RS256', key = google.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    azp: ANDROID_ID,
    aud: WEB_ID,
    sub: String(crypto.randomInt(1e9, 9e9)) + String(crypto.randomInt(1e9, 9e9)),
    email: `kisi${rnd(3)}@gmail.com`,
    email_verified: true,
    name: 'Elif Yılmaz',
    given_name: 'Elif',
    iat: now,
    exp: now + 3600,
    ...over,
  };
  const head = `${b64({ alg, kid, typ: 'JWT' })}.${b64(claims)}`;
  return `${head}.${crypto.sign('RSA-SHA256', Buffer.from(head), key).toString('base64url')}`;
}
const google_ = (body) => call('POST', '/api/auth/google', body);

describe('Google ile giriş', () => {
  test('yeni hesap açar, aynı Google hesabı aynı hesaba döner, anahtarlar önbellekte kalır', async () => {
    const sub = '111222333444555666777';
    const [st, j] = await google_({ idToken: idToken({ sub }), device: 'Pixel 9' });
    assert.equal(st, 200, j.error);
    assert.equal(j.isNew, true);
    assert.equal(j.user.name, 'Elif');
    assert.equal(j.user.coins, 0);
    const [meSt, me] = await call('GET', '/api/me', null, j.session);
    assert.equal(meSt, 200);
    assert.equal(me.user.id, j.user.id);

    const [st2, again] = await google_({ idToken: idToken({ sub, name: 'Başka', given_name: 'Başka' }) });
    assert.equal(st2, 200, again.error);
    assert.equal(again.isNew, false);
    assert.equal(again.user.id, j.user.id);
    assert.equal(again.user.name, 'Elif', 'ad Google tarafından değiştirilmez');
    assert.notEqual(again.session, j.session);
    assert.equal(jwksHits, 1, 'anahtarlar bir kez alınır');

    const row = (await h.sql.query("SELECT * FROM auth_identities WHERE provider = 'google' AND subject = $1", [sub])).rows[0];
    assert.equal(row.user_id, j.user.id);
    assert.match(row.email, /@gmail\.com$/);
  });

  test('Android istemci kimliği de kabul edilir; adsız token "Yeni üye" olur', async () => {
    const [st, j] = await google_({ idToken: idToken({ aud: ANDROID_ID, name: undefined, given_name: undefined }) });
    assert.equal(st, 200, j.error);
    assert.equal(j.user.name, 'Yeni üye');
  });

  test('geçersiz token reddedilir', async () => {
    const cases = {
      'başka uygulama': idToken({ aud: 'other.apps.googleusercontent.com' }),
      'başka yayıncı': idToken({ iss: 'https://evil.example.com' }),
      'süresi dolmuş': idToken({ exp: Math.floor(Date.now() / 1000) - 3600, iat: Math.floor(Date.now() / 1000) - 7200 }),
      'gelecekte verilmiş': idToken({ iat: Math.floor(Date.now() / 1000) + 3600 }),
      'doğrulanmamış e-posta': idToken({ email_verified: false }),
      'başka anahtarla imzalı': idToken({}, { key: stranger.privateKey }),
      'bilinmeyen anahtar': idToken({}, { kid: 'nope' }),
      'HS256': idToken({}, { alg: 'HS256' }),
      'imzasız': `${b64({ alg: 'none', kid: KID })}.${b64({ iss: 'accounts.google.com', aud: WEB_ID, sub: '1', exp: 9e9, email_verified: true })}.`,
      'bozuk': 'not.a.token',
      'boş': '',
    };
    for (const [what, t] of Object.entries(cases)) {
      const [st, j] = await google_({ idToken: t });
      assert.equal(st, 401, `${what}: ${JSON.stringify(j)}`);
      assert.equal(j.error, 'Google girişi doğrulanamadı, tekrar dene');
    }
    // Değiştirilmiş içerik: imza tutmaz.
    const [head, , sig] = idToken().split('.');
    const forged = `${head}.${b64({ iss: 'accounts.google.com', aud: WEB_ID, sub: '42', exp: 9e9, email_verified: true })}.${sig}`;
    assert.equal((await google_({ idToken: forged }))[0], 401);
    assert.equal((await google_({}))[0], 401, 'token yok');
    assert.equal((await h.sql.query("SELECT count(*)::int AS n FROM auth_identities WHERE subject = '42'")).rows[0].n, 0);
  });

  test('cihazdaki geliştirme hesabına bağlanır, bakiye korunur; ikinci Google hesabı yeni hesap açar', async () => {
    const dev = await signUp('Test Kişi');
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(8) }, dev.session))[0], 200);

    const [st, j] = await google_({ idToken: idToken(), deviceKey: dev.deviceKey });
    assert.equal(st, 200, j.error);
    assert.equal(j.isNew, false);
    assert.equal(j.user.id, dev.user.id);
    assert.equal(j.user.coins, 5000);
    assert.equal(j.user.name, 'Test Kişi');

    const [st2, other] = await google_({ idToken: idToken(), deviceKey: dev.deviceKey });
    assert.equal(st2, 200, other.error);
    assert.equal(other.isNew, true, 'bu cihazın hesabı zaten başka bir Google hesabına bağlı');
    assert.notEqual(other.user.id, dev.user.id);

    // Geçersiz bir cihaz anahtarı yok sayılır.
    const [st3, third] = await google_({ idToken: idToken(), deviceKey: 'short' });
    assert.equal(st3, 200, third.error);
    assert.equal(third.isNew, true);
  });

  test('aynı Google hesabı aynı anda iki kez: tek hesap', async () => {
    const sub = String(crypto.randomInt(1e9, 9e9));
    const both = await Promise.all([google_({ idToken: idToken({ sub }) }), google_({ idToken: idToken({ sub }) })]);
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.equal(both[0][1].user.id, both[1][1].user.id);
  });

  test('askıya alınmış hesap giremez', async () => {
    const sub = String(crypto.randomInt(1e9, 9e9));
    const [, j] = await google_({ idToken: idToken({ sub }) });
    await h.sql.query("INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, expires_at, is_permanent, created_role) VALUES ($1, 'account_ban', 'account', 'other', 'test', now() + interval '2 days', false, 'admin')", [j.user.id]);
    const [st, err] = await google_({ idToken: idToken({ sub }) });
    assert.equal(st, 403);
    assert.equal(err.code, 'account_banned');
    assert.ok(err.appealSession, 'itiraz için kısıtlı oturum');
  });

  test('hesap silinince Google bağlantısı kalkar, aynı Google hesabı yeni hesap açar', async () => {
    const sub = String(crypto.randomInt(1e9, 9e9));
    const [, j] = await google_({ idToken: idToken({ sub }) });
    assert.equal((await call('DELETE', '/api/me', null, j.session))[0], 200);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1', [j.user.id])).rows[0].n, 0);
    const [st, fresh] = await google_({ idToken: idToken({ sub }) });
    assert.equal(st, 200, fresh.error);
    assert.equal(fresh.isNew, true);
    assert.notEqual(fresh.user.id, j.user.id);
  });
});
