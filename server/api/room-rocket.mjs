// Oda roketi (docs/ODA_ROKETI.md): the coins people spend on gifts in a server room fill its rocket for the day
// (Istanbul's calendar, from 00:00). Five levels in a row, each with its own goal (the panel's, room-rocket-rules.mjs);
// a gift past a level's goal fills the next with the rest. A full level launches: its prizes, as the panel had them at
// that moment, go to the people who gave in the room that day by how much each gave (owners, 25 Nov 2026; a draw
// before): the most first takes the biggest coin prize, then the next, the items after the coins; at most one prize
// each (room-rocket-rules.mjs rankWinners, prizeSlots). Paid in a transaction of its own after the gift's (settleLaunch), never
// inside it: the winners are locked there in id order, as every money write locks people, and a missed one is paid by
// the sweep. Coins are normal coins, the owners' choice: the Şanslı hediye rewards' channel (wallet.mjs `ugurlu`:
// spent anywhere, gifts too, so a prize can become diamonds and cash; what they pay for never counts for Cömertlik or
// the Rüzgâr Gülü, wheel.mjs; the finance panel gets them as campaign oda_roketi). An item is one of the shop's
// frames, entry effects, rides, bubbles or waves for some days (economy.mjs grantInTx, source 'rocket'; not put on). What counts: a paid gift's or a Şanslı hediye's coins in an
// open server room (gifts.mjs, lucky.mjs); a free gift from Çantam and a Şanslı çanta's shares don't.
//
//   GET  /api/rooms/rocket?room=<id or oda-id>   the room's rocket today for the phones (see roomRocket)
//   GET  /api/admin/rocket                       → { config, version, updatedAt, limits, items, recent }
//   POST /api/admin/rocket/config { config, version } → { config, version, updatedAt }
//   POST /api/admin/rocket/video { level, video }     → { videos }   a level's launch video (null takes it off)
//   GET|HEAD /api/fx/r/rocket-<level>.mp4             → the video (public), listed in the catalog's `fx` as entry rocket-<level>
//
// The room hears a launch and its winners ('rocket' packets: event 'launch', then 'paid'); its phones read the state
// again. An older app drops a packet it doesn't know and never asks for the state: it shows no rocket, its gifts still
// fill it, and what its owner wins is theirs all the same.
import crypto from 'node:crypto';

import { HttpError, UUID, auth, clientIp, db, env, int, limit, readJson, tx } from './core.mjs';
import { SHOP, SHOP_PAUSED } from './catalog.mjs';
import { addVideoTable, canConvert, canSvga, kickJobs, videoOf } from './custom-gifts.mjs';
import { grantInTx } from './economy.mjs';
import { FX_PATH } from './fx.mjs';
import { keyOf, removeFiles, sendFile } from './media.mjs';
import { roomPacket } from './live.mjs';
import { panelDetail } from './panel.mjs';
import { notify } from './push.mjs';
import { systemNotice } from './system-notices.mjs';
import { DEFAULT_ROCKET, PRIZE_ITEM_KINDS, ROCKET_LIMITS, checkRocket, isRocketError, levelEnds, levelsFull, prizeSlots, rankWinners, splitFuel } from './room-rocket-rules.mjs';
// rooms.mjs reaches this file through gifts.mjs; its functions are only used inside handlers, after both have loaded.
import { liveKitName } from './rooms.mjs';
import { allShopItems, shopItem } from './shop-items.mjs';
import { creditCoins } from './wallet.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
/** How often unpaid launches are looked for, and how old one must be (the gift's own call pays it first). */
const SWEEP_MS = positive(env.ROCKET_SWEEP_MS, 30_000);
const GRACE_S = positive(env.ROCKET_GRACE_S, 15);
/** The settings are read again at most this often (every room gift asks); a save here clears them at once. */
const CONFIG_MS = 5_000;
/** A room's shared state (everyone in the room reads it) is kept this long. */
const STATE_MS = 2_000;
/** The day on Istanbul's calendar, and when the next one starts. */
const TODAY = `(now() AT TIME ZONE 'Europe/Istanbul')::date`;
const NEXT_DAY = `((date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') + interval '1 day') AT TIME ZONE 'Europe/Istanbul')`;
/** The most winners a 'paid' packet names (the state lists them all). */
const ANNOUNCE_MAX = 20;
const fmt = (n) => n.toLocaleString('tr-TR');

