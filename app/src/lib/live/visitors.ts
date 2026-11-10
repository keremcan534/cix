// Live mode (lib/live): Profil ziyaretçileri from the server (GET /api/me/visitors, server/api/social.mjs). How many
// opened my profile in the last 7 days is for everyone; who they were comes only with VIP (`visitors` null without
// it). The Ben tab and Mesajlar read it again each time they come to the front. Another account signed in on this
// phone starts from nothing. Without a server address nothing here runs.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { liveMode, myServerId } from '@/lib/live';

export type Visitors = { count: number; visitors: api.ServerVisitor[] | null };
type Snap = { owner: string | null; data: Visitors | null };

const EMPTY: Snap = { owner: null, data: null };
let snap: Snap = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

let reading: Promise<void> | null = null;
/** Reads my visitors again (one read at a time); a failed read keeps what was there. */
export function refreshVisitors(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  reading ??= (async () => {
    const owner = myServerId();
    const data = await api.myVisitors();
    snap = { owner, data };
    listeners.forEach((l) => l());
  })()
    .catch(() => {})
    .finally(() => (reading = null));
  return reading;
}

/** My visitors on the server: null until read (and always without a server); read again when the screen is in front. */
export function useVisitors(): Visitors | null {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  const focused = useIsFocused();
  useEffect(() => {
    if (liveMode() && focused) void refreshVisitors();
  }, [focused]);
  const me = myServerId();
  return me && s.owner && s.owner !== me ? null : s.data;
}
