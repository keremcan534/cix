// Canlı Yörünge: Oyun Salonu's rocket played live by everyone at once (the numbers: rocket-live-rules.mjs).
//
//   GET  /api/casino/rocket                                   → the round, its fuel, the last crash points, my part
//   POST /api/casino/rocket/bet { round, bet, auto?, place?, ref } → fuel on board of the open round (one ladder stake)
//   POST /api/casino/rocket/escape { round }                  → I leave the rocket now: all my fuel on board pays
//
// One process runs the rounds (as the live line, live-line.mjs): a betting window (ROCKET_BET_MS, 10 s), a moment for
// the engine to light (ROCKET_IGNITE_MS), the climb until the crash point, a pause for the podium (ROCKET_PAUSE_MS,
// 5 s), then the next round, for as long as someone watches (a GET in the last minute). The screens hear each change on
// the live line (lineRocket, at most a few a second); a GET reads it all again. Each fuel is a casino_rounds row of game
// 'rocket' pointing at its round, so Oyun Merkezi's history, the daily limit, the report, the data copy and account
// deletion see it as any round. Its stake comes from game coins first, then coins (spendCoins: lots, the daily spending
// limit, a coin_spend for the finance panel), every win is paid in game coins, and the same gates hold as for every
// coin game (casino.mjs): the game's switch, admin accounts until casino_open, Cömertlik Lv.2, the ladder up to
// casino_max_bet (also the most fuel one person takes into a round) and the daily limit.
//
// Money. At launch the round's stakes join the house book: the house share the round opened with (live setting
// rocket_house_pct) to the house, the rest to the payout pool; then the most the round can pay (every fuel × the crash
// point) moves from the pool into the round's reserve. Where the pool can't pay that much, the climb is cut lower
// (`cut`), so a round never owes more than the pool holds. Escapes are paid from the reserve, each person in their own
// transaction (the round row shared, then their fuel rows and their account, as every wallet change); after the crash
// what is left of the reserve goes back to the pool in one step. A restart in the middle voids the round: fuel still on
// board goes back where it came from (game coins, coin lots) and its row is deleted; the ledger keeps both moves.
//
// Fair play. The crash point is drawn when the round opens and leaves the server only once the rocket has blown up;
// the climb has the same speed in every round; an escape counts at the moment the server gets it; an automatic escape
// pays when the climb reaches its target, never earlier (a win paid at launch would tell everyone where it goes).
import crypto from 'node:crypto';

import { HttpError, REF, auth, db, env, limit, move, readJson, selfUser, tx } from './core.mjs';
import { DAY_START, POOL_LOW, dailyOf, isOn } from './casino.mjs';
import { POOL_SEED, betsUpTo, gameById, splitStake } from './casino-rules.mjs';
import { lineRocket } from './live-line.mjs';
import { live } from './live-settings.mjs';
import { LIVE_DRAW, RATE, autoOf, crashOf, houseOf, maskName, msTo, multAt, payoutOf, poolCap } from './rocket-live-rules.mjs';
import { spendCoins } from './wallet.mjs';
import { casinoNeed, needPaidGames, paidGamesOpen, wealthPoints } from './wheel.mjs';

const msOf = (v, d, min = 50) => (Number(v) >= min ? Math.round(Number(v)) : d);
const BET_MS = msOf(env.ROCKET_BET_MS, 10_000);
const IGNITE_MS = msOf(env.ROCKET_IGNITE_MS, 1_200, 0);
const PAUSE_MS = msOf(env.ROCKET_PAUSE_MS, 5_000);
const WATCH_MS = msOf(env.ROCKET_WATCH_MS, 60_000);
/** Climb speed per second; the screens take the server's (tests run it faster). */
const SPEED = Number(env.ROCKET_RATE) > 0 && Number(env.ROCKET_RATE) <= 50 ? Number(env.ROCKET_RATE) : RATE;
/** The climb is told to the screens at most this often (a new round, the launch and the crash at once). */
const PUSH_MS = 300;
/** Fuel on the screen: the biggest this many; the count and the total cover everyone. */
const SHOW = 30;
const HISTORY = 100;
const RETENTION_DAYS = 180;
/** Fuel and escapes per person per minute. */
const RATE_LIMIT = 120;
/** The pool must be able to pay at least this (hundredths) of every fuel on board, or a new fuel is refused. */
const MIN_COVER = 200;

