// Aile, the rest of it on the server: the daily tasks (worked out from what members really did: the family chat, the
// family room, gifts to new members, in the family room, İkili gifts to members, gifts from the family chat, the
// daily check-in),
// the weekly milestone chests, the family room, the week's ranking and highlights, active members, the Uyum Köşesi
// pairs and the weekly bonus estimate.
//
//   GET  /api/family/overview                → { tasks, me, chests, week, bonus, rank, room, highlights, active, pairs, checkedIn, online }
//   POST /api/family/checkin                 → { checkedIn: true }
//   POST /api/family/chest   { chest, ref }  → { user, replay, coins }
//
// Tasks give contribution points, never coins. A chest gives reward coins ('odul': only for the shop, never gifted,
// exchanged or withdrawn), once per person and week whichever family they were in, when their family's week (gift
// coins of its members) reached it and they did something for the family this week. The weekly bonus is shown as an
// estimate (family level rate × the week): paying it is a management decision, nothing here pays it.
import { HttpError, auth, claimRef, db, limit, once, readJson } from './core.mjs';
import { CHEST_MIN_CONTRIBUTION, CP_GIFT_IDS, FAMILY_CHESTS, FAMILY_RATES, FAMILY_TASKS, taskPoints } from './family-rules.mjs';
import { WEEK, familyView, membersOf, myMembership, statsOf } from './families.mjs';
import { creditCoins } from './wallet.mjs';

const TZ = 'Europe/Istanbul';
const DAY = (col) => `(${col} AT TIME ZONE '${TZ}')::date`;
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;

/** The family room: the leader's open room, or null. */
async function familyRoom(leader) {
  const r = await db.query(
    `SELECT r.id, r.title, (SELECT count(*) FROM room_presence p WHERE p.room = 'oda-' || r.id::text)::int AS listeners
       FROM rooms r WHERE r.owner = $1 AND r.closed_at IS NULL LIMIT 1`,
    [leader],
  );
  return r.rows[0] ? { id: r.rows[0].id, title: r.rows[0].title, listeners: r.rows[0].listeners } : null;
}

/**
 * Each member's progress in each task by Turkey day since the week began: { [user]: { [day]: { [task]: n } } }.
 * Worked out from the real records, so nothing a phone says can raise it.
 */
async function weekProgress(familyId, members, room) {
  const ids = members.map((m) => m.id);
  const out = {};
  const add = (rows, task) => {
    for (const x of rows) {
      const day = x.d instanceof Date ? x.d.toISOString().slice(0, 10) : String(x.d);
      ((out[x.u] ??= {})[day] ??= {})[task] = ((out[x.u][day] ?? {})[task] ?? 0) + Number(x.n);
    }
  };
  const q = (sql, p) => db.query(sql, p).then((r) => r.rows);
  add(await q(`SELECT author AS u, ${DAY('created_at')} AS d, count(*) AS n FROM family_messages WHERE family_id = $1 AND created_at >= ${WEEK} GROUP BY 1, 2`, [familyId]), 'k-chat');
  // The check-in is one a day whichever family it was in (someone who moved today keeps theirs).
  add(await q(`SELECT user_id AS u, day AS d, 1 AS n FROM family_checkins WHERE user_id = ANY($1::uuid[]) AND day >= ${DAY(WEEK)}`, [ids]), 'k-checkin');
  // Gifts by members since the week began, with whom they went to and where.
  const gifts = await q(
    `SELECT g.sender AS u, ${DAY('g.created_at')} AS d, g.total, g.gift_id, g.room, g.place, r.joined_at AS to_joined
       FROM gift_events g LEFT JOIN family_members r ON r.user_id = g.recipient AND r.family_id = $1
      WHERE g.sender = ANY($2::uuid[]) AND g.created_at >= ${WEEK} AND g.recipient <> g.sender`,
    [familyId, ids],
  );
  const roomNames = room ? [room.id, `oda-${room.id}`] : [];
  const weekAgo = Date.now() - 7 * 86_400_000;
  add(gifts.filter((g) => g.to_joined && new Date(g.to_joined).getTime() > weekAgo).map((g) => ({ u: g.u, d: g.d, n: 1 })), 'k-newbie');
  add(gifts.filter((g) => g.room && roomNames.includes(g.room)).map((g) => ({ u: g.u, d: g.d, n: g.total })), 'k-roomgift');
  add(gifts.filter((g) => g.to_joined && CP_GIFT_IDS.includes(g.gift_id)).map((g) => ({ u: g.u, d: g.d, n: g.total })), 'k-cp');
  add(gifts.filter((g) => g.to_joined && g.place === 'family').map((g) => ({ u: g.u, d: g.d, n: g.total })), 'k-chatgift');
  if (room) {
    const name = `oda-${room.id}`;
    add(await q(`SELECT user_id AS u, ${DAY('left_at')} AS d, sum(seconds) / 60 AS n FROM presence_log WHERE room = $1 AND user_id = ANY($2::uuid[]) AND left_at >= ${WEEK} GROUP BY 1, 2`, [name, ids]), 'k-room');
    // Who is in it now counts too (from when they came in today).
    add(
      await q(
        `SELECT identity::uuid AS u, ${TODAY} AS d, floor(extract(epoch FROM now() - greatest(joined_at, date_trunc('day', now() AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}')) / 60) AS n
           FROM room_presence WHERE room = $1 AND identity = ANY($2::text[])`,
        [name, ids],
      ),
      'k-room',
    );
  }
  return out;
}

