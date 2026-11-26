// A value that changes many times a second (a win's amount counting up, the pegs a ball has just touched), kept out
// of the game screen's state: the screen sets it, and only the small part that shows it subscribes (useTicking) and
// redraws. Held in state, every frame of a count-up redrew the whole celebration, and with it rebuilt the native
// animation nodes of hundreds of coins, rays and sparkles: the stutter a big win had on an Android phone.
import { useSyncExternalStore } from 'react';

export type Ticking<T> = { get: () => T; set: (v: T) => void; subscribe: (listener: () => void) => () => void };

/** Create once per screen (`useState(() => makeTicking(…))`); `set` with the same value redraws nothing. */
export function makeTicking<T>(initial: T): Ticking<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (Object.is(v, value)) return;
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

/** The value now; the component calling it redraws when it changes (and nothing else does). */
export const useTicking = <T>(t: Ticking<T>): T => useSyncExternalStore(t.subscribe, t.get, t.get);
