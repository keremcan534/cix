// Odalar arası PK on the server: two server rooms against each other, so both rooms see one score, one clock and
// the same result.
//
//   GET  /api/rooms/pk/cross/rooms?room=&q=                       → { rooms }        (rooms `room` may invite now)
//   POST /api/rooms/pk/cross        { room, to, durationMin, ref } → { cross, now }   (invite)
//   POST /api/rooms/pk/cross/answer { room, id, accept }           → { cross, now }   (the invited room)
//   POST /api/rooms/pk/cross/end    { room }                       → { cross, now }   (either room)
//   GET  /api/rooms/pk?room= (pk.mjs) also carries the room's cross-room PK as `cross`.
//
// The owner or an admin of room A (red) invites room B (blue); B's owner or an admin accepts or declines within
// INVITE_MS, else the invite expires. One PK at a time per room: an invite or a running cross-room PK holds both
// rooms, and neither may be in an Oda içi PK (pk.mjs checks the other way). Both rooms' rows are locked while this
// is checked, so two starts can't both pass. No invite or answer while the two owners, or the inviter or the
// answerer and the other room's owner, have blocked each other; the room list leaves such rooms out, and a viewer
// isn't shown the gifts of people they have blocked or who blocked them (the scores still count them).
// After a short countdown every gift paid in either room until the end scores its coins for that room, once per
// gift (scoreCrossPkGift, inside the gift's transaction). Like Oda içi PK the points never move money and nobody
// gets a reward. Either room's staff can end it early: it is cancelled, with no winner (an invite: withdrawn or
// declined). A room that closes ends it. Every change is announced to both rooms' voice connections
// ({ type: 'pk' }, which makes the phones read the PK again), and a scored gift nudges the other room the same way.
// `cross` is the room's open cross-room PK, or its last one for RESULT_MS after it ended (the result screen).
import { HttpError, REF, UUID, auth, db, env, int, limit, readJson, tx } from './core.mjs';
import { presenceTracked, roomService } from './live.mjs';
import { mayInvite } from './privacy.mjs';
import { notify } from './push.mjs';
// rooms.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { ROOM_SELECT, roomCode, roomOut, withVoiceCounts } from './rooms.mjs';

/** The countdown after the answer (PK_PREP_MS only for tests, the same as Oda içi PK). */
const PREP_MS = Number(env.PK_PREP_MS ?? 5_000);
/** How long the invited room has to answer: the demo's inviteTimeoutSec (PK_INVITE_MS only for tests). */
const INVITE_MS = Number(env.PK_INVITE_MS ?? 60_000);
const RESULT_MS = 10 * 60_000;
const DURATIONS = [15, 30, 60, 120];
/** A scored gift tells the other room at most once in this time. */
const NUDGE_MS = 1_000;
const OPEN = "status IN ('invite', 'active')";
/** Open and still in its time (one past its time is closed at the next read); `p` a table alias with its dot. */
const live = (p = '') => `((${p}status = 'invite' AND ${p}invite_expires_at > now()) OR (${p}status = 'active' AND ${p}end_at > now()))`;

/** A room id from input: the server room's id or its LiveKit name (oda-<id>). */
const roomIdOf = (v) => {
  const s = typeof v === 'string' ? v.replace(/^oda-/, '') : '';
  if (!UUID.test(s)) throw new HttpError(400, 'Geçersiz oda');
  return s;
};

/** The room, refused unless I own it or am one of its admins. */
async function staffRoom(me, roomId, message = 'PK’yı oda sahibi veya yöneticiler başlatabilir') {
  const r = await db.query('SELECT id, owner, title, closed_at FROM rooms WHERE id = $1', [roomId]);
  if (!r.rowCount) throw new HttpError(404, 'Oda bulunamadı');
  if (r.rows[0].closed_at) throw new HttpError(410, 'Oda kapandı');
  const staff = r.rows[0].owner === me.id || (await db.query('SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2', [roomId, me.id])).rowCount > 0;
  if (!staff) throw new HttpError(403, message);
  return r.rows[0];
}

