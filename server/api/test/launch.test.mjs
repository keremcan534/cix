// Launch features against a real Postgres (harness.mjs): health, phone sign-in, sessions, store purchases,
// gifts and rankings, push, LiveKit presence, uploads and account deletion with a phone.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { presign } from '../media.mjs';
import { rnd, startApi } from './harness.mjs';

// A stand-in for Expo's push service: records what it gets; tokens with "Gone" are unknown devices.
const pushed = [];
const pushMock = http.createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  const batch = JSON.parse(body);
  pushed.push(...batch);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ data: batch.map((m) => (m.to.includes('Gone') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: rnd(4) })) }));
});
await new Promise((r) => pushMock.listen(0, '127.0.0.1', r));
pushMock.unref();

const REVIEW_PHONE = '+905550000001';
const REVIEW_CODE = '246810';
const h = startApi({
  SMS_PROVIDER: 'log',
  OTP_REVIEW_PHONE: REVIEW_PHONE,
  OTP_REVIEW_CODE: REVIEW_CODE,
  PUSH_ENABLED: '1',
  PUSH_URL: `http://127.0.0.1:${pushMock.address().port}/push`,
  S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: 'https://cdn.example.com',
});
const { call, signUp } = h;

const phoneNo = () => `+90532${String(crypto.randomInt(0, 1e7)).padStart(7, '0')}`;
const codeFor = async (phone, from = 0) => (await h.waitLog(new RegExp(`^otp \\${phone} \\d{6}$`), from)).split(' ')[2];
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
/** Signs in with a phone through the SMS code (the "log" provider prints it). */
async function phoneSignIn(phone = phoneNo(), extra = {}) {
  const from = h.logs.length;
  assert.equal((await call('POST', '/api/auth/otp/start', { phone }))[0], 200);
  const [st, j] = await call('POST', '/api/auth/otp/verify', { phone, code: await codeFor(phone, from), ...extra });
  assert.equal(st, 200, j.error);
  return { ...j, phone };
}

describe('Sağlık', () => {
  test('veritabanı ve sürüm; güvenlik başlıkları', async () => {
    const r = await fetch(`${h.base}/api/health`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.deepEqual([j.ok, j.db, j.version], [true, true, 'dev']);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });
});

describe('Telefonla giriş', () => {
  test('kod gönderme, bekleme süresi, yanlış kod, doğru kod, tek kullanım', async () => {
    const phone = phoneNo();
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: '12' }))[0], 400);
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: '+14155550123' }))[0], 400, 'yurt dışı kapalı');
    const [st, j] = await call('POST', '/api/auth/otp/start', { phone: `0${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}` });
    assert.equal(st, 200, j.error);
    assert.equal(j.retryAfter, 60);
    const code = await codeFor(phone);
    assert.equal((await call('POST', '/api/auth/otp/start', { phone }))[0], 429, 'yeni kod için bekle');
    const wrong = String((Number(code) + 1) % 1e6).padStart(6, '0');
    assert.equal((await call('POST', '/api/auth/otp/verify', { phone, code: wrong }))[1].error, 'Kod yanlış');
    const [vs, v] = await call('POST', '/api/auth/otp/verify', { phone, code, name: 'Telefonlu' });
    assert.equal(vs, 200, v.error);
    assert.deepEqual([v.isNew, v.user.phone, v.user.name], [true, phone, 'Telefonlu']);
    assert.equal((await call('GET', '/api/me', null, v.session))[0], 200);
    assert.equal((await call('POST', '/api/auth/otp/verify', { phone, code }))[0], 400, 'kod bir kez kullanılır');
  });

  test('beş yanlış denemeden sonra doğru kod da kabul edilmez', async () => {
    const phone = phoneNo();
    await call('POST', '/api/auth/otp/start', { phone });
    const code = await codeFor(phone);
    const wrong = String((Number(code) + 7) % 1e6).padStart(6, '0');
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/auth/otp/verify', { phone, code: wrong }))[0], 400);
    assert.equal((await call('POST', '/api/auth/otp/verify', { phone, code }))[0], 429);
  });

  test('cihazdaki geliştirme hesabı telefonla aynı hesap olarak devam eder', async () => {
    const dev = await signUp('Eski Hesap');
    await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, dev.session);
    const p = await phoneSignIn(phoneNo(), { deviceKey: dev.deviceKey });
    assert.deepEqual([p.user.id, p.isNew, p.user.coins], [dev.user.id, false, 1000]);
  });

  test('inceleme hesabı SMS’siz girer; oturum listesi, oturum kapatma, çıkış', async () => {
    assert.equal((await call('POST', '/api/auth/otp/start', { phone: REVIEW_PHONE }))[0], 200);
    assert.equal((await call('POST', '/api/auth/otp/verify', { phone: REVIEW_PHONE, code: '000000' }))[0], 400);
    const [, r1] = await call('POST', '/api/auth/otp/verify', { phone: REVIEW_PHONE, code: REVIEW_CODE, device: 'iPhone 15' });
    const [, r2] = await call('POST', '/api/auth/otp/verify', { phone: REVIEW_PHONE, code: REVIEW_CODE, device: 'Pixel 8' });
    assert.equal(r1.isNew, true);
    assert.deepEqual([r2.isNew, r2.user.id], [false, r1.user.id]);

    const [, s] = await call('GET', '/api/sessions', null, r1.session);
    assert.equal(s.sessions.length, 2);
    const mine = s.sessions.find((x) => x.current);
    assert.equal(mine.device, 'iPhone 15');
    const other = s.sessions.find((x) => !x.current);
    assert.equal((await call('POST', '/api/sessions/revoke', { id: other.id }, r1.session))[1].revoked, true);
    assert.equal((await call('GET', '/api/me', null, r2.session))[0], 401, 'kapatılan oturum');
    assert.equal((await call('POST', '/api/auth/logout', {}, r1.session))[1].loggedOut, true);
    assert.equal((await call('GET', '/api/me', null, r1.session))[0], 401, 'çıkış');
  });
});

