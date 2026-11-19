// Güncelleme 7, item 1 ("bazı avatarlar diğer kişilerde görünmüyor"): the lists that showed only a name now carry the
// person's photo (avatarUrl, an added field), at the address phones load it (core.mjs filesOut: this server's
// /api/media/f/…, never the storage's own, which some networks can't reach): Oda ayarları' admins, DJs, kicked people
// and room mutes, follower room invites, Gelir's diamond locks and Jeton Noktası lots, and the invite I entered.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://pub-avatars.r2.dev';
const h = startApi({ S3_PUBLIC_URL: CDN, PUBLIC_URL: 'self' });
const { call, signUp } = h;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
/** Someone with a photo in the storage; `.face` is the address phones get for it. */
async function withFace(name) {
  const p = await signUp(name);
  const key = `avatar/${p.user.id}/${rnd(6)}.jpg`;
  await ok(call('PATCH', '/api/me', { avatarUrl: `${CDN}/${key}` }, p.session), 'fotoğraf');
  return { ...p, face: `${h.base}/api/media/f/${key}` };
}

describe('Listelerde fotoğraf', () => {
  test('oda yetkilileri, atılanlar ve susturulanlar fotoğrafla; fotoğrafı olmayan null; üye yasaklıları görmez', async () => {
    const owner = await signUp('Oda Sahibi');
    const admin = await withFace('Yönetici');
    const dj = await withFace('DJ');
    const kicked = await withFace('Atılan');
    const muted = await withFace('Susturulan');
    const plain = await signUp('Fotoğrafsız');
    const room = (await ok(call('POST', '/api/rooms', { title: `Yetkili Odası ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    await ok(call('POST', '/api/rooms/admin', { room, user: plain.user.id }, owner.session), 'yönetici 2');
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: true }, owner.session), 'dj');
    await ok(call('POST', '/api/rooms/ban', { room, user: kicked.user.id, minutes: 30 }, owner.session), 'at');
    await ok(call('POST', '/api/rooms/mute', { room, user: muted.user.id, kind: 'voice', minutes: 60 }, owner.session), 'sustur');

    const staff = await ok(call('GET', `/api/rooms/staff?room=${room}`, null, owner.session), 'yetkililer');
    const faceOf = (list, id, key = 'id') => list.find((x) => x[key] === id)?.avatarUrl;
    assert.equal(faceOf(staff.admins, admin.user.id), admin.face, 'yöneticinin fotoğrafı, sunucunun adresiyle');
    assert.equal(faceOf(staff.admins, plain.user.id), null, 'fotoğrafı yok');
    assert.equal(faceOf(staff.djs, dj.user.id), dj.face);
    assert.equal(faceOf(staff.bans, kicked.user.id, 'userId'), kicked.face);
    assert.ok(!JSON.stringify(staff).includes(CDN), 'deponun kendi adresi telefona gitmez');

    const guest = await ok(call('GET', `/api/rooms/staff?room=${room}`, null, muted.session), 'üye');
    assert.equal(faceOf(guest.admins, admin.user.id), admin.face, 'herkes yöneticileri fotoğrafla görür');
    assert.equal('bans' in guest, false);

    const mutes = await ok(call('GET', `/api/rooms/mutes?room=${room}`, null, admin.session), 'susturmalar');
    const m = mutes.mutes.find((x) => x.userId === muted.user.id);
    assert.deepEqual([m.userName, m.userAvatar], ['Susturulan', muted.face]);
    assert.equal((await call('GET', `/api/rooms/mutes?room=${room}`, null, muted.session))[0], 403, 'yetkisiz göremez');
  });

  test('takipçi oda davetinde sahibin fotoğrafı', async () => {
    const host = await withFace('Davet Eden');
    const fan = await signUp('Takipçi');
    await ok(call('POST', '/api/follow', { to: host.user.id }, fan.session), 'takip');
    const room = (await ok(call('POST', '/api/rooms', { title: `Davet Odası ${rnd(2)}` }, host.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/invite-followers', { room }, host.session), 'davet');
    const got = await ok(call('GET', '/api/me/room-invites', null, fan.session), 'davetler');
    const invite = got.invites.find((i) => i.room.id === room && i.kind !== 'open');
    assert.deepEqual(invite.host, { id: host.user.id, name: 'Davet Eden', avatarUrl: host.face });
  });

  test('Gelir kilitlerinde ve jeton partilerinde gönderenin fotoğrafı', async () => {
    const sender = await withFace('Gönderen');
    const host = await signUp('Yayıncı');
    await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, sender.session), 'alım');
    await ok(call('POST', '/api/wallet/gift', { to: host.user.id, amount: 500, ref: rnd(6) }, sender.session), 'hediye');
    const e = await ok(call('GET', '/api/wallet/earnings', null, host.session), 'gelir');
    assert.ok(e.locks.length > 0);
    assert.ok(e.locks.every((l) => l.from?.id === sender.user.id && l.from.avatarUrl === sender.face), 'kilitte gönderen fotoğrafıyla');

    // Jeton Noktası: the lot names the bank that sold it.
    const admin = await h.account('Yönetici', 'admin');
    const bank = await withFace('Jeton Noktası');
    await ok(call('POST', '/api/admin/jeton/bank', { user: bank.user.id, enabled: true }, admin.session), 'bayi');
    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 100_000, paymentRef: `DEKONT-${rnd(3)}`, ref: rnd(6) }, admin.session), 'toptan');
    const buyer = await signUp('Alıcı');
    await ok(call('POST', '/api/jeton/transfer', { to: buyer.user.id, coins: 10_000, paymentRef: 'HAVALE-1', ref: rnd(6) }, bank.session), 'satış');
    const w = await ok(call('GET', '/api/wallet/coins', null, buyer.session), 'partiler');
    assert.ok(w.lots.length > 0 && w.lots.every((l) => l.from?.id === bank.user.id && l.from.avatarUrl === bank.face));
  });

  test('girdiğim davet kodunun sahibi fotoğrafla', async () => {
    const inviter = await withFace('Davet Eden');
    const friend = await signUp('Arkadaş');
    const { code } = await ok(call('GET', '/api/invite', null, inviter.session), 'kod');
    const { mine } = await ok(call('POST', '/api/invite/redeem', { code }, friend.session), 'kod gir');
    assert.deepEqual(mine.by, { id: inviter.user.id, name: 'Davet Eden', avatarUrl: inviter.face });
  });
});
