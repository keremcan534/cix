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
// Older apps read tracks, startedAt and pausedAt; the playlist adds repeat, order and others.
const EMPTY = { tracks: [], startedAt: null, pausedAt: null, repeat: 'off', order: [], others: [] };
const titles = (list) => list.map((t) => t.title);
/** The room's list in its order, as the new app builds it from order, tracks and others. */
const listOf = (m) => {
  const by = new Map([...m.tracks, ...m.others].map((t) => [t.key, t]));
  return m.order.map((k) => by.get(k).title);
};
const keyOf = (m, title) => [...m.tracks, ...m.others].find((t) => t.title === title).key;
const read = async (room, who) => (await ok(call('GET', `/api/rooms/music?room=${room}`, null, who.session), 'oku')).music;

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
    assert.deepEqual(m, EMPTY);
  });

  test('Çal: parça hemen baştan çalar, çalanın yerine geçer; Kapat (clear) susturur', async () => {
    const owner = await signUp('Çal Sahibi');
    const dj = await signUp('Çal Dj');
    const member = await signUp('Çal Dinleyici');
    const room = (await ok(call('POST', '/api/rooms', { title: `Çal ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: true }, owner.session), 'dj');
    const a = await addTrack(owner, 'Sabah', 200);
    const b = await addTrack(dj, 'Akşam', 200);
    const play = (who, body) => call('POST', '/api/rooms/music', { room, ...body }, who.session);
    assert.equal(await status(play(member, { action: 'play', track: a.id })), 403, 'dinleyici çalamaz');
    assert.equal(await status(play(owner, { action: 'play', track: b.id })), 404, 'başkasının parçası');

    let m = (await ok(play(owner, { action: 'play', track: a.id }), 'çal')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['Sabah']);
    assert.ok(Math.abs(m.startedAt - Date.now()) < 5000 && m.pausedAt === null);
    // Paused half way, then another track is played: it starts now, from the start, and nothing waits after it.
    await h.sql.query("UPDATE rooms SET music_started_at = now() - interval '90 seconds' WHERE id = $1", [room]);
    await ok(play(owner, { action: 'pause' }), 'durdur');
    m = (await ok(play(dj, { action: 'play', track: b.id }), 'başka çal')).music;
    assert.deepEqual(m.tracks.map((t) => t.title), ['Akşam']);
    assert.equal(m.tracks[0].byName, 'Çal Dj');
    assert.equal(m.pausedAt, null, 'duraklama kalkar');
    assert.ok(Date.now() - m.startedAt < 5000, 'baştan başlar');
    assert.deepEqual(lastMeta(room).music.tracks.map((t) => t.title), ['Akşam'], 'odadaki telefonlar');

    m = (await ok(play(owner, { action: 'clear' }), 'kapat')).music;
    assert.deepEqual(m, EMPTY);
    assert.deepEqual(lastMeta(room).music.tracks, [], 'çubuk herkesin ekranından kalkar');
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

  test('çalma listesi: birden çok parça birden, öne al, sonraki, önceki, seçileni çal; çalınan listede kalır', async () => {
    const owner = await signUp('Liste Sahibi');
    const dj = await signUp('Liste Dj');
    const room = (await ok(call('POST', '/api/rooms', { title: `Liste ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await ok(call('POST', '/api/rooms/dj', { room, user: dj.user.id, dj: true }, owner.session), 'dj');
    const [a, b, c] = [await addTrack(dj, 'Ay', 60), await addTrack(dj, 'Bulut', 90), await addTrack(dj, 'Ceviz', 120)];
    const other = await addTrack(owner, 'Sahibin', 60);
    const play = (body, who = dj) => call('POST', '/api/rooms/music', { room, ...body }, who.session);

    assert.equal(await status(play({ action: 'add', tracks: [a.id, other.id] })), 404, 'başkasının parçası: hiçbiri eklenmez');
    assert.equal(await status(play({ action: 'add', tracks: [] })), 400);
    assert.equal(await status(play({ action: 'add', tracks: ['x'] })), 400);
    let m = (await ok(play({ action: 'add', tracks: [a.id, b.id, c.id] }), 'üçü birden')).music;
    assert.deepEqual(listOf(m), ['Ay', 'Bulut', 'Ceviz']);
    assert.deepEqual(titles(m.tracks), ['Ay', 'Bulut', 'Ceviz'], 'ilki hemen çalar');
    assert.ok(Math.abs(m.startedAt - Date.now()) < 5000);

    m = (await ok(play({ action: 'top', key: keyOf(m, 'Ceviz') }), 'öne al')).music;
    assert.deepEqual(listOf(m), ['Ay', 'Ceviz', 'Bulut']);
    assert.equal(await status(play({ action: 'top', key: keyOf(m, 'Ay') })), 409, 'çalan zaten başta');
    assert.equal(await status(play({ action: 'top', key: '999999' })), 404);

    // Next: the played row stays on the list (older apps see only what plays from now on).
    m = (await ok(play({ action: 'skip' }), 'sonraki')).music;
    assert.deepEqual(titles(m.tracks), ['Ceviz', 'Bulut']);
    assert.deepEqual(titles(m.others), ['Ay']);
    assert.deepEqual(listOf(m), ['Ay', 'Ceviz', 'Bulut']);
    assert.deepEqual(titles(lastMeta(room).music.tracks), ['Ceviz', 'Bulut'], 'odadaki telefonlar');

    // Previous in the first seconds: the row before; later: the same track from its start.
    m = (await ok(play({ action: 'prev' }), 'önceki')).music;
    assert.deepEqual(titles(m.tracks), ['Ay', 'Ceviz', 'Bulut']);
    await h.sql.query("UPDATE rooms SET music_started_at = now() - interval '20 seconds' WHERE id = $1", [room]);
    m = (await ok(play({ action: 'prev' }), 'baştan')).music;
    assert.equal(m.tracks[0].title, 'Ay');
    assert.ok(Date.now() - m.startedAt < 3000, 'baştan başladı');
    m = (await ok(play({ action: 'prev' }), 'ilk satırda önceki')).music;
    assert.equal(m.tracks[0].title, 'Ay', 'tekrar kapalıyken ilk satırdan geri gidilmez');

    // Paused, then next: the next one waits at its start, still paused.
    await ok(play({ action: 'pause' }), 'durdur');
    m = (await ok(play({ action: 'skip' }), 'durmuşken sonraki')).music;
    assert.equal(m.tracks[0].title, 'Ceviz');
    assert.equal(m.pausedAt, m.startedAt);

    // A row tapped plays now; a played row taken out; the playing one taken out: the next one starts.
    m = (await ok(play({ action: 'jump', key: keyOf(m, 'Bulut') }), 'seçileni çal')).music;
    assert.deepEqual(titles(m.tracks), ['Bulut']);
    assert.equal(m.pausedAt, null);
    m = (await ok(play({ action: 'remove', key: keyOf(m, 'Ay') }), 'çalınanı çıkar')).music;
    assert.deepEqual(listOf(m), ['Ceviz', 'Bulut']);
    assert.equal(await status(play({ action: 'remove', key: '999999' })), 404);
    m = (await ok(play({ action: 'jump', key: keyOf(m, 'Ceviz') }), 'Ceviz')).music;
    m = (await ok(play({ action: 'remove', key: keyOf(m, 'Ceviz') }), 'çalanı çıkar')).music;
    assert.deepEqual(titles(m.tracks), ['Bulut']);
    assert.ok(Date.now() - m.startedAt < 3000);

    // The last one skipped with repeat off: the music ends, the list stays; play (resume) starts it from the top.
    m = (await ok(play({ action: 'skip' }), 'sondan sonraki')).music;
    assert.deepEqual([m.tracks, m.startedAt, listOf(m)], [[], null, ['Bulut']]);
    m = (await ok(play({ action: 'resume' }), 'baştan çal')).music;
    assert.deepEqual(titles(m.tracks), ['Bulut']);
    // The bar's Kapat (stop): the music stops for everyone, the list stays.
    m = (await ok(play({ action: 'stop' }), 'kapat')).music;
    assert.deepEqual([m.tracks, m.startedAt, listOf(m)], [[], null, ['Bulut']]);
    assert.deepEqual(lastMeta(room).music.tracks, [], 'çubuk herkesin ekranından kalkar');

    // A listener can't touch the list.
    const member = await signUp('Liste Dinleyici');
    for (const body of [{ action: 'top', key: keyOf(m, 'Bulut') }, { action: 'prev' }, { action: 'repeat', mode: 'all' }]) assert.equal(await status(play(body, member)), 403);
  });

  test('tekrar: bir (aynı parça), hepsi (liste başa döner), kapalı (liste biter, satırlar kalır)', async () => {
    const owner = await signUp('Tekrar Sahibi');
    const room = (await ok(call('POST', '/api/rooms', { title: `Tekrar ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const [a, b] = [await addTrack(owner, 'Deniz', 60), await addTrack(owner, 'Elma', 90)];
    const play = (body) => call('POST', '/api/rooms/music', { room, ...body }, owner.session);
    const read = async () => (await ok(call('GET', `/api/rooms/music?room=${room}`, null, owner.session), 'oku')).music;
    const ago = (s) => h.sql.query(`UPDATE rooms SET music_started_at = now() - interval '${s} seconds' WHERE id = $1`, [room]);
    await ok(play({ action: 'add', tracks: [a.id, b.id] }), 'ekle');
    assert.equal(await status(play({ action: 'repeat', mode: 'hep' })), 400);

    // One: two laps and 10 s in, the same track; older apps get only that one to walk.
    let m = (await ok(play({ action: 'repeat', mode: 'one' }), 'bir')).music;
    assert.equal(m.repeat, 'one');
    assert.deepEqual([titles(m.tracks), titles(m.others)], [['Deniz'], ['Elma']]);
    await ago(130);
    m = await read();
    assert.equal(m.tracks[0].title, 'Deniz');
    assert.ok(Math.abs(Date.now() - m.startedAt - 10_000) < 3000, 'üçüncü turun 10. saniyesi');

    // All: 215 s from Deniz is a round (150 s) and 65 s: Elma, 5 s in; the list goes round for older apps.
    await ok(play({ action: 'repeat', mode: 'all' }), 'hepsi');
    await ago(215);
    m = await read();
    assert.deepEqual([titles(m.tracks), m.others, listOf(m)], [['Elma', 'Deniz'], [], ['Deniz', 'Elma']]);
    assert.ok(Math.abs(Date.now() - m.startedAt - 5_000) < 3000);
    assert.deepEqual(titles((await ok(play({ action: 'skip' }), 'sonda sonraki')).music.tracks), ['Deniz', 'Elma'], 'sondan başa');
    assert.equal((await ok(play({ action: 'prev' }), 'başta önceki')).music.tracks[0].title, 'Elma', 'baştan sona');

    // Off: past the end nothing plays, the rows stay.
    await ok(play({ action: 'repeat', mode: 'off' }), 'kapalı');
    await ago(100);
    m = await read();
    assert.deepEqual([m.tracks, m.startedAt, listOf(m)], [[], null, ['Deniz', 'Elma']]);
  });

  test('Çal (eski uygulama): parça çalanın hemen arkasına girer ve çalar; liste dolunca en eski çalınmışlar çıkar', async () => {
    const owner = await signUp('Dolu Liste');
    const room = (await ok(call('POST', '/api/rooms', { title: `Dolu ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const [a, b, c] = [await addTrack(owner, 'Fener', 60), await addTrack(owner, 'Güz', 60), await addTrack(owner, 'Hasat', 60)];
    const play = (body) => call('POST', '/api/rooms/music', { room, ...body }, owner.session);
    await ok(play({ action: 'add', tracks: [a.id, b.id] }), 'ekle');
    let m = (await ok(play({ action: 'play', track: c.id }), 'çal')).music;
    assert.deepEqual([listOf(m), titles(m.tracks)], [['Fener', 'Hasat', 'Güz'], ['Hasat', 'Güz']]);
    await ok(play({ action: 'skip' }), 'sonraki');

    // 50 rows, the playing one third: two more drop the two that played; three more are too many.
    const fill = 50 - 3;
    await h.sql.query(
      `INSERT INTO room_music_queue (room_id, track_id, added_by, pos) SELECT $1, $2, $3, 100 + g FROM generate_series(1, ${fill}) g`,
      [room, a.id, owner.user.id],
    );
    assert.equal((await read(room, owner)).order.length, 50);
    assert.equal(await status(play({ action: 'add', tracks: [a.id, b.id, c.id] })), 409, 'çalınmış iki satır yetmez');
    m = (await ok(play({ action: 'add', tracks: [b.id, c.id] }), 'dolu listeye ekle')).music;
    assert.equal(m.order.length, 50);
    assert.equal(listOf(m)[0], 'Güz', 'Fener ve Hasat (çalınmışlar) çıktı');
    assert.deepEqual(listOf(m).slice(-2), ['Güz', 'Hasat']);
  });

  test('sanatçı adı kütüphanede ve odada; parçanın sonunda oda bilgisi yeniden yazılır', async () => {
    const owner = await signUp('Sanatçı Odası');
    const room = (await ok(call('POST', '/api/rooms', { title: `Sanatçı ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const put = (body) => call('POST', '/api/music', { title: 'Kısa', url: file(owner), seconds: 5, size: 1000, ...body }, owner.session);
    assert.notEqual((await put({ artist: 'Ara 0532 123 45 67' }))[0], 200, 'iletişim bilgisi');
    const t = (await ok(put({ artist: '  Gece Grubu ' }), 'parça')).track;
    assert.equal(t.artist, 'Gece Grubu');
    assert.equal((await ok(put({}), 'sanatçısız')).track.artist, '');
    assert.equal((await ok(call('GET', '/api/music', null, owner.session), 'liste')).tracks.find((x) => x.id === t.id).artist, 'Gece Grubu');

    await ok(call('POST', '/api/rooms/music', { room, action: 'repeat', mode: 'one' }, owner.session), 'bir');
    let m = (await ok(call('POST', '/api/rooms/music', { room, action: 'add', tracks: [t.id] }, owner.session), 'ekle')).music;
    assert.equal(m.tracks[0].artist, 'Gece Grubu');
    // 5 s track, 4.2 s in: the next read sets the end's timer; at the end the phones get the next lap.
    await h.sql.query("UPDATE rooms SET music_started_at = now() - interval '4.2 seconds' WHERE id = $1", [room]);
    const start = (await read(room, owner)).startedAt;
    await new Promise((r) => setTimeout(r, 2000));
    assert.equal(lastMeta(room).music.startedAt, start + 5000, 'yeni tur oda bilgisinde');
    assert.equal(lastMeta(room).music.tracks[0].title, 'Kısa');
  });
});
