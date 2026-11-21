// Bağ işaretleri (bond-looks.mjs, 107): staff design each bond kind's mark level by level in the panel (a still picture
// and/or a moving one, and how big it is drawn); phones that ask (?bondlooks=1) get the designs in the catalog, whose
// `v` grows with every change. Older apps never ask.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';
import { bucketEnv, png, rgbaPng, standInBucket } from './stand-in-bucket.mjs';

const PORT = 28000 + (process.pid % 900);
const bucket = standInBucket(PORT);
const h = startApi({ ...bucketEnv(PORT), BOND_LOOKS_POLL_MS: '200' });
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
const rnd = () => Math.random().toString(36).slice(2, 10);

let admin;
const staff = async () => (admin ??= await h.account(`Bağ Tasarımcısı ${rnd().slice(0, 4)}`, 'admin'));
async function upload(kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, (await staff()).session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}
/** An animated WebP's header as the server reads it (VP8X with the alpha and animation flags, ANIM, a few ANMF). */
function animatedWebp(w, hgt, { alpha = true, frames = 3 } = {}) {
  const chunk = (tag, body) => {
    const head = Buffer.alloc(8);
    head.write(tag, 0, 'latin1');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body, Buffer.alloc(body.length % 2)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = (alpha ? 0x10 : 0) | 0x02;
  vp8x.writeUIntLE(w - 1, 4, 3);
  vp8x.writeUIntLE(hgt - 1, 7, 3);
  const frame = () => {
    const head = Buffer.alloc(16);
    head.writeUIntLE(w - 1, 6, 3);
    head.writeUIntLE(hgt - 1, 9, 3);
    head.writeUIntLE(120, 12, 3);
    return chunk('ANMF', Buffer.concat([head, chunk('VP8L', Buffer.from([0x2f, 0, 0, 0, 0]))]));
  };
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunk('VP8X', vp8x), chunk('ANIM', Buffer.alloc(6)), ...Array.from({ length: frames }, frame)]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
const still = (side = 256, o) => upload('shopframe', png(side, side, o), 'image/png');
const moving = (side = 256, o) => upload('shopframe', animatedWebp(side, side, o), 'image/webp');
const save = async (body) => call('POST', '/api/admin/bond-looks/save', body, (await staff()).session);
const clear = async (body) => call('POST', '/api/admin/bond-looks/clear', body, (await staff()).session);
const panel = async () => ok(call('GET', '/api/admin/bond-looks', null, (await staff()).session), 'panel');
const catalog = (q = '?bondlooks=1') => ok(call('GET', `/api/catalog${q}`), 'katalog');
const audits = async (action) => (await h.sql.query('SELECT detail FROM audit_events WHERE action = $1 ORDER BY id', [action])).rows.map((r) => r.detail);
/** The storage key of an address, stored (the storage's own) or served (this server's /api/media/f/). */
const keyIn = (url) => url.slice(url.indexOf('shopframe/'));
const stored = (url) => bucket.stored.has(keyIn(url));
/** Two addresses of the same file (the database keeps the storage's, answers give this server's). */
const same = (a, b) => assert.equal(keyIn(a), keyIn(b));

describe('Bağ işaretleri', () => {
  test('panel her türü ve 20 seviyeyi gösterir; yalnız yönetici', async () => {
    const p = await panel();
    assert.deepEqual(
      p.kinds.map((k) => k.kind),
      ['cift', 'kardes', 'baci', 'agabey', 'abla', 'yenge', 'enishte', 'kanka'],
    );
    assert.equal(p.kinds[0].label, 'Çift');
    assert.equal(p.levels, 20);
    assert.equal(p.storage, true);
    assert.equal(p.limits.sizeMax, 3);
    const u = await h.signUp('Meraklı Üye');
    await refused(call('GET', '/api/admin/bond-looks', null, u.session), 403);
    await refused(call('POST', '/api/admin/bond-looks/save', { kind: 'cift', level: 1, art: await still() }, u.session), 403);
  });

  test('bir seviyenin resmi kaydedilir, katalogda yalnız isteyen telefona gider, v büyür', async () => {
    const before = await catalog();
    assert.equal(before.bondLooks.cift, undefined);
    const art = await still();
    const { look } = await ok(save({ kind: 'cift', level: 3, art }), 'kaydet');
    same(look.art.url, art);
    assert.equal(look.art.px, 256);
    assert.equal(look.motion, null);
    assert.equal(look.size, 1);
    const after = await catalog();
    assert.ok(after.v > before.v, 'katalog sürümü büyür');
    assert.deepEqual(Object.keys(after.bondLooks.cift), ['3']);
    same(after.bondLooks.cift[3].art.url, art);
    assert.match(after.bondLooks.cift[3].art.v, /^[0-9a-f]{12}$/);
    // An older app doesn't ask and gets nothing new.
    assert.equal((await catalog('')).bondLooks, undefined);
    const [a] = (await audits('bondlook.save')).filter((d) => d.kind === 'cift' && d.level === 3);
    assert.equal(a.before, null);
    same(a.after.art, art);
  });

  test('hareketli hali ve boyutu; resmi kaldırınca hareketli kalır; Kaldır ile seviye boşalır', async () => {
    const art = await still(128);
    const motion = await moving(200);
    await ok(save({ kind: 'kanka', level: 5, art, motion, size: 1.75 }), 'ikisi birden');
    let c = (await catalog()).bondLooks.kanka[5];
    same(c.motion.url, motion);
    assert.equal(c.motion.px, 200);
    assert.equal(c.size, 1.75);
    // Only the size changes: the pictures stay with their versions.
    const v = c.art.v;
    await ok(save({ kind: 'kanka', level: 5, size: 2 }), 'boyut');
    c = (await catalog()).bondLooks.kanka[5];
    assert.equal(c.size, 2);
    assert.equal(c.art.v, v);
    // The still one off: the moving one stays; its file goes from the storage.
    await ok(save({ kind: 'kanka', level: 5, art: null }), 'durağanı kaldır');
    c = (await catalog()).bondLooks.kanka[5];
    assert.equal(c.art, undefined);
    same(c.motion.url, motion);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(stored(art), false, 'kaldırılan resmin dosyası silinir');
    await refused(save({ kind: 'kanka', level: 5, motion: null }), 400, /durağan resim ya da hareketli hal gerekli/);
    await ok(clear({ kind: 'kanka', level: 5 }), 'kaldır');
    assert.equal((await catalog()).bondLooks.kanka, undefined);
    await refused(clear({ kind: 'kanka', level: 5 }), 404, /tasarımı yok/);
    assert.equal((await panel()).looks.some((x) => x.kind === 'kanka'), false);
    const [cl] = await audits('bondlook.clear');
    same(cl.before.motion, motion);
  });

  test('yanlış dosya ve değerler Türkçe bir sebeple geri çevrilir', async () => {
    await refused(save({ kind: 'dost', level: 1, art: await still() }), 400, /Bağ türü/);
    await refused(save({ kind: 'cift', level: 21, art: await still() }), 400, /Seviye 1–20/);
    await refused(save({ kind: 'cift', level: 0, art: await still() }), 400, /Seviye 1–20/);
    await refused(save({ kind: 'cift', level: 1 }), 400, /Değişecek bir şey yok/);
    await refused(save({ kind: 'cift', level: 1, art: await still(), size: 4 }), 400, /Boyut 1–3/);
    await refused(save({ kind: 'cift', level: 1, art: await upload('shopframe', png(256, 200), 'image/png') }), 400, /kare/);
    await refused(save({ kind: 'cift', level: 1, art: await still(256, { alpha: false }) }), 400, /saydamlık/);
    await refused(save({ kind: 'cift', level: 1, art: await still(40) }), 400, /64–1024/);
    await refused(save({ kind: 'cift', level: 1, art: await moving() }), 400, /hareketli/);
    await refused(save({ kind: 'cift', level: 1, art: await upload('shopframe', rgbaPng(128, 128, () => 0, { apng: true }), 'image/png') }), 400, /hareketli/);
    await refused(save({ kind: 'cift', level: 1, motion: await still() }), 400, /hareketli bir WebP/);
    await refused(save({ kind: 'cift', level: 1, motion: await moving(600) }), 400, /64–512/);
    await refused(save({ kind: 'cift', level: 1, motion: await moving(256, { alpha: false }) }), 400, /saydamlık/);
    await refused(save({ kind: 'cift', level: 1, art: 'https://example.com/x.png' }), 400, /önce yükleyin/);
    await refused(call('POST', '/api/admin/bond-looks/svga', { source: '' }, (await staff()).session), 400, /SVGA/);
    // Nothing was saved for Lv1.
    assert.equal((await catalog()).bondLooks.cift?.[1], undefined);
  });

  test('aynı resim iki seviyede: biri değişince dosya silinmez', async () => {
    const art = await still(192);
    await ok(save({ kind: 'abla', level: 1, art }), 'Lv1');
    await ok(save({ kind: 'abla', level: 6, art }), 'Lv6');
    await ok(save({ kind: 'abla', level: 1, art: await still(160) }), 'Lv1 yeni');
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(stored(art), 'Lv6 hâlâ kullanıyor');
    const c = (await catalog()).bondLooks.abla;
    assert.deepEqual(Object.keys(c).sort(), ['1', '6']);
    same(c[6].art.url, art);
  });
});
