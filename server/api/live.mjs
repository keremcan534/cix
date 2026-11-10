// LiveKit (voice): the join token, and who is in which room from LiveKit's webhooks.
//
//   GET  /token?room=&password=   → { token, ttl }          (rooms.mjs voiceAccess decides who may join)
//   POST /api/livekit/webhook     LiveKit → us, signed       (participant joined / left, room started / finished)
//   GET  /api/rooms/live          → { rooms: [{ room, listeners }] }   (every voice room with people in it)
//
// livekit.yaml sends the webhooks: webhook.api_key = our key, urls = [http://127.0.0.1:7890/api/livekit/webhook]
// (server/infra/livekit.yaml). Each one carries a JWT signed with the API secret whose sha256 claim is the
// body's hash, so nobody else can fake presence. If LiveKit restarts and misses "left" events, the cleanup
// asks LiveKit's own API (LIVEKIT_API_URL, e.g. http://127.0.0.1:7880) which rooms are open and forgets the rest.
// A server room nobody is in stays open: its blacklist, admins, room mutes and password belong to the room id,
// and the owner's next "Oda oluştur" gets the same room back (rooms.mjs, 409 → their open room). Instead, once
// webhooks arrive, GET /api/rooms leaves other people's empty rooms out of the list (presenceTracked).
//
// A token is only for an open server room the person may enter (rooms.mjs voiceAccess), with their own account
// as the identity, and lives LIVEKIT_TOKEN_TTL_S seconds (default 600; LiveKit renews it for a connected
// participant). Closing a room deletes it in LiveKit and a kick or blacklist removes the person at once
// (RoomService over Twirp, LIVEKIT_API_URL), so nobody stays in with a token they already had.
import crypto from 'node:crypto';

import { HttpError, UUID, auth, db, env, readRaw } from './core.mjs';
import { roomEntered } from './referrals.mjs';
import { leftVoiceRoom, mayStay, voiceAccess, voiceRoomStarted } from './rooms.mjs';
import { voiceGrant } from './sanctions.mjs';

export const [LK_KEY, LK_SECRET] = (env.LIVEKIT_KEYS ?? '').split(/:\s*/);
if (!LK_KEY || !LK_SECRET) throw new Error('LIVEKIT_KEYS missing');
const TOKEN_TTL = (() => {
  const n = Number(env.LIVEKIT_TOKEN_TTL_S ?? 600);
  return Number.isSafeInteger(n) && n >= 60 && n <= 24 * 3600 ? n : 600;
})();
const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const sign = (body) => crypto.createHmac('sha256', LK_SECRET).update(body).digest('base64url');

