// Shared pieces of the API: configuration, the Postgres pool, migrations, errors, transactions, the wallet
// primitives (move, once), sessions and sign-in checks, rate limits and input validation. Route files import
// from here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { CONTACT_MESSAGE, checkText } from './contact-filter.mjs';

export const env = process.env;

export const db = new pg.Pool({
  host: env.PGHOST ?? '127.0.0.1',
  port: Number(env.PGPORT ?? 5432),
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  max: Number(env.PG_POOL ?? 10),
});
// An idle connection dropped by Postgres (restart, failover) is replaced on the next query; without this
// listener the error would end the whole process.
db.on('error', (e) => console.error('postgres idle connection lost', e.code ?? '', e.message));
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** Constant-time equality of two strings, compared as UTF-8 bytes (a non-ASCII input is just unequal, never a throw). */
export function same(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

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

/** A route's answer sent as plain text instead of JSON (Meta's webhook handshake wants the bare challenge). */
export class RawText {
  constructor(text) {
    this.text = String(text);
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
  // My own gender even when I hide it from others ("Gizli", profiles.mjs).
  gender: u.gender ?? null,
  genderHidden: !!u.gender_hidden,
  role: u.role,
  phone: u.phone ?? null,
  svipXp: Number(u.svip_xp ?? 0),
  // Abonelik's end while it runs (vip.mjs), else null.
  vipSubUntil: subUntil(u),
});
/** When the person's VIP subscription ends (ISO), or null when it isn't running now (users.vip_sub_until, vip.mjs). */
export function subUntil(u, now = Date.now()) {
  const t = u?.vip_sub_until ? new Date(u.vip_sub_until).getTime() : NaN;
  return t > now ? new Date(t).toISOString() : null;
}
/** Whether the person's VIP subscription runs now: Profiline bakanlar, Seviyeleri gizle. */
export const subActive = (u, now = Date.now()) => subUntil(u, now) !== null;
/** What anyone may see about a person: never balances, birth date or role, nor a gender they chose to hide. */
export const profileOf = (u) => ({
  username: u.username ?? null,
  gender: u.gender_hidden ? null : (u.gender ?? null),
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

/**
 * The session's user. Deleted accounts have no sessions left. An account ban, or a device ban on the device the
 * session was opened on, refuses every call (403 with the ban for the ban screen, sanctions.mjs). An appeal
 * session (scope 'appeal', given to a banned person at sign-in) only works where `appeal` is set: reading
 * their sanctions and sending an appeal; once the ban is over it is refused, so the app signs in again.
 */
export async function auth(req, { appeal = false } = {}) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization ?? '');
  if (!m) throw new HttpError(401, 'Giriş gerekli');
  const hash = sha(m[1]);
  const r = await db.query(
    'SELECT u.*, s.created_at AS session_created, s.last_seen_at AS session_seen, s.device_id AS session_device, s.scope AS session_scope FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND u.deleted_at IS NULL',
    [hash],
  );
  if (!r.rowCount) throw new HttpError(401, 'Oturum geçersiz veya süresi dolmuş');
  const u = r.rows[0];
  u.session_hash = hash;
  // "Last used" for the device list; written at most every 5 minutes per session.
  if (Date.now() - new Date(u.session_seen).getTime() > 5 * 60_000) db.query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [hash]).catch(() => {});
  const ban = await liveBan(db, u.id, u.session_device ? [u.session_device] : []);
  if (appeal) {
    u.ban = ban;
    if (u.session_scope === 'appeal' && !ban) throw new HttpError(401, 'Erişim yeniden açıldı, tekrar giriş yap');
    return u;
  }
  if (ban) throw bannedError(ban);
  if (u.session_scope !== 'full') throw new HttpError(401, 'Oturum geçersiz veya süresi dolmuş');
  return u;
}

export const SESSION_DAYS = 30;

/**
 * Opens a session for `userId` and returns its token (the server keeps only the hash). `deviceId`: the
 * device_registry row it was opened on. scope 'appeal': one day, sanctions and appeals only.
 */
