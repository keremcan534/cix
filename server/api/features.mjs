// Remote control of the app (docs/SUNUCU.md, "Hata izleme ve acil durum"): the minimum app version, an update
// link, a notice banner, and a kill switch per feature. They come from .env (changing it needs only
// `docker compose up -d api`) and from the live settings the owner changes in the admin panel
// (live-settings.mjs): a feature is off when either switches it off, and the live notice and minimum version
// replace .env's.
//
//   GET /api/config (public, cacheable 30 s) → { minVersion, updateUrl, notice, featuresOff, v }
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

export { FEATURES, OFF_MESSAGE, configOf };

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

const CONFIG = configOf(env);
const ENV_OFF = new Set(CONFIG.featuresOff);
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
    return { minVersion: s.minVersion, updateUrl: CONFIG.updateUrl, notice: s.notice, featuresOff: [...new Set([...CONFIG.featuresOff, ...s.featuresOff])], v: s.v };
  },
};
