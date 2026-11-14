// Abonelik (the VIP subscription) in a live build: the steps and the words, without React or the store SDK, so the
// tests can run them (tests/vip-subscription.test.ts). lib/live/vip wires them to expo-iap (play-store), the server
// (api.subscribeVip) and the VIP screen.
//
// The subscription is the server's (POST /api/vip/subscribe, server/api/vip.mjs): it checks the store purchase,
// counts each one once and answers with the end (vipSubUntil). The phone never adds days on its own. A test server
// (ALLOW_TEST_TOPUP=1, the catalog's `purchases.testTopup`) sells it for free on the 'test' platform; otherwise
// Google Play sells it, once the server can verify Play (`purchases.stores.android`). Play keeps a subscription
// that wasn't acknowledged in its purchase list, so one whose server answer was lost is sent again on the next
// start; the server acknowledges it, and the phone finishes it (not consumed) only after the server's answer.
import { keepForRetry, storeErrorKind, type StoreError, type StorePurchase } from '@/lib/live/billing-core';

export const VIP_PRODUCT = /^vip_\d+d$/;
/** The store product of a plan (server catalog.mjs VIP_SUBS). */
export const vipProductOf = (days: number) => `vip_${days}d`;
const DAY = 86_400_000;

/** A plan from the server's catalog (GET /api/catalog `vipPlans`). */
export type VipPlan = { productId: string; days: number };
/** The catalog as the VIP screen needs it. `android` is null when the server doesn't say (an older server). */
export type VipCatalog = { plans: VipPlan[]; testTopup: boolean; android: boolean | null };

/** GET /api/catalog as the VIP screen reads it; anything malformed is left out. An older server has no plans. */
export function parseVipCatalog(raw: unknown): VipCatalog {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const plans = (Array.isArray(r.vipPlans) ? r.vipPlans : []).flatMap((p): VipPlan[] => {
    const x = (p ?? {}) as Record<string, unknown>;
    return typeof x.productId === 'string' && VIP_PRODUCT.test(x.productId) && Number.isSafeInteger(x.days) && (x.days as number) > 0
      ? [{ productId: x.productId, days: x.days as number }]
      : [];
  });
  const opts = r.purchases && typeof r.purchases === 'object' ? (r.purchases as Record<string, unknown>) : null;
  const stores = opts?.stores && typeof opts.stores === 'object' ? (opts.stores as Record<string, unknown>) : null;
  return { plans, testTopup: opts?.testTopup === true, android: typeof stores?.android === 'boolean' ? stores.android : null };
}

/** The server's subscription end (ISO), or null when it is missing, malformed or past. */
export function liveUntil(until: unknown, now = Date.now()): string | null {
  if (typeof until !== 'string') return null;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now ? new Date(t).toISOString() : null;
}
/** Days left until `until`, counting a started day as a whole one (0 when none runs). */
export function daysLeft(until: string | null | undefined, now = Date.now()): number {
  const end = liveUntil(until, now);
  return end ? Math.ceil((Date.parse(end) - now) / DAY) : 0;
}
const dateTr = (iso: string) => new Date(iso).toLocaleDateString('tr-TR');

// --- How the screen buys ----------------------------------------------------------------------------------
/** 'test': the server's free test subscription. 'play': Google Play. 'notice': not on sale here (SALE_NOTICE says why). */
export type VipSaleMode = 'loading' | 'test' | 'play' | 'notice';
export type VipSale = { mode: VipSaleMode; notice: string | null };

export const SALE_NOTICE = {
  offline: 'Abonelik planlarına şu an ulaşılamıyor. İnternetini kontrol edip yeniden dene.',
  'not-android': 'Abonelik şimdilik Android uygulamasında, Google Play ile.',
  'not-configured': 'Google Play ile abonelik çok yakında açılıyor.',
  'old-server': 'Abonelik bu sunucuda henüz açık değil.',
  'no-store': "Google Play'e şu an ulaşılamıyor. Bu cihazda Play Store açık ve güncel olmalı; biraz sonra yeniden dene.",
  'no-products': "Abonelik planları Google Play'de hazırlanıyor; çok yakında burada.",
} as const;

