// Photo and video uploads go straight from the phone to S3-compatible storage (Cloudflare R2, Backblaze B2,
// AWS S3…); the API only hands out a short-lived signed address, so big files never pass through it.
//
//   POST /api/media/upload-url { kind: 'avatar' | 'moment' | 'dm' | 'album' | 'notice' | 'music' | 'ticket' | 'roombg' | 'roomcover' | 'eventcover', contentType, size } → { uploadUrl, headers, publicUrl, expiresIn }
//
// The app PUTs the file to uploadUrl with exactly `headers` (type and size are signed, so a different file
// is refused by the storage), then saves publicUrl (e.g. PATCH /api/me { avatarUrl }).
// Settings in the server's .env: S3_ENDPOINT (https://<account>.r2.cloudflarestorage.com), S3_BUCKET,
// S3_REGION (R2: auto), S3_KEY, S3_SECRET, S3_PUBLIC_URL (the bucket's public https address or CDN domain).
//
//   GET /api/media/f/<key>   → the stored file itself (sendFile; no sign-in, as the storage's public address)
//
// Phones open a stored file here, not at the storage's public address: that host (r2.dev) can't be reached from
// some networks. S3_PUBLIC_URL/<key> stays the address kept in the database; what phones see and send is mapped
// in one place (core.mjs filesOut, filesIn).
//
// Files no longer used are deleted (removeFiles, removeUserFiles): an avatar replaced, a moment its author
// deletes, an album photo removed (profiles.mjs; the album's files are the rows of profile_photos, so anything that
// clears unused files must count those as used), a track taken out of a library, a removed notice, a room picture
// replaced, removed or past its term (room-decor.mjs), and every file of a deleted account (UK GDPR erasure). A moment staff take down keeps its photo, as the evidence an appeal is decided on.
// Without them uploads answer 503. 'notice' (a Similar Ekibi notice's picture, team.mjs) is for admins only;
// 'music' (a track for the room music, music.mjs) for people who have a room or run or play in one. 'ticket' (a
// support ticket's evidence photo, support.mjs) is never deleted while its ticket holds it, whatever asks.
// 'roombg' (an owner's own picture behind their room's stage) and 'roomcover' (a room's card picture), both
// room-decor.mjs, are for people who have an open room (a cover also for its Süper Yönetici); each stays while the
// room or its owner's decoration holds it.
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { FILE_PATH, HttpError, auth, db, env, limit, readJson, servedFiles } from './core.mjs';

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
  // A profile album photo (profiles.mjs, at most ALBUM_MAX each), shrunk on the phone like a moment's.
  album: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], max: 8 * 1024 * 1024 },
  notice: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 5 * 1024 * 1024, admin: true },
  // Evidence on a support ticket (support.mjs): a screenshot, a receipt.
  ticket: { types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], max: 8 * 1024 * 1024 },
  music: { types: Object.keys(AUDIO), max: 20 * 1024 * 1024, may: mayKeepMusic, refused: 'Müzik kütüphanesi oda sahibi, yönetici ve DJ’ler için' },
  // Room pictures (room-decor.mjs), cut to size on the phone first: the owner's own background (1080 × 1920) and the
  // room's card picture (800 × 800).
  roombg: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 4 * 1024 * 1024, may: hasOpenRoom, refused: 'Özel süsleme açık bir odası olan oda sahipleri için' },
  roomcover: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 2 * 1024 * 1024, may: mayChangeCover, refused: 'Oda kapağını oda sahibi veya Süper Yönetici değiştirebilir' },
  // An event's cover (events.mjs), cut to 1280 × 720 on the phone: for owners of an open room, who apply for events.
  eventcover: { types: ['image/jpeg', 'image/png', 'image/webp'], max: 2 * 1024 * 1024, may: hasOpenRoom, refused: 'Etkinlik kapağını açık bir odası olan oda sahibi yükler' },
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

