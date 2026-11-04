// Coin sources, diamond locks, Jeton Noktası and store refunds (wallet.mjs, jeton.mjs) against a real Postgres
// (harness.mjs). Tests in this file run in order; the last one checks that every account's lots add up.
//   PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres POSTGRES_PASSWORD=… npm test
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { bankExchangeCoins, diamondValueTl, exchangeCoins, wholesaleTl } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const DAY = 864e5;

const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const buy = (s, productId = 'coins_1000') => ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId, transactionId: rnd(8) }, s));
const gift = (s, to, amount, ref = rnd(6)) => call('POST', '/api/wallet/gift', { to: to.user.id, amount, ref }, s);
const earnings = (s) => ok(call('GET', '/api/wallet/earnings', null, s));
const coinLots = (s) => ok(call('GET', '/api/wallet/coins', null, s));
const unlock = (u) => h.sql.query('UPDATE diamond_locks SET unlock_at = now() WHERE user_id = $1', [u.user.id]);
/** Days from now until `iso`, rounded to a tenth. */
const daysUntil = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / DAY * 10) / 10;
const byDays = (locks) => locks.reduce((m, l) => ({ ...m, [daysUntil(l.unlockAt)]: (m[daysUntil(l.unlockAt)] ?? 0) + l.amount }), {});

async function staff(role) {
  const a = await signUp(role === 'admin' ? 'Yönetici' : 'Moderatör');
  await h.sql.query('UPDATE users SET role = $2 WHERE id = $1', [a.user.id, role]);
  return a;
}
async function bankOf(admin, name = 'Jeton Noktası') {
  const b = await signUp(name);
  await ok(call('POST', '/api/admin/jeton/bank', { user: b.user.id, enabled: true }, admin.session));
  return b;
}
const wholesale = (admin, bank, coins, ref = rnd(6)) => call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins, paymentRef: `DEKONT-${rnd(3)}`, ref }, admin.session);
const transfer = (bank, to, coins, ref = rnd(6), paymentRef = 'HAVALE-1') => call('POST', '/api/jeton/transfer', { to: to.user.id, coins, paymentRef, ref }, bank.session);

describe('Jeton kaynağı', () => {
  test('mağaza alımı: kanal ve ilk alım hediyesi ayrı partide, defterde ayrıntı', async () => {
    const a = await signUp('Alıcı');
    const out = await buy(a.session, 'coins_1000');
    assert.deepEqual([out.coins, out.bonus, out.user.coins], [1000, 1000, 2000]);
    const w = await coinLots(a.session);
    assert.deepEqual(Object.fromEntries(w.channels.map((c) => [c.channel, c.remaining])), { test: 1000, bonus: 1000 });
    assert.ok(w.lots.every((l) => l.lockDays === 7 && l.product === 'coins_1000'));
    const [, ledger] = await call('GET', '/api/ledger', null, a.session);
    const row = ledger.rows[0];
    assert.equal(row.channel, 'mixed', 'iki kaynaklı satır');
    assert.equal(row.detail.platform, 'test');
    assert.equal(typeof row.detail.purchase, 'number');
    assert.deepEqual(row.detail.lots.map((l) => [l.channel, l.amount]), [['test', 1000], ['bonus', 1000]]);
  });

  test('hediye: mağaza jetonundan gelen elmas 7 gün kilitli, açılınca çekilebilir', async () => {
    const a = await signUp('Gönderen');
    const host = await signUp('Yayıncı');
    await buy(a.session, 'coins_1000');
    assert.equal((await gift(a.session, host, 1500))[0], 200);
    const sent = await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g5', count: 1, ref: rnd(6) }, a.session));
    assert.equal(sent.user.coins, 0);
    let e = await earnings(host.session);
    assert.deepEqual([e.diamonds, e.locked, e.withdrawable], [2000, 2000, 0]);
    assert.deepEqual(e.lockDays, { store: 7, jeton: 1 });
    assert.deepEqual(byDays(e.locks), { 7: 2000 });
    assert.ok(e.locks.every((l) => l.from.id === a.user.id && ['test', 'bonus'].includes(l.channel)));
    assert.ok(e.locks.some((l) => l.gift?.id === 'g5'), 'hediye adı kilitte görünür');

    const [st, j] = await call('POST', '/api/wallet/exchange', { diamonds: 1000, ref: rnd(6) }, host.session);
    assert.equal(st, 409);
    assert.match(j.error, /2\.000 elmasın kilidi henüz açılmadı; çekilebilir bakiyen 0 elmas/);

    await unlock(host);
    e = await earnings(host.session);
    assert.deepEqual([e.locked, e.withdrawable, e.locks.length], [0, 2000, 0]);
    const x = await ok(call('POST', '/api/wallet/exchange', { diamonds: 1000, ref: rnd(6) }, host.session));
    assert.equal(x.coins, exchangeCoins(1000));
    const w = await coinLots(host.session);
    assert.deepEqual([w.lots[0].channel, w.lots[0].lockDays], ['cevir', 1]);

    // Çevir coins gifted on lock the next recipient for 1 day.
    const fan = await signUp('Hayran');
    assert.equal((await gift(host.session, fan, x.coins))[0], 200);
    assert.deepEqual(byDays((await earnings(fan.session)).locks), { 1: x.coins });
  });
});