/** What the VIP screen does with "Satın al", from what is known so far. A test server always sells the free one. */
export function vipSale(s: { android: boolean; catalog: VipCatalog | null | 'failed'; storeReady: boolean | null; prices: Record<string, string> | null }): VipSale {
  const notice = (k: keyof typeof SALE_NOTICE): VipSale => ({ mode: 'notice', notice: SALE_NOTICE[k] });
  if (s.catalog === 'failed') return notice('offline');
  if (!s.catalog) return { mode: 'loading', notice: null };
  if (!s.catalog.plans.length) return notice('old-server');
  if (s.catalog.testTopup) return { mode: 'test', notice: null };
  if (!s.android) return notice('not-android');
  if (s.catalog.android === false) return notice('not-configured');
  if (s.storeReady === null) return { mode: 'loading', notice: null };
  if (!s.storeReady) return notice('no-store');
  if (!s.prices) return { mode: 'loading', notice: null };
  return Object.keys(s.prices).length ? { mode: 'play', notice: null } : notice('no-products');
}

// --- Words ------------------------------------------------------------------------------------------------
/** The server's answer to a subscription: its end, the plan's days, and whether this purchase was already counted. */
export type VipVerified<U> = { user: U; replay: boolean; until: string | null; days: number };

export type VipOutcome =
  | { kind: 'done'; until: string | null; days: number; replay: boolean }
  | { kind: 'cancelled' }
  | { kind: 'busy' }
  | { kind: 'pending' }
  /** Paid, but the server couldn't be reached: Play keeps it, and it is sent again on the next start. */
  | { kind: 'saved' }
  | { kind: 'owned' }
  | { kind: 'failed'; message: string }
  | { kind: 'unavailable' };

/** What the VIP screen says after "Satın al"; null when nothing needs saying (cancelled, busy). */
export function vipOutcomeAlert(o: VipOutcome): { title: string; body: string } | null {
  switch (o.kind) {
    case 'done': {
      const end = o.until ? ` Bitiş: ${dateTr(o.until)}.` : '';
      if (o.replay) return o.until ? { title: 'VIP aktif', body: `Bu abonelik zaten hesabında.${end}` } : { title: 'Abonelik bitmiş', body: 'Bu abonelik artık geçerli değil. Yeni bir plan seçebilirsin.' };
      return { title: 'VIP aktif 🎉', body: `Aboneliğin başladı.${end}` };
    }
    case 'pending':
      return { title: 'Ödeme onay bekliyor', body: 'Ödemen tamamlandığında aboneliğin kendiliğinden başlar.' };
    case 'saved':
      return { title: 'Ödemen alındı', body: 'Aboneliğin, bağlantı kurulur kurulmaz başlayacak. Uygulamayı kapatsan da kaybolmaz.' };
    case 'owned':
      return { title: 'Aboneliğin zaten var', body: "Bu planın aboneliği Google Play'de açık. Planı Google Play › Abonelikler'den yönetebilirsin." };
    case 'failed':
      return { title: 'Abonelik başlatılamadı', body: o.message };
    case 'unavailable':
      return { title: 'Abonelik', body: SALE_NOTICE['no-store'] };
    default:
      return null;
  }
}

/** The free test subscription's answer, in words (no store, no payment). */
export function testAlert(r: { replay: boolean; until: string | null; days: number }): { title: string; body: string } {
  const end = r.until ? ` Bitiş: ${dateTr(r.until)}.` : '';
  if (r.replay) return { title: 'VIP aktif', body: `Bu test aboneliği daha önce eklenmişti.${end}` };
  return { title: 'VIP aktif 🎉', body: `${r.days} gün eklendi (test sürümü, ödeme alınmadı).${end}` };
}