const GAME = gameById('rocket');
const fmt = (n) => Number(n).toLocaleString('tr-TR');
/** A multiplier in hundredths as everyone reads it: 2,15×. */
export const mul = (x) => `${fmt(Math.floor(x / 100))},${String(x % 100).padStart(2, '0')}×`;
const at = (ms) => new Date(ms).toISOString();

// --- The round in this process ----------------------------------------------------------------------------------
/** The round on now: { id, state: bet | fly | done, housePct, betUntil, launchAt, crashAt, crash (hundredths, known from launch), cut }. */
let round = null;
/** Who has fuel in it, for the screens: user id → { k (their first fuel's id), name (masked), fuel, auto, cashed, payout }. */
let players = new Map();
/** The last rounds' crash points (hundredths, newest first). */
let history = [];
let historyRead = false;
/** Who has the screen open: user id → until (ms). */
const watchers = new Map();
let running = false;
let starting = null;
let seq = 0;
const timers = new Set();
function later(fn, ms) {
  const t = setTimeout(() => {
    timers.delete(t);
    Promise.resolve()
      .then(fn)
      .catch((e) => console.error('rocket', String(e?.stack ?? e).slice(0, 400)));
  }, Math.max(0, ms));
  t.unref?.();
  timers.add(t);
  return t;
}
function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

/** The people watching now (a GET in the last WATCH_MS); the others are forgotten. */
function watching(now = Date.now()) {
  const out = [];
  for (const [id, until] of watchers) {
    if (until < now) watchers.delete(id);
    else out.push(id);
  }
  return out;
}

const phaseOf = (r, now) => (!r ? 'idle' : r.state === 'bet' ? 'bet' : r.state === 'fly' && now < r.crashAt ? 'fly' : 'done');

/**
 * What every screen may see: the round (its crash point only once it blew up), the fuel on board with masked names
 * (`k` lets a phone find its own), the last crash points and the server's clock and climb speed.
 */
export function rocketView(now = Date.now()) {
  const r = round;
  const phase = phaseOf(r, now);
  const all = [...players.values()];
  return {
    v: seq,
    now,
    rate: SPEED,
    round: r && {
      id: r.id,
      phase,
      ret: 100 - r.housePct,
      betUntil: r.betUntil,
      launchAt: r.launchAt,
      crash: phase === 'done' ? Math.max(100, r.crash ?? 100) : null,
      players: all.length,
      fuel: all.reduce((n, p) => n + p.fuel, 0),
    },
    players: all
      .sort((a, b) => b.fuel - a.fuel || a.k - b.k)
      .slice(0, SHOW)
      .map((p) => ({ k: p.k, n: p.name, b: p.fuel, a: p.auto, c: p.cashed, p: p.payout })),
    last: history.slice(0, 20),
  };
}

let pushTimer = null;
let pushedAt = 0;
/** Tells the screens open now what changed: at once (`now`), or with the next push at most PUSH_MS from the last. */
function push(now = false) {
  seq += 1;
  const send = () => {
    pushTimer = null;
    pushedAt = Date.now();
    const ids = watching();
    if (ids.length) lineRocket(ids, JSON.stringify(rocketView()));
  };
  if (now) {
    if (pushTimer) clearTimeout(pushTimer);
    send();
  } else if (!pushTimer) {
    pushTimer = setTimeout(send, Math.max(0, pushedAt + PUSH_MS - Date.now()));
    pushTimer.unref?.();
  }
}

async function readHistory() {
  const r = await db.query("SELECT coalesce(cut, crash) AS crash FROM rocket_rounds WHERE state = 'done' ORDER BY id DESC LIMIT $1", [HISTORY]);
  history = r.rows.map((x) => Math.max(100, Number(x.crash)));
  historyRead = true;
}

