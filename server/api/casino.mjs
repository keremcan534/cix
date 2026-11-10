// Oyun Salonu: the coin games of Oyun Merkezi and the room menu (Gece Yarısı Çarkı, Hazine Kulesi, Fener Kayalığı,
// Mercan Avı, Yörünge, Kızıl Yedi, Vahşi Patika, Bereket Ağacı, Liman Pazarı, Sihir Destesi, Konfeti Kutusu, Kayıp
// Parşömen, Neon Bulvar), played on the server like Rüzgâr Gülü (wheel.mjs).
//
//   GET  /api/casino                                                → { games, needLevel, allowed, gameCoins, mine }
//   POST /api/casino/play { game, bet, pick?, bets?, place?, ref }  → { round, user, replay, fund }
//
// One request is one round. A board game (Gece Yarısı Çarkı, Liman Pazarı, Sihir Destesi) sends `bets` (option →
// coins) instead of `bet`; Mercan Avı's pick is the fish, Yörünge's the cash-out target. The stake comes from game
// coins first, then coins (spendCoins: coin lots, the daily spending limit, a coin_spend for the finance panel). The
// draw is crypto.randomInt with the demo's odds (casino-rules.mjs); every win is paid in game coins, which can only
// be played: never gifted, exchanged or withdrawn, so play money (test top-ups) never becomes anything else either.
// The payout pool is the demo's (app lib/games): 60 % of every stake is booked to the house at once, 40 % joins the
// pool, winnings are paid only from the pool, and a round whose top prize the pool can't cover is refused before
// anything is taken. A slot's JACKPOT share moves from the pool into its fund; a line of wilds wins bet / top stake
// of the fund.
// Open from Cömertlik Lv.2 (wheel.mjs NEED_POINTS), checked on every round. Per person: a daily ceiling per game
// (live setting casino_daily_rounds × the game's top stake) and a rate limit. Live settings also switch single games
// off (casino_off) and cap the stake (casino_max_bet); Acil durum's Oyunlar stops them all (features.mjs).
// Kept: the rounds, 180 days (the history and the daily limit), deleted with the account (social.mjs eraseAccount).
import crypto from 'node:crypto';

import { HttpError, REF, auth, db, limit, move, readJson, selfUser, tx } from './core.mjs';
import { live } from './live-settings.mjs';
import { spendCoins } from './wallet.mjs';
import { NEED_LEVEL, NEED_POINTS, wealthPoints } from './wheel.mjs';
import {
  BOARDS,
  GAMES,
  JACKPOT_SEEDS,
  MIN_STAKE,
  PICKS,
  POOL_SEED,
  betsUpTo,
  boardMaxPayout,
  boardPayout,
  boardResult,
  boardTotal,
  gameById,
  houseShare,
  isBoard,
  jackpotShareOf,
  jackpotWin,
  maxMultiplier,
  outcomeOf,
  splitStake,
  topStake,
} from './casino-rules.mjs';

/** Rounds per person per minute (Mercan Avı's Oto shoots about one a second). */
const RATE = 90;
const RETENTION_DAYS = 180;
const DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul')`;
const fmt = (n) => n.toLocaleString('tr-TR');
const POOL_LOW = 'Ödül havuzu şu an bu bahsin en yüksek ödülünü karşılayamıyor. Daha küçük bir bahisle dene; jetonun düşülmedi.';

/** A game's daily ceiling per person, in coins played. */
export const dailyOf = (g, s = live()) => s.casinoDailyRounds * topStake(g);
const isOn = (g, s) => !s.casinoOff.has(g.id) && !s.featuresOff.has('games');

const roundOut = (r, withOutcome = false) => ({
  id: Number(r.id),
  game: r.game,
  bet: Number(r.bet),
  fromGame: Number(r.from_game),
  payout: Number(r.payout),
  jackpot: Number(r.jackpot),
  pick: r.pick ?? null,
  bets: r.bets ?? null,
  place: r.place,
  detail: r.detail,
  at: r.created_at,
  ...(withOutcome && { outcome: r.outcome }),
});

/** Every slot's JACKPOT fund; a missing row starts from the demo's seed. `lock`: one game's row, FOR UPDATE. */
async function jackpots(c, lock = null) {
  for (const [game, seed] of Object.entries(JACKPOT_SEEDS)) {
    if (!lock || game === lock) await c.query('INSERT INTO casino_jackpots (game, fund) VALUES ($1, $2) ON CONFLICT DO NOTHING', [game, seed]);
  }
  const r = await c.query(`SELECT game, fund FROM casino_jackpots${lock ? ' WHERE game = $1 FOR UPDATE' : ''}`, lock ? [lock] : []);
  return Object.fromEntries(r.rows.map((x) => [x.game, Number(x.fund)]));
}
async function bank(c) {
  await c.query('INSERT INTO casino_bank (id, pool, seed) VALUES (1, $1, $1) ON CONFLICT DO NOTHING', [POOL_SEED]);
  const r = (await c.query('SELECT pool FROM casino_bank WHERE id = 1 FOR UPDATE')).rows[0];
  return Number(r.pool);
}