const STORE_FAILED = {
  missing: 'Bu plan Google Play’de şu an satışta değil. Biraz sonra yeniden dene.',
  network: 'Google Play’e bağlanılamadı. İnternetini kontrol edip yeniden dene; ödeme alınmadı.',
  failed: 'Google Play ödemeyi tamamlamadı. Ödeme alınmadıysa yeniden deneyebilirsin.',
} as const;
const statusOf = (e: unknown) => (e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : null);
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Abonelik doğrulanamadı. Destek’e yazarsan hemen bakarız.');

// --- The Play flow ----------------------------------------------------------------------------------------
/** A subscription in Play's purchase list; `acknowledged`: the server (or this phone) already confirmed it. */
export type SubPurchase = StorePurchase & { acknowledged?: boolean };
export type SubProduct = { id: string; price: string };

/** Google Play's subscriptions as the flow uses them (lib/live/play-store playSubs). */
export interface SubsStore {
  connect(): Promise<boolean>;
  /** The plans Play sells, with the price of each one's base plan. */
  products(ids: string[]): Promise<SubProduct[]>;
  /** Opens Play's payment sheet for the plan's base plan; the result comes through `listen`. */
  buy(productId: string, accountId: string): Promise<void>;
  owned(): Promise<SubPurchase[]>;
  /** Acknowledges it on the phone (not consumed: a subscription stays owned). */
  finish(p: SubPurchase): Promise<void>;
  listen(onPurchase: (p: SubPurchase) => void, onError: (e: StoreError) => void): () => void;
}

export type VipBillingDeps<U> = {
  store: SubsStore;
  verify: (productId: string, token: string) => Promise<VipVerified<U>>;
  /** The server's answer reaches the app (the account's vipSubUntil). */
  apply: (r: VipVerified<U>) => void;
  /** sha256 hex of the signed-in server user id (Play obfuscatedAccountId), or null when not signed in. */
  accountId: () => Promise<string | null>;
  /** A purchase settled with no screen waiting for it (a pending payment that completed, a retry). */
  onLate?: (o: VipOutcome) => void;
  waitMs?: number;
};

