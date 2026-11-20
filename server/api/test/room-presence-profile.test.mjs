// Güncelleme 7, item 15 against a real Postgres: "Şu an odada" on someone's profile (GET /api/user `room`,
// presence-room.mjs) and "Kaan, Artemis'i takip ederek geldi" (GET /token `via`, live.mjs followedVia). Who is in which
// room comes from LiveKit's signed webhooks here (room_presence); test/room-presence-webhookless.test.mjs asks LiveKit.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { rnd, startApi, tokenOf } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const sign = (body) => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
  return `${hp}.${crypto.createHmac('sha256', 'testsecret').update(hp).digest('base64url')}`;
};
const hook = (event, extra) => {
  const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
  return call('POST', '/api/livekit/webhook', body, null, { authorization: sign(body), 'content-type': 'application/webhook+json' });
};
const sids = new Map();
const enter = async (roomId, who) => {
  const sid = `PA_${rnd(4)}`;
  sids.set(`${roomId}:${who.user.id}`, sid);
  await ok(hook('participant_joined', { room: { name: `oda-${roomId}` }, participant: { identity: who.user.id, sid } }), 'odaya giriş');
};
const leave = (roomId, who) =>
  ok(hook('participant_left', { room: { name: `oda-${roomId}` }, participant: { identity: who.user.id, sid: sids.get(`${roomId}:${who.user.id}`) } }), 'odadan çıkış');
/** The `room` of `target`'s profile as `viewer` opens it. */
const roomOn = async (viewer, target) => (await ok(call('GET', `/api/user?id=${target.user.id}`, null, viewer.session), 'profil')).room;
const roomOf = async (owner, title) => (await ok(call('POST', '/api/rooms', { title }, owner.session), 'oda')).room;
const privacy = (who, showCurrentRoom) => ok(call('PATCH', '/api/me/privacy', { showCurrentRoom }, who.session), 'gizlilik');
const block = (who, to, on) => ok(call('POST', '/api/block', { to: to.user.id, block: on }, who.session), 'engel');
const tokenFor = (who, roomId, via) => call('GET', `/token?room=oda-${roomId}${via === undefined ? '' : `&via=${encodeURIComponent(via)}`}`, null, who.session);

describe('Profilde "Şu an odada"', () => {
  test('bulunduğu açık oda görünür; ayarı kapalıysa, engelde, kendi profilimde ve görüşmede görünmez', async () => {
    const owner = await signUp('Oda Sahibi');
    const artemis = await signUp('Artemis');
    const kaan = await signUp('Kaan');
    const room = await roomOf(owner, 'Gece Sohbeti');

    assert.equal(await roomOn(kaan, artemis), null, 'odada değil');
    await enter(room.id, artemis);
    assert.deepEqual(await roomOn(kaan, artemis), { id: room.id, title: 'Gece Sohbeti', locked: false });
    assert.equal(await roomOn(artemis, artemis), null, 'kendi profilimde yok (kendi odam ayrıca gösterilir)');
    assert.equal(await roomOn(kaan, owner), null, 'odası açık ama içinde değil');

    // "Bulunduğum odayı göster" off: nobody sees it; on again: everyone does.
    await privacy(artemis, false);
    assert.equal(await roomOn(kaan, artemis), null, 'ayar kapalı');
    await privacy(artemis, true);
    assert.equal((await roomOn(kaan, artemis))?.id, room.id);

    // A block either way: the one I blocked shows no room; the one who blocked me is not found at all.
    await block(kaan, artemis, true);
    assert.equal(await roomOn(kaan, artemis), null, 'engellediğim kişinin odası görünmez');
    await block(kaan, artemis, false);
    await block(artemis, kaan, true);
    assert.equal((await call('GET', `/api/user?id=${artemis.user.id}`, null, kaan.session))[0], 404, 'beni engelleyen bulunmaz');
    await block(artemis, kaan, false);
    assert.equal((await roomOn(kaan, artemis))?.id, room.id);

    // Left the room: nothing.
    await leave(room.id, artemis);
    assert.equal(await roomOn(kaan, artemis), null, 'odadan çıktı');

    // A one-to-one call is never shown.
    await h.sql.query('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3)', [`call-${rnd(6)}`, artemis.user.id, 'PA_call']);
    assert.equal(await roomOn(kaan, artemis), null, 'bire bir görüşme gösterilmez');
    await h.sql.query("DELETE FROM room_presence WHERE identity = $1 AND room LIKE 'call-%'", [artemis.user.id]);

    assert.equal((await call('GET', `/api/user?id=${artemis.user.id}`))[0], 401, 'girişsiz');
  });

  test('girilemeyen oda görünmez (atılmış, sahibiyle engel, özel oda); şifreli oda kilitli; dinlenen ve kapanan oda yok', async () => {
    const owner = await signUp('Sahip');
    const target = await signUp('Takip Edilen');
    const viewer = await signUp('Bakan');
    const member = await signUp('Üye');
    const room = await roomOf(owner, 'Kapılı Oda');
    await enter(room.id, target);
    assert.equal((await roomOn(viewer, target))?.id, room.id);

    await ok(call('POST', '/api/rooms/ban', { room: room.id, user: viewer.user.id, minutes: 10 }, owner.session), 'at');
    assert.equal(await roomOn(viewer, target), null, 'odadan atılan görmez');
    await ok(call('POST', '/api/rooms/unban', { room: room.id, user: viewer.user.id }, owner.session), 'yasak kalksın');
    assert.equal((await roomOn(viewer, target))?.id, room.id);

    await block(owner, viewer, true);
    assert.equal(await roomOn(viewer, target), null, 'oda sahibiyle engel');
    await block(owner, viewer, false);

    // A password: shown, and locked for someone who must type it; not for the room's staff.
    await h.sql.query('UPDATE rooms SET password_hash = $2 WHERE id = $1', [room.id, 'x'.repeat(64)]);
    assert.deepEqual(await roomOn(viewer, target), { id: room.id, title: 'Kapılı Oda', locked: true });
    assert.equal((await roomOn(owner, target))?.locked, false, 'sahip şifresiz girer');

    // A private room without a password: only its members (and staff) see it.
    await h.sql.query("UPDATE rooms SET password_hash = NULL, room_type = 'private' WHERE id = $1", [room.id]);
    await h.sql.query("INSERT INTO room_members (room_id, user_id, status) VALUES ($1, $2, 'member')", [room.id, member.user.id]);
    assert.equal(await roomOn(viewer, target), null, 'özel oda üye olmayana görünmez');
    assert.deepEqual(await roomOn(member, target), { id: room.id, title: 'Kapılı Oda', locked: false }, 'üye görür');
    await h.sql.query("UPDATE rooms SET room_type = 'free' WHERE id = $1", [room.id]);

    await h.sql.query('UPDATE rooms SET paused_at = now() WHERE id = $1', [room.id]);
    assert.equal(await roomOn(viewer, target), null, 'dinlenen oda');
    await h.sql.query('UPDATE rooms SET paused_at = NULL WHERE id = $1', [room.id]);
    assert.equal((await roomOn(viewer, target))?.id, room.id);

    await ok(call('POST', '/api/rooms/close', { id: room.id }, owner.session), 'kapat');
    assert.equal(await roomOn(viewer, target), null, 'kapanan oda');
  });
});

