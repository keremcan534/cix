// Çantam (economy.mjs grantReward, level-rewards.mjs, 085): what someone owns comes from Çarşı, the staff or a reward,
// and the economy read says which (source, origin) for the bag. Seviye ödülleri: an item tied to a level of VIP,
// Cömertlik or Yankı in the panel lands in the bag of whoever has the level, once, at their next read; one already
// had for good adds nothing and isn't tried again; a rule taken away gives nothing more. Only admins set them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SVIP_XP } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi();
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
const DAY = 86_400_000;
const economy = (who) => ok(call('GET', '/api/economy', null, who.session), 'ekonomi');
const itemIn = async (who, sku) => (await economy(who)).items.find((x) => x.sku === sku);
/** VIP level `n` for `who`, as its points (Seviye ayarları' compiled thresholds). */
const vipTo = (who, n) => h.sql.query('UPDATE users SET svip_xp = $2 WHERE id = $1', [who.user.id, SVIP_XP[n - 1]]);

let admin;

describe('Çantam: nereden geldiği ve seviye ödülleri', () => {
  test('yalnız yönetici; sistem, seviye, eşya ve gün denetlenir', async () => {
    admin = await h.account(`Ödül Yöneticisi ${rnd(2)}`, 'admin');
    const u = await h.signUp('Sıradan');
    await refused(call('GET', '/api/admin/level-rewards', null, u.session), 403);
    await refused(call('POST', '/api/admin/level-rewards', { system: 'vip', level: 3, sku: 'fr-neon' }, u.session), 403);
    const add = (b) => call('POST', '/api/admin/level-rewards', b, admin.session);
    await refused(add({ system: 'noble', level: 1, sku: 'fr-neon' }), 400, /VIP, Cömertlik ya da Yankı/);
    await refused(add({ system: 'vip', level: 0, sku: 'fr-neon' }), 400, /VIP seviyesi 1–/);
    await refused(add({ system: 'vip', level: 99, sku: 'fr-neon' }), 400, /VIP seviyesi 1–/);
    await refused(add({ system: 'vip', level: 3, sku: 'noble-2' }), 400, /çerçeve, giriş efekti, binek/);
    await refused(add({ system: 'vip', level: 3, sku: 'yok-boyle' }), 400, /çerçeve, giriş efekti, binek/);
    await refused(add({ system: 'vip', level: 3, sku: 'fr-gold', days: 7 }), 400, /süresiz/);
    await refused(add({ system: 'vip', level: 3, sku: 'fr-neon', days: 999 }), 400, /Gün 1–/);
    const d = await ok(call('GET', '/api/admin/level-rewards', null, admin.session), 'liste');
    assert.deepEqual(d.rules, []);
    assert.ok(d.items.some((x) => x.sku === 'rd-sport' && x.kind === 'ride'), 'binekler de seçilir');
    assert.ok(d.items.some((x) => x.sku === 'fr-neon' && x.kind === 'frame'));
    assert.equal(d.systems.vip.name, 'VIP');
  });

  test('seviyeye ulaşan, sonraki okumada ödülü çantasında bulur: bir kez, nereden geldiğiyle', async () => {
    const add = (b) => ok(call('POST', '/api/admin/level-rewards', b, admin.session), 'ödül ekle');
    const neon = (await add({ system: 'vip', level: 3, sku: 'fr-neon', days: 7 })).rule;
    assert.deepEqual([neon.systemName, neon.level, neon.sku, neon.days, neon.kind], ['VIP', 3, 'fr-neon', 7, 'frame']);
    await add({ system: 'vip', level: 3, sku: 'fr-gold' });
    await add({ system: 'wealth', level: 1, sku: 'rd-sport' });
    await refused(call('POST', '/api/admin/level-rewards', { system: 'vip', level: 3, sku: 'fr-neon' }, admin.session), 409, /zaten var/);

    const u = await h.signUp('Yükselen');
    assert.equal(await itemIn(u, 'fr-neon'), undefined, 'VIP 3 değilken yok');
    await vipTo(u, 3);
    const t0 = Date.now();
    const e = await economy(u);
    const neonItem = e.items.find((x) => x.sku === 'fr-neon');
    assert.deepEqual([neonItem.source, neonItem.origin], ['level', 'VIP 3']);
    assert.ok(Math.abs(Date.parse(neonItem.until) - (t0 + 7 * DAY)) < 60_000, '7 gün');
    assert.deepEqual(e.items.find((x) => x.sku === 'fr-gold'), { sku: 'fr-gold', kind: 'frame', until: null, source: 'level', origin: 'VIP 3' });
    assert.equal(e.items.find((x) => x.sku === 'rd-sport'), undefined, 'Cömertlik 1 değil');
    // Read again, and twice at once: nothing more.
    await Promise.all([economy(u), economy(u), economy(u)]);
    const rows = (await h.sql.query("SELECT sku FROM entitlements WHERE user_id = $1 AND source = 'level' ORDER BY sku", [u.user.id])).rows.map((x) => x.sku);
    assert.deepEqual(rows, ['fr-gold', 'fr-neon']);
    // Not equipped by itself: the person chooses in Çantam.
    assert.equal(e.equipped.frame ?? null, null);
  });

  test('zaten süresiz sahip olana bir şey eklenmez, yeniden denenmez; kaldırılan kural artık vermez', async () => {
    const u = await h.signUp('Sahibi');
    await ok(call('POST', '/api/admin/economy/grant', { userId: u.user.id, sku: 'fr-gold', reason: 'Yarışma ödülü', ref: `g-${rnd()}` }, admin.session), 'yetkili verir');
    assert.equal((await itemIn(u, 'fr-gold')).source, 'admin', 'yetkili hediyesi');
    await vipTo(u, 3);
    await economy(u);
    await economy(u);
    assert.equal((await itemIn(u, 'fr-gold')).source, 'admin', 'süresizi zaten var: yetkilinin olarak kalır');
    assert.equal((await itemIn(u, 'fr-neon')).source, 'level');
    const claims = (await h.sql.query('SELECT r.sku, c.given FROM level_reward_claims c JOIN level_rewards r ON r.id = c.rule_id WHERE c.user_id = $1 ORDER BY r.sku', [u.user.id])).rows;
    assert.deepEqual(claims.map((x) => [x.sku, x.given]), [['fr-gold', false], ['fr-neon', true]]);

    const d = await ok(call('GET', '/api/admin/level-rewards', null, admin.session), 'liste');
    const neon = d.rules.find((x) => x.sku === 'fr-neon');
    assert.equal(neon.given, 2, 'iki kişiye verildi');
    await ok(call('POST', '/api/admin/level-rewards/delete', { id: neon.id }, admin.session), 'kaldır');
    await refused(call('POST', '/api/admin/level-rewards/delete', { id: neon.id }, admin.session), 404);
    const late = await h.signUp('Geç Gelen');
    await vipTo(late, 3);
    // The rules are read again within 15 s, and at once in the API that took the change.
    const e = await economy(late);
    assert.equal(e.items.find((x) => x.sku === 'fr-neon'), undefined, 'kaldırılan ödül verilmez');
    assert.equal(e.items.find((x) => x.sku === 'fr-gold').source, 'level');
    const audit = (await h.sql.query("SELECT action FROM audit_events WHERE action LIKE 'level_reward.%' ORDER BY id")).rows.map((x) => x.action);
    assert.deepEqual(audit, ['level_reward.create', 'level_reward.create', 'level_reward.create', 'level_reward.delete']);
  });

  test('Çarşı’dan alınan "buy" görünür; harcayıp Cömertlik 1 olan, ödülü aldığının üstüne ekler', async () => {
    const u = await h.signUp('Alıcı');
    await h.credit(u.user.id, 10_000);
    const buy = async (sku) => {
      const x = (await economy(u)).shop.find((s) => s.sku === sku);
      await ok(call('POST', '/api/shop/buy', { sku, price: x.price, days: x.days, ref: `b-${rnd()}` }, u.session), `alır ${sku}`);
      return x;
    };
    await buy('rd-scooter');
    const scooter = await itemIn(u, 'rd-scooter');
    assert.deepEqual(Object.keys(scooter).sort(), ['kind', 'sku', 'source', 'until'], 'eski alanlar ve nereden geldiği');
    assert.deepEqual([scooter.kind, scooter.source], ['ride', 'buy']);
    // What the Scooter cost took them to Cömertlik 1: the rule's Spor Araba came at that read.
    const t0 = Date.now();
    const reward = await itemIn(u, 'rd-sport');
    assert.deepEqual([reward.source, reward.origin], ['level', 'Cömertlik 1'], 'seviye ödülü');
    // Bought too: its days come after the reward's, and the bag says where the last term came from.
    const sport = await buy('rd-sport');
    const item = await itemIn(u, 'rd-sport');
    assert.deepEqual([item.source, item.origin], ['buy', undefined], 'en son gelen: Çarşı');
    assert.ok(Math.abs(Date.parse(item.until) - (t0 + 2 * sport.days * DAY)) < 120_000, 'iki dönem art arda');
  });
});
