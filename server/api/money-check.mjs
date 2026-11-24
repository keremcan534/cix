// Money checks (docs/PARA_DENETIMI.md): read-only SQL over the wallet tables, which must always agree with each
// other. Pure: every function takes a pg client or pool and imports nothing, so the tests (after every test file,
// test/harness.mjs), the alerts (alerts.mjs money_mismatch, on the live server) and the admin route
// (GET /api/admin/money-check) run the same checks.
//
//   balance  users.coins / diamonds / game_coins = the balance on the account's last ledger row (0 without one):
//            no balance changed outside core.mjs move()
//   chain    each ledger row's balance = the account's previous balance in that currency + the row's amount: no row
//            missing, none written out of order
//   lots     users.coins = what is left in the account's coin lots (wallet.mjs): every coin has a source
//   moved    every coin row of the ledger names the lots it used (detail.lots), adding up to its amount
//   locks    the diamonds still locked (diamond_locks) are not more than the account's diamonds
//   gifts    every gift event paid its recipient its total in diamonds (ledger ref `{ref}-in`) and, when the sender
//            paid it in coins on the spot (Hediye, Şanslı hediye), took exactly that from the sender (ref `{ref}`);
//            a bond, a Şanslı çanta and Çantam paid the coins before, or not in coins
//   paid     every paid message or call minute (paid_events) took its coins from the payer and, when someone earns
//            it, gave them the same in diamonds
//   holds    every paid message that waited for an answer (message_holds) took its coins from the payer (`{ref}`);
//            once answered in time it paid the streamer as much (`{ref}-in`, and a paid_events row), once ended
//            without that it gave back what it says it did (`{ref}:iade`), and while it waits it did neither
//   album    every opened Özel albüm (private_album_unlocks, private-album.mjs) took its price from the viewer (`{ref}`)
//            and gave the streamer as much in diamonds (`{ref}-in`)
//
// `since` (a ledger id): only the accounts with a ledger row after it, and only those rows for `chain` and `moved`.
// 0 checks everything. The live server watches from migration 071 on (money_check_from); its earlier rows, the test
// server's past, are checked on request. A check returns at most EXAMPLES rows and the full count.
const EXAMPLES = 20;
const BALANCE = `CASE c.currency WHEN 'coin' THEN u.coins WHEN 'diamond' THEN u.diamonds ELSE u.game_coins END`;
/** The accounts to check: all of them, or those with a ledger row after $1. */
const ACCOUNTS = `($1::bigint = 0 OR u.id IN (SELECT user_id FROM ledger WHERE id > $1))`;

