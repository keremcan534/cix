// Live mode (lib/live): one server answer kept for the screens that show it, read again each time such a screen comes
// to the front (as lib/live/visitors does): one read at a time, a failed read keeps what was there, and another
// account signed in on this phone starts from nothing. Without a server address nothing is read.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { liveMode, myServerId } from '@/lib/live';

export function focusStore<T>(read: () => Promise<T>) {
  type Snap = { owner: string | null; data: T | null };
  let snap: Snap = { owner: null, data: null };
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  const put = (data: T | null) => {
    snap = { owner: myServerId(), data };
    listeners.forEach((l) => l());
  };
  let reading: Promise<void> | null = null;
  /** Reads it again now; a failure keeps what was there. */
  const refresh = (): Promise<void> => {
    if (!liveMode()) return Promise.resolve();
    reading ??= (async () => {
      const owner = myServerId();
      const data = await read();
      // Signed in as someone else meanwhile: this answer was theirs.
      if (owner === myServerId()) put(data);
    })()
      .catch(() => {})
      .finally(() => (reading = null));
    return reading;
  };
  /** The answer (null until read, without a server, or while `on` is false), read again when the screen is in front. */
  function useData(on = true): T | null {
    const s = useSyncExternalStore(subscribe, () => snap, () => snap);
    const focused = useIsFocused();
    useEffect(() => {
      if (liveMode() && on && focused) void refresh();
    }, [focused, on]);
    const me = myServerId();
    return !on || (me && s.owner && s.owner !== me) ? null : s.data;
  }
  return { useData, refresh, put, current: () => (snap.owner === myServerId() ? snap.data : null) };
}
