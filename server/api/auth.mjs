// Signing in and sessions.
//
// Every sign-in also takes `deviceInfo` (sanctions.mjs deviceSignals). A banned account or device gets 403 with
// { code: account_banned | device_banned, sanction, serverNow, appealSession? } instead of a session.
//
//   POST /api/auth/dev           { deviceKey, name?, device? }                 → { session, user }   (ALLOW_DEV_AUTH=1 only)
//   POST /api/auth/otp/start     { phone }                                     → { sent, retryAfter, challenge }   (PHONE_SIGN_IN=1)
//   POST /api/auth/otp/verify    { phone, code, challenge, name?, deviceKey?, deviceInfo?, device? } → { session, user, isNew }
//   POST /api/auth/email/start   { email }                                     → { sent, retryAfter, challenge }   (MAIL_PROVIDERS)
//   POST /api/auth/email/verify  { email, code, challenge, deviceKey?, deviceInfo?, device? } → { session, user, isNew }
//   POST /api/auth/google        { idToken, deviceKey?, device? }              → { session, user, isNew }   (GOOGLE_CLIENT_IDS)
//   POST /api/auth/logout        { all? }                                      → { loggedOut }
//   GET  /api/sessions                                                         → { sessions }
//   POST /api/sessions/revoke    { id }                                        → { revoked }
// Adding an address or a phone number to the signed-in account (never merges two accounts):
//   POST /api/me/email/start     { email }                                     → { sent, retryAfter, challenge }
//   POST /api/me/email/verify    { email, code, challenge }                    → { user }
//   POST /api/me/phone/start     { phone }                                     → { sent, retryAfter, challenge }   (SMS_PROVIDER)
//   POST /api/me/phone/verify    { phone, code, challenge }                    → { user }
// (WhatsApp phone check: whatsapp.mjs.) `user` in these answers and in GET/PATCH /api/me is selfUser plus
// { email, identities, phoneVerified } (withSignIn). Replacing an address or a number the account already has
// needs a sign-in in the last REAUTH_MINUTES (10): an older session gets 403 { code: 'reauth_required' }, so a
// stolen session can't move the account to the thief's address. The old address is told of the change.
//
// Codes (both channels): 6 digits, kept only as a hash, single use. Each start makes its own code with a random
// `challenge` that verify must send back, so asking for a code at someone else's address neither replaces nor
// uses up theirs. 5 tries per code; a new code every 60 seconds per connection; per hour at most 5 per
// address / number and connection, and 20 per address (its mailbox: +tags and Gmail dots count as one) / 10
// per number in all. Wrong codes are also counted over a day, whichever code they were for: OTP_FAILS_PER_IP_DAY
// (10) from one connection (IPv6 by /64) lock that address / number for that connection, OTP_FAILS_PER_DAY (30)
// lock it for everyone, for a day (an alarm in the log). Hourly caps over everyone: SMS by the Canlı ayar
// otp_global_per_hour (live-settings.mjs; OTP_GLOBAL_PER_HOUR until an admin sets one, default 300; 0 = no SMS
// at all, 503, Google and e-mail sign-in still work) and EMAIL_GLOBAL_PER_HOUR e-mails (default 60), so a script rotating
// numbers or addresses can't run up the bill or the free mail quota; per connection OTP_IP_PER_HOUR codes
// (default 30, both channels) and EMAIL_IP_PER_HOUR e-mails (default 10), so it takes several connections to
// use up the e-mail cap. Kept modest because Turkish carriers put many phones behind one address (CGNAT).
//
// Phone sign-in (/api/auth/otp/*): off (503, feature 'phone') unless PHONE_SIGN_IN=1, so a phone checked in
// Ayarlar stays a badge and never becomes a way in. SMS (sms.mjs), valid 5 minutes. Only numbers starting with
// OTP_COUNTRIES (default +90) can ask for a code, so nobody can make us pay for SMS to premium numbers abroad.
// An account that also signs in by Google or e-mail is refused (409): the phone is not a way into it. A new
// account follows the one-account-per-phone rule below. A device that already has a development account keeps
// it (and its wallet) when it signs in with a phone for the first time.
// App Store / Play reviewers: OTP_REVIEW_PHONE + OTP_REVIEW_CODE (and OTP_REVIEW_EMAIL + OTP_REVIEW_EMAIL_CODE)
// sign in without an SMS or a mail, otherwise along the normal path (switches, waits and caps). That code never
// changes, so OTP_REVIEW_MAX_TRIES wrong codes in an hour (default 10) lock it for an hour, and the daily wrong
// code counts apply too.
// Development sign-in (a device key, no phone) is off unless ALLOW_DEV_AUTH=1; it is for test servers only and
// not held to the one-account-per-phone rule.
//
// E-mail sign-in (mail.mjs), valid EMAIL_CODE_MINUTES (10). The address is found as an 'email' identity
// (auth_identities, one account per address, one address per account). The first time, it joins: the one
// account whose Google sign-in has the same Gmail address (EMAIL_LINK_GOOGLE, default on), or the device's
// development account; otherwise a new account. Only Gmail joins by itself: there the mailbox is the Google
// account. Another domain's address that a Google account uses gets 409 (sign in with Google, then add the
// address in Ayarlar), since that mailbox may have changed hands. The start never says whether an address has
// an account.
//
// Google sign-in (free, no SMS): the app sends the ID token Google gave it; google.mjs checks it. The account is
// found by the Google account's stable id (auth_identities). A device with a development account links the
// Google account to it the first time, so testers keep their balance; with EMAIL_LINK_GOOGLE, so does the one
// account that signs in by e-mail code with the same Gmail address (another domain: 409, sign in by e-mail).
//
// One account per phone (ONE_ACCOUNT_PER_DEVICE, default on): a new account by e-mail, Google or phone is refused
// with 409 { code: 'device_has_account', method: 'google' | 'email' | 'phone' } when a live account that can
// still sign in already used this device (sanctions.mjs device registry); method says how that account signs
// in, never its address. A development account (device key only) does not count: after a reinstall its key is
// gone. A deleted account frees the phone. An e-mail or phone sign-up needs device signals for this; Google
// keeps working without them, as before.
import crypto from 'node:crypto';

