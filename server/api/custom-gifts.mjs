// Yönetim › Hediyeler: gifts the admins add, change, take down and order from the panel, with no app update
// (docs/HEDIYE_YONETIMI.md), and the app's own gifts (catalog.mjs GIFTS, in step with the app) changed the same way:
// name, emoji, price, shelf, VIP level, order, on the shelves or not, icon and video, each back to the app's value at
// will. Both live in the custom_gifts table (066, 069): an admin's gift is a row of its own ('a' and a number); a row
// with a compiled gift's id (builtin) holds only what was changed about it, every NULL column "as in the app".
//
//   GET  /api/admin/gifts[?builtin=1]                      → { gifts, limits, convert, storage }  (builtin=1: the app's own too)
//   POST /api/admin/gifts        { name, price, cat, minSvip?, emoji?, enabled?, icon, video? } → { gift }
//   POST /api/admin/gifts/update { id, …any of the above; video: null takes it off }        → { gift }
//        an app's own gift too: icon: null gives it the app's picture again, video: null stops its video
//   POST /api/admin/gifts/reset  { id, fields? }           → { gift }   an app's own gift back to the app's values
//        (fields: any of name, emoji, price, cat — with its VIP level —, enabled, sort, icon, video; none: all)
//   POST /api/admin/gifts/delete { id }                    → { deleted }  (an admin's gift; the app's own can't go)
//   POST /api/admin/gifts/order  { ids }                   → { gifts }   (each id's place: its index; lower first)
//   POST /api/admin/gifts/fetch  { slot: 'icon'|'video', url } → { url, link, kind, type, bytes, video, svga }
//        a file from a link the admin pasted, downloaded once here and stored as if uploaded (fetchRoute below);
//        create and update take iconLink / videoLink with it, so the panel can fetch the same link again.
//   GET|HEAD /api/fx/g/<id>.mp4                            → a gift's stacked video (sendCustomFx, public)
//
// The app's own gifts in older apps: they draw the compiled name, picture and price whatever the server says, so a
// gift whose price was changed is left out of their catalog (a newer app asks for ?gifts=2) and refused from them at
// send (checkShownPrice: a newer app sends the price it showed, 409 price_changed when it moved meanwhile). A replaced
// video reaches every app since the admins' gifts came (preview with /api/fx/g/); a gift put back on the shelves only
// the apps that trust the server's list (gifts=2) show, the others keep the compiled pause list (catalog.mjs).
//
// Admins only; every change is an audit_events row (who, what, before and after, from where). `icon` and `video.url`
// are files uploaded first (media.mjs kinds gifticon, giftvideo, giftsource). video: { url, kind: 'stacked' } is a
// ready stacked MP4 (colour in the top half, alpha below, docs/SEFFAF_VIDEO_POC.md), checked and used as it is;
// { url, kind: 'source', fill? } a transparent WebM (VP8/VP9 alpha), a ProRes 4444 .mov or an SVGA 2.x animation that
// this server turns into one in the background (ffmpeg; an SVGA through tools/svga-to-fx.py, `fill` its size on the
// screen), one at a time; the video in effect stays until the new one is done. Nothing here removes a background: a
// source without transparency is refused, and the panel says so.
//
// What the phones get: GET /api/catalog lists every gift on the shelves in the shelves' order (catalogGifts: an
// admin's with icon, emoji, custom: true; the app's own with what was changed, an icon only when it was replaced) and
// the videos in `fx`, the replaced and the admins' at /api/fx/g/<id>.mp4?v=… (giftFx; fx.mjs leaves out the app's
// clips that were replaced or stopped, replacedClips). An app older than the admins' gifts shows only the gifts
// compiled into it, and its fx filter refuses that address, so it never downloads a clip it can't use. The catalog's
// and /api/config's `v` add customGiftsRev(), so a change here makes the phones read the catalog again. A gift is
// sent at this server's price like any other (gifts.mjs, lucky-bags.mjs giftOf).
//
// The table is kept in memory (refreshCustomGifts after every change here, and every CUSTOM_GIFTS_POLL_MS for
// another process's). FFMPEG / FFPROBE / PYTHON: the programs (default ffmpeg, ffprobe, python3 with numpy and
// Pillow; the Dockerfile installs them).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { artUrl } from './art.mjs';
import { BOND_GIFTS, GIFTS, GIFTS_PAUSED } from './catalog.mjs';
import { HttpError, auth, clientIp, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { FX_PATH, giftClip, mp4Duration } from './fx.mjs';
import { panelDetail } from './panel.mjs';
import { download, linkOf } from './link-fetch.mjs';
import { downloadStored, keyOf, kindMax, readStored, removeFiles, sendFile, storageOn, storeFile, storedUrl, verifyUpload, writeStored } from './media.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.CUSTOM_GIFTS_POLL_MS, 5000);
const FFMPEG = env.FFMPEG || 'ffmpeg';
const FFPROBE = env.FFPROBE || 'ffprobe';
const PYTHON = env.PYTHON || 'python3';
const SVGA_TOOL = path.join(import.meta.dirname, 'tools', 'svga-to-fx.py');
const ICON_TOOL = path.join(import.meta.dirname, 'tools', 'icon-fit.py');
const FRAME_TOOL = path.join(import.meta.dirname, 'tools', 'svga-to-webp.py');
/** A conversion that fails for no reason of the file's own (storage, a restart) is tried this many times. */
const MAX_TRIES = 3;

export const CATS = ['hot', 'couple', 'family', 'gameplay', 'privilege'];
/** The rules the panel shows and every save checks. */
export const LIMITS = Object.freeze({
  nameMin: 2,
  nameMax: 24,
  priceMax: 1_000_000,
  svipMax: 10,
  iconBytes: kindMax('gifticon'),
  iconMinPx: 128,
  iconMaxPx: 4096,
  // What phones get: a bigger icon is made smaller here (checkIcon, tools/icon-fit.py).
  iconServePx: 1024,
  iconServeBytes: 1024 * 1024,
  videoBytes: kindMax('giftvideo'),
  sourceBytes: kindMax('giftsource'),
  svgaBytes: kindMax('giftsource', 'application/x-svga'),
  videoMinMs: 1000,
  videoMaxMs: 15_000,
  // What a source becomes: the size the phones show (stacked: twice as high), as the compiled clips (server/api/fx).
  width: 540,
  height: 960,
  fps: 20,
  // An SVGA's size on the screen (the share of the frame its canvas takes): the whole screen, as the app's own gift
  // videos, unless the admin picks a smaller one.
  fills: [0.45, 0.6, 0.8, 1],
  fill: 1,
});
/** An admin's gift's id; the app's own are catalog.mjs GIFTS keys (g1, h15, c13, v12, …, never 'a'). */
const ID = /^a[0-9]{1,9}$/;
const fmt = (n) => n.toLocaleString('tr-TR');
const mb = (n) => (n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const lower = (s) => s.toLocaleLowerCase('tr');
/** Where an app's gift sits on its shelf until someone moves it: after the admins' own, in the app's order. */
const APP_SORT = new Map([...GIFTS.keys()].map((id, i) => [id, 1000 + i]));
const num = (v) => (v === null || v === undefined ? null : Number(v));

// --- The table in memory -----------------------------------------------------------------------------------
/** rev: the largest custom_gifts.rev (0: none yet); rows: id → the row as the rest of the server reads it. */
let snap = { rev: 0, rows: new Map() };

/** A row as it is stored; on an app's gift (builtin) every null is "as in the app". */
const viewOf = (r) =>
  Object.freeze({
    id: r.id,
    builtin: r.builtin === true,
    name: r.name,
    emoji: r.emoji,
    price: num(r.price),
    cat: r.cat,
    minSvip: num(r.min_svip),
    sort: num(r.sort),
    enabled: r.enabled,
    deleted: !!r.deleted_at,
    icon: r.icon_url,
    video: r.video_url ? Object.freeze({ url: r.video_url, bytes: Number(r.video_bytes), ms: Number(r.video_ms ?? 0), v: r.video_v }) : null,
    videoOff: r.video_off === true,
    job: r.job_status ?? null,
    updatedAt: r.updated_at ?? null,
  });

/** Reads the table again (never back to an older copy). */
export async function refreshCustomGifts(q = db) {
  const r = await q.query('SELECT * FROM custom_gifts ORDER BY sort, length(id), id');
  const rev = r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0);
  if (rev >= snap.rev) snap = { rev, rows: new Map(r.rows.map((x) => [x.id, viewOf(x)])) };
  return snap;
}

let timer = null;
/** Picks up another process's changes, and goes on with a conversion a restart cut off. */
export function startCustomGifts() {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query(
        "SELECT coalesce(max(rev), 0) AS rev, count(*) FILTER (WHERE job_status = 'processing') AS jobs, count(*) FILTER (WHERE video_enlarge IS NOT NULL) AS enlarge FROM custom_gifts",
      );
      if (Number(r.rows[0].rev) !== snap.rev) await refreshCustomGifts();
      if (Number(r.rows[0].jobs) > 0 || Number(r.rows[0].enlarge) > 0) kickJobs();
    } catch (e) {
      console.error('custom gifts sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
  kickJobs();
}
export function stopCustomGifts() {
  clearInterval(timer);
  timer = null;
}

/** Added to the live settings' version in the catalog and /api/config: grows with every change a phone should see. */
export const customGiftsRev = () => snap.rev;

/**
 * An app's own gift as it is now: the app's values (catalog.mjs GIFTS) with what the admins changed (`o`, its row as
 * viewOf reads it, or null). `icon` and `video` are only the replaced ones (null: the app's own picture, and its own
 * clip unless videoOff).
 */
function appGiftOf(base, o) {
  const cat = o?.cat ?? base.cat;
  return {
    id: base.id,
    builtin: true,
    name: o?.name ?? base.name,
    emoji: o?.emoji ?? base.emoji,
    price: o?.price ?? base.price,
    cat,
    minSvip: cat === 'privilege' ? Math.max(1, o?.minSvip ?? base.minSvip) : 0,
    sort: o?.sort ?? APP_SORT.get(base.id),
    enabled: o?.enabled ?? !GIFTS_PAUSED.has(base.id),
    icon: o?.icon ?? null,
    video: o?.video ?? null,
    videoOff: !!o?.videoOff,
  };
}
/** One of the app's gifts as it is now (appGiftOf); undefined for an id that isn't one of them. */
export function builtinGift(id) {
  const base = typeof id === 'string' ? GIFTS.get(id) : undefined;
  return base ? appGiftOf(base, snap.rows.get(id) ?? null) : undefined;
}
/** An admin's gift as the rest of this module reads it. */
const customGift = (r) => ({ ...r, builtin: false, videoOff: false });

const CAT_ORDER = (cat) => CATS.indexOf(cat);
/** The shelves' order: shelf, place on it, an admin's before the app's at the same place, then the older first. */
const byShelf = (a, b) =>
  CAT_ORDER(a.cat) - CAT_ORDER(b.cat) || a.sort - b.sort || Number(a.builtin) - Number(b.builtin) || (APP_SORT.get(a.id) ?? 0) - (APP_SORT.get(b.id) ?? 0) || a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

let memo = { snap: null, all: [] };
/** Every gift that isn't deleted, as it is now (the admins' and the app's own), in the shelves' order. */
export function allGifts() {
  if (memo.snap !== snap) {
    const all = [...[...snap.rows.values()].filter((r) => !r.builtin && !r.deleted).map(customGift), ...[...GIFTS.keys()].map(builtinGift)];
    memo = { snap, all: all.sort(byShelf) };
  }
  return memo.all;
}
/** The gifts on the shelves now, in their order. */
const listed = () => allGifts().filter((g) => g.enabled);

/**
 * A gift that may be sent now, at this server's price: an app's own one (as changed in the panel; also while it is off
 * the shelves, as the app's paused gifts always were: an older app or Çantam may still send it), or an admin's that is
 * on the shelves ({ id, name, price, cat, minSvip, emoji, custom: true }). Undefined for anything else.
 */
export function giftOf(id) {
  // A bond gift goes as a bond request (bonds.mjs), which holds its coins until the other person answers.
  if (typeof id !== 'string' || BOND_GIFTS.has(id)) return undefined;
  const app = builtinGift(id);
  if (app) return { id, name: app.name, emoji: app.emoji, price: app.price, cat: app.cat, minSvip: app.minSvip, builtin: true };
  const g = snap.rows.get(id);
  return g && !g.builtin && g.enabled && !g.deleted ? { id: g.id, name: g.name, emoji: g.emoji, price: g.price, cat: g.cat, minSvip: g.minSvip, custom: true } : undefined;
}
/** A gift's name now, a taken-down or deleted one's too (history lines, Şanslı çanta); null when nothing has this id. */
export const giftNameOf = (id) => builtinGift(id)?.name ?? snap.rows.get(id)?.name ?? null;
/** Every admin's gift that isn't deleted (the profile's Vitrin counts them; the app's own it counts anyway). */
export const customGiftIds = () => [...snap.rows.values()].filter((g) => !g.builtin && !g.deleted).map((g) => g.id);

/**
 * The price a phone showed for `gift` (a newer app sends it with the gift, `shown`): a gift whose price changed since
 * the phone read the catalog is refused and nothing moves (409 price_changed with the price now; the phone reads the
 * catalog again). An older app sends none and shows the app's own price: one of the app's gifts whose price was
 * changed in the panel is refused there (409 update_required). An admin's gift has no price of the app's.
 */
export function checkShownPrice(gift, shown) {
  if (shown !== undefined && shown !== null) {
    if (shown === gift.price) return;
    throw Object.assign(new HttpError(409, `${gift.name} hediyesinin fiyatı değişti: artık ${fmt(gift.price)} jeton. Yeni fiyatı görüp yeniden gönder.`), {
      extra: { code: 'price_changed', giftId: gift.id, price: gift.price },
    });
  }
  const base = GIFTS.get(gift.id);
  if (base && base.price !== gift.price) {
    throw Object.assign(new HttpError(409, `${gift.name} hediyesinin fiyatı değişti. Göndermek için uygulamayı güncelle.`), { extra: { code: 'update_required' } });
  }
}

/**
 * GET /api/catalog `gifts`: every gift on the shelves, in the shelves' order. An admin's: { id, name, price, cat,
 * minSvip, emoji, icon, custom: true } (an older app skips it); the app's own: { id, name, emoji, price, cat, minSvip }
 * as changed, and `icon` when it was replaced (an app reading gifts=2 draws these; an older one only takes the id).
 * `app2`: the phone reads it all (?gifts=2); otherwise the app's gifts whose price was changed are left out, since
 * that app would show its own price. `family`: the phone has the Aile ve Dost shelf (?family=1); an older one gets no
 * bond gifts and sees that shelf's other gifts on İkili, where Koruma Kartı was.
 */
export function catalogGifts({ app2 = false, hidden = new Set(), family = false } = {}) {
  const out = [];
  for (const g of listed()) {
    const cat = family || g.cat !== 'family' ? g.cat : 'couple';
    if (g.builtin) {
      if (hidden.has(g.id) || (!family && BOND_GIFTS.has(g.id)) || (!app2 && g.price !== GIFTS.get(g.id).price)) continue;
      out.push({ id: g.id, name: g.name, emoji: g.emoji, price: g.price, cat, minSvip: g.minSvip, ...(g.icon ? { icon: g.icon } : {}) });
    } else out.push({ id: g.id, name: g.name, price: g.price, cat, minSvip: g.minSvip, emoji: g.emoji, icon: g.icon, custom: true });
  }
  return out;
}
const fxUrl = (id, v) => `${FX_PATH}g/${id}.mp4?v=${v}`;
/**
 * GET /api/catalog `fx`, next to fx.mjs's list: the admins' gifts' videos (those on the shelves) and the videos the
 * app's own gifts were given instead of theirs (on the shelves or not: they can still be sent), at this server.
 */
export const giftFx = (hidden = new Set(), family = false) =>
  allGifts()
    .filter((g) => g.video && !hidden.has(g.id) && (g.builtin || g.enabled) && (family || !BOND_GIFTS.has(g.id)))
    .map((g) => ({ kind: 'gift', id: g.id, url: fxUrl(g.id, g.video.v), bytes: g.video.bytes, ms: g.video.ms }));
/** The app's gifts whose own clip (fx.mjs) isn't played: given another video, or stopped. fx.mjs leaves them out. */
export const replacedClips = () => new Set([...snap.rows.values()].filter((r) => r.builtin && (r.video || r.videoOff)).map((r) => r.id));

/** GET or HEAD /api/fx/g/<id>.mp4: the gift's stacked video from the storage (a taken-down one's too, for the panel's preview). */
export async function sendCustomFx(req, res, name) {
  const m = /^([a-z][a-z0-9-]{0,31})\.mp4$/.exec(name);
  const g = m ? snap.rows.get(m[1]) : null;
  const key = g && !g.deleted && g.video ? keyOf(g.video.url) : null;
  if (!key) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  await sendFile(req, res, key);
}

// --- Checking the files ------------------------------------------------------------------------------------
/** A refusal about the file itself, shown to the admin as it is (a conversion that ends with one is not tried again). */
class FileError extends Error {
  /** `preview`: what came out (a stacked MP4) when the file converted but can't be used, so the panel can show it. */
  constructor(message, preview = null) {
    super(message);
    this.preview = preview;
  }
}

/**
 * A PNG's or WebP's size, whether it can be transparent and whether it moves (an animated WebP, an APNG), from its
 * first bytes; null for anything else.
 */
export function imageInfo(b) {
  if (b.length >= 33 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') {
    const type = b[25];
    // Grey + alpha, RGBA, or a palette / colour key with a tRNS chunk before the pixels; an APNG's acTL comes before
    // them too.
    let alpha = type === 4 || type === 6;
    let animated = false;
    for (let p = 8; p + 8 <= b.length; ) {
      const len = b.readUInt32BE(p);
      const name = b.toString('latin1', p + 4, p + 8);
      if (name === 'tRNS') alpha = true;
      if (name === 'acTL') animated = true;
      if (name === 'IDAT' || name === 'IEND') break;
      p += 12 + len;
    }
    return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha, animated };
  }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return { type: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), alpha: (b[20] & 0x10) !== 0, animated: (b[20] & 0x02) !== 0 };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b.readUInt32LE(21);
      return { type: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff), alpha: ((bits >>> 28) & 1) === 1, animated: false };
    }
    if (chunk === 'VP8 ' && b.readUIntBE(23, 3) === 0x9d012a) return { type: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, alpha: false, animated: false };
  }
  return null;
}