/** Whether `uid` has an open room of their own (an owner's own background, room-decor.mjs). */
async function hasOpenRoom(uid) {
  return (await db.query('SELECT 1 FROM rooms WHERE owner = $1 AND closed_at IS NULL', [uid])).rowCount > 0;
}
/** Whether `uid` may change some open room's cover: its owner or a Süper Yönetici of it (room-decor.mjs). */
async function mayChangeCover(uid) {
  if (await hasOpenRoom(uid)) return true;
  return (await db.query('SELECT 1 FROM room_admins a JOIN rooms r ON r.id = a.room_id WHERE a.user_id = $1 AND a.super AND r.closed_at IS NULL LIMIT 1', [uid])).rowCount > 0;
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
/**
 * The storage's API address: S3_ENDPOINT without a trailing slash, and without the bucket's name when it was left
 * at the end (Cloudflare's "S3 API" line shows it there). Kept, it would put every file one folder too deep, where
 * the public address can't find it.
 */
export function endpointOf(e = env) {
  const base = String(e.S3_ENDPOINT ?? '').trim().replace(/\/+$/, '');
  const bucket = String(e.S3_BUCKET ?? '').trim();
  return bucket && base.endsWith(`/${bucket}`) ? base.slice(0, -(bucket.length + 1)) : base;
}
/** A signed request to the bucket: `key` '' is the bucket itself (listing). */
const signed = (method, key, query = {}) =>
  presign({
    method,
    url: `${endpointOf()}/${env.S3_BUCKET}${key ? `/${key}` : ''}`,
    region: env.S3_REGION ?? 'auto',
    accessKey: env.S3_KEY,
    secretKey: env.S3_SECRET,
    expires: 60,
    query,
  });
const FILE_KEY = /^(avatar|moment|dm|album|notice|music|ticket|roombg|roomcover|eventcover)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/;

/** The storage key of one of our files from its public address (kind/<uploader>/<name>), else null. With
 *  `owner`, only a file that person uploaded. */
export function keyOf(url, owner) {
  const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
  if (!base || typeof url !== 'string' || !url.startsWith(`${base}/`)) return null;
  const key = url.slice(base.length + 1);
  if (!FILE_KEY.test(key)) return null;
  return owner && key.split('/')[1] !== owner ? null : key;
}

/** What a stored file is sent as: by its ending (which the upload route chose), never by what its uploader said. */
const SENT_AS = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', mp4: 'video/mp4', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' };

/** Passes on exactly `n` bytes; more or fewer is an error, so an answer never holds other bytes than it announced. */
const exactly = (n) => {
  let left = n;
  return new Transform({
    transform(chunk, _enc, done) {
      left -= chunk.length;
      done(left < 0 ? new Error('longer than announced') : null, chunk);
    },
    flush(done) {
      done(left > 0 ? new Error('shorter than announced') : null);
    },
  });
};

/**
 * A stored file sent from here (GET or HEAD /api/media/f/<key>): read from the storage with a signed request and
 * passed on as it comes, so a big track never sits in memory. A `Range` goes through (the music player asks for
 * parts). A file never changes under its key, so phones may keep it for good. It goes out as the type of its
 * ending and as nothing a browser would run: the files are people's uploads, and this is the API's own address.
 * No sign-in, as at the storage's public address: a key can't be guessed (so it is never written to a log).
 */
