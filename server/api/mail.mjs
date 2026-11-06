// Sending the e-mail sign-in code, shaped like sms.mjs. MAIL_PROVIDERS in the server's .env is an ordered,
// comma separated list of:
//
//   brevo   BREVO_API_KEY; at most BREVO_DAILY codes (290) per UTC day    Brevo transactional e-mail API
//   resend  RESEND_API_KEY; at most RESEND_DAILY codes (95) per UTC day   Resend e-mail API
//   log     writes "otp-email <address> <code>" (and "mail-notice <address> <kind>") to the API log; for tests
//           and a private staging server only
//
// MAIL_FROM is the sender (e.g. "Similar Club <kod@alanadi.com>", needed by brevo and resend); MAIL_REPLY_TO an
// optional reply address (a destek@ mailbox, if there is one). A provider without its key or MAIL_FROM is left
// out. Each code first takes one from that provider's count for the day (mail_quota) and then goes out over
// HTTPS; a used-up count, a refusal, a 429, a 5xx or a timeout hands the code to the next provider.
//   - every provider used up for the day → 429 (Google still works)
//   - every provider failed              → 502 (the person may ask again right away)
//   - no provider set                    → 503 with feature 'email' (e-mail sign-in off; the app hides it)
// BREVO_URL / RESEND_URL are for the tests only: honoured just for an http://127.0.0.1 or localhost address,
// so the API keys never go anywhere else.
//
// Before a code goes out, assertDeliverable() refuses throwaway-address domains and domains with no mail server
// (no MX record), so typos like "gmial.com" fail at once instead of eating the daily quota. EMAIL_MX_CHECK=0
// turns the MX look-up off; EMAIL_DNS_SERVER (127.0.0.1:port only) is for the tests.
import { Resolver } from 'node:dns/promises';
import { domainToASCII } from 'node:url';

