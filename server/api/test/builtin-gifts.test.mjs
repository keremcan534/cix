// Yönetim › Hediyeler for the app's own gifts (custom-gifts.mjs, 069): the panel lists them with their values in the
// app and what was changed; name, emoji, price, shelf, VIP level, order, on/off, icon and video change without an app
// update and go back to the app's values. A newer app (?gifts=2) gets it all; an older one, which shows the app's own
// price, never sees a re-priced gift and is refused when it sends one. Every send carries the price the phone showed.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GIFTS } from '../catalog.mjs';
import { convertArgs } from '../custom-gifts.mjs';
import { startApi } from './harness.mjs';
import { bucketEnv, png, standInBucket } from './stand-in-bucket.mjs';

const PORT = 23000 + (process.pid % 900);
const { stored } = standInBucket(PORT);
const h = startApi({ ...bucketEnv(PORT), CUSTOM_GIFTS_POLL_MS: '200', BAG_SWEEP_MS: '200' });
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
const rnd = () => Math.random().toString(36).slice(2, 12);

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const NO_FFMPEG = spawnSync(FFMPEG, ['-version']).status === 0 && spawnSync(process.env.FFPROBE || 'ffprobe', ['-version']).status === 0 ? false : 'ffmpeg yok';

let admin;
let alice;
let bob;
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
const keyOfUrl = (url) => url.replace(/^.*\/api\/media\/f\//, '');
const panel = (all = true) => ok(call('GET', `/api/admin/gifts${all ? '?builtin=1' : ''}`, null, admin.session), 'panel');
const appGift = async (id) => (await panel()).gifts.find((g) => g.id === id);
const update = (body) => ok(call('POST', '/api/admin/gifts/update', body, admin.session), `güncelle ${JSON.stringify(body).slice(0, 60)}`);
const reset = (id, fields) => ok(call('POST', '/api/admin/gifts/reset', { id, ...(fields ? { fields } : {}) }, admin.session), `geri al ${id}`);
const newApp = () => ok(call('GET', '/api/catalog?gifts=2'), 'katalog (yeni uygulama)');
const oldApp = () => ok(call('GET', '/api/catalog'), 'katalog (eski uygulama)');
const send = (giftId, extra = {}, who = alice) => call('POST', '/api/gifts/send', { to: bob.user.id, giftId, count: 1, ref: `b-${giftId}-${rnd()}`, ...extra }, who.session);
const shelf = (c, cat) => c.gifts.filter((g) => g.cat === cat).map((g) => g.id);

describe('Yönetim › Hediyeler: uygulamanın kendi hediyeleri', () => {
  before(async () => {
    admin = await h.account('Hediye Düzenleyen', 'admin');
    alice = await h.signUp('Gönderen');
    bob = await h.signUp('Alan');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 100000, ref: `topup-${rnd()}` }, alice.session), 'yükleme');
  });

  test('panel: ?builtin=1 uygulamanın hediyelerini uygulamadaki değerleriyle listeler; eski panel yalnız eklenenleri görür', async () => {
    assert.deepEqual((await panel(false)).gifts, [], 'eski panel: yalnız yöneticinin hediyeleri');
    const p = await panel();
    assert.equal(p.gifts.length, GIFTS.size);
    const g6 = p.gifts.find((g) => g.id === 'g6');
    assert.equal(g6.builtin, true);
    assert.deepEqual(
      { name: g6.name, emoji: g6.emoji, price: g6.price, cat: g6.cat, minSvip: g6.minSvip, enabled: g6.enabled, changed: g6.changed },
      { name: 'Roket', emoji: '🚀', price: 1999, cat: 'hot', minSvip: 0, enabled: true, changed: [] },
    );
    assert.deepEqual(g6.original.name, 'Roket');
    // The app's picture, served here for the panel; the gift's own clip (fx.mjs) as its video.
    assert.equal(g6.icon, '/api/fx/art/gifts/g6.webp');
    const art = await fetch(`${h.base}${g6.icon}`);
    assert.equal(art.status, 200);
    assert.equal(art.headers.get('content-type'), 'image/webp');
    assert.match(g6.video.url, /^\/api\/fx\/roket\.mp4\?v=[0-9a-f]{12}$/);
    assert.equal((await fetch(`${h.base}/api/fx/art/gifts/yok.webp`)).status, 404);
    // A paused gift (catalog.mjs GIFTS_PAUSED) is listed as off the shelves; Özel keeps its VIP level.
    assert.equal(p.gifts.find((g) => g.id === 'g1').enabled, false);
    assert.equal(p.gifts.find((g) => g.id === 'v12').minSvip, 9);
    // In the shelves' order: Popüler first, in the app's order.
    assert.deepEqual(
      p.gifts.filter((g) => g.cat === 'hot').map((g) => g.id).slice(0, 8),
      ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'h15', 'h16'],
    );
  });

  test('ad, emoji ve fiyat değişir: yeni uygulama görür, eski uygulamaya fiyatı değişen gösterilmez', async () => {
    const old0 = await oldApp();
    assert.ok(old0.gifts.some((g) => g.id === 'h15'));
    assert.equal(old0.giftsFormat, undefined);
    const g = (await update({ id: 'h15', name: 'Dev Panda', emoji: '🐻', price: 6500 })).gift;
    assert.deepEqual([g.name, g.emoji, g.price], ['Dev Panda', '🐻', 6500]);
    assert.deepEqual(g.changed, ['name', 'emoji', 'price']);
    assert.equal(g.original.price, 5999);
    const c = await newApp();
    assert.equal(c.giftsFormat, 2);
    assert.deepEqual(c.gifts.find((x) => x.id === 'h15'), { id: 'h15', name: 'Dev Panda', emoji: '🐻', price: 6500, cat: 'hot', minSvip: 0 });
    assert.ok(c.v > old0.v, 'katalog sürümü arttı');
    // An older app would show 5.999: the gift isn't in its list.
    assert.ok(!(await oldApp()).gifts.some((x) => x.id === 'h15'));
    // Only a name change: an older app keeps it (it shows its own name, the price is right).
    await update({ id: 'h16', name: 'Altın Sandık' });
    assert.ok((await oldApp()).gifts.some((x) => x.id === 'h16'));
    // The same value as the app's is kept as "unchanged".
    const back = (await update({ id: 'h16', name: 'Hazine Sandığı' })).gift;
    assert.deepEqual(back.changed, []);
    assert.equal((await q("SELECT name FROM custom_gifts WHERE id = 'h16'")).rows[0].name, null);
  });

  test('gönderim: yeni fiyatla; telefonun gösterdiği fiyat tutmazsa 409, eski uygulama fiyatı değişene gönderemez', async () => {
    await update({ id: 'h17', price: 12_000 });
    const coins0 = (await ok(call('GET', '/api/me', null, alice.session))).user.coins;
    const r = await ok(send('h17', { price: 12_000 }), 'gönder');
    assert.equal(r.total, 12_000);
    assert.equal(r.user.coins, coins0 - 12_000);
    const ev = (await q('SELECT unit_price FROM gift_events WHERE sender = $1 ORDER BY id DESC LIMIT 1', [alice.user.id])).rows[0];
    assert.equal(Number(ev.unit_price), 12_000);
    // The phone still showed the old price: nothing moves, it hears the new one.
    const stale = await refused(send('h17', { price: 9999 }), 409, /fiyatı değişti/);
    assert.equal(stale.code, 'price_changed');
    assert.equal(stale.price, 12_000);
    assert.equal((await ok(call('GET', '/api/me', null, alice.session))).user.coins, coins0 - 12_000);
    // An older app sends no price and shows 9.999: refused, update the app.
    const old = await refused(send('h17'), 409, /uygulamayı güncelle/);
    assert.equal(old.code, 'update_required');
    // A gift whose price is the app's: an older app sends it as before; a newer one with its price.
    assert.equal((await ok(send('g6'), 'eski uygulama')).total, 1999);
    assert.equal((await ok(send('g6', { price: 1999 }), 'yeni uygulama')).total, 1999);
    // A retry of a send that went through gets its replay, even after the price moved again.
    const ref = `b-tekrar-${rnd()}`;
    await ok(call('POST', '/api/gifts/send', { to: bob.user.id, giftId: 'h18', count: 1, price: 14_999, ref }, alice.session), 'ilk');
    await update({ id: 'h18', price: 15_500 });
    const again = await ok(call('POST', '/api/gifts/send', { to: bob.user.id, giftId: 'h18', count: 1, price: 14_999, ref }, alice.session), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(again.total, 14_999);
  });

  test('adlar çakışmaz: uygulamanın adları ve yöneticinin hediyeleri; geri alınan ad doluysa 409', async () => {
    await refused(call('POST', '/api/admin/gifts/update', { id: 'g5', name: 'kalp' }, admin.session), 409, /uygulamadaki/);
    await update({ id: 'g5', name: 'Altın Taç' });
    // "Taç" is free now: an admin's gift may take it, and then g5 can't go back to it.
    const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    const taken = (await ok(call('POST', '/api/admin/gifts', { name: 'Taç', price: 300, cat: 'hot', icon }, admin.session), 'Taç adlı hediye')).gift;
    await refused(call('POST', '/api/admin/gifts/reset', { id: 'g5', fields: ['name'] }, admin.session), 409, /zaten var/);
    await ok(call('POST', '/api/admin/gifts/delete', { id: taken.id }, admin.session), 'sil');
    assert.equal((await reset('g5', ['name'])).gift.name, 'Taç');
    await refused(call('POST', '/api/admin/gifts', { name: 'Roket', price: 10, cat: 'hot', icon }, admin.session), 409, /uygulamadaki/);
  });

  test('raf ve VIP: Özel rafa taşınan VIP ister, rafının başına geçer; geri alınınca yerine döner', async () => {
    const couple = shelf(await newApp(), 'couple');
    assert.deepEqual(couple, ['c3', 'c6', 'c8', 'c13', 'koruma'], 'İkili: duraklatılmamış olanlar, uygulamanın sırasıyla');
    const g = (await update({ id: 'c3', cat: 'privilege', minSvip: 4 })).gift;
    assert.deepEqual([g.cat, g.minSvip], ['privilege', 4]);
    assert.deepEqual(g.changed, ['cat']);
    await refused(send('c3', { price: 99_999 }), 403, /VIP 4/);
    const c = await newApp();
    assert.equal(shelf(c, 'privilege')[0], 'c3', 'Özel rafının başında');
    assert.ok(!shelf(c, 'couple').includes('c3'));
    // A compiled Özel gift taken to Popüler needs no VIP there.
    const v6 = (await update({ id: 'v6', cat: 'hot' })).gift;
    assert.deepEqual([v6.cat, v6.minSvip], ['hot', 0]);
    await refused(call('POST', '/api/admin/gifts/update', { id: 'v6', cat: 'privilege', minSvip: 11 }, admin.session), 400, /VIP/);
    // Back to Özel without a level: the app's own level again.
    assert.equal((await update({ id: 'v6', cat: 'privilege' })).gift.minSvip, 5);
    const r = (await reset('c3', ['cat'])).gift;
    assert.deepEqual([r.cat, r.minSvip, r.changed], ['couple', 0, []]);
    assert.deepEqual(shelf(await newApp(), 'couple'), couple, 'uygulamadaki yerine döndü');
    await reset('v6');
    assert.deepEqual((await appGift('v6')).changed, []);
  });

  test('rafta / kapalı: duraklatılmış hediye rafa döner, açık olan kalkar (yine gönderilebilir); sıra karışık', async () => {
    // g1 is paused in the app: on the shelves now, for every app (an older one has its picture).
    assert.ok(!(await oldApp()).gifts.some((x) => x.id === 'g1'));
    assert.equal((await update({ id: 'g1', enabled: true })).gift.enabled, true);
    assert.ok((await oldApp()).gifts.some((x) => x.id === 'g1'));
    assert.ok((await newApp()).gifts.some((x) => x.id === 'g1'));
    // Off the shelves: out of every list, but a phone that has it can still send it (the paused gifts' way).
    await update({ id: 'g6', enabled: false });
    assert.ok(!(await newApp()).gifts.some((x) => x.id === 'g6'));
    assert.equal((await ok(send('g6', { price: 1999 }), 'raftaki değil ama gönderilebilir')).total, 1999);
    // One order for a shelf with an admin's gift and the app's among it.
    const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    const mine = (await ok(call('POST', '/api/admin/gifts', { name: `Yıldız ${rnd().slice(0, 4)}`, price: 700, cat: 'hot', icon }, admin.session), 'ekle')).gift;
    assert.equal(shelf(await newApp(), 'hot')[0], mine.id, 'yeni eklenen rafın başında');
    const want = ['h20', mine.id, 'g1', 'h21'];
    const rest = (await panel()).gifts.filter((g) => g.cat === 'hot' && !want.includes(g.id)).map((g) => g.id);
    await ok(call('POST', '/api/admin/gifts/order', { ids: [...want, ...rest] }, admin.session), 'sırala');
    assert.deepEqual(shelf(await newApp(), 'hot').slice(0, 4), want);
    // A new gift still goes first.
    const next = (await ok(call('POST', '/api/admin/gifts', { name: `Ay ${rnd().slice(0, 4)}`, price: 700, cat: 'hot', icon: await upload(admin, 'gifticon', png(256, 256), 'image/png') }, admin.session), 'ekle 2')).gift;
    assert.equal(shelf(await newApp(), 'hot')[0], next.id);
    // Ordering isn't "a change" of each gift, and going back to the app's values keeps the order.
    assert.deepEqual((await appGift('h20')).changed, []);
    await update({ id: 'h20', price: 26_000 });
    await reset('h20');
    assert.deepEqual(shelf(await newApp(), 'hot').slice(1, 5), want, 'yeni eklenenin ardından aynı sıra');
    await reset('g1', ['enabled']);
    await reset('g6', ['enabled']);
    assert.ok(!(await newApp()).gifts.some((x) => x.id === 'g1'));
    // Its place too, when asked: back after the gifts that were ordered.
    await reset('h20', ['sort']);
    assert.equal(shelf(await newApp(), 'hot').at(-1), 'h20');
  });

  test('ikon: yüklenen ikon yeni uygulamaya gider; geri alınınca dosya silinir, uygulamanın resmi döner', async () => {
    const url = await upload(admin, 'gifticon', png(512, 512), 'image/png');
    const g = (await update({ id: 'c13', icon: url })).gift;
    assert.ok(g.icon.startsWith(`${h.base}/api/media/f/gifticon/`), g.icon);
    assert.deepEqual(g.changed, ['icon']);
    assert.equal((await newApp()).gifts.find((x) => x.id === 'c13').icon, g.icon);
    // An older app draws its own picture: nothing to leave out.
    assert.ok((await oldApp()).gifts.some((x) => x.id === 'c13'));
    const opaque = await upload(admin, 'gifticon', png(256, 256, { alpha: false }), 'image/png');
    await refused(call('POST', '/api/admin/gifts/update', { id: 'c13', icon: opaque }, admin.session), 400, /saydam/);
    const back = (await reset('c13', ['icon'])).gift;
    assert.equal(back.icon, '/api/fx/art/gifts/c13.webp');
    assert.equal((await newApp()).gifts.find((x) => x.id === 'c13').icon, undefined);
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(url)), 'eski ikon depodan silindi');
    // icon: null also gives the app's picture back.
    await update({ id: 'c13', icon: await upload(admin, 'gifticon', png(256, 256), 'image/png') });
    assert.equal((await update({ id: 'c13', icon: null })).gift.icon, '/api/fx/art/gifts/c13.webp');
  });

  test('video: yeni video uygulamanın klibinin yerine geçer, kapatılır, geri gelir', { skip: NO_FFMPEG }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builtin-gift-'));
    const source = path.join(dir, 'kaynak.webm');
    const stacked = path.join(dir, 'yigilmis.mp4');
    const box = "drawbox=x='20+t*40':y=140:w=120:h=200:color=red@1:t=fill";
    const ff = (args) => assert.equal(spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args]).status, 0);
    ff(['-f', 'lavfi', '-i', `color=c=black@0:s=270x480:r=20:d=2,format=rgba,${box}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '300k', source]);
    ff(convertArgs(source, stacked, 'vp9').slice(4));
    const clipOf = (c) => c.fx.find((x) => x.kind === 'gift' && x.id === 'g6');
    assert.match(clipOf(await oldApp()).url, /^\/api\/fx\/roket\.mp4/);
    const url = await upload(admin, 'giftvideo', fs.readFileSync(stacked), 'video/mp4');
    const g = (await update({ id: 'g6', video: { url, kind: 'stacked' } })).gift;
    assert.match(g.video.url, /^\/api\/fx\/g\/g6\.mp4\?v=[0-9a-f]{12}$/);
    assert.deepEqual(g.changed, ['video']);
    // Every app's list: one clip for Roket, the new one (an app since the admins' gifts reads /api/fx/g/).
    for (const c of [await oldApp(), await newApp()]) {
      assert.equal(c.fx.filter((x) => x.kind === 'gift' && x.id === 'g6').length, 1);
      assert.equal(clipOf(c).url, g.video.url);
    }
    const clip = await fetch(`${h.base}${g.video.url}`);
    assert.equal(clip.status, 200);
    assert.deepEqual(Buffer.from(await clip.arrayBuffer()), fs.readFileSync(stacked));
    // video: null: no video at all, the gift's own clip neither.
    const off = (await update({ id: 'g6', video: null })).gift;
    assert.equal(off.video, null);
    assert.equal(off.videoOff, true);
    assert.equal(clipOf(await newApp()), undefined);
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(url)));
    // Back to the app's: its own clip again.
    assert.match((await reset('g6', ['video'])).gift.video.url, /^\/api\/fx\/roket\.mp4/);
    assert.match(clipOf(await newApp()).url, /^\/api\/fx\/roket\.mp4/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('sınırlar: uygulamanın hediyesi silinmez, yöneticinin hediyesi "orijinale dön"mez; yalnız yönetici; denetim kaydı', async () => {
    await refused(call('POST', '/api/admin/gifts/delete', { id: 'g2' }, admin.session), 400, /silinemez/);
    await refused(call('POST', '/api/admin/gifts/reset', { id: 'a1' }, admin.session), 400, /uygulamanın kendi/);
    await refused(call('POST', '/api/admin/gifts/reset', { id: 'g2', fields: ['renk'] }, admin.session), 400, /Geri alınabilenler/);
    await refused(call('POST', '/api/admin/gifts/update', { id: 'zz9', price: 5 }, admin.session), 400, /Geçersiz/);
    await refused(call('POST', '/api/admin/gifts/update', { id: 'g2', price: 5 }, alice.session), 403);
    await refused(call('POST', '/api/admin/gifts/update', { id: 'g2' }, admin.session), 400, /Değişiklik yok/);
    // Never changed: a reset changes nothing and says so by its answer.
    assert.deepEqual((await reset('p3')).gift.changed, []);
    await update({ id: 'p3', price: 250 });
    await reset('p3');
    const rows = (await q("SELECT action, detail FROM audit_events WHERE detail->>'gift' = 'p3' ORDER BY id")).rows;
    assert.deepEqual(rows.map((x) => x.action), ['gift.update', 'gift.reset']);
    assert.equal(rows[0].detail.after.price, 250);
    assert.equal(rows[1].detail.after.price, null);
    assert.deepEqual((await appGift('p3')).changed, []);
  });

  test('Şanslı çanta: telefonun gösterdiği birim fiyatla', async () => {
    const room = (await ok(call('POST', '/api/rooms', { title: 'Hediye odası' }, alice.session), 'oda')).room.id;
    await update({ id: 'p2', price: 120 });
    const drop = (extra) => call('POST', '/api/lucky-bags', { room, kind: 'gift', giftId: 'p2', count: 10, packets: 5, followersOnly: false, delay: 0, ref: rnd(), ...extra }, alice.session);
    assert.equal((await refused(drop({}), 409, /güncelle/)).code, 'update_required');
    assert.equal((await refused(drop({ price: 99 }), 409, /fiyatı değişti/)).price, 120);
    const bag = await ok(drop({ price: 120 }), 'çanta');
    assert.equal(bag.bag.unitPrice, 120);
    assert.equal(bag.bag.units, 10);
    await reset('p2');
  });
});
