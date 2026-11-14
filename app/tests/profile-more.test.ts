/// <reference types="node" />
// Other people's profiles in a live build (lib/profile-more, lib/live/profile, server/api/profiles.mjs): the server's
// lists and level curve are the app's (so the form offers what the server takes and a level reads the same on both),
// the server's extras show as they are with nothing made up, the form's checks match the server's, the Vitrin keeps
// only what the app knows, and a profile read brings the levels, friends, gifts, staff role, extras and album.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Pure modules: they need neither the phone's stand-ins below nor a server address at import.
import { CHARM_XP } from '@/data/charm';
import { GIFTS } from '@/data/mock';
import { EDUCATION, MEDALS, NO_EXTRAS, PERSONALITY_TAGS, RELATIONSHIP, TITLES, ZODIACS } from '@/data/profile';
import { COUNTRIES } from '@/data/social-ui';
import { WEALTH_XP } from '@/data/wealth';
import { LIMITS } from '@/lib/profile-rules';
import { CONTACT_MESSAGE } from '@/lib/contact-filter';
import { EXTRA_LIMITS, HONOUR_RULES, LANGUAGE_OPTIONS, draftFromExtras, extrasFromServer, extrasPatch, showcaseView, toggleIn, validateExtras } from '@/lib/profile-more';
// Plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/profile-rules.mjs';

// lib/live/profile (imported in the tests below) runs on lib/api: the phone's storage is a stand-in, the server fake.
register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

const EMPTY = { height: null, weight: null, job: null, languages: [], zodiac: null, tags: [], relationship: null, education: null, slogan: null, country: null };

describe('Sunucunun profil kuralları uygulamayla aynı', () => {
  test('seçenek listeleri ve sınırlar', () => {
    assert.deepEqual(server.ZODIACS, [...ZODIACS]);
    assert.deepEqual(server.RELATIONSHIP, [...RELATIONSHIP]);
    assert.deepEqual(server.EDUCATION, [...EDUCATION]);
    assert.deepEqual(server.TAGS, PERSONALITY_TAGS.map((t) => t.label));
    assert.deepEqual(server.LANGUAGES, [...LANGUAGE_OPTIONS]);
    assert.deepEqual(server.COUNTRIES, COUNTRIES.filter((c) => c.code !== 'ALL').map((c) => c.code));
    assert.deepEqual(server.EXTRA_LIMITS, { ...EXTRA_LIMITS });
    assert.equal(server.ALBUM_MAX, LIMITS.photos);
  });

  test('Cömertlik ve Yankı seviye eğrisi aynı', () => {
    assert.deepEqual(server.WEALTH_XP, WEALTH_XP);
    assert.deepEqual(server.CHARM_XP, CHARM_XP);
    assert.equal(server.levelFrom(server.CHARM_XP, 249), 4);
    assert.equal(server.levelFrom(server.CHARM_XP, 250), 5);
  });

  test('madalya ve unvan kuralları, uygulamanın bildiği kimliklerle', () => {
    assert.deepEqual({ ...server.MEDAL_RULES, ...server.TITLE_RULES }, { ...HONOUR_RULES });
    for (const id of ['md1', 'md4', 'md6']) assert.ok(MEDALS.some((m) => m.id === id), id);
    for (const id of ['t2', 't5']) assert.ok(TITLES.some((t) => t.id === id), id);
  });
});