import { checkText } from './contact-filter.mjs';
import { HttpError, auth, bannedError, clientIp, countRefusal, db, env, liveBan, newSession, readJson, same, selfUser, sha, tx } from './core.mjs';
import { googleClientIds, verifyGoogleIdToken } from './google.mjs';
import { live } from './live-settings.mjs';
import { assertDeliverable, assertMailOn, isGmail, mailboxOf, normalizeEmail, sendMail, sendNotice } from './mail.mjs';
import { audit, deviceSignals, linkDevice, registerDevice } from './sanctions.mjs';
import { sendCode, smsProvider } from './sms.mjs';

const DEV_AUTH = env.ALLOW_DEV_AUTH === '1';
const PHONE_SIGN_IN = env.PHONE_SIGN_IN === '1';
const SMS_PROVIDER_ON = ['netgsm', 'twilio', 'log'].includes(smsProvider);
const COUNTRIES = (env.OTP_COUNTRIES ?? '+90').split(',').map((s) => s.trim()).filter(Boolean);
const REVIEW_PHONE = env.OTP_REVIEW_PHONE ?? '';
const REVIEW_CODE = env.OTP_REVIEW_CODE ?? '';
const CODE_MINUTES = 5;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
const MAX_PER_HOUR = 5;
const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const REAUTH_MINUTES = 10;
const FAILS_PER_DAY = positive(env.OTP_FAILS_PER_DAY, 30);
const FAILS_PER_IP_DAY = positive(env.OTP_FAILS_PER_IP_DAY, 10);
const REVIEW_MAX_TRIES = positive(env.OTP_REVIEW_MAX_TRIES, 10);
const DEVICE_KEY = /^[A-Za-z0-9_-]{32,128}$/;

// --- E-mail and the device rule ------------------------------------------------------------------------------
const EMAIL_CODE_MINUTES = Math.min(positive(env.EMAIL_CODE_MINUTES, 10), 60);
const EMAIL_GLOBAL_PER_HOUR = positive(env.EMAIL_GLOBAL_PER_HOUR, 60);
const IP_PER_HOUR = positive(env.OTP_IP_PER_HOUR, 30);
const EMAIL_IP_PER_HOUR = positive(env.EMAIL_IP_PER_HOUR, 10);
const REVIEW_EMAIL = normalizeEmail(env.OTP_REVIEW_EMAIL ?? '') ?? '';
const REVIEW_EMAIL_CODE = env.OTP_REVIEW_EMAIL_CODE ?? '';
const ONE_ACCOUNT_PER_DEVICE = env.ONE_ACCOUNT_PER_DEVICE !== '0';
const EMAIL_LINK_GOOGLE = env.EMAIL_LINK_GOOGLE !== '0';
if (String(env.OTP_REVIEW_EMAIL ?? '').trim() && !REVIEW_EMAIL) console.warn('OTP_REVIEW_EMAIL ignored: not a valid address');
if (REVIEW_EMAIL && !/^\d{6}$/.test(REVIEW_EMAIL_CODE)) console.warn('OTP_REVIEW_EMAIL_CODE must be 6 digits: the review address cannot sign in');

/**
 * What differs between the two code channels. `perHour` is a function so the hourly cap can come from a live
 * setting later. otp_sends keeps the number for SMS but only a hash of the mailbox for e-mail (sendKey).
 */
const CHANNELS = {
  sms: {
    minutes: CODE_MINUTES,
    lock: 'otp_global',
    perHour: async () => live().otpPerHour,
    capName: 'OTP_GLOBAL_PER_HOUR',
    targetPerHour: 10,
    tooMany: 'Bu numaraya çok fazla kod gönderildi, bir saat sonra tekrar dene',
    review: () => [REVIEW_PHONE, REVIEW_CODE],
    sendKey: (t) => t,
    hash: (t, code) => sha(`otp:${t}:${code}`),
  },
  email: {
    minutes: EMAIL_CODE_MINUTES,
    lock: 'otp_global_email',
    perHour: async () => EMAIL_GLOBAL_PER_HOUR,
    capName: 'EMAIL_GLOBAL_PER_HOUR',
    targetPerHour: 20,
    tooMany: 'Bu adrese çok fazla kod gönderildi, bir saat sonra tekrar dene',
    review: () => [REVIEW_EMAIL, REVIEW_EMAIL_CODE],
    sendKey: (t) => sha(`otp-send:${mailboxOf(t)}`),
    hash: (t, code) => sha(`otp-email:${t}:${code}`),
  },
};
const isReview = (channel, target) => {
  const [t] = CHANNELS[channel].review();
  return !!t && t === target;
};

/**
 * A phone number as E.164, or null. Turkish forms (0532…, 532…, 90532…, 0090…, +90 0532…) become +90532…: one
 * form per number, so the same number can't be on two accounts. A +90 number has 10 digits after 90 and no
 * trunk 0.
 */
export function normalizePhone(v) {
  if (typeof v !== 'string') return null;
  let d = v.replace(/[\s().-]/g, '');
  if (/^00[1-9]\d{7,14}$/.test(d)) d = `+${d.slice(2)}`;
  if (/^0?5\d{9}$/.test(d)) d = `+90${d.replace(/^0/, '')}`;
  else if (/^905\d{9}$/.test(d)) d = `+${d}`;
  d = d.replace(/^\+900(?=[1-9]\d{9}$)/, '+90');
  if (d.startsWith('+90') && !/^\+90[1-9]\d{9}$/.test(d)) return null;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}
/** True when SMS codes / phone checks are open for this number's country (OTP_COUNTRIES). */
export const phoneCountryOk = (phone) => COUNTRIES.some((p) => phone.startsWith(p));

/**
 * The name a new account starts with, at most 40 characters. One that shares contact details
 * (contact-filter.mjs) is dropped rather than failing the sign-in: the account starts as 'Yeni üye' and the
 * refusal is counted once the account exists (`refused` is its category).
 */
function cleanName(v) {
  const name = typeof v === 'string' ? v.trim().slice(0, 40) : '';
  const r = checkText(name);
  return r.ok ? { name, refused: null } : { name: '', refused: r.category };
}
const countNameRefusal = (n, u) => (n.refused ? countRefusal(u.id, n.refused, 'signin.name') : undefined);
const validKey = (k) => typeof k === 'string' && DEVICE_KEY.test(k);
const codeOf = (v) => (typeof v === 'string' && /^\d{6}$/.test(v) ? v : null);
const challengeOf = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v) ? v : null);

/**
 * The connection a code request counts against: an IPv4 address as is, an IPv6 address by its /64 (one home or
 * phone gets a whole /64, so single addresses would be free to rotate).
 */
