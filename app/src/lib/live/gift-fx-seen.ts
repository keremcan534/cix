// The chat gifts this phone has played (lib/dm-gift-fx): per person, the highest server message id handled, kept on
// the phone so a gift plays once, not on every opening of the chat or after a restart. Signing out forgets it
// (lib/live/messages forgetSeen).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'similarclub:dm-gift-fx';

let played: Record<string, number> | null = null;
let loading: Promise<Record<string, number>> | null = null;

/** The saved map, read once. */
export function giftFxSeen(): Promise<Record<string, number>> {
  if (played) return Promise.resolve(played);
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      const v: unknown = raw ? JSON.parse(raw) : {};
      const out: Record<string, number> = {};
      if (v && typeof v === 'object' && !Array.isArray(v))
        for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isSafeInteger(n) && n > 0) out[k] = n;
      return out;
    })
    .catch(() => ({}))
    .then((m) => (played ??= m));
  return loading;
}

/** The highest message id with `peer` handled here (0: none); call after giftFxSeen resolved. */
export const giftFxPlayedOf = (peer: string) => played?.[peer] ?? 0;

/** Handled up to `id` with `peer`. */
export function noteGiftFxPlayed(peer: string, id: number) {
  if (!played || id <= (played[peer] ?? 0)) return;
  played[peer] = id;
  void AsyncStorage.setItem(KEY, JSON.stringify(played)).catch(() => {});
}

/** Signed out: the next account starts afresh. */
export function forgetGiftFx() {
  played = {};
  loading = null;
  void AsyncStorage.removeItem(KEY).catch(() => {});
}
