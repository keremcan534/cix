// Etkinlik Merkezi: events a room's owner applies for, the platform's review, reservations, the run in the live
// room, and the admin's tools. The pure rules (themes, states, time windows, plan checks) are in event-rules.mjs, the
// limits in Canlı ayarlar › Etkinlikler (live-registry.mjs EVENT_RULES).
//
//   GET  /api/events?status=&cat=&when=&sort=&following=&q=&tz=&skip=  → { events, more }   Etkinlik Alanı
//   GET  /api/events/meta                     → { categories, themes, rules, rooms }      the form's choices, my rooms
//   GET  /api/events/one?id=                  → { event }                                  one event, with what I may do
//   GET  /api/events/mine                     → { events, reserved }                       Odamın Etkinlikleri, my places
//   GET  /api/events/room?room=               → { running, upcoming, recent }              the room's own events
//   GET  /api/events/people?id=               → { reservations, participants }             (room staff, admins)
//   POST /api/events          { room, category, theme?, title, description?, rules?, coverUrl?, startsAt, minutes,
//                               capacity?, reservation?, visibility?, draft? }  → { event }  (the room's owner)
//   POST /api/events/edit     { id, …the same }  → { event }   (the owner; an admin keeps the status)
//   POST /api/events/cancel   { id, reason? }    → { event }   (the owner or an admin; before it starts)
//   POST /api/events/start    { id }             → { event }   (the owner or a Süper Yönetici, near its time)
//   POST /api/events/end      { id }             → { event }   (the owner, a Süper Yönetici or an admin)
//   POST /api/events/reserve  { id }             → { event }
//   POST /api/events/unreserve { id }            → { event }
//   POST /api/events/here     { id }             → { counted }  I am in its room while it runs
//   POST /api/events/remind   { id, on }         → { event }   this place's reminders on or off
//   GET  /api/events/reminders                   → { on, kinds }  my reminders for every event, the kinds sent
//   POST /api/events/reminders { on }            → { on, kinds }  (Ayarlar › Bildirimler › Etkinlik hatırlatmaları)
//   GET  /api/events/report?days=&room=          → { report, rooms }  the events of the rooms I own (7, 30, 90 days)
//   GET  /api/admin/events?status=&q=&skip=      → { events, counts, more }                 (admin)
//   POST /api/admin/events/review { id, approve, reason? } → { event }                    (admin)
//   POST /api/admin/events/remove { id, reason }           → { event }                    (admin)
//   GET  /api/admin/events/categories             → { categories }                          (admin)
//   POST /api/admin/events/categories { id?, name, icon, theme, sort, active } → { category } (admin)
//   POST /api/admin/events/categories/remove { id } → { removed }                            (admin)
//   GET  /api/admin/events/report?days=          → { report }                                  (admin) every room
//
// The server alone decides an event's state: the app's clock and timer only show it. A sweep (EVENT_SWEEP_MS) starts
// events whose time has come in an open room, ends those past their time, and ends those left unstarted past the
// grace (a strike for the owner). Closing the room, the room resting without its staff (room-autoclose.mjs), or
// LiveKit closing an empty one ends its running event.
// The sweep also sends the reminders (remindEvents): people with a confirmed place hear of it 1 hour and 15 minutes
// before and when it starts (Canlı ayarlar › Etkinlikler event_reminders_off; each person may turn them off for one
// event or for all), as a push that also reaches the open app (push.mjs notify) and a personal notice in Similar
// Ekibi. event_reminders_sent keeps each one sent, so none goes twice. A cancelled event is told the same way.
// Texts are public: they pass the contact filter (core.mjs publicText).
import {
  DAY,
  ENDED_LISTED_DAYS,
  MAX_OPEN_PER_ROOM,
  MINUTE,
  REMINDER_KINDS,
  REPORT_DAYS,
  STATE_LABEL,
  THEMES,
  mayStartAt,
  offsetOf,
  planError,
  ratio,
  reminderDue,
  reminderText,
  stateOf,
  themeOf,
  windowOf,
} from './event-rules.mjs';
import { HttpError, UUID, auth, db, env, int, limit, publicText, readJson, text, tx } from './core.mjs';
import { announceRoom, openVoiceRooms, presenceTracked } from './live.mjs';
import { live } from './live-settings.mjs';
import { keyOf, verifyUpload } from './media.mjs';
import { notify } from './push.mjs';
import { liveKitName, rankOf, roomLevel, roomRow } from './rooms.mjs';

const PAGE = 20;
const MAX_SKIP = 400;
const ROOM_NAME = /^oda-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** The limits in effect (Canlı ayarlar › Etkinlikler). */
function rules() {
  const s = live();
  return {
    minLevel: s.eventMinRoomLevel,
    minLead: s.eventMinLead,
    maxMinutes: s.eventMaxMinutes,
    maxCapacity: s.eventMaxCapacity,
    grace: s.eventGrace,
    strikeLimit: s.eventStrikeLimit,
    blockDays: s.eventBlockDays,
    // The reminders sent to everyone (the ones not switched off).
    reminders: REMINDER_KINDS.filter((k) => !s.eventRemindersOff.has(k)),
  };
}

const SELECT = `SELECT e.*, c.name AS cat_name, c.icon AS cat_icon, r.title AS room_title, r.closed_at AS room_closed, r.room_type,
                       o.name AS host_name, o.avatar_url AS host_avatar,
                       (SELECT count(*) FROM event_reservations x WHERE x.event_id = e.id AND x.status IN ('confirmed', 'attended', 'missed'))::int AS reserved,
                       (SELECT count(*) FROM event_participants p WHERE p.event_id = e.id)::int AS came,
                       (SELECT x.status FROM event_reservations x WHERE x.event_id = e.id AND x.user_id = $1) AS my_reservation
                  FROM events e JOIN event_categories c ON c.id = e.category JOIN rooms r ON r.id = e.room_id JOIN users o ON o.id = e.owner_id`;
/** Neither of us blocked the other (owner `o`). */
const NOT_BLOCKED = `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = e.owner_id) OR (b.blocked = $1 AND b.blocker = e.owner_id))`;
const iso = (t) => (t ? new Date(t).toISOString() : null);

function view(e) {
  const state = stateOf(e);
  return {
    id: Number(e.id),
    title: e.title,
    description: e.description,
    category: { id: e.category, name: e.cat_name, icon: e.cat_icon },
    theme: e.theme,
    coverUrl: e.cover_url ?? null,
    room: { id: e.room_id, title: e.room_title, closed: !!e.room_closed },
    host: { id: e.owner_id, name: e.host_name ?? 'Üye', avatarUrl: e.host_avatar ?? null },
    startsAt: iso(e.starts_at),
    endsAt: iso(e.ends_at),
    startedAt: iso(e.started_at),
    endedAt: iso(e.ended_at),
    endReason: e.end_reason ?? null,
    state,
    stateLabel: state === 'ended' && e.end_reason === 'not_started' ? 'Başlatılmadı' : STATE_LABEL[state],
    capacity: e.capacity ?? null,
    reservation: e.reservation,
    visibility: e.visibility,
    reserved: e.reserved,
    came: e.came,
    mine: e.my_reservation ?? null,
  };
}

