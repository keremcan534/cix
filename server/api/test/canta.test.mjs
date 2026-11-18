// Çantam (economy.mjs grantReward, level-rewards.mjs, 085): what someone owns comes from Çarşı, the staff or a reward,
// and the economy read says which (source, origin) for the bag. Seviye ödülleri: an item tied to a level of VIP,
// Cömertlik or Yankı in the panel lands in the bag of whoever has the level, once, at their next read; one already
// had for good adds nothing and isn't tried again; a rule taken away gives nothing more. Only admins set them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SVIP_XP } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ EVENT_SWEEP_MS: '200' });
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

describe('Etkinlik ödülü', () => {
  const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
  const plan = (room, title) => ({ room, category: 'tanisma', title, description: 'Gelen kazanır', rules: 'Saygılı ol', startsAt: inMinutes(90), minutes: 60, capacity: null });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms = 6000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await fn()) return;
      await wait(100);
    }
    throw new Error('zaman aşımı');
  }
  let boss;
  /** An approved event of a new room, and its owner. */
  async function approved(title) {
    const owner = await h.signUp(`Sahip ${rnd(2)}`);
    const room = (await ok(call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const { event } = await ok(call('POST', '/api/events', plan(room, title), owner.session), 'başvuru');
    await ok(call('POST', '/api/admin/events/review', { id: event.id, approve: true }, boss.session), 'onay');
    return { owner, id: event.id };
  }
  /** Started by its owner now, with `fans` in the room. */
  async function run({ owner, id }, fans) {
    await h.sql.query("UPDATE events SET starts_at = now() + interval '5 minutes', ends_at = now() + interval '65 minutes' WHERE id = $1", [id]);
    await ok(call('POST', '/api/events/start', { id }, owner.session), 'başlat');
    for (const f of fans) assert.deepEqual(await ok(call('POST', '/api/events/here', { id }, f.session), 'burada'), { counted: true });
  }
  const reward = (id, b, who = boss) => call('POST', '/api/admin/events/reward', { id, ...b }, who.session);
  const doneOf = async (id) => (await h.sql.query('SELECT reward_done_at, reward_given FROM events WHERE id = $1', [id])).rows[0];

  test('yönetici etkinliğe ödül bağlar; gelenler etkinlik bitince Çantam’da bulur, bir kez', async () => {
    boss = await h.account(`Etkinlik Yöneticisi ${rnd(2)}`, 'admin');
    const ev = await approved('Ödüllü Gece');
    const fan = await h.signUp('Gelen');
    const away = await h.signUp('Gelmeyen');
    await refused(reward(ev.id, { sku: 'fr-neon' }, fan), 403);
    await refused(reward(ev.id, { sku: 'noble-1' }), 400, /çerçeve, giriş efekti/);
    await refused(reward(ev.id, { sku: 'fr-gold', days: 5 }), 400, /süresiz/);
    const set = (await ok(reward(ev.id, { sku: 'fr-neon', days: 3 }), 'ödül')).event.reward;
    assert.deepEqual([set.sku, set.kind, set.days, typeof set.name, set.given], ['fr-neon', 'frame', 3, 'string', undefined]);
    // Everyone sees it on the event; the panel's list offers the items.
    assert.equal((await ok(call('GET', `/api/events/one?id=${ev.id}`, null, fan.session), 'etkinlik')).event.reward.sku, 'fr-neon');
    const list = await ok(call('GET', '/api/admin/events?status=upcoming', null, boss.session), 'liste');
    assert.ok(list.rewardItems.some((x) => x.sku === 'rd-sport' && x.kindName === 'Binek'));
    assert.equal(list.rewardItems.some((x) => x.sku === 'noble-1'), false);

    await run(ev, [fan]);
    await ok(call('POST', '/api/events/end', { id: ev.id }, ev.owner.session), 'bitir');
    await until(async () => (await doneOf(ev.id)).reward_done_at !== null);
    const got = await itemIn(fan, 'fr-neon');
    assert.deepEqual([got.source, got.origin], ['event', 'Ödüllü Gece']);
    assert.ok(Math.abs(Date.parse(got.until) - Date.now() - 3 * DAY) < 120_000, '3 gün');
    assert.equal((await itemIn(ev.owner, 'fr-neon'))?.source, 'event', 'başlatan da geldi');
    assert.equal(await itemIn(away, 'fr-neon'), undefined, 'gelmeyen almaz');
    assert.equal((await ok(call('GET', `/api/events/one?id=${ev.id}`, null, fan.session), 'etkinlik')).event.reward.given, 2);
    const notices = async () => (await h.sql.query("SELECT body FROM team_notices WHERE target = $1 AND category = 'event_reward'", [fan.user.id])).rows;
    assert.equal((await notices()).length, 1);
    assert.match((await notices())[0].body, /“Ödüllü Gece” etkinliğine katıldığın için .+ kazandın!\nÖdülün Çantam bölümüne eklendi/);

    // Given again (a restart midway, a second sweep): nothing more, nobody hears it twice.
    await h.sql.query('UPDATE events SET reward_done_at = NULL WHERE id = $1', [ev.id]);
    await until(async () => (await doneOf(ev.id)).reward_done_at !== null);
    assert.equal((await doneOf(ev.id)).reward_given, 2);
    const rows = await h.sql.query('SELECT count(*)::int AS n FROM entitlements WHERE user_id = $1 AND ref = $2', [fan.user.id, `event:${ev.id}`]);
    assert.equal(rows.rows[0].n, 1);
    assert.equal((await notices()).length, 1);
    // Over: the reward stays as it was.
    await refused(reward(ev.id, { sku: null }), 409, /Biten/);
    const audit = await h.sql.query("SELECT detail FROM audit_events WHERE action = 'event.reward' AND (detail->>'event')::bigint = $1", [ev.id]);
    assert.deepEqual(audit.rows.map((x) => [x.detail.sku, x.detail.days]), [['fr-neon', 3]]);
  });

  test('yayından kaldırılan etkinlik ödül vermez; kaldırılan ödül verilmez', async () => {
    const fan = await h.signUp('Gelen');
    const gone = await approved('Kaldırılan Gece');
    await ok(reward(gone.id, { sku: 'bb-candy' }), 'ödül');
    await run(gone, [fan]);
    await ok(call('POST', '/api/admin/events/remove', { id: gone.id, reason: 'Kurallara aykırı' }, boss.session), 'kaldır');
    await until(async () => (await doneOf(gone.id)).reward_done_at !== null);
    assert.equal((await doneOf(gone.id)).reward_given, 0);
    assert.equal((await economy(fan)).items.some((x) => x.source === 'event'), false);

    const plain = await approved('Ödülsüz Gece');
    await ok(reward(plain.id, { sku: 'fr-neon' }), 'ödül');
    assert.equal((await ok(reward(plain.id, { sku: null }), 'ödülü kaldır')).event.reward, null);
    await run(plain, [fan]);
    await ok(call('POST', '/api/events/end', { id: plain.id }, plain.owner.session), 'bitir');
    await wait(500);
    assert.equal((await doneOf(plain.id)).reward_done_at, null);
    assert.equal((await economy(fan)).items.some((x) => x.source === 'event'), false);
  });
});

