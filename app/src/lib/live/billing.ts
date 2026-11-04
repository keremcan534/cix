// Real coin packs through Google Play in a live build (the steps: lib/live/billing-core). The wallet screen
// reads useShop() and calls openShop() / buyCoins(); LiveSync calls resumePurchases() once signed in, so a
// purchase whose server answer was lost is verified again on the next app start.
//
// The obfuscated account id sent to Play is sha256 hex of the server user id (expo-crypto: Hermes has no
// WebCrypto); the server checks it against the signed-in account (server/api/purchases.mjs).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import * as api from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { applyServerUser, liveMode, myServerId, refreshWallet } from '@/lib/live';
import { createBilling, outcomeAlert, parseCatalog, parseSaved, shopPacks, shopStatus, type Outcome, type ShopCatalog, type ShopPack, type ShopStatus } from '@/lib/live/billing-core';
import { playStore } from '@/lib/live/play-store';

const SAVED_KEY = 'similarclub:iap-unverified';

type Billing = ReturnType<typeof createBilling<api.ServerUser>>;
let made: Billing | null | undefined;
/** The billing flow, made on first use (not at app start): null without Google Play in this build. */
function getBilling(): Billing | null {
  if (made !== undefined) return made;
  const store = playStore();
  made = store
    ? createBilling<api.ServerUser>({
        store,
        verify: (productId, token) => api.verifyPurchase({ platform: 'android', productId, token }),
        apply: (r, reason) => applyServerUser(r, reason),
        async accountId() {
          if (!myServerId()) await refreshWallet();
          const id = myServerId();
          return id ? (await digestStringAsync(CryptoDigestAlgorithm.SHA256, id)).toLowerCase() : null;
        },
        load: async () => parseSaved(await AsyncStorage.getItem(SAVED_KEY), Date.now()),
        save: (list) => AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list)),
        // A pending payment that completed, or a purchase verified on a later try.
        onLate: (o) => {
          const a = o.kind === 'done' ? outcomeAlert(o) : null;
          if (a) showAlert(a.title, a.body);
        },
      })
    : null;
  return made;
}

// --- What the wallet shows --------------------------------------------------------------------------------
export type Shop = { status: ShopStatus; packs: ShopPack[]; testTopup: boolean };
const android = Platform.OS === 'android';
let catalog: ShopCatalog | null | 'failed' = null;
let storeReady: boolean | null = null;
let packs: ShopPack[] | null = null;
let shop: Shop = { status: shopStatus({ android, catalog, storeReady, packs }), packs: [], testTopup: false };
const listeners = new Set<() => void>();
const publish = () => {
  shop = {
    status: shopStatus({ android, catalog, storeReady, packs }),
    packs: packs ?? [],
    // Free test packs only when the server allows them (ALLOW_TEST_TOPUP=1); unknown until the catalog answers.
    testTopup: !!catalog && catalog !== 'failed' && catalog.testTopup,
  };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useShop = () => useSyncExternalStore(subscribe, () => shop, () => shop);

let opening: Promise<void> | null = null;
/** Called when the wallet opens: the server's packs, Play's prices, and anything left to verify. */
export function openShop(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  opening ??= (async () => {
    let c: ShopCatalog;
    try {
      c = parseCatalog(await api.apiRequest('GET', '/api/catalog'));
    } catch {
      // Offline: what an earlier visit loaded stays on screen.
      if (!catalog || catalog === 'failed') catalog = 'failed';
      return publish();
    }
    catalog = c;
    publish();
    if (!android) return;
    const billing = getBilling();
    // No native module in this build (Expo Go, an old dev build): Play can't be reached from here.
    if (!billing) return void ((storeReady = false), publish());
    const wasReady = billing.ready;
    storeReady = await billing.start();
    publish();
    if (!storeReady) return;
    // A first start verifies what is left by itself; a later visit asks again.
    if (wasReady) void billing.reconcile();
    packs = shopPacks(c.packs, await billing.products(c.packs.map((p) => p.productId)));
    publish();
  })().finally(() => (opening = null));
  return opening;
}

/** Once signed in at app start (LiveSync): verifies purchases that never got the server's answer. */
export function resumePurchases() {
  const billing = android && liveMode() ? getBilling() : null;
  if (!billing) return;
  void billing.start().then((ok) => {
    if (ok && storeReady !== true) {
      storeReady = true;
      publish();
    }
  });
}

/** Buys one pack; the coins arrive only with the server's answer. Returns what to tell the person. */
export async function buyCoins(productId: string): Promise<Outcome> {
  const billing = android ? getBilling() : null;
  if (!billing) return { kind: 'unavailable' };
  if (!billing.ready && !(await billing.start())) return { kind: 'unavailable' };
  return billing.buy(productId);
}
