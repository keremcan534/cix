// Coin lots and diamond locks: where every coin came from, and when the diamonds it turns into may leave.
//
//   GET /api/wallet/earnings   → { diamonds, withdrawable, locked, lockDays, locks }   (Gelir: çekilebilir / kilitli)
//   GET /api/wallet/coins      → { coins, channels, lots }                             (where my coins came from)
//
// A credit of coins writes one lot per source (store purchase, first-purchase gift, Jeton Noktası sale,
// wholesale, Çevir…) with its channel, date, supplier and lock. A spend takes coins from the account's open
// lots, store coins first (COIN_SPEND_ORDER=fifo: oldest first), and the ledger row says which lots it used.
// A gift turns each portion into the recipient's diamonds with that lot's lock: store coins (Google Play, App
// Store) 7 days, Jeton Noktası coins 1 day (LOCK_DAYS_STORE, LOCK_DAYS_JETON). Coins a Jeton Noktası passes on
// keep the longer lock of where the bank got them, so store coins can't be washed through a bank. Locked
// diamonds count in the balance but can't be exchanged, sold or withdrawn; a store refund inside the lock
// takes them back (jeton.mjs).
import { HttpError, auth, db, env, move } from './core.mjs';

const lockHoursFrom = (v, days) => {
  const n = Number(v ?? days);
  return Math.round((Number.isFinite(n) && n >= 0 && n <= 90 ? n : days) * 24);
};
export const LOCK_HOURS = { store: lockHoursFrom(env.LOCK_DAYS_STORE, 7), jeton: lockHoursFrom(env.LOCK_DAYS_JETON, 1) };
const SPEND_ORDER = env.COIN_SPEND_ORDER === 'fifo' ? 'id' : 'lock_hours DESC, id';

/** Coin channels: the label people see and which lock diamonds bought with them get. */
export const CHANNELS = {
  google: { label: 'Google Play', lock: 'store' },
  apple: { label: 'App Store', lock: 'store' },
  test: { label: 'Test satın alma', lock: 'store' },
  bonus: { label: 'İlk alım hediyesi', lock: 'store' },
  legacy: { label: 'Önceki bakiye', lock: 'store' },
  jeton_noktasi: { label: 'Jeton Noktası', lock: 'jeton' },
  toptan: { label: 'Toptan alım', lock: 'jeton' },
  bozdurma: { label: 'Elmas bozdurma', lock: 'jeton' },
  cevir: { label: 'Elmastan çevrildi', lock: 'jeton' },
};
const lockOf = (channel) => LOCK_HOURS[CHANNELS[channel].lock];
/** One channel for a ledger row: the lots' channel, or "mixed" when it used several. */
const channelOf = (parts) => {
  const set = new Set(parts.map((p) => p.channel));
  return set.size === 1 ? [...set][0] : 'mixed';
};
const fmt = (n) => n.toLocaleString('tr-TR');

/**
 * Credits coins from `portions` ([{ channel, amount, lockHours?, purchaseId?, transferId?, sourceLot?,
 * sourceUser? }]): one lot each and one ledger row. A portion's lock is its channel's, or longer if given.
 */
export async function creditCoins(c, userId, portions, reason, ref, counterparty = null, { actor = null, detail = {} } = {}) {
  const lots = [];
  for (const p of portions) {
    if (!(p.amount > 0)) continue;
    const lockHours = Math.max(lockOf(p.channel), p.lockHours ?? 0);
    const r = await c.query(
      'INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, purchase_id, transfer_id, source_lot, source_user, ref) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [userId, p.channel, p.amount, lockHours, p.purchaseId ?? null, p.transferId ?? null, p.sourceLot ?? null, p.sourceUser ?? null, ref],
    );
    lots.push({ lot: Number(r.rows[0].id), channel: p.channel, amount: p.amount, lockHours });
  }
  const total = lots.reduce((s, l) => s + l.amount, 0);
  await move(c, userId, 'coin', total, reason, ref, counterparty, { channel: channelOf(lots), actor, detail: { ...detail, lots } });
  return lots;
}

/**
 * Spends coins from the account's open lots and writes the ledger row; returns the portions used ({ lot,
 * channel, amount, lockHours }). The account row must be locked. A short balance is a 409 and changes nothing.
 */
export async function spendCoins(c, userId, amount, reason, ref, counterparty = null, { actor = null, detail = {} } = {}) {
  const open = await c.query(`SELECT id, channel, remaining, lock_hours FROM coin_lots WHERE user_id = $1 AND remaining > 0 ORDER BY ${SPEND_ORDER} FOR UPDATE`, [userId]);
  const parts = [];
  let left = amount;
  for (const l of open.rows) {
    if (left <= 0) break;
    const take = Math.min(left, Number(l.remaining));
    await c.query('UPDATE coin_lots SET remaining = remaining - $2 WHERE id = $1', [l.id, take]);
    parts.push({ lot: Number(l.id), channel: l.channel, amount: take, lockHours: l.lock_hours });
    left -= take;
  }
  // Coins with no lot (credited around creditCoins): their source is unknown, so the store lock.
  if (left > 0) parts.push({ lot: null, channel: 'legacy', amount: left, lockHours: LOCK_HOURS.store });
  await move(c, userId, 'coin', -amount, reason, ref, counterparty, { channel: channelOf(parts), actor, detail: { ...detail, lots: parts } });
  if (left > 0) console.error(`coin lots short for ${userId}: ${left} coins without a lot`);
  return parts;
}