let pillow;
const canFitIcon = () => (pillow ??= run(PYTHON, ['-I', '-c', 'import PIL'], { timeout: 20_000 }).then((r) => r.code === 0 && fs.existsSync(ICON_TOOL)));

/**
 * The icon at `url`: uploaded as a gift icon, a transparent PNG or WebP, square or nearly, 128–4096 px, up to 10 MB.
 * Phones load every icon of the gift panel, so one bigger than they need (over 1024 px or 1 MB) is made smaller here
 * (tools/icon-fit.py: an optimised PNG, transparency kept). { url: the icon to keep, upload: the file it replaced,
 * to remove once the gift is saved (null: kept as uploaded) }.
 */
async function checkIcon(url) {
  const key = keyOf(url);
  if (!key?.startsWith('gifticon/')) throw new HttpError(400, 'İkonu önce yükle');
  await verifyUpload(url, 'gifticon');
  // A stand-in storage (most tests) has nothing to read.
  if (env.UPLOAD_VERIFY === '0') return { url, upload: null };
  const buf = await readStored(key, LIMITS.iconBytes);
  const info = imageInfo(buf);
  if (!info) throw new HttpError(400, 'İkon PNG ya da WebP olmalı');
  const { width: w, height: h } = info;
  if (Math.min(w, h) < LIMITS.iconMinPx || Math.max(w, h) > LIMITS.iconMaxPx) throw new HttpError(400, `İkon ${LIMITS.iconMinPx}–${LIMITS.iconMaxPx} piksel olmalı (bu ${w} × ${h})`);
  if (Math.max(w, h) / Math.min(w, h) > 1.25) throw new HttpError(400, `İkon kare olmalı (bu ${w} × ${h})`);
  if (!info.alpha) throw new HttpError(400, 'İkon saydam olmalı: arka planı silinmiş PNG ya da WebP yükle');
  if (buf.length <= LIMITS.iconServeBytes && Math.max(w, h) <= LIMITS.iconServePx) return { url, upload: null };
  return { url: await fitPicture(buf, key, { maxPx: LIMITS.iconServePx, maxBytes: LIMITS.iconServeBytes, what: 'İkon', size: `${w} × ${h}` }), upload: url };
}

/**
 * A stored picture (`buf`, at storage key `key`) made small enough for phones: at most `maxPx` on its longer side and
 * `maxBytes` (tools/icon-fit.py: an optimised PNG, transparency kept), stored beside the upload under the same folder.
 * Resolves with its address; a 400 in Turkish when it can't (no Pillow here, unreadable, too detailed). Also used by
 * Yönetim › Mağaza (shop-items.mjs) for entry effect icons and wave sparks.
 */
export async function fitPicture(buf, key, { maxPx, maxBytes, what, size = '' }) {
  const big = `${what} en fazla ${maxPx} piksel ve ${maxBytes >= 1024 * 1024 ? `${mb(maxBytes)} MB` : `${Math.round(maxBytes / 1024)} KB`} olabilir`;
  if (!(await canFitIcon())) throw new HttpError(400, `${big}${size ? ` (bu ${size})` : ''}: bu sunucu küçültemiyor`);
  const small = await temp(async (dir) => {
    const input = path.join(dir, 'icon');
    const output = path.join(dir, 'small.png');
    await fs.promises.writeFile(input, buf);
    const r = await run(PYTHON, ['-I', ICON_TOOL, input, output, '--max-px', String(maxPx), '--max-bytes', String(maxBytes)], { timeout: 60_000, keep: 4096, nice: true });
    if (r.code !== 0) {
      console.error('picture fit', r.code, r.err.slice(-300));
      throw new HttpError(400, /too detailed/.test(r.err) ? `${big}: bu resim küçültünce de çok büyük kalıyor, daha sade bir resim yükle` : `${what} okunamadı: PNG ya da WebP olmalı`);
    }
    return fs.promises.readFile(output);
  });
  // Under the uploader's folder, like every stored file (media.mjs FILE_KEY).
  const [kind, folder] = key.split('/');
  const smallKey = `${kind}/${folder}/${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}.png`;
  return writeStored(smallKey, small, 'image/png');
}

/** Runs a program; resolves with its exit code, its stdout (up to `keep` bytes) and the end of its stderr. Never through a shell. */
function run(cmd, args, { timeout = 60_000, keep = 1 << 20, nice = false } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      return resolve({ code: -1, out: Buffer.alloc(0), err: String(e?.message ?? e) });
    }
    // Conversions give way to the API's own work.
    if (nice && child.pid) {
      try {
        os.setPriority(child.pid, 10);
      } catch {}
    }
    const out = [];
    let size = 0;
    let err = '';
    child.stdout.on('data', (d) => {
      if (size < keep) out.push(d);
      size += d.length;
    });
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', (e) => {
      clearTimeout(t);
      resolve({ code: -1, out: Buffer.alloc(0), err: String(e?.message ?? e) });
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code: code ?? -1, out: Buffer.concat(out).subarray(0, keep), err });
    });
  });
}

