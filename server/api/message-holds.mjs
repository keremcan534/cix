// The 5-minute rule (docs/OTOMATIK_MESAJ.md §Beş dakika): a paid message to a streamer earns her its diamonds only when
// she answers in time. Owners' decision (18 Nov 2026): no answer gives the coins back to the payer.
//
// Money: the message takes its price from the payer at once (spendCoins, ref `msg:{id}`, the lots it used kept on the
// hold, message_holds). A valid answer from the streamer by deadline_at (the server's time, plus reply_grace_seconds
// for the network) pays her as a paid message always has: giftDiamonds (`msg:{id}-in`, with the coins' locks),
// paid_events and the agency income. Past it, the coins go back to the same lots (`msg:{id}:iade`). A store refund of
// the coins (jeton.mjs) ends a waiting hold as withdrawn: the refunded part goes with the purchase, the rest goes back.
// The refs have a ':', which no request's ref may (core.mjs REF), so nobody can take one first.
//
// A valid answer: a message she wrote herself or a quick reply, at least reply_min_chars long (a photo counts), after
// the paid message; her automatic messages never count. One answer settles every message of that person still waiting.
// The answer's own route settles at once (answerHolds); the sweep (sweepHolds) settles the rest, and checks the
// messages first, so an answer whose settling failed still wins. Locks: both accounts in id order, then the holds,
// like every other money route.
//
// Canlı ayarlar reply_minutes 0 turns the rule off: a new paid message pays at once (one-on-one.mjs payOneOnOne).
import { db, env, move, tx } from './core.mjs';
import { recordIncome } from './agency-lib.mjs';
import { line } from './live-line.mjs';
import { live } from './live-settings.mjs';
import { giftDiamonds, spendCoins } from './wallet.mjs';

/** Seconds a new paid message waits for its answer now (0: the rule is off). */
export const replySeconds = () => live().replyMinutes * 60;
const grace = () => live().replyGraceSeconds;

const lockUsers = (c, ids) => c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[...new Set(ids)]]);
const lotsOf = (h) => (Array.isArray(h.held_lots) ? h.held_lots : []);

/**
 * Inside the paid message's transaction, both accounts locked and the message stored: takes its price from the payer
 * and holds it. A short balance or the payer's daily limit is a 409 and changes nothing.
 */
export async function holdMessage(c, { message, payer, earner, coins }) {
  const id = Number(message.id);
  const ref = `msg:${id}`;
  const parts = await spendCoins(c, payer, coins, 'Mesaj ücreti (cevap bekleniyor)', ref, earner, { detail: { oneOnOne: 'message', message: id, held: true } });
  await c.query(
    `INSERT INTO message_holds (message_id, payer, earner, coins, held_lots, delivered_at, deadline_at, ref)
     VALUES ($1, $2, $3, $4, $5, $6, $6::timestamptz + make_interval(secs => $7), $8)`,
    [id, payer, earner, coins, JSON.stringify(parts), message.created_at, replySeconds(), ref],
  );
  return { coins, deadline: new Date(Date.parse(message.created_at) + replySeconds() * 1000).toISOString() };
}

/** The streamer's diamonds for a hold answered in time (hold and both accounts locked). */
async function win(c, h, reply) {
  await giftDiamonds(c, { sender: h.payer, recipient: h.earner, parts: lotsOf(h), total: h.coins, ref: h.ref, reason: 'Mesaj ücreti' });
  await c.query("INSERT INTO paid_events (kind, payer, earner, coins, message_id, ref) VALUES ('message', $1, $2, $3, $4, $5)", [h.payer, h.earner, h.coins, h.message_id, h.ref]);
  // Never fails the payment: runs in a savepoint (agency-lib.mjs).
  await recordIncome(c, h.earner, 'message', h.ref, h.coins);
  await c.query(
    `UPDATE message_holds SET status = 'won', settled_at = now(),
            reply_id = coalesce(reply_id, $2), replied_at = coalesce(replied_at, $3), reply_source = coalesce(reply_source, $4)
      WHERE message_id = $1`,
    [h.message_id, reply.id, reply.created_at, reply.source],
  );
}

/**
 * Puts a hold's coins (`lots`: all it holds, or the part a store refund left) back on the payer's lots and ends it
 * (`status` expired or withdrawn). The payer's row and the hold must be locked.
 */
