// Yönetim › Mağaza on the phone (server/api/shop-items.mjs, GET /api/catalog?shop=1 `shop`): the shop's frames, entry
// effects, chat bubbles and voice waves as the panel has them, read without trusting them. Pure (no React, no
// storage), so the tests run it.
//
// The app's own (data/catalog COSMETICS) keep their art and animation; the server says their name, price, days, VIP
// level, whether they are on the shelf and their order. The admins' own come only from here: a frame's picture (`art`:
// its address and the empty centre's radius as a share of its width); an entry effect's video (in the catalog's `fx`
// as entry <its id>) with its name plate (`plate`): where, how wide and how big the entering person's name is written
// over the clip, as shares of its 540 × 960 frame, how it looks and when it shows, and its icon in the shop (`icon`);
// a chat bubble's look (two colours, the text's colour, and a picture
// stretched with its corners kept: nineSlice); a voice wave's look (a style components/room/voice-wave draws, its
// colours, and for the sparkle style a picture for its sparks). Anything malformed is left out (a bubble's picture
// alone: its colours stay); no list at all (an older server, demo) is the compiled shop.
import type { Cosmetic, CosmeticKind } from '@/data/catalog';

/** How the name comes in and goes (server/api/shop-items.mjs PLATE_ANIMS): at once, fading, growing, rising. */
export const PLATE_ANIMS = ['none', 'fade', 'zoom', 'rise'] as const;
export type PlateAnim = (typeof PLATE_ANIMS)[number];
/** A colour round the letters and how far it reaches (a share of the letters' size). */
export type PlatePaint = { color: string; size: number };
/**
 * Where the entering person's name goes on an entry effect's clip (shares of its 540 × 960 frame) and how it looks:
 * written or not (`show`), capitals, the room between letters (a share of their size), a shadow or glow and an
 * outline round them, a rounded band behind the name, the seconds of the clip it shows between (`to` 0: until the
 * clip ends) and how it comes in and goes.
 */
export type Plate = {
  x: number;
  y: number;
  w: number;
  size: number;
  color: string;
  bold: boolean;
  show: boolean;
  upper: boolean;
  spacing: number;
  shadow: PlatePaint | null;
  outline: PlatePaint | null;
  back: { color: string; alpha: number } | null;
  from: number;
  to: number;
  anim: PlateAnim;
};
/** The soft dark shadow a plate has unless the panel set another or none (also a plate from an older server). */
export const PLATE_SHADOW: PlatePaint = { color: '#000000', size: 0.1 };
/** What a plate the server sent without its look and timing (an older server, an older plate) is read with. */
export const PLATE_LOOK = { show: true, upper: false, spacing: 0, shadow: PLATE_SHADOW, outline: null, back: null, from: 0, to: 0, anim: 'none' } as const satisfies Partial<Plate>;
/** A chat bubble's picture: its size and how far in (its px) from each edge the corners go, kept as they are. */
export type BubbleArt = { url: string; w: number; h: number; t: number; r: number; b: number; l: number };
/** An admin's chat bubble: two colours (left to right), the text's colour, and a picture if it has one. */
export type BubbleLook = { colors: readonly [string, string]; text: string; art?: BubbleArt };
export const WAVE_STYLES = ['ring', 'double', 'spin', 'ripple', 'sparkle'] as const;
export type WaveStyle = (typeof WAVE_STYLES)[number];
/** How many colours each wave style takes (server/api/shop-items.mjs WAVE_STYLES). */
const WAVE_COLORS: Record<WaveStyle, readonly [number, number]> = { ring: [1, 1], double: [2, 2], spin: [2, 4], ripple: [1, 1], sparkle: [2, 2] };
/** An admin's voice wave: a style the app draws, its colours, and for the sparkle style a picture for its sparks. */
export type WaveLook = { style: WaveStyle; colors: readonly string[]; art?: { url: string } };
/** The kinds the shop's list covers; the others stay the app's own. */
export const SHOP_LIST_KINDS = ['frame', 'entry', 'bubble', 'wave'] as const;
type ListKind = (typeof SHOP_LIST_KINDS)[number];
export type ShopItem = {
  sku: string;
  kind: ListKind;
  name: string;
  price: number;
  days: number | null;
  minVip: number;
  builtin: boolean;
  off: boolean;
  /**
   * An admin's frame: its still picture, the hole (its radius; `at`: its centre when it isn't the picture's middle, as
   * shares of the picture), and the animated WebP the app plays when it has one.
   */
  art?: { url: string; hole: number; at?: { x: number; y: number }; motion?: { url: string } };
  video?: boolean;
  plate?: Plate | null;
  /** An admin's entry effect's picture in the shop. */
  icon?: { url: string };
  /**
   * An admin's bubble's or wave's look, in the server's own shape: the phone keeps the list it read (lib/live/
   * catalog-live) and reads its copy again with parseLiveShop, so every field keeps its name and form.
   */
  look?: BubbleLook | WaveLook;
};
export type LiveShop = { items: ShopItem[] };

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const SKU = /^[a-z][a-z0-9-]{1,31}$/;
/** A stored file of this server (media.mjs), as the catalog gives an admin's frame picture. */
const ART_URL = /^https?:\/\/[^\s"'<>\\]{1,600}$/;
const share = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

const HEX = /^#[0-9A-Fa-f]{6}$/;
const hex = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : null);

