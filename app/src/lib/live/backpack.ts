// Live mode (lib/live): Çantam on the server (server/api/backpack.mjs). The gift panel's Çantam shelf reads it each
// time the panel opens, Görevler when it comes to the front (what the call task puts in). A send from it goes to
// the server, which costs no coins, takes the gifts out and answers with what is left. Without a server address
// none of this runs: the gift panel keeps the demo's sample backpack.
import * as api from '@/lib/api';
import { applyServerUser, once, toServer } from '@/lib/live';
import { focusStore } from '@/lib/live/focus-store';

const store = focusStore(api.backpack);

/** My backpack and its sources as the server has them; null until read (and always without a server). */
export const useBackpack = (on = true) => store.useData(on);
/** Reads it again now (the gift panel opening). */
export const refreshBackpack = store.refresh;

/** One free gift from the backpack to `to` in server room `room`; the answer's backpack replaces the one held. */
export async function liveBackpackGift(to: string, giftId: string, count: number, room: string) {
  const id = toServer(to);
  if (!id) throw new Error('Bu kişiye şu an ulaşılamıyor');
  const r = await once(`bag:${id}:${giftId}:${count}:${room}`, (ref) => api.backpackSend(id, giftId, count, room, ref));
  applyServerUser(r, 'Çantadan hediye gönderildi');
  store.put({ items: r.items, sources: store.current()?.sources ?? [] });
  return r;
}
