// Profiles, follows, blocks, reports and account deletion.
//
//   PATCH  /api/me      { name?, username?, gender?, birthDate?, city?, bio?, interests?, avatarUrl? } → { user }
//   DELETE /api/me                                        → { deleted: true }
//   GET    /api/user?id=&visit=1                          → { user }  (public profile + counts + relation; visit=1 from the profile screen records a visit;
//                                                                       levels, friends, gifts, staff, extras and album: profiles.mjs)
//   GET    /api/me/visitors                               → { count, visitors }  (last 7 days; visitors only with VIP)
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
import { looksOf, revokeAllForDelete, statusOf } from './economy.mjs';
import { svipLevel, vipLevelOf } from './catalog.mjs';
import { familyOf, leaveFamily } from './families.mjs';
import { dropFromQueues } from './music.mjs';
import { removeFiles, removeUserFiles, verifyUpload } from './media.mjs';
import { listsHidden, shownToViewer } from './privacy.mjs';
import { cardsMore, privateMore, profileMore } from './profiles.mjs';

/** The interests the app offers (app/src/data/mock.ts INTERESTS). */
export const INTERESTS = ['🎤 Karaoke', '🎮 Oyun', '💬 Sohbet', '⚽ Spor', '✈️ Seyahat', '🎬 Film', '💃 Dans', '📚 Kitap', '🎧 Müzik', '☕ Kahve'];
const REPORT_TYPES = ['user', 'room', 'message', 'moment', 'comment', 'family'];
const MIN_AGE = 18;
/**
 * Where the app refuses contact details on its own, named like the server's places ('room.chat', 'moment.post',
 * 'tayfa.announcement', 'dm.sequence' …).
 */
const APP_PLACE = /^(?:dm|profile|room|moment|tayfa|agency)(?:\.[a-z_]{2,20}){0,2}$/;

/** A public profile row for lists. */
const card = (u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null });

/** One side of the follows table for the Takipçiler / Takip lists. */
async function followList(me, url, side) {
  const raw = url?.searchParams?.get('user');
  const id = raw ? userId(raw) : me.id;
  if (id !== me.id) {
    await liveUser(id);
    if (await blockedBetween(me.id, id)) throw new HttpError(403, 'Bu listeyi göremezsin');
    // "Profilim herkese açık" off: only people they follow see their lists (privacy.mjs).
    if (await listsHidden(db, me.id, id)) throw new HttpError(403, 'Bu kişinin takip listeleri gizli');
  }
  const [mine, other] = side === 'followers' ? ['followee', 'follower'] : ['follower', 'followee'];
  const r = await db.query(
    `SELECT u.*, f.created_at AS followed_at FROM follows f JOIN users u ON u.id = f.${other}
      WHERE f.${mine} = $1 AND u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $2 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $2))
      ORDER BY f.created_at DESC LIMIT 500`,
    [id, me.id],
  );
  return { users: r.rows.map((u) => ({ ...card(u), followedAt: u.followed_at })) };
}

async function liveUser(id) {
  const r = await db.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!r.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
  return r.rows[0];
}

/** "Sessiz ziyaret" (silent visit): from this İnci level on, opening a profile leaves no trace (app data/status). */
export const SILENT_VISIT_SVIP = 7;
let visitsPrunedAt = 0;

/**
 * `me` opened `owner`'s profile. A visit within 10 minutes of the last one counts once; after a week without one
 * the count starts again. Not recorded with "Sessiz ziyaret". Once an hour, rows past the week (and a day) go.
 */
async function recordVisit(owner, me) {
  if (svipLevel(Number(me.svip_xp) || 0) >= SILENT_VISIT_SVIP) return;
  await db.query(
    `INSERT INTO profile_visits (owner_id, visitor_id) VALUES ($1, $2)
     ON CONFLICT (owner_id, visitor_id) DO UPDATE SET
       visits = CASE WHEN profile_visits.last_at < now() - interval '7 days' THEN 1
                     WHEN profile_visits.last_at < now() - interval '10 minutes' THEN profile_visits.visits + 1
                     ELSE profile_visits.visits END,
       last_at = now()`,
    [owner, me.id],
  );
  if (Date.now() - visitsPrunedAt > 3_600_000) {
    visitsPrunedAt = Date.now();
    await db.query("DELETE FROM profile_visits WHERE last_at < now() - interval '8 days'").catch((e) => console.error('visits prune', e.message));
  }
}

