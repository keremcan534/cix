// The server's remote config (GET /api/config, server/api/features.mjs) on this phone: read at start, each time
// the app comes back to the foreground (at most every 30 s) and every 60 s while it stays there (nothing runs in
// the background), kept on the device so a switched-off feature or a required update still applies when the next
// start has no network. Without a server address (EXPO_PUBLIC_API_URL) nothing is fetched and everything stays on.
// When the config's live settings version (`v`) differs from the live catalog's, the catalog is read again
// (lib/live/catalog-live: hidden gifts, a campaign, the Çevir rate). A live setting reaches a phone in the
// foreground in about 60–90 s (the server's 30 s cache plus the poll).
//
// The server refuses switched-off features too; this only lets the app say so calmly before anyone taps.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { showAlert } from '@/lib/alert';
import { liveCatalogStale, liveCatalogV, refreshLiveCatalog, restoreLiveCatalog } from '@/lib/live/catalog-live';
import { EMPTY_CONFIG, featureLabel, isOff, offMessage, parseConfig, type Feature, type RemoteConfig } from '@/lib/remote-config';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const KEY = 'similarclub:remote-config';
const MIN_GAP_MS = 30_000;
const POLL_MS = 60_000;

let config: RemoteConfig = EMPTY_CONFIG;
let fetchedAt = 0;
let loading: Promise<void> | null = null;
let restored = false;
const listeners = new Set<() => void>();

const set = (next: RemoteConfig) => {
  if (JSON.stringify(next) === JSON.stringify(config)) return;
  config = next;
  listeners.forEach((l) => l());
};

/** The saved copy from the last run, once. */
async function restore() {
  if (restored) return;
  restored = true;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    // A fresh answer that came in meanwhile wins over the saved one.
    if (saved && !fetchedAt) set(parseConfig(JSON.parse(saved)));
  } catch {
    // A broken saved copy is ignored; the next answer replaces it.
  }
}

let poll: ReturnType<typeof setInterval> | null = null;
let watching = false;
/** Every 60 s while the app is in the foreground; stopped in the background. Started by the first read. */
function watchForeground() {
  if (watching) return;
  watching = true;
  // 'active', or unknown at start; 'inactive' is iOS's moment between the two.
  const on = (s: string | null | undefined) => {
    if (s !== 'background' && s !== 'inactive') poll ??= setInterval(() => void refreshRemoteConfig(), POLL_MS);
    else if (poll) {
      clearInterval(poll);
      poll = null;
    }
  };
  on(AppState.currentState);
  AppState.addEventListener('change', on);
}

/** Reads the config from the server (skipped when the last read is under 30 s old, unless `force`). */
export function refreshRemoteConfig(force = false): Promise<void> {
  if (!BASE) return Promise.resolve();
  watchForeground();
  if (!force && Date.now() - fetchedAt < MIN_GAP_MS) return restore();
  loading ??= (async () => {
    await Promise.all([restore(), restoreLiveCatalog()]);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(`${BASE}/api/config`, { signal: ctrl.signal });
      // An older server without /api/config answers 404: nothing switched off, nothing required.
      if (res.status === 404) return void ((fetchedAt = Date.now()), set(EMPTY_CONFIG));
      if (!res.ok) return;
      const next = parseConfig(await res.json());
      fetchedAt = Date.now();
      set(next);
      // A live setting changed since the catalog was read (or it is old): hidden gifts, a campaign, the rate.
      if (next.v !== liveCatalogV() || liveCatalogStale()) void refreshLiveCatalog();
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    } catch {
      // Offline or the server is down: keep what we have; the next foreground tries again.
    } finally {
      clearTimeout(t);
    }
  })().finally(() => (loading = null));
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const remoteConfig = () => config;
export const useRemoteConfig = () => useSyncExternalStore(subscribe, remoteConfig, remoteConfig);

/** True when `f` is switched off right now (outside React). */
export const featureOff = (f: Feature) => isOff(config, f);

/**
 * For an action button: when `f` is switched off, tells the person calmly and returns true (the caller stops).
 * One line at the top of a handler: `if (blockedFeature('gifts')) return;`.
 */
export function blockedFeature(f: Feature) {
  if (!featureOff(f)) return false;
  showAlert(`${featureLabel(f)} kapalı`, offMessage(f));
  return true;
}