export async function newSession(userId, device = '', { deviceId = null, scope = 'full' } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const label = typeof device === 'string' ? device.trim().slice(0, 60) : '';
  const days = scope === 'appeal' ? 1 : SESSION_DAYS;
  await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at, device, device_id, scope) VALUES ($1, $2, now() + interval '${days} days', $3, $4, $5)`, [
    sha(token),
    userId,
    label,
    deviceId,
    scope,
  ]);
  return token;
}

// --- Sanctions: what every request needs (the rest is sanctions.mjs, docs/YAPTIRIM.md) -----------------------
/** A sanction that is on right now, by the server's clock: approved, started, not lifted, not run out. */
export const LIVE_SANCTION = "s.status = 'active' AND s.start_at <= now() AND (s.expires_at IS NULL OR s.expires_at > now())";
export const SANCTION_SELECT = `SELECT s.*, r.title AS reason_title, m.include_dm, m.include_calls, d.device_registry_id
  FROM user_sanctions s JOIN sanction_reasons r ON r.code = s.reason_code
  LEFT JOIN user_mute_records m ON m.sanction_id = s.id LEFT JOIN device_bans d ON d.sanction_id = s.id`;

/** The ban that keeps this account or one of these devices out right now (a lifetime one first), or null. */
export async function liveBan(q, uid, deviceIds = []) {
  const r = await q.query(
    `${SANCTION_SELECT}
      WHERE ${LIVE_SANCTION} AND ((s.sanction_type = 'account_ban' AND s.user_id = $1) OR (s.sanction_type = 'device_ban' AND d.device_registry_id = ANY($2::bigint[])))
      ORDER BY s.is_permanent DESC, s.expires_at DESC NULLS FIRST, s.id DESC LIMIT 1`,
    [uid, deviceIds],
  );
  return r.rows[0] ?? null;
}

export const SANCTION_LABEL = {
  mute_room_text: 'Oda içi yazılı susturma',
  mute_room_voice: 'Oda içi mikrofon susturma',
  mute_global_text: 'Genel yazılı susturma',
  mute_global_voice: 'Genel sesli iletişim susturma',
  mute_all: 'Tüm iletişim susturması',
  account_ban: 'Hesap banı',
  device_ban: 'Cihaz banı',
};
const APPLIED_BY = { room_admin: 'Oda yöneticisi', room_owner: 'Oda sahibi', moderator: 'Platform moderatörü', admin: 'Platform yönetimi', system: 'Otomatik sistem' };

/** What the sanctioned person may see: what is restricted, why, from when to when, by which role. Never notes or how a device was recognised. */
export function sanctionView(s) {
  const restricts = {
    mute_room_text: ['room_text'],
    mute_room_voice: ['room_voice'],
    mute_global_text: ['room_text', ...(s.include_dm ? ['dm'] : [])],
    mute_global_voice: ['room_voice', ...(s.include_calls ? ['call'] : [])],
    mute_all: ['room_text', 'room_voice', 'dm', 'call'],
    account_ban: ['account'],
    device_ban: ['device'],
  }[s.sanction_type];
  return {
    id: Number(s.id),
    type: s.sanction_type,
    label: SANCTION_LABEL[s.sanction_type],
    restricts,
    roomId: s.room_id ?? null,
    reasonCode: s.reason_code,
    reason: s.reason_title,
    reasonText: s.reason_description,
    startAt: s.start_at,
    endAt: s.expires_at,
    permanent: s.is_permanent,
    appliedBy: APPLIED_BY[s.created_role] ?? 'Platform yönetimi',
    status: s.status,
  };
}

/** 403 for a banned account or device; the body carries the ban (and `extra`, e.g. an appeal session). */
export function bannedError(s, extra = {}) {
  const device = s.sanction_type === 'device_ban';
  const msg = device ? 'Bu cihazın SimilarClub erişimi kapatıldı' : 'Hesabının erişimi kapatıldı';
  return Object.assign(new HttpError(403, msg), { extra: { code: device ? 'device_banned' : 'account_banned', sanction: sanctionView(s), serverNow: new Date().toISOString(), ...extra } });
}

/**
 * True when either of the two has blocked the other. Inside a transaction pass its client as `q`: a second pool
 * connection taken while the transaction holds row locks can wait forever once the pool is full of requests
 * waiting on those locks.
 */
export async function blockedBetween(a, b, q = db) {
  const r = await q.query('SELECT 1 FROM blocks WHERE (blocker = $1 AND blocked = $2) OR (blocker = $2 AND blocked = $1)', [a, b]);
  return r.rowCount > 0;
}

// --- Wallet ------------------------------------------------------------------------------------------------
const COLUMN = { coin: 'coins', diamond: 'diamonds', game: 'game_coins' };

/**
 * Changes one balance and writes its ledger row. The CHECK on users refuses an overdraft (23514). `channel`
 * (where the coins came from, wallet.mjs CHANNELS), `actor` (who did it, when not the account itself) and
 * `detail` (lots, purchase, transfer, gift…) are kept with the row. Coins go through wallet.mjs creditCoins /
 * spendCoins, which keep the lots in step.
 */
export async function move(c, userId, currency, amount, reason, ref, counterparty = null, { channel = null, actor = null, detail = {} } = {}) {
  const col = COLUMN[currency];
  let balance;
  try {
    const r = await c.query(`UPDATE users SET ${col} = ${col} + $2 WHERE id = $1 RETURNING ${col} AS b`, [userId, amount]);
    balance = r.rows[0].b;
  } catch (e) {
    if (e.code === '23514') throw new HttpError(409, 'Bakiye yetersiz');
    throw e;
  }
  await c.query('INSERT INTO ledger (user_id, currency, amount, balance, reason, ref, counterparty, channel, actor, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
    userId,
    currency,
    amount,
    balance,
    reason,
    ref,
    counterparty,
    channel,
    actor,
    JSON.stringify(detail),
  ]);
}

/**
 * Inside a wallet change, once the account row is locked: a ref already in the ledger means a copy of this
 * request got there first, so once() answers it as a replay instead of a false "not enough".
 */
export async function claimRef(c, userId, currency, ref) {
  const r = await c.query('SELECT 1 FROM ledger WHERE user_id = $1 AND currency = $2 AND ref = $3', [userId, currency, ref]);
  if (r.rowCount) throw Object.assign(new Error('replay'), { code: '23505' });
}

/**
 * A unique conflict is a replay only when it is this request's own ref: claimRef's error (no constraint) or a
 * unique index with a column named `ref` (the ledger's (user, currency, ref), entitlements' (user, ref),
 * gift_events…). Any other unique index (a special ID someone else just took, agency_payouts.payment_ref, whose
 * name also ends in _ref_key) is a real conflict, never a false success. Looked up once per index name.
 */
const refIndex = new Map();
async function isReplay(e) {
  if (!e.constraint) return true;
  if (!refIndex.has(e.constraint)) {
    const r = await db.query(
      `SELECT 1 FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = ANY(x.indkey)
        WHERE i.relname = $1 AND x.indisunique AND a.attname = 'ref'`,
      [e.constraint],
    );
    refIndex.set(e.constraint, r.rowCount > 0);
  }
  return refIndex.get(e.constraint);
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
      if (!(await isReplay(e))) throw new HttpError(409, 'İşlem çakıştı, tekrar dene');
      replay = true;
    }
  }
  const u = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  return { user: selfUser(u.rows[0]), replay };
}

// --- Rate limits: fixed one-minute windows in memory (one API process) ---------------------------------------
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();

/** Counts one hit for `key`; false once it is past `max` in the current minute. */
export function allow(key, max) {
  const n = (hits.get(key) ?? 0) + 1;
  hits.set(key, n);
  return n <= max;
}

/** Counts one hit for `key`; past `max` in the current minute it answers 429 with `message`. */
export function limit(key, max, message = 'Çok fazla istek, biraz bekle') {
  if (!allow(key, max)) throw new HttpError(429, message);
}

// --- Input -------------------------------------------------------------------------------------------------
/** The caller's address: Caddy replaces X-Forwarded-For with the real client address, so its first entry can be trusted. */
export const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim().slice(0, 64);

export const REF = /^[A-Za-z0-9_-]{8,64}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The request body as a string, at most `max` bytes. */
export async function readRaw(req, max = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const ch of req) {
    size += ch.length;
    if (size > max) throw new HttpError(413, 'İstek çok büyük');
    chunks.push(ch);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// --- File addresses ---------------------------------------------------------------------------------------
// A stored file keeps one address in the database: the storage's own public address (S3_PUBLIC_URL/<key>). Phones
// never get that one: the storage's public host (Cloudflare's r2.dev) can't be reached from some networks (Turkish
// providers block it; Cloudflare doesn't mean it for production either). Everything that goes out to a phone names
// the file at this server instead (<this server>/api/media/f/<key>, sent by media.mjs sendFile), and an address a
// phone sends back is read as the stored one. Each happens in one place: filesOut on every answer (index.mjs send)
// and on a room's metadata (rooms.mjs), filesIn on every body (readJson). This server's address is PUBLIC_URL, else
// https://DOMAIN (.env, as Caddy has it); with neither (most tests), addresses go out as they are stored.
export const FILE_PATH = '/api/media/f/';
const noSlash = (v) => String(v ?? '').trim().replace(/\/+$/, '');
/** Where stored files are kept (ends in "/"), or '' when the storage has no real address. */
const storedFiles = () => {
  const base = noSlash(env.S3_PUBLIC_URL);
  return /^https?:\/\/[^/\s"\\]+/.test(base) ? `${base}/` : '';
};
/** Where phones open stored files (ends in "/"), or '' when this server's address isn't known. */
export const servedFiles = () => {
  const own = noSlash(env.PUBLIC_URL) || (noSlash(env.DOMAIN) ? `https://${noSlash(env.DOMAIN)}` : '');
  return own ? `${own}${FILE_PATH}` : '';
};
/** JSON text on its way to a phone: stored file addresses become this server's. */
export function filesOut(text) {
  const from = storedFiles();
  const to = servedFiles();
  return from && to && text.includes(from) ? text.replaceAll(from, to) : text;
}
/** JSON text from a phone: this server's file addresses become the stored ones. */
export function filesIn(text) {
  const from = servedFiles();
  const to = storedFiles();
  return from && to && text.includes(from) ? text.replaceAll(from, to) : text;
}

