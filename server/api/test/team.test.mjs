// Similar Ekibi and the Odalar banners (team.mjs): only an admin writes notices; everyone reads everyone's, a
// person also their own; the unread count follows what was seen; a banner shows while it runs and a removed one
// is gone. The banner boards carry the top agencies, receivers and senders (gifts.mjs topBoard).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ BANNER_CACHE_MS: '0', S3_PUBLIC_URL: 'https://cdn.test', AGENCY_JOBS: '0' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];

describe('Similar Ekibi', () => {
  test('yönetici duyuru yazar; herkes okur, kişiye özel olanı yalnız o kişi; okunmamış sayısı', async () => {
    const boss = await signUp('Merkez');
    const a = await signUp('Ayşe');
    const b = await signUp('Burak');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [boss.user.id]);
    const send = (body, s = boss.session) => call('POST', '/api/admin/team', body, s);

    assert.equal(await status(send({ kind: 'event', title: 'Kaçak duyuru' }, a.session)), 403, 'yalnız yönetici');
    assert.equal(await status(call('GET', '/api/admin/team', null, a.session)), 403);

    const image = `https://cdn.test/notice/${boss.user.id}/kapak.jpg`;
    const ev = (await ok(send({ kind: 'event', title: 'Hafta sonu PK turnuvası', body: 'Cumartesi 21:00', imageUrl: image, link: '/siralama', bannerDays: 3 }), 'etkinlik')).notice;
    assert.equal(ev.personal, false);
    assert.equal(ev.imageUrl, image);
    const mine = (await ok(send({ kind: 'reward', title: 'Ödülün yüklendi', body: '500 jeton', target: a.user.id }), 'kişisel')).notice;
    assert.equal(mine.personal, true);

    const fa = await ok(call('GET', '/api/team', null, a.session), 'Ayşe');
    assert.deepEqual(fa.notices.map((n) => n.title), ['Ödülün yüklendi', 'Hafta sonu PK turnuvası']);
    assert.equal(fa.unread, 2);
    const fb = await ok(call('GET', '/api/team', null, b.session), 'Burak');
    assert.deepEqual(fb.notices.map((n) => n.title), ['Hafta sonu PK turnuvası'], 'başkasının kişisel duyurusu görünmez');
    assert.equal(fb.unread, 1);

    // Seen up to the newest: nothing new. A made-up id is held to the newest one, so the next notice still counts.
    assert.equal((await ok(call('POST', '/api/team/seen', { upTo: '999999999' }, a.session), 'okundu')).unread, 0);
    await ok(send({ kind: 'rule', title: 'Yeni oda kuralları' }), 'kural');
    assert.equal((await ok(call('GET', '/api/team/unread', null, a.session), 'sayı')).unread, 1);
    assert.equal((await ok(call('GET', '/api/team/unread', null, b.session), 'sayı')).unread, 2);
    assert.equal(await status(call('POST', '/api/team/seen', { upTo: 5 }, a.session)), 400);

    // Pages: before an id.
    const older = await ok(call('GET', `/api/team?before=${mine.id}`, null, a.session), 'sayfa');
    assert.deepEqual(older.notices.map((n) => n.id), [ev.id]);

    // The banner runs in Odalar; a removed notice is gone everywhere.
    const banners = await ok(call('GET', '/api/room-banners', null, b.session), 'banner');
    assert.deepEqual(banners.events.map((e) => e.title), ['Hafta sonu PK turnuvası']);
    assert.ok(Date.parse(banners.events[0].endsAt) > Date.now() + 2 * 86_400_000);
    const list = await ok(call('GET', '/api/admin/team', null, boss.session), 'liste');
    assert.equal(list.notices.find((n) => n.id === mine.id).target.name, 'Ayşe');
    await ok(call('POST', '/api/admin/team/remove', { id: ev.id }, boss.session), 'kaldır');
    assert.equal(await status(call('POST', '/api/admin/team/remove', { id: ev.id }, boss.session)), 404);
    assert.deepEqual((await ok(call('GET', '/api/room-banners', null, b.session), 'banner')).events, []);
    assert.ok(!(await ok(call('GET', '/api/team', null, b.session), 'akış')).notices.some((n) => n.id === ev.id));
  });

  test('geçersiz duyurular reddedilir', async () => {
    const boss = await signUp('Merkez2');
    const a = await signUp('Can');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [boss.user.id]);
    const send = (body) => status(call('POST', '/api/admin/team', { kind: 'notice', title: 'Duyuru', ...body }, boss.session));
    assert.equal(await send({ kind: 'reklam' }), 400, 'tür');
    assert.equal(await send({ title: 'x' }), 400, 'kısa başlık');
    assert.equal(await send({ link: 'https://baska.site' }), 400, 'dış bağlantı');
    assert.equal(await send({ link: '//baska.site' }), 400, 'dış bağlantı');
    assert.equal(await send({ imageUrl: 'https://baska.site/a.jpg' }), 400, 'yabancı görsel');
    assert.equal(await send({ bannerDays: 31 }), 400, 'uzun banner');
    assert.equal(await send({ bannerDays: 2, target: a.user.id }), 400, 'kişisel banner');
    assert.equal(await send({ target: '00000000-0000-4000-8000-000000000000' }), 404, 'olmayan kişi');
    assert.equal(await send({ link: '/oda/abc?x=1' }), 200, 'uygulama içi yol');
  });

  test('banner sıralamaları: günün ajansı, en çok hediye alan ve atan', async () => {
    const boss = await signUp('Merkez3');
    const owner = await signUp('Ajans Sahibi');
    const star = await signUp('Yayıncı Ece');
    const fan = await signUp('Cömert Fan');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [boss.user.id]);
    await h.sql.query("UPDATE users SET gender = 'Kadın' WHERE id = $1", [star.user.id]);
    const agency = (await ok(call('POST', '/api/admin/agency/create', { name: 'Deniz Ajans', owner: owner.user.id }, boss.session), 'ajans')).agency;
    await ok(call('POST', '/api/admin/agency/assign', { streamer: star.user.id, agencyId: agency.id, reason: 'Sözleşme imzalandı' }, boss.session), 'atama');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, fan.session), 'yükleme');
    await ok(call('POST', '/api/gifts/send', { to: star.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, fan.session), 'hediye');

    const { boards } = await ok(call('GET', '/api/room-banners', null, fan.session), 'banner');
    for (const p of ['day', 'week', 'month']) {
      assert.equal(boards.agency[p][0].agency.name, 'Deniz Ajans', p);
      assert.equal(boards.agency[p][0].score, 200);
      assert.equal(boards.charm[p][0].user.id, star.user.id);
      assert.equal(boards.wealth[p][0].user.id, fan.user.id);
      assert.ok(boards.charm[p].length <= 3);
    }
    const rows = (await ok(call('GET', '/api/rankings?board=agency&period=week', null, fan.session), 'sıralama')).rows;
    assert.deepEqual(rows[0], { rank: 1, agency: { id: agency.id, name: 'Deniz Ajans', avatarUrl: null }, score: 200 });
    assert.equal(await status(call('GET', '/api/rankings?board=constructor', null, fan.session)), 400);
  });
});
