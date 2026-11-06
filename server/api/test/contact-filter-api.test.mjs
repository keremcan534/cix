// The contact filter at every place people write for others (contact-filter.mjs, core.mjs assertClean), against
// a real Postgres (harness.mjs): a text with a phone number, IBAN, e-mail, link or social media account is
// refused with 400 { code: 'contact_blocked', category }, ordinary text still goes through, each refusal is
// counted for staff without its text (the app's own refusals too, POST /api/contact/refusals), and the places
// that are not filtered (withdrawal details, reports, receipts, staff tools) still take contact details.
// The automatic mute is off here (AUTO_MUTE_REFUSALS=0), which is checked too; it has its own file
// (contact-auto-mute.test.mjs).
//   POSTGRES_PASSWORD=… node --test test/contact-filter-api.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CONTACT_MESSAGE } from '../contact-filter.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ LOCK_DAYS_STORE: '0', TEST_TOPUP_DAILY: '1000000', AGENCY_JOBS: '0', AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const ref = () => `c${rnd(8)}`;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, msg = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${msg} ${j.error ?? ''}`);
  return j;
};
/** A contact_blocked refusal of `category` (and `field`, when given). */
const blocked = async (p, category, field) => {
  const [st, j] = await p;
  assert.equal(st, 400, JSON.stringify(j));
  assert.equal(j.code, 'contact_blocked', JSON.stringify(j));
  assert.equal(j.error, CONTACT_MESSAGE);
  assert.equal(j.category, category, JSON.stringify(j));
  if (field) assert.equal(j.field, field);
  return j;
};
const refusals = (user) => q('SELECT category, place FROM contact_refusals WHERE user_id = $1 ORDER BY id', [user.user.id]);

let a, b, c, admin;
const dm = (text, from = a, to = b) => call('POST', '/api/messages', { to: to.user.id, text, ref: ref() }, from.session);
const patchMe = (body, who = a) => call('PATCH', '/api/me', body, who.session);

