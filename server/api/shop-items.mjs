// Yönetim › Mağaza: the shop's profile frames, entry effects, chat bubbles and voice waves, changed and added from the
// finance panel without an app update (docs/MAGAZA_YONETIMI.md).
//
// The app's own (catalog.mjs SHOP, kinds frame, entry, bubble and wave, their sku as id) change the way the app's gifts
// and emoji packs do: a row with their sku holds only what was changed (name, price, days, VIP level, on the shelf,
// order), every NULL column "as in the app", and is never deleted; their pictures, clips and looks stay the app's. The
// admins' own frames ('sf' and a number), entry effects ('se'), chat bubbles ('sb') and voice waves ('sw') are rows of
// their own (076, 077):
//   - a frame: its picture, a transparent PNG or WebP (media.mjs shopframe), square, its empty centre's radius as a
//     share of its width (`hole`) so the photo sits inside it, where that centre is when it isn't the picture's middle
//     (`hole_x`, `hole_y`, 079: a ring under a crown is higher), and a moving version if it has one (`motion_*`, 079):
//     an animated WebP of the same picture the new app plays (the still one stays for older apps);
//   - an entry effect: its video, a ready stacked MP4 or a transparent source (WebM, ProRes .mov, SVGA) the server
//     turns into one, as a gift's (custom-gifts.mjs videoOf and its job), its name plate (`plate`): where the
//     entering person's name is written over it, as shares of the 540 × 960 frame (x, y: the centre; w: the widest
//     the name may be, a long one is drawn smaller; size: the letters' height; colour; bold), how it looks and when
//     it shows (plateOf: written or not, capitals, letter spacing, shadow or glow, outline, a band behind it, the
//     seconds of the clip it shows between and how it comes in), and an icon (`icon_*`, 078): the picture the shop
//     shows for it;
//   - a chat bubble: its look (`look`): two colours (left to right) and the text's colour, and a picture if it has one
//     (art_*, a PNG or WebP drawn as a nine-slice: `look.slice` has its size and how far in from each edge its corners
//     go, kept as they are while the middle stretches round the message);
//   - a voice wave: its look: a style the app draws (WAVE_STYLES: a ring, two rings, turning colours, a ripple, sparks
//     turning on the ring) and its colours, and for the sparks a picture if it has one (art_*: a heart, a star).
// Every picture is uploaded as a shop picture (media.mjs shopframe) and checked here for its use.
//
//   GET  /api/admin/shop                                   → { items, limits, storage, convert, svga }
//   POST /api/admin/shop        { kind, name, price, days, minVip?, enabled?, art?, hole?, holeX?, holeY?, motion?, video?, plate?, look?, icon? } → { item }
//   POST /api/admin/shop/update { id, name?, price?, days?, minVip?, enabled?, art?, hole?, holeX?, holeY?, motion?, video?, plate?, look?, icon? } → { item }
//        (a bubble's or wave's art: null takes its picture away; an entry effect's icon and a frame's moving
//        version: null takes it away)
//        (an app's own item: name, price, days, minVip and enabled only)
//   POST /api/admin/shop/reset  { id, fields? }   an app's item back to the app's values → { item }
//        (fields: any of name, price, days, minVip, enabled, sort; none: all but its place)
//   POST /api/admin/shop/delete { id }            an admin's item nobody has now → { deleted }
//   POST /api/admin/shop/order  { kind, ids }     the shop's order of that kind, every item of it → { items }
// days: 0 sells it for good.
//
// What the phones get: GET /api/catalog?shop=1 → `shop: { items }` (shopCatalog): every frame, entry effect, chat bubble
// and voice wave as it is now, in order; one taken off the shelf has `off: true` (whoever has it still wears it and
// others still see it); an admin's frame its `art` ({ url, hole, at?: { x, y }, motion?: { url } }: where the hole's
// centre is when it isn't the middle, and the moving version the new app plays; an older one centres the photo and
// draws the still `url`), an admin's entry effect `video: true`, its
// `plate` and its `icon` ({ url }) if it has one, its clip listed in the catalog's `fx` as entry <id> (served at
// /api/fx/s/<id>.mp4), an admin's bubble or wave its `look`. An older app reads the plate's place, size, colour and
// boldness only (it writes the name even when `show` is false) and shows no icon. The app that first read this list (frames and entry effects) skips the other kinds. The catalog's and /api/config's `v` add
// shopItemsRev(). The shop sells at the price, days and VIP level set here (economy.mjs sellable). An older app never
// asks: it shows its compiled shop and buys by the app's names and prices, refused (update_required, nothing taken)
// when an item's price or days moved; it draws nothing for an admin's item someone wears.
import crypto from 'node:crypto';

