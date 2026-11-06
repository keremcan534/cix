// Adding a verified phone number to the signed-in account (auth.mjs /api/me/phone/*, whatsapp.mjs): by SMS code,
// or for free by a WhatsApp message to our number, which Meta's signed webhook reports. E-mail sign-in is not
// configured here, so its routes answer 503.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { rnd, startApi } from './harness.mjs';

const SECRET = 'meta-app-secret';
const VERIFY_TOKEN = 'kurulum-icin-uzun-bir-soz';
const h = startApi({
  SMS_PROVIDER: 'log',
  WHATSAPP_NUMBER: '+44 7700 900123',
  WHATSAPP_APP_SECRET: SECRET,
  WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
  MAIL_PROVIDERS: undefined,
  AGENCY_JOBS: '0',
  OTP_SWEEP_MS: '500',
});
const { call } = h;

const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, msg = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const phoneNo = () => `+90532${String(crypto.randomInt(0, 1e7)).padStart(7, '0')}`;
const smsCode = async (phone, from) => (await h.waitLog(new RegExp(`^otp \\${phone} \\d{6}$`), from)).split(' ')[2];
/** The challenge of the latest code asked for each number (start answers it; verify sends it back). */
const challenges = new Map();
const startPhone = async (phone, who) => {
  const [st, j] = await call('POST', '/api/me/phone/start', { phone }, who.session);
  if (st === 200) challenges.set(phone.replace(/\D/g, '').slice(-10), j.challenge);
  return [st, j];
};
const checkPhone = (phone, code, who, challenge = challenges.get(phone.replace(/\D/g, '').slice(-10))) => call('POST', '/api/me/phone/verify', { phone, code, challenge }, who.session);
/** Makes `who`'s session older than the 10 minutes a replacement needs. */
const age = (who) => q("UPDATE sessions SET created_at = now() - interval '11 minutes' WHERE token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')", [who.session]);

