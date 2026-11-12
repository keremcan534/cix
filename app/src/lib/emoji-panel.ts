// The emoji panel's tabs and its memory on this phone (components/EmojiPanel, in rooms and chats).
//
//  - Tabs, under two headings. Sabit, what everyone has: Emoji (the Duygular faces, then Müzik and, in a room, Hamle),
//    Favoriler and, in a room, the free Hareketli. VIP: in a room the paid Hareketli, then every sticker pack sold in
//    the shop or opened by VIP (bought ones open, the rest show a preview). Temel is retired (data/catalog).
//  - The tab it was last on: the panel opens there again (one a panel doesn't have, a chat's Hareketli say, opens Emoji).
//  - How often each item was picked: Favoriler shows the most used first (equal counts: the latest first).
//
// Kept on this phone for every room and chat, like the room chat's size (lib/room-chat-size); never sent anywhere.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STICKER_PACKS, type StickerPack } from '@/data/catalog';

const KEY = 'similarclub:emojiPanel:v1';
/** How many picked items are remembered (past that, the least used and then the oldest are forgotten). */
export const USE_KEEP = 40;
/** How many Favoriler shows. */
export const FAV_MAX = 24;

export type PanelKind = 'sabit' | 'vip';
export type PanelTab = { id: string; kind: PanelKind; pack?: StickerPack };

/** The packs drawn inside the Emoji tab, in this order (Hamle only in a room: its picks act on the mics). */
export const EMOJI_TAB_PACKS = ['duygu', 'muzik', 'hamle'] as const;
const inEmojiTab = (id: string) => (EMOJI_TAB_PACKS as readonly string[]).includes(id);
/** A pack that is bought in the shop or opened by VIP. */
export const isVipPack = (p: StickerPack) => p.price > 0 || !!p.minVip;

/** The packs of the Emoji tab this panel shows. */
export const emojiTabPacks = (room: boolean) => EMOJI_TAB_PACKS.map((id) => STICKER_PACKS.find((p) => p.id === id)).filter((p): p is StickerPack => !!p && (!p.roomOnly || room));

/** The panel's tabs, Sabit first. `room`: a room's panel (Hareketli and Hamle); a chat's has neither. */
export function panelTabs(room: boolean): PanelTab[] {
  const shown = STICKER_PACKS.filter((p) => !p.retired && (!p.roomOnly || room) && !inEmojiTab(p.id));
  return [
    { id: 'emoji', kind: 'sabit' },
    { id: 'fav', kind: 'sabit' },
    ...(room ? [{ id: 'animated-free', kind: 'sabit' as const }] : []),
    // A free pack added later gets a tab of its own here.
    ...shown.filter((p) => !isVipPack(p)).map((pack) => ({ id: pack.id, kind: 'sabit' as const, pack })),
    ...(room ? [{ id: 'animated', kind: 'vip' as const }] : []),
    ...shown.filter(isVipPack).map((pack) => ({ id: pack.id, kind: 'vip' as const, pack })),
  ];
}

/** The tab to open: the saved one when this panel has it, else the first (Emoji). */
export const openTab = (saved: string | null | undefined, tabs: readonly PanelTab[]) => tabs.find((t) => t.id === saved) ?? tabs[0];

// --- Favoriler ------------------------------------------------------------------------------------------
/** Picks by item: how many, and when the last one was (ms). A sticker is its token (lib/stickers), Hareketli animKey. */
export type Use = Record<string, { n: number; at: number }>;

/** A Hareketli item's key in the memory. */
export const animKey = (animationId: string) => `anim:${animationId}`;
/** The animation id of a Hareketli key; null for a sticker. */
export const animIdOf = (key: string) => (key.startsWith('anim:') ? key.slice(5) : null);

type Row = [string, { n: number; at: number }];
const byUse = ([, a]: Row, [, b]: Row) => b.n - a.n || b.at - a.at;

