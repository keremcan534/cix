// Ekonomi Adım 1 (economy.mjs, migration 020) against a real Postgres: one charge per buy, refusals that change
// nothing, timed terms that stack, noble rank, equip and looks, reward coins kept to the shop, refunds, the old-app
// bridge, the staff routes and the off switch. Special IDs on sale are in economy-special.test.mjs (its own API with
// SHOP_SPECIAL_IDS=1). Time travel moves rows back with the guard trigger off for one connection.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { SVIP_XP } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ TEST_TOPUP_DAILY: '10000000', LIVE_POLL_MS: '200', AGENCY_JOBS: '0' });
const { call, signUp } = h;
const DAY = 864e5;

const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const buy = (s, sku, price, ref = rnd(6)) => call('POST', '/api/shop/buy', { sku, price, ref }, s);
const spend = (s, amount, reason, ref = rnd(6)) => call('POST', '/api/wallet/spend', { amount, reason, ref }, s);
const economy = (s) => ok(call('GET', '/api/economy', null, s));
const equip = (s, slot, sku) => call('POST', '/api/shop/equip', { slot, sku }, s);
const looks = async (s, ...ids) => (await ok(call('GET', `/api/looks?ids=${ids.join(',')}`, null, s))).looks;
const coins = async (u) => Number((await q('SELECT coins FROM users WHERE id = $1', [u.user.id]))[0].coins);
const rows = (u) => q('SELECT * FROM entitlements WHERE user_id = $1 ORDER BY id', [u.user.id]);
const rewardLeft = async (u) => Number((await q("SELECT coalesce(sum(remaining), 0) AS n FROM coin_lots WHERE user_id = $1 AND channel = 'odul'", [u.user.id]))[0].n);
const daysUntil = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / DAY);

/** Coins straight into the account as one lot ('test' = bought, 'odul' = reward coins; reward coins have no credit route yet). */
async function credit(u, amount, channel = 'test') {
  await h.sql.query('INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, $2, $3, $3, 0, $4)', [u.user.id, channel, amount, `t-${rnd(6)}`]);
  await h.sql.query('UPDATE users SET coins = coins + $2 WHERE id = $1', [u.user.id, amount]);
}
async function person(name, amount = 0, channel = 'test') {
  const u = await signUp(name);
  if (amount) await credit(u, amount, channel);
  return u;
}
/** Moves the person's entitlement rows `days` back in time (the guard trigger allows only revokes, so it is off here). */
async function travel(u, days, extra = '') {
  const c = await h.sql.connect();
  try {
    await c.query('SET session_replication_role = replica');
    await c.query(
      `UPDATE entitlements SET starts_at = starts_at - make_interval(days => $2), ends_at = ends_at - make_interval(days => $2),
              created_at = created_at - make_interval(days => $2) WHERE user_id = $1 ${extra}`,
      [u.user.id, days],
    );
  } finally {
    await c.query('SET session_replication_role = DEFAULT');
    c.release();
  }
}
async function insertRow(u, sku, kind, startDays, endDays, tier = null) {
  await h.sql.query(
    `INSERT INTO entitlements (user_id, sku, kind, tier, price, starts_at, ends_at, source, ref)
     VALUES ($1, $2, $3, $4, 0, now() + make_interval(days => $5), now() + make_interval(days => $6), 'admin', $7)`,
    [u.user.id, sku, kind, tier, startDays, endDays, `admin:${rnd(6)}`],
  );
}

let admin;
const SETTINGS = '/api/admin/live-settings';
async function setLive(changes) {
  const view = await ok(call('GET', SETTINGS, null, admin.session));
  return ok(call('POST', SETTINGS, { changes, reason: 'Ekonomi testi', baseV: view.v, confirm: true }, admin.session));
}