describe('Kişisel bilgiler', () => {
  test('sunucudan gelen olduğu gibi; boş olan boş kalır, örnek değer yok', () => {
    assert.deepEqual(extrasFromServer(null), NO_EXTRAS);
    assert.deepEqual(extrasFromServer(EMPTY), { ...NO_EXTRAS });
    const x = extrasFromServer({ ...EMPTY, height: 172, job: 'Mimar', languages: ['Türkçe'], zodiac: 'Aslan', tags: ['Kahve', 'Bilinmeyen'], slogan: 'Merhaba', country: 'DE' });
    assert.equal(x.height, 172);
    assert.equal(x.weight, 0);
    assert.equal(x.job, 'Mimar');
    assert.deepEqual(x.tags, [{ emoji: '☕', label: 'Kahve', art: 'etiket-kahve' }], 'bilinmeyen etiket gösterilmez');
    assert.equal(x.slogan, 'Merhaba');
    assert.equal(x.birthday, '', 'doğum günü buradan gelmez');
  });

  test('form taslağı ve gönderilen gövde: kırpılır, boş olan silinir, tekrar eden bir kez', () => {
    const d = draftFromExtras(extrasFromServer({ ...EMPTY, height: 180, tags: ['Dans'] }));
    assert.equal(d.height, '180');
    assert.equal(d.weight, '');
    const body = extrasPatch({ ...d, job: '  Aşçı ', languages: ['Türkçe', 'Türkçe'], slogan: '   ', zodiac: '' }, '', true);
    assert.deepEqual(body, { height: 180, weight: null, job: 'Aşçı', languages: ['Türkçe'], zodiac: null, tags: ['Dans'], relationship: null, education: null, slogan: null, country: null, genderHidden: true });
    assert.equal(extrasPatch(d, 'TR', false).country, 'TR');
  });

  test('kontroller sunucununkiyle aynı: aralık, uzunluk, iletişim süzgeci', () => {
    const d = draftFromExtras(NO_EXTRAS);
    assert.deepEqual(validateExtras(d), {});
    assert.deepEqual(validateExtras({ ...d, height: '120', weight: '250' }), {});
    assert.ok(validateExtras({ ...d, height: '119' }).height);
    assert.ok(validateExtras({ ...d, height: '231' }).height);
    assert.ok(validateExtras({ ...d, weight: '29' }).weight);
    assert.ok(validateExtras({ ...d, job: 'x'.repeat(31) }).job);
    assert.ok(validateExtras({ ...d, slogan: 'y'.repeat(81) }).slogan);
    assert.equal(validateExtras({ ...d, slogan: 'Yaz bana 0532 123 45 67' }).slogan, CONTACT_MESSAGE);
    assert.equal(validateExtras({ ...d, job: 'instagram: ayse.kaya' }).job, CONTACT_MESSAGE);
  });

  test('çoklu seçim sınırı', () => {
    assert.deepEqual(toggleIn(['a'], 'b', 2), ['a', 'b']);
    assert.deepEqual(toggleIn(['a', 'b'], 'c', 2), ['a', 'b'], 'dolu liste almaz');
    assert.deepEqual(toggleIn(['a', 'b'], 'a', 2), ['b']);
  });
});

describe('Vitrin', () => {
  test('sunucunun cevabı uygulamanın adlarıyla; bilinmeyen kimlik ve hediye dışarıda', () => {
    const v = showcaseView({ gifts: [{ id: 'g1', count: 10 }, { id: 'lk1', count: 3 }], rides: ['rd-scooter', 'rd-yok'], entries: ['en-dragon', 'en-sparkle'], medals: ['md1', 'md99'], titles: ['t2'] });
    assert.deepEqual(v.medals.map((m) => m.id), ['md1']);
    assert.deepEqual(v.titles.map((t) => t.id), ['t2']);
    assert.deepEqual(v.rides, [{ id: 'rd-scooter', emoji: '🛵', name: 'Scooter' }]);
    // Işıltı is out of the shop: not on the Vitrin either.
    assert.deepEqual(v.entries.map((e) => e.id), ['en-dragon']);
    assert.equal(v.giftWall.length, GIFTS.length);
    assert.equal(v.giftWall.find((g) => g.id === 'g1')?.count, 10);
    assert.equal(v.giftWall.reduce((s, g) => s + g.count, 0), 10, 'katalog dışı hediye duvarda yok');
  });
});

