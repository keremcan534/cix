// Seviye ve VIP ayarları for the screens (the finance panel's Seviyeler, server/api/levels.mjs): as the server's
// catalog said (levels=1, lib/live/catalog-live), else null and every helper of lib/levels-live-core gives the app's
// compiled tables. Demo mode has no catalog: compiled.
import type { LiveLevels } from '@/lib/levels-live-core';
import { liveCatalog, useLiveCatalog } from '@/lib/live/catalog-live';

/** The settings in a screen; it re-renders when they change. */
export const useLevels = (): LiveLevels | null => useLiveCatalog()?.levels ?? null;
/** The settings outside React (the store's level-up notices, a buy). */
export const currentLevels = (): LiveLevels | null => liveCatalog()?.levels ?? null;