import { HttpError, auth, clientIp, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { SEAT_COLORS, SEAT_DEFAULT, SHOP, SHOP_PAUSED } from './catalog.mjs';
import { addVideoTable, canConvert, canSvga, fitPicture, imageInfo, kickJobs, svgaFrame, videoOf } from './custom-gifts.mjs';
import { FX_PATH } from './fx.mjs';
import { keyOf, kindMax, readStored, removeFiles, sendFile, storageOn, verifyUpload, writeStored } from './media.mjs';
import { panelDetail } from './panel.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.SHOP_ITEMS_POLL_MS, 5000);

/**
 * `seat`: a room's seat color (room-seat-color.mjs). A room's owner buys it for the room, not a person for themselves:
 * the shop a person buys from (shopItem, ownShopSkus: economy.mjs) never has it; seatItem has.
 */
export const SHOP_KINDS = Object.freeze(['frame', 'entry', 'bubble', 'wave', 'seat']);
const KIND_NAME = { frame: 'Çerçeve', entry: 'Giriş efekti', bubble: 'Sohbet balonu', wave: 'Ses dalgası', seat: 'Koltuk rengi' };
/** An admin's item's id: this and a number. */
const PREFIX = { frame: 'sf', entry: 'se', bubble: 'sb', wave: 'sw', seat: 'sc' };
/** The color a new seat color starts with until the panel changes it (the default's). */
const SEAT_COLOR_START = SEAT_COLORS.get(SEAT_DEFAULT).color;
/**
 * The voice waves' styles the app draws (components/room/voice-wave), and how many colours each takes: a ring that
 * glows with the voice; two rings, the outer one going further with it; a ring turning in its colours; a ring with a
 * ripple leaving it again and again; a ring with four sparks turning on it (the second colour, or a picture).
 */
export const WAVE_STYLES = Object.freeze({
  ring: Object.freeze({ name: 'Halka', colors: [1, 1] }),
  double: Object.freeze({ name: 'Çift halka', colors: [2, 2] }),
  spin: Object.freeze({ name: 'Dönen renkler', colors: [2, 4] }),
  ripple: Object.freeze({ name: 'Yayılan halka', colors: [1, 1] }),
  sparkle: Object.freeze({ name: 'Parıltı', colors: [2, 2] }),
});
/** The look a new bubble and wave get until the panel changes it. */
export const LOOK_DEFAULT = Object.freeze({
  bubble: Object.freeze({ colors: Object.freeze(['#7C3AED', '#EC4899']), text: '#FFFFFF' }),
  wave: Object.freeze({ style: 'ring', colors: Object.freeze(['#3D9BFF']) }),
});
/** How the name may come in and go (`plate.anim`): at once, fading, growing, rising. */
export const PLATE_ANIMS = Object.freeze(['none', 'fade', 'zoom', 'rise']);
/** The soft dark shadow round the letters a plate has unless the panel changes it (the app drew it before it could). */
const PLATE_SHADOW = Object.freeze({ color: '#000000', size: 0.1 });
/**
 * The plate a new entry effect gets until the panel moves it: centred, a little below the middle, white, bold, with
 * its soft shadow, for the whole clip.
 */
export const PLATE_DEFAULT = Object.freeze({
  x: 0.5,
  y: 0.62,
  w: 0.6,
  size: 0.035,
  color: '#FFFFFF',
  bold: true,
  show: true,
  upper: false,
  spacing: 0,
  shadow: PLATE_SHADOW,
  outline: null,
  back: null,
  from: 0,
  to: 0,
  anim: 'none',
});
/** The rules the panel shows and every save checks. */
export const SHOP_LIMITS = Object.freeze({
  nameMin: 2,
  nameMax: 24,
  priceMax: 10_000_000,
  daysMax: 365,
  vipMax: 15,
  // A frame is served as uploaded: kept at what phones load comfortably (the upload kind takes more, for icons).
  frameBytes: 4 * 1024 * 1024,
  framePxMin: 128,
  framePxMax: 1024,
  holeMin: 0.1,
  holeMax: 0.45,
  holeDefault: 0.25,
  // Where the hole's centre may be (shares of the picture, each way); the photo must stay inside the picture.
  holeAtMin: 0.3,
  holeAtMax: 0.7,
  // A frame's moving version: an animated WebP, drawn on every seat that wears it, so small.
  motionBytes: 3 * 1024 * 1024,
  motionPxMin: 128,
  motionPxMax: 512,
  // The name plate: its width and letters as shares of the frame; letter spacing, shadow and outline as shares of the
  // letters' size; a band's opacity; the seconds of the clip it shows between.
  plate: Object.freeze({
    wMin: 0.1,
    wMax: 1,
    sizeMin: 0.015,
    sizeMax: 0.08,
    spacingMax: 0.4,
    shadowMin: 0.02,
    shadowMax: 0.6,
    outlineMin: 0.02,
    outlineMax: 0.15,
    backMin: 0.1,
    secondsMax: 20,
    anims: PLATE_ANIMS,
  }),
  // An entry effect's icon in the shop: a PNG or WebP, drawn small. Any size up to the upload's is taken; a bigger one
  // than phones need is made smaller on save (iconServe*, custom-gifts.mjs fitPicture), as gift icons are.
  iconBytes: kindMax('shopframe'),
  iconPxMin: 64,
  iconPxMax: 4096,
  iconServePx: 512,
  iconServeBytes: 512 * 1024,
  // A bubble's picture: drawn at a third of its size (made at 3×, as a phone's screen), its corners as they are.
  bubbleBytes: 1024 * 1024,
  bubblePxMin: 64,
  bubblePxMax: 1024,
  // A wave's spark picture: drawn small, four of them turning on the ring; made smaller on save like the icon.
  sparkBytes: kindMax('shopframe'),
  sparkPxMin: 64,
  sparkPxMax: 4096,
  sparkServePx: 512,
  sparkServeBytes: 512 * 1024,
  waveStyles: WAVE_STYLES,
  itemsMax: 200,
});
const OWN_ID = /^s[febwc][0-9]{1,9}$/;
/** The app's seat colors as the shop's items: kept for good unless the panel gives them days, the default free. */
const APP_SEATS = [...SEAT_COLORS.values()].map((c) => Object.freeze({ sku: c.id, kind: 'seat', name: c.name, price: c.price, days: null, minVip: 0, color: c.color }));
const APP_ITEMS = [...[...SHOP.values()].filter((x) => SHOP_KINDS.includes(x.kind)), ...APP_SEATS];
const APP_BY_ID = new Map(APP_ITEMS.map((x) => [x.sku, x]));
/** Where the app's items sit until someone moves them: after the admins' own, in the app's order. */
const APP_SORT = new Map(APP_ITEMS.map((x, i) => [x.sku, 1000 + i]));
const num = (v) => (v === null || v === undefined ? null : Number(v));
const fmt = (n) => n.toLocaleString('tr-TR');
const lower = (s) => s.toLocaleLowerCase('tr');
const bad = (message) => new HttpError(400, message);

// --- The table in memory -------------------------------------------------------------------------------------
let snap = { rev: 0, rows: new Map() };
const rowOf = (r) =>
  Object.freeze({
    id: r.id,
    builtin: r.builtin === true,
    kind: r.kind,
    name: r.name,
    price: num(r.price),
    days: num(r.days),
    minVip: num(r.min_vip),
    enabled: r.enabled,
    sort: num(r.sort),
    art: r.art_url
      ? Object.freeze({
          url: r.art_url,
          px: num(r.art_px),
          hole: Number(r.hole),
          at: r.hole_x === null || r.hole_x === undefined ? null : Object.freeze({ x: Number(r.hole_x), y: Number(r.hole_y) }),
          motion: r.motion_url ? Object.freeze({ url: r.motion_url, px: num(r.motion_px), bytes: num(r.motion_bytes) }) : null,
        })
      : null,
    video: r.video_url ? Object.freeze({ url: r.video_url, bytes: num(r.video_bytes), ms: num(r.video_ms), v: r.video_v }) : null,
    plate: r.plate ?? null,
    look: r.look ?? null,
    icon: r.icon_url ? Object.freeze({ url: r.icon_url, px: num(r.icon_px) }) : null,
    job: r.job_status ? Object.freeze({ status: r.job_status, error: r.job_error ?? null, preview: r.job_preview ?? null }) : null,
    deleted: !!r.deleted_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  });

/** Reads the table again (never back to an older copy). */
export async function refreshShopItems(q = db) {
  const r = await q.query('SELECT * FROM shop_items');
  const rev = r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0);
  if (rev >= snap.rev) snap = { rev, rows: new Map(r.rows.map((x) => [x.id, rowOf(x)])) };
  return snap;
}
let timer = null;
/** Picks up another process's changes. */
export function startShopItems() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT coalesce(max(rev), 0) AS rev FROM shop_items');
      if (Number(r.rows[0].rev) !== snap.rev) await refreshShopItems();
    } catch (e) {
      console.error('shop items sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}
export function stopShopItems() {
  clearInterval(timer);
  timer = null;
}
/** Added to the catalog's and /api/config's version: grows with every change a phone should see. */
export const shopItemsRev = () => snap.rev;
// An entry effect's video is made by the gifts' converter (one job at a time for both).
addVideoTable({ table: 'shop_items', rev: 'shop_item_rev', what: 'shop', refresh: () => refreshShopItems() });

// --- As they are now ---------------------------------------------------------------------------------------------
/** One of the app's items as it is now: the app's values (catalog.mjs SHOP) with what was changed (`o`). */
const appItemOf = (base, o) =>
  Object.freeze({
    sku: base.sku,
    kind: base.kind,
    builtin: true,
    name: o?.name ?? base.name,
    price: o?.price ?? base.price,
    days: o?.days === null || o?.days === undefined ? base.days : o.days === 0 ? null : o.days,
    minVip: o?.minVip ?? base.minVip,
    enabled: o?.enabled ?? !SHOP_PAUSED.has(base.sku),
    sort: o?.sort ?? APP_SORT.get(base.sku),
    tier: null,
    art: null,
    video: null,
    plate: null,
    // A seat color's look is its color, the panel's or the app's (the app draws every seat from it).
    look: base.kind === 'seat' ? (o?.look ?? Object.freeze({ color: base.color })) : null,
    icon: null,
    job: null,
    row: o ?? null,
  });
const ownItemOf = (r) =>
  Object.freeze({
    sku: r.id,
    kind: r.kind,
    builtin: false,
    name: r.name,
    price: r.price,
    days: r.days === 0 ? null : r.days,
    minVip: r.minVip,
    enabled: r.enabled,
    sort: r.sort,
    tier: null,
    art: r.art,
    video: r.video,
    plate: r.plate,
    look: r.look,
    icon: r.icon,
    job: r.job,
    row: r,
  });
const bySort = (a, b) => a.sort - b.sort || Number(a.builtin) - Number(b.builtin) || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);
let memo = { snap: null, list: [], byId: new Map() };
/** Every item that isn't deleted, in the shop's order (kind by kind as the shop shows them). */
export function allShopItems() {
  if (memo.snap === snap) return memo.list;
  const list = [...APP_ITEMS.map((b) => appItemOf(b, snap.rows.get(b.sku))), ...[...snap.rows.values()].filter((r) => !r.builtin && !r.deleted).map(ownItemOf)].sort(bySort);
  memo = { snap, list, byId: new Map(list.map((x) => [x.sku, x])) };
  return list;
}
/** Any item of the list as it is now (on the shelf or not), or undefined (unknown, deleted): the panel's. */
const itemOf = (sku) => (typeof sku === 'string' ? (allShopItems(), memo.byId.get(sku)) : undefined);
/**
 * A frame, entry effect, bubble or wave as it is now (on the shelf or not), or undefined (a seat color, another kind,
 * unknown, deleted): what a person buys and wears (economy.mjs).
 */
export const shopItem = (sku) => {
  const x = itemOf(sku);
  return x?.kind === 'seat' ? undefined : x;
};
/** The admins' own items that aren't deleted, seat colors left out (economy.mjs lists them with the shop's). */
export const ownShopSkus = () => allShopItems().filter((x) => !x.builtin && x.kind !== 'seat').map((x) => x.sku);
/** A seat color as it is now (on the shelf or not), or undefined (room-seat-color.mjs). */
export const seatItem = (id) => {
  const x = itemOf(id);
  return x?.kind === 'seat' ? x : undefined;
};

const fxUrl = (sku, v) => `${FX_PATH}s/${sku}.mp4?v=${v}`;
/** An admin's bubble or wave as the phones draw it: its colours (and style), and its picture with how to stretch it. */
function lookOut(x) {
  if (x.kind === 'bubble') {
    const s = x.look.slice;
    return { colors: x.look.colors, text: x.look.text, ...(x.art && s ? { art: { url: x.art.url, w: s.w, h: s.h, t: s.t, r: s.r, b: s.b, l: s.l } } : {}) };
  }
  return { style: x.look.style, colors: x.look.colors, ...(x.art ? { art: { url: x.art.url } } : {}) };
}
/**
 * GET /api/catalog `shop` (?shop=1): every item in its order as it is now; `off` for one taken off the shelf; an
 * admin's frame its picture, an admin's entry effect that it has a video (in `fx`), its plate and its icon, an admin's
 * bubble or wave its look.
 */
export function shopCatalog() {
  return {
    items: allShopItems().map((x) => ({
      sku: x.sku,
      kind: x.kind,
      name: x.name,
      price: x.price,
      days: x.days,
      minVip: x.minVip,
      ...(x.builtin ? { builtin: true } : {}),
      ...(x.enabled ? {} : { off: true }),
      ...(x.kind === 'frame' && x.art
        ? { art: { url: x.art.url, hole: x.art.hole, ...(x.art.at && (x.art.at.x !== 0.5 || x.art.at.y !== 0.5) ? { at: x.art.at } : {}), ...(x.art.motion ? { motion: { url: x.art.motion.url } } : {}) } }
        : {}),
      ...(x.kind === 'entry' && x.video ? { video: true, plate: x.plate, ...(x.icon ? { icon: { url: x.icon.url } } : {}) } : {}),
      ...(!x.builtin && x.look && (x.kind === 'bubble' || x.kind === 'wave') ? { look: lookOut(x) } : {}),
      // A seat color: its color, and which one every room has for free (an older app skips the kind).
      ...(x.kind === 'seat' ? { look: { color: x.look.color }, ...(x.sku === SEAT_DEFAULT ? { default: true } : {}) } : {}),
    })),
  };
}
/** GET /api/catalog `fx`: the admins' entry effects' videos (taken off the shelf too: whoever has one still plays it). */
export const shopFx = () =>
  allShopItems()
    .filter((x) => !x.builtin && x.kind === 'entry' && x.video)
    .map((x) => ({ kind: 'entry', id: x.sku, url: fxUrl(x.sku, x.video.v), bytes: x.video.bytes, ms: x.video.ms }));
/** GET or HEAD /api/fx/s/<id>.mp4: an admin's entry effect's stacked video from the storage. */
export async function sendShopFx(req, res, name) {
  const m = /^(se[0-9]{1,9})\.mp4$/.exec(name);
  const x = m ? snap.rows.get(m[1]) : null;
  const key = x && !x.deleted && x.video ? keyOf(x.video.url) : null;
  if (!key) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  await sendFile(req, res, key);
}

// --- Checking what the panel sends -----------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const writeLimit = (a) => limit(`shop-admin:${a.id}`, 60, 'Çok fazla değişiklik, biraz bekle');
const audited = (c, a, action, detail, req) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, action, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);

