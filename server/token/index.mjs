// LiveKit access tokens for the app (GET /token?room=…&identity=…&name=…). No dependencies: Node's crypto signs
// the JWT with the API secret, which stays on the server. Runs next to LiveKit behind Caddy (docs/SUNUCU.md).
//
// Prototype only: anyone who can reach the app can get a token, limited by room/identity checks, a 2-hour
// lifetime and a per-IP rate limit. Once the real backend has sign-in, it must issue tokens for signed-in users.
import crypto from 'node:crypto';
import http from 'node:http';

const [API_KEY, API_SECRET] = (process.env.LIVEKIT_KEYS ?? '').split(/:\s*/);
if (!API_KEY || !API_SECRET) throw new Error('LIVEKIT_KEYS missing');
const PORT = Number(process.env.TOKEN_PORT ?? 7890);
const TTL = 2 * 60 * 60;
/** Web origins allowed to call this: the dev server and the GitHub Pages preview. */
const ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/[a-z0-9-]+\.github\.io)$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LIMIT = 30;

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function sign(room, identity, name) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    iss: API_KEY,
    sub: identity,
    name,
    nbf: now - 10,
    exp: now + TTL,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  })}`;
  return `${body}.${crypto.createHmac('sha256', API_SECRET).update(body).digest('base64url')}`;
}

/** Requests per IP in the current minute. */
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

http
  .createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && ORIGIN.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Content-Type', 'application/json');
    const send = (code, data) => res.writeHead(code).end(JSON.stringify(data));
    if (req.method === 'OPTIONS') return send(204, {});
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method !== 'GET' || url.pathname !== '/token') return send(404, { error: 'not found' });

    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
    const n = (hits.get(ip) ?? 0) + 1;
    hits.set(ip, n);
    if (n > LIMIT) return send(429, { error: 'too many requests' });

    const room = url.searchParams.get('room') ?? '';
    const identity = url.searchParams.get('identity') ?? '';
    const name = (url.searchParams.get('name') ?? identity).slice(0, 40);
    if (!ID.test(room) || !ID.test(identity)) return send(400, { error: 'bad room or identity' });
    send(200, { token: sign(room, identity, name), ttl: TTL });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`token service on 127.0.0.1:${PORT}`));
