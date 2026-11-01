// Similar Club API on our server, behind Caddy next to Postgres and LiveKit (docs/SUNUCU.md). One dependency: pg.
//
//   GET  /api/health                                            → { ok, db, version, uptime }   (public)
//   GET  /api/me                                                → { user }
//   GET  /api/ledger                                            → { rows }
//   POST /api/wallet/test-topup { amount, ref }   (test only)   → { user, replay }
//   POST /api/wallet/gift       { to, amount, ref } (test only) → { user, replay }
// Sign-in and sessions: auth.mjs. Push: push.mjs. Gifts, catalog, rankings: gifts.mjs. Store purchases:
// purchases.mjs. Uploads: media.mjs. Voice token and presence: live.mjs. Profiles, follows, blocks, reports
// and account deletion: social.mjs. Direct messages: messages.mjs. Rooms: rooms.mjs. Staff: admin.mjs.
// Every call except sign-in, health and the catalog needs "Authorization: Bearer <session>".
import fs from 'node:fs';
import http from 'node:http';

import { adminRoutes } from './admin.mjs';
import { authRoutes } from './auth.mjs';
import { HttpError, allow, auth, db, env, int, migrate, move, once, readJson, selfUser, sha, userId } from './core.mjs';
import { giftRoutes } from './gifts.mjs';
import { liveRoutes } from './live.mjs';
import { mediaRoutes } from './media.mjs';
import { messageRoutes } from './messages.mjs';
import { purchaseRoutes } from './purchases.mjs';
import { pushRoutes } from './push.mjs';
import { roomRoutes } from './rooms.mjs';
import { socialRoutes } from './social.mjs';

const PORT = Number(env.API_PORT ?? 7890);
const TEST_TOPUP = env.ALLOW_TEST_TOPUP === '1';
/** The deployed commit: the deploy writes it to version.txt (server.yml); "dev" in the repo. */
const VERSION = (() => {
  try {
    return fs.readFileSync(new URL('./version.txt', import.meta.url), 'utf8').trim() || 'dev';
  } catch {
    return 'dev';
  }
})();
const STARTED = Date.now();
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
/**
 * Requests per minute. Sign-in is counted per IP. Everything else per session, plus a wider per-IP ceiling:
 * Turkish mobile carriers put many phones behind one address (CGNAT), so a per-IP limit alone would block
 * real people at busy hours. Env overrides for load tests and CI.
 */
const RATE_AUTH = Number(env.RATE_AUTH ?? 20);
const RATE_ALL = Number(env.RATE_ALL ?? 120);
const RATE_IP = Number(env.RATE_IP ?? Math.max(RATE_ALL * 5, 600));
const LOG = env.LOG_REQUESTS !== '0';
/** Paths without the limit: LiveKit's signed webhooks and the uptime check. */
const UNLIMITED = new Set(['/api/livekit/webhook', '/api/health']);

// --- Routes ----------------------------------------------------------------------------------------------
const walletRoutes = {
  async 'GET /api/health'() {
    let ok = true;
    try {
      await db.query('SELECT 1');
    } catch {
      ok = false;
    }
    if (!ok) throw new HttpError(503, 'Veritabanına ulaşılamıyor');
    return { ok, db: ok, version: VERSION, uptime: Math.round((Date.now() - STARTED) / 1000) };
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

  /**
   * Test transfer of any amount (the server-account test screen). Real gifts go through /api/gifts/send,
   * where the server sets the price; this one is off unless test top-ups are on.
   */
  async 'POST /api/wallet/gift'(req) {
    if (!TEST_TOPUP) throw new HttpError(403, 'Hediyeler /api/gifts/send ile gönderilir');
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
};

const routes = {
  ...walletRoutes,
  ...authRoutes,
  ...pushRoutes,
  ...giftRoutes,
  ...purchaseRoutes,
  ...mediaRoutes,
  ...liveRoutes,
  ...socialRoutes,
  ...messageRoutes,
  ...roomRoutes,
  ...adminRoutes,
};

// --- Server: CORS, security headers, rate limits, JSON errors, one log line per request ---------------------
function limited(req, path, ip) {
  if (UNLIMITED.has(path)) return false;
  if (path.startsWith('/api/auth/')) return !allow(`ip-auth:${ip}`, RATE_AUTH);
  if (!allow(`ip:${ip}`, RATE_IP)) return true;
  const bearer = /^Bearer (\S{20,200})$/.exec(req.headers.authorization ?? '');
  return !!bearer && !allow(`s:${sha(bearer[1]).slice(0, 24)}`, RATE_ALL);
}

let inFlight = 0;
const server = http.createServer(async (req, res) => {
  const t0 = performance.now();
  inFlight++;
  const url = new URL(req.url ?? '/', 'http://x');
  const send = (code, data) => {
    if (!res.headersSent) res.writeHead(code).end(JSON.stringify(data));
    // Path only: query strings can hold a room password.
    if (LOG && url.pathname !== '/api/health') console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: url.pathname, s: code, ms: Math.round(performance.now() - t0) }));
  };
  res.on('close', () => inFlight--);

  const origin = req.headers.origin;
  if (origin && (ORIGIN.test(origin) || EXTRA_ORIGINS.has(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'OPTIONS') return send(204, {});

  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(404, { error: 'Bulunamadı' });

  // Caddy replaces X-Forwarded-For with the real client address, so its first entry can be trusted.
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  if (limited(req, url.pathname, ip)) return send(429, { error: 'Çok fazla istek, biraz bekle' });

  try {
    send(200, await route(req, url));
  } catch (e) {
    if (e instanceof HttpError) return send(e.code, { error: e.message });
    console.error(e);
    send(500, { error: 'Sunucu hatası' });
  }
});
// Behind Caddy: keep connections longer than Caddy does, and drop requests that never finish.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

// A bug in background work (push, cleanup) is logged; it must not take every request down with it.
process.on('unhandledRejection', (e) => console.error('unhandled rejection', e));

/** docker compose stop / deploy: finish the requests in flight (up to 10 s), then close the pool. */
function shutdown(signal) {
  console.log(`${signal}: shutting down`);
  server.close();
  const started = Date.now();
  const wait = setInterval(async () => {
    if (inFlight > 0 && Date.now() - started < 10_000) return;
    clearInterval(wait);
    await db.end().catch(() => {});
    process.exit(0);
  }, 100);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await migrate();
server.listen(PORT, '127.0.0.1', () => console.log(`api on 127.0.0.1:${PORT} version ${VERSION}${TEST_TOPUP ? ' (test top-up on)' : ''}`));