const kindOf = (v) => {
  if (!SHOP_KINDS.includes(v)) throw bad('Tür çerçeve (frame), giriş efekti (entry), sohbet balonu (bubble), ses dalgası (wave) ya da koltuk rengi (seat) olmalı');
  return v;
};
/** A seat color's look: the cushion's color (the app tints the seat with it, the gold stays). */
function seatLookOf(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (!o) throw bad('Koltuk renginin görünüşü geçersiz');
  if (typeof o.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(o.color)) throw bad('Koltuk rengi: renk #RRGGBB biçiminde olmalı');
  return { color: o.color.toUpperCase() };
}
const nameOf = (v) => text(v, SHOP_LIMITS.nameMin, SHOP_LIMITS.nameMax, 'Ad').replace(/\s+/g, ' ');
const priceOf = (v) => {
  const n = int(v, 1, SHOP_LIMITS.priceMax);
  if (n === null) throw bad(`Fiyat 1 ile ${fmt(SHOP_LIMITS.priceMax)} jeton arasında tam sayı olmalı`);
  return n;
};
const daysOf = (v) => {
  const n = int(v, 0, SHOP_LIMITS.daysMax);
  if (n === null) throw bad(`Süre 1–${SHOP_LIMITS.daysMax} gün olmalı (0: süresiz)`);
  return n;
};
const vipOf = (v) => {
  const n = int(v, 0, SHOP_LIMITS.vipMax);
  if (n === null) throw bad(`VIP seviyesi 0–${SHOP_LIMITS.vipMax} olmalı (0: herkes)`);
  return n;
};
const boolOf = (v, what) => {
  if (typeof v !== 'boolean') throw bad(`${what} geçersiz`);
  return v;
};
const holeOf = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < SHOP_LIMITS.holeMin || n > SHOP_LIMITS.holeMax) throw bad(`Fotoğraf alanı resmin %${SHOP_LIMITS.holeMin * 100}–%${SHOP_LIMITS.holeMax * 100}'i olmalı`);
  return Math.round(n * 1000) / 1000;
};
/**
 * Where a frame's hole is: its centre as shares of the picture (`holeX` across, `holeY` down), the photo of radius
 * `hole` inside the picture. Both or neither (undefined: unchanged); the middle is stored as no place (NULL).
 */
