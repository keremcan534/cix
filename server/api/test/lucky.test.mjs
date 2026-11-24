// Şanslı hediyeler (lucky.mjs) against a real Postgres: Cömertlik Lv.2 and 18 years, one charge per request,
// the recipient's share (10 %, the panel's Alıcı payı) as diamonds and the rest a coin_spend, rewards as coins that never count for Cömertlik,
// replays, the daily
// limit and the admins' settings (checked, versioned, audited).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { DEFAULT_CONFIG, ODDS_TOTAL, checkConfig, drawMult, shareOf } from '../lucky-rules.mjs';

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

describe('Şanslı kuralları', () => {
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

  // Alıcı payı (owners, 24 Nov 2026): 10 % by default, set in the panel (1–50 %); every package must give at least one
  // whole diamond; a save without it (an older panel) keeps the share in force.
  test('alıcı payı: varsayılan %10, sınırlar, en az 1 elmas, eski panel payı korur', () => {
    assert.equal(DEFAULT_CONFIG.sharePct, 10);
    assert.equal(shareOf(DEFAULT_CONFIG), 0.1);
    assert.equal(shareOf({}), 0.1, 'payı olmayan eski kayıt');
    const g = DEFAULT_CONFIG.gifts[0];
    assert.equal(checkConfig({ ...DEFAULT_CONFIG, sharePct: 25 }).sharePct, 25);
    const { sharePct: _, ...old } = DEFAULT_CONFIG;
    assert.equal(checkConfig(old, 30).sharePct, 30, 'eski panel kaydı payı korur');
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, sharePct: 0 }), /Alıcı payı/);
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, sharePct: 51 }), /Alıcı payı/);
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, sharePct: 12.5 }), /Alıcı payı/);
    assert.throws(() => checkConfig({ ...DEFAULT_CONFIG, gifts: [{ ...g, price: 9 }] }), /en az 10 jeton/);
    assert.equal(checkConfig({ ...DEFAULT_CONFIG, sharePct: 20, gifts: [{ ...g, price: 5 }] }).gifts[0].price, 5);
  });
});

