// Çarşı: a frame moved to Ses halkası (shop-items.mjs moveToWave, POST /api/admin/shop/move, owners 24 Nov 2026). The
// move is a new voice wave with the frame's name, price, days and VIP level, first on the shelf, and the frame off the
// shelf (whoever has it keeps wearing it); only admins, only frames, once each; audited. The owners' own move of
// Çerçeveler › Ses Halkası (fr-neon) runs once at start (SHOP_OWNER_MOVES on here).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ SHOP_OWNER_MOVES: '1' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];
const shelf = async (s) => (await ok(call('GET', '/api/catalog?shop=1', null, s), 'katalog')).shop.items;
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
};

describe('Çarşı: çerçeveyi Ses halkasına taşı', () => {
  test('sahiplerin taşıması: Çerçeveler › Ses Halkası bir kez Ses halkası bölümüne geçer', async () => {
    const u = await signUp('Bakan');
    const wave = await waitFor(async () => (await shelf(u.session)).find((x) => x.kind === 'wave' && x.name === 'Ses Halkası'));
    assert.ok(wave, 'Ses halkası bölümünde Ses Halkası');
    assert.deepEqual([wave.price, wave.days, wave.minVip, wave.look], [150, 7, 0, { style: 'ripple', colors: ['#13D9DF'] }]);
    const frame = (await shelf(u.session)).find((x) => x.sku === 'fr-neon');
    assert.equal(frame.off, true, 'çerçeve satıştan kalktı');
    const moves = (await h.sql.query("SELECT to_id, moved_by FROM shop_moves WHERE from_id = 'fr-neon'")).rows;
    assert.deepEqual(moves, [{ to_id: wave.sku, moved_by: null }]);
    const audit = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'shop.move' AND detail->>'item' = $1", [wave.sku])).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].detail.from, 'fr-neon');
  });

  test('panelden taşıma: yalnız yönetici, yalnız çerçeve, bir kez; çerçeveyi alan takmaya devam eder', async () => {
    const adm = await signUp('Merkez');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.user.id]);
    const user = await signUp('Alıcı');
    // Someone has Yörünge (fr-ocean) before the move.
    await h.credit(user.user.id, 1000);
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-ocean', price: 300, ref: `al-${Date.now()}` }, user.session), 'satın al');

    assert.equal(await status(call('POST', '/api/admin/shop/move', { id: 'fr-ocean', to: 'wave' }, user.session)), 403);
    assert.equal(await status(call('POST', '/api/admin/shop/move', { id: 'bb-candy', to: 'wave' }, adm.session)), 400, 'balon taşınmaz');
    assert.equal(await status(call('POST', '/api/admin/shop/move', { id: 'fr-ocean', to: 'frame' }, adm.session)), 400);
    assert.equal(await status(call('POST', '/api/admin/shop/move', { id: 'fr-ocean', to: 'wave', look: { style: 'spin', colors: ['#FF0000'] } }, adm.session)), 400, 'dönen renkler en az 2 renk');

    const j = await ok(call('POST', '/api/admin/shop/move', { id: 'fr-ocean', to: 'wave', look: { style: 'spin', colors: ['#FF0000', '#0000FF'] } }, adm.session), 'taşı');
    assert.deepEqual([j.item.kind, j.item.name, j.item.price, j.item.days, j.item.enabled], ['wave', 'Yörünge', 300, 30, true]);
    assert.deepEqual(j.item.look, { style: 'spin', colors: ['#FF0000', '#0000FF'] });
    assert.equal(j.from.enabled, false);
    const items = await shelf(user.session);
    assert.equal(items.filter((x) => x.kind === 'wave')[0].sku, j.item.id, 'Ses halkası bölümünde ilk');
    assert.equal(items.find((x) => x.sku === 'fr-ocean').off, true);
    // The frame bought before stays theirs.
    const mine = (await h.sql.query("SELECT 1 FROM entitlements WHERE user_id = $1 AND sku = 'fr-ocean' AND revoked_at IS NULL", [user.user.id])).rowCount;
    assert.equal(mine, 1);
    // The frame isn't sold any more; the wave is.
    assert.notEqual(await status(call('POST', '/api/shop/buy', { sku: 'fr-ocean', price: 300, ref: `al2-${Date.now()}` }, user.session)), 200);
    await ok(call('POST', '/api/shop/buy', { sku: j.item.id, price: 300, ref: `al3-${Date.now()}` }, user.session), 'halkayı al');

    assert.equal(await status(call('POST', '/api/admin/shop/move', { id: 'fr-ocean', to: 'wave' }, adm.session)), 409, 'ikinci kez taşınmaz');
    const a = (await h.sql.query("SELECT actor, detail FROM audit_events WHERE action = 'shop.move' AND detail->>'item' = $1", [j.item.id])).rows[0];
    assert.equal(a.actor, adm.user.id);
    assert.equal(a.detail.from, 'fr-ocean');
  });

  // Binekler (owners, 25 Nov 2026): the app's rides in Yönetim › Mağaza, managed like the app's frames; none added.
  test('binekler panelde: listede, satıştan kaldırılır ve fiyatı değişir; yenisi eklenmez', async () => {
    const adm = await signUp('Binek Yöneticisi');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.user.id]);
    const list = (await ok(call('GET', '/api/admin/shop', null, adm.session), 'liste')).items.filter((x) => x.kind === 'ride');
    assert.deepEqual(list.map((x) => x.id).sort(), ['rd-jet', 'rd-scooter', 'rd-sport']);
    assert.equal(await status(call('POST', '/api/admin/shop', { kind: 'ride', name: 'Bisiklet', price: 10, days: 7 }, adm.session)), 400);
    await ok(call('POST', '/api/admin/shop/update', { id: 'rd-sport', enabled: false }, adm.session), 'kapat');
    await ok(call('POST', '/api/admin/shop/update', { id: 'rd-scooter', price: 300 }, adm.session), 'fiyat');
    const u = await signUp('Binekçi');
    const items = await shelf(u.session);
    assert.equal(items.find((x) => x.sku === 'rd-sport').off, true);
    assert.equal(items.find((x) => x.sku === 'rd-scooter').price, 300);
    await h.credit(u.user.id, 5000);
    assert.notEqual(await status(call('POST', '/api/shop/buy', { sku: 'rd-sport', price: 1200, days: 30, ref: `b1-${Date.now()}` }, u.session)), 200, 'kapalı binek satılmaz');
    await ok(call('POST', '/api/shop/buy', { sku: 'rd-scooter', price: 300, days: 7, ref: `b2-${Date.now()}` }, u.session), 'yeni fiyatla al');
  });

  // Özel ID and Yakında (owners, 25 Nov 2026): the Özel IDs and Takma isim in Mağaza, all "Yakında" (not sold); the
  // panel turns it off and on; any item can be "Yakında".
  test('Özel ID panelde, hepsi Yakında; Yakında kalkınca satılır, eklenince satılmaz', async () => {
    const adm = await signUp('Özel ID Yöneticisi');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.user.id]);
    const ids = (await ok(call('GET', '/api/admin/shop', null, adm.session), 'liste')).items.filter((x) => x.kind === 'specialId');
    assert.deepEqual(ids.map((x) => [x.id, x.soon]).sort(), [['id-1001', true], ['id-2026', true], ['id-777', true], ['nick-name', true]]);
    assert.equal(await status(call('POST', '/api/admin/shop', { kind: 'specialId', name: 'ID 42', price: 10, days: 0 }, adm.session)), 400);
    const u = await signUp('Takma');
    const cat = await shelf(u.session);
    assert.equal(cat.find((x) => x.sku === 'nick-name').soon, true);
    assert.equal(cat.find((x) => x.sku === 'nick-name').name, 'Takma isim oluştur');
    await h.credit(u.user.id, 10000);
    const [st, j] = await call('POST', '/api/shop/buy', { sku: 'nick-name', price: 5000, ref: `n-${Date.now()}` }, u.session);
    assert.deepEqual([st, j.error], [409, 'Takma isim oluştur yakında satışa çıkacak']);
    // A frame marked Yakında isn't sold; unmarked it is again.
    await ok(call('POST', '/api/admin/shop/update', { id: 'fr-aurora', soon: true }, adm.session), 'yakında');
    assert.equal((await shelf(u.session)).find((x) => x.sku === 'fr-aurora').soon, true);
    assert.equal(await status(call('POST', '/api/shop/buy', { sku: 'fr-aurora', price: 600, days: 30, ref: `a-${Date.now()}` }, u.session)), 409);
    await ok(call('POST', '/api/admin/shop/update', { id: 'fr-aurora', soon: false }, adm.session), 'satışa');
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-aurora', price: 600, days: 30, ref: `a2-${Date.now()}` }, u.session), 'al');
  });
});
