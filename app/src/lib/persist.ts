// Saves the demo account's state on the device so a restart doesn't wipe coins, purchases and settings.
// One JSON blob under a versioned key; bump the version when the shape changes incompatibly.
// Prototype only: in production the server is the source of truth and this would be a cache.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'similarclub:state:v1';

export async function loadState<T>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Debounced: many state changes in a burst (a gift combo) become one write. */
export function saveState(build: () => unknown, delayMs = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(build())).catch(() => {});
  }, delayMs);
}

export async function clearState() {
  clearTimeout(timer);
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

/** Local calendar day, used to reset daily counters (check-in, spend limit) after a restart. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