/** Points of one person's day of progress. */
const dayPoints = (day) => FAMILY_TASKS.reduce((s, t) => s + taskPoints(t, day?.[t.id] ?? 0), 0);

async function overviewOf(uid) {
  const mine = await myMembership(uid);
  if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
  const id = Number(mine.family_id);
  const family = await familyView(id);
  const members = await membersOf(id);
  const room = await familyRoom(family.leader.id);
  const progress = await weekProgress(id, members, room);
  const today = (await db.query(`SELECT ${TODAY} AS d`)).rows[0].d;
  const todayKey = today instanceof Date ? today.toISOString().slice(0, 10) : String(today);
  const weekPoints = (u) => Object.values(progress[u] ?? {}).reduce((s, day) => s + dayPoints(day), 0);

  const myDay = progress[uid]?.[todayKey] ?? {};
  const tasks = FAMILY_TASKS.map((t) => {
    const n = myDay[t.id] ?? 0;
    const doneBy = members.filter((m) => taskPoints(t, progress[m.id]?.[todayKey]?.[t.id] ?? 0) > 0).length;
    return { id: t.id, progress: n, goal: t.goal, per: t.per, kind: t.kind, done: taskPoints(t, n) > 0, points: taskPoints(t, n), doneBy };
  });
  const contribution = (m) => m.weekly + weekPoints(m.id);
  const me = members.find((m) => m.id === uid);
  const myWeek = { gifts: me?.weekly ?? 0, points: weekPoints(uid) };

  const week = (await db.query(`SELECT ${DAY(WEEK)} AS w`)).rows[0].w;
  const weekKey = week instanceof Date ? week.toISOString().slice(0, 10) : String(week);
  const claimed = new Set((await db.query('SELECT chest FROM family_chest_claims WHERE user_id = $1 AND week = $2', [uid, weekKey])).rows.map((x) => x.chest));
  const chests = FAMILY_CHESTS.map((c) => ({ id: c.id, need: c.need, coins: c.coins, reached: family.weekly >= c.need, claimed: claimed.has(c.id) }));

  // The week's rank among open families, by their week (the same as GET /api/families).
  const all = await db.query('SELECT id FROM families WHERE closed_at IS NULL');
  const stats = await statsOf(all.rows.map((x) => Number(x.id)));
  const rank = 1 + Object.values(stats).filter((s) => s.weekly > family.weekly).length;

  const ids = members.map((m) => m.id);
  const pairs = await db.query(
    `SELECT b.a, b.b, b.kind, (b.gift_coins / 100 + b.talk_points)::int AS score FROM bonds b
      WHERE b.status = 'active' AND b.a = ANY($1::uuid[]) AND b.b = ANY($1::uuid[]) ORDER BY score DESC LIMIT 10`,
    [ids],
  );
  const nameOf = Object.fromEntries(members.map((m) => [m.id, { id: m.id, name: m.name, avatarUrl: m.avatarUrl }]));
  const checkedIn = (await db.query(`SELECT 1 FROM family_checkins WHERE user_id = $1 AND day = ${TODAY}`, [uid])).rowCount > 0;
  // Birlikte oynuyor: the other members online now (a session seen in the last 5 minutes) or in an open room.
  const seen = await db.query(
    `SELECT fm.user_id AS id, u.name, u.avatar_url, rm.id AS room_id, rm.title AS room_title,
            (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = fm.user_id) AS seen
       FROM family_members fm JOIN users u ON u.id = fm.user_id
       LEFT JOIN LATERAL (SELECT r.id, r.title FROM room_presence p JOIN rooms r ON p.room = 'oda-' || r.id::text AND r.closed_at IS NULL
                           WHERE p.identity = fm.user_id::text ORDER BY p.joined_at DESC LIMIT 1) rm ON true
      WHERE fm.family_id = $1 AND fm.user_id <> $2`,
    [id, uid],
  );
  const fresh = Date.now() - 5 * 60_000;
  const online = seen.rows
    .filter((x) => x.room_id || (x.seen && new Date(x.seen).getTime() > fresh))
    .sort((a, b) => Number(!!b.room_id) - Number(!!a.room_id))
    .slice(0, 20)
    .map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatar_url ?? null, room: x.room_id ? { id: x.room_id, title: x.room_title } : null }));

  return {
    tasks,
    me: myWeek,
    chests,
    week: { power: family.weekly, start: weekKey },
    bonus: { rate: FAMILY_RATES[family.level - 1], pool: Math.round(family.weekly * FAMILY_RATES[family.level - 1]) },
    rank,
    room,
    highlights: [...members]
      .sort((a, b) => contribution(b) - contribution(a))
      .slice(0, 3)
      .filter((m) => contribution(m) > 0)
      .map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl, contribution: contribution(m) })),
    active: members.filter((m) => contribution(m) > 0).length,
    pairs: pairs.rows.map((x) => ({ a: nameOf[x.a], b: nameOf[x.b], kind: x.kind, score: x.score })),
    checkedIn,
    online,
  };
}

