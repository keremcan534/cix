// Similar Club API on our server, behind Caddy next to Postgres and LiveKit (docs/SUNUCU.md). One dependency: pg.
//
//   GET  /api/health                                            → { ok, db, version, uptime, warnings }   (public)
//   GET  /api/me                                                → { user }
//   GET  /api/ledger                                            → { rows }
//   POST /api/wallet/test-topup { amount, ref }   (test only)   → { user, replay }
//   POST /api/wallet/gift       { to, amount, ref } (test only) → { user, replay }
//   POST /api/wallet/exchange   { diamonds, ref }             → { user, replay, coins }
//   POST /api/wallet/spend      { amount, reason, ref }       → { user, replay }   (in-app purchases: VIP, store items…)
// Coin sources and diamond locks (Gelir: çekilebilir / kilitli): wallet.mjs. Jeton Noktası, refunds and the
// audit view for disputes: jeton.mjs.
// Withdrawals (para çekme): withdraw.mjs. Store refunds read from Google Play: refunds.mjs.
// Sign-in and sessions: auth.mjs. Push: push.mjs. Gifts, catalog, rankings: gifts.mjs. Store purchases:
// purchases.mjs. Uploads: media.mjs. Voice token and presence: live.mjs. Profiles, follows, blocks, reports
// and account deletion: social.mjs. Direct messages: messages.mjs. Rooms: rooms.mjs. Staff: admin.mjs.
// Rüzgâr Gülü (the wheel game, played here): wheel.mjs.
// Agency network (top/sub agencies, commission, performance tiers, payouts, transfers): agency.mjs for
// agencies and streamers, agency-admin.mjs for the centre (docs/AJANS_HIYERARSI.md).
// Every call except sign-in, health and the catalog needs "Authorization: Bearer <session>".
// Error reporting, the app's remote config and kill switches, and the health warnings: reporting.mjs,
// features.mjs, alerts.mjs.
import fs from 'node:fs';
import http from 'node:http';

// First, so its console.error hook is in place before anything else runs.
import { failed } from './reporting.mjs';
import { adminRoutes } from './admin.mjs';
import { alertRoutes, warningCodes } from './alerts.mjs';
import { CONFIG_CACHE, configRoutes, gate } from './features.mjs';
import { agencyRoutes } from './agency.mjs';
import { agencyAdminRoutes } from './agency-admin.mjs';
import { recordIncome } from './agency-lib.mjs';
import { authRoutes } from './auth.mjs';
import { bondRoutes, startBondSweep, stopBondSweep } from './bonds.mjs';
import { wheelRoutes } from './wheel.mjs';
import { EXCHANGE, exchangeCoins } from './catalog.mjs';
import { financeSyncRoutes, startFinanceSync, stopFinanceSync } from './finance-sync.mjs';
import { HttpError, allow, auth, claimRef, clientIp, db, env, int, migrate, once, readJson, selfUser, sha, userId } from './core.mjs';
import { giftRoutes } from './gifts.mjs';
import { jetonRoutes } from './jeton.mjs';
import { liveRoutes } from './live.mjs';
import { mediaRoutes } from './media.mjs';
import { messageRoutes } from './messages.mjs';
import { purchaseRoutes } from './purchases.mjs';
import { pushRoutes } from './push.mjs';
import { roomRoutes } from './rooms.mjs';
import { sanctionRoutes, startSanctionSweep, stopSanctionSweep } from './sanctions.mjs';
import { socialRoutes } from './social.mjs';
import { TEST_DAILY, creditCoins, giftCoins, playCoinsToday, spendCoins, spendDiamonds, walletRoutes as walletInfoRoutes } from './wallet.mjs';
import { withdrawRoutes } from './withdraw.mjs';
import { refundSyncRoutes, startRefundSync, stopRefundSync } from './refunds.mjs';

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
/** Test top-ups: the coin pack sizes; at most TEST_DAILY play coins per user per day (wallet.mjs). */
const TOPUP_PACKS = [1000, 5000, 10000];
const GIFT_MAX = 1_000_000;
/** Largest single diamond → coin exchange (the users table holds bigint, this keeps one request sane). */
const EXCHANGE_MAX = 1_000_000_000;
/** Largest single in-app purchase (VIP, rank, store items, game entries). */
const SPEND_MAX = 10_000_000;
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
    return { ok, db: ok, version: VERSION, uptime: Math.round((Date.now() - STARTED) / 1000), warnings: await warningCodes() };
  },

  async 'GET /api/me'(req) {
    return { user: selfUser(await auth(req)) };
  },

  async 'GET /api/ledger'(req) {
    const u = await auth(req);
    const r = await db.query('SELECT id, currency, amount, balance, reason, ref, counterparty, channel, detail, created_at FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [u.id]);
    return { rows: r.rows.map((x) => ({ ...x, id: Number(x.id), amount: Number(x.amount), balance: Number(x.balance) })) };
  },

  async 'POST /api/wallet/test-topup'(req) {
    if (!TEST_TOPUP) throw new HttpError(403, 'Test yüklemesi kapalı');
    const u = await auth(req);
    const { amount, ref } = await readJson(req);
    if (!TOPUP_PACKS.includes(amount)) throw new HttpError(400, `Paket ${TOPUP_PACKS.join(', ')} olmalı`);
    return once(u.id, 'coin', ref, async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      // One daily cap for all play coins: test top-ups and test purchases together (wallet.mjs).
      if ((await playCoinsToday(c, u.id)) + amount > TEST_DAILY) throw new HttpError(429, `Günlük test yüklemesi sınırı ${TEST_DAILY}`);
      await creditCoins(c, u.id, [{ channel: 'test', amount }], 'Test yüklemesi', ref);
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
      await claimRef(c, u.id, 'coin', ref);
      await giftCoins(c, { sender: u.id, recipient: to, total: n, label: null, ref });
      await recordIncome(c, to, 'gift', `test-gift:${u.id}:${ref}`, n);
    });
  },

  /**
   * Gelir > Çevir: the user's own unlocked diamonds become coins at the server's rate (catalog.mjs
   * exchangeCoins). The client sends only the diamond amount; the coins are worked out here. Both moves share
   * one transaction and the ref, so a retry is applied once and a short balance (409) changes nothing. Locked
   * diamonds (wallet.mjs) can't be exchanged.
   */
  /**
   * An in-app purchase paid with coins (VIP, rank, store items, stickers, game entries). Coins only leave the
   * account, so this can't create value; what was bought is kept by the app for now. A short balance is a 409.
   */
  async 'POST /api/wallet/spend'(req) {
    const u = await auth(req);
    const { amount, reason, ref } = await readJson(req);
    const n = int(amount, 1, SPEND_MAX);
    if (!n) throw new HttpError(400, 'Geçersiz miktar');
    const why = typeof reason === 'string' ? reason.trim().slice(0, 80) : '';
    if (!why) throw new HttpError(400, 'Harcama nedeni gerekli');
    return once(u.id, 'coin', ref, async (c) => {
      const row = await c.query('SELECT coins FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await claimRef(c, u.id, 'coin', ref);
      if (Number(row.rows[0].coins) < n) throw new HttpError(409, 'Yetersiz jeton');
      await spendCoins(c, u.id, n, `Uygulama içi: ${why}`, ref);
    });
  },

  async 'POST /api/wallet/exchange'(req) {
    const u = await auth(req);
    const { diamonds, ref } = await readJson(req);
    const n = int(diamonds, EXCHANGE.minDiamonds, EXCHANGE_MAX);
    if (!n) throw new HttpError(400, `En az ${EXCHANGE.minDiamonds} elmas çevrilebilir`);
    const coins = exchangeCoins(n);
    const r = await once(u.id, 'diamond', ref, async (c) => {
      // A second copy of the same request waits on the row, then finds the ref (a replay) before the
      // balance check (a false "not enough").
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await claimRef(c, u.id, 'diamond', ref);
      await spendDiamonds(c, u.id, n, 'Jetona çevrildi', ref, null, { channel: 'cevir', detail: { coins } });
      await creditCoins(c, u.id, [{ channel: 'cevir', amount: coins }], 'Elmastan çevrildi', ref, null, { detail: { diamonds: n } });
    });
    return { ...r, coins };
  },
};