// --- Settings ---------------------------------------------------------------------------------------------------
/** The rocket's settings in force: the panel's saved ones, or the built-in ones until the first save. */
async function current(q = db) {
  const r = (await q.query('SELECT config, version, updated_at FROM room_rocket_config WHERE id = 1')).rows[0];
  return r ? { config: r.config, version: r.version, updatedAt: r.updated_at } : { config: DEFAULT_ROCKET, version: 1, updatedAt: null };
}
let kept = null;
/** current(), kept a few seconds; `q`: a gift's transaction reads on its own connection. */
async function settings(q = db) {
  if (!kept || Date.now() - kept.at > CONFIG_MS) kept = { at: Date.now(), cur: await current(q) };
  return kept.cur;
}

/** A shop item a prize may name now: a frame, entry effect, bubble or wave on the shelf (shop-items.mjs), or a ride the app sells. */
export function prizeItem(sku) {
  const x = shopItem(sku);
  if (x) return x.enabled && PRIZE_ITEM_KINDS.includes(x.kind) ? x : undefined;
  const c = SHOP.get(sku);
  return c && c.kind === 'ride' && !SHOP_PAUSED.has(sku) ? c : undefined;
}
/** The item a won prize gives, on the shelf or not (whoever has it still wears it); undefined once it is deleted. */
const paidItem = (sku) => shopItem(sku) ?? (SHOP.get(sku)?.kind === 'ride' ? SHOP.get(sku) : undefined);
const itemName = (sku) => shopItem(sku)?.name ?? SHOP.get(sku)?.name ?? sku;
/** A prize as the phones and the panel show it. */
const prizeView = (p) =>
  p.kind === 'coins'
    ? { kind: 'coins', amount: p.amount, winners: p.winners }
    : { kind: 'item', sku: p.sku, name: itemName(p.sku), itemKind: paidItem(p.sku)?.kind ?? null, days: p.days, winners: p.winners };
/** A prize in a sentence: "750 jeton", "Neon Halka (3 gün)". */
const prizeText = (p) => (p.kind === 'coins' ? `${fmt(p.amount)} jeton` : `${itemName(p.sku)} (${p.days} gün)`);

// --- The launch videos (the panel's, one a level) ------------------------------------------------------------------
let videos = { rev: 0, rows: new Map() };
/** Reads the five rows again. */
export async function refreshRocketVideos(q = db) {
  const r = await q.query('SELECT * FROM room_rocket_videos');
  videos = { rev: r.rows.reduce((m, x) => Math.max(m, Number(x.rev)), 0), rows: new Map(r.rows.map((x) => [x.id, x])) };
}
addVideoTable({ table: 'room_rocket_videos', rev: 'room_rocket_video_rev', what: 'rocket', refresh: () => refreshRocketVideos() });
/** Added to the catalog's `v`: a new video makes the phones read the catalog again. */
export const rocketVideosRev = () => videos.rev;
/** The catalog's `fx` rows: an older app's filter refuses the /r/ address, so it never downloads one. */
export const rocketFx = () =>
  [...videos.rows.values()].filter((x) => x.video_url).map((x) => ({ kind: 'entry', id: x.id, url: `${FX_PATH}r/${x.id}.mp4?v=${x.video_v}`, bytes: Number(x.video_bytes), ms: Number(x.video_ms ?? 0) }));