let tools = null;
/** Whether ffmpeg and ffprobe run here (asked once). */
export const canConvert = () => (tools ??= Promise.all([run(FFMPEG, ['-version'], { timeout: 10_000 }), run(FFPROBE, ['-version'], { timeout: 10_000 })]).then(([a, b]) => a.code === 0 && b.code === 0));
let python = null;
/** Whether an SVGA can be converted here: ffmpeg, and Python with numpy and Pillow for tools/svga-to-fx.py (asked once). */
export const canSvga = () =>
  (python ??= Promise.all([canConvert(), run(PYTHON, ['-I', '-c', 'import numpy, PIL'], { timeout: 20_000 })]).then(([ff, py]) => ff && py.code === 0 && fs.existsSync(SVGA_TOOL)));

/** ffprobe's streams and format of `file`; a FileError when it can't read it. */
async function probe(file) {
  const r = await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:stream_tags:format=duration', '-of', 'json', file], { timeout: 30_000 });
  let j = null;
  try {
    j = r.code === 0 ? JSON.parse(r.out.toString('utf8')) : null;
  } catch {}
  if (!j?.streams) throw new FileError('Video okunamadı: dosya bozuk ya da bu biçim desteklenmiyor');
  return j;
}

const MATTE_PX = 64;
/**
 * The bottom half of a stacked video, five frames a second shrunk to 64 × 64: the darkest grey in it (a transparent
 * part is dark: 16 in TV range) and how far its colour strays from grey (an alpha mask has none). Null when unreadable.
 */
export async function matteOf(file) {
  const plane = MATTE_PX * MATTE_PX;
  const frame = plane * 3;
  const r = await run(FFMPEG, ['-v', 'error', '-i', file, '-an', '-vf', `crop=iw:ih/2:0:ih/2,fps=5,scale=${MATTE_PX}:${MATTE_PX}:flags=area,format=yuv444p`, '-f', 'rawvideo', 'pipe:1'], {
    timeout: 120_000,
    keep: 400 * frame,
  });
  if (r.code !== 0 || r.out.length < frame) return null;
  const px = r.out;
  let ymin = 255;
  let chroma = 0;
  for (let f = 0; f + frame <= px.length; f += frame) {
    for (let i = 0; i < plane; i++) {
      if (px[f + i] < ymin) ymin = px[f + i];
      chroma = Math.max(chroma, Math.abs(px[f + plane + i] - 128), Math.abs(px[f + 2 * plane + i] - 128));
    }
  }
  return { ymin, chroma };
}
/** A mask that is grey (not a picture) but nowhere transparent: the background was never removed. */
const OPAQUE = 128;
const NOT_GREY = 16;
const EXPORT_HINT = 'Arka plan katmanını kapatıp ProRes 4444 + Alpha (.mov) ya da saydam WebM dışa aktarın';
const FULL_HINT = 'arka planıyla tam ekran oynasın istiyorsanız "Arka planlı tam ekran"ı seçin.';
const OPAQUE_TEXT = `Videonun hiçbir yeri saydam değil, odada kutu gibi görünür. ${EXPORT_HINT}; ${FULL_HINT}`;
const NO_ALPHA_TEXT = `Bu videoda saydamlık (alfa kanalı) yok, odada kutu gibi görünür. ${EXPORT_HINT}; ${FULL_HINT}`;
const SVGA_OPAQUE_TEXT = `SVGA’nın hiçbir yeri saydam değil (arka plan görseli var), odada kutu gibi görünür. Animasyonu arka plan katmanı olmadan dışa aktarın; ${FULL_HINT}`;

const temp = async (fn) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'similar-gift-'));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};
const sha12 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const seconds = (ms) => (ms / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/**
 * A ready stacked MP4 at `url`: 1–15 s, and where ffmpeg runs here, H.264 with its bottom half a grey mask that is
 * transparent somewhere. Returns what the fx list needs: { url, bytes, ms, v }.
 */
async function checkStacked(url, { opaque = false } = {}) {
  const key = keyOf(url);
  if (!key?.startsWith('giftvideo/')) throw new HttpError(400, 'Videoyu önce yükle');
  await verifyUpload(url, 'giftvideo');
  const buf = await readStored(key, LIMITS.videoBytes);
  const ms = mp4Duration(buf);
  if (!ms) throw new HttpError(400, 'Video okunamadı: MP4 olmalı');
  if (ms < LIMITS.videoMinMs || ms > LIMITS.videoMaxMs) throw new HttpError(400, `Video ${seconds(LIMITS.videoMinMs)}–${seconds(LIMITS.videoMaxMs)} saniye olmalı (bu ${seconds(ms)} sn)`);
  if (await canConvert()) {
    await temp(async (dir) => {
      const file = path.join(dir, 'video.mp4');
      await fs.promises.writeFile(file, buf);
      let v;
      try {
        v = (await probe(file)).streams.find((s) => s.codec_type === 'video');
      } catch (e) {
        throw e instanceof FileError ? new HttpError(400, e.message) : e;
      }
      if (!v) throw new HttpError(400, 'Videoda görüntü yok');
      if (v.codec_name !== 'h264') throw new HttpError(400, `Video H.264 olmalı (bu ${v.codec_name})`);
      const ratio = v.height / v.width;
      if (!(ratio >= 1.9 && ratio <= 4.5) || v.width > 1080 || v.height % 2) {
        throw new HttpError(400, `Video yığılmış biçimde değil (${v.width} × ${v.height}): üst yarı renk, alt yarı alfa olmalı, ör. 540 × 1920`);
      }
      const m = await matteOf(file);
      if (!m) throw new HttpError(400, 'Video okunamadı');
      if (m.chroma > NOT_GREY) throw new HttpError(400, 'Alt yarı alfa maskesi değil (renkli görüntü var): video yığılmış biçimde değil');
      if (m.ymin > OPAQUE && !opaque) throw new HttpError(400, OPAQUE_TEXT);
    });
  }
  return { url, bytes: buf.length, ms, v: sha12(buf) };
}

/** A transparent source to convert: uploaded as one, and this server can convert. */
async function checkSource(url, fill) {
  const key = keyOf(url);
  if (!key?.startsWith('giftsource/')) throw new HttpError(400, 'Kaynak videoyu önce yükle');
  const svga = key.endsWith('.svga');
  if (!(await (svga ? canSvga() : canConvert()))) throw new HttpError(400, `Bu sunucu ${svga ? 'SVGA' : 'video'} çeviremiyor: hazır yığılmış MP4 yükle`);
  if (fill !== undefined && fill !== null && !(svga && LIMITS.fills.includes(fill))) throw new HttpError(400, `Boyut yalnız SVGA için: ${LIMITS.fills.map((f) => `%${f * 100}`).join(', ')}`);
  await verifyUpload(url, 'giftsource');
  return { url, fill: svga ? (fill ?? LIMITS.fill) : null };
}

/**
 * An SVGA's header, read here before the converter runs (bounded, with clear refusals): its size, frame rate and
 * frames. SVGA 2.x is a zlib-compressed protobuf (MovieEntity: 2 params, 3 images); 1.x (a zip) isn't read.
 */
export function svgaInfo(buf, { minMs = LIMITS.videoMinMs } = {}) {
  if (buf.subarray(0, 2).toString('latin1') === 'PK') throw new FileError('SVGA 1.x okunmuyor: animasyonu SVGA 2.x olarak dışa aktar');
  let b;
  try {
    b = zlib.inflateSync(buf, { maxOutputLength: 512 * 1024 * 1024 });
  } catch {
    throw new FileError('SVGA okunamadı: dosya bozuk ya da SVGA değil');
  }
  const p = { w: 0, h: 0, fps: 0, frames: 0, images: 0, sounds: 0 };
  try {
    const varint = (x) => {
      let n = 0;
      let s = 0;
      let c;
      do {
        c = x.buf[x.i++];
        n += (c & 0x7f) * 2 ** s;
        s += 7;
      } while (c & 0x80 && s < 64);
      return n;
    };
    const fields = (buf2, fn) => {
      const x = { buf: buf2, i: 0 };
      while (x.i < buf2.length) {
        const key = varint(x);
        const f = Math.floor(key / 8);
        const wt = key & 7;
        if (wt === 0) fn(f, varint(x));
        else if (wt === 1) x.i += 8;
        else if (wt === 2) {
          const n = varint(x);
          fn(f, buf2.subarray(x.i, x.i + n));
          x.i += n;
        } else if (wt === 5) {
          fn(f, buf2.subarray(x.i, x.i + 4));
          x.i += 4;
        } else throw new Error('wire type');
        if (x.i > buf2.length) throw new Error('short');
      }
    };
    fields(b, (f, v) => {
      if (f === 2 && Buffer.isBuffer(v)) {
        fields(v, (pf, pv) => {
          if (pf === 1 && Buffer.isBuffer(pv)) p.w = pv.readFloatLE(0);
          if (pf === 2 && Buffer.isBuffer(pv)) p.h = pv.readFloatLE(0);
          if (pf === 3 && typeof pv === 'number') p.fps = pv;
          if (pf === 4 && typeof pv === 'number') p.frames = pv;
        });
      }
      if (f === 3) p.images++;
      if (f === 5) p.sounds++;
    });
  } catch {
    throw new FileError('SVGA okunamadı: dosya bozuk ya da SVGA değil');
  }
  if (!(p.w >= 1 && p.w <= 4096 && p.h >= 1 && p.h <= 4096) || !p.frames || !p.images) throw new FileError('SVGA okunamadı: boyutu ya da kareleri eksik');
  const fps = p.fps || 20;
  if (fps > 60) throw new FileError(`SVGA saniyede en çok 60 kare olabilir (bu ${p.fps})`);
  const ms = Math.round((p.frames / fps) * 1000);
  if (ms > LIMITS.videoMaxMs + 500) throw new FileError(`Video en çok ${seconds(LIMITS.videoMaxMs)} saniye olabilir (bu ${seconds(ms)} sn)`);
  if (ms < minMs) throw new FileError(`Video en az ${seconds(minMs)} saniye olmalı`);
  return { ...p, fps, ms };
}

/** The stacked MP4 made from the SVGA at `input` by tools/svga-to-fx.py (its own sound kept): { buf, ms }. */
async function convertSvga(input, dir, fill, { opaque = false } = {}) {
  // Read whole here and by the converter: never one bigger than an SVGA may be uploaded.
  const size = (await fs.promises.stat(input)).size;
  if (size > LIMITS.svgaBytes) throw new FileError(`SVGA en fazla ${mb(LIMITS.svgaBytes)} MB olabilir (bu ${mb(size)} MB)`);
  svgaInfo(await fs.promises.readFile(input));
  const output = path.join(dir, 'stacked.mp4');
  const r = await run(PYTHON, ['-I', '-X', 'utf8', SVGA_TOOL, input, output, '--fill', String(fill)], { timeout: 10 * 60_000, keep: 0, nice: true });
  if (r.code !== 0) {
    console.error('gift svga', r.code, r.err.slice(-400));
    if (/nothing visible/.test(r.err)) throw new FileError('SVGA’da görünen bir şey yok');
    throw new FileError('SVGA çevrilemedi: dosya bozuk ya da desteklenmeyen bir özellik var');
  }
  return stackedResult(output, SVGA_OPAQUE_TEXT, { opaque });
}

/**
 * A shop frame from the SVGA uploaded at `url` (tools/svga-to-webp.py): its still PNG and animated WebP, at most
 * `maxBytes`. The phones play the WebP; no SVGA player is needed. { still, motion, px }.
 */
export async function svgaFrame(url, maxBytes) {
  const key = keyOf(url);
  if (!key?.startsWith('giftsource/') || !key.endsWith('.svga')) throw new HttpError(400, 'SVGA dosyasını önce yükle');
  if (!(await canSvga()) || !fs.existsSync(FRAME_TOOL)) throw new HttpError(400, 'Bu sunucu SVGA çeviremiyor: hareketli WebP yükle');
  await verifyUpload(url, 'giftsource');
  return temp(async (dir) => {
    const [input, still, motion] = ['frame.svga', 'still.png', 'motion.webp'].map((f) => path.join(dir, f));
    await downloadStored(key, input, LIMITS.svgaBytes);
    try {
      svgaInfo(await fs.promises.readFile(input), { minMs: 100 });
    } catch (e) {
      throw e instanceof FileError ? new HttpError(400, e.message) : e;
    }
    const r = await run(PYTHON, ['-I', '-X', 'utf8', FRAME_TOOL, input, still, motion, '--max-bytes', String(maxBytes)], { timeout: 4 * 60_000, keep: 4096, nice: true });
    if (r.code !== 0) {
      console.error('frame svga', r.code, r.err.slice(-300));
      if (/nothing visible/.test(r.err)) throw new HttpError(400, 'SVGA’da görünen bir şey yok');
      if (/no transparency/.test(r.err)) throw new HttpError(400, 'SVGA’nın hiçbir yeri saydam değil: çerçevenin ortası ve çevresi saydam olmalı');
      if (/not animated/.test(r.err)) throw new HttpError(400, 'SVGA’da hareket yok: durağan çerçeve için PNG yükle');
      if (/too big/.test(r.err)) throw new HttpError(400, 'SVGA küçültünce de çok büyük kalıyor: daha kısa ya da sade bir animasyon yükle');
      throw new HttpError(400, 'SVGA çevrilemedi: dosya bozuk ya da desteklenmeyen bir özellik var');
    }
    return { still: await fs.promises.readFile(still), motion: await fs.promises.readFile(motion), px: Number(JSON.parse(r.out.toString('utf8')).px) };
  });
}

// --- Turning a transparent source into a stacked video (one at a time, in the background) -------------------
const ALPHA_FORMAT = /^(yuva|rgba|bgra|argb|abgr|gbrap|ya8|ya16)/;
/** Whether ffprobe's video stream carries alpha: an alpha pixel format, or a WebM's alpha_mode tag (VP8/VP9 keep it apart). */
export const hasAlpha = (v) => ALPHA_FORMAT.test(v?.pix_fmt ?? '') || Object.entries(v?.tags ?? {}).some(([k, x]) => k.toLowerCase() === 'alpha_mode' && String(x) === '1');

/** ffmpeg's arguments: 540 × 960 visible, 20 fps, colour on top and the alpha below (app/scripts/alpha-stack.sh), AAC sound. */
export function convertArgs(input, output, codec) {
  const { width: W, height: H, fps } = LIMITS;
  // ffmpeg's own VP8/VP9 decoders drop a WebM's alpha; libvpx keeps it.
  const decoder = codec === 'vp9' ? ['-c:v', 'libvpx-vp9'] : codec === 'vp8' ? ['-c:v', 'libvpx'] : [];
  const graph = [
    // rgba after scaling and padding too: scale and pad would otherwise settle on a format without alpha.
    `[0:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,split[c][a]`,
    '[c]format=rgb24[top]',
    '[a]alphaextract,format=rgb24[bottom]',
    '[top][bottom]vstack=inputs=2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]',
  ].join(';');
  return [
    ...['-hide_banner', '-v', 'error', '-y', ...decoder, '-i', input, '-t', String(LIMITS.videoMaxMs / 1000)],
    ...['-filter_complex', graph, '-map', '[v]', '-map', '0:a:0?'],
    ...['-c:v', 'libx264', '-profile:v', 'main', '-preset', 'medium', '-crf', '23', '-g', String(fps * 2), '-pix_fmt', 'yuv420p'],
    ...['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'],
    ...['-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-threads', '2', output],
  ];
}

/**
 * The stacked MP4 made from the transparent video at `input` (a file here, `dir` its temp folder): { buf, ms }. A
 * FileError says what is wrong with the file itself (no transparency, too long, unreadable).
 */
export async function convertSource(input, dir, { opaque = false } = {}) {
  const p = await probe(input);
  const v = p.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new FileError('Videoda görüntü yok');
  const length = Number(p.format?.duration ?? 0);
  if (length * 1000 > LIMITS.videoMaxMs + 1000) throw new FileError(`Video en çok ${seconds(LIMITS.videoMaxMs)} saniye olabilir (bu ${seconds(length * 1000)} sn)`);
  const output = path.join(dir, 'stacked.mp4');
  const r = await run(FFMPEG, convertArgs(input, output, v.codec_name), { timeout: 10 * 60_000, keep: 0, nice: true });
  if (r.code !== 0) {
    console.error('gift video ffmpeg', r.code, r.err.slice(-400));
    throw new FileError('Video çevrilemedi: kaynak okunamadı ya da bozuk');
  }
  // Without alpha it still converted (all opaque): refused, with what it would look like for the panel, unless the
  // admin asked for it to play full screen with its background.
  if (!hasAlpha(v) && !opaque) throw new FileError(NO_ALPHA_TEXT, await previewOf(output));
  return stackedResult(output, OPAQUE_TEXT, { opaque });
}

/** What came out, for the panel's preview of a refused video: null when too big to keep. */
async function previewOf(output) {
  const buf = await fs.promises.readFile(output).catch(() => null);
  return buf && buf.length <= LIMITS.videoBytes ? buf : null;
}

/**
 * A converted video, checked like an uploaded one: somewhere transparent (else `opaqueText`, with what came
 * out), small enough, long enough.
 */
async function stackedResult(output, opaqueText, { opaque = false } = {}) {
  const m = await matteOf(output);
  if (m && m.ymin > OPAQUE && !opaque) throw new FileError(opaqueText, await previewOf(output));
  const buf = await fs.promises.readFile(output);
  if (buf.length > LIMITS.videoBytes) throw new FileError(`Çevrilen video çok büyük (${mb(buf.length)} MB, en çok ${mb(LIMITS.videoBytes)} MB): daha kısa ya da sade bir kaynak dene`);
  const ms = mp4Duration(buf);
  if (ms < LIMITS.videoMinMs) throw new FileError(`Video en az ${seconds(LIMITS.videoMinMs)} saniye olmalı`);
  return { buf, ms };
}

const audited = (c, actor, action, detail, ip = '') =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [actor, action, JSON.stringify(detail), ip]);