describe('Mağaza satın alımı', () => {
  test('ilk alım hediyesi bir kez, aynı makbuz tek kez, başka hesapta reddedilir, SVIP puanı', async () => {
    const a = await signUp('Alıcı');
    const b = await signUp('Diğer');
    const txn = `txn_${rnd(6)}`;
    const [st, j] = await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: txn }, a.session);
    assert.equal(st, 200, j.error);
    assert.deepEqual([j.replay, j.coins, j.bonus, j.user.coins, j.user.svipXp], [false, 1000, 1000, 2000, 1000]);
    const [, again] = await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: txn }, a.session);
    assert.deepEqual([again.replay, again.user.coins], [true, 2000]);
    assert.equal((await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: txn }, b.session))[0], 409);
    const [, second] = await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: `txn_${rnd(6)}` }, a.session);
    assert.deepEqual([second.bonus, second.user.coins, second.user.svipXp], [0, 3000, 2000]);
    assert.equal((await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_7', transactionId: `txn_${rnd(6)}` }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/wallet/purchase', { platform: 'android', productId: 'coins_1000', token: 'x'.repeat(40) }, a.session))[0], 503, 'Play ayarlı değil');
    assert.equal((await call('POST', '/api/wallet/purchase', { platform: 'ios', productId: 'coins_1000', transactionId: '2000000123' }, a.session))[0], 503, 'App Store ayarlı değil');
  });
});