export const MONEY_CHECKS = {
  balance: {
    message: (n) => `${n} hesapta bakiye kayıt defterindeki son bakiyeyle aynı değil`,
    sql: `SELECT u.id AS user_id, c.currency, ${BALANCE} AS balance, coalesce(l.balance, 0) AS ledger
            FROM users u CROSS JOIN (VALUES ('coin'), ('diamond'), ('game')) c(currency)
            LEFT JOIN LATERAL (SELECT x.balance FROM ledger x WHERE x.user_id = u.id AND x.currency = c.currency ORDER BY x.id DESC LIMIT 1) l ON true
           WHERE ${ACCOUNTS} AND ${BALANCE} <> coalesce(l.balance, 0)`,
  },
  chain: {
    message: (n) => `Kayıt defterinde ${n} satırın bakiyesi bir önceki satırla tutmuyor`,
    sql: `SELECT user_id, currency, id, amount, balance, prev, reason, ref FROM (
            SELECT user_id, currency, id, amount, balance, reason, ref,
                   coalesce(lag(balance) OVER (PARTITION BY user_id, currency ORDER BY id), 0) AS prev
              FROM ledger WHERE $1::bigint = 0 OR user_id IN (SELECT user_id FROM ledger WHERE id > $1)) x
           WHERE id > $1 AND balance - amount <> prev`,
  },
  lots: {
    message: (n) => `${n} hesapta jeton bakiyesi jeton partilerinin toplamıyla aynı değil`,
    sql: `SELECT u.id AS user_id, u.coins, coalesce(l.s, 0) AS lots
            FROM users u LEFT JOIN (SELECT user_id, sum(remaining) AS s FROM coin_lots GROUP BY 1) l ON l.user_id = u.id
           WHERE ${ACCOUNTS} AND u.coins <> coalesce(l.s, 0)`,
  },
  moved: {
    message: (n) => `Kayıt defterinde ${n} jeton satırı hangi partiden geldiğini yazmıyor ya da tutarı tutmuyor`,
    sql: `SELECT id, user_id, amount, reason, ref, detail->'lots' AS lots FROM ledger
           WHERE currency = 'coin' AND id > $1
             AND CASE WHEN jsonb_typeof(detail->'lots') = 'array'
                      THEN (SELECT coalesce(sum((p->>'amount')::bigint), 0) FROM jsonb_array_elements(detail->'lots') p) <> abs(amount)
                      ELSE true END`,
  },
  locks: {
    message: (n) => `${n} hesapta kilitli elmas, hesaptaki elmastan fazla`,
    sql: `SELECT u.id AS user_id, u.diamonds, l.locked
            FROM users u JOIN (SELECT user_id, sum(amount) AS locked FROM diamond_locks
                                WHERE status = 'active' AND unlock_at > now() GROUP BY 1) l ON l.user_id = u.id
           WHERE ${ACCOUNTS} AND l.locked > u.diamonds AND u.deleted_at IS NULL`,
  },
  gifts: {
    message: (n) => `${n} hediyede gönderenden düşen jeton ya da alıcıya geçen elmas hediyenin tutarı değil`,
    sql: `SELECT g.id, g.sender, g.recipient, g.gift_id, g.total, g.ref, -s.amount AS paid, r.amount AS got
            FROM gift_events g
            LEFT JOIN ledger r ON r.user_id = g.recipient AND r.currency = 'diamond' AND r.ref = g.ref || '-in'
            LEFT JOIN ledger s ON s.user_id = g.sender AND s.currency = 'coin' AND s.ref = g.ref
           WHERE ($1::bigint = 0 OR g.recipient IN (SELECT user_id FROM ledger WHERE id > $1) OR g.sender IN (SELECT user_id FROM ledger WHERE id > $1))
             AND (r.amount IS DISTINCT FROM g.total
                  OR (g.ref NOT LIKE 'bond%' AND g.ref NOT LIKE 'bag:%' AND NOT EXISTS (SELECT 1 FROM backpack_moves m WHERE m.gift_event = g.id)
                      AND s.amount IS DISTINCT FROM -g.total))`,
  },
  paid: {
    message: (n) => `${n} ücretli mesaj ya da arama dakikasında ödenen jeton ile kazanılan elmas tutmuyor`,
    sql: `SELECT p.id, p.kind, p.payer, p.earner, p.coins, p.ref, -s.amount AS paid, r.amount AS got
            FROM paid_events p
            LEFT JOIN ledger s ON s.user_id = p.payer AND s.currency = 'coin' AND s.ref = p.ref
            LEFT JOIN ledger r ON r.user_id = p.earner AND r.currency = 'diamond' AND r.ref = p.ref || '-in'
           WHERE ($1::bigint = 0 OR p.payer IN (SELECT user_id FROM ledger WHERE id > $1))
             AND (s.amount IS DISTINCT FROM -p.coins OR (p.earner IS NOT NULL AND r.amount IS DISTINCT FROM p.coins))`,
  },
  holds: {
    message: (n) => `${n} cevap bekleyen ücretli mesajda alınan, yayıncıya geçen ya da iade edilen jeton tutmuyor`,
    sql: `SELECT h.message_id, h.payer, h.earner, h.coins, h.status, h.returned, -s.amount AS paid, r.amount AS got, b.amount AS back, p.coins AS event
            FROM message_holds h
            LEFT JOIN ledger s ON s.user_id = h.payer AND s.currency = 'coin' AND s.ref = h.ref
            LEFT JOIN ledger r ON r.user_id = h.earner AND r.currency = 'diamond' AND r.ref = h.ref || '-in'
            LEFT JOIN ledger b ON b.user_id = h.payer AND b.currency = 'coin' AND b.ref = h.ref || ':iade'
            LEFT JOIN paid_events p ON p.ref = h.ref
           WHERE ($1::bigint = 0 OR h.payer IN (SELECT user_id FROM ledger WHERE id > $1) OR h.earner IN (SELECT user_id FROM ledger WHERE id > $1))
             AND (s.amount IS DISTINCT FROM -h.coins
                  OR (h.status = 'won' AND (r.amount IS DISTINCT FROM h.coins OR p.coins IS DISTINCT FROM h.coins OR b.amount IS NOT NULL))
                  OR (h.status IN ('expired', 'withdrawn') AND (r.amount IS NOT NULL OR p.coins IS NOT NULL OR coalesce(b.amount, 0) <> h.returned))
                  OR (h.status = 'expired' AND h.returned <> h.coins)
                  OR (h.status = 'pending' AND (r.amount IS NOT NULL OR b.amount IS NOT NULL OR p.coins IS NOT NULL)))`,
  },
  album: {
    message: (n) => `${n} özel albüm açışında ödenen jeton ile yayıncının aldığı elmas tutmuyor`,
    sql: `SELECT a.id, a.viewer, a.owner, a.coins, a.ref, -s.amount AS paid, r.amount AS got
            FROM private_album_unlocks a
            LEFT JOIN ledger s ON s.user_id = a.viewer AND s.currency = 'coin' AND s.ref = a.ref
            LEFT JOIN ledger r ON r.user_id = a.owner AND r.currency = 'diamond' AND r.ref = a.ref || '-in'
           WHERE ($1::bigint = 0 OR a.viewer IN (SELECT user_id FROM ledger WHERE id > $1) OR a.owner IN (SELECT user_id FROM ledger WHERE id > $1))
             AND (s.amount IS DISTINCT FROM -a.coins OR r.amount IS DISTINCT FROM a.coins)`,
  },
};

const plain = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'total').map(([k, v]) => [k, typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : v]));

/** The ledger id the live server's checks start after (migration 071); 0 before it ran. */
export async function moneyCheckFrom(q) {
  const r = await q.query("SELECT ledger_id FROM money_check_from WHERE id = 1").catch(() => ({ rows: [] }));
  return Number(r.rows[0]?.ledger_id ?? 0);
}

/**
 * Runs the checks (all, or the names in `only`) on the accounts touched after ledger id `since` (0: everything)
 * and returns the problems: [{ code, message, count, rows }], empty when the money adds up. Read-only.
 */
export async function checkMoney(q, { since = 0, only = Object.keys(MONEY_CHECKS) } = {}) {
  const out = [];
  for (const code of only) {
    const c = MONEY_CHECKS[code];
    const r = await q.query(`SELECT x.*, count(*) OVER () AS total FROM (${c.sql}) x LIMIT ${EXAMPLES}`, [since]);
    if (!r.rowCount) continue;
    const count = Number(r.rows[0].total);
    out.push({ code, message: c.message(count), count, rows: r.rows.map(plain) });
  }
  return out;
}

/** One line per problem, then its examples: for logs and test failures. */
export const describeMoney = (problems) => problems.map((p) => `${p.code}: ${p.message}\n${p.rows.map((r) => `  ${JSON.stringify(r)}`).join('\n')}`).join('\n');
