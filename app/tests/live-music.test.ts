/// <reference types="node" />
// Live mode, music in the rooms (lib/live/music, lib/live/room-bus parseMusic): every phone reads the same point of
// the same track from the room's clock (pauses included, played-through tracks walked past, round and round with
// repeat), the playlist is built from the server's order, a picked file is checked before anything is sent and then
// goes to the storage as kind music before the track is saved (its "Sanatçı - Parça" name split), the search folds
// Turkish letters, the room actions carry the server's clock, and the DJ counts and list size are the server's
// (server/api/music.mjs). The phone's storage is a stand-in (tests/api-stub-hooks.mjs); fetch is a fake server and a
// fake storage.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ROOM_LIMITS, djCapacity } from '@/data/catalog';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

type Seen = { method: string; url: string; path: string; body: unknown };
type Reply = { status?: number; body?: unknown; blob?: Blob };

const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
let seen: Seen[] = [];
let route: (s: Seen) => Reply = () => ({ status: 404, body: { error: 'yok' } });
const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const raw = init?.body;
    const s: Seen = { method: init?.method ?? 'GET', url: url.href, path: url.pathname + url.search, body: typeof raw === 'string' ? JSON.parse(raw) : raw };
    seen.push(s);
    const r = route(s);
    if (r.blob) return new Response(r.blob, { status: r.status ?? 200 });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const music = () => import('@/lib/live/music');
const bus = () => import('@/lib/live/room-bus');
const T = (key: string, seconds: number) => ({ key, title: `Parça ${key}`, artist: '', url: `https://cdn.test/music/u1/${key}.mp3`, seconds, by: 'u1', byName: 'Deniz' });
/** Music as the phone keeps it: `tracks` walked from startedAt, the list (here the same rows), repeat off. */
const M = (tracks: ReturnType<typeof T>[], startedAt: number | null, pausedAt: number | null = null, repeat: 'off' | 'one' | 'all' = 'off') => ({ tracks, startedAt, pausedAt, repeat, list: tracks });

