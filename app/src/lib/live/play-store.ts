// Google Play Billing on the phone through expo-iap (config plugin in app.json, store pinned to Play), as the
// small store the billing flow uses (lib/live/billing-core StoreAdapter). Android only; null elsewhere.
// expo-iap is required lazily: a build without its native module (Expo Go, an old dev build) gets null here
// and the wallet says Google Play isn't reachable, instead of crashing on start. The web build has its own
// file (play-store.web.ts) so the SDK is never bundled there.
import { Platform } from 'react-native';
import type * as ExpoIap from 'expo-iap';

import type { StoreAdapter, StorePurchase } from '@/lib/live/billing-core';

let lib: typeof ExpoIap | null | undefined;
function iap(): typeof ExpoIap | null {
  if (lib === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      lib = Platform.OS === 'android' ? (require('expo-iap') as typeof ExpoIap) : null;
    } catch {
      lib = null;
    }
  }
  return lib;
}

const toPurchase = (p: ExpoIap.Purchase): StorePurchase => ({
  productId: p.productId,
  token: p.purchaseToken ?? '',
  state: p.purchaseState === 'purchased' ? 'purchased' : p.purchaseState === 'pending' ? 'pending' : 'unknown',
  raw: p,
});

function adapter(m: typeof ExpoIap): StoreAdapter {
  return {
    connect: async () => !!(await m.initConnection()),
    async products(ids) {
      const list = ((await m.fetchProducts({ skus: ids, type: 'in-app' })) ?? []) as ExpoIap.Product[];
      return list.map((p) => ({ id: p.id, price: p.displayPrice }));
    },
    async buy(productId, accountId) {
      await m.requestPurchase({ request: { google: { skus: [productId], obfuscatedAccountId: accountId } }, type: 'in-app' });
    },
    owned: async () => (await m.getAvailablePurchases()).map(toPurchase),
    async finish(p) {
      if (p.raw) await m.finishTransaction({ purchase: p.raw as ExpoIap.Purchase, isConsumable: true });
    },
    listen(onPurchase, onError) {
      const a = m.purchaseUpdatedListener((p) => onPurchase(toPurchase(p)));
      const b = m.purchaseErrorListener((e) => onError({ code: String(e.code ?? 'purchase-error'), productId: e.productId, message: e.message }));
      return () => {
        a.remove();
        b.remove();
      };
    },
  };
}

/** Google Play on this phone, or null (not Android, or the native module isn't in this build). */
export function playStore(): StoreAdapter | null {
  const m = iap();
  return m ? adapter(m) : null;
}
