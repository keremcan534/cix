// Other people's shop looks in a server room (server/api/economy.mjs GET /api/looks): the frame around their seat,
// their entry and ride, their chat bubble, their mic effect and VIP level. The server answers only what each person
// owns and wears, so a look can't be faked by another phone. Kept per account for two minutes; the room screen asks
// for the people it shows, at most 50 at a time.
// The answer also brings each person's name and photo: a room knows its people from the voice connection by id and
// name only, so without it someone no other screen has read (a new account) would sit on a mic without their photo.
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { putServerUser } from '@/data/mock';
import { myServerId } from '@/lib/live';

export type Look = {
  frame: string | null;
  entry: string | null;
  ride: string | null;
  bubble: string | null;
  specialId: string | null;
  micfx: string | null;
  /** Their voice wave (components/room/voice-wave); an older server sends no field. */
  wave?: string | null;
  noble: number | null;
  vipLevel: number;
  /** Colors their speaking ring; none when hidden (an older server sends no field). */
  gender?: 'Kadın' | 'Erkek' | null;
  /** Their name and photo (null: none); an older server, or someone who blocked me, sends neither. */
  name?: string;
  avatarUrl?: string | null;
};
const TTL = 120_000;
const store = new Map<string, { look: Look; at: number }>();
/** Reads on their way, by account: a second ask for the same person waits for the first one. */
const asking = new Map<string, Promise<void>>();
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

/** The person's name and photo as the server has them now (a removed photo goes too), never for my own account. */
function putFace(id: string, look: Look) {
  if (typeof look.name !== 'string' || !look.name || id === myServerId()) return;
  putServerUser({ id, name: look.name, avatar: typeof look.avatarUrl === 'string' ? look.avatarUrl : '' });
}

/**
 * Reads the looks of these server accounts that aren't known (or are older than two minutes). Resolves once each
 * of them is read, including the ones another caller was already reading.
 */
export async function loadLooks(ids: string[]) {
  const now = Date.now();
  const wanted = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const waiting = wanted.map((id) => asking.get(id)).filter((p): p is Promise<void> => !!p);
  const need = wanted.filter((id) => !asking.has(id) && now - (store.get(id)?.at ?? 0) > TTL);
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const read = (async () => {
      try {
        const r = await api.apiRequest<{ looks: Record<string, Look> }>('GET', `/api/looks?ids=${batch.join(',')}`);
        for (const [id, look] of Object.entries(r.looks)) {
          store.set(id, { look, at: Date.now() });
          putFace(id, look);
        }
        emit();
      } catch {
        // No answer: asked again the next time someone looks.
      } finally {
        batch.forEach((id) => asking.delete(id));
      }
    })();
    batch.forEach((id) => asking.set(id, read));
    waiting.push(read);
  }
  await Promise.all(waiting);
}

/** Keeps the looks of `ids` (server accounts) read; re-renders when a new one arrives. `key`: the ids joined. */
export function useLooks(ids: string[], enabled: boolean) {
  const key = enabled ? [...new Set(ids)].sort().join(',') : '';
  useEffect(() => {
    if (key) void loadLooks(key.split(','));
  }, [key]);
  return useSyncExternalStore(subscribe, () => version, () => version);
}