describe('Mağaza alımı', () => {
  test('yetersiz jeton: 409, kayıt yok, defter satırı yok, bakiye yerinde', async () => {
    admin = await h.account('Yönetici', 'admin');
    const u = await person('Az Jetonlu', 100);
    const ref = rnd(6);
    const [st, j] = await buy(u.session, 'fr-neon', 150, ref);
    assert.equal(st, 409);
    assert.equal(j.code, 'insufficient');
    assert.equal((await rows(u)).length, 0);
    assert.equal((await q('SELECT 1 FROM ledger WHERE user_id = $1 AND ref = $2', [u.user.id, ref])).length, 0);
    assert.equal(await coins(u), 100);
  });

  test('aynı istek iki kez aynı anda: tek ödeme, tek kayıt, ikincisi tekrar', async () => {
    const u = await person('Çift Dokunan', 1000);
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => ok(buy(u.session, 'fr-neon', 150, ref))));
    assert.deepEqual(both.map((x) => x.replay).sort(), [false, true]);
    assert.equal(await coins(u), 850);
    assert.equal((await rows(u)).length, 1);
    assert.ok(both.every((x) => x.economy.items.some((i) => i.sku === 'fr-neon')));
  });

  test('aynı kalıcı ürün iki ayrı istekle aynı anda: tek ödeme, diğeri "owned"', async () => {
    const u = await person('Hızlı Alıcı', 1000);
    const both = await Promise.all([1, 2].map(() => buy(u.session, 'pack-fun', 50)));
    assert.deepEqual(both.map(([st]) => st).sort(), [200, 409]);
    assert.equal(both.find(([st]) => st === 409)[1].code, 'owned');
    assert.equal(await coins(u), 950);
    assert.equal((await rows(u)).length, 1);
  });

  test('fiyat: düşük gösterilen fiyat "price_changed", yüksek gösterilen sunucu fiyatını öder', async () => {
    const u = await person('Fiyat Bakan', 1000);
    const [st, j] = await buy(u.session, 'fr-neon', 100);
    assert.deepEqual([st, j.code, j.price], [409, 'price_changed', 150]);
    assert.equal(await coins(u), 1000);
    await ok(buy(u.session, 'fr-neon', 9999));
    assert.equal(await coins(u), 850);
    assert.equal(Number((await rows(u))[0].price), 150);
  });

  test('minVip: önce 403, yeterli SVIP ile alınır', async () => {
    const u = await person('VIP Aday', 5000);
    const [st, j] = await buy(u.session, 'fr-gold', 2500);
    assert.deepEqual([st, j.code], [403, 'vip_required']);
    assert.equal(await coins(u), 5000);
    await h.sql.query('UPDATE users SET svip_xp = $2 WHERE id = $1', [u.user.id, SVIP_XP[3]]);
    await ok(buy(u.session, 'fr-gold', 2500));
    assert.equal(await coins(u), 2500);
  });

  test('süreli ürün yeniden alınınca uzar; 365 günden ileri "too_far"', async () => {
    const u = await person('Uzatan', 1000);
    await ok(buy(u.session, 'fr-neon', 150));
    const e = (await ok(buy(u.session, 'fr-neon', 150))).economy;
    assert.equal(daysUntil(e.items.find((x) => x.sku === 'fr-neon').until), 14);
    const v = await person('Çok Uzatan', 1000);
    await ok(call('POST', '/api/admin/economy/grant', { userId: v.user.id, sku: 'fr-neon', days: 360, reason: 'Destek testi', ref: rnd(6) }, admin.session));
    const [st, j] = await buy(v.session, 'fr-neon', 150);
    assert.deepEqual([st, j.code], [409, 'too_far']);
    assert.equal(await coins(v), 1000);
  });

  test('ref sütunu olmayan benzersiz dizin çakışması 409 olur, adı _ref_key ile bitse de "tekrar" sayılmaz', async () => {
    const u = await person('Çakışan', 1000);
    // Named like agency_payouts_payment_ref_key: the name alone must not make it a replay.
    await h.sql.query(`CREATE UNIQUE INDEX test_sparkle_ref_key ON ledger (user_id) WHERE reason LIKE 'Mağaza: Işıltı%'`);
    try {
      await ok(buy(u.session, 'en-sparkle', 200));
      const [st, j] = await buy(u.session, 'en-sparkle', 200);
      assert.equal(st, 409, j.error);
      assert.match(j.error, /çakıştı/, 'gerçek çakışma, tekrar değil');
      assert.equal(await coins(u), 800);
      assert.equal((await rows(u)).length, 1);
    } finally {
      await h.sql.query('DROP INDEX test_sparkle_ref_key');
    }
  });

  test('başka işte kullanılmış ref ile alım 409', async () => {
    const u = await person('Ref Paylaşan', 1000);
    const to = await signUp('Alan');
    const ref = rnd(6);
    await ok(call('POST', '/api/wallet/gift', { to: to.user.id, amount: 100, ref }, u.session));
    const [st] = await buy(u.session, 'fr-neon', 150, ref);
    assert.equal(st, 409);
    assert.equal((await rows(u)).length, 0);
  });

  test('özel numara satışta değil (SHOP_SPECIAL_IDS yok): alım 400, eski uygulama "update_required", ücret yok', async () => {
    const u = await person('Numara İsteyen', 5000);
    assert.equal((await buy(u.session, 'id-1001', 2000))[0], 400);
    const [st, j] = await spend(u.session, 2000, 'Mağaza: ID 1001');
    assert.deepEqual([st, j.code], [409, 'update_required']);
    assert.equal(await coins(u), 5000);
    const e = await economy(u.session);
    assert.ok(!e.shop.some((x) => x.kind === 'specialId'));
    assert.ok(e.shop.some((x) => x.sku === 'fr-neon'));
  });

  test('recent: alım 10 dakika listede kalır, sonra düşer', async () => {
    const u = await person('Yeni Alan', 1000);
    await ok(buy(u.session, 'bb-candy', 120));
    assert.deepEqual((await economy(u.session)).recent.map((x) => x.sku), ['bb-candy']);
    const c = await h.sql.connect();
    try {
      await c.query('SET session_replication_role = replica');
      await c.query("UPDATE entitlements SET created_at = created_at - interval '11 minutes' WHERE user_id = $1", [u.user.id]);
    } finally {
      await c.query('SET session_replication_role = DEFAULT');
      c.release();
    }
    assert.deepEqual((await economy(u.session)).recent, []);
  });
});