/** An HS256 JWT signed with our LiveKit secret. */
export function liveKitJwt(claims, ttl) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: LK_KEY, nbf: now - 10, exp: now + ttl, ...claims })}`;
  return `${body}.${sign(body)}`;
}

/** Checks a webhook's Authorization JWT against the raw body; returns the parsed event. */
export function verifyWebhook(raw, authorization) {
  const jwt = String(authorization ?? '').replace(/^Bearer\s+/i, '');
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) throw new HttpError(401, 'İmza yok');
  const expected = Buffer.from(sign(`${h}.${p}`));
  if (expected.length !== Buffer.byteLength(s) || !crypto.timingSafeEqual(expected, Buffer.from(s))) throw new HttpError(401, 'İmza geçersiz');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== LK_KEY || (claims.exp && claims.exp < now - 60) || (claims.nbf && claims.nbf > now + 60)) throw new HttpError(401, 'İmza geçersiz');
  // LiveKit writes the hash in standard base64; compare the bytes so either alphabet works.
  const hash = crypto.createHash('sha256').update(raw).digest();
  if (typeof claims.sha256 !== 'string' || !hash.equals(Buffer.from(claims.sha256, 'base64'))) throw new HttpError(401, 'Gövde imzayla uyuşmuyor');
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Geçersiz JSON');
  }
}

const clip = (v) => (typeof v === 'string' ? v.slice(0, 64) : '');

/**
 * True once a signed webhook has come from LiveKit since this process started: room_presence then says who is in
 * which room, and the room list can leave empty rooms out. Until then (no webhook set up, or just restarted) a
 * room's 0 means "not known", and every open room is listed as before.
 */
let webhooksSeen = false;
export const presenceTracked = () => webhooksSeen;

/** Time in a room feeds the agency's activity measure (agency-perf.mjs). Identities are user ids. */
async function logPresence(gone) {
  for (const x of gone.rows) {
    if (!UUID.test(x.identity)) continue;
    await db.query(
      'INSERT INTO presence_log (user_id, room, joined_at, left_at, seconds) SELECT $1, $2, $3, now(), greatest(0, extract(epoch FROM now() - $3::timestamptz))::int WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)',
      [x.identity, x.room, x.joined_at],
    );
  }
}

async function onEvent(e) {
  const room = clip(e.room?.name);
  if (!room) return;
  const who = clip(e.participant?.identity);
  const sid = clip(e.participant?.sid);
  switch (e.event) {
    case 'participant_joined': {
      if (!who) break;
      // LiveKit renews a connected person's token on its own: a ban, a closed room or a block since then
      // is enforced here.
      const ok = await mayStay(room, who);
      if (ok === 'closed') {
        await deleteVoiceRoom(room);
        break;
      }
      if (ok === 'no') {
        await removeFromVoice(room, who);
        break;
      }
      // A reconnect keeps the first join time, so the time in the room isn't cut short.
      await db.query('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3) ON CONFLICT (room, identity) DO UPDATE SET sid = EXCLUDED.sid', [room, who, sid]);
      // Arkadaşını Getir: an invitee's room entry pays their waiting invite (referrals.mjs; never fails the webhook).
      await roomEntered(who, room);
      break;
    }
    case 'participant_left':
    case 'participant_connection_aborted':
      // Only this connection: after a reconnect the new one has another sid.
      if (who) {
        const gone = await db.query("DELETE FROM room_presence WHERE room = $1 AND identity = $2 AND (sid = $3 OR $3 = '') RETURNING room, identity, joined_at", [room, who, sid]);
        await logPresence(gone);
        // Gone from the room: no longer waiting for a mic (not after a reconnect, which keeps another sid).
        if (gone.rowCount) await leftVoiceRoom(room, who);
      }
      break;
    case 'room_started':
      // Someone with a still-valid token can start a room again after it was closed.
      if ((await mayStay(room, '')) === 'closed') await deleteVoiceRoom(room);
      await logPresence(await db.query('DELETE FROM room_presence WHERE room = $1 RETURNING room, identity, joined_at', [room]));
      // The new LiveKit room gets the room's locked mics, layout and mic queue (rooms.mjs pushRoomMeta).
      await voiceRoomStarted(room);
      break;
    case 'room_finished':
      await logPresence(await db.query('DELETE FROM room_presence WHERE room = $1 RETURNING room, identity, joined_at', [room]));
      break;
    default:
  }
}

/**
 * One RoomService call on LiveKit's own API, signed with a short token carrying `grant`. False when
 * LIVEKIT_API_URL isn't set or LiveKit doesn't know the room or person (already gone).
 */
export async function roomService(method, body, grant) {
  if (!env.LIVEKIT_API_URL) return false;
  const r = await fetch(`${env.LIVEKIT_API_URL.replace(/\/$/, '')}/twirp/livekit.RoomService/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${liveKitJwt({ video: grant }, 60)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`livekit ${method} ${r.status}`);
  return true;
}

/**
 * Who is in a voice room now, with their mic (`seat` attribute: "0"–"99", missing or "" = not on a mic). null
 * when LIVEKIT_API_URL isn't set; throws when LiveKit can't be reached.
 */