/** GET or HEAD /api/fx/r/rocket-<level>.mp4. */
export async function sendRocketFx(req, res, name) {
  const m = /^(rocket-[1-5])\.mp4$/.exec(name);
  const key = m && videos.rows.get(m[1])?.video_url ? keyOf(videos.rows.get(m[1]).video_url) : null;
  if (!key) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Bulunamadı');
  await sendFile(req, res, key);
}
/** The five levels as the panel shows them. */
const videosView = () =>
  [1, 2, 3, 4, 5].map((level) => {
    const x = videos.rows.get(`rocket-${level}`);
    return {
      level,
      video: x?.video_url ? { url: `${FX_PATH}r/${x.id}.mp4?v=${x.video_v}`, bytes: Number(x.video_bytes), ms: Number(x.video_ms ?? 0) } : null,
      job: x?.job_status ? { status: x.job_status, error: x.job_error ?? null } : null,
    };
  });

// --- Fuel (inside the gift's transaction) -----------------------------------------------------------------------
/**
 * A paid send of `coins` by `sender` in server room `roomId`, inside the gift's transaction (after its coins moved):
 * today's fuel grows, the sender's share of each level it reaches grows, and a level it fills gets its launch row.
 * The room is already locked by then (boss-seat.mjs bossGift locks it for every room gift), so the counter is
 * serialised per room. Never fails the gift: a savepoint, and a failure leaves the rocket as it was. Returns the new
 * launches ([{ id, level }]) for launchRockets once the gift is committed, or null.
 */
export async function fuelRocket(c, { roomId, sender, coins }) {
  if (!roomId || !(coins > 0)) return null;
  const { config } = await settings(c);
  if (!config.enabled) return null;
  await c.query('SAVEPOINT room_rocket');
  try {
    const r = (
      await c.query(
        `INSERT INTO room_rockets (room_id, day, fuel)
           SELECT $1, ${TODAY}, $2 WHERE EXISTS (SELECT 1 FROM rooms WHERE id = $1 AND closed_at IS NULL)
         ON CONFLICT (room_id, day) DO UPDATE SET fuel = room_rockets.fuel + EXCLUDED.fuel, updated_at = now()
         RETURNING day::text AS day, fuel, launched`,
        [roomId, coins],
      )
    ).rows[0];
    const launched = [];
    if (r) {
      const ends = levelEnds(config);
      const fuel = Number(r.fuel);
      for (const part of splitFuel(ends, fuel - coins, coins)) {
        await c.query(
          `INSERT INTO room_rocket_fuel (room_id, day, level, user_id, coins) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (room_id, day, level, user_id) DO UPDATE SET coins = room_rocket_fuel.coins + EXCLUDED.coins`,
          [roomId, r.day, part.level, sender, part.coins],
        );
      }
      // Every level full now and not launched yet (more than one when a big gift crosses several, or the goals were
      // lowered in the panel during the day).
      const full = levelsFull(ends, fuel);
      for (let level = r.launched + 1; level <= full; level++) {
        const l = config.levels[level - 1];
        const ins = await c.query(
          'INSERT INTO room_rocket_launches (room_id, day, level, goal, prizes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (room_id, day, level) DO NOTHING RETURNING id',
          [roomId, r.day, level, l.goal, JSON.stringify(l.prizes)],
        );
        if (ins.rowCount) launched.push({ id: Number(ins.rows[0].id), level });
      }
      if (full > r.launched) await c.query('UPDATE room_rockets SET launched = $3 WHERE room_id = $1 AND day = $2', [roomId, r.day, full]);
    }
    await c.query('RELEASE SAVEPOINT room_rocket');
    return launched.length ? launched : null;
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT room_rocket');
    console.error('room rocket fuel', roomId, String(e?.message ?? e).slice(0, 200));
    return null;
  }
}

// --- Launch and pay ---------------------------------------------------------------------------------------------
/**
 * Draws and pays launch `id` once, in a transaction of its own: the launch row locked (a second call waits, then
 * finds it paid and returns null), everyone who filled the level read (deleted accounts left out), the winners drawn
 * (room-rocket-rules.mjs drawWinners), locked in id order, then paid one by one. An item someone can't get (has it
 * for good, already a year ahead, deleted from the shop) is written with why, and nothing given for it.
 * Returns { launch, wins: [{ user, prize, outcome }] } or null.
 */
