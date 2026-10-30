// Similar Club API on our server, behind Caddy next to Postgres and LiveKit (docs/SUNUCU.md). One dependency: pg.
//
//   POST /api/auth/dev          { deviceKey, name }             → { session, user }
//   GET  /api/me                                                → { user }
//   GET  /api/ledger                                            → { rows }
//   POST /api/wallet/test-topup { amount, ref }   (test only)   → { user, replay }
//   POST /api/wallet/gift       { to, amount, ref }             → { user, replay }
//   GET  /token?room=&password=                                 → { token, ttl }
// Profiles, follows, blocks, reports and account deletion: social.mjs. Direct messages: messages.mjs.
// Rooms, room admins and bans: rooms.mjs. Moderation for staff: admin.mjs.
// Every call except sign-in needs "Authorization: Bearer <session>".
import crypto from 'node:crypto';
import http from 'node:http';

import { adminRoutes } from './admin.mjs';
import { HttpError, auth, db, env, int, migrate, once, readJson, selfUser, sha, move, userId } from './core.mjs';
import { messageRoutes } from './messages.mjs';
import { roomRoutes, voiceAccess } from './rooms.mjs';
import { socialRoutes } from './social.mjs';

const [LK_KEY, LK_SECRET] = (env.LIVEKIT_KEYS ?? '').split(/:\s*/);
if (!LK_KEY || !LK_SECRET) throw new Error('LIVEKIT_KEYS missing');
const PORT = Number(env.API_PORT ?? 7890);
const TEST_TOPUP = env.ALLOW_TEST_TOPUP === '1';
const SESSION_DAYS = 30;
const TOKEN_TTL = 2 * 60 * 60;
/** Test top-ups: the coin pack sizes, at most this many coins per user per day. */
const TOPUP_PACKS = [1000, 5000, 10000];
const TOPUP_DAILY = 50000;
const GIFT_MAX = 1_000_000;
/**
 * Web origins allowed to call this: the dev server, the GitHub Pages preview, and the exact origins in
 * ALLOWED_ORIGINS (comma separated, e.g. the product's own domain). Native apps send no Origin.
 */
const ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/[a-z0-9-]+\.github\.io)$/;
const EXTRA_ORIGINS = new Set((env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
/** Requests per IP per minute: sign-ins and everything else (env overrides for load tests and CI). */
const RATE_AUTH = Number(env.RATE_AUTH ?? 10);
const RATE_ALL = Number(env.RATE_ALL ?? 120);

function liveKitToken(room, user) {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    iss: LK_KEY,
    sub: user.id,
    name: user.name,
    nbf: now - 10,
    exp: now + TOKEN_TTL,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  })}`;
  return `${body}.${crypto.createHmac('sha256', LK_SECRET).update(body).digest('base64url')}`;
}

// --- Routes ----------------------------------------------------------------------------------------------
const walletRoutes = {
  async 'POST /api/auth/dev'(req) {
    const { deviceKey, name } = await readJson(req);
    if (typeof deviceKey !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(deviceKey)) throw new HttpError(400, 'Geçersiz cihaz anahtarı');
    const clean = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    const hash = sha(`device:${deviceKey}`);
    let u = (await db.query('SELECT * FROM users WHERE device_key_hash = $1', [hash])).rows[0];
    if (!u) {
      if (!clean) throw new HttpError(400, 'Ad gerekli');
      u = (await db.query('INSERT INTO users (name, device_key_hash) VALUES ($1, $2) ON CONFLICT (device_key_hash) DO UPDATE SET name = users.name RETURNING *', [clean, hash])).rows[0];
    }
    const session = crypto.randomBytes(32).toString('base64url');
    await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [sha(session), u.id]);
    return { session, user: selfUser(u) };
  },

  async 'GET /api/me'(req) {
    return { user: selfUser(await auth(req)) };
  },

  async 'GET /api/ledger'(req) {
    const u = await auth(req);
    const r = await db.query('SELECT id, currency, amount, balance, reason, ref, counterparty, created_at FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [u.id]);
    return { rows: r.rows.map((x) => ({ ...x, id: Number(x.id), amount: Number(x.amount), balance: Number(x.balance) })) };
  },

  async 'POST /api/wallet/test-topup'(req) {
    if (!TEST_TOPUP) throw new HttpError(403, 'Test yüklemesi kapalı');
    const u = await auth(req);
    const { amount, ref } = await readJson(req);
    if (!TOPUP_PACKS.includes(amount)) throw new HttpError(400, `Paket ${TOPUP_PACKS.join(', ')} olmalı`);
    return once(u.id, 'coin', ref, async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      const today = await c.query("SELECT coalesce(sum(amount), 0) AS n FROM ledger WHERE user_id = $1 AND reason = 'Test yüklemesi' AND created_at > date_trunc('day', now())", [u.id]);
      if (Number(today.rows[0].n) + amount > TOPUP_DAILY) throw new HttpError(429, `Günlük test yüklemesi sınırı ${TOPUP_DAILY}`);
      await move(c, u.id, 'coin', amount, 'Test yüklemesi', ref);
    });
  },

  /** Gift: the sender's coins become the recipient's diamonds, 1 to 1 (src/data/rules.ts). */
  async 'POST /api/wallet/gift'(req) {
    const u = await auth(req);
    const { to, amount, ref } = await readJson(req);
    const n = int(amount, 1, GIFT_MAX);
    if (!n) throw new HttpError(400, 'Geçersiz miktar');
    userId(to, 'alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine hediye gönderemezsin');
    return once(u.id, 'coin', ref, async (c) => {
      // Lock both rows in id order so two people gifting each other at once can't deadlock.
      const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [[u.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
      await move(c, u.id, 'coin', -n, 'Hediye gönderildi', ref, to);
      await move(c, to, 'diamond', n, 'Hediye alındı', `${ref}-in`, u.id);
    });
  },

  /** Voice token. Server rooms check kicks, blacklist, blocks and the password (rooms.mjs voiceAccess). */
  async 'GET /token'(req, url) {
    const u = await auth(req);
    const room = url.searchParams.get('room') ?? '';
    if (!ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    await voiceAccess(room, u, url.searchParams.get('password'));
    return { token: liveKitToken(room, u), ttl: TOKEN_TTL };
  },
};

const routes = { ...walletRoutes, ...socialRoutes, ...messageRoutes, ...roomRoutes, ...adminRoutes };

// --- Server: CORS, per-IP rate limit, JSON errors -------------------------------------------------------------
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && (ORIGIN.test(origin) || EXTRA_ORIGINS.has(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, data) => res.writeHead(code).end(JSON.stringify(data));
  if (req.method === 'OPTIONS') return send(204, {});

  const url = new URL(req.url ?? '/', 'http://x');
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(404, { error: 'Bulunamadı' });

  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  const key = `${ip}:${url.pathname === '/api/auth/dev' ? 'auth' : 'all'}`;
  const n = (hits.get(key) ?? 0) + 1;
  hits.set(key, n);
  if (n > (url.pathname === '/api/auth/dev' ? RATE_AUTH : RATE_ALL)) return send(429, { error: 'Çok fazla istek, biraz bekle' });

  try {
    send(200, await route(req, url));
  } catch (e) {
    if (e instanceof HttpError) return send(e.code, { error: e.message });
    console.error(e);
    send(500, { error: 'Sunucu hatası' });
  }
});

await migrate();
server.listen(PORT, '127.0.0.1', () => console.log(`api on 127.0.0.1:${PORT}${TEST_TOPUP ? ' (test top-up on)' : ''}`));
