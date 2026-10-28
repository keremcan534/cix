// Similar Club API: development sign-in, wallet (coins, diamonds, ledger) and LiveKit tokens for signed-in users.
// Runs next to Postgres and LiveKit on the server behind Caddy (docs/SUNUCU.md). One dependency: pg.
//
//   POST /api/auth/dev          { deviceKey, name }             → { session, user }
//   GET  /api/me                                                → { user }
//   GET  /api/ledger                                            → { rows }
//   POST /api/wallet/test-topup { amount, ref }   (test only)   → { user, replay }
//   POST /api/wallet/gift       { to, amount, ref }             → { user, replay }
//   GET  /token?room=                                           → { token, ttl }
// Every call except sign-in needs "Authorization: Bearer <session>".
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import pg from 'pg';

const env = process.env;
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
/** Web origins allowed to call this: the dev server and the GitHub Pages preview. Native apps send no Origin. */
const ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/[a-z0-9-]+\.github\.io)$/;
const ROOM = /^[A-Za-z0-9_-]{1,64}$/;
const REF = /^[A-Za-z0-9_-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const db = new pg.Pool({ host: env.PGHOST ?? '127.0.0.1', user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB, max: 10 });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// --- Migrations: every .sql file in ./migrations once, in name order ----------------------------------------
async function migrate() {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'migrations');
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const done = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (done.rowCount) continue;
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      await c.query(fs.readFileSync(path.join(dir, name), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await c.query('COMMIT');
      console.log(`migration ${name} applied`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
}

// --- Helpers ---------------------------------------------------------------------------------------------
class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const publicUser = (u) => ({ id: u.id, name: u.name, coins: Number(u.coins), diamonds: Number(u.diamonds), gameCoins: Number(u.game_coins), createdAt: u.created_at });
const COLUMN = { coin: 'coins', diamond: 'diamonds', game: 'game_coins' };

async function tx(fn) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

/** Changes one balance and writes its ledger row. The CHECK on users refuses an overdraft (23514). */
async function move(c, userId, currency, amount, reason, ref, counterparty = null) {
  const col = COLUMN[currency];
  let balance;
  try {
    const r = await c.query(`UPDATE users SET ${col} = ${col} + $2 WHERE id = $1 RETURNING ${col} AS b`, [userId, amount]);
    balance = r.rows[0].b;
  } catch (e) {
    if (e.code === '23514') throw new HttpError(409, 'Bakiye yetersiz');
    throw e;
  }
  await c.query('INSERT INTO ledger (user_id, currency, amount, balance, reason, ref, counterparty) VALUES ($1,$2,$3,$4,$5,$6,$7)', [userId, currency, amount, balance, reason, ref, counterparty]);
}

/** Runs a wallet change once per ref: a repeated ref returns the current state with replay = true. */
async function once(userId, currency, ref, fn) {
  if (!REF.test(ref ?? '')) throw new HttpError(400, 'Geçersiz istek kimliği');
  const seen = async () => (await db.query('SELECT 1 FROM ledger WHERE user_id = $1 AND currency = $2 AND ref = $3', [userId, currency, ref])).rowCount > 0;
  let replay = await seen();
  if (!replay) {
    try {
      await tx(fn);
    } catch (e) {
      // Two copies of the same request at once: the second hits the unique (user, currency, ref).
      if (e.code !== '23505') throw e;
      replay = true;
    }
  }
  const u = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return { user: publicUser(u.rows[0]), replay };
}

async function auth(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization ?? '');
  if (!m) throw new HttpError(401, 'Giriş gerekli');
  const r = await db.query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha(m[1])]);
  if (!r.rowCount) throw new HttpError(401, 'Oturum geçersiz veya süresi dolmuş');
  return r.rows[0];
}

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

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const ch of req) {
    size += ch.length;
    if (size > 10_000) throw new HttpError(413, 'İstek çok büyük');
    chunks.push(ch);
  }
  try {
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  } catch {
    throw new HttpError(400, 'Geçersiz JSON');
  }
}
const int = (v, min, max) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : null);

// --- Routes ----------------------------------------------------------------------------------------------
const routes = {
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
    return { session, user: publicUser(u) };
  },

  async 'GET /api/me'(req) {
    return { user: publicUser(await auth(req)) };
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
    if (typeof to !== 'string' || !UUID.test(to)) throw new HttpError(400, 'Geçersiz alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine hediye gönderemezsin');
    return once(u.id, 'coin', ref, async (c) => {
      // Lock both rows in id order so two people gifting each other at once can't deadlock.
      const locked = await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[u.id, to]]);
      if (locked.rowCount < 2) throw new HttpError(404, 'Alıcı bulunamadı');
      await move(c, u.id, 'coin', -n, 'Hediye gönderildi', ref, to);
      await move(c, to, 'diamond', n, 'Hediye alındı', `${ref}-in`, u.id);
    });
  },

  async 'GET /token'(req, url) {
    const u = await auth(req);
    const room = url.searchParams.get('room') ?? '';
    if (!ROOM.test(room)) throw new HttpError(400, 'Geçersiz oda');
    return { token: liveKitToken(room, u), ttl: TOKEN_TTL };
  },
};

// --- Server: CORS, per-IP rate limit, JSON errors -------------------------------------------------------------
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
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
  if (n > (url.pathname === '/api/auth/dev' ? 10 : 120)) return send(429, { error: 'Çok fazla istek, biraz bekle' });

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
