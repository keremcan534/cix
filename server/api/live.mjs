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
import crypto from 'node:crypto';

import { HttpError, auth, db, env, readRaw } from './core.mjs';
import { voiceAccess } from './rooms.mjs';

export const [LK_KEY, LK_SECRET] = (env.LIVEKIT_KEYS ?? '').split(/:\s*/);
if (!LK_KEY || !LK_SECRET) throw new Error('LIVEKIT_KEYS missing');
const TOKEN_TTL = 2 * 60 * 60;
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

async function onEvent(e) {
  const room = clip(e.room?.name);
  if (!room) return;
  const who = clip(e.participant?.identity);
  const sid = clip(e.participant?.sid);
  switch (e.event) {
    case 'participant_joined':
      if (who) await db.query('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3) ON CONFLICT (room, identity) DO UPDATE SET sid = EXCLUDED.sid, joined_at = now()', [room, who, sid]);
      break;
    case 'participant_left':
    case 'participant_connection_aborted':
      // Only this connection: after a reconnect the new one has another sid.
      if (who) await db.query("DELETE FROM room_presence WHERE room = $1 AND identity = $2 AND (sid = $3 OR $3 = '')", [room, who, sid]);
      break;
    case 'room_started':
    case 'room_finished':
      await db.query('DELETE FROM room_presence WHERE room = $1', [room]);
      break;
    default:
  }
}

/** Forgets presence in rooms LiveKit no longer has open (missed webhooks after a restart). */
async function cleanup() {
  const r = await fetch(`${env.LIVEKIT_API_URL.replace(/\/$/, '')}/twirp/livekit.RoomService/ListRooms`, {
    method: 'POST',
    headers: { authorization: `Bearer ${liveKitJwt({ video: { roomList: true } }, 60)}`, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`livekit ListRooms ${r.status}`);
  const open = ((await r.json()).rooms ?? []).map((x) => x.name);
  await db.query('DELETE FROM room_presence WHERE NOT (room = ANY($1::text[]))', [open]);
}
if (env.LIVEKIT_API_URL) {
  const run = () => cleanup().catch((e) => console.error('presence cleanup', String(e).slice(0, 200)));
  setTimeout(run, 30_000).unref();
  setInterval(run, 10 * 60_000).unref();
}

export const liveRoutes = {
  /** Voice token. Server rooms check kicks, blacklist, blocks and the password (rooms.mjs voiceAccess). */
  async 'GET /token'(req, url) {
    const u = await auth(req);
    const room = url.searchParams.get('room') ?? '';
    if (!ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    await voiceAccess(room, u, url.searchParams.get('password'));
    const token = liveKitJwt({ sub: u.id, name: u.name, video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true } }, TOKEN_TTL);
    return { token, ttl: TOKEN_TTL };
  },

  async 'POST /api/livekit/webhook'(req) {
    const raw = await readRaw(req, 64_000);
    await onEvent(verifyWebhook(raw, req.headers.authorization));
    return { ok: true };
  },

  async 'GET /api/rooms/live'(req) {
    await auth(req);
    const r = await db.query('SELECT room, count(*)::int AS n FROM room_presence GROUP BY room ORDER BY n DESC LIMIT 200');
    return { rooms: r.rows.map((x) => ({ room: x.room, listeners: x.n })) };
  },
};
