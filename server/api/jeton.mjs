// Jeton Noktası (coins bank) on the server, store refunds, and the records a dispute needs.
//
//   GET  /api/jeton/banks                                                   → { banks }
//   POST /api/jeton/transfer       { to, coins, paymentRef?, note?, ref }   (Jeton Noktası) → { user, replay, transfer }
//   POST /api/jeton/sell-diamonds  { bank, diamonds, ref }                  → { user, replay, transfer }
//   GET  /api/jeton/transfers                                               → { rows }   (own, sent and received)
//   POST /api/admin/jeton/bank      { user, enabled }                       (admin) → { role }
//   POST /api/admin/jeton/wholesale { bank, coins, paymentRef, note?, ref } (admin) → { user, replay, transfer }
//   POST /api/admin/purchases/refund { purchase }                           (admin) → { coins, diamonds, unrecoveredDiamonds }
//   GET  /api/admin/wallet/audit?user=                                      (admin) → everything about one account's money
//
// A Jeton Noktası sells coins to people who pay it outside the app (payment_ref: its receipt), buys hosts'
// unlocked diamonds at their value (it pays the host; it gets coins worth the value plus its fee), and buys
// its stock from management (wholesale, booked by an admin against management's receipt). Every transfer
// is a coin_transfers row with who gave, who got, who pressed the button, the receipt, the IP and the time;
// the ledger rows on both sides say the same. Coins a bank passes on are the buyer's 'jeton_noktasi' lots:
// gifted, they lock the recipient's diamonds for 1 day (or longer, if the bank's coins came from a store).
//
// A refund (the store refunded a purchase, or a chargeback) takes back the purchase's coins still unspent,
// wherever a Jeton Noktası passed them, and the diamonds they became that are still locked. Diamonds already
// unlocked are reported as unrecovered. The agency commission those gifts earned is reversed. Admin only:
// moderators don't touch money. Google Play refunds also arrive on their own (refunds.mjs).
import { HttpError, auth, claimRef, clientIp, db, int, move, once, readJson, selfUser, text, tx, userId } from './core.mjs';
import { EXCHANGE, bankExchangeCoins, diamondValueTl, wholesaleTl } from './catalog.mjs';
import { CHANNELS, creditCoins, diamondState, spendCoins, spendDiamonds } from './wallet.mjs';
import { recordIncome } from './agency-lib.mjs';

const TRANSFER_MAX = 100_000_000;
const DIAMONDS_MAX = 1_000_000_000;
const optional = (v, max, field) => (v === undefined || v === null || v === '' ? '' : text(v, 1, max, field));
const n = (v) => (v === null || v === undefined ? null : Number(v));

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

const audit = (c, actor, action, target, detail, ip) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1,$2,$3,$4,$5)', [actor, action, target, JSON.stringify(detail), ip]);

const transferOf = (t) => ({
  id: Number(t.id),
  kind: t.kind,
  from: t.from_user ? { id: t.from_user, name: t.from_name ?? null } : null,
  to: { id: t.to_user, name: t.to_name ?? null },
  coins: Number(t.coins),
  diamonds: n(t.diamonds),
  valueTl: n(t.value_tl),
  paymentRef: t.payment_ref,
  note: t.note,
  actor: t.actor,
  createdAt: t.created_at,
});
const TRANSFER_SELECT = `SELECT t.*, f.name AS from_name, r.name AS to_name FROM coin_transfers t LEFT JOIN users f ON f.id = t.from_user JOIN users r ON r.id = t.to_user`;
const findTransfer = async (actor, ref) => {
  const r = await db.query(`${TRANSFER_SELECT} WHERE t.actor = $1 AND t.ref = $2`, [actor, ref]);
  return r.rowCount ? transferOf(r.rows[0]) : null;
};

/**
 * Writes a transfer row and returns its id. A copy of the same request is caught earlier (claimRef), so a ref
 * this actor already used here belongs to another transfer: a 409, not a replay.
 */
async function insertTransfer(c, sql, params) {
  try {
    return Number((await c.query(sql, params)).rows[0].id);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Bu istek kimliği başka bir aktarımda kullanıldı');
    throw e;
  }
}

/** Locks the rows of `ids` in id order (no deadlock between two transfers in opposite directions). */
async function lockUsers(c, ids) {
  const r = await c.query('SELECT id, role FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE', [ids]);
  return new Map(r.rows.map((x) => [x.id, x]));
}

/**
 * Takes a refunded store purchase back, in the caller's transaction: its coins still unspent wherever they went,
 * the diamonds they became that are still locked, and the agency commission those gifts earned (a 'refund'
 * income event per gift portion, at the gift's time, so each agency gives back what it got). Returns the
 * totals, or null when the purchase was already refunded (a second call changes nothing). `actor` is the admin,
 * or null for the store's own refund list (refunds.mjs).
 */