/** True when anyone of `as` and anyone of `bs` have blocked each other (either way). */
const blockedAny = async (as, bs, q = db) =>
  (await q.query('SELECT 1 FROM blocks WHERE (blocker = ANY($1::uuid[]) AND blocked = ANY($2::uuid[])) OR (blocker = ANY($2::uuid[]) AND blocked = ANY($1::uuid[])) LIMIT 1', [as, bs])).rowCount > 0;

/** Both rooms' rows, locked in id order (no deadlock), so the "one PK per room" checks can't race. */
const lockRooms = (c, ids) => c.query('SELECT id FROM rooms WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);

/**
 * Closes the rooms' open cross-room PKs that are over: a room that closed before its end cancels it, then an
 * unanswered invite past its time expires and a PK past its end is done. Once each; later reads find it closed.
 */
async function settle(q, ids) {
  const open = await q.query(`SELECT 1 FROM room_cross_pks WHERE ${OPEN} AND (red_room = ANY($1::uuid[]) OR blue_room = ANY($1::uuid[])) LIMIT 1`, [ids]);
  if (!open.rowCount) return;
  await q.query(
    `UPDATE room_cross_pks x SET status = 'cancelled', end_reason = 'room_closed', ended_room = r.id, ended_at = r.closed_at
       FROM rooms r
      WHERE x.${OPEN} AND (x.red_room = ANY($1::uuid[]) OR x.blue_room = ANY($1::uuid[]))
        AND r.id IN (x.red_room, x.blue_room) AND r.closed_at IS NOT NULL
        AND r.closed_at < CASE WHEN x.status = 'invite' THEN x.invite_expires_at ELSE x.end_at END`,
    [ids],
  );
  await q.query(`UPDATE room_cross_pks SET status = 'expired', ended_at = invite_expires_at WHERE status = 'invite' AND invite_expires_at <= now() AND (red_room = ANY($1::uuid[]) OR blue_room = ANY($1::uuid[]))`, [ids]);
  await q.query(`UPDATE room_cross_pks SET status = 'done', ended_at = end_at WHERE status = 'active' AND end_at <= now() AND (red_room = ANY($1::uuid[]) OR blue_room = ANY($1::uuid[]))`, [ids]);
}

/** Whether the room is in an open cross-room PK (after closing the ones that are over). pk.mjs asks it too. */
export async function crossBusy(q, roomId) {
  await settle(q, [roomId]);
  return (await q.query(`SELECT 1 FROM room_cross_pks WHERE ${OPEN} AND (red_room = $1 OR blue_room = $1)`, [roomId])).rowCount > 0;
}
/** Whether an Oda içi PK (pk.mjs) runs in the room now. */
const inRoomBusy = async (q, roomId) => (await q.query("SELECT 1 FROM room_pks WHERE room_id = $1 AND status = 'active' AND end_at > now()", [roomId])).rowCount > 0;
const busy = async (q, roomId) => (await crossBusy(q, roomId)) || (await inRoomBusy(q, roomId));

/** The room's newest cross-room PK, on either side. */
async function latest(q, roomId) {
  const r = await q.query(
    `(SELECT * FROM room_cross_pks WHERE red_room = $1 ORDER BY id DESC LIMIT 1)
     UNION ALL (SELECT * FROM room_cross_pks WHERE blue_room = $1 ORDER BY id DESC LIMIT 1)
     ORDER BY id DESC LIMIT 1`,
    [roomId],
  );
  return r.rows[0] ?? null;
}

/** Best effort, like a gift's announcement: never slows or fails the PK. */
function announce(roomIds, pkId) {
  const data = Buffer.from(JSON.stringify({ type: 'pk', pk: `x${pkId}` })).toString('base64');
  for (const id of roomIds) {
    const room = `oda-${id}`;
    roomService('SendData', { room, data, kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) => console.error('livekit SendData cross pk', room, String(e).slice(0, 200)));
  }
}
const nudges = new Map();
/** The other room hears of a scored gift a little later (after the gift's transaction), at most once per NUDGE_MS. */
function nudgeSoon(roomId, pkId) {
  const key = `${pkId}:${roomId}`;
  if (nudges.has(key)) return;
  const t = setTimeout(() => {
    nudges.delete(key);
    announce([roomId], pkId);
  }, NUDGE_MS);
  t.unref();
  nudges.set(key, t);
}

/**
 * What the phones draw: both rooms, each room's score, the points per sender → recipient in each room and the
 * people named in them. `viewer` isn't shown pairs with someone they have blocked or who blocked them.
 */
async function view(row, viewer, q = db) {
  if (!row) return null;
  const rooms = await q.query(`${ROOM_SELECT} WHERE r.id = ANY($1::uuid[])`, [[row.red_room, row.blue_room]]);
  const roomOf = new Map(rooms.rows.map((r) => [r.id, roomOut(r)]));
  const scores = await q.query('SELECT side, sum(points)::bigint AS n FROM room_cross_pk_gifts WHERE pk_id = $1 GROUP BY side', [row.id]);
  const score = (side) => Number(scores.rows.find((s) => s.side === side)?.n ?? 0);
  const pairs = await q.query(
    `SELECT sender, recipient, side, sum(points)::bigint AS points, count(*)::int AS gifts FROM room_cross_pk_gifts
      WHERE pk_id = $1 GROUP BY sender, recipient, side ORDER BY points DESC, sender, recipient LIMIT 2000`,
    [row.id],
  );
  const hidden = viewer ? new Set((await q.query('SELECT blocked AS id FROM blocks WHERE blocker = $1 UNION SELECT blocker FROM blocks WHERE blocked = $1', [viewer])).rows.map((x) => x.id)) : new Set();
  const shown = pairs.rows.filter((p) => !hidden.has(p.sender) && !hidden.has(p.recipient));
  const named = [...new Set(shown.flatMap((p) => [p.sender, p.recipient]))];
  const people = named.length ? (await q.query('SELECT id, name, avatar_url FROM users WHERE id = ANY($1::uuid[])', [named])).rows : [];
  const iso = (t) => (t ? t.toISOString() : null);
  return {
    id: String(row.id),
    status: row.status,
    reason: row.end_reason ?? null,
    endedRoom: row.ended_room ?? null,
    durationMin: row.duration_min,
    createdAt: iso(row.created_at),
    inviteExpiresAt: iso(row.invite_expires_at),
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    red: { room: roomOf.get(row.red_room) ?? null, score: score('red') },
    blue: { room: roomOf.get(row.blue_room) ?? null, score: score('blue') },
    pairs: shown.map((p) => ({ from: p.sender, to: p.recipient, side: p.side, points: Number(p.points), gifts: p.gifts })),
    people: people.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null })),
  };
}
const answer = async (row, viewer) => ({ cross: await view(row, viewer), now: new Date().toISOString() });

