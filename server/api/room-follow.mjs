// Following a room, on the server. A room that closes and opens again is a new room id (rooms.mjs: one open room
// per owner), so a follow is kept on the room's account, its owner, like the follower invite's daily limit
// (room-social.mjs): it survives the room closing, and the room that account opens next is the followed one.
//
//   POST /api/rooms/follow    { room }   → { following: true, followers }
//   POST /api/rooms/unfollow  { room }   → { following: false, followers }
//   GET  /api/rooms/followed             → { rooms }   (open ones first, fullest first; then the closed ones)
//   GET  /api/room?id= (rooms.mjs) carries `followers` and `following` (roomFollowOf).
//
// "Takip ettiğin oda açıldı": when the owner opens their room or comes back into it (their voice token, rooms.mjs
// voiceAccess), its followers hear so once, at most every 6 hours per room account. As the follower invite does
// (room-social.mjs): one row per send, which each follower's phone turns into a notice through
// GET /api/me/room-invites, and a push. Nobody who takes room invites from nobody (privacy.mjs) gets one.
// Retention (UK GDPR): a follow stays until it is taken back, a block comes between the two (social.mjs) or either
// account is erased (social.mjs eraseAccount); an open notice (one row per send, none per follower) is pruned after
// 8 days.
import { HttpError, auth, blockedBetween, db, limit, readJson, tx } from './core.mjs';
import { notify } from './push.mjs';
// rooms.mjs and room-social.mjs import this file too; their functions are only used inside handlers, after all
// three have loaded.
import { withRoomBadges } from './room-social.mjs';
import { ROOM_SELECT, roomOut, roomRow, withVoiceCounts } from './rooms.mjs';

/** Most rooms one person follows (the Odalarım list reads them all at once). */
export const ROOM_FOLLOW_MAX = 200;
/** One "room opened" notice per room account in this window. */
export const ROOM_OPEN_NOTICE_MS = 6 * 3600_000;
/** At most this many followers get the push (the newest follows first); every follower still gets the notice. */
const OPEN_PUSH_MAX = 5_000;

/** SQL: `user` has a running kick or the blacklist in `room` (both SQL expressions). */
const banOf = (room, user) => `EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id = ${room} AND rb.user_id = ${user} AND (rb.until IS NULL OR rb.until > now()))`;
const followerCount = async (owner, q = db) => (await q.query('SELECT count(*)::int AS n FROM room_follows WHERE owner_id = $1', [owner])).rows[0].n;

/**
 * What the room read says about following (rooms.mjs GET /api/room): how many follow the room's account, and
 * whether `me` does. Never fails the room read: on an error the room goes out without them.
 */
export async function roomFollowOf(owner, me) {
  try {
    const r = await db.query('SELECT count(*)::int AS n, coalesce(bool_or(user_id = $2), false) AS mine FROM room_follows WHERE owner_id = $1', [owner, me]);
    return { followers: r.rows[0].n, following: r.rows[0].mine };
  } catch (e) {
    console.error('room follow', String(e).slice(0, 200));
    return {};
  }
}

// --- "Room opened" notices -------------------------------------------------------------------------------------
/**
 * The followers a "room opened" notice reaches ($1 the room's account, $2 the room): not deleted, no block either
 * way with the owner, not kept out of the room, and not someone who takes room invites from nobody (privacy.mjs;
 * following the room is asking to hear from it, so "only people I follow" lets it through).
 */
const OPEN_RECIPIENTS = `FROM room_follows f JOIN users u ON u.id = f.user_id
                        WHERE f.owner_id = $1 AND u.deleted_at IS NULL
                          AND NOT EXISTS (SELECT 1 FROM privacy_settings p WHERE p.user_id = f.user_id AND p.invites_from = 'nobody')
                          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = f.user_id AND b.blocked = $1) OR (b.blocked = f.user_id AND b.blocker = $1))
                          AND NOT ${banOf('$2', 'f.user_id')}`;
