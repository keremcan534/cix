// The live part of the server's catalog (GET /api/catalog, server/api/gifts.mjs, Canlı ayarlar): which gifts and
// packs are still listed, a running campaign, the Çevir rate and the gift and entry videos to download (lib/fx-videos). Read when the server's settings version (`v` in
// /api/config) changes and every few minutes while the app is open (lib/remote-control), and each time the
// wallet opens (lib/live/billing reads the catalog through here). Kept on the phone, so the next start without
// network still knows it.
//
// The compiled values stay the fallback: no saved copy, an older server, or anything malformed gives the whole
// compiled gift list, RULES and no campaign; the app never hides every gift. The server checks every gift,
// purchase and exchange again; this only keeps the screens honest before anyone taps. The compiled gifts' names,
// art and prices stay in data/mock.
//
// The admins' own gifts (Yönetim › Hediyeler, server/api/custom-gifts.mjs) come only from here: the catalog lists them
// with `custom: true`, their name, price, shelf, VIP level, emoji and icon address (`remote`), and their videos in
// `fx`. giftShelf() puts them first on their shelves, giftById() finds them, components/GiftArt draws their icon.
// An older app's copy of this file knows only the compiled gifts and skips them.
//
// The app's own gifts can be changed there too (name, emoji, price, shelf, VIP level, order, on the shelves or not,
// icon). This app asks for the whole story (GET /api/catalog?gifts=2): the server then answers giftsFormat 2, lists
// every gift on the shelves in the shelves' order with what it is now (`shelf`, `app`), and its list alone says what is
// on the shelves (the compiled pause list, data/gifts-paused, no longer applies: an admin may put a gift back). The
// compiled gifts' art stays the fallback; a replaced icon is drawn from its address. Sends carry the price shown
// (lib/live liveGift), so a price that moved meanwhile is refused (409 price_changed) and the catalog is read again.
//
// The emoji panel's packs and stickers (Yönetim › Emojiler, server/api/emoji.mjs) come with it too (emoji=1, `emoji`,
// lib/emoji-live-core); lib/live/emoji-live hands them to the screens.
//
// Seviye ve VIP ayarları (the finance panel's Seviyeler, server/api/levels.mjs) too (levels=1, `levels`,
// lib/levels-live-core): VIP, Rütbe, Cömertlik, Yankı and Abonelik as set there; lib/live/levels-live hands them out.
//
// Screens: useLiveCatalog() re-renders when it changes; giftShelf(cat) (or visibleGifts(list, cat) for a fixed list),
// liveRules(cat) and activeCampaign(Date.now(), cat) read it (without `cat`, the current copy outside React).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { BOND_KINDS, BOND_LEVELS, type BondKind, type BondKindInfo } from '@/data/bonds';
import { GIFTS_PAUSED } from '@/data/gifts-paused';
import { GIFTS, isBondGift, type Gift, type GiftCat } from '@/data/mock';
import { RULES, type Rules } from '@/data/rules';
import { bondLookAt, parseBondLooks, type BondLook, type BondLooks } from '@/lib/bond-looks';
import { selfExchangeRate } from '@/lib/coins-bank';
import { parseLiveEmoji, type LiveEmoji } from '@/lib/emoji-live-core';
import { parseLiveLevels, type LiveLevels } from '@/lib/levels-live-core';
import { mergeShop, parseLiveShop, type LiveShop } from '@/lib/shop-live-core';
import { BOSS_SEAT_MIN_LEVEL, COSMETICS, MIC_PERMISSION_MIN_LEVEL, memberLimit, setLiveCosmetics } from '@/data/catalog';
import { setLiveSeatColors } from '@/data/seat-colors';
import { APP_MARKS, parseMarkRules, type GiftMark, type MarkKind, type MarkRules } from '@/lib/profile-marks';
import { setServerNow } from '@/lib/sanction-time';
import { parseFxList, type FxVideo } from '@/lib/fx-videos-core';
import { parseGlobalIds } from '@/lib/global-gift-core';
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
/** An admin's gift (server/api/custom-gifts.mjs): drawn from its icon address, sent at the price the server says. */
export type RemoteGift = Gift & { icon: string; custom: true };
/** One of the app's own gifts as the server says it is now (gifts=2); `icon` only when it was replaced. */
export type AppGiftEdit = { name: string; emoji: string; price: number; cat: GiftCat; minSvip: number; icon?: string };
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
  /** The videos the server hands out (server/api/fx.mjs); null when it didn't say (an older server). */
  fx: FxVideo[] | null;
  /** The admins' gifts the server lists, in its order; [] from an older server. */
  remote: RemoteGift[];
  /** Every gift on the shelves, in the shelves' order (gifts=2); null from an older server, which says less. */
  shelf: string[] | null;
  /** The app's own gifts on the shelves as they are now (gifts=2): id → its values; {} from an older server. */
  app: Record<string, AppGiftEdit>;
  /** The emoji panel's packs as they are now (emoji=1); null from an older server: the app's own packs. */
  emoji: LiveEmoji | null;
  /** Seviye ve VIP ayarları (levels=1); null from an older server: the app's own tables. */
  levels: LiveLevels | null;
  /** The shop's frames and entry effects (shop=1, Yönetim › Mağaza); null from an older server: the compiled shop. */
  shop: LiveShop | null;
  /** Koruma's numbers as Canlı ayarlar has them; null from an older server: the app's own. */
  guard: GuardNumbers | null;
  /** Bağlar's limits and days as Canlı ayarlar has them; null from an older server: the app's own. */
  bonds: BondNumbers | null;
  /** Aile's themes: id → the family level it opens at, as Canlı ayarlar has them; null from an older server. */
  familyThemes: Record<string, number> | null;
  /** Oda seviyeleri as Canlı ayarlar has them; null from an older server: the app's own. */
  rooms: RoomNumbers | null;
  /** Profil izleri (marks=1, marks=2): on or off, the hours, which gift leaves or cleans a mark, the kinds (their
   *  names, overlay pictures, minutes); null from an older server. */
  marks: MarkRules | null;
  /** Bağ işaretleri as staff designed them level by level (bondlooks=1); absent from an older server or with none: the app's own marks. */
  bondLooks?: BondLooks;
  /** The gifts the server marks global (Global hediye, lib/global-gift-core); absent when none. */
  global?: string[];
};
/** The rooms' numbers (server/api/live-registry.mjs roomNumbersOf): mic and boss seat levels, people per level. */
export type RoomNumbers = { micMinLevel: number; bossMinLevel: number; caps: number[] };
/** Koruma's numbers (server/api/guards.mjs guardRules) that the rules page says. */
export type GuardNumbers = { dropFrom: number; dropShare: number; dropFlat: number; thresholdEveryDays: number };
/**
 * Bağlar's numbers (server/api/bonds.mjs bondCatalog): days to answer, days apart, talk points, per-kind limits; from a
 * server with Güncelleme 7 also the level steps (20) and the nightly drop and quiet end (each only when sound).
 */