describe('Rütbe', () => {
  test('2 sonra 3 birlikte işler; vipLevel = max(SVIP, kademe × 3)', async () => {
    const u = await person('Kaptan Adayı', 210_000);
    await ok(buy(u.session, 'noble-2', 60_000));
    const e = (await ok(buy(u.session, 'noble-3', 150_000))).economy;
    assert.equal(e.noble.tier, 3);
    assert.equal(e.vipLevel, 9);
    assert.deepEqual(e.items.filter((x) => x.kind === 'noble').map((x) => x.sku).sort(), ['noble-2', 'noble-3']);
    await h.sql.query('UPDATE users SET svip_xp = $2 WHERE id = $1', [u.user.id, SVIP_XP[9]]);
    assert.equal((await economy(u.session)).vipLevel, 10);
  });

  test('3 sonra 2: "higher_rank", ücret yok; 2 sonra 2 uzar', async () => {
    const u = await person('Yüksek Rütbe', 210_000);
    await ok(buy(u.session, 'noble-3', 150_000));
    const [st, j] = await buy(u.session, 'noble-2', 60_000);
    assert.deepEqual([st, j.code], [409, 'higher_rank']);
    assert.equal(await coins(u), 60_000);
    const v = await person('Uzatan Rütbe', 120_000);
    await ok(buy(v.session, 'noble-2', 60_000));
    const e = (await ok(buy(v.session, 'noble-2', 60_000))).economy;
    assert.equal(daysUntil(e.noble.until), 60);
  });

  test('süresi bitmiş rütbe sayılmaz', async () => {
    const u = await person('Eski Gemici');
    await insertRow(u, 'noble-1', 'noble', -40, -10, 1);
    const e = await economy(u.session);
    assert.equal(e.noble, null);
    assert.equal(e.vipLevel, 0);
    assert.equal((await looks(u.session, u.user.id))[u.user.id].noble, null);
  });
});

