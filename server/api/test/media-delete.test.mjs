// Files no longer used leave the storage (media.mjs removeFiles, removeUserFiles), against a real Postgres and a
// stand-in for the bucket: a replaced avatar, a moment its author deletes (not one still reported), a removed
// track (not while another track plays the same file), a removed notice, and every file of a deleted account
// (not a notice's picture, not a file a moderation decision points at, never another person's).
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
// The bucket: keys it holds, and what was asked of it.
const stored = new Set();
const asked = [];
const S3_PORT = 19000 + (process.pid % 900);
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  asked.push(`${req.method} ${u.pathname}`);
  if (!u.searchParams.get('X-Amz-Signature')) return res.writeHead(403).end();
  if (req.method === 'DELETE') {
    stored.delete(decodeURIComponent(u.pathname.replace(/^\/media\//, '')));
    return res.writeHead(204).end();
  }
  if (req.method === 'PUT') {
    if (!u.pathname.startsWith('/media/')) return res.writeHead(404).end('<?xml version="1.0"?><Error><Code>NoSuchBucket</Code></Error>');
    stored.add(decodeURIComponent(u.pathname.slice('/media/'.length)));
    return res.writeHead(200).end();
  }
  if (req.method === 'GET' && u.pathname === '/media' && u.searchParams.get('list-type') === '2') {
    const prefix = u.searchParams.get('prefix') ?? '';
    const keys = [...stored].filter((k) => k.startsWith(prefix));
    return res.writeHead(200, { 'content-type': 'application/xml' }).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  }
  res.writeHead(400).end();
});
// The bucket's public address (S3_PUBLIC_URL) for the storage check; it is not signed.
const pub = http.createServer((req, res) => res.writeHead(stored.has(decodeURIComponent(req.url.slice(1))) ? 200 : 404).end());
pub.listen(S3_PORT + 1, '127.0.0.1');
after(() => pub.close());
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

const h = startApi({ S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`, S3_BUCKET: 'media', S3_KEY: 'testkey', S3_SECRET: 'testsecret', S3_PUBLIC_URL: CDN });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
/** A file in the bucket under kind/<owner>/, and its public address. */
const file = (kind, owner) => {
  const key = `${kind}/${owner}/${rnd(8)}.jpg`;
  stored.add(key);
  return { key, url: `${CDN}/${key}` };
};
/** The deletions run after the answer: waits until the bucket no longer holds `gone` (or gives up). */
const settle = async (gone = []) => {
  for (let i = 0; i < 60 && gone.some((k) => stored.has(k)); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 150));
};

describe('Kullanılmayan dosyalar depodan silinir', () => {
  test('profil fotoğrafı değişince eskisi gider; başkasının dosyası hiç silinmez', async () => {
    const a = await signUp('Depo A');
    const b = await signUp('Depo B');
    const first = file('avatar', a.user.id);
    const second = file('avatar', a.user.id);
    const theirs = file('avatar', b.user.id);
    await ok(call('PATCH', '/api/me', { avatarUrl: first.url }, a.session), 'ilk fotoğraf');
    await ok(call('PATCH', '/api/me', { avatarUrl: second.url }, a.session), 'yeni fotoğraf');
    await settle([first.key]);
    assert.equal(stored.has(first.key), false, 'eski fotoğraf silindi');
    assert.equal(stored.has(second.key), true, 'yenisi duruyor');
    // Someone else's address set as my photo, then replaced: their file stays.
    await ok(call('PATCH', '/api/me', { avatarUrl: theirs.url }, a.session), 'başkasının adresi');
    await ok(call('PATCH', '/api/me', { avatarUrl: null }, a.session), 'fotoğrafı kaldır');
    await settle();
    assert.equal(stored.has(theirs.key), true, 'başkasının dosyası duruyor');
  });

  test('sahibi sildiği anın fotoğrafı gider; şikâyeti açık olanınki kalır', async () => {
    const a = await signUp('An A');
    const b = await signUp('An B');
    const post = async (photo) => (await q("INSERT INTO moments (author, body, image_url, ref) VALUES ($1, '', $2, $3) RETURNING id", [a.user.id, photo.url, rnd(8)])).rows[0].id;
    const plain = file('moment', a.user.id);
    await ok(call('POST', '/api/moments/delete', { id: String(await post(plain)) }, a.session), 'an silindi');
    const reported = file('moment', a.user.id);
    const rid = await post(reported);
    await q("INSERT INTO reports (reporter, target_type, target_id, reason) VALUES ($1, 'moment', $2, 'spam')", [b.user.id, String(rid)]);
    await ok(call('POST', '/api/moments/delete', { id: String(rid) }, a.session), 'şikâyetli an silindi');
    await settle([plain.key]);
    assert.equal(stored.has(plain.key), false, 'fotoğrafı silindi');
    assert.equal(stored.has(reported.key), true, 'şikâyet açıkken kanıt olarak kalır');
  });

  test('kütüphaneden çıkan parçanın dosyası gider; aynı dosyayı çalan başka parça varken kalır', async () => {
    const dj = await signUp('Müzik A');
    const track = (song) => q('INSERT INTO music_tracks (owner, title, url, seconds, size) VALUES ($1, $2, $3, 120, 1000) RETURNING id', [dj.user.id, `Parça ${rnd(3)}`, song.url]).then((r) => String(r.rows[0].id));
    const song = file('music', dj.user.id);
    await ok(call('POST', '/api/music/remove', { id: await track(song) }, dj.session), 'parça çıktı');
    const shared = file('music', dj.user.id);
    const one = await track(shared);
    await track(shared);
    await ok(call('POST', '/api/music/remove', { id: one }, dj.session), 'iki parçadan biri çıktı');
    await settle([song.key]);
    assert.equal(stored.has(song.key), false);
    assert.equal(stored.has(shared.key), true, 'diğer parça hâlâ çalıyor');
  });

  test('hesap silinince kişinin bütün dosyaları gider; duyuru resmi ve kanıt dosyası kalır', async () => {
    const gone = await signUp('Silinen');
    const other = await signUp('Kalan');
    const mine = ['avatar', 'moment', 'dm', 'music'].map((k) => file(k, gone.user.id));
    const notice = file('notice', gone.user.id);
    const evidence = file('moment', gone.user.id);
    const theirs = file('dm', other.user.id);
    // A decision about someone else points at one of the deleted person's files.
    const [s] = (await q("INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, expires_at, created_role) VALUES ($1, 'mute_global_text', 'global', 'other', 'test', now() + interval '1 hour', 'admin') RETURNING id", [other.user.id])).rows;
    await q("INSERT INTO moderation_evidence (sanction_id, kind, content) VALUES ($1, 'link', $2)", [s.id, `Bkz. ${evidence.url}`]);
    await ok(call('DELETE', '/api/me', null, gone.session), 'hesap silindi');
    await settle(mine.map((f) => f.key));
    for (const f of mine) assert.equal(stored.has(f.key), false, `${f.key} silindi`);
    assert.equal(stored.has(notice.key), true, 'duyuru resmi şirketin');
    assert.equal(stored.has(evidence.key), true, 'kanıt dosyası kalır');
    assert.equal(stored.has(theirs.key), true, 'başkasının dosyası duruyor');
    assert.ok(asked.some((x) => x.startsWith('GET /media')), 'kişinin klasörleri listelendi');
  });

  test('depo ayarları baştan sona denenir; yalnızca durum ve hata kodları yazılır', async () => {
    const { storageCheck } = await import('../media.mjs');
    const saved = { ...process.env };
    Object.assign(process.env, { S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`, S3_BUCKET: 'media', S3_KEY: 'testkey', S3_SECRET: 'testsecret', S3_PUBLIC_URL: `http://127.0.0.1:${S3_PORT + 1}` });
    try {
      assert.match(await storageCheck(), /^yükleme 200, açık adres 200, silme 204/);
      assert.ok(![...stored].some((k) => k.startsWith('check/')), 'deneme dosyası silindi');
      process.env.S3_BUCKET = 'yanlis';
      assert.match(await storageCheck(), /^yükleme 404 NoSuchBucket/);
      process.env.S3_BUCKET = 'media';
      process.env.S3_ENDPOINT = `http://127.0.0.1:${S3_PORT}/media`;
      const extra = await storageCheck();
      assert.match(extra, /açık adres 404/);
      assert.match(extra, /S3_ENDPOINT sonunda fazladan yol var/);
      delete process.env.S3_KEY;
      assert.equal(await storageCheck(), 'kapalı: S3_KEY yok');
      assert.doesNotMatch(extra, /testkey|testsecret/);
    } finally {
      for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_KEY', 'S3_SECRET', 'S3_PUBLIC_URL']) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });

  test('depo ayarlarının biçimi denetlenir; değerleri hiç yazılmaz', async () => {
    const { storageNotes } = await import('../media.mjs');
    const good = { S3_ENDPOINT: `https://${'0'.repeat(32)}.r2.cloudflarestorage.com`, S3_BUCKET: 'similarclub-media', S3_KEY: 'a'.repeat(32), S3_SECRET: 'b'.repeat(64), S3_PUBLIC_URL: 'https://pub-0123.r2.dev' };
    assert.deepEqual(storageNotes(good), []);
    const notes = storageNotes({ ...good, S3_ENDPOINT: 'https://pub-0123.r2.dev', S3_KEY: 'X'.repeat(40), S3_SECRET: 'kisaGizli' }).join(' | ');
    assert.match(notes, /S3_ENDPOINT açık adres \(r2\.dev\) olmuş/);
    assert.match(notes, /S3_KEY .*\(32 karakter olmalı, 40\)/);
    assert.match(notes, /S3_SECRET .*\(64 karakter olmalı, 9\)/);
    assert.doesNotMatch(notes, /XXXX|kisaGizli/, 'değerler yazılmaz');
    assert.match(storageNotes({ ...good, S3_ENDPOINT: `${good.S3_ENDPOINT}/similarclub-media` }).join(), /fazladan yol/);
    assert.match(storageNotes({ ...good, S3_PUBLIC_URL: good.S3_ENDPOINT }).join(), /S3_PUBLIC_URL depo adresi olmuş/);
    assert.match(storageNotes({ ...good, S3_BUCKET: 'Similar Club' }).join(), /S3_BUCKET bir kova adı değil/);
  });

  test('Anlar ve sohbet için video ya da çok büyük dosya istenmez', async () => {
    const a = await signUp('Sınır');
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'moment', contentType: 'video/mp4', size: 1000 }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'moment', contentType: 'image/jpeg', size: 9 * 1024 * 1024 }, a.session))[0], 400);
    assert.equal((await call('POST', '/api/media/upload-url', { kind: 'dm', contentType: 'image/jpeg', size: 9 * 1024 * 1024 }, a.session))[0], 400);
    await ok(call('POST', '/api/media/upload-url', { kind: 'moment', contentType: 'image/jpeg', size: 300 * 1024 }, a.session), 'küçültülmüş fotoğraf');
  });
});