export type BondNumbers = {
  answerDays: number;
  cooldownDays: number;
  talkDaily: number;
  max: Partial<Record<BondKind, number>>;
  levels?: number[];
  dropPct?: number;
  dropFlat?: number;
  idleEndDays?: number;
  idleWarnDays?: number;
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

const CATS: readonly GiftCat[] = ['hot', 'couple', 'family', 'gameplay', 'privilege'];
const COMPILED_IDS = new Set(GIFTS.map((g) => g.id));
/** Nothing the server lists is near these; anything past them is a mistake, not a gift to show. */
const REMOTE_MAX = 200;
const PRICE_MAX = 10_000_000;
const ICON_URL = /^https?:\/\/[^\s"'<>\\]{1,600}$/;

/**
 * The admins' gifts in the server's list (entries with custom: true), in its order. An entry that is malformed, has a
 * compiled gift's id (the compiled one wins) or comes twice is left out; never thrown.
 */
export function parseRemoteGifts(list: unknown): RemoteGift[] {
  if (!Array.isArray(list)) return [];
  const out: RemoteGift[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const g = obj(x);
    if (g.custom !== true || typeof g.id !== 'string' || !GIFT_ID.test(g.id) || COMPILED_IDS.has(g.id) || seen.has(g.id)) continue;
    const name = typeof g.name === 'string' ? g.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    const price = g.price;
    const cat = CATS.find((c) => c === g.cat);
    if (!name || !cat || typeof price !== 'number' || !Number.isSafeInteger(price) || price < 1 || price > PRICE_MAX) continue;
    if (typeof g.icon !== 'string' || !ICON_URL.test(g.icon)) continue;
    const svip = typeof g.minSvip === 'number' && Number.isInteger(g.minSvip) && g.minSvip > 0 && g.minSvip <= 15 ? g.minSvip : 0;
    const emoji = typeof g.emoji === 'string' && g.emoji.trim() && g.emoji.length <= 16 ? g.emoji.trim() : '🎁';
    seen.add(g.id);
    out.push({ id: g.id, name, emoji, price, cat, ...(svip ? { minSvip: svip } : {}), icon: g.icon, custom: true });
    if (out.length >= REMOTE_MAX) break;
  }
  return out;
}

const COMPILED = new Map(GIFTS.map((g) => [g.id, g]));
/**
 * The app's own gifts in the server's list (gifts=2), each as it is now. An entry with anything malformed keeps the
 * compiled value of that field; an icon only with a well-formed address. Never thrown.
 */
export function parseAppGifts(list: unknown): Record<string, AppGiftEdit> {
  const out: Record<string, AppGiftEdit> = {};
  if (!Array.isArray(list)) return out;
  for (const x of list) {
    const g = obj(x);
    const base = typeof g.id === 'string' ? COMPILED.get(g.id) : undefined;
    if (!base || g.custom === true || Object.hasOwn(out, base.id)) continue;
    const name = typeof g.name === 'string' ? g.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    const price = typeof g.price === 'number' && Number.isSafeInteger(g.price) && g.price >= 1 && g.price <= PRICE_MAX ? g.price : base.price;
    const cat = CATS.find((c) => c === g.cat) ?? base.cat ?? 'hot';
    const svip = typeof g.minSvip === 'number' && Number.isInteger(g.minSvip) && g.minSvip >= 0 && g.minSvip <= 15 ? g.minSvip : (base.minSvip ?? 0);
    const emoji = typeof g.emoji === 'string' && g.emoji.trim() && g.emoji.length <= 16 ? g.emoji.trim() : base.emoji;
    out[base.id] = { name: name || base.name, emoji, price, cat, minSvip: cat === 'privilege' ? Math.max(1, svip) : 0, ...(typeof g.icon === 'string' && ICON_URL.test(g.icon) ? { icon: g.icon } : {}) };
  }
  return out;
}
/** The ids of the server's list in its order (gifts=2): the app's own and the admins' it can draw. */
function shelfOf(list: unknown, app: Record<string, AppGiftEdit>, remote: RemoteGift[]): string[] {
  if (!Array.isArray(list)) return [];
  const known = new Set([...Object.keys(app), ...remote.map((g) => g.id)]);
  const ids = list.map((x) => obj(x).id).filter((id): id is string => typeof id === 'string' && known.has(id));
  return [...new Set(ids)];
}

const whole = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);
/** The catalog's `guard`; null unless every number is sound. */
export function parseGuardNumbers(x: unknown): GuardNumbers | null {
  const g = obj(x);
  const dropFrom = whole(g.dropFrom, 0, 1e9);
  const dropFlat = whole(g.dropFlat, 0, 1e9);
  const days = whole(g.thresholdEveryDays, 1, 365);
  const share = typeof g.dropShare === 'number' && Number.isFinite(g.dropShare) && g.dropShare >= 0 && g.dropShare <= 1 ? g.dropShare : null;
  return dropFrom === null || dropFlat === null || days === null || share === null ? null : { dropFrom, dropShare: share, dropFlat, thresholdEveryDays: days };
}
/** The catalog's `bonds`; null unless the days are sound (a bad per-kind limit is left out: the app's own). */
export function parseBondNumbers(x: unknown): BondNumbers | null {
  const b = obj(x);
  const answerDays = whole(b.answerDays, 1, 365);
  const cooldownDays = whole(b.cooldownDays, 0, 365);
  const talkDaily = whole(b.talkDaily, 0, 1000);
  if (answerDays === null || cooldownDays === null || talkDaily === null) return null;
  const max: Partial<Record<BondKind, number>> = {};
  for (const [k, v] of Object.entries(obj(b.max))) {
    const n = whole(v, 1, 1000);
    if (n !== null && Object.hasOwn(BOND_KINDS, k)) max[k as BondKind] = n;
  }
  // Güncelleme 7's numbers: each one only when sound (an older server sends none; the app says its own).
  const levels = Array.isArray(b.levels) && b.levels.length === BOND_LEVELS.length && b.levels.every((n, i, l) => whole(n, 0, 1e9) !== null && (i === 0 ? n === 0 : (n as number) > (l[i - 1] as number))) ? (b.levels as number[]) : null;
  const extra = { dropPct: whole(b.dropPct, 0, 100), dropFlat: whole(b.dropFlat, 0, 1e9), idleEndDays: whole(b.idleEndDays, 0, 3650), idleWarnDays: whole(b.idleWarnDays, 0, 365) };
  return { answerDays, cooldownDays, talkDaily, max, ...(levels ? { levels } : {}), ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null)) };
}

