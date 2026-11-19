// Şanslı hediye: paketlerin kendi ikonu ve videosu, panelden yeni paket (Güncelleme 7 madde 10; lucky-art.mjs,
// lucky.mjs) against a real Postgres, a stand-in bucket and a stand-in LiveKit: only admins set a package's icon and
// video, through the gifts' own checks; phones get them in GET /api/lucky, the room's packet and (only when they ask,
// lucky=1) the catalog's videos; a package is never sendable through /api/gifts/send nor listed among the catalog's
// gifts; a send carries the price and the settings' version the phone showed, and a moved value is a 409 with
// nothing moved (an older app's send, with neither, goes as always; a retry of a send that went through gets its
// replay); a package taken out while a sheet is open is refused cleanly. Every change is audited with before/after.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { convertArgs } from '../custom-gifts.mjs';
import { ODDS_TOTAL } from '../lucky-rules.mjs';
import { PANEL_ROUTES } from '../panel.mjs';
import { rnd, startApi } from './harness.mjs';
import { bucketEnv, png, standInBucket } from './stand-in-bucket.mjs';

const S3_PORT = 23000 + (process.pid % 900);
const { stored } = standInBucket(S3_PORT);
const lkCalls = [];
const LK_PORT = 24000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ ...bucketEnv(S3_PORT), LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, LUCKY_ART_POLL_MS: '200', CUSTOM_GIFTS_POLL_MS: '200' });
const { call, signUp } = h;
const q = async (s, p) => (await h.sql.query(s, p)).rows;
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
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(50);
  }
  return false;
};
const keyOfUrl = (url) => url.replace(/^.*\/api\/media\/f\//, '').replace(/^https:\/\/pub-test\.r2\.dev\//, '');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const ffmpegOk = spawnSync(FFMPEG, ['-version']).status === 0 && spawnSync(process.env.FFPROBE || 'ffprobe', ['-version']).status === 0;
const NO_FFMPEG = ffmpegOk ? false : 'ffmpeg yok';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucky-art-test-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
/** A ready stacked MP4 (colour on top, alpha below), 2 s: a red box moving on a transparent ground. */
function stackedMp4() {
  const src = path.join(dir, 'kaynak.webm');
  const out = path.join(dir, 'yigilmis.mp4');
  const run = (args) => assert.equal(spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args]).status, 0);
  run(['-f', 'lavfi', '-i', "color=c=black@0:s=270x480:r=20:d=2,format=rgba,drawbox=x='20+t*40':y=140:w=120:h=200:color=red@1:t=fill", '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '300k', src]);
  run(convertArgs(src, out, 'vp9').slice(4));
  return fs.readFileSync(out);
}

/** Uploads `body` as `kind` the way the panel does; the address it was given (this server's). */
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) await ok(call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s), 'yükle');
  }
};
/** A signed-up adult past Cömertlik Lv.2 (1000 coins spent in the shop) with `coins` left. */
async function player(name, coins) {
  const p = await signUp(name);
  await h.sql.query("UPDATE users SET birth_date = '1990-01-01' WHERE id = $1", [p.user.id]);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) await ok(call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session), sku);
  return p;
}
const coins = async (s) => (await ok(call('GET', '/api/me', null, s.session))).user.coins;
const sure2 = [
  { mult: 0, weight: 0 },
  { mult: 2, weight: ODDS_TOTAL },
];
const sure5 = [
  { mult: 0, weight: 0 },
  { mult: 5, weight: ODDS_TOTAL },
];

let admin;
let alice;
let bob;
const lucky = (who = alice) => ok(call('GET', '/api/lucky', null, who.session), 'şanslı');
const pkg = async (id, who = alice) => (await lucky(who)).gifts.find((g) => g.id === id);
const adminView = () => ok(call('GET', '/api/admin/lucky', null, admin.session), 'yönetim');
/** Saves `edit(config)`; the answer. */
async function save(edit) {
  const cur = await adminView();
  return ok(call('POST', '/api/admin/lucky/config', { config: edit(structuredClone(cur.config)), version: cur.version }, admin.session), 'ayar');
}
const art = (body, who = admin) => call('POST', '/api/admin/lucky/art', body, who.session);
const send = (body, who = alice) => call('POST', '/api/lucky/send', { count: 1, to: [bob.user.id], ref: rnd(8), ...body }, who.session);
const lastAudit = async (action) => (await q('SELECT actor, detail, ip FROM audit_events WHERE action = $1 ORDER BY id DESC LIMIT 1', [action]))[0];
const moved = async (who) => ({
  coins: await coins(who),
  sends: Number((await q('SELECT count(*) AS n FROM lucky_sends WHERE user_id = $1', [who.user.id]))[0].n),
  gifts: Number((await q('SELECT count(*) AS n FROM gift_events WHERE sender = $1', [who.user.id]))[0].n),
});

