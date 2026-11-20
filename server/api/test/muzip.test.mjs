// Muzip hediyeler (docs/PROFIL_IZLERI.md, the owners' decisions of 20 Nov 2026): the kinds of profile mark as data
// (mark-kinds.mjs: CRUD, audit, the overlay's pixel check, one overlay per kind), minutes, one mark at a time (while one
// shows, another kind's gift is a plain gift and says so; the same kind is the newest sender's and never ends sooner),
// "Kimler profilime iz bırakabilir" (everyone, the people I follow — the default —, nobody) checked before any coin
// moves, the switch that keeps the marks showing and tells the room, sends to many, retries, a clean racing a new mark,
// a block racing marks in flight, the catalog for each app (none, marks=1, marks=2), and a third pair (Çamur Bombası →
// Köpük Banyosu) made through the admin routes alone.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startApi } from './harness.mjs';
import { bucketEnv, png, rgbaPng, ringAlpha, standInBucket } from './stand-in-bucket.mjs';

// A fake LiveKit: what the server tells the rooms (SendData packets).
const lkCalls = [];
const LK_PORT = 25000 + (process.pid % 900);
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
const packets = (from, type) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => p.type === type);
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

const BUCKET = 27000 + (process.pid % 900);
const bucket = standInBucket(BUCKET);
const h = startApi({ ...bucketEnv(BUCKET), LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, CUSTOM_GIFTS_POLL_MS: '200', MARK_KINDS_POLL_MS: '200', LIVE_POLL_MS: '200' });
const { call } = h;
const q = async (s, p) => (await h.sql.query(s, p)).rows;
const rnd = () => Math.random().toString(36).slice(2, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}

let admin, ali, ayse, can, deniz, ece;
const send = (from, to, giftId, price, extra = {}) => call('POST', '/api/gifts/send', { to: to.user.id, giftId, count: 1, price, ref: `mz-${giftId}-${rnd()}`, ...extra }, from.session);
const kaka = (from, to, extra) => send(from, to, 'k1', 999, extra);
const su = (from, to, extra) => send(from, to, 'k2', 1999, extra);
const terlik = (from, to, extra) => send(from, to, 'p8', 1299, extra);
const privacy = (who, body) => ok(call('PATCH', '/api/me/privacy', body, who.session), 'gizlilik');
const follow = (who, to) => ok(call('POST', '/api/follow', { to: to.user.id }, who.session), 'takip');
const profileMarks = async (viewer, who) => (await ok(call('GET', `/api/user?id=${who.user.id}`, null, viewer.session), 'profil')).marks;
const look = async (viewer, who) => (await ok(call('GET', `/api/looks?ids=${who.user.id}`, null, viewer.session), 'görünüm')).looks[who.user.id];
const showing = (who) => q('SELECT * FROM profile_marks WHERE user_id = $1 AND cleared_at IS NULL AND expires_at > now() ORDER BY id', [who.user.id]);
const balances = async (...who) => (await q('SELECT id, coins, diamonds FROM users WHERE id = ANY($1::uuid[])', [who.map((w) => w.user.id)])).reduce((m, x) => ({ ...m, [x.id]: [Number(x.coins), Number(x.diamonds)] }), {});
const adminPost = (p, body) => call('POST', p, body, admin.session);
const kinds = async () => (await ok(call('GET', '/api/admin/mark-kinds', null, admin.session), 'türler')).kinds;
const catalog = (qs) => ok(call('GET', `/api/catalog${qs}`), 'katalog');
/** A clean slate for `who`: their marks off (staff), as the tests in between need. */
const wipe = (who) => ok(adminPost('/api/admin/marks/clear', { user: who.user.id, reason: 'test' }), 'temizle');
/** A fresh person to mark, who lets everyone (the default is only the people they follow). */
async function target(name) {
  const t = await h.signUp(name);
  await privacy(t, { marksFrom: 'everyone' });
  return t;
}
const iconUrl = () => upload(admin, 'gifticon', png(256, 256), 'image/png');

