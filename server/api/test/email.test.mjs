// E-mail code sign-in (auth.mjs, mail.mjs) against a real Postgres (harness.mjs). The "log" provider prints the
// code; a small DNS server on 127.0.0.1 (EMAIL_DNS_SERVER) answers the MX look-ups.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';

import { rnd, startApi } from './harness.mjs';

// --- A DNS server for MX look-ups: every domain has a mail server except these. ------------------------------
const SPECIAL = { 'postasiz.com.tr': 'nodata', 'boyle-bir-yer-yok.com': 'nxdomain', 'nullmx.com': 'nullmx', 'dns-bozuk.com': 'servfail' };
const queries = [];
const nameOf = (s) => Buffer.concat([...s.split('.').map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
const dns = dgram.createSocket('udp4');
dns.on('message', (msg, from) => {
  let i = 12;
  const labels = [];
  while (msg[i]) {
    labels.push(msg.subarray(i + 1, i + 1 + msg[i]).toString());
    i += msg[i] + 1;
  }
  const qtype = msg.readUInt16BE(i + 1);
  const name = labels.join('.').toLowerCase();
  queries.push(name);
  const kind = SPECIAL[name] ?? 'mx';
  const answers = [];
  if (qtype === 15 && (kind === 'mx' || kind === 'nullmx')) {
    const rdata = Buffer.concat([Buffer.from([0, kind === 'mx' ? 10 : 0]), kind === 'mx' ? nameOf(`mx.${name}`) : Buffer.from([0])]);
    const rr = Buffer.alloc(12);
    rr.writeUInt16BE(0xc00c, 0); // the question's name
    rr.writeUInt16BE(15, 2); // MX
    rr.writeUInt16BE(1, 4); // IN
    rr.writeUInt32BE(60, 6);
    rr.writeUInt16BE(rdata.length, 10);
    answers.push(Buffer.concat([rr, rdata]));
  }
  const head = Buffer.alloc(12);
  msg.copy(head, 0, 0, 2);
  head.writeUInt16BE(0x8180 | ({ nxdomain: 3, servfail: 2 }[kind] ?? 0), 2); // a response, recursion; NXDOMAIN / SERVFAIL
  head.writeUInt16BE(1, 4);
  head.writeUInt16BE(answers.length, 6);
  dns.send(Buffer.concat([head, msg.subarray(12, i + 5), ...answers]), from.port, from.address);
});
await new Promise((r) => dns.bind(0, '127.0.0.1', r));
dns.unref();

const REVIEW_EMAIL = 'inceleme@example.com';
const REVIEW_CODE = '135790';
const h = startApi({
  MAIL_PROVIDERS: 'log',
  OTP_REVIEW_EMAIL: ' Inceleme@Example.com ',
  OTP_REVIEW_EMAIL_CODE: REVIEW_CODE,
  OTP_REVIEW_MAX_TRIES: '3',
  ONE_ACCOUNT_PER_DEVICE: '1',
  OTP_IP_PER_HOUR: '1000',
  EMAIL_IP_PER_HOUR: '1000',
  EMAIL_GLOBAL_PER_HOUR: '1000',
  OTP_FAILS_PER_IP_DAY: '7',
  OTP_FAILS_PER_DAY: '12',
  EMAIL_DNS_SERVER: `127.0.0.1:${dns.address().port}`,
});
const { call } = h;

const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, msg = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const address = (who = 'kisi') => `${who}.${rnd(3)}@example.com`;
/** A phone as the app describes it (sanctions.mjs deviceSignals). */
const phone = (hardwareId = rnd(8)) => ({ installId: rnd(20), hardwareId, platform: 'android', model: 'Pixel 9', os: 'Android 15', app: '1.0.0' });
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const start = (email, headers) => call('POST', '/api/auth/email/start', { email }, null, headers);
/** The challenge of the latest code asked for each address (start answers it; verify sends it back). */
const challenges = new Map();
const keyOf = (email) => String(email).trim().toLowerCase();
const challengeOf = (email) => challenges.get(keyOf(email));
const verify = (email, code, extra = {}, headers) => call('POST', '/api/auth/email/verify', { email, code, challenge: challengeOf(email), device: 'Pixel 9', ...extra }, null, headers);
const isStarted = (j) => {
  assert.deepEqual(Object.keys(j).sort(), ['challenge', 'retryAfter', 'sent']);
  assert.deepEqual([j.sent, j.retryAfter], [true, 60]);
  assert.match(j.challenge, /^[A-Za-z0-9_-]{22}$/);
};

/** Asks for a code with `ask` and reads it from the API log ("otp-email <address> <code>"). */
async function codeFor(email, ask = () => start(email)) {
  const from = h.logs.length;
  const j = await ok(ask(), `kod ${email}`);
  isStarted(j);
  challenges.set(keyOf(email), j.challenge);
  return (await h.waitLog(new RegExp(`^otp-email ${escape(email)} \\d{6}$`), from)).split(' ')[2];
}
/** Signs in by e-mail code; `extra` adds deviceInfo / deviceKey. */
async function emailSignIn(email, extra = { deviceInfo: phone() }) {
  return verify(email, await codeFor(email), extra);
}
/** Lets the next code for `email` go out now (the 60-second wait is over). */
const later = (email) => q("UPDATE otp_codes SET sent_at = now() - interval '61 seconds' WHERE channel = 'email' AND target = $1", [email]);
const wrong = (code) => String((Number(code) + 1) % 1e6).padStart(6, '0');

describe('E-posta ile giriş', () => {
  test('adres: büyük harf ve boşluk aynı hesap; bozuk, geçici ya da posta almayan adres 400', async () => {
    for (const bad of ['', 'ali', 'ali@', '@example.com', 'a..b@example.com', '.ali@example.com', 'ali@example', 'ali@example.123', 'ali veli@example.com', 'a@b@example.com', `${'a'.repeat(65)}@example.com`, 42, null]) {
      const [st, j] = await start(bad);
      assert.equal(st, 400, JSON.stringify(bad));
      assert.equal(j.error, 'Geçerli bir e-posta adresi yaz');
    }
    for (const throwaway of ['ali@mailinator.com', 'ali@Abc.YopMail.com', 'ali@sharklasers.com']) {
      const [st, j] = await start(throwaway);
      assert.equal(st, 400, throwaway);
      assert.match(j.error, /Geçici e-posta/);
    }
    for (const dead of ['ali@postasiz.com.tr', 'ali@boyle-bir-yer-yok.com', 'ali@nullmx.com']) {
      const [st, j] = await start(dead);
      assert.equal(st, 400, dead);
      assert.equal(j.error, 'Bu adrese e-posta gitmiyor, adresi kontrol et');
    }
    // A domain without a mail server is remembered (10 minutes); a DNS failure lets the code go out.
    const asked = queries.filter((x) => x === 'postasiz.com.tr').length;
    assert.equal((await start('veli@postasiz.com.tr'))[0], 400);
    assert.equal(queries.filter((x) => x === 'postasiz.com.tr').length, asked);
    assert.equal((await start('ali@dns-bozuk.com'))[0], 200);
    // A Turkish domain is kept (and looked up) in its ASCII form.
    await codeFor('ali@xn--iek-1lab.com.tr', () => start('Ali@Çiçek.com.tr'));
    assert.equal(queries.at(-1), 'xn--iek-1lab.com.tr');

    const email = `ayse.kaya+test.${rnd(2)}@example.com`;
    const device = phone();
    const first = await ok(emailSignIn(email, { deviceInfo: device }));
    assert.equal(first.isNew, true);
    assert.equal(first.user.name, 'Yeni üye');
    assert.equal(first.user.email, email);
    assert.deepEqual(first.user.identities, ['email']);
    assert.equal(first.user.phoneVerified, false);
    const typed = `  ${email.toUpperCase()} `;
    const code = await codeFor(email, () => start(typed));
    const again = await ok(verify(typed, code, { deviceInfo: device }));
    assert.equal(again.isNew, false);
    assert.equal(again.user.id, first.user.id);

    const me = await ok(call('GET', '/api/me', null, again.session));
    assert.equal(me.user.email, email);
    assert.deepEqual(me.user.identities, ['email']);
    assert.equal(me.user.phoneVerified, false);
    const patched = await ok(call('PATCH', '/api/me', { name: 'Ayşe' }, again.session));
    assert.equal(patched.user.email, email);
    assert.equal(patched.user.name, 'Ayşe');
  });

  test('kod: 60 saniye bekleme, yanlış kod, 5 deneme, tek kullanım, süre, saatte 5 kod; adres saklanmaz', async () => {
    const email = address('kod');
    const code = await codeFor(email);
    const [st, j] = await start(email);
    assert.equal(st, 429);
    assert.match(j.error, /^Yeni kod için \d+ saniye bekle$/);
    const [row] = await q("SELECT code_hash, round(extract(epoch FROM expires_at - sent_at)) AS secs FROM otp_codes WHERE channel = 'email' AND target = $1", [email]);
    assert.equal(Number(row.secs), 600, 'EMAIL_CODE_MINUTES varsayılanı 10');
    assert.ok(!row.code_hash.includes(code));

    for (let i = 0; i < 5; i++) {
      const [st2, j2] = await verify(email, wrong(code), { deviceInfo: phone() });
      assert.equal(st2, 400, `yanlış ${i + 1}`);
      assert.equal(j2.error, 'Kod yanlış');
    }
    const [st3, j3] = await verify(email, code, { deviceInfo: phone() });
    assert.equal(st3, 429, 'beş yanlıştan sonra doğru kod da geçmez');
    assert.match(j3.error, /yeni kod iste/);

    await later(email);
    const code2 = await codeFor(email);
    const device = phone();
    await ok(verify(email, code2, { deviceInfo: device }));
    const [st4, j4] = await verify(email, code2, { deviceInfo: device });
    assert.equal(st4, 400, 'tek kullanım');
    assert.equal(j4.error, 'Kodun süresi doldu, yeni kod iste');

    const code3 = await codeFor(email);
    await q("UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE channel = 'email' AND target = $1", [email]);
    assert.equal((await verify(email, code3, { deviceInfo: device }))[0], 400, 'süresi dolmuş kod');

    const busy = address('sik');
    for (let i = 0; i < 5; i++) {
      await codeFor(busy);
      await later(busy);
    }
    const [st5, j5] = await start(busy);
    assert.equal(st5, 429);
    assert.equal(j5.error, 'Bu adrese çok fazla kod gönderildi, bir saat sonra tekrar dene');

    // otp_sends counts e-mails by a hash of the address, never the address itself.
    const sends = await q("SELECT target FROM otp_sends WHERE channel = 'email'");
    assert.ok(sends.length >= 8);
    for (const s of sends) assert.match(s.target, /^[0-9a-f]{64}$/);
    assert.equal(sends.filter((s) => s.target.includes('@')).length, 0);
  });

  test('başkası aynı adrese kod isteyince ilk kod geçerli kalır; challenge olmadan ya da yanlış challenge ile kod geçmez', async () => {
    const email = address('kurban');
    const mine = { 'x-forwarded-for': '192.0.2.10' };
    const theirs = { 'x-forwarded-for': '192.0.2.11' };
    const code = await codeFor(email, () => start(email, mine));
    const myChallenge = challengeOf(email);
    // Someone else asks for a code at this address: their own code and challenge, mine is untouched.
    const other = await ok(start(email, theirs));
    isStarted(other);
    assert.notEqual(other.challenge, myChallenge);
    for (let i = 0; i < 5; i++) assert.equal((await verify(email, wrong(code), { challenge: other.challenge, deviceInfo: phone() }, theirs))[0], 400);
    assert.equal((await verify(email, code, { challenge: other.challenge, deviceInfo: phone() }, theirs))[0], 429, 'onların kodunun denemeleri bitti');
    // The code alone is not enough: without the challenge, or with an unknown one, it is refused.
    for (const challenge of [undefined, 'A'.repeat(22), 'kisa', 42]) {
      const [st, j] = await verify(email, code, { challenge, deviceInfo: phone() }, mine);
      assert.equal(st, 400, String(challenge));
      assert.equal(j.error, 'Kodun süresi doldu, yeni kod iste');
    }
    const j = await ok(verify(email, code, { challenge: myChallenge, deviceInfo: phone() }, mine), 'benim kodum hâlâ geçerli');
    assert.equal(j.isNew, true);
  });

  test('yanlış kodlar gün boyu sayılır: bir bağlantıdan 7 yanlış o bağlantıya, herkesten 12 yanlış herkese kilitler', async () => {
    const email = address('tahmin');
    const A = { 'x-forwarded-for': '192.0.2.20' };
    const B = { 'x-forwarded-for': '192.0.2.21' };
    const C = { 'x-forwarded-for': '2001:db8:20::1' };
    const LOCKED = 'Çok fazla yanlış kod denendi, yarın tekrar dene';
    const guess = async (hdr, times) => {
      await later(email);
      const code = await codeFor(email, () => start(email, hdr));
      for (let i = 0; i < times; i++) assert.equal((await verify(email, wrong(code), { deviceInfo: phone() }, hdr))[1].error, 'Kod yanlış');
      return code;
    };
    // A new code gives five new tries, but the day's count goes on: 5 + 2 wrong from A lock A out.
    await guess(A, 5);
    const last = await guess(A, 2);
    const [st, j] = await verify(email, last, { deviceInfo: phone() }, A);
    assert.equal(st, 429, 'doğru kod da geçmez');
    assert.equal(j.error, LOCKED);
    await later(email);
    assert.deepEqual(await start(email, A).then(([s, x]) => [s, x.error]), [429, LOCKED], 'yeni kod da istenemez');
    // Another connection still signs in.
    await later(email);
    await ok(verify(email, await codeFor(email, () => start(email, B)), { deviceInfo: phone() }, B));
    // 12 wrong in all (7 + 5 from B) lock the address for everyone, for a day.
    await guess(B, 5);
    assert.deepEqual(await start(email, C).then(([s, x]) => [s, x.error]), [429, LOCKED]);
    assert.equal((await verify(email, '123456', { deviceInfo: phone() }, C))[1].error, LOCKED);
    const rows = await q("SELECT key FROM otp_failures WHERE locked_until > now() + interval '23 hours'");
    assert.ok(rows.length >= 2);
    for (const r of rows) assert.match(r.key, /^[0-9a-f]{64}$/, 'adres saklanmaz');
    // Other addresses are not affected.
    assert.equal((await start(address('baska'), C))[0], 200);
  });

  test('aynı posta kutusu: +etiket ve Gmail noktaları saatlik sınırda tek adres sayılır', async () => {
    const who = `ali${rnd(2)}`;
    const dotted = `${who[0]}.${who.slice(1)}`;
    const variants = [`${who}+1@gmail.com`, `${dotted}+2@gmail.com`, `${who}@googlemail.com`, `${who}+x@gmail.com`, `${dotted}@gmail.com`];
    for (const v of variants) await codeFor(v);
    const [st, j] = await start(`${who}+son@gmail.com`);
    assert.equal(st, 429);
    assert.equal(j.error, 'Bu adrese çok fazla kod gönderildi, bir saat sonra tekrar dene');
    // A different mailbox at the same domain is its own.
    assert.equal((await start(`${who}x@gmail.com`))[0], 200);
  });

  test('cihazın geliştirme hesabı bağlanır, bakiye korunur; o telefonda ikinci adres yeni hesap açamaz', async () => {
    const dev = await h.signUp('Test Kişi');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(8) }, dev.session));
    const email = address('test');
    const j = await ok(emailSignIn(email, { deviceKey: dev.deviceKey }));
    assert.equal(j.isNew, false);
    assert.equal(j.user.id, dev.user.id);
    assert.equal(j.user.coins, 5000);
    assert.equal(j.user.name, 'Test Kişi');
    assert.equal(j.user.email, email);

    // The development account has its address now: another address on this phone is refused.
    const [st, other] = await emailSignIn(address('ikinci'), { deviceKey: dev.deviceKey });
    assert.equal(st, 409);
    assert.equal(other.code, 'device_has_account');
    assert.equal(other.method, 'email');
    assert.ok(!JSON.stringify(other).includes(email), 'öteki hesabın adresi söylenmez');
  });

  test('aynı Gmail adresiyle Google hesabı: tek hesapsa bağlanır; iki hesapta varsa yeni hesap; başka alan adı 409', async () => {
    const gmail = (who) => `${who}.${rnd(3)}@gmail.com`;
    const g = await h.account('Google Kişi');
    const email = gmail('elif');
    await q("INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)", [rnd(10), g.user.id, email.replace('elif', 'Elif')]);
    const j = await ok(emailSignIn(email));
    assert.equal(j.isNew, false);
    assert.equal(j.user.id, g.user.id);
    assert.deepEqual(j.user.identities, ['email', 'google']);

    const shared = gmail('ortak');
    const [a, b] = [await h.account('A'), await h.account('B')];
    for (const u of [a, b]) await q("INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)", [rnd(10), u.user.id, shared]);
    const k = await ok(emailSignIn(shared));
    assert.equal(k.isNew, true);
    assert.ok(![a.user.id, b.user.id].includes(k.user.id));

    // Another domain: the mailbox may have changed hands since Google checked it. Not joined, and no second
    // account with that address either: Google first, then the address in Ayarlar.
    const w = await h.account('İş Adresli');
    const work = address('is');
    await q("INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)", [rnd(10), w.user.id, work]);
    const [st, j2] = await emailSignIn(work);
    assert.equal(st, 409);
    assert.equal(j2.code, 'use_google');
    assert.equal((await q("SELECT count(*)::int AS n FROM auth_identities WHERE provider = 'email' AND subject = $1", [work]))[0].n, 0);
    // The Google account's owner adds it in Ayarlar with a code to that mailbox.
    await later(work);
    const c = await codeFor(work, () => call('POST', '/api/me/email/start', { email: work }, w.session));
    assert.equal((await ok(call('POST', '/api/me/email/verify', { email: work, code: c, challenge: challengeOf(work) }, w.session))).user.email, work);
    assert.equal((await ok(emailSignIn(work))).user.id, w.user.id);
  });

  test('bir telefonda tek hesap: ikinci yeni adres 409; hesap silinince telefon serbest; cihaz bilgisi yoksa 400', async () => {
    const hw = rnd(8);
    const first = address('ilk');
    const a = await ok(emailSignIn(first, { deviceInfo: phone(hw) }));
    assert.equal(a.isNew, true);

    // Reinstalled app (new install id, same phone): still the same device.
    const second = address('ikinci');
    const [st, j] = await emailSignIn(second, { deviceInfo: phone(hw) });
    assert.equal(st, 409);
    assert.deepEqual({ code: j.code, method: j.method }, { code: 'device_has_account', method: 'email' });
    assert.equal(j.error, "Bu telefonda zaten bir hesap var. O hesapla giriş yap; e-postanı Ayarlar'dan ekleyebilirsin.");
    assert.equal((await q("SELECT count(*)::int AS n FROM auth_identities WHERE provider = 'email' AND subject = $1", [second]))[0].n, 0);
    // The phone's own account still signs in there.
    assert.equal((await ok(emailSignIn(first, { deviceInfo: phone(hw) }))).user.id, a.user.id);

    await ok(call('DELETE', '/api/me', null, a.session));
    await later(second);
    const b = await ok(emailSignIn(second, { deviceInfo: phone(hw) }));
    assert.equal(b.isNew, true, 'silinen hesap telefonu serbest bırakır');

    const [st2, j2] = await emailSignIn(address('cihazsiz'), {});
    assert.equal(st2, 400);
    assert.equal(j2.error, 'Bu cihaz tanınamadı; uygulamayı güncelleyip tekrar dene');
  });

  test('Ayarlar: e-posta ekleme, başka hesabın adresi 409, adres değiştirme, denetim kaydı', async () => {
    const u = await h.account('Ekleyen');
    const linkStart = (email, s = u.session) => call('POST', '/api/me/email/start', { email }, s);
    const linkVerify = (email, code, s = u.session) => call('POST', '/api/me/email/verify', { email, code, challenge: challengeOf(email) }, s);
    assert.equal((await call('POST', '/api/me/email/start', { email: address() }))[0], 401, 'oturum gerekli');

    const e1 = address('bir');
    const c1 = await codeFor(e1, () => linkStart(e1));
    assert.equal((await linkVerify(e1, wrong(c1)))[0], 400);
    const linked = await ok(linkVerify(e1, c1));
    assert.equal(linked.user.email, e1);
    assert.deepEqual(linked.user.identities, ['email']);
    const [st, j] = await linkStart(` ${e1.toUpperCase()}`);
    assert.equal(st, 400);
    assert.equal(j.error, 'Bu adres zaten hesabına bağlı');

    // Another account can ask for a code (nothing is revealed) but not take the address.
    const v = await h.account('Öteki');
    await later(e1);
    const c2 = await codeFor(e1, () => linkStart(e1, v.session));
    const [st2, j2] = await linkVerify(e1, c2, v.session);
    assert.equal(st2, 409);
    assert.equal(j2.error, 'Bu e-posta başka bir hesaba bağlı');
    // Nor an address another account signs in with through Google.
    const gmail = address('google');
    await q("INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)", [rnd(10), v.user.id, gmail]);
    assert.equal((await linkVerify(gmail, await codeFor(gmail, () => linkStart(gmail))))[0], 409);

    // Replacing the address needs a recent sign-in: a session older than 10 minutes is sent to sign in again.
    const e2 = address('iki');
    const old = (s) => q("UPDATE sessions SET created_at = now() - interval '11 minutes' WHERE token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')", [s]);
    await old(u.session);
    const [rst, rj] = await linkStart(e2);
    assert.equal(rst, 403);
    assert.equal(rj.code, 'reauth_required');
    // A code asked for while the session was fresh does not help either.
    await q("UPDATE sessions SET created_at = now() WHERE user_id = $1", [u.user.id]);
    const early = await codeFor(e2, () => linkStart(e2));
    await old(u.session);
    assert.equal((await linkVerify(e2, early))[1].code, 'reauth_required');
    assert.equal((await q("SELECT subject FROM auth_identities WHERE user_id = $1 AND provider = 'email'", [u.user.id]))[0].subject, e1);
    // Adding a first address is not a replacement: an older session may do it.
    const first = await h.account('İlk Adres');
    await old(first.session);
    const e3 = address('uc');
    assert.equal((await ok(linkVerify(e3, await codeFor(e3, () => linkStart(e3, first.session)), first.session))).user.email, e3);

    await q("UPDATE sessions SET created_at = now() WHERE user_id = $1", [u.user.id]);
    const notices = h.logs.length;
    const changed = await ok(linkVerify(e2, early));
    assert.equal(changed.user.email, e2);
    // The old address is told (the log provider prints it; a real provider mails it).
    await h.waitLog(new RegExp(`^mail-notice ${escape(e1)} email_changed$`), notices);
    assert.equal((await q("SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1 AND provider = 'email'", [u.user.id]))[0].n, 1);
    // The new address signs in to this account; the old one is free again.
    assert.equal((await ok(emailSignIn(e2))).user.id, u.user.id);
    assert.equal((await ok(emailSignIn(e1))).isNew, true);

    const rows = await q('SELECT action, target, detail::text AS detail FROM audit_events WHERE actor = $1 ORDER BY id', [u.user.id]);
    assert.deepEqual(rows.map((r) => r.action), ['email_linked', 'email_changed']);
    for (const r of rows) {
      assert.equal(r.target, u.user.id);
      assert.ok(!r.detail.includes('@'), 'denetim kaydında adres yok');
    }
  });

  test('hesap silme: e-posta kimliği ve bekleyen kodlar gider; adres yeniden kullanılabilir', async () => {
    const email = address('silinen');
    const a = await ok(emailSignIn(email));
    await codeFor(email);
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_codes WHERE channel = 'email' AND target = $1", [email]))[0].n, 1);
    await ok(call('DELETE', '/api/me', null, a.session));
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_codes WHERE channel = 'email' AND target = $1", [email]))[0].n, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM auth_identities WHERE user_id = $1', [a.user.id]))[0].n, 0);
    const b = await ok(emailSignIn(email));
    assert.equal(b.isNew, true);
    assert.notEqual(b.user.id, a.user.id);
  });

  test('inceleme adresi: e-posta gitmez, sabit kod; dolu telefonda da girer; yanlış kodlar kilitler', async () => {
    const from = h.logs.length;
    isStarted(await ok(start('INCELEME@example.com')));
    assert.equal(h.logs.slice(from).filter((l) => l.startsWith('otp-email')).length, 0);
    // Along the normal path otherwise: the 60-second wait applies to it too.
    assert.equal((await start(REVIEW_EMAIL))[0], 429);

    // This phone already has an account: the reviewer still gets in.
    const hw = rnd(8);
    await ok(emailSignIn(address('sahip'), { deviceInfo: phone(hw) }));
    const first = await ok(verify(REVIEW_EMAIL, REVIEW_CODE, { deviceInfo: phone(hw) }));
    assert.equal(first.isNew, true);
    assert.equal((await ok(verify(REVIEW_EMAIL, REVIEW_CODE, { deviceInfo: phone() }))).user.id, first.user.id);

    for (let i = 0; i < 3; i++) assert.equal((await verify(REVIEW_EMAIL, '000000'))[0], 400, `yanlış ${i + 1}`);
    const [st, j] = await verify(REVIEW_EMAIL, REVIEW_CODE);
    assert.equal(st, 429, 'kilitliyken doğru kod da girmez');
    assert.match(j.error, /bir saat sonra/);
    await q("UPDATE otp_review_lock SET locked_until = now() - interval '1 second' WHERE channel = 'email'");
    await ok(verify(REVIEW_EMAIL, REVIEW_CODE));
    assert.equal((await q("SELECT fails FROM otp_review_lock WHERE channel = 'email' AND target = $1", [REVIEW_EMAIL]))[0].fails, 0);
    // The SMS review lock is a separate row.
    assert.equal((await q("SELECT count(*)::int AS n FROM otp_review_lock WHERE channel = 'sms'"))[0].n, 0);
  });
});