/**
 * A gift: the sender's coins become the recipient's diamonds 1 to 1, each portion locked by the channel of
 * the coins that paid for it. Both account rows must be locked.
 */
export async function giftCoins(c, { sender, recipient, total, label, ref, giftEvent = null }) {
  const what = label ? `: ${label}` : '';
  const parts = await spendCoins(c, sender, total, `Hediye gönderildi${what}`, ref, recipient, { detail: giftEvent ? { gift: giftEvent } : {} });
  const locks = [];
  for (const p of parts) {
    const r = await c.query(
      `INSERT INTO diamond_locks (user_id, sender, amount, channel, unlock_at, gift_event, coin_lot, ref)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5::int), $6, $7, $8) RETURNING id, unlock_at`,
      [recipient, sender, p.amount, p.channel, p.lockHours, giftEvent, p.lot, ref],
    );
    locks.push({ lock: Number(r.rows[0].id), channel: p.channel, amount: p.amount, unlockAt: r.rows[0].unlock_at });
  }
  await move(c, recipient, 'diamond', total, `Hediye alındı${what}`, `${ref}-in`, sender, { channel: channelOf(parts), detail: { ...(giftEvent && { gift: giftEvent }), locks } });
  return locks;
}

/** An account's diamonds: all of them, those still locked, and those that may leave. */
export async function diamondState(c, userId) {
  const r = await c.query(
    `SELECT u.diamonds,
            coalesce((SELECT sum(d.amount) FROM diamond_locks d WHERE d.user_id = u.id AND d.status = 'active' AND d.unlock_at > now()), 0) AS locked
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  const diamonds = Number(r.rows[0].diamonds);
  const locked = Math.min(diamonds, Number(r.rows[0].locked));
  return { diamonds, locked, withdrawable: diamonds - locked };
}

/** Takes unlocked diamonds (Çevir, Jeton Noktası sale, withdrawal). The account row must be locked. */
export async function spendDiamonds(c, userId, amount, reason, ref, counterparty = null, extra = {}) {
  const s = await diamondState(c, userId);
  if (amount > s.withdrawable) {
    throw new HttpError(409, amount <= s.diamonds ? `${fmt(s.locked)} elmasın kilidi henüz açılmadı; çekilebilir bakiyen ${fmt(s.withdrawable)} elmas` : 'Bakiye yetersiz');
  }
  await move(c, userId, 'diamond', -amount, reason, ref, counterparty, extra);
  return s;
}

const days = (h) => h / 24;

export const walletRoutes = {
  async 'GET /api/wallet/earnings'(req) {
    const u = await auth(req);
    const s = await diamondState(db, u.id);
    const r = await db.query(
      `SELECT d.id, d.amount, d.channel, d.unlock_at, d.created_at, d.sender, s.name AS sender_name, g.gift_id, g.count
         FROM diamond_locks d LEFT JOIN users s ON s.id = d.sender LEFT JOIN gift_events g ON g.id = d.gift_event
        WHERE d.user_id = $1 AND d.status = 'active' AND d.unlock_at > now()
        ORDER BY d.unlock_at, d.id LIMIT 100`,
      [u.id],
    );
    return {
      ...s,
      lockDays: { store: days(LOCK_HOURS.store), jeton: days(LOCK_HOURS.jeton) },
      locks: r.rows.map((x) => ({
        id: Number(x.id),
        amount: Number(x.amount),
        channel: x.channel,
        channelLabel: CHANNELS[x.channel]?.label ?? 'Karışık',
        unlockAt: x.unlock_at,
        createdAt: x.created_at,
        from: x.sender ? { id: x.sender, name: x.sender_name } : null,
        gift: x.gift_id ? { id: x.gift_id, count: x.count } : null,
      })),
    };
  },

  async 'GET /api/wallet/coins'(req) {
    const u = await auth(req);
    const by = await db.query('SELECT channel, sum(remaining) AS remaining FROM coin_lots WHERE user_id = $1 AND remaining > 0 GROUP BY channel ORDER BY 2 DESC', [u.id]);
    const lots = await db.query(
      `SELECT l.id, l.channel, l.amount, l.remaining, l.lock_hours, l.created_at, l.transfer_id, l.source_user, s.name AS source_name, p.platform, p.product_id
         FROM coin_lots l LEFT JOIN users s ON s.id = l.source_user LEFT JOIN purchases p ON p.id = l.purchase_id
        WHERE l.user_id = $1 ORDER BY l.id DESC LIMIT 50`,
      [u.id],
    );
    return {
      coins: Number(u.coins),
      channels: by.rows.map((x) => ({ channel: x.channel, label: CHANNELS[x.channel].label, remaining: Number(x.remaining) })),
      lots: lots.rows.map((x) => ({
        id: Number(x.id),
        channel: x.channel,
        label: CHANNELS[x.channel].label,
        amount: Number(x.amount),
        remaining: Number(x.remaining),
        lockDays: days(x.lock_hours),
        createdAt: x.created_at,
        transfer: x.transfer_id === null ? null : Number(x.transfer_id),
        from: x.source_user ? { id: x.source_user, name: x.source_name } : null,
        product: x.product_id ?? null,
      })),
    };
  },
};
