/// <reference types="node" />
// Other people's looks in a server room (lib/live/looks): a look the server sends into the room as it changes is
// shown at once, the person's photo with it; a look read a moment ago is not asked again, unless the person just
// came into view; an answer that left the server before a newer look arrived doesn't put the old one back. The
// phone's storage is a stand-in (tests/api-stub-hooks.mjs); fetch is a fake server.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
const { putServerUser, userById } = await import('@/data/mock');
const { LOOK_RETRY_MS, loadLooks, lookOf, putLook } = await import('@/lib/live/looks');

const A = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const B = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const look = (frame: string | null, avatarUrl?: string | null) => ({ frame, entry: null, ride: null, bubble: null, specialId: null, micfx: null, wave: null, noble: null, vipLevel: 0, gender: null, ...(avatarUrl !== undefined && { avatarUrl }) });

let asked: string[] = [];
let answer: (ids: string[]) => Promise<Record<string, unknown>> = async () => ({});
const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  asked = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const ids = (url.searchParams.get('ids') ?? '').split(',');
    asked.push(...ids);
    return new Response(JSON.stringify({ looks: await answer(ids) }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Odadaki görünümler', () => {
  test('sunucudan gelen görünüm hemen geçer; fotoğraf da değişir, kaldırılınca fotoğrafsız', () => {
    putServerUser({ id: A, name: 'Ayla', avatar: 'https://depo.test/eski.jpg' });
    putLook(A, look('fr-wing-sky', 'https://depo.test/yeni.jpg'));
    assert.equal(lookOf(A)?.frame, 'fr-wing-sky');
    assert.equal(userById(A).avatar, 'https://depo.test/yeni.jpg');
    assert.equal(userById(A).name, 'Ayla', 'ad kalır');
    // An older server sends no photo: the known one stays.
    putLook(A, look(null));
    assert.equal(lookOf(A)?.frame, null);
    assert.equal(userById(A).avatar, 'https://depo.test/yeni.jpg');
    putLook(A, look(null, null));
    assert.equal(userById(A).avatar, '');
  });

  test('az önce okunan tekrar sorulmaz; görüşe yeni giren tekrar okunur', async () => {
    putServerUser({ id: B, name: 'Bora' });
    answer = async (ids) => Object.fromEntries(ids.map((id) => [id, look('fr-silver', 'https://depo.test/b.jpg')]));
    await loadLooks([B]);
    assert.deepEqual(asked, [B]);
    assert.equal(userById(B).avatar, 'https://depo.test/b.jpg');
    await loadLooks([B]);
    assert.deepEqual(asked, [B], 'iki dakika içinde tekrar sorulmaz');
    await loadLooks([B], Date.now());
    assert.deepEqual(asked, [B, B], 'odaya yeni giren tekrar okunur');
  });

  test('okuma başarısızsa kendiliğinden iki kez daha denenir; yüz gelir (Güncelleme 7, madde 1)', async () => {
    const C = 'aaaaaaaa-0000-4000-8000-0000000000c3';
    const D = 'aaaaaaaa-0000-4000-8000-0000000000d4';
    putServerUser({ id: C, name: 'Cem' });
    putServerUser({ id: D, name: 'Duru' });
    // The real waits are 5 s and 15 s; here a few milliseconds.
    const real = [...LOOK_RETRY_MS];
    LOOK_RETRY_MS.splice(0, LOOK_RETRY_MS.length, 10, 20);
    const until = async (ok: () => boolean) => {
      for (let i = 0; i < 100 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
    };
    try {
      // Busy twice (429), then the answer: the third read brings the face.
      let busy = 2;
      const fetch429 = globalThis.fetch;
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        if (busy-- > 0) {
          asked.push(...(new URL(String(input)).searchParams.get('ids') ?? '').split(','));
          return new Response(JSON.stringify({ error: 'Çok fazla istek' }), { status: 429 });
        }
        return fetch429(input, init);
      }) as typeof fetch;
      answer = async (ids) => Object.fromEntries(ids.map((id) => [id, look('fr-silver', `https://depo.test/${id.slice(-2)}.jpg`)]));
      await loadLooks([C]);
      assert.equal(lookOf(C), undefined, 'ilk okuma başarısız');
      await until(() => !!lookOf(C));
      assert.deepEqual(asked, [C, C, C], 'iki kez daha soruldu');
      assert.equal(userById(C).avatar, 'https://depo.test/c3.jpg');

      // Always down: two retries, then no more on its own (the next look on screen asks again).
      asked = [];
      busy = 1_000;
      await loadLooks([D]);
      await new Promise((r) => setTimeout(r, 120));
      assert.deepEqual(asked, [D, D, D], 'üç deneme, sonra durur');
      assert.equal(lookOf(D), undefined);
    } finally {
      LOOK_RETRY_MS.splice(0, LOOK_RETRY_MS.length, ...real);
    }
  });

  test('okunurken gelen yeni görünümü eski cevap ezmez', async () => {
    let release = () => {};
    answer = (ids) => new Promise((r) => (release = () => r(Object.fromEntries(ids.map((id) => [id, look('fr-rose')])))));
    const reading = loadLooks([A], Date.now() + 1);
    await new Promise((r) => setTimeout(r, 5));
    putLook(A, look('fr-frost'));
    release();
    await reading;
    assert.equal(lookOf(A)?.frame, 'fr-frost');
  });

  test('odanın paketi bana özel "iz kabul etmiyor" bilgisini korurken okuma zamanını tazelemez', async () => {
    const C = 'aaaaaaaa-0000-4000-8000-0000000000f6';
    const E = 'aaaaaaaa-0000-4000-8000-0000000000f7';
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      // My own read: they let only the people they follow, and not me.
      answer = async (ids) => Object.fromEntries(ids.map((id) => [id, { ...look(null), noMarks: true, marksFrom: 'following' }]));
      await loadLooks([C, E]);
      assert.deepEqual(asked.sort(), [C, E].sort());
      // A minute and a half later the room's packet (everyone's: noMarks only for nobody) for both: C still lets only
      // the people they follow (my refusal stays, its read time too); E now lets everyone (a fresh look).
      now += 90_000;
      putLook(C, { ...look('fr-frost'), marksFrom: 'following' });
      putLook(E, { ...look('fr-frost'), marksFrom: 'everyone' });
      assert.deepEqual([lookOf(C)?.noMarks, lookOf(C)?.frame], [true, 'fr-frost']);
      assert.equal(lookOf(E)?.noMarks, undefined);
      // Two minutes after my read: C is read again (they may have followed me since); E's look is a minute old.
      now += 31_000;
      asked = [];
      answer = async (ids) => Object.fromEntries(ids.map((id) => [id, { ...look('fr-frost'), marksFrom: 'following' }]));
      await loadLooks([C, E]);
      assert.deepEqual(asked, [C]);
      assert.equal(lookOf(C)?.noMarks, undefined, 'yeni okuma: artık kabul ediyor');
    } finally {
      Date.now = realNow;
    }
  });
});
