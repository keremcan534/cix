// Remote control of the app (docs/SUNUCU.md, "Hata izleme ve acil durum"): the minimum app version, an update
// link, a notice banner, and a kill switch per feature. They come from .env (changing it needs only
// `docker compose up -d api`) and from the live settings the owner changes in the admin panel
// (live-settings.mjs): a feature is off when either switches it off, and the live notice and minimum version
// replace .env's.
//
//   GET /api/config (public, cacheable 30 s) → { minVersion, updateUrl, notice, featuresOff, v, signIn, verify }
//     v: the live settings' version; the app reloads the catalog when it changes.
//
//   APP_MIN_VERSION  e.g. 1.0.3: older apps show a blocking "Güncelleme gerekli" screen
//   APP_UPDATE_URL   where that screen sends people (store page or APK download), https only
//   APP_NOTICE       a short banner text shown in the app (empty = none)
//   FEATURES_OFF     comma list of FEATURES, e.g. gifts,topup; the live settings can't switch these back on
//
// A switched-off feature is refused here as well, not only hidden in the app: the request handler calls
// gate() before the route, so an old app (or a script) can't use it either. The money routes are listed in
// ROUTES; reads stay open so balances and history still show. The admin routes are in none, so a switch can't
// lock the owner out. assertOn() is for code that needs to check a feature inside a handler.
import { HttpError, env } from './core.mjs';
import { FEATURES, OFF_MESSAGE, configOf, listOf } from './live-registry.mjs';
import { live } from './live-settings.mjs';
import { mailProvidersOf } from './mail.mjs';

export { FEATURES, OFF_MESSAGE, configOf };

/** "METHOD /path" → the features that turn it off. */
export const ROUTES = {
  'POST /api/gifts/send': ['gifts'],
  // Çantam (backpack.mjs): a free gift is still a gift.
  'POST /api/backpack/send': ['gifts'],
  'POST /api/wallet/gift': ['gifts'],
  'POST /api/wallet/purchase': ['purchases'],
  // Abonelik (vip.mjs) is bought through the same stores.
  'POST /api/vip/subscribe': ['purchases'],
  'POST /api/wallet/test-topup': ['topup'],
  'POST /api/wallet/exchange': ['exchange'],
  'POST /api/jeton/transfer': ['jeton'],
  'POST /api/jeton/sell-diamonds': ['jeton', 'exchange'],
  'POST /api/admin/jeton/wholesale': ['jeton'],
  // New requests only: cancelling, the list and the owner's decision stay open, so held diamonds can come back.
  'POST /api/wallet/withdraw': ['withdraw'],
  'POST /api/wheel/spin': ['games'],
  'POST /api/casino/play': ['games'],
  'POST /api/rooms/table': ['games'],
  'POST /api/shop/buy': ['shop'],
  'POST /api/wallet/spend': ['shop'],
  'POST /api/messages': ['dm'],
  // New calls and matches; a live one can still be answered, charged and ended.
  'POST /api/calls': ['dm'],
  'POST /api/match/join': ['dm'],
  'POST /api/rooms': ['rooms'],
  'POST /api/events': ['rooms'],
  'POST /api/events/edit': ['rooms'],
  'POST /api/events/start': ['rooms'],
  'POST /api/events/reserve': ['rooms'],
  // New bags only: a bag already dropped can still be opened, and returns what is left.
  'POST /api/lucky-bags': ['gifts'],
  // A paid room animation (room-fx.mjs) is a gift to the room.
  'POST /api/rooms/animation': ['gifts'],
  // The voice token: without it nobody joins a room.
  'GET /token': ['rooms'],
};

const CONFIG = configOf(env);
const ENV_OFF = new Set(CONFIG.featuresOff);

// --- Sign-in and phone-check methods (auth.mjs, mail.mjs, whatsapp.mjs): what the app may offer ---------------
//   signIn: { dev, google, email, phone }   the welcome screen's buttons (development sign-in only on test servers)
//   verify: { sms, whatsapp }               how Ayarlar can check a phone number
// The SMS cap per hour is a live setting (otp_global_per_hour); `cap` is the one in effect, .env's when not given.
/** WhatsApp phone check: on with our number and the Meta app secret (whatsapp.mjs). */
export const whatsappOnOf = (e = env) => !!String(e.WHATSAPP_NUMBER ?? '').replace(/\D/g, '') && !!String(e.WHATSAPP_APP_SECRET ?? '').trim();
/** OTP_GLOBAL_PER_HOUR: SMS codes per hour over everyone; empty or invalid = 300, 0 = no SMS at all. */
export function smsPerHourOf(e = env) {
  const v = String(e.OTP_GLOBAL_PER_HOUR ?? '').trim();
  const n = v === '' ? 300 : Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : 300;
}
/** SMS codes can go out: a provider is set (SMS_PROVIDER) and the hourly cap is not 0. */
export const smsOnOf = (e = env, cap = smsPerHourOf(e)) => ['netgsm', 'twilio', 'log'].includes(e.SMS_PROVIDER ?? '') && cap > 0;
/** Signing in with a phone number by SMS: only with PHONE_SIGN_IN=1 as well (a checked phone is otherwise just a badge). */
export const phoneSignInOf = (e = env, cap = smsPerHourOf(e)) => e.PHONE_SIGN_IN === '1' && smsOnOf(e, cap);
export function signInOf(e = env, cap = smsPerHourOf(e)) {
  return {
    signIn: { dev: e.ALLOW_DEV_AUTH === '1', google: listOf(e.GOOGLE_CLIENT_IDS).length > 0, email: mailProvidersOf(e).length > 0, phone: phoneSignInOf(e, cap) },
    verify: { sms: smsOnOf(e, cap), whatsapp: whatsappOnOf(e) },
  };
}
{
  const unknown = listOf(env.FEATURES_OFF).filter((f) => !FEATURES.includes(f));
  if (unknown.length) console.warn(`FEATURES_OFF: unknown ${unknown.join(', ')} (known: ${FEATURES.join(', ')})`);
  if (String(env.APP_MIN_VERSION ?? '').trim() && !CONFIG.minVersion) console.warn('APP_MIN_VERSION ignored: use digits like 1.0.3');
  if (ENV_OFF.size) console.log(`features off: ${[...ENV_OFF].join(', ')}`);
}

const off = (name) => ENV_OFF.has(name) || live().featuresOff.has(name);

export const isOn = (name) => !off(name);

/** Inside a handler: a 503 with the Turkish message when `name` is switched off. */
export function assertOn(name) {
  if (off(name)) throw Object.assign(new HttpError(503, OFF_MESSAGE), { feature: name });
}

/** Called by the request handler before every route: refuses the routes of a switched-off feature. */
export function gate(method, path) {
  for (const f of ROUTES[`${method} ${path}`] ?? []) assertOn(f);
}

/** Cache-Control for the public config: phones may reuse it for 30 seconds. */
export const CONFIG_CACHE = 'public, max-age=30';

export const configRoutes = {
  async 'GET /api/config'() {
    const s = live();
    // .env's switched-off features first, in .env's order, then the live ones.
    return { minVersion: s.minVersion, updateUrl: CONFIG.updateUrl, notice: s.notice, featuresOff: [...new Set([...CONFIG.featuresOff, ...s.featuresOff])], v: s.v, ...signInOf(env, s.otpPerHour) };
  },
};
