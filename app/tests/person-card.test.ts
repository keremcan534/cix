/// <reference types="node" />
// The room's person card (Güncelleme 7, components/room/person-card): the ID it shows (a worn special ID, else their
// own number), their medals in the app's names, their look and country read defensively (lib/person-card), and the
// card's profile read (lib/live/profile `card`), which asks the server for the medals and not for the received-gift
// count, and keeps working with an older server that sends neither. The phone's storage is a stand-in
// (tests/api-stub-hooks.mjs); fetch is a fake server.
import { register } from 'node:module';
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { MEDALS, displayId } from '@/data/profile';
import { cardLookOf, countryCodeOf, medalIds, medalsFrom, shownPublicId } from '@/lib/person-card';

register('./api-stub-hooks.mjs', import.meta.url);
process.env.EXPO_PUBLIC_API_URL = 'http://api.test';

describe('Kişi kartı: ID, madalya, görünüş ve ülke', () => {
  const SID = 'bbbbbbbb-0000-4000-8000-000000000010';

  test('ID: demoda hesaptan yapılan, canlıda kendi numarası, taktığı özel ID önce', () => {
    assert.deepEqual(shownPublicId(false, { id: 'u3' }, null), { id: displayId('u3'), special: false });
    assert.deepEqual(shownPublicId(true, { id: SID, publicNo: '100000015838' }, SID), { id: '100000015838', special: false });
    // An older server sends no number: the one made from the server id, as the profile shows.
    assert.deepEqual(shownPublicId(true, { id: SID }, SID), { id: displayId(SID), special: false });
    assert.deepEqual(shownPublicId(true, { id: SID, publicNo: '100000015838' }, SID, 'id-777'), { id: '777', special: true });
    // A worn item that isn't a special ID, or one this app doesn't know, changes nothing.
    assert.deepEqual(shownPublicId(true, { id: SID, publicNo: '100000015838' }, SID, 'fr-rose'), { id: '100000015838', special: false });
    assert.deepEqual(shownPublicId(true, { id: SID, publicNo: '100000015838' }, SID, 'yok-boyle'), { id: '100000015838', special: false });
    // A demo person in live mode has no server id and no number: no ID line.
    assert.deepEqual(shownPublicId(true, { id: 'u3' }, null), { id: null, special: false });
  });

  test('madalyalar: sunucunun kimlikleri uygulamanın adlarıyla, Vitrin sırasında; bilinmeyen atlanır', () => {
    assert.equal(medalIds(undefined), undefined, 'eski sunucu: hiç yok');
    assert.equal(medalIds('md1'), undefined);
    assert.deepEqual(medalIds([]), []);
    assert.deepEqual(medalIds(['md6', 'md1', 'md1', 7, null, '', 'x'.repeat(40)]), ['md6', 'md1']);
    const shown = medalsFrom(['md6', 'md1', 'md99']);
    assert.deepEqual(shown.map((m) => m.id), ['md1', 'md6']);
    assert.deepEqual(shown.map((m) => m.name), ['Haftanın Yıldızı', 'Sosyal Kelebek']);
    assert.deepEqual(medalsFrom(undefined), []);
    // Every medal the server gives has a picture in the app.
    for (const id of ['md1', 'md4', 'md6']) assert.ok(MEDALS.find((m) => m.id === id)?.art, id);
  });

  test('görünüş: çerçeve, VIP seviyesi ve özel ID; bozuk alan yok sayılır', () => {
    const none = { frame: null, vipLevel: 0, specialId: null, entry: null, ride: null, noble: null };
    assert.deepEqual(cardLookOf({ frame: 'fr-rose', vipLevel: 7, specialId: 'id-777', entry: 'en-x', noble: null }), { ...none, frame: 'fr-rose', vipLevel: 7, specialId: 'id-777', entry: 'en-x' });
    // The entry box's part: their entry, ride and noble rank, as GET /api/looks has them (economy.mjs looksOf).
    assert.deepEqual(cardLookOf({ frame: null, entry: 'en-dragon', ride: 'rd-sport', noble: 2, vipLevel: 6, bubble: 'bb-x' }), { ...none, vipLevel: 6, entry: 'en-dragon', ride: 'rd-sport', noble: 2 });
    assert.deepEqual(cardLookOf({ frame: null, vipLevel: 0, specialId: null }), none);
    assert.deepEqual(cardLookOf({ frame: 5, vipLevel: 'çok', specialId: {}, entry: 7, ride: '', noble: 'dük' }), none);
    assert.deepEqual(cardLookOf({ vipLevel: -3, noble: -1 }), none);
    assert.deepEqual(cardLookOf({ vipLevel: 4.7, noble: 2.5 }), { ...none, vipLevel: 4, noble: 2 });
    for (const bad of [null, undefined, 'x', 3, []]) assert.equal(cardLookOf(bad), null);
  });

  test('ülke: yalnız iki büyük harf', () => {
    assert.equal(countryCodeOf('TR'), 'TR');
    for (const bad of ['tr', 'TUR', '', null, undefined, 90]) assert.equal(countryCodeOf(bad), null);
  });
});

