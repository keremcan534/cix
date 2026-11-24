// Ajans seviyeleri (owners, 24 Nov 2026; agency-level-rules.mjs). During the week every income's commission is
// written at level 0's rate (agency-lib.mjs calcEvent, level_week). When the week closes (Monday 00:00 Türkiye) each
// agency's week is settled once: its own streamers' diamonds and active streamers give the level, and the rest of
// that level's rate goes in as one 'level' ledger row per period, with the assistant's and the BD's part of it. A
// new agency's incomes already have its fixed level, a late income of a closed week its settled rate.
import { addDays, weekBounds, weekStartOf } from './host-bonus-rules.mjs';
import { HttpError, auth, db, env, readJson, tx } from './core.mjs';
import { audit, accessOf, diamondsPerUsd, e4, fmt4, needPlatform, notice, settingsAt, settleAssistant, weekNumbers } from './agency-lib.mjs';
import { isNewAgency, levelFor, nextLevelOf } from './agency-level-rules.mjs';
import { weekText } from './host-bonus.mjs';

const pct = (r) => `%${(Math.round(Number(r) * 1e4) / 100).toLocaleString('tr-TR')}`;
const fmt = (n) => Number(n).toLocaleString('tr-TR');

/** Settles agency `a`'s week `week` in transaction `c`, once. Returns the week's row, or null if it was done. */
async function settleAgency(c, a, week, s) {
  const lv = s.weekly_levels;
  const { from, to } = weekBounds(week);
  const nums = await weekNumbers(c, a.id, from, to, lv.active_usd * diamondsPerUsd());
  const isNew = isNewAgency(a.approved_at ?? a.created_at, new Date(+to - 1), lv);
  const { level, reason } = levelFor({ ...nums, isNew }, lv);
  const claim = await c.query(
    `INSERT INTO agency_level_weeks (agency_id, week_start, level_key, level_name, shown, rate, base, active, reason) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING RETURNING *`,
    [a.id, week, level.key, level.name, level.shown, fmt4(e4(level.rate)), nums.base, nums.active, reason],
  );
  if (!claim.rowCount) return null;
  const rate = e4(level.rate);
  // The incomes waiting on this week, by period and by the assistant who took a part of each: what they got now
  // (base × the rate they were written at, before any transition share) against the level's rate.
  const groups = (
    await c.query(
      `SELECT k.period, al.assistant_id, al.user_id, al.pct, sum(k.base_diamonds) AS base,
              sum(k.base_diamonds * round((k.agency_rate + k.transition_rate) * 10000)) AS paid
         FROM agency_commissions k
         LEFT JOIN agency_assistant_ledger al ON al.commission_id = k.id AND al.reverses IS NULL
        WHERE k.agency_id = $1 AND k.level_week = $2
        GROUP BY k.period, al.assistant_id, al.user_id, al.pct`,
      [a.id, week],
    )
  ).rows;
  let total = 0;
  const byPeriod = new Map();
  const note = `Haftalık seviye: ${level.shown ? `${level.name} ` : ''}(${pct(level.rate)}) · ${weekText(week)}`.slice(0, 200);
  for (const g of groups) {
    const amount = Number(g.base) * rate - Number(g.paid);
    if (amount === 0) continue;
    total += amount;
    byPeriod.set(g.period, (byPeriod.get(g.period) ?? 0) + amount);
    const ledger = await c.query("INSERT INTO agency_ledger (agency_id, kind, amount, rate, period, note, ref) VALUES ($1, 'level', $2, $3, $4, $5, $6) RETURNING id", [
      a.id,
      fmt4(amount),
      fmt4(rate),
      g.period,
      note,
      `level:${week}:${g.period}:${g.assistant_id ?? 0}`,
    ]);
    // The assistant's part, as with each income (agency-lib.mjs bookAssistantShare): the share in force that week.
    const share = g.assistant_id ? Math.trunc((amount * Number(g.pct)) / 100) : 0;
    if (share !== 0) {
      const own = await c.query("INSERT INTO agency_ledger (agency_id, kind, amount, rate, period, note, ref) VALUES ($1, 'assistant', $2, $3, $4, $5, $6) RETURNING id", [
        a.id,
        fmt4(-share),
        fmt4(Math.round((rate * Number(g.pct)) / 100)),
        g.period,
        `Asistan payı %${g.pct} · haftalık seviye`.slice(0, 200),
        `level:${week}:${g.period}:${g.assistant_id}`,
      ]);
      const wallet = await settleAssistant(c, g.user_id, share, `asistan:lv${week}:${a.id}:${g.period}:${g.assistant_id}`, { agency: a.id, week, levelRow: Number(ledger.rows[0].id) });
      await c.query(
        `INSERT INTO agency_assistant_ledger (assistant_id, user_id, agency_id, commission_id, agency_ledger_id, streamer_id, basis, pct, amount, wallet, period)
         VALUES ($1, $2, $3, NULL, $4, NULL, $5, $6, $7, $8, $9)`,
        [g.assistant_id, g.user_id, a.id, own.rows[0].id, fmt4(amount), g.pct, fmt4(share), wallet, g.period],
      );
    }
  }
  // The BD's part: the BD of each income gets its rate on the pool's change too ('pool' and 'base_plus_pool').
  if (s.bd_policy.rate > 0 && s.bd_policy.basis !== 'base') {
    const bds = (
      await c.query(
        `SELECT b.bd_id, b.agency_id, k.period, sum(k.base_diamonds) AS base, sum(k.base_diamonds * round((k.agency_rate + k.transition_rate) * 10000)) AS paid
           FROM agency_commissions k JOIN bd_ledger b ON b.commission_id = k.id
          WHERE k.agency_id = $1 AND k.level_week = $2 GROUP BY b.bd_id, b.agency_id, k.period`,
        [a.id, week],
      )
    ).rows;
    for (const b of bds) {
      const basis = Number(b.base) * rate - Number(b.paid);
      const amount = Math.round((basis * e4(s.bd_policy.rate)) / 1e4);
      if (amount === 0) continue;
      await c.query('INSERT INTO bd_ledger (bd_id, agency_id, commission_id, basis, rate, amount, period, ref) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING', [
        b.bd_id,
        b.agency_id,
        fmt4(basis),
        fmt4(e4(s.bd_policy.rate)),
        fmt4(amount),
        b.period,
        `level:${week}:${a.id}:${b.bd_id}:${b.period}`,
      ]);
    }
  }
  await c.query('UPDATE agency_level_weeks SET adjustment = $3 WHERE agency_id = $1 AND week_start = $2', [a.id, week, fmt4(total)]);
  await c.query('UPDATE agencies SET level_key = $2, level_week = $3 WHERE id = $1 AND (level_week IS NULL OR level_week <= $3)', [a.id, level.key, week]);
  const title = level.shown ? `Bu haftanın seviyen: ${level.name} (${pct(level.rate)})` : `Haftanın komisyonu ${pct(level.rate)} ile hesaplandı`;
  const why =
    reason === 'new'
      ? 'Yeni ajans döneminde komisyonun sabit.'
      : reason === 'active'
        ? `Elmas eşiğine ulaştın ama ${lv.min_active} aktif yayıncı şartı tutmadı (${nums.active} aktif yayıncı).`
        : `Yayıncılarının bu haftaki elması: ${fmt(nums.base)}; aktif yayıncı: ${nums.active}.`;
  await notice(c, a.id, 'tier', title, `${weekText(week)}. ${why}`);
  await audit(c, null, 'agency.week_level', 'agency', a.id, { after: { week, level: level.key, rate: level.rate, base: nums.base, active: nums.active, reason, adjustment: total / 1e4 } });
  return { ...claim.rows[0], adjustment: total / 1e4 };
}

