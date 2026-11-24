// Yayıncı haftalık bonusu (owners, 24 Nov 2026). Every Monday 00:00 Türkiye time the week that ended is closed once:
// each streamer of an agency gets, in diamonds, the bonus of the highest tier their week's earnings reached
// (host-bonus-rules.mjs, Canlı ayarlar › host_weekly_bonus), and a notice from SimilarClub Sistem.
//
// - Earnings: every diamond someone else gave them in the week (gifts, paid messages and calls, albums; all go through
//   wallet.mjs giftDiamonds with a counterparty), less what a store refund took back ("İade: …"), as Yankı counts them.
//   The bonus itself goes in with no counterparty, so it never counts as next week's earnings.
// - Who: when the week ended, a streamer with an approved contract with an approved agency, or a yönetim yayıncısı
//   (streamer-rule.mjs: a woman in no agency, past her days to pick one after signing up, or dropped from one: inactive
//   too long, the agency closed; a streamer can't leave an agency of her own accord, only transfer), "diğer ajanslı
//   yayıncılardan farkı yok" (owners). A streamer still in her first days with no agency gets none.
// - No agency commission: the bonus is not an income event (agency-lib.mjs counts those), only a ledger row.
// - Off (the setting's `on`): the week is written skipped; staff may pay it later from the panel.
// - Staff may take a bonus back: what of it may still leave the account (not locked) returns, the rest stays.
import { HOST_BONUS_DEFAULT, addDays, nextTierOf, tierOf, weekBounds, weekStartOf } from './host-bonus-rules.mjs';
import { HttpError, auth, clientIp, db, env, limit, readJson, tx, move } from './core.mjs';
import { live } from './live-settings.mjs';
import { panelDetail } from './panel.mjs';
import { bonusNotice, systemNotice } from './system-notices.mjs';
import { heldWomanAtSql } from './streamer-rule.mjs';
import { diamondState } from './wallet.mjs';

