/// <reference types="node" />
// How far people are in a live build (lib/live/distances): the server's rounded distance between two profile
// cities (server/api/city-coords.mjs) reads "Aynı şehir" or "350 km", nothing when there is none, and the profile
// and Anlar keep what the server sent for Keşfet, the profile and the post cards. The phone's storage is a
// stand-in (tests/api-stub-hooks.mjs); fetch is a fake server.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { cityDistanceText, distanceOf, putDistance } from '@/lib/live/distances';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import { cityDistance } from '../../server/api/city-coords.mjs';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

describe('Uzaklık yazısı', () => {
  test('aynı şehir, km, binlik nokta; yoksa hiçbir şey', () => {
    assert.equal(cityDistanceText({ km: 0, sameCity: true }), 'Aynı şehir');
    assert.equal(cityDistanceText({ km: 40, sameCity: false }), '40 km');
    assert.equal(cityDistanceText({ km: 350, sameCity: false }), '350 km');
    assert.equal(cityDistanceText({ km: 1250, sameCity: false }), '1.250 km');
    for (const d of [null, undefined, { km: 0, sameCity: false }, { km: Number.NaN, sameCity: false }]) assert.equal(cityDistanceText(d), null, JSON.stringify(d));
  });

  test('sunucunun yuvarladığı değer aynı okunur', () => {
    assert.equal(cityDistanceText(cityDistance('İstanbul', 'Ankara')), '350 km');
    assert.equal(cityDistanceText(cityDistance('Ankara', 'Kırıkkale')), '60 km');
    assert.equal(cityDistanceText(cityDistance('Edirne', 'Hakkari')), '1.550 km');
    assert.equal(cityDistanceText(cityDistance('Kadıköy, İstanbul', 'ISTANBUL')), 'Aynı şehir');
    assert.equal(cityDistanceText(cityDistance('Bodrum', 'Muğla')), null, 'bilinmeyen şehir');
    assert.equal(cityDistanceText(cityDistance('', 'Ankara')), null, 'şehir yok');
  });

  test('sunucunun söylediği saklanır; eski sunucu bir şey göndermezse bilinen kalır', () => {
    const id = 'cccccccc-0000-4000-8000-000000000003';
    assert.equal(distanceOf(id), null, 'okunmadan yok');
    putDistance(id, { km: 120, sameCity: false });
    assert.deepEqual(distanceOf(id), { km: 120, sameCity: false });
    putDistance(id, undefined);
    assert.deepEqual(distanceOf(id), { km: 120, sameCity: false });
    putDistance(id, null);
    assert.equal(distanceOf(id), null, 'gizli profil ya da bilinmeyen şehir');
  });
});

type Seen = { method: string; path: string };
let seen: Seen[] = [];
let route: (s: Seen) => { status?: number; body?: unknown } = () => ({ status: 404, body: { error: 'yok' } });
const realFetch = globalThis.fetch;
beforeEach(() => {
  const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const s = { method: init?.method ?? 'GET', path: url.pathname + url.search };
    seen.push(s);
    const r = route(s);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Canlı okumalar uzaklığı saklar', () => {
  test('profil ve Anlar: gelen uzaklık kartlar için saklanır, gizli profilde yok', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    const { feed } = await import('@/lib/live/moments');
    const THEM = 'dddddddd-0000-4000-8000-000000000004';
    const SHY = 'eeeeeeee-0000-4000-8000-000000000005';
    const user = { id: THEM, name: 'Deniz', username: null, gender: null, age: 29, city: 'Ankara', bio: '', interests: [], avatarUrl: null, followers: 0, following: 0, isFollowing: false, blockedByMe: false, distance: { km: 350, sameCity: false } };
    route = (s) => (s.path === `/api/user?id=${THEM}` ? { body: { user } } : { status: 404 });
    await loadPublicProfile(THEM);
    assert.equal(cityDistanceText(distanceOf(THEM)), '350 km');

    const author = (id: string, distance: unknown) => ({ id, name: 'Yazan', avatarUrl: null, gender: null, age: null, vipLevel: 0, frame: null, distance });
    const post = (id: string, a: ReturnType<typeof author>) => ({ id, author: a, text: 'Merhaba', imageUrl: null, topic: null, likes: 0, comments: 0, liked: false, createdAt: '2026-11-07T10:00:00.000Z' });
    route = (s) => (s.path.startsWith('/api/moments?') ? { body: { moments: [post('1', author(THEM, { km: 0, sameCity: true })), post('2', author(SHY, null))] } } : { status: 404 });
    const list = await feed({ tab: 'recent' });
    assert.equal(cityDistanceText(list[0].author.distance), 'Aynı şehir');
    assert.equal(cityDistanceText(distanceOf(THEM)), 'Aynı şehir', 'en son okunan geçerli');
    assert.equal(distanceOf(SHY), null);
  });
});