function holeAtOf(x, y, hole) {
  if (x === undefined && y === undefined) return undefined;
  const { holeAtMin: lo, holeAtMax: hi } = SHOP_LIMITS;
  const at = [x, y].map((v) => {
    const n = Number(v);
    if (v === null || typeof v === 'boolean' || !Number.isFinite(n) || n < lo || n > hi) throw bad(`Fotoğrafın yeri resmin %${lo * 100}–%${hi * 100}'inde olmalı (yatay ve dikey)`);
    return Math.round(n * 1000) / 1000;
  });
  if (at.some((n) => n - hole < -0.001 || n + hole > 1.001)) throw bad('Fotoğraf alanı resmin dışına taşıyor: yerini ortaya yaklaştırın ya da alanı küçültün');
  return at[0] === 0.5 && at[1] === 0.5 ? null : { x: at[0], y: at[1] };
}
/**
 * The name plate: shares of the 540 × 960 frame, a colour and bold or not; null: none (the app's usual banner). Its
 * look and timing, each with a default when left out: `show` (false: no name over the clip), `upper` (capitals),
 * `spacing` (between the letters), `shadow` (a soft shadow or a glow round the letters: its colour and reach; null:
 * none), `outline` (a line round them: its colour and width), the reaches and widths as shares of the letters' size,
 * `back` (a rounded band behind the name: its colour and opacity), `from` / `to` (the seconds of the clip the name
 * shows between; `to` 0: until the clip ends) and `anim` (how it comes in and goes, PLATE_ANIMS).
 */
export function plateOf(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  if (!o) throw bad('İsim plakası geçersiz');
  const P = SHOP_LIMITS.plate;
  const shareOf = (val, min, max, what) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < min || n > max) throw bad(`İsim plakası: ${what} %${Math.round(min * 1000) / 10}–%${Math.round(max * 1000) / 10} olmalı`);
    return Math.round(n * 1000) / 1000;
  };
  const share = (k, min, max, what) => shareOf(o[k], min, max, what);
  const colorIn = (c, what) => {
    if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) return c.toUpperCase();
    throw bad(`İsim plakası: ${what} #RRGGBB biçiminde olmalı`);
  };
  const flag = (k, d, what) => {
    if (o[k] === undefined) return d;
    if (typeof o[k] !== 'boolean') throw bad(`İsim plakası: ${what} seçimi geçersiz`);
    return o[k];
  };
  /** A colour and how much of it (`size` or a band's `alpha`); null: none; left out: `d`. */
  const paint = (k, amount, min, max, d, what) => {
    if (o[k] === undefined) return d && { ...d };
    if (o[k] === null) return null;
    const p = o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? o[k] : null;
    if (!p) throw bad(`İsim plakası: ${what} geçersiz`);
    return { color: colorIn(p.color, `${what} rengi`), [amount]: shareOf(p[amount], min, max, what) };
  };
  const seconds = (k, what) => {
    if (o[k] === undefined) return 0;
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k]) || o[k] < 0 || o[k] > P.secondsMax) throw bad(`İsim plakası: ${what} 0–${P.secondsMax} saniye olmalı`);
    return Math.round(o[k] * 10) / 10;
  };
  const color = colorIn(o.color, 'renk');
  if (o.bold !== undefined && typeof o.bold !== 'boolean') throw bad('İsim plakası: kalın yazı seçimi geçersiz');
  const plate = { x: share('x', 0, 1, 'yatay yer'), y: share('y', 0, 1, 'dikey yer'), w: share('w', P.wMin, P.wMax, 'genişlik'), size: share('size', P.sizeMin, P.sizeMax, 'yazı boyu'), color, bold: o.bold !== false };
  const from = seconds('from', 'görünme anı');
  const to = seconds('to', 'kaybolma anı');
  if (to && to < from + 0.5) throw bad('İsim plakası: kaybolma anı görünme anından en az yarım saniye sonra olmalı (0: video bitene kadar)');
  const anim = o.anim === undefined ? 'none' : PLATE_ANIMS.includes(o.anim) ? o.anim : null;
  if (!anim) throw bad('İsim plakası: belirme şekli geçersiz');
  return {
    ...plate,
    show: flag('show', true, 'ad yazılsın'),
    upper: flag('upper', false, 'büyük harf'),
    spacing: o.spacing === undefined ? 0 : share('spacing', 0, P.spacingMax, 'harf aralığı'),
    shadow: paint('shadow', 'size', P.shadowMin, P.shadowMax, PLATE_SHADOW, 'gölge'),
    outline: paint('outline', 'size', P.outlineMin, P.outlineMax, null, 'kontur'),
    back: paint('back', 'alpha', P.backMin, 1, null, 'arka plan'),
    from,
    to,
    anim,
  };
}
/** A shop picture (uploaded as media.mjs shopframe), read and measured: a PNG or WebP of at most `max` bytes. */
async function pictureOf(url, what, max) {
  const key = typeof url === 'string' ? keyOf(url) : null;
  if (!key?.startsWith('shopframe/')) throw bad(`${what} önce yükle`);
  await verifyUpload(url, 'shopframe');
  const buf = await readStored(key, max);
  const info = imageInfo(buf);
  if (!info) throw bad(`${what} PNG ya da WebP olmalı`);
  return { ...info, bytes: buf.length, buf, key };
}
/** A small picture kept as uploaded when phones can take it, else made smaller (custom-gifts.mjs fitPicture). */
async function served(url, info, maxPx, maxBytes, what) {
  if (info.bytes <= maxBytes && Math.max(info.width, info.height) <= maxPx) return { url, px: info.width };
  const small = await fitPicture(info.buf, info.key, { maxPx, maxBytes, what, size: `${info.width} × ${info.height}` });
  const px = imageInfo(await readStored(keyOf(small), maxBytes))?.width ?? Math.min(info.width, maxPx);
  return { url: small, px };
}
/** A frame's picture: a transparent PNG or WebP, square or nearly, 128–1024 px, still (the moving one goes apart). */
async function frameArt(url) {
  const info = await pictureOf(url, 'Çerçeve resmini', SHOP_LIMITS.frameBytes);
  if (info.animated) throw bad('Bu resim hareketli: onu "Hareketli hali"ne yükleyin; çerçeve resmi durağan bir PNG ya da WebP olmalı (eski telefonlar onu gösterir)');
  if (!info.alpha) throw bad('Çerçeve resminde saydamlık yok: ortası (fotoğrafın yeri) ve çevresi saydam olmalı');
  if (Math.abs(info.width - info.height) > Math.max(2, info.width * 0.02)) throw bad(`Çerçeve resmi kare olmalı (bu ${info.width} × ${info.height})`);
  if (info.width < SHOP_LIMITS.framePxMin || info.width > SHOP_LIMITS.framePxMax) throw bad(`Çerçeve resmi ${SHOP_LIMITS.framePxMin}–${SHOP_LIMITS.framePxMax} piksel olmalı (bu ${info.width})`);
  return { url, px: info.width };
}
/** A bubble's picture: a PNG or WebP, 64–1024 px each way, up to 1 MB; its width and height go into its slice. */
async function bubbleArt(url) {
  const info = await pictureOf(url, 'Balon resmini', SHOP_LIMITS.bubbleBytes);
  const { bubblePxMin: lo, bubblePxMax: hi } = SHOP_LIMITS;
  if (info.width < lo || info.height < lo || info.width > hi || info.height > hi) throw bad(`Balon resmi her yönde ${lo}–${hi} piksel olmalı (bu ${info.width} × ${info.height})`);
  return { url, px: info.width, w: info.width, h: info.height };
}
/**
 * A frame's moving version: an animated WebP, transparent, square or nearly, 128–512 px, up to 3 MB. It is the same
 * frame as the still picture (the same hole). A GIF isn't taken (its edges are jagged); an SVGA becomes this WebP first
 * (POST /api/admin/shop/frame-svga), since the app has no SVGA player.
 */
