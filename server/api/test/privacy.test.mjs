// Gizlilik and "Kimler ulaşabilir" (privacy.mjs) against a real Postgres: the settings are kept per person, and
// each one is enforced where it applies: messages, calls, invites, online and last seen in people lists, the
// profile details and follow lists, Aile's "Birlikte oynuyor". Arkadaşlarım lists follows both ways.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { inviteRefusal, mayInvite } from '../privacy.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const getPrivacy = async (s) => (await ok(call('GET', '/api/me/privacy', null, s), 'gizlilik')).privacy;
const setPrivacy = async (s, patch) => (await ok(call('PATCH', '/api/me/privacy', patch, s), 'gizlilik kaydet')).privacy;
const follow = (s, to) => ok(call('POST', '/api/follow', { to }, s), 'takip');
const dm = (s, to, text = 'Merhaba') => call('POST', '/api/messages', { to, text, ref: rnd(6) }, s);
const pair = async (s, other) => (await ok(call('GET', `/api/one-on-one?with=${other}`, null, s), 'birebir')).pair;
const friends = async (s) => (await ok(call('GET', '/api/me/friends', null, s), 'arkadaşlar')).friends;
const awaySince = (u, interval) => q(`UPDATE sessions SET last_seen_at = now() - interval '${interval}' WHERE user_id = $1`, [u.user.id]);
/** An approved agency streamer (a woman). */
async function streamer(name) {
  const a = await signUp(name);
  await q("UPDATE users SET gender = 'Kadın' WHERE id = $1", [a.user.id]);
  const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`G${rnd(3).toUpperCase()}`, `Gizli ${rnd(3)}`])).rows;
  await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [a.user.id, ag.id]);
  return a;
}

describe('Gizlilik ayarları', () => {
  test('varsayılanlar, değiştirmek, geçersiz değer; varsayılana dönen satır silinir, hesapla gider', async () => {
    const a = await signUp('Ayar A');
    assert.deepEqual(await getPrivacy(a.session), {
      profilePublic: true,
      showOnline: true,
      showLastSeen: true,
      showCurrentRoom: true,
      dmFrom: 'everyone',
      callsFrom: 'everyone',
      invitesFrom: 'everyone',
    });
    const p = await setPrivacy(a.session, { showOnline: false, dmFrom: 'mutual' });
    assert.equal(p.showOnline, false);
    assert.equal(p.dmFrom, 'mutual');
    assert.equal(p.callsFrom, 'everyone', 'gönderilmeyen değişmez');
    assert.equal((await call('PATCH', '/api/me/privacy', { dmFrom: 'nobody' }, a.session))[0], 400, 'mesajda "kimse" yok');
    assert.equal((await call('PATCH', '/api/me/privacy', { showOnline: 'hayır' }, a.session))[0], 400);
    assert.equal((await call('PATCH', '/api/me/privacy', { luckyAnnounce: false }, a.session))[0], 400, 'bilinmeyen ayar');
    assert.equal((await call('PATCH', '/api/me/privacy', '{"toString": true, "__proto__": true}', a.session))[0], 400, 'nesnenin kendi alanı değil');
    assert.equal((await call('PATCH', '/api/me/privacy', {}, a.session))[0], 400);
    assert.equal((await getPrivacy(a.session)).dmFrom, 'mutual', 'reddedilen istek bir şey değiştirmez');

    await setPrivacy(a.session, { showOnline: true, dmFrom: 'everyone' });
    assert.equal((await q('SELECT count(*)::int AS n FROM privacy_settings WHERE user_id = $1', [a.user.id])).rows[0].n, 0, 'hepsi varsayılan: satır yok');

    await setPrivacy(a.session, { callsFrom: 'nobody' });
    await ok(call('DELETE', '/api/me', null, a.session), 'hesabı sil');
    assert.equal((await q('SELECT count(*)::int AS n FROM privacy_settings WHERE user_id = $1', [a.user.id])).rows[0].n, 0, 'silinen hesabın ayarı gider');
  });
});