/** The room's cross-room PK for GET /api/rooms/pk: open, or ended less than RESULT_MS ago; else null. */
export async function crossForRoom(roomId, viewer) {
  let row = await latest(db, roomId);
  if (row && (row.status === 'invite' || row.status === 'active')) {
    await settle(db, [roomId]);
    row = await latest(db, roomId);
  }
  const fresh = row && (row.status === 'invite' || row.status === 'active' || Date.now() - (row.ended_at ?? row.created_at).getTime() < RESULT_MS);
  return fresh ? view(row, viewer) : null;
}

/**
 * Called by scorePkGift (pk.mjs) inside the gift's transaction and savepoint, after the coins moved: a gift paid in
 * a room of a running cross-room PK, after its countdown and before its end, scores its coins for that room. One
 * row per gift (gift_events id), so a replay can't add more.
 */
export async function scoreCrossPkGift(c, roomId, { eventId, sender, recipient, coins }) {
  const r = await c.query(
    `SELECT x.id, x.red_room, x.blue_room FROM room_cross_pks x
      WHERE x.status = 'active' AND (x.red_room = $1 OR x.blue_room = $1) AND x.start_at <= now() AND x.end_at > now()
        AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id IN (x.red_room, x.blue_room) AND r.closed_at IS NOT NULL)`,
    [roomId],
  );
  const pk = r.rows[0];
  if (!pk) return;
  const side = pk.red_room === roomId ? 'red' : 'blue';
  const ins = await c.query('INSERT INTO room_cross_pk_gifts (pk_id, gift_event, side, sender, recipient, points) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING', [pk.id, eventId, side, sender, recipient, coins]);
  if (ins.rowCount) nudgeSoon(side === 'red' ? pk.blue_room : pk.red_room, pk.id);
}