describe('Şanslı hediyeler sunucuda', () => {
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

  test('bir gönderim: alıcıya %10 elmas, kalan uygulama içi harcama, ödül jeton; tekrar tek sefer', async () => {
    const a = await player('Gönderen', 1000);
    const b = await signUp('Alıcı');
    const ref = rnd(8);
    const [st, j] = await send(a.session, { giftId: 'lk2', to: [b.user.id], count: 5, ref });
    assert.equal(st, 200, j.error);
    assert.equal(j.replay, false);
    assert.equal(j.send.cost, 500);
    assert.equal(j.send.shared, 50);
    assert.equal(j.send.draws.length, 5);
    assert.equal(j.send.payout, j.send.draws.reduce((n, m) => n + m * 100, 0));
    assert.equal(j.user.coins, 500 + j.send.payout);
    assert.equal(j.user.gameCoins, 0);
    assert.equal((await me(b.session)).diamonds, 50);
    const ev = (await h.sql.query('SELECT gift_id, count, unit_price, total FROM gift_events WHERE sender = $1', [a.user.id])).rows;
    assert.deepEqual(ev, [{ gift_id: 'lk2', count: 5, unit_price: '100', total: '50' }]);
    const spend = (await h.sql.query("SELECT amount, reason, channel FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref LIKE 'lucky:%' ORDER BY id", [a.user.id])).rows;
    assert.deepEqual(
      spend.map((r) => Number(r.amount)),
      [-50, -450, ...(j.send.payout ? [j.send.payout] : [])],
    );
    assert.match(spend[1].reason, /^Uygulama içi: Şanslı hediye/);
    if (j.send.payout) assert.deepEqual([spend[2].channel, spend[2].reason.startsWith('Şanslı ödülü')], ['ugurlu', true]);
    const income = (await h.sql.query("SELECT source_type, diamonds FROM income_events WHERE streamer_id = $1", [b.user.id])).rows;
    assert.deepEqual(income, [{ source_type: 'lucky_gift', diamonds: '50' }]);

    const [st2, again] = await send(a.session, { giftId: 'lk2', to: [b.user.id], count: 5, ref });
    assert.equal(st2, 200);
    assert.equal(again.replay, true);
    assert.deepEqual(again.send.draws, j.send.draws);
    assert.equal((await me(a.session)).coins, 500 + j.send.payout);
    assert.equal((await me(b.session)).diamonds, 50);
  });

  test('birden çok alıcı, kendine, engelli ve yetersiz jeton', async () => {
    const a = await player('Çoklu', 1000);
    const b = await signUp('B1');
    const c = await signUp('C1');
    let [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id, c.user.id], count: 1 });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.draws.length, 2);
    const coins = 960 + j.send.payout;
    assert.equal(j.user.coins, coins);
    assert.equal((await me(b.session)).diamonds, 2);
    assert.equal((await me(c.session)).diamonds, 2);

    [st, j] = await send(a.session, { giftId: 'lk1', to: [a.user.id] });
    assert.equal(st, 400);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id, b.user.id] });
    assert.equal(st, 400);
    assert.equal((await call('POST', '/api/block', { to: a.user.id }, c.session))[0], 200);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [c.user.id] });
    assert.equal(st, 403);
    // The recipients' shares fit, the rest doesn't: nothing of it stays.
    const poor = await player('Az', 1000);
    [st, j] = await send(poor.session, { giftId: 'lk4', to: [b.user.id], count: 5 });
    assert.equal(st, 409);
    assert.match(j.error, /Yetersiz/);
    assert.equal((await me(poor.session)).coins, 1000);
    assert.equal((await me(a.session)).coins, coins);
    assert.equal((await me(b.session)).diamonds, 2);
    assert.equal(Number((await h.sql.query('SELECT count(*) AS n FROM gift_events WHERE sender = $1', [a.user.id])).rows[0].n), 2);
  });

  // ×777 (owners, 22 Nov 2026, as the sample videos; the legal side is theirs): Şanslı only, to as many as 20 people in
  // one send; the wheel's taps stay within 16.000 draws a request; a plain gift still can't go ×777.
  test('×777: tek kişiye ve 20 kişiye; çekiliş sınırı; normal hediyede yok', async () => {
    const a = await player('Yedi Yüz', 640_000); // 777 + 777 × 20 + 777 × 20 lk1 (20 jeton)
    const people = await Promise.all(Array.from({ length: 20 }, (_, i) => signUp(`Alan ${i}`)));
    let [st, j] = await send(a.session, { giftId: 'lk1', to: [people[0].user.id], count: 777 });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.draws.length, 777);
    assert.equal((await me(people[0].session)).diamonds, 2 * 777, 'alıcıya %10');
    [st, j] = await send(a.session, { giftId: 'lk1', to: people.map((p) => p.user.id), count: 777 });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.draws.length, 777 * 20);
    // 777 × 2 taps × 20 people = 31.080 draws: more than one request draws.
    [st, j] = await send(a.session, { giftId: 'lk1', to: people.map((p) => p.user.id), count: 777, times: 2 });
    assert.deepEqual([st, j.error], [400, 'Geçersiz tekrar sayısı']);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [people[1].user.id], count: 777, times: 20 });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.draws.length, 777 * 20);
    assert.equal((await send(a.session, { giftId: 'lk1', to: [people[1].user.id], count: 776 }))[0], 400);
    const [, cfg] = await call('GET', '/api/lucky', null, a.session);
    assert.deepEqual(cfg.counts, [1, 5, 10, 25, 50, 100, 250, 777]);
    // A plain gift: the counts it always had.
    const [gst, g] = await call('POST', '/api/gifts/send', { to: people[2].user.id, giftId: 'g1', count: 777, ref: rnd(8) }, a.session);
    assert.deepEqual([gst, g.error], [400, 'Adet 1, 5, 10, 25, 50, 100, 250 olabilir']);
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

    // Şans Yoncası always pays ×2, Uğur Böceği closed, 2150 coins of rewards a day more than the earlier tests paid.
    const before = (await call('GET', '/api/admin/lucky', null, adm.session))[1].stats.today.paid;
    [st, j] = await save(adm, (c) => {
      c.gifts[0].tiers = sure2;
      c.gifts[1].enabled = false;
      c.dailyPayoutLimit = before + 2150;
      return c;
    });
    assert.equal(st, 200, j.error);
    assert.ok(j.version >= 2);
    const log = (await h.sql.query("SELECT actor, detail FROM sanction_audit_logs WHERE action = 'lucky_config' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(log.actor, adm.user.id);
    assert.equal(log.detail.dailyPayoutLimit, before + 2150);

    const a = await player('Şanslı', 1000);
    const b = await signUp('B2');
    const [, info] = await call('GET', '/api/lucky', null, a.session);
    assert.equal(info.allowed, true);
    assert.ok(!info.gifts.some((g) => g.id === 'lk2'));
    [st, j] = await send(a.session, { giftId: 'lk2', to: [b.user.id] });
    assert.equal(st, 400);
    assert.match(j.error, /kapalı/);

    // A reward spent again: the first send takes every bought coin, the second is paid with its reward and adds
    // no Cömertlik.
    const loop = await player('Döngü', 1000);
    [st, j] = await send(loop.session, { giftId: 'lk1', to: [b.user.id], count: 50 });
    assert.equal(st, 200, j.error);
    assert.equal(j.user.coins, 2000);
    const xp = (await me(loop.session)).wealthXp;
    assert.ok(xp > 1000);
    [st, j] = await send(loop.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 200, j.error);
    assert.equal(j.user.coins, 2020);
    assert.equal((await me(loop.session)).wealthXp, xp);

    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 200, j.error);
    assert.deepEqual(j.send.draws, [2]);
    assert.equal(j.user.coins, 1020);
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 200, j.error);
    // 2120 paid today: one more ×2 (40) would pass 2150.
    [st, j] = await send(a.session, { giftId: 'lk1', to: [b.user.id] });
    assert.equal(st, 409);
    assert.match(j.error, /Günlük ödül limiti/);
    const [, after] = await call('GET', '/api/lucky', null, a.session);
    assert.equal(after.gifts.find((g) => g.id === 'lk1').open, false);
    assert.equal((await me(a.session)).coins, 1040);

    const [, view] = await call('GET', '/api/admin/lucky', null, adm.session);
    assert.equal(view.stats.today.paid, before + 2120);
    assert.ok(view.recent.length >= 2);
    assert.equal(view.recent[0].sender.id, a.user.id);
    // Alıcı payı from the panel: 20 % now, shown to the phones and paid; a save without it (an older panel) keeps it;
    // the audit has it.
    assert.equal(view.config.sharePct, 10);
    [st, j] = await save(adm, (c) => ((c.sharePct = 20), (c.dailyPayoutLimit = 1_000_000_000), c));
    assert.equal(st, 200, j.error);
    const rich = await player('Yirmi', 1000);
    const to = await signUp('Pay Alan');
    assert.equal((await call('GET', '/api/lucky', null, rich.session))[1].share, 0.2);
    [st, j] = await send(rich.session, { giftId: 'lk3', to: [to.user.id] });
    assert.equal(st, 200, j.error);
    assert.equal(j.send.shared, 100);
    assert.equal((await me(to.session)).diamonds, 100);
    [st, j] = await save(adm, (c) => (delete c.sharePct, c));
    assert.equal(st, 200, j.error);
    assert.equal(j.config.sharePct, 20, 'eski panel kaydı payı korur');
    const audited = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'lucky.config' ORDER BY id DESC LIMIT 1")).rows[0].detail;
    assert.deepEqual([audited.before.sharePct, audited.after.sharePct], [20, 20]);
    [st, j] = await save(adm, (c) => ((c.sharePct = 60), c));
    assert.equal(st, 400);
    assert.match(j.error, /Alıcı payı/);
    // Put the built-in packages back for any later test.
    [st] = await save(adm, () => DEFAULT_CONFIG);
    assert.equal(st, 200);
  });
});