describe('Giyme ve görünüm', () => {
  test('sahip olunmayan veya süresi bitmiş ürün 403; ücretsiz mikrofon efekti olur; geçersiz yuva 400', async () => {
    const u = await person('Giyinen', 1000);
    assert.equal((await equip(u.session, 'frame', 'fr-silver'))[0], 403);
    await insertRow(u, 'fr-silver', 'frame', -40, -10);
    assert.equal((await equip(u.session, 'frame', 'fr-silver'))[0], 403);
    assert.equal((await equip(u.session, 'yok', 'fr-silver'))[0], 400);
    assert.equal((await ok(equip(u.session, 'micfx', 'an-mic-wave'))).economy.equipped.micfx, 'an-mic-wave');
    assert.equal((await ok(equip(u.session, 'micfx', null))).economy.equipped.micfx, undefined);
  });

  test('süresi biten giyili ürün görünümden düşer', async () => {
    const u = await person('Süresi Biten', 1000);
    const e = (await ok(buy(u.session, 'fr-neon', 150))).economy;
    assert.equal(e.equipped.frame, 'fr-neon', 'alınınca giyilir');
    assert.equal((await looks(u.session, u.user.id))[u.user.id].frame, 'fr-neon');
    await travel(u, 8);
    assert.equal((await looks(u.session, u.user.id))[u.user.id].frame, null);
    assert.equal((await economy(u.session)).equipped.frame, undefined);
  });

  test('iadeyle oluşan boşluk: ortadaki dönem geri alınınca boşlukta çerçeve yok, üçüncü dönemde yine var', async () => {
    const u = await person('Boşluklu', 1000);
    for (let i = 0; i < 3; i++) await ok(buy(u.session, 'fr-neon', 150));
    const middle = (await rows(u))[1];
    await ok(call('POST', '/api/admin/economy/revoke', { id: Number(middle.id), reason: 'Boşluk testi' }, admin.session));
    assert.equal(daysUntil((await economy(u.session)).items.find((x) => x.sku === 'fr-neon').until), 7);
    await travel(u, 8);
    assert.ok(!(await economy(u.session)).items.some((x) => x.sku === 'fr-neon'));
    assert.equal((await equip(u.session, 'frame', 'fr-neon'))[0], 403);
    assert.equal((await looks(u.session, u.user.id))[u.user.id].frame, null);
    await travel(u, 7);
    const e = await economy(u.session);
    assert.equal(daysUntil(e.items.find((x) => x.sku === 'fr-neon').until), 6);
    assert.equal((await looks(u.session, u.user.id))[u.user.id].frame, 'fr-neon');
  });

  test('ikinci oturum aynı ürünleri görür; başkası /api/looks ve /api/user ile görünümü görür', async () => {
    const u = await person('İki Cihazlı', 1000);
    await ok(buy(u.session, 'en-sparkle', 200));
    const again = await ok(call('POST', '/api/auth/dev', { deviceKey: u.deviceKey, name: u.user.name }));
    assert.equal(again.user.id, u.user.id);
    assert.notEqual(again.session, u.session);
    assert.ok((await economy(again.session)).items.some((x) => x.sku === 'en-sparkle'));
    const other = await signUp('Bakan');
    assert.equal((await looks(other.session, u.user.id))[u.user.id].entry, 'en-sparkle');
    const [, prof] = await call('GET', `/api/user?id=${u.user.id}`, null, other.session);
    assert.equal(prof.looks.entry, 'en-sparkle');
    assert.equal((await call('GET', '/api/looks?ids=bozuk', null, other.session))[0], 400);
  });
});

describe('Ödül jetonları sadece mağazada', () => {
  test('yalnız ödül jetonu: hediye, bağ, Jeton Noktası ve çark "reward_coins_only"; mağaza alımı olur', async () => {
    const u = await person('Ödüllü', 5000, 'odul');
    const to = await signUp('Hediye Alan');
    const gift = await call('POST', '/api/wallet/gift', { to: to.user.id, amount: 100, ref: rnd(6) }, u.session);
    const bond = await call('POST', '/api/bonds/request', { to: to.user.id, kind: 'kanka', ref: rnd(6) }, u.session);
    for (const [st, j] of [gift, bond]) assert.deepEqual([st, j.code], [409, 'reward_coins_only']);
    const bank = await h.account('Ödüllü Banka', 'coins_bank');
    await credit(bank, 5000, 'odul');
    const [st, j] = await call('POST', '/api/jeton/transfer', { to: to.user.id, coins: 1000, paymentRef: 'HAVALE-1', ref: rnd(6) }, bank.session);
    assert.deepEqual([st, j.code], [409, 'reward_coins_only']);
    // The wheel needs Cömertlik Lv.2 first: 150 bought coins spent in the shop, then only reward coins left.
    const p = await person('Çarkçı', 150);
    await ok(buy(p.session, 'fr-neon', 150));
    await credit(p, 5000, 'odul');
    const [ws, wj] = await call('POST', '/api/wheel/spin', { tier: 'kiyi', count: 1, ref: rnd(8) }, p.session);
    assert.deepEqual([ws, wj.code], [409, 'reward_coins_only']);
    assert.deepEqual([await coins(u), await coins(bank), await coins(p)], [5000, 5000, 5000]);
    await ok(buy(u.session, 'fr-silver', 800));
    assert.equal(await rewardLeft(u), 4200);
    assert.equal((await economy(u.session)).rewardCoins, 4200);
  });

  test('Cömertlik: ödül jetonu kısmı ve iade edilen alımın jetonları sayılmaz; çark 403', async () => {
    const r = await person('Ödülle Alan', 100, 'odul');
    await ok(buy(r.session, 'pack-fun', 50));
    assert.equal((await economy(r.session)).wealthXp, 0);

    const u = await signUp('İade Eden');
    await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, u.session));
    await ok(buy(u.session, 'pack-fun', 50));
    assert.equal((await economy(u.session)).wealthXp, 50);
    const p = (await q('SELECT id FROM purchases WHERE user_id = $1', [u.user.id]))[0];
    await ok(call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session));
    assert.equal((await economy(u.session)).wealthXp, 0);
    await credit(u, 1000);
    assert.equal((await call('POST', '/api/wheel/spin', { tier: 'kiyi', count: 1, ref: rnd(8) }, u.session))[0], 403);
  });
});