/**
 * Tables whose rows carry a stacked video and the job that makes one from an uploaded source, with custom_gifts'
 * columns (video_*, job_*, deleted_at, rev): the gifts here, a shop entry effect's video (shop-items.mjs adds
 * shop_items). `what` names the row in the audit and the logs.
 */
const VIDEO_TABLES = [{ table: 'custom_gifts', rev: 'custom_gift_rev', what: 'gift', refresh: () => refreshCustomGifts() }];
export function addVideoTable(t) {
  if (!VIDEO_TABLES.some((x) => x.table === t.table)) VIDEO_TABLES.push(Object.freeze({ ...t }));
}

/** One job: the source downloaded, converted, stored, and put in effect unless the row moved on meanwhile. */
async function convertJob(row, t = VIDEO_TABLES[0]) {
  const src = keyOf(row.job_source);
  try {
    if (!src) throw new FileError('Kaynak video bulunamadı, yeniden yükle');
    const out = await temp(async (dir) => {
      const input = path.join(dir, `source.${src.split('.').pop()}`);
      await downloadStored(src, input, LIMITS.sourceBytes);
      const opaque = row.job_opaque === true;
      return src.endsWith('.svga') ? convertSvga(input, dir, row.job_fill === null ? LIMITS.fill : Number(row.job_fill), { opaque }) : convertSource(input, dir, { opaque });
    });
    // Under the uploader's folder, like every stored file (media.mjs FILE_KEY).
    const key = `giftvideo/${src.split('/')[1]}/${row.id}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}.mp4`;
    const url = await writeStored(key, out.buf, 'video/mp4');
    const done = await tx(async (c) => {
      const cur = (await c.query(`SELECT video_url, job_source, job_preview, deleted_at FROM ${t.table} WHERE id = $1 FOR UPDATE`, [row.id])).rows[0];
      if (!cur || cur.deleted_at || cur.job_source !== row.job_source) return null;
      await c.query(
        `UPDATE ${t.table} SET video_url = $2, video_bytes = $3, video_ms = $4, video_v = $5, job_status = NULL, job_source = NULL, job_error = NULL, job_tries = 0,
                job_preview = NULL, rev = nextval('${t.rev}') WHERE id = $1`,
        [row.id, url, out.buf.length, out.ms, sha12(out.buf)],
      );
      await audited(c, null, `${t.what}.video_ready`, { [t.what]: row.id, bytes: out.buf.length, ms: out.ms });
      return { old: cur.video_url, preview: cur.job_preview };
    });
    // Replaced, taken off or deleted while it ran: the new file goes, nothing else changes.
    if (!done) return removeFiles([url]);
    removeFiles([done.old, done.preview, row.job_source].filter(Boolean));
    await t.refresh();
    console.log(`${t.what} video ready: ${row.id}, ${out.buf.length} bytes, ${out.ms} ms`);
  } catch (e) {
    const file = e instanceof FileError;
    if (!file) console.error(`${t.what} video job`, row.id, String(e?.message ?? e).slice(0, 200));
    if (file || row.job_tries >= MAX_TRIES) {
      const error = (file ? e.message : 'Video çevrilemedi, yeniden yükle').slice(0, 300);
      let preview = null;
      if (file && e.preview && src) {
        const key = `giftvideo/${src.split('/')[1]}/${row.id}-onizleme-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}.mp4`;
        preview = await writeStored(key, e.preview, 'video/mp4').catch((err) => (console.error(`${t.what} video preview`, String(err?.message ?? err).slice(0, 200)), null));
      }
      const r = await db.query(
        `UPDATE ${t.table} g SET job_status = 'failed', job_error = $3, job_source = NULL, job_preview = $4
           FROM (SELECT id, job_preview AS old FROM ${t.table} WHERE id = $1 FOR UPDATE) x
          WHERE g.id = x.id AND g.job_source = $2 RETURNING x.old`,
        [row.id, row.job_source, error, preview],
      );
      if (r.rowCount) {
        await audited(db, null, `${t.what}.video_failed`, { [t.what]: row.id, error, preview: !!preview });
        removeFiles([row.job_source, r.rows[0].old].filter(Boolean));
        await t.refresh();
      } else if (preview) removeFiles([preview]);
    } else {
      await db.query(`UPDATE ${t.table} SET job_at = now() + $3 * interval '30 seconds' WHERE id = $1 AND job_source = $2`, [row.id, row.job_source, row.job_tries]);
    }
  }
}

// --- Once: the videos made at the old default SVGA size, full screen (migration 074) ---------------------------
/**
 * The old default: svga-to-fx.py scaled an SVGA's visible part to 60 % of the frame's width (at most of its height)
 * and centred it, so all of it is in the middle 60 % of the frame; at Tam ekran the same part is 1 / 0.6 as big,
 * around the same centre.
 */
