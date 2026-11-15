// Yönetim › Emojiler (emoji.mjs, 070): the emoji panel's packs and stickers from the panel. The app's own packs and
// stickers change (name, price, VIP level, on/off, order; a sticker's name, emoji, pack, picture) and go back to the
// app's values; the admins add packs and stickers of their own (a transparent PNG/WebP or a Lottie animation). The
// catalog (?emoji=1) hands phones what to draw, the shop sells a pack at the price set here (an older app buying by
// the app's name and price too), and every change makes the phones read the catalog again.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { SHOP } from '../catalog.mjs';
import { STICKER_PACKS } from '../stickers.mjs';
import { startApi } from './harness.mjs';
import { bucketEnv, png, standInBucket } from './stand-in-bucket.mjs';

const PORT = 24000 + (process.pid % 900);
const SITE_PORT = 25000 + (process.pid % 900);
const { stored } = standInBucket(PORT);
// A site with a sticker picture on it (the "ya da bağlantı yapıştır" field).
const site = http.createServer((req, res) => {
  if (req.url === '/emoji/yildiz.png') return res.writeHead(200, { 'content-type': 'image/png' }).end(png(256, 256));
  res.writeHead(404).end();
});
site.listen(SITE_PORT, '127.0.0.1');
after(() => site.close());
const h = startApi({ ...bucketEnv(PORT), EMOJI_POLL_MS: '200', LINK_FETCH_ALLOW: `127.0.0.1:${SITE_PORT}` });
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

/** A Lottie animation of `seconds` at 30 fps: one shape layer; `asset` adds a picture loaded from elsewhere. */
const lottie = (seconds = 2, asset = false) =>
  Buffer.from(
    JSON.stringify({
      v: '5.7.4',
      fr: 30,
      ip: 0,
      op: Math.round(30 * seconds),
      w: 256,
      h: 256,
      layers: [{ ty: 4, ip: 0, op: 60, st: 0, ks: {}, shapes: [] }],
      assets: asset ? [{ id: 'img', w: 64, h: 64, u: 'https://example.com/', p: 'x.png', e: 0 }] : [],
    }),
  );

