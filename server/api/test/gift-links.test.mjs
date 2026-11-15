// Yönetim › Hediyeler "ya da bağlantı yapıştır" (custom-gifts.mjs POST /api/admin/gifts/fetch, link-fetch.mjs): a
// stand-in "client's host" serves files, web pages and redirects; the API downloads from it once and stores the file
// in a stand-in bucket as if uploaded. Inner addresses (this machine, private ranges), even behind a redirect or a
// name, are never fetched. The host is on 127.0.0.1, so it is let through by LINK_FETCH_ALLOW (tests only).
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import http from 'node:http';
import zlib from 'node:zlib';

import { INNER, isPublic, linkOf, looksLikePage } from '../link-fetch.mjs';
import { sniff } from '../custom-gifts.mjs';
import { PANEL_ROUTES } from '../panel.mjs';
import { startApi } from './harness.mjs';

const CDN = 'https://pub-test.r2.dev';
const S3_PORT = 23000 + (process.pid % 900);
const HOST_PORT = 24000 + (process.pid % 900);
const HOST = `http://127.0.0.1:${HOST_PORT}`;

/** The bucket: key → { body, type }; signed requests only. */
const stored = new Map();
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.searchParams.get('X-Amz-Signature') || !u.pathname.startsWith('/media/')) return res.writeHead(403).end();
  const key = decodeURIComponent(u.pathname.slice('/media/'.length));
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => {
      stored.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] ?? '', length: req.headers['content-length'] });
      res.writeHead(200).end();
    });
    return;
  }
  const f = stored.get(key);
  if (req.method === 'DELETE') return void (stored.delete(key), res.writeHead(204).end());
  if (!f) return res.writeHead(404).end();
  const base = { 'content-type': f.type, 'content-length': String(f.body.length), etag: '"e1"' };
  if (req.method === 'HEAD') return res.writeHead(200, base).end();
  res.writeHead(200, base).end(f.body);
});
bucket.listen(S3_PORT, '127.0.0.1');

/** A transparent square PNG (a pink disc). */
function png(w) {
  const row = w * 4 + 1;
  const raw = Buffer.alloc(row * w);
  for (let y = 0; y < w; y++)
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * 4;
      const inside = (x - w / 2) ** 2 + (y - w / 2) ** 2 < (w / 3) ** 2;
      raw.set([255, 80, 120, inside ? 255 : 0], o);
    }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((zlib.crc32?.(body) ?? 0) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const ICON = png(256);
// Only what the fetch reads (the first bytes): an MP4's ftyp box; an SVGA 1.x (a zip).
const MP4 = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2', 'latin1'), Buffer.alloc(4000)]);
const ZIP = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.alloc(500)]);
const PAGE_HTML = '<!DOCTYPE html><html><head><title>Google Drive</title></head><body>Dosyayı indir</body></html>';

