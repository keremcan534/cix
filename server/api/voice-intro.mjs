// Ses tanıtımı (owners, 24 Nov 2026: "profile ses kaydı ekleyebildiğimiz bir alan, biri profiline baktı sesini
// dinleyebiliyordu"): a voice clip of up to 15 seconds on someone's profile. Anyone who may see their profile plays it
// (GET /api/user `user.voice`, profiles.mjs profileMore; a private profile keeps it from people it doesn't follow, as
// its album). The phone records an AAC .m4a (expo-audio) and uploads it as kind 'voice' (media.mjs); the server reads
// the file back and keeps it only if it is an MP4 sound file of 1–15 seconds, its length read from the file itself.
//
//   POST /api/me/voice { url }                    → { voice: { url, ms } }   (replaces the one before; its file goes)
//   POST /api/me/voice/remove                     → { voice: null }
//   GET  /api/admin/voice?user=                   → { user, voice }          (admin, panel)
//   POST /api/admin/voice/clear { user, reason }  → { cleared }              (admin, panel: an offensive clip; audited)
//
// An older app neither reads `voice` nor records one: nothing changes for it. A deleted account's clip goes with its
// files (social.mjs eraseAccount, media.mjs removeUserFiles); the data copy lists it (my-data.mjs).
import { HttpError, auth, clientIp, db, env, limit, readJson, tx, userId } from './core.mjs';
import { mp4Duration } from './fx.mjs';
import { keyOf, readStored, removeFiles, storageOn, verifyUpload } from './media.mjs';
import { panelDetail } from './panel.mjs';

/** A clip's shortest and longest length, a little slack over the longest (a recorder stops a frame late), its size. */
export const VOICE_LIMITS = Object.freeze({ minMs: 1000, maxMs: 15_000, slackMs: 600, bytes: 1024 * 1024 });

/** The clip a users row shows: { url, ms }, or null for none. */
export const voiceView = (u) => (u?.voice_url ? { url: u.voice_url, ms: Number(u.voice_ms) || 0 } : null);

/** The handler types of an MP4's tracks (moov › trak › mdia › hdlr: 'soun', 'vide', …), read by their boxes' names. */
function handlers(buf) {
  const out = [];
  for (let i = buf.indexOf('hdlr', 4, 'latin1'); i !== -1 && i + 16 <= buf.length; i = buf.indexOf('hdlr', i + 4, 'latin1')) out.push(buf.toString('latin1', i + 12, i + 16));
  return out;
}

/**
 * Whether `buf` is a voice clip: an MP4 file (its first box "ftyp") with a sound track and no picture track, and its
 * length in ms from its own header. `why` names what is wrong, in the words the person reads.
 */
export function voiceCheck(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16 || buf.toString('latin1', 4, 8) !== 'ftyp') return { ok: false, ms: 0, why: 'Ses kaydı okunamadı, yeniden kaydet' };
  const tracks = handlers(buf);
  if (!tracks.includes('soun') || tracks.includes('vide')) return { ok: false, ms: 0, why: 'Bu dosya bir ses kaydı değil, yeniden kaydet' };
  const ms = mp4Duration(buf);
  if (!ms) return { ok: false, ms: 0, why: 'Ses kaydı okunamadı, yeniden kaydet' };
  if (ms < VOICE_LIMITS.minMs) return { ok: false, ms, why: 'Ses kaydı en az 1 saniye olmalı' };
  if (ms > VOICE_LIMITS.maxMs + VOICE_LIMITS.slackMs) return { ok: false, ms, why: 'Ses kaydı en çok 15 saniye olabilir' };
  return { ok: true, ms: Math.min(ms, VOICE_LIMITS.maxMs), why: null };
}

/** Puts `uid`'s clip to `url` (null: none) in transaction `c`; answers the address it had before. */
async function setVoice(c, uid, url, ms) {
  const cur = (await c.query('SELECT voice_url, voice_ms, voice_at FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [uid])).rows[0];
  if (!cur) throw new HttpError(404, 'Kullanıcı bulunamadı');
  await c.query('UPDATE users SET voice_url = $2, voice_ms = $3, voice_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1', [uid, url, url ? ms : null]);
  return cur;
}

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

export const voiceIntroRoutes = {
  /** Saves my clip (uploaded as kind 'voice' under my folder), read and checked here; the one before leaves the storage. */
  async 'POST /api/me/voice'(req) {
    const u = await auth(req);
    limit(`voice:${u.id}`, 20, 'Çok sık kaydediyorsun, biraz bekle');
    const b = await readJson(req, 2048);
    if (!storageOn()) throw new HttpError(503, 'Ses kaydı yükleme şu an açık değil');
    const base = (env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
    const mine = `${base}/voice/${u.id}/`;
    if (typeof b.url !== 'string' || b.url.length > 500 || !b.url.startsWith(mine) || !/^[A-Za-z0-9._-]+\.m4a$/.test(b.url.slice(mine.length))) throw new HttpError(400, 'Geçersiz ses kaydı');
    await verifyUpload(b.url, 'voice');
    const check = voiceCheck(await readStored(keyOf(b.url, u.id), VOICE_LIMITS.bytes));
    if (!check.ok) {
      removeFiles([b.url], u.id);
      throw new HttpError(400, check.why);
    }
    const before = await tx((c) => setVoice(c, u.id, b.url, check.ms));
    if (before.voice_url && before.voice_url !== b.url) removeFiles([before.voice_url], u.id);
    return { voice: { url: b.url, ms: check.ms } };
  },

  /** Takes my clip off my profile; its file leaves the storage. */
  async 'POST /api/me/voice/remove'(req) {
    const u = await auth(req);
    limit(`voice:${u.id}`, 20, 'Çok sık kaydediyorsun, biraz bekle');
    const before = await tx((c) => setVoice(c, u.id, null, null));
    if (before.voice_url) removeFiles([before.voice_url], u.id);
    return { voice: null };
  },

  /** A person's clip as staff see it (to listen before taking it off). */
  async 'GET /api/admin/voice'(req, url) {
    await admin(req);
    const uid = userId(url.searchParams.get('user'), 'kişi');
    const u = (await db.query('SELECT id, name, voice_url, voice_ms, voice_at FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const voice = voiceView(u);
    return { user: { id: u.id, name: u.name }, voice: voice && { ...voice, at: u.voice_at } };
  },

  /**
   * Takes a person's clip off (an offensive one, a complaint): its file goes, and an audit_events row says what came
   * off (before) and that nothing shows now (after), even when there was nothing to take off.
   */
  async 'POST /api/admin/voice/clear'(req) {
    const a = await admin(req);
    const b = await readJson(req, 2048);
    const uid = userId(b.user, 'kişi');
    const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 200) : null;
    const before = await tx(async (c) => {
      const cur = await setVoice(c, uid, null, null);
      await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
        a.id,
        'voice.clear',
        uid,
        JSON.stringify({ user: uid, reason: reason || null, before: cur.voice_url ? { url: cur.voice_url, ms: cur.voice_ms, at: cur.voice_at } : null, after: null, ...panelDetail(a) }),
        clientIp(req),
      ]);
      return cur;
    });
    if (before.voice_url) removeFiles([before.voice_url], uid);
    return { cleared: !!before.voice_url };
  },
};