export function createVipBilling<U>(d: VipBillingDeps<U>) {
  const inflight = new Map<string, Promise<VipOutcome>>();
  let active: { productId: string; done: (o: VipOutcome) => void } | null = null;
  let ready = false;
  let starting: Promise<boolean> | null = null;
  let unlisten: (() => void) | null = null;

  /** One token to the server, once at a time; on its answer the app has the end, then Play's copy is acknowledged. */
  function confirm(p: SubPurchase): Promise<VipOutcome> {
    let run = inflight.get(p.token);
    if (run) return run;
    run = (async (): Promise<VipOutcome> => {
      let r: VipVerified<U>;
      try {
        r = await d.verify(p.productId, p.token);
      } catch (e) {
        if (statusOf(e) === 402) return { kind: 'pending' };
        // Play keeps it until it is acknowledged: the next start sends it again.
        if (keepForRetry(e)) return { kind: 'saved' };
        return { kind: 'failed', message: errorText(e) };
      }
      d.apply(r);
      // The server acknowledged it already; this is the second try (an error here only means it is done).
      await d.store.finish(p).catch(() => {});
      return { kind: 'done', until: r.until, days: r.days, replay: r.replay };
    })().finally(() => inflight.delete(p.token));
    inflight.set(p.token, run);
    return run;
  }

  function settle(p: SubPurchase): Promise<VipOutcome> {
    if (p.state === 'pending') return Promise.resolve({ kind: 'pending' });
    if (p.state !== 'purchased' || !p.token) return Promise.resolve({ kind: 'failed', message: STORE_FAILED.failed });
    return confirm(p);
  }

  const deliver = (productId: string | null | undefined, o: VipOutcome) => {
    if (active && (!productId || active.productId === productId)) active.done(o);
    else d.onLate?.(o);
  };

  // Coin packs come through the same listener: they are the wallet's (lib/live/billing), not ours.
  const onPurchase = (p: SubPurchase) => {
    if (!VIP_PRODUCT.test(p.productId)) return;
    void settle(p).then((o) => deliver(p.productId, o));
  };

  /** Play says this plan is already owned: verified again, in case the server never heard of it. */
  async function recover(productId: string): Promise<VipOutcome> {
    const held = (await d.store.owned().catch(() => [] as SubPurchase[])).find((p) => p.productId === productId && p.state === 'purchased' && p.token);
    if (!held) return { kind: 'owned' };
    const o = await confirm(held);
    return o.kind === 'done' && o.replay ? { kind: 'owned' } : o;
  }

  async function onError(e: StoreError) {
    if (!active || (e.productId && e.productId !== active.productId)) return;
    const productId = active.productId;
    const kind = storeErrorKind(e.code);
    if (kind === 'cancelled') return deliver(productId, { kind: 'cancelled' });
    if (kind === 'pending') return deliver(productId, { kind: 'pending' });
    if (kind === 'unavailable') return deliver(productId, { kind: 'unavailable' });
    if (kind === 'owned') return deliver(productId, await recover(productId));
    deliver(productId, { kind: 'failed', message: STORE_FAILED[kind] });
  }

  /** Subscriptions Play holds that nobody acknowledged yet: to the server again. */
  async function reconcile() {
    if (!ready) return;
    const held = (await d.store.owned().catch(() => [] as SubPurchase[])).filter((p) => VIP_PRODUCT.test(p.productId) && p.state === 'purchased' && p.token && !p.acknowledged);
    const outs = await Promise.all(held.filter((p) => !inflight.has(p.token)).map(confirm));
    for (const o of outs) if (o.kind === 'done' && !o.replay) d.onLate?.(o);
  }

  return {
    get ready() {
      return ready;
    },
    start(): Promise<boolean> {
      if (ready) return Promise.resolve(true);
      starting ??= (async () => {
        const ok = await d.store.connect().catch(() => false);
        if (!ok) return false;
        unlisten ??= d.store.listen(onPurchase, (e) => void onError(e));
        ready = true;
        void reconcile().catch(() => {});
        return true;
      })().finally(() => (starting = null));
      return starting;
    },
    reconcile: () => reconcile().catch(() => {}),
    products: (ids: string[]) => (ready ? d.store.products(ids).catch(() => [] as SubProduct[]) : Promise.resolve([] as SubProduct[])),
    /** Opens Play's sheet for one plan and waits for its outcome. One purchase at a time. */
    async buy(productId: string): Promise<VipOutcome> {
      if (!ready) return { kind: 'unavailable' };
      if (active) return { kind: 'busy' };
      const slot: { productId: string; done: (o: VipOutcome) => void } = { productId, done: () => {} };
      active = slot;
      const account = await d.accountId().catch(() => null);
      if (!account) {
        active = null;
        return { kind: 'failed', message: 'Hesabına şu an ulaşılamıyor. İnternetini kontrol edip yeniden dene; ödeme alınmadı.' };
      }
      return new Promise<VipOutcome>((resolve) => {
        const timer = setTimeout(() => slot.done({ kind: 'pending' }), d.waitMs ?? 5 * 60_000);
        slot.done = (o) => {
          clearTimeout(timer);
          if (active === slot) active = null;
          slot.done = (late) => d.onLate?.(late);
          resolve(o);
        };
        d.store.buy(productId, account).catch((e: unknown) => {
          const err = (e ?? {}) as { code?: unknown; productId?: string | null; message?: string };
          void onError({ code: String(err.code ?? 'purchase-error'), productId: err.productId ?? productId, message: err.message });
        });
      });
    },
    stop() {
      unlisten?.();
      unlisten = null;
      ready = false;
    },
  };
}

/** The base plan's offer among a subscription's offers: the one without an offer of its own, else the first with a token. */
export function baseOfferToken(offers: { id?: string | null; basePlanIdAndroid?: string | null; offerTokenAndroid?: string | null; offerTagsAndroid?: string[] | null }[]): string | null {
  const withToken = offers.filter((o) => typeof o.offerTokenAndroid === 'string' && o.offerTokenAndroid);
  const base = withToken.find((o) => !o.id || o.id === o.basePlanIdAndroid);
  return (base ?? withToken[0])?.offerTokenAndroid ?? null;
}
