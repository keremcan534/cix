// Yönetim › Hediyeler: gifts the admins add, change, take down and order from the panel, with no app update
// (docs/HEDIYE_YONETIMI.md). The compiled gifts (catalog.mjs GIFTS, in step with the app) stay as they are; these come
// next to them, from the custom_gifts table (066).
//
//   GET  /api/admin/gifts                                  → { gifts, limits, convert, storage }
//   POST /api/admin/gifts        { name, price, cat, minSvip?, emoji?, enabled?, icon, video? } → { gift }
//   POST /api/admin/gifts/update { id, …any of the above; video: null takes it off }        → { gift }
//   POST /api/admin/gifts/delete { id }                    → { deleted }
//   POST /api/admin/gifts/order  { ids }                   → { gifts }   (each id's place: its index; lower first)
//   GET|HEAD /api/fx/g/<id>.mp4                            → a gift's stacked video (sendCustomFx, public)
//
// Admins only; every change is an audit_events row (who, what, before and after, from where). `icon` and `video.url`
// are files uploaded first (media.mjs kinds gifticon, giftvideo, giftsource). video: { url, kind: 'stacked' } is a
// ready stacked MP4 (colour in the top half, alpha below, docs/SEFFAF_VIDEO_POC.md), checked and used as it is;
// { url, kind: 'source', fill? } a transparent WebM (VP8/VP9 alpha), a ProRes 4444 .mov or an SVGA 2.x animation that
// this server turns into one in the background (ffmpeg; an SVGA through tools/svga-to-fx.py, `fill` its size on the
// screen), one at a time; the video in effect stays until the new one is done. Nothing here removes a background: a
// source without transparency is refused, and the panel says so.
//
// What the phones get: GET /api/catalog lists the enabled ones before the compiled gifts (catalogGifts: icon, emoji,
// custom: true; the app puts them first on their shelf) and their videos in `fx` at /api/fx/g/<id>.mp4?v=… (customFx). An older app shows only
// the gifts compiled into it, and its fx filter refuses that address, so it never downloads a clip it can't use. The
// catalog's and /api/config's `v` add customGiftsRev(), so a change here makes the phones read the catalog again. A
// gift is sent at this server's price like any other (gifts.mjs, lucky-bags.mjs giftOf).
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

