// Seviye ve VIP ayarları (levels.mjs, levels-admin.mjs, docs/SEVIYE_AYARLARI.md): the finance panel sets VIP, Rütbe,
// Cömertlik, Yankı and Abonelik (thresholds, names, which perk opens where, the level drop, the plans shown), and the
// server's checks follow them for every app. Nothing changes until the panel saves; a save someone would drop by
// asks for a confirm first; a Rütbe tier's price and days follow the shown-price rule; the drop takes only the
// inactive, once in its interval. Days run as seconds here (LEVEL_DAY_SECONDS=1) and the drop runs every 300 ms.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SHOP, SVIP_XP, VIP_SUBS } from '../catalog.mjs';
import { CHARM_XP, WEALTH_XP } from '../profile-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ LEVEL_DECAY_MS: '300', LEVEL_DAY_SECONDS: '1' });
const { call, signUp } = h;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const perkOf = (doc, key) => doc.perks.find((p) => p.key === key);
const levelIn = (table, points) => table.filter((x) => points >= x).length - 1;

// A fresh admin in each test: saves are limited to 30 a minute per person (levels-admin.mjs), which the tests pass.
let admin;
const freshAdmin = async () => (admin = await h.account(`Seviye Yöneticisi ${rnd(3)}`, 'admin'));
const levels = () => ok(call('GET', '/api/admin/levels', null, admin.session), 'ayarlar');
const view = async (system) => (await levels()).systems.find((x) => x.system === system);
const save = (system, doc, rev, extra = {}) => call('POST', '/api/admin/levels/save', { system, doc, rev, ...extra }, admin.session);
/** Saves `system` as `fn` changes it (confirming when asked). */
async function edit(system, fn) {
  const v = await view(system);
  const doc = structuredClone(v.doc);
  fn(doc);
  let [st, j] = await save(system, doc, v.rev);
  if (st === 409 && j.code === 'confirm') [st, j] = await save(system, doc, v.rev, { confirm: true });
  assert.equal(st, 200, `${system}: ${j.error}`);
  return j;
}
const reset = async (system) => ok(call('POST', '/api/admin/levels/reset', { system, rev: (await view(system)).rev, confirm: true }, admin.session), `${system} sıfırla`);
/** VIP points straight on the account (not money: purchases.mjs adds them with a store top-up). */
const setSvip = (u, xp) => h.sql.query('UPDATE users SET svip_xp = $2 WHERE id = $1', [u.user.id, xp]);
const me = async (u) => (await ok(call('GET', '/api/me', null, u.session), 'ben')).user;