describe('odanın saati', () => {
  test('herkes aynı parçanın aynı anını çalar; biten parçalar geçilir, duraklatınca durur', async () => {
    const { nowPlaying } = await music();
    const m = M([T('1', 60), T('2', 30)], 1_000_000);
    assert.deepEqual(nowPlaying(m, 1_000_000 + 12_500), { index: 0, track: m.tracks[0], position: 12.5, paused: false, lap: 0 });
    // The first one played through but the server hasn't read the queue yet: the second plays.
    assert.equal(nowPlaying(m, 1_000_000 + 70_000)?.index, 1);
    assert.equal(nowPlaying(m, 1_000_000 + 70_000)?.position, 10);
    assert.equal(nowPlaying(m, 1_000_000 + 95_000), null);
    // Paused 20 s in: the clock stands still at 20 s however late it is.
    const p = { ...m, pausedAt: 1_000_000 + 20_000 };
    assert.deepEqual(nowPlaying(p, 1_000_000 + 500_000), { index: 0, track: m.tracks[0], position: 20, paused: true, lap: 0 });
    // A clock a little ahead of the server's start reads 0, nothing / empty reads null.
    assert.equal(nowPlaying(m, 999_000)?.position, 0);
    assert.equal(nowPlaying(M([], null), 1), null);
    assert.equal(nowPlaying(null, 1), null);
  });

  test('tekrar: bir parça başa döner, hepsi listeyi dolaşır; her tur ayrı sayılır', async () => {
    const { nowPlaying, nextRepeat } = await music();
    const one = M([T('1', 60)], 1_000_000, null, 'one');
    // Two laps and 10 s: the same track, 10 s in, third round.
    assert.deepEqual(nowPlaying(one, 1_000_000 + 130_000), { index: 0, track: one.tracks[0], position: 10, paused: false, lap: 2 });
    // An older server's metadata with more tracks: repeat one still plays only the first.
    assert.equal(nowPlaying({ ...one, tracks: [T('1', 60), T('2', 30)] }, 1_000_000 + 70_000)?.track.key, '1');
    const all = M([T('1', 60), T('2', 30)], 1_000_000, null, 'all');
    assert.deepEqual(nowPlaying(all, 1_000_000 + 95_000), { index: 0, track: all.tracks[0], position: 5, paused: false, lap: 1 });
    assert.equal(nowPlaying(all, 1_000_000 + 160_000)?.track.key, '2');
    // Paused: the clock stands still, in whatever round.
    assert.equal(nowPlaying({ ...all, pausedAt: 1_000_000 + 100_000 }, 9_999_999)?.position, 10);
    assert.deepEqual(['off', 'all', 'one'].map((r) => nextRepeat(r as 'off')), ['all', 'one', 'off']);
  });

  test('oda bilgisindeki müzik: tuhaf parçalar düşer, boş sırada saat yok', async () => {
    const { parseMusic, parseRoomState } = await bus();
    const raw = {
      tracks: [T('1', 60), { ...T('2', 3) }, { ...T('3', 60), url: 'http://x.test/a.mp3' }, { ...T('x', 60) }, null, { ...T('4', 90), byName: 5 }],
      startedAt: 123,
      pausedAt: 'dün',
    };
    // A server from before the playlist: no repeat, no order; the tracks are the list.
    const kept = [T('1', 60), { ...T('4', 90), byName: '' }];
    assert.deepEqual(parseMusic(raw), M(kept, 123));
    assert.deepEqual(parseMusic({ tracks: [], startedAt: 5, pausedAt: 6 }), M([], null));
    assert.equal(parseMusic({ startedAt: 5 }), null);
    assert.equal(parseMusic('müzik'), null);
    const state = parseRoomState(JSON.stringify({ micQueue: false, queue: [], music: { tracks: [T('9', 60)], startedAt: 50, pausedAt: null } }));
    assert.deepEqual(state?.music, M([T('9', 60)], 50));
  });

  test('çalma listesi: sunucunun sırası; çalınmışlar ve sıradakiler bir arada, sanatçı adıyla', async () => {
    const { parseMusic } = await bus();
    const a = { ...T('1', 60), artist: 'Gece Grubu' };
    // Row 2 plays (tracks: it and what follows), row 1 played (others), order is the list.
    const m = parseMusic({ tracks: [T('2', 60), T('3', 60)], others: [a, { ...T('x', 60) }], order: ['1', '2', '3', 'x', 7], startedAt: 10, pausedAt: null, repeat: 'all' });
    assert.deepEqual(m?.list.map((t) => t.key), ['1', '2', '3']);
    assert.equal(m?.list[0].artist, 'Gece Grubu');
    assert.deepEqual(m?.tracks.map((t) => t.key), ['2', '3']);
    assert.equal(m?.repeat, 'all');
    // Nothing plays but the list stays; an odd repeat is off.
    const idle = parseMusic({ tracks: [], others: [a], order: ['1'], startedAt: null, pausedAt: null, repeat: 'hep' });
    assert.deepEqual([idle?.list.map((t) => t.key), idle?.startedAt, idle?.repeat], [['1'], null, 'off']);
    // A row that plays but is missing from order still shows.
    assert.deepEqual(parseMusic({ tracks: [T('5', 60)], others: [], order: [], startedAt: 1, pausedAt: null })?.list.map((t) => t.key), ['5']);
  });

  test('arama Türkçe harfleri ayırt etmez; ad, sanatçı ya da ekleyende arar', async () => {
    const { matchTrack } = await music();
    const t = { title: 'Şarkı İçin', artist: 'Işık Grubu', byName: 'Deniz' };
    for (const q of ['şarkı', 'SARKI', 'için', 'isik', 'ışık grubu', 'deniz', '  ', 'şar ışı']) assert.ok(matchTrack(t, q), q);
    for (const q of ['gece', 'şarkım']) assert.ok(!matchTrack(t, q), q);
  });
});