let openNoticesPrunedAt = 0;

/**
 * The owner opened their room or came back into it: its followers are told once, unless they were told in the last
 * 6 hours (kept on the room's account, so closing and reopening the room doesn't start it again). Nothing is
 * written when nobody would be told. Never throws: the owner gets into their room either way.
 */
export async function roomOpened(roomId, owner) {
  try {
    const recent = () => `SELECT 1 FROM room_open_notices WHERE owner_id = $1 AND created_at > now() - make_interval(secs => ${ROOM_OPEN_NOTICE_MS / 1000}) LIMIT 1`;
    // The common case costs two small reads: told already, or nobody follows.
    if ((await db.query(recent(), [owner])).rowCount) return 0;
    if (!(await db.query('SELECT 1 FROM room_follows WHERE owner_id = $1 LIMIT 1', [owner])).rowCount) return 0;
    const room = (await db.query('SELECT r.title, r.closed_at, u.deleted_at FROM rooms r JOIN users u ON u.id = r.owner WHERE r.id = $1 AND r.owner = $2', [roomId, owner])).rows[0];
    if (!room || room.closed_at || room.deleted_at) return 0;
    const sent = await tx(async (c) => {
      // The owner's two phones at once: the second waits here and then finds the first one's row.
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [owner]);
      if ((await c.query(recent(), [owner])).rowCount) return 0;
      const n = (await c.query(`SELECT count(*)::int AS n ${OPEN_RECIPIENTS}`, [owner, roomId])).rows[0].n;
      if (n) await c.query('INSERT INTO room_open_notices (owner_id, room_id, recipients) VALUES ($1, $2, $3)', [owner, roomId, n]);
      return n;
    });
    if (!sent) return 0;
    const push = (await db.query(`SELECT f.user_id ${OPEN_RECIPIENTS} ORDER BY f.created_at DESC LIMIT ${OPEN_PUSH_MAX}`, [owner, roomId])).rows.map((x) => x.user_id);
    // The same push type as a room invite: the phone opens the room, and its open app reads its notices now.
    notify(push, { title: 'Takip ettiğin oda açıldı', body: `"${room.title}" odası şimdi açık`, data: { type: 'room_invite', room: roomId } });
    if (Date.now() - openNoticesPrunedAt > 3_600_000) {
      openNoticesPrunedAt = Date.now();
      await db.query("DELETE FROM room_open_notices WHERE created_at < now() - interval '8 days'");
    }
    return sent;
  } catch (e) {
    console.error('room opened notice', roomId, String(e).slice(0, 200));
    return 0;
  }
}

/**
 * "Room opened" notices for `me`, shaped like the follower invites they are read with (room-social.mjs
 * GET /api/me/room-invites; `kind: 'open'` tells them apart): rooms I followed before they opened, in the last
 * 6 hours (older than that it is no news), still open, that I can still enter, unless I take room invites from
 * nobody. Newest first, at most 20.
 */
export async function openNoticesFor(me) {
  const r = await db.query(
    `SELECT n.id, n.room_id, n.created_at, r.title, o.id AS owner_id, o.name AS owner_name
       FROM room_open_notices n
       JOIN room_follows f ON f.owner_id = n.owner_id AND f.user_id = $1 AND f.created_at <= n.created_at
       JOIN rooms r ON r.id = n.room_id JOIN users o ON o.id = n.owner_id
      WHERE n.created_at > now() - make_interval(secs => ${ROOM_OPEN_NOTICE_MS / 1000}) AND r.closed_at IS NULL AND o.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM privacy_settings p WHERE p.user_id = $1 AND p.invites_from = 'nobody')
        AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = n.owner_id) OR (b.blocked = $1 AND b.blocker = n.owner_id))
        AND NOT ${banOf('n.room_id', '$1')}
      ORDER BY n.id DESC LIMIT 20`,
    [me],
  );
  return r.rows.map((x) => ({ id: Number(x.id), kind: 'open', room: { id: x.room_id, title: x.title }, host: { id: x.owner_id, name: x.owner_name }, at: x.created_at }));
}