/** A colour and an amount of it (`size` or `alpha`) the server sent; null when either is malformed. */
function paintOf<K extends 'size' | 'alpha'>(raw: unknown, amount: K, min: number, max: number) {
  const r = obj(raw);
  const color = hex(r.color);
  const n = share(r[amount], min, max);
  return color && n !== null ? ({ color, [amount]: n } as { color: string } & Record<K, number>) : null;
}

/**
 * A name plate the server sent; null when its place, size or colour is missing or malformed (the usual banner is shown
 * instead). Its look and timing are read field by field: one missing or malformed is the usual (PLATE_LOOK).
 */
export function parsePlate(raw: unknown): Plate | null {
  const r = obj(raw);
  const x = share(r.x, 0, 1);
  const y = share(r.y, 0, 1);
  const w = share(r.w, 0.1, 1);
  const size = share(r.size, 0.015, 0.08);
  const color = typeof r.color === 'string' && HEX.test(r.color) ? r.color : null;
  if (x === null || y === null || w === null || size === null || !color) return null;
  const from = share(r.from, 0, 20) ?? 0;
  const to = share(r.to, 0, 20) ?? 0;
  return {
    x,
    y,
    w,
    size,
    color,
    bold: r.bold !== false,
    show: r.show !== false,
    upper: r.upper === true,
    spacing: share(r.spacing, 0, 0.4) ?? 0,
    shadow: r.shadow === null ? null : (paintOf(r.shadow, 'size', 0.02, 0.6) ?? PLATE_SHADOW),
    outline: paintOf(r.outline, 'size', 0.02, 0.15),
    back: paintOf(r.back, 'alpha', 0.1, 1),
    from,
    to: to > from ? to : 0,
    anim: (PLATE_ANIMS as readonly unknown[]).includes(r.anim) ? (r.anim as PlateAnim) : 'none',
  };
}

/** The name in capitals the Turkish way (i → İ, ı → I), whatever the phone's language. */
export const trUpper = (s: string) => s.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
/** The name as the plate writes it. */
export const plateText = (plate: Plate, name: string) => (plate.upper ? trUpper(name) : name);
const whole = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : null);

/** A bubble's look the server sent; null when its colours are malformed. A malformed picture alone is dropped. */
export function parseBubbleLook(raw: unknown): BubbleLook | null {
  const r = obj(raw);
  const colors = Array.isArray(r.colors) && r.colors.length === 2 ? r.colors.map(hex) : null;
  const text = hex(r.text);
  if (!colors || !colors[0] || !colors[1] || !text) return null;
  const a = obj(r.art);
  const w = whole(a.w, 3, 4096);
  const h = whole(a.h, 3, 4096);
  let art: BubbleArt | undefined;
  if (typeof a.url === 'string' && ART_URL.test(a.url) && w && h) {
    const t = whole(a.t, 1, h);
    const rr = whole(a.r, 1, w);
    const b = whole(a.b, 1, h);
    const l = whole(a.l, 1, w);
    // Something must be left in the middle to stretch.
    if (t && rr && b && l && l + rr < w && t + b < h) art = { url: a.url, w, h, t, r: rr, b, l };
  }
  return { colors: [colors[0], colors[1]], text, ...(art ? { art } : {}) };
}

/** A wave's look the server sent; null when its style or colours are malformed. */
export function parseWaveLook(raw: unknown): WaveLook | null {
  const r = obj(raw);
  const style = (WAVE_STYLES as readonly unknown[]).includes(r.style) ? (r.style as WaveStyle) : null;
  if (!style) return null;
  const [lo, hi] = WAVE_COLORS[style];
  const colors = Array.isArray(r.colors) && r.colors.length >= lo && r.colors.length <= hi ? r.colors.map(hex) : null;
  if (!colors || colors.some((c) => !c)) return null;
  const a = obj(r.art);
  const art = style === 'sparkle' && typeof a.url === 'string' && ART_URL.test(a.url) ? { url: a.url } : undefined;
  return { style, colors: colors as string[], ...(art ? { art } : {}) };
}

