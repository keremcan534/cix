// Coin packs bought through Google Play in a live build: the steps and the words, without React or the store
// SDK, so the tests can run them (tests/billing.test.ts). lib/live/billing wires them to expo-iap (play-store),
// the server (api.verifyPurchase) and the wallet.
//
// Money is decided on the server. A purchase only reaches the wallet as the server's answer to its token
// (POST /api/wallet/purchase, server/api/purchases.mjs), which credits each token once and consumes it on
// Google Play. Until the server has answered, the token is kept on the phone: a payment that went through while
// the network was down is verified again on the next app start or the next visit to the wallet. Play also keeps
// every purchase that wasn't consumed, so those are verified again too (an "already owned" pack, a pending
// payment that completed later). Only after the server's answer is the purchase finished as consumable here.

/** A pack from the server's catalog (GET /api/catalog). */
export type CatalogPack = { productId: string; coins: number; firstBonus: number };
/** The catalog as the wallet needs it. `android` is null when the server doesn't say (an older server). */
export type ShopCatalog = { packs: CatalogPack[]; testTopup: boolean; android: boolean | null };

export type StoreProduct = { id: string; price: string };
export type StorePurchase = { productId: string; token: string; state: 'purchased' | 'pending' | 'unknown'; raw?: unknown };
export type StoreError = { code: string; productId?: string | null; message?: string };

/** The store SDK as the core uses it (lib/live/play-store). */
export interface StoreAdapter {
  connect(): Promise<boolean>;
  products(ids: string[]): Promise<StoreProduct[]>;
  /** Opens the store's payment sheet; the result comes through `listen`. */
  buy(productId: string, accountId: string): Promise<void>;
  /** Purchases the store still holds (not consumed yet). */
  owned(): Promise<StorePurchase[]>;
  /** Consumes the purchase so the pack can be bought again. */
  finish(p: StorePurchase): Promise<void>;
  listen(onPurchase: (p: StorePurchase) => void, onError: (e: StoreError) => void): () => void;
}

/** A token kept until the server has answered for it. */
export type SavedToken = { productId: string; token: string; at: number };

/** `bonus`: the first-buy gift; `campaignBonus`: a campaign's extra coins (missing from an older server). */
export type Verified<U> = { user: U; replay: boolean; coins: number; bonus: number; campaignBonus?: number };

export type BillingDeps<U> = {
  store: StoreAdapter;
  /** The server checks the token with Google, credits it once and answers with the new balance. */
  verify: (productId: string, token: string) => Promise<Verified<U>>;
  /** The server's balance reaches the wallet (lib/live applied). */
  apply: (r: Verified<U>, reason: string) => void;
  /** sha256 hex of the signed-in server user id (Play obfuscatedAccountId), or null when not signed in. */
  accountId: () => Promise<string | null>;
  load: () => Promise<SavedToken[]>;
  save: (list: SavedToken[]) => Promise<void>;
  /** A purchase settled with no screen waiting for it (a pending payment that completed, a retry). */
  onLate?: (o: Outcome) => void;
  now?: () => number;
  /** How long a purchase sheet may stay open before the screen stops waiting (the result still arrives later). */
  waitMs?: number;
};

export type Outcome =
  /** `campaignBonus` only when a campaign added coins. */
  | { kind: 'done'; coins: number; bonus: number; replay: boolean; campaignBonus?: number }
  | { kind: 'cancelled' }
  | { kind: 'busy' }
  | { kind: 'pending' }
  /** Paid, but the server couldn't be reached: the token is kept and verified later. */
  | { kind: 'saved' }
  | { kind: 'failed'; message: string }
  | { kind: 'unavailable' };

export const COIN_PRODUCT = /^coins_\d+$/;
/** Tokens are kept a week at most: Google refunds a purchase nobody acknowledged within 3 days. */
export const KEEP_MS = 7 * 24 * 3600_000;
const MAX_SAVED = 20;

// --- Words ------------------------------------------------------------------------------------------------
const n = (x: number) => x.toLocaleString('tr-TR');
/** A campaign's extra coins from the server's answer: a whole number above 0, else none. */
const campaignBonus = (x: unknown) => (typeof x === 'number' && Number.isSafeInteger(x) && x > 0 ? x : 0);

export type ShopStatus = 'loading' | 'ready' | 'offline' | 'not-android' | 'not-configured' | 'no-store' | 'no-products';

