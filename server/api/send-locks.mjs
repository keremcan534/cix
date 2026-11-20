// The accounts a paid gift touches, locked before anything is written (gifts.mjs, lucky.mjs): the sender and the
// recipients, in id order, as every money route locks people.
//
// FOR NO KEY UPDATE, not FOR UPDATE: it still waits for (and holds off) every money route's FOR UPDATE on the same
// people, but it lets a foreign-key check on them through (FOR KEY SHARE). A room action of the sender or the
// recipient (a poll, a mic invite: rows that point at the room and at them) would otherwise wait for the gift while
// holding the room's row, which the gift's Patron koltuğu then waits for: a deadlock (review of Güncelleme 7).
//
// The room owner's row is not taken: room XP no longer writes it inside the gift (room-xp-add.mjs). Holding it from
// the first statement made every gift of a room wait for the one before it from start to end (half a busy room's
// gift throughput), and its FOR UPDATE stopped the owner's own room actions behind the gifts.
//
// `rewrites` (a Şanslı send): the send takes the sender's coins in more than one go (each recipient's share as a
// gift, then the rest), so the same coin lot is written twice in one transaction, and Postgres checks a row's
// foreign keys again when the transaction writes it a second time (the live rocket's lesson, CLAUDE.md). That check
// waits for a share lock on the lot's purchase and on the account that sold the coins (a Jeton Noktası). A refund
// holds its purchase and waits for the accounts; a Jeton Noktası sale holds the bank and waits for its buyer: both
// deadlocked with a Şanslı send holding the buyer. So these are taken first, in the order those routes use: the
// purchases before any account (jeton.mjs refundPurchase takes its purchase first), the selling accounts among the
// accounts, in one id order. A seller that is neither the sender nor a recipient gets only the FOR KEY SHARE the check
// needs: two buyers of one Jeton Noktası then send at the same moment without waiting for each other. A lot the sender
// got between the read and the lock (a sale that committed meanwhile) is not covered: at worst that one send meets a
// deadlock and is refused with nothing moved.
/**
 * Locks `ids` (the sender first, then the recipients) in id order. True when every one of `ids` is there and not
 * deleted.
 */
export async function lockSendAccounts(c, ids, { rewrites = false } = {}) {
  ids = ids.map((x) => String(x).toLowerCase());
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
    sellers = (r.sellers ?? []).map((x) => String(x).toLowerCase());
  }
  const mine = new Set(ids);
  // One id order over everyone (a lowercase uuid's text sorts as Postgres sorts the uuid), in runs of one lock mode.
  const runs = [];
  for (const id of [...new Set([...ids, ...sellers])].sort()) {
    const mode = mine.has(id) ? 'NO KEY UPDATE' : 'KEY SHARE';
    if (runs.at(-1)?.mode === mode) runs.at(-1).ids.push(id);
    else runs.push({ mode, ids: [id] });
  }
  const rows = [];
  for (const run of runs) rows.push(...(await c.query(`SELECT id, deleted_at FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR ${run.mode}`, [run.ids])).rows);
  return ids.every((id) => rows.some((r) => r.id === id && !r.deleted_at));
}