/** A board's bets from the body: known options, each a positive multiple of the smallest stake, at most `max`. */
function boardBets(board, v, max) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Önce bir seçeneğe jeton koy');
  const placed = {};
  for (const [id, n] of Object.entries(v)) {
    if (!board.options.some((o) => o.id === id)) throw new HttpError(400, 'Geçersiz bahis');
    if (n === 0) continue;
    if (!Number.isSafeInteger(n) || n < 0 || n % MIN_STAKE) throw new HttpError(400, 'Geçersiz bahis');
    if (n > max) throw new HttpError(409, `Bir seçeneğe en çok ${fmt(max)} jeton konabilir`);
    placed[id] = n;
  }
  if (!Object.keys(placed).length) throw new HttpError(400, 'Önce bir seçeneğe jeton koy');
  return placed;
}

let pruned = 0;
/** Rounds past their retention go, a few at a time, at most once an hour per process. */
function prune() {
  if (Date.now() - pruned < 3_600_000) return;
  pruned = Date.now();
  db.query(`DELETE FROM casino_rounds WHERE id IN (SELECT id FROM casino_rounds WHERE created_at < now() - make_interval(days => $1) LIMIT 5000)`, [RETENTION_DAYS]).catch((e) =>
    console.error('casino prune', String(e).slice(0, 200)),
  );
}

