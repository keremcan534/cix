// Oda Süslemesi (the picture behind a room's stage) and Oda Kapağı (the picture on the room's card): what the
// two builds share. A server room's decoration is the server's (server/api/room-decor.mjs, read and changed through
// lib/live/room-decor); my room in the demo keeps the same things in its own state (DemoDecor, saved with the room)
// and charges the demo's coins. Both give the screens (components/room/decor) one shape, api.RoomDecor, so the
// screens are the same. Pure: no React, no network (tests/room-decor.test.ts).
import { ROOM_BACKGROUNDS, ROOM_BG_CUSTOM, ROOM_BG_PAID, type RoomBackground } from '@/data/catalog';
import type { RoomDecor } from '@/lib/api';

const DAY = 86_400_000;

/**
 * My demo room's decoration. `bgId`: the free background (null: the theme's stage), which the room goes back to.
 * `pick`: what is chosen over it ('custom', a paid id, or null). `owned`: paid backgrounds, each until a time.
 * `custom`: the term I paid for (`until`), my picture on this phone (null once removed) and today's changes.
 */
export type DemoDecor = {
  bgId: string | null;
  pick: string | null;
  owned: Record<string, number>;
  custom: { uri: string | null; until: number; changes: number; day: string } | null;
};
export const DEMO_DECOR: DemoDecor = { bgId: null, pick: null, owned: {}, custom: null };
/** My demo room's card picture until I upload one (a sample picture, like the demo rooms'). */
export const DEMO_ROOM_COVER = 'https://picsum.photos/seed/myroom/600/400';
/** The demo card picture when it is one I uploaded (null: a sample picture, which "Kapağı kaldır" goes back to). */
export const uploadedDemoCover = (cover: string) => (!cover || cover.startsWith('https://picsum.photos/') ? null : cover);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A saved demo decoration made safe: ids the catalog no longer has, and anything of the wrong kind, are dropped. */
export function demoDecorOf(raw: unknown): DemoDecor {
  if (!isRecord(raw)) return DEMO_DECOR;
  const owned: Record<string, number> = {};
  if (isRecord(raw.owned)) for (const b of ROOM_BG_PAID) if (finite(raw.owned[b.id])) owned[b.id] = raw.owned[b.id] as number;
  const c = raw.custom;
  const custom =
    isRecord(c) && finite(c.until)
      ? { uri: typeof c.uri === 'string' && c.uri ? c.uri : null, until: c.until, changes: finite(c.changes) ? Math.max(0, Math.floor(c.changes)) : 0, day: typeof c.day === 'string' ? c.day : '' }
      : null;
  const bgId = ROOM_BACKGROUNDS.some((b) => b.id === raw.bgId) ? (raw.bgId as string) : null;
  const pick = raw.pick === 'custom' || ROOM_BG_PAID.some((b) => b.id === raw.pick) ? (raw.pick as string) : null;
  return { bgId, pick, owned, custom };
}

const iso = (t: number) => new Date(t).toISOString();
const dayOf = (now: number) => iso(now).slice(0, 10);

/**
 * What my demo room draws now, by the server's rule (server/api/room-decor.mjs backgroundOf): my own picture while
 * its term runs, a paid background while I own it, else the free one. A term that ended is simply not shown.
 */
export function demoBackground(d: DemoDecor, now: number): RoomBackground {
  if (d.pick === 'custom' && d.custom?.uri && d.custom.until > now) return { kind: 'custom', id: null, url: d.custom.uri, until: iso(d.custom.until) };
  if (d.pick && d.pick !== 'custom' && (d.owned[d.pick] ?? 0) > now) return { kind: 'paid', id: d.pick, url: null, until: iso(d.owned[d.pick]) };
  return { kind: 'free', id: d.bgId, url: null, until: null };
}

/**
 * My demo room's decoration as the settings screens read it: the shape the server sends for a server room.
 * `uploadedCover`: the room's card picture when it is one I uploaded (null: the demo's own picture).
 */
export function demoDecorView(d: DemoDecor, o: { level: number; uploadedCover: string | null; now: number }): RoomDecor {
  const term = !!d.custom && d.custom.until > o.now;
  const today = term && d.custom!.day === dayOf(o.now) ? d.custom!.changes : 0;
  return {
    level: o.level,
    canEdit: true,
    owner: true,
    bgId: d.bgId,
    pick: d.pick,
    showing: demoBackground(d, o.now),
    free: ROOM_BACKGROUNDS.map((b) => ({ id: b.id, minLevel: b.minLevel, open: o.level >= b.minLevel })),
    paid: {
      on: true,
      items: ROOM_BG_PAID.map((b) => ({ sku: b.id, name: b.name, price: b.price, days: b.days, onSale: true, until: (d.owned[b.id] ?? 0) > o.now ? iso(d.owned[b.id]) : null })),
    },
    custom: {
      on: true,
      price: ROOM_BG_CUSTOM.price,
      days: ROOM_BG_CUSTOM.days,
      until: term ? iso(d.custom!.until) : null,
      url: term ? d.custom!.uri : null,
      changesLeft: Math.max(0, ROOM_BG_CUSTOM.changesPerDay - today),
      removed: false,
    },
    cover: { url: o.uploadedCover },
  };
}