describe('İade', () => {
  test('iade izi işaretlenir, alıcının ürünü geri alınır, bankadan alan müşterinin ürünü incelemeye düşer', async () => {
    const bank = await h.account('İade Bankası', 'coins_bank');
    const customer = await signUp('Banka Müşterisi');
    await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, bank.session));
    await ok(call('POST', '/api/jeton/transfer', { to: customer.user.id, coins: 1500, paymentRef: 'HAVALE-1', ref: rnd(6) }, bank.session));
    await ok(buy(customer.session, 'fr-silver', 800));
    await ok(buy(bank.session, 'en-sparkle', 200));
    const p = (await q('SELECT id FROM purchases WHERE user_id = $1', [bank.user.id]))[0];
    await ok(call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session));

    const trail = await q('SELECT id, user_id, refunded_by FROM coin_lots WHERE user_id = ANY($1::uuid[]) ORDER BY id', [[bank.user.id, customer.user.id]]);
    assert.ok(trail.length >= 3 && trail.every((l) => Number(l.refunded_by) === Number(p.id)), JSON.stringify(trail));
    const [b] = await rows(bank);
    assert.deepEqual([b.sku, b.revoked_why], ['en-sparkle', 'iade']);
    const [c] = await rows(customer);
    assert.deepEqual([c.sku, c.revoked_at], ['fr-silver', null]);
    const [rev] = await q("SELECT detail FROM audit_events WHERE action = 'economy.refund_review' AND target = $1", [customer.user.id]);
    assert.deepEqual([rev.detail.sku, rev.detail.purchase, rev.detail.entitlement], ['fr-silver', Number(p.id), Number(c.id)]);
    const [ev] = await q("SELECT detail FROM audit_events WHERE action = 'purchase.refund' AND target = $1", [bank.user.id]);
    assert.deepEqual([ev.detail.revokedItems, ev.detail.reviewItems], [1, 1]);

    const list = await ok(call('GET', '/api/admin/economy/reviews', null, admin.session));
    const row = list.rows.find((x) => x.user.id === customer.user.id);
    assert.deepEqual([row.purchase, row.item.sku, row.item.state], [Number(p.id), 'fr-silver', 'live']);
    const view = await ok(call('GET', `/api/admin/economy/user?id=${customer.user.id}`, null, admin.session));
    assert.equal(view.reviews.length, 1);

    // Migration 020 fills refunded_by for refunds made before it: clear the marks, run its fill again.
    await h.sql.query('UPDATE coin_lots SET refunded_by = NULL WHERE id = ANY($1::bigint[])', [trail.map((l) => l.id)]);
    const file = fs.readFileSync(path.join(import.meta.dirname, '..', 'migrations', '020_economy.sql'), 'utf8');
    const fill = file.slice(file.indexOf('WITH RECURSIVE'), file.indexOf(';', file.indexOf('WITH RECURSIVE')));
    await h.sql.query(fill);
    const again = await q('SELECT refunded_by FROM coin_lots WHERE id = ANY($1::bigint[])', [trail.map((l) => l.id)]);
    assert.ok(again.every((l) => Number(l.refunded_by) === Number(p.id)));
  });
});

