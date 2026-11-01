// Signing in and sessions.
//
//   POST /api/auth/dev         { deviceKey, name?, device? }               → { session, user }   (ALLOW_DEV_AUTH)
//   POST /api/auth/otp/start   { phone }                                   → { sent, retryAfter }
//   POST /api/auth/otp/verify  { phone, code, name?, deviceKey?, device? } → { session, user, isNew }
//   POST /api/auth/logout      { all? }                                    → { loggedOut }
//   GET  /api/sessions                                                     → { sessions }
//   POST /api/sessions/revoke  { id }                                      → { revoked }
//
// Phone sign-in: a 6-digit code by SMS (sms.mjs), kept only as a hash, valid 5 minutes, 5 tries, a new code
// every 60 seconds and at most 5 per hour per number. Only numbers starting with OTP_COUNTRIES (default +90)
// can ask for a code, so nobody can make us pay for SMS to premium numbers abroad. A device that already has
// a development account keeps it (and its wallet) when it signs in with a phone for the first time.
// App Store / Play reviewers: OTP_REVIEW_PHONE + OTP_REVIEW_CODE sign in without an SMS.
import crypto from 'node:crypto';

import { HttpError, auth, db, env, newSession, readJson, selfUser, sha, tx } from './core.mjs';
import { sendCode, smsProvider } from './sms.mjs';

const DEV_AUTH = env.ALLOW_DEV_AUTH !== '0';
const COUNTRIES = (env.OTP_COUNTRIES ?? '+90').split(',').map((s) => s.trim()).filter(Boolean);
const REVIEW_PHONE = env.OTP_REVIEW_PHONE ?? '';
const REVIEW_CODE = env.OTP_REVIEW_CODE ?? '';
const CODE_MINUTES = 5;
const MAX_TRIES = 5;
const RESEND_SECONDS = 60;
const MAX_PER_HOUR = 5;
const DEVICE_KEY = /^[A-Za-z0-9_-]{32,128}$/;

