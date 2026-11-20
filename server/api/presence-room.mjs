// "Şu an odada" (Güncelleme 7, item 15): the room someone is in now, on their profile (GET /api/user `room`), so that
// a tap takes me there and the room hears that I came following them (GET /token `via`, live.mjs).
//
// Shown only when the person's "Bulunduğum odayı göster" is on (privacy.mjs, on by default), with no block either way
// (someone who blocked me is a 404 on GET /api/user already), and only for an open server room that is not resting
// (room-autoclose.mjs) and that I could walk into: not one that keeps me out (a kick, its blacklist, a block with its
// owner) nor a private one for its members only. A password room is shown with `locked`; the app says the password
// is asked at the door. A one-to-one call (call-<id>) is never shown.
//
// Where they are: room_presence, which LiveKit's webhooks fill. When no webhook has reached this process
// (live.mjs presenceTracked), LiveKit itself is asked: one ListRooms and a ListParticipants for each room with
// people, shared by every profile opened in the next 10 seconds (voiceWhere), never a fan-out per profile.
import { db, env } from './core.mjs';
import { presenceTracked, voiceParticipants, voiceRoomsNow } from './live.mjs';
import { privacyOf } from './privacy.mjs';

const WHERE_MS = 10_000;
/** At most this many rooms are asked who is in them; the busiest first (LiveKit lists them all). */
const WHERE_ROOMS_MAX = 300;
const ROOM_NAME = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

async function readWhere() {
  const rooms = await voiceRoomsNow();
  if (!rooms) return null;
  const list = rooms
    .filter((x) => ROOM_NAME.test(x.name) && x.people > 0)
    .sort((a, b) => b.people - a.people)
    .slice(0, WHERE_ROOMS_MAX);
  const map = new Map();
  // A few rooms at a time, so a busy moment doesn't open hundreds of requests to LiveKit at once.
  for (let i = 0; i < list.length; i += 8) {
    const part = list.slice(i, i + 8);
    const people = await Promise.all(part.map((x) => voiceParticipants(x.name).catch(() => [])));
    part.forEach((x, k) => {
      for (const p of people[k] ?? []) if (p.identity && !map.has(p.identity)) map.set(p.identity, x.name);
    });
  }
  return map;
}

/**
 * Who is in which voice room as LiveKit sees it now (identity → room name), read at most every 10 s and shared by
 * everyone who asks meanwhile; null when LIVEKIT_API_URL isn't set or LiveKit can't be reached.
 */
let where = { at: 0, map: null, reading: null };
export async function voiceWhere() {
  if (!env.LIVEKIT_API_URL) return null;
  if (Date.now() - where.at < WHERE_MS) return where.map;
  where.reading ??= readWhere()
    .catch((e) => (console.error('livekit where', String(e).slice(0, 200)), null))
    .then((map) => {
      where = { at: Date.now(), map, reading: null };
      return map;
    });
  return where.reading;
}

/** The LiveKit name of the server room `uid` is in now (`oda-<id>`), or null. Calls are never included. */
export async function roomNameOf(uid) {
  if (!presenceTracked()) {
    const map = await voiceWhere();
    if (map) return map.get(String(uid)) ?? null;
  }
  const r = await db.query("SELECT room FROM room_presence WHERE identity = $1 AND room LIKE 'oda-%' ORDER BY joined_at DESC LIMIT 1", [String(uid)]);
  return r.rows[0]?.room ?? null;
}

/**
 * The room `uid` is in now as `viewer` may see it on their profile: { id, title, locked } (locked: the door asks
 * `viewer` for its password), or null (none, hidden by their setting, or a room `viewer` can't enter).
 */
export async function shownRoomOf(uid, viewer) {
  if (uid === viewer) return null;
  if ((await privacyOf(db, uid)).showCurrentRoom === false) return null;
  const m = ROOM_NAME.exec((await roomNameOf(uid)) ?? '');
  if (!m) return null;
  const r = await db.query(
    `WITH r AS (
       SELECT r.*, r.owner = $2 OR EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = r.id AND a.user_id = $2) AS staff,
              EXISTS (SELECT 1 FROM room_members mm WHERE mm.room_id = r.id AND mm.user_id = $2 AND mm.status = 'member') AS member
         FROM rooms r WHERE r.id = $1 AND r.closed_at IS NULL AND r.paused_at IS NULL)
     SELECT r.id, r.title, (r.password_hash IS NOT NULL AND NOT r.staff AND NOT (r.room_type = 'private' AND r.member)) AS locked
       FROM r
      WHERE NOT EXISTS (SELECT 1 FROM room_bans b WHERE b.room_id = r.id AND b.user_id = $2 AND (b.until IS NULL OR b.until > now()))
        AND NOT EXISTS (SELECT 1 FROM blocks k WHERE (k.blocker = r.owner AND k.blocked = $2) OR (k.blocker = $2 AND k.blocked = r.owner))
        AND (r.room_type <> 'private' OR r.password_hash IS NOT NULL OR r.staff OR r.member)`,
    [m[1], viewer],
  );
  const x = r.rows[0];
  return x ? { id: x.id, title: x.title, locked: x.locked } : null;
}
