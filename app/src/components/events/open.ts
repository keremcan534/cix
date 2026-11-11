// Opens Etkinlik Merkezi from anywhere (the Odalar calendar, a room, a notice's link): one host is mounted for the
// signed-in app (app/_layout EventCenterHost) and reads this.
import { useSyncExternalStore } from 'react';

export type CenterTab = 'all' | 'mine';
export type CenterOpen = { tab?: CenterTab; id?: number; create?: boolean; room?: string } | null;

let state: CenterOpen = null;
const subs = new Set<() => void>();
const set = (s: CenterOpen) => {
  state = s;
  for (const f of subs) f();
};
/** Opens the centre (on a tab, on one event, or straight on a new application). */
export const openEvents = (o: NonNullable<CenterOpen> = {}) => set({ ...o });
export const closeEvents = () => set(null);
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useEventsOpen = () => useSyncExternalStore(subscribe, () => state, () => state);