describe('Görev ödülü', () => {
  test('günlük arama görevini alan, panelin eşyasını Çantam’da bulur; aynı gün ikinci kez almaz', async () => {
    const boss = await h.account(`Görev Yöneticisi ${rnd(2)}`, 'admin');
    const u = await h.signUp('Görevli');
    const friend = await h.signUp('Arkadaş');
    const add = (b, who = boss) => call('POST', '/api/admin/task-rewards', b, who.session);
    await refused(add({ task: 'call', sku: 'bb-candy' }, u), 403);
    await refused(call('GET', '/api/admin/task-rewards', null, u.session), 403);
    await refused(add({ task: 'davet', sku: 'bb-candy' }), 400, /Görev bulunamadı/);
    await refused(add({ task: 'call', sku: 'noble-1' }), 400, /çerçeve, giriş efekti/);
    await refused(add({ task: 'call', sku: 'fr-gold', days: 2 }), 400, /süresiz/);
    const { rule } = await ok(add({ task: 'call', sku: 'bb-candy', days: 1 }), 'ekle');
    await refused(add({ task: 'call', sku: 'bb-candy' }), 409, /zaten var/);
    // The task says what it gives.
    const task = async () => (await ok(call('GET', '/api/me/call-task', null, u.session), 'görev')).task;
    assert.deepEqual((await task()).items.map((x) => [x.sku, x.kind, x.days]), [['bb-candy', 'bubble', 1]]);

    // A video call of two minutes today: the task is done and its reward taken.
    await h.sql.query(
      `INSERT INTO calls (kind, mode, caller, callee, price, status, ref, created_at, started_at, ended_at, minutes, coins)
       VALUES ('call', 'video', $1, $2, 0, 'ended', $3, now() - interval '3 minutes', now() - interval '3 minutes', now() - interval '1 minute', 0, 0)`,
      [u.user.id, friend.user.id, rnd(6)],
    );
    const r = await ok(call('POST', '/api/me/call-task/claim', {}, u.session), 'ödül');
    assert.deepEqual(r.items.map((x) => x.sku), ['bb-candy']);
    const got = await itemIn(u, 'bb-candy');
    assert.deepEqual([got.source, got.origin], ['task', 'Günlük görüntülü arama']);
    const until = Date.parse(got.until);
    assert.ok(Math.abs(until - Date.now() - DAY) < 120_000, '1 gün');
    // Again the same day: nothing more.
    const again = await ok(call('POST', '/api/me/call-task/claim', {}, u.session), 'tekrar');
    assert.deepEqual([again.replay, again.items], [true, []]);
    assert.equal(Date.parse((await itemIn(u, 'bb-candy')).until), until);
    const refs = await h.sql.query("SELECT ref FROM entitlements WHERE user_id = $1 AND source = 'task'", [u.user.id]);
    assert.deepEqual(refs.rows.map((x) => x.ref.replace(/\d{4}-\d{2}-\d{2}/, 'GÜN')), [`task:task-call-GÜN:${rule.id}`]);
    const list = await ok(call('GET', '/api/admin/task-rewards', null, boss.session), 'liste');
    assert.deepEqual(list.rules.map((x) => [x.sku, x.days, x.given, x.taskName]), [['bb-candy', 1, 1, 'Günlük görüntülü arama']]);
    assert.ok(list.items.some((x) => x.sku === 'fr-neon'));

    // Taken away: the task gives it no more; what it gave stays.
    await ok(call('POST', '/api/admin/task-rewards/delete', { id: rule.id }, boss.session), 'kaldır');
    await refused(call('POST', '/api/admin/task-rewards/delete', { id: rule.id }, boss.session), 404);
    assert.deepEqual((await task()).items, []);
    assert.equal((await itemIn(u, 'bb-candy')).source, 'task');
    const audit = (await h.sql.query("SELECT action FROM audit_events WHERE action LIKE 'task_reward.%' ORDER BY id")).rows.map((x) => x.action);
    assert.deepEqual(audit, ['task_reward.create', 'task_reward.delete']);
  });
});
