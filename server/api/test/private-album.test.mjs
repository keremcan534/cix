// Özel albüm (private-album.mjs) against a real Postgres and a stand-in bucket: an approved agency streamer adds
// photos (read back and checked here), someone else sees only how many there are until they open it with the price
// Canlı ayarlar sets; the coins become the streamer's diamonds as a gift's do and the agency income is a gift's; a
// retry is a replay, a second open, a moved price, an empty album, a non-streamer's, a blocked one and a closed album
// (price 0) are refused with nothing moved; opening is for good, the album grows for whoever opened it; staff take a
// photo down (audited); the data copy lists it all and a deleted account's photos go with their files.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { photoKind } from '../private-album.mjs';
import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
/** The bucket: key → { body, type, size? }. Signed requests only. */
const stored = new Map();
const S3_PORT = 32000 + (process.pid % 900);
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.searchParams.get('X-Amz-Signature')) return res.writeHead(403).end();
  if (req.method === 'GET' && u.pathname === '/media' && u.searchParams.get('list-type') === '2') {
    const keys = [...stored.keys()].filter((k) => k.startsWith(u.searchParams.get('prefix') ?? ''));
    return res.writeHead(200).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  }
  const key = decodeURIComponent(u.pathname.replace(/^\/media\//, ''));
  const f = stored.get(key);
  if (req.method === 'DELETE') return stored.delete(key), res.writeHead(204).end();
  if (!f) return res.writeHead(404).end();
  const head = { 'content-length': String(f.size ?? f.body.length), 'content-type': f.type };
  if (req.method === 'HEAD') return res.writeHead(200, head).end();
  if (req.method === 'GET') return res.writeHead(200, head).end(f.body);
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
  AGENCY_JOBS: '0',
});
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, status, match, what) => {
  const [st, j] = await p;
  assert.equal(st, status, `${what}: ${st} ${j.error}`);
  if (match) assert.match(j.error, match, what);
  return j;
};
const settle = async (gone) => {
  for (let i = 0; i < 60 && gone.some((k) => stored.has(k)); i++) await new Promise((r) => setTimeout(r, 50));
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0'), Buffer.alloc(200)]);
/** A photo put in `owner`'s private folder (or `folder`), and its public address. */
const photo = (owner, { body = JPEG, folder = 'private', type = 'image/jpeg', size } = {}) => {
  const key = `${folder}/${owner.user.id}/${rnd(8)}.jpg`;
  stored.set(key, { body, type, size });
  return { key, url: `${CDN}/${key}` };
};
const add = (who, url) => call('POST', '/api/me/private-album', { url }, who.session);
const album = async (who, of) => ok(call('GET', `/api/user/private-album?id=${of.user.id}`, null, who.session), 'albüm');
const unlock = (who, of, price = 500, ref = rnd(8)) => call('POST', '/api/user/private-album/unlock', { user: of.user.id, price, ref }, who.session);
const coins = async (who) => Number((await q('SELECT coins FROM users WHERE id = $1', [who.user.id])).rows[0].coins);
const diamonds = async (who) => Number((await q('SELECT diamonds FROM users WHERE id = $1', [who.user.id])).rows[0].diamonds);

let agency;
/** An approved streamer in an approved agency (as the agency centre makes one). */
async function streamer(name) {
  const s = await signUp(name);
  agency ??= (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, 'Albüm Ajans', 1, 'approved') RETURNING id", [`A${rnd(3).toUpperCase()}`])).rows[0].id;
  await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [s.user.id, agency]);
  return s;
}
let admin;
async function staff() {
  admin ??= await (async () => {
    const a = await signUp('Albüm Yöneticisi');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [a.user.id]);
    return a;
  })();
  return admin;
}
async function setPrice(price) {
  await staff();
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  await ok(call('POST', '/api/admin/live-settings', { changes: { private_album_price: price }, reason: 'Özel albüm testi', baseV: view.v, confirm: true }, admin.session), 'fiyat');
}