describe('Seviye ayarları: okuma ve eski uygulamalar', () => {
  test('yalnız yönetici okur ve kaydeder; başlangıçta bugünkü değerler; telefon isterse katalogda', async () => {
    await freshAdmin();
    const u = await signUp('Sıradan');
    assert.equal((await call('GET', '/api/admin/levels', null, u.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/levels/save', { system: 'vip', doc: {}, rev: 0 }, u.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/levels/preview', { system: 'vip', doc: {} }, u.session))[0], 403);
    assert.equal((await call('GET', '/api/admin/levels/drops', null, u.session))[0], 403);

    const all = await levels();
    assert.deepEqual(all.systems.map((x) => x.system), ['vip', 'noble', 'wealth', 'charm', 'sub']);
    for (const s of all.systems) assert.deepEqual([s.edited, s.rev], [false, 0], s.system);
    const [vip, noble, wealth, charm, sub] = all.systems.map((x) => x.doc);
    assert.deepEqual(vip.levels.map((l) => l.points), SVIP_XP);
    assert.deepEqual([perkOf(vip, 'silent_visit').from, perkOf(vip, 'vip_gifts').from, vip.decay.on], [7, 1, false]);
    assert.deepEqual(
      noble.levels.map((l) => [l.name, l.price, l.days]),
      [1, 2, 3, 4, 5].map((t) => [SHOP.get(`noble-${t}`).name, SHOP.get(`noble-${t}`).price, SHOP.get(`noble-${t}`).days]),
    );
    assert.deepEqual(wealth.levels.map((l) => l.points), WEALTH_XP);
    assert.deepEqual(charm.levels.map((l) => l.points), CHARM_XP);
    assert.deepEqual([perkOf(wealth, 'casino').from, perkOf(charm, 'moments_post').from], [2, 5]);
    assert.deepEqual(sub.plans.map((p) => p.productId), VIP_SUBS.map((p) => p.productId));
    assert.deepEqual(
      ['chat_bubble', 'silent_visit', 'casino'].map((k) => all.perks.find((p) => p.key === k)).map((p) => [p.ready, p.gate]),
      [[false, false], [true, false], [true, true]],
    );

    // An older app doesn't ask: the catalog as before (svipXp the same values today, every subscription product).
    const [, old] = await call('GET', '/api/catalog');
    assert.equal(old.levels, undefined);
    assert.deepEqual(old.svipXp, SVIP_XP);
    assert.deepEqual(old.vipPlans, VIP_SUBS.map(({ productId, days }) => ({ productId, days })));
    const [, cat] = await call('GET', '/api/catalog?levels=1');
    const L = cat.levels;
    assert.equal(L.rev, 0);
    assert.deepEqual(L.vip.levels[0], { level: 1, points: SVIP_XP[0], name: 'VIP 1' });
    assert.deepEqual([L.wealth.points, L.charm.points], [WEALTH_XP, CHARM_XP]);
    assert.deepEqual(L.charm.perks.find((p) => p.key === 'moments_post'), { key: 'moments_post', from: 5 });
    assert.deepEqual([L.vip.decay, L.wealth.decay, L.charm.decay], [null, null, null]);
    assert.ok(L.perks.every((p) => all.perks.find((x) => x.key === p.key).ready), 'telefon yalnız hazır hakları alır');
    assert.equal(L.sub.plans.length, VIP_SUBS.length);
    assert.equal(cat.v, old.v);
  });

  test('yanlış ayar 400 ve ne yapılacağını söyler; hiçbir şey kaydedilmez', async () => {
    await freshAdmin();
    const bad = async (system, change, re) => {
      const v = await view(system);
      const doc = structuredClone(v.doc);
      change(doc);
      const [st, j] = await save(system, doc, v.rev);
      assert.equal(st, 400, `${system}: ${j.error}`);
      assert.match(j.error, re);
    };
    await bad('vip', (d) => (d.levels[2].points = d.levels[1].points), /bir öncekinden büyük/);
    await bad('vip', (d) => (d.levels = []), /1–15 seviye/);
    await bad('vip', (d) => (d.levels[0].name = ''), /adı/);
    await bad('vip', (d) => d.perks.push({ key: 'chat_bubble', from: 1, on: true }), /henüz yapılmadı/);
    await bad('vip', (d) => d.perks.push({ key: 'casino', from: 1, on: true }), /olmayan bir hak/);
    await bad('vip', (d) => d.perks.push({ ...perkOf(d, 'frame') }), /iki kez/);
    await bad('vip', (d) => (perkOf(d, 'silent_visit').from = 11), /seviye 1–10/);
    await bad('wealth', (d) => (perkOf(d, 'casino').on = false), /kapatılamaz/);
    await bad('wealth', (d) => (d.perks = d.perks.filter((p) => p.key !== 'casino')), /seviyesi gerekli/);
    await bad('wealth', (d) => (d.groups[1].from += 1), /boşluksuz/);
    await bad('charm', (d) => d.levels.pop(), /51 seviye/);
    await bad('charm', (d) => (d.decay = { on: true, idleDays: 0 }), /hareketsizlik/);
    await bad('noble', (d) => d.levels.pop(), /5 kademe/);
    await bad('noble', (d) => (d.levels[0].price = 0), /fiyat/);
    await bad('noble', (d) => (d.levels[0].days = 0), /süre/);
    await bad('sub', (d) => d.plans.forEach((p) => (p.visible = false)), /En az bir/);
    await bad('sub', (d) => (d.plans[0].was = d.plans[0].tl), /üstü çizili/);
    await bad('sub', (d) => d.plans.pop(), /Her abonelik paketi/);
    assert.equal((await call('POST', '/api/admin/levels/save', { system: 'xyz', doc: {} }, admin.session))[0], 400);
    assert.equal((await call('POST', '/api/admin/levels/preview', { system: 'vip', doc: null }, admin.session))[0], 400);
    assert.ok((await levels()).systems.every((s) => s.rev === 0), 'hiçbiri kaydedilmedi');
  });

  test('kaydet: sürüm büyür, telefonlar yeniden okur, denetim kaydı; eski sayfadan ve aynı anda iki kayıt', async () => {
    await freshAdmin();
    const [, c0] = await call('GET', '/api/catalog');
    const [, f0] = await call('GET', '/api/config');
    assert.equal(c0.v, f0.v);
    const r = await edit('vip', (d) => (d.levels[0].name = 'Bronz'));
    assert.equal(r.edited, true);
    assert.ok(r.rev > 0);
    const [, c1] = await call('GET', '/api/catalog?levels=1');
    const [, f1] = await call('GET', '/api/config');
    assert.ok(c1.v > c0.v, 'katalog sürümü büyür');
    assert.equal(c1.v, f1.v, "/api/config'inki de");
    assert.equal(c1.levels.vip.levels[0].name, 'Bronz');
    assert.equal(c1.levels.rev, r.rev);
    const a = (await h.sql.query("SELECT actor, detail FROM audit_events WHERE action = 'levels.save' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(a.actor, admin.user.id);
    assert.deepEqual([a.detail.system, a.detail.before.levels[0].name, a.detail.after.levels[0].name], ['vip', 'VIP 1', 'Bronz']);

    // A page read before that save: refused, nothing written.
    const [st, j] = await save('vip', { ...r.doc, levels: r.doc.levels.map((l, i) => (i ? l : { ...l, name: 'Gümüş' })) }, 0);
    assert.deepEqual([st, j.code], [409, 'stale']);
    assert.equal((await view('vip')).doc.levels[0].name, 'Bronz');
    // The first save of a system, twice at once from the same read: one goes in, the other is told.
    const n = await view('noble');
    const both = await Promise.all([save('noble', n.doc, n.rev), save('noble', n.doc, n.rev)]);
    assert.deepEqual(both.map(([s]) => s).sort(), [200, 409]);

    // Back to today's values: a document again, so the version keeps growing (phones never see it go back).
    const back = await reset('vip');
    assert.deepEqual([back.edited, back.doc.levels[0].name], [false, 'VIP 1']);
    assert.ok(back.rev > r.rev);
    const [, c2] = await call('GET', '/api/catalog');
    assert.ok(c2.v > c1.v);
    assert.equal((await h.sql.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'levels.reset'")).rows[0].n, 1);
  });
});

describe('Seviye ayarları: sunucunun denetimleri ayara uyar', () => {
  test('eşik yükselip biri düşecekse önce onay ister; düşen kişi VIP hakkını kaybeder', async () => {
    await freshAdmin();
    const p = await signUp('VIP Bir');
    await setSvip(p, 600_000);
    assert.equal((await call('PATCH', '/api/me/extras', { hideWealth: true }, p.session))[0], 200, 'VIP 1 seviyesini gizler');
    const v = await view('vip');
    const doc = structuredClone(v.doc);
    doc.levels[0].points = 700_000;
    const pre = await ok(call('POST', '/api/admin/levels/preview', { system: 'vip', doc }, admin.session), 'önizleme');
    assert.ok(pre.impact.down >= 1 && pre.impact.people >= 1, JSON.stringify(pre.impact));
    const [st, j] = await save('vip', doc, v.rev);
    assert.deepEqual([st, j.code], [409, 'confirm']);
    assert.match(j.error, /VIP seviyesi düşer/);
    assert.ok(j.impact.down >= 1);
    assert.equal((await view('vip')).rev, v.rev, 'onaysız kaydedilmez');
    await ok(save('vip', doc, v.rev, { confirm: true }), 'onaylı kayıt');
    const [no, why] = await call('PATCH', '/api/me/extras', { hideWealth: true }, p.session);
    assert.equal(no, 403, 'artık VIP 1 değil');
    assert.match(why.error, /VIP ayrıcalığı/);
    await reset('vip');
  });

  test('oda şifresi, sessiz ziyaret, ziyaretçiler, seviye gizleme: hakkın seviyesi değişince sunucu da öyle', async () => {
    await freshAdmin();
    const room = (u) => call('POST', '/api/rooms', { title: `Seviye ${rnd(3)}`, password: '1234' }, u.session);
    const first = await signUp('Oda Bir');
    await setSvip(first, 600_000);
    assert.equal((await room(first))[0], 200, 'VIP 1 şifreli oda açar');
    const owner = await signUp('Profil Sahibi');
    const loud = await signUp('Görünen');
    await setSvip(loud, 600_000);
    await ok(call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, loud.session), 'ziyaret');
    assert.equal((await ok(call('GET', '/api/me/visitors', null, owner.session), 'ziyaretçiler')).count, 1);

    await edit('vip', (d) => {
      perkOf(d, 'room_password').from = 3;
      perkOf(d, 'silent_visit').from = 1;
      perkOf(d, 'hide_levels').on = false;
      d.perks.push({ key: 'visitors', from: 1, on: true });
    });
    const second = await signUp('Oda İki');
    await setSvip(second, 600_000);
    const [st, j] = await room(second);
    assert.equal(st, 403, 'oda şifresi artık VIP 3');
    assert.match(j.error, /Oda kilidi/);
    const quiet = await signUp('Sessiz');
    await setSvip(quiet, 600_000);
    await ok(call('GET', `/api/user?id=${owner.user.id}&visit=1`, null, quiet.session), 'sessiz ziyaret');
    let seen = await ok(call('GET', '/api/me/visitors', null, owner.session), 'ziyaretçiler');
    assert.deepEqual([seen.count, seen.visitors], [1, null], 'VIP 1 artık iz bırakmaz; sahibin aboneliği yok, kim olduğunu görmez');
    await setSvip(owner, 600_000);
    seen = await ok(call('GET', '/api/me/visitors', null, owner.session), 'ziyaretçiler');
    assert.deepEqual(seen.visitors.map((x) => x.id), [loud.user.id], 'VIP 1 artık ziyaretçilerini görür');
    assert.equal((await call('PATCH', '/api/me/extras', { hideCharm: true }, owner.session))[0], 403, "VIP'te seviye gizleme kapalı");
    // The Abonelik still gives it (its own perk list).
    await ok(call('POST', '/api/vip/subscribe', { platform: 'test', productId: 'vip_7d', transactionId: `vip_${rnd(6)}` }, owner.session), 'abonelik');
    assert.equal((await call('PATCH', '/api/me/extras', { hideCharm: true }, owner.session))[0], 200, 'abonelikle gizler');
    await reset('vip');
  });

  test('üyelere özel hediye en düşük seviyeyi izler; reddedilen hediyede jeton düşmez', async () => {
    await freshAdmin();
    const [, cat] = await call('GET', '/api/catalog?gifts=2');
    const gift = cat.gifts.filter((g) => g.minSvip > 0).sort((x, y) => x.price - y.price)[0];
    assert.ok(gift && gift.minSvip + 2 <= SVIP_XP.length, 'satışta bir VIP hediyesi');
    const s = await signUp('VIP Gönderen');
    await setSvip(s, SVIP_XP[gift.minSvip - 1]);
    const r = await signUp('Hediye Alıcısı');
    await h.credit(s.user.id, gift.price * 2);
    const send = () => call('POST', '/api/gifts/send', { to: r.user.id, giftId: gift.id, count: 1, price: gift.price, ref: rnd(8) }, s.session);
    assert.equal((await send())[0], 200, `VIP ${gift.minSvip} gönderir`);
    const floor = gift.minSvip + 2;
    await edit('vip', (d) => (perkOf(d, 'vip_gifts').from = floor));
    const coins = (await me(s)).coins;
    const [st, j] = await send();
    assert.equal(st, 403);
    assert.match(j.error, new RegExp(`VIP ${floor} ve üstü`));
    assert.equal((await me(s)).coins, coins, 'jeton düşmedi');
    await reset('vip');
  });

  test('Oyun Salonu ve Anlar kapısı ayardaki seviyeden açılır', async () => {
    await freshAdmin();
    const w = await signUp('Oyuncu');
    await h.credit(w.user.id, 100);
    await h.debit(w.user.id, WEALTH_XP[2]);
    let wheel = await ok(call('GET', '/api/wheel', null, w.session), 'çark');
    assert.deepEqual([wheel.needLevel, wheel.allowed], [2, true]);
    let feed = await ok(call('GET', '/api/moments?tab=recent', null, w.session), 'Anlar');
    assert.deepEqual([feed.posting.needLevel, feed.posting.need], [5, CHARM_XP[5]]);
    await edit('wealth', (d) => (perkOf(d, 'casino').from = 3));
    await edit('charm', (d) => (perkOf(d, 'moments_post').from = 1));
    wheel = await ok(call('GET', '/api/wheel', null, w.session), 'çark');
    assert.deepEqual([wheel.needLevel, wheel.allowed], [3, false]);
    feed = await ok(call('GET', '/api/moments?tab=recent', null, w.session), 'Anlar');
    assert.deepEqual([feed.posting.needLevel, feed.posting.need, feed.posting.allowed], [1, CHARM_XP[1], false]);
    await reset('wealth');
    await reset('charm');
  });
});

describe('Rütbe: ad, fiyat ve gün panelden; kimse gördüğünden farklısını ödemez', () => {
  test('eski uygulama değişen kademede güncellemeye yönlenir; yenisi gösterdiği fiyat ve günle alır; tekrar deneme tekrarı alır', async () => {
    await freshAdmin();
    const b = await signUp('Rütbe Alıcısı');
    await h.credit(b.user.id, 200_000);
    const base = SHOP.get('noble-1');
    const spend = (amount) => call('POST', '/api/wallet/spend', { amount, reason: `Rütbe: ${base.name} (${base.days} gün)`, ref: rnd(8) }, b.session);
    const buy = (body) => call('POST', '/api/shop/buy', { sku: 'noble-1', ref: rnd(8), ...body }, b.session);
    const ends = async () => (await h.sql.query("SELECT max(ends_at) AS e FROM entitlements WHERE user_id = $1 AND sku = 'noble-1' AND revoked_at IS NULL", [b.user.id])).rows[0].e;
    const lastReason = async () => (await h.sql.query("SELECT reason FROM ledger WHERE user_id = $1 AND currency = 'coin' ORDER BY id DESC LIMIT 1", [b.user.id])).rows[0].reason;

    assert.equal((await spend(base.price))[0], 200, 'bugün: eski uygulama derlenmiş fiyatla alır');
    let left = (await me(b)).coins;
    assert.equal(left, 200_000 - base.price);

    await edit('noble', (d) => Object.assign(d.levels[0], { name: 'Er', price: 20_000 }));
    for (const amount of [base.price, 20_000]) {
      const [st, j] = await spend(amount);
      assert.deepEqual([st, j.code], [409, 'update_required'], `eski uygulama, ${amount}`);
    }
    let [st, j] = await buy({ price: base.price, days: base.days });
    assert.deepEqual([st, j.code, j.price], [409, 'price_changed', 20_000]);
    [st, j] = await buy({ price: 20_000 });
    assert.deepEqual([st, j.code], [409, 'update_required'], 'gün göndermeyen uygulama derlenmiş kademeyi gösteriyor');
    assert.equal((await me(b)).coins, left, 'hiçbir şey düşmedi');

    const ref = rnd(8);
    [st, j] = await buy({ price: 20_000, days: base.days, ref });
    assert.equal(st, 200, j.error);
    left -= 20_000;
    assert.equal((await me(b)).coins, left);
    assert.equal(await lastReason(), `Rütbe: Er (${base.days} gün)`);
    const econ = await ok(call('GET', '/api/economy', null, b.session), 'ekonomi');
    assert.deepEqual(['name', 'price', 'days'].map((k) => econ.shop.find((x) => x.sku === 'noble-1')[k]), ['Er', 20_000, base.days]);

    // The days move: a retry of the buy that went through is its replay; a new one at the old days is refused.
    await edit('noble', (d) => (d.levels[0].days = 15));
    [st, j] = await buy({ price: 20_000, days: base.days, ref });
    assert.deepEqual([st, j.replay], [200, true], j.error);
    [st, j] = await buy({ price: 20_000, days: base.days });
    assert.deepEqual([st, j.code, j.days], [409, 'price_changed', 15]);
    const before = await ends();
    [st, j] = await buy({ price: 20_000, days: 15 });
    assert.equal(st, 200, j.error);
    assert.equal(Math.round(((await ends()) - before) / 86_400_000), 15, '15 gün eklendi');
    assert.equal((await me(b)).coins, left - 20_000);

    // Back to the compiled tiers: older apps buy again.
    await reset('noble');
    assert.equal((await spend(base.price))[0], 200);
  });
});

describe('Seviye düşmesi', () => {
  /** My drops once there are `n` (or after `ms`). */
  const dropsOf = async (u, n = 1, ms = 6000) => {
    const end = Date.now() + ms;
    for (;;) {
      const j = await ok(call('GET', '/api/levels/drops', null, u.session), 'düşüşlerim');
      if (j.drops.length >= n || Date.now() >= end) return j.drops;
      await sleep(100);
    }
  };
  const off = (system) => edit(system, (d) => (d.decay = { ...d.decay, on: false }));

  test('VIP: jeton yüklemeyen düşer, yükleyen düşmez; önce onay, bir kez, kayıt ve listeler', async () => {
    await freshAdmin();
    const idle = await signUp('Yüklemeyen');
    await setSvip(idle, 600_000);
    await h.sql.query("UPDATE users SET created_at = now() - interval '10 days' WHERE id = $1", [idle.user.id]);
    const active = await signUp('Yükleyen');
    await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: `txn_${rnd(6)}` }, active.session), 'yükleme');
    await setSvip(active, 600_000);

    const v = await view('vip');
    const doc = { ...structuredClone(v.doc), decay: { on: true, idleDays: 300, drop: 1, everyDays: 365, floor: 0 } };
    const pre = await ok(call('POST', '/api/admin/levels/preview', { system: 'vip', doc }, admin.session), 'önizleme');
    assert.ok(pre.impact.decayToday >= 1);
    const [st, j] = await save('vip', doc, v.rev);
    assert.deepEqual([st, j.code], [409, 'confirm']);
    assert.match(j.error, /seviye düşmesi bugün/);
    await ok(save('vip', doc, v.rev, { confirm: true }), 'kural açık');

    assert.deepEqual((await dropsOf(idle)).map((d) => [d.system, d.from, d.to]), [['vip', 1, 0]]);
    assert.equal((await me(idle)).svipXp, 0);
    assert.equal((await me(active)).svipXp, 600_000, 'yükleyen düşmez');
    assert.deepEqual(await dropsOf(active, 1, 0), []);
    const [, cat] = await call('GET', '/api/catalog?levels=1');
    assert.deepEqual(cat.levels.vip.decay, { idleDays: 300, drop: 1, everyDays: 365, floor: 0 }, 'telefonlar kuralı yazar');
    const list = await ok(call('GET', '/api/admin/levels/drops?system=vip', null, admin.session), 'düşüşler');
    assert.ok(list.drops.some((d) => d.userId === idle.user.id && d.name === 'Yüklemeyen' && d.pointsBefore === 600_000 && d.pointsAfter === 0 && d.idleDays >= 300));

    // Back at VIP 1 and still not topping up: not again within everyDays.
    await setSvip(idle, 600_000);
    await sleep(1000);
    assert.equal((await dropsOf(idle, 2, 0)).length, 1, 'aralık dolmadan tekrar düşmez');
    await off('vip');
  });

  test('Cömertlik: harcamayan düşer; defter değişmez, düşen puan payı yazılır, yeni harcama üstüne eklenir; veri kopyası ve hesap silme', async () => {
    await freshAdmin();
    const w = await signUp('Harcamayan');
    await h.credit(w.user.id, 1_000);
    await h.debit(w.user.id, 1_000);
    const from = levelIn(WEALTH_XP, 1_000);
    await sleep(1100);
    await edit('wealth', (d) => (d.decay = { on: true, idleDays: 1, drop: 2, everyDays: 365, floor: 0 }));
    assert.deepEqual((await dropsOf(w)).map((d) => [d.system, d.from, d.to]), [['wealth', from, from - 2]]);
    await off('wealth');
    assert.equal((await me(w)).wealthXp, WEALTH_XP[from - 2]);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM ledger WHERE user_id = $1', [w.user.id])).rows[0].n, 2, 'defter değişmedi');
    await h.credit(w.user.id, 100);
    await h.debit(w.user.id, 100);
    assert.equal((await me(w)).wealthXp, WEALTH_XP[from - 2] + 100, 'yeni harcama üstüne eklenir');

    const copy = await ok(call('GET', '/api/me/export', null, w.session), 'veri kopyası');
    assert.deepEqual(copy.wallet.levelDrops.map((d) => [d.system, d.fromLevel, d.toLevel, d.pointsBefore, d.pointsAfter]), [['wealth', from, from - 2, 1_000, WEALTH_XP[from - 2]]]);
    assert.deepEqual(copy.wallet.levelOffsets, [{ system: 'wealth', points: 1_000 - WEALTH_XP[from - 2] }]);
    assert.equal((await call('DELETE', '/api/me', null, w.session))[0], 200);
    for (const t of ['level_drops', 'level_offsets']) assert.equal((await h.sql.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = $1`, [w.user.id])).rows[0].n, 0, t);
  });

  test('Yankı: hediye almayan yayıncı düşer, tabanın altına inmez', async () => {
    await freshAdmin();
    const star = await signUp('Yayıncı');
    const fan = await signUp('Hayran');
    const [, cat] = await call('GET', '/api/catalog?gifts=2');
    const gift = cat.gifts.filter((g) => !g.minSvip && g.price >= CHARM_XP[3]).sort((x, y) => x.price - y.price)[0];
    assert.ok(gift, 'hediye');
    await h.credit(fan.user.id, gift.price);
    await ok(call('POST', '/api/gifts/send', { to: star.user.id, giftId: gift.id, count: 1, price: gift.price, ref: rnd(8) }, fan.session), 'hediye');
    const from = levelIn(CHARM_XP, (await me(star)).charmXp);
    assert.ok(from >= 3);
    await sleep(1100);
    await edit('charm', (d) => (d.decay = { on: true, idleDays: 1, drop: 10, everyDays: 365, floor: from - 1 }));
    assert.deepEqual((await dropsOf(star)).map((d) => [d.system, d.from, d.to]), [['charm', from, from - 1]], 'taban');
    await off('charm');
    assert.equal((await me(star)).charmXp, CHARM_XP[from - 1]);
  });
});
