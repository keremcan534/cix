// Room social features on the server: mic invites, the room poll (Anket), upcoming events across rooms, the rooms
// I'm a member of, the owner's once-a-day invite to their followers, and the badges on the Odalar rows.
//
//   POST /api/rooms/invite         { room, user, seat? }        → { invite }   (owner or admin, as for seat moves)
//   POST /api/rooms/invite/answer  { id, accept, seat? }        → { invite }   (only the invited person)
//   GET  /api/rooms/invites?room=                               → { invites }  (staff: the room's last 5 minutes; others: their own)
//   GET  /api/rooms/poll?room=                                  → { poll }     (the open poll, or the last one for 10 minutes)
//   POST /api/rooms/poll           { room, question, options, seconds, live } → { poll }   (owner, or admins when the room lets them)
//   POST /api/rooms/poll/vote      { id, option }               → { poll }     (once per person)
//   POST /api/rooms/poll/close     { id }                       → { poll }
//   GET  /api/rooms/events/upcoming                             → { events }   (open, visible rooms; not private, not blocked)
//   GET  /api/rooms/joined                                      → { rooms }    (rooms I'm a member or an admin of)
//   GET  /api/rooms/invite-followers?room=                      → { count, lastAt, waitMs }   (owner or admin)
//   POST /api/rooms/invite-followers { room }                   → { sent, lastAt, waitMs }    (once per 24 h per room account)
//   GET  /api/me/room-invites                                   → { invites }  (invites from accounts I follow, last 7 days)
//
// Mic invites and polls reach the room's phones as LiveKit data packets with no sending participant, like the
// room's other server news (live.mjs announceRoom): { type: 'invite', id, to, from } and { type: 'poll', id }. A
// packet carries only ids; each phone reads the invite or poll through these routes, with their checks.
// Retention (UK GDPR): a mic invite is pruned an hour after it was sent, a poll and its votes after 7 days, a
// follower invite (one row per send, none per follower) after 8 days; an erased account's rows go with it
// (social.mjs eraseAccount).
import { HttpError, auth, blockedBetween, db, env, int, limit, publicText, readJson, tx, userId } from './core.mjs';
import { presenceTracked, roomService, voiceParticipants } from './live.mjs';
import { notify } from './push.mjs';
import { rulesOf } from './room-rules.mjs';
// rooms.mjs imports this file too; its functions are only used inside handlers, after both have loaded.
import { ROOM_SELECT, liveKitName, pushRoomMeta, rankOf, roomOut, roomRow, withVoiceCounts } from './rooms.mjs';

/** How long a mic invite waits for its answer, and how soon the same person can be invited again. */
export const INVITE_TTL_MS = 30_000;
const INVITE_AGAIN_MS = 20_000;
/** The poll's lengths the app offers (components/room/community PollCreate). */
const POLL_SECONDS = [30, 60, 300];
/** A closed poll stays on the room's screen this long (the result), then the room has none. */
const POLL_SHOWN_MS = 10 * 60_000;
/** One follower invite per room account in this window (app lib/room-invites FOLLOWER_INVITE_COOLDOWN_MS). */
export const FOLLOWER_INVITE_MS = 24 * 3600_000;
/** At most this many followers get the push (the newest follows first); every follower still gets the notice. */
const FOLLOWER_PUSH_MAX = 5_000;
/** The Odalar badges' weekly ranking is read again at most this often (ROOM_BADGE_CACHE_MS; tests read fresh). */
const BADGE_CACHE_MS = (() => {
  const n = Number(env.ROOM_BADGE_CACHE_MS ?? 60_000);
  return Number.isSafeInteger(n) && n >= 0 ? n : 60_000;
})();

const seatNo = (v) => int(v, 1, 99);
/** SQL: `user` has a running kick or the blacklist in `room` (both SQL expressions). */
const banOf = (room, user) => `EXISTS (SELECT 1 FROM room_bans rb WHERE rb.room_id = ${room} AND rb.user_id = ${user} AND (rb.until IS NULL OR rb.until > now()))`;
const banned = async (roomId, uid) => (await db.query(`SELECT ${banOf('$1', '$2')} AS yes`, [roomId, uid])).rows[0].yes;
/** A row id from input: the app sends a number, Postgres hands it back as a string. */
const rowId = (v, what) => {
  const n = typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : int(v, 1, Number.MAX_SAFE_INTEGER);
  if (!n) throw new HttpError(400, `Geçersiz ${what}`);
  return n;
};

