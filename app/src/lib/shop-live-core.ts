// Yönetim › Mağaza on the phone (server/api/shop-items.mjs, GET /api/catalog?shop=1 `shop`): the shop's frames and entry
// effects as the panel has them, read without trusting them. Pure (no React, no storage), so the tests run it.
//
// The app's own frames and entry effects (data/catalog COSMETICS) keep their art and animation; the server says their
// name, price, days, VIP level, whether they are on the shelf and their order. The admins' own come only from here: a
// frame's picture (`art`: its address and the empty centre's radius as a share of its width) and an entry effect's
// video (in the catalog's `fx` as entry <its id>) with its name plate (`plate`): where, how wide and how big the
// entering person's name is written over the clip, as shares of its 540 × 960 frame. Anything malformed is left out;
// no list at all (an older server, demo) is the compiled shop.
import type { Cosmetic, CosmeticKind } from '@/data/catalog';

/** Where the entering person's name goes on an entry effect's clip (shares of its 540 × 960 frame). */
export type Plate = { x: number; y: number; w: number; size: number; color: string; bold: boolean };
export type ShopItem = {
  sku: string;
  kind: 'frame' | 'entry';
  name: string;
  price: number;
  days: number | null;
  minVip: number;
  builtin: boolean;
  off: boolean;
  art?: { url: string; hole: number };
  video?: boolean;
  plate?: Plate | null;
};
export type LiveShop = { items: ShopItem[] };

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const SKU = /^[a-z][a-z0-9-]{1,31}$/;
/** A stored file of this server (media.mjs), as the catalog gives an admin's frame picture. */
const ART_URL = /^https?:\/\/[^\s"'<>\\]{1,600}$/;
const share = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

/** A name plate the server sent; null when it is missing or malformed (the usual banner is shown instead). */
export function parsePlate(raw: unknown): Plate | null {
  const r = obj(raw);
  const x = share(r.x, 0, 1);
  const y = share(r.y, 0, 1);
  const w = share(r.w, 0.1, 1);
  const size = share(r.size, 0.015, 0.08);
  const color = typeof r.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r.color) ? r.color : null;
  if (x === null || y === null || w === null || size === null || !color) return null;
  return { x, y, w, size, color, bold: r.bold !== false };
}

/** GET /api/catalog `shop` (shop=1); null when there is none (an older server). Malformed items are left out. */
export function parseLiveShop(raw: unknown): LiveShop | null {
  const list = obj(raw).items;
  if (!Array.isArray(list)) return null;
  const seen = new Set<string>();
  const items: ShopItem[] = [];
  for (const x of list.slice(0, 500)) {
    const r = obj(x);
    const kind = r.kind === 'frame' || r.kind === 'entry' ? r.kind : null;
    const name = typeof r.name === 'string' && r.name.trim() && r.name.length <= 24 ? r.name.trim() : null;
    const price = typeof r.price === 'number' && Number.isSafeInteger(r.price) && r.price >= 1 ? r.price : null;
    const days = r.days === null ? null : typeof r.days === 'number' && Number.isSafeInteger(r.days) && r.days >= 1 && r.days <= 365 ? r.days : undefined;
    const minVip = typeof r.minVip === 'number' && Number.isSafeInteger(r.minVip) && r.minVip >= 0 && r.minVip <= 15 ? r.minVip : null;
    if (typeof r.sku !== 'string' || !SKU.test(r.sku) || seen.has(r.sku) || !kind || !name || price === null || days === undefined || minVip === null) continue;
    const a = obj(r.art);
    const art = kind === 'frame' && typeof a.url === 'string' && ART_URL.test(a.url) && share(a.hole, 0.1, 0.45) !== null ? { url: a.url, hole: a.hole as number } : undefined;
    const builtin = r.builtin === true;
    // An admin's frame needs its picture, an admin's entry effect its video: without, there is nothing to draw.
    if (!builtin && kind === 'frame' && !art) continue;
    if (!builtin && kind === 'entry' && r.video !== true) continue;
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
      ...(kind === 'entry' && r.video === true ? { video: true, plate: parsePlate(r.plate) } : {}),
    });
  }
  return { items };
}

/**
 * The shop's frames and entry effects as the server has them, as the app's Cosmetics: the app's own with the server's
 * name, price, days, VIP level and shelf (their art stays), the admins' own with `remote` (their picture, or their
 * clip and plate). `retired` is "not on the shelf". The other kinds stay the compiled ones; an app's item the server
 * no longer lists stays as compiled, after the listed ones.
 */
export function mergeShop(compiled: readonly Cosmetic[], shop: LiveShop | null): Cosmetic[] {
  if (!shop) return [...compiled];
  const byId = new Map(compiled.map((c) => [c.id, c]));
  const listed = new Set(shop.items.map((x) => x.sku));
  const out: Cosmetic[] = [];
  for (const kind of ['frame', 'entry'] as CosmeticKind[]) {
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
          emoji: kind === 'frame' ? '🖼️' : '✨',
          price: x.price,
          days: x.days,
          ...(x.minVip ? { minVip: x.minVip } : {}),
          ...(x.off ? { retired: true as const } : {}),
          remote: { ...(x.art ? { art: x.art } : {}), ...(x.video ? { video: true as const, plate: x.plate ?? null } : {}) },
        });
      }
    }
    for (const c of compiled) if (c.kind === kind && !listed.has(c.id)) out.push(c);
  }
  for (const c of compiled) if (c.kind !== 'frame' && c.kind !== 'entry') out.push(c);
  return out;
}

/**
 * Where the name goes on screen over a clip drawn aspect-fit in a `W` × `H` view (components/fx/video-fx, the native
 * player): the plate's centre, its widest width and the letters' size, made smaller for a long name so it stays on one
 * line inside the plate (about 0.6 of the size per letter: an estimate the phone's own fit refines).
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
  const fontSize = Math.max(8, Math.min(size, width / (letters * (plate.bold ? 0.62 : 0.56))));
  return { cx: left + plate.x * vw, cy: top + plate.y * vh, width, fontSize };
}
