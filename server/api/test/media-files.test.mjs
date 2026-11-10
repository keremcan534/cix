// Stored files are opened at this server, not at the storage's public address (core.mjs filesOut/filesIn,
// media.mjs sendFile): against a real Postgres and a stand-in bucket. Phones get and send this server's address,
// the database keeps the storage's; the file itself comes through GET /api/media/f/<key>, whole or in parts,
// as the type of its ending.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://pub-test.r2.dev';
const S3_PORT = 21000 + (process.pid % 900);
/** The bucket: key → { body, type }. Signed requests only; GET answers ranges like the real one. */
const stored = new Map();
let down = false;
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (down) return res.writeHead(500).end();
  if (!u.searchParams.get('X-Amz-Signature') || !u.pathname.startsWith('/media/')) return res.writeHead(403).end();
  const key = decodeURIComponent(u.pathname.slice('/media/'.length));
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => {
      stored.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] ?? '', enc: req.headers['content-encoding'] });
      res.writeHead(200).end();
    });
    return;
  }
  const f = stored.get(key);
  if (req.method === 'DELETE') return void (stored.delete(key), res.writeHead(204).end());
  if (!f) return res.writeHead(404).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
  const base = { 'content-type': f.type, etag: '"e1"', 'last-modified': 'Tue, 10 Nov 2026 09:00:00 GMT', ...(f.enc ? { 'content-encoding': f.enc } : {}) };
  if (req.method === 'HEAD') return res.writeHead(200, { ...base, 'content-length': String(f.body.length) }).end();
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (m) {
    const from = Number(m[1]);
    const to = m[2] ? Math.min(Number(m[2]), f.body.length - 1) : f.body.length - 1;
    if (from >= f.body.length) return res.writeHead(416, { 'content-range': `bytes */${f.body.length}` }).end();
    const part = f.body.subarray(from, to + 1);
    return res.writeHead(206, { ...base, 'content-length': String(part.length), 'content-range': `bytes ${from}-${to}/${f.body.length}` }).end(part);
  }
  res.writeHead(200, { ...base, 'content-length': String(f.body.length) }).end(f.body);
});
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

