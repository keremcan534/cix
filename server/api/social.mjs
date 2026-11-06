// Profiles, follows, blocks, reports and account deletion.
//
//   PATCH  /api/me      { name?, username?, gender?, birthDate?, city?, bio?, interests?, avatarUrl? } → { user }
//   DELETE /api/me                                        → { deleted: true }
//   GET    /api/user?id=                                  → { user }  (public profile + counts + relation)
//   POST   /api/follow  { to, follow }                    → { following }
//   GET    /api/following                                 → { users }
//   POST   /api/block   { to, block }                     → { blocked }
//   GET    /api/blocks                                    → { users }
//   POST   /api/report  { type, id, reason, note? }       → { reported: true, updated }
//   POST   /api/contact/refusals { category, place }      → { counted: true, strikesLeft?, muted?, until? }  (a refusal the app made on its own)
import { HttpError, ageOf, allow, assertClean, auth, blockedBetween, countRefusal, db, profileOf, publicText, readJson, selfUser, text, tx, userId } from './core.mjs';
import { CATEGORIES } from './contact-filter.mjs';
import { withSignIn } from './auth.mjs';
import { notify } from './push.mjs';
import { autoFromReports } from './sanctions.mjs';

/** The interests the app offers (app/src/data/mock.ts INTERESTS). */
export const INTERESTS = ['🎤 Karaoke', '🎮 Oyun', '💬 Sohbet', '⚽ Spor', '✈️ Seyahat', '🎬 Film', '💃 Dans', '📚 Kitap', '🎧 Müzik', '☕ Kahve'];
const REPORT_TYPES = ['user', 'room', 'message', 'moment'];
const MIN_AGE = 18;
/**
 * Where the app refuses contact details on its own, named like the server's places ('room.chat', 'moment.post',
 * 'tayfa.announcement', 'dm.sequence' …).
 */
const APP_PLACE = /^(?:dm|profile|room|moment|tayfa|agency)(?:\.[a-z_]{2,20}){0,2}$/;

/** A public profile row for lists. */
const card = (u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null });

async function liveUser(id) {
  const r = await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
  return r.rows[0];
}

