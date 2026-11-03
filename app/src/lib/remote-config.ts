// What the server's GET /api/config says about this app (server/api/features.mjs): the minimum version, where
// to update, a notice banner, and features switched off for a while. Pure logic, no React; the fetching and the
// hooks are in lib/remote-control, the screens in components/remote-control.

export const FEATURES = ['gifts', 'purchases', 'topup', 'exchange', 'jeton', 'games', 'dm', 'rooms'] as const;
export type Feature = (typeof FEATURES)[number];

export type RemoteConfig = { minVersion: string | null; updateUrl: string | null; notice: string | null; featuresOff: Feature[] };

/** Nothing set: what the app uses before the first answer, and without a server. */
export const EMPTY_CONFIG: RemoteConfig = { minVersion: null, updateUrl: null, notice: null, featuresOff: [] };

const isFeature = (v: unknown): v is Feature => typeof v === 'string' && (FEATURES as readonly string[]).includes(v);

/** The server's answer (or a saved copy) as a config; anything malformed is left out, never thrown. */
export function parseConfig(raw: unknown): RemoteConfig {
  if (!raw || typeof raw !== 'object') return EMPTY_CONFIG;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const min = str(r.minVersion, 20);
  const url = str(r.updateUrl, 500);
  return {
    minVersion: min && parseVersion(min) ? min : null,
    updateUrl: url && /^https:\/\/\S+$/.test(url) ? url : null,
    notice: str(r.notice, 300),
    featuresOff: Array.isArray(r.featuresOff) ? [...new Set(r.featuresOff.filter(isFeature))] : [],
  };
}

/** "1.2.3" → [1, 2, 3]; missing parts are 0, a suffix ("-beta", "+5") is ignored. Null when it isn't a version. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?\s*$/.exec(v);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** <0 when a is older than b, 0 when equal, >0 when newer. Something that isn't a version counts as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a) ?? [0, 0, 0];
  const y = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** True when this app (`current`) is below the minimum the server asks for. */
export const needsUpdate = (current: string, config: RemoteConfig) => !!config.minVersion && !!parseVersion(current) && compareVersions(current, config.minVersion) < 0;

export const isOff = (config: RemoteConfig, f: Feature) => config.featuresOff.includes(f);

const LABEL: Record<Feature, string> = {
  gifts: 'Hediye gönderme',
  purchases: 'Jeton satın alma',
  topup: 'Jeton yükleme',
  exchange: 'Elmas çevirme',
  jeton: 'Jeton Noktası',
  games: 'Oyunlar',
  dm: 'Özel mesajlar',
  rooms: 'Sesli odalar',
};
export const featureLabel = (f: Feature) => LABEL[f];

/** The calm sentence shown where a switched-off feature would be. */
export const offMessage = (f: Feature) => `${LABEL[f]} şu an geçici olarak kapalı. Kısa süre içinde yeniden açılacak; hesabın ve bakiyen güvende.`;

/**
 * Screens that belong to one feature (expo-router route names). `block` replaces the screen with a notice;
 * `banner` keeps the screen (balances, history, old messages) and shows the notice above it.
 */
export const ROUTE_FEATURES: Record<string, { features: Feature[]; mode: 'block' | 'banner' }> = {
  'oda/[id]': { features: ['rooms'], mode: 'block' },
  oyunlar: { features: ['games'], mode: 'block' },
  'coins-bank': { features: ['jeton'], mode: 'block' },
  'sohbet/[id]': { features: ['dm'], mode: 'banner' },
  cuzdan: { features: ['topup', 'purchases'], mode: 'banner' },
  'gelir/index': { features: ['exchange'], mode: 'banner' },
};

/** The switched-off feature of a screen and how to show it, or null when the screen is fully on. */
export function routeGate(config: RemoteConfig, route: string): { feature: Feature; mode: 'block' | 'banner' } | null {
  const g = ROUTE_FEATURES[route];
  const f = g?.features.find((x) => isOff(config, x));
  return g && f ? { feature: f, mode: g.mode } : null;
}
