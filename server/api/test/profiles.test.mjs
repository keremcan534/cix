// Other people's profiles (profiles.mjs) against a real Postgres and a stand-in for the photo storage: Cömertlik and
// Yankı levels on the profile and on Keşfet's cards (levels only, never the points), friends and received gifts,
// the staff badge, the personal extras with their checks and the contact filter, "Gizli" gender, the album, the
// Vitrin (gift wall, rides and entries, medals and titles from real records), blocks and account deletion.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
// The bucket: the keys it holds and what was deleted.
const stored = new Map();
const S3_PORT = 21000 + (process.pid % 900);
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const key = decodeURIComponent(u.pathname.replace(/^\/media\//, ''));
  if (!u.searchParams.get('X-Amz-Signature')) return res.writeHead(403).end();
  if (req.method === 'DELETE') return stored.delete(key), res.writeHead(204).end();
  if (req.method === 'HEAD') {
    const f = stored.get(key);
    return f ? res.writeHead(200, { 'content-length': String(f.size), 'content-type': f.type }).end() : res.writeHead(404).end();
  }
  if (req.method === 'GET' && u.pathname === '/media' && u.searchParams.get('list-type') === '2') {
    const keys = [...stored.keys()].filter((k) => k.startsWith(u.searchParams.get('prefix') ?? ''));
    return res.writeHead(200).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  }
  res.writeHead(400).end();
});
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

const h = startApi({
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: CDN,
  UPLOAD_VERIFY: '1',
  LEVELS_CACHE_MS: '0',
  MOMENT_CHARM: '0',
  AUTO_MUTE_REFUSALS: '0',
});
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const profile = async (who, of) => (await ok(call('GET', `/api/user?id=${of.user.id}`, null, who.session), 'profil')).user;
const showcase = (who, of) => ok(call('GET', `/api/user/showcase?id=${of.user.id}`, null, who.session), 'vitrin');
const extras = (who, body) => call('PATCH', '/api/me/extras', body, who.session);
const topup = (who, amount = 1000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, who.session), 'yükleme');
const gift = (from, to, giftId, count = 1) => ok(call('POST', '/api/gifts/send', { to: to.user.id, giftId, count, ref: rnd(8) }, from.session), 'hediye');
const follow = (a, b) => ok(call('POST', '/api/follow', { to: b.user.id }, a.session), 'takip');
/** A photo in the bucket under album/<owner>/, and its public address. */
const photo = (owner, kind = 'album', meta = { size: 1000, type: 'image/jpeg' }) => {
  const key = `${kind}/${owner.user.id}/${rnd(8)}.jpg`;
  stored.set(key, meta);
  return { key, url: `${CDN}/${key}` };
};
const settle = async (gone) => {
  for (let i = 0; i < 60 && gone.some((k) => stored.has(k)); i++) await new Promise((r) => setTimeout(r, 50));
};