/** Starts the rounds when someone opens the screen; they stop again once nobody watches. */
function wake() {
  if (running) return;
  running = true;
  starting = (async () => {
    if (!historyRead) await readHistory();
    await openRound();
  })()
    .catch((e) => {
      console.error('rocket start', String(e?.stack ?? e).slice(0, 400));
      running = false;
    })
    .finally(() => (starting = null));
}

function sleep() {
  clearTimers();
  running = false;
  round = null;
  players = new Map();
}

/** A new round: its crash point drawn now with the house share in effect, its betting window open. */
async function openRound() {
  const s = live();
  if (!isOn(GAME, s) || !watching().length) {
    sleep();
    push(true);
    return;
  }
  const housePct = s.rocketHousePct;
  const crash = crashOf(crypto.randomInt(0, LIVE_DRAW), 100 - housePct);
  const betUntil = Date.now() + BET_MS;
  const r = await db.query('INSERT INTO rocket_rounds (crash, house_pct, bet_until) VALUES ($1, $2, $3) RETURNING id', [crash, housePct, at(betUntil)]);
  const r0 = { id: Number(r.rows[0].id), state: 'bet', housePct, betUntil, launchAt: null, crashAt: null, crash: null, cut: null, flies: false };
  round = r0;
  players = new Map();
  later(() => launch(r0), BET_MS);
  push(true);
  prune();
}

const lockBank = async (c) => {
  await c.query('INSERT INTO casino_bank (id, pool, seed) VALUES (1, $1, $1) ON CONFLICT DO NOTHING', [POOL_SEED]);
  return Number((await c.query('SELECT pool FROM casino_bank WHERE id = 1 FOR UPDATE')).rows[0].pool);
};

/**
 * The betting window closes: the stakes join the house book, the reserve leaves the pool and the climb is cut where
 * the pool can't pay further. A crash point below 1,01× ends the round right here: every fuel is lost.
 */
async function launch(r0) {
  if (round !== r0 || r0.state !== 'bet') return;
  let out;
  try {
    out = await tx(async (c) => {
      const row = (await c.query('SELECT * FROM rocket_rounds WHERE id = $1 FOR UPDATE', [r0.id])).rows[0];
      if (!row || row.state !== 'bet') return null;
      const fuels = (await c.query('SELECT id, bet FROM casino_rounds WHERE live_round = $1 ORDER BY id', [r0.id])).rows.map((f) => ({ id: Number(f.id), bet: Number(f.bet) }));
      const total = fuels.reduce((n, f) => n + f.bet, 0);
      let crash = Number(row.crash);
      let cut = null;
      let reserve = 0;
      let house = 0;
      if (total > 0) {
        for (const f of fuels) {
          f.house = houseOf(f.bet, row.house_pct);
          house += f.house;
        }
        const free = (await lockBank(c)) + total - house;
        const cap = poolCap(free, total);
        if (crash > cap) crash = cut = cap < 100 ? 0 : cap;
        reserve = crash > 100 ? fuels.reduce((n, f) => n + payoutOf(f.bet, crash), 0) : 0;
        await c.query('UPDATE casino_bank SET wagered = wagered + $1, house = house + $2, pool = $3, updated_at = now() WHERE id = 1', [total, house, free - reserve]);
        await c.query('UPDATE casino_rounds x SET house = v.house FROM unnest($1::bigint[], $2::bigint[]) AS v(id, house) WHERE x.id = v.id', [fuels.map((f) => f.id), fuels.map((f) => f.house)]);
      }
      const launchAt = Date.now() + IGNITE_MS;
      const flies = crash > 100;
      await c.query('UPDATE rocket_rounds SET state = $2, launched_at = $3, cut = $4, total_bet = $5, house = $6, reserve = $7, ended_at = $8 WHERE id = $1', [
        r0.id,
        flies ? 'fly' : 'done',
        at(launchAt),
        cut,
        total,
        house,
        reserve,
        flies ? null : at(launchAt),
      ]);
      if (!flies && total > 0) {
        await c.query(`UPDATE casino_rounds SET cashed = 0, detail = $2, outcome = outcome || $3 WHERE live_round = $1`, [r0.id, `Canlı tur #${r0.id} · roket rampada patladı`, JSON.stringify({ live: { round: r0.id, crash: 100 } })]);
      }
      return { launchAt, crash, cut, flies };
    });
  } catch (e) {
    // The database didn't answer: the window stays shut and the launch is tried again.
    console.error('rocket launch', String(e?.stack ?? e).slice(0, 400));
    later(() => launch(r0), 2_000);
    return;
  }
  if (!out || round !== r0) return;
  r0.state = 'fly';
  r0.launchAt = out.launchAt;
  r0.crash = out.crash;
  r0.cut = out.cut;
  r0.flies = out.flies;
  r0.crashAt = out.launchAt + (out.flies ? msTo(out.crash, SPEED) : 0);
  // Each automatic target that the climb reaches pays when it gets there.
  if (out.flies) {
    const autos = [...new Set([...players.values()].map((p) => p.auto).filter((a) => a !== null && a <= out.crash))];
    for (const a of autos) later(() => autoEscape(r0, a), r0.launchAt + msTo(a, SPEED) - Date.now());
  }
  later(() => crashNow(r0), r0.crashAt - Date.now() + (out.flies ? 40 : 0));
  push(true);
}

