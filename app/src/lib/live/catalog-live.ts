// The live part of the server's catalog (GET /api/catalog, server/api/gifts.mjs, Canlı ayarlar): which gifts and
// packs are still listed, a running campaign and the Çevir rate. Read when the server's settings version (`v` in
// /api/config) changes and every few minutes while the app is open (lib/remote-control), and each time the
// wallet opens (lib/live/billing reads the catalog through here). Kept on the phone, so the next start without
// network still knows it.
//
// The compiled values stay the fallback: no saved copy, an older server, or anything malformed gives the whole
// compiled gift list, RULES and no campaign; the app never hides every gift. The server checks every gift,
// purchase and exchange again; this only keeps the screens honest before anyone taps. Prices are not live: names,
// art and prices stay in data/mock.
//
// Screens: useLiveCatalog() re-renders when it changes; visibleGifts(GIFTS, cat), liveRules(cat) and
// activeCampaign(Date.now(), cat) read it (without `cat`, the current copy outside React).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { RULES, type Rules } from '@/data/rules';
import { selfExchangeRate } from '@/lib/coins-bank';
import { parseCatalog, type CatalogPack } from '@/lib/live/billing-core';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const KEY = 'similarclub:catalog-live';
const TIMEOUT_MS = 10_000;
/** A copy older than this is read again on the next config poll, even when `v` didn't change (a campaign
 *  that started on its own time). */
const MAX_AGE_MS = 10 * 60_000;
/** The Çevir rate the app believes (TL per USD); the server's own bounds (live-registry exchange_usd_try). */
export const RATE_MIN = 40;
export const RATE_MAX = 75;
const GIFT_ID = /^[A-Za-z0-9_-]{1,32}$/;

export type LiveCampaign = { percent: number; startsAt: string; endsAt: string; label: string };
export type LiveCatalog = {
  /** The server's live settings version; 0 from an older server. */
  v: number;
  /** The gift ids the server lists; null when it didn't say (older server, empty or malformed list). */
  giftIds: string[] | null;
  /** The packs the server lists (as the wallet reads them, lib/live/billing-core parseCatalog). */
  packs: CatalogPack[];
  /** The campaign the server said was running; check the device clock with activeCampaign(). */
  campaign: LiveCampaign | null;
  /** The Çevir rate; null when missing or outside 40–75. */
  usdTry: number | null;
};

// --- Reading the server's answer, without trusting it ----------------------------------------------------
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const version = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : 0);
export const validRate = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= RATE_MIN && x <= RATE_MAX;

/** A list of gift ids; null when it is empty or any entry is malformed (then nothing is hidden). */
function idList(list: unknown, idOf: (x: unknown) => unknown): string[] | null {
  if (!Array.isArray(list) || !list.length) return null;
  const ids = list.map(idOf);
  if (!ids.every((id): id is string => typeof id === 'string' && GIFT_ID.test(id))) return null;
  return [...new Set(ids)];
}

function campaignOf(raw: unknown): LiveCampaign | null {
  const c = obj(raw);
  const start = typeof c.startsAt === 'string' ? Date.parse(c.startsAt) : NaN;
  const end = typeof c.endsAt === 'string' ? Date.parse(c.endsAt) : NaN;
  const percent = c.percent;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 1 || percent > 100) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const label = typeof c.label === 'string' ? c.label.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return { percent, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), label };
}

/** GET /api/catalog as the live catalog; anything malformed is left out (the compiled value is used), never thrown. */
export function parseLiveCatalog(raw: unknown): LiveCatalog {
  const r = obj(raw);
  const rate = obj(r.exchange).usdTry;
  return {
    v: version(r.v),
    giftIds: idList(r.gifts, (g) => obj(g).id),
    packs: parseCatalog(r).packs,
    campaign: campaignOf(r.campaign),
    usdTry: validRate(rate) ? rate : null,
  };
}