describe('iletişim filtresi: uçlar', () => {
  test('hazırlık', async () => {
    [a, b, c, admin] = await Promise.all(['Ayşe', 'Burak', 'Cem', 'Merkez'].map((n) => signUp(n)));
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  });

  test('mesaj: iletişim bilgisi reddedilir, sıradan mesaj gider', async () => {
    await ok(dm('Selam! Akşam odaya gelecek misin? 21.30 gibi başlıyoruz'));
    await blocked(dm('beni ara 0532 123 45 67'), 'phone', 'text');
    await blocked(dm('TR33 0006 1005 1978 6457 8413 26 buraya at'), 'iban');
    await blocked(dm('ayse@gmail.com yaz'), 'email');
    await blocked(dm('instadan yaz bana'), 'social');
    await blocked(dm('w w w . o r n e k . c o m'), 'link');
    const sent = await q('SELECT body FROM messages WHERE sender = $1', [a.user.id]);
    assert.deepEqual(sent.map((m) => m.body), ['Selam! Akşam odaya gelecek misin? 21.30 gibi başlıyoruz'], 'reddedilen mesaj kaydedilmez');
  });

  test('mesaj: parça parça yazılan numara son parçada durur', async () => {
    for (const part of ['0532', '123', '45']) await ok(dm(part, a, c), part);
    await blocked(dm('67', a, c), 'phone', 'text');
    // A word in between ends the run; the other person's messages and other conversations don't count.
    await ok(dm('naber', a, c));
    await ok(dm('67', a, c));
    for (const part of ['0532', '123']) await ok(dm(part, c, a), part);
    await ok(dm('45', a, b), 'başka bir sohbet');
    await ok(dm('67', c, b), 'başka bir gönderen');
    const places = (await refusals(a)).map((r) => r.place);
    assert.ok(places.includes('dm.sequence'), places.join());
  });

  test('profil: ad, kullanıcı adı, şehir, hakkında', async () => {
    await blocked(patchMe({ bio: 'wp: 0532 123 45 67' }), 'phone', 'bio');
    await blocked(patchMe({ name: 'Ayşe insta: ayse' }), 'social', 'name');
    await blocked(patchMe({ username: 'insta_ayse' }), 'social', 'username');
    await blocked(patchMe({ username: 'ayse05321234567' }), 'phone', 'username');
    await blocked(patchMe({ city: 'www.ayse.com' }), 'link', 'city');
    // One refused field changes nothing, not even the fields that passed.
    await blocked(patchMe({ name: 'Ayşe Yılmaz', bio: 'snapim ayse' }), 'social', 'bio');
    assert.equal((await ok(call('GET', '/api/me', null, a.session))).user.name, 'Ayşe');
    const u = (await ok(patchMe({ name: 'Ayşe Yılmaz', username: 'ayse.yilmaz', city: 'İzmir', bio: 'Müzik ve kitap. 1998 doğumluyum, 3 kedim var.' }))).user;
    assert.deepEqual([u.name, u.username, u.city, u.bio], ['Ayşe Yılmaz', 'ayse.yilmaz', 'İzmir', 'Müzik ve kitap. 1998 doğumluyum, 3 kedim var.']);
  });

  test('giriş: iletişim bilgisi olan ad yerine "Yeni üye"', async () => {
    const [st, j] = await call('POST', '/api/auth/dev', { deviceKey: rnd(24), name: 'instagram ayse_99' });
    assert.equal(st, 200, j.error);
    assert.equal(j.user.name, 'Yeni üye');
    assert.deepEqual(await q('SELECT category, place FROM contact_refusals WHERE user_id = $1', [j.user.id]), [{ category: 'social', place: 'signin.name' }]);
  });

  let room;
  test('oda: ad, duyuru, güncelleme, susturma gerekçesi', async () => {
    await blocked(call('POST', '/api/rooms', { title: 'ig: @ayse' }, a.session), 'handle', 'title');
    await blocked(call('POST', '/api/rooms', { title: 'Gece Sohbeti', announcement: 'Ödemeyi papara ile at' }, a.session), 'payment', 'announcement');
    room = (await ok(call('POST', '/api/rooms', { title: 'Gece Sohbeti', announcement: 'Herkese açık, saygılı olalım' }, a.session))).room;
    await blocked(call('POST', '/api/rooms/update', { id: room.id, title: 'discord sunucum' }, a.session), 'social', 'title');
    await blocked(call('POST', '/api/rooms/update', { id: room.id, announcement: 'bit.ly/abc ye gelin' }, a.session), 'link', 'announcement');
    await ok(call('POST', '/api/rooms/update', { id: room.id, title: 'Gece Sohbeti 2', announcement: 'Saat 22.00 karaoke' }, a.session));
    await blocked(
      call('POST', '/api/rooms/mute', { room: room.id, user: b.user.id, kind: 'text', minutes: 10, description: 'itiraz için 0532 123 45 67 ara' }, a.session),
      'phone',
      'description',
    );
    await ok(call('POST', '/api/rooms/mute', { room: room.id, user: b.user.id, kind: 'text', minutes: 10, description: 'Sohbeti bölüyor' }, a.session));
  });

  test('ajans: başvuru adı ve bölgesi, katılım notu, karar notu, transfer gerekçesi', async () => {
    const T = (await ok(call('POST', '/api/admin/agency/create', { name: 'Yıldız Ajans', owner: b.user.id }, admin.session))).agency;
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [T.id]))[0].code;
    await blocked(call('POST', '/api/agency/apply', { name: 'Deniz Ajans wp 0532 123 45 67' }, c.session), 'phone', 'name');
    await blocked(call('POST', '/api/agency/apply', { name: 'Deniz Ajans', region: 'telegram: denizajans' }, c.session), 'social', 'region');
    await blocked(call('POST', '/api/agency/join', { code, note: 'mailim ayse@hotmail.com' }, c.session), 'email', 'note');
    const join = (await ok(call('POST', '/api/agency/join', { code, note: 'Merhaba, hafta içi her akşam yayındayım' }, c.session))).request;
    await blocked(call('POST', '/api/agency/requests/decide', { id: T.id, requestId: join.id, approve: true, note: 'şu numaraya yaz 0532 123 45 67' }, b.session), 'phone', 'note');
    await ok(call('POST', '/api/agency/requests/decide', { id: T.id, requestId: join.id, approve: true, note: 'Hoş geldin' }, b.session));
    await blocked(call('POST', '/api/agency/transfer', { reason: 'ödemeyi TR33 0006 1005 1978 6457 8413 26 hesabına yaptılar', toCode: code, ref: ref() }, c.session), 'iban', 'reason');
    await blocked(call('POST', '/api/agency/invite', { id: T.id, user: a.user.id, note: 'instagramdan yaz' }, b.session), 'social', 'note');
    await ok(call('POST', '/api/agency/invite', { id: T.id, user: a.user.id, note: 'Ajansımıza bekleriz' }, b.session));
    await ok(call('POST', '/api/agency/apply', { name: 'Deniz Ajans', region: 'Ege' }, a.session));
  });

  test('filtrelenmeyenler: para çekme bilgisi, şikâyet, yönetim araçları', async () => {
    // Withdrawal details are for the payout and only staff read them.
    for (let i = 0; i < 10; i++) await ok(call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: ref() }, a.session));
    await ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g8', count: 5, ref: ref() }, a.session));
    const w = await ok(
      call('POST', '/api/wallet/withdraw', { diamonds: 50_000, method: 'iban', details: { holder: 'Burak Demir', account: 'TR33 0006 1005 1978 6457 8413 26' }, ref: ref() }, b.session),
    );
    assert.equal(w.withdrawal.status, 'pending');
    // A report has to be able to quote what was said.
    await ok(call('POST', '/api/report', { type: 'user', id: c.user.id, reason: 'Spam', note: 'Bana 0532 123 45 67 yaz, instagram: ayse dedi' }, a.session));
    // Staff tools are not filtered.
    await ok(call('POST', '/api/admin/agency/create', { name: 'Kuzey Ajans (destek: 0850 123 45 67)', owner: admin.user.id }, admin.session));
  });

  test('Jeton Noktası: alıcının okuduğu not filtrelenir, dekont numarası ve yönetimin notu filtrelenmez', async () => {
    const bank = await signUp('Nokta');
    await ok(call('POST', '/api/admin/jeton/bank', { user: bank.user.id, enabled: true }, admin.session));
    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 1000, paymentRef: 'DEKONT-1', note: 'TR33 0006 1005 1978 6457 8413 26 hesabından', ref: ref() }, admin.session));
    const sale = (note) => call('POST', '/api/jeton/transfer', { to: a.user.id, coins: 100, paymentRef: 'TR33 0006 1005 1978 6457 8413 26', note, ref: ref() }, bank.session);
    await blocked(sale('sonraki alım için wp 0532 123 45 67'), 'phone', 'note');
    assert.equal((await ok(sale('Ödemen geldi, teşekkürler'))).transfer.note, 'Ödemen geldi, teşekkürler');
    assert.deepEqual(await refusals(bank), [{ category: 'phone', place: 'jeton.transfer' }]);
  });

  test('uygulamanın kendi retleri: yalnızca tür ve yer gelir, sayılır', async () => {
    // Room and group chats, moments and room polls are refused on the phone; the app reports the kind and place.
    await ok(call('POST', '/api/contact/refusals', { category: 'phone', place: 'room.chat' }, b.session));
    await ok(call('POST', '/api/contact/refusals', { category: 'social', place: 'moment.post' }, b.session));
    await ok(call('POST', '/api/contact/refusals', { category: 'phone', place: 'tayfa.chat.sequence' }, b.session));
    for (const body of [{ category: 'nope', place: 'room.chat' }, { category: 'phone', place: 'withdraw.details' }, { category: 'phone', place: 'Room Chat' }, { category: 'phone' }]) {
      assert.equal((await call('POST', '/api/contact/refusals', body, b.session))[0], 400, JSON.stringify(body));
    }
    assert.equal((await call('POST', '/api/contact/refusals', { category: 'phone', place: 'room.chat' }))[0], 401);
    const places = (await refusals(b)).map((r) => `${r.category}:${r.place}`);
    for (const p of ['phone:room.chat', 'social:moment.post', 'phone:tayfa.chat.sequence']) assert.ok(places.includes(p), places.join());
  });

  test('sayaç: yalnızca kim, ne tür, nerede, ne zaman; metin hiçbir yerde', async () => {
    const cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name = 'contact_refusals' ORDER BY ordinal_position")).map((r) => r.column_name);
    assert.deepEqual(cols, ['id', 'user_id', 'category', 'place', 'created_at']);
    const mine = await refusals(a);
    for (const p of ['dm', 'dm.sequence', 'profile.bio', 'profile.name', 'profile.username', 'profile.city', 'room.title', 'room.announcement', 'room.mute']) {
      assert.ok(mine.some((r) => r.place === p), `${p} sayılmadı`);
    }
    for (const p of ['agency.join', 'agency.name', 'agency.region', 'agency.transfer']) assert.ok((await refusals(c)).some((r) => r.place === p), `${p} sayılmadı`);
    for (const p of ['agency.request', 'agency.invite']) assert.ok((await refusals(b)).some((r) => r.place === p), `${p} sayılmadı`);
    assert.equal((await q("SELECT count(*)::int AS n FROM messages WHERE body LIKE '%0532%' AND length(body) > 4")).at(0).n, 0);

    const view = await ok(call('GET', `/api/admin/sanctions/user?id=${a.user.id}`, null, admin.session));
    const r = view.contactRefusals;
    assert.equal(r.total, mine.length);
    assert.equal(r.last7Days, mine.length);
    assert.equal(r.byCategory.phone, mine.filter((x) => x.category === 'phone').length);
    assert.equal(r.byPlace.dm, mine.filter((x) => x.place === 'dm').length);
    assert.ok(r.lastAt);
    // With AUTO_MUTE_REFUSALS=0 the rule is off: many refusals, no sanction, no warning.
    assert.ok(mine.length >= 5, String(mine.length));
    assert.equal(view.sanctions.length, 0);
    const more = await blocked(patchMe({ bio: 'wp 0532 123 45 67' }), 'phone', 'bio');
    assert.equal(more.strikesLeft, undefined);
    assert.equal(more.muted, undefined);
    assert.deepEqual(await ok(call('POST', '/api/contact/refusals', { category: 'phone', place: 'room.chat' }, a.session)), { counted: true });
    // Moderators only.
    assert.equal((await call('GET', `/api/admin/sanctions/user?id=${a.user.id}`, null, b.session))[0], 403);
  });

  test('hesap silinince sayaç da silinir', async () => {
    await ok(call('DELETE', '/api/me', null, c.session));
    assert.equal((await refusals(c)).length, 0);
  });
});