export const roomFollowRoutes = {
  /**
   * Follow a room (its account: the follow stays when the room closes and opens again). Not my own room, not while
   * the owner and I have blocked each other or the room keeps me out; at most ROOM_FOLLOW_MAX rooms per person.
   */
  async 'POST /api/rooms/follow'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).room);
    if (room.owner === me.id) throw new HttpError(400, 'Kendi odanı takip edemezsin');
    limit(`roomfollow:${me.id}`, 30, 'Çok sık takip ediyorsun, biraz bekle');
    if (!(await db.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [room.owner])).rowCount) throw new HttpError(404, 'Oda bulunamadı');
    if ((await blockedBetween(room.owner, me.id)) || (await db.query(`SELECT ${banOf('$1', '$2')} AS yes`, [room.id, me.id])).rows[0].yes) {
      throw new HttpError(403, 'Bu odayı takip edemezsin');
    }
    const mine = await db.query('SELECT count(*)::int AS n, coalesce(bool_or(owner_id = $2), false) AS has FROM room_follows WHERE user_id = $1', [me.id, room.owner]);
    if (!mine.rows[0].has) {
      if (mine.rows[0].n >= ROOM_FOLLOW_MAX) throw new HttpError(409, `En fazla ${ROOM_FOLLOW_MAX} oda takip edebilirsin`);
      await db.query('INSERT INTO room_follows (owner_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [room.owner, me.id]);
    }
    return { following: true, followers: await followerCount(room.owner) };
  },

  /** Take the follow back (always possible: a closed room, a block or a kick doesn't keep someone following). */
  async 'POST /api/rooms/unfollow'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).room);
    limit(`roomfollow:${me.id}`, 30, 'Çok sık takip ediyorsun, biraz bekle');
    await db.query('DELETE FROM room_follows WHERE owner_id = $1 AND user_id = $2', [room.owner, me.id]);
    return { following: false, followers: await followerCount(room.owner) };
  },

  /**
   * Odalarım: the rooms I follow, one per followed account: its open room, else the one it closed last (`closed`).
   * Open ones first, fullest first; then the closed ones, the last closed first. None whose owner and I have blocked
   * each other, that keeps me out or whose owner is gone.
   */
  async 'GET /api/rooms/followed'(req) {
    const me = await auth(req);
    const r = await db.query(
      `${ROOM_SELECT} JOIN room_follows f ON f.owner_id = r.owner AND f.user_id = $1
        WHERE u.deleted_at IS NULL
          AND r.id = coalesce((SELECT x.id FROM rooms x WHERE x.owner = f.owner_id AND x.closed_at IS NULL),
                              (SELECT x.id FROM rooms x WHERE x.owner = f.owner_id ORDER BY x.created_at DESC LIMIT 1))
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = r.owner AND b.blocked = $1) OR (b.blocker = $1 AND b.blocked = r.owner))
          AND NOT ${banOf('r.id', '$1')}
        ORDER BY f.created_at DESC LIMIT ${ROOM_FOLLOW_MAX}`,
      [me.id],
    );
    // Nobody is in a closed room, whatever a missed webhook left behind.
    const rows = (await withVoiceCounts(r.rows)).map((x) => (x.closed_at ? { ...x, listeners: 0 } : x));
    rows.sort(
      (a, b) =>
        Number(!!a.closed_at) - Number(!!b.closed_at) ||
        (a.closed_at ? new Date(b.closed_at) - new Date(a.closed_at) : Number(b.listeners) - Number(a.listeners) || new Date(b.created_at) - new Date(a.created_at)),
    );
    return { rooms: await withRoomBadges(rows.map(roomOut)) };
  },
};