/** Pays one person's fuel still on board at `x` hundredths: by hand ('hand', only in the air), at its automatic target ('auto'). */
async function pay(id, userId, x, kind) {
  return tx(async (c) => {
    const r = (await c.query('SELECT state FROM rocket_rounds WHERE id = $1 FOR SHARE', [id])).rows[0];
    if (!r || !(r.state === 'fly' || (kind === 'auto' && r.state === 'settling'))) return null;
    const rows = (
      await c.query(`SELECT id, ref, bet FROM casino_rounds WHERE live_round = $1 AND user_id = $2 AND cashed IS NULL${kind === 'auto' ? ' AND auto = $3' : ''} ORDER BY id FOR UPDATE`, kind === 'auto' ? [id, userId, x] : [id, userId])
    ).rows;
    let fuel = 0;
    let payout = 0;
    for (const f of rows) {
      const won = payoutOf(Number(f.bet), x);
      const how = kind === 'auto' ? 'otomatik kaçış' : 'kaçtın';
      await c.query('UPDATE casino_rounds SET cashed = $2, payout = $3, detail = $4, outcome = outcome || $5 WHERE id = $1', [f.id, x, won, `Canlı tur #${id} · ${mul(x)} ${how}`, JSON.stringify({ live: { round: id, cashed: x } })]);
      if (won) await move(c, userId, 'game', won, 'Yörünge kazancı', `casino:${f.ref}-k`);
      fuel += Number(f.bet);
      payout += won;
    }
    return rows.length ? { fuel, payout, x } : null;
  });
}

function paid(userId, x, payout) {
  const p = players.get(String(userId));
  if (!p) return;
  p.cashed = x;
  p.payout += payout;
}

async function autoEscape(r0, a) {
  if (round !== r0) return;
  const who = [...players.entries()].filter(([, p]) => p.auto === a && p.cashed === null).map(([id]) => id);
  for (const id of who) {
    const done = await pay(r0.id, id, a, 'auto').catch((e) => console.error('rocket auto', String(e).slice(0, 200)));
    if (done) paid(id, a, done.payout);
  }
  if (who.length) push();
}

/** The rocket blows up: the screens hear it at once; then the late automatic escapes, the losses and the book. */
async function crashNow(r0) {
  if (round !== r0 || r0.state !== 'fly') return;
  r0.state = 'done';
  push(true);
  if (r0.flies) await settle(r0.id, r0.crash);
  // Fuel that neither left by hand nor reached its target blew up with the rocket.
  for (const p of players.values()) if (p.cashed === null) p.cashed = 0;
  history.unshift(Math.max(100, r0.crash ?? 100));
  history.length = Math.min(history.length, HISTORY);
  push(true);
  later(openRound, PAUSE_MS);
}