describe('Eski uygulama köprüsü (/api/wallet/spend)', () => {
  test('dört etiket sunucuda ürün verir; yanıt bugünkü biçimde', async () => {
    const u = await person('Eski Uygulama', 20_000);
    // "Ses Dalgası" and "Melek Kalp · Mercan" are the frames' names before the rename (Ses Halkası, Melek Kalp · Pembe).
    for (const [reason, amount, sku] of [
      ['Mağaza: Ses Dalgası', 150, 'fr-neon'],
      ['Mağaza: Melek Kalp · Mercan (30 gün)', 3_000, 'fr-wing-coral'],
      ['Çıkartma paketi: Eğlence', 50, 'pack-fun'],
      ['Mikrofon efekti: Neon Halka', 500, 'an-mic-neon'],
      ['Rütbe: Gemici (30 gün)', 15_000, 'noble-1'],
    ]) {
      const j = await ok(spend(u.session, amount, reason));
      assert.deepEqual(Object.keys(j).sort(), ['replay', 'user']);
      assert.equal(j.replay, false);
      assert.equal(typeof j.user.coins, 'number');
      assert.ok((await rows(u)).some((x) => x.sku === sku && x.source === 'bridge'), sku);
    }
    assert.equal(await coins(u), 20_000 - 150 - 3_000 - 50 - 500 - 15_000);
  });

  test('düşük tutar ve "Hediye:" nedeni "update_required", ücret yok; ret gövdesi { error, code }', async () => {
    const u = await person('Eski Hediye', 1000);
    for (const [amount, reason] of [[100, 'Mağaza: Ses Dalgası'], [100, 'Hediye: Gül'], [100, 'Mağaza: Olmayan Ürün']]) {
      const [st, j] = await spend(u.session, amount, reason);
      assert.equal(st, 409);
      assert.deepEqual(Object.keys(j).sort(), ['code', 'error']);
      assert.equal(j.code, 'update_required');
    }
    assert.equal(await coins(u), 1000);
    assert.equal((await rows(u)).length, 0);
  });

  test('ödül ve satın alınmış jeton birlikteyken mağaza önce ödül jetonunu harcar', async () => {
    const u = await person('Karışık', 1000);
    await credit(u, 100, 'odul');
    await ok(spend(u.session, 150, 'Mağaza: Ses Dalgası'));
    assert.equal(await rewardLeft(u), 0);
    assert.equal(await coins(u), 950);
    const [l] = await q("SELECT detail FROM ledger WHERE user_id = $1 AND reason LIKE 'Mağaza:%'", [u.user.id]);
    assert.deepEqual(l.detail.lots.map((x) => [x.channel, x.amount]), [['odul', 100], ['test', 50]]);
  });
});

describe('Yönetici araçları', () => {
  test('görüntüleme, verme, geri alma; denetim kayıtları; yönetici olmayana 403', async () => {
    const u = await person('Destek Alan');
    const ref = rnd(6);
    const g = await ok(call('POST', '/api/admin/economy/grant', { userId: u.user.id, sku: 'fr-silver', days: 10, reason: 'Kayıp alım', ref }, admin.session));
    assert.deepEqual([g.replay, g.item.sku, g.item.price, g.item.source, g.item.state], [false, 'fr-silver', 0, 'admin', 'live']);
    assert.equal((await ok(call('POST', '/api/admin/economy/grant', { userId: u.user.id, sku: 'fr-silver', days: 10, reason: 'Kayıp alım', ref }, admin.session))).replay, true);
    assert.equal(daysUntil((await economy(u.session)).items.find((x) => x.sku === 'fr-silver').until), 10);
    const [grantAudit] = await q("SELECT actor, detail FROM audit_events WHERE action = 'economy.grant' AND target = $1", [u.user.id]);
    assert.deepEqual([grantAudit.actor, grantAudit.detail.reason], [admin.user.id, 'Kayıp alım']);

    const r = await ok(call('POST', '/api/admin/economy/revoke', { id: g.item.id, reason: 'Yanlış verildi' }, admin.session));
    assert.deepEqual([r.item.state, r.item.revokedWhy], ['revoked', 'destek']);
    assert.equal((await call('POST', '/api/admin/economy/revoke', { id: g.item.id, reason: 'Yanlış verildi' }, admin.session))[0], 409);
    assert.equal((await q("SELECT 1 FROM audit_events WHERE action = 'economy.revoke' AND target = $1", [u.user.id])).length, 1);
    const view = await ok(call('GET', `/api/admin/economy/user?id=${u.user.id}`, null, admin.session));
    assert.deepEqual(view.items.map((x) => x.state), ['revoked']);

    const mod = await h.account('Moderatör', 'moderator');
    for (const s of [u.session, mod.session]) {
      assert.equal((await call('GET', `/api/admin/economy/user?id=${u.user.id}`, null, s))[0], 403);
      assert.equal((await call('POST', '/api/admin/economy/grant', { userId: u.user.id, sku: 'fr-neon', reason: 'Kendime', ref: rnd(6) }, s))[0], 403);
      assert.equal((await call('POST', '/api/admin/economy/revoke', { id: g.item.id, reason: 'Deneme' }, s))[0], 403);
      assert.equal((await call('GET', '/api/admin/economy/reviews', null, s))[0], 403);
    }
  });
});