describe('Jeton Noktası', () => {
  test('yalnız yönetici açar: kullanıcı ve moderatör 403, yetkili hesap banka olamaz, günlükte kayıt', async () => {
    const admin = await staff('admin');
    const mod = await staff('moderator');
    const u = await signUp('Aday');
    for (const s of [u.session, mod.session]) assert.equal((await call('POST', '/api/admin/jeton/bank', { user: u.user.id, enabled: true }, s))[0], 403);
    assert.equal((await call('POST', '/api/admin/jeton/bank', { user: mod.user.id, enabled: true }, admin.session))[0], 404, 'moderatör banka yapılamaz');
    assert.equal((await call('POST', '/api/admin/jeton/bank', { user: u.user.id, enabled: 'evet' }, admin.session))[0], 400);
    assert.equal((await ok(call('POST', '/api/admin/jeton/bank', { user: u.user.id, enabled: true }, admin.session))).role, 'coins_bank');
    const { banks } = await ok(call('GET', '/api/jeton/banks', null, mod.session));
    assert.ok(banks.some((b) => b.id === u.user.id));
    const ev = await h.sql.query("SELECT actor, ip FROM audit_events WHERE action = 'jeton.bank.on' AND target = $1", [u.user.id]);
    assert.equal(ev.rows[0].actor, admin.user.id);
    assert.ok(ev.rows[0].ip, 'IP kaydedilir');
    await ok(call('POST', '/api/admin/jeton/bank', { user: u.user.id, enabled: false }, admin.session));
    assert.equal((await me(u.session)).role, 'user', 'kapatınca normal hesaba döner');
    assert.equal((await h.sql.query("SELECT count(*)::int AS n FROM audit_events WHERE action LIKE 'jeton.bank.%' AND target = $1", [u.user.id])).rows[0].n, 2);
  });

  test('toptan alım: dekont zorunlu, parti toptan, fiyat sunucuda, tek kez', async () => {
    const admin = await staff('admin');
    const bank = await bankOf(admin);
    const plain = await signUp('Banka değil');
    assert.equal((await call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 1000, ref: rnd(6) }, admin.session))[0], 400, 'dekont yok');
    assert.equal((await wholesale(admin, plain, 1000))[0], 404);
    assert.equal((await wholesale(bank, bank, 1000))[0], 403, 'banka kendine yükleyemez');
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => wholesale(admin, bank, 1_000_000, ref)));
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.deepEqual(both.map(([, j]) => j.replay).sort(), [false, true]);
    assert.equal((await me(bank.session)).coins, 1_000_000);
    const t = both[0][1].transfer;
    assert.deepEqual([t.kind, t.from, t.to.id, t.coins, t.valueTl, t.actor], ['wholesale', null, bank.user.id, 1_000_000, wholesaleTl(1_000_000), admin.user.id]);
    assert.equal(t.valueTl, 23127.99);
    assert.match(t.paymentRef, /^DEKONT-/);
    assert.deepEqual((await coinLots(bank.session)).channels, [{ channel: 'toptan', label: 'Toptan alım', remaining: 1_000_000 }]);
    const other = await bankOf(admin, 'Başka banka');
    assert.equal((await wholesale(admin, other, 500, ref))[0], 409, 'aynı istek kimliği başka bankaya kullanılamaz');
    assert.equal((await h.sql.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'jeton.wholesale' AND target = $1", [bank.user.id])).rows[0].n, 1);
  });

  test('satış: alıcıya Jeton Noktası partisi, 1 gün kilit, tek kez, iki tarafta kayıt', async () => {
    const admin = await staff('admin');
    const bank = await bankOf(admin);
    await ok(wholesale(admin, bank, 100_000));
    const buyer = await signUp('Müşteri');
    const host = await signUp('Yayıncı');
    assert.equal((await transfer(buyer, host, 10))[0], 403, 'yalnız Jeton Noktası aktarır');
    assert.equal((await transfer(bank, bank, 10))[0], 400);
    assert.equal((await transfer(bank, buyer, 100_001))[0], 409);
    assert.equal((await me(bank.session)).coins, 100_000, 'reddedilen aktarım bakiyeye dokunmaz');

    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => transfer(bank, buyer, 10_000, ref)));
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.deepEqual([(await me(bank.session)).coins, (await me(buyer.session)).coins], [90_000, 10_000]);
    const t = both[0][1].transfer;
    assert.deepEqual([t.kind, t.from.id, t.to.id, t.coins, t.paymentRef, t.actor], ['bank_sale', bank.user.id, buyer.user.id, 10_000, 'HAVALE-1', bank.user.id]);
    const seen = await ok(call('GET', '/api/jeton/transfers', null, buyer.session));
    assert.equal(seen.rows[0].id, t.id);
    const [, ledger] = await call('GET', '/api/ledger', null, buyer.session);
    assert.deepEqual([ledger.rows[0].channel, ledger.rows[0].counterparty, ledger.rows[0].detail.transfer], ['jeton_noktasi', bank.user.id, t.id]);
    const actor = await h.sql.query('SELECT actor FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [buyer.user.id]);
    assert.equal(actor.rows[0].actor, bank.user.id, 'yükleyen kayıtlı');

    assert.equal((await gift(buyer.session, host, 5000))[0], 200);
    const e = await earnings(host.session);
    assert.deepEqual(byDays(e.locks), { 1: 5000 });
    assert.equal(e.locks[0].channelLabel, 'Jeton Noktası');
  });

  test('kilit mirası: bankanın mağazadan aldığı jeton 7 gün kilitle geçer', async () => {
    const admin = await staff('admin');
    const bank = await bankOf(admin);
    await buy(bank.session, 'coins_1000');
    const buyer = await signUp('Müşteri');
    const host = await signUp('Yayıncı');
    await ok(transfer(bank, buyer, 1500));
    const w = await coinLots(buyer.session);
    assert.ok(w.lots.every((l) => l.channel === 'jeton_noktasi' && l.lockDays === 7 && l.from.id === bank.user.id));
    assert.equal((await gift(buyer.session, host, 1500))[0], 200);
    assert.deepEqual(byDays((await earnings(host.session)).locks), { 7: 1500 });
  });

  test('harcama sırası: önce mağaza jetonu, sonra Jeton Noktası jetonu', async () => {
    const admin = await staff('admin');
    const bank = await bankOf(admin);
    await ok(wholesale(admin, bank, 10_000));
    const u = await signUp('Karışık');
    const host = await signUp('Yayıncı');
    await ok(transfer(bank, u, 5000));
    await buy(u.session, 'coins_1000');
    assert.equal((await gift(u.session, host, 2500))[0], 200);
    assert.deepEqual(byDays((await earnings(host.session)).locks), { 7: 2000, 1: 500 });
    const [, ledger] = await call('GET', '/api/ledger', null, u.session);
    assert.deepEqual(ledger.rows[0].detail.lots.map((l) => l.channel), ['test', 'bonus', 'jeton_noktasi']);
  });

  test('anında bozdur: kilitli elmas satılamaz; banka değer + %3 jeton alır, ev sahibine TL borçlanır', async () => {
    const admin = await staff('admin');
    const bank = await bankOf(admin);
    const fan = await signUp('Hayran');
    const host = await signUp('Yayıncı');
    await buy(fan.session, 'coins_5000');
    assert.equal((await gift(fan.session, host, 5000))[0], 200);
    const sell = (to, diamonds, ref = rnd(6)) => call('POST', '/api/jeton/sell-diamonds', { bank: to.user.id, diamonds, ref }, host.session);
    assert.equal((await sell(bank, 1000))[0], 409, 'kilitli');
    await unlock(host);
    assert.equal((await sell(fan, 1000))[0], 404, 'banka değil');
    assert.equal((await sell(bank, 99))[0], 400);
    const out = await ok(sell(bank, 1000));
    assert.equal(out.user.diamonds, 4000);
    assert.equal((await me(bank.session)).coins, bankExchangeCoins(1000));
    const t = out.transfer;
    assert.deepEqual([t.kind, t.from.id, t.to.id, t.diamonds, t.coins, t.valueTl], ['diamond_sale', host.user.id, bank.user.id, 1000, bankExchangeCoins(1000), diamondValueTl(1000)]);
    assert.equal(t.valueTl, 9.96);
    assert.deepEqual((await coinLots(bank.session)).lots.map((l) => [l.channel, l.from.id]), [['bozdurma', host.user.id]]);
  });
});

