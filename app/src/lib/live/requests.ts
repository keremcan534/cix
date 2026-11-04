// Bookkeeping for lib/live's requests, kept free of native modules so node --test can load it
// (tests/live-requests.test.ts): request ids kept after a lost answer, and the order of wallet replies.

/** How long a request id whose answer never arrived is reused for the same action. */
export const UNSURE_TTL_MS = 5 * 60_000;

/**
 * Request ids kept after a lost answer, per action. They expire: the same action much later (another 1.000
 * jeton test pack tomorrow) is a new request, not a retry the server would answer with "already done".
 */
export function unsureRefs(ttlMs = UNSURE_TTL_MS, clock: () => number = Date.now) {
  const refs = new Map<string, { ref: string; at: number }>();
  return {
    get(key: string) {
      const e = refs.get(key);
      if (e && clock() - e.at > ttlMs) refs.delete(key);
      return refs.get(key)?.ref;
    },
    set: (key: string, ref: string) => void refs.set(key, { ref, at: clock() }),
    delete: (key: string) => void refs.delete(key),
    clear: () => refs.clear(),
  };
}

/**
 * Wallet replies are applied as the change since the last one, so an old balance arriving late would look like
 * a change (diamonds back after Çevir read as a gift). Every balance read takes a number when it starts; once a
 * money action's answer is applied, reads started before that are stale and dropped.
 */
export function replyOrder() {
  let started = 0;
  let fence = 0;
  return {
    begin: () => ++started,
    moneyApplied: () => void (fence = started),
    stale: (at: number) => at <= fence,
    reset: () => void (started = fence = 0),
  };
}
