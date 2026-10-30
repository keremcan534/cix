// Shared pieces of the API: configuration, the Postgres pool, migrations, errors, transactions, the wallet
// primitives (move, once), sign-in checks and input validation. Route files import from here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export const env = process.env;

export const db = new pg.Pool({
  host: env.PGHOST ?? '127.0.0.1',
  port: Number(env.PGPORT ?? 5432),
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  max: 10,
});
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// --- Migrations: every .sql file in ./migrations once, in name order ----------------------------------------
export async function migrate() {
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

// --- Errors and transactions -------------------------------------------------------------------------------
export class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function tx(fn) {
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

// --- Users -------------------------------------------------------------------------------------------------
/** The signed-in user's own view: balances included. */
export const selfUser = (u) => ({
  id: u.id,
  name: u.name,
  coins: Number(u.coins),
  diamonds: Number(u.diamonds),
  gameCoins: Number(u.game_coins),
  createdAt: u.created_at,
  ...profileOf(u),
  role: u.role,
});
/** What anyone may see about a person: never balances, birth date or role. */
export const profileOf = (u) => ({
  username: u.username ?? null,
  gender: u.gender ?? null,
  age: u.birth_date ? ageOf(u.birth_date) : null,
  city: u.city ?? null,
  bio: u.bio ?? '',
  interests: u.interests ?? [],
  avatarUrl: u.avatar_url ?? null,
});
export const ageOf = (birth, now = new Date()) => {
  const b = new Date(birth);
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a -= 1;
  return a;
};

/** The session's user. Deleted accounts have no sessions left; banned ones are refused until the ban ends. */
export async function auth(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization ?? '');
  if (!m) throw new HttpError(401, 'Giriş gerekli');
  const r = await db.query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND u.deleted_at IS NULL', [sha(m[1])]);
  if (!r.rowCount) throw new HttpError(401, 'Oturum geçersiz veya süresi dolmuş');
  const u = r.rows[0];
  if (u.banned_until && new Date(u.banned_until) > new Date()) throw new HttpError(403, `Hesabın ${new Date(u.banned_until).toISOString().slice(0, 10)} tarihine kadar askıya alındı`);
  return u;
}

/** True when either of the two has blocked the other. */
export async function blockedBetween(a, b) {
  const r = await db.query('SELECT 1 FROM blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1)', [a, b]);
  return r.rowCount > 0;
}

// --- Wallet ------------------------------------------------------------------------------------------------
const COLUMN = { coin: 'coins', diamond: 'diamonds', game: 'game_coins' };

/** Changes one balance and writes its ledger row. The CHECK on users refuses an overdraft (23514). */
export async function move(c, userId, currency, amount, reason, ref, counterparty = null) {
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
export async function once(userId, currency, ref, fn) {
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
  return { user: selfUser(u.rows[0]), replay };
}

// --- Input -------------------------------------------------------------------------------------------------
export const REF = /^[A-Za-z0-9_-]{8,64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function readJson(req) {
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
export const int = (v, min, max) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : null);
/** A user id from input, or a 400 with `what` in the message. */
export const userId = (v, what = 'kullanıcı') => {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, `Geçersiz ${what}`);
  return v;
};
/** Trimmed text of `min`–`max` characters, or a 400 naming the field. */
export const text = (v, min, max, field) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new HttpError(400, `${field} ${min}–${max} karakter olmalı`);
  return s;
};