describe('Takip ederek gelen', () => {
  test('ses anahtarında via: yalnız takip edilen o odadayken, engel yokken ve odasını gösterirken', async () => {
    const owner = await signUp('Oda Sahibi');
    const artemis = await signUp('Artemis');
    const kaan = await signUp('Kaan');
    const other = await signUp('Başka');
    const room = await roomOf(owner, 'Takip Odası');
    const elsewhere = await roomOf(other, 'Başka Oda');
    await enter(room.id, artemis);

    const t = await ok(tokenFor(kaan, room.id, artemis.user.id), 'token');
    assert.equal(t.via, artemis.user.id);
    assert.deepEqual(tokenOf(t.token).attributes, { via: artemis.user.id }, 'odadaki herkes görür');
    assert.equal(tokenOf(t.token).sub, kaan.user.id);

    // Without via (an older app) and with anything that doesn't hold: a token as before, without the attribute.
    const plain = await ok(tokenFor(kaan, room.id), 'eski uygulama');
    assert.equal(plain.via, null);
    assert.equal(tokenOf(plain.token).attributes, undefined);
    for (const [via, why] of [
      ['abc', 'bozuk kimlik'],
      [kaan.user.id, 'kendisi'],
      [other.user.id, 'odada olmayan'],
      [crypto.randomUUID(), 'olmayan kişi'],
    ]) {
      const x = await ok(tokenFor(kaan, room.id, via), why);
      assert.equal(x.via, null, why);
      assert.equal(tokenOf(x.token).attributes, undefined, why);
    }
    // In another room than this one.
    assert.equal((await ok(tokenFor(kaan, elsewhere.id, artemis.user.id), 'başka oda')).via, null, 'başka odada');

    await privacy(artemis, false);
    assert.equal((await ok(tokenFor(kaan, room.id, artemis.user.id), 'ayar kapalı')).via, null, 'odasını göstermeyen');
    await privacy(artemis, true);

    await block(artemis, kaan, true);
    assert.equal((await ok(tokenFor(kaan, room.id, artemis.user.id), 'engel')).via, null, 'engel');
    await block(artemis, kaan, false);

    await leave(room.id, artemis);
    assert.equal((await ok(tokenFor(kaan, room.id, artemis.user.id), 'çıktı')).via, null, 'takip edilen çıktı');

    // The room's own checks come first: via never opens a door.
    await ok(call('POST', '/api/rooms/ban', { room: room.id, user: kaan.user.id, minutes: 10 }, owner.session), 'at');
    await enter(room.id, artemis);
    assert.equal((await tokenFor(kaan, room.id, artemis.user.id))[0], 403, 'atılan takip ederek de giremez');
  });
});