export function ipBucket(ip) {
  const s = String(ip ?? '').trim().toLowerCase();
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) return v4[1];
  if (!s.includes(':')) return s;
  const [head, tail = ''] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = s.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${full
    .slice(0, 4)
    .map((x) => x.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** A row in audit_events (the account's own security changes; never the address or number itself). */
const auditEvent = (c, uid, action, detail, ip) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $1, $3, $4)', [uid, action, JSON.stringify(detail), ip ?? '']);

/**
 * The signed-in person's own view with how they sign in: selfUser plus `email` (the address of the e-mail
 * sign-in, or null), `identities` (sign-in methods besides the phone: 'email', 'google') and `phoneVerified`.
 */
export async function withSignIn(u, q = db) {
  const r = await q.query('SELECT provider, email FROM auth_identities WHERE user_id = $1 ORDER BY provider', [u.id]);
  return { ...selfUser(u), email: r.rows.find((x) => x.provider === 'email')?.email ?? null, identities: r.rows.map((x) => x.provider), phoneVerified: !!u.phone };
}

/**
 * The device a sign-in comes from (deviceInfo, or the old deviceKey), recorded before any account is found or
 * made: a banned device can't sign in or sign up, whichever account it uses. Null without device signals.
 */
async function deviceOf(b) {
  const sig = deviceSignals(b);
  return sig ? registerDevice(sig) : null;
}

/**
 * Refuses a banned device before an account is made. `existing()` looks the account up without creating it: a
 * known account gets an appeal session with the refusal, so the person can read the ban and appeal it.
 */
async function deviceGate(dev, b, existing) {
  if (!dev) return;
  const ban = await liveBan(db, null, dev.matched);
  if (!ban) return;
  const u = await existing();
  await audit(db, { actor: u?.id ?? null, role: 'user', action: 'sign_in', sanction: ban.id, target: u?.id ?? null, device: dev.id, result: 'blocked' });
  if (!u) throw bannedError(ban);
  await linkDevice(dev, u.id);
  throw bannedError(ban, { appealSession: await newSession(u.id, b.device, { deviceId: dev.id, scope: 'appeal' }) });
}

/** The end of every sign-in: a banned account (or device) gets the ban and an appeal session, everyone else a session. */
async function signedIn(u, dev, b, more = {}) {
  const ban = await liveBan(db, u.id, dev?.matched ?? []);
  if (dev) await linkDevice(dev, u.id);
  if (ban) {
    await audit(db, { actor: u.id, role: 'user', action: 'sign_in', sanction: ban.id, target: u.id, device: dev?.id ?? null, result: 'blocked' });
    throw bannedError(ban, { appealSession: await newSession(u.id, b.device, { deviceId: dev?.id ?? null, scope: 'appeal' }) });
  }
  return { session: await newSession(u.id, b.device, { deviceId: dev?.id ?? null }), user: await withSignIn(u), ...more };
}

const DEVICE_HAS_ACCOUNT = {
  email: "Bu telefonda zaten bir hesap var. O hesapla giriş yap; e-postanı Ayarlar'dan ekleyebilirsin.",
  google: 'Bu telefonda zaten bir hesap var. O hesapla giriş yap.',
  phone: 'Bu telefonda zaten bir hesap var. O hesapla giriş yap.',
};

/**
 * ONE_ACCOUNT_PER_DEVICE, inside the transaction that would make a new account: 409 when a live account that can
 * still sign in (by Google, by e-mail, or by phone while PHONE_SIGN_IN is on) has used one of these devices. A
 * development account alone does not count: its device key is lost with a reinstall, and test servers only.
 * The devices stay locked until the new account's device row is written, so two sign-ups at once can't both pass.
 */
async function refuseSecondAccount(c, dev, message) {
  if (!ONE_ACCOUNT_PER_DEVICE || !dev) return;
  for (const id of [...new Set(dev.matched)].sort((a, b) => a - b)) await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`device_account:${id}`]);
  const r = await c.query(
    `SELECT * FROM (
       SELECT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.provider = 'google') AS google,
              EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.provider = 'email') AS email,
              $2::boolean AND u.phone IS NOT NULL AS phone, a.last_seen_at
         FROM device_accounts a JOIN users u ON u.id = a.user_id
        WHERE a.device_id = ANY($1::bigint[]) AND u.deleted_at IS NULL) x
      WHERE google OR email OR phone
      ORDER BY last_seen_at DESC LIMIT 1`,
    [dev.matched, PHONE_SIGN_IN],
  );
  const o = r.rows[0];
  if (o) throw Object.assign(new HttpError(409, message), { extra: { code: 'device_has_account', method: o.google ? 'google' : o.email ? 'email' : 'phone' } });
}
/** The new account's device row, in the same transaction (signedIn's linkDevice then only refreshes it). */
const claimDevice = (c, dev, uid) =>
  dev ? c.query('INSERT INTO device_accounts (device_id, user_id) VALUES ($1, $2) ON CONFLICT (device_id, user_id) DO UPDATE SET last_seen_at = now()', [dev.id, uid]) : null;

// --- Codes -----------------------------------------------------------------------------------------------------
/** The review number's / address's fixed code: wrong codes are counted per hour, and too many lock it for an hour. */
async function checkReviewCode(channel, target, code) {
  const [, fixed] = CHANNELS[channel].review();
  return tx(async (c) => {
    await c.query('INSERT INTO otp_review_lock (channel, target) VALUES ($1, $2) ON CONFLICT DO NOTHING', [channel, target]);
    const row = (await c.query('SELECT * FROM otp_review_lock WHERE channel = $1 AND target = $2 FOR UPDATE', [channel, target])).rows[0];
    if (row.locked_until && new Date(row.locked_until) > new Date()) throw new HttpError(429, 'Çok fazla yanlış deneme, bir saat sonra tekrar dene');
    const good = !!fixed && same(code, fixed);
    if (good) {
      await c.query('UPDATE otp_review_lock SET fails = 0, locked_until = NULL WHERE channel = $1 AND target = $2', [channel, target]);
      return true;
    }
    const inWindow = Date.now() - new Date(row.window_start).getTime() < 3_600_000;
    const fails = inWindow ? row.fails + 1 : 1;
    const lock = fails >= REVIEW_MAX_TRIES;
    await c.query(
      `UPDATE otp_review_lock SET fails = $3, window_start = CASE WHEN $4 THEN window_start ELSE now() END,
         locked_until = CASE WHEN $5 THEN now() + interval '1 hour' ELSE locked_until END WHERE channel = $1 AND target = $2`,
      [channel, target, lock ? 0 : fails, inWindow, lock],
    );
    if (lock) console.error(`otp review ${channel === 'sms' ? 'number' : 'address'} locked for an hour after ${REVIEW_MAX_TRIES} wrong codes`);
    return false;
  });
}