/** The calm line shown where the packs would be. */
export const SHOP_NOTICE: Record<Exclude<ShopStatus, 'ready'>, string> = {
  loading: 'Paketler hazırlanıyor…',
  offline: 'Paketlere şu an ulaşılamıyor. İnternetini kontrol edip yeniden dene.',
  'not-android': 'Jeton satın alma şimdilik Android uygulamasında, Google Play ile.',
  'not-configured': 'Google Play ile jeton satın alma çok yakında açılıyor.',
  'no-store': "Google Play'e şu an ulaşılamıyor. Bu cihazda Play Store açık ve güncel olmalı; biraz sonra yeniden dene.",
  'no-products': "Jeton paketleri Google Play'de hazırlanıyor; çok yakında burada.",
};

/** What the wallet tells the person after a purchase; null when nothing needs saying (cancelled, busy). */
export function outcomeAlert(o: Outcome): { title: string; body: string } | null {
  switch (o.kind) {
    case 'done': {
      if (o.replay) return { title: 'Jetonlar hesabında', body: 'Bu ödeme daha önce hesabına eklenmişti; bakiyen güncel.' };
      const first = o.bonus ? ` İlk alım hediyesi olarak +${n(o.bonus)} jeton da eklendi.` : '';
      const campaign = campaignBonus(o.campaignBonus);
      return { title: 'Jetonlar yüklendi', body: `${n(o.coins)} jeton hesabına eklendi.${first}${campaign ? ` Kampanya hediyesi olarak +${n(campaign)} jeton da eklendi.` : ''}` };
    }
    case 'pending':
      return { title: 'Ödeme onay bekliyor', body: 'Ödemen tamamlandığında jetonların hesabına kendiliğinden eklenir.' };
    case 'saved':
      return { title: 'Ödemen alındı', body: 'Jetonların, bağlantı kurulur kurulmaz hesabına eklenecek. Uygulamayı kapatsan da kaybolmaz.' };
    case 'failed':
      return { title: 'Satın alma tamamlanamadı', body: o.message };
    case 'unavailable':
      return { title: 'Jeton satın alma', body: SHOP_NOTICE['no-store'] };
    default:
      return null;
  }
}

/** The wallet history line of a purchase (the same words as the server's ledger). */
export function purchaseReason(bonus: number, campaign = 0) {
  const extra = [bonus ? `+${n(bonus)} ilk alım hediyesi` : '', campaignBonus(campaign) ? `+${n(campaign)} kampanya` : ''].filter(Boolean);
  return extra.length ? `Jeton satın alma (${extra.join(', ')})` : 'Jeton satın alma';
}

// --- Catalog and packs ------------------------------------------------------------------------------------
/** GET /api/catalog as the wallet needs it; anything malformed is left out. An older server without
 *  `purchases` allows test packs (as before) and doesn't say whether it can verify Play. */
export function parseCatalog(raw: unknown): ShopCatalog {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const packs = (Array.isArray(r.packs) ? r.packs : []).flatMap((p): CatalogPack[] => {
    const x = (p ?? {}) as Record<string, unknown>;
    return typeof x.productId === 'string' && COIN_PRODUCT.test(x.productId) && Number.isFinite(x.coins)
      ? [{ productId: x.productId, coins: Number(x.coins), firstBonus: Number.isFinite(x.firstBonus) ? Number(x.firstBonus) : 0 }]
      : [];
  });
  const opts = r.purchases && typeof r.purchases === 'object' ? (r.purchases as Record<string, unknown>) : null;
  const stores = opts?.stores && typeof opts.stores === 'object' ? (opts.stores as Record<string, unknown>) : null;
  return {
    packs,
    testTopup: opts ? opts.testTopup === true : true,
    android: typeof stores?.android === 'boolean' ? stores.android : null,
  };
}

export type ShopPack = CatalogPack & { price: string };
/** The catalog's packs that exist in the store, in the catalog's order, with the store's localized price. */
export function shopPacks(catalog: CatalogPack[], products: StoreProduct[]): ShopPack[] {
  const price = new Map(products.filter((p) => p.price).map((p) => [p.id, p.price]));
  return catalog.flatMap((p) => (price.has(p.productId) ? [{ ...p, price: price.get(p.productId)! }] : []));
}

