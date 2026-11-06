// Checking a phone number for free over WhatsApp (Ayarlar → Telefonunu doğrula), instead of an SMS we pay for.
// The app opens wa.me with a ready message "Similar Club numaramı doğrula: SC-XXXXXX" to our WhatsApp Business
// number; the person taps send, and Meta's signed webhook tells us which number sent it. WhatsApp itself
// checked that the sender owns the number. Off (503, feature 'whatsapp') unless WHATSAPP_NUMBER and
// WHATSAPP_APP_SECRET are set (docs/SUNUCU.md):
//
//   POST /api/me/phone/whatsapp                         → { link, expiresIn }       (5 per hour per account)
//   GET  /api/me/phone/status                           → { phone, pending, result }  the app polls it
//   GET  /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…  → the challenge (text)
//   POST /api/webhooks/whatsapp   (Meta, X-Hub-Signature-256)                       → { received: true }
//
// result: null (waiting), 'verified', 'taken' (another account has the number), 'country' (not OTP_COUNTRIES),
// 'no_number' (Meta sent no usable number) or 'expired' (10 minutes passed without a message). Only a hash of
// the nonce is kept, never the number (a verified one is on the account); claims go after a day (auth.mjs
// startOtpSweep). Replacing a number the account already has needs a recent sign-in (auth.mjs assertRecentSignIn).
//   WHATSAPP_NUMBER        our number as digits, e.g. 905xxxxxxxxx
//   WHATSAPP_APP_SECRET    the Meta app's secret: signs every webhook call
//   WHATSAPP_VERIFY_TOKEN  any long random text, also typed into Meta's webhook settings (the handshake)
import crypto from 'node:crypto';

import { assertRecentSignIn, normalizePhone, phoneCountryOk, setPhone } from './auth.mjs';
import { HttpError, RawText, auth, db, env, readRaw, same, sha, tx } from './core.mjs';
import { whatsappOnOf } from './features.mjs';

const ON = whatsappOnOf(env);
const NUMBER = String(env.WHATSAPP_NUMBER ?? '').replace(/\D/g, '');
const SECRET = String(env.WHATSAPP_APP_SECRET ?? '').trim();
const VERIFY_TOKEN = String(env.WHATSAPP_VERIFY_TOKEN ?? '').trim();
const CLAIM_SECONDS = 600;
const PER_HOUR = 5;
/** No 0/O, 1/I: easy to read back. 32 letters, so each random byte maps evenly. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NONCE = /\bSC-([A-HJ-NP-Z2-9]{6})\b/i;
const hashOf = (nonce) => sha(`wa:${nonce.toUpperCase()}`);
if (ON) console.log('whatsapp phone check on');

function assertWhatsappOn() {
  if (!ON) throw Object.assign(new HttpError(503, 'WhatsApp ile doğrulama henüz açık değil'), { feature: 'whatsapp', extra: { feature: 'whatsapp' } });
}

/** One message from Meta: the claim for its nonce gets its result (a repeat delivery changes nothing). */
async function claimFrom(text, from) {
  const m = NONCE.exec(String(text ?? ''));
  if (!m) return;
  const claim = (await db.query('SELECT * FROM phone_claims WHERE nonce_hash = $1', [hashOf(m[1])])).rows[0];
  if (!claim || claim.result || new Date(claim.expires_at) < new Date()) return;
  const phone = normalizePhone(`+${String(from ?? '').replace(/\D/g, '')}`);
  let result = 'verified';
  if (!phone) result = 'no_number';
  else if (!phoneCountryOk(phone)) result = 'country';
  else {
    try {
      await setPhone(claim.user_id, phone, 'whatsapp');
    } catch (e) {
      if (e.code === 404) return;
      if (e.code !== 409) throw e;
      result = 'taken';
    }
  }
  await db.query('UPDATE phone_claims SET result = $2, done_at = now() WHERE nonce_hash = $1 AND result IS NULL', [claim.nonce_hash, result]);
}

export const whatsappRoutes = {
  /** A wa.me link with a fresh one-time text; valid 10 minutes. */
  async 'POST /api/me/phone/whatsapp'(req) {
    const u = await auth(req);
    assertWhatsappOn();
    if (u.phone) assertRecentSignIn(u);
    const nonce = Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % 32]).join('');
    await tx(async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await c.query("DELETE FROM phone_claims WHERE user_id = $1 AND created_at < now() - interval '1 day'", [u.id]);
      const n = Number((await c.query("SELECT count(*) AS n FROM phone_claims WHERE user_id = $1 AND created_at > now() - interval '1 hour'", [u.id])).rows[0].n);
      if (n >= PER_HOUR) throw new HttpError(429, 'Çok fazla deneme, bir saat sonra tekrar dene');
      await c.query('INSERT INTO phone_claims (nonce_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3::int))', [hashOf(nonce), u.id, CLAIM_SECONDS]);
    });
    return { link: `https://wa.me/${NUMBER}?text=${encodeURIComponent(`Similar Club numaramı doğrula: SC-${nonce}`)}`, expiresIn: CLAIM_SECONDS };
  },

  /** The latest WhatsApp check of this account. */
  async 'GET /api/me/phone/status'(req) {
    const u = await auth(req);
    assertWhatsappOn();
    const c = (await db.query('SELECT result, expires_at FROM phone_claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [u.id])).rows[0];
    const open = !!c && !c.result && new Date(c.expires_at) > new Date();
    return { phone: u.phone ?? null, pending: open, result: !c ? null : (c.result ?? (open ? null : 'expired')) };
  },

  /** Meta's handshake when the webhook is set up: echo the challenge if the verify token matches. */
  async 'GET /api/webhooks/whatsapp'(req, url) {
    assertWhatsappOn();
    const token = url.searchParams.get('hub.verify_token') ?? '';
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (url.searchParams.get('hub.mode') !== 'subscribe' || !VERIFY_TOKEN || !same(token, VERIFY_TOKEN) || !/^[A-Za-z0-9_-]{1,100}$/.test(challenge)) {
      throw new HttpError(403, 'Doğrulama başarısız');
    }
    return new RawText(challenge);
  },

  /** Messages to our number. Only a call signed with the app secret counts; a signed call always gets 200. */
  async 'POST /api/webhooks/whatsapp'(req) {
    assertWhatsappOn();
    const raw = await readRaw(req, 256_000);
    const sig = String(req.headers['x-hub-signature-256'] ?? '');
    const want = `sha256=${crypto.createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex')}`;
    if (!/^sha256=[0-9a-f]{64}$/.test(sig) || !same(sig, want)) throw new HttpError(401, 'İmza geçersiz');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return { received: true };
    }
    for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        for (const msg of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
          if (msg?.type === 'text') await claimFrom(msg.text?.body, msg.from);
        }
      }
    }
    return { received: true };
  },
};