const OLD_FILL = 0.6;
/** The mask brighter than this (limited range, 16 is transparent) is visible: a faint glow counts. */
const SEEN = 24;

/**
 * The part of a stacked video's `W` × `H` frame that is ever visible, every frame of the clip: { x, y, w, h } in its
 * pixels (even), or null when nothing is or it can't be read. Measured at half size.
 */
export async function visibleBox(file, W, H) {
  const w = W / 2;
  const h = H / 2;
  const plane = w * h;
  // 15 s at 20 fps at half size: about 40 MB.
  const r = await run(FFMPEG, ['-v', 'error', '-i', file, '-an', '-vf', `crop=${W}:${H}:0:${H},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], {
    timeout: 120_000,
    keep: 96 << 20,
    nice: true,
  });
  if (r.code !== 0 || r.out.length < plane) return null;
  const px = r.out;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let f = 0; f + plane <= px.length; f += plane) {
    for (let y = 0; y < h; y++) {
      const row = f + y * w;
      for (let x = 0; x < w; x++) {
        if (px[row + x] <= SEEN) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0 * 2, y: y0 * 2, w: (x1 - x0 + 1) * 2, h: (y1 - y0 + 1) * 2 };
}

/** The middle 60 % of a `W` × `H` frame (even pixels): where all of an SVGA made at the old default size is. */
export const oldFrame = (W, H) => {
  const [w, h] = [Math.round((W * OLD_FILL) / 2) * 2, Math.round((H * OLD_FILL) / 2) * 2];
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
};
/**
 * Whether `box` (visibleBox) is what the old default made: inside the middle 60 % of the frame (a pixel or two for
 * rounding) and reaching its edges across or down (a faint edge may stay under SEEN), so not a smaller size picked.
 */
export function oldDefaultSize(box, W, H) {
  const f = oldFrame(W, H);
  const inside = box.x >= f.x - 4 && box.y >= f.y - 4 && box.x + box.w <= f.x + f.w + 4 && box.y + box.h <= f.y + f.h + 4;
  return inside && Math.max(box.w / f.w, box.h / f.h) >= 0.92;
}

/**
 * ffmpeg's arguments to cut the middle 60 % (oldFrame) out of both halves of a stacked `W` × `H` video and scale it to
 * the whole frame: what svga-to-fx.py makes at `--fill 1` from the same SVGA, only from the smaller picture. The
 * colour and the mask are cut and scaled alike; the sound is kept as it is.
 */
export function enlargeArgs(input, output, W, H) {
  const f = oldFrame(W, H);
  const part = (y) => `crop=${f.w}:${f.h}:${f.x}:${y},scale=${W}:${H}:flags=lanczos`;
  return [
    ...['-hide_banner', '-v', 'error', '-y', '-i', input],
    ...['-filter_complex', `[0:v]split=2[t][b];[t]${part(f.y)}[c];[b]${part(H + f.y)}[a];[c][a]vstack=inputs=2,format=yuv420p[v]`],
    ...['-map', '[v]', '-map', '0:a:0?'],
    ...['-c:v', 'libx264', '-profile:v', 'main', '-preset', 'medium', '-crf', '23', '-g', String(LIMITS.fps * 2), '-pix_fmt', 'yuv420p'],
    ...['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'],
    ...['-c:a', 'copy', '-movflags', '+faststart', '-threads', '2', output],
  ];
}

const unmark = (id) => db.query('UPDATE custom_gifts SET video_enlarge = NULL WHERE id = $1', [id]);
/**
 * One gift whose video is marked (migration 074): when it is the old default size, made full screen from the video
 * itself (softer than the SVGA converted again at Tam ekran, which the admin can still do), swapped in, the old file
 * deleted. Any other video is left as it is. The mark always goes, whatever happens.
 */
async function enlargeJob(row) {
  const key = keyOf(row.video_url);
  const { width: W, height: H } = LIMITS;
  let url = null;
  try {
    const out = !key?.startsWith('giftvideo/')
      ? null
      : await temp(async (dir) => {
          const input = path.join(dir, 'video.mp4');
          await fs.promises.writeFile(input, await readStored(key, LIMITS.videoBytes));
          const v = (await probe(input)).streams.find((s) => s.codec_type === 'video');
          if (v?.width !== W || v?.height !== 2 * H) return null;
          const box = await visibleBox(input, W, H);
          if (!box || !oldDefaultSize(box, W, H)) return null;
          const output = path.join(dir, 'tam-ekran.mp4');
          const r = await run(FFMPEG, enlargeArgs(input, output, W, H), { timeout: 10 * 60_000, keep: 0, nice: true });
          if (r.code !== 0) throw new Error(`ffmpeg ${r.code} ${r.err.slice(-200)}`);
          const buf = await fs.promises.readFile(output);
          if (buf.length > LIMITS.videoBytes) throw new Error(`${buf.length} bytes`);
          return { buf, ms: mp4Duration(buf), box };
        });
    if (!out) return void (await unmark(row.id));
    const to = `giftvideo/${key.split('/')[1]}/${row.id}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}.mp4`;
    url = await writeStored(to, out.buf, 'video/mp4');
    const done = await tx(async (c) => {
      const cur = (await c.query('SELECT video_url, deleted_at FROM custom_gifts WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
      if (!cur || cur.deleted_at || cur.video_url !== row.video_url) return false;
      await c.query(
        `UPDATE custom_gifts SET video_url = $2, video_bytes = $3, video_ms = $4, video_v = $5, video_enlarge = NULL, rev = nextval('custom_gift_rev') WHERE id = $1`,
        [row.id, url, out.buf.length, out.ms, sha12(out.buf)],
      );
      await audited(c, null, 'gift.video_enlarged', { gift: row.id, before: row.video_url, after: url, visible: [out.box.w, out.box.h], bytes: out.buf.length });
      return true;
    });
    if (!done) {
      removeFiles([url]);
      return void (await unmark(row.id));
    }
    removeFiles([row.video_url]);
    await refreshCustomGifts();
    console.log(`gift video full screen: ${row.id}, ${out.buf.length} bytes`);
  } catch (e) {
    console.error('gift video enlarge', row.id, String(e?.message ?? e).slice(0, 200));
    if (url) removeFiles([url]);
    await unmark(row.id);
  }
}

/** The marked videos, one after another; a mark whose video was replaced or deleted since just goes. */
async function enlargeOld() {
  await db.query('UPDATE custom_gifts SET video_enlarge = NULL WHERE video_enlarge IS NOT NULL AND (video_url IS DISTINCT FROM video_enlarge OR deleted_at IS NOT NULL)');
  const seen = new Set();
  for (;;) {
    const r = await db.query(
      `SELECT id, video_url FROM custom_gifts WHERE video_enlarge IS NOT NULL AND video_enlarge = video_url AND deleted_at IS NULL AND job_status IS DISTINCT FROM 'processing' ORDER BY id LIMIT 1`,
    );
    // Each job takes its mark away; one that didn't would come again: never twice.
    if (!r.rowCount || seen.has(r.rows[0].id)) return;
    seen.add(r.rows[0].id);
    await enlargeJob(r.rows[0]);
  }
}

let working = false;
let again = false;
/** Runs the conversions waiting now, one after another (a call while it runs makes it look again afterwards). */
export function kickJobs() {
  if (working) {
    again = true;
    return;
  }
  working = true;
  void (async () => {
    try {
      do {
        again = false;
        // Every table's due jobs, one at a time (one converter on this machine).
        for (const t of VIDEO_TABLES) {
          for (;;) {
            const r = await db.query(
              `UPDATE ${t.table} SET job_tries = job_tries + 1
                WHERE id = (SELECT id FROM ${t.table} WHERE job_status = 'processing' AND deleted_at IS NULL AND job_tries < $1 AND job_at <= now() ORDER BY job_at LIMIT 1)
                RETURNING id, job_source, job_tries, job_fill, job_opaque`,
              [MAX_TRIES],
            );
            if (!r.rowCount) break;
            await convertJob(r.rows[0], t);
          }
        }
        // Once (migration 074): the videos made at the old default SVGA size, after the conversions.
        await enlargeOld();
      } while (again);
      // Cut off too often (restarts, the storage): given up on, so the panel says so.
      for (const t of VIDEO_TABLES) {
        const stuck = await db.query(
          `UPDATE ${t.table} g SET job_status = 'failed', job_error = 'Video çevrilemedi, yeniden yükle', job_source = NULL
             FROM (SELECT id, job_source FROM ${t.table} WHERE job_status = 'processing' AND job_tries >= $1 FOR UPDATE) x
            WHERE g.id = x.id RETURNING x.job_source`,
          [MAX_TRIES],
        );
        if (stuck.rowCount) removeFiles(stuck.rows.map((x) => x.job_source).filter(Boolean));
      }
    } catch (e) {
      console.error('gift video jobs', String(e?.message ?? e).slice(0, 200));
    } finally {
      working = false;
    }
  })();
}
/** Whether a conversion runs now (tests wait for it). */
export const jobsRunning = () => working;

// --- Admin routes --------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
/** A gift's id in a body: an admin's ('a' and a number), with `app` one of the app's own too. */
const idOf = (v, { app = false } = {}) => {
  if (typeof v === 'string' && (ID.test(v) || (app && GIFTS.has(v)))) return v;
  throw new HttpError(400, 'Geçersiz hediye');
};
const nameOf = (v) => text(v, LIMITS.nameMin, LIMITS.nameMax, 'Ad').replace(/\s+/g, ' ');
const priceOf = (v) => {
  const n = int(v, 1, LIMITS.priceMax);
  if (!n) throw new HttpError(400, `Fiyat 1–${fmt(LIMITS.priceMax)} jeton arasında bir tam sayı olmalı`);
  return n;
};
const catOf = (v) => {
  if (!CATS.includes(v)) throw new HttpError(400, 'Raf Popüler, İkili, Aile ve Dost, Kutlama ya da Özel olmalı');
  return v;
};
/** The VIP level a gift needs: only on the Özel shelf (1–10); 0 elsewhere. */
const svipOf = (v, cat) => {
  if (cat !== 'privilege') return 0;
  const n = int(v, 1, LIMITS.svipMax);
  if (!n) throw new HttpError(400, `Özel raftaki hediye için VIP seviyesi 1–${LIMITS.svipMax} olmalı`);
  return n;
};
const emojiOf = (v) => {
  if (v === undefined || v === null || v === '') return '🎁';
  const s = typeof v === 'string' ? v.trim() : '';
  // An emoji (or a few joined ones), shown where no picture fits: never letters, digits or markup.
  if (!s || s.length > 16 || /[\p{L}\p{N}<>&]/u.test(s)) throw new HttpError(400, 'Emoji yalnız bir emoji olmalı');
  return s;
};
/** No two gifts with one name: the app's own (as they are named now) and the admins' that aren't deleted. */
function nameFree(name, self) {
  const n = lower(name);
  const taken = allGifts().find((g) => g.id !== self && lower(g.name) === n);
  if (taken) throw new HttpError(409, taken.builtin ? `“${name}” uygulamadaki bir hediyenin adı, başka bir ad seç` : `“${name}” adında bir hediye zaten var`);
}
/** video in a body: undefined (unchanged), null (taken off), or a checked stacked video or source. */
/**
 * A gift's (or a shop entry effect's, shop-items.mjs) video in a body: undefined (unchanged), null (none), a ready
 * stacked MP4 ({ kind: 'stacked', url }) or a transparent source to convert ({ kind: 'source', url, fill?, opaque? }).
 */
export async function videoOf(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const url = typeof o.url === 'string' ? o.url : '';
  // opaque: plays full screen with its background (no transparency needed); an older app or panel never sends it.
  if (o.opaque !== undefined && typeof o.opaque !== 'boolean') throw new HttpError(400, 'Arka planlı tam ekran seçimi geçersiz');
  const opaque = o.opaque === true;
  if (o.kind === 'stacked') return { kind: 'stacked', ...(await checkStacked(url, { opaque })) };
  if (o.kind === 'source') return { kind: 'source', ...(await checkSource(url, o.fill)), opaque };
  throw new HttpError(400, 'Video hazır yığılmış MP4 (stacked) ya da saydam kaynak (source) olmalı');
}
/** The unique name index lost a race: the same answer as nameFree. */
async function saving(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e?.code === '23505' && e.constraint === 'custom_gifts_name') throw new HttpError(409, 'Bu adda bir hediye zaten var');
    throw e;
  }
}
/** What the audit keeps of a row (an app's gift's: null where it is as in the app). */
const auditOf = (r) =>
  r && {
    ...(r.builtin ? { builtin: true } : {}),
    name: r.name,
    emoji: r.emoji,
    price: num(r.price),
    cat: r.cat,
    minSvip: num(r.min_svip),
    sort: num(r.sort),
    enabled: r.enabled,
    icon: r.icon_url,
    video: r.video_url ?? null,
    ...(r.video_off ? { videoOff: true } : {}),
    job: r.job_status ?? null,
    iconLink: r.icon_link ?? null,
    videoLink: r.video_link ?? null,
  };
/** iconLink / videoLink in a body: undefined (unchanged), null (none: the file was uploaded) or a checked link. */
const linkField = (v) => (v === undefined ? undefined : v === null || v === '' ? null : linkOf(v));

/**
 * The place before every gift on `cat` now (an admin's, or an app's whose place was set), where a new gift or one
 * moved there goes. The app's gifts nobody moved sit after the admins' anyway (APP_SORT).
 */
async function firstSort(c, cat) {
  const appIds = [...GIFTS.values()].filter((g) => g.cat === cat).map((g) => g.id);
  const r = await c.query(
    `SELECT coalesce(min(sort), 1) - 1 AS s FROM custom_gifts
      WHERE deleted_at IS NULL AND sort IS NOT NULL AND (cat = $1 OR (builtin AND cat IS NULL AND id = ANY($2::text[])))`,
    [cat, appIds],
  );
  return Number(r.rows[0].s);
}
/** An app's gift's row, made the first time anything about it changes: every column null, i.e. as in the app. */
const appRows = (c, ids, actor) =>
  c.query(
    `INSERT INTO custom_gifts (id, builtin, name, emoji, price, cat, min_svip, sort, enabled, icon_url, created_by, updated_by)
     SELECT x, true, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, $2, $2 FROM unnest($1::text[]) AS x ON CONFLICT (id) DO NOTHING`,
    [ids, actor],
  );

/** What an app's gift is in the app itself: the panel shows it next to what it is now, and goes back to it. */
function originalOf(id) {
  const base = GIFTS.get(id);
  const clip = giftClip(id);
  return {
    name: base.name,
    emoji: base.emoji,
    price: base.price,
    cat: base.cat,
    minSvip: base.minSvip,
    enabled: !GIFTS_PAUSED.has(id),
    icon: artUrl('gifts', id),
    video: clip ? { url: clip.url, bytes: clip.bytes, ms: clip.ms } : null,
  };
}
/**
 * Which of an app's gift's values were changed (the row's columns that aren't null), as RESET names them. Its place
 * isn't among them: ordering a shelf places every gift on it, and the panel shows the order anyway.
 */
const changedOf = (r) =>
  !r
    ? []
    : [
        ...(r.name !== null ? ['name'] : []),
        ...(r.emoji !== null ? ['emoji'] : []),
        ...(r.price !== null ? ['price'] : []),
        ...(r.cat !== null || r.min_svip !== null ? ['cat'] : []),
        ...(r.enabled !== null ? ['enabled'] : []),
        ...(r.icon_url !== null ? ['icon'] : []),
        ...(r.video_url !== null || r.video_off || r.job_status !== null ? ['video'] : []),
      ];

/** An admin's gift as the panel shows it. */
const customView = (x, sent) => ({
  id: x.id,
  builtin: false,
  name: x.name,
  emoji: x.emoji,
  price: Number(x.price),
  cat: x.cat,
  minSvip: Number(x.min_svip),
  sort: Number(x.sort),
  enabled: x.enabled,
  icon: x.icon_url,
  // Where the icon and the video were fetched from (null: uploaded), for fetching them again.
  iconLink: x.icon_link ?? null,
  videoLink: x.video_link ?? null,
  // At this server (the fx route serves it for the preview even while the gift is taken off).
  video: x.video_url ? { url: fxUrl(x.id, x.video_v), bytes: Number(x.video_bytes), ms: Number(x.video_ms ?? 0) } : null,
  // preview: what a refused video came out as (its background and all), for the panel to show.
  job: x.job_status ? { status: x.job_status, error: x.job_error ?? null, preview: x.job_preview ?? null } : null,
  sent: sent.get(x.id) ?? { count: 0, coins: 0 },
  createdAt: x.created_at,
  updatedAt: x.updated_at,
  updatedBy: x.updated_by ? { id: x.updated_by, name: x.updated_by_name ?? null } : null,
});
/**
 * An app's own gift as the panel shows it: as it is now (the app's picture, served here, unless one was given
 * instead; its own clip unless replaced or stopped), what it is in the app (`original`) and what was changed.
 */
function appView(id, x, sent) {
  const g = appGiftOf(GIFTS.get(id), x ? viewOf(x) : null);
  const original = originalOf(id);
  return {
    id,
    builtin: true,
    name: g.name,
    emoji: g.emoji,
    price: g.price,
    cat: g.cat,
    minSvip: g.minSvip,
    sort: g.sort,
    enabled: g.enabled,
    icon: g.icon ?? original.icon,
    iconLink: x?.icon_link ?? null,
    videoLink: x?.video_link ?? null,
    video: g.video ? { url: fxUrl(id, g.video.v), bytes: g.video.bytes, ms: g.video.ms } : g.videoOff ? null : original.video,
    videoOff: g.videoOff,
    job: x?.job_status ? { status: x.job_status, error: x.job_error ?? null, preview: x.job_preview ?? null } : null,
    // The app's gifts have no index of their own in gift_events: the last 30 days, found by time.
    sent: sent.get(id) ?? { count: 0, coins: 0, days: 30 },
    original,
    changed: changedOf(x),
    createdAt: null,
    updatedAt: x?.updated_at ?? null,
    updatedBy: x?.updated_by ? { id: x.updated_by, name: x.updated_by_name ?? null } : null,
  };
}

/**
 * The panel's view of gifts that aren't deleted (all, or `ids`), in the shelves' order, with how often each was sent.
 * The app's own gifts only with `app` (or when `ids` names them): an older panel lists the admins' alone.
 */
async function adminGifts(ids = null, { app = false } = {}) {
  const withApp = app || (ids ?? []).some((id) => GIFTS.has(id));
  const r = await db.query(
    `SELECT g.*, u.name AS updated_by_name FROM custom_gifts g LEFT JOIN users u ON u.id = g.updated_by
      WHERE g.deleted_at IS NULL AND ($1::text[] IS NULL OR g.id = ANY($1::text[])) AND ($2 OR NOT g.builtin)`,
    [ids, withApp],
  );
  const custom = r.rows.filter((x) => !x.builtin);
  const rows = new Map(r.rows.filter((x) => x.builtin).map((x) => [x.id, x]));
  const appIds = withApp ? [...GIFTS.keys()].filter((id) => !ids || ids.includes(id)) : [];
  const sent = new Map();
  if (custom.length) {
    const s = await db.query("SELECT gift_id, sum(count)::bigint AS n, sum(total)::bigint AS coins FROM gift_events WHERE gift_id LIKE 'a%' AND gift_id = ANY($1::text[]) GROUP BY gift_id", [
      custom.map((x) => x.id),
    ]);
    for (const x of s.rows) sent.set(x.gift_id, { count: Number(x.n), coins: Number(x.coins) });
  }
  if (appIds.length) {
    const s = await db.query(
      "SELECT gift_id, sum(count)::bigint AS n, sum(total)::bigint AS coins FROM gift_events WHERE created_at >= now() - interval '30 days' AND gift_id = ANY($1::text[]) GROUP BY gift_id",
      [appIds],
    );
    for (const x of s.rows) sent.set(x.gift_id, { count: Number(x.n), coins: Number(x.coins), days: 30 });
  }
  return [...custom.map((x) => customView(x, sent)), ...appIds.map((id) => appView(id, rows.get(id), sent))].sort(byShelf);
}
const oneGift = async (id) => (await adminGifts([id]))[0];

/** Link downloads running now, and how many may run at once (each can be as big as a source). */
let fetching = 0;
const FETCH_MAX = 2;
/** What a downloaded gift file is, from its first bytes: the type it is stored as, 'zip' (an SVGA 1.x), else null. */
export function sniff(b) {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return b.toString('latin1', 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (b.length >= 8 && ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(b.toString('latin1', 4, 8))) return 'video/quicktime';
  // SVGA 2.x is a zlib stream (a valid header: 0x78, the pair a multiple of 31); 1.x is a zip.
  if (b.length >= 2 && b[0] === 0x78 && ((b[0] << 8) | b[1]) % 31 === 0) return 'application/x-svga';
  if (b.length >= 2 && b.toString('latin1', 0, 2) === 'PK') return 'zip';
  return null;
}
const WHAT = { 'image/png': 'bir PNG resim', 'image/webp': 'bir WebP resim', 'video/mp4': 'bir MP4 video', 'video/webm': 'bir WebM video', 'video/quicktime': 'bir MOV video', 'application/x-svga': 'bir SVGA', zip: 'bir zip dosyası' };
const what = (type) => WHAT[type] ?? 'tanınmayan bir dosya (resim ya da video değil)';
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'application/x-svga'];
const VIDEO_END = /\.(mp4|m4v|webm|mov|svga)$/i;
const sizeOf = (length) => (length ? ` (${mb(length)} MB)` : '');
/** The sentence for a link too big for the icon: a video pasted in the icon's field is said to be one. */
const iconTooBig = ({ type, length, url }) =>
  type.startsWith('video/') || type === 'application/x-svga' || VIDEO_END.test(url.pathname)
    ? `Bu bağlantı bir video${sizeOf(length)}: ikonun değil, videonun bağlantı alanına yapıştırın`
    : `İkon en fazla ${mb(LIMITS.iconBytes)} MB olabilir${length ? ` (bu ${mb(length)} MB)` : ''}`;
const videoTooBig = ({ length }) => `Video en fazla ${mb(LIMITS.sourceBytes)} MB olabilir${length ? ` (bu ${mb(length)} MB)` : ''}`;

/** The upload kind a fetched file goes in as, for its slot: the same rules as the panel's file picker. */
async function fetchedKind(slot, type, bytes) {
  if (slot === 'icon') {
    if (type === 'image/png' || type === 'image/webp') return 'gifticon';
    if (VIDEO_TYPES.includes(type)) throw new HttpError(400, 'Bu bağlantı bir video: ikonun değil, videonun bağlantı alanına yapıştırın');
    throw new HttpError(400, `İkon PNG ya da WebP olmalı; bağlantıdaki ${what(type)}`);
  }
  if (type === 'image/png' || type === 'image/webp') throw new HttpError(400, 'Bu bağlantı bir resim: videonun değil, ikonun bağlantı alanına yapıştırın');
  if (type === 'video/mp4') {
    if (bytes > LIMITS.videoBytes) throw new HttpError(400, `Hazır MP4 en fazla ${mb(LIMITS.videoBytes)} MB olabilir (bu ${mb(bytes)} MB): saydam WebM / MOV kaynağı ya da SVGA verin`);
    return 'giftvideo';
  }
  if (type === 'video/webm' || type === 'video/quicktime' || type === 'application/x-svga') {
    const svga = type === 'application/x-svga';
    if (svga && bytes > LIMITS.svgaBytes) throw new HttpError(400, `SVGA en fazla ${mb(LIMITS.svgaBytes)} MB olabilir (bu ${mb(bytes)} MB)`);
    if (!(await (svga ? canSvga() : canConvert()))) throw new HttpError(400, `Bu sunucu ${svga ? 'SVGA' : 'video'} çeviremiyor: hazır yığılmış MP4 verin`);
    return 'giftsource';
  }
  if (type === 'zip') throw new HttpError(400, 'SVGA 1.x okunmuyor: animasyonu SVGA 2.x olarak dışa aktarın');
  throw new HttpError(400, `Video hazır MP4, saydam WebM / MOV ya da SVGA olmalı; bağlantıdaki ${what(type)}`);
}
const writeLimit = (a) => limit(`gifts-admin:${a.id}`, 60, 'Çok fazla deneme, biraz bekle');

/**
 * What POST /api/admin/gifts/reset can give back to one of the app's gifts; without `fields`, all but its place (an
 * ordered shelf keeps its order). Its place goes back with its shelf when it was moved to another one.
 */
const RESET = ['name', 'emoji', 'price', 'cat', 'enabled', 'sort', 'icon', 'video'];
const RESET_ALL = RESET.filter((f) => f !== 'sort');

/**
 * POST /api/admin/gifts/update for one of the app's own gifts: the same fields and checks as an admin's gift. A value
 * equal to the app's is kept as null (so a later app change to it shows), icon: null gives it the app's picture back,
 * video: null stops its video (its own clip too), a new video replaces its own clip (a source: the clip in effect
 * plays until it is converted). An older app goes on showing the app's name, picture and price (checkShownPrice).
 */
async function updateApp(req, a, id, b) {
  const base = GIFTS.get(id);
  const cur = builtinGift(id);
  const next = {};
  // An icon made smaller on save (checkIcon): the upload it replaced goes once the gift is saved.
  let iconUpload = null;
  if (b.name !== undefined) {
    const name = nameOf(b.name);
    nameFree(name, id);
    next.name = name === base.name ? null : name;
  }
  if (b.price !== undefined) {
    const price = priceOf(b.price);
    next.price = price === base.price ? null : price;
  }
  let cat = cur.cat;
  if (b.cat !== undefined) {
    cat = catOf(b.cat);
    next.cat = cat === base.cat ? null : cat;
  }
  if (b.minSvip !== undefined || b.cat !== undefined) {
    const was = cur.cat === 'privilege' ? cur.minSvip : base.cat === 'privilege' ? base.minSvip : 1;
    const svip = svipOf(b.minSvip ?? (cat === 'privilege' ? was : 0), cat);
    next.minSvip = svip === base.minSvip ? null : svip;
  }
  if (b.emoji !== undefined) {
    const emoji = b.emoji === null || b.emoji === '' ? base.emoji : emojiOf(b.emoji);
    next.emoji = emoji === base.emoji ? null : emoji;
  }
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'Açık/kapalı geçersiz');
    next.enabled = b.enabled === !GIFTS_PAUSED.has(id) ? null : b.enabled;
  }
  // The app's picture as the panel shows it, or null: back to it. Another address: a new icon.
  if (b.icon !== undefined) {
    if (b.icon === null || b.icon === artUrl('gifts', id)) {
      if (cur.icon) next.icon = null;
    } else if (b.icon !== cur.icon) {
      if (typeof b.icon !== 'string' || !b.icon) throw new HttpError(400, 'İkonu önce yükle');
      ({ url: next.icon, upload: iconUpload } = await checkIcon(b.icon));
    }
  }
  const video = await videoOf(b.video);
  const iconLink = linkField(b.iconLink);
  const videoLink = linkField(b.videoLink);
  if (next.icon !== undefined) next.iconLink = next.icon === null ? null : (iconLink ?? null);
  else if (iconLink !== undefined && cur.icon) next.iconLink = iconLink;
  if (video !== undefined) next.videoLink = video === null ? null : (videoLink ?? null);
  else if (videoLink !== undefined && cur.video) next.videoLink = videoLink;
  if (!Object.keys(next).length && video === undefined) throw new HttpError(400, 'Değişiklik yok');
  const drop = [];
  await saving(() =>
    tx(async (c) => {
      await appRows(c, [id], a.id);
      const r = (await c.query('SELECT * FROM custom_gifts WHERE id = $1 AND builtin FOR UPDATE', [id])).rows[0];
      if (!r) throw new HttpError(404, 'Hediye bulunamadı');
      const vals = [id];
      const sets = [];
      const set = (col, v) => {
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      };
      if (next.name !== undefined) set('name', next.name);
      if (next.price !== undefined) set('price', next.price);
      if (next.emoji !== undefined) set('emoji', next.emoji);
      if (next.enabled !== undefined) set('enabled', next.enabled);
      if (next.minSvip !== undefined) set('min_svip', next.minSvip);
      // Moved to another shelf: first there, as an admin's gift is.
      if (next.cat !== undefined) {
        set('cat', next.cat);
        if (cat !== cur.cat) set('sort', await firstSort(c, cat));
      }
      if (next.icon !== undefined) {
        set('icon_url', next.icon);
        drop.push(r.icon_url);
      }
      if (next.iconLink !== undefined) set('icon_link', next.iconLink);
      if (next.videoLink !== undefined) set('video_link', next.videoLink);
      if (video === null || video?.kind === 'stacked') {
        set('video_url', video?.url ?? null);
        set('video_bytes', video?.bytes ?? null);
        set('video_ms', video?.ms ?? null);
        set('video_v', video?.v ?? null);
        set('video_off', video === null);
        sets.push('job_status = NULL', 'job_source = NULL', 'job_error = NULL', 'job_tries = 0', 'job_preview = NULL');
        drop.push(r.video_url, r.job_source, r.job_preview);
      } else if (video?.kind === 'source') {
        set('job_source', video.url);
        set('job_fill', video.fill);
        set('job_opaque', video.opaque);
        sets.push('video_off = false', "job_status = 'processing'", 'job_error = NULL', 'job_tries = 0', 'job_at = now()', 'job_preview = NULL');
        drop.push(r.job_source, r.job_preview);
      }
      set('updated_by', a.id);
      sets.push('updated_at = now()', "rev = nextval('custom_gift_rev')");
      const after = await c.query(`UPDATE custom_gifts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
      await audited(c, a.id, 'gift.update', { gift: id, before: auditOf(r), after: auditOf(after.rows[0]), ...panelDetail(a) }, clientIp(req));
    }),
  );
  removeFiles([...drop, iconUpload].filter(Boolean));
  await refreshCustomGifts();
  if (video?.kind === 'source') kickJobs();
  return { gift: await oneGift(id) };
}

