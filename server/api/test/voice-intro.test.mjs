// Ses tanıtımı (voice-intro.mjs) against a real Postgres and a stand-in bucket: a clip of 1–15 seconds is saved on
// my profile after the server read it back (an MP4 with a sound track, its length from its own header), anyone who may
// see my profile gets it (a private profile keeps it from people it doesn't follow), a new one replaces the old one's
// file, I take it off, staff listen to it and take an offensive one off (audited), and a deleted account's clip goes
// with its file. Wrong files are refused with a sentence that says what to do, and their file leaves the storage.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { voiceCheck } from '../voice-intro.mjs';
import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
/** The bucket: key → { body, type }. Signed requests only. */
const stored = new Map();
const S3_PORT = 31000 + (process.pid % 900);
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
};
const profile = async (who, of) => (await ok(call('GET', `/api/user?id=${of.user.id}`, null, who.session), 'profil')).user;
const settle = async (gone) => {
  for (let i = 0; i < 60 && gone.some((k) => stored.has(k)); i++) await new Promise((r) => setTimeout(r, 50));
};

// --- A clip as a phone's recorder writes it: ftyp, the sound itself (mdat), then moov › mvhd (length) and a track. ---
const box = (type, ...parts) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};
const mvhd = (ms) => {
  const b = Buffer.alloc(100);
  b.writeUInt32BE(1000, 12);
  b.writeUInt32BE(ms, 16);
  return box('mvhd', b);
};
const hdlr = (kind) => {
  const b = Buffer.alloc(24);
  b.write(kind, 8, 'latin1');
  return box('hdlr', b);
};
const m4a = ({ ms = 5000, tracks = ['soun'], ftyp = true } = {}) =>
  Buffer.concat([
    ftyp ? box('ftyp', Buffer.from('M4A \0\0\0\0M4A mp42isom', 'latin1')) : box('free', Buffer.alloc(8)),
    box('mdat', Buffer.alloc(400)),
    box('moov', mvhd(ms), ...tracks.map((t) => box('trak', box('mdia', hdlr(t))))),
  ]);
/** A clip put in `owner`'s voice folder (or `folder`), and its public address. */
const clip = (owner, body = m4a(), { folder = 'voice', ext = 'm4a', type = 'audio/mp4', size } = {}) => {
  const key = `${folder}/${owner.user.id}/${rnd(8)}.${ext}`;
  stored.set(key, { body, type, size });
  return { key, url: `${CDN}/${key}` };
};
const save = (who, url) => call('POST', '/api/me/voice', { url }, who.session);