async function motionArt(url) {
  const info = await pictureOf(url, 'Hareketli çerçeveyi', SHOP_LIMITS.motionBytes);
  if (info.type !== 'webp' || !info.animated) throw bad('Hareketli hali hareketli bir WebP olmalı (GIF, SVGA ya da durağan resim değil)');
  if (!info.alpha) throw bad('Hareketli çerçevede saydamlık yok: ortası (fotoğrafın yeri) ve çevresi saydam olmalı');
  if (Math.abs(info.width - info.height) > Math.max(2, info.width * 0.02)) throw bad(`Hareketli çerçeve kare olmalı (bu ${info.width} × ${info.height})`);
  const { motionPxMin: lo, motionPxMax: hi } = SHOP_LIMITS;
  if (info.width < lo || info.width > hi) throw bad(`Hareketli çerçeve ${lo}–${hi} piksel olmalı (bu ${info.width}); telefon onu küçük çizer, büyüğü boşuna yer kaplar`);
  return { url, px: info.width, bytes: info.bytes };
}
/** An entry effect's icon in the shop: a PNG or WebP, 64–4096 px each way; phones get at most 512 px and 512 KB. */
async function iconArt(url) {
  const info = await pictureOf(url, 'İkon resmini', SHOP_LIMITS.iconBytes);
  const { iconPxMin: lo, iconPxMax: hi } = SHOP_LIMITS;
  if (info.width < lo || info.height < lo || info.width > hi || info.height > hi) throw bad(`İkon her yönde ${lo}–${hi} piksel olmalı (bu ${info.width} × ${info.height})`);
  return served(url, info, SHOP_LIMITS.iconServePx, SHOP_LIMITS.iconServeBytes, 'İkon');
}
/** A wave's spark picture: a transparent PNG or WebP, 64–4096 px; phones get at most 512 px and 512 KB. */
async function sparkArt(url) {
  const info = await pictureOf(url, 'Parıltı resmini', SHOP_LIMITS.sparkBytes);
  if (!info.alpha) throw bad('Parıltı resminde saydamlık yok: şeklin çevresi saydam olmalı');
  const { sparkPxMin: lo, sparkPxMax: hi } = SHOP_LIMITS;
  if (info.width < lo || info.height < lo || info.width > hi || info.height > hi) throw bad(`Parıltı resmi her yönde ${lo}–${hi} piksel olmalı (bu ${info.width} × ${info.height})`);
  return served(url, info, SHOP_LIMITS.sparkServePx, SHOP_LIMITS.sparkServeBytes, 'Parıltı resmi');
}
const colorOf = (v, what) => {
  if (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) return v.toUpperCase();
  throw bad(`${what}: renk #RRGGBB biçiminde olmalı`);
};
const objOf = (v, what) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  throw bad(`${what} geçersiz`);
};
/** A bubble's colours: two (left to right; the same twice for one colour) and the text's. */
function bubbleLookOf(v) {
  const o = objOf(v, 'Balonun görünüşü');
  if (!Array.isArray(o.colors) || o.colors.length !== 2) throw bad('Balonun iki rengi olmalı (tek renk için ikisi aynı)');
  return { colors: o.colors.map((c, i) => colorOf(c, `Balonun ${i + 1}. rengi`)), text: colorOf(o.text ?? '#FFFFFF', 'Yazının rengi') };
}
/**
 * How a bubble's picture is stretched: how far in (px of the picture) from each edge its corners go. They stay as they
 * are; the middle between them stretches round the message, which is written there. Default: a third of each side.
 */
function sliceOf(v, w, h) {
  const o = v === undefined || v === null ? { t: Math.floor(h / 3), r: Math.floor(w / 3), b: Math.floor(h / 3), l: Math.floor(w / 3) } : objOf(v, 'Balon resminin köşeleri');
  const at = (k, what) => {
    const n = Number(o[k]);
    if (!Number.isSafeInteger(n) || n < 1) throw bad(`Balon resmi: ${what} en az 1 piksel olmalı`);
    return n;
  };
  const s = { w, h, t: at('t', 'üst köşe'), r: at('r', 'sağ köşe'), b: at('b', 'alt köşe'), l: at('l', 'sol köşe') };
  if (s.l + s.r > w - 2) throw bad(`Balon resmi: sol ve sağ köşe birlikte en çok ${w - 2} piksel olabilir; ortası uzar`);
  if (s.t + s.b > h - 2) throw bad(`Balon resmi: üst ve alt köşe birlikte en çok ${h - 2} piksel olabilir; ortası uzar`);
  return s;
}
/** A wave's style and its colours (as many as the style takes). */
function waveLookOf(v) {
  const o = objOf(v, 'Dalganın görünüşü');
  const style = WAVE_STYLES[o.style] ? o.style : null;
  if (!style) throw bad(`Dalganın stili şunlardan biri olmalı: ${Object.values(WAVE_STYLES).map((x) => x.name).join(', ')}`);
  const [lo, hi] = WAVE_STYLES[style].colors;
  if (!Array.isArray(o.colors) || o.colors.length < lo || o.colors.length > hi) throw bad(`${WAVE_STYLES[style].name} ${lo === hi ? lo : `${lo}–${hi}`} renk alır`);
  return { style, colors: o.colors.map((c, i) => colorOf(c, `Dalganın ${i + 1}. rengi`)) };
}
/**
 * A bubble's or wave's look and picture as they are to be saved. `sent`: the look the panel sent now (undefined: the
 * one in use, or the default for a new item); `url`: the picture (null: none); `cur`: the item now, so a picture that
 * stays isn't read again (its size is in its slice). A bubble's picture has its slice: the one sent now, else the one
 * in use while the picture stays, else the default for the new picture. A wave's picture is its sparks', so only the
 * sparkle style takes one.
 */
