// Sanctions (sanctions.mjs, docs/YAPTIRIM.md): the spec's acceptance list, as far as a server can show it.
// A fake LiveKit records what the API asks of it (mic and chat permissions, removals). Time passing is
// simulated by moving a sanction's start and end into the past in the database; the server only ever compares
// with its own clock.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi, tokenOf } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 19500 + (process.pid % 400);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => lk.close(r)));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, SANCTION_SWEEP_MS: '200', SANCTION_AUTO_REPORTS: '3' });
const { call, signUp } = h;

const dev = (installId, hardwareId) => ({ installId, hardwareId, platform: 'android', model: 'Pixel 8', os: '15', app: '1.4.0' });
const signIn = (deviceKey, deviceInfo, name) => call('POST', '/api/auth/dev', { deviceKey, ...(deviceInfo ? { deviceInfo } : {}), ...(name ? { name } : {}) });
/** Lets time pass for a sanction: it started two hours ago and ended a second ago (server clock). */
const runOut = (id) => h.sql.query("UPDATE user_sanctions SET start_at = now() - interval '2 hours', expires_at = now() - interval '1 second' WHERE id = $1", [id]);
/** The same, ending a moment from now, so the minute sweep sees it end. */
const runOutSoon = (id) => h.sql.query("UPDATE user_sanctions SET start_at = now() - interval '2 hours', expires_at = now() + interval '300 milliseconds' WHERE id = $1", [id]);
const audits = async (id) => (await h.sql.query('SELECT action, result FROM sanction_audit_logs WHERE sanction_id = $1 ORDER BY id', [id])).rows;
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

let admin;
let mod;
const sanction = async (who, body) => {
  const [st, j] = await call('POST', '/api/admin/sanctions', { reason: 'harassment', description: 'Kurallara aykırı davranış', ...body }, who.session);
  assert.equal(st, 200, j.error);
  return j.sanctions;
};
const devicesOf = async (uid) => (await call('GET', `/api/admin/sanctions/user?id=${uid}`, null, admin.session))[1].devices;

