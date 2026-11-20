// Room XP of a gift (rooms.mjs roomLevel: the owner's users.room_xp gives every room of theirs its level), for a gift
// sent in an open server room (gifts.mjs, lucky.mjs; migration 103):
//
//   - inside the gift's transaction, holdRoomXp writes the coins to room_xp_pending for the room's owner and touches no
//     account: the owner's users row is never locked by a gift (send-locks.mjs says why);
//   - right after the commit, addHeldRoomXp moves them to users.room_xp in a statement of its own that deletes the
//     pending rows it adds (each is added once, whoever adds it) and says whether a level was reached;
//   - a row a crash left behind, or one that failed to be added, is added by the sweep (ROOM_XP_SWEEP_MS, 1 minute).
//
// Between the two (milliseconds) a room's level reads users.room_xp without them; Patron koltuğu's level check inside
// the gift adds the owner's pending rows (boss-seat.mjs bossGift).
import { db, env } from './core.mjs';
import { announceRoom } from './live.mjs';
import { liveKitName, roomLevel } from './rooms.mjs';

/** A pending row older than this is the sweep's (its gift's own add is long done or never came). */
const GRACE_SECONDS = 30;

/**
 * Inside a gift's transaction: `xp` coins of gift_events row `eventId` for the owner of open room `roomId`. → the
 * owner, for addHeldRoomXp after the commit (null: no open room, nothing held).
 */
export async function holdRoomXp(c, roomId, eventId, xp) {
  if (!roomId || !(xp > 0)) return null;
  const r = await c.query('INSERT INTO room_xp_pending (event_id, owner, xp) SELECT $2, owner, $3 FROM rooms WHERE id = $1 AND closed_at IS NULL RETURNING owner', [roomId, eventId, xp]);
  return r.rows[0]?.owner ?? null;
}

/**
 * After the commit: the XP held for `owner` by gift_events rows `eventIds` reaches users.room_xp. Rows another add is
 * taking right now are skipped (that one adds them), so two adds never wait for each other. → whether the owner's room
 * level went up. Never throws: a failure is left to the sweep.
 */
export async function addHeldRoomXp(owner, eventIds) {
  if (!owner || !eventIds.length) return false;
  try {
    const r = await db.query(
      `WITH d AS (
         DELETE FROM room_xp_pending WHERE event_id IN (
           SELECT event_id FROM room_xp_pending WHERE owner = $1 AND event_id = ANY($2::bigint[]) ORDER BY event_id FOR UPDATE SKIP LOCKED)
         RETURNING xp)
       UPDATE users SET room_xp = room_xp + (SELECT sum(xp) FROM d) WHERE id = $1 AND EXISTS (SELECT 1 FROM d)
       RETURNING room_xp, (SELECT sum(xp) FROM d) AS added`,
      [owner, eventIds],
    );
    const x = r.rows[0];
    return !!x && roomLevel(Number(x.room_xp)) > roomLevel(Number(x.room_xp) - Number(x.added));
  } catch (e) {
    console.error('room xp', String(e?.message ?? e).slice(0, 200));
    return false;
  }
}

/** The rows nobody added in time, an owner at a time; a level reached is told to the owner's open rooms. */
export async function sweepRoomXp() {
  const r = await db.query(
    `SELECT owner, array_agg(event_id ORDER BY event_id) AS ids FROM room_xp_pending
      WHERE created_at < now() - make_interval(secs => $1) GROUP BY owner LIMIT 200`,
    [GRACE_SECONDS],
  );
  for (const x of r.rows) {
    if (!(await addHeldRoomXp(x.owner, x.ids.map(Number)))) continue;
    const rooms = await db.query('SELECT id FROM rooms WHERE owner = $1 AND closed_at IS NULL', [x.owner]);
    for (const room of rooms.rows) announceRoom(liveKitName(room.id));
  }
  return r.rowCount;
}

let timer = null;
export function startRoomXpSweep() {
  if (timer) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    await sweepRoomXp().catch((e) => console.error('room xp sweep', e.message));
    running = false;
  };
  const every = Number(env.ROOM_XP_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 60_000);
  timer.unref();
  void run();
}
export function stopRoomXpSweep() {
  clearInterval(timer);
  timer = null;
}
