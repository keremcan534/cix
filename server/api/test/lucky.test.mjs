// Uğurlu hediyeler (lucky.mjs) against a real Postgres: Cömertlik Lv.2 and 18 years, one charge per request,
// the recipient's 20 % as diamonds and the rest a coin_spend, rewards only as game coins, replays, the daily
// limit and the admins' settings (checked, versioned, audited).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { DEFAULT_CONFIG, ODDS_TOTAL, checkConfig, drawMult } from '../lucky-rules.mjs';

const h = startApi();
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
const send = (s, body) => call('POST', '/api/lucky/send', { count: 1, ref: rnd(8), ...body }, s);
/** A signed-up adult past Cömertlik Lv.2: tops up and spends 1000 coins in the shop. */
async function player(name, coins) {
  const p = await signUp(name);
  await h.sql.query("UPDATE users SET birth_date = '1990-01-01' WHERE id = $1", [p.user.id]);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) {
    assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  }
  return p;
}
async function adminAccount() {
  const a = await signUp('Yönetici');
  await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [a.user.id]);
  return a;
}
/** Saves `edit(config)` as the admin; returns [status, body]. */
async function save(a, edit) {
  const [, cur] = await call('GET', '/api/admin/lucky', null, a.session);
  return call('POST', '/api/admin/lucky/config', { config: edit(structuredClone(cur.config)), version: cur.version }, a.session);
}
const sure2 = [
  { mult: 0, weight: 0 },
  { mult: 2, weight: ODDS_TOTAL },
];

describe('Uğurlu kuralları', () => {
  test('hazır paketler geçerli, çekiliş doğru çarpana düşer', () => {
    assert.deepEqual(checkConfig(DEFAULT_CONFIG).gifts.map((g) => g.id), ['lk1', 'lk2', 'lk3', 'lk4']);
    const t = DEFAULT_CONFIG.gifts[0].tiers;
    let at = 0;
    for (const x of t) {
      if (!x.weight) continue;
      assert.equal(drawMult(t, at), x.mult);
      assert.equal(drawMult(t, at + x.weight - 1), x.mult);
      at += x.weight;
    }
    assert.equal(at, ODDS_TOTAL);
  });

  test('toplamı %100 olmayan, tanımsız çarpanlı, ucuz paket reddedilir', () => {
    const g = DEFAULT_CONFIG.gifts[0];
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, gifts: [{ ...g, tiers: [{ mult: 2, weight: 10 }] }] }), /toplamı/);
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, gifts: [{ ...g, tiers: [{ mult: 3, weight: ODDS_TOTAL }] }] }), /tanımsız/);
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, gifts: [{ ...g, price: 4 }] }), /fiyat/);
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, gifts: [g, g] }), /iki kez/);
  });
});

