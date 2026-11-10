// Ayarlar › Gizlilik and "Kimler ulaşabilir" in a live build: a change shows at once and goes to the server; if the
// server refuses it, the choice goes back to what the server last confirmed. Answers can come back in any order, so
// only the newest change of a choice may put it back. Pure (no React, no network): lib/live/privacy runs it.
import type { ServerPrivacy } from '@/lib/api';

export type PrivacyKey = keyof ServerPrivacy;
/** The choices the server keeps and enforces (server/api/privacy.mjs). */
export const PRIVACY_KEYS: readonly PrivacyKey[] = ['profilePublic', 'showOnline', 'showLastSeen', 'showCurrentRoom', 'dmFrom', 'callsFrom', 'invitesFrom'];

export function privacySync() {
  let confirmed: Partial<ServerPrivacy> = {};
  // The newest change of each choice still on its way.
  const latest = new Map<PrivacyKey, number>();
  let n = 0;
  return {
    /** The server's settings, read: they become the fallback; returned are those to show (no change on its way). */
    loaded(p: ServerPrivacy): Partial<ServerPrivacy> {
      confirmed = { ...p };
      return Object.fromEntries(PRIVACY_KEYS.filter((k) => !latest.has(k)).map((k) => [k, p[k]])) as Partial<ServerPrivacy>;
    },
    /** A change about to be sent: its number. */
    begin(k: PrivacyKey): number {
      n += 1;
      latest.set(k, n);
      return n;
    },
    /** The server took change `id`; `p` is all it has now. */
    saved(k: PrivacyKey, id: number, p: ServerPrivacy) {
      confirmed = { ...p };
      if (latest.get(k) === id) latest.delete(k);
    },
    /** The server refused change `id`: the value to put back (`before`: the one shown before it, when the server's
     *  isn't known yet), or undefined when a newer change of the same choice decides. */
    failed<K extends PrivacyKey>(k: K, id: number, before: ServerPrivacy[K]): ServerPrivacy[K] | undefined {
      if (latest.get(k) !== id) return undefined;
      latest.delete(k);
      return (confirmed[k] as ServerPrivacy[K] | undefined) ?? before;
    },
    /** Another account: nothing confirmed, nothing on its way. */
    reset() {
      confirmed = {};
      latest.clear();
    },
  };
}