/** The catalog's `family.themes`; the sound entries only, null when none. */
export function parseFamilyThemes(x: unknown): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(obj(obj(x).themes))) {
    const n = whole(v, 1, 100);
    if (n !== null && /^[a-z0-9_-]{1,32}$/.test(id)) out[id] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** The catalog's `rooms`; null unless the levels are sound and there are 15 caps. */
export function parseRoomNumbers(x: unknown): RoomNumbers | null {
  const r = obj(x);
  const mic = whole(r.micMinLevel, 1, 15);
  const boss = whole(r.bossMinLevel, 1, 15);
  const caps = Array.isArray(r.caps) && r.caps.length === 15 ? r.caps.map((n) => whole(n, 1, 100_000)) : null;
  return mic === null || boss === null || !caps || caps.some((n) => n === null) ? null : { micMinLevel: mic, bossMinLevel: boss, caps: caps as number[] };
}
/** The room level Mikrofon izni opens at: the server's, else the app's own. */
export const liveMicMinLevel = (c: LiveCatalog | null = current) => c?.rooms?.micMinLevel ?? MIC_PERMISSION_MIN_LEVEL;
/** The room level Patron koltuğu opens at: the server's, else the app's own. */
export const liveBossMinLevel = (c: LiveCatalog | null = current) => c?.rooms?.bossMinLevel ?? BOSS_SEAT_MIN_LEVEL;
/** How many people a room of `level` holds: the server's, else the app's own. */
export const liveMemberLimit = (level: number, c: LiveCatalog | null = current) => c?.rooms?.caps[Math.min(Math.max(level, 1), 15) - 1] ?? memberLimit(level);

/** GET /api/catalog as the live catalog; anything malformed is left out (the compiled value is used), never thrown. */
export function parseLiveCatalog(raw: unknown): LiveCatalog {
  const r = obj(raw);
  const rate = obj(r.exchange).usdTry;
  const remote = parseRemoteGifts(r.gifts);
  // The server said it all (gifts=2): what is on the shelves, in which order, and what the app's own gifts are now.
  const app = r.giftsFormat === 2 ? parseAppGifts(r.gifts) : {};
  return {
    v: version(r.v),
    giftIds: idList(r.gifts, (g) => obj(g).id),
    packs: parseCatalog(r).packs,
    campaign: campaignOf(r.campaign),
    usdTry: validRate(rate) ? rate : null,
    fx: parseFxList(r.fx),
    remote,
    shelf: r.giftsFormat === 2 ? shelfOf(r.gifts, app, remote) : null,
    app,
    emoji: parseLiveEmoji(r.emoji),
    levels: parseLiveLevels(r.levels),
    shop: parseLiveShop(r.shop),
    guard: parseGuardNumbers(r.guard),
    bonds: parseBondNumbers(r.bonds),
    familyThemes: parseFamilyThemes(r.family),
    rooms: parseRoomNumbers(r.rooms),
    marks: parseMarkRules(r.marks, r.gifts),
    ...looksOf(r.bondLooks),
    ...globalOf(parseGlobalIds(r.gifts)),
  };
}
const globalOf = (ids: string[]) => (ids.length ? { global: ids } : {});
const looksOf = (raw: unknown) => {
  const looks = parseBondLooks(raw);
  return looks ? { bondLooks: looks } : {};
};

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
  const remote = parseRemoteGifts(r.remote);
  // Kept as the catalog had them: the edits as entries of the list they came in, the order as ids.
  const app = parseAppGifts(Object.entries(obj(r.app)).map(([id, e]) => ({ ...obj(e), id })));
  const shelf = Array.isArray(r.shelf) ? shelfOf(r.shelf.map((id) => ({ id })), app, remote) : null;
  return {
    catalog: {
      v: version(r.v),
      giftIds: idList(r.giftIds, (g) => g),
      packs: parseCatalog({ packs: r.packs }).packs,
      campaign: campaignOf(r.campaign),
      usdTry: validRate(r.usdTry) ? r.usdTry : null,
      fx: parseFxList(r.fx),
      remote,
      shelf,
      app,
      emoji: parseLiveEmoji(r.emoji),
      levels: parseLiveLevels(r.levels),
      shop: parseLiveShop(r.shop),
      guard: parseGuardNumbers(r.guard),
      bonds: parseBondNumbers(r.bonds),
      familyThemes: parseFamilyThemes({ themes: r.familyThemes }),
      rooms: parseRoomNumbers(r.rooms),
      marks: parseMarkRules(r.marks),
      ...looksOf(r.bondLooks),
      ...globalOf(parseGlobalIds(Array.isArray(r.global) ? r.global.map((id) => ({ id, global: true })) : null)),
    },
    // A copy an older app saved counts as old: the next poll reads the catalog again. One from before the videos were
    // listed (no fx), or from before the shelves were (no shelf): that app hid the gifts put back on the shelves
    // (data/gifts-paused), and an updated phone would go on hiding them until the copy was ten minutes old.
    // One from before the level settings (no levels) too: the levels would stay the compiled ones until it was old.
    // And one whose shop came before the seat colors did (no seats): a room's color the panel added would be silver.
    // And one from before Profil izleri (no marks): Kaka and Su would stay off its shelf until it was old.
    // And one from before the mark kinds (marks without kinds): an uploaded overlay would wait until it was old.
    fetchedAt:
      'fx' in r && 'shelf' in r && 'levels' in r && 'shop' in r && (r.shop === null || 'seats' in obj(r.shop)) && 'marks' in r && (r.marks === null || 'kinds' in obj(r.marks)) && typeof r.fetchedAt === 'number' && Number.isFinite(r.fetchedAt)
        ? r.fetchedAt
        : 0,
  };
}