describe('Muzip hediyeler', () => {
  before(async () => {
    admin = await h.account('Muzip Yöneticisi', 'admin');
    ali = await h.signUp('Ali Atan');
    ayse = await h.signUp('Ayşe Alan');
    can = await h.signUp('Can Temizleyen');
    deniz = await h.signUp('Deniz Diğer');
    ece = await h.signUp('Ece Eski');
    for (const p of [ali, can, deniz, ece]) await h.credit(p.user.id, 200_000);
    // Terlik Geldi! leaves Kırık Cam for 24 hours (the pilot, set in the panel: its rule is the owners' data).
    // Off the shelves since the start (catalog.mjs GIFTS_PAUSED): staff put it back with the rule.
    await ok(adminPost('/api/admin/gifts/update', { id: 'p8', enabled: true, mark: { role: 'leave', kind: 'kirik-cam', minutes: 1440 } }), 'terlik kuralı');
    await sleep(300);
  });

  test('İz türleri: tohumlar, ekleme, değiştirme, silme; denetim kaydı; yönetici olmayan giremez', async () => {
    const list = await kinds();
    const kakaKind = list.find((k) => k.kind === 'kaka');
    assert.equal(kakaKind.name, 'Kaka İzi');
    assert.equal(kakaKind.art, null, 'uygulamanın kendi resmi');
    assert.deepEqual(kakaKind.gifts.map((g) => [g.id, g.role]).sort(), [['k1', 'leave'], ['k2', 'clean']]);
    const glass = list.find((k) => k.kind === 'kirik-cam');
    assert.equal(glass.name, 'Kırık Cam');
    assert.deepEqual(glass.gifts.map((g) => [g.id, g.role, g.minutes]), [['p8', 'leave', 1440]]);
    assert.equal(glass.stack, 'refresh');

    await refused(call('GET', '/api/admin/mark-kinds', null, ali.session), 403);
    await refused(call('POST', '/api/admin/mark-kinds', { kind: 'boya', name: 'Boya' }, ali.session), 403);
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'Kırık_Cam', name: 'X' }), 400, /alt çizgi olmaz/);
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'boya', name: 'B'.repeat(25) }), 400, /1–24 harf/);
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'boya', name: 'Boya', minutes: 3 }), 400, /5–10\.080 dakika/);
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'boya', name: 'Boya', stack: 'stack' }), 400, /refresh/);

    const v0 = (await catalog('?gifts=2&marks=2')).v;
    const made = await ok(adminPost('/api/admin/mark-kinds', { kind: 'boya', name: 'Boya Savaşı', minutes: 30 }), 'tür');
    assert.deepEqual([made.kind.kind, made.kind.name, made.kind.minutes, made.kind.stack, made.kind.enabled, made.kind.art], ['boya', 'Boya Savaşı', 30, 'refresh', true, null]);
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'boya', name: 'Boya' }), 409, /zaten var/);
    const cat = await catalog('?gifts=2&marks=2');
    assert.ok(cat.v > v0, 'katalog sürümü büyür');
    assert.equal((await ok(call('GET', '/api/config'), 'config')).v, cat.v, '/api/config ile aynı sürüm');
    assert.deepEqual(cat.marks.kinds.boya, { name: 'Boya Savaşı', stack: 'refresh', minutes: 30 });

    const up = await ok(adminPost('/api/admin/mark-kinds/update', { kind: 'boya', name: 'Boya', stack: 'replace', minutes: null, enabled: false }), 'değiştir');
    assert.deepEqual([up.kind.name, up.kind.stack, up.kind.minutes, up.kind.enabled], ['Boya', 'replace', null, false]);
    assert.equal((await catalog('?gifts=2&marks=2')).marks.kinds.boya, undefined, 'kapalı tür telefona gitmez');
    await refused(adminPost('/api/admin/mark-kinds/update', { kind: 'boya' }), 400, /Değişecek/);
    await refused(adminPost('/api/admin/mark-kinds/update', { kind: 'yok-boyle', name: 'X' }), 404);
    const audit = (await q("SELECT actor, action, detail FROM audit_events WHERE action LIKE 'markkind.%' ORDER BY id"));
    assert.deepEqual(audit.map((a) => a.action), ['markkind.create', 'markkind.update']);
    assert.equal(audit[1].actor, admin.user.id);
    assert.deepEqual([audit[1].detail.before.name, audit[1].detail.after.name, audit[1].detail.before.enabled, audit[1].detail.after.enabled], ['Boya Savaşı', 'Boya', true, false]);

    // A kind a gift uses can't go; one nobody uses goes (soft) and can be made again.
    await refused(adminPost('/api/admin/mark-kinds/delete', { kind: 'kirik-cam' }), 409, /Terlik Geldi!/);
    await ok(adminPost('/api/admin/mark-kinds/delete', { kind: 'boya' }), 'sil');
    assert.ok(!(await kinds()).some((k) => k.kind === 'boya'));
    assert.equal((await q("SELECT action FROM audit_events WHERE action = 'markkind.delete'")).length, 1);
    assert.ok((await q("SELECT deleted_at FROM mark_kinds WHERE kind = 'boya'"))[0].deleted_at, 'satır kalır');
    // A gift can't name a deleted kind.
    await refused(adminPost('/api/admin/gifts/update', { id: 'p6', mark: { role: 'leave', kind: 'boya' } }), 400, /"boya" diye bir iz türü yok/);
    const again = await ok(adminPost('/api/admin/mark-kinds', { kind: 'boya', name: 'Boya Yeniden' }), 'yeniden');
    assert.equal(again.kind.enabled, true);
    await ok(adminPost('/api/admin/mark-kinds/delete', { kind: 'boya' }), 'yine sil');
  });

  test('İz resmi: gerçek saydamlık, yüz açık, kare, hareketsiz, boyut ve tür denetlenir; büyüğü 512 piksele iner', async () => {
    const art = (body, type = 'image/png') => upload(admin, 'markart', body, type);
    await ok(adminPost('/api/admin/mark-kinds', { kind: 'resim-deneme', name: 'Resim Deneme' }), 'tür');
    const set = (url) => adminPost('/api/admin/mark-kinds/update', { kind: 'resim-deneme', art: url });
    // A square opaque everywhere (an alpha channel that says nothing is transparent).
    await refused(set(await art(rgbaPng(512, 512, () => 255))), 400, /^İz resminin en az %30'u tam saydam \(alfa 0\) olmalı, bunda %0:/);
    // Faintly visible all over: not alpha 0.
    await refused(set(await art(rgbaPng(512, 512, () => 3))), 400, /tam saydam/);
    // No alpha channel at all.
    await refused(set(await art(rgbaPng(512, 512, () => 255, { alpha: false }))), 400, /saydamlık yok/);
    // The face covered: a disc in the middle, the edge transparent.
    await refused(set(await art(rgbaPng(512, 512, (x, y) => (Math.hypot(x - 255.5, y - 255.5) < 170 ? 255 : 0)))), 400, /yüzü kapatıyor: ortadaki dairenin en çok %20'si dolu olabilir, bunda %\d+\./);
    // Moving (an animated PNG's header).
    await refused(set(await art(rgbaPng(512, 512, ringAlpha(512), { apng: true }))), 400, /hareketsiz/);
    // Not square, too small, too big.
    await refused(set(await art(rgbaPng(512, 400, ringAlpha(512)))), 400, /kare olmalı \(bu 512 × 400\)/);
    await refused(set(await art(rgbaPng(128, 128, ringAlpha(128)))), 400, /256–2048 piksel/);
    await refused(set(await art(rgbaPng(2100, 2100, ringAlpha(2100)))), 400, /256–2048 piksel/);
    await refused(call('POST', '/api/media/upload-url', { kind: 'markart', contentType: 'image/png', size: 11 * 1024 * 1024 }, admin.session), 400, /en fazla 10 MB/);
    // A designer's large PNG (over the old 2 MB) gets its address.
    {
      const [st, j] = await call('POST', '/api/media/upload-url', { kind: 'markart', contentType: 'image/png', size: 3 * 1024 * 1024 }, admin.session);
      assert.equal(st, 200, j.error);
      assert.ok(j.uploadUrl);
    }
    // Not a PNG or WebP: refused when the address is asked for, and a JPEG sent as a PNG when it is saved.
    await refused(call('POST', '/api/media/upload-url', { kind: 'markart', contentType: 'image/jpeg', size: 1000 }, admin.session), 400);
    await refused(set(await art(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(200)]))), 400, /PNG ya da WebP/);
    // Not uploaded as a mark's picture.
    await refused(set(await iconUrl()), 400, /önce yükleyin/);
    // Nothing was kept from any of these.
    assert.equal((await kinds()).find((k) => k.kind === 'resim-deneme').art, null);

    // A good one, 1024 px: kept as 512 for phones, the upload removed.
    const big = await art(rgbaPng(1024, 1024, ringAlpha(1024)));
    const r = await ok(set(big), 'iyi resim');
    assert.equal(r.kind.art.px, 512);
    assert.equal(r.kind.art.checked, true);
    assert.ok(r.kind.art.stats.clear >= 0.3 && r.kind.art.stats.face <= 0.2, JSON.stringify(r.kind.art.stats));
    assert.notEqual(r.kind.art.url, big, 'küçültülmüş kopya');
    assert.match(r.kind.art.v, /^[0-9a-f]{12}$/);
    await until(() => !bucket.stored.has(big.slice(big.indexOf('markart/'))));
    assert.ok(!bucket.stored.has(big.slice(big.indexOf('markart/'))), 'yüklenen büyük dosya silindi');
    const cat = await catalog('?gifts=2&marks=2');
    assert.equal(cat.marks.kinds['resim-deneme'].art.v, r.kind.art.v);
    assert.equal(cat.marks.kinds['resim-deneme'].art.px, 512);
    assert.match(cat.marks.kinds['resim-deneme'].art.url, /\/api\/media\/f\/markart\//, 'telefon dosyayı bu sunucudan alır');
    // One kind's overlay can't be another's (taking it off one would take it off both): the copy, nor the upload.
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'resim-iki', name: 'Resim İki', art: r.kind.art.url }), 400, /^Bu resim "Resim Deneme" türünde kullanılıyor/);
    // A save that fails after the picture was made smaller (the kind exists; no such kind): the upload and its copy go.
    const stored = () => [...bucket.stored.keys()].filter((k) => k.startsWith('markart/'));
    for (const [what, body] of [
      ['zaten var', (url) => adminPost('/api/admin/mark-kinds', { kind: 'resim-deneme', name: 'Yeniden', art: url })],
      ['tür yok', (url) => adminPost('/api/admin/mark-kinds/update', { kind: 'yok-boyle', art: url })],
    ]) {
      const upload = await art(rgbaPng(1024, 1024, ringAlpha(1024)));
      const had = new Set(stored());
      const [st] = await body(upload);
      assert.ok(st === 409 || st === 404, `${what}: ${st}`);
      const key = upload.slice(upload.indexOf('markart/'));
      assert.ok(await until(() => !bucket.stored.has(key) && stored().every((k) => had.has(k))), `${what}: yüklenen ve küçültülen kopya silindi`);
    }
    // A 512 px one is kept as uploaded; taking it off goes back to the app's own (here: none, the badge).
    const small = await art(rgbaPng(512, 512, ringAlpha(512)));
    assert.equal((await ok(set(small), '512')).kind.art.url, small);
    await refused(adminPost('/api/admin/mark-kinds', { kind: 'resim-iki', name: 'Resim İki', art: small }), 400, /türünde kullanılıyor/);
    assert.equal((await ok(set(null), 'resim kalkar')).kind.art, null);
    assert.equal((await catalog('?gifts=2&marks=2')).marks.kinds['resim-deneme'].art, undefined);
    await ok(adminPost('/api/admin/mark-kinds/delete', { kind: 'resim-deneme' }), 'sil');
  });

  test('katalog: eski uygulama iz kurallı hiçbir hediyeyi görmez; marks=1 saatle (G7); marks=2 türler ve dakikayla', async () => {
    // A gift the panel gave a mark (like Kar Topu and Domates At on the live server): 90 minutes.
    await ok(adminPost('/api/admin/mark-kinds', { kind: 'kartopu', name: 'Kar' }), 'tür');
    const snow = await ok(adminPost('/api/admin/gifts', { name: 'Kar Topu Deneme', price: 50, cat: 'gameplay', icon: await iconUrl(), mark: { role: 'leave', kind: 'kartopu', minutes: 90 } }), 'kar topu');
    await sleep(300);
    const id = snow.gift.id;
    const ids = (c) => new Set(c.gifts.map((g) => g.id));
    for (const qs of ['', '?gifts=2', '?gifts=2&family=1&emoji=1&levels=1&shop=1']) {
      const old = await catalog(qs);
      for (const g of ['k1', 'k2', 'p8', id]) assert.ok(!ids(old).has(g), `${qs || 'bayraksız'}: ${g} yok`);
      assert.equal(old.marks, undefined);
      assert.ok(!old.gifts.some((g) => 'mark' in g));
    }
    const g7 = await catalog('?gifts=2&marks=1');
    assert.deepEqual(g7.marks, { on: true, hours: 24 }, 'G7: aynı biçim');
    assert.deepEqual(g7.gifts.find((g) => g.id === 'k1').mark, { role: 'leave', kind: 'kaka', hours: 24 });
    assert.deepEqual(g7.gifts.find((g) => g.id === 'k2').mark, { role: 'clean', kind: 'kaka' });
    assert.deepEqual(g7.gifts.find((g) => g.id === id).mark, { role: 'leave', kind: 'kartopu', hours: 2 }, '90 dakika: 2 saat yazar');
    assert.equal(g7.gifts.find((g) => g.id === 'k1').name, 'Kaka Şakası');
    for (const qs of ['?gifts=2&marks=2', '?gifts=2&marks=1&marks=2']) {
      const fresh = await catalog(qs);
      assert.deepEqual(fresh.gifts.find((g) => g.id === 'k1').mark, { role: 'leave', kind: 'kaka', hours: 24, minutes: 1440 });
      assert.deepEqual(fresh.gifts.find((g) => g.id === id).mark, { role: 'leave', kind: 'kartopu', hours: 2, minutes: 90 });
      assert.equal(fresh.marks.on, true);
      assert.equal(fresh.marks.minutes, 1440);
      assert.deepEqual(fresh.marks.kinds.kaka, { name: 'Kaka İzi', stack: 'refresh' });
      assert.deepEqual(fresh.marks.kinds['kirik-cam'], { name: 'Kırık Cam', stack: 'refresh' });
      assert.deepEqual(fresh.marks.kinds.kartopu, { name: 'Kar', stack: 'refresh' });
      assert.deepEqual(fresh.gifts.find((g) => g.id === 'p8').mark, { role: 'leave', kind: 'kirik-cam', hours: 24, minutes: 1440 });
      assert.equal(fresh.gifts.find((g) => g.id === 'p8').name, 'Terlik Geldi!');
    }
    // Kept for rollback: mark_hours rounded up beside the minutes.
    assert.deepEqual((await q('SELECT mark_minutes, mark_hours FROM custom_gifts WHERE id = $1', [id]))[0], { mark_minutes: 90, mark_hours: 2 });
    // 90 minutes it stays.
    const t = await target('Kar Alan');
    const r = await ok(send(ali, t, id, 50), 'kar topu');
    assert.deepEqual([r.mark.minutes, r.mark.hours], [90, 2]);
    const left = (Date.parse((await profileMarks(t, t))[0].until) - Date.now()) / 60_000;
    assert.ok(left > 89 && left <= 90, `90 dakika (${left})`);
    await ok(adminPost('/api/admin/gifts/delete', { id }), 'sil');
  });

  test('kimler iz bırakabilir: varsayılan takip ettiklerim (ayarı olmayan için de), herkes, kimse; ret para oynatmaz', async () => {
    const r = await h.signUp('Varsayılan Kişi');
    assert.equal((await ok(call('GET', '/api/me/privacy', null, r.session), 'gizlilik')).privacy.marksFrom, 'following');
    assert.equal((await q('SELECT count(*)::int AS n FROM privacy_settings WHERE user_id = $1', [r.user.id]))[0].n, 0, 'ayar satırı yok');
    const before = await balances(ali, r);
    const events = (await q('SELECT count(*)::int AS n FROM gift_events'))[0].n;
    const j = await refused(kaka(ali, r), 403, /^Varsayılan Kişi, profiline yalnız takip ettiği kişilerin iz bırakmasına izin veriyor\. Kaka Şakası ona gönderilemez/);
    assert.equal(j.code, 'marks_following');
    assert.deepEqual(await balances(ali, r), before, 'hiçbir şey oynamadı');
    assert.equal((await q('SELECT count(*)::int AS n FROM gift_events'))[0].n, events, 'hediye kaydı yok');
    // The gift sheet knows before anyone taps: noMarks for me (whom they don't follow), not for whom they follow.
    assert.equal((await look(ali, r)).noMarks, true);
    assert.equal((await look(ali, r)).marksFrom, 'following');
    await follow(r, can);
    assert.equal((await look(can, r)).noMarks, undefined);
    assert.equal((await ok(kaka(can, r), 'takip ettiğinden')).mark.role, 'leave');
    // A cleaning gift is never refused: on a mark it cleans, whoever sends it.
    assert.equal((await ok(su(ali, r), 'takip etmediğinden su')).mark.role, 'clean');
    // Everyone.
    await privacy(r, { marksFrom: 'everyone' });
    assert.equal((await look(ali, r)).noMarks, undefined);
    assert.equal((await ok(kaka(ali, r), 'herkes')).mark.role, 'leave');
    // Nobody: refused even from someone they follow (marks_off, as an older app's switch); the switch reads off.
    const p = await privacy(r, { marksFrom: 'nobody' });
    assert.deepEqual([p.privacy.marksFrom, p.privacy.profileMarks], ['nobody', false]);
    assert.equal((await refused(kaka(can, r), 403, /profiline iz bırakılmasını kapattı/)).code, 'marks_off');
    assert.equal((await look(can, r)).noMarks, true);
    // The mark already there stays (blocks new marks only).
    assert.equal((await profileMarks(r, r)).length, 1, 'mevcut iz kalır');
    await refused(call('PATCH', '/api/me/privacy', { marksFrom: 'nobody', profileMarks: true }, r.session), 400, /birbirini tutmuyor/);
    await refused(call('PATCH', '/api/me/privacy', { marksFrom: 'friends' }, r.session), 400);
    // An older app's switch on again: the default.
    assert.equal((await privacy(r, { profileMarks: true })).privacy.marksFrom, 'following');
    await privacy(r, { marksFrom: 'everyone' });
    assert.equal((await privacy(r, { profileMarks: true })).privacy.marksFrom, 'everyone', 'açıkken açmak seçimi bozmaz');
    // A row whose two columns disagree (written by hand, or by a server before 105) reads as the rule that applies.
    await q("UPDATE privacy_settings SET profile_marks = true, marks_from = 'nobody' WHERE user_id = $1", [r.user.id]);
    let read = (await ok(call('GET', '/api/me/privacy', null, r.session), 'gizlilik')).privacy;
    assert.deepEqual([read.marksFrom, read.profileMarks], ['nobody', false]);
    await q("UPDATE privacy_settings SET profile_marks = false, marks_from = 'everyone' WHERE user_id = $1", [r.user.id]);
    read = (await ok(call('GET', '/api/me/privacy', null, r.session), 'gizlilik')).privacy;
    assert.deepEqual([read.marksFrom, read.profileMarks], ['nobody', false]);
    assert.equal((await look(ali, r)).marksFrom, 'nobody');
    // In a room: a change of who may mark them reaches it as their look (heard by everyone: noMarks only for nobody);
    // the same choice again, or another setting, sends nothing.
    const roomId = crypto.randomUUID();
    await q("INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, 'PA_muzip_p')", [`oda-${roomId}`, r.user.id]);
    const theirs = (from) => packets(from, 'look').filter((x) => x.user === r.user.id);
    let from = lkCalls.length;
    await privacy(r, { marksFrom: 'following' });
    assert.ok(await until(() => theirs(from).length > 0), 'görünüm paketi');
    assert.deepEqual([theirs(from).at(-1).look.marksFrom, theirs(from).at(-1).look.noMarks], ['following', undefined]);
    assert.equal(theirs(from).at(-1).room, `oda-${roomId}`);
    from = lkCalls.length;
    await privacy(r, { marksFrom: 'nobody' });
    assert.ok(await until(() => theirs(from).length > 0), 'kimse');
    assert.deepEqual([theirs(from).at(-1).look.marksFrom, theirs(from).at(-1).look.noMarks], ['nobody', true]);
    from = lkCalls.length;
    await privacy(r, { profileMarks: false });
    await privacy(r, { showOnline: true });
    await sleep(300);
    assert.equal(theirs(from).length, 0, 'değişmeyen seçim duyurulmaz');
    await privacy(r, { profileMarks: true });
    assert.ok(await until(() => theirs(from).length > 0), 'eski anahtar');
    assert.equal(theirs(from).at(-1).look.marksFrom, 'following');
    await q('DELETE FROM room_presence WHERE identity = $1', [r.user.id]);
    await wipe(r);
  });

  test('tek iz: iz varken başka türün hediyesi düz gider (iz değişmez, not söyler); aynı tür yeniler, hiç kısaltmaz; replace yalnız kaydı değiştirir', async () => {
    const t = await target('Tek İz');
    const roomId = crypto.randomUUID();
    await q("INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, 'PA_muzip')", [`oda-${roomId}`, t.user.id]);
    const first = await ok(kaka(ali, t), 'kaka');
    assert.equal(first.markNote, undefined);
    // Another kind while Kaka İzi shows: a plain gift (coins and diamonds move, no mark row), the mark as it was.
    let from = lkCalls.length;
    const before = await balances(deniz, t);
    const glass = await ok(terlik(deniz, t, { room: roomId }), 'terlik');
    assert.equal(glass.mark, null, 'iz bırakmadı');
    assert.equal(glass.markNote, 'Tek İz, profilinde zaten bir iz var; Terlik Geldi! düz hediye olarak gitti.');
    assert.equal(glass.total, 1299);
    const after = await balances(deniz, t);
    assert.deepEqual([after[deniz.user.id][0], after[t.user.id][1]], [before[deniz.user.id][0] - 1299, before[t.user.id][1] + 1299], 'düz hediye gibi ödendi');
    const rows = await q('SELECT * FROM profile_marks WHERE user_id = $1 ORDER BY id', [t.user.id]);
    assert.deepEqual(rows.map((m) => [m.kind, m.cleared_how, m.expires_at.toISOString()]), [['kaka', null, first.mark.until]], 'iz aynen kaldı');
    assert.deepEqual((await profileMarks(can, t)).map((m) => [m.kind, m.until]), [['kaka', first.mark.until]]);
    // The room: a plain gift's packet (no mark), and no look (nothing changed on the photo).
    assert.ok(await until(() => packets(from, 'gift').length > 0), 'hediye paketi');
    assert.equal(packets(from, 'gift')[0].mark, undefined);
    // The same from a profile, and a retry of it: a plain gift's replay (no mark, nothing written twice).
    const ref = `mz-kept-${rnd()}`;
    const once = await ok(terlik(deniz, t, { ref, place: 'profile' }), 'profilden terlik');
    assert.deepEqual([once.mark, typeof once.markNote], [null, 'string']);
    const again = await ok(terlik(deniz, t, { ref, place: 'profile' }), 'tekrar');
    assert.deepEqual([again.replay, again.mark, again.markNote], [true, undefined, undefined]);
    assert.equal((await showing(t)).length, 1);
    // Kaka İzi's cleaner still cleans it; on the clean photo the glass lands.
    assert.equal((await ok(su(can, t), 'su')).mark.role, 'clean');
    const landed = await ok(terlik(deniz, t), 'temiz profile terlik');
    assert.deepEqual([landed.mark.kind, landed.mark.again, landed.markNote], ['kirik-cam', false, undefined]);
    // Kaka İzi's cleaner on Kırık Cam: a plain gift, the glass stays (no note: it leaves no mark).
    const water = await ok(su(can, t), 'camda su');
    assert.deepEqual([water.mark, water.markNote], [undefined, undefined]);
    assert.equal((await showing(t)).length, 1);
    // The same kind again with less time left: its time starts again (refresh), the newest sender's.
    await q("UPDATE profile_marks SET expires_at = now() + interval '1 hour' WHERE user_id = $1 AND cleared_at IS NULL", [t.user.id]);
    const longer = await ok(terlik(ali, t), 'ikinci terlik');
    assert.deepEqual([longer.mark.again, longer.mark.minutes], [true, 1440]);
    assert.equal((await showing(t)).length, 1);
    assert.equal((await showing(t))[0].from_user, ali.user.id);
    assert.ok(Date.parse((await profileMarks(t, t))[0].until) - Date.now() > 23.9 * 3_600_000, 'süre yeniden 24 saat');
    // With more time left than the gift gives: the end stays (never shorter); the answer says the time it shows.
    await q("UPDATE profile_marks SET expires_at = now() + interval '30 hours' WHERE user_id = $1 AND cleared_at IS NULL", [t.user.id]);
    const end = (await showing(t))[0].expires_at.toISOString();
    const shorter = await ok(terlik(can, t), 'üçüncü terlik');
    assert.equal(shorter.mark.until, end, 'bitiş kısalmadı');
    assert.deepEqual([shorter.mark.again, shorter.mark.minutes, shorter.mark.hours], [true, 1800, 30]);
    assert.deepEqual((await showing(t)).map((m) => [m.from_user, m.expires_at.toISOString()]), [[can.user.id, end]], 'en yeni gönderenin, aynı bitişle');
    // stack replace: the same on the photo; only the record differs (the old one set aside as 'replaced').
    await ok(adminPost('/api/admin/mark-kinds/update', { kind: 'kirik-cam', stack: 'replace' }), 'replace');
    await sleep(300);
    const fourth = await ok(terlik(deniz, t), 'dördüncü terlik');
    assert.deepEqual([fourth.mark.again, fourth.mark.until], [true, end]);
    const last = await q('SELECT kind, cleared_how, cleared_by FROM profile_marks WHERE user_id = $1 ORDER BY id DESC LIMIT 2', [t.user.id]);
    assert.deepEqual(last.map((m) => [m.cleared_how, m.cleared_by]), [[null, null], ['replaced', deniz.user.id]]);
    assert.equal((await showing(t)).length, 1);
    await ok(adminPost('/api/admin/mark-kinds/update', { kind: 'kirik-cam', stack: 'refresh' }), 'refresh');
    // Nothing set a mark aside for another kind: each 'replaced' row's place went to a mark of its own kind.
    assert.deepEqual(await q("SELECT m.id FROM profile_marks m WHERE m.cleared_how = 'replaced' AND NOT EXISTS (SELECT 1 FROM profile_marks n WHERE n.gift_event_id = m.clear_event_id AND n.kind = m.kind)"), []);
    await q('DELETE FROM room_presence WHERE identity = $1', [t.user.id]);
    await sleep(300);
  });

  test('ucuz temizleme yok (inceleme): aynı türün kısa süreli ucuz hediyesi izi kısaltmaz, başka türün ucuz hediyesi izi kaldırmaz', async () => {
    // As staff may set up: a cheap gift of another kind with 5 minutes (Su Kovası, 500), and a cheap one of the same kind
    // with 5 minutes (Pasta At, 777), both cheaper than Temizlik Suyu (1.999).
    await ok(adminPost('/api/admin/mark-kinds', { kind: 'kar-ucuz', name: 'Kar' }), 'tür');
    await ok(adminPost('/api/admin/gifts/update', { id: 'p5', enabled: true, mark: { role: 'leave', kind: 'kar-ucuz', minutes: 5 } }), 'p5');
    await ok(adminPost('/api/admin/gifts/update', { id: 'p6', enabled: true, mark: { role: 'leave', kind: 'kaka', minutes: 5 } }), 'p6');
    await sleep(300);
    const cat = await catalog('?gifts=2&marks=1&marks=2');
    const price = (id) => cat.gifts.find((g) => g.id === id).price;
    assert.deepEqual([price('k1'), price('k2'), price('p5'), price('p6')], [999, 1999, 500, 777]);
    const t = await target('Ucuz Temizlik');
    const k = await ok(kaka(ali, t), 'kaka');
    // Su Kovası (another kind) while Kaka İzi shows: a plain gift, Kaka İzi keeps its 24 hours.
    const other = await ok(send(deniz, t, 'p5', 500), 'başka tür');
    assert.equal(other.mark, null);
    assert.match(other.markNote, /^Ucuz Temizlik, profilinde zaten bir iz var; Su Kovası düz hediye olarak gitti\.$/);
    assert.deepEqual((await profileMarks(can, t)).map((m) => [m.kind, m.until]), [['kaka', k.mark.until]], 'kaka 24 saat kalır');
    // Pasta At (the same kind, 5 minutes) on 24 hours of Kaka İzi: the newest sender's, the same end.
    const same = await ok(send(deniz, t, 'p6', 777), 'aynı tür, 5 dakika');
    assert.deepEqual([same.mark.kind, same.mark.again, same.mark.until], ['kaka', true, k.mark.until]);
    assert.ok(same.mark.minutes > 23 * 60, `kısalmadı (${same.mark.minutes} dakika)`);
    const left = (Date.parse((await profileMarks(t, t))[0].until) - Date.now()) / 3_600_000;
    assert.ok(left > 23.9, `hâlâ 24 saat (${left})`);
    for (const id of ['p5', 'p6']) await ok(adminPost('/api/admin/gifts/reset', { id }), 'geri al');
    await sleep(300);
    await wipe(t);
  });

  test('birden çok alıcı: her biri ayrı ödenir ve ayrı iz alır; izi kabul etmeyen yalnız kendisi reddedilir', async () => {
    const a = await target('Alıcı Bir');
    const b = await h.signUp('Alıcı Kimse');
    await privacy(b, { marksFrom: 'nobody' });
    const c = await h.signUp('Alıcı Takipçi');
    await follow(c, ece);
    const before = await balances(ece, a, b, c);
    // The app sends a gift to many as one send each (one ref each), as it does today.
    const out = await Promise.all([a, b, c].map((x) => kaka(ece, x)));
    assert.deepEqual(out.map(([st]) => st), [200, 403, 200]);
    assert.equal(out[1][1].code, 'marks_off');
    const now = await balances(ece, a, b, c);
    assert.equal(now[ece.user.id][0], before[ece.user.id][0] - 2 * 999, 'iki kişi için ödendi');
    assert.equal(now[a.user.id][1], before[a.user.id][1] + 999);
    assert.equal(now[b.user.id][1], before[b.user.id][1], 'reddeden: hiçbir şey');
    assert.equal(now[c.user.id][1], before[c.user.id][1] + 999);
    assert.deepEqual([(await showing(a)).length, (await showing(b)).length, (await showing(c)).length], [1, 0, 1]);
  });

  test('aynı istek iki kez aynı anda: tek iz, tek para kaydı; tekrarın cevabı izi söyler', async () => {
    const t = await target('Tekrar');
    const ref = `mz-twice-${rnd()}`;
    const before = await balances(ali);
    const both = await Promise.all([kaka(ali, t, { ref }), kaka(ali, t, { ref })]);
    assert.deepEqual(both.map(([st]) => st), [200, 200], JSON.stringify(both.map(([, j]) => j.error)));
    assert.deepEqual(both.map(([, j]) => j.replay).sort(), [false, true]);
    assert.ok(both.every(([, j]) => j.mark?.role === 'leave' && j.mark.kind === 'kaka'), 'ikisi de izi söyler');
    assert.equal((await balances(ali))[ali.user.id][0], before[ali.user.id][0] - 999, 'tek ücret');
    const ev = await q('SELECT id FROM gift_events WHERE sender = $1 AND ref = $2', [ali.user.id, ref]);
    assert.equal(ev.length, 1, 'tek hediye kaydı');
    assert.equal((await q("SELECT count(*)::int AS n FROM ledger WHERE ref = $1 AND currency = 'coin'", [ref]))[0].n, 1, 'tek para kaydı');
    assert.equal((await q('SELECT count(*)::int AS n FROM profile_marks WHERE gift_event_id = $1', [ev[0].id]))[0].n, 1, 'tek iz');
  });

  test('temizlik ile yeni iz yarışı: sonuç tutarlı, kimse iki kez ödemez', async () => {
    const t = await target('Yarış');
    for (let round = 0; round < 6; round++) {
      await wipe(t);
      await ok(kaka(ali, t), 'kaka');
      const before = await balances(can, deniz);
      const [w, m] = await Promise.all([su(can, t), kaka(deniz, t)]);
      assert.equal(w[0], 200, w[1].error);
      assert.equal(m[0], 200, m[1].error);
      const shown = await showing(t);
      // Su then Kaka: Su cleaned, Deniz's mark shows. Kaka then Su: Deniz's refreshed it, Su cleaned it.
      if (shown.length) {
        assert.equal(shown.length, 1);
        assert.equal(shown[0].from_user, deniz.user.id);
        assert.equal(w[1].mark?.role, 'clean');
      } else assert.equal(w[1].mark?.role, 'clean', 'son gelen Su temizler');
      const after = await balances(can, deniz);
      assert.equal(after[can.user.id][0], before[can.user.id][0] - 1999);
      assert.equal(after[deniz.user.id][0], before[deniz.user.id][0] - 999);
    }
  });

  test('kodsuz üçüncü çift: Çamur Bombası → Köpük Banyosu yalnız yönetim uçlarıyla', async () => {
    // 1. The kind, with its overlay (uploaded and checked).
    const overlay = await upload(admin, 'markart', rgbaPng(512, 512, ringAlpha(512, 0.7), { rgb: [110, 75, 40] }), 'image/png');
    const kind = await ok(adminPost('/api/admin/mark-kinds', { kind: 'camur', name: 'Çamur', art: overlay, minutes: 30 }), 'çamur türü');
    assert.equal(kind.kind.art.checked, true);
    // 2. The two gifts, on the Muzip shelf, at the prices staff choose.
    const bomb = await ok(adminPost('/api/admin/gifts', { name: 'Çamur Bombası', emoji: '🟤', price: 300, cat: 'gameplay', icon: await iconUrl(), mark: { role: 'leave', kind: 'camur' } }), 'bomba');
    const foam = await ok(adminPost('/api/admin/gifts', { name: 'Köpük Banyosu', emoji: '🫧', price: 600, cat: 'gameplay', icon: await iconUrl(), mark: { role: 'clean', kind: 'camur' } }), 'köpük');
    await sleep(300);
    // 3. What the new app reads: both gifts with their rule, the kind with its picture.
    const cat = await catalog('?gifts=2&marks=1&marks=2');
    assert.deepEqual(cat.gifts.find((g) => g.id === bomb.gift.id).mark, { role: 'leave', kind: 'camur', hours: 1, minutes: 30 });
    assert.deepEqual(cat.gifts.find((g) => g.id === foam.gift.id).mark, { role: 'clean', kind: 'camur' });
    assert.equal(cat.marks.kinds.camur.name, 'Çamur');
    assert.equal(cat.marks.kinds.camur.art.v, kind.kind.art.v);
    assert.ok(!(await catalog('?gifts=2')).gifts.some((g) => g.id === bomb.gift.id || g.id === foam.gift.id), 'eski uygulama ikisini de görmez');
    // 4. Sent, seen, cleaned.
    const t = await target('Çamurlu');
    const left = await ok(send(ali, t, bomb.gift.id, 300), 'bomba gönder');
    assert.deepEqual([left.mark.role, left.mark.kind, left.mark.minutes, left.mark.clean], ['leave', 'camur', 30, '🫧']);
    assert.deepEqual((await profileMarks(can, t)).map((m) => [m.kind, m.gift]), [['camur', bomb.gift.id]]);
    assert.deepEqual((await look(can, t)).marks.map((m) => m.kind), ['camur']);
    const cleaned = await ok(send(can, t, foam.gift.id, 600), 'köpük gönder');
    assert.deepEqual(cleaned.mark, { role: 'clean', kind: 'camur', gift: foam.gift.id, emoji: '🫧' });
    assert.deepEqual(await profileMarks(can, t), []);
    // 5. Turned off: its gifts plain, its marks hidden; on again, back.
    await ok(send(ali, t, bomb.gift.id, 300), 'yeniden bomba');
    await ok(adminPost('/api/admin/mark-kinds/update', { kind: 'camur', enabled: false }), 'kapat');
    await sleep(300);
    assert.deepEqual(await profileMarks(can, t), [], 'kapalı türün izi görünmez');
    assert.equal((await catalog('?gifts=2&marks=2')).gifts.find((g) => g.id === bomb.gift.id).mark, undefined);
    assert.equal((await ok(send(deniz, t, bomb.gift.id, 300), 'kapalıyken')).mark, undefined, 'düz hediye');
    await ok(adminPost('/api/admin/mark-kinds/update', { kind: 'camur', enabled: true }), 'aç');
    await sleep(300);
    assert.equal((await profileMarks(can, t)).length, 1, 'açınca süresi dolmayan iz geri gelir');
    for (const g of [bomb, foam]) await ok(adminPost('/api/admin/gifts/delete', { id: g.gift.id }), 'sil');
  });

  test('pilot: Terlik Geldi! Kırık Cam bırakır, Cam Tamiri temizler; Cam Tamiri Terlik’ten pahalı olmalı', async () => {
    const icon = await iconUrl();
    await refused(adminPost('/api/admin/gifts', { name: 'Cam Tamiri', emoji: '🪟', price: 1299, cat: 'gameplay', icon, mark: { role: 'clean', kind: 'kirik-cam' } }), 400, /Terlik Geldi! 1\.299 jeton/);
    const fix = await ok(adminPost('/api/admin/gifts', { name: 'Cam Tamiri', emoji: '🪟', price: 1500, cat: 'gameplay', icon, mark: { role: 'clean', kind: 'kirik-cam' } }), 'cam tamiri');
    await sleep(300);
    const t = await target('Camı Kırık');
    const r = await ok(terlik(ali, t), 'terlik');
    assert.deepEqual([r.mark.kind, r.mark.minutes, r.mark.hours, r.mark.clean], ['kirik-cam', 1440, 24, '🪟']);
    assert.equal((await ok(send(can, t, fix.gift.id, 1500), 'tamir')).mark.role, 'clean');
    assert.deepEqual(await profileMarks(t, t), []);
    await ok(adminPost('/api/admin/gifts/delete', { id: fix.gift.id }), 'sil');
  });

  test('engel: engellenen kişi iz bırakamaz, bıraktığı iz kalkar (bugünkü gibi)', async () => {
    const t = await target('Engelleyen');
    await ok(kaka(ali, t), 'kaka');
    const ref = `mz-before-block-${rnd()}`;
    await ok(su(deniz, t, { ref }), 'engelden önce');
    await ok(kaka(ali, t), 'yeniden kaka');
    await ok(call('POST', '/api/block', { to: ali.user.id }, t.session), 'engelle');
    assert.deepEqual(await profileMarks(t, t), [], 'engelleyince bıraktığı iz kalkar');
    await refused(kaka(ali, t), 403, /hediye gönderemezsin/);
    // Either way: the blocker can't send the blocked person one either.
    await refused(call('POST', '/api/gifts/send', { to: ali.user.id, giftId: 'g6', count: 1, ref: `mz-${rnd()}` }, t.session), 403, /hediye gönderemezsin/);
    // A retry of a gift that went through before a block (here: Deniz blocked now) gets its replay, not a refusal.
    await ok(call('POST', '/api/block', { to: deniz.user.id }, t.session), 'denizi engelle');
    const replay = await ok(su(deniz, t, { ref }), 'engelden önceki isteğin tekrarı');
    assert.equal(replay.replay, true);
    for (const who of [ali, deniz]) await ok(call('POST', '/api/block', { to: who.user.id, block: false }, t.session), 'engeli kaldır');
  });

  test('engel yarışı: yoldaki iz hediyeleri engelden sonra iz bırakmaz (inceleme)', async () => {
    // Marks on their way while the receiver blocks their sender: each is refused, or taken off by the block right after
    // (gifts.mjs reads the block under both people's locks; social.mjs clearMarks waits for them).
    const harasser = await h.signUp('Yarış Atan');
    await h.credit(harasser.user.id, 2_000_000);
    let leaked = 0;
    let refusedAfter = 0;
    const rounds = 20;
    for (let round = 0; round < rounds; round++) {
      const victim = await target(`Yarış Hedef ${round}`);
      const sends = Array.from({ length: 10 }, () => kaka(harasser, victim));
      await sleep(2 + (round % 5));
      await ok(call('POST', '/api/block', { to: harasser.user.id }, victim.session), 'engelle');
      const out = await Promise.all(sends);
      assert.ok(out.every(([st]) => st === 200 || st === 403), JSON.stringify(out.map(([st, j]) => [st, j.error])));
      refusedAfter += out.filter(([st]) => st === 403).length;
      const left = await q('SELECT id FROM profile_marks WHERE user_id = $1 AND from_user = $2 AND cleared_at IS NULL AND expires_at > now()', [victim.user.id, harasser.user.id]);
      if (left.length) leaked++;
    }
    assert.equal(leaked, 0, `${rounds} turda engelden sonra kalan iz`);
    assert.ok(refusedAfter > 0, 'bazı gönderimler engelden sonra reddedildi');
  });
});