/** The room was closed (rooms.mjs POST /api/rooms/close): its open cross-room PK ends now, and both rooms hear it. */
export async function endCrossPkOfRoom(roomId) {
  try {
    const r = await db.query(
      `UPDATE room_cross_pks SET status = 'cancelled', end_reason = 'room_closed', ended_room = $1, ended_at = now()
        WHERE ${live()} AND (red_room = $1 OR blue_room = $1) RETURNING id, red_room, blue_room`,
      [roomId],
    );
    for (const x of r.rows) announce([x.red_room, x.blue_room], x.id);
  } catch (e) {
    console.error('cross pk room closed', roomId, String(e).slice(0, 200));
  }
}

export const crossPkRoutes = {
  /**
   * Open rooms the staff of `room` may invite now, fullest first (at most 50): not their own, not in a PK or an
   * invite, no block between their owner and me or my room's owner; once LiveKit's webhooks arrive, only rooms
   * with someone in them. `q`: a room's 8-digit ID (as the room card shows it) or part of its name.
   */
  async 'GET /api/rooms/pk/cross/rooms'(req, url) {
    const me = await auth(req);
    const roomId = roomIdOf(url.searchParams.get('room'));
    const mine = await staffRoom(me, roomId);
    const q = String(url.searchParams.get('q') ?? '').trim().slice(0, 40);
    const code = /^\d{8}$/.test(q) ? q : null;
    const only = code ? (await db.query('SELECT id FROM rooms WHERE closed_at IS NULL')).rows.map((x) => x.id).filter((id) => roomCode(id) === code) : null;
    const name = !code && q ? q.replace(/[\\%_]/g, '\\$&') : null;
    const r = await db.query(
      `${ROOM_SELECT} WHERE r.closed_at IS NULL AND u.deleted_at IS NULL AND r.id <> $1
         AND ($4::uuid[] IS NULL OR r.id = ANY($4::uuid[]))
         AND ($5::text IS NULL OR r.title ILIKE '%' || $5 || '%' OR r.id::text = $5)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = r.owner AND b.blocked IN ($2, $3)) OR (b.blocked = r.owner AND b.blocker IN ($2, $3)))
         AND NOT EXISTS (SELECT 1 FROM room_cross_pks x WHERE r.id IN (x.red_room, x.blue_room) AND ${live('x.')})
         AND NOT EXISTS (SELECT 1 FROM room_pks p WHERE p.room_id = r.id AND p.status = 'active' AND p.end_at > now())
         AND (NOT $6::boolean OR EXISTS (SELECT 1 FROM room_presence p WHERE p.room = 'oda-' || r.id::text))
       ORDER BY listeners DESC, r.created_at DESC LIMIT 50`,
      [roomId, me.id, mine.owner, only, name, presenceTracked()],
    );
    const rows = await withVoiceCounts(r.rows);
    rows.sort((a, b) => Number(b.listeners) - Number(a.listeners) || new Date(b.created_at) - new Date(a.created_at));
    return { rooms: rows.map(roomOut) };
  },

  async 'POST /api/rooms/pk/cross'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const roomId = roomIdOf(b.room);
    const toId = roomIdOf(b.to);
    const mine = await staffRoom(me, roomId);
    if (typeof b.ref !== 'string' || !REF.test(b.ref)) throw new HttpError(400, 'Geçersiz istek kimliği');
    // A retry of an invite that went through gets that PK back.
    const again = (await db.query('SELECT * FROM room_cross_pks WHERE invited_by = $1 AND ref = $2', [me.id, b.ref])).rows[0];
    if (again) {
      if (again.red_room !== roomId || again.blue_room !== toId) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(again, me.id);
    }
    if (toId === roomId) throw new HttpError(400, 'Odanı kendine davet edemezsin.');
    const duration = int(b.durationMin, 15, 120);
    if (!DURATIONS.includes(duration)) throw new HttpError(400, 'Bu süre seçilemez. İzinli süreler: 15, 30, 60, 120 dakika.');
    limit(`pkinvite:${me.id}`, 10, 'Çok sık PK daveti gönderdin, biraz bekle');
    const other = (await db.query('SELECT r.id, r.owner, r.title, r.closed_at, u.deleted_at FROM rooms r JOIN users u ON u.id = r.owner WHERE r.id = $1', [toId])).rows[0];
    if (!other || other.deleted_at) throw new HttpError(404, 'Oda bulunamadı');
    if (other.closed_at) throw new HttpError(410, 'Bu oda kapandı');
    if (await blockedAny([mine.owner, me.id], [other.owner])) throw new HttpError(403, 'Bu odayı PK’ya davet edemezsin');
    let row;
    try {
      row = await tx(async (c) => {
        await lockRooms(c, [roomId, toId]);
        if (await busy(c, roomId)) throw new HttpError(409, 'Bu odada zaten devam eden bir PK var');
        if (await busy(c, toId)) throw new HttpError(409, `${other.title} şu an başka bir PK’da.`);
        const ins = await c.query(
          `INSERT INTO room_cross_pks (red_room, blue_room, duration_min, invited_by, ref, invite_expires_at)
           VALUES ($1, $2, $3, $4, $5, now() + $6::int * interval '1 millisecond') RETURNING *`,
          [roomId, toId, duration, me.id, b.ref, INVITE_MS],
        );
        return ins.rows[0];
      });
    } catch (e) {
      if (e.code !== '23505') throw e;
      const same = (await db.query('SELECT * FROM room_cross_pks WHERE invited_by = $1 AND ref = $2', [me.id, b.ref])).rows[0];
      if (same) return answer(same, me.id);
      throw new HttpError(409, 'Bu odada zaten devam eden bir PK var');
    }
    announce([roomId, toId], row.id);
    // The other room's owner hears of it on their phone too, unless they take room invites from nobody (or not from me).
    if (other.owner !== me.id && (await mayInvite(db, me.id, other.owner))) {
      notify([other.owner], { title: 'PK daveti', body: `${mine.title} odası odanı ${duration} dakikalık PK’ya davet ediyor`.slice(0, 160), data: { type: 'pk_invite', room: toId } });
    }
    return answer(row, me.id);
  },

  async 'POST /api/rooms/pk/cross/answer'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const roomId = roomIdOf(b.room);
    if (typeof b.accept !== 'boolean') throw new HttpError(400, 'Kabul veya ret seçilmeli');
    const id = typeof b.id === 'string' && /^\d{1,18}$/.test(b.id) ? b.id : null;
    if (!id) throw new HttpError(400, 'Geçersiz davet');
    const mine = await staffRoom(me, roomId, 'PK davetini oda sahibi veya yöneticiler yanıtlar');
    await settle(db, [roomId]);
    const row = (await db.query('SELECT * FROM room_cross_pks WHERE id = $1 AND blue_room = $2', [id, roomId])).rows[0];
    if (!row) throw new HttpError(404, 'Davet bulunamadı');
    const gone = (status) => new HttpError(status === 'expired' ? 410 : 409, status === 'expired' ? 'Davetin süresi doldu' : 'Bu davet artık geçerli değil');
    if (row.status !== 'invite') {
      // A retry of an answer that went through gets it back.
      if (row.answered_by === me.id && (b.accept ? ['active', 'done', 'cancelled'] : ['declined']).includes(row.status)) return answer(row, me.id);
      throw gone(row.status);
    }
    if (b.accept) {
      const red = (await db.query('SELECT owner FROM rooms WHERE id = $1', [row.red_room])).rows[0];
      if (await blockedAny([mine.owner, me.id], [red.owner, row.invited_by].filter(Boolean))) throw new HttpError(403, 'Bu odanın davetini kabul edemezsin');
    }
    const done = await tx(async (c) => {
      await lockRooms(c, [row.red_room, row.blue_room]);
      await settle(c, [roomId]);
      const cur = (await c.query('SELECT status FROM room_cross_pks WHERE id = $1', [id])).rows[0];
      if (cur.status !== 'invite') throw gone(cur.status);
      if (!b.accept) {
        return (await c.query("UPDATE room_cross_pks SET status = 'declined', answered_by = $2, answered_at = now(), ended_at = now() WHERE id = $1 RETURNING *", [id, me.id])).rows[0];
      }
      if ((await inRoomBusy(c, row.red_room)) || (await inRoomBusy(c, row.blue_room))) throw new HttpError(409, 'Odalardan birinde şu an Oda içi PK sürüyor');
      const r = await c.query(
        `UPDATE room_cross_pks SET status = 'active', answered_by = $2, answered_at = now(),
                start_at = now() + $3::int * interval '1 millisecond', end_at = now() + $3::int * interval '1 millisecond' + duration_min * interval '1 minute'
          WHERE id = $1 RETURNING *`,
        [id, me.id, PREP_MS],
      );
      return r.rows[0];
    });
    announce([done.red_room, done.blue_room], done.id);
    return answer(done, me.id);
  },

  /** Either room's staff: an invite is withdrawn (red) or declined (blue); a running PK is cancelled, with no winner. */
  async 'POST /api/rooms/pk/cross/end'(req) {
    const me = await auth(req);
    const roomId = roomIdOf((await readJson(req)).room);
    await staffRoom(me, roomId, 'PK’yı oda sahibi veya yöneticiler bitirebilir');
    const row = await tx(async (c) => {
      const open = (await c.query(`SELECT red_room, blue_room FROM room_cross_pks WHERE ${OPEN} AND (red_room = $1 OR blue_room = $1)`, [roomId])).rows[0];
      if (!open) throw new HttpError(404, 'Odada devam eden PK yok');
      await lockRooms(c, [open.red_room, open.blue_room]);
      await settle(c, [roomId]);
      const r = await c.query(
        `UPDATE room_cross_pks SET
            status = CASE WHEN status = 'invite' AND blue_room = $1 THEN 'declined' ELSE 'cancelled' END,
            answered_by = CASE WHEN status = 'invite' AND blue_room = $1 THEN $2 ELSE answered_by END,
            answered_at = CASE WHEN status = 'invite' AND blue_room = $1 THEN now() ELSE answered_at END,
            end_reason = CASE WHEN status = 'invite' AND blue_room = $1 THEN NULL ELSE 'staff' END,
            ended_by = $2, ended_room = $1, ended_at = now()
          WHERE ${OPEN} AND (red_room = $1 OR blue_room = $1) RETURNING *`,
        [roomId, me.id],
      );
      if (!r.rowCount) throw new HttpError(404, 'Odada devam eden PK yok');
      return r.rows[0];
    });
    announce([row.red_room, row.blue_room], row.id);
    return answer(row, me.id);
  },
};