// --- What the screens use --------------------------------------------------------------------------------
let current: LiveCatalog | null = null;
let fetchedAt = 0;

/** A compiled gift as the server says it is now (gifts=2), else as compiled; the art and badges stay the app's. */
function liveGiftOf<G extends Gift>(g: G, c: LiveCatalog | null): G {
  const e = c?.app[g.id];
  if (!e) return g;
  return { ...g, name: e.name, emoji: e.emoji, price: e.price, cat: e.cat, minSvip: e.minSvip || undefined };
}
/** Whether the server's list alone says what is on the shelves (gifts=2, and it listed anything). */
const trusted = (c: LiveCatalog | null): c is LiveCatalog & { shelf: string[] } => !!c?.shelf?.length;

type Views = { c: LiveCatalog | null; shelf: Gift[]; plain: Gift[]; byId: Map<string, Gift> };
let views: Views | null = null;
/** The gifts as they are now, worked out once per copy of the catalog (the same objects until it changes). */
function viewsOf(c: LiveCatalog | null): Views {
  if (views?.c === c) return views;
  const byId = new Map<string, Gift>();
  for (const g of GIFTS) byId.set(g.id, liveGiftOf(g, c));
  for (const g of c?.remote ?? []) if (!byId.has(g.id)) byId.set(g.id, g);
  const listed = trusted(c) ? c.shelf.map((id) => byId.get(id)).filter((g): g is Gift => !!g) : [];
  const shelf = listed.length ? listed : [...(c?.remote ?? []), ...visibleGifts(GIFTS, c)];
  views = { c, shelf, plain: shelf.filter((g) => !isBondGift(g.id)), byId };
  return views;
}