describe('Bana kimler mesaj gönderebilir?', () => {
  test('takip ettiklerim: başkası yazamaz, takip edince yazar; ona yazdığım kişi cevap verebilir', async () => {
    const owner = await signUp('Seçici Selin');
    const stranger = await signUp('Yabancı Yusuf');
    const answered = await signUp('Cevaplı Can');
    await setPrivacy(owner.session, { dmFrom: 'following' });

    const [st, j] = await dm(stranger.session, owner.user.id);
    assert.equal(st, 403);
    assert.equal(j.code, 'privacy');
    assert.equal(j.error, 'Seçici Selin yalnızca takip ettiği kişilerden mesaj alıyor.');
    assert.equal((await q('SELECT count(*)::int AS n FROM messages WHERE sender = $1', [stranger.user.id])).rows[0].n, 0);

    await follow(owner.session, stranger.user.id);
    await ok(dm(stranger.session, owner.user.id), 'takip edilen yazar');

    await ok(dm(owner.session, answered.user.id, 'Selam Can'), 'sahibi yazar');
    await ok(dm(answered.session, owner.user.id, 'Selam Selin'), 'cevap verilir');
  });

  test('karşılıklı takip: tek taraflı takip yetmez; engel her iki yönde', async () => {
    const owner = await signUp('Karşılıklı Kerem');
    const fan = await signUp('Hayran Hale');
    await setPrivacy(owner.session, { dmFrom: 'mutual' });
    await follow(owner.session, fan.user.id);
    const [st, j] = await dm(fan.session, owner.user.id);
    assert.equal(st, 403);
    assert.equal(j.error, 'Karşılıklı Kerem yalnızca karşılıklı takipleştiği kişilerden mesaj alıyor.');
    await follow(fan.session, owner.user.id);
    await ok(dm(fan.session, owner.user.id), 'karşılıklı');
  });
});

describe('Beni kimler arayabilir?', () => {
  test('kimse: aramalar kapalı ve nedeni yazar; takip ettiklerim: geri arama 24 saat açık', async () => {
    const star = await streamer('Yıldız Yaren');
    const man = await signUp('Arayan Arda');
    await q("UPDATE users SET gender = 'Erkek' WHERE id = $1", [man.user.id]);
    await ok(call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, man.session), 'yükleme');
    // Heart points enough for both calls.
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'gul', 1, 100000, 100000, 'chat', $3)", [man.user.id, star.user.id, rnd(6)]);
    assert.equal((await pair(man.session, star.user.id)).calls.video.open, true);

    await setPrivacy(star.session, { callsFrom: 'nobody' });
    const p = await pair(man.session, star.user.id);
    assert.equal(p.calls.voice.open, false);
    assert.equal(p.calls.video.why, 'Yıldız Yaren şu an arama kabul etmiyor.');
    const [st, j] = await call('POST', '/api/calls', { to: star.user.id, mode: 'voice', ref: rnd(6) }, man.session);
    assert.equal(st, 403);
    assert.equal(j.error, 'Yıldız Yaren şu an arama kabul etmiyor.');

    await setPrivacy(star.session, { callsFrom: 'following' });
    assert.equal((await pair(man.session, star.user.id)).calls.voice.why, 'Yıldız Yaren yalnızca takip ettiği kişilerden arama alıyor.');
    // She calls him (she doesn't pay); his call back is open for a day.
    const out = await ok(call('POST', '/api/calls', { to: man.user.id, mode: 'voice', ref: rnd(6) }, star.session), 'o arar');
    await ok(call('POST', '/api/calls/end', { id: out.call.id }, star.session), 'kapatır');
    assert.equal((await pair(man.session, star.user.id)).calls.voice.open, true, 'geri arama');
    await q("UPDATE calls SET created_at = now() - interval '25 hours' WHERE id = $1", [out.call.id]);
    assert.equal((await pair(man.session, star.user.id)).calls.voice.open, false, 'bir gün sonra yine kapalı');
    await follow(star.session, man.user.id);
    assert.equal((await pair(man.session, star.user.id)).calls.voice.open, true, 'takip ettiği arar');
  });
});

describe('Beni odalara kimler davet edebilir?', () => {
  test('mayInvite / inviteRefusal: herkes, takip ettiklerim, kimse; engel', async () => {
    const owner = await signUp('Davetli Duru');
    const host = await signUp('Oda Sahibi Ozan');
    assert.equal(await mayInvite(h.sql, host.user.id, owner.user.id), true);
    await setPrivacy(owner.session, { invitesFrom: 'following' });
    assert.equal(await inviteRefusal(h.sql, host.user.id, owner.user.id), 'Davetli Duru yalnızca takip ettiği kişilerden oda daveti alıyor.');
    await follow(owner.session, host.user.id);
    assert.equal(await mayInvite(h.sql, host.user.id, owner.user.id), true);
    await setPrivacy(owner.session, { invitesFrom: 'nobody' });
    assert.equal(await inviteRefusal(h.sql, host.user.id, owner.user.id), 'Davetli Duru oda daveti almıyor.');
    await setPrivacy(owner.session, { invitesFrom: 'everyone' });
    await ok(call('POST', '/api/block', { to: host.user.id, block: true }, owner.session), 'engelle');
    assert.equal(await mayInvite(h.sql, host.user.id, owner.user.id), false, 'engellenen davet edemez');
  });
});

