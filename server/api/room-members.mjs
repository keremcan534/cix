// The room's member list as the room card shows it (app components/room/members): the room's staff first (owner,
// Süper Yönetici, Yönetici), then its members, a page at a time, with who is in the room now and when each was
// last in it.
//
//   GET /api/rooms/members/list?room=&filter=all|in|out|pending&offset=   → { rows, counts, nextOffset, canManage }
//
// Joining, leaving, answering and removing a member are rooms.mjs (POST /api/rooms/members/…); its
// GET /api/rooms/members stays the card's summary (the count, the cap, my own membership).
// Who is in the room now is the voice room's own list (room-social.mjs inRoom: LiveKit's participants, else its
// webhooks). "Last in the room" is a member's last entry (room_members.seen_at, rooms.mjs voiceAccess); for the
// room's staff, who aren't counted that way, the last time they left it (presence_log).
// Privacy (privacy.mjs): to someone who is neither in the room nor its staff, a person who hides the room they
// are in reads as not in it. When someone was last in the room is shown only if they show when they were last on
// and so does the viewer; whoever manages the room's members always sees it (the room's removal rule,
// rules.autoRemoveDays, runs on that date). Nobody sees a person they blocked or who blocked them, except
// whoever manages the members, who has to be able to take them off the list.
import { HttpError, UUID, auth, blockedBetween, db, limit } from './core.mjs';
import { rulesOf } from './room-rules.mjs';
// rooms.mjs imports room-social.mjs, which imports rooms.mjs; their functions are only used inside handlers.
import { inRoom } from './room-social.mjs';
import { ROOM_PEOPLE, liveKitName, mayManageMembers, rankOf, roomRow } from './rooms.mjs';

/** Rows per page (the app asks for the next one as the list is scrolled). */
export const MEMBER_PAGE = 50;
const FILTERS = ['all', 'in', 'out', 'pending'];
const ROLES = ['member', 'admin', 'super', 'owner'];

/**
 * The room's people (rooms.mjs ROOM_PEOPLE, as the card counts them) as the viewer may see them. $1 room, $2 who is
 * in its voice now (uuid[]), $3 the viewer, $4 the viewer is in the room or its staff, $5 the viewer manages the
 * room's members.
 */
const PEOPLE = `WITH people AS (${ROOM_PEOPLE}), shown AS (
    SELECT p.user_id, p.rank, u.name, u.avatar_url, m.created_at AS since, m.seen_at,
           coalesce(ps.show_last_seen, true) AS shows_seen,
           (p.user_id = ANY($2::uuid[]) AND ($4 OR p.user_id = $3 OR coalesce(ps.show_current_room, true))) AS here
      FROM people p JOIN users u ON u.id = p.user_id
      LEFT JOIN room_members m ON m.room_id = $1 AND m.user_id = p.user_id AND m.status = 'member'
      LEFT JOIN privacy_settings ps ON ps.user_id = p.user_id
     WHERE u.deleted_at IS NULL
       AND ($5 OR p.user_id = $3 OR NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $3 AND b.blocked = p.user_id) OR (b.blocked = $3 AND b.blocker = p.user_id)))
  )`;

export const roomMemberRoutes = {
  /**
   * One page of the room's people. `filter`: all, in (in the room now), out (not in it) or pending (who asked to
   * join: only for whoever answers members, rules.manageMembers). Staff first, then people in the room, then by
   * who came in last. `counts` are for the filter chips; `nextOffset` is null on the last page. Refused to
   * someone the room keeps out or whose block with its owner keeps them out.
   */
  async 'GET /api/rooms/members/list'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    const filter = url.searchParams.get('filter') ?? 'all';
    if (!FILTERS.includes(filter)) throw new HttpError(400, 'Geçersiz filtre');
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new HttpError(400, 'Geçersiz sayfa');
    limit(`roommembers:${me.id}`, 60);
    const rank = await rankOf(room, me.id);
    const kept = await db.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [room.id, me.id]);
    if (!rank && (kept.rowCount || (await blockedBetween(room.owner, me.id)))) throw new HttpError(403, 'Bu odanın üyelerini göremezsin');
    const canManage = mayManageMembers(rulesOf(room.rules), rank);
    if (filter === 'pending' && !canManage) throw new HttpError(403, 'Başvuruları oda sahibi ve yetkili yöneticiler görür');

    const { people } = room.closed_at ? { people: new Map() } : await inRoom(room.id);
    const here = [...people.keys()].filter((id) => UUID.test(id));
    const inside = rank > 0 || people.has(me.id);
    const base = [room.id, here, me.id, inside, canManage];
    const c = (await db.query(`${PEOPLE} SELECT count(*)::int AS n_all, (count(*) FILTER (WHERE here))::int AS n_in FROM shown`, base)).rows[0];
    const pending = canManage
      ? (await db.query("SELECT count(*)::int AS n FROM room_members m JOIN users u ON u.id = m.user_id WHERE m.room_id = $1 AND m.status = 'pending' AND u.deleted_at IS NULL", [room.id])).rows[0].n
      : 0;
    const counts = { all: c.n_all, in: c.n_in, out: c.n_all - c.n_in, pending };

    let rows;
    if (filter === 'pending') {
      const r = await db.query(
        `SELECT m.user_id, m.created_at AS since, u.name, u.avatar_url, (m.user_id = ANY($2::uuid[])) AS here
           FROM room_members m JOIN users u ON u.id = m.user_id
          WHERE m.room_id = $1 AND m.status = 'pending' AND u.deleted_at IS NULL
          ORDER BY m.created_at, m.user_id LIMIT $3 OFFSET $4`,
        [room.id, here, MEMBER_PAGE + 1, offset],
      );
      rows = r.rows.map((x) => ({ id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null, role: 'pending', since: x.since, seenAt: null, inRoom: x.here }));
    } else {
      const mine = (await db.query('SELECT show_last_seen FROM privacy_settings WHERE user_id = $1', [me.id])).rows[0]?.show_last_seen ?? true;
      const r = await db.query(
        `${PEOPLE}
         SELECT s.user_id, s.rank, s.name, s.avatar_url, s.since, s.here, s.shows_seen,
                CASE WHEN s.rank > 0 THEN greatest(s.seen_at, (SELECT max(pl.left_at) FROM presence_log pl WHERE pl.user_id = s.user_id AND pl.room = $6)) ELSE s.seen_at END AS seen
           FROM shown s
          WHERE ($7 = 'all' OR s.here = ($7 = 'in'))
          ORDER BY s.rank DESC, s.here DESC, s.seen_at DESC NULLS LAST, s.user_id
          LIMIT $8 OFFSET $9`,
        [...base, liveKitName(room.id), filter, MEMBER_PAGE + 1, offset],
      );
      rows = r.rows.map((x) => ({
        id: x.user_id,
        name: x.name,
        avatarUrl: x.avatar_url ?? null,
        role: ROLES[x.rank],
        since: x.since ?? null,
        seenAt: canManage || x.user_id === me.id || (x.shows_seen && mine) ? (x.seen ?? null) : null,
        inRoom: x.here,
      }));
    }
    const more = rows.length > MEMBER_PAGE;
    return { rows: rows.slice(0, MEMBER_PAGE), counts, nextOffset: more ? offset + MEMBER_PAGE : null, canManage };
  },
};
