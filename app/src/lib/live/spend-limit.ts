// Live mode (lib/live): my daily spending limit on the server (server/api/spend-limit.mjs), which every coin spend
// is checked against there. Ayarlar and Cüzdan read it again each time they come to the front, and after a change
// made here. Another account signed in on this phone starts from nothing. Without a server address nothing here runs.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { liveMode, myServerId } from '@/lib/live';

type Snap = { owner: string | null; data: api.ServerSpendLimit | null };

let snap: Snap = { owner: null, data: null };
/** Coins this phone counted as spent since the last read (the store's countSpend, noteSpent). */
let spentSince = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const put = (data: api.ServerSpendLimit) => {
  snap = { owner: myServerId(), data };
  spentSince = 0;
  listeners.forEach((l) => l());
};

/** The store counted `n` coins spent (a buy, a gift): what is left goes down until the next read. */
export function noteSpent(n: number) {
  if (n > 0) spentSince += n;
}

const fmt = (n: number) => n.toLocaleString('tr-TR');
/**
 * The store's check before it takes coins on this phone (store limitBlock): the refusal the server would give for
 * `n` coins now, by the last read and what this phone spent since; null when it fits or isn't known (no read yet, a
 * new day, a waiting change come due: the server decides, and the next read catches up). A buy the store grants
 * first is then never granted here when the server will refuse it.
 */
export function serverLimitBlock(n: number): string | null {
  const d = snap.data;
  if (!liveMode() || !d || snap.owner !== myServerId()) {
    void refreshSpendLimit();
    return null;
  }
  const now = Date.now();
  if (now >= Date.parse(d.resetsAt) || (d.next && now >= Date.parse(d.next.at))) {
    void refreshSpendLimit();
    return null;
  }
  if (d.limit === null) return null;
  const left = Math.max(0, (d.left ?? 0) - spentSince);
  if (n <= left) return null;
  return `Günlük harcama limitin ${fmt(d.limit)} jeton (Ayarlar › Harcama). Bugün kalan: ${fmt(left)} jeton.`;
}

let reading: Promise<void> | null = null;
/** Reads my limit again (one read at a time); a failed read keeps what was there. */
export function refreshSpendLimit(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  reading ??= api
    .spendLimit()
    .then(put)
    .catch(() => {})
    .finally(() => (reading = null));
  return reading;
}

/** My limit on the server: null until read (and always without a server); read again when the screen is in front. */
export function useServerSpendLimit(): api.ServerSpendLimit | null {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  const focused = useIsFocused();
  useEffect(() => {
    if (liveMode() && focused) void refreshSpendLimit();
  }, [focused]);
  const me = myServerId();
  return me && s.owner && s.owner !== me ? null : s.data;
}

/** Sets my limit (0: none); resolves with whether it applies now or after the wait. */
export async function changeSpendLimit(limit: number): Promise<'now' | 'later'> {
  const r = await api.setSpendLimit(limit);
  put(r);
  return r.applied;
}
