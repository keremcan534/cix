// Live mode (lib/live): Yeni üye ödülleri from the server (server/api/referrals.mjs). GET /api/rewards says which coin
// packs still carry my first-purchase gift (Cüzdan), the welcome coins I got (the end of sign-up) and whether a friend's
// code can still go in; GET /api/invite is Arkadaşını Getir (my code, the code I entered, what my invites brought).
// Each is read again when a screen that shows it comes to the front, and after something changes it (a purchase, a
// code). Another account signed in on this phone starts from nothing. Without a server address nothing here runs.
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { liveMode, myServerId } from '@/lib/live';

type Snap<T> = { owner: string | null; data: T | null; failed: boolean };

/** One small store: the last answer of `read` for the signed-in account, read once at a time. */
function store<T>(read: () => Promise<T>) {
  let snap: Snap<T> = { owner: null, data: null, failed: false };
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };
  const set = (next: Snap<T>) => {
    snap = next;
    listeners.forEach((l) => l());
  };
  let reading: Promise<void> | null = null;
  /** Reads again; a failed read keeps what was there and says so. */
  const refresh = (): Promise<void> => {
    if (!liveMode()) return Promise.resolve();
    reading ??= (async () => {
      const owner = myServerId();
      try {
        set({ owner, data: await read(), failed: false });
      } catch {
        set({ ...snap, failed: true });
      }
    })().finally(() => (reading = null));
    return reading;
  };
  /** The answer for me (null until read, and always without a server), read again when the screen is in front. */
  const use = () => {
    const s = useSyncExternalStore(subscribe, () => snap, () => snap);
    const focused = useIsFocused();
    useEffect(() => {
      if (liveMode() && focused) void refresh();
    }, [focused]);
    const me = myServerId();
    const mine = !(me && s.owner && s.owner !== me);
    return { data: mine ? s.data : null, failed: s.failed, reload: refresh };
  };
  return { refresh, use };
}

const rewards = store(api.myRewards);
const invite = store(api.myInvite);

/** GET /api/rewards: first-purchase packs, my welcome coins, the invite switch. */
export const useRewards = () => rewards.use().data;
export const refreshRewards = rewards.refresh;
/** Arkadaşını Getir: `failed` when the last read didn't reach the server. */
export const useInvite = invite.use;
export const refreshInvite = invite.refresh;

/** Enters a friend's code; afterwards both stores are read again (the reward may already be paid). */
export async function enterInviteCode(code: string) {
  const mine = await api.redeemInvite(code);
  await Promise.all([invite.refresh(), rewards.refresh()]);
  return mine;
}