describe('İade', () => {
  test('harcanmamış jeton ve kilitli elmas geri alınır, açılmış elmas raporlanır, ikinci iade 409', async () => {
    const admin = await staff('admin');
    const mod = await staff('moderator');
    const buyer = await signUp('İadeci');
    const h1 = await signUp('Yayıncı 1');
    const h2 = await signUp('Yayıncı 2');
    await buy(buyer.session, 'coins_5000');
    assert.equal((await gift(buyer.session, h1, 2000))[0], 200);
    assert.equal((await gift(buyer.session, h2, 1000))[0], 200);
    await unlock(h2);
    const p = (await h.sql.query('SELECT id FROM purchases WHERE user_id = $1', [buyer.user.id])).rows[0];
    const refund = (s) => call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, s);
    for (const s of [buyer.session, mod.session]) assert.equal((await refund(s))[0], 403);
    assert.deepEqual(await ok(refund(admin.session)), { coins: 4500, diamonds: 2000, unrecoveredDiamonds: 1000 });
    assert.equal((await me(buyer.session)).coins, 0);
    assert.equal((await me(h1.session)).diamonds, 0);
    assert.equal((await me(h2.session)).diamonds, 1000, 'kilidi açılmış elmas yerinde kalır');
    assert.equal((await earnings(h1.session)).locked, 0);
    assert.equal((await refund(admin.session))[0], 409);
    const u = (await h.sql.query('SELECT svip_xp FROM users WHERE id = $1', [buyer.user.id])).rows[0];
    assert.equal(Number(u.svip_xp), 0);
    const st = (await h.sql.query('SELECT status FROM purchases WHERE id = $1', [p.id])).rows[0];
    assert.equal(st.status, 'refunded');
    const rows = await h.sql.query("SELECT actor FROM ledger WHERE user_id = $1 AND reason LIKE 'İade%'", [buyer.user.id]);
    assert.ok(rows.rowCount >= 1 && rows.rows.every((r) => r.actor === admin.user.id));
    const ev = await h.sql.query("SELECT detail FROM audit_events WHERE action = 'purchase.refund' AND target = $1", [buyer.user.id]);
    assert.deepEqual([ev.rows[0].detail.coins, ev.rows[0].detail.unrecoveredDiamonds], [4500, 1000]);
  });

  test('iade Jeton Noktası üzerinden geçen jetonu da izler', async () => {
    const admin = await staff('admin');
    const bank = await bankOf(admin);
    const buyer = await signUp('Müşteri');
    const host = await signUp('Yayıncı');
    await buy(bank.session, 'coins_1000');
    await ok(transfer(bank, buyer, 1500));
    assert.equal((await gift(buyer.session, host, 1000))[0], 200);
    const p = (await h.sql.query('SELECT id FROM purchases WHERE user_id = $1', [bank.user.id])).rows[0];
    assert.deepEqual(await ok(call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session)), { coins: 1000, diamonds: 1000, unrecoveredDiamonds: 0 });
    assert.deepEqual([(await me(bank.session)).coins, (await me(buyer.session)).coins, (await me(host.session)).diamonds], [0, 0, 0]);
  });
});