// --- A profile read against a fake server ------------------------------------------------------------------------
type Seen = { method: string; path: string; body: unknown };
const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
let seen: Seen[] = [];
let route: (s: Seen) => { status?: number; body?: unknown } = () => ({ status: 404, body: { error: 'yok' } });
const realFetch = globalThis.fetch;
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const s: Seen = { method: init?.method ?? 'GET', path: url.pathname + url.search, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined };
    seen.push(s);
    const r = route(s);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const THEM = 'bbbbbbbb-0000-4000-8000-000000000002';
const base = { id: THEM, name: 'Deniz', username: 'deniz', gender: null, age: 29, city: 'İzmir', bio: '', interests: [], avatarUrl: null, followers: 3, following: 4, isFollowing: false, blockedByMe: false };

describe('Canlı profil okuması', () => {
  test('seviye, arkadaş, hediye, yetkili rolü, bilgiler ve albüm gelir; seviye kartlar için saklanır', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    const { levelsOf } = await import('@/lib/live/levels');
    const { userById } = await import('@/data/mock');
    const user = { ...base, levels: { wealth: 3, charm: 7 }, friends: 2, giftsReceived: 11, staff: 'moderator', extras: { ...EMPTY, country: 'NL', slogan: 'Selam' }, photos: [{ id: 5, url: 'https://cdn.test/album/x.jpg' }] };
    route = (s) => (s.path === `/api/user?id=${THEM}&visit=1` ? { body: { user } } : { status: 404 });
    const c = await loadPublicProfile(THEM, false, true);
    assert.deepEqual([c.levels, c.friends, c.giftsReceived, c.staff, c.extras?.slogan, c.photos?.length], [{ wealth: 3, charm: 7 }, 2, 11, 'moderator', 'Selam', 1]);
    assert.deepEqual(levelsOf(THEM), { wealth: 3, charm: 7 });
    assert.equal(userById(THEM).country, 'NL');
    assert.equal(userById(THEM).gender, undefined, 'gizli cinsiyet gelmez');
  });

  test('kendi profilimde hangi seviyemin gizli olduğu gelir; gizli seviye kartta yok', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    const { levelsOf } = await import('@/lib/live/levels');
    const user = { ...base, levels: { wealth: null, charm: 2 }, levelsHidden: { wealth: true, charm: false } };
    route = (s) => (s.path === `/api/user?id=${THEM}` ? { body: { user } } : { status: 404 });
    const c = await loadPublicProfile(THEM, true);
    assert.deepEqual(c.levelsHidden, { wealth: true, charm: false });
    assert.deepEqual(levelsOf(THEM), { wealth: null, charm: 2 });
  });

  test('eski sunucu: ek alanlar yok, hiçbir şey uydurulmaz', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    route = (s) => (s.path === `/api/user?id=${THEM}` ? { body: { user: base } } : { status: 404 });
    const c = await loadPublicProfile(THEM);
    for (const k of ['levels', 'friends', 'giftsReceived', 'staff', 'extras', 'photos', 'levelsHidden']) assert.equal(k in c, false, k);
  });

  test('bilgilerin kaydı her alanı gönderir; albüm fotoğrafı kaldırılır', async () => {
    const { saveMyExtras, removeAlbumPhoto } = await import('@/lib/live/profile');
    route = (s) =>
      s.path === '/api/me/extras' ? { body: { extras: { ...EMPTY, job: 'Aşçı', genderHidden: true } } } : s.path === '/api/me/photos/remove' ? { body: { photos: [] } } : { status: 404 };
    const x = await saveMyExtras({ ...draftFromExtras(NO_EXTRAS), job: 'Aşçı' }, null, true);
    assert.equal(x.job, 'Aşçı');
    const sent = seen.find((s) => s.path === '/api/me/extras');
    assert.equal(sent?.method, 'PATCH');
    assert.deepEqual(Object.keys(sent?.body as object).sort(), ['country', 'education', 'genderHidden', 'height', 'job', 'languages', 'relationship', 'slogan', 'tags', 'weight', 'zodiac']);
    assert.deepEqual(await removeAlbumPhoto(5), []);
    assert.deepEqual(seen.at(-1)?.body, { id: 5 });
  });
});