/** Which state the wallet shows, from what is known so far. */
export function shopStatus(s: { android: boolean; catalog: ShopCatalog | null | 'failed'; storeReady: boolean | null; packs: ShopPack[] | null }): ShopStatus {
  if (!s.android) return 'not-android';
  if (s.catalog === 'failed') return 'offline';
  if (!s.catalog) return 'loading';
  if (s.catalog.android === false) return 'not-configured';
  if (s.storeReady === null) return 'loading';
  if (!s.storeReady) return 'no-store';
  if (!s.packs) return 'loading';
  return s.packs.length ? 'ready' : 'no-products';
}

// --- Saved tokens -----------------------------------------------------------------------------------------
/** The saved tokens (AsyncStorage), malformed and week-old entries left out. */
export function parseSaved(raw: string | null, now: number): SavedToken[] {
  let list: unknown;
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is SavedToken => !!x && typeof x.token === 'string' && x.token.length >= 20 && typeof x.productId === 'string' && COIN_PRODUCT.test(x.productId) && Number.isFinite(x.at))
    .filter((x) => now - x.at < KEEP_MS)
    .slice(-MAX_SAVED);
}

// --- Errors -----------------------------------------------------------------------------------------------
/** A store error code in one spelling: E_USER_CANCELED, UserCancelled and user-cancelled are the same. */
export function storeCode(code: unknown): string {
  return String(code ?? '')
    .replace(/^E_/i, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
    .replace('canceled', 'cancelled');
}

export type StoreErrorKind = 'cancelled' | 'pending' | 'owned' | 'unavailable' | 'missing' | 'network' | 'failed';
export function storeErrorKind(code: unknown): StoreErrorKind {
  const c = storeCode(code);
  if (c === 'user-cancelled') return 'cancelled';
  if (c === 'pending' || c === 'deferred-payment') return 'pending';
  if (c === 'already-owned') return 'owned';
  if (['billing-unavailable', 'iap-not-available', 'service-disconnected', 'service-unavailable', 'not-prepared', 'init-connection', 'connection-closed', 'feature-not-supported', 'activity-unavailable'].includes(c)) return 'unavailable';
  if (['item-unavailable', 'sku-not-found', 'query-product', 'empty-sku-list'].includes(c)) return 'missing';
  if (['network-error', 'service-timeout', 'remote-error', 'interrupted'].includes(c)) return 'network';
  return 'failed';
}

const STORE_FAILED: Record<'missing' | 'network' | 'failed', string> = {
  missing: 'Bu paket Google Play’de şu an satışta değil. Biraz sonra yeniden dene.',
  network: 'Google Play’e bağlanılamadı. İnternetini kontrol edip yeniden dene; ödeme alınmadı.',
  failed: 'Google Play ödemeyi tamamlamadı. Ödeme alınmadıysa yeniden deneyebilirsin.',
};

/** The HTTP status of a server error (api.ApiError), or null for anything else. */
const statusOf = (e: unknown) => (e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : null);
/**
 * After a payment, may the server's answer still change? No answer, a lost proxy answer, a server error, an
 * expired session, Google not configured yet (503): keep the token and ask again. Anything else that isn't
 * understood is kept too: a paid purchase is never dropped on a guess.
 */
export function keepForRetry(e: unknown) {
  const s = statusOf(e);
  return s === null || s === 0 || s === 401 || s === 408 || s === 425 || s === 429 || s >= 500;
}
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Ödeme doğrulanamadı. Destek’e yazarsan hemen bakarız.');

// --- The flow ---------------------------------------------------------------------------------------------
export function createBilling<U>(d: BillingDeps<U>) {
  const now = d.now ?? Date.now;
  const inflight = new Map<string, Promise<Outcome>>();
  let active: { productId: string; done: (o: Outcome) => void } | null = null;
  let ready = false;
  let starting: Promise<boolean> | null = null;
  let unlisten: (() => void) | null = null;

  // Storage failures never stop a purchase: Play still holds an unconsumed purchase for the next try.
  const remember = async (productId: string, token: string) => {
    try {
      const list = await d.load();
      if (!list.some((x) => x.token === token)) await d.save([...list, { productId, token, at: now() }].slice(-MAX_SAVED));
    } catch {}
  };
  const forget = async (token: string) => {
    try {
      const list = await d.load();
      if (list.some((x) => x.token === token)) await d.save(list.filter((x) => x.token !== token));
    } catch {}
  };

  /** One token to the server, once at a time; on its answer the coins reach the wallet and Play consumes it. */
  function confirm(productId: string, token: string, purchase?: StorePurchase): Promise<Outcome> {
    let run = inflight.get(token);
    if (run) return run;
    run = (async (): Promise<Outcome> => {
      await remember(productId, token);
      let r: Verified<U>;
      try {
        r = await d.verify(productId, token);
      } catch (e) {
        // 402: Google still waits for the payment. Kept; it is asked again later.
        if (statusOf(e) === 402) return { kind: 'pending' };
        if (keepForRetry(e)) return { kind: 'saved' };
        // The server refused it for good (another account's purchase, unknown token). Not finished here:
        // Google refunds a purchase nobody acknowledged.
        await forget(token);
        return { kind: 'failed', message: errorText(e) };
      }
      const campaign = campaignBonus(r.campaignBonus);
      d.apply(r, purchaseReason(r.bonus, campaign));
      await forget(token);
      // The server consumes it too; this is the second try (an error here only means it is already consumed).
      if (purchase) await d.store.finish(purchase).catch(() => {});
      return { kind: 'done', coins: r.coins, bonus: r.bonus, replay: r.replay, ...(campaign ? { campaignBonus: campaign } : {}) };
    })().finally(() => inflight.delete(token));
    inflight.set(token, run);
    return run;
  }

  function settle(p: StorePurchase): Promise<Outcome> {
    if (!COIN_PRODUCT.test(p.productId)) return Promise.resolve({ kind: 'failed', message: STORE_FAILED.failed });
    if (p.state === 'pending') return Promise.resolve({ kind: 'pending' });
    if (p.state !== 'purchased' || !p.token) return Promise.resolve({ kind: 'failed', message: STORE_FAILED.failed });
    return confirm(p.productId, p.token, p);
  }

  /** The waiting screen gets the outcome; without one, a late outcome goes to onLate. */
  const deliver = (productId: string | null | undefined, o: Outcome) => {
    if (active && (!productId || active.productId === productId)) active.done(o);
    else d.onLate?.(o);
  };

  const onPurchase = (p: StorePurchase) => void settle(p).then((o) => deliver(p.productId, o));

  /** Play says this pack is already owned: an earlier purchase was never consumed. It is verified now. */
  async function recover(productId: string): Promise<Outcome> {
    const held = (await d.store.owned().catch(() => [] as StorePurchase[])).filter((p) => p.productId === productId);
    if (!held.length) return { kind: 'failed', message: 'Bu paket için tamamlanmamış bir ödeme var. Biraz sonra yeniden dene.' };
    const outs = await Promise.all(held.map(settle));
    return outs.find((o) => o.kind === 'done') ?? outs[0];
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

  /** Every unfinished purchase Play still holds, and every kept token, to the server again. */
  async function reconcile() {
    if (!ready) return;
    const held = (await d.store.owned().catch(() => [] as StorePurchase[])).filter((p) => COIN_PRODUCT.test(p.productId) && p.state === 'purchased' && p.token);
    const saved = await d.load().catch(() => [] as SavedToken[]);
    // A token already on its way (the purchase a screen waits for) is told by that run, not twice.
    const free = (token: string) => !inflight.has(token);
    const outs = await Promise.all([
      ...held.filter((p) => free(p.token)).map(settle),
      ...saved.filter((s) => free(s.token) && !held.some((p) => p.token === s.token)).map((s) => confirm(s.productId, s.token)),
    ]);
    for (const o of outs) if (o.kind === 'done' && !o.replay) d.onLate?.(o);
  }

  return {
    get ready() {
      return ready;
    },
    /** Connects to the store once, listens for purchases, and verifies what is left from before. */
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
    products: (ids: string[]) => (ready ? d.store.products(ids).catch(() => [] as StoreProduct[]) : Promise.resolve([] as StoreProduct[])),
    /** Opens the payment sheet for one pack and waits for its outcome. One purchase at a time. */
    async buy(productId: string): Promise<Outcome> {
      if (!ready) return { kind: 'unavailable' };
      if (active) return { kind: 'busy' };
      const slot: { productId: string; done: (o: Outcome) => void } = { productId, done: () => {} };
      active = slot;
      const account = await d.accountId().catch(() => null);
      if (!account) {
        active = null;
        return { kind: 'failed', message: 'Hesabına şu an ulaşılamıyor. İnternetini kontrol edip yeniden dene; ödeme alınmadı.' };
      }
      return new Promise<Outcome>((resolve) => {
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