/** Best effort, like the room's other packets: never slows or fails the request. */
function packet(roomId, data) {
  const room = liveKitName(roomId);
  roomService('SendData', { room, data: Buffer.from(JSON.stringify(data)).toString('base64'), kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) =>
    console.error('livekit SendData', data.type, room, String(e).slice(0, 200)),
  );
}

/** Who is in the room's voice now, with their mic (null: not on one). LiveKit's own list, else the webhooks' (no mics). */
async function inRoom(roomId) {
  const name = liveKitName(roomId);
  try {
    const list = await voiceParticipants(name);
    if (list) return { mics: true, people: new Map(list.map((p) => [p.identity, p.seat])) };
  } catch (e) {
    console.error('livekit ListParticipants', name, String(e).slice(0, 200));
  }
  const r = await db.query('SELECT identity FROM room_presence WHERE room = $1', [name]);
  return { mics: false, people: new Map(r.rows.map((x) => [x.identity, null])) };
}

// --- Mic invites ---------------------------------------------------------------------------------------------
let invitesPrunedAt = 0;
const INVITE_SELECT = `SELECT i.*, f.name AS from_name, t.name AS to_name,
                              greatest(0, ceil(extract(epoch FROM i.expires_at - now()) * 1000))::int AS left_ms
                         FROM room_mic_invites i JOIN users f ON f.id = i.from_user JOIN users t ON t.id = i.to_user`;