type Saved = LiveCatalog & { fetchedAt: number };
/** The copy kept on the phone ({v, giftIds, packs, campaign, usdTry, fetchedAt}); null when broken. */
export function parseSavedLiveCatalog(raw: string | null): { catalog: LiveCatalog; fetchedAt: number } | null {
  let x: unknown;
  try {
    x = raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  return {
    catalog: {
      v: version(r.v),
      giftIds: idList(r.giftIds, (g) => g),
      packs: parseCatalog({ packs: r.packs }).packs,
      campaign: campaignOf(r.campaign),
      usdTry: validRate(r.usdTry) ? r.usdTry : null,
    },
    fetchedAt: typeof r.fetchedAt === 'number' && Number.isFinite(r.fetchedAt) ? r.fetchedAt : 0,
  };
}

// --- What the screens use --------------------------------------------------------------------------------
let current: LiveCatalog | null = null;
let fetchedAt = 0;

/**
 * The gift shelf: the compiled gifts (names, art, prices) the server still lists, in the compiled order. Without
 * a server list, or when none of them would be left, the whole compiled list: the app never hides every gift.
 */
export function visibleGifts<G extends { id: string }>(compiled: G[], c: LiveCatalog | null = current): G[] {
  if (!c?.giftIds) return compiled;
  const listed = new Set(c.giftIds);
  const shown = compiled.filter((g) => listed.has(g.id));
  return shown.length ? shown : compiled;
}

let rulesMemo: { rate: number; rules: Rules } | null = null;
/** The rules with the server's Çevir rate (lib/coins-bank selfExchangeRate / exchangeOwnDiamonds); RULES when
 *  the server didn't say or said something outside 40–75. The same object until the rate changes. */
export function liveRules(c: LiveCatalog | null = current): Rules {
  const rate = c?.usdTry;
  if (!validRate(rate) || rate === RULES.usdTry) return RULES;
  if (rulesMemo?.rate !== rate) rulesMemo = { rate, rules: { ...RULES, usdTry: rate } };
  return rulesMemo.rules;
}

/** The running campaign, or null. One that has ended by this phone's clock is not shown any more. */
export function activeCampaign(now = Date.now(), c: LiveCatalog | null = current): LiveCampaign | null {
  const k = c?.campaign;
  return k && Date.parse(k.endsAt) > now ? k : null;
}

/** A campaign's extra coins on a pack: whole coins, rounded down (server live-registry campaignBonus). */
export const campaignCoins = (coins: number, percent: number) => (Number.isFinite(coins) && Number.isFinite(percent) && coins > 0 && percent > 0 ? Math.floor((coins * percent) / 100) : 0);

const fmt = (n: number) => n.toLocaleString('tr-TR');
/**
 * Çevir after the server's rate changed under the screen (409 rate_changed): nothing was taken; the person sees
 * the new amount and decides again. The server's own amount when it sent one, else the sum at its new rate.
 */
export function rateChangedMessage(diamonds: number, data: { usdTry?: unknown; coins?: unknown }): string {
  const sent = data.coins;
  const coins =
    typeof sent === 'number' && Number.isSafeInteger(sent) && sent >= 0 ? sent : validRate(data.usdTry) ? Math.floor(diamonds * selfExchangeRate({ ...RULES, usdTry: data.usdTry })) : null;
  if (coins === null || !Number.isSafeInteger(diamonds) || diamonds <= 0) return 'Çevirme kuru az önce değişti. Elmasların yerinde; yeni tutara bakıp yeniden dene.';
  return `Çevirme kuru az önce değişti: ${fmt(diamonds)} elmas artık ${fmt(coins)} jeton ediyor. Elmasların yerinde; uygunsa yeniden dene.`;
}

// --- Fetching and keeping it -----------------------------------------------------------------------------
const listeners = new Set<() => void>();
const same = (a: LiveCatalog | null, b: LiveCatalog) => !!a && JSON.stringify(a) === JSON.stringify(b);
const publish = (next: LiveCatalog) => {
  if (same(current, next)) return;
  current = next;
  listeners.forEach((l) => l());
};
// Storage failures never matter here: the next answer replaces the copy.
async function persist() {
  if (!current) return;
  const saved: Saved = { ...current, fetchedAt };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(saved));
  } catch {}
}

let restoring: Promise<void> | null = null;
/** The copy from the last run, once. */
export function restoreLiveCatalog(): Promise<void> {
  restoring ??= (async () => {
    try {
      const saved = parseSavedLiveCatalog(await AsyncStorage.getItem(KEY));
      // A fresh answer that came in meanwhile wins over the saved one.
      if (saved && !current) {
        fetchedAt = saved.fetchedAt;
        publish(saved.catalog);
      }
    } catch {}
  })();
  return restoring;
}

let loading: Promise<unknown> | null = null;
/**
 * Reads GET /api/catalog (calls at the same time share one request), keeps its live part and returns the whole
 * body (the wallet reads its packs from it). Rejects when the server can't be reached; the copy stays.
 */
export function fetchLiveCatalog(): Promise<unknown> {
  if (!BASE) return Promise.reject(new Error('Sunucu adresi ayarlı değil'));
  loading ??= (async () => {
    await restoreLiveCatalog();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}/api/catalog`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Sunucu hatası (${res.status})`);
      const body: unknown = await res.json();
      fetchedAt = Date.now();
      publish(parseLiveCatalog(body));
      void persist();
      return body;
    } finally {
      clearTimeout(t);
    }
  })().finally(() => (loading = null));
  return loading;
}

/** fetchLiveCatalog without the answer: offline or a server error keeps what we have. */
export const refreshLiveCatalog = (): Promise<void> =>
  fetchLiveCatalog().then(
    () => {},
    () => {},
  );

/** The version of the copy on the phone (null before anything is known): lib/remote-control compares it with /api/config. */
export const liveCatalogV = () => current?.v ?? null;
/** No copy yet, or one read more than 10 minutes ago. */
export const liveCatalogStale = (now = Date.now()) => !current || now - fetchedAt > MAX_AGE_MS;

/** The server named its current Çevir rate (409 rate_changed): the screens show it before the catalog is read again. */
export function noteLiveRate(usdTry: unknown) {
  if (!validRate(usdTry)) return;
  publish({ ...(current ?? { v: 0, giftIds: null, packs: [], campaign: null }), usdTry });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  void restoreLiveCatalog();
  return () => listeners.delete(l);
};
/** The live catalog outside React; null until anything is known. */
export const liveCatalog = () => current;
/** The live catalog for a screen: re-renders when it changes. Pass it to visibleGifts / liveRules / activeCampaign. */
export const useLiveCatalog = () => useSyncExternalStore(subscribe, liveCatalog, liveCatalog);