describe('Şanslı paketlerin ikonu, videosu ve yeni paketler', () => {
  before(async () => {
    admin = await h.account('Şanslı Yöneticisi', 'admin');
    alice = await player('Şanslı Gönderen', 20_000);
    bob = await signUp('Şanslı Alan');
  });

  test('panelin uçları listede; yalnız yönetici', async () => {
    for (const r of ['GET /api/admin/lucky', 'POST /api/admin/lucky/config', 'POST /api/admin/lucky/art', 'POST /api/admin/lucky/art/remove', 'POST /api/admin/lucky/fetch']) assert.ok(PANEL_ROUTES.has(r), r);
    await refused(art({ id: 'lk1', icon: null }, alice), 403);
    await refused(call('POST', '/api/admin/lucky/art/remove', { id: 'lk1' }, alice.session), 403);
    await refused(call('POST', '/api/admin/lucky/fetch', { slot: 'icon', url: 'https://example.com/a.png' }, alice.session), 403);
    await refused(call('GET', '/api/admin/lucky', null, alice.session), 403);
  });

  test('ikon: yüklenmiş saydam PNG; geçersiz ya da bilinmeyen paket reddedilir; telefonlara gider; önce/sonra denetlenir', async () => {
    const v0 = (await ok(call('GET', '/api/catalog'))).v;
    await refused(art({ id: 'g1', icon: null }), 400, /Geçersiz/);
    await refused(art({ id: 'lk9', icon: null }), 404, /önce paketi/);
    await refused(art({ id: 'lk1' }), 400, /Değişiklik yok/);
    await refused(art({ id: 'lk1', icon: 'https://example.com/x.png' }), 400, /önce yükle/);
    const flat = await upload(admin, 'gifticon', png(256, 256, { alpha: false }), 'image/png');
    await refused(art({ id: 'lk1', icon: flat }), 400, /saydam/);
    const small = await upload(admin, 'gifticon', png(64, 64), 'image/png');
    await refused(art({ id: 'lk1', icon: small }), 400, /128/);

    const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    const r = await ok(art({ id: 'lk1', icon }), 'ikon');
    assert.equal(r.art.icon, icon);
    assert.equal(r.art.video, null);
    const lk1 = await pkg('lk1');
    assert.equal(lk1.icon, icon);
    assert.equal(lk1.fx, null);
    assert.equal((await pkg('lk2')).icon, null);
    const view = await adminView();
    assert.deepEqual(view.art.map((x) => x.id), view.config.gifts.map((g) => g.id));
    assert.equal(view.art[0].icon, icon);
    // The app's own picture of the package, for the panel to show next to it.
    assert.equal(view.art[0].original.icon, '/api/fx/art/gifts/lk1.webp');
    assert.equal((await fetch(`${h.base}/api/fx/art/gifts/lk1.webp`)).status, 200);
    assert.equal(view.storage, true);
    assert.equal(view.artLimits.iconMinPx, 128);
    const audit = await lastAudit('lucky.art');
    assert.equal(audit.actor, admin.user.id);
    // The audit keeps the stored address (the answers name it at this server's).
    assert.deepEqual([audit.detail.lucky, audit.detail.before.icon, keyOfUrl(audit.detail.after.icon)], ['lk1', null, keyOfUrl(icon)]);
    // The phones read the catalog again (its `v` and /api/config's moved together).
    await until(async () => (await ok(call('GET', '/api/catalog'))).v !== v0);
    const [cat, cfg] = await Promise.all([ok(call('GET', '/api/catalog')), ok(call('GET', '/api/config'))]);
    assert.notEqual(cat.v, v0);
    assert.equal(cat.v, cfg.v);
  });

  test('video: hazır yığılmış MP4 telefonlara; katalogda yalnız isteyen yeni uygulamaya, eski süzgecin reddettiği adreste', { skip: NO_FFMPEG }, async () => {
    const body = stackedMp4();
    const url = await upload(admin, 'giftvideo', body, 'video/mp4');
    const r = await ok(art({ id: 'lk1', video: { kind: 'stacked', url } }), 'video');
    assert.match(r.art.video.url, /^\/api\/fx\/l\/lk1\.mp4\?v=[0-9a-f]{12}$/);
    assert.equal(r.art.video.bytes, body.length);
    assert.deepEqual((await pkg('lk1')).fx, r.art.video);
    // An older app (no lucky=1) is never handed the clip; a newer one gets it as a gift clip of the package's id.
    for (const path of ['/api/catalog', '/api/catalog?gifts=2&family=1&emoji=1&levels=1&shop=1']) {
      const fx = (await ok(call('GET', path))).fx;
      assert.ok(!fx.some((x) => x.id === 'lk1' || x.url.includes('/l/')), path);
    }
    await until(async () => (await ok(call('GET', '/api/catalog?gifts=2&lucky=1'))).fx.some((x) => x.id === 'lk1'));
    const fx = (await ok(call('GET', '/api/catalog?gifts=2&family=1&emoji=1&levels=1&shop=1&lucky=1'))).fx.find((x) => x.id === 'lk1');
    assert.deepEqual(fx, { kind: 'gift', id: 'lk1', ...r.art.video });
    const res = await fetch(`${h.base}${fx.url}`);
    assert.equal(res.status, 200);
    assert.equal(Buffer.from(await res.arrayBuffer()).length, body.length);
    assert.equal((await fetch(`${h.base}/api/fx/l/lk7.mp4`)).status, 404);
    const audit = await lastAudit('lucky.art');
    assert.deepEqual([audit.detail.before.video, keyOfUrl(audit.detail.after.video)], [null, keyOfUrl(url)]);
  });

  test('para koruması: Şanslı paket normal hediye olarak gönderilemez, kataloğun ve Hediyeler panelinin hediyelerinde yok', async () => {
    const was = await moved(alice);
    for (const giftId of ['lk1', 'lk2', 'lk5']) {
      await refused(call('POST', '/api/gifts/send', { to: bob.user.id, giftId, count: 1, price: 20, ref: rnd(6) }, alice.session), 400, /artık yok/);
    }
    assert.deepEqual(await moved(alice), was);
    for (const path of ['/api/catalog', '/api/catalog?gifts=2&family=1&emoji=1&levels=1&shop=1&lucky=1']) {
      assert.ok(!(await ok(call('GET', path))).gifts.some((g) => g.id.startsWith('lk')), path);
    }
    assert.ok(!(await ok(call('GET', '/api/admin/gifts?builtin=1', null, admin.session))).gifts.some((g) => g.id.startsWith('lk')));
  });

  test('yeni paket: eklenir, ikonu yokken emojisiyle gelir, ikonu verilir, gönderilir; 20 paket, kimlik ve ad denetlenir', async () => {
    const saved = await save((c) => (c.gifts.push({ id: 'lk5', name: 'Altın Yonca', emoji: '🌟', price: 50, enabled: true, tiers: sure2 }), c));
    const lk5 = await pkg('lk5');
    assert.deepEqual([lk5.name, lk5.emoji, lk5.price, lk5.icon, lk5.fx, lk5.since], ['Altın Yonca', '🌟', 50, null, null, saved.version]);
    // The packages kept their `since` (their price and odds didn't change).
    assert.equal((await pkg('lk2')).since, 1);

    const cur = await adminView();
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `lkx${i}`, name: `Paket ${i}`, emoji: '🎁', price: 10, enabled: true, tiers: sure2 }));
    for (const [gifts, re] of [
      [many, /Geçersiz ayarlar/],
      [[...cur.config.gifts, { ...many[0], id: 'lk-x' }], /kimliği/],
      [[...cur.config.gifts, { ...many[0], id: 'lkdup', name: 'altın yonca' }], /iki paket/],
      [[...cur.config.gifts, { ...many[0], id: 'lkcheap', price: 4 }], /fiyat/],
    ]) {
      await refused(call('POST', '/api/admin/lucky/config', { config: { ...cur.config, gifts }, version: cur.version }, admin.session), 400, re);
    }
    await ok(call('POST', '/api/admin/lucky/config', { config: { ...cur.config, gifts: many.slice(0, 20) }, version: cur.version }, admin.session), '20 paket');
    const back = await adminView();
    await ok(call('POST', '/api/admin/lucky/config', { config: cur.config, version: back.version }, admin.session), 'geri');

    const { version } = await lucky();
    const j = await ok(send({ giftId: 'lk5', price: 50, version }), 'gönderim');
    assert.deepEqual(j.send.draws, [2]);
    assert.equal(j.send.payout, 100);
    const icon = await upload(admin, 'gifticon', png(200, 200), 'image/png');
    await ok(art({ id: 'lk5', icon, iconLink: 'https://example.com/yonca.png' }), 'yeni paketin ikonu');
    assert.equal((await pkg('lk5')).icon, icon);
    const lk5art = (await adminView()).art.find((x) => x.id === 'lk5');
    assert.deepEqual([lk5art.iconLink, lk5art.original.icon], ['https://example.com/yonca.png', null]);
  });

  test('gösterilen fiyat ve sürüm: değiştiyse 409 ve hiçbir şey kımıldamaz; eski uygulama eskisi gibi; tekrar ilk cevabı alır; aynı anda iki istek tek gönderim', async () => {
    const v0 = (await lucky()).version;
    const first = rnd(8);
    await ok(send({ giftId: 'lk5', price: 50, version: v0, ref: first }), 'ilk');
    const v1 = (await save((c) => ((c.gifts.find((g) => g.id === 'lk5').price = 60), c))).version;

    let was = await moved(alice);
    let j = await refused(send({ giftId: 'lk5', price: 50, version: v0 }), 409, /fiyatı değişti: artık 60 jeton/);
    assert.deepEqual([j.code, j.giftId, j.price, j.version], ['price_changed', 'lk5', 60, v1]);
    // The right price but read before it changed: the odds table it showed may be another one too.
    j = await refused(send({ giftId: 'lk5', price: 60, version: v0 }), 409, /olasılıkları değişti/);
    assert.deepEqual([j.code, j.version], ['odds_changed', v1]);
    // A version from the future is no version this server showed.
    await refused(send({ giftId: 'lk5', price: 60, version: v1 + 5 }), 409, /olasılıkları/);
    await refused(send({ giftId: 'lk5', price: 'altmış', version: v1 }), 400);
    await refused(send({ giftId: 'lk5', price: 60, version: 0 }), 400);
    assert.deepEqual(await moved(alice), was);

    // A retry of the send that went through gets its first answer, whatever moved since.
    j = await ok(send({ giftId: 'lk5', price: 50, version: v0, ref: first }), 'tekrar');
    assert.equal(j.replay, true);
    assert.equal(j.send.price, 50);
    assert.deepEqual(await moved(alice), was);

    j = await ok(send({ giftId: 'lk5', price: 60, version: v1 }), 'yeni fiyat');
    assert.equal(j.send.cost, 60);
    // Another package's change doesn't stop a send of one that stayed as it was.
    await ok(send({ giftId: 'lk2', price: 100, version: v0 }), 'değişmeyen paket');
    const v2 = (await save((c) => ((c.gifts.find((g) => g.id === 'lk2').tiers = sure5), c))).version;
    await refused(send({ giftId: 'lk2', price: 100, version: v1 }), 409, /olasılıkları/);
    j = await ok(send({ giftId: 'lk2', price: 100, version: v2 }), 'yeni oranlar');
    assert.deepEqual(j.send.draws, [5]);

    // An older app sends neither: played at the server's price and odds, as always.
    was = await moved(alice);
    j = await ok(send({ giftId: 'lk5' }), 'eski uygulama');
    assert.equal(j.send.cost, 60);
    assert.equal((await moved(alice)).coins, was.coins - 60 + j.send.payout);

    // The same request twice at once: one send, one charge.
    was = await moved(alice);
    const ref = rnd(8);
    const both = await Promise.all([send({ giftId: 'lk5', price: 60, version: v2, ref }), send({ giftId: 'lk5', price: 60, version: v2, ref })]);
    assert.deepEqual(both.map(([st]) => st), [200, 200]);
    assert.deepEqual(both.map(([, x]) => x.replay).sort(), [false, true]);
    const now = await moved(alice);
    assert.equal(now.sends, was.sends + 1);
    assert.equal(now.coins, was.coins - 60 + both[0][1].send.payout);
  });

  test('odaya giden Şanslı paketi ikonunu ve fiyatını taşır', async () => {
    const room = (await ok(call('POST', '/api/rooms', { title: `Şanslı ${rnd(2)}` }, bob.session), 'oda')).room.id;
    const { version } = await lucky();
    await ok(send({ giftId: 'lk5', price: 60, version, room }), 'odada');
    const icon = (await pkg('lk5')).icon;
    let packet;
    await until(() => {
      packet = lkCalls
        .filter((c) => c.method === 'SendData')
        .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')))
        .find((p) => p.type === 'lucky' && p.giftId === 'lk5');
      return !!packet;
    });
    assert.ok(packet, 'oda paketi');
    assert.deepEqual([packet.icon, packet.price, packet.name, packet.emoji], [icon, 60, 'Altın Yonca', '🌟']);
  });

  test('paket kaldırılınca: açık sayfadan gönderim temiz reddedilir, videosu kataloğa girmez; ayar önce/sonra denetlenir', async () => {
    const { version } = await lucky();
    const saved = await save((c) => ((c.gifts = c.gifts.filter((g) => g.id !== 'lk5')), c));
    const was = await moved(alice);
    const j = await refused(send({ giftId: 'lk5', price: 60, version }), 400, /kapalı/);
    assert.deepEqual([j.code, j.giftId], ['lucky_closed', 'lk5']);
    assert.deepEqual(await moved(alice), was);
    assert.equal(await pkg('lk5'), undefined);
    const audit = await lastAudit('lucky.config');
    assert.equal(audit.actor, admin.user.id);
    assert.equal(audit.detail.after.version, saved.version);
    assert.ok(audit.detail.before.gifts.some((g) => g.id === 'lk5'));
    assert.ok(!audit.detail.after.gifts.some((g) => g.id === 'lk5'));
    // The art of a package that is gone can't be set (it stays, and comes back with the package).
    await refused(art({ id: 'lk5', icon: null }), 404);
    if (!NO_FFMPEG) {
      // A package off sale: its clip leaves the catalog (nobody downloads it), and comes back with it.
      await save((c) => ((c.gifts.find((g) => g.id === 'lk1').enabled = false), c));
      await until(async () => !(await ok(call('GET', '/api/catalog?lucky=1'))).fx.some((x) => x.id === 'lk1'));
      assert.ok(!(await ok(call('GET', '/api/catalog?lucky=1'))).fx.some((x) => x.id === 'lk1'));
      await save((c) => ((c.gifts.find((g) => g.id === 'lk1').enabled = true), c));
      assert.ok(await until(async () => (await ok(call('GET', '/api/catalog?lucky=1'))).fx.some((x) => x.id === 'lk1')));
    }
  });

  test('kaldırma: ikon ve video gider, dosyaları silinir; bir hediyenin de kullandığı dosya kalır; denetlenir', async () => {
    // One file for a gift and a package: taking it off the package keeps it for the gift.
    const shared = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    await ok(call('POST', '/api/admin/gifts', { name: `Ortak ${rnd(3)}`, price: 300, cat: 'hot', icon: shared }, admin.session), 'hediye');
    await ok(art({ id: 'lk2', icon: shared }), 'ortak ikon');
    const r = await ok(call('POST', '/api/admin/lucky/art/remove', { id: 'lk2' }, admin.session), 'kaldır');
    assert.deepEqual([r.art.icon, r.art.video], [null, null]);
    assert.equal((await pkg('lk2')).icon, null);
    const audit = await lastAudit('lucky.art_remove');
    assert.deepEqual([audit.detail.lucky, keyOfUrl(audit.detail.before.icon), audit.detail.after.icon], ['lk2', keyOfUrl(shared), null]);

    // lk1's own files go.
    const before = (await adminView()).art.find((x) => x.id === 'lk1');
    const icon = before.icon;
    await ok(call('POST', '/api/admin/lucky/art/remove', { id: 'lk1' }, admin.session), 'kaldır lk1');
    assert.ok(await until(() => !stored.has(keyOfUrl(icon))), 'lk1 ikonu silindi');
    assert.ok(stored.has(keyOfUrl(shared)), 'hediyenin ikonu kaldı');
    const lk1 = await pkg('lk1');
    assert.deepEqual([lk1.icon, lk1.fx], [null, null]);
    assert.ok(!(await ok(call('GET', '/api/catalog?lucky=1'))).fx.some((x) => x.id === 'lk1'));
    // The link fetch is the gifts' own, with its checks.
    await refused(call('POST', '/api/admin/lucky/fetch', { slot: 'ses', url: 'https://example.com/a.png' }, admin.session), 400, /ikon ya da video/);
  });
});