/** GET /api/catalog `shop` (shop=1); null when there is none (an older server). Malformed items are left out. */
export function parseLiveShop(raw: unknown): LiveShop | null {
  const list = obj(raw).items;
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const items: ShopItem[] = [];
  for (const x of list.slice(0, 500)) {
    const r = obj(x);
    const kind = (SHOP_LIST_KINDS as readonly unknown[]).includes(r.kind) ? (r.kind as ListKind) : null;
    const name = typeof r.name === 'string' && r.name.trim() && r.name.length <= 24 ? r.name.trim() : null;
    const price = typeof r.price === 'number' && Number.isSafeInteger(r.price) && r.price >= 1 ? r.price : null;
    const days = r.days === null ? null : typeof r.days === 'number' && Number.isSafeInteger(r.days) && r.days >= 1 && r.days <= 365 ? r.days : undefined;
    const minVip = typeof r.minVip === 'number' && Number.isSafeInteger(r.minVip) && r.minVip >= 0 && r.minVip <= 15 ? r.minVip : null;
    if (typeof r.sku !== 'string' || !SKU.test(r.sku) || seen.has(r.sku) || !kind || !name || price === null || days === undefined || minVip === null) continue;
    const a = obj(r.art);
    const m = obj(a.motion);
    const motion = typeof m.url === 'string' && ART_URL.test(m.url) ? { motion: { url: m.url } } : {};
    const hole = share(a.hole, 0.1, 0.45);
    // The hole's centre, when the server says it isn't the middle; one that would put the photo past the picture's
    // edge is left out (the photo is centred, as an older app does).
    const c = obj(a.at);
    const cx = share(c.x, 0.3, 0.7);
    const cy = share(c.y, 0.3, 0.7);
    const at = hole !== null && cx !== null && cy !== null && [cx, cy].every((n) => n - hole >= -0.001 && n + hole <= 1.001) ? { at: { x: cx, y: cy } } : {};
    const art = kind === 'frame' && typeof a.url === 'string' && ART_URL.test(a.url) && hole !== null ? { url: a.url, hole, ...at, ...motion } : undefined;
    const builtin = r.builtin === true;
    const bubble = !builtin && kind === 'bubble' ? parseBubbleLook(r.look) : null;
    const wave = !builtin && kind === 'wave' ? parseWaveLook(r.look) : null;
    const i = obj(r.icon);
    const icon = !builtin && kind === 'entry' && typeof i.url === 'string' && ART_URL.test(i.url) ? { url: i.url } : undefined;
    // An admin's frame needs its picture, an admin's entry effect its video, an admin's bubble or wave its look:
    // without, there is nothing to draw.
    if (!builtin && kind === 'frame' && !art) continue;
    if (!builtin && kind === 'entry' && r.video !== true) continue;
    if (!builtin && kind === 'bubble' && !bubble) continue;
    if (!builtin && kind === 'wave' && !wave) continue;
    seen.add(r.sku);
    items.push({
      sku: r.sku,
      kind,
      name,
      price,
      days,
      minVip,
      builtin,
      off: r.off === true,
      ...(art ? { art } : {}),
      ...(kind === 'entry' && r.video === true ? { video: true, plate: parsePlate(r.plate), ...(icon ? { icon } : {}) } : {}),
      ...(bubble ? { look: bubble } : {}),
      ...(wave ? { look: wave } : {}),
    });
  }
  return { items };
}

const OWN_EMOJI: Record<ListKind, string> = { frame: '🖼️', entry: '✨', bubble: '💬', wave: '🔊' };
/**
 * The shop's frames, entry effects, bubbles and waves as the server has them, as the app's Cosmetics: the app's own
 * with the server's name, price, days, VIP level and shelf (their art stays), the admins' own with `remote` (their
 * picture, their clip and plate, or their look). `retired` is "not on the shelf". The other kinds stay the compiled
 * ones; an app's item the server no longer lists stays as compiled, after the listed ones.
 */