/** A WhatsApp claim for `who`: the wa.me link's nonce. */
async function claim(who) {
  const j = await ok(call('POST', '/api/me/phone/whatsapp', null, who.session));
  return { ...j, nonce: /SC-([A-Z2-9]{6})$/.exec(new URL(j.link).searchParams.get('text'))[1] };
}
/** Meta's webhook call: messages to our number, signed with the app secret unless `sig` is given. */
function webhook(messages, sig) {
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '1234', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '447700900123' }, messages } }] }],
  });
  return post(raw, sig);
}
const post = (raw, sig = `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`) => call('POST', '/api/webhooks/whatsapp', raw, null, sig ? { 'x-hub-signature-256': sig } : {});
const text = (from, body) => ({ from, id: `wamid.${rnd(8)}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } });
const status = async (who) => ok(call('GET', '/api/me/phone/status', null, who.session));

describe('telefon doğrulama', () => {
  test('e-posta kapalı: e-posta yolları 503 (feature email); /api/config doğrulama yollarını söyler', async () => {
    const u = await h.account();
    for (const [p, body, s] of [
      ['/api/auth/email/start', { email: 'ali@example.com' }],
      ['/api/auth/email/verify', { email: 'ali@example.com', code: '123456' }],
      ['/api/me/email/start', { email: 'ali@example.com' }, u.session],
      ['/api/me/email/verify', { email: 'ali@example.com', code: '123456' }, u.session],
    ]) {
      const [st, j] = await call('POST', p, body, s);
      assert.equal(st, 503, p);
      assert.deepEqual(j, { error: 'E-posta ile giriş henüz açık değil', feature: 'email' });
    }
    const cfg = await ok(call('GET', '/api/config'));
    assert.deepEqual(cfg.signIn, { dev: true, google: false, email: false, phone: false });
    assert.deepEqual(cfg.verify, { sms: true, whatsapp: true });
  });

  test('SMS kodu: numara hesaba yazılır, ajans yayıncısı doğrulanmış görünür, denetim kaydı; başka hesabın numarası 409', async () => {
    const [admin, owner, streamer] = [await h.account('Merkez', 'admin'), await h.account('Ajans Sahibi'), await h.account('Yayıncı')];
    const agency = (await ok(call('POST', '/api/admin/agency/create', { name: 'Doğrulama Ajans', owner: owner.user.id }, admin.session))).agency;
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [streamer.user.id, agency.id]);
    const verified = async () => (await ok(call('GET', `/api/agency/streamers?id=${agency.id}`, null, owner.session))).streamers.find((s) => s.id === streamer.user.id).verified;
    assert.equal(await verified(), false);

    const start = (phone, who = streamer) => startPhone(phone, who);
    const check = (phone, code, who = streamer) => checkPhone(phone, code, who);
    assert.equal((await call('POST', '/api/me/phone/start', { phone: phoneNo() }))[0], 401);
    assert.equal((await start('12'))[0], 400);
    const [cst, cj] = await start('+447700900456');
    assert.equal(cst, 400);
    assert.equal(cj.error, 'Bu ülkenin numaraları henüz doğrulanamıyor');

    const phone = phoneNo();
    let from = h.logs.length;
    const started = await ok(start(`0${phone.slice(3, 6)} ${phone.slice(6)}`));
    assert.deepEqual([started.sent, started.retryAfter], [true, 60]);
    assert.match(started.challenge, /^[A-Za-z0-9_-]{22}$/);
    const code = await smsCode(phone, from);
    const [wst, wj] = await check(phone, String((Number(code) + 1) % 1e6).padStart(6, '0'));
    assert.equal(wst, 400);
    assert.equal(wj.error, 'Kod yanlış');
    const j = await ok(check(phone, code));
    assert.equal(j.user.phone, phone);
    assert.equal(j.user.phoneVerified, true);
    assert.equal((await ok(call('GET', '/api/me', null, streamer.session))).user.phoneVerified, true);
    assert.equal(await verified(), true);
    const [again, aj] = await start(phone);
    assert.equal(again, 400);
    assert.equal(aj.error, 'Bu numara zaten doğrulanmış');

    // Another account gets a code (the start says nothing) but cannot take the number.
    const other = await h.account('Öteki');
    from = h.logs.length;
    await ok(start(phone, other));
    const [tst, tj] = await check(phone, await smsCode(phone, from), other);
    assert.equal(tst, 409);
    assert.equal(tj.error, 'Bu numara başka bir hesaba bağlı');

    // A new number replaces the old one.
    const second = phoneNo();
    from = h.logs.length;
    await ok(start(second));
    assert.equal((await ok(check(second, await smsCode(second, from)))).user.phone, second);

    const rows = await q("SELECT detail FROM audit_events WHERE actor = $1 AND action = 'phone_verified' ORDER BY id", [streamer.user.id]);
    assert.deepEqual(rows.map((r) => r.detail), [{ via: 'sms', changed: false }, { via: 'sms', changed: true }]);
  });

  test('WhatsApp: Meta el sıkışması yalnızca doğru sözle', async () => {
    const hs = (params) => fetch(`${h.base}/api/webhooks/whatsapp?${new URLSearchParams(params)}`);
    const r = await hs({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1158201444' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/plain/);
    assert.equal(await r.text(), '1158201444');
    for (const bad of [
      { 'hub.mode': 'subscribe', 'hub.verify_token': 'yanlis', 'hub.challenge': '1' },
      { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '1' },
      { 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '<script>' },
      { 'hub.mode': 'subscribe', 'hub.challenge': '1' },
    ]) assert.equal((await hs(bad)).status, 403, JSON.stringify(bad));
  });

  test('WhatsApp: imzalı mesaj numarayı doğrular; imzasız 401; aynı mesaj ikinci kez bir şey değiştirmez', async () => {
    const u = await h.account('WhatsApp Kişi');
    assert.equal((await call('POST', '/api/me/phone/whatsapp'))[0], 401);
    assert.deepEqual(await status(u), { phone: null, pending: false, result: null });
    const c = await claim(u);
    assert.equal(c.expiresIn, 600);
    assert.equal(c.link, `https://wa.me/447700900123?text=${encodeURIComponent(`Similar Club numaramı doğrula: SC-${c.nonce}`)}`);
    const [row] = await q('SELECT nonce_hash, result FROM phone_claims WHERE user_id = $1', [u.user.id]);
    assert.ok(!row.nonce_hash.includes(c.nonce));
    assert.deepEqual(await status(u), { phone: null, pending: true, result: null });

    const msg = [text('905321234567', `Similar Club numaramı doğrula: SC-${c.nonce}`)];
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: msg } }] }] });
    assert.equal((await post(raw, null))[0], 401, 'imza yok');
    assert.equal((await post(raw, `sha256=${'0'.repeat(64)}`))[0], 401, 'yanlış imza');
    assert.equal((await post(raw, `sha256=${crypto.createHmac('sha256', 'baska-sir').update(raw).digest('hex')}`))[0], 401, 'başka sır');
    assert.deepEqual(await status(u), { phone: null, pending: true, result: null });

    // Not a text, or not our nonce: nothing happens, and Meta still gets 200.
    assert.deepEqual(await ok(webhook([{ from: '905321234567', type: 'image', image: { id: '1' } }, text('905321234567', 'SC-ZZZZZZ merhaba')])), { received: true });
    assert.deepEqual(await ok(post('{bozuk')), { received: true });
    assert.deepEqual(await ok(post(JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [{ id: 'x' }] } }] }] }))), { received: true });
    assert.equal((await status(u)).pending, true);

    assert.deepEqual(await ok(webhook(msg)), { received: true });
    assert.deepEqual(await status(u), { phone: '+905321234567', pending: false, result: 'verified' });
    const me = (await ok(call('GET', '/api/me', null, u.session))).user;
    assert.equal(me.phone, '+905321234567');
    assert.equal(me.phoneVerified, true);
    const [done] = await q('SELECT result, done_at FROM phone_claims WHERE user_id = $1', [u.user.id]);
    assert.equal(done.result, 'verified');
    assert.ok(done.done_at);
    const audit = await q("SELECT detail FROM audit_events WHERE actor = $1 AND action = 'phone_verified'", [u.user.id]);
    assert.deepEqual(audit.map((r) => r.detail), [{ via: 'whatsapp', changed: false }]);

    // Meta delivers again: still one result, nothing else changes.
    assert.deepEqual(await ok(webhook(msg)), { received: true });
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE actor = $1 AND action = 'phone_verified'", [u.user.id]))[0].n, 1);
    // The nonce works in lower case too (some keyboards change it).
    const c2 = await claim(u);
    await ok(webhook([text('905321234568', `similar club numaramı doğrula: sc-${c2.nonce.toLowerCase()}`)]));
    assert.deepEqual(await status(u), { phone: '+905321234568', pending: false, result: 'verified' });
  });

  test('WhatsApp: başka hesabın numarası taken, yabancı numara country, numarasız no_number, süresi dolan expired; saatte 5', async () => {
    const owner = await h.account('Numara Sahibi');
    const taken = phoneNo();
    await q('UPDATE users SET phone = $2 WHERE id = $1', [owner.user.id, taken]);
    const u = await h.account('Deneyen');
    const say = (from, nonce) => ok(webhook([text(from, `Similar Club numaramı doğrula: SC-${nonce}`)]));

    await say(taken.slice(1), (await claim(u)).nonce);
    assert.deepEqual(await status(u), { phone: null, pending: false, result: 'taken' });
    // The same number with the trunk 0 after the country code is the same number.
    await say(`900${taken.slice(3)}`, (await claim(u)).nonce);
    assert.deepEqual(await status(u), { phone: null, pending: false, result: 'taken' });
    await say('447700900999', (await claim(u)).nonce);
    assert.deepEqual(await status(u), { phone: null, pending: false, result: 'country' });
    await say('', (await claim(u)).nonce);
    assert.deepEqual(await status(u), { phone: null, pending: false, result: 'no_number' });
    const late = await claim(u);
    await q("UPDATE phone_claims SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND result IS NULL", [u.user.id]);
    await say('905321230000', late.nonce);
    assert.deepEqual(await status(u), { phone: null, pending: false, result: 'expired' });
    assert.equal((await q('SELECT phone FROM users WHERE id = $1', [u.user.id]))[0].phone, null);
    // A claim never keeps the number it came from (only the account does, once verified).
    assert.equal((await q("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'phone_claims' AND column_name = 'phone'"))[0].n, 0);

    const [st, j] = await call('POST', '/api/me/phone/whatsapp', null, u.session);
    assert.equal(st, 429);
    assert.equal(j.error, 'Çok fazla deneme, bir saat sonra tekrar dene');
  });

  test('telefonla giriş kapalı (PHONE_SIGN_IN yok): SMS açıkken de /api/auth/otp/* 503; doğrulanmış numara giriş yolu olmaz', async () => {
    const u = await h.account('Rozetli');
    const phone = phoneNo();
    await q('UPDATE users SET phone = $2 WHERE id = $1', [u.user.id, phone]);
    for (const [p, body] of [
      ['/api/auth/otp/start', { phone }],
      ['/api/auth/otp/verify', { phone, code: '123456', challenge: 'A'.repeat(22) }],
    ]) {
      const [st, j] = await call('POST', p, body);
      assert.equal(st, 503, p);
      assert.deepEqual(j, { error: 'Telefonla giriş henüz açık değil', feature: 'phone' });
    }
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_codes WHERE channel = 'sms' AND target = $1", [phone]))[0].n, 0, 'SMS gitmedi');
  });

  test('numara değiştirmek yakın zamanda giriş ister (SMS ve WhatsApp); ilk numara için gerekmez', async () => {
    const u = await h.account('Değiştiren');
    const first = phoneNo();
    // The first number: an older session may add it.
    await age(u);
    let from = h.logs.length;
    await ok(startPhone(first, u));
    await ok(checkPhone(first, await smsCode(first, from), u));

    // Replacing it: start, verify (even with a code asked for while the session was fresh) and a WhatsApp claim.
    const second = phoneNo();
    const [st, j] = await startPhone(second, u);
    assert.equal(st, 403);
    assert.equal(j.code, 'reauth_required');
    await q('UPDATE sessions SET created_at = now() WHERE user_id = $1', [u.user.id]);
    from = h.logs.length;
    await ok(startPhone(second, u));
    const code = await smsCode(second, from);
    await age(u);
    assert.equal((await checkPhone(second, code, u))[1].code, 'reauth_required');
    const [wst, wj] = await call('POST', '/api/me/phone/whatsapp', null, u.session);
    assert.equal(wst, 403);
    assert.equal(wj.code, 'reauth_required');
    assert.equal((await q('SELECT phone FROM users WHERE id = $1', [u.user.id]))[0].phone, first);
    // Signed in again: the code still works.
    await q('UPDATE sessions SET created_at = now() WHERE user_id = $1', [u.user.id]);
    assert.equal((await ok(checkPhone(second, code, u))).user.phone, second);
  });

  test('"+90 0532…" ve "0090…" aynı numaradır: başka hesabın numarası 409', async () => {
    const owner = await h.account('Sahip');
    const taken = phoneNo();
    await q('UPDATE users SET phone = $2 WHERE id = $1', [owner.user.id, taken]);
    const u = await h.account('İkinci');
    const from = h.logs.length;
    await ok(startPhone(`+90 0${taken.slice(3, 6)} ${taken.slice(6)}`, u));
    const code = await smsCode(taken, from);
    const [st, j] = await checkPhone(`0090 ${taken.slice(3)}`, code, u);
    assert.equal(st, 409);
    assert.equal(j.error, 'Bu numara başka bir hesaba bağlı');
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE phone LIKE '+900%'"))[0].n, 0);
  });

  test('ASCII dışı imza ya da doğrulama sözü 500 değil, 401 / 403', async () => {
    const raw = JSON.stringify({ entry: [] });
    for (const sig of [`sha256=${'é'.repeat(64)}`, `sha256=${'é'}${'0'.repeat(63)}`, 'é']) assert.equal((await post(raw, sig))[0], 401, sig);
    const r = await fetch(`${h.base}/api/webhooks/whatsapp?${new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': `é${VERIFY_TOKEN.slice(1)}`, 'hub.challenge': '1' })}`);
    assert.equal(r.status, 403);
  });

  test('eski kod kayıtları süpürülür: gönderimler (SMS ve e-posta), WhatsApp denemeleri, süresi dolan kodlar, yanlış kod sayıları', async () => {
    const u = await h.account('Süpürülen');
    const old = "now() - interval '2 days'";
    await q(`INSERT INTO otp_sends (channel, target, ip, sent_at) VALUES ('sms', '+905320000001', '1.1.1.1', ${old}), ('email', 'eskihash', '1.1.1.1', ${old}), ('email', 'yenihash', '1.1.1.1', now())`);
    await q(`INSERT INTO phone_claims (nonce_hash, user_id, expires_at, created_at) VALUES ('eski-${rnd(4)}', $1, ${old}, ${old}), ('yeni-${rnd(4)}', $1, now() + interval '10 minutes', now())`, [u.user.id]);
    await q(`INSERT INTO otp_codes (challenge_hash, channel, target, code_hash, expires_at, sent_at) VALUES ('eski-${rnd(4)}', 'email', 'eski@example.com', 'x', now() - interval '1 hour', ${old})`);
    await q(`INSERT INTO otp_failures (key, fails, window_start) VALUES ('eski-${rnd(4)}', 3, ${old}), ('kilitli-${rnd(4)}', 0, ${old})`);
    await q("UPDATE otp_failures SET locked_until = now() + interval '1 hour' WHERE key LIKE 'kilitli-%'");
    const counts = async () =>
      (
        await q(`SELECT (SELECT count(*)::int FROM otp_sends WHERE sent_at < now() - interval '1 day') AS sends,
                        (SELECT count(*)::int FROM phone_claims WHERE created_at < now() - interval '1 day') AS claims,
                        (SELECT count(*)::int FROM otp_codes WHERE target = 'eski@example.com') AS codes,
                        (SELECT count(*)::int FROM otp_failures WHERE key LIKE 'eski-%') AS fails`)
      )[0];
    const end = Date.now() + 5000;
    while (Date.now() < end && Object.values(await counts()).some(Boolean)) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(await counts(), { sends: 0, claims: 0, codes: 0, fails: 0 });
    // Fresh rows, and a lock that is still on, stay.
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_sends WHERE target = 'yenihash'"))[0].n, 1);
    assert.equal((await q("SELECT count(*)::int AS n FROM phone_claims WHERE nonce_hash LIKE 'yeni-%'"))[0].n, 1);
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_failures WHERE key LIKE 'kilitli-%'"))[0].n, 1);
  });

  test('hesap silinince WhatsApp denemeleri de gider', async () => {
    const u = await h.account('Silinen');
    await claim(u);
    await ok(call('DELETE', '/api/me', null, u.session));
    assert.equal((await q('SELECT count(*)::int AS n FROM phone_claims WHERE user_id = $1', [u.user.id]))[0].n, 0);
  });
});