let admin;
let alice;
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
const keyOfUrl = (url) => url.replace(/^.*\/api\/media\/f\//, '');
const panel = () => ok(call('GET', '/api/admin/emoji', null, admin.session), 'panel');
const packIn = async (id) => (await panel()).packs.find((p) => p.id === id);
const stickerIn = async (id) => (await panel()).packs.flatMap((p) => p.stickers).find((s) => s.id === id);
const post = (path, body, who = admin) => ok(call('POST', `/api/admin/emoji${path}`, body, who.session), `${path} ${JSON.stringify(body).slice(0, 60)}`);
const catalog = () => ok(call('GET', '/api/catalog?gifts=2&emoji=1'), 'katalog');
const packOf = (c, id) => c.emoji.packs.find((p) => p.id === id);
const stickerOf = (c, id) => c.emoji.packs.flatMap((p) => p.stickers).find((s) => s.id === id);
const shop = async (who = alice) => (await ok(call('GET', '/api/economy', null, who.session), 'ekonomi')).shop;
const buy = (sku, price, who = alice) => call('POST', '/api/shop/buy', { sku, price, ref: `b-${rnd()}` }, who.session);
const image = (w = 256, h = w, o) => upload(admin, 'stickerart', png(w, h, o), 'image/png');

describe('Yönetim › Emojiler', () => {
  before(async () => {
    admin = await h.account('Emoji Yöneticisi', 'admin');
    alice = await h.signUp('Paket Alan');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 50_000, ref: `t-${rnd()}` }, alice.session), 'yükleme');
  });

  test('panel ve katalog: uygulamanın paketleri ve çıkartmaları, uygulamadaki değerleriyle; eski uygulama hiç almaz', async () => {
    const p = await panel();
    assert.equal(p.packs.length, STICKER_PACKS.length);
    assert.deepEqual(
      p.packs.map((x) => x.id),
      STICKER_PACKS.map((x) => x.id),
    );
    const vip = p.packs.find((x) => x.id === 'vip');
    assert.deepEqual([vip.name, vip.price, vip.minVip, vip.enabled, vip.changed], ['VIP', 0, 5, true, []]);
    assert.equal(p.packs.find((x) => x.id === 'basic').enabled, false, 'Temel uygulamada emekli');
    assert.equal(p.packs.find((x) => x.id === 'duygu').emojiTab, true);
    const tac = vip.stickers.find((s) => s.id === 'vip-tac');
    assert.equal(tac.picture, '/api/fx/art/stickers/vip-tac.webp');
    assert.equal((await fetch(`${h.base}${tac.picture}`)).status, 200);
    // A Lottie sticker of the app's has no still picture here: the panel shows its emoji.
    assert.equal(p.packs.find((x) => x.id === 'duygu').stickers[0].picture, null);
    const c = await catalog();
    assert.equal(c.emoji.packs.length, STICKER_PACKS.length);
    assert.equal(stickerOf(c, 'vip-tac').art, undefined, 'uygulamanın resmi: adres yok');
    assert.equal(packOf(c, 'basic').off, true);
    assert.equal((await ok(call('GET', '/api/catalog'))).emoji, undefined, 'eski uygulama sormaz');
    // The sold packs: the same names and prices as the shop's compiled rows.
    for (const x of STICKER_PACKS.filter((x) => x.price > 0)) assert.deepEqual([SHOP.get(`pack-${x.id}`)?.name, SHOP.get(`pack-${x.id}`)?.price], [x.name, x.price], x.id);
  });

  test('uygulamanın paketi: ad ve fiyat değişir, mağaza yeni fiyatla satar; eski uygulama eski adla alır, fiyat tutmazsa 409', async () => {
    const v0 = (await ok(call('GET', '/api/config'))).v;
    const pack = (await post('/packs/update', { id: 'fun', name: 'Çılgınlar', price: 70 })).pack;
    assert.deepEqual([pack.name, pack.price, pack.changed], ['Çılgınlar', 70, ['name', 'price']]);
    assert.ok((await ok(call('GET', '/api/config'))).v > v0, 'telefonlar kataloğu yeniden okur');
    assert.deepEqual(packOf(await catalog(), 'fun').name, 'Çılgınlar');
    const item = (await shop()).find((x) => x.sku === 'pack-fun');
    assert.deepEqual([item.name, item.price], ['Çılgınlar', 70]);
    // The shop's own check: the price the phone showed.
    assert.equal((await refused(buy('pack-fun', 50), 409, /Fiyat değişti/)).price, 70);
    // An older app spends "Çıkartma paketi: Eğlence" at 50: found by the app's name, too little for the price now.
    const old = await refused(call('POST', '/api/wallet/spend', { amount: 50, reason: 'Çıkartma paketi: Eğlence', ref: `s-${rnd()}` }, alice.session), 409, /uygulamayı güncelle/);
    assert.equal(old.code, 'update_required');
    const coins0 = (await ok(call('GET', '/api/me', null, alice.session))).user.coins;
    await ok(buy('pack-fun', 70), 'yeni fiyatla al');
    assert.equal((await ok(call('GET', '/api/me', null, alice.session))).user.coins, coins0 - 70);
    assert.equal((await packIn('fun')).owners, 1);
    // A lower price: an older app that shows 80 for Aşk pays the lower one.
    await post('/packs/update', { id: 'love', price: 40 });
    const r = await ok(call('POST', '/api/wallet/spend', { amount: 80, reason: 'Çıkartma paketi: Aşk', ref: `s-${rnd()}` }, alice.session), 'eski uygulama');
    assert.equal(r.user.coins, coins0 - 70 - 40);
    // Back to the app's: the same value again is "unchanged"; a reset gives the name and price back.
    assert.deepEqual((await post('/packs/update', { id: 'love', price: 80 })).pack.changed, []);
    const back = (await post('/packs/reset', { id: 'fun' })).pack;
    assert.deepEqual([back.name, back.price, back.changed], ['Eğlence', 50, []]);
  });

  test('ücretsiz paket satılık olur, satılık paket kapanır; VIP sınırı; Hamle satılmaz', async () => {
    assert.ok(!(await shop()).some((x) => x.sku === 'pack-muzik'), 'ücretsiz: satılmaz');
    await post('/packs/update', { id: 'muzik', price: 30 });
    assert.equal((await shop()).find((x) => x.sku === 'pack-muzik')?.price, 30);
    await post('/packs/update', { id: 'muzik', enabled: false });
    assert.ok(!(await shop()).some((x) => x.sku === 'pack-muzik'), 'kapalı paket satılmaz');
    assert.equal(packOf(await catalog(), 'muzik').off, true);
    await refused(buy('pack-muzik', 30), 400, /satışta değil/);
    await post('/packs/reset', { id: 'muzik' });
    // A VIP level on a sold pack: the shop checks it.
    await post('/packs/update', { id: 'tea', minVip: 3 });
    await refused(buy('pack-tea', 60), 403, /VIP 3/);
    await post('/packs/reset', { id: 'tea', fields: ['minVip'] });
    await refused(call('POST', '/api/admin/emoji/packs/update', { id: 'hamle', price: 10 }, admin.session), 400, /Hamle/);
    await refused(call('POST', '/api/admin/emoji/packs/update', { id: 'party', name: 'aşk' }, admin.session), 409, /zaten var/);
  });

  test('yeni paket ve çıkartmaları: PNG ve Lottie; katalogda resim adresiyle; mağazada satılır', async () => {
    const pack = (await post('/packs', { name: 'Kedi Sarayı', price: 120 })).pack;
    assert.match(pack.id, /^ep\d+$/);
    assert.equal((await panel()).packs[0].id, pack.id, 'yeni paket başta');
    const art = await image(256);
    const a = (await post('/stickers', { pack: pack.id, name: 'Mırnav', emoji: '🐱', art })).sticker;
    assert.match(a.id, /^es\d+$/);
    assert.ok(a.picture.startsWith(`${h.base}/api/media/f/stickerart/`), a.picture);
    const anim = await upload(admin, 'stickerart', lottie(2), 'application/json');
    const b = (await post('/stickers', { pack: pack.id, name: 'Dans eden kedi', emoji: '💃', art: anim })).sticker;
    assert.equal(b.art.kind, 'lottie');
    assert.equal(b.picture, null, 'Lottie: panel emojisini gösterir');
    const c = await catalog();
    const p = packOf(c, pack.id);
    assert.deepEqual([p.name, p.price, p.custom, p.animated], ['Kedi Sarayı', 120, true, true]);
    assert.deepEqual(p.stickers.map((s) => s.id), [a.id, b.id], 'eklenen sona');
    assert.deepEqual(p.stickers[0].art, { url: a.picture, kind: 'image' });
    // The JSON opens at this server with its type (lottie-react-native reads it from there).
    const j = await fetch(p.stickers[1].art.url);
    assert.equal(j.headers.get('content-type'), 'application/json');
    assert.equal((await j.json()).fr, 30);
    await ok(buy(`pack-${pack.id}`, 120), 'yeni paketi al');
    const items = (await ok(call('GET', '/api/economy', null, alice.session))).items ?? [];
    assert.ok(JSON.stringify(items).includes(`pack-${pack.id}`) || (await q('SELECT 1 FROM entitlements WHERE sku = $1', [`pack-${pack.id}`])).rowCount);
    // Bought: it can't be deleted any more, only closed.
    await refused(call('POST', '/api/admin/emoji/packs/delete', { id: pack.id }, admin.session), 409, /1 kişi aldı/);
  });

  test('çıkartma resmi kuralları: saydam, kare, 96–1024 px; Lottie en çok 10 sn, resimleri içinde', async () => {
    const pack = (await post('/packs', { name: `Deneme ${rnd().slice(0, 4)}`, price: 0 })).pack;
    const add = async (art) => call('POST', '/api/admin/emoji/stickers', { pack: pack.id, name: 'Deneme', art }, admin.session);
    await refused(add(await image(256, 256, { alpha: false })), 400, /saydam/);
    await refused(add(await image(64)), 400, /96–1024/);
    await refused(add(await image(512, 256)), 400, /kare/);
    await refused(add(await upload(admin, 'stickerart', lottie(12), 'application/json')), 400, /10 saniye/);
    await refused(add(await upload(admin, 'stickerart', lottie(2, true), 'application/json')), 400, /dosyanın içinde/);
    await refused(add(await upload(admin, 'stickerart', Buffer.from('{"merhaba": 1}'), 'application/json')), 400, /Lottie animasyonu değil/);
    await refused(add(await upload(admin, 'gifticon', png(256, 256), 'image/png')), 400, /Resmi önce yükle/);
    await refused(call('POST', '/api/admin/emoji/stickers', { pack: 'hamle', name: 'Yeni hamle', art: await image() }, admin.session), 400, /Hamle/);
    await refused(call('POST', '/api/media/upload-url', { kind: 'stickerart', contentType: 'image/png', size: 100 }, alice.session), 403);
    await refused(call('POST', '/api/media/upload-url', { kind: 'stickerart', contentType: 'image/png', size: 600 * 1024 }, admin.session), 400);
    // Nothing went in, so the empty pack goes.
    await ok(call('POST', '/api/admin/emoji/packs/delete', { id: pack.id }, admin.session), 'boş paketi sil');
    assert.equal(await packIn(pack.id), undefined);
  });

  test('uygulamanın çıkartması: ad, emoji, resim, paket ve kapatma; orijinaline döner, eski resim silinir', async () => {
    const art = await image(256);
    const s = (await post('/stickers/update', { id: 'vip-tac', name: 'Altın Taç', emoji: '🤴', art })).sticker;
    assert.deepEqual([s.name, s.emoji, s.changed], ['Altın Taç', '🤴', ['name', 'emoji', 'art']]);
    assert.equal(stickerOf(await catalog(), 'vip-tac').art.kind, 'image');
    // Moved to Aşk: the end of it; off: listed for the messages that show it.
    const moved = (await post('/stickers/update', { id: 'vip-tac', pack: 'love', enabled: false })).sticker;
    assert.equal(moved.pack, 'love');
    const c = await catalog();
    assert.equal(packOf(c, 'love').stickers.at(-1).id, 'vip-tac');
    assert.equal(packOf(c, 'love').stickers.at(-1).off, true);
    assert.ok(!packOf(c, 'vip').stickers.some((x) => x.id === 'vip-tac'));
    const back = (await post('/stickers/reset', { id: 'vip-tac' })).sticker;
    assert.deepEqual([back.pack, back.name, back.emoji, back.enabled, back.changed], ['vip', 'Taç', '👑', true, []]);
    assert.equal(packOf(await catalog(), 'vip').stickers[0].id, 'vip-tac', 'yerine döndü');
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(art)), 'yüklenen resim depodan silindi');
    // art: null also gives the app's picture back; the admins' sticker must keep one.
    await post('/stickers/update', { id: 'ask-gul', art: await image() });
    assert.equal((await post('/stickers/update', { id: 'ask-gul', art: null })).sticker.picture, '/api/fx/art/stickers/ask-gul.webp');
    await refused(call('POST', '/api/admin/emoji/stickers/delete', { id: 'ask-gul' }, admin.session), 400, /silinemez/);
  });

  test('sıra: paketler ve bir paketin çıkartmaları; "orijinale dön" sırayı bozmaz', async () => {
    const ids = (await panel()).packs.map((p) => p.id);
    const want = ['penguen', 'vip', ...ids.filter((x) => x !== 'penguen' && x !== 'vip')];
    await post('/packs/order', { ids: want });
    assert.deepEqual(
      (await catalog()).emoji.packs.map((p) => p.id),
      want,
    );
    await post('/packs/update', { id: 'penguen', price: 175 });
    await post('/packs/reset', { id: 'penguen' });
    assert.equal((await catalog()).emoji.packs[0].id, 'penguen', 'sıra yerinde');
    const animals = (await packIn('animals')).stickers.map((s) => s.id);
    const turned = [...animals].reverse();
    await post('/stickers/order', { pack: 'animals', ids: turned });
    assert.deepEqual(packOf(await catalog(), 'animals').stickers.map((s) => s.id), turned);
    await refused(call('POST', '/api/admin/emoji/stickers/order', { pack: 'animals', ids: ['vip-tac'] }, admin.session), 400, /bu pakette/);
  });

  test('silme: yöneticinin çıkartması "gone" listesine; kimsenin almadığı paket silinir, içine taşınan uygulama çıkartması evine döner', async () => {
    const pack = (await post('/packs', { name: `Geçici ${rnd().slice(0, 4)}`, price: 10 })).pack;
    const mine = (await post('/stickers', { pack: pack.id, name: 'Geçici', emoji: '⭐', art: await image() })).sticker;
    await post('/stickers/update', { id: 'kutlama-yildiz', pack: pack.id });
    const art = mine.art.url;
    await ok(call('POST', '/api/admin/emoji/packs/delete', { id: pack.id }, admin.session), 'paketi sil');
    const c = await catalog();
    assert.equal(packOf(c, pack.id), undefined);
    assert.deepEqual(
      c.emoji.gone.find((x) => x.id === mine.id),
      { id: mine.id, name: 'Geçici', emoji: '⭐' },
    );
    assert.ok(packOf(c, 'party').stickers.some((x) => x.id === 'kutlama-yildiz'), 'evine döndü');
    await sleep(300);
    assert.ok(!stored.has(keyOfUrl(art)));
    await refused(call('POST', '/api/admin/emoji/packs/delete', { id: 'love' }, admin.session), 400, /silinemez/);
  });

  test('bağlantıdan resim; yalnız yönetici; denetim kaydı', async () => {
    const got = await post('/fetch', { url: `http://127.0.0.1:${SITE_PORT}/emoji/yildiz.png` });
    assert.equal(got.kind, 'image');
    const pack = (await post('/packs', { name: `Bağlantı ${rnd().slice(0, 4)}`, price: 0 })).pack;
    const s = (await post('/stickers', { pack: pack.id, name: 'Yıldız', art: got.url, artLink: got.link })).sticker;
    assert.equal(s.artLink, got.link);
    await refused(call('POST', '/api/admin/emoji/fetch', { url: `http://127.0.0.1:${SITE_PORT}/yok.png` }, admin.session), 400, /404/);
    await refused(call('GET', '/api/admin/emoji', null, alice.session), 403);
    await refused(call('POST', '/api/admin/emoji/packs/update', { id: 'fun', price: 1 }, alice.session), 403);
    const actions = (await q("SELECT DISTINCT action FROM audit_events WHERE action LIKE 'emoji.%'")).rows.map((x) => x.action).sort();
    for (const a of ['emoji.fetch', 'emoji.pack_create', 'emoji.pack_update', 'emoji.pack_reset', 'emoji.sticker_create', 'emoji.sticker_update', 'emoji.sticker_reset']) assert.ok(actions.includes(a), a);
  });
});