describe('Çevrimiçi, son görülme ve profil', () => {
  test('Arkadaşlarım: iki yönlü takip, önce karşılıklı; çevrimiçi ve son görülme gizlenebilir', async () => {
    const me = await signUp('Liste Lale');
    const mutual = await signUp('Karşılıklı Kaya');
    const mine = await signUp('Takip Ettiğim Tuna');
    const fan = await signUp('Takipçi Toprak');
    const gone = await signUp('Engelli Ege');
    await follow(me.session, mutual.user.id);
    await follow(mutual.session, me.user.id);
    await follow(me.session, mine.user.id);
    await follow(fan.session, me.user.id);
    await follow(gone.session, me.user.id);
    await ok(call('POST', '/api/block', { to: gone.user.id, block: true }, me.session), 'engelle');
    await awaySince(fan, '2 hours');

    let list = await friends(me.session);
    assert.deepEqual(
      list.map((f) => [f.name, f.iFollow, f.followsMe, f.online]),
      [
        ['Karşılıklı Kaya', true, true, true],
        ['Takip Ettiğim Tuna', true, false, true],
        ['Takipçi Toprak', false, true, false],
      ],
    );
    assert.ok(list[2].lastSeenAt, 'çevrimdışı: son görülme');
    assert.equal(list[0].lastSeenAt, null);

    await setPrivacy(mine.session, { showOnline: false });
    await setPrivacy(fan.session, { showLastSeen: false });
    list = await friends(me.session);
    assert.equal(list.find((f) => f.id === mine.user.id).online, false, 'çevrimiçi gizli');
    assert.equal(list.find((f) => f.id === fan.user.id).lastSeenAt, null, 'son görülme gizli');

    await setPrivacy(fan.session, { showLastSeen: true });
    await setPrivacy(me.session, { showLastSeen: false });
    assert.equal((await friends(me.session)).find((f) => f.id === fan.user.id).lastSeenAt, null, 'kendi son görülmemi kapatınca başkasınınkini görmem');
  });

  test('Keşfet: çevrimiçi gizlenir; kapalı profilin ayrıntıları ve listeleri yalnızca takip ettiklerine açık', async () => {
    const owner = await signUp('Kapalı Kumsal');
    const friend = await signUp('Arkadaş Aslı');
    const stranger = await signUp('Yabancı Yiğit');
    await ok(call('PATCH', '/api/me', { bio: 'Deniz ve kitap', city: 'İzmir' }, owner.session), 'profil');
    await follow(owner.session, friend.user.id);
    const seen = async (s) => (await ok(call('GET', '/api/discover?list=new', null, s), 'keşfet')).users.find((u) => u.id === owner.user.id);
    assert.equal((await seen(stranger.session)).online, true);
    await setPrivacy(owner.session, { showOnline: false, profilePublic: false });
    const card = await seen(stranger.session);
    assert.equal(card.online, false);
    assert.equal(card.bio, '');
    assert.equal(card.city, null);
    assert.equal(card.private, true);
    assert.equal(card.name, 'Kapalı Kumsal', 'adı görünür');

    const profile = async (s) => (await ok(call('GET', `/api/user?id=${owner.user.id}`, null, s), 'profil')).user;
    assert.equal((await profile(stranger.session)).bio, '');
    assert.equal((await profile(friend.session)).bio, 'Deniz ve kitap', 'takip ettiği görür');
    assert.equal((await profile(owner.session)).bio, 'Deniz ve kitap', 'kendisi görür');
    assert.equal((await call('GET', `/api/followers?user=${owner.user.id}`, null, stranger.session))[0], 403);
    await ok(call('GET', `/api/followers?user=${owner.user.id}`, null, friend.session), 'takip ettiği listeyi görür');
  });

  test('Aile: çevrimiçi ve bulunduğu oda gizlenebilir', async () => {
    const lead = await signUp('Aile Lideri');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, lead.session), 'yükleme');
    const { family } = await ok(call('POST', '/api/families', { name: `Gizli Aile ${rnd(2)}`, ref: rnd(6) }, lead.session), 'kur');
    await ok(call('POST', '/api/family/settings', { joinMode: 'open' }, lead.session), 'açık');
    const member = await signUp('Aile Üyesi');
    await ok(call('POST', '/api/family/join', { id: family.id }, member.session), 'katıl');
    const online = async () => (await ok(call('GET', '/api/family/overview', null, lead.session), 'özet')).online;
    assert.deepEqual((await online()).map((x) => x.id), [member.user.id]);

    const { room } = await ok(call('POST', '/api/rooms', { title: 'Gece Odası' }, member.session), 'oda');
    await q('INSERT INTO room_presence (room, identity) VALUES ($1, $2)', [`oda-${room.id}`, member.user.id]);
    assert.equal((await online())[0].room.title, 'Gece Odası');
    await setPrivacy(member.session, { showCurrentRoom: false });
    assert.equal((await online())[0].room, null, 'oda gizli, çevrimiçi görünür');
    await setPrivacy(member.session, { showOnline: false });
    assert.deepEqual(await online(), [], 'ikisi de gizli');
  });
});