const fmt = (n) => Number(n).toLocaleString('tr-TR');
const REASON = 'Haftalık yayıncı bonusu';
const BACK_REASON = 'Haftalık yayıncı bonusu geri alındı';
const CHANNEL = 'yayinci_bonus';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "17–23 Kasım 2026" (or "29 Aralık 2025 – 4 Ocak 2026"): the week starting on Monday `week`. */
export function weekText(week) {
  const end = addDays(week, 6);
  const d = (s, o) => new Date(`${s}T12:00:00Z`).toLocaleDateString('tr-TR', { timeZone: 'UTC', ...o });
  if (week.slice(0, 4) !== end.slice(0, 4)) return `${d(week, { day: 'numeric', month: 'long', year: 'numeric' })} – ${d(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (week.slice(5, 7) !== end.slice(5, 7)) return `${d(week, { day: 'numeric', month: 'long' })} – ${d(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return `${Number(week.slice(8))}–${d(end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** The setting in effect, or the default when it is missing or malformed. */
const setting = () => {
  const s = live().hostBonus;
  return s && Array.isArray(s.tiers) && s.tiers.length ? s : HOST_BONUS_DEFAULT;
};

/**
 * The diamonds earned in [from, to), by account: id → diamonds. `ids`: only these (null: everyone who earned at least
 * `least`).
 */
export async function earnedOf(c, ids, from, to, least = 1) {
  if (ids && !ids.length) return new Map();
  const r = await c.query(
    `SELECT user_id, sum(amount) AS n FROM ledger
      WHERE ($1::uuid[] IS NULL OR user_id = ANY($1::uuid[])) AND currency = 'diamond' AND counterparty IS NOT NULL AND counterparty <> user_id
        AND (amount > 0 OR reason ~ '^İade:') AND created_at >= $2 AND created_at < $3
      GROUP BY user_id HAVING sum(amount) >= $4`,
    [ids, from, to, least],
  );
  return new Map(r.rows.map((x) => [x.user_id, Math.max(0, Number(x.n))]));
}

/**
 * Who of `ids` counts at instant `at`: id → { kind: 'agency', agencyId } (an approved contract with an approved
 * agency) or { kind: 'management', agencyId: null } (the yönetim yayıncısı). The others are absent.
 */
export async function eligibleAt(c, ids, at) {
  if (!ids.length) return new Map();
  const r = await c.query(
    `SELECT u.id,
            (SELECT s.agency_id FROM agency_streamers s JOIN agencies a ON a.id = s.agency_id
              WHERE s.streamer_id = u.id AND s.contract = 'approved' AND a.status = 'approved'
                AND s.joined_at < $2 AND (s.ended_at IS NULL OR s.ended_at >= $2)
              ORDER BY s.joined_at DESC LIMIT 1) AS agency_id,
            ${heldWomanAtSql('u.id', '$2::timestamptz')} AS held
       FROM users u WHERE u.id = ANY($1::uuid[]) AND u.deleted_at IS NULL`,
    [ids, at],
  );
  const out = new Map();
  for (const x of r.rows) {
    if (x.agency_id) out.set(x.id, { kind: 'agency', agencyId: x.agency_id });
    else if (x.held) out.set(x.id, { kind: 'management', agencyId: null });
  }
  return out;
}

/** Who reaches a tier in `week` and what they get: [{ userId, kind, agencyId, earned, tier }]. */
export async function earnersOf(c, week, tiers) {
  const { from, to } = weekBounds(week);
  const earned = await earnedOf(c, null, from, to, tiers[0].from);
  // A week still running: who counts now.
  const who = await eligibleAt(c, [...earned.keys()], new Date(Math.min(+to, Date.now())));
  const out = [];
  for (const [userId, n] of earned) {
    const e = who.get(userId);
    const tier = tierOf(n, tiers);
    if (e && tier) out.push({ userId, ...e, earned: n, tier });
  }
  return out.sort((a, b) => b.earned - a.earned);
}

/**
 * Pays the bonuses of `week` (a run row that is on). Each streamer in their own transaction: the row (one per person
 * and week) and the ledger row (its ref) go in together, so a second run, or a run after a crash, pays nobody twice.
 * The notices go after the commit. Returns the people paid now.
 */
async function payWeek(week, tiers, actor = null) {
  const list = await earnersOf(db, week, tiers);
  const paid = [];
  for (const e of list) {
    const ref = `hbonus:${week}:${e.userId}`;
    const row = await tx(async (c) => {
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [e.userId]);
      const r = await c.query(
        `INSERT INTO host_bonuses (user_id, week_start, kind, agency_id, earned, tier_from, bonus, ref) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, week_start) DO NOTHING RETURNING id`,
        [e.userId, week, e.kind, e.agencyId, e.earned, e.tier.from, e.tier.bonus, ref],
      );
      if (!r.rowCount) return null;
      await move(c, e.userId, 'diamond', e.tier.bonus, REASON, ref, null, { channel: CHANNEL, actor, detail: { week, earned: e.earned, tier: e.tier.from, hostBonus: Number(r.rows[0].id) } });
      return Number(r.rows[0].id);
    });
    if (row) paid.push({ ...e, id: row });
  }
  for (const e of paid) {
    await bonusNotice({
      target: e.userId,
      ref: `hbonus:${week}`,
      origin: 'Yayıncı haftalık bonusu',
      what: `${fmt(e.tier.bonus)} elmas`,
      detail: [`Hafta: ${weekText(week)}`, `Bu hafta kazandığın elmas: ${fmt(e.earned)}`, `Ulaştığın barem: ${fmt(e.tier.from)} elmas`],
      data: { week, earned: e.earned, tier: e.tier.from, bonus: e.tier.bonus },
      link: '/yayinci',
    });
  }
  await db.query(
    `UPDATE host_bonus_runs r SET done_at = now(), people = s.n, diamonds = s.d
       FROM (SELECT count(*)::int AS n, coalesce(sum(bonus), 0) AS d FROM host_bonuses WHERE week_start = $1) s
      WHERE r.week_start = $1`,
    [week],
  );
  return paid;
}

let running = null;

/**
 * Closes the week that ended before `now` (once): writes its run, then pays it if the bonus is on. A run that did
 * not finish (a crash, a deploy) is finished. Safe to call often; one at a time in this process.
 */
export function runHostBonus(now = Date.now()) {
  running ??= (async () => {
    try {
      const week = addDays(weekStartOf(now), -7);
      const s = setting();
      await db.query('INSERT INTO host_bonus_runs (week_start, is_on, tiers, done_at) VALUES ($1, $2, $3, CASE WHEN $2 THEN NULL ELSE now() END) ON CONFLICT (week_start) DO NOTHING', [
        week,
        !!s.on,
        JSON.stringify(s.tiers),
      ]);
      const open = (await db.query('SELECT week_start::text AS week, tiers, paid_by FROM host_bonus_runs WHERE done_at IS NULL AND is_on ORDER BY week_start')).rows;
      for (const r of open) await payWeek(r.week, r.tiers, r.paid_by);
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer = null;
const EVERY_MS = 10 * 60_000;
export function startHostBonus() {
  if (timer || env.HOST_BONUS_JOBS === '0') return;
  const run = () => void runHostBonus().catch((e) => console.error('host bonus failed', String(e?.message ?? e).slice(0, 200)));
  timer = setInterval(run, EVERY_MS);
  timer.unref();
  setTimeout(run, 60_000).unref();
}
export function stopHostBonus() {
  clearInterval(timer);
  timer = null;
}

// --- The app: my week ------------------------------------------------------------------------------------------
/**
 * Yayıncı Merkezi's bonus card: this week's earnings so far, the tier reached and the next one, and whether I count
 * (an agency's streamer or a yönetim yayıncısı). `last`: what last week paid me, if anything.
 */
export async function myBonus(c, userId) {
  const s = setting();
  const week = weekStartOf();
  const { from, to } = weekBounds(week);
  const who = (await eligibleAt(c, [userId], new Date())).get(userId) ?? null;
  const earned = (await earnedOf(c, [userId], from, to)).get(userId) ?? 0;
  const tier = tierOf(earned, s.tiers);
  const next = nextTierOf(earned, s.tiers);
  const last = (await c.query("SELECT week_start::text AS week, bonus, earned, reversed_at FROM host_bonuses WHERE user_id = $1 AND week_start = $2", [userId, addDays(week, -7)])).rows[0];
  return {
    on: !!s.on,
    week,
    // An agency's streamer or a yönetim yayıncısı now: the week's bonus is theirs if it stays so till Sunday's end.
    eligible: !!who,
    kind: who?.kind ?? null,
    earned,
    tier: tier && { from: tier.from, bonus: tier.bonus },
    next: next && { from: next.from, bonus: next.bonus, left: next.from - earned },
    tiers: s.tiers.map((t) => ({ from: t.from, bonus: t.bonus })),
    last: last ? { week: last.week, bonus: Number(last.bonus), earned: Number(last.earned), reversed: !!last.reversed_at } : null,
  };
}

// --- Staff ---------------------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const audit = (c, actor, action, target, detail, ip) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1,$2,$3,$4,$5)', [actor, action, target, JSON.stringify(detail), ip]);

const reasonOf = (v) => {
  const r = typeof v === 'string' ? v.trim() : '';
  if (r.length < 3 || r.length > 300) throw new HttpError(400, 'Gerekçe yaz (3–300 karakter)');
  return r;
};
const weekOf = (v) => {
  if (typeof v !== 'string' || !DAY.test(v) || weekStartOf(Date.parse(`${v}T12:00:00+03:00`)) !== v) throw new HttpError(400, 'Hafta bir Pazartesi tarihi olmalı (YYYY-AA-GG)');
  return v;
};

const rowView = (x) => ({
  id: Number(x.id),
  userId: x.user_id,
  name: x.name,
  kind: x.kind,
  agencyId: x.agency_id,
  agency: x.agency,
  earned: Number(x.earned),
  tierFrom: Number(x.tier_from),
  bonus: Number(x.bonus),
  createdAt: x.created_at,
  reversed: x.reversed_at ? { at: x.reversed_at, by: x.reversed_by_name ?? null, amount: Number(x.reversed_amount), reason: x.reverse_reason } : null,
});

export const hostBonusRoutes = {
  /** My week's bonus (Yayıncı Merkezi). */
  async 'GET /api/wallet/host-bonus'(req) {
    const u = await auth(req);
    return myBonus(db, u.id);
  },

  /**
   * The weeks and one week's bonuses. `week`: a Monday; default the last closed one. The week still running shows
   * who would get what if it ended now (`preview`), nothing paid.
   */
  async 'GET /api/admin/host-bonus'(req, url) {
    await admin(req);
    const current = weekStartOf();
    const week = url.searchParams.get('week') ? weekOf(url.searchParams.get('week')) : addDays(current, -7);
    const s = setting();
    const weeks = (
      await db.query(
        `SELECT r.week_start::text AS week, r.ran_at, r.done_at, r.is_on, r.people, r.diamonds,
                (SELECT count(*)::int FROM host_bonuses b WHERE b.week_start = r.week_start AND b.reversed_at IS NOT NULL) AS reversed,
                (SELECT coalesce(sum(b.reversed_amount), 0) FROM host_bonuses b WHERE b.week_start = r.week_start) AS reversed_diamonds
           FROM host_bonus_runs r ORDER BY r.week_start DESC LIMIT 26`,
      )
    ).rows.map((r) => ({
      week: r.week,
      label: weekText(r.week),
      ranAt: r.ran_at,
      doneAt: r.done_at,
      on: r.is_on,
      people: r.people,
      diamonds: Number(r.diamonds),
      reversed: r.reversed,
      reversedDiamonds: Number(r.reversed_diamonds),
    }));
    const base = { on: !!s.on, tiers: s.tiers, current, currentLabel: weekText(current), week, label: weekText(week), weeks };
    if (week >= current) {
      const list = await earnersOf(db, current, s.tiers);
      const names = new Map((await db.query('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [list.map((e) => e.userId)])).rows.map((x) => [x.id, x.name]));
      const agencies = new Map((await db.query('SELECT id, name FROM agencies WHERE id = ANY($1::uuid[])', [list.map((e) => e.agencyId).filter(Boolean)])).rows.map((x) => [x.id, x.name]));
      return {
        ...base,
        preview: true,
        rows: list.map((e) => ({ userId: e.userId, name: names.get(e.userId) ?? '', kind: e.kind, agencyId: e.agencyId, agency: agencies.get(e.agencyId) ?? '', earned: e.earned, tierFrom: e.tier.from, bonus: e.tier.bonus })),
        total: list.reduce((n, e) => n + e.tier.bonus, 0),
      };
    }
    const rows = (
      await db.query(
        `SELECT b.*, u.name, a.name AS agency, r.name AS reversed_by_name FROM host_bonuses b
           JOIN users u ON u.id = b.user_id LEFT JOIN agencies a ON a.id = b.agency_id LEFT JOIN users r ON r.id = b.reversed_by
          WHERE b.week_start = $1 ORDER BY b.bonus DESC, b.earned DESC, b.id LIMIT 5000`,
        [week],
      )
    ).rows.map(rowView);
    const run = weeks.find((w) => w.week === week) ?? (await db.query('SELECT week_start::text AS week, is_on, done_at FROM host_bonus_runs WHERE week_start = $1', [week])).rows[0] ?? null;
    return { ...base, preview: false, run: run && { on: run.on ?? run.is_on, doneAt: run.doneAt ?? run.done_at }, rows, total: rows.reduce((n, r) => n + r.bonus - (r.reversed?.amount ?? 0), 0) };
  },

  /**
   * Closes the last week now if it isn't (the timer does it every 10 minutes). `at`: the clock to close by, only on a
   * test server with HOST_BONUS_TEST_CLOCK=1 (tests close the week they just made).
   */
  async 'POST /api/admin/host-bonus/run'(req) {
    const a = await admin(req);
    limit(`host-bonus-admin:${a.id}`, 20, 'Çok fazla deneme, biraz bekle');
    const b = await readJson(req);
    const at = env.HOST_BONUS_TEST_CLOCK === '1' && typeof b.at === 'string' && !Number.isNaN(Date.parse(b.at)) ? Date.parse(b.at) : Date.now();
    await runHostBonus(at);
    return { ok: true, week: addDays(weekStartOf(at), -7) };
  },

  /**
   * Pays a week that was skipped (the bonus was off when it closed), at the tiers in effect now. Only a week that
   * ended; the bonuses already paid for it (none, normally) stay as they are.
   */
  async 'POST /api/admin/host-bonus/pay'(req) {
    const a = await admin(req);
    limit(`host-bonus-admin:${a.id}`, 20, 'Çok fazla deneme, biraz bekle');
    const b = await readJson(req);
    const week = weekOf(b.week);
    const reason = reasonOf(b.reason);
    const s = setting();
    await tx(async (c) => {
      const run = (await c.query('SELECT * FROM host_bonus_runs WHERE week_start = $1 FOR UPDATE', [week])).rows[0];
      if (!run) throw new HttpError(404, 'Bu hafta henüz kapanmadı; bonus Pazartesi 00:00’da kendiliğinden ödenir');
      if (run.is_on) throw new HttpError(409, 'Bu haftanın bonusu zaten ödendi');
      await c.query('UPDATE host_bonus_runs SET is_on = true, done_at = NULL, paid_by = $2, tiers = $3 WHERE week_start = $1', [week, a.id, JSON.stringify(s.tiers)]);
      await audit(c, a.id, 'host_bonus.pay', null, { week, reason, tiers: s.tiers, ...panelDetail(a) }, clientIp(req));
    });
    const paid = await payWeek(week, s.tiers, a.id);
    return { ok: true, week, people: paid.length, diamonds: paid.reduce((n, e) => n + e.tier.bonus, 0) };
  },

  /**
   * Takes one bonus back: what of it may still leave the account (diamonds not locked); the rest stays with them.
   * The streamer gets a notice.
   */
  async 'POST /api/admin/host-bonus/reverse'(req) {
    const a = await admin(req);
    limit(`host-bonus-admin:${a.id}`, 20, 'Çok fazla deneme, biraz bekle');
    const b = await readJson(req);
    const id = Number.isSafeInteger(b.id) && b.id > 0 ? b.id : null;
    if (!id) throw new HttpError(400, 'Geçersiz bonus');
    const reason = reasonOf(b.reason);
    const out = await tx(async (c) => {
      const pre = (await c.query('SELECT user_id FROM host_bonuses WHERE id = $1', [id])).rows[0];
      if (!pre) throw new HttpError(404, 'Bonus bulunamadı');
      await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [pre.user_id]);
      const row = (await c.query('SELECT * FROM host_bonuses WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (row.reversed_at) throw new HttpError(409, 'Bu bonus zaten geri alındı');
      const state = await diamondState(c, row.user_id);
      const take = Math.min(Number(row.bonus), state.withdrawable);
      if (take > 0) await move(c, row.user_id, 'diamond', -take, BACK_REASON, `hbonus:${id}:back`, null, { channel: CHANNEL, actor: a.id, detail: { week: row.week_start, hostBonus: id, reason } });
      await c.query('UPDATE host_bonuses SET reversed_at = now(), reversed_by = $2, reversed_amount = $3, reverse_reason = $4 WHERE id = $1', [id, a.id, take, reason]);
      const week = (await c.query('SELECT $1::date::text AS w', [row.week_start])).rows[0].w;
      await audit(c, a.id, 'host_bonus.reverse', row.user_id, { id, week, bonus: Number(row.bonus), taken: take, left: Number(row.bonus) - take, reason, ...panelDetail(a) }, clientIp(req));
      return { userId: row.user_id, week, bonus: Number(row.bonus), taken: take };
    });
    await systemNotice({
      target: out.userId,
      category: 'bonus',
      ref: `hbonus:${id}:back`,
      title: 'Haftalık bonus geri alındı',
      body: [`${weekText(out.week)} haftasının yayıncı bonusu (${fmt(out.bonus)} elmas) geri alındı.`, out.taken ? `Hesabından düşülen: ${fmt(out.taken)} elmas.` : 'Hesabından elmas düşülmedi.', 'Sorun olduğunu düşünüyorsan destekle iletişime geç.'].join('\n'),
      data: { week: out.week, bonus: out.bonus, taken: out.taken, status: 'reversed' },
      link: '/yayinci',
    });
    return { ok: true, id, ...out };
  },
};
