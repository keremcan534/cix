// How far apart two people are, from their profile cities (city-coords.mjs), never a phone's location: the table's
// cities, the rounding, names written in different ways, and the distance on Keşfet, the profile and Anlar against
// a real Postgres. None when a city is unknown or the profile is private to the viewer ("Profilim herkese açık"
// off, privacy.mjs), and never a coordinate in an answer.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CITIES, cityDistance, cityKey, findCity, kmBetween, roundKm } from '../city-coords.mjs';
import { COUNTRIES } from '../profile-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', MOMENT_CHARM: '0' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const far = (km) => ({ km, sameCity: false });
const SAME = { km: 0, sameCity: true };
/** A new account living in `city` (none for null). */
async function person(name, city) {
  const a = await signUp(name);
  if (city !== null) await ok(call('PATCH', '/api/me', { city }, a.session), `${name} şehri`);
  return a;
}
const noCoordinates = (j, what) => assert.ok(!/"(lat|lon|latitude|longitude)"/.test(JSON.stringify(j)), `${what}: koordinat yok`);

describe('Şehir tablosu', () => {
  test("Türkiye'nin 81 ili ve uygulamadaki her ülkenin şehirleri, her biri bir kez", () => {
    assert.equal(CITIES.filter((c) => c.country === 'TR').length, 81);
    for (const code of COUNTRIES) assert.ok(CITIES.some((c) => c.country === code), code);
    assert.equal(new Set(CITIES.map((c) => cityKey(c.name))).size, CITIES.length, 'aynı ad iki kez yok');
    for (const c of CITIES) assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180 && c.lat > 30 && c.lat < 60 && c.lon > 0 && c.lon < 55, c.name);
  });

  test('ad nasıl yazılırsa yazılsın: büyük harf, Türkçe harfsiz, başka adı, ilçe ya da ülkeyle', () => {
    for (const t of ['İstanbul', 'ISTANBUL', 'istanbul', 'Istanbul', '  İstanbul ', 'Kadıköy, İstanbul', 'İstanbul / Kadıköy']) assert.equal(findCity(t)?.name, 'İstanbul', t);
    assert.equal(findCity('Izmit')?.name, 'Kocaeli');
    assert.equal(findCity('K.Maraş')?.name, 'Kahramanmaraş');
    assert.equal(findCity('Afyon')?.name, 'Afyonkarahisar');
    assert.equal(findCity('Bakı')?.name, 'Bakü');
    assert.equal(findCity('Gəncə')?.name, 'Gence');
    assert.equal(findCity('München')?.name, 'Münih');
    assert.equal(findCity('Frankfurt am Main, Almanya')?.name, 'Frankfurt');
    assert.equal(findCity("'s-Gravenhage")?.name, 'Lahey');
    assert.equal(findCity('Nicosia')?.name, 'Lefkoşa');
    for (const t of ['', '   ', 'Almanya', 'Bodrum', null, undefined, 42]) assert.equal(findCity(t), null, String(t));
  });

  test('yuvarlama: aynı şehir, 100 km altı en yakın 10, üstü en yakın 50; iki şehir arası hiç 0 değil', () => {
    for (const [km, shown] of [[0.4, 10], [4, 10], [14.9, 10], [15, 20], [56.8, 60], [94.9, 90], [95, 100], [99.9, 100], [100, 100], [124.9, 100], [125, 150], [349.4, 350], [1537.4, 1550]]) {
      assert.equal(roundKm(km), shown, String(km));
    }
    assert.ok(Math.abs(kmBetween(findCity('İstanbul'), findCity('Ankara')) - 349) < 5, 'İstanbul–Ankara kuş uçuşu ~350 km');
    assert.deepEqual(cityDistance('İstanbul', 'Ankara'), far(350));
    assert.deepEqual(cityDistance('Ankara', 'Kırıkkale'), far(60));
    assert.deepEqual(cityDistance('Lefkoşa', 'Girne'), far(20));
    assert.deepEqual(cityDistance('Edirne', 'Hakkari'), far(1550));
    assert.deepEqual(cityDistance('Berlin', 'Köln'), far(500));
    assert.deepEqual(cityDistance('Amsterdam', 'Van'), far(3300));
    assert.deepEqual(cityDistance('İzmit', 'Kocaeli'), SAME, 'bir şehrin iki adı');
    assert.deepEqual(cityDistance('Kadıköy, İstanbul', 'ISTANBUL'), SAME);
    assert.deepEqual(cityDistance('Bodrum', 'bodrum'), SAME, 'tabloda olmayan aynı yazı da aynı şehir');
  });

  test('şehir bilinmiyorsa uzaklık yok', () => {
    for (const [a, b] of [['Bodrum', 'Muğla'], ['Ankara', 'Almanya'], ['', 'Ankara'], ['Ankara', null], [undefined, 'Ankara'], ['  ', '  ']]) assert.equal(cityDistance(a, b), null, `${a} – ${b}`);
  });
});

