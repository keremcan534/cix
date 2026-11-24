// Jeton Noktası (coins bank) on the server, store refunds, and the records a dispute needs.
//
//   GET  /api/jeton/banks                                                   → { banks, mine }   (mine: I am one)
//   POST /api/jeton/transfer       { to, coins, paymentRef?, note?, ref }   (Jeton Noktası) → { user, replay, transfer }
//   POST /api/jeton/sell-diamonds  { bank, diamonds, ref }                  → { user, replay, transfer }
//   GET  /api/jeton/transfers                                               → { rows }   (own, sent and received)
//   GET  /api/jeton/buyers                                                  (Jeton Noktası) → { buyers }
//   POST /api/admin/jeton/bank      { user, enabled }                       (admin) → { role }
//   POST /api/admin/jeton/wholesale { bank, coins, paymentRef, note?, priceTl?, ref } (admin) → { user, replay, transfer }
//   GET  /api/admin/jeton/loads?bank=                                       (admin) → { loads, banks, rateTl }
//   POST /api/admin/jeton/load      { bank, to, coins, valueTl, paymentRef?, note?, ref } (admin) → { replay, transfer }
//   POST /api/admin/jeton/reverse   { transfer, reason? }                          (admin) → { coins, spent, transfer }
//   POST /api/admin/purchases/refund { purchase }                           (admin) → { coins, diamonds, unrecoveredDiamonds }
//   GET  /api/admin/wallet/audit?user=                                      (admin) → everything about one account's money
//
// A Jeton Noktası sells coins to people who pay it outside the app (payment_ref: its receipt), buys hosts'
// unlocked diamonds at their value (it pays the host; it gets coins worth the value plus its fee), and buys
// its stock from management (wholesale, booked by an admin against management's receipt). People blocked either way
// don't see or reach each other here: the list leaves them out, a sale or a diamond sale between them is refused.
// Every transfer is a coin_transfers row with who gave, who got, who pressed the button, the receipt, the IP and the
// time; the ledger rows on both sides say the same. Coins a bank passes on are the buyer's 'jeton_noktasi' lots:
// gifted, they lock the recipient's diamonds for 1 day (or longer, if the bank's coins came from a store).
//
// A refund (the store refunded a purchase, or a chargeback) takes back the purchase's coins still unspent,
// wherever a Jeton Noktası passed them, and the diamonds they became that are still locked. Diamonds already
// unlocked are reported as unrecovered. The agency commission those gifts earned is reversed. Admin only:
// moderators don't touch money. Google Play refunds also arrive on their own (refunds.mjs).
import { HttpError, assertClean, auth, blockedBetween, claimRef, clientIp, db, int, move, once, readJson, selfUser, text, tx, userId } from './core.mjs';
import { addVipPoints } from './vip-month.mjs';
import { EXCHANGE, bankExchangeCoins, diamondValueTl, wholesaleTl } from './catalog.mjs';
import { CHANNELS, creditCoins, diamondState, spendCoins, spendDiamonds } from './wallet.mjs';
import { live } from './live-settings.mjs';
import { recordIncome } from './agency-lib.mjs';
import { voidRefundedBonds } from './bonds.mjs';
import { refundItems } from './economy.mjs';
import { voidRefundedBags } from './lucky-bags.mjs';
import { HELD_EARNERS, voidRefundedHolds } from './message-holds.mjs';
import { assertCashOut } from './streamer-rule.mjs';

const TRANSFER_MAX = 100_000_000;
const DIAMONDS_MAX = 1_000_000_000;
const optional = (v, max, field) => (v === undefined || v === null || v === '' ? '' : text(v, 1, max, field));
const n = (v) => (v === null || v === undefined ? null : Number(v));
/** A TL amount as given (at most 2 decimals, 0 – 1 billion). */
const tlOf = (v, field) => {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1e9 || Math.round(x * 100) !== x * 100) throw new HttpError(400, `${field} 0 ile 1.000.000.000 TL arasında, en çok 2 ondalık olmalı`);
  return x;
};
/** Management's coin loads the panel lists (newest first), each with its take-back if it has one. */
const LOADS_SELECT = `SELECT t.*, r.name AS to_name, b.name AS bank_name, x.id AS back_id, x.coins AS back_coins, x.created_at AS back_at, x.actor AS back_actor,
       coalesce((SELECT sum(remaining) FROM coin_lots l WHERE l.transfer_id = t.id AND l.user_id = t.to_user), 0) AS unspent
  FROM coin_transfers t JOIN users r ON r.id = t.to_user LEFT JOIN users b ON b.id = t.from_user LEFT JOIN coin_transfers x ON x.reverses = t.id
 WHERE t.kind = 'admin_load'`;