/** The client's host: files, pages, redirects (to itself and to inner addresses). */
const host = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/hediyeler/ikon.png') return res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(ICON.length) }).end(ICON);
  // GoDaddy names an unknown ending "application/octet-stream": what the file is comes from its bytes.
  if (p === '/hediyeler/ikon-isimsiz') return res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(ICON);
  if (p === '/hediyeler/hazir.mp4') return res.writeHead(200, { 'content-type': 'video/mp4' }).end(MP4);
  if (p === '/hediyeler/eski.svga') return res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(ZIP);
  if (p === '/paylas') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE_HTML);
  if (p === '/gizli-sayfa.png') return res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(`\n\n   ${PAGE_HTML}${' '.repeat(200)}`);
  // Past the icon's 10 MB, said by its length (the API stops at the header, so the body need not come).
  if (p === '/buyuk.png') return res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) }).end(Buffer.alloc(16));
  if (p === '/buyuk-parcali.png') {
    // No length given: counted while it comes, stopped past the limit.
    res.writeHead(200, { 'content-type': 'image/png' });
    res.write(ICON.subarray(0, 8));
    for (let i = 0; i < 11 * 16; i++) res.write(Buffer.alloc(64 * 1024));
    return res.end();
  }
  // A 19,5 MB video, said by its length (the API stops at the header, so the body need not come).
  if (p === '/hediyeler/panda.mov') return res.writeHead(200, { 'content-type': 'video/quicktime', 'content-length': String(Math.round(19.5 * 1024 * 1024)) }).end(Buffer.alloc(16));
  if (p === '/hediyeler/cok-buyuk.webm') return res.writeHead(200, { 'content-type': 'video/webm', 'content-length': String(501 * 1024 * 1024) }).end(Buffer.alloc(16));
  if (p === '/hediyeler/buyuk.svga') {
    // An SVGA past its 250 MB: its bytes say SVGA only once it has come (the host calls it nothing).
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.write(Buffer.from([0x78, 0x9c]));
    const mb = Buffer.alloc(1024 * 1024);
    let left = 251;
    const more = () => {
      while (left > 0) {
        left--;
        if (!res.write(mb)) return void res.once('drain', more);
      }
      res.end();
    };
    return more();
  }
  if (p === '/hediyeler/parcali.mp4') {
    // A video with no length given and a host that calls it nothing: known by its name once past the icon's limit.
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.write(MP4);
    for (let i = 0; i < 20; i++) res.write(Buffer.alloc(64 * 1024));
    return res.end();
  }
  if (p === '/yok.png') return res.writeHead(404).end('yok');
  if (p === '/yonlendir') return res.writeHead(302, { location: '/hediyeler/ikon.png' }).end();
  if (p === '/ice-yonlendir') return res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
  if (p === '/panele-yonlendir') return res.writeHead(301, { location: 'http://127.0.0.1:4300/api/me' }).end();
  if (p === '/dongu') return res.writeHead(302, { location: '/dongu' }).end();
  res.writeHead(404).end();
});
host.listen(HOST_PORT, '127.0.0.1');
after(() => {
  bucket.close();
  host.close();
});

