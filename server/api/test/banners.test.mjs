// Banner Yönetimi (banners.mjs) against a real Postgres: the owners' three examples come with the migration; admins
// add, change, switch, order and remove banners; the phones get the live ones in order (a newer app apart, an older
// one as notice slides); views and taps count once a day per person; only admins manage them.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ BANNER_CACHE_MS: '0' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('Banner Yönetimi', () => {
  let admin, user;
  const list = async () => (await ok(call('GET', '/api/admin/banners', null, admin.session), 'liste')).banners;
  const phone = async (s = user.session) => (await ok(call('GET', '/api/room-banners?banners=1', null, s), 'banner')).banners;
  const save = (b) => call('POST', '/api/admin/banners', b, admin.session);

  test('örnek üç banner hazır; yeni uygulama ayrı, eski uygulama duyuru kartı olarak alır', async () => {
    admin = await signUp('Yönetici');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    user = await signUp('Kullanıcı');
    const live = await phone();
    assert.deepEqual(live.map((b) => b.art), ['ornek-hediye-alanlar', 'ornek-hediye-gonderenler', 'ornek-zirvedeki-ajanslar']);
    assert.deepEqual(Object.keys(live[0]).sort(), ['accent', 'art', 'cta', 'endsAt', 'id', 'imageUrl', 'link', 'showText', 'subtitle', 'title']);
    const old = await ok(call('GET', '/api/room-banners', null, user.session), 'eski');
    assert.equal(old.banners, undefined, 'eski uygulamaya yeni alan gitmez');
    const slides = old.events.filter((e) => e.id.startsWith('b'));
    assert.equal(slides.length, 3);
    assert.deepEqual(Object.keys(slides[0]).sort(), ['body', 'createdAt', 'endsAt', 'id', 'imageUrl', 'kind', 'link', 'personal', 'title']);
    assert.equal(slides[0].kind, 'event');
    assert.ok(old.boards.agency, 'sıralamalar yine gelir');
    const all = await list();
    assert.deepEqual(all.map((b) => b.state), ['live', 'live', 'live']);
  });

  test('yalnız yönetici; eksik ya da yanlış alan reddedilir', async () => {
    assert.equal((await call('GET', '/api/admin/banners', null, user.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/banners', { title: 'X', art: 'ornek-hediye-alanlar' }, user.session))[0], 403);
    const bad = async (b, re) => {
      const [st, j] = await save(b);
      assert.equal(st, 400, JSON.stringify(b));
      assert.match(j.error, re);
    };
    await bad({ title: 'A', art: 'ornek-hediye-alanlar' }, /Başlık/);
    await bad({ title: 'Görselsiz' }, /görsel/);
    await bad({ title: 'Düğmeli', art: 'ornek-hediye-alanlar', cta: 'Git' }, /bağlantısı olmalı/);
    await bad({ title: 'Dış bağlantı', art: 'ornek-hediye-alanlar', link: 'https://ornek.com' }, /uygulamada bir yol/);
    await bad({ title: 'Ters tarih', art: 'ornek-hediye-alanlar', startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' }, /Bitiş başlangıçtan sonra/);
    await bad({ title: 'Geçmiş', art: 'ornek-hediye-alanlar', endsAt: '2020-01-01T00:00:00Z' }, /geçmişte/);
    await bad({ title: 'Renk', art: 'ornek-hediye-alanlar', accent: 'kirmizi' }, /Renk/);
  });

  test('taslak, açma, planlı, süresi dolan; sıralama ve kaldırma; her değişiklik denetime yazılır', async () => {
    const d = (await ok(save({ title: 'VIP Avantajları', subtitle: 'Yeni ayrıcalıklar', cta: 'İncele', link: '/vip', art: 'ornek-zirvedeki-ajanslar', accent: 'pembe' }), 'taslak')).banner;
    assert.equal(d.state, 'draft');
    assert.ok(!(await phone()).some((b) => b.id === d.id), 'taslak görünmez');
    const on = (await ok(call('POST', '/api/admin/banners/toggle', { id: d.id, enabled: true }, admin.session), 'aç')).banner;
    assert.equal(on.state, 'live');
    assert.equal((await phone()).at(-1).id, d.id, 'yeni banner sona eklenir');
    const off = (await ok(call('POST', '/api/admin/banners/toggle', { id: d.id, enabled: false }, admin.session), 'kapat')).banner;
    assert.equal(off.state, 'off', 'bir kez açılmış kapalı banner taslak değil, pasif');

    const later = new Date(Date.now() + 86_400_000).toISOString();
    const plan = (await ok(save({ title: 'Doğum Günü Partisi', art: 'ornek-hediye-alanlar', startsAt: later, endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), enabled: true }), 'planlı')).banner;
    assert.equal(plan.state, 'scheduled');
    assert.ok(!(await phone()).some((b) => b.id === plan.id), 'zamanı gelmemiş görünmez');
    await q("UPDATE banners SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' WHERE id = $1", [plan.id]);
    assert.equal((await list()).find((b) => b.id === plan.id).state, 'expired');
    assert.ok(!(await phone()).some((b) => b.id === plan.id), 'süresi dolan görünmez');

    // Changing a banner keeps what isn't sent.
    const changed = (await ok(save({ id: d.id, title: 'VIP Üyelik Avantajları', enabled: true }), 'düzenle')).banner;
    assert.deepEqual([changed.title, changed.subtitle, changed.cta, changed.link, changed.accent, changed.state], ['VIP Üyelik Avantajları', 'Yeni ayrıcalıklar', 'İncele', '/vip', 'pembe', 'live']);

    const ids = (await list()).map((b) => b.id);
    const reversed = [...ids].reverse();
    const ordered = (await ok(call('POST', '/api/admin/banners/order', { ids: reversed }, admin.session), 'sırala')).banners;
    assert.deepEqual(ordered.map((b) => b.id), reversed);
    assert.equal((await phone())[0].id, d.id, 'telefonda yeni sırayla');
    assert.equal((await call('POST', '/api/admin/banners/order', { ids: reversed.slice(1) }, admin.session))[0], 409, 'eksik liste reddedilir');

    await ok(call('POST', '/api/admin/banners/remove', { id: d.id }, admin.session), 'kaldır');
    assert.ok(!(await list()).some((b) => b.id === d.id));
    assert.ok(!(await phone()).some((b) => b.id === d.id));
    assert.equal((await call('POST', '/api/admin/banners/remove', { id: d.id }, admin.session))[0], 404);
    const actions = (await q("SELECT action FROM audit_events WHERE action LIKE 'banner.%' ORDER BY id")).rows.map((r) => r.action);
    assert.deepEqual([...new Set(actions)].sort(), ['banner.create', 'banner.order', 'banner.remove', 'banner.toggle', 'banner.update']);
  });

  test('görüntülenme ve tıklama kişi başına günde bir kez sayılır', async () => {
    const [first] = await phone();
    const other = await signUp('Başka');
    for (let i = 0; i < 3; i++) await ok(call('POST', '/api/banners/seen', { ids: [first.id] }, user.session), 'gördü');
    await ok(call('POST', '/api/banners/seen', { ids: [first.id] }, other.session), 'başkası gördü');
    await ok(call('POST', '/api/banners/click', { id: first.id }, user.session), 'tıkladı');
    await ok(call('POST', '/api/banners/click', { id: first.id }, user.session), 'yine tıkladı');
    const stats = await ok(call('GET', '/api/admin/banners/stats?days=7', null, admin.session), 'istatistik');
    const row = stats.rows.find((r) => r.id === first.id);
    assert.deepEqual([row.views, row.clicks], [2, 1]);
    const inList = (await list()).find((b) => b.id === first.id);
    assert.deepEqual([inList.views7, inList.clicks7], [2, 1]);
    assert.equal((await call('POST', '/api/banners/seen', { ids: [first.id] }))[0], 401);
  });
});