describe('Yaptırımlar', () => {
  before(async () => {
    admin = await h.account('Süper Yönetici', 'admin');
    mod = await h.account('Platform Moderatörü', 'moderator');
  });

  describe('Susturma', () => {
    test('1–4, 18: oda içi 5 dakikalık yazılı susturma sohbeti kapatır, süre bitince açılır; mikrofon susturması mikrofonu kapatır', async () => {
      const owner = await signUp('Oda Sahibi');
      const member = await signUp('Dinleyici');
      const [, j] = await call('POST', '/api/rooms', { title: 'Akşam Sohbeti' }, owner.session);
      const room = j.room.id;
      await h.sql.query('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3)', [`oda-${room}`, member.user.id, 'PA_x']);

      const [st, m] = await call('POST', '/api/rooms/mute', { room, user: member.user.id, kind: 'text', minutes: 5, reason: 'spam' }, owner.session);
      assert.equal(st, 200, m.error);
      assert.equal(m.sanction.type, 'mute_room_text');
      assert.equal(Math.round((new Date(m.sanction.endAt) - new Date(m.sanction.startAt)) / 60_000), 5);
      const upd = lkCalls.filter((c) => c.method === 'UpdateParticipant' && c.body.identity === member.user.id).at(-1);
      assert.deepEqual([upd.body.permission.canPublishData, upd.body.permission.canPublish], [false, true], 'açık bağlantının sohbet izni hemen kalkar');

      const [, t] = await call('GET', `/token?room=oda-${room}`, null, member.session);
      assert.deepEqual([tokenOf(t.token).video.canPublishData, tokenOf(t.token).video.canPublish], [false, true], 'yeni ses anahtarında sohbet izni yok, mikrofon var');
      const [, chk] = await call('GET', `/api/sanctions/check?action=room_text&room=${room}`, null, member.session);
      assert.equal(chk.allowed, false);
      assert.equal((await call('GET', `/api/sanctions/check?action=room_text&room=${owner.user.id}`, null, member.session))[1].allowed, true, 'başka odada serbest');
      assert.equal((await call('POST', '/api/messages', { to: owner.user.id, text: 'selam', ref: rnd(6) }, member.session))[0], 200, 'oda susturması DM’yi kapatmaz');

      // The user's own view: type, reason, start, end, who.
      const [, mine] = await call('GET', '/api/sanctions/mine', null, member.session);
      const v = mine.sanctions[0];
      assert.deepEqual([v.label, v.reason, v.appliedBy, v.permanent], ['Oda içi yazılı susturma', 'Spam', 'Oda sahibi', false]);
      assert.ok(mine.serverNow && v.startAt && v.endAt);
      assert.equal(v.note, undefined, 'iç not kullanıcıya gitmez');

      // 3 / 18: time is up; the sweep gives chat back without anyone asking.
      const before = lkCalls.length;
      await runOutSoon(m.sanction.id);
      assert.ok(
        await until(() => lkCalls.slice(before).some((c) => c.method === 'UpdateParticipant' && c.body.identity === member.user.id && c.body.permission.canPublishData === true)),
        'süre bitince açık bağlantıya sohbet izni geri gelir',
      );
      assert.equal(tokenOf((await call('GET', `/token?room=oda-${room}`, null, member.session))[1].token).video.canPublishData, true);

      // 4: mic mute; seat attributes are not touched (only the permission is sent).
      const [, v2] = await call('POST', '/api/rooms/mute', { room, user: member.user.id, kind: 'voice', minutes: 15, reason: 'disruption' }, owner.session);
      assert.equal(tokenOf((await call('GET', `/token?room=oda-${room}`, null, member.session))[1].token).video.canPublish, false);
      const last = lkCalls.filter((c) => c.method === 'UpdateParticipant').at(-1);
      assert.equal(last.body.permission.canPublish, false);
      assert.equal(last.body.attributes, undefined, 'koltuk / rol bilgisi değişmez');
      assert.equal((await call('POST', '/api/rooms/unmute', { sanction: v2.sanction.id }, owner.session))[0], 200);
      assert.equal(tokenOf((await call('GET', `/token?room=oda-${room}`, null, member.session))[1].token).video.canPublish, true);
    });

    test('oda yetkileri: yönetici en çok 7 gün, sahibi süresiz; sahip ve platform yetkilisi susturulamaz', async () => {
      const owner = await signUp('Sahip');
      const helper = await signUp('Oda Yöneticisi');
      const guest = await signUp('Misafir');
      const [, j] = await call('POST', '/api/rooms', { title: 'Kurallı Oda' }, owner.session);
      const room = j.room.id;
      await call('POST', '/api/rooms/admin', { room, user: helper.user.id, admin: true }, owner.session);
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: guest.user.id, kind: 'text', minutes: 8 * 1440 }, helper.session))[0], 400);
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: guest.user.id, kind: 'text', minutes: null }, helper.session))[0], 400);
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: guest.user.id, kind: 'text', minutes: 60 }, helper.session))[0], 200);
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: owner.user.id, kind: 'text', minutes: 60 }, helper.session))[0], 400, 'sahip susturulamaz');
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: mod.user.id, kind: 'voice', minutes: 60 }, owner.session))[0], 403, 'platform yetkilisi susturulamaz');
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: guest.user.id, kind: 'voice', minutes: null }, owner.session))[0], 200, 'sahip süresiz susturabilir');
      assert.equal((await call('POST', '/api/rooms/mute', { room, user: helper.user.id, kind: 'text', minutes: 5 }, guest.session))[0], 403, 'yetkisiz kişi susturamaz');
      const [, list] = await call('GET', `/api/rooms/mutes?room=${room}`, null, helper.session);
      assert.equal(list.mutes.length, 2);
      const [p] = await sanction(mod, { user: guest.user.id, type: 'mute_room_text', minutes: 60, roomId: room });
      assert.equal((await call('POST', '/api/rooms/unmute', { sanction: p.id }, owner.session))[0], 403, 'platform susturmasını oda sahibi de kaldıramaz');
    });

    test('5, 6, 19: genel susturma tüm kanalları kapatır, yeniden girişte sürer, API’yi doğrudan çağırmak işe yaramaz', async () => {
      const u = await signUp('Gürültücü');
      const friend = await signUp('Arkadaş');
      const [s] = await sanction(mod, { user: u.user.id, type: 'mute_all', minutes: 60 });
      const [st, err] = await call('POST', '/api/messages', { to: friend.user.id, text: 'selam', ref: rnd(6) }, u.session);
      assert.equal(st, 403);
      assert.equal(err.code, 'muted');
      assert.equal(err.sanction.id, s.id);
      for (const action of ['room_text', 'room_voice', 'dm', 'call']) assert.equal((await call('GET', `/api/sanctions/check?action=${action}`, null, u.session))[1].allowed, false, action);
      const [, j] = await call('POST', '/api/rooms', { title: 'Başka Oda' }, friend.session);
      const v = tokenOf((await call('GET', `/token?room=oda-${j.room.id}`, null, u.session))[1].token).video;
      assert.deepEqual([v.canPublish, v.canPublishData], [false, false]);

      // 6: a restart / new sign-in changes nothing; the phone's clock is never asked.
      const [, again] = await signIn(u.deviceKey);
      assert.equal((await call('POST', '/api/messages', { to: friend.user.id, text: 'selam', ref: rnd(6) }, again.session, { date: 'Mon, 01 Jan 2035 00:00:00 GMT' }))[0], 403);
      assert.equal((await call('GET', '/api/sanctions/mine', null, again.session))[1].sanctions.length, 1);
    });

    test('genel yazılı susturma DM’yi yalnızca seçilince kapatır; sesli görüşme seçeneği', async () => {
      const u = await signUp('Yazan');
      const friend = await signUp('Okuyan');
      await sanction(mod, { user: u.user.id, type: 'mute_global_text', minutes: 30 });
      assert.equal((await call('POST', '/api/messages', { to: friend.user.id, text: 'selam', ref: rnd(6) }, u.session))[0], 200);
      await sanction(mod, { user: u.user.id, type: 'mute_global_text', minutes: 30, includeDm: true });
      assert.equal((await call('POST', '/api/messages', { to: friend.user.id, text: 'selam', ref: rnd(6) }, u.session))[0], 403);
      await sanction(mod, { user: u.user.id, type: 'mute_global_voice', minutes: 30 });
      assert.equal((await call('GET', '/api/sanctions/check?action=call', null, u.session))[1].allowed, true);
      await sanction(mod, { user: u.user.id, type: 'mute_global_voice', minutes: 30, includeCalls: true });
      assert.equal((await call('GET', '/api/sanctions/check?action=call', null, u.session))[1].allowed, false);
    });
  });

  describe('Hesap banı', () => {
    test('7–9: 24 saatlik ban oturumları kapatır, başka cihazdan da giriş yok, süre bitince kendiliğinden kalkar', async () => {
      const u = await signUp('Kural Dışı');
      const owner = await signUp('Oda Sahibi 2');
      const [, j] = await call('POST', '/api/rooms', { title: 'Kendi Odası' }, u.session);
      const [, other] = await call('POST', '/api/rooms', { title: 'Başkasının Odası' }, owner.session);
      await h.sql.query('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3)', [`oda-${other.room.id}`, u.user.id, 'PA_b']);
      const [s] = await sanction(mod, { user: u.user.id, type: 'account_ban', minutes: 1440 });
      assert.equal((await call('GET', '/api/me', null, u.session))[0], 401, 'oturum kapandı');
      assert.ok(lkCalls.some((c) => c.method === 'RemoveParticipant' && c.body.identity === u.user.id), 'sesli odadan çıkarıldı');
      assert.ok(lkCalls.some((c) => c.method === 'DeleteRoom' && c.body.room === `oda-${j.room.id}`), 'kendi odası kapandı');
      assert.equal((await h.sql.query('SELECT sessions_ended FROM account_bans WHERE sanction_id = $1', [s.id])).rows[0].sessions_ended, 1);

      // 8: another phone (new install, other hardware).
      const [st, err] = await signIn(u.deviceKey, dev(rnd(20), `hw-${rnd(8)}`));
      assert.equal(st, 403);
      assert.equal(err.code, 'account_banned');
      assert.equal(err.sanction.label, 'Hesap banı');
      assert.ok(err.serverNow);
      // The appeal session only reads sanctions and sends appeals.
      assert.equal((await call('GET', '/api/me', null, err.appealSession))[0], 403);
      assert.equal((await call('GET', '/api/sanctions/mine', null, err.appealSession))[0], 200);
      assert.equal((await call('POST', '/api/messages', { to: owner.user.id, text: 'x', ref: rnd(6) }, err.appealSession))[0], 403);

      // 9: the ban runs out by the server's clock.
      await runOut(s.id);
      const [ok, back] = await signIn(u.deviceKey);
      assert.equal(ok, 200, back.error);
      assert.equal((await call('GET', '/api/sanctions/mine', null, err.appealSession))[0], 401, 'itiraz oturumu ban bitince geçersiz');
    });

    test('10: ömür boyu ban yönetici kaldırana kadar sürer; moderatör kaldıramaz; kaldırma denetim kaydında', async () => {
      const u = await signUp('Kalıcı');
      const [s] = await sanction(admin, { user: u.user.id, type: 'account_ban', minutes: null, reason: 'fraud' });
      assert.equal(s.permanent, true);
      await h.sql.query("UPDATE user_sanctions SET start_at = now() - interval '5 years' WHERE id = $1", [s.id]);
      assert.equal((await signIn(u.deviceKey))[0], 403, 'yıllar sonra da sürer');
      assert.equal((await call('POST', '/api/admin/sanctions/lift', { id: s.id, reason: 'Moderatör denemesi' }, mod.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanctions/lift', { id: s.id, reason: 'Yeniden inceleme sonucu' }, admin.session))[0], 200);
      assert.equal((await signIn(u.deviceKey))[0], 200);
      const log = await audits(s.id);
      assert.deepEqual(
        log.map((x) => `${x.action}:${x.result}`),
        ['apply:ok', 'sign_in:blocked', 'lift:denied', 'lift:ok'],
        '16: uygulama, reddedilen ve yapılan kaldırma kayıtta',
      );
      assert.equal((await call('POST', '/api/admin/sanctions/lift', { id: s.id, reason: 'İkinci kez' }, admin.session))[0], 409);
    });

    test('moderatör sınırları: 90 günden uzun ban yok, eşit / üst rütbeye yaptırım yok', async () => {
      const u = await signUp('Hedef');
      const [st] = await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'account_ban', minutes: 91 * 1440, reason: 'spam', description: 'Uzun süre' }, mod.session);
      assert.equal(st, 403);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'account_ban', minutes: null, reason: 'spam', description: 'Ömür boyu' }, mod.session))[0], 403);
      const other = await h.account('Diğer Moderatör', 'moderator');
      assert.equal((await call('POST', '/api/admin/sanctions', { user: other.user.id, type: 'mute_all', minutes: 5, reason: 'spam', description: 'Deneme' }, mod.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: admin.user.id, type: 'mute_all', minutes: 5, reason: 'spam', description: 'Deneme' }, mod.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_all', minutes: 5, reason: 'spam' }, mod.session))[0], 400, 'gerekçe zorunlu');
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_all', minutes: 5, reason: 'yok', description: 'Deneme' }, mod.session))[0], 400, 'kategori zorunlu');
    });

    test('17: oda moderatörü genel hesap banı veremez', async () => {
      const owner = await signUp('Sahip 3');
      const helper = await signUp('Oda Moderatörü');
      const target = await signUp('Hedef 3');
      const [, j] = await call('POST', '/api/rooms', { title: 'Oda Üç' }, owner.session);
      await call('POST', '/api/rooms/admin', { room: j.room.id, user: helper.user.id, admin: true }, owner.session);
      const [st] = await call('POST', '/api/admin/sanctions', { user: target.user.id, type: 'account_ban', minutes: 60, reason: 'spam', description: 'Deneme' }, helper.session);
      assert.equal(st, 403);
      assert.equal((await call('POST', '/api/admin/ban', { user: target.user.id, days: 1 }, helper.session))[0], 403);
      assert.equal((await call('GET', `/api/admin/sanctions/user?id=${target.user.id}`, null, helper.session))[0], 403);
      const denied = await h.sql.query("SELECT 1 FROM sanction_audit_logs WHERE actor = $1 AND result = 'denied'", [helper.user.id]);
      assert.ok(denied.rowCount >= 1, 'yetkisiz deneme kayıtta');
    });
  });

  describe('Cihaz banı', () => {
    test('11–13: cihaz banı aynı telefonda yeni hesabı da durdurur, yeniden başlatmada sürer; ömür boyu olan kaldırılana kadar', async () => {
      const hw = `hw-${rnd(8)}`;
      const install = rnd(20);
      const key = rnd(24);
      const u = await signIn(key, dev(install, hw), 'Cihazlı').then(([st, j]) => (assert.equal(st, 200, j.error), j));
      const [d] = await devicesOf(u.user.id);
      assert.equal(d.platform, 'android');
      const [s] = await sanction(mod, { user: u.user.id, type: 'device_ban', minutes: 7 * 1440, deviceIds: [d.id] });
      assert.equal((await call('GET', '/api/me', null, u.session))[0], 401, 'o cihazdaki oturum kapandı');

      // 11: a new account on the same phone, even after a reinstall (new install id, same hardware id).
      const name = `Yeni ${rnd(3)}`;
      const [st, err] = await signIn(rnd(24), dev(rnd(20), hw), name);
      assert.equal(st, 403);
      assert.equal(err.code, 'device_banned');
      assert.equal(err.appealSession, undefined, 'hesabı olmayan için oturum yok');
      assert.equal((await h.sql.query('SELECT 1 FROM users WHERE name = $1', [name])).rowCount, 0, 'yeni hesap açılmadı');
      assert.doesNotMatch(JSON.stringify(err), /hardware|install|imei|android id/i, 'nasıl tanındığı söylenmez');
      // 12: the app's start check.
      const [, chk] = await call('POST', '/api/devices/check', { deviceInfo: dev(install, hw) });
      assert.equal(chk.banned, true);
      // The same account on another phone works: a device ban isn't an account ban.
      assert.equal((await signIn(key, dev(rnd(20), `hw-${rnd(8)}`)))[0], 200);

      await runOut(s.id);
      assert.equal((await call('POST', '/api/devices/check', { deviceInfo: dev(install, hw) }))[1].banned, false, 'süre bitince açılır');

      // 13: lifetime: only the lifetime permission lifts it.
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'device_ban', minutes: null, deviceIds: [d.id], reason: 'ban_evasion', description: 'Tekrar' }, mod.session))[0], 403);
      const [p] = await sanction(admin, { user: u.user.id, type: 'device_ban', minutes: null, deviceIds: [d.id], reason: 'ban_evasion' });
      await h.sql.query("UPDATE user_sanctions SET start_at = now() - interval '3 years' WHERE id = $1", [p.id]);
      assert.equal((await call('POST', '/api/devices/check', { deviceInfo: dev(install, hw) }))[1].banned, true);
      assert.equal((await call('POST', '/api/admin/sanctions/lift', { id: p.id, reason: 'Moderatör denemesi' }, mod.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanctions/lift', { id: p.id, reason: 'İtiraz sonrası' }, admin.session))[0], 200);
      assert.equal((await call('POST', '/api/devices/check', { deviceInfo: dev(install, hw) }))[1].banned, false);
    });

    test('cihaz yalnızca o kullanıcının kayıtlı cihazıysa seçilebilir', async () => {
      const a = await signIn(rnd(24), dev(rnd(20), `hw-${rnd(8)}`), 'A').then(([, j]) => j);
      const b = await signIn(rnd(24), dev(rnd(20), `hw-${rnd(8)}`), 'B').then(([, j]) => j);
      const [bd] = await devicesOf(b.user.id);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: a.user.id, type: 'device_ban', minutes: 60, deviceIds: [bd.id], reason: 'spam', description: 'Deneme' }, mod.session))[0], 400);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: a.user.id, type: 'device_ban', minutes: 60, reason: 'spam', description: 'Deneme' }, mod.session))[0], 400);
    });

    test('14, 15: hesap banı ve cihaz banı bağımsız; birden çok yaptırım birlikte, biri kalkınca diğeri sürer', async () => {
      const hw = `hw-${rnd(8)}`;
      const install = rnd(20);
      const key = rnd(24);
      const [, u] = await signIn(key, dev(install, hw), 'Çift Cezalı');
      const [d] = await devicesOf(u.user.id);
      const [ban] = await sanction(mod, { user: u.user.id, type: 'account_ban', minutes: 1440 });
      const [dban] = await sanction(mod, { user: u.user.id, type: 'device_ban', minutes: 1440, deviceIds: [d.id] });
      const [mute] = await sanction(mod, { user: u.user.id, type: 'mute_global_text', minutes: 1440 });
      const [, hist] = await call('GET', `/api/admin/sanctions/user?id=${u.user.id}`, null, admin.session);
      assert.equal(hist.sanctions.filter((s) => s.live).length, 3, 'üç ayrı kayıt');

      await call('POST', '/api/admin/sanctions/lift', { id: ban.id, reason: 'Hesap banı hatalı' }, mod.session);
      const [st, err] = await signIn(key, dev(install, hw));
      assert.equal([st, err.code].join(), '403,device_banned', 'cihaz banı sürer');
      assert.equal((await signIn(key, dev(rnd(20), `hw-${rnd(8)}`)))[0], 200, 'başka telefonda hesap açık');
      await call('POST', '/api/admin/sanctions/lift', { id: dban.id, reason: 'Cihaz banı hatalı' }, mod.session);
      assert.equal((await call('POST', '/api/devices/check', { deviceInfo: dev(install, hw) }))[1].banned, false);
      const [, again] = await call('GET', `/api/admin/sanctions/user?id=${u.user.id}`, null, admin.session);
      assert.deepEqual(
        again.sanctions.map((s) => [s.id, s.status]).sort((x, y) => x[0] - y[0]),
        [
          [ban.id, 'lifted'],
          [dban.id, 'lifted'],
          [mute.id, 'active'],
        ],
        'susturma kendi başına sürer',
      );
      await assert.rejects(h.sql.query('DELETE FROM user_sanctions WHERE id = $1', [ban.id]), 'kayıt silinemez');
    });

    test('21: ortak cihazda yanlış kişiye otomatik ceza yok', async () => {
      const hw = `hw-${rnd(8)}`;
      const [, a] = await signIn(rnd(24), dev(rnd(20), hw), 'Abla');
      const bKey = rnd(24);
      const bInstall = rnd(20);
      const [, b] = await signIn(bKey, dev(bInstall, hw), 'Kardeş');
      const [, aHist] = await call('GET', `/api/admin/sanctions/user?id=${a.user.id}`, null, admin.session);
      assert.equal(aHist.devices[0].accounts, 2);
      assert.match(aHist.devices[0].risk, /shared|reinstalled/);
      await sanction(mod, { user: a.user.id, type: 'account_ban', minutes: 1440 });
      // The sister's account ban does not touch the brother, on the same phone; signing in there again only flags it.
      const [ok, again] = await signIn(bKey, dev(bInstall, hw));
      assert.equal(ok, 200, again.error);
      assert.equal((await call('GET', '/api/sanctions/mine', null, again.session))[1].sanctions.length, 0);
      const [, dv] = await call('GET', `/api/admin/sanctions/user?id=${b.user.id}`, null, admin.session);
      assert.equal(dv.devices[0].risk, 'evasion_suspect', 'yalnızca incelenmek üzere işaretlenir');
      assert.equal(dv.sanctions.length, 0);
    });

    test('22: yeniden kurulum ve cihaz kimliği değişince risk işareti; kimse cezalandırılmaz', async () => {
      const hw = `hw-${rnd(8)}`;
      const install = rnd(20);
      const key = rnd(24);
      const [, u] = await signIn(key, dev(install, hw), 'Değişken');
      assert.equal((await devicesOf(u.user.id))[0].risk, 'normal');
      const install2 = rnd(20);
      await signIn(key, dev(install2, hw));
      assert.equal((await devicesOf(u.user.id))[0].risk, 'reinstalled', 'yeni kurulum, aynı donanım');
      await signIn(key, dev(install2, `hw-${rnd(8)}`));
      const [d] = await devicesOf(u.user.id);
      assert.equal(d.risk, 'changed', 'aynı kurulum, farklı donanım');
      const log = await h.sql.query("SELECT detail FROM sanction_audit_logs WHERE device_id = $1 AND action = 'device_risk'", [d.id]);
      assert.ok(log.rowCount >= 2);
      assert.equal((await call('GET', '/api/sanctions/mine', null, (await signIn(key))[1].session))[1].sanctions.length, 0);
      // Staff look and clear the flag.
      const [st, r] = await call('POST', '/api/admin/devices/risk', { device: d.id, status: 'normal', note: 'Telefon değiştirdi' }, mod.session);
      assert.equal(st, 200, r.error);
      assert.equal(r.device.risk, 'normal');
    });

    test('cihaz kaydı: oturum cihaza bağlanır; ham kimlik veritabanına yazılmaz', async () => {
      const u = await signUp('Kayıtlı');
      const hw = `hw-${rnd(8)}`;
      const [st, j] = await call('POST', '/api/devices/register', { deviceInfo: dev(rnd(20), hw) }, u.session);
      assert.equal(st, 200, j.error);
      const raw = await h.sql.query('SELECT 1 FROM device_registry WHERE hardware_hash = $1 OR install_hash = $1', [hw]);
      assert.equal(raw.rowCount, 0);
      assert.ok((await h.sql.query('SELECT device_id FROM sessions WHERE user_id = $1 AND device_id IS NOT NULL', [u.user.id])).rowCount);
    });
  });

  describe('İtiraz', () => {
    test('20: banlı kişi itiraz eder, yönetici süreyi azaltır ya da kaldırır', async () => {
      const u = await signUp('İtirazcı');
      const [s] = await sanction(mod, { user: u.user.id, type: 'account_ban', minutes: 30 * 1440, note: 'İç not: üç şikâyet' });
      const [, err] = await signIn(u.deviceKey);
      const appeal = err.appealSession;
      const [, mine] = await call('GET', '/api/sanctions/mine', null, appeal);
      assert.equal(mine.sanctions[0].id, s.id);
      assert.doesNotMatch(JSON.stringify(mine), /İç not/, 'iç not görünmez');
      assert.equal((await call('POST', '/api/sanctions/appeal', { sanction: s.id, text: 'kısa' }, appeal))[0], 400);
      const [st, a] = await call('POST', '/api/sanctions/appeal', { sanction: s.id, text: 'Hesabım ele geçirilmişti, o mesajları ben yazmadım.' }, appeal);
      assert.equal(st, 200, a.error);
      assert.equal((await call('POST', '/api/sanctions/appeal', { sanction: s.id, text: 'Hesabım ele geçirilmişti, tekrar.' }, appeal))[0], 409, 'açık itiraz tek');

      const [, list] = await call('GET', '/api/admin/appeals', null, mod.session);
      assert.ok(list.appeals.some((x) => x.id === a.appeal.id));
      // A moderator reviews; reducing needs the decision permission.
      assert.equal((await call('POST', '/api/admin/appeals/decide', { id: a.appeal.id, outcome: 'reduced', minutes: 1440, note: 'Kısmen haklı' }, mod.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/appeals/decide', { id: a.appeal.id, outcome: 'needs_review', note: 'Kayıtlara bakılacak' }, mod.session))[0], 200);
      const [ds, dec] = await call('POST', '/api/admin/appeals/decide', { id: a.appeal.id, outcome: 'reduced', minutes: 1440, note: 'Kısmen haklı' }, admin.session);
      assert.equal(ds, 200, dec.error);
      assert.equal(dec.appeal.status, 'reduced');
      assert.ok(new Date(dec.sanction.endAt) - new Date(dec.sanction.startAt) <= 1440 * 60_000 + 1000);
      const [, after] = await call('GET', '/api/sanctions/mine', null, appeal);
      assert.equal(after.appeals[0].status, 'reduced');
      assert.equal(after.appeals[0].note, 'Kısmen haklı');

      // Lifetime bans can be appealed too, and lifted on appeal.
      const [p] = await sanction(admin, { user: u.user.id, type: 'account_ban', minutes: null });
      assert.equal((await call('GET', '/api/sanctions/mine', null, appeal))[0], 401, 'yeni ban oturumları yine kapatır');
      const appeal2 = (await signIn(u.deviceKey))[1].appealSession;
      const [, a2] = await call('POST', '/api/sanctions/appeal', { sanction: p.id, text: 'Lütfen yeniden değerlendirin, kuralları okudum.' }, appeal2);
      assert.equal((await call('POST', '/api/admin/appeals/decide', { id: a2.appeal.id, outcome: 'lifted', note: 'Kabul edildi' }, admin.session))[0], 200);
      await call('POST', '/api/admin/appeals/decide', { id: a.appeal.id, outcome: 'upheld', note: 'x' }, admin.session);
      await runOut(s.id);
      assert.equal((await signIn(u.deviceKey))[0], 200);
      assert.ok((await audits(p.id)).some((x) => x.action === 'lift'));
    });
  });

  describe('Otomasyon ve onay', () => {
    test('3 farklı şikâyet: kademe 1 otomatik kısa susturma; ağır kademe insan onayı bekler; öneren onaylayamaz', async () => {
      const u = await signUp('Şikâyetli');
      for (let i = 0; i < 3; i++) {
        const r = await signUp(`Şikâyetçi ${i}`);
        assert.equal((await call('POST', '/api/report', { type: 'user', id: u.user.id, reason: 'Taciz / hakaret' }, r.session))[0], 200);
      }
      const [, mine] = await call('GET', '/api/sanctions/mine', null, u.session);
      assert.equal(mine.sanctions.length, 1);
      assert.deepEqual([mine.sanctions[0].type, mine.sanctions[0].appliedBy], ['mute_global_text', 'Otomatik sistem']);

      // A policy step that is a lifetime ban waits for a person; the proposer can't approve it.
      const [st] = await call('POST', '/api/admin/sanction-policies', { reason: 'threat', windowDays: 30, steps: [{ type: 'account_ban', minutes: null, auto: true }] }, admin.session);
      assert.equal(st, 200);
      const [, p] = await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_all', reason: 'threat', usePolicy: true, description: 'Tehdit' }, mod.session);
      assert.equal(p.sanctions[0].status, 'pending');
      assert.equal(p.sanctions[0].type, 'account_ban');
      assert.equal((await call('GET', '/api/me', null, u.session))[0], 200, 'onaylanmadan başlamaz');
      assert.equal((await call('POST', '/api/admin/sanctions/approve', { id: p.sanctions[0].id, approve: true, note: 'Onay' }, mod.session))[0], 403);
      const [as, ap] = await call('POST', '/api/admin/sanctions/approve', { id: p.sanctions[0].id, approve: true, note: 'Kanıtlar yeterli' }, admin.session);
      assert.equal(as, 200, ap.error);
      assert.equal((await call('GET', '/api/me', null, u.session))[0], 401);
    });

    test('ajans yöneticisi yalnızca kendi yayıncısının geçmişini görür; yaptırım veremez', async () => {
      const u = await signUp('Ajanssız');
      const outsider = await signUp('Dışarıdan');
      assert.equal((await call('GET', `/api/agency/member-sanctions?user=${u.user.id}`, null, outsider.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_all', minutes: 5, reason: 'spam', description: 'x y z' }, outsider.session))[0], 403);
    });

    test('yetki verme: süper yönetici moderatöre ek yetki verir, kayda geçer', async () => {
      const m2 = await h.account('Yeni Moderatör', 'moderator');
      const u = await signUp('Hedef 9');
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'account_ban', minutes: null, reason: 'fraud', description: 'Dolandırıcılık' }, m2.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanction-permissions', { user: m2.user.id, permission: 'sanction.ban_permanent', grant: true }, mod.session))[0], 403);
      assert.equal((await call('POST', '/api/admin/sanction-permissions', { user: m2.user.id, permission: 'sanction.ban_permanent', grant: true }, admin.session))[0], 200);
      assert.equal((await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'account_ban', minutes: null, reason: 'fraud', description: 'Dolandırıcılık' }, m2.session))[0], 200);
    });
  });
});