type Reply = { status?: number; body?: unknown };
let seen: string[] = [];
let route: (path: string) => Reply = () => ({ status: 404, body: { error: 'yok' } });
const realFetch = globalThis.fetch;
const store = ((globalThis as { __asyncStore?: Map<string, string> }).__asyncStore ??= new Map<string, string>());
beforeEach(() => {
  store.clear();
  store.set('similarclub:device-key', 'device-key-1');
  store.set('similarclub:api-session', 'S1');
  seen = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    seen.push(path);
    const r = route(path);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Kişi kartının profil okuması (card)', () => {
  const id = 'bbbbbbbb-0000-4000-8000-000000000011';
  const user = { id, name: 'Artemis', username: null, gender: 'Kadın', age: 39, city: null, bio: '', interests: [], avatarUrl: null, publicNo: '100000020001', followers: 1, following: 0, isFollowing: true, blockedByMe: false };

  test('kart hediye toplamını ve madalyaları istemez (göstermez); gelen madalya, görünüş, ülke ve gizli seviye okunur', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    route = (p) =>
      p === `/api/user?id=${id}&card=1`
        ? {
            body: {
              user: { ...user, levels: { wealth: 12, charm: null }, friends: 3, staff: null, extras: { country: 'AZ' }, photos: [], medals: ['md4', 'md1'] },
              looks: { frame: 'fr-crown-gold', entry: null, vipLevel: 5, specialId: null, noble: null },
            },
          }
        : { status: 404 };
    const c = await loadPublicProfile(id, false, false, true);
    assert.deepEqual(seen, [`/api/user?id=${id}&card=1`], 'ziyaret yazılmaz, kart işaretleri gider');
    assert.deepEqual(c.medals, ['md4', 'md1']);
    assert.deepEqual(c.look, { frame: 'fr-crown-gold', vipLevel: 5, specialId: null, entry: null, ride: null, noble: null });
    assert.deepEqual(c.levels, { wealth: 12, charm: null }, 'gizlenen Yankı seviyesi gizli kalır');
    assert.equal(c.extras?.country, 'AZ');
    assert.equal('giftsReceived' in c, false);
  });

  test('eski sunucu: madalya ve görünüş yok, kart yine açılır', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    route = (p) => (p.startsWith(`/api/user?id=${id}`) ? { body: { user } } : { status: 404 });
    const c = await loadPublicProfile(id, false, false, true);
    assert.equal('medals' in c, false);
    assert.equal(c.look, null);
    assert.equal(c.followers, 1);
  });

  test('profil ekranı kart işaretlerini göndermez (cevabı değişmez)', async () => {
    const { loadPublicProfile } = await import('@/lib/live/profile');
    route = (p) => (p.startsWith(`/api/user?id=${id}`) ? { body: { user: { ...user, medals: ['md1'] }, looks: { vipLevel: 3 } } } : { status: 404 });
    const c = await loadPublicProfile(id, false, true);
    assert.deepEqual(seen, [`/api/user?id=${id}&visit=1`]);
    assert.equal('medals' in c, false);
    assert.equal('look' in c, false);
  });
});