describe('Keşfet, profil ve Anlar', () => {
  test('bakanın şehrine göre yuvarlanmış uzaklık; bilinmeyen şehir ve gizli profil boş, koordinat hiç yok', async () => {
    const me = await person('Bakan', 'İstanbul');
    const ank = await person('Ankaralı', 'Ankara');
    const ist = await person('Komşu', 'Kadıköy, istanbul');
    const izmit = await person('İzmitli', 'İzmit');
    const town = await person('Kasabalı', 'Bodrum');
    const none = await person('Şehirsiz', null);
    const shy = await person('Gizli', 'Ankara');
    await ok(call('PATCH', '/api/me/privacy', { profilePublic: false }, shy.session), 'profil gizli');

    // Keşfet
    const d = await ok(call('GET', '/api/discover', null, me.session), 'keşfet');
    noCoordinates(d, 'keşfet');
    const byId = Object.fromEntries(d.users.map((u) => [u.id, u]));
    assert.deepEqual(byId[ank.user.id].distance, far(350));
    assert.deepEqual(byId[ist.user.id].distance, SAME, 'ilçesiyle yazılmış aynı şehir');
    assert.deepEqual(byId[izmit.user.id].distance, far(90));
    assert.equal(byId[town.user.id].distance, null, 'tabloda olmayan şehir');
    assert.equal(byId[none.user.id].distance, null, 'şehir yok');
    assert.equal(byId[shy.user.id].private, true);
    assert.equal(byId[shy.user.id].distance, null, 'gizli profilin şehri de uzaklığı da yok');

    // Profil
    const profile = async (who, s = me.session) => (await ok(call('GET', `/api/user?id=${who.user.id}`, null, s), 'profil')).user;
    const p = await profile(ank);
    noCoordinates(p, 'profil');
    assert.equal(p.city, 'Ankara');
    assert.deepEqual(p.distance, far(350));
    assert.equal((await profile(me)).distance, null, 'kendi profilimde yok');
    assert.equal((await profile(town)).distance, null);
    assert.equal((await profile(shy)).distance, null);
    // Someone private shows their city, and so the distance, to the people they follow.
    await ok(call('POST', '/api/follow', { to: me.user.id }, shy.session), 'takip');
    assert.deepEqual((await profile(shy)).distance, far(350), 'takip ettiği kişi görür');
    assert.deepEqual(byId[ist.user.id].distance, (await profile(ist)).distance, 'Keşfet ile profil aynı');

    // Anlar
    for (const who of [ank, town, shy, me]) await ok(call('POST', '/api/moments', { text: `Merhaba ${rnd(2)}`, ref: rnd(10) }, who.session), 'an');
    const feed = await ok(call('GET', '/api/moments?tab=recent', null, me.session), 'anlar');
    noCoordinates(feed, 'anlar');
    const of = (who) => feed.moments.find((m) => m.author.id === who.user.id).author.distance;
    assert.deepEqual(of(ank), far(350));
    assert.equal(of(town), null);
    assert.equal(of(me), null, 'kendi anımda yok');
    assert.deepEqual(of(shy), far(350), 'takip ettiği kişi görür');
    await ok(call('POST', '/api/follow', { to: me.user.id, follow: false }, shy.session), 'takibi bırak');
    const again = await ok(call('GET', '/api/moments?tab=recent', null, me.session), 'anlar');
    assert.equal(again.moments.find((m) => m.author.id === shy.user.id).author.distance, null, 'gizli profil: uzaklık yok');
    assert.deepEqual(again.moments.find((m) => m.author.id === ank.user.id).author.distance, far(350));
    const mine = await ok(call('POST', '/api/moments', { text: 'Yine ben', ref: rnd(10) }, me.session), 'an');
    assert.equal(mine.moment.author.distance, null);

    // From the other side: Ankara sees İstanbul at the same distance.
    assert.deepEqual((await profile(me, ank.session)).distance, far(350));

    // A viewer with no city sees no distance anywhere.
    const d2 = await ok(call('GET', '/api/discover', null, none.session), 'keşfet');
    assert.ok(d2.users.length > 0 && d2.users.every((u) => u.distance === null));
    assert.equal((await profile(ank, none.session)).distance, null);
    const f2 = await ok(call('GET', '/api/moments?tab=recent', null, none.session), 'anlar');
    assert.ok(f2.moments.length > 0 && f2.moments.every((m) => m.author.distance === null));

    // A new city moves it at once.
    await ok(call('PATCH', '/api/me', { city: 'Ankara' }, me.session), 'şehir değişti');
    assert.deepEqual((await profile(ank)).distance, SAME);
    await ok(call('PATCH', '/api/me', { city: '' }, me.session), 'şehir silindi');
    assert.equal((await profile(ank)).distance, null);
  });
});