/** An event id from a request (a number, or the string Postgres hands back), or a 400. */
function idOf(v) {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : int(v, 1, Number.MAX_SAFE_INTEGER);
  if (!n) throw new HttpError(400, 'Geçersiz etkinlik');
  return n;
}
async function rowOf(id, me, c = db) {
  const r = await c.query(`${SELECT} WHERE e.id = $2`, [me, idOf(id)]);
  if (!r.rowCount) throw new HttpError(404, 'Etkinlik bulunamadı');
  return r.rows[0];
}
const log = (c, id, actor, action, detail = {}) => c.query('INSERT INTO event_log (event_id, actor, action, detail) VALUES ($1, $2, $3, $4)', [id, actor, action, JSON.stringify(detail)]);
/** A personal notice for each of `ids` in Similar Ekibi (where the app shows one person's notices), opening the event. */
const placeNotices = (c, ids, eventId, title, body) =>
  ids.length
    ? c.query("INSERT INTO team_notices (kind, title, body, link, target) SELECT 'event', $2, $3, $4, t FROM unnest($1::uuid[]) t", [ids, title, body.slice(0, 1000), `/?etkinlik=${eventId}`])
    : null;
/** The line told to people whose place went with a cancelled event. */
const cancelText = (title, reason) => (reason ? `“${title}” iptal edildi. Neden: ${reason}` : `“${title}” iptal edildi.`);

/** What `me` may see and do with row `e`: my rank in its room, whether I am an admin; a 404 when it isn't mine to see. */
async function accessOf(e, me) {
  const admin = me.role === 'admin';
  const rank = await rankOf({ id: e.room_id, owner: e.owner_id }, me.id);
  const blocked = (await db.query(`SELECT ${NOT_BLOCKED} AS ok FROM events e WHERE e.id = $2`, [me.id, e.id])).rows[0]?.ok === false;
  // An application is the room's and the platform's business until it is approved.
  const open = e.status === 'approved' || e.status === 'cancelled';
  if (!admin && rank < 1 && (!open || blocked)) throw new HttpError(404, 'Etkinlik bulunamadı');
  return { admin, rank, owner: e.owner_id === me.id };
}

/** One event with what `me` may do with it (and, for its staff and admins, its history). */
async function detail(id, me) {
  const e = await rowOf(id, me.id);
  const a = await accessOf(e, me);
  const r = rules();
  const state = stateOf(e);
  const now = Date.now();
  const out = {
    ...view(e),
    rules: e.rules,
    rejectReason: e.reject_reason ?? null,
    cancelReason: e.cancel_reason ?? null,
    rank: a.rank,
    can: {
      edit: (a.owner || a.admin) && ['draft', 'review', 'rejected', 'upcoming'].includes(state),
      cancel: (a.owner || a.admin) && ['draft', 'review', 'rejected', 'upcoming'].includes(state),
      start: a.rank >= 2 && state === 'upcoming' && !e.room_closed && mayStartAt(new Date(e.starts_at).getTime(), now, r.grace),
      end: (a.rank >= 2 || a.admin) && state === 'live',
      reserve: state === 'upcoming' && e.reservation && !e.room_closed && !['confirmed'].includes(e.my_reservation ?? ''),
      people: a.rank >= 1 || a.admin,
    },
    // Start window, so the button can say when it opens.
    startFrom: iso(new Date(e.starts_at).getTime() - 10 * MINUTE),
    startUntil: iso(new Date(e.starts_at).getTime() + r.grace * MINUTE),
  };
  // My reminders: this place's (null without a confirmed place), every event's (Ayarlar), and the kinds sent.
  const place = e.my_reservation === 'confirmed' ? (await db.query('SELECT remind FROM event_reservations WHERE event_id = $1 AND user_id = $2', [e.id, me.id])).rows[0] : null;
  out.remind = place ? place.remind : null;
  out.remindersOff = (await db.query('SELECT 1 FROM event_reminder_optout WHERE user_id = $1', [me.id])).rowCount > 0;
  out.reminders = r.reminders;
  // Taken down by the platform (not cancelled by its organiser): a shared link says so.
  out.removed = e.status === 'cancelled' && (await db.query("SELECT 1 FROM event_log WHERE event_id = $1 AND action = 'remove' LIMIT 1", [e.id])).rowCount > 0;
  if (a.rank >= 1 || a.admin) {
    const h = await db.query('SELECT l.action, l.detail, l.created_at, u.name FROM event_log l LEFT JOIN users u ON u.id = l.actor WHERE l.event_id = $1 ORDER BY l.id DESC LIMIT 30', [e.id]);
    out.history = h.rows.map((x) => ({ action: x.action, by: x.name ?? 'Sistem', at: iso(x.created_at), detail: x.detail }));
  }
  return out;
}

// --- Applications ---------------------------------------------------------------------------------------------

/** The owner's events left unstarted in the last 30 days at the limit: until when they can't apply (or null). */
async function blockedUntil(ownerId, r) {
  const x = (await db.query("SELECT count(*)::int AS n, max(ended_at) AS last FROM events WHERE owner_id = $1 AND end_reason = 'not_started' AND ended_at > now() - interval '30 days'", [ownerId])).rows[0];
  if (x.n < r.strikeLimit) return null;
  const until = new Date(x.last).getTime() + r.blockDays * DAY;
  return until > Date.now() ? new Date(until) : null;
}
/** Another event of the room waiting for review or still to come in [from, to). */
const clash = async (c, roomId, from, to, except = 0) =>
  (await c.query("SELECT 1 FROM events WHERE room_id = $1 AND id <> $4 AND status IN ('review', 'approved') AND ended_at IS NULL AND starts_at < $3 AND ends_at > $2 LIMIT 1", [roomId, from, to, except])).rowCount > 0;

/** The application form read and checked; `keepCover` is the cover the event already has (it may stay). */
async function formOf(b, me, room, r, keepCover = null) {
  const title = await publicText(b.title, 3, 40, 'Etkinlik adı', me, 'event', 'title');
  const description = b.description === undefined || b.description === null ? '' : await publicText(b.description, 0, 300, 'Açıklama', me, 'event', 'description');
  const ruleText = b.rules === undefined || b.rules === null ? '' : await publicText(b.rules, 0, 500, 'Kurallar', me, 'event', 'rules');
  const cat = (await db.query('SELECT * FROM event_categories WHERE id = $1 AND active', [typeof b.category === 'string' ? b.category : ''])).rows[0];
  if (!cat) throw new HttpError(400, 'Etkinlik türü seç');
  const level = roomLevel(room.owner_room_xp ?? 0);
  const chosen = b.theme !== undefined && b.theme !== null;
  // Left unchosen, the category's theme, or the plain one when the room hasn't reached it yet.
  const fallback = themeOf(cat.theme);
  const theme = chosen ? themeOf(b.theme) : fallback && fallback.minLevel <= level ? fallback : themeOf('sade');
  if (!theme) throw new HttpError(400, 'Geçersiz tema');
  if (theme.minLevel > level) throw new HttpError(403, `${theme.name} teması Lv.${theme.minLevel} odada açılır`);
  const startsAt = typeof b.startsAt === 'string' && b.startsAt.length <= 40 ? Date.parse(b.startsAt) : NaN;
  const capacity = b.capacity === undefined || b.capacity === null ? null : b.capacity;
  const err = planError({ startsAt, minutes: b.minutes, capacity }, Date.now(), r);
  if (err) throw new HttpError(400, err);
  let cover = null;
  if (b.coverUrl !== undefined && b.coverUrl !== null) {
    if (b.coverUrl !== keepCover) {
      const key = typeof b.coverUrl === 'string' && b.coverUrl.length <= 500 ? keyOf(b.coverUrl, me.id) : null;
      if (!key || !key.startsWith('eventcover/')) throw new HttpError(400, 'Geçersiz kapak görseli');
      await verifyUpload(b.coverUrl, 'eventcover');
    }
    cover = b.coverUrl;
  }
  return {
    title,
    description,
    rules: ruleText,
    category: cat.id,
    theme: theme.id,
    startsAt: new Date(startsAt),
    endsAt: new Date(startsAt + b.minutes * MINUTE),
    capacity,
    reservation: b.reservation !== false,
    // A private room's events are never listed for everyone.
    visibility: b.visibility === 'room' || room.room_type === 'private' ? 'room' : 'public',
    cover,
  };
}