export async function sendFile(req, res, key) {
  const plain = (code, text) => void res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end(text);
  if (!storageOn() || !FILE_KEY.test(key)) return plain(404, 'Bulunamadı');
  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  const headers = {};
  if (typeof req.headers.range === 'string' && /^bytes=\d*-\d*$/.test(req.headers.range)) headers.range = req.headers.range;
  // The phone going away stops the read; a storage that doesn't answer in 15 s is given up on.
  const stop = new AbortController();
  res.on('close', () => stop.abort());
  const slow = setTimeout(() => stop.abort(), 15_000);
  let up;
  try {
    up = await fetch(signed(method, key), { method, headers, redirect: 'manual', signal: stop.signal });
  } catch (e) {
    if (res.destroyed) return;
    console.error('file read failed', e?.cause?.code ?? e?.name);
    return plain(502, 'Dosya şu an açılamıyor');
  } finally {
    clearTimeout(slow);
  }
  if (up.status !== 200 && up.status !== 206 && up.status !== 416) {
    await up.body?.cancel().catch(() => {});
    if (up.status === 404) return plain(404, 'Bulunamadı');
    console.error('file read', up.status);
    return plain(502, 'Dosya şu an açılamıyor');
  }
  const out = {
    'Content-Type': SENT_AS[key.split('.').pop()] ?? 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'cross-origin',
  };
  // A file stored with an encoding (its uploader may have named one) is read decoded here, so its stored length
  // isn't the length that goes out: such a file goes out without one.
  const length = up.headers.get('content-encoding') ? null : up.headers.get('content-length');
  if (length !== null) out['content-length'] = length;
  for (const h of ['content-range', 'etag', 'last-modified']) {
    const v = up.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(up.status, out);
  if (method === 'HEAD' || !up.body) return void res.end();
  // The phone leaving mid-file or the storage cutting off ends the answer where it is, connection and all.
  const body = Readable.fromWeb(up.body);
  try {
    await (length === null ? pipeline(body, res) : pipeline(body, exactly(Number(length)), res));
  } catch {
    res.destroy();
  }
}

async function deleteKeys(keys) {
  for (const key of keys) {
    // A file a moderation decision points at stays: an appeal is decided on it.
    if ((await db.query('SELECT 1 FROM moderation_evidence WHERE position($1 in content) > 0 LIMIT 1', [key])).rowCount) continue;
    // A ticket's evidence stays while the ticket does (support.mjs deletes the ticket first when it goes).
    if (key.startsWith('ticket/') && (await db.query('SELECT 1 FROM support_tickets t WHERE EXISTS (SELECT 1 FROM unnest(t.photos) p WHERE position($1 in p) > 0) LIMIT 1', [key])).rowCount) continue;
    // An album photo stays while the album holds it (profiles.mjs removes the row first), even if it was also the avatar.
    if (key.startsWith('album/') && (await db.query('SELECT 1 FROM profile_photos WHERE position($1 in url) > 0 LIMIT 1', [key])).rowCount) continue;
    // A room's own background and its card picture stay while they are in use (room-decor.mjs clears the row first).
    if (key.startsWith('roombg/') && (await db.query('SELECT 1 FROM room_decor WHERE position($1 in custom_url) > 0 LIMIT 1', [key])).rowCount) continue;
    if (key.startsWith('roomcover/') && (await db.query('SELECT 1 FROM rooms WHERE position($1 in cover_url) > 0 LIMIT 1', [key])).rowCount) continue;
    const res = await fetch(signed('DELETE', key), { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
    // 404: already gone, which is what was wanted.
    if (!res.ok && res.status !== 404) console.error('storage delete', res.status);
  }
}

/**
 * An uploaded file checked where it is used (an avatar set, a moment posted, a chat photo sent, a notice, a track):
 * it must be in the storage, no bigger than its kind allows and of an allowed type (or none the phone could name).
 * The upload address binds the size but not the type (see the upload route), so this is where the type is held
 * (and the size again): a file outside them is deleted and refused. A storage that can't be reached lets it through (the person isn't blocked by our outage).
 * UPLOAD_VERIFY=0 turns it off (tests whose storage is a stand-in address).
 */
export async function verifyUpload(url, kind) {
  const key = keyOf(url);
  const k = KINDS[kind];
  if (!key || !k || !storageOn() || env.UPLOAD_VERIFY === '0') return;
  let res;
  try {
    res = await fetch(signed('HEAD', key), { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
  } catch (e) {
    console.error('upload check failed', e?.cause?.code ?? e?.name);
    return;
  }
  if (res.status === 404) throw new HttpError(400, 'Dosya yüklenmemiş, tekrar dene');
  if (!res.ok) {
    console.error('upload check', res.status);
    return;
  }
  const size = Number(res.headers.get('content-length') ?? 0);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const typeOk = !type || type === 'application/octet-stream' || k.types.includes(type);
  if (size <= k.max && typeOk) return;
  later('storage delete failed', () => deleteKeys([key]));
  throw new HttpError(400, typeOk ? `Dosya en fazla ${k.max / 1024 / 1024} MB olabilir` : 'Bu dosya türü yüklenemez');
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

/** Deletes every file a deleted account uploaded (its avatars, moment, chat and album photos, music, ticket
 *  evidence, room pictures). A notice's picture stays: it is the company's, whoever put it up. */
export function removeUserFiles(uid) {
  if (!storageOn() || !/^[0-9a-f-]{36}$/.test(String(uid))) return;
  later('storage erase failed', async () => {
    for (const kind of ['avatar', 'moment', 'dm', 'album', 'music', 'ticket', 'roombg', 'roomcover', 'eventcover']) await deleteKeys(await listKeys(`${kind}/${uid}/`));
  });
}

/** What looks wrong in the storage settings `e`, by shape only (length and form, never a value). */
export function storageNotes(e = env) {
  const notes = [];
  let host;
  try {
    const u = new URL(endpointOf(e));
    host = u.hostname;
    if (u.pathname.replace(/\/$/, '') !== '') notes.push('S3_ENDPOINT sonunda fazladan yol var (yalnızca https://….r2.cloudflarestorage.com olmalı)');
  } catch {
    return ['S3_ENDPOINT bir adres değil'];
  }
  if (!/^https:\/\/[^/]+/.test(e.S3_PUBLIC_URL)) notes.push('S3_PUBLIC_URL https:// ile başlamıyor');
  if (/r2\.cloudflarestorage/.test(e.S3_PUBLIC_URL)) notes.push('S3_PUBLIC_URL depo adresi olmuş: açık adres (https://pub-….r2.dev) olmalı');
  // The shapes Cloudflare's R2 token page gives.
  const r2 = /\.r2\.dev$/.test(host) || /\.r2\.cloudflarestorage\.com$/.test(host) || /r2\.dev|cloudflare/.test(e.S3_PUBLIC_URL);
  if (/\.r2\.dev$/.test(host)) notes.push('S3_ENDPOINT açık adres (r2.dev) olmuş: ….r2.cloudflarestorage.com olmalı');
  else if (r2 && !/\.r2\.cloudflarestorage\.com$/.test(host)) notes.push('S3_ENDPOINT bir R2 adresi değil: ….r2.cloudflarestorage.com olmalı');
  if (r2 && !/^[0-9a-f]{32}$/.test(e.S3_KEY)) notes.push(`S3_KEY bir Access Key ID'ye benzemiyor (32 karakter olmalı, ${e.S3_KEY.length})`);
  if (r2 && !/^[0-9a-f]{64}$/.test(e.S3_SECRET)) notes.push(`S3_SECRET bir Secret Access Key'e benzemiyor (64 karakter olmalı, ${e.S3_SECRET.length})`);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(e.S3_BUCKET)) notes.push('S3_BUCKET bir kova adı değil (küçük harf, rakam ve - olmalı)');
  return notes;
}

/**
 * The storage settings checked end to end (run after a deploy, server.yml): a small file put exactly the way the
 * phone puts a photo, read back through the storage's public address and through this server (the way phones open
 * it: "uygulama adresi", when this server's address is known), then deleted. The answer holds only status codes,
 * the storage's error code (SignatureDoesNotMatch, NoSuchBucket…) and storageNotes, never a setting's value, so it
 * can go in a log.
 */
export async function storageCheck() {
  const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_KEY', 'S3_SECRET', 'S3_PUBLIC_URL'].filter((k) => !env[k]);
  if (missing.length) return `kapalı: ${missing.join(', ')} yok`;
  const notes = storageNotes();
  if (notes[0] === 'S3_ENDPOINT bir adres değil') return notes[0];
  // A key shaped like a real one (under a person who can't exist), so the phones' way to it can be tried too.
  const key = `notice/00000000-0000-0000-0000-000000000000/depo-denetimi-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.txt`;
  const body = 'similar storage check';
  const headers = { 'content-type': 'text/plain' };
  const signal = () => AbortSignal.timeout(10_000);
  const codeOf = async (res) => `${res.status}${/<Code>([^<]{1,60})<\/Code>/.exec(await res.text().catch(() => ''))?.[1]?.replace(/^/, ' ') ?? ''}`;
  const failed = (step, e) => `${step} bağlanamadı (${e?.cause?.code ?? e?.name ?? 'hata'})`;
  const out = [];
  let put;
  try {
    const url = presign({ method: 'PUT', url: `${endpointOf()}/${env.S3_BUCKET}/${key}`, region: env.S3_REGION ?? 'auto', accessKey: env.S3_KEY, secretKey: env.S3_SECRET, expires: 60, headers: { 'content-length': String(Buffer.byteLength(body)) } });
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
    // The way phones open it: through this server (the running API on this machine), and the same bytes back.
    if (servedFiles()) {
      try {
        const got = await fetch(`http://127.0.0.1:${Number(env.API_PORT ?? 7890)}${FILE_PATH}${key}`, { signal: signal() });
        const same = got.ok && (await got.text()) === body;
        out.push(`uygulama adresi ${got.status}${got.ok && !same ? ' (içerik farklı)' : ''}`);
      } catch (e) {
        out.push(failed('uygulama adresi', e));
      }
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
    // The address and the size are signed, the type isn't: Expo's fetch on the phone sends a file with the
    // file's own type, which is empty for a file read from the phone, and the storage refused that against a
    // signed type (403). The type is checked where the file is used (verifyUpload). It still goes back for the
    // phone to send, as the storage keeps it with the file.
    const headers = { 'content-type': contentType };
    const uploadUrl = presign({
      method: 'PUT',
      url: `${endpointOf()}/${env.S3_BUCKET}/${key}`,
      region: env.S3_REGION ?? 'auto',
      accessKey: env.S3_KEY,
      secretKey: env.S3_SECRET,
      expires: EXPIRES,
      headers: { 'content-length': String(size) },
    });
    return { uploadUrl, method: 'PUT', headers, publicUrl: `${env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`, expiresIn: EXPIRES };
  },
};