export function mergeShop(compiled: readonly Cosmetic[], shop: LiveShop | null): Cosmetic[] {
  if (!shop) return [...compiled];
  const byId = new Map(compiled.map((c) => [c.id, c]));
  const listed = new Set(shop.items.map((x) => x.sku));
  const out: Cosmetic[] = [];
  for (const kind of SHOP_LIST_KINDS) {
    for (const x of shop.items.filter((i) => i.kind === kind)) {
      const base = byId.get(x.sku);
      if (x.builtin && base?.kind === kind) {
        const { retired: _was, ...rest } = base;
        out.push({ ...rest, name: x.name, price: x.price, days: x.days, ...(x.minVip ? { minVip: x.minVip } : { minVip: undefined }), ...(x.off ? { retired: true as const } : {}) });
      } else if (!x.builtin && !byId.has(x.sku)) {
        out.push({
          id: x.sku,
          kind,
          name: x.name,
          emoji: OWN_EMOJI[kind],
          price: x.price,
          days: x.days,
          ...(x.minVip ? { minVip: x.minVip } : {}),
          ...(x.off ? { retired: true as const } : {}),
          remote: {
            ...(x.art ? { art: x.art } : {}),
            ...(x.video ? { video: true as const, plate: x.plate ?? null } : {}),
            ...(x.icon ? { icon: x.icon } : {}),
            ...(x.look && kind === 'bubble' ? { bubble: x.look as BubbleLook } : {}),
            ...(x.look && kind === 'wave' ? { wave: x.look as WaveLook } : {}),
          },
        });
      }
    }
    for (const c of compiled) if (c.kind === kind && !listed.has(c.id)) out.push(c);
  }
  for (const c of compiled) if (!(SHOP_LIST_KINDS as readonly CosmeticKind[]).includes(c.kind)) out.push(c);
  return out;
}

/**
 * A bubble's picture drawn round a message at `k` points per pixel of it (made at 3×: k = 1/3): its four corners as they
 * are, its edges stretched one way, its middle both, without measuring the message. Each of the nine pieces is a box
 * with its place in the bubble (fixed for the corners' sides, between them for the rest) and the whole picture inside
 * it, sized and moved by shares of the box so that just that piece shows, stretched to the box. `pad` keeps the
 * message inside the middle.
 */
export function nineSlice(a: BubbleArt, k: number) {
  const T = a.t * k;
  const R = a.r * k;
  const B = a.b * k;
  const L = a.l * k;
  const cols = [
    { from: 0, to: a.l, box: { left: 0, width: L } },
    { from: a.l, to: a.w - a.r, box: { left: L, right: R } },
    { from: a.w - a.r, to: a.w, box: { right: 0, width: R } },
  ];
  const rows = [
    { from: 0, to: a.t, box: { top: 0, height: T } },
    { from: a.t, to: a.h - a.b, box: { top: T, bottom: B } },
    { from: a.h - a.b, to: a.h, box: { bottom: 0, height: B } },
  ];
  const pct = (x: number) => `${Math.round(x * 1e6) / 1e4}%` as const;
  const pieces = rows.flatMap((row) =>
    cols.map((col) => {
      const sw = col.to - col.from;
      const sh = row.to - row.from;
      return {
        box: { position: 'absolute' as const, overflow: 'hidden' as const, ...col.box, ...row.box },
        image: { position: 'absolute' as const, width: pct(a.w / sw), height: pct(a.h / sh), left: pct(-col.from / sw), top: pct(-row.from / sh) },
      };
    }),
  );
  return { pad: { paddingTop: T, paddingRight: R, paddingBottom: B, paddingLeft: L }, min: { minWidth: L + R + 1, minHeight: T + B + 1 }, pieces };
}

/**
 * Where the name goes on screen over a clip drawn aspect-fit in a `W` × `H` view (components/fx/video-fx, the native
 * player): the plate's centre, its widest width and the letters' size, made smaller for a long name so it stays on one
 * line inside the plate (about 0.6 of the size per letter, more in capitals and with room between them: an estimate
 * the phone's own fit refines).
 */
export function plateLayout(plate: Plate, name: string, W: number, H: number) {
  const scale = Math.min(W / 540, H / 960);
  const vw = 540 * scale;
  const vh = 960 * scale;
  const left = (W - vw) / 2;
  const top = (H - vh) / 2;
  const width = plate.w * vw;
  const size = plate.size * vh;
  const letters = Math.max(1, [...name].length);
  const per = (plate.bold ? 0.62 : 0.56) + (plate.upper ? 0.1 : 0) + plate.spacing;
  const fontSize = Math.max(8, Math.min(size, width / (letters * per)));
  return { cx: left + plate.x * vw, cy: top + plate.y * vh, width, fontSize };
}
