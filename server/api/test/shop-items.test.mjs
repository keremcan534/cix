// Yönetim › Mağaza (shop-items.mjs, 076): the shop's frames and entry effects from the panel. The app's own change (name,
// price, days, VIP level, on/off, order) and go back to the app's values; the admins add frames (a transparent PNG
// around the photo) and entry effects (a video, ready or converted on the server, and the name plate the entering
// person's name is written on). The catalog (?shop=1) hands phones what to draw; the shop sells at the values set here
// with the shown-price rule (a phone that showed the compiled row is told to update when the item moved), and nothing
// is taken from a refused buy.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SHOP } from '../catalog.mjs';
import { convertArgs } from '../custom-gifts.mjs';
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

  test('yalnız yönetici; uygulamanın çerçeveleri ve giriş efektleri listede, eski uygulamaya katalog aynı', async () => {
    const u = await h.signUp('Sıradan');
    await refused(call('GET', '/api/admin/shop', null, u.session), 403);
    await refused(call('POST', '/api/admin/shop/update', { id: 'fr-neon', price: 1 }, u.session), 403);
    const items = await panel();
    const appOnes = [...SHOP.values()].filter((x) => x.kind === 'frame' || x.kind === 'entry');
    assert.deepEqual(items.map((x) => x.id).sort(), appOnes.map((x) => x.sku).sort());
    const neon = items.find((x) => x.id === 'fr-neon');
    assert.deepEqual([neon.builtin, neon.name, neon.price, neon.days, neon.changed], [true, SHOP.get('fr-neon').name, SHOP.get('fr-neon').price, SHOP.get('fr-neon').days, []]);
    const old = await catalog('');
    assert.equal(old.shop, undefined, 'eski uygulama istemez');
    const c = await catalog();
    assert.equal(c.shop.items.length, appOnes.length);
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

  test('yeni giriş efekti: hazır video ve isim plakası; katalogda video ve plaka, sunucudan oynatılır; sırası değişir', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const video = { kind: 'stacked', url: await upload(admin, 'giftvideo', fs.readFileSync(files.stacked), 'video/mp4') };
    await refused(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 30 }), 400, /videosunu önce yükle/);
    await refused(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 30, video, plate: { x: 0.5, y: 0.6, w: 0.6, size: 0.03, color: 'altın' } }), 400, /renk/);
    await refused(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 30, video, plate: { x: 0.5, y: 0.6, w: 0.05, size: 0.03, color: '#FFD700' } }), 400, /genişlik/);
    const plate = { x: 0.5, y: 0.7, w: 0.55, size: 0.04, color: '#ffd700', bold: true };
    const e = (await ok(post('', { kind: 'entry', name: 'Altın Ejderha', price: 5000, days: 0, minVip: 3, video, plate }), 'giriş ekle')).item;
    assert.match(e.id, /^se[0-9]+$/);
    assert.deepEqual([e.days, e.minVip, e.plate], [null, 3, { ...plate, color: '#FFD700' }]);
    const c = await catalog();
    assert.deepEqual(c.shop.items.find((x) => x.sku === e.id), { sku: e.id, kind: 'entry', name: 'Altın Ejderha', price: 5000, days: null, minVip: 3, video: true, plate: { ...plate, color: '#FFD700' } });
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

  test('kaynak videodan giriş efekti sunucuda çevrilir (hediyelerle aynı çevirici)', { skip: NO_FFMPEG }, async () => {
    await freshAdmin();
    const source = await upload(admin, 'giftsource', fs.readFileSync(files.source), 'video/webm');
    const e = (await ok(post('', { kind: 'entry', name: 'Kuyruklu Işık', price: 1200, days: 30, video: { kind: 'source', url: source } }), 'kaynakla ekle')).item;
    assert.equal(e.job?.status, 'processing');
    assert.equal(e.video, null);
    const done = await settled(e.id);
    assert.equal(done.job, null, JSON.stringify(done.job));
    assert.ok(done.video?.bytes > 0);
    assert.deepEqual(done.plate, { x: 0.5, y: 0.62, w: 0.6, size: 0.035, color: '#FFFFFF', bold: true }, 'plakası olmayana varsayılan');
    const audit = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'shop.video_ready'")).rows;
    assert.equal(audit.at(-1).detail.shop, e.id);
    // Nobody has it: it can be deleted, and is gone from the shop and the videos.
    await ok(post('/delete', { id: e.id }), 'sil');
    const c = await catalog();
    assert.equal(c.shop.items.some((x) => x.sku === e.id), false);
    assert.equal(c.fx.some((x) => x.id === e.id), false);
    assert.equal((await fetch(`${h.base}/api/fx/s/${e.id}.mp4`)).status, 404);
  });
});