const loadOf = (t) => ({
  id: Number(t.id),
  bank: { id: t.from_user, name: t.bank_name ?? null },
  to: { id: t.to_user, name: t.to_name ?? null },
  coins: Number(t.coins),
  valueTl: n(t.value_tl),
  paymentRef: t.payment_ref,
  note: t.note,
  actor: t.actor,
  createdAt: t.created_at,
  // What is left of it in the person's account now (nothing once taken back).
  unspent: t.back_id ? 0 : Number(t.unspent),
  reversed: t.back_id ? { id: Number(t.back_id), coins: Number(t.back_coins), at: t.back_at, actor: t.back_actor } : null,
});

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
  //
  // Everything is locked in the order the rest of the server uses, so a refund never deadlocks with a gift or a
  // draw at the same moment (test/money-fuzz.test.mjs): the open Şanslı çantas first (drawBags locks a bag, then its
  // people), then all the accounts in one id-ordered statement. When the trail grows past what is locked, the
  // locks taken in this round go (ROLLBACK TO SAVEPOINT) and the next round takes the bigger set, in order again.
  let lots;
  let locks;
  const held = new Set();
  const bags = new Set();
  const readTrail = async () => {
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
    const openBags = await c.query(
      "SELECT id FROM lucky_bags WHERE status = 'open' AND EXISTS (SELECT 1 FROM jsonb_array_elements(parts) p WHERE (p->>'lot')::bigint = ANY($1::bigint[]))",
      [lots.map((l) => l.id)],
    );
    // A pending bond's other person too: voiding the bond writes its refund with them as the counterparty, and the
    // ledger's key check on their row must not wait behind a gift of theirs that waits for us.
    const bondPeople = await c.query(
      "SELECT b FROM bonds WHERE status = 'pending' AND EXISTS (SELECT 1 FROM jsonb_array_elements(held_lots) p WHERE (p->>'lot')::bigint = ANY($1::bigint[]))",
      [lots.map((l) => l.id)],
    );
    // A paid message waiting for its answer (message-holds.mjs): its streamer, for the same reason.
    const holdPeople = await c.query(HELD_EARNERS, [lots.map((l) => l.id)]);
    return {
      users: [...new Set([...lots.map((l) => l.user_id), ...locks.map((k) => k.user_id), ...bondPeople.rows.map((x) => x.b), ...holdPeople.rows.map((x) => x.earner)])],
      bags: openBags.rows.map((b) => Number(b.id)),
    };
  };
  let want = await readTrail();
  for (let round = 0; ; round++) {
    if (round > 20) throw new HttpError(503, 'İade şu an yapılamadı, biraz sonra tekrar dene');
    await c.query('SAVEPOINT refund_locks');
    await c.query('SELECT 1 FROM lucky_bags WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE', [want.bags]);
    await c.query('SELECT 1 FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [want.users]);
    held.clear();
    want.users.forEach((u) => held.add(u));
    bags.clear();
    want.bags.forEach((b) => bags.add(b));
    const now = await readTrail();
    if (now.users.every((u) => held.has(u)) && now.bags.every((b) => bags.has(b))) {
      await c.query('RELEASE SAVEPOINT refund_locks');
      break;
    }
    await c.query('ROLLBACK TO SAVEPOINT refund_locks');
    want = { users: [...new Set([...want.users, ...now.users])], bags: [...new Set([...want.bags, ...now.bags])] };
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
    // detail.lots, as on every coin row (wallet.mjs): the lot the coins left (money-check.mjs `moved`).
    if (take > 0)
      await move(c, l.user_id, 'coin', -take, 'İade: satın alınan jeton geri alındı', `refund:${id}:c${l.id}`, null, {
        channel: l.channel,
        actor,
        detail: { purchase: id, lot: Number(l.id), lots: [{ lot: Number(l.id), channel: l.channel, amount: take }] },
      });
    coins += take;
  }
  // Coins the trail's owners hold for a pending bond, an open Şanslı çanta or a paid message waiting for its answer
  // came from these lots too: they go with the purchase, so they can't come back later or turn into someone's
  // diamonds after this refund.
  const lotIds = lots.map((l) => Number(l.id));
  const escrowCoins = (await voidRefundedBonds(c, lotIds)) + (await voidRefundedBags(c, lotIds)) + (await voidRefundedHolds(c, lotIds));
  coins += escrowCoins;
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
  await addVipPoints(c, p.user_id, -Number(p.coins), 'store_refund', `refund:${id}`);
  // Coins already spent on shop items can't come back as coins: the buyer's items go, others' go to staff review.
  const { revokedItems, reviewItems } = await refundItems(c, { purchase: Number(id), buyer: p.user_id, lots: lots.map((l) => l.id), held, actor, ip });
  await audit(c, actor, 'purchase.refund', p.user_id, { purchase: id, platform: p.platform, transaction: p.transaction_id, coins, escrowCoins, diamonds, unrecoveredDiamonds, commissionDiamonds, revokedItems, reviewItems, source }, ip);
  return { coins, diamonds, unrecoveredDiamonds };
}

