// Rüzgâr Gülü: the wheel game of the Oyun Salonu, played on the server (docs/RUZGAR_GULU.md).
//
//   GET  /api/wheel                         → { tiers, counts, slices, dailyLimit, playedToday, needLevel, allowed,
//                                               gameCoins, winners, board, mine }
//   POST /api/wheel/spin { tier, count, ref } → { spin, user, replay }
//
// A request is 1, 10 or 50 spins of one tier. Its price comes from game coins first, then coins (coin lots, a
// coin_spend for the finance panel). Every prize is paid in game coins, which can only be played: never gifted,
// exchanged or withdrawn. Odds and the JACKPOT funds: wheel-rules.mjs. The draw is crypto.randomInt here; the app
// only plays back the result.
// Open from Cömertlik Lv.2 (35 coins spent on gifts and purchases; coin games and hand-outs don't count), checked
// here on every request. A daily limit per person (WHEEL_DAILY coins) caps what one can play.
import crypto from 'node:crypto';

import { HttpError, REF, auth, db, env, limit, move, readJson, selfUser, tx } from './core.mjs';
import { spendCoins } from './wallet.mjs';
import { COUNTS, SLICES, TIERS, WEIGHT_TOTAL, jackpotSeed, playSpins } from './wheel-rules.mjs';

export { COUNTS, SLICES, TIERS };

/** Cömertlik Lv.2 starts at 35 points (app/src/data/wealth.ts WEALTH_XP). */
export const NEED_LEVEL = 2;
export const NEED_POINTS = 35;
export const DAILY = (() => {
  const n = Number(env.WHEEL_DAILY ?? 1_000_000);
  return Number.isSafeInteger(n) && n > 0 ? n : 1_000_000;
})();
/** A request whose best slice is at least this (thousandths of the price) or a JACKPOT goes on the winners' list. */
const BIG_MILLI = 10_000;
const DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')`;

/**
 * Spending that counts for Cömertlik (as the app's countsForWealth): not coin games, not coins handed on, not a
 * Jeton Noktası selling coins on (jeton.mjs) and not coins taken back for a refunded purchase ("İade: …"). The
 * part of a spend paid with reward coins ('odul'), Uğurlu hediye rewards ('ugurlu') or coins of a refunded
 * purchase (coin_lots.refunded_by, read now, so a refund drops the points the moment it lands) never counts either.
 */
export async function wealthPoints(c, userId) {
  const r = await c.query(
    `SELECT coalesce(sum(-l.amount - coalesce(x.skip, 0)), 0) AS n FROM ledger l
       LEFT JOIN LATERAL (SELECT sum((p->>'amount')::bigint) AS skip
                            FROM jsonb_array_elements(coalesce(l.detail->'lots', '[]'::jsonb)) p
                            LEFT JOIN coin_lots k ON k.id = (p->>'lot')::bigint
                           WHERE p->>'channel' IN ('odul', 'ugurlu') OR k.refunded_by IS NOT NULL) x ON true
      WHERE l.user_id = $1 AND l.currency = 'coin' AND l.amount < 0 AND l.reason !~ '· tur' AND l.reason !~* '(zar düellosu|zarf|transfer|jeton gönder)'
        AND l.reason !~ '^(Jeton Noktası satışı|İade:)'`,
    [userId],
  );
  return Number(r.rows[0].n);
}

async function funds(c, lock = null) {
  for (const t of Object.keys(TIERS)) await c.query('INSERT INTO wheel_funds (tier, jackpot) VALUES ($1, $2) ON CONFLICT DO NOTHING', [t, jackpotSeed(t)]);
  const r = await c.query(`SELECT tier, jackpot FROM wheel_funds${lock ? ' WHERE tier = $1 FOR UPDATE' : ''}`, lock ? [lock] : []);
  return Object.fromEntries(r.rows.map((f) => [f.tier, Number(f.jackpot)]));
}

const playedToday = async (c, userId) =>
  Number((await c.query(`SELECT coalesce(sum(cost), 0) AS n FROM wheel_spins WHERE user_id = $1 AND created_at >= ${DAY_START}`, [userId])).rows[0].n);

const spinOut = (s) => ({
  id: Number(s.id),
  tier: s.tier,
  count: s.spins,
  cost: Number(s.cost),
  fromGame: Number(s.from_game),
  payout: Number(s.payout),
  jackpot: Number(s.jackpot),
  slices: s.slices.map(Number),
  wins: s.wins.map(Number),
  at: s.created_at,
});
const person = (r) => ({ id: r.user_id, name: r.name, avatarUrl: r.avatar_url ?? null });

