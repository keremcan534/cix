// Çarşı › Çıkartma paketleri "Yakında" (emoji.mjs, owners 25 Nov 2026): with the default (no PACKS_SOON=0) every pack
// sold in Çarşı or opened by VIP is on the shelf with the tag and not sold ("… yakında satışa çıkacak"); Yönetim ›
// Emojiler turns it off for one pack (then it sells) and back on.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ PACKS_SOON: '1' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('Çıkartma paketleri Yakında', () => {
  test('satılan paketler Yakında; panelden kalkınca satılır', async () => {
    const u = await signUp('Paketçi');
    const cat = (await ok(call('GET', '/api/catalog?emoji=1', null, u.session), 'katalog')).emoji.packs;
    const fun = cat.find((p) => p.id === 'fun');
    assert.equal(fun.soon, true, 'Eğlence Yakında');
    assert.equal(cat.find((p) => p.id === 'duygu').soon, undefined, 'ücretsiz paket Yakında değil');
    await h.credit(u.user.id, 10_000);
    const [st, j] = await call('POST', '/api/shop/buy', { sku: 'pack-fun', price: fun.price, ref: `p-${Date.now()}` }, u.session);
    assert.deepEqual([st, j.error], [409, `${fun.name} yakında satışa çıkacak`]);

    const adm = await signUp('Emoji Yöneticisi');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [adm.user.id]);
    const panel = (await ok(call('GET', '/api/admin/emoji', null, adm.session), 'panel')).packs.find((p) => p.id === 'fun');
    assert.deepEqual([panel.soon, panel.original.soon], [true, true]);
    await ok(call('POST', '/api/admin/emoji/packs/update', { id: 'fun', soon: false }, adm.session), 'satışa aç');
    await ok(call('POST', '/api/shop/buy', { sku: 'pack-fun', price: fun.price, ref: `p2-${Date.now()}` }, u.session), 'al');
    await ok(call('POST', '/api/admin/emoji/packs/update', { id: 'fun', soon: true }, adm.session), 'yeniden Yakında');
    assert.equal((await ok(call('GET', '/api/catalog?emoji=1', null, u.session), 'katalog')).emoji.packs.find((p) => p.id === 'fun').soon, true);
  });
});
