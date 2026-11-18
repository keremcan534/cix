// What 1v1 (one-on-one.mjs) leaves behind, read back for the app: Mesajlar's call history and heart levels, the
// call figures of Yayıncı Merkezi and Görevler's call task.
//
//   GET  /api/me/calls?before=          → { calls, next }   my calls both ways, newest first, 30 a page
//   POST /api/me/calls/clear            → { cleared }       "Arama geçmişini temizle": for me only
//   GET  /api/me/call-stats             → { week }          paid call and match minutes I earned this week
//   GET  /api/me/call-task              → { task }          today's "1 görüntülü arama yap" (task.items: its Görev ödülleri)
//   POST /api/me/call-task/claim        → { user, replay, task, backpack, items }   backpack: the gift put in Çantam, or
//                                          null; items: the Görev ödülleri items put there (task-rewards.mjs)
//   GET  /api/me/hearts                 → { hearts }        heart points with each person (Mesajlar › Yakınlık)
//
// The history is the calls table itself (kept as accounting records, so it adds nothing to store): calls, not
// Eşleşme, once they are over. People blocked either way and deleted accounts are left out. Clearing keeps one
// number per person (call_history_cleared), deleted with the account. Weeks and days are Turkey's.
import { bonusNotice } from './system-notices.mjs';
import { grantBackpack } from './backpack.mjs';
import { HttpError, auth, claimRef, db, limit, once } from './core.mjs';
import { live } from './live-settings.mjs';
import { CHAT_DAY_AT, HEART_WINDOW, heartLevel, heartWarmth } from './one-on-one.mjs';
import { grantTaskRewards, taskItems } from './task-rewards.mjs';
import { creditCoins } from './wallet.mjs';

const PAGE = 30;
const TR_DAY = "(date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')";
const TR_WEEK = "(date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')";
const NOT_BLOCKED = (me, other) => `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = ${me} AND b.blocked = ${other}) OR (b.blocker = ${other} AND b.blocked = ${me}))`;

/**
 * Görevler › "1 görüntülü arama yap": a video call I made or answered today that stayed on at least a minute (a call
 * hung up at once doesn't count). The reward is reward coins ('odul', the shop only), once a day, the Çantam gift
 * of the live settings (backpack.mjs grantBackpack, under the same day's ref) and the panel's Görev ödülleri items
 * (task-rewards.mjs).
 */
export const CALL_TASK = Object.freeze({ goal: 1, reward: 25, minSeconds: 60 });