describe('Başkasının profili', () => {
  test('Cömertlik ve Yankı seviyeleri profilde ve Keşfet kartlarında; puanlar hiç gitmez', async () => {
    const giver = await signUp('Veren');
    const taker = await signUp('Alan');
    const viewer = await signUp('Bakan');
    await topup(giver);
    await gift(giver, taker, 'g4');
    // 200 coins given: Cömertlik Lv.4 (140–229); 200 diamonds received: Yankı Lv.4 (150–249).
    const g = await profile(viewer, giver);
    assert.deepEqual(g.levels, { wealth: 4, charm: 0 });
    assert.deepEqual((await profile(viewer, taker)).levels, { wealth: 0, charm: 4 });
    for (const k of ['wealthXp', 'charmXp', 'coins', 'diamonds']) assert.equal(k in g, false, `${k} gitmez`);
    const { users } = await ok(call('GET', '/api/discover', null, viewer.session), 'keşfet');
    const card = (u) => users.find((x) => x.id === u.user.id);
    assert.deepEqual(card(giver).levels, { wealth: 4, charm: 0 });
    assert.deepEqual(card(taker).levels, { wealth: 0, charm: 4 });
    assert.equal('wealthXp' in card(giver), false);
    // My own received gifts, and the "Hediye" count on my profile for others.
    assert.equal((await profile(taker, taker)).giftsReceived, 1);
    assert.equal((await profile(viewer, taker)).giftsReceived, 1);
  });

  test('Seviyeyi Gizle: VIP gizler, başkası seviyeyi görmez; VIP bitince yine görünür', async () => {
    const vip = await signUp('Gizleyen VIP');
    const plain = await signUp('VIP değil');
    const viewer = await signUp('Seviye bakan');
    await topup(vip);
    await gift(vip, plain, 'g4');
    const [st, j] = await extras(plain, { hideCharm: true });
    assert.equal(st, 403, j.error);
    await q('UPDATE users SET svip_xp = 500000 WHERE id = $1', [vip.user.id]);
    const saved = await ok(extras(vip, { hideWealth: true }), 'gizle');
    assert.deepEqual([saved.extras.hideWealth, saved.extras.hideCharm], [true, false]);
    assert.deepEqual((await profile(viewer, vip)).levels, { wealth: null, charm: 0 });
    const card = (await ok(call('GET', '/api/discover', null, viewer.session), 'keşfet')).users.find((x) => x.id === vip.user.id);
    assert.deepEqual(card.levels, { wealth: null, charm: 0 });
    const own = await profile(vip, vip);
    assert.deepEqual(own.levelsHidden, { wealth: true, charm: false }, 'kendim neyin gizli olduğunu görürüm');
    assert.equal('levelsHidden' in (await profile(viewer, vip)), false, 'başkasına söylenmez');
    await q('UPDATE users SET svip_xp = 0 WHERE id = $1', [vip.user.id]);
    assert.deepEqual((await profile(viewer, vip)).levels, { wealth: 4, charm: 0 }, 'VIP bitti, seviye görünür');
    await ok(extras(vip, { hideWealth: false }), 'göstermek her zaman olur');
  });

  test('arkadaş: karşılıklı takip; tek yönlü sayılmaz, engel bitirir', async () => {
    const a = await signUp('Arkadaş A');
    const b = await signUp('Arkadaş B');
    const c = await signUp('Tek yön C');
    await follow(a, b);
    assert.equal((await profile(c, a)).friends, 0, 'tek yönlü');
    await follow(b, a);
    await follow(c, a);
    assert.equal((await profile(c, a)).friends, 1);
    assert.equal((await profile(c, b)).friends, 1);
    await ok(call('POST', '/api/block', { to: b.user.id, block: true }, a.session), 'engel');
    assert.equal((await profile(c, a)).friends, 0, 'engel takipleri bitirir');
  });

  test('yetkili rozeti: yönetici ve moderatör görünür, başka rol görünmez', async () => {
    const viewer = await signUp('Rozet bakan');
    const mod = await signUp('Moderatör');
    const bank = await signUp('Jeton noktası');
    const plain = await signUp('Sıradan');
    await q("UPDATE users SET role = 'moderator' WHERE id = $1", [mod.user.id]);
    await q("UPDATE users SET role = 'coins_bank' WHERE id = $1", [bank.user.id]);
    assert.equal((await profile(viewer, mod)).staff, 'moderator');
    assert.equal((await profile(viewer, bank)).staff, null);
    assert.equal((await profile(viewer, plain)).staff, null);
    assert.equal('role' in (await profile(viewer, mod)), false, 'rolün kendisi gitmez');
  });

  test('kişisel bilgiler: geçerli değerler kaydedilir, başkası görür, boş değer siler', async () => {
    const a = await signUp('Bilgi A');
    const b = await signUp('Bilgi B');
    const body = { height: 172, weight: 64, job: 'Mimar', languages: ['Türkçe', 'English', 'Türkçe'], zodiac: 'Aslan', tags: ['Kahve', 'Gezgin'], relationship: 'Bekar', education: 'Lisans', slogan: 'Önce müzik, sonra sohbet', country: 'DE' };
    const [st, j] = await extras(a, body);
    assert.equal(st, 200, j.error);
    assert.deepEqual(j.extras.languages, ['Türkçe', 'English'], 'tekrar eden dil bir kez');
    const seen = (await profile(b, a)).extras;
    assert.deepEqual(seen, { height: 172, weight: 64, job: 'Mimar', languages: ['Türkçe', 'English'], zodiac: 'Aslan', tags: ['Kahve', 'Gezgin'], relationship: 'Bekar', education: 'Lisans', slogan: 'Önce müzik, sonra sohbet', country: 'DE' });
    const card = (await ok(call('GET', '/api/discover', null, b.session), 'keşfet')).users.find((x) => x.id === a.user.id);
    assert.equal(card.country, 'DE');
    // Only what is sent changes; empty values clear.
    await ok(extras(a, { job: '', height: 0, tags: [], zodiac: null }), 'temizle');
    const after = (await profile(b, a)).extras;
    assert.deepEqual([after.job, after.height, after.tags, after.zodiac, after.weight, after.country], [null, null, [], null, 64, 'DE']);
    // Someone who filled in nothing has empty extras.
    assert.deepEqual((await profile(a, b)).extras, { height: null, weight: null, job: null, languages: [], zodiac: null, tags: [], relationship: null, education: null, slogan: null, country: null });
  });

  test('kişisel bilgiler: sınır dışı ve listede olmayan değerler reddedilir, hiçbir şey değişmez', async () => {
    const a = await signUp('Sınır A');
    await ok(extras(a, { height: 180 }), 'boy');
    const bad = [
      { height: 300 },
      { height: 170.5 },
      { weight: 10 },
      { job: 'x'.repeat(31) },
      { slogan: 'y'.repeat(81) },
      { languages: ['Klingon'] },
      { languages: ['Türkçe', 'English', 'Deutsch', 'Français', 'Español', 'Русский'] },
      { tags: ['Uydurma'] },
      { zodiac: 'Ejderha' },
      { relationship: 'Evli' },
      { education: 'Doktora' },
      { country: 'US' },
      { genderHidden: 'evet' },
      { height: 175, zodiac: 'Yok' },
    ];
    for (const b of bad) assert.equal((await extras(a, b))[0], 400, JSON.stringify(b));
    assert.equal((await profile(a, a)).extras.height, 180, 'reddedilen istek hiçbir şeyi değiştirmedi');
  });

  test('meslek ve slogan iletişim süzgecinden geçer', async () => {
    const a = await signUp('Süzgeç A');
    const [st, j] = await extras(a, { slogan: 'Yaz bana 0532 123 45 67' });
    assert.equal(st, 400);
    assert.equal(j.code, 'contact_blocked');
    assert.equal(j.field, 'slogan');
    const [st2, j2] = await extras(a, { job: 'instagram: ayse.kaya' });
    assert.equal(st2, 400);
    assert.equal(j2.field, 'job');
    assert.equal((await profile(a, a)).extras.slogan, null);
  });

  test('Gizli cinsiyet: başkasına gitmez, bana gider; Keşfet eşleşmesi gerçek cinsiyetle sürer', async () => {
    const her = await signUp('Gizli Kadın');
    const man = await signUp('Bakan Erkek');
    const woman = await signUp('Bakan Kadın');
    await ok(call('PATCH', '/api/me', { gender: 'Kadın' }, her.session), 'cinsiyet');
    await ok(call('PATCH', '/api/me', { gender: 'Erkek' }, man.session), 'cinsiyet');
    await ok(call('PATCH', '/api/me', { gender: 'Kadın' }, woman.session), 'cinsiyet');
    assert.equal((await profile(man, her)).gender, 'Kadın');
    const [st, j] = await extras(her, { genderHidden: true });
    assert.equal(st, 200, j.error);
    assert.equal(j.extras.genderHidden, true);
    assert.equal((await profile(man, her)).gender, null, 'profilde yok');
    const mine = (await ok(call('GET', '/api/me', null, her.session), 'ben')).user;
    assert.deepEqual([mine.gender, mine.genderHidden], ['Kadın', true]);
    const forMan = (await ok(call('GET', '/api/discover', null, man.session), 'keşfet')).users.find((x) => x.id === her.user.id);
    assert.ok(forMan, 'erkek yine görür');
    assert.equal(forMan.gender, null, 'kartta cinsiyet yok');
    const forWoman = (await ok(call('GET', '/api/discover', null, woman.session), 'keşfet')).users.find((x) => x.id === her.user.id);
    assert.equal(forWoman, undefined, 'eşleşme kuralı gerçek cinsiyetle');
    // Her posts don't carry it either.
    await ok(call('POST', '/api/moments', { text: 'Merhaba Anlar', ref: rnd(8) }, her.session), 'an');
    const feed = (await ok(call('GET', `/api/moments?user=${her.user.id}`, null, man.session), 'anlar')).moments;
    assert.equal(feed[0].author.gender, null);
    // The gender itself can't be changed by hiding it, and showing it again brings it back.
    await ok(extras(her, { genderHidden: false }), 'göster');
    assert.equal((await profile(man, her)).gender, 'Kadın');
  });

  test('albüm: kendi yüklediğim fotoğraf eklenir, en çok 6; kaldırılan depodan gider', async () => {
    const a = await signUp('Albüm A');
    const b = await signUp('Albüm B');
    const up = await ok(call('POST', '/api/media/upload-url', { kind: 'album', contentType: 'image/jpeg', size: 1000 }, a.session), 'yükleme adresi');
    assert.ok(up.publicUrl.startsWith(`${CDN}/album/${a.user.id}/`));
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'album', contentType: 'image/jpeg', size: 9 * 1024 * 1024 }, a.session))[0], 400, 'boyut sınırı');
    const first = photo(a);
    const added = await ok(call('POST', '/api/me/photos', { url: first.url }, a.session), 'ekle');
    assert.deepEqual(added.photos.map((p) => p.url), [first.url]);
    assert.equal((await call('POST', '/api/me/photos', { url: photo(b).url }, a.session))[0], 400, 'başkasının fotoğrafı');
    assert.equal((await call('POST', '/api/me/photos', { url: photo(a, 'moment').url }, a.session))[0], 400, 'başka türden dosya');
    assert.equal((await call('POST', '/api/me/photos', { url: `${CDN}/album/${a.user.id}/yok.jpg` }, a.session))[0], 400, 'yüklenmemiş dosya');
    assert.equal((await call('POST', '/api/me/photos', { url: photo(a, 'album', { size: 9 * 1024 * 1024, type: 'image/jpeg' }).url }, a.session))[0], 400, 'büyük dosya');
    const rest = [1, 2, 3, 4, 5].map(() => photo(a));
    for (const p of rest) await ok(call('POST', '/api/me/photos', { url: p.url }, a.session), 'ekle');
    const [st, j] = await call('POST', '/api/me/photos', { url: photo(a).url }, a.session);
    assert.equal(st, 409, j.error);
    const shown = (await profile(b, a)).photos;
    assert.equal(shown.length, 6);
    assert.equal(shown[0].url, rest[4].url, 'en yenisi önce');
    // Only my own photo can be taken out.
    const target = shown.find((p) => p.url === first.url);
    await ok(call('POST', '/api/me/photos/remove', { id: target.id }, b.session), 'başkası kaldıramaz');
    assert.equal((await profile(b, a)).photos.length, 6);
    const left = await ok(call('POST', '/api/me/photos/remove', { id: target.id }, a.session), 'kaldır');
    assert.equal(left.photos.length, 5);
    await settle([first.key]);
    assert.equal(stored.has(first.key), false, 'dosya depodan gitti');
    assert.equal(stored.has(rest[0].key), true, 'diğerleri duruyor');
  });

  test('Vitrin: hediye duvarı, binek ve giriş efekti sunucudan; katalog dışı hediye sayılmaz', async () => {
    const fan = await signUp('Vitrin hayran');
    const star = await signUp('Vitrin yıldız');
    await topup(fan, 5000);
    await gift(fan, star, 'g1', 10);
    await gift(fan, star, 'g2');
    // A bond's held coins are a gift row too, under a name outside the catalog.
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, ref) VALUES ($1, $2, 'bag-cp', 1, 500, 500, $3)", [fan.user.id, star.user.id, rnd(6)]);
    await topup(star);
    await ok(call('POST', '/api/shop/buy', { sku: 'rd-scooter', price: 250, ref: rnd(6) }, star.session), 'binek');
    await ok(call('POST', '/api/shop/buy', { sku: 'en-sparkle', price: 200, ref: rnd(6) }, star.session), 'giriş efekti');
    const v = await showcase(fan, star);
    assert.deepEqual(v.gifts, [{ id: 'g1', count: 10 }, { id: 'g2', count: 1 }]);
    assert.deepEqual([v.rides, v.entries], [['rd-scooter'], ['en-sparkle']]);
    assert.equal((await profile(fan, star)).giftsReceived, 11, 'Hediye sayısı duvarla aynı');
    // A revoked item is no longer shown.
    await q("UPDATE entitlements SET revoked_at = now(), revoked_why = 'destek' WHERE user_id = $1 AND sku = 'rd-scooter'", [star.user.id]);
    assert.deepEqual((await showcase(fan, star)).rides, []);
  });

  test('Vitrin: madalya ve unvanlar gerçek kayıtlardan', async () => {
    const viewer = await signUp('Madalya bakan');
    const star = await signUp('Haftanın yıldızı');
    const people = await Promise.all(Array.from({ length: 20 }, (_, i) => h.account(`Kişi ${i}`)));
    // The week's biggest receiver, gave to 10 people, 20 friends, a Lv.10 room, a new account at Yankı Lv.5+.
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, ref) VALUES ($1, $2, 'g8', 50, 19999, 999950, $3)", [people[0].user.id, star.user.id, rnd(6)]);
    for (const p of people.slice(0, 10)) await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, ref) VALUES ($1, $2, 'g1', 1, 10, 10, $3)", [star.user.id, p.user.id, rnd(6)]);
    for (const p of people) await q('INSERT INTO follows (follower, followee) VALUES ($1, $2), ($2, $1)', [star.user.id, p.user.id]);
    await q('UPDATE users SET room_xp = 6500 WHERE id = $1', [star.user.id]);
    await topup(viewer);
    await gift(viewer, star, 'g5');
    const v = await showcase(viewer, star);
    assert.deepEqual(v.medals, ['md1', 'md4', 'md6']);
    assert.deepEqual(v.titles, ['t2', 't5']);
    // Nothing for someone with no such records; an older account is no longer "rising".
    const plain = await showcase(star, viewer);
    assert.deepEqual([plain.medals, plain.titles], [[], []]);
    await q("UPDATE users SET created_at = now() - interval '31 days', room_xp = 0 WHERE id = $1", [star.user.id]);
    assert.deepEqual((await showcase(viewer, star)).titles, []);
  });

  test('beni engelleyenin profil parçaları açılmaz', async () => {
    const a = await signUp('Engelleyen');
    const b = await signUp('Engellenen');
    await ok(call('POST', '/api/block', { to: b.user.id, block: true }, a.session), 'engel');
    assert.equal((await call('GET', `/api/user/showcase?id=${a.user.id}`, null, b.session))[0], 404);
    assert.equal((await call('GET', `/api/user?id=${a.user.id}`, null, b.session))[0], 404);
    // The one who blocked still opens (to unblock), as GET /api/user.
    await showcase(a, b);
    const { users } = await ok(call('GET', '/api/discover', null, b.session), 'keşfet');
    assert.equal(users.some((x) => x.id === a.user.id), false);
  });

  test('hesap silinince kişisel bilgiler, albüm ve dosyaları gider', async () => {
    const a = await signUp('Silinecek');
    await ok(extras(a, { job: 'Aşçı', slogan: 'Yemek güzel', country: 'TR' }), 'bilgi');
    await ok(extras(a, { genderHidden: true }), 'gizli');
    const p = photo(a);
    await ok(call('POST', '/api/me/photos', { url: p.url }, a.session), 'albüm');
    await ok(call('DELETE', '/api/me', null, a.session), 'sil');
    assert.equal((await q('SELECT 1 FROM profile_extras WHERE user_id = $1', [a.user.id])).rowCount, 0);
    assert.equal((await q('SELECT 1 FROM profile_photos WHERE user_id = $1', [a.user.id])).rowCount, 0);
    assert.equal((await q('SELECT gender_hidden FROM users WHERE id = $1', [a.user.id])).rows[0].gender_hidden, false);
    await settle([p.key]);
    assert.equal(stored.has(p.key), false, 'albüm dosyası depodan gitti');
  });
});