describe('Kapatma ve gizleme', () => {
  test('shop kapalı: alım ve eski harcama 503 { error }; ekonomi, giyme ve görünüm açık', async () => {
    const u = await person('Kapalıda', 1000);
    await ok(buy(u.session, 'fr-neon', 150));
    await setLive({ features_off: ['shop'] });
    try {
      for (const [st, j] of [await buy(u.session, 'bb-candy', 120), await spend(u.session, 120, 'Mağaza: Şeker')]) {
        assert.equal(st, 503);
        assert.deepEqual(Object.keys(j), ['error']);
      }
      await economy(u.session);
      await ok(equip(u.session, 'frame', 'fr-neon'));
      await looks(u.session, u.user.id);
      assert.equal(await coins(u), 850);
    } finally {
      await setLive({ features_off: null });
    }
  });

  test('shop_hidden: gizli ürün satılmaz, listede yok; sahibi kullanmaya devam eder', async () => {
    const u = await person('Gizlide', 1000);
    await ok(buy(u.session, 'fr-neon', 150));
    await setLive({ shop_hidden: ['fr-neon'] });
    try {
      assert.equal((await buy(u.session, 'fr-neon', 150))[0], 400);
      assert.equal((await spend(u.session, 150, 'Mağaza: Ses Dalgası'))[0], 409);
      const e = await economy(u.session);
      assert.ok(!e.shop.some((x) => x.sku === 'fr-neon'));
      assert.equal(e.equipped.frame, 'fr-neon');
      assert.equal(await coins(u), 850);
    } finally {
      await setLive({ shop_hidden: null });
    }
  });
});

describe('Kayıtlar', () => {
  test('koruma tetikleyicisi: silme, boşaltma ve düzenleme yok; geri alma kodu listeden', async () => {
    const u = await person('Korunan', 1000);
    await ok(buy(u.session, 'fr-neon', 150));
    const [e] = await rows(u);
    await assert.rejects(h.sql.query('DELETE FROM entitlements WHERE id = $1', [e.id]), /never deleted/);
    await assert.rejects(h.sql.query('TRUNCATE entitlements'), /değiştirilemez ve silinemez/);
    await assert.rejects(h.sql.query("UPDATE entitlements SET sku = 'fr-gold' WHERE id = $1", [e.id]), /only revoking/);
    await assert.rejects(h.sql.query("UPDATE entitlements SET revoked_at = now(), revoked_why = 'baska' WHERE id = $1", [e.id]), /revoked_why/);
    await h.sql.query("UPDATE entitlements SET revoked_at = now(), revoked_why = 'destek' WHERE id = $1", [e.id]);
    await assert.rejects(h.sql.query('UPDATE entitlements SET revoked_at = NULL, revoked_why = NULL WHERE id = $1', [e.id]), /only revoking/);
  });

  test('tekrar sayılan benzersiz dizinler ref sütununu içerir (defter, ürün kaydı)', async () => {
    const keys = await q(
      `SELECT i.relname AS name, array_agg(a.attname::text) AS cols FROM pg_index x
         JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey)
        WHERE x.indisunique AND i.relname IN ('ledger_user_id_currency_ref_key', 'entitlements_user_id_ref_key') GROUP BY i.relname`,
    );
    assert.equal(keys.length, 2);
    for (const k of keys) assert.ok(k.cols.includes('ref'), `${k.name}: ${k.cols}`);
  });
});