describe('Hediyeler ve sıralama', () => {
  test('katalog herkese açık; fiyatı sunucu belirler; tekrar istek bir kez; SVIP sınırı; sıralamalar', async () => {
    const [cs, cat] = await call('GET', '/api/catalog');
    assert.equal(cs, 200);
    assert.ok(cat.gifts.length > 50 && cat.counts.includes(1314) && cat.packs[0].productId === 'coins_1000');

    const a = await signUp('Cömert');
    const b = await signUp('Yıldız');
    await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: `txn_${rnd(6)}` }, a.session);
    const ref = rnd(6);
    const [st, g] = await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g2', count: 10, ref }, a.session);
    assert.equal(st, 200, g.error);
    assert.deepEqual([g.total, g.user.coins, g.replay], [500, 1500, false]);
    const [, replay] = await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g2', count: 10, ref }, a.session);
    assert.deepEqual([replay.replay, replay.user.coins], [true, 1500]);
    assert.equal((await call('GET', '/api/me', null, b.session))[1].user.diamonds, 500);

    assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g2', count: 7, ref: rnd(6) }, a.session))[0], 400, 'adet listeden');
    assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'yok', count: 1, ref: rnd(6) }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/gifts/send', { to: a.user.id, giftId: 'g1', count: 1, ref: rnd(6) }, a.session))[0], 400, 'kendine');
    assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g2', count: 1314, ref: rnd(6) }, a.session))[0], 409, 'bakiye yetmez');
    assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'v2', count: 1, ref: rnd(6) }, a.session))[0], 403, 'SVIP2 hediyesi');
    await h.sql.query('UPDATE users SET svip_xp = 1250000 WHERE id = $1', [a.user.id]);
    assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'v2', count: 1, room: 'oda-r1', ref: rnd(6) }, a.session))[0], 200, 'SVIP2 olunca');

    const [, wealth] = await call('GET', '/api/rankings?board=wealth&period=day', null, b.session);
    assert.deepEqual([wealth.rows[0].user.id, wealth.rows[0].score, wealth.rows[0].rank], [a.user.id, 850, 1]);
    const [, charm] = await call('GET', '/api/rankings?board=charm&period=month', null, a.session);
    assert.deepEqual([charm.rows[0].user.id, charm.rows[0].score], [b.user.id, 850]);
    assert.equal((await call('GET', '/api/rankings?board=x', null, a.session))[0], 400);
    const [, led] = await call('GET', '/api/ledger', null, a.session);
    assert.ok(led.rows.some((r) => r.reason === 'Hediye gönderildi: Kalp ×10' && r.amount === -500));
  });
});

describe('Bildirimler', () => {
  test('mesaj ve takip bildirim gönderir; tanınmayan cihaz silinir; mesaj sınırı', async () => {
    const a = await signUp('Bildirimli');
    const b = await signUp('Gönderen');
    assert.equal((await call('POST', '/api/push/register', { token: 'abc', platform: 'ios' }, a.session))[0], 400);
    const live = `ExponentPushToken[${rnd(10)}]`;
    const gone = `ExponentPushToken[Gone${rnd(8)}]`;
    assert.equal((await call('POST', '/api/push/register', { token: live, platform: 'ios' }, a.session))[1].registered, true);
    await call('POST', '/api/push/register', { token: gone, platform: 'android' }, a.session);

    await call('POST', '/api/messages', { to: a.user.id, text: 'Akşam odada mısın?', ref: rnd(6) }, b.session);
    assert.ok(await until(() => pushed.some((m) => m.to === live && m.body === 'Akşam odada mısın?')), 'mesaj bildirimi');
    const msg = pushed.find((m) => m.to === live);
    assert.deepEqual([msg.title, msg.data.type, msg.data.from], ['Gönderen', 'message', b.user.id]);
    assert.ok(await until(async () => (await h.sql.query('SELECT 1 FROM push_tokens WHERE token = $1', [gone])).rowCount === 0), 'kayıtsız cihaz silindi');

    await call('POST', '/api/follow', { to: a.user.id }, b.session);
    assert.ok(await until(() => pushed.some((m) => m.to === live && m.title === 'Yeni takipçi')), 'takip bildirimi');

    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call('POST', '/api/messages', { to: a.user.id, text: `m${i}`, ref: rnd(6) }, b.session))[0];
    assert.equal(last, 429, 'dakikada en fazla 30 mesaj');
  });
});

