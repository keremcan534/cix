// Live mode (lib/live): Profil ziyaretçileri from the server (GET /api/me/visitors, server/api/social.mjs). The visits
// of the last 7 days are for everyone; who made them comes only with the Abonelik (`visitors` null without it, and
// `hidden` has the visits without anyone's identity). The Ben tab and Mesajlar read it again each time they come to the
// front, and so does a visit notice on the live line (lib/live/sync) and a subscription that starts or ends. Another account signed in on this phone starts from
// nothing. Without a server address nothing here runs.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { liveMode, myServerId, rememberUser, toLocal } from '@/lib/live';
import { visitNotice, type VisitNotice } from '@/lib/visitor-rows';

export type Visitors = { count: number; visitors: api.ServerVisitor[] | null; hidden?: api.HiddenVisitor[] };
type Snap = { owner: string | null; data: Visitors | null };

const EMPTY: Snap = { owner: null, data: null };
let snap: Snap = EMPTY;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

let reading: Promise<void> | null = null;
/**
 * Reads my visitors again (one read at a time); a failed read keeps what was there. `fresh`: a visit just came, so a
 * read already going (it may have started before it) is followed by one more.
 */
export function refreshVisitors(fresh = false): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  if (fresh && reading) return reading.then(() => refreshVisitors());
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

const mine = (s: Snap) => {
  const me = myServerId();
  return me && s.owner && s.owner !== me ? null : s.data;
};
/** What the last read gave (null before one, or when it was another account's). */
export const lastVisitors = (): Visitors | null => mine(snap);

/**
 * A visit on the live line (`from` only when I may see who: the server leaves it out otherwise): my visitors are
 * read again, then the Bildirimler line, by the name the server's list gives, or "biri".
 */
export async function visitLineNotice(from: string | null): Promise<VisitNotice> {
  await refreshVisitors(true);
  const who = from ? lastVisitors()?.visitors?.find((v) => v.id === from) : undefined;
  if (who) rememberUser(who);
  return visitNotice(who ? { id: toLocal(who.id), name: who.name } : null);
}

/** My visitors on the server: null until read (and always without a server); read again when the screen is in front. */
export function useVisitors(): Visitors | null {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  const focused = useIsFocused();
  useEffect(() => {
    if (liveMode() && focused) void refreshVisitors();
  }, [focused]);
  return mine(s);
}