export const wheelRoutes = {
  async 'GET /api/wheel'(req) {
    const me = await auth(req);
    const [fund, points, played, winners, board, mine] = await Promise.all([
      funds(db),
      wealthPoints(db, me.id),
      playedToday(db, me.id),
      db.query(
        `SELECT s.user_id, u.name, u.avatar_url, s.tier, s.payout, s.jackpot, s.best_milli, s.created_at FROM wheel_spins s JOIN users u ON u.id = s.user_id
          WHERE u.deleted_at IS NULL AND (s.jackpot > 0 OR s.best_milli >= $1) ORDER BY s.id DESC LIMIT 30`,
        [BIG_MILLI],
      ),
      db.query(
        `SELECT s.user_id, u.name, u.avatar_url, sum(s.payout) AS total FROM wheel_spins s JOIN users u ON u.id = s.user_id
          WHERE u.deleted_at IS NULL AND s.created_at >= ${DAY_START} GROUP BY s.user_id, u.name, u.avatar_url ORDER BY total DESC LIMIT 20`,
      ),
      db.query('SELECT * FROM wheel_spins WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [me.id]),
    ]);
    return {
      tiers: Object.entries(TIERS).map(([id, t]) => ({ id, ...t, jackpot: fund[id] })),
      counts: COUNTS,
      slices: SLICES,
      dailyLimit: DAILY,
      playedToday: played,
      needLevel: NEED_LEVEL,
      allowed: points >= NEED_POINTS,
      gameCoins: Number(me.game_coins),
      winners: winners.rows.map((r) => ({ ...person(r), tier: r.tier, payout: Number(r.payout), jackpot: Number(r.jackpot), best: r.best_milli, at: r.created_at })),
      board: board.rows.map((r) => ({ ...person(r), total: Number(r.total) })),
      mine: mine.rows.map(spinOut),
    };
  },

  async 'POST /api/wheel/spin'(req) {
    const me = await auth(req);
    limit(`wheel:${me.id}`, 30, 'Çok hızlı çeviriyorsun, biraz bekle');
    const b = await readJson(req);
    const tier = typeof b.tier === 'string' && Object.hasOwn(TIERS, b.tier) ? b.tier : null;
    if (!tier) throw new HttpError(400, 'Geçersiz alan');
    if (!COUNTS.includes(b.count)) throw new HttpError(400, 'Geçersiz çevirme sayısı');
    if (!REF.test(b.ref ?? '') || b.ref.length > 60) throw new HttpError(400, 'Geçersiz istek kimliği');
    const { ref, count } = b;
    // The ledger's idempotency key (user, currency, ref) is shared by every wallet feature: the wheel's own rows
    // carry "wheel:" (a colon no client ref can hold), so a ref used elsewhere neither breaks a spin nor makes a
    // later gift or purchase with this ref look like a replay. wheel_spins keeps the client's ref.
    const lref = `wheel:${ref}`;
    const seen = async () => (await db.query('SELECT * FROM wheel_spins WHERE user_id = $1 AND ref = $2', [me.id, ref])).rows[0];
    const answer = async (row, replay) => ({ spin: spinOut(row), user: selfUser((await db.query('SELECT * FROM users WHERE id = $1', [me.id])).rows[0]), replay });

    const before = await seen();
    if (before) return answer(before, true);
    if ((await wealthPoints(db, me.id)) < NEED_POINTS) throw new HttpError(403, `Rüzgâr Gülü Cömertlik Lv.${NEED_LEVEL} ve üstü için`);
    const t = TIERS[tier];
    const cost = t.price * count;
    let row;
    try {
      row = await tx(async (c) => {
        const u = (await c.query('SELECT coins, game_coins FROM users WHERE id = $1 FOR UPDATE', [me.id])).rows[0];
        if ((await c.query('SELECT 1 FROM wheel_spins WHERE user_id = $1 AND ref = $2', [me.id, ref])).rowCount) throw Object.assign(new Error('replay'), { code: '23505' });
        const played = await playedToday(c, me.id);
        if (played + cost > DAILY) throw new HttpError(409, `Rüzgâr Gülü'nde günlük sınır ${DAILY.toLocaleString('tr-TR')} jeton. Bugün kalan: ${Math.max(0, DAILY - played).toLocaleString('tr-TR')}`);
        const fromGame = Math.min(Number(u.game_coins), cost);
        const fromCoins = cost - fromGame;
        if (Number(u.coins) < fromCoins) throw new HttpError(409, 'Yetersiz jeton');
        const what = `Rüzgâr Gülü · tur (${t.label} ×${count})`;
        if (fromGame) await move(c, me.id, 'game', -fromGame, what, lref);
        // "Uygulama içi:" makes it a coin_spend for the finance panel, like the other coin games.
        if (fromCoins) await spendCoins(c, me.id, fromCoins, `Uygulama içi: ${what}`, lref);

        const fund = (await funds(c, tier))[tier];
        const r = playSpins(tier, count, fund, () => crypto.randomInt(0, WEIGHT_TOTAL));
        await c.query(`UPDATE wheel_funds SET jackpot = $2, updated_at = now()${r.jackpot ? ', won_at = now()' : ''} WHERE tier = $1`, [tier, r.fund]);
        if (r.payout) await move(c, me.id, 'game', r.payout, r.jackpot ? `Rüzgâr Gülü JACKPOT (${t.label})` : `Rüzgâr Gülü kazancı (${t.label} ×${count})`, `${lref}-k`);
        const best = Math.max(...r.slices.map((s) => SLICES[s].milli ?? 0));
        const ins = await c.query(
          `INSERT INTO wheel_spins (user_id, ref, tier, spins, cost, from_game, payout, jackpot, best_milli, slices, wins)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [me.id, ref, tier, count, cost, fromGame, r.payout, r.jackpot, best, r.slices, r.wins],
        );
        return ins.rows[0];
      });
    } catch (e) {
      // The same request twice at once: the second waited for the first's lock and found its row. A clash with no
      // spin of this person's behind it is not a replay: refused, nothing taken.
      if (e.code !== '23505') throw e;
      const again = await seen();
      if (!again) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(again, true);
    }
    return answer(row, false);
  },
};