// --- The run ----------------------------------------------------------------------------------------------------

/** Ends running event `id` (reason: owner, time, room_closed, admin); places become attended or missed. */
async function finish(c, id, reason, actor = null) {
  const r = await c.query('UPDATE events SET ended_at = now(), end_reason = $2, updated_at = now() WHERE id = $1 AND started_at IS NOT NULL AND ended_at IS NULL RETURNING room_id', [id, reason]);
  if (!r.rowCount) return null;
  await c.query(
    `UPDATE event_reservations x SET updated_at = now(),
            status = CASE WHEN EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = x.event_id AND p.user_id = x.user_id) THEN 'attended' ELSE 'missed' END
      WHERE x.event_id = $1 AND x.status = 'confirmed'`,
    [id],
  );
  await log(c, id, actor, 'end', { reason });
  return r.rows[0].room_id;
}

/** Starts approved event `id` (actor null: the sweep); everyone in its voice room now counts as come. */
async function begin(id, actor) {
  try {
    return await tx(async (c) => {
      const r = await c.query("UPDATE events SET started_at = now(), updated_at = now() WHERE id = $1 AND status = 'approved' AND started_at IS NULL AND ended_at IS NULL RETURNING room_id", [id]);
      if (!r.rowCount) throw new HttpError(409, 'Etkinlik başlatılamaz');
      const room = r.rows[0].room_id;
      await c.query(
        `INSERT INTO event_participants (event_id, user_id)
         SELECT $1, p.identity::uuid FROM room_presence p JOIN users u ON u.id::text = p.identity WHERE p.room = $2
         ON CONFLICT DO NOTHING`,
        [id, liveKitName(room)],
      );
      if (actor) await c.query('INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, actor]);
      await log(c, id, actor, 'start');
      return room;
    });
  } catch (e) {
    // The room already runs another (events_one_running).
    if (e?.code === '23505') throw new HttpError(409, 'Odada süren başka bir etkinlik var');
    throw e;
  }
}

/** Whether room `roomId`'s voice room is open: someone is in it, as LiveKit or its webhooks say. */
async function voiceOpen(roomId, openNames) {
  if (openNames.has(liveKitName(roomId))) return true;
  return (await db.query('SELECT 1 FROM room_presence WHERE room = $1 LIMIT 1', [liveKitName(roomId)])).rowCount > 0;
}

/**
 * The reminders due now (event-rules.mjs reminderDue), each sent once: a confirmed place whose own reminders and
 * whose person's are on, the kinds Canlı ayarlar sends. Writing event_reminders_sent first and telling only the rows
 * it took means a restart or two sweeps at once never send one twice. Returns how many went.
 */
export async function remindEvents() {
  const on = rules().reminders;
  if (!on.length) return 0;
  const now = Date.now();
  // The places of events running or starting within the hour, without the reminder their moment calls for.
  const r = await db.query(
    `SELECT e.id, e.title, e.starts_at, e.started_at, x.user_id, x.created_at AS reserved_at
       FROM events e
       JOIN event_reservations x ON x.event_id = e.id AND x.status = 'confirmed' AND x.remind
       JOIN users u ON u.id = x.user_id AND u.deleted_at IS NULL
      WHERE e.status = 'approved' AND e.ended_at IS NULL
        AND (e.started_at IS NOT NULL OR e.starts_at <= $1::timestamptz + interval '60 minutes')
        AND NOT EXISTS (SELECT 1 FROM event_reminder_optout o WHERE o.user_id = x.user_id)
        AND NOT EXISTS (
          SELECT 1 FROM event_reminders_sent s WHERE s.event_id = e.id AND s.user_id = x.user_id AND s.starts_at = e.starts_at
             AND s.kind = CASE WHEN e.started_at IS NOT NULL THEN 'start' WHEN e.starts_at <= $1::timestamptz + interval '15 minutes' THEN 'quarter' ELSE 'hour' END)
      LIMIT 5000`,
    [new Date(now)],
  );
  const due = r.rows
    .map((x) => ({ ...x, kind: reminderDue({ startsAt: x.starts_at.getTime(), startedAt: x.started_at ? x.started_at.getTime() : null, reservedAt: x.reserved_at.getTime() }, now, on) }))
    .filter((x) => x.kind)
    // One order for every sweep, so two writing at once wait for each other instead of deadlocking.
    .sort((a, b) => Number(a.id) - Number(b.id) || (a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0));
  if (!due.length) return 0;
  const of = new Map(due.map((x) => [Number(x.id), x]));
  const groups = await tx(async (c) => {
    const took = await c.query(
      `INSERT INTO event_reminders_sent (event_id, user_id, kind, starts_at)
       SELECT * FROM unnest($1::bigint[], $2::uuid[], $3::text[], $4::timestamptz[])
       ON CONFLICT DO NOTHING RETURNING event_id, user_id, kind`,
      [due.map((x) => x.id), due.map((x) => x.user_id), due.map((x) => x.kind), due.map((x) => x.starts_at)],
    );
    // One push and one line per event and kind.
    const out = new Map();
    for (const x of took.rows) {
      const key = `${x.event_id}:${x.kind}`;
      if (!out.has(key)) {
        const e = of.get(Number(x.event_id));
        out.set(key, { id: Number(x.event_id), kind: x.kind, text: reminderText(x.kind, e.title, e.starts_at.getTime() - now), users: [] });
      }
      out.get(key).users.push(x.user_id);
    }
    for (const g of out.values()) await placeNotices(c, g.users, g.id, g.text.title, g.text.body);
    return [...out.values()];
  });
  for (const g of groups) notify(g.users, { ...g.text, data: { type: 'event', id: String(g.id), reminder: g.kind } });
  return groups.reduce((n, g) => n + g.users.length, 0);
}

/** One pass of the sweep: unstarted past the grace, due to start in an open room, past their end, in a closed room; then the reminders. */
export async function sweepEvents() {
  const r = rules();
  const late = await db.query("SELECT id FROM events WHERE status = 'approved' AND started_at IS NULL AND ended_at IS NULL AND starts_at < now() - make_interval(mins => $1)", [r.grace]);
  for (const { id } of late.rows) {
    await tx(async (c) => {
      const x = await c.query("UPDATE events SET ended_at = now(), end_reason = 'not_started', updated_at = now() WHERE id = $1 AND started_at IS NULL AND ended_at IS NULL", [id]);
      if (!x.rowCount) return;
      await c.query("UPDATE event_reservations SET status = 'cancelled', updated_at = now() WHERE event_id = $1 AND status = 'confirmed'", [id]);
      await log(c, id, null, 'not_started');
    });
  }
  const due = await db.query(
    "SELECT e.id, e.room_id FROM events e JOIN rooms r ON r.id = e.room_id WHERE e.status = 'approved' AND e.started_at IS NULL AND e.ended_at IS NULL AND e.starts_at <= now() AND r.closed_at IS NULL AND r.paused_at IS NULL",
  );
  if (due.rowCount) {
    const open = new Set(await openVoiceRooms());
    for (const { id, room_id } of due.rows) {
      if (!(await voiceOpen(room_id, open))) continue;
      try {
        announceRoom(liveKitName(await begin(id, null)));
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
      }
    }
  }
  const over = await db.query(
    `SELECT e.id, (r.closed_at IS NOT NULL OR r.paused_at IS NOT NULL) AS closed FROM events e JOIN rooms r ON r.id = e.room_id
      WHERE e.started_at IS NOT NULL AND e.ended_at IS NULL AND (e.ends_at <= now() OR r.closed_at IS NOT NULL OR r.paused_at IS NOT NULL)`,
  );
  for (const { id, closed } of over.rows) {
    const room = await tx((c) => finish(c, id, closed ? 'room_closed' : 'time'));
    if (room) announceRoom(liveKitName(room));
  }
  await remindEvents();
}
let timer = null;
export function startEventSweep() {
  if (timer) return;
  const run = () => sweepEvents().catch((e) => console.error('event sweep', e.message));
  const every = Number(env.EVENT_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 30_000);
  timer.unref();
}
export function stopEventSweep() {
  clearInterval(timer);
  timer = null;
}

/** Someone joined voice room `name`: they come to its running event. Never throws (live.mjs webhook). */
export async function eventJoined(name, uid) {
  const m = ROOM_NAME.exec(name);
  if (!m || !UUID.test(uid)) return;
  try {
    await db.query(
      `INSERT INTO event_participants (event_id, user_id)
       SELECT e.id, $2 FROM events e WHERE e.room_id = $1 AND e.started_at IS NOT NULL AND e.ended_at IS NULL AND EXISTS (SELECT 1 FROM users WHERE id = $2)
       ON CONFLICT DO NOTHING`,
      [m[1], uid],
    );
  } catch (e) {
    console.error('event join', e.message);
  }
}
/** LiveKit closed voice room `name` (everyone left): its running event ends. Never throws. */
export async function eventRoomFinished(name) {
  const m = ROOM_NAME.exec(name);
  if (!m) return;
  try {
    const r = await db.query('SELECT id FROM events WHERE room_id = $1 AND started_at IS NOT NULL AND ended_at IS NULL', [m[1]]);
    for (const { id } of r.rows) await tx((c) => finish(c, id, 'room_closed'));
  } catch (e) {
    console.error('event room finished', e.message);
  }
}
/**
 * The owner closed room `roomId` (rooms.mjs): its running event ends and the ones still to come are cancelled
 * (their places with them). Never throws.
 */
export async function closeRoomEvents(roomId, actor) {
  try {
    const running = await db.query('SELECT id FROM events WHERE room_id = $1 AND started_at IS NOT NULL AND ended_at IS NULL', [roomId]);
    for (const { id } of running.rows) await tx((c) => finish(c, id, 'room_closed', actor));
    const later = await db.query("SELECT id, title FROM events WHERE room_id = $1 AND status IN ('draft', 'review', 'approved') AND started_at IS NULL AND ended_at IS NULL", [roomId]);
    for (const { id, title } of later.rows) {
      const who = await tx(async (c) => {
        await c.query("UPDATE events SET status = 'cancelled', cancel_reason = 'Oda kapatıldı', cancelled_by = $2, cancelled_at = now(), updated_at = now() WHERE id = $1", [id, actor]);
        await log(c, id, actor, 'cancel', { reason: 'Oda kapatıldı' });
        const ids = (await c.query("SELECT user_id FROM event_reservations WHERE event_id = $1 AND status = 'confirmed'", [id])).rows.map((x) => x.user_id);
        await placeNotices(c, ids, id, 'Etkinlik iptal edildi', cancelText(title, 'Oda kapatıldı.'));
        return ids;
      });
      if (who.length) notify(who, { title: 'Etkinlik iptal edildi', body: title, data: { type: 'event', id: String(id) } });
    }
  } catch (e) {
    console.error('event room close', e.message);
  }
}
/** The room's running event, else its next approved one within a day: for GET /api/room (the in-room banner). */
export async function roomEventBrief(roomId) {
  const r = await db.query(
    `SELECT id, title, theme, starts_at, ends_at, started_at,
            (SELECT count(*) FROM event_participants p WHERE p.event_id = e.id)::int AS came
       FROM events e WHERE room_id = $1 AND status = 'approved' AND ended_at IS NULL AND starts_at < now() + interval '1 day'
      ORDER BY (started_at IS NULL), starts_at LIMIT 1`,
    [roomId],
  );
  const e = r.rows[0];
  if (!e) return null;
  return { id: Number(e.id), title: e.title, theme: e.theme, state: e.started_at ? 'live' : 'upcoming', startsAt: iso(e.starts_at), endsAt: iso(e.ends_at), startedAt: iso(e.started_at), came: e.came };
}

// --- Lists --------------------------------------------------------------------------------------------------

const SORTS = {
  // Running first, then the soonest to start, then the latest ended.
  soon: `(CASE WHEN e.started_at IS NOT NULL AND e.ended_at IS NULL THEN 0 WHEN e.ended_at IS NULL THEN 1 ELSE 2 END),
         (CASE WHEN e.ended_at IS NULL THEN e.starts_at END) ASC, e.ended_at DESC`,
  popular: '(reserved + came) DESC, e.starts_at ASC',
  new: 'e.created_at DESC',
};
const STATES = ['upcoming', 'live', 'ended'];
const likeOf = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function adminOnly(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

// --- Reports -------------------------------------------------------------------------------------------------

/** The report's period from a query value: 7, 30 or 90 days (30 when left out), else a 400. */
function daysOf(v) {
  const n = v === null || v === '' ? 30 : Number(v);
  if (!REPORT_DAYS.includes(n)) throw new HttpError(400, 'Geçersiz dönem');
  return n;
}

/**
 * The events of the last `days` days, counted: those applied for then, and those whose start came then (drafts
 * never sent are left out). Their outcome (approved at review, rejected, cancelled), places, the people who came,
 * the attendance rate (came of those with a place, among events that ended), the average came per event that ran, the
 * categories most people came to, how they ended, and the latest starts and ends. `owner`: only the rooms they own;
 * `room`: only that room.
 */
async function report(days, { owner = null, room = null } = {}) {
  const args = [days];
  const where = ["e.status <> 'draft'", '(e.created_at >= now() - make_interval(days => $1) OR (e.starts_at >= now() - make_interval(days => $1) AND e.starts_at <= now()))'];
  const scope = [];
  if (owner) {
    args.push(owner);
    scope.push(`r.owner = $${args.length}`);
  }
  if (room) {
    args.push(room);
    scope.push(`e.room_id = $${args.length}`);
  }
  const rows = (
    await db.query(
      `SELECT e.id, e.category, c.name AS cat_name, e.status, e.started_at, e.ended_at, e.end_reason,
              EXISTS (SELECT 1 FROM event_log l WHERE l.event_id = e.id AND l.action = 'approve') AS approved,
              (SELECT count(*) FROM event_reservations x WHERE x.event_id = e.id AND x.status IN ('confirmed', 'attended', 'missed'))::int AS reserved,
              (SELECT count(*) FROM event_reservations x WHERE x.event_id = e.id AND x.status = 'attended')::int AS attended,
              (SELECT count(*) FROM event_reservations x WHERE x.event_id = e.id AND x.status = 'missed')::int AS missed,
              (SELECT count(*) FROM event_participants q WHERE q.event_id = e.id)::int AS came
         FROM events e JOIN rooms r ON r.id = e.room_id JOIN event_categories c ON c.id = e.category
        WHERE ${[...where, ...scope].join(' AND ')}`,
      args,
    )
  ).rows;
  const sum = (f) => rows.reduce((n, x) => n + f(x), 0);
  const count = (f) => rows.filter(f).length;
  const ran = rows.filter((x) => x.started_at);
  const attended = sum((x) => x.attended);
  const missed = sum((x) => x.missed);
  const cats = new Map();
  for (const x of rows) {
    const c = cats.get(x.category) ?? { id: x.category, name: x.cat_name, events: 0, reservations: 0, participants: 0 };
    c.events += 1;
    c.reservations += x.reserved;
    c.participants += x.came;
    cats.set(x.category, c);
  }
  const ends = { owner: 0, time: 0, room_closed: 0, not_started: 0, admin: 0 };
  for (const x of rows) if (x.ended_at && x.end_reason in ends) ends[x.end_reason] += 1;
  // The starts and ends in the period (by when they happened), newest first.
  const records = await db.query(
    `SELECT l.action, l.detail, l.created_at, u.name AS by_name, e.id, e.title, r.title AS room_title
       FROM event_log l JOIN events e ON e.id = l.event_id JOIN rooms r ON r.id = e.room_id LEFT JOIN users u ON u.id = l.actor
      WHERE l.action IN ('start', 'end', 'not_started') AND l.created_at >= now() - make_interval(days => $1) ${scope.map((x) => `AND ${x}`).join(' ')}
      ORDER BY l.id DESC LIMIT 20`,
    args,
  );
  const participants = sum((x) => x.came);
  return {
    days,
    since: iso(Date.now() - days * DAY),
    events: rows.length,
    approved: count((x) => x.approved),
    rejected: count((x) => x.status === 'rejected'),
    cancelled: count((x) => x.status === 'cancelled'),
    review: count((x) => x.status === 'review'),
    started: ran.length,
    reservations: sum((x) => x.reserved),
    attended,
    missed,
    participants,
    attendanceRate: ratio(attended, attended + missed),
    avgParticipants: ran.length ? Math.round((participants / ran.length) * 10) / 10 : null,
    categories: [...cats.values()].sort((a, b) => b.participants - a.participants || b.reservations - a.reservations || b.events - a.events || a.name.localeCompare(b.name, 'tr')).slice(0, 5),
    ends,
    records: records.rows.map((x) => ({
      event: { id: Number(x.id), title: x.title },
      room: x.room_title,
      action: x.action,
      reason: x.action === 'end' ? (x.detail?.reason ?? null) : null,
      by: x.by_name ?? 'Sistem',
      at: iso(x.created_at),
    })),
  };
}

/** Turns a 'category' name into a free id (Türkçe letters to plain ones). */
function slugOf(name) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  const s = name
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüİ]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
  return s.length >= 2 ? s : `tur-${Date.now().toString(36).slice(-5)}`;
}

