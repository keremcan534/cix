// A stand-in S3 bucket for tests that upload (signed PUT, GET with ranges, HEAD, DELETE), and small test pictures.
// startApi's storage settings for it: bucketEnv(port).
import { after } from 'node:test';
import http from 'node:http';
import zlib from 'node:zlib';

export const CDN = 'https://pub-test.r2.dev';

/** A bucket on `port`: key → { body, type }. Signed requests only; GET answers ranges like the real one. */
export function standInBucket(port) {
  const stored = new Map();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.searchParams.get('X-Amz-Signature') || !u.pathname.startsWith('/media/')) return res.writeHead(403).end();
    const key = decodeURIComponent(u.pathname.slice('/media/'.length));
    if (req.method === 'PUT') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c)).on('end', () => {
        stored.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] ?? '' });
        res.writeHead(200).end();
      });
      return;
    }
    const f = stored.get(key);
    if (req.method === 'DELETE') return void (stored.delete(key), res.writeHead(204).end());
    if (!f) return res.writeHead(404).end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
    const base = { 'content-type': f.type, etag: '"e1"' };
    if (req.method === 'HEAD') return res.writeHead(200, { ...base, 'content-length': String(f.body.length) }).end();
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (m) {
      const from = Number(m[1]);
      const to = m[2] ? Math.min(Number(m[2]), f.body.length - 1) : f.body.length - 1;
      const part = f.body.subarray(from, to + 1);
      return res.writeHead(206, { ...base, 'content-length': String(part.length), 'content-range': `bytes ${from}-${to}/${f.body.length}` }).end(part);
    }
    res.writeHead(200, { ...base, 'content-length': String(f.body.length) }).end(f.body);
  });
  server.listen(port, '127.0.0.1');
  after(() => server.close());
  return { stored };
}

/** startApi's settings for a bucket on `port`, files checked when saved and served at the API's own address. */
export const bucketEnv = (port) => ({
  S3_ENDPOINT: `http://127.0.0.1:${port}`,
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: CDN,
  UPLOAD_VERIFY: '1',
  PUBLIC_URL: 'self',
  RATE_FILES: '100000',
});

/** A PNG of w × h: a pink disc, transparent around it (alpha) or on white (no alpha channel). */
export function png(w, h, { alpha = true } = {}) {
  const bpp = alpha ? 4 : 3;
  const row = w * bpp + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * bpp;
      const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 3) ** 2;
      raw[o] = 255;
      raw[o + 1] = inside ? 80 : 255;
      raw[o + 2] = inside ? 120 : 255;
      if (alpha) raw[o + 3] = inside ? 255 : 0;
    }
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
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A PNG of w × h with each pixel's alpha from `alphaAt(x, y)` (0–255) on one colour (`rgb`): a profile mark's overlay
 * as the server's pixel check sees it (mark-kinds.mjs). `apng`: an acTL chunk before the pixels (an animated PNG's
 * header), `alpha: false` an RGB picture with no transparency at all.
 */
export function rgbaPng(w, h, alphaAt, { rgb = [120, 90, 200], apng = false, alpha = true } = {}) {
  const bpp = alpha ? 4 : 3;
  const row = w * bpp + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * row + 1 + x * bpp;
      [raw[o], raw[o + 1], raw[o + 2]] = rgb;
      if (alpha) raw[o + 3] = alphaAt(x, y);
    }
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
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(2, 0);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(apng ? [chunk('acTL', actl)] : []),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
/** A ring round the edge of a w × w square (from `inner` of the half side out), the rest fully transparent: an overlay that leaves the face open. */
export const ringAlpha = (w, inner = 0.72) => (x, y) => (Math.hypot(x - (w - 1) / 2, y - (w - 1) / 2) >= inner * (w / 2) ? 255 : 0);
