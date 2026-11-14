// Google Play Billing on the phone through expo-iap (config plugin in app.json, store pinned to Play), as the
// small stores the billing flows use: coin packs (lib/live/billing-core StoreAdapter) and the Abonelik's
// subscriptions (lib/live/vip-core SubsStore). Android only; null elsewhere.
// expo-iap is required lazily: a build without its native module (Expo Go, an old dev build) gets null here
// and the wallet says Google Play isn't reachable, instead of crashing on start. The web build has its own
// file (play-store.web.ts) so the SDK is never bundled there.
import { Platform } from 'react-native';
import type * as ExpoIap from 'expo-iap';

import type { StoreAdapter, StorePurchase } from '@/lib/live/billing-core';
import { baseOfferToken, type SubPurchase, type SubsStore } from '@/lib/live/vip-core';

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

const toSub = (p: ExpoIap.Purchase): SubPurchase => ({ ...toPurchase(p), acknowledged: (p as { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid === true });

/** The Abonelik plans as Play subscriptions (lib/live/vip-core SubsStore): each plan's base plan, bought by its offer token. */
function subsAdapter(m: typeof ExpoIap): SubsStore {
  const offers = new Map<string, string>();
  async function load(ids: string[]) {
    const list = ((await m.fetchProducts({ skus: ids, type: 'subs' })) ?? []) as ExpoIap.ProductSubscription[];
    return list.flatMap((p) => {
      const token = baseOfferToken(p.platform === 'android' ? p.subscriptionOffers : []);
      if (!token) return [];
      offers.set(p.id, token);
      const offer = p.platform === 'android' ? p.subscriptionOffers.find((o) => o.offerTokenAndroid === token) : undefined;
      return [{ id: p.id, price: offer?.displayPrice || p.displayPrice }];
    });
  }
  return {
    connect: async () => !!(await m.initConnection()),
    products: load,
    async buy(productId, accountId) {
      if (!offers.has(productId)) await load([productId]);
      const offerToken = offers.get(productId);
      if (!offerToken) throw Object.assign(new Error('Plan Google Play’de yok'), { code: 'sku-not-found', productId });
      await m.requestPurchase({ request: { google: { skus: [productId], subscriptionOffers: [{ sku: productId, offerToken }], obfuscatedAccountId: accountId } }, type: 'subs' });
    },
    owned: async () => (await m.getAvailablePurchases()).map(toSub),
    async finish(p) {
      if (p.raw) await m.finishTransaction({ purchase: p.raw as ExpoIap.Purchase, isConsumable: false });
    },
    listen(onPurchase, onError) {
      const a = m.purchaseUpdatedListener((p) => onPurchase(toSub(p)));
      const b = m.purchaseErrorListener((e) => onError({ code: String(e.code ?? 'purchase-error'), productId: e.productId, message: e.message }));
      return () => {
        a.remove();
        b.remove();
      };
    },
  };
}

/** Google Play's subscriptions on this phone, or null (as playStore). */
export function playSubs(): SubsStore | null {
  const m = iap();
  return m ? subsAdapter(m) : null;
}