describe('Ses odası katılımı (LiveKit webhook)', () => {
  const sign = (body, secret = 'testsecret') => {
    const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
    return `${hp}.${crypto.createHmac('sha256', secret).update(hp).digest('base64url')}`;
  };
  const hook = (event, extra = {}, auth) => {
    const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
    return call('POST', '/api/livekit/webhook', body, null, { authorization: auth ?? sign(body), 'content-type': 'application/webhook+json' });
  };

  test('imzasız istek reddedilir; katılan sayılır, eski bağlantının ayrılması yenisini silmez', async () => {
    const owner = await signUp('Oda Sahibi');
    const [, j] = await call('POST', '/api/rooms', { title: 'Akşam Sohbeti' }, owner.session);
    const lk = `oda-${j.room.id}`;
    const who = { identity: owner.user.id, sid: 'PA_new' };
    assert.equal((await hook('participant_joined', { room: { name: lk }, participant: who }, sign('{}')))[0], 401, 'gövde imzayla uyuşmuyor');
    assert.equal((await hook('participant_joined', { room: { name: lk }, participant: who }, sign('x', 'baskasi')))[0], 401, 'yanlış anahtar');
    assert.equal((await hook('participant_joined', { room: { name: lk }, participant: who }))[0], 200);
    await hook('participant_joined', { room: { name: 'oda-r1' }, participant: { identity: 'misafir', sid: 'PA_x' } });

    let [, live] = await call('GET', '/api/rooms/live', null, owner.session);
    assert.ok(live.rooms.some((r) => r.room === lk && r.listeners === 1));
    const listed = (await call('GET', '/api/rooms', null, owner.session))[1].rooms.find((r) => r.id === j.room.id);
    assert.equal(listed.listeners, 1);

    await hook('participant_left', { room: { name: lk }, participant: { identity: owner.user.id, sid: 'PA_old' } });
    [, live] = await call('GET', '/api/rooms/live', null, owner.session);
    assert.ok(live.rooms.some((r) => r.room === lk), 'eski bağlantı yenisini silmez');
    await hook('participant_left', { room: { name: lk }, participant: who });
    await hook('room_finished', { room: { name: 'oda-r1' } });
    [, live] = await call('GET', '/api/rooms/live', null, owner.session);
    assert.ok(!live.rooms.some((r) => r.room === lk || r.room === 'oda-r1'));
  });
});

describe('Fotoğraf yükleme', () => {
  test('imza AWS’nin örneğiyle aynı', () => {
    const u = presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      region: 'us-east-1',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expires: 86400,
      now: new Date('2013-05-24T00:00:00Z'),
    });
    assert.ok(u.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
  });

  test('yükleme adresi tür ve boyutla imzalanır; geçersiz tür ve boyut reddedilir', async () => {
    const a = await signUp('Fotoğraflı');
    const [st, j] = await call('POST', '/api/media/upload-url', { kind: 'avatar', contentType: 'image/jpeg', size: 200_000 }, a.session);
    assert.equal(st, 200, j.error);
    assert.ok(j.uploadUrl.startsWith(`https://acc.r2.cloudflarestorage.com/media/avatar/${a.user.id}/`));
    assert.ok(j.uploadUrl.includes('X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost'));
    assert.deepEqual(j.headers, { 'content-type': 'image/jpeg', 'content-length': '200000' });
    assert.ok(j.publicUrl.startsWith(`https://cdn.example.com/avatar/${a.user.id}/`) && j.publicUrl.endsWith('.jpg'));
    assert.equal((await call('PATCH', '/api/me', { avatarUrl: j.publicUrl }, a.session))[1].user.avatarUrl, j.publicUrl);
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'avatar', contentType: 'video/mp4', size: 1000 }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'avatar', contentType: 'image/png', size: 6 * 1024 * 1024 }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'moment', contentType: 'video/mp4', size: 20 * 1024 * 1024 }, a.session))[0], 200);
  });
});

describe('Telefonlu hesabı silme', () => {
  test('numara ve bildirim anahtarı silinir; aynı numara yeni ve boş hesap açar', async () => {
    const p = await phoneSignIn();
    await call('POST', '/api/push/register', { token: `ExponentPushToken[${rnd(10)}]`, platform: 'android' }, p.session);
    assert.equal((await call('DELETE', '/api/me', null, p.session))[1].deleted, true);
    const row = (await h.sql.query('SELECT phone FROM users WHERE id = $1', [p.user.id])).rows[0];
    assert.equal(row.phone, null);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM push_tokens WHERE user_id = $1', [p.user.id])).rows[0].n, 0);
    const again = await phoneSignIn(p.phone);
    assert.deepEqual([again.isNew, again.user.coins], [true, 0]);
    assert.notEqual(again.user.id, p.user.id);
  });
});