let running = null;
/**
 * Closes the week before the one `now` falls in (once) and any week left unfinished. Each agency in its own
 * transaction; agency_level_weeks keeps any from being settled twice. Safe to call often.
 */
export function settleLevels(now = Date.now()) {
  running ??= (async () => {
    try {
      const week = addDays(weekStartOf(now), -7);
      await db.query('INSERT INTO agency_level_runs (week_start) VALUES ($1) ON CONFLICT DO NOTHING', [week]);
      const open = (await db.query('SELECT week_start::text AS week FROM agency_level_runs WHERE done_at IS NULL ORDER BY week_start')).rows;
      const out = { weeks: [], agencies: 0 };
      for (const { week: w } of open) {
        const { from, to } = weekBounds(w);
        const { values: s } = await settingsAt(db, to);
        const ids = (
          await db.query(
            `SELECT DISTINCT agency_id FROM agency_commissions WHERE occurred_at >= $1 AND occurred_at < $2
             UNION SELECT DISTINCT agency_id FROM agency_commissions WHERE level_week = $3`,
            [from, to, w],
          )
        ).rows.map((x) => x.agency_id);
        let n = 0;
        for (const id of ids) {
          const done = await tx(async (c) => {
            const a = (await c.query('SELECT * FROM agencies WHERE id = $1 FOR UPDATE', [id])).rows[0];
            return a ? settleAgency(c, a, w, s) : null;
          });
          if (done) n++;
        }
        await db.query('UPDATE agency_level_runs SET done_at = now(), agencies = agencies + $2 WHERE week_start = $1', [w, n]);
        out.weeks.push(w);
        out.agencies += n;
      }
      return out;
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Where agency `a` stands this week (the app's Ajans ofisi, the panel): its streamers' diamonds and active
 * streamers so far, the level that would be settled now, the next one, the new-agency days; and last week's
 * settled level. A level the owners keep out of the app (`shown` false) goes without its name.
 */
export async function levelView(c, a, s) {
  const lv = s.weekly_levels;
  const week = weekStartOf();
  const { from, to } = weekBounds(week);
  const nums = await weekNumbers(c, a.id, from, to, lv.active_usd * diamondsPerUsd());
  const approved = a.approved_at ?? a.created_at;
  const isNew = isNewAgency(approved, new Date(), lv);
  const { level, reason, reached } = levelFor({ ...nums, isNew }, lv);
  const next = isNew ? null : nextLevelOf(nums.base, lv);
  const name = (l) => (l?.shown ? l.name : null);
  const last = (await c.query('SELECT *, week_start::text AS week FROM agency_level_weeks WHERE agency_id = $1 ORDER BY week_start DESC LIMIT 1', [a.id])).rows[0];
  return {
    week,
    weekLabel: weekText(week),
    base: nums.base,
    active: nums.active,
    minActive: lv.min_active,
    activeUsd: lv.active_usd,
    activeDiamonds: lv.active_usd * diamondsPerUsd(),
    level: { key: level.key, name: name(level), rate: level.rate, shown: level.shown },
    reason,
    // Reached a higher level's diamonds but too few active streamers.
    reached: reached ? { name: name(reached), rate: reached.rate } : null,
    next: next ? { name: name(next), rate: next.rate, from: next.from, left: next.left } : null,
    isNew,
    newUntil: isNew ? new Date(new Date(approved).getTime() + lv.new_weeks * 7 * 86_400_000).toISOString() : null,
    last: last
      ? { week: last.week, name: last.shown ? last.level_name : null, rate: Number(last.rate), base: Number(last.base), active: last.active, reason: last.reason }
      : null,
  };
}

/** The level's name for a card (agencies.level_key), when the app shows it. */
export const levelName = (s, key) => {
  const l = s.weekly_levels.levels.find((x) => x.key === key);
  return l?.shown ? l.name : null;
};

export const agencyLevelRoutes = {
  /**
   * Staff: every agency's week. `week` a Monday; the week still running gives what would be settled now (nothing
   * written). Default: the week running.
   */
  async 'GET /api/admin/agency/levels'(req, url) {
    const u = await auth(req);
    const acc = await accessOf(db, u);
    await needPlatform(db, acc, 'agencies.view', req.url);
    const { values: s } = await settingsAt(db);
    const current = weekStartOf();
    const q = url.searchParams.get('week');
    if (q !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(q) || weekStartOf(Date.parse(`${q}T12:00:00+03:00`)) !== q)) throw new HttpError(400, 'Hafta bir Pazartesi tarihi olmalı (YYYY-AA-GG)');
    // Default: the week running (what staff ask most: where each agency stands now).
    const week = q ?? current;
    const weeks = (await db.query('SELECT week_start::text AS week, done_at, agencies FROM agency_level_runs ORDER BY week_start DESC LIMIT 26')).rows.map((r) => ({ week: r.week, label: weekText(r.week), doneAt: r.done_at, agencies: r.agencies }));
    const base = { levels: s.weekly_levels, current, currentLabel: weekText(current), week, label: weekText(week), weeks };
    // A week not closed yet (the one running): what would be settled now.
    const closed = (await db.query('SELECT 1 FROM agency_level_runs WHERE week_start = $1 AND done_at IS NOT NULL', [week])).rowCount > 0;
    if (!closed && week >= current) {
      const all = (await db.query("SELECT * FROM agencies WHERE status IN ('approved', 'suspended') ORDER BY name")).rows;
      const rows = [];
      for (const a of all) {
        const v = await levelView(db, a, s);
        // For staff every level has its name; the next level and what it still needs, the level the diamonds reached
        // but the active streamers held back.
        const lv = s.weekly_levels;
        const next = v.isNew ? null : nextLevelOf(v.base, lv);
        const reached = v.reason === 'active' ? levelFor({ base: v.base, active: lv.min_active, isNew: false }, lv).level : null;
        rows.push({
          agencyId: a.id,
          name: a.name,
          code: a.code,
          levelKey: v.level.key,
          levelName: lv.levels.find((l) => l.key === v.level.key)?.name,
          shown: v.level.shown,
          rate: v.level.rate,
          base: v.base,
          active: v.active,
          minActive: lv.min_active,
          reason: v.reason,
          isNew: v.isNew,
          newUntil: v.newUntil,
          next: next ? { name: next.name, rate: next.rate, from: next.from, left: next.left } : null,
          reached: reached ? { name: reached.name, rate: reached.rate } : null,
          adjustment: null,
        });
      }
      return { ...base, preview: true, rows: rows.sort((x, y) => y.base - x.base) };
    }
    const rows = (
      await db.query('SELECT w.*, a.name, a.code FROM agency_level_weeks w JOIN agencies a ON a.id = w.agency_id WHERE w.week_start = $1 ORDER BY w.base DESC, a.name', [week])
    ).rows.map((r) => ({ agencyId: r.agency_id, name: r.name, code: r.code, levelKey: r.level_key, levelName: r.level_name, shown: r.shown, rate: Number(r.rate), base: Number(r.base), active: r.active, reason: r.reason, isNew: r.reason === 'new', adjustment: Number(r.adjustment) }));
    return { ...base, preview: false, rows };
  },

  /** Staff: closes the last week now if it isn't (the agency job does it). `at` only with AGENCY_LEVELS_TEST_CLOCK=1. */
  async 'POST /api/admin/agency/levels/run'(req) {
    const u = await auth(req);
    const acc = await accessOf(db, u);
    await needPlatform(db, acc, 'agencies.ledger', req.url);
    const b = await readJson(req);
    const at = env.AGENCY_LEVELS_TEST_CLOCK === '1' && typeof b.at === 'string' && !Number.isNaN(Date.parse(b.at)) ? Date.parse(b.at) : Date.now();
    return { ok: true, ...(await settleLevels(at)) };
  },
};
