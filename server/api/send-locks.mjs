// The accounts a paid gift in a room touches, locked before anything is written (gifts.mjs, lucky.mjs): the sender,
// the recipients and the open server room's owner, whose room XP the gift raises. All in id order, as every money
// route locks people: the owner's row taken last, out of order, deadlocked a Şanslı send in a room with the owner's
// own gift to one of its recipients (test/money-fuzz.test.mjs found it, Güncelleme 7 madde 10).
//
// `rewrites` (a Şanslı send): the send takes the sender's coins in more than one go (each recipient's share as a
// gift, then the rest), so the same coin lot is written twice in one transaction, and Postgres checks a row's
// foreign keys again when the transaction writes it a second time (the live rocket's lesson, CLAUDE.md). That check
// waits for a share lock on the lot's purchase and on the account that sold the coins (a Jeton Noktası). A refund
// holds its purchase and waits for the accounts; a Jeton Noktası sale holds the bank and waits for its buyer: both
// deadlocked with a Şanslı send holding the buyer. So these are taken first, in the order those routes use: the
// purchases before any account (jeton.mjs refundPurchase takes its purchase first), the selling accounts among the
// accounts, in id order. A lot the sender got between the read and the lock (a sale that committed meanwhile) is not
// covered: at worst that one send meets a deadlock and is refused with nothing moved.
/**
 * Locks `ids` (the sender first, then the recipients) and the owner of open room `roomId` (a uuid, or null), in id
 * order. True when every one of `ids` is there and not deleted (the owner may be neither: the gift goes on).
 */
export async function lockSendAccounts(c, ids, roomId, { rewrites = false } = {}) {
  const owner = roomId ? ((await c.query('SELECT owner FROM rooms WHERE id = $1 AND closed_at IS NULL', [roomId])).rows[0]?.owner ?? null) : null;
  let sellers = [];
  if (rewrites) {
    const r = (
      await c.query(
        `SELECT array_remove(array_agg(DISTINCT x.p), NULL) AS purchases, array_remove(array_agg(DISTINCT l.source_user), NULL) AS sellers
           FROM coin_lots l, LATERAL (VALUES (l.purchase_id), (l.refunded_by)) x(p) WHERE l.user_id = $1 AND l.remaining > 0`,
        [ids[0]],
      )
    ).rows[0];
    if (r.purchases?.length) await c.query('SELECT 1 FROM purchases WHERE id = ANY($1::bigint[]) ORDER BY id FOR KEY SHARE', [r.purchases]);
    sellers = r.sellers ?? [];
  }
  const all = [...new Set([...ids, ...(owner ? [owner] : []), ...sellers])];
  const rows = (await c.query('SELECT id, deleted_at FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [all])).rows;
  return ids.every((id) => rows.some((r) => r.id === id && !r.deleted_at));
}