describe('Kütüphanem', () => {
  const FILE = new Blob([new Uint8Array(4096)], { type: 'audio/mpeg' });
  const TARGET = { uploadUrl: 'https://storage.test/music/u1/a.mp3?sig=1', method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, publicUrl: 'https://cdn.test/music/u1/a.mp3', expiresIn: 300 };

  test('dosya türü seçiciden ya da uzantıdan; adı uzantısız', async () => {
    const { audioType, trackTitle } = await music();
    assert.equal(audioType('a.mp3', 'audio/mpeg'), 'audio/mpeg');
    assert.equal(audioType('Şarkı.M4A', null), 'audio/mp4');
    assert.equal(audioType('ses.flac', 'application/octet-stream'), 'audio/flac');
    assert.equal(audioType('video.mkv', 'video/x-matroska'), null);
    assert.equal(trackTitle('gece_mavisi__01.mp3'), 'gece mavisi 01');
    assert.equal(trackTitle('.mp3'), 'Parça');
    assert.equal(trackTitle(`${'a'.repeat(100)}.wav`).length, 80);
  });

  test('"Sanatçı - Parça" adı ikiye ayrılır; tiresiz ad yalnız parça adı', async () => {
    const { trackName } = await music();
    assert.deepEqual(trackName('Sezen Aksu - Gülümse.mp3'), { title: 'Gülümse', artist: 'Sezen Aksu' });
    assert.deepEqual(trackName('Grup_Gece_–_Yol (Canlı).m4a'), { title: 'Yol (Canlı)', artist: 'Grup Gece' });
    assert.deepEqual(trackName('AC-DC - Yıldırım.mp3'), { title: 'Yıldırım', artist: 'AC-DC' });
    assert.deepEqual(trackName('gece_mavisi-01.mp3'), { title: 'gece mavisi-01', artist: '' });
    assert.deepEqual(trackName(' - .mp3'), { title: '-', artist: '' });
  });

  test('parça: önce depoya (tür music), sonra kütüphaneye; uygunsuz dosya hiç gönderilmez', async () => {
    const { uploadTrack } = await music();
    const track = { id: '7', title: 'gece mavisi', url: TARGET.publicUrl, seconds: 185, createdAt: '2026-11-08T10:00:00.000Z' };
    route = (s) => (s.url === 'file:///gece_mavisi.mp3' ? { blob: FILE } : s.path === '/api/media/upload-url' ? { body: TARGET } : s.url === TARGET.uploadUrl ? { status: 200 } : { body: { track } });
    assert.deepEqual(await uploadTrack({ uri: 'file:///gece_mavisi.mp3', name: 'gece_mavisi.mp3', size: 4096, mimeType: 'audio/mpeg' }, 184.6), track);
    assert.deepEqual(
      seen.map((s) => `${s.method} ${s.url}`),
      ['GET file:///gece_mavisi.mp3', 'POST http://api.test/api/media/upload-url', `PUT ${TARGET.uploadUrl}`, 'POST http://api.test/api/music'],
    );
    assert.deepEqual(seen[1].body, { kind: 'music', contentType: 'audio/mpeg', size: 4096 });
    assert.deepEqual(seen[3].body, { title: 'gece mavisi', url: TARGET.publicUrl, seconds: 185, size: 4096 });

    // A "Sanatçı - Parça" name goes with its performer.
    seen = [];
    route = (s) => (s.url.startsWith('file:') ? { blob: FILE } : s.path === '/api/media/upload-url' ? { body: TARGET } : s.url === TARGET.uploadUrl ? { status: 200 } : { body: { track } });
    await uploadTrack({ uri: 'file:///a.mp3', name: 'Gece Grubu - Yol.mp3', mimeType: 'audio/mpeg' }, 60);
    assert.deepEqual(seen[3].body, { title: 'Yol', artist: 'Gece Grubu', url: TARGET.publicUrl, seconds: 60, size: 4096 });

    seen = [];
    await assert.rejects(uploadTrack({ uri: 'file:///a.mkv', name: 'a.mkv' }, 100), /MP3, M4A/);
    await assert.rejects(uploadTrack({ uri: 'file:///b.mp3', name: 'b.mp3', size: 21 * 1024 * 1024 }, 100), /20 MB/);
    await assert.rejects(uploadTrack({ uri: 'file:///c.mp3', name: 'c.mp3' }, 3), /5 saniye/);
    await assert.rejects(uploadTrack({ uri: 'file:///d.mp3', name: 'd.mp3' }, 1300), /20 dakika/);
    assert.equal(seen.length, 0);
  });

  test('depo yüklemeyi reddederse parça kaydedilmez', async () => {
    const { uploadTrack } = await music();
    route = (s) => (s.url.startsWith('file:') ? { blob: FILE } : s.path === '/api/media/upload-url' ? { body: TARGET } : { status: 403 });
    await assert.rejects(uploadTrack({ uri: 'file:///a.mp3', name: 'a.mp3' }, 60), /yüklenemedi \(403\)/);
    assert.ok(!seen.some((s) => s.path === '/api/music'));
  });
});