/**
 * After a crash at `crash` hundredths: no escape by hand any more (the row waits for those in flight), the automatic
 * targets it reached that are not paid yet, the rest of the fuel lost, and the reserve back to the pool. Tried again
 * until the database takes it; a restart finishes it (recoverRocket).
 */
async function settle(id, crash) {
  for (let i = 0; ; i++) {
    try {
      await db.query("UPDATE rocket_rounds SET state = 'settling', ended_at = now() WHERE id = $1 AND state = 'fly'", [id]);
      const due = (await db.query('SELECT DISTINCT user_id, auto FROM casino_rounds WHERE live_round = $1 AND cashed IS NULL AND auto <= $2', [id, crash])).rows;
      for (const d of due) {
        const done = await pay(id, d.user_id, Number(d.auto), 'auto');
        if (done) paid(d.user_id, Number(d.auto), done.payout);
      }
      await db.query('UPDATE casino_rounds SET cashed = 0, detail = $2, outcome = outcome || $3 WHERE live_round = $1 AND cashed IS NULL', [id, `Canlı tur #${id} · roket ${mul(crash)}'te patladı`, JSON.stringify({ live: { round: id, crash } })]);
      await close(id);
      return;
    } catch (e) {
      console.error('rocket settle', String(e?.stack ?? e).slice(0, 400));
      if (i >= 30) return;
      await new Promise((r) => setTimeout(r, 1_000).unref?.());
    }
  }
}

/** The round's book: what is left of the reserve back to the pool (less the stakes of fuel given back), and done. */
async function close(id, state = 'done', refunded = { fuel: 0, house: 0 }) {
  await tx(async (c) => {
    const r = (await c.query('SELECT * FROM rocket_rounds WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!r || r.state === 'done' || r.state === 'void') return;
    const won = Number((await c.query('SELECT coalesce(sum(payout), 0) AS n FROM casino_rounds WHERE live_round = $1', [id])).rows[0].n);
    if (Number(r.total_bet) > 0) {
      await lockBank(c);
      await c.query('UPDATE casino_bank SET wagered = wagered - $1, house = house - $2, pool = pool + $3, paid = paid + $4, updated_at = now() WHERE id = 1', [
        refunded.fuel,
        refunded.house,
        Number(r.reserve) - won - (refunded.fuel - refunded.house),
        won,
      ]);
    }
    await c.query('UPDATE rocket_rounds SET state = $2, paid = $3, ended_at = coalesce(ended_at, now()) WHERE id = $1', [id, state, won]);
  });
}

/** Gives one fuel back where its stake came from (game coins; coins onto the lots they left) and deletes its row. */
async function giveBack(c, f, why) {
  const fromGame = Number(f.from_game);
  const fromCoins = Number(f.bet) - fromGame;
  if (fromGame) await move(c, f.user_id, 'game', fromGame, why, `casino:${f.ref}-iade`);
  if (fromCoins) {
    const spent = (await c.query("SELECT detail FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref = $2", [f.user_id, `casino:${f.ref}`])).rows[0];
    const lots = Array.isArray(spent?.detail?.lots) ? spent.detail.lots : [];
    for (const p of lots) if (p.lot) await c.query('UPDATE coin_lots SET remaining = LEAST(amount, remaining + $2) WHERE id = $1', [p.lot, p.amount]);
    await move(c, f.user_id, 'coin', fromCoins, why, `casino:${f.ref}-iade`, null, { detail: { lots } });
  }
  await c.query('DELETE FROM casino_rounds WHERE id = $1', [f.id]);
}

/**
 * At start, before any round runs: a round a restart cut off. Before launch every fuel goes back; in the air the fuel
 * still on board goes back (escapes already paid stay); one that had blown up is settled as it would have been.
 */
export async function recoverRocket() {
  const open = (await db.query("SELECT id, state, crash, cut FROM rocket_rounds WHERE state IN ('bet', 'fly', 'settling') ORDER BY id")).rows;
  for (const r of open) {
    const id = Number(r.id);
    if (r.state === 'settling') {
      await settle(id, Number(r.cut ?? r.crash));
      continue;
    }
    const why = `Yörünge: tur #${id} yarıda kaldı, yakıt iadesi`;
    const fuels = (await db.query('SELECT * FROM casino_rounds WHERE live_round = $1 AND cashed IS NULL ORDER BY user_id, id', [id])).rows;
    const back = { fuel: 0, house: 0 };
    for (const uid of new Set(fuels.map((f) => f.user_id))) {
      await tx(async (c) => {
        await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]);
        for (const f of fuels.filter((x) => x.user_id === uid)) {
          await giveBack(c, f, why);
          back.fuel += Number(f.bet);
          back.house += Number(f.house ?? 0);
        }
      });
    }
    if (r.state === 'bet') await db.query("UPDATE rocket_rounds SET state = 'void', ended_at = now() WHERE id = $1", [id]);
    else await close(id, 'void', back);
    console.log(`rocket: round ${id} voided at start (${fuels.length} fuel back)`);
  }
}