/** `use` without its least used entries past USE_KEEP; `keep` (the item just picked) always stays. */
function trim(use: Use, keep?: string): Use {
  const rows = Object.entries(use);
  if (rows.length <= USE_KEEP) return use;
  const kept: Row[] = keep && use[keep] ? [[keep, use[keep]]] : [];
  const others = rows.filter(([k]) => k !== keep).sort(byUse);
  return Object.fromEntries([...kept, ...others.slice(0, USE_KEEP - kept.length)]);
}

/** One more pick of `key` at `now`. A new item always gets in; the least used of the others goes when it is full. */
export function bumpUse(use: Use, key: string, now: number): Use {
  return trim({ ...use, [key]: { n: (use[key]?.n ?? 0) + 1, at: now } }, key);
}

/**
 * Favoriler: the most used first, equal counts the latest first; then `recents` (the store's recently used list, from
 * before the counts) not counted yet. Only what `ok` says this panel can still send (a pack whose VIP ended, a room's
 * Hamle in a chat, a retired sticker are left out).
 */
export function favourites(use: Use, recents: readonly string[], ok: (key: string) => boolean, max = FAV_MAX): string[] {
  const keys = (Object.entries(use) as Row[]).sort(byUse).map(([k]) => k);
  for (const r of recents) if (!keys.includes(r)) keys.push(r);
  return keys.filter(ok).slice(0, max);
}

// --- On the phone ---------------------------------------------------------------------------------------
type Saved = { tab: string | null; use: Use };
const okKey = (k: string) => k.length > 0 && k.length <= 64 && k !== '__proto__';
const okCount = (v: unknown): v is { n: number; at: number } => {
  if (!v || typeof v !== 'object') return false;
  const { n, at } = v as Record<string, unknown>;
  return Number.isSafeInteger(n) && (n as number) > 0 && typeof at === 'number' && Number.isFinite(at) && at >= 0;
};

/** What was saved, checked: anything that doesn't look right (an older or broken save) is dropped, not trusted. */
export function readSaved(raw: string | null): Saved {
  let m: Record<string, unknown> = {};
  try {
    const v: unknown = JSON.parse(raw ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) m = v as Record<string, unknown>;
  } catch {}
  const tab = typeof m.tab === 'string' && m.tab.length <= 40 ? m.tab : null;
  const use: Use = {};
  if (m.use && typeof m.use === 'object' && !Array.isArray(m.use)) {
    for (const [k, v] of Object.entries(m.use)) if (okKey(k) && okCount(v)) use[k] = { n: v.n, at: v.at };
  }
  return { tab, use: trim(use) };
}

/** Picks made before the saved memory was read (the first seconds after start) are added to it, not lost. */
function merge(saved: Saved, early: Saved): Saved {
  const use = { ...saved.use };
  for (const [k, v] of Object.entries(early.use)) use[k] = { n: (use[k]?.n ?? 0) + v.n, at: Math.max(use[k]?.at ?? 0, v.at) };
  return { tab: early.tab ?? saved.tab, use: trim(use) };
}

let memory: Saved = { tab: null, use: {} };
let loaded = false;
const save = () => {
  if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
};
/** Read once at start; the panel opens long after. */
export const ready = AsyncStorage.getItem(KEY)
  .then((raw) => {
    const early = memory;
    memory = merge(readSaved(raw), early);
    loaded = true;
    if (early.tab || Object.keys(early.use).length) save();
  })
  .catch(() => {
    loaded = true;
  });

/** The tab the panel was last on (null: never opened). */
export const lastTab = () => memory.tab;
export function setLastTab(tab: string) {
  if (memory.tab === tab) return;
  memory = { ...memory, tab };
  save();
}

/** The counts as they are now (the panel reads them when it opens, so Favoriler doesn't move under a finger). */
export const pickCounts = () => memory.use;
/** A pick from the panel: counted for Favoriler. */
export function notePick(key: string, now = Date.now()) {
  memory = { ...memory, use: bumpUse(memory.use, key, now) };
  save();
}