import { GIFTS } from './catalog.mjs';
import { HttpError, auth, clientIp, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { FX_PATH, mp4Duration } from './fx.mjs';
import { downloadStored, keyOf, kindMax, readStored, removeFiles, sendFile, storageOn, storedUrl, verifyUpload, writeStored } from './media.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const POLL_MS = positive(env.CUSTOM_GIFTS_POLL_MS, 5000);
const FFMPEG = env.FFMPEG || 'ffmpeg';
const FFPROBE = env.FFPROBE || 'ffprobe';
const PYTHON = env.PYTHON || 'python3';
const SVGA_TOOL = path.join(import.meta.dirname, 'tools', 'svga-to-fx.py');
/** A conversion that fails for no reason of the file's own (storage, a restart) is tried this many times. */
const MAX_TRIES = 3;

export const CATS = ['hot', 'couple', 'gameplay', 'privilege'];
/** The rules the panel shows and every save checks. */
export const LIMITS = Object.freeze({
  nameMin: 2,
  nameMax: 24,
  priceMax: 1_000_000,
  svipMax: 10,
  iconBytes: kindMax('gifticon'),
  iconMinPx: 128,
  iconMaxPx: 1024,
  videoBytes: kindMax('giftvideo'),
  sourceBytes: kindMax('giftsource'),
  videoMinMs: 1000,
  videoMaxMs: 15_000,
  // What a source becomes: the size the phones show (stacked: twice as high), as the compiled clips (server/api/fx).
  width: 540,
  height: 960,
  fps: 20,
  // An SVGA's size on the screen (the share of the width its visible part takes); 0.6 unless the admin picks another.
  fills: [0.45, 0.6, 0.8, 1],
  fill: 0.6,
});
const ID = /^a[0-9]{1,9}$/;
const fmt = (n) => n.toLocaleString('tr-TR');
const mb = (n) => (n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const lower = (s) => s.toLocaleLowerCase('tr');

// --- The table in memory -----------------------------------------------------------------------------------
/** rev: the largest custom_gifts.rev (0: none yet); rows: id → the row as the rest of the server reads it. */
let snap = { rev: 0, rows: new Map() };

const viewOf = (r) =>
  Object.freeze({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    price: Number(r.price),
    cat: r.cat,
    minSvip: Number(r.min_svip),
    sort: Number(r.sort),
    enabled: r.enabled,
    deleted: !!r.deleted_at,
    icon: r.icon_url,
    video: r.video_url ? Object.freeze({ url: r.video_url, bytes: Number(r.video_bytes), ms: Number(r.video_ms ?? 0), v: r.video_v }) : null,
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
      const r = await db.query("SELECT coalesce(max(rev), 0) AS rev, count(*) FILTER (WHERE job_status = 'processing') AS jobs FROM custom_gifts");
      if (Number(r.rows[0].rev) !== snap.rev) await refreshCustomGifts();
      if (Number(r.rows[0].jobs) > 0) kickJobs();
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
/** The gifts on the shelves now, in their order. */
const listed = () => [...snap.rows.values()].filter((g) => g.enabled && !g.deleted);

/**
 * A gift that may be sent now, at this server's price: a compiled one (catalog.mjs GIFTS), or an admin's that is on
 * the shelves ({ id, name, price, cat, minSvip, custom: true }). Undefined for anything else.
 */
export function giftOf(id) {
  if (typeof id !== 'string') return undefined;
  const compiled = GIFTS.get(id);
  if (compiled) return compiled;
  const g = snap.rows.get(id);
  return g && g.enabled && !g.deleted ? { id: g.id, name: g.name, price: g.price, cat: g.cat, minSvip: g.minSvip, custom: true } : undefined;
}
/** A gift's name, a taken-down or deleted one's too (history lines, Şanslı çanta); null when nothing has this id. */
export const giftNameOf = (id) => GIFTS.get(id)?.name ?? snap.rows.get(id)?.name ?? null;
/** Every admin's gift that isn't deleted (the profile's Vitrin counts them). */
export const customGiftIds = () => [...snap.rows.values()].filter((g) => !g.deleted).map((g) => g.id);

/** GET /api/catalog: the admins' gifts on the shelves, for the phones that can draw them (an older app skips them). */
export const catalogGifts = () => listed().map((g) => ({ id: g.id, name: g.name, price: g.price, cat: g.cat, minSvip: g.minSvip, emoji: g.emoji, icon: g.icon, custom: true }));
const fxUrl = (id, v) => `${FX_PATH}g/${id}.mp4?v=${v}`;
/** GET /api/catalog `fx`: their videos, as fx.mjs lists the compiled ones. */
export const customFx = () => listed().filter((g) => g.video).map((g) => ({ kind: 'gift', id: g.id, url: fxUrl(g.id, g.video.v), bytes: g.video.bytes, ms: g.video.ms }));

/** GET or HEAD /api/fx/g/<id>.mp4: the gift's stacked video from the storage (a taken-down one's too, for the panel's preview). */
export async function sendCustomFx(req, res, name) {
  const m = /^(a[0-9]{1,9})\.mp4$/.exec(name);
  const g = m ? snap.rows.get(m[1]) : null;
  const key = g && !g.deleted && g.video ? keyOf(g.video.url) : null;
  if (!key) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  await sendFile(req, res, key);
}

// --- Checking the files ------------------------------------------------------------------------------------
/** A refusal about the file itself, shown to the admin as it is (a conversion that ends with one is not tried again). */
class FileError extends Error {}

/** A PNG's or WebP's size and whether it can be transparent, from its first bytes; null for anything else. */
export function imageInfo(b) {
  if (b.length >= 33 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') {
    const type = b[25];
    // Grey + alpha, RGBA, or a palette / colour key with a tRNS chunk before the pixels.
    let alpha = type === 4 || type === 6;
    for (let p = 8; !alpha && p + 8 <= b.length; ) {
      const len = b.readUInt32BE(p);
      const name = b.toString('latin1', p + 4, p + 8);
      if (name === 'tRNS') alpha = true;
      if (name === 'IDAT' || name === 'IEND') break;
      p += 12 + len;
    }
    return { type: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), alpha };
  }
  if (b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8X') return { type: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), alpha: (b[20] & 0x10) !== 0 };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b.readUInt32LE(21);
      return { type: 'webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff), alpha: ((bits >>> 28) & 1) === 1 };
    }
    if (chunk === 'VP8 ' && b.readUIntBE(23, 3) === 0x9d012a) return { type: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, alpha: false };
  }
  return null;
}

/** The icon at `url`: uploaded as a gift icon, a transparent PNG or WebP, square or nearly, 128–1024 px. */
async function checkIcon(url) {
  const key = keyOf(url);
  if (!key?.startsWith('gifticon/')) throw new HttpError(400, 'İkonu önce yükle');
  await verifyUpload(url, 'gifticon');
  // A stand-in storage (most tests) has nothing to read.
  if (env.UPLOAD_VERIFY === '0') return;
  const info = imageInfo(await readStored(key, LIMITS.iconBytes));
  if (!info) throw new HttpError(400, 'İkon PNG ya da WebP olmalı');
  const { width: w, height: h } = info;
  if (Math.min(w, h) < LIMITS.iconMinPx || Math.max(w, h) > LIMITS.iconMaxPx) throw new HttpError(400, `İkon ${LIMITS.iconMinPx}–${LIMITS.iconMaxPx} piksel olmalı (bu ${w} × ${h})`);
  if (Math.max(w, h) / Math.min(w, h) > 1.25) throw new HttpError(400, `İkon kare olmalı (bu ${w} × ${h})`);
  if (!info.alpha) throw new HttpError(400, 'İkon saydam olmalı: arka planı silinmiş PNG ya da WebP yükle');
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
const OPAQUE_TEXT = 'Videonun hiçbir yeri saydam değil: arka planı silinmemiş görünüyor. Sunucu arka plan silemez; arka planı silinmiş (saydam) bir kaynak yükle.';

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
async function checkStacked(url) {
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
      if (m.ymin > OPAQUE) throw new HttpError(400, OPAQUE_TEXT);
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
export function svgaInfo(buf) {
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
  if (ms < LIMITS.videoMinMs) throw new FileError(`Video en az ${seconds(LIMITS.videoMinMs)} saniye olmalı`);
  return { ...p, fps, ms };
}

/** The stacked MP4 made from the SVGA at `input` by tools/svga-to-fx.py (its own sound kept): { buf, ms }. */
async function convertSvga(input, dir, fill) {
  svgaInfo(await fs.promises.readFile(input));
  const output = path.join(dir, 'stacked.mp4');
  const r = await run(PYTHON, ['-I', '-X', 'utf8', SVGA_TOOL, input, output, '--fill', String(fill)], { timeout: 10 * 60_000, keep: 0, nice: true });
  if (r.code !== 0) {
    console.error('gift svga', r.code, r.err.slice(-400));
    if (/nothing visible/.test(r.err)) throw new FileError('SVGA’da görünen bir şey yok');
    throw new FileError('SVGA çevrilemedi: dosya bozuk ya da desteklenmeyen bir özellik var');
  }
  return stackedResult(output);
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
export async function convertSource(input, dir) {
  const p = await probe(input);
  const v = p.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new FileError('Videoda görüntü yok');
  if (!hasAlpha(v)) {
    throw new FileError('Bu videoda saydamlık (alfa kanalı) yok. Sunucu arka plan silemez: arka planı silinmiş, saydam bir WebM (VP8/VP9 alfa) ya da ProRes 4444 .mov yükle.');
  }
  const length = Number(p.format?.duration ?? 0);
  if (length * 1000 > LIMITS.videoMaxMs + 1000) throw new FileError(`Video en çok ${seconds(LIMITS.videoMaxMs)} saniye olabilir (bu ${seconds(length * 1000)} sn)`);
  const output = path.join(dir, 'stacked.mp4');
  const r = await run(FFMPEG, convertArgs(input, output, v.codec_name), { timeout: 10 * 60_000, keep: 0, nice: true });
  if (r.code !== 0) {
    console.error('gift video ffmpeg', r.code, r.err.slice(-400));
    throw new FileError('Video çevrilemedi: kaynak okunamadı ya da bozuk');
  }
  return stackedResult(output);
}

/** A converted video, checked like an uploaded one: somewhere transparent, small enough, long enough. */
async function stackedResult(output) {
  const m = await matteOf(output);
  if (m && m.ymin > OPAQUE) throw new FileError(OPAQUE_TEXT);
  const buf = await fs.promises.readFile(output);
  if (buf.length > LIMITS.videoBytes) throw new FileError(`Çevrilen video çok büyük (${mb(buf.length)} MB, en çok ${mb(LIMITS.videoBytes)} MB): daha kısa ya da sade bir kaynak dene`);
  const ms = mp4Duration(buf);
  if (ms < LIMITS.videoMinMs) throw new FileError(`Video en az ${seconds(LIMITS.videoMinMs)} saniye olmalı`);
  return { buf, ms };
}

const audited = (c, actor, action, detail, ip = '') =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [actor, action, JSON.stringify(detail), ip]);

/** One job: the source downloaded, converted, stored, and put in effect unless the gift moved on meanwhile. */
async function convertJob(row) {
  const src = keyOf(row.job_source);
  try {
    if (!src) throw new FileError('Kaynak video bulunamadı, yeniden yükle');
    const out = await temp(async (dir) => {
      const input = path.join(dir, `source.${src.split('.').pop()}`);
      await downloadStored(src, input, LIMITS.sourceBytes);
      return src.endsWith('.svga') ? convertSvga(input, dir, row.job_fill === null ? LIMITS.fill : Number(row.job_fill)) : convertSource(input, dir);
    });
    // Under the uploader's folder, like every stored file (media.mjs FILE_KEY).
    const key = `giftvideo/${src.split('/')[1]}/${row.id}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('base64url')}.mp4`;
    const url = await writeStored(key, out.buf, 'video/mp4');
    const done = await tx(async (c) => {
      const cur = (await c.query('SELECT video_url, job_source, deleted_at FROM custom_gifts WHERE id = $1 FOR UPDATE', [row.id])).rows[0];
      if (!cur || cur.deleted_at || cur.job_source !== row.job_source) return null;
      await c.query(
        `UPDATE custom_gifts SET video_url = $2, video_bytes = $3, video_ms = $4, video_v = $5, job_status = NULL, job_source = NULL, job_error = NULL, job_tries = 0,
                rev = nextval('custom_gift_rev') WHERE id = $1`,
        [row.id, url, out.buf.length, out.ms, sha12(out.buf)],
      );
      await audited(c, null, 'gift.video_ready', { gift: row.id, bytes: out.buf.length, ms: out.ms });
      return { old: cur.video_url };
    });
    // Replaced, taken off or deleted while it ran: the new file goes, nothing else changes.
    if (!done) return removeFiles([url]);
    removeFiles([done.old, row.job_source].filter(Boolean));
    await refreshCustomGifts();
    console.log(`gift video ready: ${row.id}, ${out.buf.length} bytes, ${out.ms} ms`);
  } catch (e) {
    const file = e instanceof FileError;
    if (!file) console.error('gift video job', row.id, String(e?.message ?? e).slice(0, 200));
    if (file || row.job_tries >= MAX_TRIES) {
      const error = (file ? e.message : 'Video çevrilemedi, yeniden yükle').slice(0, 300);
      const r = await db.query("UPDATE custom_gifts SET job_status = 'failed', job_error = $3, job_source = NULL WHERE id = $1 AND job_source = $2", [row.id, row.job_source, error]);
      if (r.rowCount) {
        await audited(db, null, 'gift.video_failed', { gift: row.id, error });
        removeFiles([row.job_source]);
      }
    } else {
      await db.query("UPDATE custom_gifts SET job_at = now() + $3 * interval '30 seconds' WHERE id = $1 AND job_source = $2", [row.id, row.job_source, row.job_tries]);
    }
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
        for (;;) {
          const r = await db.query(
            `UPDATE custom_gifts SET job_tries = job_tries + 1
              WHERE id = (SELECT id FROM custom_gifts WHERE job_status = 'processing' AND deleted_at IS NULL AND job_tries < $1 AND job_at <= now() ORDER BY job_at LIMIT 1)
              RETURNING id, job_source, job_tries, job_fill`,
            [MAX_TRIES],
          );
          if (!r.rowCount) break;
          await convertJob(r.rows[0]);
        }
      } while (again);
      // Cut off too often (restarts, the storage): given up on, so the panel says so.
      const stuck = await db.query(
        `UPDATE custom_gifts g SET job_status = 'failed', job_error = 'Video çevrilemedi, yeniden yükle', job_source = NULL
           FROM (SELECT id, job_source FROM custom_gifts WHERE job_status = 'processing' AND job_tries >= $1 FOR UPDATE) x
          WHERE g.id = x.id RETURNING x.job_source`,
        [MAX_TRIES],
      );
      if (stuck.rowCount) removeFiles(stuck.rows.map((x) => x.job_source).filter(Boolean));
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
const idOf = (v) => {
  if (typeof v !== 'string' || !ID.test(v)) throw new HttpError(400, 'Geçersiz hediye');
  return v;
};
const nameOf = (v) => text(v, LIMITS.nameMin, LIMITS.nameMax, 'Ad').replace(/\s+/g, ' ');
const priceOf = (v) => {
  const n = int(v, 1, LIMITS.priceMax);
  if (!n) throw new HttpError(400, `Fiyat 1–${fmt(LIMITS.priceMax)} jeton arasında bir tam sayı olmalı`);
  return n;
};
const catOf = (v) => {
  if (!CATS.includes(v)) throw new HttpError(400, 'Raf Popüler, İkili, Kutlama ya da Özel olmalı');
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
/** No two gifts on the shelves with one name: the compiled ones included. */
function nameFree(name, self) {
  const n = lower(name);
  if ([...GIFTS.values()].some((g) => lower(g.name) === n)) throw new HttpError(409, `“${name}” uygulamadaki bir hediyenin adı, başka bir ad seç`);
  if ([...snap.rows.values()].some((g) => !g.deleted && g.id !== self && lower(g.name) === n)) throw new HttpError(409, `“${name}” adında bir hediye zaten var`);
}
/** video in a body: undefined (unchanged), null (taken off), or a checked stacked video or source. */
async function videoOf(v) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const url = typeof o.url === 'string' ? o.url : '';
  if (o.kind === 'stacked') return { kind: 'stacked', ...(await checkStacked(url)) };
  if (o.kind === 'source') return { kind: 'source', ...(await checkSource(url, o.fill)) };
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
/** What the audit keeps of a row. */
const auditOf = (r) =>
  r && { name: r.name, emoji: r.emoji, price: Number(r.price), cat: r.cat, minSvip: Number(r.min_svip), enabled: r.enabled, icon: r.icon_url, video: r.video_url ?? null, job: r.job_status ?? null };
const SHELF_ORDER = `array_position(ARRAY['hot', 'couple', 'gameplay', 'privilege'], g.cat), g.sort, length(g.id), g.id`;

/** The panel's view of gifts that aren't deleted (all, or `ids`), with how often each was sent. */
async function adminGifts(ids = null) {
  const r = await db.query(
    `SELECT g.*, u.name AS updated_by_name FROM custom_gifts g LEFT JOIN users u ON u.id = g.updated_by
      WHERE g.deleted_at IS NULL AND ($1::text[] IS NULL OR g.id = ANY($1::text[])) ORDER BY ${SHELF_ORDER}`,
    [ids],
  );
  const sent = new Map();
  if (r.rowCount) {
    const s = await db.query("SELECT gift_id, sum(count)::bigint AS n, sum(total)::bigint AS coins FROM gift_events WHERE gift_id LIKE 'a%' AND gift_id = ANY($1::text[]) GROUP BY gift_id", [
      r.rows.map((x) => x.id),
    ]);
    for (const x of s.rows) sent.set(x.gift_id, { count: Number(x.n), coins: Number(x.coins) });
  }
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    emoji: x.emoji,
    price: Number(x.price),
    cat: x.cat,
    minSvip: Number(x.min_svip),
    sort: Number(x.sort),
    enabled: x.enabled,
    icon: x.icon_url,
    // At this server (the fx route serves it for the preview even while the gift is taken off).
    video: x.video_url ? { url: fxUrl(x.id, x.video_v), bytes: Number(x.video_bytes), ms: Number(x.video_ms ?? 0) } : null,
    job: x.job_status ? { status: x.job_status, error: x.job_error ?? null } : null,
    sent: sent.get(x.id) ?? { count: 0, coins: 0 },
    createdAt: x.created_at,
    updatedAt: x.updated_at,
    updatedBy: x.updated_by ? { id: x.updated_by, name: x.updated_by_name ?? null } : null,
  }));
}
const oneGift = async (id) => (await adminGifts([id]))[0];
const writeLimit = (a) => limit(`gifts-admin:${a.id}`, 60, 'Çok fazla deneme, biraz bekle');

export const customGiftRoutes = {
  async 'GET /api/admin/gifts'(req) {
    await admin(req);
    return { gifts: await adminGifts(), limits: LIMITS, convert: await canConvert(), svga: await canSvga(), storage: storageOn() };
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
    await checkIcon(b.icon);
    const video = await videoOf(b.video ?? null);
    const stacked = video?.kind === 'stacked' ? video : null;
    const id = await saving(() =>
      tx(async (c) => {
        const id = `a${(await c.query("SELECT nextval('custom_gift_ids') AS n")).rows[0].n}`;
        const first = Number((await c.query('SELECT coalesce(min(sort), 1) - 1 AS s FROM custom_gifts WHERE cat = $1 AND deleted_at IS NULL', [cat])).rows[0].s);
        const r = await c.query(
          `INSERT INTO custom_gifts (id, name, emoji, price, cat, min_svip, sort, enabled, icon_url, video_url, video_bytes, video_ms, video_v, job_status, job_source, job_fill,
                                     created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $17) RETURNING *`,
          [id, name, emoji, price, cat, minSvip, first, b.enabled !== false, b.icon, stacked?.url ?? null, stacked?.bytes ?? null, stacked?.ms ?? null, stacked?.v ?? null,
            video?.kind === 'source' ? 'processing' : null, video?.kind === 'source' ? video.url : null, video?.kind === 'source' ? video.fill : null, a.id],
        );
        await audited(c, a.id, 'gift.create', { gift: id, before: null, after: auditOf(r.rows[0]) }, clientIp(req));
        return id;
      }),
    );
    await refreshCustomGifts();
    if (video?.kind === 'source') kickJobs();
    return { gift: await oneGift(id) };
  },

  /** Changes what the body names; a new icon or video replaces the old file, which is then deleted. */
  async 'POST /api/admin/gifts/update'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 8192);
    const id = idOf(b.id);
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
    if (b.icon !== undefined && b.icon !== cur.icon) {
      if (typeof b.icon !== 'string' || !b.icon) throw new HttpError(400, 'İkonu önce yükle');
      await checkIcon(b.icon);
      next.icon = b.icon;
    }
    const video = await videoOf(b.video);
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
          set('sort', Number((await c.query('SELECT coalesce(min(sort), 1) - 1 AS s FROM custom_gifts WHERE cat = $1 AND deleted_at IS NULL', [next.cat])).rows[0].s));
        }
        if (next.icon !== undefined) {
          set('icon_url', next.icon);
          drop.push(r.icon_url);
        }
        if (video === null || video?.kind === 'stacked') {
          set('video_url', video?.url ?? null);
          set('video_bytes', video?.bytes ?? null);
          set('video_ms', video?.ms ?? null);
          set('video_v', video?.v ?? null);
          sets.push('job_status = NULL', 'job_source = NULL', 'job_error = NULL', 'job_tries = 0');
          drop.push(r.video_url, r.job_source);
        } else if (video?.kind === 'source') {
          set('job_source', video.url);
          set('job_fill', video.fill);
          sets.push("job_status = 'processing'", 'job_error = NULL', 'job_tries = 0', 'job_at = now()');
          drop.push(r.job_source);
        }
        set('updated_by', a.id);
        sets.push('updated_at = now()', "rev = nextval('custom_gift_rev')");
        const after = await c.query(`UPDATE custom_gifts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
        await audited(c, a.id, 'gift.update', { gift: id, before: auditOf(r), after: auditOf(after.rows[0]) }, clientIp(req));
      }),
    );
    // A file the gift still holds (the same one sent again) is kept by media.mjs.
    removeFiles(drop.filter(Boolean));
    await refreshCustomGifts();
    if (video?.kind === 'source') kickJobs();
    return { gift: await oneGift(id) };
  },

  /** Off the shelves and the panel for good; the row stays for the history, its files go. */
  async 'POST /api/admin/gifts/delete'(req) {
    const a = await admin(req);
    writeLimit(a);
    const id = idOf((await readJson(req, 1024)).id);
    const r = await tx(async (c) => {
      const r = (await c.query('SELECT * FROM custom_gifts WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
      if (!r) throw new HttpError(404, 'Hediye bulunamadı');
      await c.query(
        "UPDATE custom_gifts SET deleted_at = now(), enabled = false, job_status = NULL, job_source = NULL, job_error = NULL, updated_by = $2, updated_at = now(), rev = nextval('custom_gift_rev') WHERE id = $1",
        [id, a.id],
      );
      await audited(c, a.id, 'gift.delete', { gift: id, before: auditOf(r), after: null }, clientIp(req));
      return r;
    });
    removeFiles([r.icon_url, r.video_url, r.job_source].filter(Boolean));
    await refreshCustomGifts();
    return { deleted: true };
  },

  /** The order of a shelf: each id's place is its index in `ids` (lower first). */
  async 'POST /api/admin/gifts/order'(req) {
    const a = await admin(req);
    writeLimit(a);
    const b = await readJson(req, 16_384);
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500) throw new HttpError(400, 'Sıra listesi geçersiz');
    const ids = b.ids.map(idOf);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Bir hediye sırada iki kez olamaz');
    await tx(async (c) => {
      const r = await c.query('SELECT id, sort FROM custom_gifts WHERE id = ANY($1::text[]) AND deleted_at IS NULL ORDER BY sort, length(id), id FOR UPDATE', [ids]);
      if (r.rowCount !== ids.length) throw new HttpError(404, 'Hediye bulunamadı');
      await c.query(
        `UPDATE custom_gifts g SET sort = x.n - 1, rev = nextval('custom_gift_rev'), updated_by = $2, updated_at = now()
           FROM unnest($1::text[]) WITH ORDINALITY AS x(id, n) WHERE g.id = x.id AND g.sort <> x.n - 1`,
        [ids, a.id],
      );
      await audited(c, a.id, 'gift.order', { before: r.rows.map((x) => x.id), after: ids }, clientIp(req));
    });
    await refreshCustomGifts();
    return { gifts: await adminGifts() };
  },
};