async function lookAndArt(kind, sent, url, cur) {
  const lookIn = sent !== undefined ? sent : (cur?.look ?? LOOK_DEFAULT[kind]);
  const same = url !== null && url === cur?.art?.url;
  if (kind === 'bubble') {
    const look = bubbleLookOf(lookIn);
    if (url === null) return { look, art: null };
    const pic = same ? { url, px: cur.art.px, w: cur.look.slice.w, h: cur.look.slice.h } : await bubbleArt(url);
    look.slice = sliceOf(sent?.slice ?? (same ? cur.look.slice : undefined), pic.w, pic.h);
    return { look, art: { url: pic.url, px: pic.px } };
  }
  const look = waveLookOf(lookIn);
  if (url === null) return { look, art: null };
  if (look.style !== 'sparkle') throw bad('Resim yalnız Parıltı stilinde kullanılır (halkada dönen şekiller); resmi kaldırın ya da stili Parıltı yapın');
  return { look, art: same ? { url, px: cur.art.px } : await sparkArt(url) };
}
const idOf = (v) => {
  if (typeof v === 'string' && (OWN_ID.test(v) || APP_BY_ID.has(v))) return v;
  throw bad('Geçersiz eşya');
};
const liveItem = (id) => {
  const x = itemOf(id);
  if (!x) throw new HttpError(404, 'Eşya bulunamadı');
  return x;
};
/** No other item of the kind with this name (the app's own included, by its name now and in the app). */
function nameFree(kind, name, self) {
  const n = lower(name);
  const taken = allShopItems().some((x) => x.kind === kind && x.sku !== self && lower(x.name) === n) || APP_ITEMS.some((x) => x.kind === kind && x.sku !== self && lower(x.name) === n);
  if (taken) throw new HttpError(409, `Bu adda bir ${lower(KIND_NAME[kind])} zaten var`);
}
async function saving(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code === '23505' && e.constraint === 'shop_items_name') throw new HttpError(409, 'Bu adda bir eşya zaten var');
    throw e;
  }
}
/** UPDATE … SET from a column → value map (undefined left out), the row's rev and who changed it; RETURNING *. */
async function setRow(c, id, cols, actor) {
  const vals = [id];
  const sets = [];
  for (const [col, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    vals.push((col === 'plate' || col === 'look') && v !== null ? JSON.stringify(v) : v);
    sets.push(`${col} = $${vals.length}`);
  }
  vals.push(actor);
  sets.push(`updated_by = $${vals.length}`, 'updated_at = now()', "rev = nextval('shop_item_rev')");
  return (await c.query(`UPDATE shop_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals)).rows[0];
}
/** The row for one of the app's items, made the first time anything about it changes (every column null). */
const appRow = (c, id, actor) =>
  c.query('INSERT INTO shop_items (id, builtin, kind, created_by, updated_by) VALUES ($1, true, $2, $3, $3) ON CONFLICT (id) DO NOTHING', [id, APP_BY_ID.get(id).kind, actor]);
const auditOf = (r) => r && Object.fromEntries(Object.entries(r).filter(([k]) => !['created_at', 'updated_at', 'created_by', 'updated_by', 'rev', 'job_at', 'job_tries'].includes(k)));

/** How many people have each item now (entitlements, economy.mjs), and how many rooms each seat color (bought, not run out). */
async function owners(skus = null) {
  const r = await db.query(
    `SELECT e.sku, count(DISTINCT e.user_id)::int AS n FROM entitlements e
      WHERE e.kind = ANY($1::text[]) AND e.revoked_at IS NULL AND e.starts_at <= now() AND (e.ends_at IS NULL OR e.ends_at > now())
        AND ($2::text[] IS NULL OR e.sku = ANY($2::text[])) GROUP BY e.sku
     UNION ALL
     SELECT s.color, count(*)::int FROM room_seat_colors s
      WHERE (s.ends_at IS NULL OR s.ends_at > now()) AND ($2::text[] IS NULL OR s.color = ANY($2::text[])) GROUP BY s.color`,
    [SHOP_KINDS, skus],
  );
  return new Map(r.rows.map((x) => [x.sku, x.n]));
}
/** Rooms that have a seat color now (bought, not run out). */
const roomsWith = async (c, id) => (await c.query('SELECT count(*)::int AS n FROM room_seat_colors WHERE color = $1 AND (ends_at IS NULL OR ends_at > now())', [id])).rows[0].n;
const CHANGED = ['name', 'price', 'days', 'minVip', 'enabled', 'look'];
const changedOf = (r) => (r ? CHANGED.filter((k) => r[k] !== null && r[k] !== undefined) : []);
/** An item as the panel shows it. */
function itemView(x, owned) {
  const base = APP_BY_ID.get(x.sku);
  return {
    id: x.sku,
    kind: x.kind,
    builtin: x.builtin,
    name: x.name,
    price: x.price,
    days: x.days,
    minVip: x.minVip,
    enabled: x.enabled,
    sort: x.sort,
    owners: owned.get(x.sku) ?? 0,
    art: x.art
      ? { url: x.art.url, px: x.art.px, hole: x.art.hole, at: x.art.at ?? { x: 0.5, y: 0.5 }, motion: x.art.motion ? { url: x.art.motion.url, px: x.art.motion.px, bytes: x.art.motion.bytes } : null }
      : null,
    video: x.video ? { url: fxUrl(x.sku, x.video.v), bytes: x.video.bytes, ms: x.video.ms } : null,
    plate: x.plate,
    look: x.look,
    icon: x.icon ? { url: x.icon.url, px: x.icon.px } : null,
    job: x.job,
    ...(base
      ? {
          original: { name: base.name, price: base.price, days: base.days, minVip: base.minVip, enabled: !SHOP_PAUSED.has(base.sku), ...(base.kind === 'seat' ? { look: { color: base.color } } : {}) },
          changed: changedOf(x.row),
        }
      : {}),
    ...(x.kind === 'seat' && x.sku === SEAT_DEFAULT ? { default: true } : {}),
    updatedAt: x.row?.updatedAt ?? null,
  };
}
async function adminItems() {
  const owned = await owners();
  return allShopItems().map((x) => itemView(x, owned));
}
const oneItem = async (id) => {
  const x = itemOf(id);
  return x ? itemView(x, await owners([id])) : null;
};
/** The place before every item of `kind` (a new one goes first). */
const firstSort = (kind) => Math.min(1, ...allShopItems().filter((x) => x.kind === kind).map((x) => x.sort)) - 1;

const RESET = ['name', 'price', 'days', 'minVip', 'enabled', 'sort', 'look'];
const COLUMN = { name: 'name', price: 'price', days: 'days', minVip: 'min_vip', enabled: 'enabled', sort: 'sort', look: 'look' };

export const shopRoutes = {
  async 'GET /api/admin/shop'(req) {
    await admin(req);
    return {
      items: await adminItems(),
      limits: { ...SHOP_LIMITS, plateDefault: PLATE_DEFAULT, lookDefault: { ...LOOK_DEFAULT, seat: { color: SEAT_COLOR_START } }, seatDefault: SEAT_DEFAULT },
      storage: storageOn(),
      convert: await canConvert(),
      svga: await canSvga(),
    };
  },

  /**
   * An SVGA for a frame, uploaded as a gift's source: answers the still picture and the moving WebP made from it, the
   * addresses a frame is then saved with (art, motion). The SVGA itself is deleted once it is converted.
   */
  async 'POST /api/admin/shop/frame-svga'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req);
    if (typeof b.source !== 'string' || !b.source) throw bad('SVGA dosyasını önce yükle');
    const out = await svgaFrame(b.source, SHOP_LIMITS.motionBytes);
    const name = `shopframe/${keyOf(b.source).split('/')[1]}/${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}`;
    const art = await writeStored(`${name}.png`, out.still, 'image/png');
    const motion = await writeStored(`${name}.webp`, out.motion, 'image/webp');
    removeFiles([b.source]);
    await audited(db, a, 'shop.frame_svga', { art, motion, px: out.px, bytes: out.motion.length }, req);
    return { art, motion, px: out.px, bytes: out.motion.length };
  },

  /**
   * An admin's own frame (with its picture), entry effect (with its video and name plate), chat bubble or voice wave
   * (with its look, and a picture if it has one), first of its kind.
   */
  async 'POST /api/admin/shop'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const kind = kindOf(b.kind);
    const name = nameOf(b.name);
    const price = priceOf(b.price);
    const days = daysOf(b.days);
    const minVip = vipOf(b.minVip ?? 0);
    if (kind === 'seat' && minVip) throw bad('Koltuk renginde VIP seviyesi olmaz: rengi oda sahibi odası için alır');
    const enabled = b.enabled === undefined ? true : boolOf(b.enabled, 'Açık / kapalı');
    nameFree(kind, name, null);
    if (allShopItems().filter((x) => !x.builtin).length >= SHOP_LIMITS.itemsMax) throw bad(`En fazla ${SHOP_LIMITS.itemsMax} eşya eklenebilir`);
    let art = null;
    let hole = null;
    let video = null;
    let plate = null;
    let look = null;
    let icon = null;
    let motion = null;
    let at = null;
    if (kind !== 'bubble' && kind !== 'wave' && kind !== 'seat' && b.look !== undefined) throw bad(`${KIND_NAME[kind]} için renk ve stil buradan değil, resmiyle ya da videosuyla gelir`);
    if (kind !== 'entry' && b.icon !== undefined && b.icon !== null) throw bad(`${KIND_NAME[kind]} mağazada kendi görünüşüyle durur; ikon yalnız giriş efektine eklenir`);
    if (kind !== 'frame' && b.motion !== undefined && b.motion !== null) throw bad('Hareketli hali yalnız çerçevede olur');
    if (kind === 'frame') {
      if (b.video !== undefined || b.plate !== undefined) throw bad('Çerçevenin videosu ya da isim plakası olmaz');
      art = await frameArt(b.art);
      hole = holeOf(b.hole ?? SHOP_LIMITS.holeDefault);
      at = holeAtOf(b.holeX, b.holeY, hole) ?? null;
      if (b.motion !== undefined && b.motion !== null) motion = await motionArt(b.motion);
    } else if (kind === 'entry') {
      if (b.art !== undefined || b.hole !== undefined || b.holeX !== undefined || b.holeY !== undefined) throw bad('Giriş efektinin çerçeve resmi olmaz');
      video = await videoOf(b.video ?? null);
      if (!video) throw bad('Giriş efektinin videosunu önce yükle');
      plate = plateOf(b.plate === undefined ? PLATE_DEFAULT : b.plate);
      if (b.icon !== undefined && b.icon !== null) icon = await iconArt(b.icon);
    } else if (kind === 'seat') {
      if (b.art !== undefined || b.video !== undefined || b.plate !== undefined || b.hole !== undefined || b.holeX !== undefined || b.holeY !== undefined)
        throw bad('Koltuk renginin resmi, videosu ya da plakası olmaz: yalnız rengi');
      look = seatLookOf(b.look ?? { color: SEAT_COLOR_START });
    } else {
      if (b.video !== undefined || b.plate !== undefined || b.hole !== undefined || b.holeX !== undefined || b.holeY !== undefined) throw bad(`${KIND_NAME[kind]} için video, isim plakası ya da fotoğraf alanı olmaz`);
      ({ look, art } = await lookAndArt(kind, b.look, b.art ?? null, null));
    }
    const source = video?.kind === 'source' ? video : null;
    const stacked = video?.kind === 'stacked' ? video : null;
    const id = await saving(() =>
      tx(async (c) => {
        const id = `${PREFIX[kind]}${(await c.query("SELECT nextval('shop_item_no') AS n")).rows[0].n}`;
        const r = await c.query(
          `INSERT INTO shop_items (id, kind, name, price, days, min_vip, enabled, sort, art_url, art_px, hole, video_url, video_bytes, video_ms, video_v, plate,
                                   job_status, job_source, job_fill, job_opaque, look, icon_url, icon_px, motion_url, motion_px, motion_bytes, hole_x, hole_y, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $29) RETURNING *`,
          [id, kind, name, price, days, minVip, enabled, firstSort(kind), art?.url ?? null, art?.px ?? null, hole, stacked?.url ?? null, stacked?.bytes ?? null, stacked?.ms ?? null,
            stacked?.v ?? null, plate ? JSON.stringify(plate) : null, source ? 'processing' : null, source?.url ?? null, source?.fill ?? null, source?.opaque === true,
            look ? JSON.stringify(look) : null, icon?.url ?? null, icon?.px ?? null, motion?.url ?? null, motion?.px ?? null, motion?.bytes ?? null, at?.x ?? null, at?.y ?? null, a.id],
        );
        await audited(c, a, 'shop.create', { item: id, before: null, after: auditOf(r.rows[0]) }, req);
        return id;
      }),
    );
    await refreshShopItems();
    if (source) kickJobs();
    return { item: await oneItem(id) };
  },

  /** Changes what the body names; a new picture or video replaces the old file, which is then deleted. */
  async 'POST /api/admin/shop/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const id = idOf(b.id);
    const cur = liveItem(id);
    const cols = {};
    if (b.name !== undefined) {
      cols.name = nameOf(b.name);
      nameFree(cur.kind, cols.name, id);
    }
    // Every room's free default seat color stays free, for good and on the shelf: its name and color change.
    const isDefault = cur.kind === 'seat' && id === SEAT_DEFAULT;
    if (isDefault && b.price !== undefined && Number(b.price) !== 0) throw bad(`${cur.name} her odanın ücretsiz rengidir; fiyatı olmaz`);
    if (isDefault && b.days !== undefined && Number(b.days) !== 0) throw bad(`${cur.name} her odanın rengidir; süresi olmaz`);
    if (isDefault && b.enabled === false) throw bad(`${cur.name} her odanın varsayılan rengidir; satıştan kalkmaz`);
    if (cur.kind === 'seat' && b.minVip !== undefined && Number(b.minVip) !== 0) throw bad('Koltuk renginde VIP seviyesi olmaz: rengi oda sahibi odası için alır');
    if (b.price !== undefined && !isDefault) cols.price = priceOf(b.price);
    if (b.days !== undefined && !isDefault) cols.days = daysOf(b.days);
    if (b.minVip !== undefined) cols.min_vip = vipOf(b.minVip);
    if (b.enabled !== undefined) cols.enabled = boolOf(b.enabled, 'Açık / kapalı');
    const drop = [];
    if (cur.builtin) {
      // An app's seat color is drawn from its color, so its color changes too; nothing else of the app's own.
      const visuals = ['art', 'hole', 'holeX', 'holeY', 'video', 'plate', 'look', 'icon', 'motion'].filter((k) => !(cur.kind === 'seat' && k === 'look'));
      if (visuals.some((k) => b[k] !== undefined)) throw bad('Uygulamanın kendi eşyasının görseli buradan değişmez; yeni görselle kendi eşyanı ekle');
      if (cur.kind === 'seat' && b.look !== undefined) cols.look = seatLookOf(b.look);
    } else if (cur.kind === 'seat') {
      if (['art', 'hole', 'holeX', 'holeY', 'video', 'plate', 'icon', 'motion'].some((k) => b[k] !== undefined && b[k] !== null)) throw bad('Koltuk renginin resmi, videosu ya da plakası olmaz: yalnız rengi');
      if (b.look !== undefined) cols.look = seatLookOf(b.look);
    } else if (cur.kind !== 'entry' && b.icon !== undefined && b.icon !== null) {
      throw bad(`${KIND_NAME[cur.kind]} mağazada kendi görünüşüyle durur; ikon yalnız giriş efektine eklenir`);
    } else if (cur.kind !== 'frame' && b.motion !== undefined && b.motion !== null) {
      throw bad('Hareketli hali yalnız çerçevede olur');
    } else if (cur.kind !== 'bubble' && cur.kind !== 'wave' && b.look !== undefined) {
      throw bad(`${KIND_NAME[cur.kind]} için renk ve stil buradan değil, resmiyle ya da videosuyla gelir`);
    } else if (cur.kind === 'bubble' || cur.kind === 'wave') {
      if (b.video !== undefined || b.plate !== undefined || b.hole !== undefined || b.holeX !== undefined || b.holeY !== undefined) throw bad(`${KIND_NAME[cur.kind]} için video, isim plakası ya da fotoğraf alanı olmaz`);
      if (b.look !== undefined || b.art !== undefined) {
        const next = await lookAndArt(cur.kind, b.look, b.art === undefined ? (cur.art?.url ?? null) : b.art, cur);
        cols.look = next.look;
        if ((next.art?.url ?? null) !== (cur.art?.url ?? null)) {
          Object.assign(cols, { art_url: next.art?.url ?? null, art_px: next.art?.px ?? null });
          if (cur.art) drop.push(cur.art.url);
        }
      }
    } else if (cur.kind === 'frame') {
      if (b.video !== undefined || b.plate !== undefined) throw bad('Çerçevenin videosu ya da isim plakası olmaz');
      if (b.art !== undefined && b.art !== cur.art?.url) {
        const art = await frameArt(b.art);
        Object.assign(cols, { art_url: art.url, art_px: art.px });
        if (cur.art) drop.push(cur.art.url);
      }
      if (b.hole !== undefined) cols.hole = holeOf(b.hole);
      // The hole's place: the one sent, else the one in use checked again when the hole grew (it must stay inside).
      const hole = cols.hole ?? cur.art?.hole ?? SHOP_LIMITS.holeDefault;
      const at = b.holeX !== undefined || b.holeY !== undefined ? holeAtOf(b.holeX, b.holeY, hole) : cols.hole !== undefined && cur.art?.at ? holeAtOf(cur.art.at.x, cur.art.at.y, hole) : undefined;
      if (at !== undefined) Object.assign(cols, { hole_x: at?.x ?? null, hole_y: at?.y ?? null });
      // A new moving version replaces the old file; null takes it away (the still picture alone).
      if (b.motion !== undefined && b.motion !== (cur.art?.motion?.url ?? null)) {
        const motion = b.motion === null ? null : await motionArt(b.motion);
        Object.assign(cols, { motion_url: motion?.url ?? null, motion_px: motion?.px ?? null, motion_bytes: motion?.bytes ?? null });
        if (cur.art?.motion) drop.push(cur.art.motion.url);
      }
    } else {
      if (b.art !== undefined || b.hole !== undefined || b.holeX !== undefined || b.holeY !== undefined) throw bad('Giriş efektinin çerçeve resmi olmaz');
      if (b.plate !== undefined) cols.plate = plateOf(b.plate);
      // A new icon replaces the old file; null takes it away (the shop shows the banner alone).
      if (b.icon !== undefined && b.icon !== (cur.icon?.url ?? null)) {
        const icon = b.icon === null ? null : await iconArt(b.icon);
        Object.assign(cols, { icon_url: icon?.url ?? null, icon_px: icon?.px ?? null });
        if (cur.icon) drop.push(cur.icon.url);
      }
      if (b.video === null) throw bad('Giriş efektinin videosu kaldırılamaz; yenisini yükle');
      const video = await videoOf(b.video);
      if (video?.kind === 'stacked') {
        Object.assign(cols, { video_url: video.url, video_bytes: video.bytes, video_ms: video.ms, video_v: video.v, job_status: null, job_source: null, job_error: null, job_preview: null, job_tries: 0 });
        if (cur.video) drop.push(cur.video.url);
        if (cur.job?.preview) drop.push(cur.job.preview);
      } else if (video?.kind === 'source') {
        // The video in use stays until the new one is ready (custom-gifts.mjs convertJob puts it in effect).
        Object.assign(cols, { job_status: 'processing', job_source: video.url, job_fill: video.fill, job_opaque: video.opaque === true, job_error: null, job_tries: 0, job_at: new Date() });
        if (cur.job?.preview) {
          cols.job_preview = null;
          drop.push(cur.job.preview);
        }
      }
    }
    if (!Object.keys(cols).length) throw bad('Değişecek bir şey yok');
    await saving(() =>
      tx(async (c) => {
        if (cur.builtin) await appRow(c, id, a.id);
        const before = (await c.query('SELECT * FROM shop_items WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (before.job_source && cols.job_source !== undefined && before.job_source !== cols.job_source) drop.push(before.job_source);
        const r = await setRow(c, id, cols, a.id);
        await audited(c, a, 'shop.update', { item: id, before: auditOf(before), after: auditOf(r) }, req);
      }),
    );
    removeFiles(drop.filter(Boolean));
    await refreshShopItems();
    if (cols.job_status === 'processing') kickJobs();
    return { item: await oneItem(id) };
  },

  /** One of the app's items back to the app's values (all of them but its place, or `fields`). */
  async 'POST /api/admin/shop/reset'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req);
    const id = idOf(b.id);
    if (!APP_BY_ID.has(id)) throw bad('Yalnız uygulamanın kendi eşyası orijinaline döner');
    let fields = RESET.filter((f) => f !== 'sort');
    if (b.fields !== undefined) {
      if (!Array.isArray(b.fields) || !b.fields.length || !b.fields.every((f) => RESET.includes(f))) throw bad(`Geri alınabilenler: ${RESET.join(', ')}`);
      fields = [...new Set(b.fields)];
    }
    if (fields.includes('name')) nameFree(APP_BY_ID.get(id).kind, APP_BY_ID.get(id).name, id);
    await tx(async (c) => {
      await appRow(c, id, a.id);
      const before = (await c.query('SELECT * FROM shop_items WHERE id = $1 FOR UPDATE', [id])).rows[0];
      const r = await setRow(c, id, Object.fromEntries(fields.map((f) => [COLUMN[f], null])), a.id);
      await audited(c, a, 'shop.reset', { item: id, fields, before: auditOf(before), after: auditOf(r) }, req);
    });
    await refreshShopItems();
    return { item: await oneItem(id) };
  },

  /** An admin's own item that nobody has now; its files go too. One somebody has is taken off the shelf instead. */
  async 'POST /api/admin/shop/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req);
    const id = idOf(b.id);
    if (APP_BY_ID.has(id)) throw bad('Uygulamanın kendi eşyası silinmez; satıştan kaldırmak için kapat');
    liveItem(id);
    const files = await tx(async (c) => {
      const cur = (await c.query('SELECT * FROM shop_items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!cur) throw new HttpError(404, 'Eşya bulunamadı');
      if (cur.kind === 'seat') {
        const rooms = await roomsWith(c, id);
        if (rooms) throw new HttpError(409, `Bu renk ${fmt(rooms)} odada var; silinemez. Satıştan kaldırmak için kapat (odalar süresi bitene kadar kullanır).`);
      }
      const n = (
        await c.query("SELECT count(DISTINCT user_id)::int AS n FROM entitlements WHERE sku = $1 AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now())", [id])
      ).rows[0].n;
      if (n) throw new HttpError(409, `Bu eşya ${fmt(n)} kişide var; silinemez. Satıştan kaldırmak için kapat (sahipleri kullanmaya devam eder).`);
      await c.query("UPDATE shop_items SET deleted_at = now(), job_status = NULL, job_source = NULL, rev = nextval('shop_item_rev'), updated_by = $2, updated_at = now() WHERE id = $1", [id, a.id]);
      await audited(c, a, 'shop.delete', { item: id, before: auditOf(cur), after: null }, req);
      return [cur.art_url, cur.video_url, cur.job_source, cur.job_preview, cur.icon_url, cur.motion_url];
    });
    removeFiles(files.filter(Boolean));
    await refreshShopItems();
    return { deleted: true };
  },

  /** The shop's order of one kind: `ids` is every item of it, first to last. */
  async 'POST /api/admin/shop/order'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 16_384);
    const kind = kindOf(b.kind);
    const now = allShopItems().filter((x) => x.kind === kind).map((x) => x.sku);
    const ids = Array.isArray(b.ids) ? b.ids : [];
    if (ids.length !== now.length || new Set(ids).size !== ids.length || !ids.every((id) => now.includes(id))) throw bad('Sıra, bu türün bütün eşyalarını bir kez içermeli');
    await tx(async (c) => {
      for (const [i, id] of ids.entries()) {
        if (APP_BY_ID.has(id)) await appRow(c, id, a.id);
        await c.query("UPDATE shop_items SET sort = $2, rev = nextval('shop_item_rev'), updated_by = $3, updated_at = now() WHERE id = $1", [id, i, a.id]);
      }
      await audited(c, a, 'shop.order', { kind, before: now, after: ids }, req);
    });
    await refreshShopItems();
    return { items: await adminItems() };
  },
};