export async function settleLaunch(id) {
  return tx(async (c) => {
    const l = (await c.query('SELECT id, room_id, day::text AS day, level, goal, prizes FROM room_rocket_launches WHERE id = $1 AND paid_at IS NULL FOR UPDATE', [id])).rows[0];
    if (!l) return null;
    const fuel = (
      await c.query(
        // What each gave in the room that day up to this level (every level it filled), deleted accounts left out.
        `SELECT f.user_id, sum(f.coins) AS coins FROM room_rocket_fuel f JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL
          WHERE f.room_id = $1 AND f.day = $2 AND f.level <= $3 GROUP BY f.user_id ORDER BY f.user_id`,
        [l.room_id, l.day, l.level],
      )
    ).rows.map((x) => ({ user: x.user_id, coins: Number(x.coins) }));
    const slots = prizeSlots(l.prizes);
    const winners = rankWinners(fuel, slots.length);
    // Everyone paid, locked in id order before any of them is paid (a gift locks its sender and recipient the same way).
    if (winners.length) await c.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [winners]);
    const wins = [];
    for (const [n, user] of winners.entries()) {
      const p = slots[n];
      const prize = p.kind === 'coins' ? { kind: 'coins', amount: p.amount } : { kind: 'item', sku: p.sku, days: p.days };
      const ref = `rocket:${l.id}:${n}`;
      let outcome = 'paid';
      if (p.kind === 'coins') {
        await creditCoins(c, user, [{ channel: 'ugurlu', amount: p.amount }], `Oda roketi Lv.${l.level} ödülü`, ref, null, { detail: { rocket: Number(l.id), level: l.level } });
      } else {
        const item = paidItem(p.sku);
        if (!item) outcome = 'gone';
        else {
          await c.query('SAVEPOINT rocket_item');
          try {
            await grantInTx(c, user, item, { ref, source: 'rocket', price: 0, mode: 'admin', days: p.days });
            await c.query('RELEASE SAVEPOINT rocket_item');
          } catch (e) {
            await c.query('ROLLBACK TO SAVEPOINT rocket_item');
            // economy.mjs refuses with 409 and says why in extra.code (owned, too_far).
            if (!(e instanceof HttpError) || e.code !== 409) throw e;
            outcome = e.extra?.code === 'too_far' ? 'too_far' : 'owned';
          }
        }
      }
      await c.query('INSERT INTO room_rocket_wins (launch_id, slot, user_id, prize, ref, outcome) VALUES ($1, $2, $3, $4, $5, $6)', [l.id, n, user, JSON.stringify(prize), ref, outcome]);
      wins.push({ user, prize, outcome, ref });
    }
    await c.query('UPDATE room_rocket_launches SET paid_at = now(), winners = $2 WHERE id = $1', [l.id, wins.length]);
    return { launch: { id: Number(l.id), roomId: l.room_id, level: l.level }, wins };
  });
}

/** Tells the room who won what (a 'paid' packet) and each winner on their phone. Best effort. */
async function announcePaid(done) {
  const { launch, wins } = done;
  states.delete(launch.roomId);
  const ids = wins.map((w) => w.user);
  const names = new Map((await db.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [ids])).rows.map((x) => [x.id, x.name]));
  await roomPacket(liveKitName(launch.roomId), {
    type: 'rocket',
    event: 'paid',
    level: launch.level,
    launch: launch.id,
    winners: wins.slice(0, ANNOUNCE_MAX).map((w) => ({ user: w.user, name: names.get(w.user) ?? 'Üye', prize: prizeText(w.prize), paid: w.outcome === 'paid' })),
  });
  for (const w of wins.filter((x) => x.outcome === 'paid')) {
    notify([w.user], { title: 'Oda roketi', body: `Lv.${launch.level} roketinden ${prizeText(w.prize)} kazandın`, data: { type: 'rocket', room: launch.roomId } });
    // SimilarClub Sistem: only a prize that was really given (the push above rings already).
    const item = w.prize.kind === 'item';
    await systemNotice({
      target: w.user,
      category: 'rocket',
      ref: w.ref ?? `rocket:${launch.id}:${w.user}`,
      title: '🚀 Roket Ödülü',
      body: [
        'Katıldığın roket etkinliği tamamlandı.',
        `Etkinlik: Oda roketi Lv.${launch.level}`,
        `Kazandığın ödül: ${prizeText(w.prize)}`,
        item ? 'Ödülün Çantam bölümüne eklendi.' : 'Ödülün hesabına başarıyla tanımlandı.',
      ].join('\n'),
      data: { launch: launch.id, level: launch.level, room: launch.roomId, prize: w.prize, status: 'done' },
      link: item ? '/canta' : '/cuzdan',
      push: false,
    });
  }
}

