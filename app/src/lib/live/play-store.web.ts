// Web: no Google Play Billing (play-store.ts is the phone's). The wallet says purchases are in the Android app.
import type { StoreAdapter } from '@/lib/live/billing-core';
import type { SubsStore } from '@/lib/live/vip-core';

export function playStore(): StoreAdapter | null {
  return null;
}

export function playSubs(): SubsStore | null {
  return null;
}