describe('odada çalma', () => {
  test('işlemler odayla gider, cevaptaki sunucu saati konum için kullanılır', async () => {
    const { roomMusicAction, roomMusicGet, playingNow } = await music();
    const startedAt = Date.parse('2026-11-08T10:00:00.000Z');
    route = (s) =>
      s.method === 'GET'
        ? { body: { music: { tracks: [T('1', 120)], startedAt, pausedAt: null }, canPlay: false, serverNow: '2026-11-08T10:00:30.000Z' } }
        : { body: { music: { tracks: [T('1', 120)], startedAt, pausedAt: startedAt + 45_000 }, serverNow: '2026-11-08T10:00:45.000Z' } };
    const got = await roomMusicGet('oda 1');
    assert.equal(seen[0].path, '/api/rooms/music?room=oda%201');
    assert.equal(got.canPlay, false);
    // This phone's clock may be anything: the position comes from the server's.
    const pos = playingNow(got.music)?.position ?? -1;
    assert.ok(pos >= 30 && pos < 32, String(pos));
    const paused = await roomMusicAction('oda 1', { action: 'pause' });
    assert.deepEqual(seen[1].body, { room: 'oda 1', action: 'pause' });
    assert.deepEqual(playingNow(paused), { index: 0, track: T('1', 120), position: 45, paused: true, lap: 0 });
    await roomMusicAction('oda 1', { action: 'add', tracks: ['7', '9'] });
    assert.deepEqual(seen[2].body, { room: 'oda 1', action: 'add', tracks: ['7', '9'] });
    await roomMusicAction('oda 1', { action: 'repeat', mode: 'one' });
    assert.deepEqual(seen[3].body, { room: 'oda 1', action: 'repeat', mode: 'one' });
  });

  test('DJ sayısı seviyeyle sunucudakiyle aynı', () => {
    const server = fs.readFileSync(path.resolve(import.meta.dirname, '../../server/api/music.mjs'), 'utf8');
    const limits = /export const DJ_LIMITS = \[([^\]]+)\]/.exec(server)?.[1].split(',').map(Number);
    assert.deepEqual(limits, ROOM_LIMITS.map((r) => r.djs));
    assert.equal(djCapacity(1), 3);
    assert.equal(djCapacity(15), 18);
  });

  test('çalma listesinin boyu sunucudakiyle aynı', async () => {
    const { LIST_MAX } = await music();
    const server = fs.readFileSync(path.resolve(import.meta.dirname, '../../server/api/music.mjs'), 'utf8');
    assert.equal(Number(/export const LIST_MAX = (\d+)/.exec(server)?.[1]), LIST_MAX);
  });
});
