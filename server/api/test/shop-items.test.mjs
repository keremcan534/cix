// Yönetim › Mağaza (shop-items.mjs, 076, 077): the shop's frames, entry effects, chat bubbles and voice waves from the
// panel. The app's own change (name, price, days, VIP level, on/off, order) and go back to the app's values; the admins
// add frames (a transparent PNG around the photo), entry effects (a video, ready or converted on the server, and the
// name plate the entering person's name is written on), bubbles (colours, and a picture stretched with its corners
// kept) and waves (a style the app draws, its colours, and a picture for the sparkle style's sparks). The catalog (?shop=1) hands phones what to draw; the shop sells at the values set here
// with the shown-price rule (a phone that showed the compiled row is told to update when the item moved), and nothing
// is taken from a refused buy.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { SEAT_COLORS, SHOP } from '../catalog.mjs';
import { convertArgs } from '../custom-gifts.mjs';
import { PLATE_DEFAULT } from '../shop-items.mjs';
import { startApi } from './harness.mjs';
import { bucketEnv, png, standInBucket } from './stand-in-bucket.mjs';

const PORT = 26000 + (process.pid % 900);
standInBucket(PORT);
const h = startApi({ ...bucketEnv(PORT), SHOP_ITEMS_POLL_MS: '200' });
const { call } = h;
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
const rnd = () => Math.random().toString(36).slice(2, 12);