/** Today's call task for `uid`: how many such calls, and whether its reward was taken (its ledger ref). */
async function callTaskOf(q, uid) {
  const r = await q.query(
    `SELECT (SELECT count(*)::int FROM calls
              WHERE (caller = $1 OR callee = $1) AND kind = 'call' AND mode = 'video' AND started_at >= ${TR_DAY}
                AND coalesce(ended_at, now()) - started_at >= make_interval(secs => $2)) AS done,
            'task-call-' || to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS ref`,
    [uid, CALL_TASK.minSeconds],
  );
  const { done, ref } = r.rows[0];
  const claimed = (await q.query("SELECT 1 FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [uid, ref])).rowCount > 0;
  return { ref, task: { goal: CALL_TASK.goal, done: Math.min(done, CALL_TASK.goal), reward: CALL_TASK.reward, minSeconds: CALL_TASK.minSeconds, claimed } };
}

/** A finished call as one of its two people sees it in the history. */
const historyRow = (k, me) => ({
  id: Number(k.id),
  mode: k.mode,
  outgoing: k.caller === me,
  // ended (it was answered), missed (nobody answered), declined, cancelled (the caller gave up first).
  status: k.status,
  seconds: k.started_at && k.ended_at ? Math.max(0, Math.round((Date.parse(k.ended_at) - Date.parse(k.started_at)) / 1000)) : 0,
  coins: Number(k.coins),
  iPay: k.payer === me && Number(k.coins) > 0,
  iEarn: k.earner === me && Number(k.coins) > 0,
  other: { id: k.other_id, name: k.other_name, avatarUrl: k.other_avatar ?? null },
  at: k.created_at,
});

export const callLogRoutes = {
  async 'GET /api/me/calls'(req, url) {
    const me = await auth(req);
    const raw = Number(url.searchParams.get('before') ?? 0);
    const before = Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
    const r = await db.query(
      `SELECT k.*, o.id AS other_id, o.name AS other_name, o.avatar_url AS other_avatar
         FROM calls k JOIN users o ON o.id = CASE WHEN k.caller = $1 THEN k.callee ELSE k.caller END
        WHERE (k.caller = $1 OR k.callee = $1) AND k.kind = 'call' AND k.status NOT IN ('ringing', 'live')
          AND k.id > coalesce((SELECT before_id FROM call_history_cleared WHERE user_id = $1), 0)
          AND ($2::bigint = 0 OR k.id < $2)
          AND o.deleted_at IS NULL AND ${NOT_BLOCKED('$1', 'o.id')}
        ORDER BY k.id DESC LIMIT ${PAGE + 1}`,
      [me.id, before],
    );
    const rows = r.rows.slice(0, PAGE);
    return { calls: rows.map((k) => historyRow(k, me.id)), next: r.rows.length > PAGE ? Number(rows[rows.length - 1].id) : null };
  },

  /** Hides every finished call of mine so far from my history; the other person's history keeps them. */
  async 'POST /api/me/calls/clear'(req) {
    const me = await auth(req);
    await db.query(
      `INSERT INTO call_history_cleared (user_id, before_id)
       SELECT $1, max(id) FROM calls WHERE (caller = $1 OR callee = $1) AND status NOT IN ('ringing', 'live') HAVING max(id) IS NOT NULL
       ON CONFLICT (user_id) DO UPDATE SET before_id = GREATEST(call_history_cleared.before_id, EXCLUDED.before_id), cleared_at = now()`,
      [me.id],
    );
    return { cleared: true };
  },

  /**
   * Yayıncı Merkezi: this week's paid calls and matches I earned from (calls: how many, minutes: paid minutes,
   * diamonds: what they gave me, one diamond a coin). The same rows as Gelir's call sources (wallet.mjs).
   */
  async 'GET /api/me/call-stats'(req) {
    const me = await auth(req);
    const r = await db.query(
      `SELECT count(DISTINCT call_id)::int AS calls, count(*)::int AS minutes, coalesce(sum(coins), 0) AS diamonds
         FROM paid_events WHERE earner = $1 AND kind <> 'message' AND created_at >= ${TR_WEEK}`,
      [me.id],
    );
    const x = r.rows[0];
    return { week: { calls: x.calls, minutes: x.minutes, diamonds: Number(x.diamonds) } };
  },

  async 'GET /api/me/call-task'(req) {
    const me = await auth(req);
    return { task: { ...(await callTaskOf(db, me.id)).task, items: await taskItems('call') } };
  },

  /** Takes today's call task reward once it is done; a second take the same day is a replay and pays nothing. */
  async 'POST /api/me/call-task/claim'(req) {
    const me = await auth(req);
    limit(`call-task:${me.id}`, 10);
    const { ref, task } = await callTaskOf(db, me.id);
    if (task.claimed) return { ...(await once(me.id, 'coin', ref, async () => {})), task: { ...task, items: await taskItems('call') }, backpack: null, items: [] };
    if (task.done < task.goal) throw new HttpError(409, 'Görev henüz tamamlanmadı: bugün en az bir dakikalık görüntülü arama yap');
    let backpack = null;
    let items = [];
    const out = await once(me.id, 'coin', ref, async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
      await claimRef(c, me.id, 'coin', ref);
      await creditCoins(c, me.id, [{ channel: 'odul', amount: CALL_TASK.reward }], 'Görev ödülü: 1 görüntülü arama yap', ref, null, { detail: { task: 'calls' } });
      backpack = await grantBackpack(c, me.id, 'call_task', ref);
      items = await grantTaskRewards(c, me.id, 'call', ref);
    });
    const replay = out.replay;
    if (!replay) {
      // SimilarClub Sistem: the task's coins, the gift in Çantam and any items, once (the task's own ref).
      const extra = [backpack && `Çantana ${backpack.count} hediye eklendi.`, ...items.map((x) => `${x.name} (${x.days ? `${x.days} gün` : 'süresiz'}) Çantam’a eklendi.`)].filter(Boolean);
      void bonusNotice({ target: me.id, ref, origin: 'Günlük görev', what: `${CALL_TASK.reward} ödül jetonu`, detail: extra, data: { coins: CALL_TASK.reward, backpack, items } });
    }
    return { ...out, task: { ...task, claimed: true, items: await taskItems('call') }, backpack: replay ? null : backpack, items: replay ? [] : items };
  },

  /**
   * Yakınlık: heart points (one-on-one.mjs heartPoints: gifts both ways, paid messages and minutes, messages, each as
   * much as it still counts) with each person I share any, most first, at most 200. Blocks either way and deleted
   * accounts left out.
   */
  async 'GET /api/me/hearts'(req) {
    const me = await auth(req);
    const s = live();
    const r = await db.query(
      `WITH ev AS (
          SELECT CASE WHEN sender = $1 THEN recipient ELSE sender END AS peer, created_at AS at, total::numeric AS pts FROM gift_events
           WHERE (sender = $1 OR recipient = $1) AND sender <> recipient AND created_at > now() - ${HEART_WINDOW}
          UNION ALL
          SELECT CASE WHEN payer = $1 THEN earner ELSE payer END, created_at, coins::numeric FROM paid_events
           WHERE (payer = $1 OR earner = $1) AND earner IS NOT NULL AND payer <> earner AND created_at > now() - ${HEART_WINDOW}
          UNION ALL
          SELECT CASE WHEN lo = $1 THEN hi ELSE lo END, ${CHAT_DAY_AT}, least(n * $2::numeric, $3::numeric) FROM chat_days
           WHERE (lo = $1 OR hi = $1) AND day > (now() - ${HEART_WINDOW})::date
        ), t AS (SELECT peer, floor(sum(pts * ${heartWarmth('at', '$4', '$5')})) AS points FROM ev GROUP BY peer)
        SELECT t.peer AS id, t.points FROM t JOIN users u ON u.id = t.peer
         WHERE t.points > 0 AND u.deleted_at IS NULL AND ${NOT_BLOCKED('$1', 't.peer')}
         ORDER BY t.points DESC LIMIT 200`,
      [me.id, s.heartMsg, s.heartMsgDaily, s.heartGrace, s.heartHalf],
    );
    return { hearts: r.rows.map((x) => ({ id: x.id, points: Number(x.points), level: heartLevel(Number(x.points)) })) };
  },
};