export async function readJson(req, max) {
  const raw = filesIn(await readRaw(req, max));
  let v;
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Geçersiz JSON');
  }
  // Handlers read fields off the body: null, an array or a bare value is a bad request, not a crash.
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Geçersiz istek');
  return v;
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

// --- Contact filter: no phone numbers, IBANs, e-mails, links or social media accounts (contact-filter.mjs) ---
// Refused, never masked. Each refusal is counted for moderators (who, which kind, where, when;
// 017_contact_refusals.sql), and the refused text is not stored or logged anywhere. Too many in an hour mute the
// person's messages for a while (sanctions.mjs contactStrike, AUTO_MUTE_*).
const REFUSAL_DAYS = 180;
const REFUSALS_PER_MINUTE = 20;
let refusalsPrunedAt = 0;

/**
 * Counts one refusal (at most 20 a minute per person are written; the rest still count for the automatic mute,
 * sanctions.mjs keeps their times in memory) and applies the automatic mute rule. Answers
 * what the person is told: { strikesLeft, muteMinutes } near the limit, { muted, until, sanction, serverNow } when
 * this refusal started the mute, else {}. Never fails the request, and waits for the rule at most 2 seconds.
 */
export async function countRefusal(uid, category, place) {
  const written = allow(`contact-refusal:${uid}`, REFUSALS_PER_MINUTE);
  if (written) {
    try {
      await db.query('INSERT INTO contact_refusals (user_id, category, place) VALUES ($1, $2, $3)', [uid, category, place]);
      if (Date.now() - refusalsPrunedAt > 3_600_000) {
        refusalsPrunedAt = Date.now();
        await db.query(`DELETE FROM contact_refusals WHERE created_at < now() - interval '${REFUSAL_DAYS} days'`);
      }
    } catch (e) {
      console.error('contact refusal count', e.message);
    }
  }
  // Imported here, not at the top: sanctions.mjs imports this file.
  const rule = import('./sanctions.mjs')
    .then((m) => m.contactStrike(uid, !written))
    .catch((e) => (console.error('contact auto mute', e.message), {}));
  let timer;
  const late = new Promise((done) => (timer = setTimeout(done, 2000, {})));
  return Promise.race([rule, late]).finally(() => clearTimeout(timer));
}

/** The refusal the app shows: 400 { error, code: 'contact_blocked', category, field?, strikesLeft?, muted? … } (countRefusal). */
export const contactError = (category, field, strike = {}) =>
  Object.assign(new HttpError(400, CONTACT_MESSAGE), { extra: { code: 'contact_blocked', category, ...(field ? { field } : {}), ...strike } });

/**
 * Refuses `s` when it shares contact details, counting it for `user` at `place` (e.g. 'profile.bio');
 * `field` is the request's key, for the app to point at the input. Returns `s`.
 */
export async function assertClean(s, user, place, field) {
  if (!s) return s;
  const r = checkText(s);
  if (r.ok) return s;
  throw contactError(r.category, field, await countRefusal(user.id, r.category, place));
}

/** text() for what other people read: trimmed, `min`–`max` characters, and no contact details. */
export const publicText = (v, min, max, label, user, place, field) => assertClean(text(v, min, max, label), user, place, field);
