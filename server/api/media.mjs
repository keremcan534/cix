// Photo and video uploads go straight from the phone to S3-compatible storage (Cloudflare R2, Backblaze B2,
// AWS S3…); the API only hands out a short-lived signed address, so big files never pass through it.
//
//   POST /api/media/upload-url { kind: 'avatar' | 'moment' | 'dm' | 'notice' | 'music', contentType, size } → { uploadUrl, headers, publicUrl, expiresIn }
//
// The app PUTs the file to uploadUrl with exactly `headers` (type and size are signed, so a different file
// is refused by the storage), then saves publicUrl (e.g. PATCH /api/me { avatarUrl }).
// Settings in the server's .env: S3_ENDPOINT (https://<account>.r2.cloudflarestorage.com), S3_BUCKET,
// S3_REGION (R2: auto), S3_KEY, S3_SECRET, S3_PUBLIC_URL (the bucket's public https address or CDN domain).
//
// Files no longer used are deleted (removeFiles, removeUserFiles): an avatar replaced, a moment its author
// deletes, a track taken out of a library, a removed notice, and every file of a deleted account (UK GDPR
// erasure). A moment staff take down keeps its photo, as the evidence an appeal is decided on.
// Without them uploads answer 503. 'notice' (a Similar Ekibi notice's picture, team.mjs) is for admins only;
// 'music' (a track for the room music, music.mjs) for people who have a room or run or play in one.
import crypto from 'node:crypto';

import { HttpError, auth, db, env, limit, readJson } from './core.mjs';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4' };
// What phones call the usual music files (the app names a file's type from its ending when the phone doesn't).
const AUDIO = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
const KINDS = {
  avatar: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], max: 5 * 1024 * 1024 },
  // Photos only (the app posts no video). The app shrinks a photo before it uploads (lib/live/profile
  // uploadPhoto), so these caps only stop a file sent around the app.
  moment: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], max: 8 * 1024 * 1024 },
  // A photo in a chat (messages.mjs; who may send one is checked when the message is sent).
  dm: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], max: 8 * 1024 * 1024 },
  notice: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 5 * 1024 * 1024, admin: true },
  music: { types: Object.keys(AUDIO), max: 20 * 1024 * 1024, may: mayKeepMusic, refused: 'Müzik kütüphanesi oda sahibi, yönetici ve DJ’ler için' },
};
const EXPIRES = 10 * 60;

/** Whether `uid` may keep a music library (music.mjs): they have a room, or run one or play in one. */
export async function mayKeepMusic(uid) {
  const r = await db.query(
    `SELECT EXISTS (SELECT 1 FROM rooms WHERE owner = $1) OR EXISTS (SELECT 1 FROM room_admins WHERE user_id = $1)
            OR EXISTS (SELECT 1 FROM room_djs WHERE user_id = $1) AS ok`,
    [uid],
  );
  return r.rows[0].ok;
}

const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest();
const hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** RFC 3986 encoding, as SigV4 wants it. */
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * An AWS Signature V4 presigned URL (query-string auth, unsigned payload). `headers` are signed too and must
 * be sent as given; `host` always is.
 */