/**
 * After the gift that filled them is committed: each launch is announced (the phones play it), paid, and its winners
 * announced. Never throws; what fails here the sweep pays later.
 */
export async function launchRockets(roomId, launched) {
  if (!launched?.length) return;
  states.delete(roomId);
  for (const x of launched) {
    try {
      await roomPacket(liveKitName(roomId), { type: 'rocket', event: 'launch', level: x.level, launch: x.id });
      const done = await settleLaunch(x.id);
      if (done) await announcePaid(done);
    } catch (e) {
      console.error('room rocket launch', x.id, String(e?.message ?? e).slice(0, 200));
    }
  }
}

let sweep = null;
/** Pays launches nobody paid (the process stopped between the gift and the payout). */
export function startRocketSweep() {
  if (sweep) return;
  void refreshRocketVideos().catch((e) => console.error('room rocket videos', String(e?.message ?? e).slice(0, 200)));
  let busy = false;
  sweep = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const due = await db.query('SELECT id FROM room_rocket_launches WHERE paid_at IS NULL AND launched_at < now() - make_interval(secs => $1) ORDER BY id LIMIT 20', [GRACE_S]);
      for (const x of due.rows) {
        const done = await settleLaunch(Number(x.id));
        if (done) await announcePaid(done);
      }
    } catch (e) {
      console.error('room rocket sweep', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, SWEEP_MS);
  sweep.unref();
}
export function stopRocketSweep() {
  clearInterval(sweep);
  sweep = null;
}

// --- The phones' view -------------------------------------------------------------------------------------------
const states = new Map();
const userOf = (x) => ({ id: x.user_id, name: x.name, avatarUrl: x.avatar_url ?? null });

/**
 * A room's rocket today as everyone in it sees it (kept STATE_MS): each level's goal, how much of it is filled,
 * whether it launched, its prizes (a launched level's as they were at its launch) and its top three; the last
 * launch's winners. null when there is no such room.
 */