const PYTHON = process.env.PYTHON || 'python3';
// The server measures a frame's drawn part with Python and Pillow (tools/frame-reach.py); without them it saves the
// frame unmeasured.
const pillowOk = spawnSync(PYTHON, ['-I', '-c', 'import PIL']).status === 0;
const NO_PILLOW = pillowOk ? false : 'Python ile Pillow yok';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ffmpegOk = spawnSync(FFMPEG, ['-version']).status === 0 && spawnSync(process.env.FFPROBE || 'ffprobe', ['-version']).status === 0;
const NO_FFMPEG = ffmpegOk ? false : 'ffmpeg yok';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-test-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const files = {};
/** A box moving on a transparent ground (WebM with alpha) and the stacked MP4 the server would make of it. */
function makeFiles() {
  if (!ffmpegOk) return;
  const ff = (args) => assert.equal(spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args]).status, 0);
  const box = "drawbox=x='20+t*40':y=140:w=120:h=200:color=gold@1:t=fill";
  files.source = path.join(dir, 'giris.webm');
  ff(['-f', 'lavfi', '-i', `color=c=black@0:s=270x480:r=20:d=2,format=rgba,${box}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '300k', files.source]);
  files.stacked = path.join(dir, 'giris.mp4');
  ff(convertArgs(files.source, files.stacked, 'vp9').slice(4));
}

let admin;
let alice;
const freshAdmin = async () => (admin = await h.account(`Mağaza Yöneticisi ${rnd().slice(0, 4)}`, 'admin'));
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
const panel = async () => (await ok(call('GET', '/api/admin/shop', null, admin.session), 'panel')).items;
const itemIn = async (id) => (await panel()).find((x) => x.id === id);
const post = (p, body) => call('POST', `/api/admin/shop${p}`, body, admin.session);
const catalog = (q = '?shop=1') => ok(call('GET', `/api/catalog${q}`), 'katalog');
const inCatalog = async (sku) => (await catalog()).shop.items.find((x) => x.sku === sku);
const coins = async (who = alice) => (await ok(call('GET', '/api/me', null, who.session), 'ben')).user.coins;
const buy = (sku, price, days, who = alice) => call('POST', '/api/shop/buy', { sku, price, ...(days === undefined ? {} : { days }), ref: `b-${rnd()}` }, who.session);
/** An older app's buy: the compiled name and price in a free-text spend (economy.mjs bridge). */
const oldBuy = (name, price, who = alice) => call('POST', '/api/wallet/spend', { amount: price, reason: `Mağaza: ${name}`, ref: `o-${rnd()}` }, who.session);
const frameArt = (o) => upload(admin, 'shopframe', png(256, 256, o), 'image/png');
/**
 * An animated WebP as the shop reads it: VP8X (its size, the alpha and animation flags), ANIM and a few ANMF frames,
 * each a tiny VP8L picture. The shop checks the header; nothing here decodes the frames.
 */
function animatedWebp(w, h, { alpha = true, frames = 3 } = {}) {
  const chunk = (tag, body) => {
    const head = Buffer.alloc(8);
    head.write(tag, 0, 'latin1');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body, Buffer.alloc(body.length % 2)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = (alpha ? 0x10 : 0) | 0x02;
  vp8x.writeUIntLE(w - 1, 4, 3);
  vp8x.writeUIntLE(h - 1, 7, 3);
  const frame = () => {
    const head = Buffer.alloc(16);
    head.writeUIntLE(w - 1, 6, 3);
    head.writeUIntLE(h - 1, 9, 3);
    head.writeUIntLE(120, 12, 3);
    return chunk('ANMF', Buffer.concat([head, chunk('VP8L', Buffer.from([0x2f, 0, 0, 0, 0]))]));
  };
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk('VP8X', vp8x), chunk('ANIM', Buffer.alloc(6)), ...Array.from({ length: frames }, frame)]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
const motionArt = (w = 256, h = w, o) => upload(admin, 'shopframe', animatedWebp(w, h, o), 'image/webp');
/**
 * A square RGBA PNG of `side` px drawn where `drawn(x, y)` says (true: opaque red; a number: red that opaque, of 255),
 * transparent elsewhere; `broken`: its header is right but its pixels can't be read (the shop checks the header,
 * Pillow the pixels).
 */
function framePng(side, drawn, { broken = false } = {}) {
  const row = side * 4 + 1;
  const raw = Buffer.alloc(row * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const a = drawn(x, y);
      if (a) raw.set([230, 40, 60, a === true ? 255 : a], y * row + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const pixels = broken ? Buffer.from('not deflated pixels at all') : zlib.deflateSync(raw);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}
/**
 * An animated WebP made by Pillow (lossless, transparent): `side` px, one frame per box [x0, y0, x1, y1) drawn opaque,
 * the rest transparent.
 */
function pillowWebp(side, boxes) {
  const out = path.join(dir, `hareketli-${rnd()}.webp`);
  const code = [
    'import json, sys',
    'from PIL import Image, ImageDraw',
    'side, boxes, out = int(sys.argv[1]), json.loads(sys.argv[2]), sys.argv[3]',
    'frames = []',
    'for x0, y0, x1, y1 in boxes:',
    '    f = Image.new("RGBA", (side, side), (0, 0, 0, 0))',
    '    ImageDraw.Draw(f).rectangle([x0, y0, x1 - 1, y1 - 1], fill=(40, 200, 90, 255))',
    '    frames.append(f)',
    'frames[0].save(out, save_all=True, append_images=frames[1:], duration=120, loop=0, lossless=True)',
  ].join('\n');
  const r = spawnSync(PYTHON, ['-I', '-c', code, String(side), JSON.stringify(boxes), out]);
  assert.equal(r.status, 0, String(r.stderr));
  return fs.readFileSync(out);
}
const REACH_TOOL = path.join(import.meta.dirname, '..', 'tools', 'frame-reach.py');
/**
 * The measuring tool run as the server runs it (`-I`): { code, out, err }. `first`: Python run before it in the same
 * process (to take Pillow's WebP away, or to make it fail as a machine would).
 */
function reachTool(args, first = '') {
  const code = ['import runpy, sys', first, 'sys.argv = sys.argv[1:]', "runpy.run_path(sys.argv[0], run_name='__main__')"].join('\n');
  const r = spawnSync(PYTHON, ['-I', '-c', code, REACH_TOOL, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
/** A file in the test's folder; its path. */
const fileOf = (name, buf) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
};
/** Waits until `fn` gives something (polling); that. */
async function until(what, fn, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`${what}: olmadı`);
    await sleep(100);
  }
}
/** The frame's measured columns as stored; `of`: what they were measured from (its pictures now, nothing, or others). */
const boxRow = async (id) =>
  (
    await h.sql.query(
      `SELECT art_box_l, art_box_t, art_box_r, art_box_b,
              CASE WHEN art_box_of IS NULL THEN 'none' WHEN art_box_of = art_url || ' ' || coalesce(motion_url, '') THEN
                CASE WHEN motion_url IS NULL THEN 'still' ELSE 'still+motion' END ELSE 'other' END AS of
         FROM shop_items WHERE id = $1`,
      [id],
    )
  ).rows[0];
/** Waits until the item's conversion is over and the catalog lists its video; its panel view. */
async function settled(id, ms = 60_000) {
  const end = Date.now() + ms;
  for (;;) {
    const x = await itemIn(id);
    if (x && x.job?.status !== 'processing' && (!x.video || (await catalog()).fx.some((f) => f.id === id && f.url === x.video.url))) return x;
    if (Date.now() > end) throw new Error(`${id}: çevirme bitmedi`);
    await sleep(200);
  }
}

describe('Yönetim › Mağaza', () => {
  before(async () => {
    makeFiles();
    await freshAdmin();
    alice = await h.signUp('Mağaza Müşterisi');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 100_000, ref: `t-${rnd()}` }, alice.session), 'yükleme');
  });

  test('yalnız yönetici; uygulamanın çerçeveleri, giriş efektleri, balonları ve dalgaları listede, eski uygulamaya katalog aynı', async () => {
    const u = await h.signUp('Sıradan');
    await refused(call('GET', '/api/admin/shop', null, u.session), 403);
    await refused(call('POST', '/api/admin/shop/update', { id: 'fr-neon', price: 1 }, u.session), 403);
    const items = await panel();
    const appOnes = [...SHOP.values()].filter((x) => ['frame', 'entry', 'bubble', 'wave', 'ride'].includes(x.kind));
    assert.ok(appOnes.some((x) => x.kind === 'bubble') && appOnes.some((x) => x.kind === 'wave'));
    // The rooms' seat colors are on the list too (room-seat-color.test.mjs), and the app's rides (Binekler).
    assert.deepEqual(items.map((x) => x.id).sort(), [...appOnes.map((x) => x.sku), ...SEAT_COLORS.keys()].sort());
    const neon = items.find((x) => x.id === 'fr-neon');
    assert.deepEqual([neon.builtin, neon.name, neon.price, neon.days, neon.changed], [true, SHOP.get('fr-neon').name, SHOP.get('fr-neon').price, SHOP.get('fr-neon').days, []]);
    const old = await catalog('');
    assert.equal(old.shop, undefined, 'eski uygulama istemez');
    const c = await catalog();
    assert.equal(c.shop.items.length, appOnes.length + SEAT_COLORS.size);
    assert.deepEqual(c.shop.items.find((x) => x.sku === 'en-dragon'), { sku: 'en-dragon', kind: 'entry', name: 'Ejderha', price: 3000, days: 30, minVip: 7, builtin: true });
  });

  test('uygulamanın eşyası: ad, fiyat, gün değişir; yeni uygulama gösterdiğiyle alır, eski uygulama güncellemeye yönlenir; orijinale döner', async () => {
    await freshAdmin();
    const base = SHOP.get('fr-neon');
    const [, c0] = await call('GET', '/api/config');
    const saved = (await ok(post('/update', { id: 'fr-neon', name: 'Neon Halka', price: base.price + 50, days: 14 }), 'değiştir')).item;
    assert.deepEqual([saved.name, saved.price, saved.days, saved.changed.sort()], ['Neon Halka', base.price + 50, 14, ['days', 'name', 'price']]);
    const [, c1] = await call('GET', '/api/config');
    assert.ok(c1.v > c0.v, 'telefonlar yeniden okur');
    assert.deepEqual(await inCatalog('fr-neon'), { sku: 'fr-neon', kind: 'frame', name: 'Neon Halka', price: base.price + 50, days: 14, minVip: 0, builtin: true });

    const before = await coins();
    await refused(oldBuy(base.name, base.price), 409, /güncelle/);
    await refused(oldBuy(base.name, base.price + 50), 409, /güncelle/);
    let j = await refused(buy('fr-neon', base.price, 14), 409, /Fiyat değişti/);
    assert.deepEqual([j.code, j.price], ['price_changed', base.price + 50]);
    j = await refused(buy('fr-neon', base.price + 50, base.days), 409, /Süre değişti/);
    assert.equal(j.days, 14);
    await refused(buy('fr-neon', base.price + 50), 409, /güncelle/);
    assert.equal(await coins(), before, 'hiçbir şey alınmadı');
    await ok(buy('fr-neon', base.price + 50, 14), 'yeni uygulama alır');
    assert.equal(await coins(), before - base.price - 50);
    const e = (await h.sql.query("SELECT round(extract(epoch FROM ends_at - starts_at) / 86400)::int AS d FROM entitlements WHERE user_id = $1 AND sku = 'fr-neon'", [alice.user.id])).rows[0];
    assert.equal(e.d, 14);
    const r = (await h.sql.query("SELECT reason FROM ledger WHERE user_id = $1 AND currency = 'coin' ORDER BY id DESC LIMIT 1", [alice.user.id])).rows[0];
    assert.equal(r.reason, 'Mağaza: Neon Halka (14 gün)');

    const back = (await ok(post('/reset', { id: 'fr-neon' }), 'orijinal')).item;
    assert.deepEqual([back.name, back.price, back.days, back.changed], [base.name, base.price, base.days, []]);
    await ok(oldBuy(base.name, base.price), 'eski uygulama yine alır');
    const audit = (await h.sql.query("SELECT action FROM audit_events WHERE action LIKE 'shop.%' ORDER BY id")).rows.map((x) => x.action);
    assert.deepEqual(audit, ['shop.update', 'shop.reset']);
  });

  test('satıştan kaldırılan eşya satılmaz, sahibinde kalır; uygulamanın eşyası silinmez', async () => {
    await freshAdmin();
    const base = SHOP.get('fr-ocean');
    await ok(buy('fr-ocean', base.price, base.days), 'önce alır');
    await ok(post('/update', { id: 'fr-ocean', enabled: false }), 'kapat');
    assert.equal((await inCatalog('fr-ocean')).off, true);
    await refused(buy('fr-ocean', base.price, base.days), 400, /satışta değil/);
    await refused(oldBuy(base.name, base.price), 409, /satışta değil/);
    const mine = (await ok(call('GET', '/api/economy', null, alice.session), 'ekonomi')).items.map((x) => x.sku);
    assert.ok(mine.includes('fr-ocean'), 'sahibinde kalır');
    await refused(post('/delete', { id: 'fr-ocean' }), 400, /silinmez/);
    await ok(post('/reset', { id: 'fr-ocean', fields: ['enabled'] }), 'yeniden aç');
  });

  test('yeni çerçeve: saydam kare PNG, fotoğraf alanı; satılır, takılır, başkaları görür; sahibi varken silinmez', async () => {
    await freshAdmin();
    await refused(post('', { kind: 'frame', name: 'Gül Bahçesi', price: 500, days: 30 }), 400, /önce yükle/);
    await refused(post('', { kind: 'frame', name: 'Gül Bahçesi', price: 500, days: 30, art: await frameArt({ alpha: false }) }), 400, /saydamlık/);
    await refused(post('', { kind: 'frame', name: 'Gül Bahçesi', price: 500, days: 30, art: await upload(admin, 'shopframe', png(256, 200), 'image/png') }), 400, /kare/);
    await refused(post('', { kind: 'frame', name: 'Gül Bahçesi', price: 500, days: 30, art: await frameArt(), hole: 0.9 }), 400, /Fotoğraf alanı/);
    await refused(post('', { kind: 'frame', name: SHOP.get('fr-gold').name, price: 500, days: 30, art: await frameArt() }), 409, /zaten var/);
    const [, c0] = await call('GET', '/api/catalog');
    const f = (await ok(post('', { kind: 'frame', name: 'Gül Bahçesi', price: 500, days: 30, minVip: 0, art: await frameArt(), hole: 0.3 }), 'çerçeve ekle')).item;
    assert.match(f.id, /^sf[0-9]+$/);
    assert.deepEqual([f.builtin, f.kind, f.art.hole, f.owners], [false, 'frame', 0.3, 0]);
    const listed = await inCatalog(f.id);
    assert.deepEqual(Object.keys(listed).sort(), ['art', 'days', 'kind', 'minVip', 'name', 'price', 'sku']);
    assert.equal(listed.art.hole, 0.3);
    assert.ok((await catalog('')).v > c0.v);
    assert.equal((await catalog()).shop.items.filter((x) => x.kind === 'frame')[0].sku, f.id, 'yeni eşya başta');

    await ok(buy(f.id, 500, 30), 'alır');
    const me = await ok(call('GET', '/api/economy', null, alice.session), 'ekonomi');
    assert.equal(me.equipped.frame, f.id, 'hemen takılır');
    const bob = await h.signUp('Bakan');
    const looks = (await ok(call('GET', `/api/looks?ids=${alice.user.id}`, null, bob.session), 'görünüm')).looks;
    assert.equal(looks[alice.user.id].frame, f.id);
    await refused(post('/delete', { id: f.id }), 409, /kişide var/);
    // Staff can give it too.
    await ok(call('POST', '/api/admin/economy/grant', { userId: bob.user.id, sku: f.id, reason: 'Yarışma ödülü', ref: `g-${rnd()}` }, admin.session), 'personel verir');

    // A new picture replaces the old one; the old file goes.
    const art = await frameArt();
    const changed = (await ok(post('/update', { id: f.id, art, hole: 0.28 }), 'yeni resim')).item;
    assert.deepEqual([changed.art.url, changed.art.hole], [art, 0.28]);
    await refused(post('/update', { id: f.id, plate: { x: 0.5 } }), 400, /olmaz/);
  });

  test('hareketli çerçeve: durağan resmin yanında hareketli WebP; yeni telefon hareketliyi, eski telefon durağanı çizer', async () => {
    await freshAdmin();
    const still = await frameArt();
    const moving = await motionArt();
    const add = (more) => post('', { kind: 'frame', name: 'İmparator', price: 900, days: 30, ...more });
    // Each in its place: the moving one isn't the frame's picture, a still one isn't its moving version.
    await refused(add({ art: moving }), 400, /hareketli: onu "Hareketli hali"ne/);
    await refused(add({ art: still, motion: await frameArt() }), 400, /hareketli bir WebP olmalı/);
    await refused(add({ art: still, motion: await motionArt(256, 256, { alpha: false }) }), 400, /saydamlık/);
    await refused(add({ art: still, motion: await motionArt(1024) }), 400, /128–512 piksel/);
    await refused(add({ art: still, motion: await motionArt(256, 200) }), 400, /kare/);
    await refused(post('', { kind: 'bubble', name: 'Hareketli Balon', price: 100, days: 7, motion: moving }), 400, /yalnız çerçevede/);

    // The photo goes where the ring is: a designer's ring under a crown is often higher than the picture's middle.
    await refused(add({ art: still, hole: 0.27, holeX: 0.9, holeY: 0.5 }), 400, /Fotoğrafın yeri/);
    await refused(add({ art: still, hole: 0.27, holeX: 0.5 }), 400, /Fotoğrafın yeri/);
    await refused(add({ art: still, hole: 0.4, holeX: 0.5, holeY: 0.35 }), 400, /taşıyor/);
    await refused(post('', { kind: 'bubble', name: 'Yerli Balon', price: 100, days: 7, holeX: 0.5, holeY: 0.5 }), 400, /fotoğraf alanı olmaz/);

    const f = (await ok(add({ art: still, hole: 0.27, holeX: 0.5, holeY: 0.42, motion: moving }), 'hareketli çerçeve')).item;
    assert.deepEqual([f.art.url, f.art.hole, f.art.at, f.art.motion.url, f.art.motion.px], [still, 0.27, { x: 0.5, y: 0.42 }, moving, 256]);
    assert.ok(f.art.motion.bytes > 0);
    // Phones: the hole's place and the moving version beside the still picture an older app draws (centred). This
    // stand-in WebP's frames can't be decoded, so its drawn part isn't known: no reach, drawn as before.
    assert.deepEqual((await inCatalog(f.id)).art, { url: still, hole: 0.27, at: { x: 0.5, y: 0.42 }, motion: { url: moving } });
    // A bigger hole must still fit where it is; the middle is no place at all for the phones.
    await refused(post('/update', { id: f.id, hole: 0.45 }), 400, /taşıyor/);
    assert.deepEqual((await ok(post('/update', { id: f.id, holeX: 0.5, holeY: 0.5 }), 'ortaya')).item.art.at, { x: 0.5, y: 0.5 });
    assert.equal((await inCatalog(f.id)).art.at, undefined);
    // A new moving version replaces the old one; null leaves the still picture alone.
    const moving2 = await motionArt(320);
    assert.equal((await ok(post('/update', { id: f.id, motion: moving2 }), 'yeni hareketli')).item.art.motion.px, 320);
    const bare = (await ok(post('/update', { id: f.id, motion: null }), 'hareketsiz')).item;
    assert.deepEqual([bare.art.url, bare.art.motion], [still, null]);
    // The still picture alone is measured again (where Pillow is): the stand-in disc reaches a third of the picture
    // round its middle, 43–214 of its 256 px (to 0.001 outward: never less than drawn).
    assert.deepEqual((await inCatalog(f.id)).art, { url: still, hole: 0.27, ...(pillowOk ? { reach: { x: 0.336, top: 0.333, bottom: 0.336 } } : {}) });
    await refused(post('/update', { id: 'fr-neon', motion: moving }), 400, /görseli buradan değişmez/);
    await refused(post('/update', { id: 'fr-neon', holeX: 0.5, holeY: 0.4 }), 400, /görseli buradan değişmez/);

    // Staff add a set at once: 24 frames are 48 files, past the 20 a minute anyone else may upload.
    for (let i = 0; i < 30; i++) await ok(call('POST', '/api/media/upload-url', { kind: 'shopframe', contentType: 'image/png', size: 1000 }, admin.session), `yükleme ${i + 1}`);
  });

  test('yeni giriş efekti: hazır video ve isim plakası; katalogda video ve plaka, sunucudan oynatılır; sırası değişir', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const video = { kind: 'stacked', url: await upload(admin, 'giftvideo', fs.readFileSync(files.stacked), 'video/mp4') };
    await refused(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 30 }), 400, /videosunu önce yükle/);
    await refused(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 30, video, plate: { x: 0.5, y: 0.6, w: 0.6, size: 0.03, color: 'altın' } }), 400, /renk/);
    await refused(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 30, video, plate: { x: 0.5, y: 0.6, w: 0.05, size: 0.03, color: '#FFD700' } }), 400, /genişlik/);
    const plate = { x: 0.5, y: 0.7, w: 0.55, size: 0.04, color: '#ffd700', bold: true };
    const e = (await ok(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 0, minVip: 3, video, plate }), 'giriş ekle')).item;
    assert.match(e.id, /^se[0-9]+$/);
    // A plate with only its place and size gets the usual look: written, soft shadow, the whole clip.
    const saved = { ...PLATE_DEFAULT, ...plate, color: '#FFD700' };
    assert.deepEqual([e.days, e.minVip, e.plate, e.icon], [null, 3, saved, null]);
    const c = await catalog();
    assert.deepEqual(c.shop.items.find((x) => x.sku === e.id), { sku: e.id, kind: 'entry', name: 'Altın Ejderha', price: 5000, days: null, minVip: 3, video: true, plate: saved });
    const fx = c.fx.find((x) => x.kind === 'entry' && x.id === e.id);
    assert.match(fx.url, new RegExp(`^/api/fx/s/${e.id}\\.mp4\\?v=[0-9a-f]{12}$`));
    const res = await fetch(`${h.base}${fx.url}`);
    assert.deepEqual([res.status, res.headers.get('content-type')], [200, 'video/mp4']);
    assert.equal(Buffer.from(await res.arrayBuffer()).length, fx.bytes);

    // VIP 3 needed; then bought for good with the days the phone showed (0).
    await refused(buy(e.id, 5000, 0), 403, /VIP 3/);
    await h.sql.query('UPDATE users SET svip_xp = 3000000 WHERE id = $1', [alice.user.id]);
    await refused(buy(e.id, 5000, 30), 409, /süresiz/);
    await ok(buy(e.id, 5000, 0), 'süresiz alır');
    assert.equal((await h.sql.query("SELECT ends_at FROM entitlements WHERE user_id = $1 AND sku = $2", [alice.user.id, e.id])).rows[0].ends_at, null);

    // The plate moves; the shop's order of entry effects too.
    const moved = (await ok(post('/update', { id: e.id, plate: { ...plate, y: 0.8 } }), 'plaka')).item;
    assert.equal(moved.plate.y, 0.8);
    const entries = (await panel()).filter((x) => x.kind === 'entry').map((x) => x.id);
    await refused(post('/order', { kind: 'entry', ids: entries.slice(1) }), 400, /bütün eşyalarını/);
    await ok(post('/order', { kind: 'entry', ids: [...entries].reverse() }), 'sıra');
    assert.deepEqual((await catalog()).shop.items.filter((x) => x.kind === 'entry').map((x) => x.sku), [...entries].reverse());
  });

  test('giriş efektinin yazısı: yazılsın ya da yazılmasın, büyük harf, gölge, kontur, arka plan, zamanı; mağaza ikonu', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const video = { kind: 'stacked', url: await upload(admin, 'giftvideo', fs.readFileSync(files.stacked), 'video/mp4') };
    const base = { x: 0.5, y: 0.6, w: 0.6, size: 0.04, color: '#FFFFFF' };
    const add = (more) => post('', { kind: 'entry', name: 'Parlak Giriş', price: 800, days: 30, video, ...more });
    await refused(add({ plate: { ...base, outline: { color: 'siyah', size: 0.05 } } }), 400, /kontur rengi/);
    await refused(add({ plate: { ...base, shadow: { color: '#FF00FF', size: 2 } } }), 400, /gölge %2–%60/);
    await refused(add({ plate: { ...base, back: { color: '#000000', alpha: 0 } } }), 400, /arka plan/);
    await refused(add({ plate: { ...base, from: 3, to: 3.2 } }), 400, /yarım saniye/);
    await refused(add({ plate: { ...base, from: 21 } }), 400, /0–20 saniye/);
    await refused(add({ plate: { ...base, anim: 'spin' } }), 400, /belirme/);
    await refused(add({ plate: { ...base, show: 'hayır' } }), 400, /ad yazılsın/);
    // The icon: a PNG or WebP of a size the shop can draw; only an entry effect has one.
    await refused(add({ icon: await upload(admin, 'shopframe', png(40, 40), 'image/png') }), 400, /İkon her yönde 64–4096/);
    await refused(post('', { kind: 'bubble', name: 'İkonlu Balon', price: 100, days: 7, icon: await upload(admin, 'shopframe', png(128, 128), 'image/png') }), 400, /ikon yalnız giriş efektine/);

    const icon = await upload(admin, 'shopframe', png(192, 192), 'image/png');
    const look = { ...base, upper: true, spacing: 0.08, shadow: { color: '#ff00ff', size: 0.35 }, outline: { color: '#000000', size: 0.06 }, back: { color: '#111827', alpha: 0.55 }, from: 0.8, to: 2.5, anim: 'zoom' };
    const e = (await ok(add({ plate: look, icon }), 'ekle')).item;
    const want = { ...look, bold: true, show: true, shadow: { color: '#FF00FF', size: 0.35 } };
    assert.deepEqual([e.plate, e.icon], [want, { url: icon, px: 192 }]);
    assert.deepEqual(await inCatalog(e.id), { sku: e.id, kind: 'entry', name: 'Parlak Giriş', price: 800, days: 30, minVip: 0, video: true, plate: want, icon: { url: icon } });

    // No name over the clip: the plate keeps its place and look for when it is written again.
    const off = (await ok(post('/update', { id: e.id, plate: { ...want, show: false } }), 'yazısız')).item;
    assert.deepEqual(off.plate, { ...want, show: false });
    // A new icon replaces the old one; null takes it away and the shop shows the banner alone.
    const icon2 = await upload(admin, 'shopframe', png(128, 128), 'image/png');
    assert.deepEqual((await ok(post('/update', { id: e.id, icon: icon2 }), 'yeni ikon')).item.icon, { url: icon2, px: 128 });
    // A big icon is taken and made smaller for the phones (custom-gifts.mjs fitPicture): at most 512 px and 512 KB.
    const big = await upload(admin, 'shopframe', png(1500, 1500), 'image/png');
    const shrunk = (await ok(post('/update', { id: e.id, icon: big }), 'büyük ikon')).item.icon;
    assert.notEqual(shrunk.url, big, 'küçültülmüş kopya');
    assert.ok(shrunk.px <= 512, `en çok 512 piksel (bu ${shrunk.px})`);
    const smallFile = await fetch(shrunk.url);
    assert.equal(smallFile.status, 200);
    assert.ok((await smallFile.arrayBuffer()).byteLength <= 512 * 1024);
    assert.equal((await ok(post('/update', { id: e.id, icon: null }), 'ikonsuz')).item.icon, null);
    assert.equal((await inCatalog(e.id)).icon, undefined);
    // The app's own entry effects keep the app's pictures.
    await refused(post('/update', { id: 'en-dragon', icon }), 400, /görseli buradan değişmez/);
    const audit = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'shop.update' ORDER BY id DESC LIMIT 1")).rows[0].detail;
    // The audit keeps the stored address (the storage's own); the panel and the phones get the API's: the same file.
    const file = (u) => u.slice(u.indexOf('shopframe/'));
    assert.deepEqual([file(audit.before.icon_url), audit.after.icon_url], [file(shrunk.url), null]);
  });

  test('kaynak videodan giriş efekti sunucuda çevrilir (hediyelerle aynı çevirici)', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const source = await upload(admin, 'giftsource', fs.readFileSync(files.source), 'video/webm');
    const e = (await ok(post('', { kind: 'entry', name: 'Kuyruklu Işık', price: 1200, days: 30, video: { kind: 'source', url: source } }), 'kaynakla ekle')).item;
    assert.equal(e.job?.status, 'processing');
    assert.equal(e.video, null);
    const done = await settled(e.id);
    assert.equal(done.job, null, JSON.stringify(done.job));
    assert.ok(done.video?.bytes > 0);
    assert.deepEqual(done.plate, { ...PLATE_DEFAULT }, 'plakası olmayana varsayılan');
    const audit = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'shop.video_ready'")).rows;
    assert.equal(audit.at(-1).detail.shop, e.id);
    // Nobody has it: it can be deleted, and is gone from the shop and the videos.
    await ok(post('/delete', { id: e.id }), 'sil');
    const c = await catalog();
    assert.equal(c.shop.items.some((x) => x.sku === e.id), false);
    assert.equal(c.fx.some((x) => x.id === e.id), false);
    assert.equal((await fetch(`${h.base}/api/fx/s/${e.id}.mp4`)).status, 404);
  });

  test('sohbet balonu: uygulamanınki değişir; yeni balon renkleriyle, resmi köşeleri korunarak; satılır, odada görünür', async () => {
    await freshAdmin();
    // The app's own: name, price and days, not its look.
    const candy = SHOP.get('bb-candy');
    await refused(post('/update', { id: 'bb-candy', look: { colors: ['#000000', '#FFFFFF'] } }), 400, /görseli buradan değişmez/);
    await ok(post('/update', { id: 'bb-candy', price: candy.price + 30 }), 'fiyat');
    assert.deepEqual(await inCatalog('bb-candy'), { sku: 'bb-candy', kind: 'bubble', name: candy.name, price: candy.price + 30, days: candy.days, minVip: 0, builtin: true });
    await refused(oldBuy(candy.name, candy.price + 30), 409, /güncelle/);
    await ok(post('/reset', { id: 'bb-candy' }), 'orijinal');

    // Colours only.
    await refused(post('', { kind: 'bubble', name: 'Gece Mavisi', price: 300, days: 30, look: { colors: ['#0F172A'] } }), 400, /iki rengi/);
    await refused(post('', { kind: 'bubble', name: 'Gece Mavisi', price: 300, days: 30, look: { colors: ['#0F172A', 'mavi'] } }), 400, /2\. rengi: renk/);
    await refused(post('', { kind: 'bubble', name: candy.name, price: 300, days: 30 }), 409, /sohbet balonu zaten var/);
    await refused(post('', { kind: 'bubble', name: 'Gece Mavisi', price: 300, days: 30, plate: { x: 0.5 } }), 400, /olmaz/);
    const plain = (await ok(post('', { kind: 'bubble', name: 'Gece Mavisi', price: 300, days: 30, look: { colors: ['#0f172a', '#1e3a8a'], text: '#e0f2fe' } }), 'balon')).item;
    assert.match(plain.id, /^sb[0-9]+$/);
    assert.deepEqual(plain.look, { colors: ['#0F172A', '#1E3A8A'], text: '#E0F2FE' });
    assert.deepEqual(await inCatalog(plain.id), { sku: plain.id, kind: 'bubble', name: 'Gece Mavisi', price: 300, days: 30, minVip: 0, look: { colors: ['#0F172A', '#1E3A8A'], text: '#E0F2FE' } });
    const dflt = (await ok(post('', { kind: 'bubble', name: 'Varsayılan Balon', price: 100, days: 7 }), 'görünüşsüz')).item;
    assert.deepEqual(dflt.look, { colors: ['#7C3AED', '#EC4899'], text: '#FFFFFF' });

    // With a picture: its corners stay, the middle stretches; a third of each side unless the panel says.
    const small = await upload(admin, 'shopframe', png(40, 40), 'image/png');
    await refused(post('', { kind: 'bubble', name: 'Taçlı', price: 900, days: 30, art: small }), 400, /64–1024/);
    const pic = await upload(admin, 'shopframe', png(300, 150), 'image/png');
    await refused(post('', { kind: 'bubble', name: 'Taçlı', price: 900, days: 30, art: pic, look: { colors: ['#B45309', '#F59E0B'], slice: { t: 40, r: 150, b: 40, l: 149 } } }), 400, /sol ve sağ köşe/);
    await refused(post('', { kind: 'bubble', name: 'Taçlı', price: 900, days: 30, art: pic, look: { colors: ['#B45309', '#F59E0B'], slice: { t: 0, r: 60, b: 40, l: 60 } } }), 400, /üst köşe/);
    const crowned = (await ok(post('', { kind: 'bubble', name: 'Taçlı', price: 900, days: 30, art: pic }), 'resimli')).item;
    assert.deepEqual(crowned.look.slice, { w: 300, h: 150, t: 50, r: 100, b: 50, l: 100 }, 'varsayılan köşeler');
    const sliced = (await ok(post('/update', { id: crowned.id, look: { colors: ['#B45309', '#F59E0B'], text: '#1F1300', slice: { t: 40, r: 60, b: 40, l: 60 } } }), 'köşeler')).item;
    assert.deepEqual([sliced.art.url, sliced.look.slice], [pic, { w: 300, h: 150, t: 40, r: 60, b: 40, l: 60 }]);
    assert.deepEqual((await inCatalog(crowned.id)).look, { colors: ['#B45309', '#F59E0B'], text: '#1F1300', art: { url: pic, w: 300, h: 150, t: 40, r: 60, b: 40, l: 60 } });
    // New colours keep the corners; a new picture of another size starts from its own default.
    assert.deepEqual((await ok(post('/update', { id: crowned.id, look: { colors: ['#111111', '#222222'] } }), 'renk')).item.look.slice, sliced.look.slice);
    const pic2 = await upload(admin, 'shopframe', png(240, 120), 'image/png');
    assert.deepEqual((await ok(post('/update', { id: crowned.id, art: pic2 }), 'yeni resim')).item.look.slice, { w: 240, h: 120, t: 40, r: 80, b: 40, l: 80 });
    // Picture taken away: the colours alone.
    const bare = (await ok(post('/update', { id: crowned.id, art: null }), 'resimsiz')).item;
    assert.deepEqual([bare.art, bare.look.slice], [null, undefined]);
    assert.equal((await inCatalog(crowned.id)).look.art, undefined);

    // Sold with the shown price and days, worn at once, seen by others in rooms.
    await ok(buy(plain.id, 300, 30), 'alır');
    assert.equal((await ok(call('GET', '/api/economy', null, alice.session), 'ekonomi')).equipped.bubble, plain.id);
    const bob = await h.signUp('Balona Bakan');
    assert.equal((await ok(call('GET', `/api/looks?ids=${alice.user.id}`, null, bob.session), 'görünüm')).looks[alice.user.id].bubble, plain.id);
    await refused(post('/delete', { id: plain.id }), 409, /kişide var/);
    await ok(post('/delete', { id: dflt.id }), 'sil');
    assert.equal(await inCatalog(dflt.id), undefined);
    const audit = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'shop.create' ORDER BY id DESC LIMIT 1")).rows[0].detail;
    assert.equal(audit.after.kind, 'bubble');
  });

  test('ses dalgası: stil ve renkleri; Parıltı resimli; yanlış stil, renk sayısı ve resim reddedilir; satılır ve görünür', async () => {
    await freshAdmin();
    await refused(post('', { kind: 'wave', name: 'Okyanus', price: 2000, days: 0, look: { style: 'zigzag', colors: ['#00C2FF'] } }), 400, /stili/);
    await refused(post('', { kind: 'wave', name: 'Okyanus', price: 2000, days: 0, look: { style: 'ring', colors: ['#00C2FF', '#0047FF'] } }), 400, /Halka 1 renk alır/);
    await refused(post('', { kind: 'wave', name: 'Okyanus', price: 2000, days: 0, look: { style: 'spin', colors: ['#000000', '#111111', '#222222', '#333333', '#444444'] } }), 400, /2–4 renk/);
    const spark = await upload(admin, 'shopframe', png(128, 128), 'image/png');
    await refused(post('', { kind: 'wave', name: 'Okyanus', price: 2000, days: 0, art: spark, look: { style: 'ring', colors: ['#00C2FF'] } }), 400, /yalnız Parıltı/);
    const w = (await ok(post('', { kind: 'wave', name: 'Okyanus', price: 2000, days: 0, look: { style: 'spin', colors: ['#00c2ff', '#0047ff', '#00ffb2'] } }), 'dalga')).item;
    assert.match(w.id, /^sw[0-9]+$/);
    assert.deepEqual(await inCatalog(w.id), { sku: w.id, kind: 'wave', name: 'Okyanus', price: 2000, days: null, minVip: 0, look: { style: 'spin', colors: ['#00C2FF', '#0047FF', '#00FFB2'] } });

    // Sparkle with a picture for its sparks (transparent); a style that takes none can't keep it.
    await refused(post('', { kind: 'wave', name: 'Kalpler', price: 3000, days: 0, art: await upload(admin, 'shopframe', png(128, 128, { alpha: false }), 'image/png'), look: { style: 'sparkle', colors: ['#FF5FA2', '#FFFFFF'] } }), 400, /saydamlık/);
    const hearts = (await ok(post('', { kind: 'wave', name: 'Kalpler', price: 3000, days: 0, art: spark, look: { style: 'sparkle', colors: ['#ff5fa2', '#ffffff'] } }), 'parıltı')).item;
    assert.deepEqual((await inCatalog(hearts.id)).look, { style: 'sparkle', colors: ['#FF5FA2', '#FFFFFF'], art: { url: spark } });
    await refused(post('/update', { id: hearts.id, look: { style: 'ring', colors: ['#FF5FA2'] } }), 400, /yalnız Parıltı/);
    const ring = (await ok(post('/update', { id: hearts.id, art: null, look: { style: 'ring', colors: ['#FF5FA2'] } }), 'halka')).item;
    assert.deepEqual([ring.art, ring.look], [null, { style: 'ring', colors: ['#FF5FA2'] }]);

    // The app's own wave: its days change; the new app buys with them, a phone that showed the compiled row updates.
    const gold = SHOP.get('wv-gold');
    await ok(post('/update', { id: 'wv-gold', days: 30 }), 'gün');
    await refused(buy('wv-gold', gold.price), 409, /güncelle/);
    await refused(oldBuy(gold.name, gold.price), 409, /güncelle/);
    await ok(buy('wv-gold', gold.price, 30), 'yeni uygulama alır');
    await ok(post('/reset', { id: 'wv-gold' }), 'orijinal');

    await ok(buy(w.id, 2000, 0), 'süresiz alır');
    const bob = await h.signUp('Dalgaya Bakan');
    assert.equal((await ok(call('GET', `/api/looks?ids=${alice.user.id}`, null, bob.session), 'görünüm')).looks[alice.user.id].wave, w.id);
    const waves = (await panel()).filter((x) => x.kind === 'wave').map((x) => x.id);
    await ok(post('/order', { kind: 'wave', ids: [...waves].reverse() }), 'sıra');
    assert.deepEqual((await catalog()).shop.items.filter((x) => x.kind === 'wave').map((x) => x.sku), [...waves].reverse());
  });

  test('çerçevenin çizili kısmı ölçülür: telefonlar ne kadar uzandığını alır (hareketli hali dahil); okunamayan resim yine kaydedilir', { skip: NO_PILLOW }, async () => {
    await freshAdmin();
    // 200 px: drawn from 40 to 160 across and from 20 to 170 down, a hole of radius 40 round (100, 110).
    const drawn = (x, y) => x >= 40 && x < 160 && y >= 20 && y < 170 && (x + 0.5 - 100) ** 2 + (y + 0.5 - 110) ** 2 > 40 ** 2;
    const still = await upload(admin, 'shopframe', framePng(200, drawn), 'image/png');
    const [, c0] = await call('GET', '/api/catalog');
    const f = (await ok(post('', { kind: 'frame', name: 'Ölçülü Taç', price: 700, days: 30, art: still, hole: 0.2, holeX: 0.5, holeY: 0.55 }), 'çerçeve')).item;
    assert.deepEqual(f.art.box, { l: 0.2, t: 0.1, r: 0.8, b: 0.85 });
    assert.deepEqual(await boxRow(f.id), { art_box_l: '0.2000', art_box_t: '0.1000', art_box_r: '0.8000', art_box_b: '0.8500', of: 'still' });
    // From the hole's centre (0.5, 0.55): 0.3 either way across, 0.45 up, 0.3 down. Only `reach` is new for phones;
    // every app's parser builds the art from the fields it knows, so an older one draws it as before.
    const reach = { x: 0.3, top: 0.45, bottom: 0.3 };
    assert.deepEqual(f.art.reach, reach);
    assert.deepEqual((await inCatalog(f.id)).art, { url: still, hole: 0.2, at: { x: 0.5, y: 0.55 }, reach });
    assert.ok((await catalog('')).v > c0.v);

    // Never less than the photo itself: a bigger hole reaches past the drawn part below and across.
    await ok(post('/update', { id: f.id, hole: 0.35 }), 'büyük alan');
    assert.deepEqual((await inCatalog(f.id)).art.reach, { x: 0.35, top: 0.45, bottom: 0.35 });

    // A moving version that reaches further in one of its frames: the box holds every frame of it and the still one.
    const moving = await upload(admin, 'shopframe', pillowWebp(128, [[26, 13, 102, 109], [6, 13, 122, 109]]), 'image/webp');
    const m = (await ok(post('/update', { id: f.id, motion: moving }), 'hareketli')).item;
    // 6 / 128 and 122 / 128 across, the still picture's 0.1 at the top, 109 / 128 at the bottom (outward to 0.0001).
    assert.deepEqual(m.art.box, { l: 0.0468, t: 0.1, r: 0.9532, b: 0.8516 });
    // Across 0.4532 from the hole's centre, to 0.001 outward (never less than drawn, so the frame is never cut): 0.454.
    assert.deepEqual((await inCatalog(f.id)).art, { url: still, hole: 0.35, at: { x: 0.5, y: 0.55 }, motion: { url: moving }, reach: { x: 0.454, top: 0.45, bottom: 0.35 } });
    assert.equal((await boxRow(f.id)).of, 'still+motion');
    // The moving version taken away: the still picture alone again.
    await ok(post('/update', { id: f.id, motion: null, hole: 0.2 }), 'hareketsiz');
    assert.deepEqual((await inCatalog(f.id)).art.reach, reach);

    // A picture whose header is right but whose pixels can't be read: saved all the same, with nothing to reach
    // (drawn as before), and known as measured so it isn't tried again at every start.
    const broken = await upload(admin, 'shopframe', framePng(200, drawn, { broken: true }), 'image/png');
    const b = (await ok(post('/update', { id: f.id, art: broken }), 'okunamayan resim')).item;
    assert.deepEqual([b.art.url, b.art.box, b.art.reach], [broken, null, null]);
    assert.deepEqual(await boxRow(f.id), { art_box_l: null, art_box_t: null, art_box_r: null, art_box_b: null, of: 'still' });
    assert.deepEqual((await inCatalog(f.id)).art, { url: broken, hole: 0.2, at: { x: 0.5, y: 0.55 } });
    const n = (await ok(post('', { kind: 'frame', name: 'Bozuk Resim', price: 700, days: 30, art: await upload(admin, 'shopframe', framePng(200, drawn, { broken: true }), 'image/png') }), 'yeni okunamayan')).item;
    assert.equal(n.art.reach, null);
    assert.equal((await inCatalog(n.id)).art.reach, undefined);
  });

  test('ölçen araç: hafif parıltı da çizili sayılır, hareketlinin her karesi okunur; yalnız resmin kendi bozukluğu "okunamaz" sayılır, makinenin sorunu sonra yine denenir', { skip: NO_PILLOW }, () => {
    // 200 px, from 50 to 150 down: opaque from 60 to 140 across, a soft glow (alpha 13 of 255, just over 5%) out to
    // 40–160, a haze too faint to see (alpha 12) out to 10–190.
    const glow = (x, y) => (y < 50 || y >= 150 ? 0 : x >= 60 && x < 140 ? true : x >= 40 && x < 160 ? 13 : x >= 10 && x < 190 ? 12 : 0);
    const soft = fileOf('parilti.png', framePng(200, glow));
    let r = reachTool([soft]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(r.out), { l: 0.2, t: 0.25, r: 0.8, b: 0.75 });

    // A moving one is read to its last frame, however many: here only the 2001st reaches out (the time limit, 60 s,
    // bounds the run, not a count of frames).
    const boxes = Array.from({ length: 2000 }, (_, i) => [4 + (i % 8), 8, 5 + (i % 8), 9]);
    const many = fileOf('kareler.webp', pillowWebp(16, [...boxes, [1, 2, 15, 14]]));
    r = reachTool([many]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(r.out), { l: 0.0625, t: 0.125, r: 0.9375, b: 0.875 });

    // The picture's own fault (exit 3): stored as measured with nothing to reach, not tried again. Only PNG and WebP
    // are opened (the server checked that already; a GIF Pillow could read isn't either).
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const bad = { 'bozuk.png': framePng(200, glow, { broken: true }), 'yarim.png': framePng(200, glow).subarray(0, 300), 'resim-degil.png': Buffer.from('bir resim değil'), 'resim.gif': gif };
    for (const [name, buf] of Object.entries(bad)) {
      r = reachTool([soft, fileOf(name, buf)]);
      assert.equal(r.code, 3, `${name}: ${r.err}`);
    }
    // Nothing drawn, or only too faint to see.
    for (const [name, drawn] of [['bos.png', () => false], ['sis.png', (x, y) => (x > 20 && y > 20 ? 12 : 0)]]) {
      r = reachTool([fileOf(name, framePng(200, drawn))]);
      assert.deepEqual([r.code, r.err.trim()], [3, 'nothing visible'], name);
    }
    // This machine's (exit 1): nothing is stored, it is measured again later.
    r = reachTool([soft], ['import PIL.Image', 'def full(*a, **k):', '    raise MemoryError()', 'PIL.Image.open = full'].join('\n'));
    assert.equal(r.code, 1, `bellek: ${r.err}`);
    assert.equal(reachTool([path.join(dir, 'yok.png')]).code, 1, 'dosya yok');
    // A Pillow without WebP says so (the server leaves a frame with a WebP picture for later) and still reads PNG.
    const noWebp = "sys.modules['PIL._webp'] = None";
    assert.deepEqual(JSON.parse(reachTool(['--check']).out), { webp: true });
    assert.deepEqual(JSON.parse(reachTool(['--check'], noWebp).out), { webp: false });
    r = reachTool([soft, many], noWebp);
    assert.equal(r.code, 1, r.err);
    assert.match(r.err, /no WebP/);
    assert.equal(reachTool([soft], noWebp).code, 0);
  });

  // Restarts the API (twice): before the last one.
  test('WebP okuyamayan sunucuda hareketli çerçeve sonraya kalır; aynı anda iki kayıt (yeni resim, yeni hareketli hali) çerçeveyi ölçüsüz bırakmaz', { skip: NO_PILLOW }, async () => {
    const python = h.env.PYTHON;
    // The API's Python here: without WebP while `webp-yok` is in the folder, 1.5 s slower at measuring while
    // `python-yavas` is. The tool runs with a bare environment (PATH and the language), so the switches are files.
    const wrapper = path.join(dir, 'python-sarmal');
    fs.writeFileSync(
      wrapper,
      [
        '#!/bin/sh',
        `real='${PYTHON}'`,
        `d='${dir}'`,
        'case "$2" in',
        '  *frame-reach.py)',
        '    if [ "$3" != --check ] && [ -e "$d/python-yavas" ]; then sleep 1.5; fi',
        '    if [ -e "$d/webp-yok" ]; then',
        '      shift',
        `      exec "$real" -I -c "import runpy, sys; sys.modules['PIL._webp'] = None; sys.argv = sys.argv[1:]; runpy.run_path(sys.argv[0], run_name='__main__')" "$@"`,
        '    fi',
        '    ;;',
        'esac',
        'exec "$real" "$@"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    const flag = (name, on) => (on ? fs.writeFileSync(path.join(dir, name), '') : fs.rmSync(path.join(dir, name), { force: true }));
    // 200 px stills: drawn in a box, a hole of radius 40 round the middle.
    const ring = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1 && (x + 0.5 - 100) ** 2 + (y + 0.5 - 100) ** 2 > 40 ** 2;
    /** The panel's view of the frame once its box is of its pictures now. */
    const measured = (id) =>
      until(`${id} ölçüldü`, async () => {
        const x = await itemIn(id);
        return x.art.box && (await boxRow(id)).of.startsWith('still') ? x : null;
      });
    try {
      h.env.PYTHON = wrapper;
      flag('webp-yok', true);
      await h.restart();
      await freshAdmin();
      const still = await upload(admin, 'shopframe', framePng(200, ring(40, 30, 160, 170)), 'image/png');
      // 128 px: one frame 32–96 each way, the other 20–108 across and 10–118 down.
      const moving = await upload(admin, 'shopframe', pillowWebp(128, [[32, 32, 96, 96], [20, 10, 108, 118]]), 'image/webp');
      const f = (await ok(post('', { kind: 'frame', name: 'WebP Bekleyen', price: 600, days: 30, art: still, hole: 0.2, motion: moving }), 'hareketli')).item;
      assert.deepEqual([f.art.box, f.art.reach], [null, null]);
      assert.equal((await boxRow(f.id)).of, 'none', 'WebP okunamadı: sonra yine denenir');
      assert.deepEqual((await inCatalog(f.id)).art, { url: still, hole: 0.2, motion: { url: moving } });
      // A still PNG is measured all the same.
      const png = await upload(admin, 'shopframe', framePng(200, ring(40, 30, 160, 170)), 'image/png');
      const g = (await ok(post('', { kind: 'frame', name: 'WebP Beklemeyen', price: 600, days: 30, art: png, hole: 0.2 }), 'durağan')).item;
      assert.deepEqual(g.art.box, { l: 0.2, t: 0.15, r: 0.8, b: 0.85 });

      // A server whose Pillow reads WebP: the frame left over is measured at start, the moving one's frames with it.
      flag('webp-yok', false);
      await h.restart();
      let x = await measured(f.id);
      assert.deepEqual(x.art.box, { l: 0.1562, t: 0.0781, r: 0.8438, b: 0.9219 });
      assert.equal((await boxRow(f.id)).of, 'still+motion');

      // Two saves at once, each measuring for 1.5 s: one a new still picture, the other a new moving version. Each
      // measured with the other's old file, and whichever is stored last holds a box for neither pair of pictures.
      // The later one sees that and the frame is measured again in the background, once.
      const still2 = await upload(admin, 'shopframe', framePng(200, ring(30, 40, 170, 160)), 'image/png');
      // 128 px: one frame 32–96 across and 32–64 down, the other 26–102 across and 6–64 down.
      const moving2 = await upload(admin, 'shopframe', pillowWebp(128, [[32, 32, 96, 64], [26, 6, 102, 64]]), 'image/webp');
      flag('python-yavas', true);
      const from = h.logs.length;
      const [one, two] = await Promise.all([post('/update', { id: f.id, art: still2 }), post('/update', { id: f.id, motion: moving2 })]);
      assert.equal(one[0], 200, one[1].error);
      assert.equal(two[0], 200, two[1].error);
      assert.equal((await boxRow(f.id)).of, 'other', 'iki kayıt birbirinin eski resmiyle ölçtü');
      x = await measured(f.id);
      assert.deepEqual([x.art.url, x.art.motion.url], [still2, moving2]);
      // 0.15–0.85 across and 0.2–0.8 down still, 6 / 128 at the top moving.
      assert.deepEqual(x.art.box, { l: 0.15, t: 0.0468, r: 0.85, b: 0.8 });
      assert.equal((await boxRow(f.id)).of, 'still+motion');
      assert.deepEqual((await inCatalog(f.id)).art, { url: still2, hole: 0.2, motion: { url: moving2 }, reach: { x: 0.35, top: 0.454, bottom: 0.3 } });
      assert.deepEqual(
        h.logs.slice(from).filter((l) => l.startsWith(`shop frame measured: ${f.id}`)),
        [`shop frame measured: ${f.id} 0.15–0.85 × 0.0468–0.8`],
        'bir kez ölçüldü',
      );
    } finally {
      flag('webp-yok', false);
      flag('python-yavas', false);
      if (python === undefined) delete h.env.PYTHON;
      else h.env.PYTHON = python;
    }
  });

  // Restarts the API: last.
  test('Python yokken çerçeve yine kaydedilir, ölçüsüz çizilir; sunucu Pillow ile açılınca eskiler ölçülür ve telefonlar yeniden okur', async () => {
    const python = h.env.PYTHON;
    h.env.PYTHON = path.join(dir, 'python-yok');
    await h.restart();
    await freshAdmin();
    const drawn = (x, y) => x >= 20 && x < 180 && y >= 30 && y < 170 && (x + 0.5 - 100) ** 2 + (y + 0.5 - 100) ** 2 > 50 ** 2;
    const still = await upload(admin, 'shopframe', framePng(200, drawn), 'image/png');
    const f = (await ok(post('', { kind: 'frame', name: 'Pythonsuz Çerçeve', price: 400, days: 7, art: still, hole: 0.25 }), 'Python yokken')).item;
    assert.deepEqual([f.art.url, f.art.box, f.art.reach], [still, null, null]);
    assert.equal((await boxRow(f.id)).of, 'none', 'ölçülmedi: sonra denenir');
    assert.deepEqual((await inCatalog(f.id)).art, { url: still, hole: 0.25 });
    await ok(post('/update', { id: f.id, hole: 0.3 }), 'Python yokken değişir');
    if (!pillowOk) return;

    const [, before] = await call('GET', '/api/catalog');
    if (python === undefined) delete h.env.PYTHON;
    else h.env.PYTHON = python;
    const from = h.logs.length;
    await h.restart();
    let listed;
    for (let i = 0; i < 150 && !listed?.art.reach; i++) {
      await sleep(100);
      listed = await inCatalog(f.id);
    }
    // 20–180 across and 30–170 down, round the middle.
    assert.deepEqual(listed.art, { url: still, hole: 0.3, reach: { x: 0.4, top: 0.35, bottom: 0.35 } });
    assert.ok((await catalog('')).v > before.v, 'telefonlar kataloğu yeniden okur');
    assert.deepEqual(await boxRow(f.id), { art_box_l: '0.1000', art_box_t: '0.1500', art_box_r: '0.9000', art_box_b: '0.8500', of: 'still' });
    // The frames measured before (and the one whose picture can't be read) aren't measured again.
    const measured = h.logs.slice(from).filter((l) => l.startsWith('shop frame measured'));
    assert.deepEqual(measured, [`shop frame measured: ${f.id} 0.1–0.9 × 0.15–0.85`]);
  });
});