/** The erasure of DELETE /api/me inside transaction `c`, for account `id` (its phone `phone`); also the admin's
 * deletion of test accounts (admin.mjs). */
export async function eraseAccount(c, id, phone) {
    await c.query(
      `UPDATE users SET name = 'Silinmiş hesap', username = NULL, gender = NULL, birth_date = NULL, city = NULL, bio = '',
         interests = '{}', avatar_url = NULL, device_key_hash = NULL, phone = NULL, equipped = '{}', deleted_at = now() WHERE id = $1`,
      [id],
    );
    // Shop items are revoked (a special ID is free again); the rows stay as accounting records.
    await revokeAllForDelete(c, id);
    if (phone) await c.query("DELETE FROM otp_codes WHERE channel = 'sms' AND target = $1", [phone]);
    await c.query("DELETE FROM otp_codes WHERE channel = 'email' AND target IN (SELECT subject FROM auth_identities WHERE user_id = $1 AND provider = 'email')", [id]);
    await c.query('DELETE FROM phone_claims WHERE user_id = $1', [id]);
    await c.query('DELETE FROM auth_identities WHERE user_id = $1', [id]);
    await c.query('DELETE FROM push_tokens WHERE user_id = $1', [id]);
    await c.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await c.query('DELETE FROM follows WHERE follower = $1 OR followee = $1', [id]);
    await c.query('DELETE FROM blocks WHERE blocker = $1 OR blocked = $1', [id]);
    await c.query('DELETE FROM profile_visits WHERE owner_id = $1 OR visitor_id = $1', [id]);
    // Gizlilik choices and the "Arama geçmişini temizle" mark (privacy.mjs, call-log.mjs).
    await c.query('DELETE FROM privacy_settings WHERE user_id = $1', [id]);
    await c.query('DELETE FROM call_history_cleared WHERE user_id = $1', [id]);
    // Profile extras, the album rows (their files go with removeUserFiles) and the gender choice (profiles.mjs).
    await c.query('DELETE FROM profile_extras WHERE user_id = $1', [id]);
    await c.query('DELETE FROM profile_photos WHERE user_id = $1', [id]);
    await c.query('UPDATE users SET gender_hidden = false WHERE id = $1', [id]);
    await c.query('DELETE FROM messages WHERE sender = $1 OR recipient = $1', [id]);
    // 1v1: out of the match queue, an open call ends (the paid rows stay as accounting records).
    await c.query('DELETE FROM match_queue WHERE user_id = $1', [id]);
    await c.query("UPDATE calls SET status = CASE WHEN status = 'live' THEN 'ended' ELSE 'cancelled' END, end_reason = 'deleted', ended_at = now() WHERE (caller = $1 OR callee = $1) AND status IN ('ringing', 'live')", [id]);
    // Anlar: their posts (with the likes and comments on them), their likes and comments elsewhere.
    await c.query('DELETE FROM moment_likes WHERE user_id = $1', [id]);
    await c.query('DELETE FROM moment_comment_likes WHERE user_id = $1', [id]);
    // Similar Ekibi: what was written to them alone, and what they had read.
    await c.query('DELETE FROM team_notices WHERE target = $1', [id]);
    await c.query('DELETE FROM team_notice_seen WHERE user_id = $1', [id]);
    await c.query('DELETE FROM moment_comments WHERE author = $1', [id]);
    await c.query('DELETE FROM moments WHERE author = $1', [id]);
    await c.query('DELETE FROM contact_refusals WHERE user_id = $1', [id]);
    await c.query('DELETE FROM room_admins WHERE user_id = $1', [id]);
    // Room music: no longer a DJ; their library goes, and with it what they had queued in rooms.
    await c.query('DELETE FROM room_djs WHERE user_id = $1', [id]);
    await c.query('UPDATE music_tracks SET removed_at = now() WHERE owner = $1 AND removed_at IS NULL', [id]);
    await dropFromQueues(c, 'added_by = $1 OR track_id IN (SELECT id FROM music_tracks WHERE owner = $1)', [id]);
    // Aile: out of their family (a leader hands it on), their requests and chat lines.
    await leaveFamily(c, id);
    await c.query('DELETE FROM family_requests WHERE user_id = $1', [id]);
    await c.query('DELETE FROM family_invites WHERE user_id = $1', [id]);
    await c.query('DELETE FROM family_messages WHERE author = $1', [id]);
    // Room social (room-social.mjs): their mic invites, poll votes and polls, and the follower invites they sent or
    // that were for their account.
    await c.query('DELETE FROM room_mic_invites WHERE from_user = $1 OR to_user = $1', [id]);
    await c.query('DELETE FROM room_poll_votes WHERE user_id = $1', [id]);
    await c.query('UPDATE room_polls SET closed_by = NULL WHERE closed_by = $1', [id]);
    await c.query('DELETE FROM room_polls WHERE creator = $1', [id]);
    await c.query('DELETE FROM room_follower_invites WHERE owner_id = $1 OR sent_by = $1', [id]);
    await c.query('UPDATE rooms SET closed_at = now() WHERE owner = $1 AND closed_at IS NULL', [id]);
    // Destek: their tickets and threads (the photos go with removeUserFiles); the data copy's date; the spending limit.
    await c.query('DELETE FROM support_tickets WHERE user_id = $1', [id]);
    await c.query('DELETE FROM data_exports WHERE user_id = $1', [id]);
    await c.query('DELETE FROM spend_limits WHERE user_id = $1', [id]);
    // Arkadaşını Getir (referrals.mjs): my code and who entered whose code, both ways; the coins paid stay in the ledger.
    await c.query('DELETE FROM referrals WHERE invitee_id = $1 OR inviter_id = $1', [id]);
    await c.query('DELETE FROM referral_codes WHERE user_id = $1', [id]);
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
      // Set once, like the birth date: who may be an agency streamer depends on it (streamer_policy).
      if (u.gender && u.gender !== b.gender) throw new HttpError(409, 'Cinsiyet bir kez seçilir; değişiklik için destekle iletişime geç');
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
    // A new photo of ours must really be in the storage, within the avatar's type and size.
    if (set.avatar_url) await verifyUpload(set.avatar_url, 'avatar');
    try {
      const r = await db.query(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [u.id, ...keys.map((k) => set[k])]);
      // The photo it replaced leaves the storage (only one this person uploaded).
      if (set.avatar_url !== undefined && u.avatar_url && u.avatar_url !== set.avatar_url) removeFiles([u.avatar_url], u.id);
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
    await tx((c) => eraseAccount(c, u.id, u.phone));
    // Their photos and music leave the storage too, once the account is gone.
    removeUserFiles(u.id);
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
    if (url.searchParams.get('visit') === '1' && id !== me.id && !x.blocked_by_me) await recordVisit(id, me);
    // A streamer's agency (an approved one they are in now) and anyone's family, shown on the profile.
    const ag = await db.query(
      `SELECT a.id, a.name FROM agency_streamers s JOIN agencies a ON a.id = s.agency_id
        WHERE s.streamer_id = $1 AND s.ended_at IS NULL AND s.contract = 'approved' AND a.status = 'approved' LIMIT 1`,
      [id],
    );
    // "Profilim herkese açık" off: someone they don't follow gets no age, city, bio or interests (privacy.mjs).
    const [shown] = await shownToViewer(db, me.id, [{ id: u.id, name: u.name, ...profileOf(u) }]);
    const more = await profileMore(u, id === me.id);
    return {
      user: {
        ...shown,
        followers: Number(x.followers),
        following: Number(x.following),
        isFollowing: x.is_following,
        blockedByMe: x.blocked_by_me,
        // A private profile keeps its personal extras and album from people it doesn't follow, like age and city.
        ...(shown.private ? privateMore(more) : more),
      },
      looks: (await looksOf([u.id]))[u.id] ?? null,
      agency: ag.rowCount ? { id: String(ag.rows[0].id), name: ag.rows[0].name } : null,
      family: await familyOf(id),
    };
  },

  /**
   * Profil ziyaretçileri: who opened my profile in the last 7 days. How many is for everyone; who they are is a VIP
   * right (VIP 1 and up, by İnci or Rütbe), so without it `visitors` is null. Blocked people either way and deleted
   * accounts are left out. Newest first, at most 100.
   */
  async 'GET /api/me/visitors'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT v.visitor_id AS id, u.name, u.avatar_url, v.visits, v.last_at, count(*) OVER () AS total
         FROM profile_visits v JOIN users u ON u.id = v.visitor_id
        WHERE v.owner_id = $1 AND v.last_at > now() - interval '7 days' AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = v.visitor_id) OR (b.blocker = v.visitor_id AND b.blocked = $1))
        ORDER BY v.last_at DESC LIMIT 100`,
      [me.id],
    );
    const vip = vipLevelOf(me.svip_xp, (await statusOf(db, me.id)).noble?.tier) >= 1;
    return {
      count: Number(r.rows[0]?.total ?? 0),
      visitors: vip ? r.rows.map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null, visits: x.visits, lastAt: x.last_at })) : null,
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

  /**
   * Keşfet: real people. Men see women and women see men (anyone, while either of the two hasn't given a gender);
   * blocks either way and deleted accounts are left out. `list`: 'home' (most recently active first), 'new' (newest
   * accounts first) or 'featured', who 1v1 lifts in the last 30 days: for a streamer, the people who spent most on
   * them in private (chat gifts, paid messages, paid call and match minutes: paid_events); for anyone else, the agency
   * streamers who earned most there (all streamers, the earners first).
   */
  async 'GET /api/discover'(req, url) {
    const me = await auth(req);
    const list = url.searchParams.get('list') ?? 'home';
    if (!['home', 'new', 'featured'].includes(list)) throw new HttpError(400, 'Geçersiz liste');
    const live = `EXISTS (SELECT 1 FROM agency_streamers s WHERE s.streamer_id = $X AND s.ended_at IS NULL AND s.contract = 'approved')`;
    const streamer = list === 'featured' && (await db.query(`SELECT ${live.replace('$X', '$1')} AS yes`, [me.id])).rows[0].yes;
    // 1v1 coins in the window: given by them (to me, a streamer) or received by them (anyone else).
    const score = list !== 'featured' ? '0' : streamer
      ? `((SELECT coalesce(sum(g.total), 0) FROM gift_events g WHERE g.sender = u.id AND g.place = 'chat' AND g.created_at > now() - interval '30 days')
          + (SELECT coalesce(sum(p.coins), 0) FROM paid_events p WHERE p.payer = u.id AND p.earner = $1 AND p.created_at > now() - interval '30 days'))`
      : `((SELECT coalesce(sum(g.total), 0) FROM gift_events g WHERE g.recipient = u.id AND g.place = 'chat' AND g.created_at > now() - interval '30 days')
          + (SELECT coalesce(sum(p.coins), 0) FROM paid_events p WHERE p.earner = u.id AND p.created_at > now() - interval '30 days'))`;
    const only = list !== 'featured' ? '' : streamer
      ? `AND ${score} > 0`
      : `AND ${live.replace('$X', 'u.id')}`;
    const order = list === 'new' ? 'u.created_at DESC' : list === 'featured' ? 'score DESC, a.seen DESC NULLS LAST' : 'a.seen DESC NULLS LAST, u.created_at DESC';
    const r = await db.query(
      `SELECT u.*, a.seen, ${score} AS score
         FROM users u
         JOIN LATERAL (SELECT max(s.last_seen_at) AS seen FROM sessions s WHERE s.user_id = u.id) a ON true
        WHERE u.id <> $1 AND u.deleted_at IS NULL
          AND ($2::text IS NULL OR u.gender IS NULL OR u.gender <> $2)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
          ${only}
        ORDER BY ${order}
        LIMIT 60`,
      [me.id, me.gender ?? null],
    );
    const fresh = Date.now() - 5 * 60_000;
    // Each card's levels and country, for the whole list in a few queries (profiles.mjs); then what each one shows me:
    // "Profilim herkese açık" (no country either) and "Çevrimiçi durumumu göster" (privacy.mjs).
    const more = await cardsMore(r.rows.map((u) => u.id));
    const users = await shownToViewer(db, me.id, r.rows.map((u) => ({ id: u.id, name: u.name, ...profileOf(u), online: !!u.seen && new Date(u.seen).getTime() > fresh, ...more[u.id] })));
    return { users: users.map((u) => (u.private ? { ...u, country: null } : u)) };
  },

  /** Who `user` follows (default: me). Another person's list leaves out anyone either of us blocked. */
  async 'GET /api/following'(req, url) {
    return followList(await auth(req), url, 'following');
  },

  /** Who follows `user` (default: me), newest first, with when; the app tells me about new followers from it. */
  async 'GET /api/followers'(req, url) {
    return followList(await auth(req), url, 'followers');
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
