// Günlük harcama limiti (Ayarlar › Harcama): a cap on the coins a person spends in a day, kept here so it holds on
// every phone. wallet.mjs spendCoins checks and counts it in the spend's own transaction, so every coin-spending
// route stops at it: gifts (rooms, chats, profiles, Anlar, the family chat), paid messages, paid call and match
// minutes, the wheel, Şanslı hediye, Şanslı çanta, bond requests, founding a family, room animations and the shop.
// A Jeton Noktası sale isn't spending (the bank hands over coins it was paid for) and isn't capped. Every coin that
// leaves counts, reward coins in the shop too; coins that come back later (a bond request not accepted, a bag's
// unclaimed rest) don't lower the day's total. Game coins (the wheel's prizes) are not coins and don't count.
//
//   GET  /api/me/spend-limit            → { limit, next, spentToday, left, day, resetsAt, raiseHours }
//   POST /api/me/spend-limit { limit }  → the same, and applied: 'now' | 'later'   (limit 0: no limit)
//
// Lowering the limit (or setting a first one) applies at once. Raising or lifting it waits RAISE_HOURS (24), a
// common responsible-spending rule; until then the lower limit holds. A raise asked again keeps its wait unless it
// asks for more. The day is Turkey's (Europe/Istanbul), like the other daily counters: today's total starts again
// at midnight there.
// Kept (spend_limits): the limit, a waiting change and the total of the last day the person spent coins on. Nothing
// older; the row goes with the account (social.mjs eraseAccount).
import { HttpError, auth, db, int, readJson, tx } from './core.mjs';

export const RAISE_HOURS = 24;
/** The smallest and largest daily limit a person may set, in coins. */
export const LIMIT_MIN = 100;
export const LIMIT_MAX = 10_000_000;
const TODAY = `(now() AT TIME ZONE 'Europe/Istanbul')::date`;
const fmt = (n) => Number(n).toLocaleString('tr-TR');

/**
 * The row as it stands now: a waiting change whose time has come is the limit (read here, written by the next
 * change), and a total from another day is 0.
 */
const STATE = `
  CASE WHEN next_at <= now() THEN nullif(next_limit, 0) ELSE daily_limit END AS lim,
  CASE WHEN next_at > now() THEN next_limit END AS next_limit,
  CASE WHEN next_at > now() THEN next_at END AS next_at,
  CASE WHEN spent_day = ${TODAY} THEN spent ELSE 0 END AS spent`;

/** The limit state of `uid` (lock: hold the row until the transaction ends). */
async function stateOf(c, uid, lock = false) {
  const r = await c.query(`SELECT ${STATE} FROM spend_limits WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [uid]);
  const x = r.rows[0];
  return {
    limit: x?.lim === null || x?.lim === undefined ? null : Number(x.lim),
    next: x?.next_at ? { limit: Number(x.next_limit) || null, at: x.next_at } : null,
    spent: Number(x?.spent ?? 0),
  };
}

/**
 * The refusal for spending `amount` now, or null when it fits today's limit: 409 code daily_limit with the limit and
 * what is left. It speaks to the spender: never show it to someone else (a match partner).
 */
export async function limitRefusal(c, uid, amount) {
  if (!(amount > 0)) return null;
  const s = await stateOf(c, uid, true);
  if (s.limit === null || s.spent + amount <= s.limit) return null;
  const left = Math.max(0, s.limit - s.spent);
  return Object.assign(new HttpError(409, `Günlük harcama limitin ${fmt(s.limit)} jeton (Ayarlar › Harcama). Bugün kalan: ${fmt(left)} jeton.`), {
    extra: { code: 'daily_limit', limit: s.limit, left },
  });
}

/**
 * Inside a coin spend, before anything moves (the account row is locked): refuses `amount` past today's limit
 * (limitRefusal). Nothing is written, so a caller that ends a call on a refusal can go on with its transaction.
 */
export async function assertUnderLimit(c, uid, amount) {
  const no = await limitRefusal(c, uid, amount);
  if (no) throw no;
}

/** Inside a coin spend, once the coins have moved: adds `amount` to today's total. */
export async function countSpent(c, uid, amount) {
  if (!(amount > 0)) return;
  await c.query(
    `INSERT INTO spend_limits (user_id, spent_day, spent) VALUES ($1, ${TODAY}, $2)
     ON CONFLICT (user_id) DO UPDATE SET spent = CASE WHEN spend_limits.spent_day = ${TODAY} THEN spend_limits.spent + $2 ELSE $2 END, spent_day = ${TODAY}`,
    [uid, amount],
  );
}

/** What the app shows: the limit now, a waiting change, today's total, what is left and when the day ends. */
async function view(c, uid) {
  const s = await stateOf(c, uid);
  const r = await c.query(`SELECT ${TODAY}::text AS day, ((${TODAY} + 1)::timestamp AT TIME ZONE 'Europe/Istanbul') AS resets_at`);
  return {
    limit: s.limit,
    next: s.next,
    spentToday: s.spent,
    left: s.limit === null ? null : Math.max(0, s.limit - s.spent),
    day: r.rows[0].day,
    resetsAt: r.rows[0].resets_at,
    raiseHours: RAISE_HOURS,
  };
}

/** How far a limit lets one spend: no limit is endless. */
const reach = (n) => (n === null ? Infinity : n);

/**
 * Sets `uid`'s limit to `want` (null: none) by the rule above. Returns 'now' when it applies at once, 'later' when
 * it waits.
 */
export async function setLimit(c, uid, want) {
  const s = await stateOf(c, uid, true);
  if (reach(want) <= reach(s.limit)) {
    // Lower (or the same): at once, and a waiting raise is dropped.
    await c.query(
      `INSERT INTO spend_limits (user_id, daily_limit) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET daily_limit = $2, next_limit = NULL, next_at = NULL, updated_at = now()`,
      [uid, want],
    );
    return 'now';
  }
  // Higher or none: after the wait. Asking again for no more than the waiting raise keeps its time.
  const keep = s.next && reach(want) <= reach(s.next.limit);
  await c.query(
    `UPDATE spend_limits SET daily_limit = $2, next_limit = $3,
            next_at = CASE WHEN $4 THEN next_at ELSE now() + make_interval(hours => ${RAISE_HOURS}) END, updated_at = now()
      WHERE user_id = $1`,
    [uid, s.limit, want ?? 0, !!keep],
  );
  return 'later';
}

/** The limit for the data copy (my-data.mjs). */
export const spendLimitOf = (q, uid) => view(q, uid);

export const spendLimitRoutes = {
  async 'GET /api/me/spend-limit'(req) {
    const me = await auth(req);
    return view(db, me.id);
  },

  async 'POST /api/me/spend-limit'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const want = b.limit === 0 || b.limit === null ? null : int(b.limit, LIMIT_MIN, LIMIT_MAX);
    if (want === null && b.limit !== 0 && b.limit !== null) throw new HttpError(400, `Limit ${fmt(LIMIT_MIN)} ile ${fmt(LIMIT_MAX)} jeton arasında olmalı (0: limitsiz)`);
    const applied = await tx((c) => setLimit(c, me.id, want));
    return { ...(await view(db, me.id)), applied };
  },
};