/** A demo change: the decoration after it and the coins it costs, or why it can't be done. */
export type DemoChange = { ok: true; decor: DemoDecor; price: number } | { ok: false; error: string };
const done = (decor: DemoDecor, price = 0): DemoChange => ({ ok: true, decor, price });
const no = (error: string): DemoChange => ({ ok: false, error });

/** A free background (null: the theme's stage), within the room's level. */
export function demoPickFree(d: DemoDecor, bgId: string | null, level: number): DemoChange {
  const b = bgId === null ? null : ROOM_BACKGROUNDS.find((x) => x.id === bgId);
  if (b === undefined) return no('Geçersiz süsleme');
  if (b && level < b.minLevel) return no(`Bu süsleme Lv.${b.minLevel} odada açılır`);
  return done({ ...d, bgId: b ? b.id : null, pick: null });
}

/** One of what I have: my own picture inside its term, or a paid background I own now. */
export function demoPick(d: DemoDecor, pick: string, now: number): DemoChange {
  if (pick === 'custom') return d.custom?.uri && d.custom.until > now ? done({ ...d, pick }) : no('Özel süsleme yok ya da süresi doldu');
  if (!ROOM_BG_PAID.some((b) => b.id === pick)) return no('Geçersiz süsleme');
  return (d.owned[pick] ?? 0) > now ? done({ ...d, pick }) : no('Bu süsleme sende yok ya da süresi doldu');
}

/** Buys a paid background for its term and shows it; buying again adds to the term (as the server's shop items do). */
export function demoBuy(d: DemoDecor, sku: string, now: number): DemoChange {
  const b = ROOM_BG_PAID.find((x) => x.id === sku);
  if (!b) return no('Geçersiz süsleme');
  const from = Math.max(now, d.owned[sku] ?? 0);
  return done({ ...d, pick: sku, owned: { ...d.owned, [sku]: from + b.days * DAY } }, b.price);
}

/**
 * My own picture: outside a term a purchase (the term starts), inside one a free change, at most
 * ROOM_BG_CUSTOM.changesPerDay a day.
 */
export function demoSetCustom(d: DemoDecor, uri: string, now: number): DemoChange {
  const term = !!d.custom && d.custom.until > now;
  if (!term) return done({ ...d, pick: 'custom', custom: { uri, until: now + ROOM_BG_CUSTOM.days * DAY, changes: 0, day: dayOf(now) } }, ROOM_BG_CUSTOM.price);
  const c = d.custom!;
  const today = c.day === dayOf(now) ? c.changes : 0;
  if (today >= ROOM_BG_CUSTOM.changesPerDay) return no(`Görseli günde en fazla ${ROOM_BG_CUSTOM.changesPerDay} kez değiştirebilirsin`);
  return done({ ...d, pick: 'custom', custom: { ...c, uri, changes: today + 1, day: dayOf(now) } });
}

/** My picture taken off: the room is back on its free background; the term runs on. */
export function demoRemoveCustom(d: DemoDecor): DemoChange {
  return done({ ...d, pick: d.pick === 'custom' ? null : d.pick, custom: d.custom ? { ...d.custom, uri: null } : null });
}

// --- What the screens show ----------------------------------------------------------------------------------------
/** Whole days left until `until`, rounded up (at least 1 while it runs); 0 when it is over or there is none. */
export function daysLeft(until: string | null | undefined, now: number): number {
  const t = until ? Date.parse(until) : NaN;
  return Number.isFinite(t) && t > now ? Math.max(1, Math.ceil((t - now) / DAY)) : 0;
}

/** The name of what a room shows ("Tema görünümü", a background's name, "Özel görsel"). */
export function backgroundName(bg: RoomBackground | null | undefined): string {
  if (!bg || (bg.kind === 'free' && !bg.id)) return 'Tema görünümü';
  if (bg.kind === 'custom') return 'Özel görsel';
  return (bg.kind === 'paid' ? ROOM_BG_PAID.find((b) => b.id === bg.id)?.name : ROOM_BACKGROUNDS.find((b) => b.id === bg.id)?.name) ?? 'Süsleme';
}

/**
 * The part of a `width`×`height` picture that has the shape of `size`, taken from its middle: what is cut out
 * before the picture is brought to exactly `size` (the stage's 1080 × 1920, the card's 800 × 800). Null when the
 * picture's size isn't known.
 */
export function cropRect(width: number, height: number, size: { width: number; height: number }): { originX: number; originY: number; width: number; height: number } | null {
  if (!(width > 0 && height > 0)) return null;
  const want = size.width / size.height;
  const w = Math.min(width, Math.round(height * want));
  const h = Math.min(height, Math.round(w / want));
  return { originX: Math.floor((width - w) / 2), originY: Math.floor((height - h) / 2), width: w, height: h };
}