/** Shutdown: no more rounds from this process (the next one voids a round in the air, recoverRocket). */
export function stopRocket() {
  clearTimers();
  if (pushTimer) clearTimeout(pushTimer);
  running = false;
}

let pruned = 0;
function prune() {
  if (Date.now() - pruned < 3_600_000) return;
  pruned = Date.now();
  db.query(`DELETE FROM rocket_rounds WHERE id IN (SELECT id FROM rocket_rounds WHERE created_at < now() - make_interval(days => $1) AND state IN ('done', 'void') LIMIT 5000)`, [RETENTION_DAYS]).catch((e) =>
    console.error('rocket prune', String(e).slice(0, 200)),
  );
}

// --- Routes ------------------------------------------------------------------------------------------------------
/** My part in round `id`: { k, fuel, auto, cashed, payout }, or null without fuel in it. */
async function mineIn(id, userId) {
  if (!id) return null;
  const rows = (await db.query('SELECT id, bet, auto, cashed, payout FROM casino_rounds WHERE live_round = $1 AND user_id = $2 ORDER BY id', [id, userId])).rows;
  if (!rows.length) return null;
  const open = rows.filter((f) => f.cashed === null);
  const won = rows.filter((f) => Number(f.cashed) > 0);
  return {
    k: Number(rows[0].id),
    fuel: rows.reduce((n, f) => n + Number(f.bet), 0),
    onBoard: open.reduce((n, f) => n + Number(f.bet), 0),
    auto: rows[0].auto === null ? null : Number(rows[0].auto),
    cashed: won.length ? Math.max(...won.map((f) => Number(f.cashed))) : open.length ? null : 0,
    payout: rows.reduce((n, f) => n + Number(f.payout), 0),
  };
}

const userOf = async (id) => selfUser((await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0]);