export function presign({ method, url, region, accessKey, secretKey, expires, headers = {}, query: extra = {}, now = new Date() }) {
  const u = new URL(url);
  const date = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const all = Object.fromEntries(Object.entries({ host: u.host, ...headers }).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const names = Object.keys(all).sort();
  const query = {
    ...extra,
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

const storageOn = () => !!(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_KEY && env.S3_SECRET && env.S3_PUBLIC_URL);
/** A signed request to the bucket: `key` '' is the bucket itself (listing). */
const signed = (method, key, query = {}) =>
  presign({
    method,
    url: `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}${key ? `/${key}` : ''}`,
    region: env.S3_REGION ?? 'auto',
    accessKey: env.S3_KEY,
    secretKey: env.S3_SECRET,
    expires: 60,
    query,
  });
const FILE_KEY = /^(avatar|moment|dm|notice|music)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/;

/** The storage key of one of our files from its public address (kind/<uploader>/<name>), else null. With
 *  `owner`, only a file that person uploaded. */
export function keyOf(url, owner) {
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!base || typeof url !== 'string' || !url.startsWith(`${base}/`)) return null;
  const key = url.slice(base.length + 1);
  if (!FILE_KEY.test(key)) return null;
  return owner && key.split('/')[1] !== owner ? null : key;
}

async function deleteKeys(keys) {
  for (const key of keys) {
    // A file a moderation decision points at stays: an appeal is decided on it.
    if ((await db.query('SELECT 1 FROM moderation_evidence WHERE position($1 in content) > 0 LIMIT 1', [key])).rowCount) continue;
    const res = await fetch(signed('DELETE', key), { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
    // 404: already gone, which is what was wanted.
    if (!res.ok && res.status !== 404) console.error('storage delete', res.status);
  }
}

/** Every key under `prefix` (ListObjectsV2, a page of up to 1000 at a time). */
async function listKeys(prefix) {
  const keys = [];
  let token = null;
  do {
    const res = await fetch(signed('GET', '', { 'list-type': '2', prefix, ...(token ? { 'continuation-token': token } : {}) }), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`storage list ${res.status}`);
    const xml = await res.text();
    const unxml = (v) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(unxml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml(xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? '') || null : null;
  } while (token);
  return keys;
}

/** Done after the request that caused it, never failing it: storage being slow or down only leaves files. */
const later = (what, fn) => {
  const p = fn().catch((e) => console.error(what, String(e).slice(0, 200)));
  pending.add(p);
  p.finally(() => pending.delete(p));
};
const pending = new Set();
/** Waits for the deletions started so far (tests). */
export const storageSettled = () => Promise.all([...pending]);

/** Deletes the files at these public addresses that are ours (with `owner`, only that person's). */
export function removeFiles(urls, owner) {
  const keys = [...new Set(urls.map((u) => keyOf(u, owner)).filter(Boolean))];
  if (keys.length && storageOn()) later('storage delete failed', () => deleteKeys(keys));
}

/** Deletes every file a deleted account uploaded (its avatars, moment and chat photos, music). A notice's
 *  picture stays: it is the company's, whoever put it up. */
export function removeUserFiles(uid) {
  if (!storageOn() || !/^[0-9a-f-]{36}$/.test(String(uid))) return;
  later('storage erase failed', async () => {
    for (const kind of ['avatar', 'moment', 'dm', 'music']) await deleteKeys(await listKeys(`${kind}/${uid}/`));
  });
}

/**
 * The storage settings checked end to end (run after a deploy, server.yml): a small file put exactly the way the
 * phone puts a photo, read back through the public address, then deleted. The answer holds only status codes and
 * the storage's error code (SignatureDoesNotMatch, NoSuchBucket…), never a setting's value, so it can go in a log.
 */
export async function storageCheck() {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_KEY', 'S3_SECRET', 'S3_PUBLIC_URL'].filter((k) => !env[k]);
  if (missing.length) return `kapalı: ${missing.join(', ')} yok`;
  const notes = [];
  try {
    if (new URL(env.S3_ENDPOINT).pathname.replace(/\/$/, '') !== '') notes.push('S3_ENDPOINT sonunda fazladan yol var (kova adı silinmeli)');
  } catch {
    return 'S3_ENDPOINT bir adres değil';
  }
  if (!/^https:\/\/[^/]+/.test(env.S3_PUBLIC_URL)) notes.push('S3_PUBLIC_URL https:// ile başlamıyor');
  const key = `check/${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.txt`;
  const body = 'similar storage check';
  const headers = { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(body)) };
  const signal = () => AbortSignal.timeout(10_000);
  const codeOf = async (res) => `${res.status}${/<Code>([^<]{1,60})<\/Code>/.exec(await res.text().catch(() => ''))?.[1]?.replace(/^/, ' ') ?? ''}`;
  const failed = (step, e) => `${step} bağlanamadı (${e?.cause?.code ?? e?.name ?? 'hata'})`;
  const out = [];
  let put;
  try {
    const url = presign({ method: 'PUT', url: `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${key}`, region: env.S3_REGION ?? 'auto', accessKey: env.S3_KEY, secretKey: env.S3_SECRET, expires: 60, headers });
    put = await fetch(url, { method: 'PUT', headers, body, signal: signal() });
    out.push(`yükleme ${await codeOf(put)}`);
  } catch (e) {
    out.push(failed('yükleme', e));
  }
  if (put?.ok) {
    try {
      out.push(`açık adres ${(await fetch(`${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`, { signal: signal() })).status}`);
    } catch (e) {
      out.push(failed('açık adres', e));
    }
    try {
      out.push(`silme ${await codeOf(await fetch(signed('DELETE', key), { method: 'DELETE', signal: signal() }))}`);
    } catch (e) {
      out.push(failed('silme', e));
    }
  }
  return [...out, ...notes].join(', ');
}

export const mediaRoutes = {
  async 'POST /api/media/upload-url'(req) {
    const u = await auth(req);
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_KEY || !env.S3_SECRET || !env.S3_PUBLIC_URL) throw new HttpError(503, 'Fotoğraf yükleme henüz açık değil');
    limit(`media:${u.id}`, 20, 'Çok fazla yükleme, biraz bekle');
    const { kind, contentType, size } = await readJson(req);
    const k = typeof kind === 'string' && Object.hasOwn(KINDS, kind) ? KINDS[kind] : null;
    if (!k) throw new HttpError(400, 'Geçersiz yükleme türü');
    if (k.admin && u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    if (k.may && !(await k.may(u.id))) throw new HttpError(403, k.refused);
    if (!k.types.includes(contentType)) throw new HttpError(400, 'Bu dosya türü yüklenemez');
    if (!Number.isSafeInteger(size) || size < 1 || size > k.max) throw new HttpError(400, `Dosya en fazla ${k.max / 1024 / 1024} MB olabilir`);
    // Not guessable, and grouped by person so an account's files can be found (and removed) together.
    const key = `${kind}/${u.id}/${Date.now().toString(36)}-${crypto.randomBytes(9).toString('base64url')}.${TYPES[contentType] ?? AUDIO[contentType]}`;
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