async function roomState(roomId, config) {
  const k = states.get(roomId);
  if (k && Date.now() - k.at < STATE_MS) return k.value;
  const head = (
    await db.query(
      `SELECT ${TODAY}::text AS day, ${NEXT_DAY} AS resets_at, EXISTS (SELECT 1 FROM rooms WHERE id = $1) AS room,
              (SELECT fuel FROM room_rockets WHERE room_id = $1 AND day = ${TODAY}) AS fuel`,
      [roomId],
    )
  ).rows[0];
  if (!head.room) return null;
  const fuel = Number(head.fuel ?? 0);
  const launches = new Map((await db.query(`SELECT id, level, goal, prizes, launched_at, paid_at FROM room_rocket_launches WHERE room_id = $1 AND day = ${TODAY}`, [roomId])).rows.map((x) => [x.level, x]));
  const top = (
    await db.query(
      `SELECT t.* FROM (
         SELECT f.level, f.user_id, f.coins, u.name, u.avatar_url,
                row_number() OVER (PARTITION BY f.level ORDER BY f.coins DESC, f.first_at, f.user_id) AS rank
           FROM room_rocket_fuel f JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL
          WHERE f.room_id = $1 AND f.day = ${TODAY}) t
        WHERE t.rank <= 3 ORDER BY t.level, t.rank`,
      [roomId],
    )
  ).rows;
  const ends = levelEnds(config);
  const levels = config.levels.map((cfg, i) => {
    const level = i + 1;
    const l = launches.get(level);
    const goal = l ? Number(l.goal) : cfg.goal;
    const start = i ? ends[i - 1] : 0;
    return {
      level,
      goal,
      filled: l ? goal : Math.max(0, Math.min(goal, fuel - start)),
      launched: !!l,
      launchedAt: l?.launched_at ?? null,
      prizes: (l ? l.prizes : cfg.prizes).map(prizeView),
      top: top.filter((x) => x.level === level).map((x) => ({ rank: Number(x.rank), user: userOf(x), coins: Number(x.coins) })),
    };
  });
  const paid = [...launches.values()].filter((x) => x.paid_at).sort((a, b) => b.level - a.level)[0];
  let last = null;
  if (paid) {
    const w = await db.query(
      `SELECT w.slot, w.prize, w.outcome, w.user_id, u.name, u.avatar_url FROM room_rocket_wins w JOIN users u ON u.id = w.user_id
        WHERE w.launch_id = $1 ORDER BY w.slot`,
      [paid.id],
    );
    last = { launch: Number(paid.id), level: paid.level, at: paid.paid_at, winners: w.rows.map((x) => ({ user: userOf(x), prize: prizeView({ ...x.prize, winners: 1 }), paid: x.outcome === 'paid' })) };
  }
  const full = levels.filter((l) => l.launched).length;
  const value = { on: config.enabled, day: head.day, resetsAt: head.resets_at, fuel, current: full < levels.length ? full + 1 : null, levels, last };
  states.set(roomId, { at: Date.now(), value });
  return value;
}

// --- Routes -----------------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
/** The shop items a prize may be, for the panel's list: on the shelf now. */
const prizeItems = () => [
  ...allShopItems().filter((x) => x.enabled && PRIZE_ITEM_KINDS.includes(x.kind)),
  ...[...SHOP.values()].filter((x) => x.kind === 'ride' && !SHOP_PAUSED.has(x.sku)),
].map((x) => ({ sku: x.sku, kind: x.kind, name: x.name }));