/**
 * The gifts of `compiled` (a fixed list: CP gifts, a chat's gifts) that the server still lists, as they are now. From
 * a server that says it all (gifts=2) its list decides; otherwise the compiled order without the ones off the shelf for
 * now (data/gifts-paused; an older server still lists them). When none would be left, the whole compiled list: the app
 * never hides every gift.
 */
export function visibleGifts<G extends Gift>(compiled: G[], c: LiveCatalog | null = current): G[] {
  const listed = c?.giftIds ? new Set(c.giftIds) : null;
  const shown = trusted(c) ? compiled.filter((g) => c.shelf.includes(g.id)) : compiled.filter((g) => !GIFTS_PAUSED.has(g.id) && (!listed || listed.has(g.id)));
  return asNow(shown.length ? shown : compiled, c);
}
/** `list` as the gifts are now: the same array when the server changed none of the app's gifts. */
const asNow = <G extends Gift>(list: G[], c: LiveCatalog | null): G[] => (c && Object.keys(c.app).length ? list.map((g) => liveGiftOf(g, c)) : list);

/**
 * Çantam: what may be sent from the backpack, as the gifts are now. A gift off the shelf for now stays sendable there
 * (the server takes it, and the daily call task puts Kalp in the bag); only a gift the server stopped listing for
 * another reason (hidden in Canlı ayarlar, which it refuses) drops. From a server that says it all, its backpack list
 * (lib/live/backpack) already leaves those out.
 */
