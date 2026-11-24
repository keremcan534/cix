// Yönetim jeton yüklemesi (jeton.mjs): management makes its Jeton Noktası's stock (wholesale, at the price it gives),
// passes coins from it to a person from the panel, and takes a wrong load back: only the coins of that load still
// unspent, once. Admin only; the money checks run after the file (harness.mjs).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
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
const coinsOf = async (u) => Number((await q('SELECT coins FROM users WHERE id = $1', [u.user.id])).rows[0].coins);

async function setup() {
  const admin = await signUp('Süper Yönetici');
  await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  const bank = await signUp('Yönetim Jeton Noktası');
  await ok(call('POST', '/api/admin/jeton/bank', { user: bank.user.id, enabled: true }, admin.session), 'banka');
  return { admin, bank };
}

describe('Yönetim jeton yüklemesi', () => {
  test('üretim verilen fiyatla deftere girer; yükleme stoktan kişiye gider; liste stoku ve yüklemeyi gösterir', async () => {
    const { admin, bank } = await setup();
    const made = await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 100_000, paymentRef: 'URETIM-1', priceTl: 1234.5, ref: rnd(6) }, admin.session), 'üretim');
    assert.equal(made.transfer.valueTl, 1234.5);
    const buyer = await signUp('Alıcı');
    const ref = rnd(8);
    const r = await ok(call('POST', '/api/admin/jeton/load', { bank: bank.user.id, to: buyer.user.id, coins: 5000, valueTl: 250, paymentRef: 'HAVALE-9', ref }, admin.session), 'yükleme');
    assert.equal(r.transfer.coins, 5000);
    assert.equal(r.transfer.valueTl, 250);
    assert.equal(r.transfer.unspent, 5000);
    assert.equal(await coinsOf(buyer), 5000);
    assert.equal(await coinsOf(bank), 95_000);
    // The same request again (a lost answer): once.
    const again = await ok(call('POST', '/api/admin/jeton/load', { bank: bank.user.id, to: buyer.user.id, coins: 5000, valueTl: 250, paymentRef: 'HAVALE-9', ref }, admin.session), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(await coinsOf(buyer), 5000);
    const list = await ok(call('GET', `/api/admin/jeton/loads?bank=${bank.user.id}`, null, admin.session), 'liste');
    assert.equal(list.loads.length, 1);
    assert.equal(list.banks.find((b) => b.id === bank.user.id).coins, 95_000);
    assert.ok(list.rateTl > 0);
    const [row] = (await q("SELECT kind, actor, value_tl FROM coin_transfers WHERE id = $1", [r.transfer.id])).rows;
    assert.deepEqual([row.kind, row.actor, Number(row.value_tl)], ['admin_load', admin.user.id, 250]);
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'jeton.admin_load' AND target = $1", [buyer.user.id])).rows[0].n, 1);
  });

  test('geri alma: yalnız harcanmamış kısmı bir kez döner; hepsi harcanmışsa reddedilir', async () => {
    const { admin, bank } = await setup();
    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 50_000, paymentRef: 'URETIM-2', ref: rnd(6) }, admin.session), 'üretim');
    const buyer = await signUp('Yanlış Kişi');
    const friend = await signUp('Arkadaş');
    const load = (await ok(call('POST', '/api/admin/jeton/load', { bank: bank.user.id, to: buyer.user.id, coins: 3000, valueTl: 150, ref: rnd(8) }, admin.session), 'yükleme')).transfer;
    // 1.999 of it already spent on a gift.
    await ok(call('POST', '/api/gifts/send', { to: friend.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, buyer.session), 'hediye');
    const spentNow = 3000 - (await coinsOf(buyer));
    assert.ok(spentNow > 0);
    const back = await ok(call('POST', '/api/admin/jeton/reverse', { transfer: load.id }, admin.session), 'geri al');
    assert.equal(back.coins, 3000 - spentNow);
    assert.equal(back.spent, spentNow);
    assert.equal(await coinsOf(buyer), 0);
    assert.equal(await coinsOf(bank), 50_000 - 3000 + back.coins);
    await refused(call('POST', '/api/admin/jeton/reverse', { transfer: load.id }, admin.session), 409, /zaten geri alındı/);
    const list = await ok(call('GET', '/api/admin/jeton/loads', null, admin.session), 'liste');
    const shown = list.loads.find((x) => x.id === load.id);
    assert.equal(shown.reversed.coins, back.coins);
    assert.equal(shown.unspent, 0);
    // Everything spent: nothing to take back.
    const other = await signUp('Hepsini Harcayan');
    const l2 = (await ok(call('POST', '/api/admin/jeton/load', { bank: bank.user.id, to: other.user.id, coins: 1999, valueTl: 100, ref: rnd(8) }, admin.session), 'yükleme 2')).transfer;
    const [, g] = await call('GET', '/api/catalog', null, other.session);
    const roket = g.gifts.find((x) => x.price === 1999);
    if (roket) {
      await ok(call('POST', '/api/gifts/send', { to: friend.user.id, giftId: roket.id, count: 1, ref: rnd(6) }, other.session), 'hepsi harcandı');
      await refused(call('POST', '/api/admin/jeton/reverse', { transfer: l2.id }, admin.session), 409, /hepsi harcanmış/);
    }
  });

  test('VIP puanı: yönetim yüklemesi ve Jeton Noktası satışı jeton kadar puan verir; geri alınan yükleme puanını götürür; toptan vermez', async () => {
    const { admin, bank } = await setup();
    const svip = async (u) => Number((await q('SELECT svip_xp FROM users WHERE id = $1', [u.user.id])).rows[0].svip_xp);
    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 100_000, paymentRef: 'URETIM-V', ref: rnd(6) }, admin.session), 'üretim');
    assert.equal(await svip(bank), 0, 'toptan stok puan vermez');
    const loaded = await signUp('Yüklenen');
    const load = (await ok(call('POST', '/api/admin/jeton/load', { bank: bank.user.id, to: loaded.user.id, coins: 30_000, valueTl: 6600, ref: rnd(8) }, admin.session), 'yükleme')).transfer;
    assert.equal(await svip(loaded), 30_000, '30.000 puan: VIP 1 (25.000)');
    const [, meJ] = await call('GET', '/api/me', null, loaded.session);
    assert.equal(meJ.user.svipXp, 30_000);
    await ok(call('POST', '/api/admin/jeton/reverse', { transfer: load.id, reason: 'Yanlış kişi' }, admin.session), 'geri al');
    assert.equal(await svip(loaded), 0, 'yanlış yüklemenin puanı gider');
    const bought = await signUp('Bayiden Alan');
    await ok(call('POST', '/api/jeton/transfer', { to: bought.user.id, coins: 62_500, ref: rnd(8) }, bank.session), 'bayi satışı');
    assert.equal(await svip(bought), 62_500, 'Jeton Noktası satışı: VIP 2 (62.500)');
    assert.equal(await svip(bank), 0, 'satan bayi puan almaz');
  });

  test('yalnız yönetici; geçersiz tutar, stoğu yetmeyen banka ve banka olmayan hesap reddedilir', async () => {
    const { admin, bank } = await setup();
    const user = await signUp('Sıradan');
    const buyer = await signUp('Alıcı 3');
    const body = (x = {}) => ({ bank: bank.user.id, to: buyer.user.id, coins: 1000, valueTl: 50, ref: rnd(8), ...x });
    await refused(call('POST', '/api/admin/jeton/load', body(), user.session), 403);
    await refused(call('GET', '/api/admin/jeton/loads', null, user.session), 403);
    await refused(call('POST', '/api/admin/jeton/load', body({ valueTl: -1 }), admin.session), 400, /Ödenen tutar/);
    await refused(call('POST', '/api/admin/jeton/load', body({ valueTl: 1.234 }), admin.session), 400);
    await refused(call('POST', '/api/admin/jeton/load', body({ coins: 0 }), admin.session), 400);
    await refused(call('POST', '/api/admin/jeton/load', body(), admin.session), 409, /Yetersiz/);
    await refused(call('POST', '/api/admin/jeton/load', body({ bank: user.user.id }), admin.session), 404, /Jeton Noktası/);
    await refused(call('POST', '/api/admin/jeton/load', body({ to: bank.user.id }), admin.session), 400);
    await refused(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 10, paymentRef: 'X', priceTl: 'abc', ref: rnd(6) }, admin.session), 400, /Toptan fiyat/);
    assert.equal(await coinsOf(buyer), 0);
  });
});
