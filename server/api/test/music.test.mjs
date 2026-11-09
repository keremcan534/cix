// DJs and the room's music (music.mjs): only the owner makes DJs, 3 at first and more as the room rises; a DJ plays
// music and nothing else; a library is for people who have, run or play in a room, with files from their own
// folder; the room's queue plays in order, pauses and skips on the room's clock, drops what played through and
// what left a library, and goes into the LiveKit metadata. A fake LiveKit records what the API asks of it.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 22000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const CDN = 'https://cdn.test';
const h = startApi({
  LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`,
  S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  S3_BUCKET: 'media',
  S3_KEY: 'k',
  S3_SECRET: 's',
  S3_PUBLIC_URL: CDN,
});
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];
const file = (who, name = 'parca') => `${CDN}/music/${who.user.id}/${name}-${rnd(4)}.mp3`;
const addTrack = (who, title, seconds = 180) => ok(call('POST', '/api/music', { title, url: file(who), seconds, size: 3_000_000 }, who.session), title).then((j) => j.track);
const lastMeta = (room) => {
  const c = lkCalls.filter((x) => x.method === 'UpdateRoomMetadata' && x.body.room === `oda-${room}`).pop();
  return c && JSON.parse(c.body.metadata);
};

describe('DJ ve oda müziği', () => {
  test('DJ sınırı: yalnız sahip atar, Lv.1’de 3, seviye artınca artar; DJ başka yetki almaz', async () => {
    const owner = await signUp('Müzik Odası');
    const people = await Promise.all(['Dj Bir', 'Dj İki', 'Dj Üç', 'Dj Dört'].map((n) => signUp(n)));
    const admin = await signUp('Oda Yöneticisi');
    const room = (await ok(call('POST', '/api/rooms', { title: `Müzik ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    const dj = (who, on = true, s = owner.session) => call('POST', '/api/rooms/dj', { room, user: who.user.id, dj: on }, s);

    assert.equal(await status(dj(people[0], true, admin.session)), 403, 'yönetici DJ atayamaz');
    for (const p of people.slice(0, 3)) await ok(dj(p), 'dj');
    assert.equal(await status(dj(people[3])), 409, 'Lv.1 odada 3 DJ');
    assert.equal(await status(dj(admin)), 409, 'yönetici zaten çalar');
    // Lv.6 (1 600 XP): 4 DJs.
    await h.sql.query('UPDATE users SET room_xp = 1600 WHERE id = $1', [owner.user.id]);
    await ok(dj(people[3]), '4. dj');
    const staff = await ok(call('GET', `/api/rooms/staff?room=${room}`, null, people[0].session), 'liste');
    assert.deepEqual(staff.djs.map((d) => d.name), ['Dj Bir', 'Dj İki', 'Dj Üç', 'Dj Dört']);
    assert.equal(staff.bans, undefined, 'DJ yasak listesini görmez');

    // A DJ is not staff: no kicks, mics or mutes.
    const s = people[0].session;
    assert.equal(await status(call('POST', '/api/rooms/ban', { room, user: people[1].user.id, minutes: 5 }, s)), 403);
    assert.equal(await status(call('POST', '/api/rooms/update', { id: room, micCount: 4 }, s)), 403);
    assert.equal(await status(call('POST', '/api/rooms/seat', { room, action: 'lock', seat: 3 }, s)), 403);

    // Made admin: no DJ seat kept for them. Taken off: a seat frees up.
    await ok(call('POST', '/api/rooms/admin', { room, user: people[3].user.id }, owner.session), 'yönetici yap');
    await ok(dj(people[2], false), 'dj al');
    assert.deepEqual((await ok(call('GET', `/api/rooms/staff?room=${room}`, null, owner.session), 'liste')).djs.map((d) => d.name), ['Dj Bir', 'Dj İki']);
  });

  test('kütüphane: odası, yöneticiliği ya da DJ’liği olan ekler; yalnız kendi klasöründen', async () => {
    const owner = await signUp('Kütüphane Sahibi');
    const nobody = await signUp('Dinleyici');
    await ok(call('POST', '/api/rooms', { title: `Kütüphane ${rnd(2)}` }, owner.session), 'oda');
    const upload = (who) => call('POST', '/api/media/upload-url', { kind: 'music', contentType: 'audio/mpeg', size: 4_000_000 }, who.session);
    assert.equal(await status(upload(nobody)), 403, 'odası olmayan yükleyemez');
    assert.equal(await status(call('POST', '/api/music', { title: 'Parça', url: file(nobody), seconds: 100, size: 10 }, nobody.session)), 403);

    const u = await ok(upload(owner), 'yükleme adresi');
    assert.ok(u.publicUrl.startsWith(`${CDN}/music/${owner.user.id}/`) && u.publicUrl.endsWith('.mp3'));
    assert.equal(await status(call('POST', '/api/media/upload-url', { kind: 'music', contentType: 'audio/mpeg', size: 21 * 1024 * 1024 }, owner.session)), 400, '20 MB');
    assert.equal(await status(call('POST', '/api/media/upload-url', { kind: 'music', contentType: 'video/mp4', size: 1000 }, owner.session)), 400);

    const t = (await ok(call('POST', '/api/music', { title: 'Gece Yolu', url: u.publicUrl, seconds: 200, size: 4_000_000 }, owner.session), 'parça')).track;
    assert.equal(t.title, 'Gece Yolu');
    const bad = (body) => status(call('POST', '/api/music', { title: 'Parça', url: file(owner), seconds: 100, size: 10, ...body }, owner.session));
    assert.equal(await bad({ url: file(nobody) }), 400, 'başkasının klasörü');
    assert.equal(await bad({ url: 'https://baska.site/a.mp3' }), 400);
    assert.equal(await bad({ seconds: 2 }), 400);
    assert.equal(await bad({ seconds: 1300 }), 400);
    assert.notEqual(await bad({ title: 'Ara beni 0532 123 45 67' }), 200, 'iletişim bilgisi');
    assert.deepEqual((await ok(call('GET', '/api/music', null, owner.session), 'liste')).tracks.map((x) => x.id), [t.id]);
    await ok(call('POST', '/api/music/remove', { id: t.id }, owner.session), 'sil');
    assert.equal(await status(call('POST', '/api/music/remove', { id: t.id }, owner.session)), 404);
    assert.deepEqual((await ok(call('GET', '/api/music', null, owner.session), 'liste')).tracks, []);
  });

  test('oda sırası: sırayla çalar, duraklar, geçer; biten ve silinen sıradan çıkar; herkes aynı bilgiyi alır', async () => {
    const owner = await signUp('Sıra Sahibi');
    const dj = await signUp('Dj Gece');
    const member = await signUp('Misafir');
    const room = (await ok(call('POST', '/api/rooms', { title: `Sıra ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: true }, owner.session), 'dj');
    const a = await addTrack(dj, 'Birinci', 60);
    const b = await addTrack(dj, 'İkinci', 90);
    const c = await addTrack(owner, 'Üçüncü', 120);
    const play = (who, body) => call('POST', '/api/rooms/music', { room, ...body }, who.session);

    assert.equal(await status(play(member, { action: 'add', track: a.id })), 403, 'dinleyici çalamaz');
    assert.equal(await status(play(dj, { action: 'add', track: c.id })), 404, 'başkasının parçası');
    assert.equal((await ok(call('GET', `/api/rooms/music?room=${room}`, null, member.session), 'oku')).canPlay, false);
    assert.equal((await ok(call('GET', `/api/rooms/music?room=${room}`, null, dj.session), 'oku')).canPlay, true);

    let m = (await ok(play(dj, { action: 'add', track: a.id }), 'ekle')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['Birinci']);
    assert.ok(Math.abs(m.startedAt - Date.now()) < 5000 && m.pausedAt === null);
    assert.equal(m.tracks[0].byName, 'Dj Gece');
    await ok(play(dj, { action: 'add', track: b.id }), 'ekle');
    m = (await ok(play(owner, { action: 'add', track: c.id }), 'ekle')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['Birinci', 'İkinci', 'Üçüncü']);
    assert.deepEqual(lastMeta(room).music.tracks.map((t) => t.title), ['Birinci', 'İkinci', 'Üçüncü'], 'odadaki telefonlar');

    // Pause and resume: the clock leaves the pause out.
    const before = m.startedAt;
    m = (await ok(play(dj, { action: 'pause' }), 'duraklat')).music;
    assert.ok(m.pausedAt >= before);
    await new Promise((r) => setTimeout(r, 30));
    m = (await ok(play(dj, { action: 'resume' }), 'sürdür')).music;
    assert.equal(m.pausedAt, null);
    assert.ok(m.startedAt > before, 'duraklama süresi kadar ileri');

    // Played through: the first one (60 s) is taken off by the clock, nobody had to say so.
    await h.sql.query("UPDATE rooms SET music_started_at = now() - interval '65 seconds' WHERE id = $1", [room]);
    m = (await ok(call('GET', `/api/rooms/music?room=${room}`, null, member.session), 'oku')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['İkinci', 'Üçüncü']);
    assert.ok(Date.now() - m.startedAt >= 4000 && Date.now() - m.startedAt < 8000, 'ikinci 5 sn önce başladı');

    // Skip; a track removed from its library leaves the queue (the playing one: the next starts now).
    m = (await ok(play(owner, { action: 'skip' }), 'geç')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['Üçüncü']);
    await ok(play(dj, { action: 'add', track: b.id }), 'yeniden ekle');
    await ok(call('POST', '/api/music/remove', { id: c.id }, owner.session), 'kütüphaneden sil');
    m = (await ok(call('GET', `/api/rooms/music?room=${room}`, null, dj.session), 'oku')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['İkinci']);
    assert.ok(Date.now() - m.startedAt < 3000);
    assert.deepEqual(lastMeta(room).music.tracks.map((t) => t.title), ['İkinci']);
    assert.equal(await status(play(dj, { action: 'remove', key: '999999' })), 404);
    assert.equal(await status(play(dj, { action: 'karistir' })), 400);

    // A DJ taken off can't play any more; clear empties the room.
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: false }, owner.session), 'dj al');
    assert.equal(await status(play(dj, { action: 'skip' })), 403);
    m = (await ok(play(owner, { action: 'clear' }), 'temizle')).music;
    assert.deepEqual(m, { tracks: [], startedAt: null, pausedAt: null });
  });

  test('hesabını silen DJ’in parçaları odadan çıkar; DJ sınırları uygulamadakiyle aynı', async () => {
    const owner = await signUp('Silme Odası');
    const dj = await signUp('Giden Dj');
    const room = (await ok(call('POST', '/api/rooms', { title: `Silme ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: true }, owner.session), 'dj');
    const t = await addTrack(dj, 'Veda');
    await ok(call('POST', '/api/rooms/music', { room, action: 'add', track: t.id }, dj.session), 'ekle');
    await ok(call('DELETE', '/api/me', null, dj.session), 'hesap sil');
    assert.deepEqual((await ok(call('GET', `/api/rooms/music?room=${room}`, null, owner.session), 'oku')).music.tracks, []);
    assert.deepEqual((await ok(call('GET', `/api/rooms/staff?room=${room}`, null, owner.session), 'liste')).djs, []);

    const catalog = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'app', 'src', 'data', 'catalog.ts'), 'utf8');
    const limits = /export const ROOM_LIMITS[^=]*= \[([\s\S]+?)\n\];/.exec(catalog)[1];
    const app = [...limits.matchAll(/djs: (\d+)/g)].map((x) => Number(x[1]));
    const server = fs.readFileSync(path.join(import.meta.dirname, '..', 'music.mjs'), 'utf8');
    assert.deepEqual(app, JSON.parse(/export const DJ_LIMITS = (\[[^\]]+\])/.exec(server)[1]));
  });
});