/** A phone number as E.164, or null. Turkish forms (0532…, 532…, 90532…) become +90…. */
export function normalizePhone(v) {
  if (typeof v !== 'string') return null;
  let d = v.replace(/[\s().-]/g, '');
  if (/^0?5\d{9}$/.test(d)) d = `+90${d.replace(/^0/, '')}`;
  else if (/^905\d{9}$/.test(d)) d = `+${d}`;
  else if (/^00[1-9]\d{7,14}$/.test(d)) d = `+${d.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const codeHash = (phone, code) => sha(`otp:${phone}:${code}`);
const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : '');

function notBanned(u) {
  if (u.banned_until && new Date(u.banned_until) > new Date()) throw new HttpError(403, `Hesabın ${new Date(u.banned_until).toISOString().slice(0, 10)} tarihine kadar askıya alındı`);
}

/** Checks the code. A wrong code counts a try (and is committed); an expired or used-up one is refused. */
async function checkCode(phone, code) {
  if (REVIEW_PHONE && phone === REVIEW_PHONE) return !!REVIEW_CODE && same(code, REVIEW_CODE);
  return tx(async (c) => {
    const row = (await c.query('SELECT * FROM otp_codes WHERE phone = $1 FOR UPDATE', [phone])).rows[0];
    if (!row || new Date(row.expires_at) < new Date()) throw new HttpError(400, 'Kodun süresi doldu, yeni kod iste');
    if (row.attempts >= MAX_TRIES) throw new HttpError(429, 'Çok fazla yanlış deneme, yeni kod iste');
    const good = same(codeHash(phone, code), row.code_hash);
    if (good) await c.query('DELETE FROM otp_codes WHERE phone = $1', [phone]);
    else await c.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1', [phone]);
    return good;
  });
}

/** The account for a verified phone: its own, the device's development account, or a new one. */
async function accountFor(phone, name, deviceKey) {
  const found = (await db.query('SELECT * FROM users WHERE phone = $1', [phone])).rows[0];
  if (found) return { u: found, isNew: false };
  if (typeof deviceKey === 'string' && DEVICE_KEY.test(deviceKey)) {
    const r = await db.query('UPDATE users SET phone = $2 WHERE device_key_hash = $1 AND phone IS NULL AND deleted_at IS NULL RETURNING *', [sha(`device:${deviceKey}`), phone]);
    if (r.rowCount) return { u: r.rows[0], isNew: false };
  }
  try {
    const r = await db.query('INSERT INTO users (name, phone) VALUES ($1, $2) RETURNING *', [cleanName(name) || 'Yeni üye', phone]);
    return { u: r.rows[0], isNew: true };
  } catch (e) {
    // The same number verified twice at once: the other request created it.
    if (e.code !== '23505') throw e;
    return { u: (await db.query('SELECT * FROM users WHERE phone = $1', [phone])).rows[0], isNew: false };
  }
}

export const authRoutes = {
  /** Development sign-in with a random key kept on the device. Closed at launch with ALLOW_DEV_AUTH=0. */
  async 'POST /api/auth/dev'(req) {
    if (!DEV_AUTH) throw new HttpError(403, 'Bu giriş yöntemi kapalı');
    const { deviceKey, name, device } = await readJson(req);
    if (typeof deviceKey !== 'string' || !DEVICE_KEY.test(deviceKey)) throw new HttpError(400, 'Geçersiz cihaz anahtarı');
    const clean = cleanName(name);
    const hash = sha(`device:${deviceKey}`);
    let u = (await db.query('SELECT * FROM users WHERE device_key_hash = $1', [hash])).rows[0];
    if (!u) {
      if (!clean) throw new HttpError(400, 'Ad gerekli');
      u = (await db.query('INSERT INTO users (name, device_key_hash) VALUES ($1, $2) ON CONFLICT (device_key_hash) DO UPDATE SET name = users.name RETURNING *', [clean, hash])).rows[0];
    }
    notBanned(u);
    return { session: await newSession(u.id, device), user: selfUser(u) };
  },

  async 'POST /api/auth/otp/start'(req) {
    const phone = normalizePhone((await readJson(req)).phone);
    if (!phone) throw new HttpError(400, 'Geçerli bir telefon numarası yaz');
    if (REVIEW_PHONE && phone === REVIEW_PHONE) return { sent: true, retryAfter: RESEND_SECONDS };
    if (!COUNTRIES.some((p) => phone.startsWith(p))) throw new HttpError(400, 'Bu ülkenin numaralarıyla giriş henüz açık değil');
    if (!smsProvider) throw new HttpError(503, 'Telefonla giriş henüz açık değil');
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    try {
      await tx(async (c) => {
        const row = (await c.query('SELECT * FROM otp_codes WHERE phone = $1 FOR UPDATE', [phone])).rows[0];
        if (!row) {
          await c.query(`INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '${CODE_MINUTES} minutes')`, [phone, codeHash(phone, code)]);
          return;
        }
        const wait = RESEND_SECONDS - (Date.now() - new Date(row.sent_at).getTime()) / 1000;
        if (wait > 0) throw new HttpError(429, `Yeni kod için ${Math.ceil(wait)} saniye bekle`);
        const inWindow = Date.now() - new Date(row.window_start).getTime() < 3_600_000;
        if (inWindow && row.sent_count >= MAX_PER_HOUR) throw new HttpError(429, 'Bu numaraya çok fazla kod gönderildi, bir saat sonra tekrar dene');
        await c.query(
          `UPDATE otp_codes SET code_hash = $2, expires_at = now() + interval '${CODE_MINUTES} minutes', attempts = 0, sent_at = now(),
             sent_count = CASE WHEN $3 THEN sent_count + 1 ELSE 1 END, window_start = CASE WHEN $3 THEN window_start ELSE now() END
           WHERE phone = $1`,
          [phone, codeHash(phone, code), inWindow],
        );
      });
    } catch (e) {
      if (e.code === '23505') throw new HttpError(429, `Yeni kod için ${RESEND_SECONDS} saniye bekle`);
      throw e;
    }
    try {
      await sendCode(phone, code);
    } catch (e) {
      // Not sent: let the person ask again right away (the hourly count still applies).
      await db.query("UPDATE otp_codes SET sent_at = 'epoch' WHERE phone = $1", [phone]);
      throw e;
    }
    return { sent: true, retryAfter: RESEND_SECONDS };
  },

  async 'POST /api/auth/otp/verify'(req) {
    const b = await readJson(req);
    const phone = normalizePhone(b.phone);
    const code = typeof b.code === 'string' && /^\d{6}$/.test(b.code) ? b.code : null;
    if (!phone || !code) throw new HttpError(400, 'Telefon numarası ve 6 haneli kod gerekli');
    if (!(await checkCode(phone, code))) throw new HttpError(400, 'Kod yanlış');
    const { u, isNew } = await accountFor(phone, b.name, b.deviceKey);
    notBanned(u);
    return { session: await newSession(u.id, b.device), user: selfUser(u), isNew };
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
};
