// Abonelik in a live build (the steps and words: lib/live/vip-core). The VIP screen reads useVipShop() and calls
// openVipShop() when it opens and buyVip() on "Satın al"; LiveSync calls resumeVip() once signed in, so a Play
// subscription whose server answer was lost is sent again on the next start. A test server (catalog
// `purchases.testTopup`) sells the plan for free on the 'test' platform, the way the side-loaded test APKs try it;
// otherwise Google Play sells it once the server can verify Play. The end always comes from the server's answer
// (vipSubUntil), through the same path as every balance (lib/live applyServerUser).
//
// The obfuscated account id sent to Play is sha256 hex of the server user id, as for coin packs; the server checks it.
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';

import * as api from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { applyServerUser, liveMode, message, myServerId, refreshWallet } from '@/lib/live';
import { fetchLiveCatalog } from '@/lib/live/catalog-live';
import { playSubs } from '@/lib/live/play-store';
import { refreshVisitors } from '@/lib/live/visitors';
import { createVipBilling, parseVipCatalog, testAlert, vipOutcomeAlert, vipSale, type VipCatalog, type VipOutcome, type VipSale } from '@/lib/live/vip-core';

const PACKAGE = 'com.similarclub.app';

/** After any new end: the visitors list is read again, so Profiline bakanlar opens (or closes) right away. */
const applied = (r: { user: api.ServerUser }) => {
  applyServerUser(r);
  void refreshVisitors(true);
};

type Billing = ReturnType<typeof createVipBilling<api.ServerUser>>;
let made: Billing | null | undefined;
/** The Play flow, made on first use: null without Google Play in this build. */
function getBilling(): Billing | null {
  if (made !== undefined) return made;
  const store = playSubs();
  made = store
    ? createVipBilling<api.ServerUser>({
        store,
        verify: (productId, token) => api.subscribeVip({ platform: 'android', productId, token }),
        apply: applied,
        async accountId() {
          if (!myServerId()) await refreshWallet();
          const id = myServerId();
          return id ? (await digestStringAsync(CryptoDigestAlgorithm.SHA256, id)).toLowerCase() : null;
        },
        onLate: (o) => {
          const a = o.kind === 'done' ? vipOutcomeAlert(o) : null;
          if (a) showAlert(a.title, a.body);
        },
      })
    : null;
  return made;
}

// --- What the screen shows --------------------------------------------------------------------------------
/** `prices`: Play's price of each plan (product id → text), once Play answered. `renewing`: a store subscription of
 *  mine renews on its own (buying another plan would charge twice: the screen sends to Play's subscriptions). */
export type VipShop = VipSale & { prices: Record<string, string>; renewing: { productId: string; platform: string } | null };
const android = Platform.OS === 'android';
let catalog: VipCatalog | null | 'failed' = null;
let storeReady: boolean | null = null;
let prices: Record<string, string> | null = null;
let renewing: VipShop['renewing'] = null;
const shopOf = (): VipShop => ({ ...vipSale({ android, catalog, storeReady, prices }), prices: prices ?? {}, renewing });
let shop: VipShop = shopOf();
const listeners = new Set<() => void>();
const publish = () => {
  shop = shopOf();
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useVipShop = () => useSyncExternalStore(subscribe, () => shop, () => shop);

/** My subscription as the server has it now (the end reaches the app with GET /api/me's vipSubUntil as well). */
async function readStatus() {
  const s = await api.vipStatus();
  const store = s.subscriptions.find((x) => x.platform !== 'test' && x.autoRenewing === true);
  renewing = store ? { productId: store.productId, platform: store.platform } : null;
  publish();
}

let opening: Promise<void> | null = null;
/** Called when the VIP screen opens: the server's plans and my subscription, then Play's prices on Android. */
export function openVipShop(): Promise<void> {
  if (!liveMode()) return Promise.resolve();
  opening ??= (async () => {
    // GET /api/vip reads my own Google subscription again when it is due; the end then comes with /api/me.
    void readStatus()
      .then(() => refreshWallet())
      .catch(() => {});
    let c: VipCatalog;
    try {
      c = parseVipCatalog(await fetchLiveCatalog());
    } catch {
      if (!catalog || catalog === 'failed') catalog = 'failed';
      return publish();
    }
    catalog = c;
    publish();
    if (!android || c.testTopup || !c.plans.length || c.android === false) return;
    const billing = getBilling();
    if (!billing) return void ((storeReady = false), publish());
    const wasReady = billing.ready;
    storeReady = await billing.start();
    publish();
    if (!storeReady) return;
    if (wasReady) void billing.reconcile();
    const list = await billing.products(c.plans.map((p) => p.productId));
    prices = Object.fromEntries(list.filter((p) => p.price).map((p) => [p.id, p.price]));
    publish();
  })().finally(() => (opening = null));
  return opening;
}

/** Once signed in at app start (LiveSync): a Play subscription the server never answered for is sent again. */
export function resumeVip() {
  const billing = android && liveMode() ? getBilling() : null;
  if (billing) void billing.start();
}

/** Where a Play subscription is changed or cancelled. */
export const openPlaySubscriptions = (productId?: string) =>
  void Linking.openURL(`https://play.google.com/store/account/subscriptions?package=${PACKAGE}${productId ? `&sku=${encodeURIComponent(productId)}` : ''}`).catch(() => {});

/** "Satın al" for one plan in a live build; resolves with what to tell the person (null: nothing to say). */
export async function buyVip(productId: string): Promise<{ title: string; body: string } | null> {
  const s = shop;
  if (s.mode === 'test') {
    try {
      const r = await api.subscribeVip({ platform: 'test', productId, transactionId: api.newRef() });
      applied(r);
      return testAlert(r);
    } catch (e) {
      return { title: 'Abonelik başlatılamadı', body: message(e) };
    }
  }
  if (s.mode !== 'play') return { title: 'Abonelik', body: s.notice ?? 'Abonelik planları hazırlanıyor…' };
  const billing = getBilling();
  if (!billing) return vipOutcomeAlert({ kind: 'unavailable' });
  if (!billing.ready && !(await billing.start())) return vipOutcomeAlert({ kind: 'unavailable' });
  const o: VipOutcome = await billing.buy(productId);
  if (o.kind === 'done') void readStatus().catch(() => {});
  return vipOutcomeAlert(o);
}