const h = startApi({ S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`, S3_BUCKET: 'media', S3_KEY: 'testkey', S3_SECRET: 'testsecret', S3_PUBLIC_URL: CDN, UPLOAD_VERIFY: '1', PUBLIC_URL: 'self', RATE_FILES: '100000' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const PHOTO = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7) % 256));
/** Uploads `body` as my avatar the way the app does (`more`: headers a made-up client adds); the address the
 *  app was given for it. */
async function upload(a, body = PHOTO, type = 'image/jpeg', more = {}) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind: 'avatar', contentType: 'image/jpeg', size: body.length }, a.session), 'yükleme adresi');
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: { 'content-type': type, ...more }, body })).status, 200);
  return up.publicUrl;
}

describe('Dosyalar bu sunucudan açılır', () => {
  test('telefon bu sunucunun adresini alır ve gönderir; veritabanında deponun adresi durur', async () => {
    const a = await signUp('Dosya A');
    const b = await signUp('Dosya B');
    const url = await upload(a);
    assert.ok(url.startsWith(`${h.base}/api/media/f/avatar/${a.user.id}/`), 'yükleme cevabında bu sunucunun adresi');
    assert.ok(!url.includes('r2.dev'));
    const me = await ok(call('PATCH', '/api/me', { avatarUrl: url }, a.session), 'kaydet');
    assert.equal(me.user.avatarUrl, url);
    const kept = (await q('SELECT avatar_url FROM users WHERE id = $1', [a.user.id])).rows[0].avatar_url;
    assert.ok(kept.startsWith(`${CDN}/avatar/${a.user.id}/`), 'veritabanında deponun adresi');
    // Everyone is shown it at this server: my own profile, another person's view, the people list.
    assert.equal((await ok(call('GET', '/api/me', null, a.session), 'ben')).user.avatarUrl, url);
    assert.equal((await ok(call('GET', `/api/user?id=${a.user.id}`, null, b.session), 'profil')).user.avatarUrl, url);
    const seen = (await ok(call('GET', '/api/discover?list=new', null, b.session), 'liste')).users.find((u) => u.id === a.user.id);
    assert.equal(seen.avatarUrl, url);
    // An address in the stored form (an older app's saved state) is still taken.
    assert.equal((await ok(call('PATCH', '/api/me', { avatarUrl: kept }, a.session), 'eski biçim')).user.avatarUrl, url);
  });

  test('dosya bütün ya da parça parça gelir; türü uzantısından, tarayıcıda çalışmaz biçimde', async () => {
    const a = await signUp('Dosya C');
    // Uploaded claiming to be a web page: it still goes out as the picture its ending says.
    const url = await upload(a, PHOTO, 'text/html');
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PHOTO);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal(res.headers.get('content-length'), String(PHOTO.length));
    assert.match(res.headers.get('cache-control'), /public, max-age=31536000, immutable/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy'), /sandbox/);
    assert.equal(res.headers.get('accept-ranges'), 'bytes');

    const part = await fetch(url, { headers: { range: 'bytes=10-19' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 10-19/${PHOTO.length}`);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), PHOTO.subarray(10, 20));
    assert.equal((await fetch(url, { headers: { range: `bytes=${PHOTO.length + 5}-` } })).status, 416);

    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(PHOTO.length));
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  });

  test('kodlanmış diye yüklenen dosya çözülmüş gelir, yanlış boy söylenmez; bozuğu bağlantıyı bozmaz', async () => {
    const a = await signUp('Dosya E');
    // The upload address signs only the length, so a made-up client can name an encoding; the storage keeps it.
    const packed = zlib.gzipSync(PHOTO);
    const url = await upload(a, packed, 'image/jpeg', { 'content-encoding': 'gzip' });
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-length'), null, 'depodaki (sıkışık) boy söylenmez');
    assert.equal(res.headers.get('content-encoding'), null);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PHOTO);
    // Named gzip but isn't: the answer is cut, never a wrong one, and the next request is answered as usual.
    const bad = await upload(a, PHOTO, 'image/jpeg', { 'content-encoding': 'gzip' });
    await assert.rejects(async () => void (await (await fetch(bad)).arrayBuffer()));
    assert.deepEqual(Buffer.from(await (await fetch(await upload(a))).arrayBuffer()), PHOTO);
    assert.equal((await call('GET', '/api/health'))[0], 200);
  });

  test('olmayan dosya ve dosya olmayan yol 404; depo cevap vermezse 502; giriş gerekmez', async () => {
    const a = await signUp('Dosya D');
    const url = await upload(a);
    // No session is sent by an <Image>: the address alone opens it (a key can't be guessed).
    assert.equal((await fetch(url)).status, 200);
    const base = `${h.base}/api/media/f`;
    assert.equal((await fetch(`${base}/avatar/${a.user.id}/yok-${rnd(4)}.jpg`)).status, 404);
    for (const bad of ['', 'avatar', `avatar/${a.user.id}`, `gizli/${a.user.id}/a.jpg`, `avatar/${a.user.id}/a/b.jpg`, 'avatar/..%2F..%2Fetc/passwd', `avatar/${a.user.id}/%00.jpg`, '%E0%A4%A']) {
      assert.equal((await fetch(`${base}/${bad}`)).status, 404, bad);
    }
    assert.equal((await fetch(url, { method: 'POST' })).status, 404, 'yalnızca okunur');
    down = true;
    try {
      assert.equal((await fetch(url)).status, 502);
    } finally {
      down = false;
    }
  });

  test('depo denetimi telefonların yolunu da dener', async () => {
    const { storageCheck } = await import('../media.mjs');
    const saved = { ...process.env };
    const pub = http.createServer((req, res) => res.writeHead(stored.has(decodeURIComponent(req.url.slice(1))) ? 200 : 404).end());
    await new Promise((r) => pub.listen(S3_PORT + 1, '127.0.0.1', r));
    Object.assign(process.env, { S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`, S3_BUCKET: 'media', S3_KEY: 'testkey', S3_SECRET: 'testsecret', S3_PUBLIC_URL: `http://127.0.0.1:${S3_PORT + 1}`, PUBLIC_URL: h.base, API_PORT: new URL(h.base).port });
    try {
      assert.match(await storageCheck(), /^yükleme 200, açık adres 200, uygulama adresi 200, silme 204/);
      assert.ok(![...stored.keys()].some((k) => k.includes('depo-denetimi')), 'deneme dosyası silindi');
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      pub.close();
    }
  });
});