const inviteView = (i) => ({
  id: Number(i.id),
  room: i.room_id,
  from: { id: i.from_user, name: i.from_name ?? 'Üye' },
  to: { id: i.to_user, name: i.to_name ?? 'Üye' },
  seat: i.seat ?? null,
  status: i.status,
  note: i.note,
  // Milliseconds left to answer, by the server's clock (the phones count down from it, not from their own clock).
  expiresIn: i.status === 'pending' ? i.left_ms : 0,
  createdAt: i.created_at,
});
async function inviteRow(id) {
  const r = await db.query(`${INVITE_SELECT} WHERE i.id = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Davet bulunamadı');
  return r.rows[0];
}
/** Invites nobody answered in time end; true when one did (the room is told). */
async function expireInvites(roomId) {
  const r = await db.query("UPDATE room_mic_invites SET status = 'expired', note = 'Yanıt verilmedi', answered_at = now() WHERE room_id = $1 AND status = 'pending' AND expires_at <= now() RETURNING id", [roomId]);
  return r.rowCount > 0;
}
const tellInvite = (i) => packet(i.room_id, { type: 'invite', id: String(i.id), to: i.to_user, from: i.from_user });
/** Ends an invite with `status`, if it is still waiting; the room's phones read it again. */
async function settleInvite(id, status, note = '', seat = null) {
  const r = await db.query(
    "UPDATE room_mic_invites SET status = $2, note = $3, seat = coalesce($4, seat), answered_at = now() WHERE id = $1 AND status = 'pending' RETURNING *",
    [id, status, note, seat],
  );
  if (r.rowCount) tellInvite(r.rows[0]);
  return r.rowCount > 0;
}

// --- Polls ---------------------------------------------------------------------------------------------------
let pollsPrunedAt = 0;
/** At most one poll packet a second per room: many votes at once are one "read the poll again". */
const pollTold = new Map();
function tellPoll(roomId, pollId) {
  const t = pollTold.get(roomId);
  // One is already on its way.
  if (t?.timer) return;
  const send = () => {
    const sent = { at: Date.now(), timer: null };
    pollTold.set(roomId, sent);
    packet(roomId, { type: 'poll', id: String(pollId) });
    // Forgotten after its second, so the map only holds rooms whose poll just changed.
    setTimeout(() => pollTold.get(roomId) === sent && !sent.timer && pollTold.delete(roomId), 1000).unref?.();
  };
  const wait = t ? t.at + 1000 - Date.now() : 0;
  if (wait <= 0) return send();
  t.timer = setTimeout(() => {
    t.timer = null;
    send();
  }, wait);
  t.timer.unref?.();
}
/** A poll whose time ran out is closed at its end (once; later reads find it closed). */
const closeEndedPolls = (roomId) => db.query('UPDATE room_polls SET closed_at = ends_at WHERE room_id = $1 AND closed_at IS NULL AND ends_at <= now()', [roomId]);
const POLL_SELECT = `SELECT p.*, u.name AS creator_name, greatest(0, ceil(extract(epoch FROM p.ends_at - now())))::int AS left_s
                       FROM room_polls p JOIN users u ON u.id = p.creator`;
/** What a phone draws. The counts only when the poll shows them live, after my vote, or once it ended. */
async function pollView(p, me) {
  if (!p) return null;
  const votes = await db.query('SELECT option, count(*)::int AS n, bool_or(user_id = $2) AS mine FROM room_poll_votes WHERE poll_id = $1 GROUP BY option', [p.id, me]);
  const counts = Object.fromEntries(votes.rows.map((v) => [v.option, v.n]));
  const mine = votes.rows.find((v) => v.mine)?.option ?? null;
  const closed = !!p.closed_at || p.left_s <= 0;
  const shown = p.live || closed || mine !== null;
  return {
    id: Number(p.id),
    room: p.room_id,
    question: p.question,
    options: p.options.map((text, i) => ({ text, votes: shown ? (counts[i] ?? 0) : null })),
    total: shown ? votes.rows.reduce((s, v) => s + v.n, 0) : null,
    myVote: mine,
    live: p.live,
    endsIn: closed ? 0 : p.left_s,
    closed,
    by: { id: p.creator, name: p.creator_name ?? 'Üye' },
  };
}
async function pollRow(id) {
  const r = await db.query(`${POLL_SELECT} WHERE p.id = $1`, [id]);
  if (!r.rowCount) throw new HttpError(404, 'Anket bulunamadı');
  return r.rows[0];
}
/** Polls are run by the owner, and by the admins unless the room keeps its tools to the owner (rules.manageFunctions). */
async function mayRunPolls(room, uid) {
  const rank = await rankOf(room, uid);
  return rank === 3 || (rank >= 1 && rulesOf(room.rules).manageFunctions === 'admins');
}

// --- Odalar badges ---------------------------------------------------------------------------------------------
let ranks = { at: 0, map: new Map() };
/**
 * The open rooms with the most gift coins this week (Turkey's calendar week, as the rankings: gifts.mjs), places
 * 1–3. Read again at most once a minute.
 */
async function weekRanks() {
  if (Date.now() - ranks.at < BADGE_CACHE_MS) return ranks.map;
  const r = await db.query(
    `SELECT r.id, sum(g.total) AS coins
       FROM gift_events g JOIN rooms r ON r.id::text = regexp_replace(g.room, '^oda-', '')
      WHERE g.room IS NOT NULL AND g.created_at >= date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'
        AND r.closed_at IS NULL
      GROUP BY r.id HAVING sum(g.total) > 0 ORDER BY coins DESC, r.id LIMIT 3`,
  );
  ranks = { at: Date.now(), map: new Map(r.rows.map((x, i) => [x.id, i + 1])) };
  return ranks.map;
}

/**
 * The Odalar row extras the server knows, on room views (rooms.mjs out): the owner's agency (an approved one they
 * stream for or own) and family, whether an in-room PK runs now, and the room's place in this week's gift ranking
 * (1–3, else null). Never fails the list: on an error the rooms go out without them.
 */
export async function withRoomBadges(list) {
  if (!list.length) return list;
  try {
    const ids = list.map((r) => r.id);
    const owners = [...new Set(list.map((r) => r.owner.id))];
    const fam = await db.query('SELECT fm.user_id, f.id, f.name FROM family_members fm JOIN families f ON f.id = fm.family_id WHERE fm.user_id = ANY($1::uuid[]) AND f.closed_at IS NULL', [owners]);
    const ag = await db.query(
      `SELECT DISTINCT ON (x.uid) x.uid, a.id, a.name FROM (
         SELECT s.streamer_id AS uid, s.agency_id AS aid, 1 AS pref FROM agency_streamers s WHERE s.streamer_id = ANY($1::uuid[]) AND s.ended_at IS NULL AND s.contract = 'approved'
         UNION ALL SELECT a.owner_id, a.id, 2 FROM agencies a WHERE a.owner_id = ANY($1::uuid[])
       ) x JOIN agencies a ON a.id = x.aid WHERE a.status = 'approved' ORDER BY x.uid, x.pref, a.name`,
      [owners],
    );
    const pk = await db.query("SELECT DISTINCT room_id FROM room_pks WHERE room_id = ANY($1::uuid[]) AND status = 'active' AND end_at > now()", [ids]);
    const week = await weekRanks();
    const families = new Map(fam.rows.map((x) => [x.user_id, { id: String(x.id), name: x.name }]));
    const agencies = new Map(ag.rows.map((x) => [x.uid, { id: String(x.id), name: x.name }]));
    const pks = new Set(pk.rows.map((x) => x.room_id));
    return list.map((r) => ({ ...r, agency: agencies.get(r.owner.id) ?? null, family: families.get(r.owner.id) ?? null, pk: pks.has(r.id), weekRank: week.get(r.id) ?? null }));
  } catch (e) {
    console.error('room badges', String(e).slice(0, 200));
    return list;
  }
}

// --- Follower invites ------------------------------------------------------------------------------------------
/** The room account's followers an invite from `sender` reaches: not deleted, no block either way with either. */
const FOLLOWERS = `FROM follows f JOIN users u ON u.id = f.follower
                  WHERE f.followee = $1 AND u.deleted_at IS NULL AND f.follower <> $2
                    AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = f.follower AND b.blocked IN ($1, $2)) OR (b.blocked = f.follower AND b.blocker IN ($1, $2)))`;
const followerCount = async (owner, sender, q = db) => Number((await q.query(`SELECT count(*) AS n ${FOLLOWERS}`, [owner, sender])).rows[0].n);
/** When the room account last invited its followers, and how long until it may again (0: now). */
async function lastFollowerInvite(owner, q = db) {
  const r = await q.query('SELECT created_at FROM room_follower_invites WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1', [owner]);
  const lastAt = r.rows[0]?.created_at ?? null;
  const waitMs = lastAt ? Math.max(0, new Date(lastAt).getTime() + FOLLOWER_INVITE_MS - Date.now()) : 0;
  return { lastAt, waitMs };
}
let followerInvitesPrunedAt = 0;

/** Room staff only (owner or any admin). */
async function staffOnly(room, uid, what) {
  if (!(await rankOf(room, uid))) throw new HttpError(403, `${what} yalnızca oda sahibi ve yöneticilere açık`);
}

export const roomSocialRoutes = {
  /**
   * Owner and admins invite someone who is in the room (on the Balkon, not on a mic) to a mic: the same rights as
   * moving people to mics (rooms.mjs POST /api/rooms/seat), so only people below their own rank. One waiting
   * invite per person; the same person again after 20 seconds.
   */
  async 'POST /api/rooms/invite'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    const rank = await rankOf(room, me.id);
    if (!rank) throw new HttpError(403, 'Mikrofon daveti için oda sahibi veya yönetici olmalısın');
    const target = userId(b.user);
    if (target === me.id) throw new HttpError(400, 'Kendini davet edemezsin');
    if (target === room.owner || (await rankOf(room, target)) >= rank) throw new HttpError(403, 'Kendi yetkindeki ya da üstündeki birini mikrofona davet edemezsin');
    const seat = b.seat === undefined || b.seat === null ? null : seatNo(b.seat);
    if (b.seat != null && seat === null) throw new HttpError(400, 'Geçersiz koltuk');
    if (seat !== null && (room.locked_seats ?? []).map(Number).includes(seat)) throw new HttpError(409, 'Bu mikrofon kilitli');
    if (await blockedBetween(me.id, target)) throw new HttpError(403, 'Bu kişiyi davet edemezsin');
    if (await banned(room.id, target)) throw new HttpError(403, 'Bu kişi odadan çıkarıldı');
    // PRIVACY HOOK (mayInvite): the privacy settings ("who can invite me", their own module) call
    // `await mayInvite(db, me.id, target)` here, which throws when the invited person doesn't take invites from me.
    limit(`roominvite:${me.id}`, 30, 'Çok sık davet gönderdin, biraz bekle');
    const { mics, people } = await inRoom(room.id);
    if (!people.has(target)) throw new HttpError(409, 'Bu kişi artık odada değil');
    if (people.get(target) !== null && people.get(target) !== undefined) throw new HttpError(409, 'Bu kişi zaten mikrofonda');
    if (seat !== null && mics && [...people.values()].includes(seat)) throw new HttpError(409, 'Bu mikrofon dolu');
    if (await expireInvites(room.id)) packet(room.id, { type: 'invite' });
    const last = (await db.query('SELECT status, created_at FROM room_mic_invites WHERE room_id = $1 AND to_user = $2 ORDER BY id DESC LIMIT 1', [room.id, target])).rows[0];
    if (last?.status === 'pending') throw new HttpError(409, 'Bu kişiye davet gönderildi; yanıtı bekleniyor.');
    const since = last ? Date.now() - new Date(last.created_at).getTime() : Infinity;
    if (since < INVITE_AGAIN_MS) throw new HttpError(429, `Aynı kişiye yeniden davet için ${Math.ceil((INVITE_AGAIN_MS - since) / 1000)} sn bekle.`);
    let id;
    try {
      id = (
        await db.query('INSERT INTO room_mic_invites (room_id, from_user, to_user, seat, expires_at) VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5)) RETURNING id', [
          room.id,
          me.id,
          target,
          seat,
          INVITE_TTL_MS / 1000,
        ])
      ).rows[0].id;
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Bu kişiye davet gönderildi; yanıtı bekleniyor.');
      throw e;
    }
    const invite = await inviteRow(id);
    tellInvite(invite);
    // No answer in time: it ends, and the inviter's phone hears so (a phone also reads it again when its count ends).
    setTimeout(() => {
      db.query("UPDATE room_mic_invites SET status = 'expired', note = 'Yanıt verilmedi', answered_at = now() WHERE id = $1 AND status = 'pending' AND expires_at <= now() RETURNING *", [id])
        .then((r) => r.rowCount && tellInvite(r.rows[0]))
        .catch((e) => console.error('mic invite expiry', String(e).slice(0, 200)));
    }, INVITE_TTL_MS + 300).unref();
    if (Date.now() - invitesPrunedAt > 3_600_000) {
      invitesPrunedAt = Date.now();
      await db.query("DELETE FROM room_mic_invites WHERE created_at < now() - interval '1 hour'").catch((e) => console.error('mic invites prune', e.message));
    }
    return { invite: inviteView(invite) };
  },

  /**
   * The invited person answers. Accepting takes the invite's mic if it is still free and unlocked (an invite for
   * any mic: the free one the phone picked, `seat`), as their `seat` attribute in LiveKit, which their phone then
   * follows; a taken mic ends the invite as failed. Declining, or 30 seconds without an answer, ends it.
   */
  async 'POST /api/rooms/invite/answer'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    if (typeof b.accept !== 'boolean') throw new HttpError(400, 'Kabul ya da ret seç');
    const inv = await inviteRow(rowId(b.id, 'davet'));
    if (inv.to_user !== me.id) throw new HttpError(403, 'Bu davet sana gönderilmedi');
    if (inv.status === 'pending' && inv.left_ms <= 0) {
      await settleInvite(inv.id, 'expired', 'Yanıt verilmedi');
      throw new HttpError(410, 'Davetin süresi doldu.');
    }
    if (inv.status !== 'pending') throw new HttpError(inv.status === 'expired' ? 410 : 409, inv.status === 'expired' ? 'Davetin süresi doldu.' : 'Bu davet artık geçerli değil.');
    limit(`roominvite-answer:${me.id}`, 30);
    if (!b.accept) {
      await settleInvite(inv.id, 'declined');
      return { invite: inviteView(await inviteRow(inv.id)) };
    }
    const room = await roomRow(inv.room_id);
    if (room.closed_at) {
      await settleInvite(inv.id, 'cancelled', 'Oda kapandı');
      throw new HttpError(410, 'Oda kapandı');
    }
    if ((await banned(room.id, me.id)) || (await blockedBetween(room.owner, me.id))) {
      await settleInvite(inv.id, 'cancelled', 'Odaya giremez');
      throw new HttpError(403, 'Bu odaya giremezsin');
    }
    const seat = inv.seat ?? seatNo(b.seat);
    if (seat === null) throw new HttpError(400, 'Geçersiz koltuk');
    if (!env.LIVEKIT_API_URL) throw new HttpError(503, 'Ses sunucusu şu an bağlı değil');
    const name = liveKitName(room.id);
    let people;
    try {
      people = await voiceParticipants(name);
    } catch (e) {
      console.error('livekit ListParticipants', name, String(e).slice(0, 200));
      throw new HttpError(502, 'Ses sunucusuna şu an ulaşılamadı');
    }
    const mine = people.find((p) => p.identity === me.id);
    if (!mine) {
      await settleInvite(inv.id, 'cancelled', 'Kişi odada değil');
      throw new HttpError(409, 'Odada değilsin.');
    }
    if (mine.seat !== null) {
      await settleInvite(inv.id, 'cancelled', 'Zaten mikrofonda');
      throw new HttpError(409, 'Zaten mikrofondasın.');
    }
    if ((room.locked_seats ?? []).map(Number).includes(seat) || people.some((p) => p.seat === seat)) {
      await settleInvite(inv.id, 'failed', 'Boş mikrofon kalmadı');
      throw new HttpError(409, 'Bu mikrofon doldu; mikrofona geçilemedi.');
    }
    let done;
    try {
      done = await roomService('UpdateParticipant', { room: name, identity: me.id, attributes: { seat: String(seat) } }, { roomAdmin: true, room: name });
    } catch (e) {
      console.error('livekit UpdateParticipant', name, String(e).slice(0, 200));
      throw new HttpError(502, 'Ses sunucusuna şu an ulaşılamadı');
    }
    if (!done) {
      await settleInvite(inv.id, 'cancelled', 'Kişi odada değil');
      throw new HttpError(409, 'Odada değilsin.');
    }
    await settleInvite(inv.id, 'accepted', '', seat);
    // On a mic now: no longer waiting in the mic queue.
    if ((await db.query('DELETE FROM room_mic_queue WHERE room_id = $1 AND user_id = $2', [room.id, me.id])).rowCount) await pushRoomMeta(room.id);
    return { invite: inviteView(await inviteRow(inv.id)) };
  },

  /** The room's staff see its invites of the last 5 minutes (who waits, who answered); anyone else only their own. */
  async 'GET /api/rooms/invites'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    if (await expireInvites(room.id)) packet(room.id, { type: 'invite' });
    const staff = (await rankOf(room, me.id)) > 0;
    const r = await db.query(
      `${INVITE_SELECT} WHERE i.room_id = $1 AND i.created_at > now() - interval '5 minutes' AND ($2::boolean OR i.to_user = $3 OR i.from_user = $3)
        ORDER BY i.id DESC LIMIT 50`,
      [room.id, staff, me.id],
    );
    return { invites: r.rows.map(inviteView) };
  },

  async 'GET /api/rooms/poll'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    await closeEndedPolls(room.id);
    const p = (await db.query(`${POLL_SELECT} WHERE p.room_id = $1 ORDER BY p.id DESC LIMIT 1`, [room.id])).rows[0];
    const gone = p?.closed_at && Date.now() - new Date(p.closed_at).getTime() > POLL_SHOWN_MS;
    return { poll: p && !gone ? await pollView(p, me.id) : null };
  },

  /** One open poll per room. Its texts are public: they pass the contact filter (core.mjs publicText). */
  async 'POST /api/rooms/poll'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const room = await roomRow(b.room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    if (!(await mayRunPolls(room, me.id))) throw new HttpError(403, 'Anketi oda sahibi veya (oda izin veriyorsa) yöneticiler başlatır');
    limit(`roompoll:${me.id}`, 10, 'Çok sık anket başlatıyorsun, biraz bekle');
    const question = await publicText(b.question, 4, 120, 'Soru', me, 'room.poll', 'question');
    if (!Array.isArray(b.options) || b.options.length < 2 || b.options.length > 4) throw new HttpError(400, 'En az 2, en çok 4 seçenek');
    const options = [];
    for (const o of b.options) options.push(await publicText(o, 1, 40, 'Seçenek', me, 'room.poll', 'options'));
    if (new Set(options.map((o) => o.toLocaleLowerCase('tr-TR'))).size !== options.length) throw new HttpError(400, 'Seçenekler birbirinden farklı olmalı');
    if (!POLL_SECONDS.includes(b.seconds)) throw new HttpError(400, 'Süre 30 sn, 1 dk ya da 5 dk olmalı');
    if (b.live !== undefined && typeof b.live !== 'boolean') throw new HttpError(400, 'Anlık sonuç açık ya da kapalı olmalı');
    await closeEndedPolls(room.id);
    let id;
    try {
      id = (
        await db.query('INSERT INTO room_polls (room_id, creator, question, options, live, ends_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6)) RETURNING id', [
          room.id,
          me.id,
          question,
          options,
          b.live !== false,
          b.seconds,
        ])
      ).rows[0].id;
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Odada açık bir anket var; önce onu kapat');
      throw e;
    }
    tellPoll(room.id, id);
    // Its end: the phones read the result (they also count down on their own).
    setTimeout(() => closeEndedPolls(room.id).then(() => tellPoll(room.id, id), () => {}), b.seconds * 1000 + 300).unref();
    if (Date.now() - pollsPrunedAt > 3_600_000) {
      pollsPrunedAt = Date.now();
      await db.query("DELETE FROM room_polls WHERE created_at < now() - interval '7 days' AND closed_at IS NOT NULL").catch((e) => console.error('polls prune', e.message));
    }
    return { poll: await pollView(await pollRow(id), me.id) };
  },

  /** One vote per person, while the poll is open, for someone the room lets in. */
  async 'POST /api/rooms/poll/vote'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const p = await pollRow(rowId(b.id, 'anket'));
    const room = await roomRow(p.room_id);
    if (room.closed_at || p.closed_at || p.left_s <= 0) throw new HttpError(409, 'Anket kapandı');
    const option = int(b.option, 0, p.options.length - 1);
    if (option === null) throw new HttpError(400, 'Geçersiz seçenek');
    if ((await banned(room.id, me.id)) || (await blockedBetween(room.owner, me.id))) throw new HttpError(403, 'Bu odada oy veremezsin');
    // Once LiveKit's webhooks say who is where (live.mjs), only people in the room vote.
    const here = (await db.query('SELECT 1 FROM room_presence WHERE room = $1 AND identity = $2', [liveKitName(room.id), me.id])).rowCount > 0;
    if (presenceTracked() && !here && (await rankOf(room, me.id)) === 0) throw new HttpError(403, 'Oy vermek için odada olmalısın');
    limit(`roompoll-vote:${me.id}`, 60);
    const r = await db.query('INSERT INTO room_poll_votes (poll_id, user_id, option) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [p.id, me.id, option]);
    if (!r.rowCount) throw new HttpError(409, 'Bu ankette oyunu kullandın');
    tellPoll(room.id, p.id);
    return { poll: await pollView(await pollRow(p.id), me.id) };
  },

  /** Ends a poll early: whoever may run polls in the room, or the one who started it. */
  async 'POST /api/rooms/poll/close'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const p = await pollRow(rowId(b.id, 'anket'));
    const room = await roomRow(p.room_id);
    if (p.creator !== me.id && !(await mayRunPolls(room, me.id))) throw new HttpError(403, 'Anketi oda sahibi veya yöneticiler kapatır');
    const r = await db.query('UPDATE room_polls SET closed_at = now(), closed_by = $2 WHERE id = $1 AND closed_at IS NULL AND ends_at > now()', [p.id, me.id]);
    await closeEndedPolls(room.id);
    if (r.rowCount) tellPoll(room.id, p.id);
    return { poll: await pollView(await pollRow(p.id), me.id) };
  },

  /**
   * Upcoming activities across rooms (the Odalar calendar): the last week's, not cancelled, in open rooms I can see
   * (not a private room, no block between me and its owner or the one who planned it, not kicked from it).
   * Newest first, at most 20. "When" is the text its planner wrote (room-events.mjs), so it isn't sorted by it.
   */
  async 'GET /api/rooms/events/upcoming'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT e.id, e.title, e.when_text, e.kind, e.room_id, e.created_at, r.title AS room_title,
              (SELECT count(*) FROM room_event_going g WHERE g.event_id = e.id)::int AS attendees,
              EXISTS (SELECT 1 FROM room_event_going g WHERE g.event_id = e.id AND g.user_id = $1) AS going
         FROM room_events e JOIN rooms r ON r.id = e.room_id JOIN users o ON o.id = r.owner
        WHERE e.cancelled_at IS NULL AND e.created_at > now() - interval '7 days'
          AND r.closed_at IS NULL AND o.deleted_at IS NULL AND r.room_type <> 'private'
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked IN (r.owner, e.creator)) OR (b.blocked = $1 AND b.blocker IN (r.owner, e.creator)))
          AND NOT ${banOf('r.id', '$1')}
        ORDER BY e.created_at DESC LIMIT 20`,
      [me.id],
    );
    return {
      events: r.rows.map((e) => ({ id: Number(e.id), title: e.title, when: e.when_text, type: e.kind, room: { id: e.room_id, title: e.room_title }, attendees: e.attendees, going: e.going, createdAt: e.created_at })),
    };
  },

  /**
   * Odalarım › Katıl: the open rooms I'm a member of (Oda üyeleri) or an admin of, fullest first; not my own (that
   * one is "Odam"), none whose owner and I have blocked each other or that kicked me. Listed even when nobody is
   * in them right now (the room list leaves those out): a member can open it.
   */
  async 'GET /api/rooms/joined'(req) {
    const me = await auth(req);
    const r = await db.query(
      `${ROOM_SELECT} WHERE r.closed_at IS NULL AND u.deleted_at IS NULL AND r.owner <> $1
         AND (EXISTS (SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = $1 AND m.status = 'member')
              OR EXISTS (SELECT 1 FROM room_admins a WHERE a.room_id = r.id AND a.user_id = $1))
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = r.owner AND b.blocked = $1) OR (b.blocker = $1 AND b.blocked = r.owner))
         AND NOT ${banOf('r.id', '$1')}
       ORDER BY r.created_at DESC LIMIT 100`,
      [me.id],
    );
    const rows = await withVoiceCounts(r.rows);
    rows.sort((a, b) => Number(b.listeners) - Number(a.listeners) || new Date(b.created_at) - new Date(a.created_at));
    return { rooms: await withRoomBadges(rows.map(roomOut)) };
  },

  /** For the Paylaş sheet: how many followers the room's account has (that an invite would reach) and the wait. */
  async 'GET /api/rooms/invite-followers'(req, url) {
    const me = await auth(req);
    const room = await roomRow(url.searchParams.get('room'));
    await staffOnly(room, me.id, 'Takipçilere davet');
    return { count: await followerCount(room.owner, me.id), ...(await lastFollowerInvite(room.owner)) };
  },

  /**
   * "Odaya davet et": the owner or an admin invites every follower of the room's account, once every 24 hours per
   * room account (kept on the account, so closing and reopening the room doesn't start it again). One row per
   * send: each follower's phone turns it into a notice (GET /api/me/room-invites), and they get a push.
   */
  async 'POST /api/rooms/invite-followers'(req) {
    const me = await auth(req);
    const room = await roomRow((await readJson(req)).room);
    if (room.closed_at) throw new HttpError(410, 'Oda kapandı');
    await staffOnly(room, me.id, 'Takipçilere davet');
    limit(`roomfollowers:${me.id}`, 10);
    const sent = await tx(async (c) => {
      // Two staff phones at once: the second waits here and then finds the first one's row.
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [room.owner]);
      const last = await lastFollowerInvite(room.owner, c);
      if (last.waitMs > 0) throw Object.assign(new HttpError(429, 'Bu oda takipçilerine günde bir kez davet gönderebilir'), { extra: { code: 'follower_invite_wait', ...last } });
      const count = await followerCount(room.owner, me.id, c);
      if (!count) throw new HttpError(409, 'Davet edilecek takipçi yok');
      await c.query('INSERT INTO room_follower_invites (owner_id, room_id, sent_by, recipients) VALUES ($1, $2, $3, $4)', [room.owner, room.id, me.id, count]);
      return count;
    });
    const push = (await db.query(`SELECT f.follower ${FOLLOWERS} ORDER BY f.created_at DESC LIMIT ${FOLLOWER_PUSH_MAX}`, [room.owner, me.id])).rows.map((x) => x.follower);
    notify(push, { title: 'Oda daveti', body: `${room.owner_name} seni "${room.title}" odasına davet ediyor`, data: { type: 'room_invite', room: room.id } });
    if (Date.now() - followerInvitesPrunedAt > 3_600_000) {
      followerInvitesPrunedAt = Date.now();
      await db.query("DELETE FROM room_follower_invites WHERE created_at < now() - interval '8 days'").catch((e) => console.error('follower invites prune', e.message));
    }
    return { sent, ...(await lastFollowerInvite(room.owner)) };
  },

  /**
   * Room invites for me as a follower: from accounts I followed before they sent it, in the last 7 days, for rooms
   * still open, with no block between me and the account or the one who sent it. Newest first, at most 20.
   */
  async 'GET /api/me/room-invites'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT i.id, i.room_id, i.created_at, r.title, o.id AS owner_id, o.name AS owner_name
         FROM room_follower_invites i
         JOIN follows f ON f.followee = i.owner_id AND f.follower = $1 AND f.created_at <= i.created_at
         JOIN rooms r ON r.id = i.room_id JOIN users o ON o.id = i.owner_id
        WHERE i.created_at > now() - interval '7 days' AND r.closed_at IS NULL AND o.deleted_at IS NULL AND i.sent_by <> $1
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked IN (i.owner_id, i.sent_by)) OR (b.blocked = $1 AND b.blocker IN (i.owner_id, i.sent_by)))
        ORDER BY i.id DESC LIMIT 20`,
      [me.id],
    );
    return { invites: r.rows.map((x) => ({ id: Number(x.id), room: { id: x.room_id, title: x.title }, host: { id: x.owner_id, name: x.owner_name }, at: x.created_at })) };
  },
};
