// Other people's shop looks in a server room (server/api/economy.mjs GET /api/looks): the frame around their seat,
// their entry and ride, their chat bubble, their mic effect and VIP level, and their photo. The server answers only
// what each person owns and wears, so a look can't be faked by another phone. Kept per account for two minutes; the
// room screen asks for the people it shows, at most 50 at a time, and reads anyone who comes into view (a room
// entered, someone joining) again, since what was kept may be from before they changed it. While they are in the
// room, a change comes from the server at once (room-bus 'look' packet: putLook), so their mic and Balkon face
// change without anyone leaving and coming back.
// The answer also brings each person's name: a room knows its people from the voice connection by id and name only,
// so without it someone no other screen has read (a new account) would sit on a mic without their photo.
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { putServerUser, setServerFace } from '@/data/mock';
import * as api from '@/lib/api';

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
  /** Their name; an older server, or someone who blocked me, sends none. */
  name?: string;
  /** Their photo (null: none); an older server sends no field, and the photo known from elsewhere stays. */
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
// My own server id (lib/live sets it at sign-in): my own name and photo are this phone's, never overwritten here.
let self: string | null = null;
export const setLooksSelf = (id: string | null) => void (self = id);
/** Keeps a look, and the person's name and photo as the server has them now (never for my own account). */
const keep = (id: string, look: Look) => {
  store.set(id, { look, at: Date.now() });
  if (id === self) return;
  if (typeof look.name === 'string' && look.name) putServerUser({ id, name: look.name });
  if (look.avatarUrl !== undefined) setServerFace(id, look.avatarUrl);
};

/** The look of a server account, if read (undefined: not yet). */
export const lookOf = (serverId: string | null | undefined): Look | undefined => (serverId ? store.get(serverId)?.look : undefined);

/** A look the server sent into the room as it changed (lib/live/room-bus onServerLook). */
export function putLook(serverId: string, look: Look) {
  keep(serverId, look);
  emit();
}

/**
 * Reads the looks of these server accounts that aren't known, are older than two minutes or were read before
 * `freshAfter` (ms; a person who just came into view is read again). Resolves once each of them is read, including
 * the ones another caller was already reading.
 */
export async function loadLooks(ids: string[], freshAfter = 0) {
  const now = Date.now();
  const wanted = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const waiting = wanted.map((id) => asking.get(id)).filter((p): p is Promise<void> => !!p);
  const need = wanted.filter((id) => !asking.has(id) && (store.get(id)?.at ?? 0) <= Math.max(now - TTL, freshAfter - 1));
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const started = Date.now();
    const read = (async () => {
      try {
        const r = await api.apiRequest<{ looks: Record<string, Look> }>('GET', `/api/looks?ids=${batch.join(',')}`);
        // A look the server sent while this was being read is newer than this answer.
        for (const [id, look] of Object.entries(r.looks)) if ((store.get(id)?.at ?? 0) < started) keep(id, look);
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

/** Keeps the looks of `ids` (server accounts) read; re-renders when a new one arrives. */
export function useLooks(ids: string[], enabled: boolean) {
  const key = enabled ? [...new Set(ids)].sort().join(',') : '';
  const shown = useRef(new Set<string>());
  useEffect(() => {
    const now = key ? key.split(',') : [];
    const came = now.filter((id) => !shown.current.has(id));
    shown.current = new Set(now);
    if (came.length) void loadLooks(came, Date.now());
    const stay = now.filter((id) => !came.includes(id));
    if (stay.length) void loadLooks(stay);
  }, [key]);
  return useSyncExternalStore(subscribe, () => version, () => version);
}
