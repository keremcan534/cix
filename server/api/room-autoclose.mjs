// A room needs its staff (Güncelleme 4, madde 1). When neither the room's owner nor any of its admins (Süper
// Yönetici, Yönetici: rooms.mjs rankOf, room_admins) has been in its voice room for the live number of minutes
// (Canlı ayarlar › Odalar room_staff_away_minutes, 5: a short drop of the owner's connection must not close it),
// everyone is taken out of the voice room and the room rests: not live until its owner or an admin comes back.
//
// Resting, not the owner's own close (POST /api/rooms/close): a closed room never opens again (closed_at; the
// owner's next "Oda oluştur" makes a new room), so its admins, members, rules, bans and room mutes, all kept by the
// room's id, would be lost. A resting room keeps all of them: rooms.paused_at is set, the phones in it are told why
// ('closed' packet, app lib/live/room-bus parseServerClosed) and the voice room is ended for everyone; it leaves the
// room list for all but its staff, nobody else gets a voice token (rooms.mjs voiceAccess, mayStay), and the owner's
// or an admin's next voice token, or their being seen in its voice room, opens it again. An Odalar arası PK with it
// ends, as on a close. autoCloseRoom is the one place for what such a close does.
//
// Who is in a room: LiveKit's own API when it is set (LIVEKIT_API_URL), else its webhooks (room_presence, only once
// a webhook came since this process started: live.mjs presenceTracked). What can't be read restarts the count of
// that room (all of them when nothing can be read): a room is never closed on what isn't known.
//
//   ROOM_STAFF_SWEEP_MS    how often the rooms are looked at (default 30 s; tests run it fast)
//   ROOM_CLOSE_NOTICE_MS   how long the phones get to read the notice before the voice room ends (default 1500)
import { db, env } from './core.mjs';
import { live } from './live-settings.mjs';
import { deleteVoiceRoom, presenceTracked, roomPacket, voiceParticipants, voiceRoomsNow } from './live.mjs';
import { endCrossPkOfRoom } from './pk-cross.mjs';
import { liveKitName } from './rooms.mjs';

const ROOM = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const NOTICE_MS = (() => {
  const n = Number(env.ROOM_CLOSE_NOTICE_MS ?? 1500);
  return Number.isFinite(n) && n >= 0 && n <= 10_000 ? n : 1500;
})();

/**
 * A room without its staff closes: it rests, everyone in its voice room is told why and taken out, and only its
 * owner or an admin opens it again. `voice` false: nobody is in its voice room, nothing to tell or end. False when
 * the room was already resting or closed (nothing done).
 */
export async function autoCloseRoom(roomId, { voice = true } = {}) {
  const r = await db.query('UPDATE rooms SET paused_at = now(), no_staff_since = NULL WHERE id = $1 AND closed_at IS NULL AND paused_at IS NULL RETURNING id', [roomId]);
  if (!r.rowCount) return false;
  await endCrossPkOfRoom(roomId);
  if (!voice) return true;
  const name = liveKitName(roomId);
  // The notice first, so the phones say why (older apps show their own "Oda sona erdi" when the room ends).
  if (await roomPacket(name, { type: 'closed', reason: 'no_staff', minutes: live().roomStaffAwayMinutes })) await new Promise((ok) => setTimeout(ok, NOTICE_MS));
  await deleteVoiceRoom(name);
  return true;
}

/**
 * Who is in each server room's voice room now: `here` [room id, identity] pairs, `unknown` ids of rooms whose people
 * couldn't be read. Null when nothing is known (no LiveKit API and no webhook yet, or LiveKit can't be reached).
 */
async function whoIsIn() {
  if (env.LIVEKIT_API_URL) {
    const open = await voiceRoomsNow();
    if (!open) return null;
    const here = [];
    const unknown = [];
    for (const x of open) {
      const m = ROOM.exec(x.name);
      if (!m || x.people <= 0) continue;
      try {
        for (const p of await voiceParticipants(x.name)) here.push([m[1], p.identity]);
      } catch (e) {
        console.error('room staff ListParticipants', x.name, String(e).slice(0, 200));
        unknown.push(m[1]);
      }
    }
    return { here, unknown };
  }
  if (!presenceTracked()) return null;
  const r = await db.query("SELECT room, identity FROM room_presence WHERE room LIKE 'oda-%'");
  return { here: r.rows.map((x) => [ROOM.exec(x.room)?.[1], x.identity]).filter((x) => x[0]), unknown: [] };
}

/**
 * One look at every open room: staff in it stops its count (and opens it again if it rested), none starts it, and
 * a room whose count reached the live minutes closes (autoCloseRoom). Returns how many closed.
 */
export async function sweepStaff() {
  const seen = await whoIsIn();
  if (!seen) {
    await db.query('UPDATE rooms SET no_staff_since = NULL WHERE no_staff_since IS NOT NULL');
    return 0;
  }
  // The rooms whose owner or one of whose admins is in the voice room.
  const staffed = (
    await db.query(
      `SELECT DISTINCT r.id FROM unnest($1::uuid[], $2::text[]) h(room, identity) JOIN rooms r ON r.id = h.room
        WHERE h.identity = r.owner::text OR EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = r.id AND a.user_id::text = h.identity)`,
      [seen.here.map((x) => x[0]), seen.here.map((x) => x[1])],
    )
  ).rows.map((x) => x.id);
  // Staff here, or not known: the count stops (it starts again from the next look that knows).
  const stop = [...staffed, ...seen.unknown];
  await db.query('UPDATE rooms SET no_staff_since = NULL WHERE no_staff_since IS NOT NULL AND id = ANY($1::uuid[])', [stop]);
  await db.query('UPDATE rooms SET paused_at = NULL WHERE paused_at IS NOT NULL AND closed_at IS NULL AND id = ANY($1::uuid[])', [staffed]);
  await db.query('UPDATE rooms SET no_staff_since = now() WHERE no_staff_since IS NULL AND closed_at IS NULL AND paused_at IS NULL AND NOT (id = ANY($1::uuid[]))', [stop]);
  const due = await db.query(
    // Never a room this very look found staffed or couldn't read, even if its count changed meanwhile.
    'SELECT id FROM rooms WHERE closed_at IS NULL AND paused_at IS NULL AND no_staff_since <= now() - make_interval(mins => $1) AND NOT (id = ANY($2::uuid[])) ORDER BY no_staff_since LIMIT 200',
    [live().roomStaffAwayMinutes, stop],
  );
  const occupied = new Set(seen.here.map((x) => x[0]));
  const closed = await Promise.all(due.rows.map((x) => autoCloseRoom(x.id, { voice: occupied.has(x.id) })));
  return closed.filter(Boolean).length;
}

let timer = null;
/** ROOM_STAFF_SWEEP_MS: tests run it often; otherwise every 30 seconds. A run still going skips the next tick. */
export function startStaffSweep() {
  if (timer) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    await sweepStaff().catch((e) => console.error('room staff sweep', e.message));
    running = false;
  };
  const every = Number(env.ROOM_STAFF_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 30_000);
  timer.unref();
  void run();
}
export function stopStaffSweep() {
  clearInterval(timer);
  timer = null;
}
