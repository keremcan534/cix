/// <reference types="node" />
// Live mode, the shared YouTube screen of a server room (lib/live/room-video, lib/live/room-bus parseRoomVideo,
// lib/room-modes applyServerVideo; server/api/room-video.mjs): the video comes in with the room metadata and plays on
// this phone at the room's point even when this phone's clock is off; the same server state again leaves what this
// phone learned (length, end, error) alone; a change goes to the server as id, playing or paused and position only.
// The phone's storage is a stand-in (tests/api-stub-hooks.mjs); fetch is a fake server.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

type Seen = { method: string; path: string; body: unknown };
const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
let seen: Seen[] = [];
let reply: unknown = {};
const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const raw = init?.body;
    seen.push({ method: init?.method ?? 'GET', path: url.pathname, body: typeof raw === 'string' ? JSON.parse(raw) : raw });
    return new Response(JSON.stringify(reply), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ID = 'dQw4w9WgXcQ';
const video = () => import('@/lib/live/room-video');

describe('ortak ekran (sunucu odası)', () => {
  test('oda bilgisindeki video okunur; bozuk olan atılır', async () => {
    const { parseRoomVideo } = await video();
    const { parseRoomState } = await import('@/lib/live/room-bus');
    const v = { videoId: ID, status: 'playing', position: 12.5, updatedAt: 1_000, by: 'u1' };
    assert.deepEqual(parseRoomVideo(v), v);
    assert.equal(parseRoomVideo({ ...v, videoId: 'javascript:alert(1)' }), null);
    assert.equal(parseRoomVideo({ ...v, status: 'ended' }), null);
    assert.equal(parseRoomVideo(null), null);
    assert.deepEqual(parseRoomVideo({ ...v, position: -3, updatedAt: 'x' }), { ...v, position: 0, updatedAt: 0 });
    assert.deepEqual(parseRoomState(JSON.stringify({ micQueue: false, queue: [], video: v }))?.video, v);
  });

  test('saati kayık telefon da odanın anını oynatır', async () => {
    const { videoPlayback } = await video();
    const { expectedPosition } = await import('@/lib/room-modes');
    // Server clock 100 000; this phone says 40 000 (a minute behind). The video started 10 s ago on the server.
    const p = videoPlayback({ videoId: ID, status: 'playing', position: 0, updatedAt: 90_000, by: 'u1' }, 40_000, 100_000);
    assert.equal(p.updatedAt, 30_000);
    assert.equal(expectedPosition(p, 40_000), 10);
    assert.equal(p.playbackStatus, 'playing');
    assert.equal(p.updatedBy, 'u1');
  });

  test('değişiklik sunucuya yalnız kimlik, durum ve konumla gider; cevaptaki saat kullanılır', async () => {
    const { shareVideo } = await video();
    reply = { video: { videoId: ID, status: 'paused', position: 40, updatedAt: 5, by: 'me' }, serverNow: '2026-11-13T10:00:00.000Z' };
    const base = { provider: 'youtube' as const, videoId: ID, position: 40, updatedAt: 1, updatedBy: 'me', duration: 200 };
    const got = await shareVideo('oda-1', { ...base, playbackStatus: 'paused' });
    assert.equal(seen[0].path, '/api/rooms/video');
    assert.deepEqual(seen[0].body, { room: 'oda-1', video: { videoId: ID, status: 'paused', position: 40 } });
    assert.equal(got?.status, 'paused');
    await shareVideo('oda-1', { ...base, playbackStatus: 'ended' });
    assert.deepEqual(seen[1].body, { room: 'oda-1', video: { videoId: ID, status: 'paused', position: 40 } }, 'biten video sonunda duraklatılmış gider');
    await shareVideo('oda-1', null);
    assert.deepEqual(seen[2].body, { room: 'oda-1', video: null });
    const { serverNow } = await import('@/lib/sanction-time');
    assert.ok(Math.abs(serverNow() - Date.parse('2026-11-13T10:00:00.000Z')) < 5_000);
  });

  test('sunucunun videosu ekrana gelir; aynı durum tekrar gelince telefonun öğrendiği süre ve hata kalır', async () => {
    const { resetPresence, seedRoom } = await import('@/lib/room-presence');
    const { applyServerVideo, getStage, reportPlayer, resetStages, seedStage } = await import('@/lib/room-modes');
    resetPresence();
    resetStages();
    const R = 'sv1';
    seedRoom(R, { ownerId: 'host', adminIds: [], seats: ['host'], capacity: 8, total: 2, regulars: ['me'] });
    seedStage(R, { info: { level: 15, theme: 'chat', features: ['youtube', 'camera'], classicCapacity: 8, classicMax: 8, manageFunctions: 'admins' } });
    const p = { provider: 'youtube' as const, videoId: ID, playbackStatus: 'playing' as const, position: 0, updatedAt: Date.now(), updatedBy: 'host' };
    applyServerVideo(R, p, 'k1');
    assert.equal(getStage(R)?.playback?.videoId, ID);
    reportPlayer(R, 'host', { videoId: ID, duration: 300, errorCode: 150 });
    assert.equal(getStage(R)?.playback?.playbackStatus, 'error');
    applyServerVideo(R, p, 'k1');
    assert.equal(getStage(R)?.playback?.playbackStatus, 'error', 'aynı durum hatayı silmez');
    applyServerVideo(R, { ...p, playbackStatus: 'paused', position: 50 }, 'k2');
    assert.equal(getStage(R)?.playback?.playbackStatus, 'paused');
    assert.equal(getStage(R)?.playback?.duration, 300, 'aynı videonun süresi kalır');
    applyServerVideo(R, null, 'none');
    assert.equal(getStage(R)?.playback, null);
  });
});
