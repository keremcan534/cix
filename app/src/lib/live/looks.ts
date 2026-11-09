// Other people's shop looks in a server room (server/api/economy.mjs GET /api/looks): the frame around their seat,
// their entry and ride, their chat bubble, their mic effect and VIP level. The server answers only what each person
// owns and wears, so a look can't be faked by another phone. Kept per account for two minutes; the room screen asks
// for the people it shows, at most 50 at a time.
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';

export type Look = { frame: string | null; entry: string | null; ride: string | null; bubble: string | null; specialId: string | null; micfx: string | null; noble: number | null; vipLevel: number };
const TTL = 120_000;
const store = new Map<string, { look: Look; at: number }>();
const asking = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** The look of a server account, if read (undefined: not yet). */
export const lookOf = (serverId: string | null | undefined): Look | undefined => (serverId ? store.get(serverId)?.look : undefined);

/** Reads the looks of these server accounts that aren't known (or are older than two minutes). */
export async function loadLooks(ids: string[]) {
  const now = Date.now();
  const need = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/.test(id) && !asking.has(id) && now - (store.get(id)?.at ?? 0) > TTL);
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    batch.forEach((id) => asking.add(id));
    try {
      const r = await api.apiRequest<{ looks: Record<string, Look> }>('GET', `/api/looks?ids=${batch.join(',')}`);
      for (const [id, look] of Object.entries(r.looks)) store.set(id, { look, at: Date.now() });
      emit();
    } catch {
      // No answer: asked again the next time someone looks.
    } finally {
      batch.forEach((id) => asking.delete(id));
    }
  }
}

/** Keeps the looks of `ids` (server accounts) read; re-renders when a new one arrives. `key`: the ids joined. */
export function useLooks(ids: string[], enabled: boolean) {
  const key = enabled ? [...new Set(ids)].sort().join(',') : '';
  useEffect(() => {
    if (key) void loadLooks(key.split(','));
  }, [key]);
  return useSyncExternalStore(subscribe, () => version, () => version);
}
