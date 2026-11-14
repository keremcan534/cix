// Yönetim › Hediyeler (custom-gifts.mjs) against a real Postgres and a stand-in bucket: an admin adds a gift with
// its icon and video, the catalog hands it to every phone (an older app's filters skip it), it is sent at the
// server's price, its price, shelf, order and on/off change without an app update, a transparent source is turned
// into the stacked video on the server (one without transparency is refused: no background removal), and a deleted
// gift is gone from the shelves while its history stays. Every step is audited. The video checks need ffmpeg (CI
// installs it); without it those tests are skipped.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { convertArgs } from '../custom-gifts.mjs';
import { startApi } from './harness.mjs';

const CDN = 'https://pub-test.r2.dev';
const S3_PORT = 22000 + (process.pid % 900);
/** The bucket: key → { body, type }. Signed requests only; GET answers ranges like the real one. */
const stored = new Map();
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.searchParams.get('X-Amz-Signature') || !u.pathname.startsWith('/media/')) return res.writeHead(403).end();
  const key = decodeURIComponent(u.pathname.slice('/media/'.length));
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => {
      stored.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] ?? '' });
      res.writeHead(200).end();
    });
    return;
  }
  const f = stored.get(key);
  if (req.method === 'DELETE') return void (stored.delete(key), res.writeHead(204).end());
  if (!f) return res.writeHead(404).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
  const base = { 'content-type': f.type, etag: '"e1"' };
  if (req.method === 'HEAD') return res.writeHead(200, { ...base, 'content-length': String(f.body.length) }).end();
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (m) {
    const from = Number(m[1]);
    const to = m[2] ? Math.min(Number(m[2]), f.body.length - 1) : f.body.length - 1;
    const part = f.body.subarray(from, to + 1);
    return res.writeHead(206, { ...base, 'content-length': String(part.length), 'content-range': `bytes ${from}-${to}/${f.body.length}` }).end(part);
  }
  res.writeHead(200, { ...base, 'content-length': String(f.body.length) }).end(f.body);
});
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