export const socialRoutes = {
  async 'PATCH /api/me'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const set = {};
    // What other people read is checked for contact details (contact-filter.mjs); `set` is written only once
    // every field passes, so a refusal changes nothing.
    if (b.name !== undefined) set.name = await publicText(b.name, 1, 40, 'Ad', u, 'profile.name', 'name');
    if (b.username !== undefined) {
      const name = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_.]{3,20}$/.test(name)) throw new HttpError(400, 'Kullanıcı adı 3–20 karakter; harf, rakam, nokta ve alt çizgi');
      // 'insta_ayse', 'ayse.05321234567': read with the dots and underscores as spaces.
      await assertClean(name.replace(/[._]+/g, ' '), u, 'profile.username', 'username');
      set.username = name;
    }
    if (b.gender !== undefined) {
      if (!['Kadın', 'Erkek'].includes(b.gender)) throw new HttpError(400, 'Geçersiz cinsiyet');
      set.gender = b.gender;
    }
    if (b.birthDate !== undefined) {
      if (typeof b.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.birthDate) || Number.isNaN(Date.parse(b.birthDate))) throw new HttpError(400, 'Doğum tarihi YYYY-AA-GG olmalı');
      const age = ageOf(b.birthDate);
      if (age < MIN_AGE) throw new HttpError(403, `Uygulamayı kullanmak için ${MIN_AGE} yaşından büyük olmalısın`);
      if (age > 100) throw new HttpError(400, 'Geçersiz doğum tarihi');
      // The birth date is set once (age gates depend on it); support can correct it.
      if (u.birth_date && new Date(u.birth_date).toISOString().slice(0, 10) !== b.birthDate) throw new HttpError(409, 'Doğum tarihi bir kez girilir; değişiklik için destekle iletişime geç');
      set.birth_date = b.birthDate;
    }
    if (b.city !== undefined) set.city = (await publicText(b.city, 0, 40, 'Şehir', u, 'profile.city', 'city')) || null;
    if (b.bio !== undefined) set.bio = await publicText(b.bio, 0, 160, 'Hakkında', u, 'profile.bio', 'bio');
    if (b.interests !== undefined) {
      if (!Array.isArray(b.interests) || b.interests.length > 5 || b.interests.some((i) => !INTERESTS.includes(i))) throw new HttpError(400, 'En fazla 5 ilgi alanı, listeden');
      set.interests = [...new Set(b.interests)];
    }
    if (b.avatarUrl !== undefined) {
      if (b.avatarUrl !== null && (typeof b.avatarUrl !== 'string' || !/^https:\/\/\S{1,490}$/.test(b.avatarUrl))) throw new HttpError(400, 'Geçersiz fotoğraf adresi');
      set.avatar_url = b.avatarUrl;
    }
    const keys = Object.keys(set);
    if (!keys.length) return { user: await withSignIn(u) };
    try {
      const r = await db.query(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [u.id, ...keys.map((k) => set[k])]);
      return { user: await withSignIn(r.rows[0]) };
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Bu kullanıcı adı alınmış');
      throw e;
    }
  },

  /**
   * Account deletion (Play and Apple require it in the app). Personal data goes: profile fields, phone number,
   * sign-in key, the linked Google account and e-mail address (with their pending codes and phone checks),
   * sessions, push tokens, follows, blocks, messages, contact-filter refusal counts, own rooms. The id, ledger,
   * gifts and purchases stay, because financial records must be kept; they no longer point to anything personal.
   * The phone number, the address, the Google account and the device are free again for a new account.
   * Never refused for a mute (UK GDPR erasure; a ban already stops auth): the sanction records and the device
   * link stay, and a general mute still running moves to a new account made on the same device
   * (sanctions.mjs carryMutes).
   */
  async 'DELETE /api/me'(req) {
    const u = await auth(req);
    await tx(async (c) => {
      await c.query(
        `UPDATE users SET name = 'Silinmiş hesap', username = NULL, gender = NULL, birth_date = NULL, city = NULL, bio = '',
           interests = '{}', avatar_url = NULL, device_key_hash = NULL, phone = NULL, deleted_at = now() WHERE id = $1`,
        [u.id],
      );
      if (u.phone) await c.query("DELETE FROM otp_codes WHERE channel = 'sms' AND target = $1", [u.phone]);
      await c.query("DELETE FROM otp_codes WHERE channel = 'email' AND target IN (SELECT subject FROM auth_identities WHERE user_id = $1 AND provider = 'email')", [u.id]);
      await c.query('DELETE FROM phone_claims WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM auth_identities WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM push_tokens WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM sessions WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM follows WHERE follower = $1 OR followee = $1', [u.id]);
      await c.query('DELETE FROM blocks WHERE blocker = $1 OR blocked = $1', [u.id]);
      await c.query('DELETE FROM messages WHERE sender = $1 OR recipient = $1', [u.id]);
      await c.query('DELETE FROM contact_refusals WHERE user_id = $1', [u.id]);
      await c.query('DELETE FROM room_admins WHERE user_id = $1', [u.id]);
      await c.query('UPDATE rooms SET closed_at = now() WHERE owner = $1 AND closed_at IS NULL', [u.id]);
    });
    return { deleted: true };
  },

  async 'GET /api/user'(req, url) {
    const me = await auth(req);
    const id = userId(url.searchParams.get('id'));
    const u = await liveUser(id);
    // Someone who blocked you doesn't exist for you; someone you blocked still opens (to unblock).
    const theyBlocked = await db.query('SELECT 1 FROM blocks WHERE blocker = $1 AND blocked = $2', [id, me.id]);
    if (theyBlocked.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const r = await db.query(
      `SELECT (SELECT count(*) FROM follows WHERE followee = $1) AS followers,
              (SELECT count(*) FROM follows WHERE follower = $1) AS following,
              EXISTS (SELECT 1 FROM follows WHERE follower = $2 AND followee = $1) AS is_following,
              EXISTS (SELECT 1 FROM blocks WHERE blocker = $2 AND blocked = $1) AS blocked_by_me`,
      [id, me.id],
    );
    const x = r.rows[0];
    return {
      user: { id: u.id, name: u.name, ...profileOf(u), followers: Number(x.followers), following: Number(x.following), isFollowing: x.is_following, blockedByMe: x.blocked_by_me },
    };
  },

  async 'POST /api/follow'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const to = userId(b.to);
    if (to === me.id) throw new HttpError(400, 'Kendini takip edemezsin');
    if (b.follow === false) {
      await db.query('DELETE FROM follows WHERE follower = $1 AND followee = $2', [me.id, to]);
      return { following: false };
    }
    await liveUser(to);
    if (await blockedBetween(me.id, to)) throw new HttpError(403, 'Bu kişiyi takip edemezsin');
    const r = await db.query('INSERT INTO follows (follower, followee) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me.id, to]);
    // Told when the follow is new; unfollowing and following again in the same minute doesn't ring twice.
    if (r.rowCount && allow(`follow-notify:${me.id}:${to}`, 1)) {
      notify([to], { title: 'Yeni takipçi', body: `${me.name} seni takip etmeye başladı`, data: { type: 'follow', from: me.id } });
    }
    return { following: true };
  },

  /** Keşfet: real people, most recently active first; blocks either way and deleted accounts are left out. */
  async 'GET /api/discover'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT u.*, a.seen
         FROM users u
         JOIN LATERAL (SELECT max(s.last_seen_at) AS seen FROM sessions s WHERE s.user_id = u.id) a ON true
        WHERE u.id <> $1 AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
        ORDER BY a.seen DESC NULLS LAST, u.created_at DESC
        LIMIT 60`,
      [me.id],
    );
    const fresh = Date.now() - 5 * 60_000;
    return { users: r.rows.map((u) => ({ id: u.id, name: u.name, ...profileOf(u), online: !!u.seen && new Date(u.seen).getTime() > fresh })) };
  },

  async 'GET /api/following'(req) {
    const me = await auth(req);
    const r = await db.query('SELECT u.* FROM follows f JOIN users u ON u.id = f.followee WHERE f.follower = $1 AND u.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 500', [me.id]);
    return { users: r.rows.map(card) };
  },

  /** Blocking also ends follows both ways; the other person is not told. */
  async 'POST /api/block'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const to = userId(b.to);
    if (to === me.id) throw new HttpError(400, 'Kendini engelleyemezsin');
    if (b.block === false) {
      await db.query('DELETE FROM blocks WHERE blocker = $1 AND blocked = $2', [me.id, to]);
      return { blocked: false };
    }
    await liveUser(to);
    await tx(async (c) => {
      await c.query('INSERT INTO blocks (blocker, blocked) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me.id, to]);
      await c.query('DELETE FROM follows WHERE (follower = $1 AND followee = $2) OR (follower = $2 AND followee = $1)', [me.id, to]);
    });
    return { blocked: true };
  },

  async 'GET /api/blocks'(req) {
    const me = await auth(req);
    const r = await db.query('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked WHERE b.blocker = $1 ORDER BY b.created_at DESC', [me.id]);
    return { users: r.rows.map(card) };
  },

  async 'POST /api/report'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (!REPORT_TYPES.includes(b.type)) throw new HttpError(400, 'Geçersiz şikâyet türü');
    if (typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.id)) throw new HttpError(400, 'Geçersiz hedef');
    const reason = text(b.reason, 1, 60, 'Sebep');
    const note = b.note === undefined ? '' : text(b.note, 0, 500, 'Not');
    // One open report per person and target (reports_open_once): reporting it again while it is open keeps the
    // newer reason (and note, if one is given) instead of dropping it. updated: it was such a repeat.
    const r = await db.query(
      `INSERT INTO reports (reporter, target_type, target_id, reason, note) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (reporter, target_type, target_id) WHERE status = 'open'
       DO UPDATE SET reason = EXCLUDED.reason, note = CASE WHEN EXCLUDED.note <> '' THEN EXCLUDED.note ELSE reports.note END, created_at = now()
       RETURNING (xmax::text <> '0') AS updated`,
      [me.id, b.type, b.id, reason, note],
    );
    // Many people reporting one account: the category's policy step (sanctions.mjs). Never fails the report.
    if (b.type === 'user' && b.id !== me.id) await autoFromReports(b.id, reason).catch((e) => console.error('auto sanction', e.message));
    return { ok: true, reported: true, updated: r.rows[0].updated };
  },

  /**
   * A refusal the app made before sending (room and group chats, moments, room polls …, lib/contact-filter):
   * nothing reached the server, so the app reports which kind and where, never the text, and it is counted
   * like the server's own refusals (core.mjs countRefusal, at most 20 a minute), the automatic mute included:
   * the answer carries strikesLeft near the limit, or muted / until when this one started the mute.
   */
  async 'POST /api/contact/refusals'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Geçersiz tür');
    if (typeof b.place !== 'string' || b.place.length > 40 || !APP_PLACE.test(b.place)) throw new HttpError(400, 'Geçersiz yer');
    return { counted: true, ...(await countRefusal(me.id, b.category, b.place)) };
  },
};