async function giveBack(c, h, status, reason, lots = lotsOf(h)) {
  for (const p of lots) if (p.lot) await c.query('UPDATE coin_lots SET remaining = LEAST(amount, remaining + $2) WHERE id = $1', [p.lot, p.amount]);
  const coins = lots.reduce((n, p) => n + Number(p.amount), 0);
  // No channel: the coins come back, none are created.
  if (coins > 0) await move(c, h.payer, 'coin', coins, reason, `${h.ref}:iade`, h.earner, { detail: { message: Number(h.message_id), lots } });
  await c.query('UPDATE message_holds SET status = $2, returned = $3, settled_at = now() WHERE message_id = $1', [h.message_id, status, coins]);
  return coins;
}

/** SQL: whether message `m` (a row alias) is a valid answer of hold `h`'s streamer. $1: reply_min_chars. */
const VALID = (m, h) =>
  `${m}.sender = ${h}.earner AND ${m}.recipient = ${h}.payer AND ${m}.id > ${h}.message_id AND ${m}.source IN ('manual', 'quick_reply') AND ${m}.retracted_at IS NULL
   AND (${m}.image_url IS NOT NULL OR ${m}.source = 'quick_reply' OR char_length(btrim(${m}.body)) >= $1)`;

/** Whether `reply` (a stored message row) is a valid answer: what VALID says in SQL. */
const validReply = (reply) =>
  !reply.retracted_at && (reply.source === 'manual' || reply.source === 'quick_reply') && (reply.image_url || reply.source === 'quick_reply' || String(reply.body ?? '').trim().length >= live().replyMinChars);

/**
 * The streamer `reply.sender` just answered `reply.recipient`: every hold of theirs still unanswered gets this
 * answer; those still waiting and in time pay her, those past their time go back to the payer. Returns what she won
 * ({ count, diamonds }), or null when nothing was waiting.
 */
export async function answerHolds(reply) {
  if (!validReply(reply)) return null;
  const peek = await db.query('SELECT 1 FROM message_holds WHERE earner = $1 AND payer = $2 AND replied_at IS NULL AND message_id < $3 LIMIT 1', [reply.sender, reply.recipient, reply.id]);
  if (!peek.rowCount) return null;
  const out = await tx(async (c) => {
    await lockUsers(c, [reply.sender, reply.recipient]);
    const r = await c.query(
      `SELECT h.*, $3::timestamptz <= h.deadline_at + make_interval(secs => $4) AS in_time FROM message_holds h
        WHERE h.earner = $1 AND h.payer = $2 AND h.replied_at IS NULL AND h.message_id < $5 ORDER BY h.message_id FOR UPDATE`,
      [reply.sender, reply.recipient, reply.created_at, grace(), reply.id],
    );
    const got = { count: 0, diamonds: 0, late: 0, refunded: 0 };
    for (const h of r.rows) {
      if (h.status === 'pending' && h.in_time) {
        await win(c, h, reply);
        got.count++;
        got.diamonds += h.coins;
        continue;
      }
      // Late (or already settled): only the answer's time is kept, for the performance figures.
      await c.query('UPDATE message_holds SET reply_id = $2, replied_at = $3, reply_source = $4 WHERE message_id = $1', [h.message_id, reply.id, reply.created_at, reply.source]);
      if (h.status === 'pending') {
        got.refunded += await giveBack(c, h, 'expired', 'Mesaj ücreti iadesi (zamanında cevap gelmedi)');
        got.late++;
      }
    }
    return got;
  });
  if (out.count || out.late) line([reply.sender, reply.recipient], 'message_reward', { from: reply.recipient, to: reply.sender });
  return out;
}

/** One hold whose time is up (with the grace): a valid answer in time pays her, otherwise the coins go back. */
async function settleDue(id) {
  return tx(async (c) => {
    const peek = (await c.query('SELECT payer, earner FROM message_holds WHERE message_id = $1', [id])).rows[0];
    if (!peek) return null;
    await lockUsers(c, [peek.payer, peek.earner]);
    const h = (await c.query("SELECT * FROM message_holds WHERE message_id = $1 AND status = 'pending' FOR UPDATE", [id])).rows[0];
    if (!h) return null;
    const ans = await c.query(
      `SELECT m.id, m.created_at, m.source FROM messages m, message_holds h
        WHERE h.message_id = $2 AND ${VALID('m', 'h')} AND m.created_at <= h.deadline_at + make_interval(secs => $3)
        ORDER BY m.id LIMIT 1`,
      [live().replyMinChars, id, grace()],
    );
    if (ans.rowCount) {
      await win(c, h, ans.rows[0]);
      return { won: true, h };
    }
    await giveBack(c, h, 'expired', 'Mesaj ücreti iadesi (zamanında cevap gelmedi)');
    return { won: false, h };
  });
}

