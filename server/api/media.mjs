// Photo and video uploads go straight from the phone to S3-compatible storage (Cloudflare R2, Backblaze B2,
// AWS S3…); the API only hands out a short-lived signed address, so big files never pass through it.
//
//   POST /api/media/upload-url { kind: 'avatar' | 'moment', contentType, size } → { uploadUrl, headers, publicUrl, expiresIn }
//
// The app PUTs the file to uploadUrl with exactly `headers` (type and size are signed, so a different file
// is refused by the storage), then saves publicUrl (e.g. PATCH /api/me { avatarUrl }).
// Settings in the server's .env: S3_ENDPOINT (https://<account>.r2.cloudflarestorage.com), S3_BUCKET,
// S3_REGION (R2: auto), S3_KEY, S3_SECRET, S3_PUBLIC_URL (the bucket's public https address or CDN domain).
// Without them uploads answer 503.
import crypto from 'node:crypto';

import { HttpError, auth, env, limit, readJson } from './core.mjs';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4' };
const KINDS = {
  avatar: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], max: 5 * 1024 * 1024 },
  moment: { types: Object.keys(TYPES), max: 50 * 1024 * 1024 },
};
const EXPIRES = 10 * 60;

const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
const hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** RFC 3986 encoding, as SigV4 wants it. */
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * An AWS Signature V4 presigned URL (query-string auth, unsigned payload). `headers` are signed too and must
 * be sent as given; `host` always is.
 */
export function presign({ method, url, region, accessKey, secretKey, expires, headers = {}, now = new Date() }) {
  const u = new URL(url);
  const date = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const all = Object.fromEntries(Object.entries({ host: u.host, ...headers }).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const names = Object.keys(all).sort();
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': names.join(';'),
  };
  const qs = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(query[k])}`).join('&');
  const path = u.pathname.split('/').map((p) => enc(decodeURIComponent(p))).join('/');
  const canonical = [method, path, qs, names.map((n) => `${n}:${all[n]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', date, scope, hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return `${u.origin}${path}?${qs}&X-Amz-Signature=${signature}`;
}

export const mediaRoutes = {
  async 'POST /api/media/upload-url'(req) {
    const u = await auth(req);
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_KEY || !env.S3_SECRET || !env.S3_PUBLIC_URL) throw new HttpError(503, 'Fotoğraf yükleme henüz açık değil');
    limit(`media:${u.id}`, 20, 'Çok fazla yükleme, biraz bekle');
    const { kind, contentType, size } = await readJson(req);
    const k = KINDS[kind];
    if (!k) throw new HttpError(400, 'Geçersiz yükleme türü');
    if (!k.types.includes(contentType)) throw new HttpError(400, 'Bu dosya türü yüklenemez');
    if (!Number.isSafeInteger(size) || size < 1 || size > k.max) throw new HttpError(400, `Dosya en fazla ${k.max / 1024 / 1024} MB olabilir`);
    // Not guessable, and grouped by person so an account's files can be found (and removed) together.
    const key = `${kind}/${u.id}/${Date.now().toString(36)}-${crypto.randomBytes(9).toString('base64url')}.${TYPES[contentType]}`;
    const headers = { 'content-type': contentType, 'content-length': String(size) };
    const uploadUrl = presign({
      method: 'PUT',
      url: `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${key}`,
      region: env.S3_REGION ?? 'auto',
      accessKey: env.S3_KEY,
      secretKey: env.S3_SECRET,
      expires: EXPIRES,
      headers,
    });
    return { uploadUrl, method: 'PUT', headers, publicUrl: `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`, expiresIn: EXPIRES };
  },
};