export const jetonRoutes = {
  /** Jeton Noktası accounts, for the app's bank list and the diamond sale: not myself, nobody blocked either way. */
  async 'GET /api/jeton/banks'(req) {
    const u = await auth(req);
    const r = await db.query(
      `SELECT id, name, avatar_url FROM users u WHERE role = 'coins_bank' AND deleted_at IS NULL AND id <> $1
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
        ORDER BY name`,
      [u.id],
    );
    return { banks: r.rows.map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null })), mine: u.role === 'coins_bank' };
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
    // The receipt number is a payment record, like withdrawal details; the note is for the buyer to read
    // (GET /api/jeton/transfers), so it may not share contact details (contact-filter.mjs).
    const paymentRef = optional(b.paymentRef, 100, 'Ödeme referansı');
    const note = await assertClean(optional(b.note, 200, 'Not'), u, 'jeton.transfer', 'note');
    if (await blockedBetween(u.id, to)) throw new HttpError(403, 'Bu kişiye jeton aktaramazsın');
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
      const parts = await spendCoins(c, u.id, coins, 'Jeton Noktası satışı', b.ref, to, { actor: u.id, detail, capped: false });
      // Each portion keeps the longer lock of where the bank got it (a store purchase stays 7 days).
      const portions = parts.map((p) => ({ channel: 'jeton_noktasi', amount: p.amount, lockHours: p.lockHours, transferId: transfer, sourceLot: p.lot, sourceUser: u.id }));
      await creditCoins(c, to, portions, 'Jeton Noktası yüklemesi', `${b.ref}-in`, u.id, { actor: u.id, detail });
      // VIP points (owners, 24 Nov 2026): coins bought at a Jeton Noktası count as a store purchase does.
      await addVipPoints(c, to, coins, 'jeton_noktasi', b.ref);
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
    // The host is paid at the payout rate (Canlı ayarlar › payout_usd_try); the bank's coins, at the coin value in
    // effect, are worth what it pays plus its fee.
    const s = live();
    const coins = bankExchangeCoins(diamonds, s.coinValueTl, s.payoutUsdTry, s.diamondsPerUsd);
    const valueTl = diamondValueTl(diamonds, s.payoutUsdTry, s.diamondsPerUsd);
    if (await blockedBetween(u.id, bank)) throw new HttpError(403, 'Bu Jeton Noktası ile işlem yapamazsın');
    const ip = clientIp(req);
    const out = await once(u.id, 'diamond', b.ref, async (c) => {
      const rows = await lockUsers(c, [u.id, bank]);
      if (rows.get(bank)?.role !== 'coins_bank') throw new HttpError(404, 'Jeton Noktası bulunamadı');
      await claimRef(c, u.id, 'diamond', b.ref);
      // The bank pays the seller outside the app: taking money out, as Para Çek is (streamer-rule.mjs).
      await assertCashOut(c, u.id);
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

  /**
   * A Jeton Noktası's buyers: the people who wrote to it lately (that is how they reach it), newest first; deleted
   * accounts and blocks either way left out. Nothing is stored for this: it is read from the messages.
   */
  async 'GET /api/jeton/buyers'(req) {
    const u = await auth(req);
    if (u.role !== 'coins_bank') throw new HttpError(403, 'Yalnızca Jeton Noktası hesapları');
    const r = await db.query(
      `SELECT p.id, p.name, p.avatar_url FROM (SELECT sender, max(id) AS last FROM messages WHERE recipient = $1 GROUP BY sender) m
         JOIN users p ON p.id = m.sender
        WHERE p.deleted_at IS NULL AND p.id <> $1
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = p.id) OR (b.blocker = p.id AND b.blocked = $1))
        ORDER BY m.last DESC LIMIT 30`,
      [u.id],
    );
    return { buyers: r.rows.map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null })) };
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
    // What management books for these coins: the price it gives (Yönetim jeton yüklemesi, the panel's "üretim"), or
    // the wholesale price the panel set (Canlı ayarlar › jeton_wholesale_tl).
    const priceTl = b.priceTl === undefined || b.priceTl === null || b.priceTl === '' ? wholesaleTl(coins, live().wholesaleTl) : tlOf(b.priceTl, 'Toptan fiyat');
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
   * Yönetim jeton yüklemesi (owners, 22 Nov 2026): management's loads, its Jeton Noktası accounts with their stock, and
   * the TL value of 1,000 coins at the wholesale formula (the panel starts its calculator from it).
   */
  async 'GET /api/admin/jeton/loads'(req, url) {
    await admin(req);
    const bank = url.searchParams.get('bank');
    const [loads, banks] = await Promise.all([
      db.query(`${LOADS_SELECT}${bank && /^[0-9a-f-]{36}$/.test(bank) ? ' AND t.from_user = $1' : ''} ORDER BY t.id DESC LIMIT 200`, bank && /^[0-9a-f-]{36}$/.test(bank) ? [bank] : []),
      db.query("SELECT id, name, public_no, coins FROM users WHERE role = 'coins_bank' AND deleted_at IS NULL ORDER BY name"),
    ]);
    return {
      loads: loads.rows.map(loadOf),
      banks: banks.rows.map((x) => ({ id: x.id, name: x.name, publicNo: x.public_no === null ? null : String(x.public_no), coins: Number(x.coins) })),
      rateTl: wholesaleTl(1000, live().wholesaleTl),
    };
  },

  /**
   * Management passes coins from its own Jeton Noktası account to a person who paid it (the panel's Süper yönetici:
   * the panel holds who may). As a Jeton Noktası sale, from the bank's stock (it must have them), the person's coins
   * a 'jeton_noktasi' lot that refunds follow; booked with what the person paid (valueTl) and the receipt.
   */
  async 'POST /api/admin/jeton/load'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const bank = userId(b.bank, 'Jeton Noktası');
    const to = userId(b.to, 'alıcı');
    if (to === bank) throw new HttpError(400, 'Jeton Noktası kendine yükleyemez');
    const coins = int(b.coins, 1, TRANSFER_MAX);
    if (!coins) throw new HttpError(400, 'Geçersiz jeton miktarı');
    const valueTl = tlOf(b.valueTl, 'Ödenen tutar');
    const paymentRef = optional(b.paymentRef, 100, 'Ödeme referansı');
    const note = optional(b.note, 200, 'Not');
    const ip = clientIp(req);
    const out = await once(bank, 'coin', b.ref, async (c) => {
      const rows = await lockUsers(c, [bank, to]);
      if (rows.get(bank)?.role !== 'coins_bank') throw new HttpError(404, 'Jeton Noktası bulunamadı');
      if (!rows.has(to)) throw new HttpError(404, 'Alıcı bulunamadı');
      await claimRef(c, bank, 'coin', b.ref);
      const transfer = await insertTransfer(
        c,
        "INSERT INTO coin_transfers (kind, from_user, to_user, coins, value_tl, payment_ref, note, actor, ip, ref) VALUES ('admin_load', $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id",
        [bank, to, coins, valueTl, paymentRef, note, a.id, ip, b.ref],
      );
      const detail = { transfer, valueTl, ...(paymentRef && { paymentRef }) };
      const parts = await spendCoins(c, bank, coins, 'Yönetim jeton yüklemesi', b.ref, to, { actor: a.id, detail, capped: false });
      const portions = parts.map((p) => ({ channel: 'jeton_noktasi', amount: p.amount, lockHours: p.lockHours, transferId: transfer, sourceLot: p.lot, sourceUser: bank }));
      await creditCoins(c, to, portions, 'Jeton yüklemesi (yönetim)', `${b.ref}-in`, bank, { actor: a.id, detail });
      // VIP points (owners, 24 Nov 2026): a management load counts too; taking it back takes them back (reverse).
      await addVipPoints(c, to, coins, 'admin_load', b.ref);
      await audit(c, a.id, 'jeton.admin_load', to, { transfer, bank, coins, valueTl, paymentRef }, ip);
    });
    const t = await db.query(`${LOADS_SELECT} AND t.from_user = $1 AND t.ref = $2`, [bank, b.ref]);
    return { replay: out.replay, transfer: t.rowCount ? loadOf(t.rows[0]) : null };
  },

  /**
   * A wrong load taken back (management only): the coins of that load still unspent in the person's account go back
   * to the bank; what they spent already stays spent (said in the answer). Once per load.
   */
  async 'POST /api/admin/jeton/reverse'(req) {
    const a = await admin(req);
    const b = await readJson(req);
    const id = int(b.transfer, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz yükleme');
    // Why (the panel asks): kept on the take-back's row and in the audit.
    const reason = optional(b.reason, 150, 'Neden');
    const ip = clientIp(req);
    return tx(async (c) => {
      const load = (await c.query("SELECT * FROM coin_transfers WHERE id = $1 AND kind = 'admin_load'", [id])).rows[0];
      if (!load) throw new HttpError(404, 'Yönetim yüklemesi bulunamadı');
      await lockUsers(c, [load.from_user, load.to_user]);
      if ((await c.query('SELECT 1 FROM coin_transfers WHERE reverses = $1', [id])).rowCount) throw new HttpError(409, 'Bu yükleme zaten geri alındı');
      const lots = (await c.query('SELECT id, channel, remaining FROM coin_lots WHERE transfer_id = $1 AND user_id = $2 AND remaining > 0 ORDER BY id', [id, load.to_user])).rows;
      let balance = Number((await c.query('SELECT coins FROM users WHERE id = $1', [load.to_user])).rows[0].coins);
      const taken = [];
      for (const l of lots) {
        const take = Math.min(Number(l.remaining), balance);
        if (take <= 0) break;
        await c.query('UPDATE coin_lots SET remaining = remaining - $2 WHERE id = $1', [l.id, take]);
        taken.push({ lot: Number(l.id), channel: l.channel, amount: take });
        balance -= take;
      }
      const coins = taken.reduce((s, x) => s + x.amount, 0);
      if (!coins) throw new HttpError(409, 'Bu yüklemenin jetonlarının hepsi harcanmış; geri alınacak jeton yok');
      const back = await insertTransfer(
        c,
        "INSERT INTO coin_transfers (kind, from_user, to_user, coins, value_tl, note, actor, ip, ref, reverses) VALUES ('admin_reverse', $1, $2, $3, NULL, $4, $5, $6, $7, $8) RETURNING id",
        [load.to_user, load.from_user, coins, `#${id} yüklemesi geri alındı${reason ? `: ${reason}` : ''}`.slice(0, 200), a.id, ip, `geri:${id}`, id],
      );
      const detail = { transfer: back, reverses: id };
      // Server refs (':'): no phone can take them first.
      await move(c, load.to_user, 'coin', -coins, 'Yanlış jeton yüklemesi geri alındı', `jeton-geri:${id}`, load.from_user, { channel: 'jeton_noktasi', actor: a.id, detail: { ...detail, lots: taken } });
      await creditCoins(c, load.from_user, [{ channel: 'toptan', amount: coins, transferId: back }], 'Geri alınan yönetim yüklemesi', `jeton-geri:${id}-in`, load.to_user, { actor: a.id, detail });
      // A wrong load gives no VIP points: all of it comes off, spent coins too (never below 0).
      await addVipPoints(c, load.to_user, -Number(load.coins), 'admin_reverse', `geri:${id}`);
      await audit(c, a.id, 'jeton.admin_reverse', load.to_user, { load: id, transfer: back, coins, spent: Number(load.coins) - coins, reason }, ip);
      return { coins, spent: Number(load.coins) - coins, transfer: Number(back) };
    });
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