export const roomRocketRoutes = {
  /**
   * The room's rocket today: { on, day, resetsAt, fuel, current (the level filling now; null: all five launched),
   * levels: [{ level, goal, filled, launched, launchedAt, prizes, top: [{ rank, user, coins }], mine }], last: the
   * last paid launch's { launch, level, at, winners: [{ user, prize, paid }] } or null }. `mine`: what I put in.
   */
  async 'GET /api/rooms/rocket'(req, url) {
    const me = await auth(req);
    const roomId = String(url.searchParams.get('room') ?? '').replace(/^oda-/, '');
    if (!UUID.test(roomId)) throw new HttpError(400, 'Geçersiz oda');
    const { config } = await settings();
    const state = await roomState(roomId, config);
    if (!state) throw new HttpError(404, 'Oda bulunamadı');
    const mine = new Map((await db.query(`SELECT level, coins FROM room_rocket_fuel WHERE room_id = $1 AND day = ${TODAY} AND user_id = $2`, [roomId, me.id])).rows.map((x) => [x.level, Number(x.coins)]));
    return { ...state, levels: state.levels.map((l) => ({ ...l, mine: mine.get(l.level) ?? 0 })) };
  },

  async 'GET /api/admin/rocket'(req) {
    await admin(req);
    const cur = await current();
    const recent = await db.query(
      `SELECT l.id, l.room_id, r.title, l.day::text AS day, l.level, l.goal, l.launched_at, l.paid_at, l.winners
         FROM room_rocket_launches l JOIN rooms r ON r.id = l.room_id ORDER BY l.launched_at DESC LIMIT 30`,
    );
    return {
      config: cur.config,
      version: cur.version,
      updatedAt: cur.updatedAt,
      limits: ROCKET_LIMITS,
      items: prizeItems(),
      videos: videosView(),
      convert: await canConvert(),
      svga: await canSvga(),
      recent: recent.rows.map((x) => ({ id: Number(x.id), room: { id: x.room_id, title: x.title }, day: x.day, level: x.level, goal: Number(x.goal), launchedAt: x.launched_at, paidAt: x.paid_at, winners: x.winners })),
    };
  },

  /** The levels' goals and prizes and on / off; a save made on an older copy is refused (409), not undone. */
  async 'POST /api/admin/rocket/config'(req) {
    const a = await admin(req);
    limit(`rocket-admin:${a.id}`, 30, 'Çok fazla kayıt, biraz bekle');
    const b = await readJson(req, 16_384);
    let config;
    try {
      config = checkRocket(b.config, prizeItem);
    } catch (e) {
      if (isRocketError(e)) throw new HttpError(400, e.message);
      throw e;
    }
    const out = await tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['room_rocket_config']);
      const cur = await current(c);
      if (b.version !== cur.version) throw new HttpError(409, 'Roket ayarları bu arada değişti; sayfayı yenileyip tekrar deneyin');
      const version = cur.version + 1;
      const r = await c.query(
        `INSERT INTO room_rocket_config (id, config, version, updated_by, updated_at) VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, version = EXCLUDED.version, updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING updated_at`,
        [JSON.stringify(config), version, a.id],
      );
      await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [
        a.id,
        'rocket.config',
        JSON.stringify({ version, before: cur.config, after: config, ...panelDetail(a) }),
        clientIp(req),
      ]);
      return { config, version, updatedAt: r.rows[0].updated_at };
    });
    kept = null;
    states.clear();
    return out;
  },

  /**
   * A level's launch video: a ready stacked MP4, or a transparent source (an SVGA, WebM or MOV) converted in the
   * background, as a gift's. The video in use stays until the new one is ready. null takes it off (the drawn rocket).
   */
  async 'POST /api/admin/rocket/video'(req) {
    const a = await admin(req);
    limit(`rocket-admin:${a.id}`, 30, 'Çok fazla kayıt, biraz bekle');
    const b = await readJson(req, 4096);
    const level = int(b.level, 1, 5);
    if (!level) throw new HttpError(400, 'Seviye 1–5 olmalı');
    const video = await videoOf(b.video);
    if (video === undefined) throw new HttpError(400, 'Video seçilmedi');
    const id = `rocket-${level}`;
    const drop = [];
    await tx(async (c) => {
      await c.query('INSERT INTO room_rocket_videos (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
      const cur = (await c.query('SELECT * FROM room_rocket_videos WHERE id = $1 FOR UPDATE', [id])).rows[0];
      drop.push(cur.job_source, cur.job_preview);
      if (video === null || video.kind === 'stacked') {
        drop.push(cur.video_url);
        await c.query(
          `UPDATE room_rocket_videos SET video_url = $2, video_bytes = $3, video_ms = $4, video_v = $5, job_status = NULL, job_source = NULL, job_error = NULL,
                  job_preview = NULL, job_tries = 0, rev = nextval('room_rocket_video_rev'), updated_at = now() WHERE id = $1`,
          [id, video?.url ?? null, video?.bytes ?? null, video?.ms ?? null, video?.v ?? null],
        );
      } else {
        await c.query(
          `UPDATE room_rocket_videos SET job_status = 'processing', job_source = $2, job_fill = $3, job_opaque = $4, job_error = NULL, job_preview = NULL, job_tries = 0,
                  job_at = now(), rev = nextval('room_rocket_video_rev'), updated_at = now() WHERE id = $1`,
          [id, video.url, video.fill, video.opaque === true],
        );
      }
      await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [
        a.id,
        'rocket.video',
        JSON.stringify({ level, before: cur.video_url, after: video?.url ?? null, kind: video?.kind ?? null, ...panelDetail(a) }),
        clientIp(req),
      ]);
    });
    removeFiles(drop.filter(Boolean));
    await refreshRocketVideos();
    if (video?.kind === 'source') kickJobs();
    return { videos: videosView() };
  },
};