export const familyMoreRoutes = {
  async 'GET /api/family/overview'(req) {
    const me = await auth(req);
    return overviewOf(me.id);
  },

  /** Aile yoklaması: once a day (Turkey's day), for the daily task. */
  async 'POST /api/family/checkin'(req) {
    const me = await auth(req);
    const mine = await myMembership(me.id);
    if (!mine) throw new HttpError(403, 'Bir ailede değilsin');
    await db.query(`INSERT INTO family_checkins (family_id, user_id, day) VALUES ($1, $2, ${TODAY}) ON CONFLICT (user_id, day) DO NOTHING`, [mine.family_id, me.id]);
    return { checkedIn: true };
  },

  /** Opens a weekly milestone chest: reward coins, once per person and week. */
  async 'POST /api/family/chest'(req) {
    const me = await auth(req);
    const b = await readJson(req);
    const chest = FAMILY_CHESTS.find((c) => c.id === b.chest);
    if (!chest) throw new HttpError(400, 'Geçersiz sandık');
    limit(`family-chest:${me.id}`, 20);
    const o = await overviewOf(me.id);
    if (o.week.power < chest.need) throw new HttpError(409, `Bu sandık ailenin haftası ${chest.need.toLocaleString('tr-TR')} olunca açılır`);
    if (o.me.gifts + o.me.points < CHEST_MIN_CONTRIBUTION) throw new HttpError(409, 'Sandığı açmak için bu hafta ailene katkı vermelisin (görev ya da hediye)');
    const mine = await myMembership(me.id);
    const out = await once(me.id, 'coin', b.ref, async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [me.id]);
      await claimRef(c, me.id, 'coin', b.ref);
      const r = await c.query(
        'INSERT INTO family_chest_claims (user_id, week, chest, family_id, coins, ref) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, week, chest) DO NOTHING',
        [me.id, o.week.start, chest.id, mine.family_id, chest.coins, b.ref],
      );
      if (!r.rowCount) throw new HttpError(409, 'Bu sandığı bu hafta zaten açtın');
      await creditCoins(c, me.id, [{ channel: 'odul', amount: chest.coins }], `Aile sandığı: ${chest.name}`, b.ref, null, { detail: { family: Number(mine.family_id), chest: chest.id } });
    });
    if (out.replay && !(await db.query('SELECT 1 FROM family_chest_claims WHERE user_id = $1 AND ref = $2', [me.id, b.ref])).rowCount) throw new HttpError(409, 'Geçersiz istek kimliği');
    return { ...out, coins: chest.coins };
  },
};