describe('Uğurlu hediyeler sunucuda', () => {
  test('Cömertlik Lv.2 ve 18 yaş şartı', async () => {
    const b = await signUp('B');
    const a = await signUp('A');
    await topUp(a.session, 1000);
    const [, info] = await call('GET', '/api/lucky', null, a.session);
    assert.equal(info.allowed, false);
    assert.equal(info.gifts.length, 4);
    let [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 403);
    assert.match(j.error, /yaş/);
    await h.sql.query("UPDATE users SET birth_date = '1990-01-01' WHERE id = $1", [a.user.id]);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 403);
    assert.match(j.error, /Cömertlik/);
    assert.equal((await me(a.session)).coins, 1000);
  });

  test('bir gönderim: alıcıya %20 elmas, kalan uygulama içi harcama, ödül sadece oyun jetonu; tekrar tek sefer', async () => {
    const a = await player('Gönderen', 1000);
    const b = await signUp('Alıcı');
    const ref = rnd(8);
    const [st, j] = await send(a.session, { giftId: 'lk2', to: [b.user.id], count: 5, ref });
    assert.equal(st, 200, j.error);
    assert.equal(j.replay, false);
    assert.equal(j.send.cost, 500);
    assert.equal(j.send.shared, 100);
    assert.equal(j.send.draws.length, 5);
    assert.equal(j.send.payout, j.send.draws.reduce((n, m) => n + m * 100, 0));
    assert.equal(j.user.coins, 500);
    assert.equal(j.user.gameCoins, j.send.payout);
    assert.equal((await me(b.session)).diamonds, 100);
    const ev = (await h.sql.query('SELECT gift_id, count, unit_price, total FROM gift_events WHERE sender = $1', [a.user.id])).rows;
    assert.deepEqual(ev, [{ gift_id: 'lk2', count: 5, unit_price: '100', total: '100' }]);
    const spend = (await h.sql.query("SELECT amount, reason FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref LIKE 'lucky:%' ORDER BY id", [a.user.id])).rows;
    assert.deepEqual(
      spend.map((r) => Number(r.amount)),
      [-100, -400],
    );
    assert.match(spend[1].reason, /^Uygulama içi: Uğurlu hediye/);
    const income = (await h.sql.query("SELECT source_type, diamonds FROM income_events WHERE streamer_id = $1", [b.user.id])).rows;
    assert.deepEqual(income, [{ source_type: 'lucky_gift', diamonds: '100' }]);

    const [st2, again] = await send(a.session, { giftId: 'lk2', to: [b.user.id], count: 5, ref });
    assert.equal(st2, 200);
    assert.equal(again.replay, true);
    assert.deepEqual(again.send.draws, j.send.draws);
    assert.equal((await me(a.session)).coins, 500);
    assert.equal((await me(b.session)).diamonds, 100);
  });

  test('birden çok alıcı, kendine, engelli ve yetersiz jeton', async () => {
    const a = await player('Çoklu', 1000);
    const b = await signUp('B1');
    const c = await signUp('C1');
    let [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id, c.user.id], count: 1 });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.draws.length, 2);
    assert.equal(j.user.coins, 960);
    assert.equal((await me(b.session)).diamonds, 4);
    assert.equal((await me(c.session)).diamonds, 4);

    [st, j] = await send(a.session, { giftId: 'lk1', to: [a.user.id] });
    assert.equal(st, 400);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id, b.user.id] });
    assert.equal(st, 400);
    assert.equal((await call('POST', '/api/block', { to: a.user.id }, c.session))[0], 200);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [c.user.id] });
    assert.equal(st, 403);
    // The recipients' shares fit, the rest doesn't: nothing of it stays.
    [st, j] = await send(a.session, { giftId: 'lk4', to: [b.user.id] });
    assert.equal(st, 409);
    assert.match(j.error, /Yetersiz/);
    assert.equal((await me(a.session)).coins, 960);
    assert.equal((await me(b.session)).diamonds, 4);
    assert.equal(Number((await h.sql.query('SELECT count(*) AS n FROM gift_events WHERE sender = $1', [a.user.id])).rows[0].n), 2);
  });

  test('yönetici ayarları: yetki, denetim, sürüm, kapalı paket, kesin oranlar ve günlük limit', async () => {
    const user = await signUp('Sıradan');
    assert.equal((await call('GET', '/api/admin/lucky', null, user.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/lucky/config', { config: DEFAULT_CONFIG, version: 1 }, user.session))[0], 403);

    const adm = await adminAccount();
    let [st, j] = await save(adm, (c) => ((c.gifts[0].tiers = [{ mult: 2, weight: 5 }]), c));
    assert.equal(st, 400);
    assert.match(j.error, /toplamı/);
    [st, j] = await call('POST', '/api/admin/lucky/config', { config: DEFAULT_CONFIG, version: 99 }, adm.session);
    assert.equal(st, 409);

    // Şans Yoncası always pays ×2, Uğur Böceği closed, 100 game coins a day more than the earlier tests paid.
    const before = (await call('GET', '/api/admin/lucky', null, adm.session))[1].stats.today.paid;
    [st, j] = await save(adm, (c) => {
      c.gifts[0].tiers = sure2;
      c.gifts[1].enabled = false;
      c.dailyPayoutLimit = before + 100;
      return c;
    });
    assert.equal(st, 200, j.error);
    assert.ok(j.version >= 2);
    const log = (await h.sql.query("SELECT actor, detail FROM sanction_audit_logs WHERE action = 'lucky_config' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(log.actor, adm.user.id);
    assert.equal(log.detail.dailyPayoutLimit, before + 100);

    const a = await player('Şanslı', 1000);
    const b = await signUp('B2');
    const [, info] = await call('GET', '/api/lucky', null, a.session);
    assert.equal(info.allowed, true);
    assert.ok(!info.gifts.some((g) => g.id === 'lk2'));
    [st, j] = await send(a.session, { giftId: 'lk2', to: [b.user.id] });
    assert.equal(st, 400);
    assert.match(j.error, /kapalı/);

    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 200, j.error);
    assert.deepEqual(j.send.draws, [2]);
    assert.equal(j.user.gameCoins, 40);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 200, j.error);
    // 80 paid today: one more ×2 (40) would pass 100.
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 409);
    assert.match(j.error, /Günlük ödül limiti/);
    const [, after] = await call('GET', '/api/lucky', null, a.session);
    assert.equal(after.gifts.find((g) => g.id === 'lk1').open, false);
    assert.equal((await me(a.session)).coins, 960);

    const [, view] = await call('GET', '/api/admin/lucky', null, adm.session);
    assert.equal(view.stats.today.paid, before + 80);
    assert.ok(view.recent.length >= 2);
    assert.equal(view.recent[0].sender.id, a.user.id);
    // Put the built-in packages back for any later test.
    [st] = await save(adm, () => DEFAULT_CONFIG);
    assert.equal(st, 200);
  });
});