export function bagGifts<G extends Gift>(compiled: G[], c: LiveCatalog | null = current): G[] {
  const listed = c?.giftIds ? new Set(c.giftIds) : null;
  return asNow(
    compiled.filter((g) => trusted(c) || !listed || listed.has(g.id) || GIFTS_PAUSED.has(g.id)),
    c,
  );
}

/**
 * Every gift that may be sent now, in the shelves' order. From a server that says it all: its list (the admins' and
 * the app's own as they are now). Otherwise the admins' gifts the server lists (first, in its order: they lead their
 * shelves), then the compiled ones visibleGifts leaves. The same array until the catalog changes. Bond gifts are left
 * out: only the room's gift panel can send one, as a bond request (roomGiftShelf).
 */
export function giftShelf(c: LiveCatalog | null = current): Gift[] {
  return viewsOf(c).plain;
}
/** The room's gift panel: giftShelf and the bond gifts of its Aile ve Dost shelf. */
export function roomGiftShelf(c: LiveCatalog | null = current): Gift[] {
  return viewsOf(c).shelf;
}

/**
 * A gift by id, to draw a gift that arrives (a room's announcement, a combo, a history line): one of the app's as it
 * is now, or an admin's this phone's catalog lists. Undefined for one it doesn't know (an admin's gift newer than the
 * copy here: read the catalog again, refreshLiveCatalog).
 */
export function giftById(id: string | null | undefined, c: LiveCatalog | null = current): Gift | undefined {
  if (!id) return undefined;
  return viewsOf(c).byId.get(id);
}

/**
 * A bond kind with its bond gift's name and price as the catalog says now (bag-<kind>: Yönetim › Hediyeler can change
 * them, server/api/bonds.mjs charges that price). The app's own (data/bonds) without a catalog or for a bad price.
 */