/** The otp_failures keys of a wrong code for `target` from `ip`, with how many a day each allows. */
const failKeys = (channel, target, ip) => [
  [sha(`otp-fail:${channel}:${target}`), FAILS_PER_DAY, 'everyone'],
  [sha(`otp-fail:${channel}:${target}:${ipBucket(ip)}`), FAILS_PER_IP_DAY, 'one connection'],
];
const LOCKED = 'Çok fazla yanlış kod denendi, yarın tekrar dene';

/** 429 while too many wrong codes for `target` (from everyone, or from this connection) lock it. */
async function assertNotLocked(q, channel, target, ip) {
  const keys = failKeys(channel, target, ip).map(([k]) => k);
  const r = await q.query('SELECT 1 FROM otp_failures WHERE key = ANY($1::text[]) AND locked_until > now() LIMIT 1', [keys]);
  if (r.rowCount) throw new HttpError(429, LOCKED);
}

/** Counts a wrong code for `target` over the day; the one that reaches a limit locks that key for a day. */
async function countFailure(c, channel, target, ip) {
  for (const [key, max, who] of failKeys(channel, target, ip)) {
    const r = await c.query(
      `INSERT INTO otp_failures (key, fails) VALUES ($1, 1)
       ON CONFLICT (key) DO UPDATE SET
         fails = CASE WHEN otp_failures.window_start > now() - interval '1 day' THEN otp_failures.fails + 1 ELSE 1 END,
         window_start = CASE WHEN otp_failures.window_start > now() - interval '1 day' THEN otp_failures.window_start ELSE now() END
       RETURNING fails`,
      [key],
    );
    if (r.rows[0].fails < max) continue;
    await c.query("UPDATE otp_failures SET fails = 0, window_start = now(), locked_until = now() + interval '1 day' WHERE key = $1", [key]);
    console.error(`otp ${channel === 'sms' ? 'number' : 'address'} locked for a day for ${who} after ${max} wrong codes`);
  }
}

/**
 * Checks the code of the request `challenge` (from start) for `target`. A wrong code counts a try on that code
 * and a failure for the day (both committed); an unknown, expired or used-up one is refused. The review number /
 * address has its fixed code instead (the challenge is not needed).
 */
async function checkCode(channel, target, code, challenge, ip) {
  await assertNotLocked(db, channel, target, ip);
  if (isReview(channel, target)) {
    const good = await checkReviewCode(channel, target, code);
    if (!good) await tx((c) => countFailure(c, channel, target, ip));
    return good;
  }
  const ch = CHANNELS[channel];
  const id = challengeOf(challenge);
  if (!id) throw new HttpError(400, 'Kodun süresi doldu, yeni kod iste');
  return tx(async (c) => {
    const row = (await c.query('SELECT * FROM otp_codes WHERE challenge_hash = $1 FOR UPDATE', [sha(`otp-challenge:${id}`)])).rows[0];
    if (!row || row.channel !== channel || row.target !== target || new Date(row.expires_at) < new Date()) throw new HttpError(400, 'Kodun süresi doldu, yeni kod iste');
    if (row.attempts >= MAX_TRIES) throw new HttpError(429, 'Çok fazla yanlış deneme, yeni kod iste');
    const good = same(ch.hash(target, code), row.code_hash);
    if (good) {
      await c.query('DELETE FROM otp_codes WHERE challenge_hash = $1', [row.challenge_hash]);
      // One right code ends every other code still waiting for this address or number. Their rows stay until the
      // sweep, so the wait between codes is worked out as before.
      await c.query("UPDATE otp_codes SET expires_at = now() - interval '1 second' WHERE channel = $1 AND target = $2 AND expires_at > now()", [channel, target]);
    } else {
      await c.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE challenge_hash = $1', [row.challenge_hash]);
      await countFailure(c, channel, target, ip);
    }
    return good;
  });
}

/** 503 for sending SMS codes while SMS_PROVIDER is empty or the live hourly SMS cap is 0. */
function assertSmsStart() {
  if (!SMS_PROVIDER_ON || live().otpPerHour <= 0) throw Object.assign(new HttpError(503, 'Telefon doğrulama henüz açık değil'), { feature: 'sms', extra: { feature: 'sms' } });
}
/** 503 for checking SMS codes while SMS_PROVIDER is empty (codes already sent still work while only the cap is 0). */
function assertSmsVerify() {
  if (!SMS_PROVIDER_ON) throw Object.assign(new HttpError(503, 'Telefon doğrulama henüz açık değil'), { feature: 'sms', extra: { feature: 'sms' } });
}
/** 503 (feature 'phone') for signing in by phone unless PHONE_SIGN_IN=1. */
function assertPhoneSignIn() {
  if (!PHONE_SIGN_IN) throw Object.assign(new HttpError(503, 'Telefonla giriş henüz açık değil'), { feature: 'phone', extra: { feature: 'phone' } });
}

/**
 * The hourly caps, counted under locks so two requests can't both take the last code: over everyone for this
 * channel, then per connection over both channels and, for e-mail, over e-mail alone. Records the send under
 * `key` (the channel's sendKey).
 */