describe('Ses tanıtımı', () => {
  test('kontrol: MP4 ses dosyası, ses izi var, görüntü izi yok, 1–15 saniye', () => {
    assert.deepEqual(voiceCheck(m4a({ ms: 4200 })), { ok: true, ms: 4200, why: null });
    assert.equal(voiceCheck(m4a({ ms: 15_400 })).ms, 15_000, 'kaydedicinin birkaç kare fazlası 15 sn sayılır');
    assert.match(voiceCheck(m4a({ ftyp: false })).why, /okunamadı/);
    assert.match(voiceCheck(m4a({ tracks: ['soun', 'vide'] })).why, /ses kaydı değil/);
    assert.match(voiceCheck(m4a({ tracks: [] })).why, /ses kaydı değil/);
    assert.match(voiceCheck(m4a({ ms: 600 })).why, /en az 1 saniye/);
    assert.match(voiceCheck(m4a({ ms: 16_000 })).why, /en çok 15 saniye/);
    assert.match(voiceCheck(Buffer.from('ID3 bir mp3 dosyası')).why, /okunamadı/);
    assert.equal(voiceCheck(null).ok, false);
  });

  test('kaydedilir, profile bakan herkes alır; yenisi eskisinin dosyasını siler; kendisi kaldırır', async () => {
    const a = await signUp('Sesli Profil');
    const b = await signUp('Dinleyen');
    assert.equal((await profile(b, a)).voice, null, 'kayıt yokken null');
    const first = clip(a, m4a({ ms: 5200 }));
    assert.deepEqual((await ok(save(a, first.url), 'kaydet')).voice, { url: first.url, ms: 5200 });
    assert.deepEqual((await profile(b, a)).voice, { url: first.url, ms: 5200 }, 'başkası görür');
    assert.deepEqual((await profile(a, a)).voice, { url: first.url, ms: 5200 }, 'kendisi görür');
    // The person card (card=1) gets it too: a field from the same row.
    assert.deepEqual((await ok(call('GET', `/api/user?id=${a.user.id}&card=1`, null, b.session), 'kart')).user.voice, { url: first.url, ms: 5200 });

    const second = clip(a, m4a({ ms: 9000 }));
    assert.equal((await ok(save(a, second.url), 'yenisi')).voice.ms, 9000);
    await settle([first.key]);
    assert.equal(stored.has(first.key), false, 'eskisinin dosyası gitti');
    assert.equal(stored.has(second.key), true);
    // The same one again changes nothing and keeps its file.
    await ok(save(a, second.url), 'aynısı');
    assert.equal(stored.has(second.key), true);

    assert.deepEqual(await ok(call('POST', '/api/me/voice/remove', {}, a.session), 'kaldır'), { voice: null });
    await settle([second.key]);
    assert.equal(stored.has(second.key), false, 'kaldırılanın dosyası gitti');
    assert.equal((await profile(b, a)).voice, null);
    const row = (await q('SELECT voice_url, voice_ms, voice_at FROM users WHERE id = $1', [a.user.id])).rows[0];
    assert.deepEqual(row, { voice_url: null, voice_ms: null, voice_at: null });
    // Nothing to take off: still fine.
    await ok(call('POST', '/api/me/voice/remove', {}, a.session), 'boşken kaldır');
  });

  test('yanlış kayıtlar reddedilir; sunucunun okuduğu yanlış dosya depodan silinir', async () => {
    const a = await signUp('Yanlış Kayıt');
    const b = await signUp('Başka Kişi');
    const noise = clip(a, m4a({ ftyp: false }));
    await refused(save(a, noise.url), 400, /okunamadı, yeniden kaydet/, 'MP4 değil');
    const video = clip(a, m4a({ tracks: ['vide', 'soun'] }));
    await refused(save(a, video.url), 400, /ses kaydı değil/, 'görüntülü');
    const short = clip(a, m4a({ ms: 400 }));
    await refused(save(a, short.url), 400, /en az 1 saniye/, 'kısa');
    const long = clip(a, m4a({ ms: 20_000 }));
    await refused(save(a, long.url), 400, /en çok 15 saniye/, 'uzun');
    await settle([noise.key, video.key, short.key, long.key]);
    for (const f of [noise, video, short, long]) assert.equal(stored.has(f.key), false, `reddedilen silindi: ${f.key}`);

    await refused(save(a, clip(b).url), 400, /Geçersiz ses kaydı/, 'başkasının klasörü');
    await refused(save(a, clip(a, m4a(), { folder: 'album' }).url), 400, /Geçersiz ses kaydı/, 'başka tür klasör');
    await refused(save(a, clip(a, m4a(), { ext: 'mp3' }).url), 400, /Geçersiz ses kaydı/, 'm4a değil');
    await refused(save(a, `${CDN}/voice/${a.user.id}/yok.m4a`), 400, /yüklenmemiş/, 'yüklenmemiş');
    await refused(save(a, clip(a, m4a(), { size: 3 * 1024 * 1024 }).url), 400, /en fazla 1 MB/, 'büyük');
    await refused(save(a, clip(a, m4a(), { type: 'image/jpeg' }).url), 400, /türü yüklenemez/, 'resim türü');
    await refused(save(a, 'https://evil.example.com/voice/x.m4a'), 400, /Geçersiz/, 'başka adres');
    await refused(save(a, 42), 400, /Geçersiz/, 'adres yok');
    assert.equal((await profile(a, a)).voice, null, 'hiçbiri kaydedilmedi');
    // The upload address hands out a 'voice' kind only for its sound types.
    await refused(call('POST', '/api/media/upload-url', { kind: 'voice', contentType: 'audio/mpeg', size: 1000 }, a.session), 400, /türü/, 'mp3 yükleme adresi');
    const up = await ok(call('POST', '/api/media/upload-url', { kind: 'voice', contentType: 'audio/mp4', size: 200_000 }, a.session), 'yükleme adresi');
    assert.match(up.publicUrl, new RegExp(`^${CDN}/voice/${a.user.id}/[A-Za-z0-9._-]+\\.m4a$`));
  });

  test('gizli profil takip etmediği kişiye ses kaydını göstermez; engelleyen kişi profili hiç göstermez', async () => {
    const a = await signUp('Gizli Ses');
    const b = await signUp('Takipsiz Dinleyen');
    const c = await signUp('Engellenen Dinleyen');
    const f = clip(a);
    await ok(save(a, f.url), 'kaydet');
    await ok(call('PATCH', '/api/me/privacy', { profilePublic: false }, a.session), 'gizlilik');
    assert.equal((await profile(b, a)).voice, null, 'gizli profil');
    assert.equal((await profile(a, a)).voice.url, f.url, 'kendisi görür');
    await ok(call('POST', '/api/follow', { to: b.user.id }, a.session), 'takip');
    assert.equal((await profile(b, a)).voice.url, f.url, 'takip ettiği kişi görür');
    await ok(call('POST', '/api/block', { to: c.user.id, block: true }, a.session), 'engel');
    const [st] = await call('GET', `/api/user?id=${a.user.id}`, null, c.session);
    assert.equal(st, 404, 'engelleyen kişinin profili yok');
  });

  test('yönetici dinler ve kaldırır, denetime yazılır; üye yapamaz', async () => {
    const admin = await signUp('Ses Yöneticisi');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    const a = await signUp('Şikâyet Edilen Ses');
    const member = await signUp('Sıradan Üye');
    const f = clip(a, m4a({ ms: 7000 }));
    await ok(save(a, f.url), 'kaydet');

    await refused(call('GET', `/api/admin/voice?user=${a.user.id}`, null, member.session), 403, /Yönetici/, 'üye dinleyemez');
    await refused(call('POST', '/api/admin/voice/clear', { user: a.user.id }, member.session), 403, /Yönetici/, 'üye kaldıramaz');
    const seen = await ok(call('GET', `/api/admin/voice?user=${a.user.id}`, null, admin.session), 'dinle');
    assert.deepEqual([seen.user.id, seen.voice.url, seen.voice.ms, typeof seen.voice.at], [a.user.id, f.url, 7000, 'string']);
    await refused(call('GET', '/api/admin/voice?user=yok', null, admin.session), 400, null, 'geçersiz kişi');

    assert.deepEqual(await ok(call('POST', '/api/admin/voice/clear', { user: a.user.id, reason: 'Hakaret içeriyor' }, admin.session), 'kaldır'), { cleared: true });
    await settle([f.key]);
    assert.equal(stored.has(f.key), false, 'dosya gitti');
    assert.equal((await profile(member, a)).voice, null);
    assert.equal((await ok(call('GET', `/api/admin/voice?user=${a.user.id}`, null, admin.session), 'tekrar bak')).voice, null);
    const audit = (await q("SELECT actor, target, detail FROM audit_events WHERE action = 'voice.clear' AND target = $1 ORDER BY id", [a.user.id])).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor, admin.user.id);
    assert.deepEqual([audit[0].detail.reason, audit[0].detail.before.url, audit[0].detail.before.ms, audit[0].detail.after], ['Hakaret içeriyor', f.url, 7000, null]);
    // Nothing left to take off: answered, and still recorded.
    assert.deepEqual(await ok(call('POST', '/api/admin/voice/clear', { user: a.user.id }, admin.session), 'boşken'), { cleared: false });
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'voice.clear' AND target = $1", [a.user.id])).rows[0].n, 2);
  });

  test('veri kopyasında görünür; hesap silinince kayıt ve dosyası gider', async () => {
    const a = await signUp('Silinecek Ses');
    const f = clip(a, m4a({ ms: 3000 }));
    await ok(save(a, f.url), 'kaydet');
    const data = await ok(call('GET', '/api/me/export', null, a.session), 'veri kopyası');
    assert.deepEqual([data.profileMore.voice.url, data.profileMore.voice.ms], [f.url, 3000]);
    await ok(call('DELETE', '/api/me', null, a.session), 'hesabı sil');
    await settle([f.key]);
    assert.equal(stored.has(f.key), false, 'dosya gitti');
    const row = (await q('SELECT voice_url, voice_ms, voice_at FROM users WHERE id = $1', [a.user.id])).rows[0];
    assert.deepEqual(row, { voice_url: null, voice_ms: null, voice_at: null });
  });

  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  const NO_FFMPEG = spawnSync(ffmpeg, ['-version']).status !== 0 && 'ffmpeg yok';
  test('gerçek bir AAC kaydı (.m4a) kabul edilir, süresi dosyadan okunur', { skip: NO_FFMPEG }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
    const out = path.join(dir, 'ses.m4a');
    const r = spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'aac', '-b:a', '128k', out]);
    assert.equal(r.status, 0, String(r.stderr));
    const body = fs.readFileSync(out);
    fs.rmSync(dir, { recursive: true, force: true });
    const check = voiceCheck(body);
    assert.equal(check.ok, true, check.why);
    assert.ok(Math.abs(check.ms - 3000) < 100, `${check.ms} ms`);
    const a = await signUp('Gerçek Ses');
    const f = clip(a, body);
    assert.ok(Math.abs((await ok(save(a, f.url), 'kaydet')).voice.ms - 3000) < 100);
  });
});