export const casinoRoutes = {
  async 'GET /api/casino'(req) {
    const me = await auth(req);
    const s = live();
    const [points, today, mine, funds] = await Promise.all([
      wealthPoints(db, me.id),
      db.query(`SELECT game, sum(bet) AS n FROM casino_rounds WHERE user_id = $1 AND created_at >= ${DAY_START} GROUP BY game`, [me.id]),
      db.query('SELECT * FROM casino_rounds WHERE user_id = $1 ORDER BY id DESC LIMIT 50', [me.id]),
      jackpots(db),
    ]);
    const played = new Map(today.rows.map((x) => [x.game, Number(x.n)]));
    return {
      games: GAMES.map((g) => ({
        id: g.id,
        name: g.name,
        active: isOn(g, s),
        bets: betsUpTo(g, s.casinoMaxBet),
        dailyLimit: dailyOf(g, s),
        playedToday: played.get(g.id) ?? 0,
        jackpot: funds[g.id] ?? null,
      })),
      needLevel: NEED_LEVEL,
      allowed: points >= NEED_POINTS,
      gameCoins: Number(me.game_coins),
      mine: mine.rows.map((r) => roundOut(r)),
    };
  },

  async 'POST /api/casino/play'(req) {
    const me = await auth(req);
    limit(`casino:${me.id}`, RATE, 'Çok hızlı oynuyorsun, biraz bekle');
    const b = await readJson(req);
    const g = gameById(b.game);
    if (!g) throw new HttpError(400, 'Geçersiz oyun');
    if (!REF.test(b.ref ?? '') || b.ref.length > 60) throw new HttpError(400, 'Geçersiz istek kimliği');
    const { ref } = b;
    // The ledger's idempotency key (user, currency, ref) is shared by every wallet feature: the rounds' own rows carry
    // "casino:" (a colon no client ref can hold). casino_rounds keeps the client's ref.
    const lref = `casino:${ref}`;
    const seen = async () => (await db.query('SELECT * FROM casino_rounds WHERE user_id = $1 AND ref = $2', [me.id, ref])).rows[0];
    // `fund`: the slot's JACKPOT fund now (null for a game without one), for the screen's JACKPOT line.
    const answer = async (row, replay) => {
      const user = selfUser((await db.query('SELECT * FROM users WHERE id = $1', [me.id])).rows[0]);
      const seed = JACKPOT_SEEDS[g.id];
      const fund = seed === undefined ? null : Number((await db.query('SELECT fund FROM casino_jackpots WHERE game = $1', [g.id])).rows[0]?.fund ?? seed);
      return { round: roundOut(row, true), user, replay, fund };
    };

    // A retry of a round that went through gets its answer, whatever changed since.
    const before = await seen();
    if (before) return answer(before, true);
    const s = live();
    if (!isOn(g, s)) throw new HttpError(409, `${g.name} şu an kapalı`);
    const place = b.place === 'room' ? 'room' : 'profile';
    const board = isBoard(g.id) ? BOARDS[g.id] : null;
    let bet;
    let pick = null;
    let bets = null;
    if (board) {
      bets = boardBets(board, b.bets, s.casinoMaxBet);
      bet = Object.values(bets).reduce((a, n) => a + n, 0);
    } else {
      if (!betsUpTo(g, s.casinoMaxBet).includes(b.bet)) throw new HttpError(400, 'Geçersiz bahis tutarı');
      bet = b.bet;
      const p = b.pick === undefined || b.pick === null ? '' : String(b.pick);
      if (!PICKS[g.id].includes(p)) throw new HttpError(400, 'Geçersiz seçim');
      pick = p || null;
    }
    if ((await wealthPoints(db, me.id)) < NEED_POINTS) throw new HttpError(403, `${g.name}, Cömertlik Lv.${NEED_LEVEL} ve üstü üyeler içindir`);
    const daily = dailyOf(g, s);
    let row;
    try {
      row = await tx(async (c) => {
        const u = (await c.query('SELECT coins, game_coins FROM users WHERE id = $1 FOR UPDATE', [me.id])).rows[0];
        if ((await c.query('SELECT 1 FROM casino_rounds WHERE user_id = $1 AND ref = $2', [me.id, ref])).rowCount) throw Object.assign(new Error('replay'), { code: '23505' });
        const played = Number(
          (await c.query(`SELECT coalesce(sum(bet), 0) AS n FROM casino_rounds WHERE user_id = $1 AND game = $2 AND created_at >= ${DAY_START}`, [me.id, g.id])).rows[0].n,
        );
        if (played + bet > daily) throw new HttpError(409, `${g.name} için günlük sınır ${fmt(daily)} jeton. Bugün kalan: ${fmt(Math.max(0, daily - played))}`);
        const { fromGame, fromCoins } = splitStake(bet, Number(u.game_coins));
        if (Number(u.coins) < fromCoins) throw new HttpError(409, 'Yetersiz jeton');
        // Before anything is taken: the pool must cover this round's top prize.
        let pool = await bank(c);
        const most = board ? boardMaxPayout(board, bets) : Math.floor(bet * maxMultiplier(g.id, pick ?? ''));
        if (pool < most) throw new HttpError(409, POOL_LOW);

        const what = `${g.name} · tur (${fmt(bet)})`;
        if (fromGame) await move(c, me.id, 'game', -fromGame, what, lref);
        // "Uygulama içi:" makes it a coin_spend for the finance panel, like the other coin games.
        if (fromCoins) await spendCoins(c, me.id, fromCoins, `Uygulama içi: ${what}`, lref);
        const house = houseShare(bet);
        pool += bet - house;

        const rnd = (n) => crypto.randomInt(0, n);
        let outcome;
        let payout;
        if (board) {
          const r = boardResult(board, rnd(boardTotal(board)));
          payout = boardPayout(board, bets, r);
          outcome = { display: [r.id], multiplier: payout / bet, detail: `Sonuç: ${r.label} ${r.name}`, board: r };
        } else {
          outcome = outcomeOf(g.id, pick ?? '', rnd);
          payout = Math.floor(bet * outcome.multiplier);
        }
        pool -= payout;
        let paid = payout;
        let won = 0;
        const share = jackpotShareOf(g.id, bet);
        if (share) {
          // The stake's JACKPOT share moves from the pool into the game's fund; a line of wilds wins bet / top stake of it.
          let fund = (await jackpots(c, g.id))[g.id] + share;
          pool -= share;
          if (outcome.slot?.jackpotLines.length) {
            won = jackpotWin(fund, bet, topStake(g));
            fund -= won;
            outcome.detail += ` · JACKPOT +${fmt(won)}`;
          }
          await c.query(`UPDATE casino_jackpots SET fund = $2, updated_at = now()${won ? ', won_at = now()' : ''} WHERE game = $1`, [g.id, fund]);
          paid += won;
        }
        await c.query('UPDATE casino_bank SET wagered = wagered + $1, house = house + $2, pool = $3, paid = paid + $4, updated_at = now() WHERE id = 1', [bet, house, pool, paid]);
        if (paid) await move(c, me.id, 'game', paid, won ? `${g.name} JACKPOT` : `${g.name} kazancı`, `${lref}-k`);
        const ins = await c.query(
          `INSERT INTO casino_rounds (user_id, ref, game, bet, from_game, payout, jackpot, pick, bets, place, detail, outcome)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [me.id, ref, g.id, bet, fromGame, paid, won, pick, bets && JSON.stringify(bets), place, outcome.detail.slice(0, 200), JSON.stringify(outcome)],
        );
        return ins.rows[0];
      });
    } catch (e) {
      // The same request twice at once: the second waited for the first's lock and found its row. A clash with no
      // round of this person's behind it is not a replay: refused, nothing taken.
      if (e.code !== '23505') throw e;
      const again = await seen();
      if (!again) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(again, true);
    }
    prune();
    return answer(row, false);
  },
};