async function globalCap(c, channel, key, ip) {
  const ch = CHANNELS[channel];
  const max = await ch.perHour();
  if (max <= 0) assertSmsStart();
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ch.lock]);
  const n = Number((await c.query("SELECT count(*) AS n FROM otp_sends WHERE channel = $1 AND sent_at > now() - interval '1 hour'", [channel])).rows[0].n);
  if (n >= max) {
    console.error(`otp global cap reached: ${n} ${channel} codes in the last hour (${ch.capName}=${max})`);
    throw new HttpError(429, 'Şu an çok fazla kod isteniyor, biraz sonra tekrar dene');
  }
  if (ip) {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp_ip:${ip}`]);
    const m = (
      await c.query("SELECT count(*) AS n, count(*) FILTER (WHERE channel = 'email') AS e FROM otp_sends WHERE ip = $1 AND sent_at > now() - interval '1 hour'", [ip])
    ).rows[0];
    if (Number(m.n) >= IP_PER_HOUR || (channel === 'email' && Number(m.e) >= EMAIL_IP_PER_HOUR)) {
      const cap = Number(m.n) >= IP_PER_HOUR ? `OTP_IP_PER_HOUR=${IP_PER_HOUR}` : `EMAIL_IP_PER_HOUR=${EMAIL_IP_PER_HOUR}`;
      console.error(`otp ip cap reached: ${m.n} codes in the last hour from one connection (${cap})`);
      throw new HttpError(429, 'Bu bağlantıdan çok fazla kod istendi, biraz sonra tekrar dene');
    }
  }
  await c.query('INSERT INTO otp_sends (channel, target, ip) VALUES ($1, $2, $3)', [channel, key, ip]);
}

/**
 * Old rows of the code tables, every 10 minutes: codes past their time, sends older than the day the caps
 * look at, wrong-code counts whose day and lock are over, and WhatsApp checks older than a day.
 */
const SWEEPS = [
  "DELETE FROM otp_codes WHERE ctid IN (SELECT ctid FROM otp_codes WHERE expires_at < now() - interval '10 minutes' LIMIT 5000)",
  "DELETE FROM otp_sends WHERE ctid IN (SELECT ctid FROM otp_sends WHERE sent_at < now() - interval '1 day' LIMIT 5000)",
  "DELETE FROM otp_failures WHERE window_start < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())",
  "DELETE FROM phone_claims WHERE ctid IN (SELECT ctid FROM phone_claims WHERE created_at < now() - interval '1 day' LIMIT 5000)",
];
export async function sweepOtp() {
  for (const q of SWEEPS) await db.query(q).catch((e) => console.error('otp sweep failed', e.message));
}
let sweepTimer = null;
export const startOtpSweep = () => {
  sweepOtp();
  sweepTimer ??= setInterval(sweepOtp, Math.max(500, Number(env.OTP_SWEEP_MS) || 600_000));
  sweepTimer.unref();
};
export const stopOtpSweep = () => (clearInterval(sweepTimer), (sweepTimer = null));

/**
 * A new code for `target` on `channel` with its own challenge, then `send(code)`. A code that could not be sent
 * is dropped, so it can be asked for again right away (the hourly counts still apply).
 */
async function startCode(channel, target, rawIp, send) {
  const ch = CHANNELS[channel];
  const ip = ipBucket(rawIp);
  const key = ch.sendKey(target);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const challenge = crypto.randomBytes(16).toString('base64url');
  const id = sha(`otp-challenge:${challenge}`);
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`otp_target:${channel}:${key}`]);
    await assertNotLocked(c, channel, target, ip);
    const last = (await c.query('SELECT max(sent_at) AS t FROM otp_codes WHERE channel = $1 AND target = $2 AND ip = $3', [channel, target, ip])).rows[0].t;
    const wait = last ? RESEND_SECONDS - (Date.now() - new Date(last).getTime()) / 1000 : 0;
    if (wait > 0) throw new HttpError(429, `Yeni kod için ${Math.ceil(wait)} saniye bekle`);
    const sent = (
      await c.query("SELECT count(*) AS n, count(*) FILTER (WHERE ip = $3) AS mine FROM otp_sends WHERE channel = $1 AND target = $2 AND sent_at > now() - interval '1 hour'", [
        channel,
        key,
        ip,
      ])
    ).rows[0];
    if (Number(sent.mine) >= MAX_PER_HOUR || Number(sent.n) >= ch.targetPerHour) throw new HttpError(429, ch.tooMany);
    await globalCap(c, channel, key, ip);
    await c.query('INSERT INTO otp_codes (challenge_hash, channel, target, code_hash, ip, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6::int))', [
      id,
      channel,
      target,
      ch.hash(target, code),
      ip,
      ch.minutes,
    ]);
  });
  try {
    await send(code);
  } catch (e) {
    await db.query('DELETE FROM otp_codes WHERE challenge_hash = $1', [id]);
    throw e;
  }
  return { sent: true, retryAfter: RESEND_SECONDS, challenge };
}
/** The review number / address gets no SMS or mail: its code is fixed. */
const noSend = async () => {};

/** An e-mail code for `email` (purpose 'sign_in' or 'link'): mail on, a real address, then the code. */
async function startEmail(email, ip, purpose) {
  assertMailOn();
  await assertDeliverable(email);
  return startCode('email', email, ip, isReview('email', email) ? noSend : (code) => sendMail(email, code, { minutes: EMAIL_CODE_MINUTES, purpose }));
}

/**
 * Replacing an address or a number the account already has: only within REAUTH_MINUTES of signing in, so a
 * session taken from someone can't move their account to another address. 403 { code: 'reauth_required' }.
 */
export function assertRecentSignIn(u) {
  if (Date.now() - new Date(u.session_created).getTime() <= REAUTH_MINUTES * 60_000) return;
  throw Object.assign(new HttpError(403, 'Güvenliğin için önce çıkış yapıp yeniden giriş yap, sonra tekrar dene'), { extra: { code: 'reauth_required' } });
}

// --- Accounts --------------------------------------------------------------------------------------------------
const HAS_IDENTITY = 'EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id)';

/**
 * The account for a verified phone (PHONE_SIGN_IN): its own, the device's development account, or a new one
 * (after the one-account-per-phone rule). An account that signs in by Google or e-mail is refused: its phone is
 * only a badge, not a way in.
 */
async function accountFor(phone, name, dev, deviceKey, retried = false) {
  const found = (await db.query(`SELECT u.*, ${HAS_IDENTITY} AS has_identity FROM users u WHERE u.phone = $1`, [phone])).rows[0];
  if (found) {
    if (found.has_identity && !isReview('sms', phone)) throw new HttpError(409, 'Bu numaranın hesabına Google ya da e-postayla giriliyor; o yolla giriş yap');
    return { u: found, isNew: false };
  }
  try {
    const n = cleanName(name);
    const out = await tx(async (c) => {
      if (validKey(deviceKey)) {
        const r = await c.query(`UPDATE users u SET phone = $2 WHERE device_key_hash = $1 AND phone IS NULL AND deleted_at IS NULL AND NOT ${HAS_IDENTITY} RETURNING *`, [
          sha(`device:${deviceKey}`),
          phone,
        ]);
        if (r.rowCount) return { u: r.rows[0], isNew: false };
      }
      // The store reviewers' number is exempt: a reviewer's test phone may already have an account.
      if (!isReview('sms', phone)) {
        if (ONE_ACCOUNT_PER_DEVICE && !dev) throw new HttpError(400, 'Bu cihaz tanınamadı; uygulamayı güncelleyip tekrar dene');
        await refuseSecondAccount(c, dev, DEVICE_HAS_ACCOUNT.phone);
      }
      const u = (await c.query('INSERT INTO users (name, phone) VALUES ($1, $2) RETURNING *', [n.name || 'Yeni üye', phone])).rows[0];
      await claimDevice(c, dev, u.id);
      return { u, isNew: true };
    });
    if (out.isNew) await countNameRefusal(n, out.u);
    return out;
  } catch (e) {
    // The same number verified twice at once: the other request created it. Look again.
    if (e.code !== '23505' || retried) throw e;
    return accountFor(phone, name, dev, deviceKey, true);
  }
}

const BY_IDENTITY = 'SELECT u.* FROM auth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.subject = $2 AND u.deleted_at IS NULL';

/**
 * EMAIL_LINK_GOOGLE: the one live account whose Google sign-in has this Gmail address and that has no e-mail
 * sign-in yet. Only Gmail: an address on another domain may have passed to someone else since Google checked it.
 */
async function googleAccountWith(q, email, lock = false) {
  if (!EMAIL_LINK_GOOGLE || !isGmail(email)) return null;
  const r = await q.query(
    `SELECT u.* FROM auth_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = 'google' AND lower(i.email) = $1 AND u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM auth_identities e WHERE e.user_id = u.id AND e.provider = 'email')
      LIMIT 2 ${lock ? 'FOR UPDATE OF u' : ''}`,
    [email],
  );
  return r.rowCount === 1 ? r.rows[0] : null;
}

/** EMAIL_LINK_GOOGLE: the account that signs in by e-mail with this Google account's Gmail address and has no Google sign-in. */
async function emailAccountFor(q, g, lock = false) {
  const email = EMAIL_LINK_GOOGLE ? normalizeEmail(g.email ?? '') : null;
  if (!email || !isGmail(email)) return null;
  const r = await q.query(
    `SELECT u.* FROM auth_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = 'email' AND i.subject = $1 AND u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM auth_identities x WHERE x.user_id = u.id AND x.provider = 'google') ${lock ? 'FOR UPDATE OF u' : ''}`,
    [email],
  );
  return r.rows[0] ?? null;
}

/** The device's development account that has no `provider` sign-in yet. */
async function deviceAccountWithout(q, deviceKey, provider, lock = false) {
  if (!validKey(deviceKey)) return null;
  const r = await q.query(
    `SELECT * FROM users u WHERE device_key_hash = $1 AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.provider = $2) ${lock ? 'FOR UPDATE' : ''}`,
    [sha(`device:${deviceKey}`), provider],
  );
  return r.rows[0] ?? null;
}

/**
 * The account for a verified address: its own; else (one transaction) the one Google account with that address,
 * the device's development account, or a new one (after the one-account-per-phone rule).
 */
async function accountForEmail(email, dev, deviceKey, retried = false) {
  const found = (await db.query(BY_IDENTITY, ['email', email])).rows[0];
  if (found) {
    await db.query("UPDATE auth_identities SET last_used_at = now() WHERE provider = 'email' AND subject = $1", [email]);
    return { u: found, isNew: false };
  }
  try {
    return await tx(async (c) => {
      const link = "INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('email', $1, $2, $1)";
      const known = (await googleAccountWith(c, email, true)) ?? (await deviceAccountWithout(c, deviceKey, 'email', true));
      if (known) {
        await c.query(link, [email, known.id]);
        return { u: known, isNew: false };
      }
      // A Google account on another domain uses this address: not joined by itself (googleAccountWith), and no
      // second account with the same address either. Google first, then the address in Ayarlar.
      if (EMAIL_LINK_GOOGLE && !isGmail(email)) {
        const g = await c.query("SELECT 1 FROM auth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'google' AND lower(i.email) = $1 AND u.deleted_at IS NULL LIMIT 1", [email]);
        if (g.rowCount) throw Object.assign(new HttpError(409, "Bu adres bir Google hesabına bağlı. Google ile giriş yap; adresi sonra Ayarlar'dan ekleyebilirsin."), { extra: { code: 'use_google' } });
      }
      // The store reviewers' address is exempt: a reviewer's test phone may already have an account.
      if (!isReview('email', email)) {
        if (ONE_ACCOUNT_PER_DEVICE && !dev) throw new HttpError(400, 'Bu cihaz tanınamadı; uygulamayı güncelleyip tekrar dene');
        await refuseSecondAccount(c, dev, DEVICE_HAS_ACCOUNT.email);
      }
      const u = (await c.query("INSERT INTO users (name) VALUES ('Yeni üye') RETURNING *")).rows[0];
      await c.query(link, [email, u.id]);
      await claimDevice(c, dev, u.id);
      return { u, isNew: true };
    });
  } catch (e) {
    // The same address verified twice at once, or the account was linked meanwhile: look again.
    if (e.code !== '23505' || retried) throw e;
    return accountForEmail(email, dev, deviceKey, true);
  }
}

/**
 * The account for a checked Google account: its own, the device's development account, the one account that
 * signs in by e-mail with the same address (EMAIL_LINK_GOOGLE), or a new one (after the device rule).
 */
async function accountForGoogle(g, dev, deviceKey, retried = false) {
  const found = (await db.query(BY_IDENTITY, ['google', g.sub])).rows[0];
  if (found) {
    await db.query("UPDATE auth_identities SET last_used_at = now(), email = coalesce($2, email) WHERE provider = 'google' AND subject = $1", [g.sub, g.email]);
    return { u: found, isNew: false };
  }
  const n = cleanName(g.givenName || g.name);
  try {
    const out = await tx(async (c) => {
      const link = "INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('google', $1, $2, $3)";
      const known = (await deviceAccountWithout(c, deviceKey, 'google', true)) ?? (await emailAccountFor(c, g, true));
      if (known) {
        await c.query(link, [g.sub, known.id, g.email]);
        return { u: known, isNew: false };
      }
      // An e-mail sign-in on another domain has this address: not joined by itself (emailAccountFor), and no
      // second account with the same address either.
      const email = normalizeEmail(g.email ?? '');
      if (EMAIL_LINK_GOOGLE && email && !isGmail(email)) {
        const e = await c.query("SELECT 1 FROM auth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'email' AND i.subject = $1 AND u.deleted_at IS NULL", [email]);
        if (e.rowCount) throw Object.assign(new HttpError(409, 'Bu adresle e-posta koduyla giriş yapan bir hesap var. E-posta koduyla giriş yap.'), { extra: { code: 'use_email' } });
      }
      await refuseSecondAccount(c, dev, DEVICE_HAS_ACCOUNT.google);
      const u = (await c.query('INSERT INTO users (name) VALUES ($1) RETURNING *', [n.name || 'Yeni üye'])).rows[0];
      await c.query(link, [g.sub, u.id, g.email]);
      await claimDevice(c, dev, u.id);
      return { u, isNew: true };
    });
    if (out.isNew) await countNameRefusal(n, out.u);
    return out;
  } catch (e) {
    // The same Google account signed in twice at once, or the device account was linked meanwhile: look again.
    if (e.code !== '23505' || retried) throw e;
    return accountForGoogle(g, dev, deviceKey, true);
  }
}

/**
 * Sets the signed-in account's verified phone number (SMS code or WhatsApp). 409 when another account has it.
 * Returns the user row.
 */
export async function setPhone(uid, phone, via, ip = '') {
  try {
    return await tx(async (c) => {
      const cur = (await c.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uid])).rows[0];
      if (!cur) throw new HttpError(404, 'Hesap bulunamadı');
      if (cur.phone === phone) return cur;
      const u = (await c.query('UPDATE users SET phone = $2 WHERE id = $1 RETURNING *', [uid, phone])).rows[0];
      await auditEvent(c, uid, 'phone_verified', { via, changed: !!cur.phone }, ip);
      return u;
    });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Bu numara başka bir hesaba bağlı');
    throw e;
  }
}

export const authRoutes = {
  /**
   * Development sign-in with a random key kept on the device. Open only with ALLOW_DEV_AUTH=1 (test servers), and
   * not held to the one-account-per-phone rule.
   */
  async 'POST /api/auth/dev'(req) {
    if (!DEV_AUTH) throw new HttpError(403, 'Bu giriş yöntemi kapalı');
    const b = await readJson(req);
    const { deviceKey, name } = b;
    if (!validKey(deviceKey)) throw new HttpError(400, 'Geçersiz cihaz anahtarı');
    const n = cleanName(name);
    const hash = sha(`device:${deviceKey}`);
    const find = async () => (await db.query('SELECT * FROM users WHERE device_key_hash = $1 AND deleted_at IS NULL', [hash])).rows[0] ?? null;
    const dev = await deviceOf(b);
    await deviceGate(dev, b, find);
    let u = await find();
    if (!u) {
      if (!n.name && !n.refused) throw new HttpError(400, 'Ad gerekli');
      u = (await db.query('INSERT INTO users (name, device_key_hash) VALUES ($1, $2) ON CONFLICT (device_key_hash) DO UPDATE SET name = users.name RETURNING *', [n.name || 'Yeni üye', hash])).rows[0];
      await countNameRefusal(n, u);
    }
    return signedIn(u, dev, b);
  },

  /** Phone sign-in, step 1. Off (503, feature 'phone') unless PHONE_SIGN_IN=1; no SMS (503, feature 'sms'). */
  async 'POST /api/auth/otp/start'(req) {
    assertPhoneSignIn();
    const ip = clientIp(req);
    const phone = normalizePhone((await readJson(req)).phone);
    if (!phone) throw new HttpError(400, 'Geçerli bir telefon numarası yaz');
    const review = isReview('sms', phone);
    if (!review && !phoneCountryOk(phone)) throw new HttpError(400, 'Bu ülkenin numaralarıyla giriş henüz açık değil');
    assertSmsStart();
    return startCode('sms', phone, ip, review ? noSend : (code) => sendCode(phone, code));
  },

  async 'POST /api/auth/otp/verify'(req) {
    assertPhoneSignIn();
    assertSmsVerify();
    const b = await readJson(req);
    const phone = normalizePhone(b.phone);
    const code = codeOf(b.code);
    if (!phone || !code) throw new HttpError(400, 'Telefon numarası ve 6 haneli kod gerekli');
    if (!(await checkCode('sms', phone, code, b.challenge, clientIp(req)))) throw new HttpError(400, 'Kod yanlış');
    const dev = await deviceOf(b);
    await deviceGate(dev, b, async () => {
      const found = (await db.query('SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL', [phone])).rows[0];
      if (found || !validKey(b.deviceKey)) return found ?? null;
      return (await db.query('SELECT * FROM users WHERE device_key_hash = $1 AND phone IS NULL AND deleted_at IS NULL', [sha(`device:${b.deviceKey}`)])).rows[0] ?? null;
    });
    const { u, isNew } = await accountFor(phone, b.name, dev, b.deviceKey);
    return signedIn(u, dev, b, { isNew });
  },

  /** E-mail sign-in, step 1: a code to the address. Off (503, feature 'email') until MAIL_PROVIDERS is set. */
  async 'POST /api/auth/email/start'(req) {
    const ip = clientIp(req);
    const email = normalizeEmail((await readJson(req)).email);
    if (!email) throw new HttpError(400, 'Geçerli bir e-posta adresi yaz');
    return startEmail(email, ip, 'sign_in');
  },

  /** E-mail sign-in, step 2: the code. */
  async 'POST /api/auth/email/verify'(req) {
    const b = await readJson(req);
    const email = normalizeEmail(b.email);
    const code = codeOf(b.code);
    if (!email || !code) throw new HttpError(400, 'E-posta adresi ve 6 haneli kod gerekli');
    assertMailOn();
    if (!(await checkCode('email', email, code, b.challenge, clientIp(req)))) throw new HttpError(400, 'Kod yanlış');
    const dev = await deviceOf(b);
    await deviceGate(
      dev,
      b,
      async () => (await db.query(BY_IDENTITY, ['email', email])).rows[0] ?? (await googleAccountWith(db, email)) ?? (await deviceAccountWithout(db, b.deviceKey, 'email')),
    );
    const { u, isNew } = await accountForEmail(email, dev, b.deviceKey);
    return signedIn(u, dev, b, { isNew });
  },

  /** Sign in with Google. Off (503) until GOOGLE_CLIENT_IDS is set in .env (docs/SUNUCU.md). */
  async 'POST /api/auth/google'(req) {
    if (!googleClientIds().length) throw Object.assign(new HttpError(503, 'Google ile giriş henüz açık değil'), { feature: 'google' });
    const b = await readJson(req);
    const g = await verifyGoogleIdToken(b.idToken);
    const dev = await deviceOf(b);
    await deviceGate(dev, b, async () => (await db.query(BY_IDENTITY, ['google', g.sub])).rows[0] ?? (await emailAccountFor(db, g)));
    const { u, isNew } = await accountForGoogle(g, dev, b.deviceKey);
    return signedIn(u, dev, b, { isNew });
  },

  async 'POST /api/auth/logout'(req) {
    const u = await auth(req);
    const { all } = await readJson(req);
    if (all === true) await db.query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
    else await db.query('DELETE FROM sessions WHERE token_hash = $1', [u.session_hash]);
    return { loggedOut: true };
  },

  /** Active sessions for Settings → Aktif oturumlar. `id` is a prefix of the hash, never the token. */
  async 'GET /api/sessions'(req) {
    const u = await auth(req);
    const r = await db.query('SELECT token_hash, device, created_at, last_seen_at FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC', [u.id]);
    return {
      sessions: r.rows.map((s) => ({ id: s.token_hash.slice(0, 16), device: s.device, createdAt: s.created_at, lastSeenAt: s.last_seen_at, current: s.token_hash === u.session_hash })),
    };
  },

  async 'POST /api/sessions/revoke'(req) {
    const u = await auth(req);
    const { id } = await readJson(req);
    if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) throw new HttpError(400, 'Geçersiz oturum');
    const r = await db.query('DELETE FROM sessions WHERE user_id = $1 AND left(token_hash, 16) = $2', [u.id, id]);
    return { revoked: r.rowCount > 0 };
  },

  /** Ayarlar → E-posta ekle / değiştir, step 1: a code to the new address. */
  async 'POST /api/me/email/start'(req) {
    const u = await auth(req);
    const email = normalizeEmail((await readJson(req)).email);
    if (!email) throw new HttpError(400, 'Geçerli bir e-posta adresi yaz');
    assertMailOn();
    const old = (await db.query("SELECT subject FROM auth_identities WHERE provider = 'email' AND user_id = $1", [u.id])).rows[0];
    if (old?.subject === email) throw new HttpError(400, 'Bu adres zaten hesabına bağlı');
    if (old) assertRecentSignIn(u);
    return startEmail(email, clientIp(req), 'link');
  },

  /**
   * Step 2: the code. The address becomes this account's e-mail sign-in (replacing an earlier one, which is told
   * by mail). 409 when another live account signs in with it, by e-mail or by Google.
   */
  async 'POST /api/me/email/verify'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const email = normalizeEmail(b.email);
    const code = codeOf(b.code);
    if (!email || !code) throw new HttpError(400, 'E-posta adresi ve 6 haneli kod gerekli');
    assertMailOn();
    const had = (await db.query("SELECT subject FROM auth_identities WHERE provider = 'email' AND user_id = $1", [u.id])).rows[0];
    if (had && had.subject !== email) assertRecentSignIn(u);
    const ip = clientIp(req);
    if (!(await checkCode('email', email, code, b.challenge, ip))) throw new HttpError(400, 'Kod yanlış');
    const taken = () => new HttpError(409, 'Bu e-posta başka bir hesaba bağlı');
    let replaced = null;
    try {
      const fresh = await tx(async (c) => {
        const me = (await c.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [u.id])).rows[0];
        if (!me) throw new HttpError(404, 'Hesap bulunamadı');
        const other = await c.query(
          `SELECT 1 FROM auth_identities i JOIN users x ON x.id = i.user_id
            WHERE i.user_id <> $1 AND x.deleted_at IS NULL AND ((i.provider = 'email' AND i.subject = $2) OR (i.provider = 'google' AND lower(i.email) = $2)) LIMIT 1`,
          [u.id, email],
        );
        if (other.rowCount) throw taken();
        const old = (await c.query("SELECT subject FROM auth_identities WHERE provider = 'email' AND user_id = $1", [u.id])).rows[0];
        if (old?.subject === email) return me;
        if (old) assertRecentSignIn(u);
        if (old) await c.query("UPDATE auth_identities SET subject = $2, email = $2, created_at = now(), last_used_at = now() WHERE provider = 'email' AND user_id = $1", [u.id, email]);
        else await c.query("INSERT INTO auth_identities (provider, subject, user_id, email) VALUES ('email', $2, $1, $2)", [u.id, email]);
        await auditEvent(c, u.id, old ? 'email_changed' : 'email_linked', {}, ip);
        replaced = old?.subject ?? null;
        return me;
      });
      if (replaced) await sendNotice(replaced, 'email_changed', { newEmail: email });
      return { user: await withSignIn(fresh) };
    } catch (e) {
      if (e.code === '23505') throw taken();
      throw e;
    }
  },

  /**
   * Ayarlar → Telefonunu doğrula by SMS, step 1. Off (503, feature 'sms') until SMS_PROVIDER is set and while
   * OTP_GLOBAL_PER_HOUR is 0.
   */
  async 'POST /api/me/phone/start'(req) {
    const u = await auth(req);
    assertSmsStart();
    const phone = normalizePhone((await readJson(req)).phone);
    if (!phone) throw new HttpError(400, 'Geçerli bir telefon numarası yaz');
    if (u.phone === phone) throw new HttpError(400, 'Bu numara zaten doğrulanmış');
    if (u.phone) assertRecentSignIn(u);
    const review = isReview('sms', phone);
    if (!review && !phoneCountryOk(phone)) throw new HttpError(400, 'Bu ülkenin numaraları henüz doğrulanamıyor');
    return startCode('sms', phone, clientIp(req), review ? noSend : (code) => sendCode(phone, code));
  },

  /** Step 2: the code. The number becomes the account's verified phone; 409 when another account has it. */
  async 'POST /api/me/phone/verify'(req) {
    const u = await auth(req);
    assertSmsVerify();
    const b = await readJson(req);
    const phone = normalizePhone(b.phone);
    const code = codeOf(b.code);
    if (!phone || !code) throw new HttpError(400, 'Telefon numarası ve 6 haneli kod gerekli');
    if (u.phone && u.phone !== phone) assertRecentSignIn(u);
    if (!(await checkCode('sms', phone, code, b.challenge, clientIp(req)))) throw new HttpError(400, 'Kod yanlış');
    return { user: await withSignIn(await setPhone(u.id, phone, 'sms', clientIp(req))) };
  },
};