describe('Kayıtlar', () => {
  test('defter, aktarımlar ve yönetici günlüğü değiştirilemez, silinemez', async () => {
    for (const sql of ['UPDATE ledger SET amount = 1', 'DELETE FROM ledger', 'TRUNCATE ledger', 'UPDATE coin_transfers SET coins = 1', 'DELETE FROM coin_transfers', 'DELETE FROM audit_events', 'TRUNCATE audit_events']) {
      await assert.rejects(h.sql.query(sql), /değiştirilemez ve silinemez/, sql);
    }
  });

  test('denetim görünümü: bir hesabın tüm para kaydı, yalnız yönetici', async () => {
    const admin = await staff('admin');
    const mod = await staff('moderator');
    const bank = await bankOf(admin);
    await ok(wholesale(admin, bank, 20_000));
    const u = await signUp('İncelenen');
    const host = await signUp('Yayıncı');
    await buy(u.session, 'coins_1000');
    await ok(transfer(bank, u, 3000));
    assert.equal((await gift(u.session, host, 2500))[0], 200);
    const view = (who, s) => call('GET', `/api/admin/wallet/audit?user=${who.user.id}`, null, s);
    for (const s of [u.session, mod.session]) assert.equal((await view(u, s))[0], 403);
    const a = await ok(view(u, admin.session));
    assert.equal(a.user.coins, 2500);
    assert.equal(a.user.coinsInLots, a.user.coins);
    assert.equal(a.purchases.length, 1);
    assert.deepEqual(a.lots.map((l) => l.channel).sort(), ['bonus', 'jeton_noktasi', 'test']);
    assert.equal(a.transfers[0].kind, 'bank_sale');
    assert.ok(a.ledger.length >= 3);
    const hv = await ok(view(host, admin.session));
    assert.deepEqual([hv.user.diamonds, hv.user.locked, hv.user.withdrawable], [2500, 2500, 0]);
    assert.equal(hv.locks.reduce((s, l) => s + l.amount, 0), 2500);
    const bv = await ok(view(bank, admin.session));
    assert.ok(bv.events.some((e) => e.action === 'jeton.wholesale'));
  });

  test('test satın alması ve test yüklemesi aynı günlük sınırı paylaşır (hediye dahil)', async () => {
    const u = await signUp('Sınır');
    for (let i = 0; i < 4; i++) await ok(call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: rnd(6) }, u.session));
    const [st, j] = await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_20000', transactionId: rnd(8) }, u.session);
    assert.equal(st, 429, '40.000 + 20.000 > 50.000');
    assert.match(j.error, /Günlük test yüklemesi sınırı 50000/);
    // 5.000 + its 2.500 first-purchase gift = 47.500.
    await buy(u.session, 'coins_5000');
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, u.session))[0], 429, 'satın alma sınıra sayıldı');
    assert.equal((await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_5000', transactionId: rnd(8) }, u.session))[0], 429);
    assert.equal((await me(u.session)).coins, 47_500);
  });

  test('her hesabın partileri bakiyesine eşit', async () => {
    const r = await h.sql.query(
      `SELECT u.id, u.coins, coalesce(l.s, 0) AS lots FROM users u LEFT JOIN (SELECT user_id, sum(remaining) AS s FROM coin_lots GROUP BY 1) l ON l.user_id = u.id WHERE u.coins <> coalesce(l.s, 0)`,
    );
    assert.deepEqual(r.rows, []);
  });
});