export function bondKindOf(kind: BondKind, c: LiveCatalog | null = current): BondKindInfo {
  const k = BOND_KINDS[kind];
  const g = giftById(`bag-${kind}`, c);
  const max = c?.bonds?.max[kind] ?? k.max;
  return g && Number.isSafeInteger(g.price) && g.price > 0 ? { ...k, gift: g.name, price: g.price, max } : max === k.max ? k : { ...k, max };
}

/** Bağlar's level steps now: the catalog's (Canlı ayarlar) or the app's own. */
export const bondLevelsNow = (c: LiveCatalog | null = current): readonly number[] => c?.bonds?.levels ?? BOND_LEVELS;
/** Whether the server marks this gift global (Global hediye): the gift panel's Global shelf and the tile's badge. */
/** The design a `kind` bond at `level` shows (lib/bond-looks bondLookAt); null: the app's own mark. */
export const bondLookOf = (kind: BondKind, level: number, c: LiveCatalog | null = current): BondLook | null => bondLookAt(c?.bondLooks, kind, level);

export const isGlobalGift = (id: string, c: LiveCatalog | null = current) => !!c?.global?.includes(id);

/** Every gift this phone can draw, the app's own as they are now and the admins' listed (the profile's gift wall). */
export const everyGift = (c: LiveCatalog | null = current): Gift[] => [...viewsOf(c).byId.values()];

/**
 * What a gift does to its receiver's profile photo (Profil izleri, lib/profile-marks): the server's rule (marks=1,
 * marks=2), none while the feature is off or from an older server (it leaves no mark); the demo (no catalog) has the
 * app's own two.
 */
export const giftMarkOf = (id: string, c: LiveCatalog | null = current): GiftMark | null => (c ? (c.marks?.on ? (c.marks.gifts[id] ?? null) : null) : (APP_MARKS[id] ?? null));
/** The mark kinds as the server has them now (marks=2: name, overlay picture, minutes); {} from a server before them and in the demo. */
export const markKinds = (c: LiveCatalog | null = current): Record<string, MarkKind> => c?.marks?.kinds ?? {};

/** A gift's icon address when the server gave one (an admin's gift, or one of the app's whose icon was replaced). */
export const remoteIconOf = (id: string, c: LiveCatalog | null = current): string | undefined => c?.app[id]?.icon ?? c?.remote.find((g) => g.id === id)?.icon;

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
  // The shop's frames and entry effects for every screen that looks one up (data/catalog cosmeticById), and the rooms'
  // seat colors (data/seat-colors).
  setLiveCosmetics(next.shop ? mergeShop(COSMETICS, next.shop) : null);
  setLiveSeatColors(next.shop?.seats ?? null);
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
      // gifts=2: the whole story about the app's own gifts too; emoji=1: the emoji panel's packs; levels=1: Seviye ve
      // VIP ayarları (server/api/gifts.mjs).
      // shop=1: the shop's frames and entry effects (Yönetim › Mağaza).
      // family=1: this app has the Aile ve Dost shelf. lucky=1: it plays the Şanslı packages' videos (lucky-art.mjs).
      // marks=1&marks=2: Profil izleri with the kinds and minutes (Muzip hediyeler); a server before kinds reads the
      // first and answers as for the G7 app (hours, no kinds: the app's own pictures and the gifts' badges).
      // bondlooks=1: Bağ işaretleri as staff designed them (server/api/bond-looks.mjs).
      const res = await fetch(`${BASE}/api/catalog?gifts=2&family=1&emoji=1&levels=1&shop=1&lucky=1&marks=1&marks=2&bondlooks=1`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`Sunucu hatası (${res.status})`);
      const body: unknown = await res.json();
      fetchedAt = Date.now();
      // The server's clock (marks=2), which a mark runs out by (lib/mark-store).
      const now = obj(obj(body).marks).serverNow;
      if (typeof now === 'string') setServerNow(now);
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
  publish({ ...(current ?? { v: 0, giftIds: null, packs: [], campaign: null, fx: null, remote: [], shelf: null, app: {}, emoji: null, levels: null, shop: null, guard: null, bonds: null, familyThemes: null, rooms: null, marks: null }), usdTry });
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
