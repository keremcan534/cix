// Remote control of the app from .env (docs/SUNUCU.md, "Hata izleme ve acil durum"): the minimum app version,
// an update link, a notice banner, and a kill switch per feature. Changing .env needs only
// `docker compose up -d api`.
//
//   GET /api/config (public, cacheable 30 s) → { minVersion, updateUrl, notice, featuresOff, signIn, verify }
//
//   APP_MIN_VERSION  e.g. 1.0.3: older apps show a blocking "Güncelleme gerekli" screen
//   APP_UPDATE_URL   where that screen sends people (store page or APK download), https only
//   APP_NOTICE       a short banner text shown in the app (empty = none)
//   FEATURES_OFF     comma list of FEATURES, e.g. gifts,topup
//
// A switched-off feature is refused here as well, not only hidden in the app: the request handler calls
// gate() before the route, so an old app (or a script) can't use it either. The money routes are listed in
// ROUTES; reads stay open so balances and history still show. assertOn() is for code that needs to check a
// feature inside a handler.
import { HttpError, env } from './core.mjs';
import { mailProvidersOf } from './mail.mjs';

/** Every feature that can be switched off. `games` is mostly in the app (most games run there); Rüzgâr Gülü is here. */
export const FEATURES = ['gifts', 'purchases', 'topup', 'exchange', 'jeton', 'games', 'dm', 'rooms', 'withdraw'];

/** "METHOD /path" → the features that turn it off. */
export const ROUTES = {
  'POST /api/gifts/send': ['gifts'],
  'POST /api/wallet/gift': ['gifts'],
  'POST /api/wallet/purchase': ['purchases'],
  'POST /api/wallet/test-topup': ['topup'],
  'POST /api/wallet/exchange': ['exchange'],
  'POST /api/jeton/transfer': ['jeton'],
  'POST /api/jeton/sell-diamonds': ['jeton', 'exchange'],
  'POST /api/admin/jeton/wholesale': ['jeton'],
  // New requests only: cancelling, the list and the owner's decision stay open, so held diamonds can come back.
  'POST /api/wallet/withdraw': ['withdraw'],
  'POST /api/wheel/spin': ['games'],
  'POST /api/messages': ['dm'],
  'POST /api/rooms': ['rooms'],
  // The voice token: without it nobody joins a room.
  'GET /token': ['rooms'],
};

export const OFF_MESSAGE = 'Bu özellik geçici olarak kapalı';

const list = (s) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

const VERSION_RE = /^\d+(\.\d+){0,2}$/;

/** The config as the app reads it, from `e` (the environment). Unknown feature names are left out. */
export function configOf(e = env) {
  const min = String(e.APP_MIN_VERSION ?? '').trim();
  const url = String(e.APP_UPDATE_URL ?? '').trim();
  return {
    minVersion: VERSION_RE.test(min) ? min : null,
    updateUrl: /^https:\/\/\S+$/.test(url) ? url : null,
    notice: String(e.APP_NOTICE ?? '').trim().slice(0, 300) || null,
    featuresOff: [...new Set(list(e.FEATURES_OFF).filter((f) => FEATURES.includes(f)))],
    ...signInOf(e),
  };
}

// --- Sign-in and phone-check methods (auth.mjs, mail.mjs, whatsapp.mjs): what the app may offer ---------------
//   signIn: { dev, google, email, phone }   the welcome screen's buttons (development sign-in only on test servers)
//   verify: { sms, whatsapp }               how Ayarlar can check a phone number
/** WhatsApp phone check: on with our number and the Meta app secret (whatsapp.mjs). */
export const whatsappOnOf = (e = env) => !!String(e.WHATSAPP_NUMBER ?? '').replace(/\D/g, '') && !!String(e.WHATSAPP_APP_SECRET ?? '').trim();
/** OTP_GLOBAL_PER_HOUR: SMS codes per hour over everyone; empty or invalid = 300, 0 = no SMS at all. */
export function smsPerHourOf(e = env) {
  const v = String(e.OTP_GLOBAL_PER_HOUR ?? '').trim();
  const n = v === '' ? 300 : Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : 300;
}
/** SMS codes can go out: a provider is set (SMS_PROVIDER) and OTP_GLOBAL_PER_HOUR is not 0. */
export const smsOnOf = (e = env) => ['netgsm', 'twilio', 'log'].includes(e.SMS_PROVIDER ?? '') && smsPerHourOf(e) > 0;
/** Signing in with a phone number by SMS: only with PHONE_SIGN_IN=1 as well (a checked phone is otherwise just a badge). */
export const phoneSignInOf = (e = env) => e.PHONE_SIGN_IN === '1' && smsOnOf(e);
export function signInOf(e = env) {
  return {
    signIn: { dev: e.ALLOW_DEV_AUTH === '1', google: list(e.GOOGLE_CLIENT_IDS).length > 0, email: mailProvidersOf(e).length > 0, phone: phoneSignInOf(e) },
    verify: { sms: smsOnOf(e), whatsapp: whatsappOnOf(e) },
  };
}

const CONFIG = configOf();
const OFF = new Set(CONFIG.featuresOff);
{
  const unknown = list(env.FEATURES_OFF).filter((f) => !FEATURES.includes(f));
  if (unknown.length) console.warn(`FEATURES_OFF: unknown ${unknown.join(', ')} (known: ${FEATURES.join(', ')})`);
  if (String(env.APP_MIN_VERSION ?? '').trim() && !CONFIG.minVersion) console.warn('APP_MIN_VERSION ignored: use digits like 1.0.3');
  if (OFF.size) console.log(`features off: ${[...OFF].join(', ')}`);
}

export const isOn = (name) => !OFF.has(name);

/** Inside a handler: a 503 with the Turkish message when `name` is switched off. */
export function assertOn(name) {
  if (OFF.has(name)) throw Object.assign(new HttpError(503, OFF_MESSAGE), { feature: name });
}

/** Called by the request handler before every route: refuses the routes of a switched-off feature. */
export function gate(method, path) {
  for (const f of ROUTES[`${method} ${path}`] ?? []) assertOn(f);
}

/** Cache-Control for the public config: phones may reuse it for 30 seconds. */
export const CONFIG_CACHE = 'public, max-age=30';

export const configRoutes = {
  async 'GET /api/config'() {
    return { ...CONFIG, featuresOff: [...CONFIG.featuresOff] };
  },
};
