// Similar Club API on our server, behind Caddy next to Postgres and LiveKit (docs/SUNUCU.md). One dependency: pg.
//
//   GET  /api/health                                            → { ok, db, version, uptime, warnings }   (public)
//   GET  /api/me                                                → { user }
//   GET  /api/ledger                                            → { rows }
//   POST /api/wallet/test-topup { amount, ref }   (test only)   → { user, replay }
//   POST /api/wallet/gift       { to, amount, ref } (test only) → { user, replay }
//   POST /api/wallet/exchange   { diamonds, ref, usdTry? }    → { user, replay, coins }
//   POST /api/wallet/spend      { amount, reason, ref }       → { user, replay }   (old apps' shop buys: economy.mjs)
// Coin sources and diamond locks (Gelir: çekilebilir / kilitli): wallet.mjs. Jeton Noktası, refunds and the
// audit view for disputes: jeton.mjs.
// Withdrawals (para çekme): withdraw.mjs. Store refunds read from Google Play: refunds.mjs.
// Sign-in and sessions: auth.mjs (e-mail codes: mail.mjs; WhatsApp phone check: whatsapp.mjs). Push: push.mjs.
// Gifts, catalog, rankings: gifts.mjs. Store purchases: purchases.mjs. Uploads: media.mjs. Voice token and presence: live.mjs. Profiles, follows, blocks, reports
// and account deletion: social.mjs (levels, extras, album and Vitrin of a profile: profiles.mjs). Direct messages:
// messages.mjs. Rooms: rooms.mjs. Staff: admin.mjs.
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
import { authRoutes, startOtpSweep, stopOtpSweep, withSignIn } from './auth.mjs';
import { bondRoutes, startBondSweep, stopBondSweep } from './bonds.mjs';
import { wealthPoints, wheelRoutes } from './wheel.mjs';
import { EXCHANGE, exchangeCoins } from './catalog.mjs';
import { financeSyncRoutes, startFinanceSync, stopFinanceSync } from './finance-sync.mjs';
import { FILE_PATH, HttpError, RawText, allow, auth, claimRef, clientIp, db, env, filesOut, int, migrate, once, readJson, sha, userId } from './core.mjs';
import { giftRoutes } from './gifts.mjs';
import { jetonRoutes } from './jeton.mjs';
import { liveRoutes } from './live.mjs';
import { luckyRoutes } from './lucky.mjs';
import { economyRoutes } from './economy.mjs';
import { familyRoutes } from './families.mjs';
import { familyMoreRoutes } from './family-more.mjs';
import { exchangeOk } from './live-registry.mjs';
import { live, liveSettingsRoutes, refreshLive, startLiveSync, stopLiveSync } from './live-settings.mjs';
import { mediaRoutes, sendFile } from './media.mjs';
import { luckyBagRoutes, startBagSweep, stopBagSweep } from './lucky-bags.mjs';
import { messageRoutes } from './messages.mjs';
import { momentRoutes } from './moments.mjs';
import { oneOnOneRoutes, startCallSweep, stopCallSweep } from './one-on-one.mjs';
import { purchaseRoutes } from './purchases.mjs';
import { pkRoutes } from './pk.mjs';
import { profileRoutes } from './profiles.mjs';
import { pushRoutes } from './push.mjs';
import { roomRoutes } from './rooms.mjs';
import { sanctionRoutes, startSanctionSweep, stopSanctionSweep } from './sanctions.mjs';
import { socialRoutes } from './social.mjs';
import { teamRoutes } from './team.mjs';
import { musicRoutes } from './music.mjs';
import { roomFxRoutes } from './room-fx.mjs';
import { roomEventRoutes } from './room-events.mjs';
import { TEST_DAILY, charmPoints, creditCoins, giftCoins, playCoinsToday, spendDiamonds, walletRoutes as walletInfoRoutes } from './wallet.mjs';
import { whatsappRoutes } from './whatsapp.mjs';
import { closeLines, openLine } from './live-line.mjs';
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
// Stored files opened from one address in a minute (many phones can share one, and a feed is many photos).
const RATE_FILES = Number(env.RATE_FILES ?? 3000);
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

  /**
   * wealthXp: the Cömertlik points the server counts (wheel.mjs wealthPoints), so the app gates games with the same
   * value; charmXp: the Yankı points (wallet.mjs charmPoints), which open posting in Anlar.
   */
  async 'GET /api/me'(req) {
    const u = await auth(req);
    return { user: { ...(await withSignIn(u)), wealthXp: await wealthPoints(db, u.id), charmXp: await charmPoints(db, u.id) } };
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
      if ((await playCoinsToday(c, u.id)) + amount > TEST_DAILY) throw new HttpError(429, `Günlük test yükleme sınırı: ${TEST_DAILY.toLocaleString('tr-TR')} jeton`);
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
   * exchangeCoins), the live one from Canlı ayarlar (live-settings.mjs). The client sends the diamond amount
   * and the rate its screen showed (usdTry; old apps send none and showed the compiled rate); the coins are
   * worked out here. A live rate below the shown one is a 409: rate_changed with the new rate and coins for
   * new apps, update_required for old ones. Both moves share one transaction and the ref, so a retry is
   * applied once and a short balance (409) changes nothing. Locked diamonds (wallet.mjs) can't be exchanged.
   */
  async 'POST /api/wallet/exchange'(req) {
    const u = await auth(req);
    // Read once: a request that read the old rate completes at it, the rate the user saw.
    const s = live();
    const { diamonds, ref, usdTry } = await readJson(req);
    const n = int(diamonds, EXCHANGE.minDiamonds, EXCHANGE_MAX);
    if (!n) throw new HttpError(400, `En az ${EXCHANGE.minDiamonds} elmas çevrilebilir`);
    // The rate the screen showed: new apps send it, old ones send nothing and showed the compiled rate.
    const newApp = usdTry !== undefined && usdTry !== null;
    const shown = newApp ? (typeof usdTry === 'number' ? usdTry : NaN) : EXCHANGE.usdTry;
    const coins = exchangeCoins(n, s.usdTry);
    const r = await once(u.id, 'diamond', ref, async (c) => {
      // A second copy of the same request waits on the row, then finds the ref (a replay) before the
      // balance check (a false "not enough").
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [u.id]);
      await claimRef(c, u.id, 'diamond', ref);
      // After the ref check, so a retry of one that went through gets its replay. Never fewer coins than the
      // screen showed: a lower live rate is refused, nothing moves; a higher one simply gives more.
      if (!exchangeOk(s.usdTry, shown)) {
        throw newApp
          ? Object.assign(new HttpError(409, 'Kur değişti, yeni tutarı kontrol et'), { extra: { code: 'rate_changed', usdTry: s.usdTry, coins } })
          : Object.assign(new HttpError(409, 'Çevirme kuru değişti. Güncel tutar için uygulamayı güncelle'), { extra: { code: 'update_required' } });
      }
      await spendDiamonds(c, u.id, n, 'Jetona çevrildi', ref, null, { channel: 'cevir', detail: { coins, usdTry: s.usdTry } });
      await creditCoins(c, u.id, [{ channel: 'cevir', amount: coins }], 'Elmastan çevrildi', ref, null, { detail: { diamonds: n } });
    });
    if (!r.replay) return { ...r, coins };
    // A replay reports what that ref gave (its diamond row), not this body's amount at today's rate.
    const row = (await db.query("SELECT detail FROM ledger WHERE user_id = $1 AND currency = 'diamond' AND ref = $2", [u.id, ref])).rows[0];
    return { ...r, coins: Number(row?.detail?.coins ?? 0) };
  },
};