import { HttpError, db, env } from './core.mjs';

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
const KNOWN = ['brevo', 'resend', 'log'];
const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const listOf = (s) => [
  ...new Set(
    String(s ?? '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  ),
];

/** The providers that can send, in order: listed in MAIL_PROVIDERS of `e` and configured there. */
export function mailProvidersOf(e = env) {
  const from = String(e.MAIL_FROM ?? '').trim();
  return listOf(e.MAIL_PROVIDERS).filter((p) => p === 'log' || (p === 'brevo' && !!e.BREVO_API_KEY && !!from) || (p === 'resend' && !!e.RESEND_API_KEY && !!from));
}

export const mailProviders = mailProvidersOf();
/** E-mail sign-in is on when at least one provider can send. */
export const mailOn = mailProviders.length > 0;
/** The daily free quota we allow ourselves per provider (a little under the provider's own). */
export const MAIL_DAILY = { brevo: positive(env.BREVO_DAILY, 290), resend: positive(env.RESEND_DAILY, 95) };
{
  const listed = listOf(env.MAIL_PROVIDERS);
  const unknown = listed.filter((p) => !KNOWN.includes(p));
  const unset = listed.filter((p) => KNOWN.includes(p) && !mailProviders.includes(p));
  if (unknown.length) console.warn(`MAIL_PROVIDERS: unknown ${unknown.join(', ')} (known: ${KNOWN.join(', ')})`);
  if (unset.length) console.warn(`MAIL_PROVIDERS: ${unset.join(', ')} left out (API key or MAIL_FROM missing)`);
  if (mailProviders.length) console.log(`mail providers: ${mailProviders.join(', ')}`);
}

const URLS = {
  brevo: LOCAL.test(env.BREVO_URL ?? '') ? env.BREVO_URL : 'https://api.brevo.com/v3/smtp/email',
  resend: LOCAL.test(env.RESEND_URL ?? '') ? env.RESEND_URL : 'https://api.resend.com/emails',
};
const FROM = String(env.MAIL_FROM ?? '').trim();
const REPLY_TO = String(env.MAIL_REPLY_TO ?? '').trim();
/** "Name <address>" or a bare address → { name, email }. */
const sender = (() => {
  const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(FROM);
  return m ? { name: m[1].replace(/^"|"$/g, '').trim() || 'Similar Club', email: m[2] } : { name: 'Similar Club', email: FROM };
})();

// --- Addresses -----------------------------------------------------------------------------------------------
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * An address as we keep it, or null: trimmed, NFC, lower case, an ASCII local part (dots and "+tags" kept as
 * typed, so Gmail's a.b+x@ stays its own address) and the domain in ASCII (IDN → punycode) with a real TLD.
 */
export function normalizeEmail(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().normalize('NFC').toLowerCase();
  if (s.length > 254) return null;
  const at = s.split('@');
  if (at.length !== 2) return null;
  const [local, rawDomain] = at;
  if (!LOCAL_PART.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  const domain = domainToASCII(rawDomain);
  if (!domain || domain.length > 253 || !domain.includes('.')) return null;
  const labels = domain.split('.');
  if (!labels.every((l) => LABEL.test(l)) || /^\d+$/.test(labels.at(-1))) return null;
  const email = `${local}@${domain}`;
  return email.length <= 254 ? email : null;
}

const GMAIL = new Set(['gmail.com', 'googlemail.com']);
/** True for a Gmail address: there the Google account and the mailbox are one and the same. */
export const isGmail = (email) => GMAIL.has(email.slice(email.lastIndexOf('@') + 1));

/**
 * The mailbox an address is delivered to, for counting codes per address: without a "+tag", and for Gmail
 * without dots, so a.li+1@gmail.com and ali+2@gmail.com count as one.
 */
export function mailboxOf(email) {
  const at = email.lastIndexOf('@');
  let local = email.slice(0, at).split('+')[0] || email.slice(0, at);
  let domain = email.slice(at + 1);
  if (GMAIL.has(domain)) {
    domain = 'gmail.com';
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

/** Throwaway-address services (and their subdomains): an account on one is lost the day the inbox expires. */
const DISPOSABLE = new Set(
  (
    'mailinator.com guerrillamail.com guerrillamail.net guerrillamail.org guerrillamailblock.com sharklasers.com grr.la ' +
    'spam4.me yopmail.com yopmail.fr yopmail.net 10minutemail.com 10minutemail.net temp-mail.org tempmail.com tempmail.net ' +
    'tempmailo.com tempmail.plus tempr.email throwawaymail.com trashmail.com trashmail.de getnada.com nada.email dispostable.com ' +
    'maildrop.cc mailnesia.com mintemail.com mohmal.com emailondeck.com fakeinbox.com burnermail.io mailpoof.com ' +
    'mail.tm mail.gw moakt.com tmpmail.org tmpmail.net discard.email dropmail.me 33mail.com spambox.us'
  ).split(' '),
);
const disposable = (domain) => {
  for (let d = domain; d.includes('.'); d = d.slice(d.indexOf('.') + 1)) if (DISPOSABLE.has(d)) return true;
  return false;
};

const MX_CHECK = env.EMAIL_MX_CHECK !== '0';
const resolver = new Resolver({ timeout: 3000, tries: 1 });
if (/^127\.0\.0\.1:\d+$/.test(env.EMAIL_DNS_SERVER ?? '')) resolver.setServers([env.EMAIL_DNS_SERVER]);
/** domain → { ok, until }: a found mail server is remembered for an hour, a missing one for 10 minutes. */
const mxCache = new Map();

/** True / false when the domain has / has no mail server; null when DNS did not answer (then we send anyway). */
async function hasMailServer(domain) {
  const hit = mxCache.get(domain);
  if (hit && hit.until > Date.now()) return hit.ok;
  let ok;
  let timer;
  try {
    const late = new Promise((_, no) => (timer = setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 3500)));
    const mx = await Promise.race([resolver.resolveMx(domain), late]);
    // RFC 7505 "null MX" (a single record with exchange ".") says the domain takes no mail.
    ok = mx.some((r) => r.exchange && r.exchange !== '.');
  } catch (e) {
    if (e.code !== 'ENOTFOUND' && e.code !== 'ENODATA') {
      console.warn(`mx look-up failed (${e.code ?? e.message}): sending anyway`);
      return null;
    }
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  if (mxCache.size > 5000) mxCache.clear();
  mxCache.set(domain, { ok, until: Date.now() + (ok ? 3_600_000 : 600_000) });
  return ok;
}

/** 400 for a throwaway address or a domain without a mail server; a DNS outage lets the code go out. */
export async function assertDeliverable(email) {
  const domain = email.slice(email.indexOf('@') + 1);
  if (disposable(domain)) throw new HttpError(400, 'Geçici e-posta adresleri kullanılamaz, kendi adresini yaz');
  if (MX_CHECK && (await hasMailServer(domain)) === false) throw new HttpError(400, 'Bu adrese e-posta gitmiyor, adresi kontrol et');
}

/** E-mail addresses out of a provider's error text: the log goes to Sentry. */
const masked = (s) => String(s).replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[e-posta]').slice(0, 300);

/** The mail: subject, plain text and a simple HTML version (no images, links or tracking). */
export function mailOf(code, minutes, purpose = 'sign_in') {
  const what = purpose === 'link' ? 'e-posta doğrulama kodun' : 'giriş kodun';
  const rest = `Kod ${minutes} dakika geçerli. Kimseyle paylaşma; ekibimiz kodu asla sormaz. Bu isteği sen yapmadıysan bu e-postayı yok say.`;
  return {
    subject: `Similar Club kodun: ${code}`,
    text: `Similar Club ${what}: ${code}. ${rest}`,
    html:
      '<!doctype html><html lang="tr"><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;background:#ffffff">' +
      `<p style="margin:0 0 12px;font-size:16px">Similar Club ${what}:</p>` +
      `<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p>` +
      `<p style="margin:0;font-size:14px;line-height:1.5;color:#555555">${rest}</p></body></html>`,
  };
}

/** A short security notice (no code, no link): `kind` 'email_changed', with the new address masked. */
export function noticeOf(kind, { newEmail = '' } = {}) {
  const at = newEmail.lastIndexOf('@');
  const shown = at > 0 ? `${newEmail[0]}***@${newEmail.slice(at + 1)}` : 'yeni bir adres';
  const text =
    kind === 'email_changed'
      ? `Similar Club hesabının giriş e-postası bu adresten ${shown} adresine değiştirildi. Bunu sen yapmadıysan hemen destek ekibimize yaz; bu adresle artık giriş yapılamaz.`
      : 'Similar Club hesabında bir güvenlik değişikliği yapıldı. Bunu sen yapmadıysan hemen destek ekibimize yaz.';
  return {
    subject: 'Similar Club: hesabının e-postası değişti',
    text,
    html:
      '<!doctype html><html lang="tr"><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f;background:#ffffff">' +
      `<p style="margin:0;font-size:15px;line-height:1.5">${text.replace(/[<>&]/g, '')}</p></body></html>`,
  };
}

async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

const SEND = {
  brevo: (to, m) =>
    post(URLS.brevo, { 'api-key': env.BREVO_API_KEY }, {
      sender,
      to: [{ email: to }],
      subject: m.subject,
      textContent: m.text,
      htmlContent: m.html,
      ...(REPLY_TO ? { replyTo: { email: REPLY_TO } } : {}),
    }),
  resend: (to, m) =>
    post(URLS.resend, { authorization: `Bearer ${env.RESEND_API_KEY}` }, { from: FROM, to: [to], subject: m.subject, text: m.text, html: m.html, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) }),
};

/** Takes one from the provider's count for today; null when it is used up. Returns the day. */
async function reserve(p) {
  const r = await db.query(
    `INSERT INTO mail_quota (provider, day, sent) VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
     ON CONFLICT (provider, day) DO UPDATE SET sent = mail_quota.sent + 1 WHERE mail_quota.sent < $2 RETURNING day`,
    [p, MAIL_DAILY[p]],
  );
  return r.rows[0]?.day ?? null;
}
const release = (p, day) => db.query('UPDATE mail_quota SET sent = greatest(sent - 1, 0) WHERE provider = $1 AND day = $2', [p, day]);

/** The last outcomes (true = sent), newest last: the mail_failing alarm (alerts.mjs). */
const recent = [];
const record = (ok) => {
  recent.push(ok);
  if (recent.length > 10) recent.shift();
};
/** True when the last 10 codes could not be sent by any provider. */
export const mailFailing = () => recent.length >= 10 && recent.every((x) => !x);

/** 503 for every e-mail route while no provider is set. */
export function assertMailOn() {
  if (!mailOn) throw Object.assign(new HttpError(503, 'E-posta ile giriş henüz açık değil'), { feature: 'email', extra: { feature: 'email' } });
}

/**
 * A security notice to `to` (noticeOf), best effort: the first provider that takes it; a failure is only
 * logged (without the address). Returns the provider or null. Never throws.
 */
export async function sendNotice(to, kind, more = {}) {
  if (!mailOn) return null;
  const m = noticeOf(kind, more);
  for (const p of mailProviders) {
    if (p === 'log') {
      console.log(`mail-notice ${to} ${kind}`);
      return p;
    }
    const day = await reserve(p).catch(() => null);
    if (!day) continue;
    try {
      await SEND[p](to, m);
      return p;
    } catch (e) {
      console.error(`mail ${p} notice failed`, masked(e));
      if (e?.name !== 'TimeoutError') await release(p, day).catch(() => {});
    }
  }
  return null;
}

/**
 * Sends the code to `to`, trying each provider in order; returns the provider that took it. `purpose`:
 * 'sign_in' or 'link' (adding the address in Ayarlar). Throws 429 / 502 / 503 as above.
 */
export async function sendMail(to, code, { minutes, purpose = 'sign_in' }) {
  assertMailOn();
  const m = mailOf(code, minutes, purpose);
  let failed = 0;
  for (const p of mailProviders) {
    if (p === 'log') {
      console.log(`otp-email ${to} ${code}`);
      record(true);
      return p;
    }
    const day = await reserve(p);
    if (!day) continue;
    try {
      await SEND[p](to, m);
      record(true);
      return p;
    } catch (e) {
      failed++;
      console.error(`mail ${p} failed`, masked(e));
      // A timeout may still have been sent: it keeps its place in the count. Anything else gives it back.
      if (e?.name !== 'TimeoutError') await release(p, day).catch(() => {});
    }
  }
  if (!failed) {
    console.error(`mail quota used up for today (${mailProviders.map((p) => `${p} ${MAIL_DAILY[p] ?? '-'}`).join(', ')})`);
    throw new HttpError(429, 'Bugün çok fazla kod gönderildi; Google ile gir ya da yarın tekrar dene');
  }
  record(false);
  throw new HttpError(502, 'E-posta gönderilemedi, biraz sonra tekrar dene');
}
