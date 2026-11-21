// The red dot on Ben › Ziyaretçiler (21 Nov 2026: it stayed lit after the list was looked at). It is lit while a visit
// newer than the newest one I last looked at is there: the newest visit's time (the server's lastAt; in the demo the
// visit count) is kept on the phone when the visitors sheet opens. Per account: another account signed in on this phone
// starts from nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { liveMode, myServerId } from '@/lib/live';
import { visitorsUnseen } from '@/lib/visitor-rows';

const KEY = 'similarclub:visitors-seen';

/** What I looked at last: account → the newest visit's mark then. */
let seen: Record<string, string> = {};
let loaded = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!loaded) void load();
  return () => void listeners.delete(l);
};
const publish = () => listeners.forEach((l) => l());

async function load() {
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const x: unknown = raw ? JSON.parse(raw) : null;
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(x)) if (typeof v === 'string' && v.length <= 64) out[k] = v;
      seen = { ...out, ...seen };
      publish();
    }
  } catch {}
}

/** Whose look this is: the signed-in account on a server, else the demo. */
const ownerNow = () => (liveMode() ? (myServerId() ?? 'me') : 'demo');

/** Marks the visits up to `newest` as looked at by the signed-in account. */
export function markVisitorsSeen(newest: string | null, owner = ownerNow()) {
  if (!newest || seen[owner] === newest) return;
  seen = { ...seen, [owner]: newest };
  publish();
  void AsyncStorage.setItem(KEY, JSON.stringify(seen)).catch(() => {});
}

/** Whether Ben's dot is lit for the newest visit `newest` (re-renders when it is looked at). */
export function useVisitorsUnseen(newest: string | null): boolean {
  const owner = ownerNow();
  const last = useSyncExternalStore(
    subscribe,
    () => seen[owner],
    () => seen[owner],
  );
  return visitorsUnseen(newest, last);
}