// The live line (live-line.mjs) streams instead of answering once: the handler below opens it itself; this entry
// only lets the path through the router, the limiter and FEATURES_OFF.
const LIVE_LINE = '/api/live';
const routes = {
  [`GET ${LIVE_LINE}`]: () => null,
  ...walletRoutes,
  ...walletInfoRoutes,
  ...economyRoutes,
  ...withdrawRoutes,
  ...jetonRoutes,
  ...refundSyncRoutes,
  ...authRoutes,
  ...whatsappRoutes,
  ...pushRoutes,
  ...giftRoutes,
  ...pkRoutes,
  ...bondRoutes,
  ...wheelRoutes,
  ...luckyRoutes,
  ...familyRoutes,
  ...familyMoreRoutes,
  ...purchaseRoutes,
  ...mediaRoutes,
  ...liveRoutes,
  ...socialRoutes,
  ...profileRoutes,
  ...messageRoutes,
  ...oneOnOneRoutes,
  ...luckyBagRoutes,
  ...momentRoutes,
  ...teamRoutes,
  ...musicRoutes,
  ...roomFxRoutes,
  ...roomEventRoutes,
  ...roomRoutes,
  ...adminRoutes,
  ...financeSyncRoutes,
  ...agencyRoutes,
  ...agencyAdminRoutes,
  ...configRoutes,
  ...alertRoutes,
  ...sanctionRoutes,
  ...liveSettingsRoutes,
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
    if (!res.headersSent && data instanceof RawText) res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }).end(data.text);
    // Stored files are named at this server's address on the way out (core.mjs filesOut).
    else if (!res.headersSent) res.writeHead(code).end(filesOut(JSON.stringify(data)));
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

  // A stored file (a photo, a track) goes out as itself, not as JSON (media.mjs sendFile). Its own limit: a screen
  // of photos is many requests at once, and they mustn't use up the phone's API calls. Nothing here is logged with
  // its path: whoever has a file's address can open it.
  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith(FILE_PATH)) {
    if (!allow(`ip-file:${clientIp(req)}`, RATE_FILES)) return void res.writeHead(429).end(JSON.stringify({ error: 'Çok fazla istek, biraz bekle' }));
    let key = '';
    try {
      key = decodeURIComponent(url.pathname.slice(FILE_PATH.length));
    } catch {
      // Not a key: answered 404 by sendFile.
    }
    try {
      await sendFile(req, res, key);
    } catch (e) {
      console.error('file', e?.code ?? e?.name);
      if (res.headersSent) res.destroy();
      else res.writeHead(500).end(JSON.stringify({ error: 'Sunucu hatası' }));
    }
    return;
  }

  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(404, { error: 'Bulunamadı' });

  const ip = clientIp(req);
  if (limited(req, url.pathname, ip)) return send(429, { error: 'Çok fazla istek, biraz bekle' });

  if (url.pathname === '/api/config') res.setHeader('Cache-Control', CONFIG_CACHE);
  try {
    // A feature switched off in .env (FEATURES_OFF) is refused before its route runs.
    gate(req.method, url.pathname);
    if (url.pathname === LIVE_LINE) return await openLine(req, res);
    send(200, await route(req, url));
  } catch (err) {
    // A malformed value that only Postgres caught is the request's fault: 400, not a server error. An id that
    // isn't a uuid, a number or date out of range; text Postgres can't store, such as a NUL byte (22021). A
    // missing row (23503) stays a 5xx: each route checks its own ids, so one that gets that far is a server bug.
    const bad = err instanceof HttpError ? null : err?.code === '22021' ? 'Geçersiz metin' : ['22P02', '22003', '22007', '22008'].includes(err?.code) ? 'Geçersiz istek' : null;
    const e = bad ? new HttpError(400, bad) : err;
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
  // Open live lines would hold the shutdown up; the phones reconnect to the next process.
  closeLines();
  stopFinanceSync();
  stopRefundSync();
  stopBondSweep();
  stopSanctionSweep();
  stopLiveSync();
  stopOtpSweep();
  stopCallSweep();
  stopBagSweep();
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
await refreshLive();
server.listen(PORT, '127.0.0.1', () => console.log(`api on 127.0.0.1:${PORT} version ${VERSION}${TEST_TOPUP ? ' (test top-up on)' : ''}`));
startFinanceSync();
startRefundSync();
startBondSweep();
startSanctionSweep();
startLiveSync();
startOtpSweep();
startCallSweep();
startBagSweep();