export async function voiceParticipants(room) {
  if (!env.LIVEKIT_API_URL) return null;
  const r = await fetch(`${env.LIVEKIT_API_URL.replace(/\/$/, '')}/twirp/livekit.RoomService/ListParticipants`, {
    method: 'POST',
    headers: { authorization: `Bearer ${liveKitJwt({ video: { roomAdmin: true, room } }, 60)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ room }),
    signal: AbortSignal.timeout(5_000),
  });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`livekit ListParticipants ${r.status}`);
  const j = await r.json();
  return (j.participants ?? []).map((p) => ({ identity: String(p.identity ?? ''), seat: /^\d{1,2}$/.test(p.attributes?.seat ?? '') ? Number(p.attributes.seat) : null }));
}

/** Ends a voice room for everyone in it. Never fails the caller: the room is closed in our records either way. */
export const deleteVoiceRoom = (room) =>
  roomService('DeleteRoom', { room }, { roomCreate: true }).catch((e) => (console.error('livekit DeleteRoom', room, String(e).slice(0, 200)), false));

/** Takes one person out of a voice room now (a kick or blacklist); the token route refuses them a new one. */
export const removeFromVoice = (room, identity) =>
  roomService('RemoveParticipant', { room, identity }, { roomAdmin: true, room }).catch((e) => (console.error('livekit RemoveParticipant', room, String(e).slice(0, 200)), false));

/** The voice rooms LiveKit has open now, with how many people are connected to each. */
async function listVoiceRooms(timeout = 10_000) {
  const r = await fetch(`${env.LIVEKIT_API_URL.replace(/\/$/, '')}/twirp/livekit.RoomService/ListRooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${liveKitJwt({ video: { roomList: true } }, 60)}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`livekit ListRooms ${r.status}`);
  return ((await r.json()).rooms ?? []).map((x) => ({ name: String(x.name ?? ''), people: Math.max(0, Number(x.num_participants ?? x.numParticipants ?? 0) || 0) }));
}

/** Forgets presence in rooms LiveKit no longer has open (missed webhooks after a restart). */
async function cleanup() {
  const open = (await listVoiceRooms()).map((x) => x.name);
  await logPresence(await db.query('DELETE FROM room_presence WHERE NOT (room = ANY($1::text[])) RETURNING room, identity, joined_at', [open]));
}

/**
 * How many people are in each voice room right now, as LiveKit counts them (room name → people), read at most
 * every 10 s. The room lists show this, so the count is right even when LiveKit's webhooks don't reach us. null
 * when LIVEKIT_API_URL isn't set or LiveKit can't be reached: the caller then uses room_presence.
 */
let counts = { at: 0, map: null };
export async function voiceCounts() {
  if (!env.LIVEKIT_API_URL) return null;
  if (Date.now() - counts.at < 10_000) return counts.map;
  try {
    counts = { at: Date.now(), map: new Map((await listVoiceRooms(3_000)).map((x) => [x.name, x.people])) };
  } catch (e) {
    console.error('livekit ListRooms counts', String(e).slice(0, 200));
    counts = { at: Date.now(), map: null };
  }
  return counts.map;
}

/** Names of the voice rooms LiveKit has open now; none when it isn't set up or can't be reached. */
export async function openVoiceRooms() {
  if (!env.LIVEKIT_API_URL) return [];
  try {
    return (await listVoiceRooms(3_000)).map((x) => x.name);
  } catch (e) {
    console.error('livekit ListRooms open', String(e).slice(0, 200));
    return [];
  }
}

/** Tells the phones in a server room to read the room again (level, mic count, layout). Best effort. */
export function announceRoom(room) {
  const data = Buffer.from(JSON.stringify({ type: 'room' })).toString('base64');
  roomService('SendData', { room, data, kind: 'RELIABLE' }, { roomAdmin: true, room }).catch((e) => console.error('livekit SendData room', room, String(e).slice(0, 200)));
}
if (env.LIVEKIT_API_URL) {
  const run = () => cleanup().catch((e) => console.error('presence cleanup', String(e).slice(0, 200)));
  // PRESENCE_SWEEP_MS: tests run it often; otherwise 30 s after start, then every 10 minutes.
  const every = Number(env.PRESENCE_SWEEP_MS);
  const ms = Number.isFinite(every) && every >= 100 ? every : 10 * 60_000;
  setTimeout(run, Math.min(ms, 30_000)).unref();
  setInterval(run, ms).unref();
}

export const liveRoutes = {
  /** Voice token for an open server room: kicks, blacklist, blocks and the password (rooms.mjs voiceAccess). */
  async 'GET /token'(req, url) {
    const u = await auth(req);
    const room = url.searchParams.get('room') ?? '';
    if (!ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    await voiceAccess(room, u, url.searchParams.get('password'));
    // The identity is the signed-in account, never a value from the request, so nobody can join as someone else.
    // Voice only: no camera or screen share (the app publishes just the microphone).
    // canUpdateOwnMetadata: each phone shows which mic it sits on as its own participant attribute (app lib/live).
    // A mute (sanctions.mjs) takes the mic (voice) or room chat (text) away; seat and role stay as they are.
    const g = await voiceGrant(u.id, room);
    const video = { room, roomJoin: true, canPublish: g.canPublish, canPublishSources: ['microphone'], canSubscribe: true, canPublishData: g.canPublishData, canUpdateOwnMetadata: true };
    const token = liveKitJwt({ sub: u.id, name: u.name, video }, TOKEN_TTL);
    return { token, ttl: TOKEN_TTL, canPublish: g.canPublish, canChat: g.canPublishData };
  },

  async 'POST /api/livekit/webhook'(req) {
    const raw = await readRaw(req, 64_000);
    const e = verifyWebhook(raw, req.headers.authorization);
    webhooksSeen = true;
    await onEvent(e);
    return { ok: true };
  },

  async 'GET /api/rooms/live'(req) {
    await auth(req);
    // 1v1 calls (call-<id>) are private: not in the list.
    const r = await db.query("SELECT room, count(*)::int AS n FROM room_presence WHERE room NOT LIKE 'call-%' GROUP BY room ORDER BY n DESC LIMIT 200");
    return { rooms: r.rows.map((x) => ({ room: x.room, listeners: x.n })) };
  },
};
