// Aile, the rest (family-more.mjs) against a real Postgres: daily tasks from what members really did, the check-in,
// gifts from the family chat, the weekly chests (reward coins once per person and week), the leader's tag and theme.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const topUp = (s, amount = 1000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s), 'yükleme');
const overview = (s) => ok(call('GET', '/api/family/overview', null, s), 'özet');
const task = (o, id) => o.tasks.find((t) => t.id === id);

/** A family with its leader and one member (open join). */
async function familyOf(name) {
  const lead = await signUp(`${name} Lider`);
  await topUp(lead.session);
  const { family } = await ok(call('POST', '/api/families', { name: `${name} ${rnd(2)}`, ref: rnd(6) }, lead.session), 'kur');
  await ok(call('POST', '/api/family/settings', { joinMode: 'open' }, lead.session), 'açık');
  const member = await signUp(`${name} Üye`);
  assert.deepEqual(await ok(call('POST', '/api/family/join', { id: family.id }, member.session), 'katıl'), { joined: true });
  return { family, lead, member };
}

describe('Aile görevleri ve sandıklar', () => {
  test('görevler gerçek kayıtlardan sayılır, yoklama günde bir', async () => {
    const { lead, member } = await familyOf('Görev');
    let o = await overview(lead.session);
    assert.equal(o.tasks.length, 7);
    assert.ok(o.tasks.every((t) => t.progress === 0 && !t.done && t.points === 0 && t.doneBy === 0));
    assert.deepEqual([o.checkedIn, o.active, o.room, o.me.points], [false, 0, null, 0]);
    assert.ok(o.rank >= 1);

    await ok(call('POST', '/api/family/chat', { text: 'Günaydın aile' }, lead.session), 'sohbet');
    await ok(call('POST', '/api/family/checkin', {}, lead.session), 'yoklama');
    await ok(call('POST', '/api/family/checkin', {}, lead.session), 'yoklama tekrar');
    o = await overview(lead.session);
    assert.deepEqual([task(o, 'k-chat').progress, task(o, 'k-chat').done, task(o, 'k-checkin').progress, o.checkedIn], [1, true, 1, true]);
    assert.equal(o.me.points, 2, 'iki görev, ikişer değil birer puan');
    assert.equal(task(o, 'k-chat').doneBy, 1);
    assert.equal(o.active, 1);

    // The family room: the leader's open room; minutes in it count (the presence log), 15 for the task.
    const room = (await ok(call('POST', '/api/rooms', { title: `Aile odası ${rnd(2)}` }, lead.session), 'oda')).room;
    await h.sql.query("INSERT INTO presence_log (user_id, room, joined_at, left_at, seconds) VALUES ($1, $2, now() - interval '20 minutes', now(), 1200)", [member.user.id, `oda-${room.id}`]);
    o = await overview(member.session);
    assert.equal(o.room.id, room.id);
    assert.deepEqual([task(o, 'k-room').progress, task(o, 'k-room').done], [20, true]);

    // Strangers see nothing and can't check in.
    const stranger = await signUp('Yabancı');
    assert.equal((await call('GET', '/api/family/overview', null, stranger.session))[0], 403);
    assert.equal((await call('POST', '/api/family/checkin', {}, stranger.session))[0], 403);
  });

  test('aile sohbetinden hediye: yalnızca aileden birine, sohbette görünür, Gelir ayrı sayar', async () => {
    const { lead, member } = await familyOf('Hediye');
    await topUp(member.session, 5000);
    const stranger = await signUp('Dışarıdan');
    const [st] = await call('POST', '/api/gifts/send', { to: stranger.user.id, giftId: 'g2', count: 1, place: 'family', ref: rnd(6) }, member.session);
    assert.equal(st, 403, 'aile dışına aile sohbetinden hediye yok');
    assert.equal((await me(member.session)).coins, 5000, 'reddedilen hediye jeton almaz');

    await ok(call('POST', '/api/gifts/send', { to: lead.user.id, giftId: 'g2', count: 10, place: 'family', ref: rnd(6) }, member.session), 'hediye');
    await ok(call('POST', '/api/gifts/send', { to: lead.user.id, giftId: 'c9', count: 1, ref: rnd(6) }, member.session), 'ikili hediye');
    const chat = await ok(call('GET', '/api/family/chat', null, lead.session), 'sohbet');
    assert.ok(chat.messages.some((m) => m.author.id === member.user.id && m.text.includes('Kalp ×10')), 'sohbette görünür');
    const o = await overview(member.session);
    assert.deepEqual([task(o, 'k-chatgift').progress, task(o, 'k-chatgift').points], [500, 2], '400 jetonda 2 puan');
    assert.deepEqual([task(o, 'k-cp').progress, task(o, 'k-cp').points], [777, 4], 'İkili hediyesi 350 jetonda 2 puan');
    assert.equal(task(o, 'k-newbie').progress, 2, 'yeni üyeye hediye');
    assert.equal(o.me.gifts, 1277);
    assert.equal(o.highlights[0].id, member.user.id);
    const income = await ok(call('GET', '/api/wallet/income?period=all', null, lead.session), 'gelir');
    assert.equal(income.sources.find((x) => x.key === 'family').diamonds, 500);
  });

  test('sandık: haftası yetince, katkı verene, kişi başı haftada bir, ödül jetonu', async () => {
    const { family, lead, member } = await familyOf('Sandık');
    const late = await signUp('Hiç katkısız');
    await ok(call('POST', '/api/family/join', { id: family.id }, late.session), 'katıl');
    assert.equal((await call('POST', '/api/family/chest', { chest: 'c1', ref: rnd(6) }, lead.session))[0], 409, 'hafta yetmedi');
    assert.equal((await call('POST', '/api/family/chest', { chest: 'yok', ref: rnd(6) }, lead.session))[0], 400);

    await topUp(member.session, 10000);
    await topUp(member.session, 5000);
    await ok(call('POST', '/api/gifts/send', { to: lead.user.id, giftId: 'g5', count: 25, place: 'family', ref: rnd(6) }, member.session), 'hediye');
    let o = await overview(lead.session);
    assert.equal(o.week.power, 12_500);
    assert.deepEqual(o.chests.map((c) => [c.id, c.reached, c.claimed]), [['c1', true, false], ['c2', false, false], ['c3', false, false], ['c4', false, false]]);
    assert.equal(o.bonus.pool, Math.round(12_500 * o.bonus.rate));

    // The leader did nothing yet this week (the founding fee is no gift): no chest.
    assert.equal((await call('POST', '/api/family/chest', { chest: 'c1', ref: rnd(6) }, lead.session))[0], 409, 'katkı yok');
    await ok(call('POST', '/api/family/checkin', {}, lead.session), 'yoklama');
    const before = (await me(lead.session)).coins;
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => call('POST', '/api/family/chest', { chest: 'c1', ref }, lead.session)));
    assert.deepEqual(both.map((x) => x[0]), [200, 200], JSON.stringify(both.map((x) => x[1].error)));
    assert.equal(both[0][1].coins, 20);
    assert.equal((await me(lead.session)).coins, before + 20, 'bir kez');
    assert.equal((await call('POST', '/api/family/chest', { chest: 'c1', ref: rnd(6) }, lead.session))[0], 409, 'bu hafta zaten açtı');
    assert.equal((await call('POST', '/api/family/chest', { chest: 'c2', ref: rnd(6) }, lead.session))[0], 409, 'ikinci sandığa yetmedi');
    o = await overview(lead.session);
    assert.equal(o.chests[0].claimed, true);
    const reward = await h.sql.query("SELECT sum(remaining)::int AS n FROM coin_lots WHERE user_id = $1 AND channel = 'odul'", [lead.user.id]);
    assert.equal(reward.rows[0].n, 20, 'ödül jetonu: yalnızca mağazada');

    // The member who gave gifts opens it too; the one who did nothing can't.
    await ok(call('POST', '/api/family/chest', { chest: 'c1', ref: rnd(6) }, member.session), 'üye sandığı');
    assert.equal((await call('POST', '/api/family/chest', { chest: 'c1', ref: rnd(6) }, late.session))[0], 409);

    // Leaving and joining another family doesn't open this week's chest again.
    const other = await familyOf('Öbür');
    await topUp(other.member.session, 10000);
    await topUp(other.member.session, 5000);
    await ok(call('POST', '/api/gifts/send', { to: other.lead.user.id, giftId: 'g5', count: 25, place: 'family', ref: rnd(6) }, other.member.session), 'öbür hediye');
    await ok(call('POST', '/api/family/leave', {}, member.session), 'ayrıl');
    await ok(call('POST', '/api/family/join', { id: other.family.id }, member.session), 'öbürüne katıl');
    await ok(call('POST', '/api/family/checkin', {}, member.session), 'yeni ailede yoklama');
    const [again, why] = await call('POST', '/api/family/chest', { chest: 'c1', ref: rnd(6) }, member.session);
    assert.equal(again, 409);
    assert.match(why.error, /zaten/, 'haftada bir, hangi ailede olursa');
  });

  test('etiket ve tema: lider seçer, tema aile seviyesiyle açılır', async () => {
    const { lead, member } = await familyOf('Tema');
    const j = await ok(call('POST', '/api/family/settings', { tag: 'SC1', theme: 'ates' }, lead.session), 'etiket');
    assert.deepEqual([j.family.tag, j.family.theme], ['SC1', 'ates']);
    assert.equal((await call('POST', '/api/family/settings', { tag: 'BİZ' }, member.session))[0], 403, 'üye değiştiremez');
    assert.equal((await call('POST', '/api/family/settings', { tag: 'a-b' }, lead.session))[0], 400, 'yalnızca harf ve rakam');
    assert.equal((await call('POST', '/api/family/settings', { tag: 'çokuzunetiket' }, lead.session))[0], 400, 'en fazla 8');
    assert.equal((await call('POST', '/api/family/settings', { theme: 'orman' }, lead.session))[0], 403, 'Lv.4 tema');
    assert.equal((await call('POST', '/api/family/settings', { theme: 'yok' }, lead.session))[0], 400);
    const view = (await call('GET', '/api/family', null, member.session))[1].family;
    assert.deepEqual([view.tag, view.theme], ['SC1', 'ates']);
    await ok(call('POST', '/api/family/settings', { tag: '' }, lead.session), 'etiketi kaldır');
  });

  test('davet: lider ya da yardımcı davet eder, davetli kabul edince katılır; çevrim içi üyeler; aile şikâyeti', async () => {
    const { family, lead, member } = await familyOf('Davet');
    const guest = await signUp('Davetli');
    const other = await signUp('Öteki');
    assert.equal((await call('POST', '/api/family/invite', { userId: guest.user.id }, member.session))[0], 403, 'üye davet edemez');
    await ok(call('POST', '/api/family/invite', { userId: guest.user.id }, lead.session), 'davet');
    await ok(call('POST', '/api/family/invite', { userId: guest.user.id }, lead.session), 'tekrar davet');
    assert.equal((await call('POST', '/api/family/invite', { userId: member.user.id }, lead.session))[0], 409, 'ailesi olan davet edilmez');
    const inv = await ok(call('GET', '/api/family/invites', null, guest.session), 'davetler');
    assert.deepEqual(inv.invites.map((x) => [x.family.id, x.by.id]), [[family.id, lead.user.id]]);
    assert.equal((await call('POST', '/api/family/invite/answer', { id: family.id, accept: true }, other.session))[0], 404, 'davetsiz katılınmaz');
    assert.deepEqual(await ok(call('POST', '/api/family/invite/answer', { id: family.id, accept: true }, guest.session), 'kabul'), { joined: true });
    assert.equal((await ok(call('GET', '/api/family', null, guest.session), 'aile')).family.id, family.id);
    assert.equal((await ok(call('GET', '/api/family/invites', null, guest.session), 'davetler')).invites.length, 0, 'katılınca davetler düşer');

    await ok(call('POST', '/api/family/invite', { userId: other.user.id }, lead.session), 'ikinci davet');
    assert.deepEqual(await ok(call('POST', '/api/family/invite/answer', { id: family.id, accept: false }, other.session), 'ret'), { joined: false });
    assert.equal((await ok(call('GET', '/api/family/invites', null, other.session), 'davetler')).invites.length, 0);

    // The members signed in a moment ago are online (Birlikte oynuyor), myself not listed.
    const o = await overview(lead.session);
    assert.ok(o.online.some((x) => x.id === member.user.id && x.room === null));
    assert.ok(!o.online.some((x) => x.id === lead.user.id));

    const [st] = await call('POST', '/api/report', { type: 'family', id: String(family.id), reason: 'Uygunsuz ad' }, other.session);
    assert.equal(st, 200, 'aile şikâyet edilebilir');
  });
});