const h = startApi({
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: CDN,
  UPLOAD_VERIFY: '1',
  PUBLIC_URL: 'self',
  RATE_FILES: '100000',
  CUSTOM_GIFTS_POLL_MS: '200',
  LINK_FETCH_ALLOW: `127.0.0.1:${HOST_PORT}`,
});
const { call } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j.error}`);
  if (re) assert.match(j.error, re);
  return j;
};
let n = 0;
/** A fresh admin (the fetch route allows 10 tries a minute each). */
const freshAdmin = () => h.account(`Hediye Yöneticisi ${++n}`, 'admin');
const fetchAs = (who, slot, url) => call('POST', '/api/admin/gifts/fetch', { slot, url }, who.session);
const keyIn = (url) => url.slice(url.indexOf('/api/media/f/') + '/api/media/f/'.length);

describe('Hediye dosyası bağlantıdan', () => {
  test('ikon bağlantıdan iner, depoya yüklenmiş gibi konur, kaydedilince hediyenin ikonu olur; bağlantı denetimde', async () => {
    const admin = await freshAdmin();
    const link = `${HOST}/hediyeler/ikon.png`;
    const got = await ok(fetchAs(admin, 'icon', link), 'ikon çek');
    assert.equal(got.kind, 'gifticon');
    assert.equal(got.type, 'image/png');
    assert.equal(got.bytes, ICON.length);
    assert.equal(got.link, link);
    assert.equal(got.video, null);
    const key = keyIn(got.url);
    assert.match(key, new RegExp(`^gifticon/${admin.user.id}/[A-Za-z0-9._-]+\\.png$`));
    assert.deepEqual(stored.get(key).body, ICON);
    assert.equal(stored.get(key).type, 'image/png');
    assert.equal(stored.get(key).length, String(ICON.length));
    // Saved like an uploaded icon (checked: PNG, square, transparent), with the link kept for fetching again.
    const gift = (await ok(call('POST', '/api/admin/gifts', { name: 'Bağlantı Yıldızı', price: 1500, cat: 'hot', icon: got.url, iconLink: link }, admin.session), 'hediye ekle')).gift;
    assert.equal(gift.iconLink, link);
    assert.equal(gift.videoLink, null);
    assert.equal(keyIn(gift.icon), key);
    const row = (await q("SELECT detail FROM audit_events WHERE action = 'gift.fetch' AND actor = $1 ORDER BY id DESC LIMIT 1", [admin.user.id])).rows[0].detail;
    assert.equal(row.link, link);
    assert.equal(row.kind, 'gifticon');
    assert.equal(row.file, key);
    // The file's kind comes from its bytes, whatever the host calls it; a redirect on the same host is followed.
    assert.equal((await ok(fetchAs(admin, 'icon', `${HOST}/hediyeler/ikon-isimsiz`))).type, 'image/png');
    assert.equal((await ok(fetchAs(admin, 'icon', `${HOST}/yonlendir`))).bytes, ICON.length);
    // A new icon uploaded instead clears the link; a link can be set again alone.
    const fresh = await ok(fetchAs(admin, 'icon', link));
    const upd = (await ok(call('POST', '/api/admin/gifts/update', { id: gift.id, icon: fresh.url }, admin.session))).gift;
    assert.equal(upd.iconLink, null);
    assert.equal((await ok(call('POST', '/api/admin/gifts/update', { id: gift.id, iconLink: link }, admin.session))).gift.iconLink, link);
    await refused(call('POST', '/api/admin/gifts/update', { id: gift.id, iconLink: 'ftp://x.com/a.png' }, admin.session), 400, /http/);
  });

  test('video alanı: hazır MP4 hazır video olarak, SVGA 1.x ve yanlış tür net bir cümleyle', async () => {
    const admin = await freshAdmin();
    const mp4 = await ok(fetchAs(admin, 'video', `${HOST}/hediyeler/hazir.mp4`), 'mp4 çek');
    assert.equal(mp4.kind, 'giftvideo');
    assert.equal(mp4.video, 'stacked');
    assert.match(keyIn(mp4.url), /^giftvideo\/.+\.mp4$/);
    await refused(fetchAs(admin, 'video', `${HOST}/hediyeler/eski.svga`), 400, /SVGA 1\.x/);
    // In the other slot's field: said so, whichever way round.
    await refused(fetchAs(admin, 'video', `${HOST}/hediyeler/ikon.png`), 400, /^Bu bağlantı bir resim: videonun değil, ikonun bağlantı alanına yapıştırın$/);
    await refused(fetchAs(admin, 'icon', `${HOST}/hediyeler/hazir.mp4`), 400, /^Bu bağlantı bir video: ikonun değil, videonun bağlantı alanına yapıştırın$/);
  });

  test("ikonun alanına yapıştırılan büyük video: ikonun 10 MB sınırı yerine bunun bir video olduğu söylenir; videonun sınırı 500 MB, SVGA'nınki 250 MB", async () => {
    const admin = await freshAdmin();
    await refused(fetchAs(admin, 'icon', `${HOST}/hediyeler/panda.mov`), 400, /^Bu bağlantı bir video \(19,5 MB\): ikonun değil, videonun bağlantı alanına yapıştırın$/);
    await refused(fetchAs(admin, 'icon', `${HOST}/hediyeler/parcali.mp4`), 400, /^Bu bağlantı bir video: ikonun değil, videonun bağlantı alanına yapıştırın$/);
    await refused(fetchAs(admin, 'icon', `${HOST}/buyuk.png`), 400, /^İkon en fazla 10 MB olabilir \(bu 11 MB\)$/);
    await refused(fetchAs(admin, 'video', `${HOST}/hediyeler/cok-buyuk.webm`), 400, /^Video en fazla 500 MB olabilir \(bu 501 MB\)$/);
    await refused(fetchAs(admin, 'video', `${HOST}/hediyeler/buyuk.svga`), 400, /^SVGA en fazla 250 MB olabilir \(bu 251 MB\)$/);
    // Nothing of them reached the bucket.
    assert.ok(![...stored.keys()].some((k) => k.includes(admin.user.id)));
  });

  test('web sayfası, büyük dosya, bulunamayan dosya ve sonsuz yönlendirme: ne olduğunu söyler', async () => {
    const admin = await freshAdmin();
    await refused(fetchAs(admin, 'icon', `${HOST}/paylas`), 400, /web sayfasını açıyor.*doğrudan indiren bağlantı/);
    await refused(fetchAs(admin, 'icon', `${HOST}/gizli-sayfa.png`), 400, /web sayfasını açıyor/);
    await refused(fetchAs(admin, 'icon', `${HOST}/buyuk.png`), 400, /en fazla 10 MB olabilir \(bu 11 MB\)/);
    await refused(fetchAs(admin, 'icon', `${HOST}/buyuk-parcali.png`), 400, /en fazla 10 MB/);
    await refused(fetchAs(admin, 'icon', `${HOST}/yok.png`), 400, /404.*bulunamadı/);
    await refused(fetchAs(admin, 'icon', `${HOST}/dongu`), 400, /çok fazla yönlendiriyor/);
    const rows = (await q("SELECT detail FROM audit_events WHERE action = 'gift.fetch' AND actor = $1 ORDER BY id", [admin.user.id])).rows.map((r) => r.detail);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((r) => r.refused && r.link.startsWith(HOST)));
    // Nothing of them reached the bucket.
    assert.ok(![...stored.keys()].some((k) => k.includes(admin.user.id)));
  });

  test('iç adresler açılmaz: bu sunucu, özel ağ, bulut üst verisi; yönlendirmeyle ya da adla da', async () => {
    const admin = await freshAdmin();
    for (const url of ['http://127.0.0.1:4300/api/me', 'http://localhost:7890/api/health', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/a.png', 'http://[::1]/a.png', 'http://postgres:5432/', 'http://2130706433/a.png']) {
      await refused(fetchAs(admin, 'icon', url), 400, /iç ağ ya da bu sunucu olmaz/);
    }
    // The route allows 10 tries a minute per admin: the rest with another one.
    const other = await freshAdmin();
    await refused(fetchAs(other, 'icon', `${HOST}/ice-yonlendir`), 400, /iç ağ ya da bu sunucu olmaz/);
    await refused(fetchAs(other, 'icon', `${HOST}/panele-yonlendir`), 400, /iç ağ ya da bu sunucu olmaz/);
    await refused(fetchAs(other, 'icon', 'ftp://ornek.com/a.png'), 400, /http/);
    await refused(fetchAs(other, 'icon', 'https://kullanici:parola@ornek.com/a.png'), 400, /kullanıcı adı ya da parola/);
    await refused(fetchAs(other, 'icon', 'https://ornek.com:8443/a.png'), 400, /80 ya da 443/);
    await refused(fetchAs(other, 'gift', `${HOST}/hediyeler/ikon.png`), 400, /ikon ya da video/);
    // A public name that points at this machine (wildcard DNS): refused after the name is resolved.
    const name = '127.0.0.1.nip.io';
    const resolves = await dns.lookup(name).then((a) => a.address === '127.0.0.1', () => false);
    if (resolves) await refused(fetchAs(await freshAdmin(), 'icon', `http://${name}/a.png`), 400, /iç ağ ya da bu sunucu olmaz/);
    // Only admins.
    const user = await h.account('Üye');
    await refused(fetchAs(user, 'icon', `${HOST}/hediyeler/ikon.png`), 403);
  });

  test('kurallar: adres sınıfları, bağlantının biçimi, dosyanın türü, web sayfası', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2001:4860:4860::8888']) assert.ok(isPublic(ip), ip);
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.18.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fe80::1%eth0', 'fd12::1', '64:ff9b::7f00:1', '2002:7f00:1::1', 'x']) {
      assert.ok(!isPublic(ip), ip);
    }
    assert.equal(linkOf('  https://alanadi.com/hediyeler/yüzük kutusu.svga '), 'https://alanadi.com/hediyeler/y%C3%BCz%C3%BCk%20kutusu.svga');
    assert.throws(() => linkOf('alanadi.com/a.png'), /tam adresi/);
    assert.throws(() => linkOf('http://0x7f.1/'), (e) => e.message === INNER);
    assert.equal(sniff(ICON), 'image/png');
    assert.equal(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8L', 'latin1')), 'image/webp');
    assert.equal(sniff(MP4), 'video/mp4');
    assert.equal(sniff(Buffer.from('\0\0\0\x14ftypqt  \0\0\0\0', 'latin1')), 'video/quicktime');
    assert.equal(sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f])), 'video/webm');
    assert.equal(sniff(zlib.deflateSync(Buffer.from('svga'))), 'application/x-svga');
    assert.equal(sniff(ZIP), 'zip');
    assert.equal(sniff(Buffer.from('GIF89a')), null);
    assert.ok(looksLikePage(Buffer.from('﻿  <!doctype HTML><html>')));
    assert.ok(!looksLikePage(ICON));
    assert.ok(PANEL_ROUTES.has('POST /api/admin/gifts/fetch'));
  });
});