const h = startApi({
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: CDN,
  UPLOAD_VERIFY: '1',
  PUBLIC_URL: 'self',
  RATE_FILES: '100000',
  CUSTOM_GIFTS_POLL_MS: '200',
});
const { call } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j.error}`);
  if (re) assert.match(j.error, re);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Files ---------------------------------------------------------------------------------------------------
/** A PNG of w × h: a pink disc, transparent around it (alpha) or on white (no alpha channel). */
function png(w, h, { alpha = true } = {}) {
  const bpp = alpha ? 4 : 3;
  const row = w * bpp + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * bpp;
      const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 3) ** 2;
      raw[o] = 255;
      raw[o + 1] = inside ? 80 : 255;
      raw[o + 2] = inside ? 120 : 255;
      if (alpha) raw[o + 3] = inside ? 255 : 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((zlib.crc32?.(body) ?? 0) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ffmpegOk = spawnSync(FFMPEG, ['-version']).status === 0 && spawnSync(process.env.FFPROBE || 'ffprobe', ['-version']).status === 0;
const NO_FFMPEG = ffmpegOk ? false : 'ffmpeg yok';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-test-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const ff = (args) => {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args]);
  assert.equal(r.status, 0, String(r.stderr));
};
/** Test videos: a red box moving on a transparent ground (WebM VP9 with alpha), the same box on black without alpha,
 *  the stacked MP4 the server makes from the first, and two that only look like one (a plain portrait video; a 1:4
 *  picture whose bottom half is colour, not a mask). 2 s each, small. */
const files = {};
function makeFiles() {
  if (!ffmpegOk) return;
  const box = "drawbox=x='20+t*40':y=140:w=120:h=200:color=red@1:t=fill";
  files.source = path.join(dir, 'kaynak.webm');
  ff(['-f', 'lavfi', '-i', `color=c=black@0:s=270x480:r=20:d=2,format=rgba,${box}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '300k', files.source]);
  files.opaque = path.join(dir, 'opak.webm');
  ff(['-f', 'lavfi', '-i', `color=c=black:s=270x480:r=20:d=2,${box}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '300k', files.opaque]);
  files.stacked = path.join(dir, 'yigilmis.mp4');
  ff(convertArgs(files.source, files.stacked, 'vp9').slice(4));
  files.plain = path.join(dir, 'duz.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc=s=540x960:r=20:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', files.plain]);
  files.tall = path.join(dir, 'uzun.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc=s=540x1920:r=20:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', files.tall]);
}

// --- SVGA 2.x: a zlib-compressed protobuf MovieEntity (params, images, sprites with per-frame placements) ------
const PYTHON = process.env.PYTHON || 'python3';
const NO_SVGA = ffmpegOk && spawnSync(PYTHON, ['-I', '-c', 'import numpy, PIL']).status === 0 ? false : 'ffmpeg, Python, numpy ya da Pillow yok';
const varint = (n) => {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return Buffer.from(out);
};
const pb = {
  bytes: (f, buf) => Buffer.concat([varint(f * 8 + 2), varint(buf.length), buf]),
  f32: (f, x) => {
    const b = Buffer.alloc(4);
    b.writeFloatLE(x);
    return Buffer.concat([varint(f * 8 + 5), b]);
  },
  int: (f, n) => Buffer.concat([varint(f * 8), varint(n)]),
};
/** An SVGA of `frames` frames at 20 fps: the pink disc (png) sliding to the right on a transparent 200 × 200 canvas. */
function svga(frames = 30) {
  const params = Buffer.concat([pb.f32(1, 200), pb.f32(2, 200), pb.int(3, 20), pb.int(4, frames)]);
  const image = Buffer.concat([pb.bytes(1, Buffer.from('disc')), pb.bytes(2, png(128, 128))]);
  const frame = (k) =>
    Buffer.concat([
      pb.f32(1, 1),
      pb.bytes(2, Buffer.concat([pb.f32(1, 0), pb.f32(2, 0), pb.f32(3, 100), pb.f32(4, 100)])),
      pb.bytes(3, Buffer.concat([pb.f32(1, 1), pb.f32(2, 0), pb.f32(3, 0), pb.f32(4, 1), pb.f32(5, 10 + k * 2), pb.f32(6, 50)])),
    ]);
  const sprite = Buffer.concat([pb.bytes(1, Buffer.from('disc')), ...Array.from({ length: frames }, (_, k) => pb.bytes(2, frame(k)))]);
  return zlib.deflateSync(Buffer.concat([pb.bytes(1, Buffer.from('2.0')), pb.bytes(2, params), pb.bytes(3, image), pb.bytes(4, sprite)]));
}

/** Uploads `body` as `kind` the way the app does; the address the app was given for it (this server's). */
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
const keyOfUrl = (url) => url.replace(/^.*\/api\/media\/f\//, '');

let admin;
let alice;
let bob;
/** Another admin: uploads are limited per person and minute (media.mjs), and these tests upload many files. */
const freshAdmin = async () => (admin = await h.account(`Yönetici ${Math.random().toString(36).slice(2, 6)}`, 'admin'));

const catalog = () => ok(call('GET', '/api/catalog'), 'katalog');
const panel = () => ok(call('GET', '/api/admin/gifts', null, admin.session), 'panel');
const send = (giftId, count = 1, who = alice) => call('POST', '/api/gifts/send', { to: bob.user.id, giftId, count, ref: `g-${giftId}-${Math.random().toString(36).slice(2, 12)}` }, who.session);
async function newGift(fields = {}) {
  const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
  return (await ok(call('POST', '/api/admin/gifts', { name: `Yıldız ${Math.random().toString(36).slice(2, 6)}`, price: 1500, cat: 'hot', icon, ...fields }, admin.session), 'hediye ekle')).gift;
}
/** Waits until the gift's conversion is over (no job running) and the catalog lists what the panel shows; its panel view. */
async function settled(id, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const g = (await panel()).gifts.find((x) => x.id === id);
    if (!g || g.job?.status !== 'processing') {
      // The table is written first, then the server's copy of it is read again: the catalog follows a moment later.
      if (!g?.video || (await catalog()).fx.some((x) => x.id === id && x.url === g.video.url) || Date.now() > end) return g;
    }
    if (Date.now() > end) throw new Error(`${id}: çevirme bitmedi`);
    await sleep(200);
  }
}

describe('Yönetim › Hediyeler', () => {
  // Inside the suite: the API is up by then (startApi's hook).
  before(async () => {
    makeFiles();
    admin = await h.account('Hediye Yöneticisi', 'admin');
    alice = await h.signUp('Hediye Gönderen');
    bob = await h.signUp('Hediye Alan');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 100000, ref: `topup-${Date.now()}` }, alice.session), 'yükleme');
  });

  test('yalnız yönetici: panel, ekleme ve dosya yüklemesi', async () => {
    await refused(call('GET', '/api/admin/gifts', null, alice.session), 403);
    await refused(call('POST', '/api/admin/gifts', { name: 'Olmaz', price: 10, cat: 'hot' }, alice.session), 403);
    for (const kind of ['gifticon', 'giftvideo', 'giftsource']) {
      await refused(call('POST', '/api/media/upload-url', { kind, contentType: kind === 'gifticon' ? 'image/png' : kind === 'giftvideo' ? 'video/mp4' : 'video/webm', size: 100 }, alice.session), 403);
    }
    // Sizes and types of the kinds.
    await refused(call('POST', '/api/media/upload-url', { kind: 'gifticon', contentType: 'image/jpeg', size: 100 }, admin.session), 400, /türü/);
    await refused(call('POST', '/api/media/upload-url', { kind: 'gifticon', contentType: 'image/png', size: 2 * 1024 * 1024 }, admin.session), 400, /1 MB/);
    await refused(call('POST', '/api/media/upload-url', { kind: 'giftsource', contentType: 'video/webm', size: 101 * 1024 * 1024 }, admin.session), 400, /100 MB/);
    const p = await panel();
    assert.deepEqual(p.gifts, []);
    assert.equal(p.storage, true);
    assert.equal(p.limits.priceMax, 1_000_000);
  });

  test('eklenen hediye herkesin kataloğunda: ikon, fiyat, raf; sürüm artar; eski uygulamanın süzgeci atlar', async () => {
    const before = await catalog();
    const config0 = await ok(call('GET', '/api/config'));
    const g = await newGift({ name: 'Ay Işığı', price: 2500, emoji: '🌙' });
    assert.match(g.id, /^a\d+$/);
    assert.equal(g.enabled, true);
    assert.ok(g.icon.startsWith(`${h.base}/api/media/f/gifticon/${admin.user.id}/`), g.icon);
    const c = await catalog();
    assert.ok(c.v > before.v, 'katalog sürümü arttı');
    assert.equal((await ok(call('GET', '/api/config'))).v, c.v, '/api/config aynı sürümü söyler');
    assert.ok(c.v > config0.v);
    // First in the list, the compiled ones after it, unchanged.
    assert.deepEqual(c.gifts[0], { id: g.id, name: 'Ay Işığı', price: 2500, cat: 'hot', minSvip: 0, emoji: '🌙', icon: g.icon, custom: true });
    assert.deepEqual(c.gifts.slice(1), before.gifts);
    // The icon opens at this server; the database keeps the storage's address.
    const icon = await fetch(g.icon);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/png');
    const kept = (await q('SELECT icon_url FROM custom_gifts WHERE id = $1', [g.id])).rows[0].icon_url;
    assert.ok(kept.startsWith(`${CDN}/gifticon/`));
    // What an older app does with the list (lib/live/catalog-live idList, visibleGifts): every id is well formed, so
    // the list is used, and the new id is simply not among its compiled gifts.
    assert.ok(c.gifts.every((x) => /^[A-Za-z0-9_-]{1,32}$/.test(x.id)));
  });

  test('ikon kuralları: saydam, kare, 128–1024 piksel, PNG/WebP; ad, fiyat, raf, VIP', async () => {
    const opaque = await upload(admin, 'gifticon', png(256, 256, { alpha: false }), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'Opak', price: 10, cat: 'hot', icon: opaque }, admin.session), 400, /saydam/);
    const small = await upload(admin, 'gifticon', png(64, 64), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'Küçük', price: 10, cat: 'hot', icon: small }, admin.session), 400, /128–1024/);
    const wide = await upload(admin, 'gifticon', png(512, 256), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'Geniş', price: 10, cat: 'hot', icon: wide }, admin.session), 400, /kare/);
    const notPng = await upload(admin, 'gifticon', Buffer.from('bu bir resim değil'), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'Bozuk', price: 10, cat: 'hot', icon: notPng }, admin.session), 400, /PNG ya da WebP/);
    const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'İkonsuz', price: 10, cat: 'hot' }, admin.session), 400, /İkon/);
    await refused(call('POST', '/api/admin/gifts', { name: 'Gül', price: 10, cat: 'hot', icon }, admin.session), 409, /uygulamadaki/);
    await refused(call('POST', '/api/admin/gifts', { name: 'ay ışığı', price: 10, cat: 'hot', icon }, admin.session), 409, /zaten var/);
    await refused(call('POST', '/api/admin/gifts', { name: 'Bedava', price: 0, cat: 'hot', icon }, admin.session), 400, /Fiyat/);
    await refused(call('POST', '/api/admin/gifts', { name: 'Pahalı', price: 1_000_001, cat: 'hot', icon }, admin.session), 400, /Fiyat/);
    await refused(call('POST', '/api/admin/gifts', { name: 'Rafsız', price: 10, cat: 'lucky', icon }, admin.session), 400, /Raf/);
    await refused(call('POST', '/api/admin/gifts', { name: 'Özel', price: 10, cat: 'privilege', minSvip: 11, icon }, admin.session), 400, /VIP/);
    await refused(call('POST', '/api/admin/gifts', { name: 'Harfli', price: 10, cat: 'hot', emoji: 'abc', icon }, admin.session), 400, /Emoji/);
    // An icon that isn't a gift icon (someone's avatar) is never taken.
    const avatar = await upload(alice, 'avatar', png(256, 256), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'Avatar', price: 10, cat: 'hot', icon: avatar }, admin.session), 400, /İkon/);
  });

  test('gönderim sunucunun fiyatıyla; fiyat ve kapatma anında geçer', async () => {
    const g = await newGift({ price: 1200 });
    const coins0 = (await ok(call('GET', '/api/me', null, alice.session))).user.coins;
    const diamonds0 = (await ok(call('GET', '/api/me', null, bob.session))).user.diamonds;
    const r = await ok(send(g.id, 5), 'gönder');
    assert.equal(r.total, 6000);
    assert.equal(r.user.coins, coins0 - 6000);
    assert.equal((await ok(call('GET', '/api/me', null, bob.session))).user.diamonds, diamonds0 + 6000);
    const ev = (await q('SELECT gift_id, count, unit_price, total FROM gift_events WHERE sender = $1 ORDER BY id DESC LIMIT 1', [alice.user.id])).rows[0];
    assert.deepEqual({ ...ev, unit_price: Number(ev.unit_price), total: Number(ev.total) }, { gift_id: g.id, count: 5, unit_price: 1200, total: 6000 });
    // A new price is the price from now on.
    await ok(call('POST', '/api/admin/gifts/update', { id: g.id, price: 2000 }, admin.session), 'fiyat');
    assert.equal((await catalog()).gifts.find((x) => x.id === g.id).price, 2000);
    assert.equal((await ok(send(g.id), 'gönder')).total, 2000);
    // Taken off: not listed, not sent; back on: both again.
    await ok(call('POST', '/api/admin/gifts/update', { id: g.id, enabled: false }, admin.session), 'kapat');
    assert.ok(!(await catalog()).gifts.some((x) => x.id === g.id));
    await refused(send(g.id), 400, /artık yok/);
    assert.equal((await panel()).gifts.find((x) => x.id === g.id).enabled, false, 'panelde kalır');
    await ok(call('POST', '/api/admin/gifts/update', { id: g.id, enabled: true }, admin.session), 'aç');
    assert.ok((await catalog()).gifts.some((x) => x.id === g.id));
    assert.equal((await ok(send(g.id), 'gönder')).total, 2000);
    // How often it went, for the panel.
    assert.deepEqual((await panel()).gifts.find((x) => x.id === g.id).sent, { count: 7, coins: 10_000 });
    // The receiver's Vitrin counts it.
    const show = await ok(call('GET', `/api/user/showcase?id=${bob.user.id}`, null, alice.session), 'vitrin');
    assert.equal(show.gifts.find((x) => x.id === g.id)?.count, 7);
  });

  test('Özel raf VIP ister; raf değişince hediye o rafın başına geçer; sıra panelden', async () => {
    const vip = await newGift({ cat: 'privilege', minSvip: 3 });
    assert.equal(vip.minSvip, 3);
    await refused(send(vip.id), 403, /VIP 3/);
    const a = await newGift({ cat: 'couple' });
    const b = await newGift({ cat: 'couple' });
    const couple = () => catalog().then((c) => c.gifts.filter((x) => x.custom && x.cat === 'couple').map((x) => x.id));
    assert.deepEqual(await couple(), [b.id, a.id], 'yeni eklenen rafın başında');
    await ok(call('POST', '/api/admin/gifts/order', { ids: [a.id, b.id] }, admin.session), 'sırala');
    assert.deepEqual(await couple(), [a.id, b.id]);
    // To another shelf: first there; the VIP level only matters on Özel.
    await ok(call('POST', '/api/admin/gifts/update', { id: vip.id, cat: 'couple' }, admin.session), 'raf değiştir');
    assert.deepEqual(await couple(), [vip.id, a.id, b.id]);
    assert.equal((await catalog()).gifts.find((x) => x.id === vip.id).minSvip, 0);
    await refused(call('POST', '/api/admin/gifts/order', { ids: [a.id, a.id] }, admin.session), 400);
    await refused(call('POST', '/api/admin/gifts/order', { ids: [a.id, 'a999999'] }, admin.session), 404);
  });

  test('hazır yığılmış video: denetlenir, FX listesine girer, bu sunucudan iner', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const g = await newGift();
    const url = await upload(admin, 'giftvideo', fs.readFileSync(files.stacked), 'video/mp4');
    const saved = (await ok(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url, kind: 'stacked' } }, admin.session), 'video')).gift;
    assert.equal(saved.video.bytes, fs.statSync(files.stacked).size);
    assert.ok(saved.video.ms >= 1500 && saved.video.ms <= 2500, `${saved.video.ms} ms`);
    const fx = (await catalog()).fx.find((x) => x.kind === 'gift' && x.id === g.id);
    assert.match(fx.url, new RegExp(`^/api/fx/g/${g.id}\\.mp4\\?v=[0-9a-f]{12}$`));
    assert.equal(fx.bytes, saved.video.bytes);
    // An older app's filter (lib/fx-videos-core URL_OF before this change) refuses the address: it never downloads it.
    assert.doesNotMatch(fx.url, /^\/api\/fx\/([a-z0-9-]{1,64})\.mp4\?v=([0-9a-f]{6,64})$/);
    const whole = await fetch(`${h.base}${fx.url}`);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), fs.readFileSync(files.stacked));
    const part = await fetch(`${h.base}${fx.url}`, { headers: { range: 'bytes=0-99' } });
    assert.equal(part.status, 206);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    // What only looks like a stacked video is refused, and the gift keeps its own.
    const plain = await upload(admin, 'giftvideo', fs.readFileSync(files.plain), 'video/mp4');
    await refused(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: plain, kind: 'stacked' } }, admin.session), 400, /yığılmış/);
    const tall = await upload(admin, 'giftvideo', fs.readFileSync(files.tall), 'video/mp4');
    await refused(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: tall, kind: 'stacked' } }, admin.session), 400, /alfa maskesi değil/);
    assert.equal((await catalog()).fx.find((x) => x.id === g.id).url, fx.url);
    // Taken off: out of the list, the file goes.
    await ok(call('POST', '/api/admin/gifts/update', { id: g.id, video: null }, admin.session), 'videoyu kaldır');
    assert.ok(!(await catalog()).fx.some((x) => x.id === g.id));
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(url)), 'eski video depodan silindi');
    assert.equal((await fetch(`${h.base}${fx.url}`)).status, 404);
  });

  test('saydam kaynak sunucuda yığılmış videoya çevrilir; saydamlığı olmayan reddedilir', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const g = await newGift();
    const src = await upload(admin, 'giftsource', fs.readFileSync(files.source), 'video/webm');
    const started = (await ok(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: src, kind: 'source' } }, admin.session), 'kaynak')).gift;
    assert.equal(started.video, null);
    const done = await settled(g.id);
    assert.equal(done.job, null, JSON.stringify(done.job));
    assert.ok(done.video.bytes > 0);
    assert.ok(done.video.ms >= 1500 && done.video.ms <= 2500, `${done.video.ms} ms`);
    const fx = (await catalog()).fx.find((x) => x.id === g.id);
    assert.equal(fx.url, done.video.url);
    const clip = Buffer.from(await (await fetch(`${h.base}${fx.url}`)).arrayBuffer());
    assert.equal(clip.length, done.video.bytes);
    const probed = spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', '-'], { input: clip });
    assert.equal(String(probed.stdout).trim(), 'h264,540,1920');
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(src)), 'kaynak çevrildikten sonra silindi');
    assert.ok((await q("SELECT 1 FROM audit_events WHERE action = 'gift.video_ready' AND detail->>'gift' = $1", [g.id])).rowCount);

    // No transparency: the server can't remove a background; the gift keeps the video it has.
    const opaque = await upload(admin, 'giftsource', fs.readFileSync(files.opaque), 'video/webm');
    await ok(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: opaque, kind: 'source' } }, admin.session), 'opak kaynak');
    const failed = await settled(g.id);
    assert.equal(failed.job.status, 'failed');
    assert.match(failed.job.error, /saydamlık/);
    assert.match(failed.job.error, /arka plan silemez/);
    assert.equal(failed.video.url, done.video.url, 'eski video yerinde');
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(opaque)));
  });

  test('SVGA sunucuda videoya çevrilir; boyutu seçilir; SVGA 1.x ve 15 saniyeden uzunu reddedilir', { skip: NO_SVGA }, async () => {
    await freshAdmin();
    const g = await newGift();
    assert.equal((await panel()).svga, true);
    const src = await upload(admin, 'giftsource', svga(30), 'application/x-svga');
    assert.ok(src.endsWith('.svga'), src);
    // The size only for an SVGA, one of the panel's four.
    await refused(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: src, kind: 'source', fill: 0.5 } }, admin.session), 400, /Boyut/);
    await ok(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: src, kind: 'source', fill: 0.8 } }, admin.session), 'svga');
    assert.equal(Number((await q('SELECT job_fill FROM custom_gifts WHERE id = $1', [g.id])).rows[0].job_fill), 0.8);
    const done = await settled(g.id, 120_000);
    assert.equal(done.job, null, JSON.stringify(done.job));
    assert.ok(done.video.ms >= 1400 && done.video.ms <= 1600, `${done.video.ms} ms`);
    const clip = Buffer.from(await (await fetch(`${h.base}${done.video.url}`)).arrayBuffer());
    const probed = spawnSync(process.env.FFPROBE || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', '-'], { input: clip });
    assert.equal(String(probed.stdout).trim(), 'h264,540,1920');
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(src)), 'SVGA çevrildikten sonra silindi');
    const webm = await upload(admin, 'giftsource', fs.readFileSync(files.source), 'video/webm');
    await refused(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: webm, kind: 'source', fill: 0.8 } }, admin.session), 400, /yalnız SVGA/);

    // SVGA 1.x (a zip) and one longer than 15 s: refused with the reason; the video in effect stays.
    for (const [body, re] of [
      [Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(64)]), /SVGA 1\.x/],
      [svga(20 * 16), /15 saniye/],
    ]) {
      const bad = await upload(admin, 'giftsource', body, 'application/x-svga');
      await ok(call('POST', '/api/admin/gifts/update', { id: g.id, video: { url: bad, kind: 'source' } }, admin.session), 'kötü svga');
      const failed = await settled(g.id, 60_000);
      assert.equal(failed.job?.status, 'failed');
      assert.match(failed.job.error, re);
      assert.equal(failed.video.url, done.video.url);
    }
  });

  test('silinen hediye raflardan ve panelden kalkar, dosyaları gider, geçmişi kalır; her adım denetimde', async () => {
    await freshAdmin();
    const g = await newGift({ price: 300 });
    await ok(send(g.id), 'gönder');
    const icon = keyOfUrl(g.icon);
    assert.ok(stored.has(icon));
    await ok(call('POST', '/api/admin/gifts/delete', { id: g.id }, admin.session), 'sil');
    assert.ok(!(await catalog()).gifts.some((x) => x.id === g.id));
    assert.ok(!(await panel()).gifts.some((x) => x.id === g.id));
    await refused(send(g.id), 400, /artık yok/);
    await refused(call('POST', '/api/admin/gifts/update', { id: g.id, price: 5 }, admin.session), 404);
    await refused(call('POST', '/api/admin/gifts/delete', { id: g.id }, admin.session), 404);
    await sleep(300);
    assert.ok(!stored.has(icon), 'ikon depodan silindi');
    assert.equal((await q('SELECT count(*)::int AS n FROM gift_events WHERE gift_id = $1', [g.id])).rows[0].n, 1, 'gönderim kaydı kalır');
    assert.ok((await q('SELECT deleted_at FROM custom_gifts WHERE id = $1', [g.id])).rows[0].deleted_at);
    // A deleted gift's name is free again.
    await newGift({ name: g.name });
    const log = await q("SELECT action, actor, detail FROM audit_events WHERE action LIKE 'gift.%' AND detail->>'gift' = $1 ORDER BY id", [g.id]);
    assert.deepEqual(log.rows.map((x) => x.action), ['gift.create', 'gift.delete']);
    assert.ok(log.rows.every((x) => x.actor === admin.user.id));
    assert.equal(log.rows[0].detail.after.price, 300);
    assert.equal(log.rows[1].detail.before.name, g.name);
  });
});
