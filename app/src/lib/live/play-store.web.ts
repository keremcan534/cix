// Web: no Google Play Billing (play-store.ts is the phone's). The wallet says purchases are in the Android app.
import type { StoreAdapter } from '@/lib/live/billing-core';

export function playStore(): StoreAdapter | null {
  return null;
}
