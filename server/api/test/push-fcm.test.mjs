// Firebase push (push.mjs) against a stand-in for Google's token and messaging addresses: a phone's Firebase token
// registers, a follow reaches it signed with the service account, a call rings on the "calls" channel, and a token
// Firebase no longer knows is deleted.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sent = [];
const grants = [];
const google = http.createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  res.setHeader('content-type', 'application/json');
  if (req.url === '/token') {
    grants.push(new URLSearchParams(body));
    return res.end(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }));
  }
  const m = JSON.parse(body);
  sent.push({ url: req.url, auth: req.headers.authorization, ...m });
  if (m.message.token.startsWith('gone')) {
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
  }
  res.end(JSON.stringify({ name: 'projects/sc/messages/1' }));
});
await new Promise((r) => google.listen(0, '127.0.0.1', r));
google.unref();
const base = `http://127.0.0.1:${google.address().port}`;
const account = { type: 'service_account', project_id: 'similar-test', client_email: 'push@similar-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `${base}/token` };

const h = startApi({ PUSH_ENABLED: '1', FCM_URL: base, FCM_SERVICE_ACCOUNT_B64: Buffer.from(JSON.stringify(account)).toString('base64') });
const { call, signUp } = h;
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
const fcmToken = (p = 'f') => `${p}${rnd(20)}:APA91b${rnd(40)}`;

describe('Firebase bildirimleri', () => {
  test('Firebase anahtarı kaydolur, takip bildirimi imzalı gider, tanınmayan silinir', async () => {
    const a = await signUp('Bildirim Alan');
    const b = await signUp('Takip Eden');
    assert.equal((await call('POST', '/api/push/register', { token: 'kısa', platform: 'android', kind: 'fcm' }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/push/register', { token: fcmToken(), platform: 'android', kind: 'baska' }, a.session))[0], 400);
    const live = fcmToken();
    const gone = fcmToken('gone');
    assert.equal((await call('POST', '/api/push/register', { token: live, platform: 'android', kind: 'fcm' }, a.session))[1].registered, true);
    await call('POST', '/api/push/register', { token: gone, platform: 'android', kind: 'fcm' }, a.session);

    await call('POST', '/api/follow', { to: a.user.id }, b.session);
    assert.ok(await until(() => sent.some((m) => m.message.token === live)), 'takip bildirimi Firebase’e gitti');
    const m = sent.find((x) => x.message.token === live);
    assert.equal(m.url, '/v1/projects/similar-test/messages:send');
    assert.equal(m.auth, 'Bearer ya29.test');
    assert.deepEqual([m.message.notification.title, m.message.data.type, m.message.data.from, m.message.android.notification.channel_id], ['Yeni takipçi', 'follow', b.user.id, 'default']);

    // The access token came from a JWT signed with the service account's key.
    const jwt = grants[0].get('assertion').split('.');
    assert.equal(grants[0].get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${jwt[0]}.${jwt[1]}`), publicKey, Buffer.from(jwt[2], 'base64url')), 'imza servis hesabının');
    const claims = JSON.parse(Buffer.from(jwt[1], 'base64url').toString());
    assert.deepEqual([claims.iss, claims.aud, claims.scope], [account.client_email, account.token_uri, 'https://www.googleapis.com/auth/firebase.messaging']);

    assert.ok(await until(async () => (await h.sql.query('SELECT 1 FROM push_tokens WHERE token = $1', [gone])).rowCount === 0), 'tanınmayan anahtar silindi');
    assert.equal((await h.sql.query('SELECT kind FROM push_tokens WHERE token = $1', [live])).rows[0].kind, 'fcm');
    await call('POST', '/api/push/unregister', { token: live }, a.session);
    assert.equal((await h.sql.query('SELECT 1 FROM push_tokens WHERE token = $1', [live])).rowCount, 0, 'çıkışta silinir');
  });

  test('arama "Aramalar" kanalında çalar, cevapsız arama normal kanalda', async () => {
    const { fcmMessage } = await import('../push.mjs');
    const ring = fcmMessage('t', { title: 'Ayşe', body: 'Sesli arıyor', data: { type: 'call', from: 'u1', call: 7, mode: 'voice' } });
    assert.deepEqual([ring.message.android.notification.channel_id, ring.message.android.ttl, ring.message.android.priority, ring.message.data.call], ['calls', '45s', 'HIGH', '7']);
    const missed = fcmMessage('t', { title: 'Ayşe', body: 'Cevapsız sesli arama', data: { type: 'call', call: 7, missed: true } });
    assert.equal(missed.message.android.notification.channel_id, 'default');
  });
});