const routes = {
  ...walletRoutes,
  ...walletInfoRoutes,
  ...withdrawRoutes,
  ...jetonRoutes,
  ...refundSyncRoutes,
  ...authRoutes,
  ...pushRoutes,
  ...giftRoutes,
  ...bondRoutes,
  ...wheelRoutes,
  ...purchaseRoutes,
  ...mediaRoutes,
  ...liveRoutes,
  ...socialRoutes,
  ...messageRoutes,
  ...roomRoutes,
  ...adminRoutes,
  ...financeSyncRoutes,
  ...agencyRoutes,
  ...agencyAdminRoutes,
  ...configRoutes,
  ...alertRoutes,
  ...sanctionRoutes,
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

  const ip = clientIp(req);
  if (limited(req, url.pathname, ip)) return send(429, { error: 'Çok fazla istek, biraz bekle' });

  if (url.pathname === '/api/config') res.setHeader('Cache-Control', CONFIG_CACHE);
  try {
    // A feature switched off in .env (FEATURES_OFF) is refused before its route runs.
    gate(req.method, url.pathname);
    send(200, await route(req, url));
  } catch (err) {
    // A malformed value that only Postgres caught (an id that isn't a uuid, a number or date out of range) is the
    // request's fault: 400, not a server error.
    const e = ['22P02', '22003', '22007', '22008'].includes(err?.code) && !(err instanceof HttpError) ? new HttpError(400, 'Geçersiz istek') : err;
    // 5xx: counted for the health warnings and reported (SENTRY_DSN).
    failed(e, req.method, url.pathname);
    // extra: structured detail for the app (a ban or mute for its screen, sanctions.mjs).
    if (e instanceof HttpError) return send(e.code, { error: e.message, ...(e.extra ?? {}) });
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
  stopFinanceSync();
  stopRefundSync();
  stopBondSweep();
  stopSanctionSweep();
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
startFinanceSync();
startRefundSync();
startBondSweep();
startSanctionSweep();