export const eventRoutes = {
  async 'GET /api/events'(req, url) {
    const me = await auth(req);
    const q = url.searchParams;
    const now = Date.now();
    const args = [me.id];
    const where = [
      "e.status = 'approved'",
      "e.visibility = 'public'",
      "r.room_type <> 'private'",
      'o.deleted_at IS NULL',
      NOT_BLOCKED,
      `(e.ended_at IS NULL OR e.ended_at > now() - interval '${ENDED_LISTED_DAYS} days')`,
      "(e.end_reason IS NULL OR e.end_reason <> 'not_started')",
    ];
    const status = q.get('status');
    if (status === 'upcoming') where.push('e.started_at IS NULL AND e.ended_at IS NULL');
    else if (status === 'live') where.push('e.started_at IS NOT NULL AND e.ended_at IS NULL');
    else if (status === 'ended') where.push('e.ended_at IS NOT NULL');
    else if (status && status !== 'all') throw new HttpError(400, 'Geçersiz durum');
    const cat = q.get('cat');
    if (cat) {
      args.push(cat.slice(0, 24));
      where.push(`e.category = $${args.length}`);
    }
    const w = q.get('when') ? windowOf(q.get('when'), now, offsetOf(q.get('tz'))) : null;
    if (q.get('when') && !w) throw new HttpError(400, 'Geçersiz tarih');
    if (w?.onlyRunning) where.push('e.started_at IS NOT NULL AND e.ended_at IS NULL');
    else if (w) {
      args.push(new Date(w.from), new Date(w.to));
      const inWindow = `(e.starts_at >= $${args.length - 1} AND e.starts_at < $${args.length})`;
      where.push(w.running ? `(${inWindow} OR (e.started_at IS NOT NULL AND e.ended_at IS NULL))` : inWindow);
    }
    if (q.get('following') === '1') where.push('EXISTS (SELECT 1 FROM room_follows f WHERE f.owner_id = e.owner_id AND f.user_id = $1)');
    const search = (q.get('q') ?? '').trim().slice(0, 40);
    if (search) {
      args.push(likeOf(search));
      const n = args.length;
      where.push(`(e.title ILIKE $${n} OR r.title ILIKE $${n} OR o.name ILIKE $${n} OR c.name ILIKE $${n})`);
    }
    const sort = SORTS[q.get('sort') ?? 'soon'];
    if (!sort) throw new HttpError(400, 'Geçersiz sıralama');
    const skip = Math.min(MAX_SKIP, Math.max(0, Number.parseInt(q.get('skip') ?? '0', 10) || 0));
    const r = await db.query(`SELECT * FROM (${SELECT} WHERE ${where.join(' AND ')}) e ORDER BY ${sort} LIMIT ${PAGE + 1} OFFSET ${skip}`, args);
    return { events: r.rows.slice(0, PAGE).map(view), more: r.rowCount > PAGE };
  },

  async 'GET /api/events/meta'(req) {
    const me = await auth(req);
    const r = rules();
    const cats = await db.query('SELECT id, name, icon, theme FROM event_categories WHERE active ORDER BY sort, name');
    const rooms = await db.query('SELECT r.id, r.title, u.room_xp FROM rooms r JOIN users u ON u.id = r.owner WHERE r.owner = $1 AND r.closed_at IS NULL ORDER BY r.created_at DESC', [me.id]);
    const until = rooms.rowCount ? await blockedUntil(me.id, r) : null;
    return {
      categories: cats.rows,
      themes: THEMES,
      rules: { minRoomLevel: r.minLevel, minLeadMinutes: r.minLead, maxMinutes: r.maxMinutes, maxCapacity: r.maxCapacity, graceMinutes: r.grace },
      rooms: rooms.rows.map((x) => ({ id: x.id, title: x.title, level: roomLevel(x.room_xp ?? 0) })),
      blockedUntil: iso(until),
    };
  },

  async 'GET /api/events/one'(req, url) {
    const me = await auth(req);
    return { event: await detail(url.searchParams.get('id'), me) };
  },

  async 'GET /api/events/mine'(req) {
    const me = await auth(req);
    // The rooms I own or help run, every state; the last 60 days of the ended and the cancelled.
    const r = await db.query(
      `${SELECT} WHERE (e.owner_id = $1 OR EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = e.room_id AND a.user_id = $1))
                   AND (e.ended_at IS NULL OR e.ended_at > now() - interval '60 days')
                   AND (e.cancelled_at IS NULL OR e.cancelled_at > now() - interval '60 days')
        ORDER BY e.starts_at DESC LIMIT 100`,
      [me.id],
    );
    const x = await db.query(`${SELECT} JOIN event_reservations m ON m.event_id = e.id AND m.user_id = $1 ORDER BY e.starts_at DESC LIMIT 60`, [me.id]);
    return { events: r.rows.map(view), reserved: x.rows.map(view) };
  },

  async 'GET /api/events/room'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    const r = await db.query(
      `${SELECT} WHERE e.room_id = $2 AND e.status = 'approved'
                   AND (e.ended_at IS NULL OR e.ended_at > now() - interval '7 days')
                   AND (e.end_reason IS NULL OR e.end_reason <> 'not_started')
        ORDER BY e.starts_at LIMIT 30`,
      [me.id, room.id],
    );
    const all = r.rows.map(view);
    return {
      running: all.find((e) => e.state === 'live') ?? null,
      upcoming: all.filter((e) => e.state === 'upcoming'),
      recent: all.filter((e) => e.state === 'ended').reverse(),
    };
  },

  async 'GET /api/events/people'(req, url) {
    const me = await auth(req);
    const e = await rowOf(url.searchParams.get('id'), me.id);
    const a = await accessOf(e, me);
    if (a.rank < 1 && !a.admin) throw new HttpError(403, 'Katılımcıları oda yetkilileri görür');
    const res = await db.query(
      'SELECT x.user_id, x.status, x.created_at, u.name, u.avatar_url FROM event_reservations x JOIN users u ON u.id = x.user_id WHERE x.event_id = $1 ORDER BY x.created_at LIMIT 500',
      [e.id],
    );
    const came = await db.query('SELECT p.user_id, p.joined_at, u.name, u.avatar_url FROM event_participants p JOIN users u ON u.id = p.user_id WHERE p.event_id = $1 ORDER BY p.joined_at LIMIT 500', [e.id]);
    return {
      reservations: res.rows.map((x) => ({ user: { id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null }, status: x.status, at: iso(x.created_at) })),
      participants: came.rows.map((x) => ({ user: { id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null }, at: iso(x.joined_at) })),
    };
  },

  async 'POST /api/events'(req) {
    const me = await auth(req);
    const b = await readJson(req, 20_000);
    limit(`event-apply:${me.id}`, 10, 'Çok sık başvuru yapıyorsun, biraz bekle');
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if (room.owner !== me.id) throw new HttpError(403, 'Etkinlik başvurusunu oda sahibi yapar');
    const r = rules();
    if (roomLevel(room.owner_room_xp ?? 0) < r.minLevel) throw new HttpError(403, `Etkinlik başvurusu Lv.${r.minLevel} ve üstü odalar için`);
    const until = await blockedUntil(me.id, r);
    if (until) throw new HttpError(403, `Zamanında başlatılmayan etkinlikler nedeniyle ${until.toLocaleDateString('tr-TR')} tarihine kadar yeni başvuru yapamazsın`);
    const f = await formOf(b, me, room, r);
    const draft = b.draft === true;
    const id = await tx(async (c) => {
      // One application at a time per room, so two can't both pass the clash check.
      await c.query('SELECT 1 FROM rooms WHERE id = $1 FOR UPDATE', [room.id]);
      const open = (await c.query("SELECT count(*)::int AS n FROM events WHERE room_id = $1 AND status IN ('draft', 'review', 'approved') AND ended_at IS NULL", [room.id])).rows[0].n;
      if (open >= MAX_OPEN_PER_ROOM) throw new HttpError(409, `Bir odanın en fazla ${MAX_OPEN_PER_ROOM} bekleyen etkinliği olabilir`);
      if (!draft && (await clash(c, room.id, f.startsAt, f.endsAt))) throw new HttpError(409, 'Bu saatlerde odanın başka bir etkinliği var');
      const x = await c.query(
        `INSERT INTO events (room_id, owner_id, created_by, category, theme, title, description, rules, cover_url, starts_at, ends_at, capacity, reservation, visibility, status, submitted_at)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [room.id, me.id, f.category, f.theme, f.title, f.description, f.rules, f.cover, f.startsAt, f.endsAt, f.capacity, f.reservation, f.visibility, draft ? 'draft' : 'review', draft ? null : new Date()],
      );
      await log(c, x.rows[0].id, me.id, draft ? 'draft' : 'apply');
      return x.rows[0].id;
    });
    return { event: await detail(id, me) };
  },

  async 'POST /api/events/edit'(req) {
    const me = await auth(req);
    const b = await readJson(req, 20_000);
    limit(`event-apply:${me.id}`, 20, 'Çok sık değişiklik yapıyorsun, biraz bekle');
    const e = await rowOf(b.id, me.id);
    const a = await accessOf(e, me);
    if (!a.owner && !a.admin) throw new HttpError(403, 'Etkinliği oda sahibi düzenler');
    if (!['draft', 'review', 'rejected', 'upcoming'].includes(stateOf(e))) throw new HttpError(409, 'Başlamış, bitmiş ya da iptal edilmiş etkinlik düzenlenemez');
    const room = await roomRow(e.room_id);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const f = await formOf(b, me, room, rules(), e.cover_url);
    // The owner's change goes back to review (a draft stays one if they keep it so); an admin's keeps the status.
    const status = a.admin && !a.owner ? e.status : b.draft === true && e.status === 'draft' ? 'draft' : 'review';
    await tx(async (c) => {
      await c.query('SELECT 1 FROM rooms WHERE id = $1 FOR UPDATE', [e.room_id]);
      if (status !== 'draft' && (await clash(c, e.room_id, f.startsAt, f.endsAt, e.id))) throw new HttpError(409, 'Bu saatlerde odanın başka bir etkinliği var');
      await c.query(
        `UPDATE events SET category = $2, theme = $3, title = $4, description = $5, rules = $6, cover_url = $7, starts_at = $8, ends_at = $9,
                capacity = $10, reservation = $11, visibility = $12, status = $13, reject_reason = CASE WHEN $13 = 'review' THEN NULL ELSE reject_reason END,
                submitted_at = CASE WHEN $13 = 'review' AND status <> 'review' THEN now() ELSE submitted_at END, updated_at = now()
          WHERE id = $1`,
        [e.id, f.category, f.theme, f.title, f.description, f.rules, f.cover, f.startsAt, f.endsAt, f.capacity, f.reservation, f.visibility, status],
      );
      await log(c, e.id, me.id, 'edit', { status });
    });
    if (stateOf(e) === 'upcoming') announceRoom(liveKitName(e.room_id));
    return { event: await detail(e.id, me) };
  },

  async 'POST /api/events/cancel'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const e = await rowOf(b.id, me.id);
    const a = await accessOf(e, me);
    if (!a.owner && !a.admin) throw new HttpError(403, 'Etkinliği oda sahibi iptal eder');
    if (!['draft', 'review', 'rejected', 'upcoming'].includes(stateOf(e))) throw new HttpError(409, stateOf(e) === 'live' ? 'Süren etkinlik iptal edilemez; bitirebilirsin' : 'Etkinlik zaten sona erdi');
    const reason = b.reason === undefined || b.reason === null || b.reason === '' ? null : await publicText(b.reason, 3, 300, 'İptal nedeni', me, 'event', 'cancel');
    const who = await tx(async (c) => {
      await c.query("UPDATE events SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3, cancelled_at = now(), updated_at = now() WHERE id = $1", [e.id, reason, me.id]);
      await log(c, e.id, me.id, 'cancel', reason ? { reason } : {});
      const ids = (await c.query("SELECT user_id FROM event_reservations WHERE event_id = $1 AND status = 'confirmed'", [e.id])).rows.map((x) => x.user_id);
      await placeNotices(c, ids, e.id, 'Etkinlik iptal edildi', cancelText(e.title, reason));
      return ids;
    });
    if (who.length) notify(who, { title: 'Etkinlik iptal edildi', body: e.title, data: { type: 'event', id: String(e.id) } });
    if (e.status === 'approved') announceRoom(liveKitName(e.room_id));
    return { event: await detail(e.id, me) };
  },

  async 'POST /api/events/start'(req) {
    const me = await auth(req);
    const e = await rowOf((await readJson(req)).id, me.id);
    const a = await accessOf(e, me);
    if (a.rank < 2) throw new HttpError(403, 'Etkinliği oda sahibi veya Süper Yönetici başlatır');
    if (stateOf(e) !== 'upcoming') throw new HttpError(409, 'Etkinlik başlatılamaz');
    if (e.room_closed) throw new HttpError(410, 'Oda kapandı');
    const r = rules();
    const at = new Date(e.starts_at).getTime();
    if (!mayStartAt(at, Date.now(), r.grace)) {
      throw new HttpError(409, Date.now() < at ? 'Etkinlik başlangıçtan en erken 10 dakika önce başlatılabilir' : 'Başlatma süresi geçti');
    }
    announceRoom(liveKitName(await begin(e.id, me.id)));
    // Those with a place hear it has started now, not at the next sweep.
    remindEvents().catch((err) => console.error('event reminders', err.message));
    return { event: await detail(e.id, me) };
  },

  async 'POST /api/events/end'(req) {
    const me = await auth(req);
    const e = await rowOf((await readJson(req)).id, me.id);
    const a = await accessOf(e, me);
    if (a.rank < 2 && !a.admin) throw new HttpError(403, 'Etkinliği oda sahibi veya Süper Yönetici bitirir');
    if (stateOf(e) !== 'live') throw new HttpError(409, 'Etkinlik sürmüyor');
    const room = await tx((c) => finish(c, e.id, a.rank >= 2 ? 'owner' : 'admin', me.id));
    if (room) announceRoom(liveKitName(room));
    return { event: await detail(e.id, me) };
  },

  async 'POST /api/events/reserve'(req) {
    const me = await auth(req);
    const id = idOf((await readJson(req)).id);
    limit(`event-reserve:${me.id}`, 60);
    await tx(async (c) => {
      // The event row is held so two last places can't be taken at once.
      const e = (await c.query(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!e) throw new HttpError(404, 'Etkinlik bulunamadı');
      const room = (await c.query('SELECT closed_at, room_type FROM rooms WHERE id = $1', [e.room_id])).rows[0];
      if (stateOf(e) !== 'upcoming') throw new HttpError(409, stateOf(e) === 'live' ? 'Etkinlik başladı; odasına katılabilirsin' : 'Bu etkinliğe yer ayırtılamaz');
      if (!e.reservation) throw new HttpError(409, 'Bu etkinlik yer ayırtmadan katılıma açık');
      if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
      const blocked = await c.query('SELECT 1 FROM blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1)', [me.id, e.owner_id]);
      if (blocked.rowCount) throw new HttpError(404, 'Etkinlik bulunamadı');
      const banned = await c.query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (until IS NULL OR until > now())', [e.room_id, me.id]);
      if (banned.rowCount) throw new HttpError(403, 'Bu odaya giremiyorsun');
      const mine = (await c.query('SELECT status FROM event_reservations WHERE event_id = $1 AND user_id = $2', [id, me.id])).rows[0];
      if (mine?.status === 'confirmed') throw new HttpError(409, 'Bu etkinliğe zaten yer ayırttın');
      const cap = Math.min(e.capacity ?? Infinity, rules().maxCapacity);
      const taken = (await c.query("SELECT count(*)::int AS n FROM event_reservations WHERE event_id = $1 AND status = 'confirmed'", [id])).rows[0].n;
      if (taken >= cap) throw new HttpError(409, 'Etkinliğin kontenjanı doldu');
      await c.query(
        `INSERT INTO event_reservations (event_id, user_id) VALUES ($1, $2)
         ON CONFLICT (event_id, user_id) DO UPDATE SET status = 'confirmed', created_at = now(), updated_at = now()`,
        [id, me.id],
      );
    });
    return { event: await detail(id, me) };
  },

  async 'POST /api/events/unreserve'(req) {
    const me = await auth(req);
    const e = await rowOf((await readJson(req)).id, me.id);
    if (e.my_reservation !== 'confirmed') throw new HttpError(409, 'Bu etkinlikte yerin yok');
    if (stateOf(e) !== 'upcoming') throw new HttpError(409, 'Başlamış etkinlikte yer iptal edilemez');
    await db.query("UPDATE event_reservations SET status = 'cancelled', updated_at = now() WHERE event_id = $1 AND user_id = $2 AND status = 'confirmed'", [e.id, me.id]);
    return { event: await detail(e.id, me) };
  },

  async 'POST /api/events/here'(req) {
    const me = await auth(req);
    const e = await rowOf((await readJson(req)).id, me.id);
    limit(`event-here:${me.id}`, 30);
    if (stateOf(e) !== 'live') return { counted: false };
    // When the voice room's webhooks reach us, only someone they put in the room counts.
    if (presenceTracked()) {
      const inside = await db.query('SELECT 1 FROM room_presence WHERE room = $1 AND identity = $2', [liveKitName(e.room_id), me.id]);
      if (!inside.rowCount) return { counted: false };
    }
    await db.query('INSERT INTO event_participants (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [e.id, me.id]);
    return { counted: true };
  },

  async 'POST /api/events/remind'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.on !== 'boolean') throw new HttpError(400, 'Hatırlatmayı aç ya da kapat');
    const e = await rowOf(b.id, me.id);
    if (e.my_reservation !== 'confirmed') throw new HttpError(409, 'Hatırlatma, yer ayırttığın etkinlikler için');
    await db.query("UPDATE event_reservations SET remind = $3 WHERE event_id = $1 AND user_id = $2 AND status = 'confirmed'", [e.id, me.id, b.on]);
    return { event: await detail(e.id, me) };
  },

  async 'GET /api/events/reminders'(req) {
    const me = await auth(req);
    const off = (await db.query('SELECT 1 FROM event_reminder_optout WHERE user_id = $1', [me.id])).rowCount > 0;
    return { on: !off, kinds: rules().reminders };
  },

  async 'POST /api/events/reminders'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.on !== 'boolean') throw new HttpError(400, 'Hatırlatmaları aç ya da kapat');
    if (b.on) await db.query('DELETE FROM event_reminder_optout WHERE user_id = $1', [me.id]);
    else await db.query('INSERT INTO event_reminder_optout (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [me.id]);
    return { on: b.on, kinds: rules().reminders };
  },

  async 'GET /api/events/report'(req, url) {
    const me = await auth(req);
    const days = daysOf(url.searchParams.get('days'));
    // Only the rooms I own; one of them when asked.
    const rooms = (await db.query('SELECT id, title, closed_at FROM rooms WHERE owner = $1 ORDER BY created_at DESC LIMIT 50', [me.id])).rows;
    const room = url.searchParams.get('room');
    if (room && !rooms.some((r) => r.id === room)) throw new HttpError(403, 'Odanın raporunu oda sahibi görür');
    return { report: await report(days, { owner: me.id, room: room || null }), rooms: rooms.map((r) => ({ id: r.id, title: r.title, closed: !!r.closed_at })) };
  },

  // --- Admin ----------------------------------------------------------------------------------------------------
  async 'GET /api/admin/events/report'(req, url) {
    await adminOnly(req);
    return { report: await report(daysOf(url.searchParams.get('days'))) };
  },

  async 'GET /api/admin/events'(req, url) {
    const me = await adminOnly(req);
    const q = url.searchParams;
    const args = [me.id];
    const where = [];
    const status = q.get('status') ?? 'review';
    if (['draft', 'review', 'rejected', 'cancelled'].includes(status)) {
      args.push(status);
      where.push(`e.status = $${args.length}`);
    } else if (STATES.includes(status)) {
      where.push("e.status = 'approved'", status === 'upcoming' ? 'e.started_at IS NULL AND e.ended_at IS NULL' : status === 'live' ? 'e.started_at IS NOT NULL AND e.ended_at IS NULL' : 'e.ended_at IS NOT NULL');
    } else if (status !== 'all') throw new HttpError(400, 'Geçersiz durum');
    const search = (q.get('q') ?? '').trim().slice(0, 40);
    if (search) {
      args.push(likeOf(search));
      const n = args.length;
      where.push(`(e.title ILIKE $${n} OR r.title ILIKE $${n} OR o.name ILIKE $${n})`);
    }
    const skip = Math.min(MAX_SKIP, Math.max(0, Number.parseInt(q.get('skip') ?? '0', 10) || 0));
    const order = status === 'review' ? 'e.submitted_at ASC NULLS LAST' : 'e.starts_at DESC';
    const r = await db.query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order} LIMIT ${PAGE + 1} OFFSET ${skip}`, args);
    const counts = (
      await db.query(
        `SELECT count(*) FILTER (WHERE status = 'review')::int AS review,
                count(*) FILTER (WHERE status = 'approved' AND started_at IS NULL AND ended_at IS NULL)::int AS upcoming,
                count(*) FILTER (WHERE status = 'approved' AND started_at IS NOT NULL AND ended_at IS NULL)::int AS live
           FROM events`,
      )
    ).rows[0];
    return { events: r.rows.slice(0, PAGE).map((e) => ({ ...view(e), rules: e.rules, submittedAt: iso(e.submitted_at), rejectReason: e.reject_reason ?? null })), counts, more: r.rowCount > PAGE };
  },

  async 'POST /api/admin/events/review'(req) {
    const me = await adminOnly(req);
    const b = await readJson(req);
    if (typeof b.approve !== 'boolean') throw new HttpError(400, 'Onayla ya da reddet');
    const reason = b.approve ? null : text(b.reason, 3, 300, 'Ret gerekçesi');
    const e = await rowOf(b.id, me.id);
    if (e.status !== 'review') throw new HttpError(409, 'Bu başvuru incelemede değil');
    if (b.approve && new Date(e.starts_at).getTime() <= Date.now()) throw new HttpError(409, 'Başlangıç saati geçti; oda sahibi yeni bir saat seçmeli');
    await tx(async (c) => {
      await c.query('SELECT 1 FROM rooms WHERE id = $1 FOR UPDATE', [e.room_id]);
      if (b.approve && (await clash(c, e.room_id, e.starts_at, e.ends_at, e.id))) throw new HttpError(409, 'Odanın bu saatlerde başka bir etkinliği var');
      await c.query('UPDATE events SET status = $2, reject_reason = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now() WHERE id = $1', [e.id, b.approve ? 'approved' : 'rejected', reason, me.id]);
      await log(c, e.id, me.id, b.approve ? 'approve' : 'reject', reason ? { reason } : {});
      // The owner reads the decision in Similar Ekibi (and the reason, on a refusal) and gets a push.
      await c.query("INSERT INTO team_notices (kind, title, body, link, target, created_by) VALUES ('event', $1, $2, $3, $4, $5)", [
        b.approve ? 'Etkinliğin onaylandı' : 'Etkinlik başvurun reddedildi',
        b.approve ? `“${e.title}” Etkinlik Alanı’nda yayında. Zamanı gelince odanı açmayı unutma.` : `“${e.title}” onaylanmadı. Gerekçe: ${reason} Düzenleyip yeniden gönderebilirsin.`,
        `/?etkinlik=${e.id}`,
        e.owner_id,
        me.id,
      ]);
    });
    notify([e.owner_id], { title: b.approve ? 'Etkinliğin onaylandı' : 'Etkinlik başvurun reddedildi', body: e.title, data: { type: 'event', id: String(e.id) } });
    if (b.approve) announceRoom(liveKitName(e.room_id));
    return { event: await detail(e.id, me) };
  },

  async 'POST /api/admin/events/remove'(req) {
    const me = await adminOnly(req);
    const b = await readJson(req);
    const reason = text(b.reason, 3, 300, 'Gerekçe');
    const e = await rowOf(b.id, me.id);
    if (e.status === 'cancelled' || e.ended_at) throw new HttpError(409, 'Etkinlik zaten yayında değil');
    const who = await tx(async (c) => {
      if (e.started_at) await finish(c, e.id, 'admin', me.id);
      await c.query("UPDATE events SET status = 'cancelled', cancel_reason = $2, cancelled_by = $3, cancelled_at = now(), updated_at = now() WHERE id = $1", [e.id, reason, me.id]);
      await log(c, e.id, me.id, 'remove', { reason });
      const ids = (await c.query("SELECT user_id FROM event_reservations WHERE event_id = $1 AND status = 'confirmed'", [e.id])).rows.map((x) => x.user_id);
      await placeNotices(c, ids, e.id, 'Etkinlik yayından kaldırıldı', `“${e.title}” yayından kaldırıldı. Neden: ${reason}`);
      return ids;
    });
    notify([...new Set([e.owner_id, ...who])], { title: 'Etkinlik yayından kaldırıldı', body: e.title, data: { type: 'event', id: String(e.id) } });
    announceRoom(liveKitName(e.room_id));
    return { event: await detail(e.id, me) };
  },

  async 'GET /api/admin/events/categories'(req) {
    await adminOnly(req);
    const r = await db.query('SELECT c.*, (SELECT count(*) FROM events e WHERE e.category = c.id)::int AS used FROM event_categories c ORDER BY c.sort, c.name');
    return { categories: r.rows.map((c) => ({ id: c.id, name: c.name, icon: c.icon, theme: c.theme, sort: c.sort, active: c.active, used: c.used })) };
  },

  async 'POST /api/admin/events/categories'(req) {
    const me = await adminOnly(req);
    const b = await readJson(req);
    const name = text(b.name, 2, 24, 'Tür adı');
    const icon = typeof b.icon === 'string' && /^[a-z0-9-]{1,40}$/.test(b.icon) ? b.icon : 'sparkles';
    if (!themeOf(b.theme ?? 'sade')) throw new HttpError(400, 'Geçersiz tema');
    const sort = int(b.sort ?? 0, -1000, 1000);
    if (sort === null) throw new HttpError(400, 'Sıra -1000 ile 1000 arasında olmalı');
    const active = b.active !== false;
    let id = typeof b.id === 'string' ? b.id : null;
    if (id) {
      const r = await db.query('UPDATE event_categories SET name = $2, icon = $3, theme = $4, sort = $5, active = $6, updated_at = now() WHERE id = $1 RETURNING *', [id, name, icon, b.theme ?? 'sade', sort, active]);
      if (!r.rowCount) throw new HttpError(404, 'Tür bulunamadı');
    } else {
      id = slugOf(name);
      const r = await db.query('INSERT INTO event_categories (id, name, icon, theme, sort, active) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING id', [id, name, icon, b.theme ?? 'sade', sort, active]);
      if (!r.rowCount) throw new HttpError(409, 'Bu adla bir tür zaten var');
    }
    await db.query("INSERT INTO audit_events (actor, action, target, detail) VALUES ($1, 'event_category', NULL, $2)", [me.id, JSON.stringify({ id, name, active })]);
    const c = (await db.query('SELECT * FROM event_categories WHERE id = $1', [id])).rows[0];
    return { category: { id: c.id, name: c.name, icon: c.icon, theme: c.theme, sort: c.sort, active: c.active } };
  },

  async 'POST /api/admin/events/categories/remove'(req) {
    const me = await adminOnly(req);
    const { id } = await readJson(req);
    if (typeof id !== 'string') throw new HttpError(400, 'Geçersiz tür');
    if ((await db.query('SELECT 1 FROM events WHERE category = $1 LIMIT 1', [id])).rowCount) throw new HttpError(409, 'Bu türde etkinlik var; silmek yerine kapatabilirsin');
    const r = await db.query('DELETE FROM event_categories WHERE id = $1', [id]);
    if (!r.rowCount) throw new HttpError(404, 'Tür bulunamadı');
    await db.query("INSERT INTO audit_events (actor, action, target, detail) VALUES ($1, 'event_category_remove', NULL, $2)", [me.id, JSON.stringify({ id })]);
    return { removed: true };
  },
};

