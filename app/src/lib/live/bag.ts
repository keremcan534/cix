// Live mode (lib/live): Çantam's items on the server (GET /api/economy, lib/bag-core): what I own, until when and where
// each came from. Read on signing in (lib/live/sync) and each time Çantam comes to the front; reading it also gives me
// the level rewards I've reached (server/api/level-rewards.mjs). Every read hands the store what it didn't know yet (a
// reward, a staff gift, something bought on another phone), so Çarşı and the rooms know them too. Without a server
// address nothing here runs.
import * as api from '@/lib/api';
import { parseBag, type Bag } from '@/lib/bag-core';
import { focusStore } from '@/lib/live/focus-store';

const takers = new Set<(bag: Bag) => void>();
const store = focusStore(async () => {
  const bag = parseBag(await api.economy());
  if (bag) takers.forEach((t) => t(bag));
  return bag;
});

/** My items as the server has them; null until read (and always without a server). */
export const useBag = (on = true) => store.useData(on);
/** Reads it again now (signing in). */
export const refreshBag = store.refresh;
/** `fn` hears every bag read (the store adds the items it didn't have); returns the unsubscribe. */
export function onBag(fn: (bag: Bag) => void) {
  takers.add(fn);
  return () => void takers.delete(fn);
}