/** Holds whose time is up, oldest first: a few hundred a round. */
export async function sweepHolds() {
  const due = await db.query("SELECT message_id FROM message_holds WHERE status = 'pending' AND deadline_at + make_interval(secs => $1) < now() ORDER BY deadline_at LIMIT 300", [grace()]);
  let settled = 0;
  for (const { message_id: id } of due.rows) {
    const r = await settleDue(id).catch((e) => console.error('hold settle', id, e.message));
    if (!r) continue;
    settled++;
    line([r.h.payer, r.h.earner], 'message_reward', { from: r.h.payer, to: r.h.earner });
  }
  return settled;
}

/**
 * A store refund (jeton.mjs refundPurchase) of coins that waiting holds keep: each such hold ends as withdrawn, its
 * coins from the refunded lots (`lotIds`) go with the purchase, the rest goes back to the payer. So refunded coins
 * neither come back later nor become diamonds. The payers' rows are locked (they own the lots), and so are the
 * streamers' (the refund rows name them). Returns the coins that went with the purchase.
 */
export async function voidRefundedHolds(c, lotIds) {
  if (!lotIds.length) return 0;
  const refunded = new Set(lotIds.map(Number));
  const r = await c.query(
    `SELECT * FROM message_holds WHERE status = 'pending'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(held_lots) p WHERE (p->>'lot')::bigint = ANY($1::bigint[]))
      ORDER BY message_id FOR UPDATE`,
    [[...refunded]],
  );
  let gone = 0;
  for (const h of r.rows) {
    const keep = lotsOf(h).filter((p) => !(p.lot && refunded.has(Number(p.lot))));
    gone += Number(h.coins) - keep.reduce((n, p) => n + Number(p.amount), 0);
    await giveBack(c, h, 'withdrawn', 'Mesaj ücreti iadesi (satın alma iade edildi)', keep);
  }
  return gone;
}

/** SQL: the streamers whose waiting holds keep coins from lots $1 (the refund locks them with the trail). */
export const HELD_EARNERS = "SELECT earner FROM message_holds WHERE status = 'pending' AND EXISTS (SELECT 1 FROM jsonb_array_elements(held_lots) p WHERE (p->>'lot')::bigint = ANY($1::bigint[]))";

/**
 * How a held message looks to `me` (GET /api/messages): to the streamer its reward (diamonds, state, deadline), to
 * the payer its fee (coins, state). State: waiting (time runs), checking (answered, being settled), won, expired.
 */
export function holdView(h, me) {
  if (!h?.hold_status) return {};
  const waiting = h.hold_status === 'pending';
  const now = Date.now();
  const end = new Date(h.hold_deadline).getTime() + grace() * 1000;
  const state = waiting ? (h.hold_replied ? 'checking' : now <= end ? 'waiting' : 'checking') : h.hold_status === 'won' ? 'won' : 'expired';
  if (me === h.hold_earner) return { reward: { diamonds: Number(h.hold_coins), state, deadline: new Date(h.hold_deadline).toISOString() } };
  if (me === h.hold_payer) return { fee: { coins: Number(h.hold_coins), state: waiting ? 'held' : h.hold_status === 'won' ? 'paid' : 'refunded', returned: Number(h.hold_returned ?? 0) } };
  return {};
}
/** The columns holdView reads, for a query that LEFT JOINs message_holds as `hd`. */
export const HOLD_COLUMNS = 'hd.status AS hold_status, hd.payer AS hold_payer, hd.earner AS hold_earner, hd.coins AS hold_coins, hd.deadline_at AS hold_deadline, hd.returned AS hold_returned, hd.replied_at IS NOT NULL AS hold_replied';

let timer = null;
export function startHoldSweep() {
  if (timer) return;
  const run = () => sweepHolds().catch((e) => console.error('hold sweep', e.message));
  const every = Number(env.HOLD_SWEEP_MS);
  timer = setInterval(run, Number.isFinite(every) && every >= 100 ? every : 5_000);
  timer.unref();
}
export function stopHoldSweep() {
  clearInterval(timer);
  timer = null;
}