describe('Özel albüm', () => {
  test('dosya kontrolü: JPEG, PNG, WebP, HEIC; başkası değil', () => {
    assert.equal(photoKind(JPEG), 'jpeg');
    assert.equal(photoKind(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])), 'png');
    assert.equal(photoKind(Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8 '), Buffer.alloc(20)])), 'webp');
    assert.equal(photoKind(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(20)])), 'heic');
    assert.equal(photoKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(photoKind(null), null);
  });

  test('yayıncı ekler; başkası yalnız sayıyı görür; açınca jeton yayıncıya elmas, ajans geliri hediye; tekrar istek aynı cevap; albüm büyür', async () => {
    const s = await streamer('Albüm Yıldızı');
    const v = await signUp('Albüm Açan');
    await h.credit(v.user.id, 5000);
    const first = photo(s);
    const mine = await ok(add(s, first.url), 'ekle');
    assert.deepEqual([mine.mine, mine.can, mine.count, mine.photos.map((p) => p.url)], [true, true, 1, [first.url]]);

    const locked = await album(v, s);
    assert.deepEqual([locked.on, locked.price, locked.count, locked.unlocked, locked.photos], [true, 500, 1, false, []]);
    assert.equal(JSON.stringify(locked).includes(first.key), false, 'kilitli albümde fotoğraf adresi gitmez');

    const ref = rnd(8);
    const [d0] = [await diamonds(s)];
    const opened = await ok(unlock(v, s, 500, ref), 'aç');
    assert.deepEqual([opened.coins, opened.replay, opened.album.unlocked, opened.album.photos.map((p) => p.url)], [500, false, true, [first.url]]);
    assert.equal(await coins(v), 4500);
    assert.equal((await diamonds(s)) - d0, 500, 'yayıncıya hediye gibi elmas');
    const legs = (await q('SELECT user_id, currency, amount, reason FROM ledger WHERE ref IN ($1, $2) ORDER BY id', [ref, `${ref}-in`])).rows;
    assert.deepEqual(legs.map((l) => [l.user_id, l.currency, Number(l.amount)]), [[v.user.id, 'coin', -500], [s.user.id, 'diamond', 500]]);
    assert.match(legs[0].reason, /^Özel albüm: Albüm Yıldızı$/);
    const income = (await q('SELECT source_type, diamonds FROM income_events WHERE streamer_id = $1 AND source_ref = $2', [s.user.id, `album:${v.user.id}:${ref}`])).rows;
    assert.deepEqual(income.map((x) => [x.source_type, Number(x.diamonds)]), [['gift', 500]], 'ajans geliri hediye olarak');
    const locks = (await q("SELECT amount FROM diamond_locks WHERE user_id = $1 AND ref = $2", [s.user.id, ref])).rows;
    assert.equal(locks.reduce((n, l) => n + Number(l.amount), 0), 500, 'elmas jetonun kilidiyle');

    const again = await ok(unlock(v, s, 500, ref), 'aynı istek');
    assert.deepEqual([again.replay, again.coins], [true, 0]);
    assert.equal(await coins(v), 4500, 'tekrar istek para almaz');
    const twice = await refused(unlock(v, s, 500), 409, /zaten açtın/, 'ikinci açma');
    assert.equal(twice.code, 'already');
    assert.equal(await coins(v), 4500);

    const second = photo(s);
    await ok(add(s, second.url), 'ikinci fotoğraf');
    assert.deepEqual((await album(v, s)).photos.map((p) => p.url), [second.url, first.url], 'açan, sonradan ekleneni de görür');
    const stranger = await signUp('Bakan Biri');
    assert.deepEqual([(await album(stranger, s)).count, (await album(stranger, s)).photos.length], [2, 0]);
  });

  test('reddedilenler hiç para oynatmaz: fiyat değişti, kendi albümü, boş albüm, yayıncı değil, sözleşme bekliyor, yetersiz jeton, engel', async () => {
    const s = await streamer('Ret Yıldızı');
    await ok(add(s, photo(s).url), 'ekle');
    const v = await signUp('Ret Deneyen');
    await h.credit(v.user.id, 1000);
    const moved = await refused(unlock(v, s, 400), 409, /Fiyat değişti: şimdi 500 jeton/, 'eski fiyat');
    assert.deepEqual([moved.code, moved.price], ['price_changed', 500]);
    await refused(unlock(v, s, 600), 409, /Fiyat değişti/, 'yüksek fiyat da aynı');
    await refused(unlock(s, s), 400, /Kendi özel albümün/, 'kendisi');
    const empty = await streamer('Boş Yıldız');
    assert.equal((await refused(unlock(v, empty), 409, /henüz fotoğraf yok/, 'boş')).code, 'empty');
    const plain = await signUp('Yayıncı Değil');
    assert.equal((await refused(unlock(v, plain), 409, /açılamıyor/, 'yayıncı değil')).code, 'unavailable');
    assert.equal((await album(v, plain)).count, 0);
    await refused(add(plain, photo(plain).url), 403, /onaylı yayıncılar/, 'yayıncı olmayan ekleyemez');
    await refused(call('POST', '/api/media/upload-url', { kind: 'private', contentType: 'image/jpeg', size: 1000 }, plain.session), 403, /onaylı yayıncılar/, 'yükleme adresi de');
    const pending = await streamer('Sözleşmesi Bekleyen');
    await ok(add(pending, photo(pending).url), 'ekle');
    await q("UPDATE agency_streamers SET contract = 'pending' WHERE streamer_id = $1", [pending.user.id]);
    assert.equal((await refused(unlock(v, pending), 409, /açılamıyor/, 'sözleşme bekliyor')).code, 'unavailable');
    const poor = await signUp('Az Jetonlu');
    await h.credit(poor.user.id, 100);
    assert.equal((await refused(unlock(poor, s), 409, /Yetersiz jeton/, 'yetersiz')).code, 'insufficient');
    assert.equal(await coins(poor), 100);
    await ok(call('POST', '/api/block', { to: v.user.id, block: true }, s.session), 'engel');
    await refused(unlock(v, s), 404, /bulunamadı/, 'engelleyen yayıncı');
    await refused(call('GET', `/api/user/private-album?id=${s.user.id}`, null, v.session), 404, null, 'engelde albüm yok');
    assert.equal(await coins(v), 1000, 'hiçbiri para almadı');
    assert.equal((await q('SELECT count(*)::int AS n FROM private_album_unlocks WHERE viewer = $1', [v.user.id])).rows[0].n, 0);
  });

  test('fotoğraf ekleme: dosya okunur, yanlışı silinir; başkasının klasörü olmaz; en fazla 12; sahibi kaldırınca dosya gider', async () => {
    const s = await streamer('Ekleyen Yıldız');
    const other = await streamer('Komşu Yıldız');
    const svg = photo(s, { body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>') });
    await refused(add(s, svg.url), 400, /fotoğraf değil/, 'resim olmayan');
    await settle([svg.key]);
    assert.equal(stored.has(svg.key), false, 'reddedilen dosya silindi');
    await refused(add(s, photo(other).url), 400, /Geçersiz fotoğraf/, 'başkasının klasörü');
    await refused(add(s, photo(s, { folder: 'album' }).url), 400, /Geçersiz fotoğraf/, 'başka tür');
    await refused(add(s, photo(s, { size: 9 * 1024 * 1024 }).url), 400, /en fazla 8 MB/, 'büyük');
    const files = [];
    for (let i = 0; i < 12; i++) {
      const p = photo(s);
      files.push(p);
      await ok(add(s, p.url), `ekle ${i}`);
    }
    await refused(add(s, photo(s).url), 409, /en fazla 12/, 'on üçüncü');
    const first = (await album(s, s)).photos.find((p) => p.url === files[0].url);
    const left = await ok(call('POST', '/api/me/private-album/remove', { id: first.id }, s.session), 'kaldır');
    assert.equal(left.count, 11);
    await settle([files[0].key]);
    assert.equal(stored.has(files[0].key), false, 'dosya gitti');
    await ok(call('POST', '/api/me/private-album/remove', { id: first.id }, other.session), 'başkasınınki bir şey yapmaz');
    assert.equal((await album(s, s)).count, 11);
  });

  test('fiyat 0: özel albüm kapanır; önceden açan görmeye devam eder', async () => {
    const s = await streamer('Kapanan Yıldız');
    await ok(add(s, photo(s).url), 'ekle');
    const early = await signUp('Önceden Açan');
    const late = await signUp('Geç Kalan');
    await h.credit(early.user.id, 1000);
    await h.credit(late.user.id, 1000);
    await ok(unlock(early, s), 'aç');
    await setPrice(0);
    try {
      const shut = await album(late, s);
      assert.deepEqual([shut.on, shut.count, shut.photos.length], [false, 0, 0]);
      assert.equal((await refused(unlock(late, s, 0), 403, /kapalı/, 'kapalı')).code, 'closed');
      await refused(add(s, photo(s).url), 403, /kapalı/, 'kapalıyken eklenmez');
      assert.equal((await album(early, s)).photos.length, 1, 'önceden açan görür');
      assert.equal((await album(s, s)).can, false);
      assert.equal(await coins(late), 1000);
    } finally {
      await setPrice(500);
    }
  });

  test('yönetici görür ve kaldırır, denetime yazılır; kaldırılan kimseye görünmez; üye yapamaz', async () => {
    await staff();
    const s = await streamer('Şikâyetli Yıldız');
    const p = photo(s);
    await ok(add(s, p.url), 'ekle');
    const v = await signUp('Açıp Şikâyet Eden');
    await h.credit(v.user.id, 1000);
    await ok(unlock(v, s), 'aç');
    const member = await signUp('Sıradan');
    await refused(call('GET', `/api/admin/private-album?user=${s.user.id}`, null, member.session), 403, /Yönetici/, 'üye bakamaz');
    const seen = await ok(call('GET', `/api/admin/private-album?user=${s.user.id}`, null, admin.session), 'bak');
    assert.deepEqual([seen.can, seen.price, seen.unlocks, seen.coins, seen.photos.length, seen.photos[0].removed], [true, 500, 1, 500, 1, null]);
    await refused(call('POST', '/api/admin/private-album/remove', { user: s.user.id, id: seen.photos[0].id }, member.session), 403, /Yönetici/, 'üye kaldıramaz');
    assert.deepEqual(await ok(call('POST', '/api/admin/private-album/remove', { user: s.user.id, id: seen.photos[0].id, reason: 'Uygunsuz' }, admin.session), 'kaldır'), { removed: true });
    assert.deepEqual(await ok(call('POST', '/api/admin/private-album/remove', { user: s.user.id, id: seen.photos[0].id }, admin.session), 'tekrar'), { removed: false });
    assert.equal((await album(v, s)).photos.length, 0, 'açan da görmez');
    assert.equal((await album(s, s)).count, 0, 'sahibi de görmez');
    const after = await ok(call('GET', `/api/admin/private-album?user=${s.user.id}`, null, admin.session), 'sonra');
    assert.deepEqual([after.photos[0].removed.reason, after.photos[0].removed.by], ['Uygunsuz', 'Albüm Yöneticisi']);
    assert.equal(stored.has(p.key), true, 'kayıt için dosya durur');
    const audit = (await q("SELECT actor, detail FROM audit_events WHERE action = 'private_album.remove' AND target = $1", [s.user.id])).rows;
    assert.equal(audit.length, 1);
    assert.deepEqual([audit[0].actor, audit[0].detail.reason, audit[0].detail.before.url, audit[0].detail.after.shown], [admin.user.id, 'Uygunsuz', p.url, false]);
    await refused(call('POST', '/api/admin/private-album/remove', { user: s.user.id, id: 999999 }, admin.session), 404, /bulunamadı/, 'olmayan fotoğraf');
  });

  test('veri kopyası iki tarafı da gösterir; hesap silinince fotoğraflar ve dosyaları gider, açış kaydı kalır', async () => {
    const s = await streamer('Silinecek Yıldız');
    const p = photo(s);
    await ok(add(s, p.url), 'ekle');
    const v = await signUp('Kopya Açan');
    await h.credit(v.user.id, 1000);
    await ok(unlock(v, s), 'aç');
    const mine = await ok(call('GET', '/api/me/export', null, s.session), 'kopya');
    assert.deepEqual([mine.profileMore.privateAlbum.length, mine.profileMore.privateAlbum[0].url], [1, p.url]);
    assert.deepEqual(mine.profileMore.privateAlbumUnlocks.map((x) => [x.role, x.coins, x.with.id]), [['earned', 500, v.user.id]]);
    const theirs = await ok(call('GET', '/api/me/export', null, v.session), 'kopya');
    assert.deepEqual(theirs.profileMore.privateAlbumUnlocks.map((x) => [x.role, x.coins, x.with.id]), [['opened', 500, s.user.id]]);
    await ok(call('DELETE', '/api/me', null, s.session), 'hesabı sil');
    await settle([p.key]);
    assert.equal(stored.has(p.key), false, 'dosya gitti');
    assert.equal((await q('SELECT count(*)::int AS n FROM private_album_photos WHERE user_id = $1', [s.user.id])).rows[0].n, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM private_album_unlocks WHERE owner = $1', [s.user.id])).rows[0].n, 1, 'para kaydı kalır');
  });

  test('aynı anda iki açma: biri geçer, para bir kez gider', async () => {
    const s = await streamer('Yarış Yıldızı');
    await ok(add(s, photo(s).url), 'ekle');
    const v = await signUp('Çift Dokunan');
    await h.credit(v.user.id, 2000);
    const [a, b] = await Promise.all([unlock(v, s), unlock(v, s)]);
    assert.deepEqual([a[0], b[0]].sort(), [200, 409]);
    assert.equal(await coins(v), 1500);
  });
});