export const rocketRoutes = {
  /**
   * Canlı Yörünge's screen: the round as everyone sees it (rocketView), the last 100 crash points, the game's gates
   * and stakes, my part in the round and my balances. Reading it keeps the rounds going for a minute.
   */
  async 'GET /api/casino/rocket'(req) {
    const me = await auth(req);
    limit(`rocket-view:${me.id}`, RATE_LIMIT, 'Çok sık yeniliyorsun, biraz bekle');
    const s = live();
    const open = paidGamesOpen(me, s);
    const on = open && isOn(GAME, s);
    if (on) {
      watchers.set(String(me.id), Date.now() + WATCH_MS);
      wake();
    }
    if (starting) await starting;
    const need = casinoNeed();
    const [points, today, mine] = await Promise.all([
      wealthPoints(db, me.id),
      db.query(`SELECT coalesce(sum(bet), 0) AS n FROM casino_rounds WHERE user_id = $1 AND game = 'rocket' AND created_at >= ${DAY_START}`, [me.id]),
      mineIn(round?.id, me.id),
    ]);
    return {
      ...rocketView(),
      history,
      game: {
        active: on,
        allowed: open && points >= need.points,
        needLevel: need.level,
        bets: betsUpTo(GAME, s.casinoMaxBet),
        maxFuel: s.casinoMaxBet,
        dailyLimit: dailyOf(GAME, s),
        playedToday: Number(today.rows[0].n),
      },
      mine,
      user: selfUser(me),
    };
  },

  async 'POST /api/casino/rocket/bet'(req) {
    const now = Date.now();
    const me = await auth(req);
    limit(`rocket:${me.id}`, RATE_LIMIT, 'Çok hızlı oynuyorsun, biraz bekle');
    const b = await readJson(req);
    if (!REF.test(b.ref ?? '') || b.ref.length > 60) throw new HttpError(400, 'Geçersiz istek kimliği');
    const { ref } = b;
    const seen = async () => (await db.query('SELECT * FROM casino_rounds WHERE user_id = $1 AND ref = $2', [me.id, ref])).rows[0];
    const answer = async (row, replay) => ({ round: Number(row.live_round), fuel: { id: Number(row.id), bet: Number(row.bet) }, mine: await mineIn(Number(row.live_round), me.id), user: await userOf(me.id), replay });
    // A retry of a fuel that went on board gets its answer, whatever changed since.
    const before = await seen();
    if (before) return answer(before, true);
    const s = live();
    if (!isOn(GAME, s)) throw new HttpError(409, `${GAME.name} şu an kapalı`);
    needPaidGames(me, s);
    const r0 = round;
    if (!r0 || r0.id !== b.round) throw new HttpError(409, 'Bu tur kapandı, sıradaki turu bekle');
    if (r0.state !== 'bet' || now >= r0.betUntil) throw new HttpError(409, 'Yakıt alımı kapandı, sıradaki turu bekle');
    if (!betsUpTo(GAME, s.casinoMaxBet).includes(b.bet)) throw new HttpError(400, 'Geçersiz bahis tutarı');
    const bet = b.bet;
    const auto = autoOf(b.auto);
    if (auto === undefined) throw new HttpError(400, 'Otomatik kaçış 1,01× ile 1.000× arasında olmalı');
    const place = b.place === 'room' ? 'room' : 'profile';
    const need = casinoNeed();
    if ((await wealthPoints(db, me.id)) < need.points) throw new HttpError(403, `${GAME.name}, Cömertlik Lv.${need.level} ve üstü üyeler içindir`);
    const daily = dailyOf(GAME, s);
    let row;
    let name;
    try {
      ({ row, name } = await tx(async (c) => {
        // The round row shared first (the launch takes it whole), then my account: the order of every escape too.
        const st = (await c.query('SELECT state FROM rocket_rounds WHERE id = $1 FOR SHARE', [r0.id])).rows[0];
        if (st?.state !== 'bet') throw new HttpError(409, 'Yakıt alımı kapandı, sıradaki turu bekle');
        const u = (await c.query('SELECT name, coins, game_coins FROM users WHERE id = $1 FOR UPDATE', [me.id])).rows[0];
        if ((await c.query('SELECT 1 FROM casino_rounds WHERE user_id = $1 AND ref = $2', [me.id, ref])).rowCount) throw Object.assign(new Error('replay'), { code: '23505' });
        // No daily limit unless Canlı ayarlar sets one (casino_daily_rounds 0: none), as in the other games.
        if (daily) {
          const played = Number((await c.query(`SELECT coalesce(sum(bet), 0) AS n FROM casino_rounds WHERE user_id = $1 AND game = 'rocket' AND created_at >= ${DAY_START}`, [me.id])).rows[0].n);
          if (played + bet > daily) throw new HttpError(409, `${GAME.name} için günlük sınır ${fmt(daily)} jeton. Bugün kalan: ${fmt(Math.max(0, daily - played))}`);
        }
        const mine = (await c.query('SELECT bet, auto FROM casino_rounds WHERE live_round = $1 AND user_id = $2 ORDER BY id', [r0.id, me.id])).rows;
        if (mine.length && (mine[0].auto === null ? null : Number(mine[0].auto)) !== auto) throw new HttpError(409, 'Otomatik kaçış bu turda ilk yakıtla belirlendi; sıradaki turda değiştirebilirsin');
        const fuel = mine.reduce((n, f) => n + Number(f.bet), 0);
        if (fuel + bet > s.casinoMaxBet) throw new HttpError(409, `Bir turda en çok ${fmt(s.casinoMaxBet)} jeton yakıt alınır. Bu turda kalan: ${fmt(Math.max(0, s.casinoMaxBet - fuel))}`);
        // The pool must be able to pay a climb to 2× for everything on board; the launch cuts the climb where it can't.
        const total = Number((await c.query('SELECT coalesce(sum(bet), 0) AS n FROM casino_rounds WHERE live_round = $1', [r0.id])).rows[0].n) + bet;
        const pool = Number((await c.query('SELECT pool FROM casino_bank WHERE id = 1')).rows[0]?.pool ?? POOL_SEED);
        if (poolCap(pool + total - houseOf(total, r0.housePct), total) < MIN_COVER) throw new HttpError(409, POOL_LOW);
        const { fromGame, fromCoins } = splitStake(bet, Number(u.game_coins));
        if (Number(u.coins) < fromCoins) throw new HttpError(409, 'Yetersiz jeton');
        const what = `${GAME.name} · tur (${fmt(bet)})`;
        const lref = `casino:${ref}`;
        if (fromGame) await move(c, me.id, 'game', -fromGame, what, lref);
        // "Uygulama içi:" makes it a coin_spend for the finance panel, like the other coin games.
        if (fromCoins) await spendCoins(c, me.id, fromCoins, `Uygulama içi: ${what}`, lref);
        const ins = await c.query(
          `INSERT INTO casino_rounds (user_id, ref, game, bet, from_game, place, detail, outcome, live_round, auto)
           VALUES ($1, $2, 'rocket', $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [me.id, ref, bet, fromGame, place, `Canlı tur #${r0.id} · yakıt ${fmt(bet)}${auto ? ` · otomatik ${mul(auto)}` : ''}`, JSON.stringify({ live: { round: r0.id, auto } }), r0.id, auto],
        );
        return { row: ins.rows[0], name: u.name };
      }));
    } catch (e) {
      // The same request twice at once: the second waited for the first's lock and found its row.
      if (e.code !== '23505') throw e;
      const again = await seen();
      if (!again) throw new HttpError(409, 'Geçersiz istek kimliği');
      return answer(again, true);
    }
    if (round === r0) {
      const p = players.get(String(me.id)) ?? { k: Number(row.id), name: maskName(name), fuel: 0, auto, cashed: null, payout: 0 };
      p.fuel += bet;
      players.set(String(me.id), p);
      push();
    }
    return answer(row, false);
  },

  async 'POST /api/casino/rocket/escape'(req) {
    // The moment it reached the server is the moment it counts.
    const now = Date.now();
    const me = await auth(req);
    limit(`rocket:${me.id}`, RATE_LIMIT, 'Çok hızlı oynuyorsun, biraz bekle');
    const b = await readJson(req);
    const r0 = round;
    if (!r0 || r0.id !== b.round) throw new HttpError(409, 'Bu tur bitti');
    if (r0.state === 'bet' || now < r0.launchAt) throw new HttpError(409, 'Roket daha kalkmadı');
    if (now >= r0.crashAt) throw new HttpError(409, `Roket ${mul(Math.max(100, r0.crash ?? 100))}'te patladı, kaçamadın`);
    const x = multAt(now - r0.launchAt, SPEED);
    const done = await pay(r0.id, me.id, x, 'hand');
    if (!done) {
      const mine = await mineIn(r0.id, me.id);
      if (mine?.cashed) throw new HttpError(409, `Zaten ${mul(mine.cashed)}'te kaçtın`);
      throw new HttpError(409, mine ? `Roket ${mul(Math.max(100, r0.crash ?? 100))}'te patladı, kaçamadın` : 'Bu turda roketin içinde yakıtın yok');
    }
    paid(me.id, x, done.payout);
    push();
    return { round: r0.id, x, fuel: done.fuel, payout: done.payout, mine: await mineIn(r0.id, me.id), user: await userOf(me.id) };
  },
};
