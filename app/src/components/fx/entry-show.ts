// Someone's entry show (components/fx/entry EntryShow) from their own shop look: the same in a server room when they
// come in (components/room/live-room) and in the person card's entry box (components/room/entry-box).
import type { EntryShow } from '@/components/fx/entry';
import { storeArtOf } from '@/components/StoreArt';
import type { EntryPlan } from '@/lib/room-entrance';
import { gradient } from '@/theme';

/** An entrance (lib/room-entrance entryPlanOf) as the banner draws it, with their name and photo; null: none. */
export function entryShowOfPlan(plan: EntryPlan | null, name: string, avatar: string): EntryShow | null {
  if (!plan) return null;
  return {
    name,
    avatar,
    fx: plan.fx,
    ...(plan.clip ? { clip: plan.clip, plate: plan.plate ?? null } : {}),
    ride: plan.ride,
    rideArt: storeArtOf(plan.rideId),
    colors: plan.tint === undefined ? undefined : (plan.tint ?? gradient),
    badge: plan.badge,
  };
}
