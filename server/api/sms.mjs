// Sending the sign-in code by SMS. The provider is chosen with SMS_PROVIDER in the server's .env:
//
//   netgsm  NETGSM_USER, NETGSM_PASS, NETGSM_HEADER (approved sender name)   Netgsm REST v2
//   twilio  TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM (number or MG… service id)  Twilio Messages API
//   log     writes "otp <phone> <code>" to the API log; for tests and a private staging server only
//
// Without SMS_PROVIDER, phone sign-in answers 503 and the app keeps the development sign-in.
import { HttpError, env } from './core.mjs';

export const smsProvider = env.SMS_PROVIDER ?? '';

const text = (code) => `Similar Club giriş kodun: ${code}. Kodu kimseyle paylaşma.`;

async function netgsm(phone, code) {
  const auth = Buffer.from(`${env.NETGSM_USER}:${env.NETGSM_PASS}`).toString('base64');
  const r = await fetch('https://api.netgsm.com.tr/sms/rest/v2/send', {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    // Netgsm wants the number without "+".
    body: JSON.stringify({ msgheader: env.NETGSM_HEADER, encoding: 'TR', messages: [{ msg: text(code), no: phone.replace(/^\+/, '') }] }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== '00') throw new Error(`netgsm ${r.status} ${j.code ?? ''} ${j.description ?? ''}`);
}

async function twilio(phone, code) {
  const from = env.TWILIO_FROM ?? '';
  const body = new URLSearchParams({ To: phone, Body: text(code), ...(from.startsWith('MG') ? { MessagingServiceSid: from } : { From: from }) });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`twilio ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Sends the code; a provider failure becomes a 502 the app can show, the details go to the log. */
export async function sendCode(phone, code) {
  try {
    if (smsProvider === 'netgsm') return await netgsm(phone, code);
    if (smsProvider === 'twilio') return await twilio(phone, code);
    if (smsProvider === 'log') return void console.log(`otp ${phone} ${code}`);
  } catch (e) {
    console.error('sms failed', String(e).slice(0, 300));
    throw new HttpError(502, 'SMS gönderilemedi, biraz sonra tekrar dene');
  }
  throw new HttpError(503, 'Telefonla giriş henüz açık değil');
}