export async function refundPurchase(c, id, { actor = null, ip = '', source = 'admin' } = {}) {
  const p = (await c.query('SELECT * FROM purchases WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!p) throw new HttpError(404, 'Satın alma bulunamadı');
  if (p.status === 'refunded') return null;
  // The coins' trail (lots passed on, the diamond locks gifts made) is read only once every account on it is
  // locked: a gift or a transfer that commits while we wait for a lock would otherwise be missed. Locking can
  // reveal more of the trail, so read again until the set of accounts stops growing.
  let lots;
  let locks;
  const held = new Set();
  for (;;) {
    lots = (
      await c.query(
        `WITH RECURSIVE t AS (SELECT id, user_id, channel FROM coin_lots WHERE purchase_id = $1
                              UNION ALL SELECT l.id, l.user_id, l.channel FROM coin_lots l JOIN t ON l.source_lot = t.id)
         SELECT id, user_id, channel FROM t`,
        [id],
      )
    ).rows;
    locks = (
      await c.query("SELECT id, user_id, amount, channel, created_at, unlock_at > now() AS locked FROM diamond_locks WHERE coin_lot = ANY($1::bigint[]) AND status = 'active' ORDER BY id", [
        lots.map((l) => l.id),
      ])
    ).rows;
    const more = [...new Set([...lots.map((l) => l.user_id), ...locks.map((k) => k.user_id)])].filter((u) => !held.has(u));
    if (!more.length) break;
    await c.query('SELECT 1 FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [more]);
    more.forEach((u) => held.add(u));
  }
  let coins = 0;
  let diamonds = 0;
  let unrecoveredDiamonds = 0;
  let commissionDiamonds = 0;
  // Remaining is read after the rows are locked, so a spend can't slip in between.
  for (const l of lots) {
    const left = Number((await c.query('SELECT remaining FROM coin_lots WHERE id = $1', [l.id])).rows[0].remaining);
    if (!left) continue;
    const balance = Number((await c.query('SELECT coins FROM users WHERE id = $1', [l.user_id])).rows[0].coins);
    const take = Math.min(left, balance);
    await c.query('UPDATE coin_lots SET remaining = 0 WHERE id = $1', [l.id]);
    if (take > 0) await move(c, l.user_id, 'coin', -take, 'İade: satın alınan jeton geri alındı', `refund:${id}:c${l.id}`, null, { channel: l.channel, actor, detail: { purchase: id, lot: Number(l.id) } });
    coins += take;
  }
  for (const k of locks) {
    const amount = Number(k.amount);
    // The agency share of this gift goes back whether or not its diamonds can still be taken. Once per lock:
    // the income event's source_ref is unique.
    if (await recordIncome(c, k.user_id, 'refund', `refund:${id}:${k.id}`, -amount, k.created_at)) commissionDiamonds += amount;
    if (!k.locked) {
      unrecoveredDiamonds += amount;
      continue;
    }
    const balance = Number((await c.query('SELECT diamonds FROM users WHERE id = $1', [k.user_id])).rows[0].diamonds);
    const take = Math.min(amount, balance);
    await c.query("UPDATE diamond_locks SET status = 'reversed' WHERE id = $1", [k.id]);
    if (take > 0) await move(c, k.user_id, 'diamond', -take, 'İade: hediye elması geri alındı', `refund:${id}:d${k.id}`, p.user_id, { channel: k.channel, actor, detail: { purchase: id, lock: Number(k.id) } });
    diamonds += take;
    unrecoveredDiamonds += amount - take;
  }
  await c.query("UPDATE purchases SET status = 'refunded' WHERE id = $1", [id]);
  await c.query('UPDATE users SET svip_xp = greatest(0, svip_xp - $2) WHERE id = $1', [p.user_id, p.coins]);
  await audit(c, actor, 'purchase.refund', p.user_id, { purchase: id, platform: p.platform, transaction: p.transaction_id, coins, diamonds, unrecoveredDiamonds, commissionDiamonds, source }, ip);
  return { coins, diamonds, unrecoveredDiamonds };
}

export const jetonRoutes = {
  /** Jeton Noktası accounts, for the app's bank list and the diamond sale. */
  async 'GET /api/jeton/banks'(req) {
    await auth(req);
    const r = await db.query("SELECT id, name, avatar_url FROM users WHERE role = 'coins_bank' AND deleted_at IS NULL ORDER BY name");
    return { banks: r.rows.map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null })) };
  },

  /** A Jeton Noktası sends coins from its stock to someone who paid it. */
  async 'POST /api/jeton/transfer'(req) {
    const u = await auth(req);
    if (u.role !== 'coins_bank') throw new HttpError(403, 'Yalnızca Jeton Noktası hesapları jeton aktarabilir');
    const b = await readJson(req);
    const to = userId(b.to, 'alıcı');
    if (to === u.id) throw new HttpError(400, 'Kendine aktaramazsın');
    const coins = int(b.coins, 1, TRANSFER_MAX);
    if (!coins) throw new HttpError(400, 'Geçersiz jeton miktarı');
    const paymentRef = optional(b.paymentRef, 100, 'Ödeme referansı');
    const note = optional(b.note, 200, 'Not');
    const ip = clientIp(req);
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      const rows = await lockUsers(c, [u.id, to]);
      if (!rows.has(to)) throw new HttpError(404, 'Alıcı bulunamadı');
      await claimRef(c, u.id, 'coin', b.ref);
      const transfer = await insertTransfer(
        c,
        "INSERT INTO coin_transfers (kind, from_user, to_user, coins, payment_ref, note, actor, ip, ref) VALUES ('bank_sale', $1, $2, $3, $4, $5, $1, $6, $7) RETURNING id",
        [u.id, to, coins, paymentRef, note, ip, b.ref],
      );
      const detail = { transfer, ...(paymentRef && { paymentRef }) };
      const parts = await spendCoins(c, u.id, coins, 'Jeton Noktası satışı', b.ref, to, { actor: u.id, detail });
      // Each portion keeps the longer lock of where the bank got it (a store purchase stays 7 days).
      const portions = parts.map((p) => ({ channel: 'jeton_noktasi', amount: p.amount, lockHours: p.lockHours, transferId: transfer, sourceLot: p.lot, sourceUser: u.id }));
      await creditCoins(c, to, portions, 'Jeton Noktası yüklemesi', `${b.ref}-in`, u.id, { actor: u.id, detail });
    });
    return { ...out, transfer: await findTransfer(u.id, b.ref) };
  },

  /**
   * Anında bozdur: a host sells unlocked diamonds to a Jeton Noktası. The diamonds leave at once; the bank
   * gets coins worth their value plus its fee and owes the host the value in TL (valueTl), outside the app.
   */
  async 'POST /api/jeton/sell-diamonds'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const bank = userId(b.bank, 'Jeton Noktası');
    if (bank === u.id) throw new HttpError(400, 'Kendi Jeton Noktana bozduramazsın');
    const diamonds = int(b.diamonds, EXCHANGE.minDiamonds, DIAMONDS_MAX);
    if (!diamonds) throw new HttpError(400, `En az ${EXCHANGE.minDiamonds} elmas bozdurulabilir`);
    const coins = bankExchangeCoins(diamonds);
    const valueTl = diamondValueTl(diamonds);
    const ip = clientIp(req);
    const out = await once(u.id, 'diamond', b.ref, async (c) => {
      const rows = await lockUsers(c, [u.id, bank]);
      if (rows.get(bank)?.role !== 'coins_bank') throw new HttpError(404, 'Jeton Noktası bulunamadı');
      await claimRef(c, u.id, 'diamond', b.ref);
      const transfer = await insertTransfer(
        c,
        "INSERT INTO coin_transfers (kind, from_user, to_user, coins, diamonds, value_tl, actor, ip, ref) VALUES ('diamond_sale', $1, $2, $3, $4, $5, $1, $6, $7) RETURNING id",
        [u.id, bank, coins, diamonds, valueTl, ip, b.ref],
      );
      await spendDiamonds(c, u.id, diamonds, "Jeton Noktası'na bozduruldu", b.ref, bank, { channel: 'bozdurma', detail: { transfer, valueTl } });
      await creditCoins(c, bank, [{ channel: 'bozdurma', amount: coins, transferId: transfer, sourceUser: u.id }], 'Elmas bozdurma', `${b.ref}-in`, u.id, {
        actor: u.id,
        detail: { transfer, diamonds, valueTl },
      });
    });
    return { ...out, transfer: await findTransfer(u.id, b.ref) };
  },

  async 'GET /api/jeton/transfers'(req) {
    const u = await auth(req);
    const r = await db.query(`${TRANSFER_SELECT} WHERE t.from_user = $1 OR t.to_user = $1 ORDER BY t.id DESC LIMIT 100`, [u.id]);
    return { rows: r.rows.map(transferOf) };
  },

  /** Turns an account into a Jeton Noktası (or back). Staff accounts can't be. */
  async 'POST /api/admin/jeton/bank'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const target = userId(b.user);
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'enabled true veya false olmalı');
    const role = b.enabled ? 'coins_bank' : 'user';
    return tx(async (c) => {
      const r = await c.query("UPDATE users SET role = $2 WHERE id = $1 AND deleted_at IS NULL AND role IN ('user', 'coins_bank') RETURNING role", [target, role]);
      if (!r.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı veya yetkili hesabı');
      await audit(c, a.id, b.enabled ? 'jeton.bank.on' : 'jeton.bank.off', target, {}, clientIp(req));
      return { role };
    });
  },

  /** Management sells coins to a Jeton Noktası; booked against management's own receipt. */
  async 'POST /api/admin/jeton/wholesale'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const bank = userId(b.bank, 'Jeton Noktası');
    const coins = int(b.coins, 1, TRANSFER_MAX * 10);
    if (!coins) throw new HttpError(400, 'Geçersiz jeton miktarı');
    const paymentRef = text(b.paymentRef, 1, 100, 'Ödeme referansı');
    const note = optional(b.note, 200, 'Not');
    const priceTl = wholesaleTl(coins);
    const ip = clientIp(req);
    const out = await once(bank, 'coin', b.ref, async (c) => {
      const rows = await lockUsers(c, [bank]);
      if (rows.get(bank)?.role !== 'coins_bank') throw new HttpError(404, 'Jeton Noktası bulunamadı');
      await claimRef(c, bank, 'coin', b.ref);
      const transfer = await insertTransfer(
        c,
        "INSERT INTO coin_transfers (kind, from_user, to_user, coins, value_tl, payment_ref, note, actor, ip, ref) VALUES ('wholesale', NULL, $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [bank, coins, priceTl, paymentRef, note, a.id, ip, b.ref],
      );
      await creditCoins(c, bank, [{ channel: 'toptan', amount: coins, transferId: transfer }], 'Toptan jeton alımı', b.ref, null, { actor: a.id, detail: { transfer, paymentRef, priceTl } });
      await audit(c, a.id, 'jeton.wholesale', bank, { transfer, coins, priceTl, paymentRef }, ip);
    });
    return { ...out, transfer: await findTransfer(a.id, b.ref) };
  },

  /**
   * The store refunded a purchase: its coins still unspent leave whoever holds them (the buyer, or the people
   * a Jeton Noktası passed them to), and the diamonds they became that are still locked leave the recipients.
   */
  async 'POST /api/admin/purchases/refund'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const id = int(b.purchase, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz satın alma');
    const ip = clientIp(req);
    return tx(async (c) => {
      const r = await refundPurchase(c, id, { actor: a.id, ip });
      if (!r) throw new HttpError(409, 'Bu satın alma zaten iade edildi');
      return r;
    });
  },

  /** Everything about one account's money, for a dispute: purchases, lots, locks, transfers, ledger, staff actions. */
  async 'GET /api/admin/wallet/audit'(req, url) {
    await admin(req);
    const id = userId(url.searchParams.get('user'));
    const u = (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
    const q = (sql) => db.query(sql, [id]).then((r) => r.rows);
    const [purchases, lots, locks, transfers, ledger, events, lotSum] = await Promise.all([
      q('SELECT id, platform, product_id, transaction_id, coins, bonus, campaign_bonus, campaign_ref, status, created_at FROM purchases WHERE user_id = $1 ORDER BY id DESC LIMIT 100'),
      q('SELECT id, channel, amount, remaining, lock_hours, purchase_id, transfer_id, source_lot, source_user, ref, created_at FROM coin_lots WHERE user_id = $1 ORDER BY id DESC LIMIT 200'),
      q('SELECT id, sender, amount, channel, unlock_at, gift_event, coin_lot, status, ref, created_at FROM diamond_locks WHERE user_id = $1 ORDER BY id DESC LIMIT 200'),
      db.query(`${TRANSFER_SELECT} WHERE t.from_user = $1 OR t.to_user = $1 OR t.actor = $1 ORDER BY t.id DESC LIMIT 200`, [id]).then((r) => r.rows.map(transferOf)),
      q('SELECT id, currency, amount, balance, reason, ref, counterparty, channel, actor, detail, created_at FROM ledger WHERE user_id = $1 ORDER BY id DESC LIMIT 200'),
      q('SELECT id, actor, action, target, detail, ip, created_at FROM audit_events WHERE target = $1 OR actor = $1 ORDER BY id DESC LIMIT 100'),
      q('SELECT coalesce(sum(remaining), 0) AS n FROM coin_lots WHERE user_id = $1'),
    ]);
    const nums = (rows, keys) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, n(r[k])])) }));
    return {
      user: { ...selfUser(u), ...(await diamondState(db, id)), coinsInLots: Number(lotSum[0].n) },
      channels: Object.fromEntries(Object.entries(CHANNELS).map(([k, v]) => [k, v.label])),
      purchases: nums(purchases, ['id', 'coins', 'bonus', 'campaign_bonus']),
      lots: nums(lots, ['id', 'amount', 'remaining', 'purchase_id', 'transfer_id', 'source_lot']),
      locks: nums(locks, ['id', 'amount', 'gift_event', 'coin_lot']),
      transfers,
      ledger: nums(ledger, ['id', 'amount', 'balance']),
      events: nums(events, ['id']),
    };
  },
};