export const customGiftRoutes = {
  /** ?builtin=1: the app's own gifts too, each with its values in the app (`original`) and what was changed. */
  async 'GET /api/admin/gifts'(req, url) {
    await admin(req);
    const app = url?.searchParams.get('builtin') === '1';
    return { gifts: await adminGifts(null, { app }), limits: LIMITS, convert: await canConvert(), svga: await canSvga(), storage: storageOn() };
  },

  /** A new gift, first on its shelf; on the shelves at once unless enabled is false. */
  async 'POST /api/admin/gifts'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const name = nameOf(b.name);
    const price = priceOf(b.price);
    const cat = catOf(b.cat);
    const minSvip = svipOf(b.minSvip, cat);
    const emoji = emojiOf(b.emoji);
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') throw new HttpError(400, 'Açık/kapalı geçersiz');
    nameFree(name, null);
    if (typeof b.icon !== 'string' || !b.icon) throw new HttpError(400, 'İkonu önce yükle');
    const icon = await checkIcon(b.icon);
    const video = await videoOf(b.video ?? null);
    const stacked = video?.kind === 'stacked' ? video : null;
    const iconLink = linkField(b.iconLink) ?? null;
    const videoLink = video ? (linkField(b.videoLink) ?? null) : null;
    const id = await saving(() =>
      tx(async (c) => {
        const id = `a${(await c.query("SELECT nextval('custom_gift_ids') AS n")).rows[0].n}`;
        const first = await firstSort(c, cat);
        const r = await c.query(
          `INSERT INTO custom_gifts (id, name, emoji, price, cat, min_svip, sort, enabled, icon_url, video_url, video_bytes, video_ms, video_v, job_status, job_source, job_fill,
                                     created_by, updated_by, icon_link, video_link, job_opaque)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17, $18, $19, $20) RETURNING *`,
          [id, name, emoji, price, cat, minSvip, first, b.enabled !== false, icon.url, stacked?.url ?? null, stacked?.bytes ?? null, stacked?.ms ?? null, stacked?.v ?? null,
            video?.kind === 'source' ? 'processing' : null, video?.kind === 'source' ? video.url : null, video?.kind === 'source' ? video.fill : null, a.id, iconLink, videoLink,
            video?.kind === 'source' && video.opaque],
        );
        await audited(c, a.id, 'gift.create', { gift: id, before: null, after: auditOf(r.rows[0]), ...panelDetail(a) }, clientIp(req));
        return id;
      }),
    );
    if (icon.upload) removeFiles([icon.upload]);
    await refreshCustomGifts();
    if (video?.kind === 'source') kickJobs();
    return { gift: await oneGift(id) };
  },

  /**
   * Changes what the body names; a new icon or video replaces the old file, which is then deleted. One of the app's
   * own gifts too (updateApp).
   */
  async 'POST /api/admin/gifts/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const id = idOf(b.id, { app: true });
    // A bond gift's price is the bond's (bond-rules.mjs) and it stays on its shelf; its name, picture and video may change.
    if (BOND_GIFTS.has(id) && b.price !== undefined && b.price !== GIFTS.get(id).price) throw new HttpError(400, 'Bağ hediyesinin fiyatı Bağlar kuralından gelir, buradan değişmez');
    if (BOND_GIFTS.has(id) && b.cat !== undefined && b.cat !== 'family') throw new HttpError(400, 'Bağ hediyesi Aile ve Dost rafında kalır');
    if (GIFTS.has(id)) return updateApp(req, a, id, b);
    const cur = snap.rows.get(id);
    if (!cur || cur.deleted) throw new HttpError(404, 'Hediye bulunamadı');
    const next = {};
    if (b.name !== undefined) {
      next.name = nameOf(b.name);
      nameFree(next.name, id);
    }
    if (b.price !== undefined) next.price = priceOf(b.price);
    if (b.cat !== undefined) next.cat = catOf(b.cat);
    const cat = next.cat ?? cur.cat;
    if (b.minSvip !== undefined || b.cat !== undefined) next.minSvip = svipOf(b.minSvip ?? (cat === 'privilege' ? cur.minSvip || 1 : 0), cat);
    if (b.emoji !== undefined) next.emoji = emojiOf(b.emoji);
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'Açık/kapalı geçersiz');
      next.enabled = b.enabled;
    }
    let iconUpload = null;
    if (b.icon !== undefined && b.icon !== cur.icon) {
      if (typeof b.icon !== 'string' || !b.icon) throw new HttpError(400, 'İkonu önce yükle');
      ({ url: next.icon, upload: iconUpload } = await checkIcon(b.icon));
    }
    const video = await videoOf(b.video);
    // A new icon or video takes the link it came with (none: it was uploaded); a link may also change alone.
    const iconLink = linkField(b.iconLink);
    const videoLink = linkField(b.videoLink);
    if (next.icon !== undefined) next.iconLink = iconLink ?? null;
    else if (iconLink !== undefined) next.iconLink = iconLink;
    if (video !== undefined) next.videoLink = video === null ? null : (videoLink ?? null);
    else if (videoLink !== undefined) next.videoLink = videoLink;
    if (!Object.keys(next).length && video === undefined) throw new HttpError(400, 'Değişiklik yok');
    const drop = [];
    await saving(() =>
      tx(async (c) => {
        const r = (await c.query('SELECT * FROM custom_gifts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
        if (!r) throw new HttpError(404, 'Hediye bulunamadı');
        const vals = [id];
        const sets = [];
        const set = (col, v) => {
          vals.push(v);
          sets.push(`${col} = $${vals.length}`);
        };
        if (next.name !== undefined) set('name', next.name);
        if (next.price !== undefined) set('price', next.price);
        if (next.minSvip !== undefined) set('min_svip', next.minSvip);
        if (next.emoji !== undefined) set('emoji', next.emoji);
        if (next.enabled !== undefined) set('enabled', next.enabled);
        // A gift moved to another shelf goes first there.
        if (next.cat !== undefined && next.cat !== r.cat) {
          set('cat', next.cat);
          set('sort', await firstSort(c, next.cat));
        }
        if (next.icon !== undefined) {
          set('icon_url', next.icon);
          drop.push(r.icon_url);
        }
        if (next.iconLink !== undefined) set('icon_link', next.iconLink);
        if (next.videoLink !== undefined) set('video_link', next.videoLink);
        if (video === null || video?.kind === 'stacked') {
          set('video_url', video?.url ?? null);
          set('video_bytes', video?.bytes ?? null);
          set('video_ms', video?.ms ?? null);
          set('video_v', video?.v ?? null);
          sets.push('job_status = NULL', 'job_source = NULL', 'job_error = NULL', 'job_tries = 0', 'job_preview = NULL');
          drop.push(r.video_url, r.job_source, r.job_preview);
        } else if (video?.kind === 'source') {
          set('job_source', video.url);
          set('job_fill', video.fill);
          set('job_opaque', video.opaque);
          sets.push("job_status = 'processing'", 'job_error = NULL', 'job_tries = 0', 'job_at = now()', 'job_preview = NULL');
          drop.push(r.job_source, r.job_preview);
        }
        set('updated_by', a.id);
        sets.push('updated_at = now()', "rev = nextval('custom_gift_rev')");
        const after = await c.query(`UPDATE custom_gifts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
        await audited(c, a.id, 'gift.update', { gift: id, before: auditOf(r), after: auditOf(after.rows[0]), ...panelDetail(a) }, clientIp(req));
      }),
    );
    // A file the gift still holds (the same one sent again) is kept by media.mjs; an icon made smaller replaced its upload.
    removeFiles([...drop, iconUpload].filter(Boolean));
    await refreshCustomGifts();
    if (video?.kind === 'source') kickJobs();
    return { gift: await oneGift(id) };
  },

  /**
   * A gift's file from a link the admin pasted ("ya da bağlantı yapıştır"): downloaded once here (link-fetch.mjs:
   * public addresses only, the slot's size limit, a time limit), what it is read from its first bytes, and put in
   * the storage as if it had been uploaded; the save then checks and converts it like any upload, and phones get it
   * from this server, never from the link. slot 'icon': a PNG or WebP; 'video': a ready MP4, a WebM or MOV source
   * or an SVGA. Each try (a refusal too) is an audit_events row with the link.
   */
  async 'POST /api/admin/gifts/fetch'(req) {
    const a = await admin(req);
    limit(`gift-fetch:${a.id}`, 10, 'Çok fazla bağlantı denemesi, biraz bekle');
    const b = await readJson(req, 4096);
    const pasted = typeof b.url === 'string' ? b.url.trim().slice(0, 2000) : null;
    const slot = b.slot === 'icon' || b.slot === 'video' ? b.slot : null;
    const note = (detail) => audited(db, a.id, 'gift.fetch', { slot, link: pasted, ...detail, ...panelDetail(a) }, clientIp(req)).catch(() => {});
    let counted = false;
    try {
      if (!slot) throw new HttpError(400, 'Bağlantı ikon ya da video için olmalı');
      const link = linkOf(b.url);
      if (!storageOn()) throw new HttpError(503, 'Dosya deposu ayarlı değil: bağlantıdan da yüklenemez');
      if (fetching >= FETCH_MAX) throw new HttpError(429, 'Şu an başka bağlantılar indiriliyor, biraz sonra tekrar dene');
      fetching++;
      counted = true;
      const out = await temp(async (dir) => {
        const file = path.join(dir, 'file');
        const got = await download(link, file, slot === 'icon' ? { max: LIMITS.iconBytes, ms: 60_000, tooBig: iconTooBig } : { max: LIMITS.sourceBytes, ms: 600_000, tooBig: videoTooBig });
        const type = sniff(got.head);
        const kind = await fetchedKind(slot, type, got.bytes);
        return { url: await storeFile(kind, a.id, file, type), kind, type, bytes: got.bytes, at: got.url };
      });
      await note({ kind: out.kind, type: out.type, bytes: out.bytes, file: keyOf(out.url), ...(out.at !== link ? { redirectedTo: out.at.slice(0, 2000) } : {}) });
      return {
        url: out.url,
        link,
        kind: out.kind,
        type: out.type,
        bytes: out.bytes,
        video: out.kind === 'giftvideo' ? 'stacked' : out.kind === 'giftsource' ? 'source' : null,
        svga: out.type === 'application/x-svga',
      };
    } catch (e) {
      await note({ refused: String(e?.message ?? e).slice(0, 300) });
      throw e;
    } finally {
      if (counted) fetching--;
    }
  },

  /**
   * An app's own gift back to the app's values: `fields` of RESET (cat with its VIP level, and its place when it was
   * on another shelf), or all of them but its place. Its replaced files go. Nothing to do for one never changed.
   */
  async 'POST /api/admin/gifts/reset'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 2048);
    if (typeof b.id === 'string' && ID.test(b.id)) throw new HttpError(400, 'Yalnız uygulamanın kendi hediyeleri orijinaline döner');
    const id = idOf(b.id, { app: true });
    let fields = RESET_ALL;
    if (b.fields !== undefined) {
      if (!Array.isArray(b.fields) || !b.fields.length || !b.fields.every((f) => RESET.includes(f))) throw new HttpError(400, `Geri alınabilenler: ${RESET.join(', ')}`);
      fields = [...new Set(b.fields)];
    }
    // The app's name may have been given to another gift meanwhile.
    if (fields.includes('name')) nameFree(GIFTS.get(id).name, id);
    const drop = [];
    await saving(() =>
      tx(async (c) => {
        const r = (await c.query('SELECT * FROM custom_gifts WHERE id = $1 FOR UPDATE', [id])).rows[0];
        if (!r) return;
        const sets = [];
        if (fields.includes('name')) sets.push('name = NULL');
        if (fields.includes('emoji')) sets.push('emoji = NULL');
        if (fields.includes('price')) sets.push('price = NULL');
        if (fields.includes('cat')) sets.push('cat = NULL', 'min_svip = NULL');
        if (fields.includes('enabled')) sets.push('enabled = NULL');
        // Moved to another shelf: its place there means nothing on its own one.
        if (fields.includes('sort') || (fields.includes('cat') && r.cat !== null)) sets.push('sort = NULL');
        if (fields.includes('icon')) {
          sets.push('icon_url = NULL', 'icon_link = NULL');
          drop.push(r.icon_url);
        }
        if (fields.includes('video')) {
          sets.push('video_url = NULL', 'video_bytes = NULL', 'video_ms = NULL', 'video_v = NULL', 'video_link = NULL', 'video_off = false');
          sets.push('job_status = NULL', 'job_source = NULL', 'job_error = NULL', 'job_tries = 0', 'job_fill = NULL', 'job_preview = NULL');
          drop.push(r.video_url, r.job_source, r.job_preview);
        }
        sets.push('updated_by = $2', 'updated_at = now()', "rev = nextval('custom_gift_rev')");
        const after = await c.query(`UPDATE custom_gifts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, a.id]);
        await audited(c, a.id, 'gift.reset', { gift: id, fields, before: auditOf(r), after: auditOf(after.rows[0]), ...panelDetail(a) }, clientIp(req));
      }),
    );
    removeFiles(drop.filter(Boolean));
    await refreshCustomGifts();
    return { gift: await oneGift(id) };
  },

  /** Off the shelves and the panel for good; the row stays for the history, its files go. An admin's gift only. */
  async 'POST /api/admin/gifts/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 1024);
    if (typeof b.id === 'string' && GIFTS.has(b.id)) throw new HttpError(400, 'Uygulamanın kendi hediyesi silinemez: raftan kaldırabilir ya da orijinaline döndürebilirsin');
    const id = idOf(b.id);
    const r = await tx(async (c) => {
      const r = (await c.query('SELECT * FROM custom_gifts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!r) throw new HttpError(404, 'Hediye bulunamadı');
      await c.query(
        "UPDATE custom_gifts SET deleted_at = now(), enabled = false, job_status = NULL, job_source = NULL, job_error = NULL, job_preview = NULL, updated_by = $2, updated_at = now(), rev = nextval('custom_gift_rev') WHERE id = $1",
        [id, a.id],
      );
      await audited(c, a.id, 'gift.delete', { gift: id, before: auditOf(r), after: null, ...panelDetail(a) }, clientIp(req));
      return r;
    });
    removeFiles([r.icon_url, r.video_url, r.job_source, r.job_preview].filter(Boolean));
    await refreshCustomGifts();
    return { deleted: true };
  },

  /** The order of a shelf: each id's place is its index in `ids` (lower first); the app's own gifts among them too. */
  async 'POST /api/admin/gifts/order'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 16_384);
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500) throw new HttpError(400, 'Sıra listesi geçersiz');
    const ids = b.ids.map((v) => idOf(v, { app: true }));
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Bir hediye sırada iki kez olamaz');
    const custom = ids.filter((id) => !GIFTS.has(id));
    const app = ids.filter((id) => GIFTS.has(id));
    // The order before, as the shelves show it now.
    const before = allGifts()
      .filter((g) => ids.includes(g.id))
      .map((g) => g.id);
    await tx(async (c) => {
      const r = await c.query('SELECT id FROM custom_gifts WHERE id = ANY($1::text[]) AND deleted_at IS NULL AND NOT builtin FOR UPDATE', [custom]);
      if (r.rowCount !== custom.length) throw new HttpError(404, 'Hediye bulunamadı');
      if (app.length) await appRows(c, app, a.id);
      await c.query(
        `UPDATE custom_gifts g SET sort = x.n - 1, rev = nextval('custom_gift_rev'), updated_by = $2, updated_at = now()
           FROM unnest($1::text[]) WITH ORDINALITY AS x(id, n) WHERE g.id = x.id AND g.sort IS DISTINCT FROM x.n - 1`,
        [ids, a.id],
      );
      await audited(c, a.id, 'gift.order', { before, after: ids, ...panelDetail(a) }, clientIp(req));
    });
    await refreshCustomGifts();
    return { gifts: await adminGifts(null, { app: app.length > 0 }) };
  },
};
