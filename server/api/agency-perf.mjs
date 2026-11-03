// Performance engine: scores every agency over the evaluation window, ranks them, decides each sub-agency's
// commission tier and announces the new rate from the next period. docs/AJANS_HIYERARSI.md §Performans.
//
// An agency is measured by its own (direct) streamers only: a sub-agency's success never counts as its
// parent's. The organisation figure (own + subs) is kept beside it for the panels, never in the score.
// Scores are relative (each volume-like criterion against the best agency in the run), weighted by the
// centre's weights. A tier moves only after `promotion_min_periods` / `demotion_min_periods` evaluations in a
// row point the same way, at most `max_step` tiers at once, never during a centre hold, never on a spike.
import { audit, calcEvent, e4, nextCadenceStart, notice, rateAt, settingsAt, tierName, tierRate, topRate } from './agency-lib.mjs';

const addMonths = (t, n) => {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round2 = (x) => Math.round(x * 100) / 100;

/** Computes the commission of income still waiting (a failed or deferred calculation). */
export async function calcPending(c, max = 2000) {
  const r = await c.query("SELECT id FROM income_events WHERE calc_status = 'pending' ORDER BY id LIMIT $1", [max]);
  let n = 0;
  for (const row of r.rows) if (await calcEvent(c, row.id)) n++;
  return { checked: r.rowCount, computed: n };
}

/** Raw metrics of every open agency for the window [from, asOf). */
async function metrics(c, s, asOf, from) {
  const p = s.performance;
  const prevFrom = addMonths(from, -p.window_months);
  const lastMonth = addMonths(asOf, -1);
  const activeFrom = new Date(asOf.getTime() - p.active_days * 86400e3);
  const idleFrom = new Date(asOf.getTime() - s.suspension_policy.inactive_days * 86400e3);
  const r = await c.query(
    `SELECT a.id, a.parent_id, a.level, a.tier, a.status, a.tier_hold_until, a.ops_score, a.name, a.created_at,
       (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.agency_id = a.id AND k.occurred_at >= $2 AND k.occurred_at < $1) AS volume,
       (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.agency_id = a.id AND k.occurred_at >= $3 AND k.occurred_at < $2) AS prev_volume,
       (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.agency_id = a.id AND k.occurred_at >= $4 AND k.occurred_at < $1) AS last_month,
       (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE a.id = ANY(k.chain) AND k.occurred_at >= $2 AND k.occurred_at < $1) AS org_volume,
       (SELECT count(DISTINCT k.streamer_id) FROM agency_commissions k WHERE k.agency_id = a.id AND k.occurred_at >= $2 AND k.occurred_at < $1 AND k.base_diamonds > 0) AS earners,
       (SELECT count(*) FROM agency_streamers m JOIN users u ON u.id = m.streamer_id
         WHERE m.agency_id = a.id AND m.joined_at <= $1 AND (m.ended_at IS NULL OR m.ended_at > $1) AND m.contract = 'approved'
           AND ($6 = false OR u.phone IS NOT NULL)
           AND (EXISTS (SELECT 1 FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.occurred_at >= $5 AND e.occurred_at < $1 AND e.diamonds > 0)
             OR EXISTS (SELECT 1 FROM presence_log l WHERE l.user_id = m.streamer_id AND l.left_at >= $5 AND l.joined_at < $1 AND l.seconds > 0))) AS active,
       (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = a.id AND m.joined_at <= $1 AND (m.ended_at IS NULL OR m.ended_at > $1)) AS streamers,
       (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = a.id AND m.joined_at <= $2 AND (m.ended_at IS NULL OR m.ended_at > $2)) AS start_count,
       (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = a.id AND m.joined_at <= $2 AND (m.ended_at IS NULL OR m.ended_at > $1)) AS retained,
       (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = a.id AND m.joined_at >= $2 AND m.joined_at < $1 AND m.method <> 'transfer'
           AND EXISTS (SELECT 1 FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.occurred_at >= m.joined_at AND e.occurred_at < $1 AND e.diamonds > 0)) AS acquired,
       (SELECT coalesce(sum(v.points), 0) FROM agency_violations v WHERE v.agency_id = a.id AND v.created_at >= $2 AND v.created_at < $1) AS violation_points,
       (SELECT EXISTS (SELECT 1 FROM agency_commissions k WHERE k.agency_id = a.id AND k.occurred_at >= $7 AND k.occurred_at < $1)) AS recent_income
     FROM agencies a
    WHERE a.status IN ('approved', 'suspended') AND a.approved_at IS NOT NULL AND a.approved_at <= $1`,
    [asOf, from, prevFrom, lastMonth, activeFrom, p.require_verified, idleFrom],
  );
  return r.rows.map((x) => {
    const volume = Number(x.volume);
    const prev = Number(x.prev_volume);
    const earners = Number(x.earners);
    const startCount = Number(x.start_count);
    return {
      row: x,
      m: {
        volume,
        prev_volume: prev,
        last_month: Number(x.last_month),
        org_volume: Number(x.org_volume),
        earners,
        active: Number(x.active),
        streamers: Number(x.streamers),
        average: earners ? Math.round(volume / earners) : 0,
        growth: prev > 0 ? round2(clamp((volume - prev) / prev, -1, 1)) : volume > 0 ? 1 : 0,
        retention: startCount ? round2(Number(x.retained) / startCount) : null,
        acquisition: Number(x.acquired),
        operations: Number(x.ops_score),
        reliability: Math.max(0, 100 - Number(x.violation_points)),
        recent_income: x.recent_income,
      },
    };
  });
}

/** 0–100 per criterion: volume-like ones against the best agency in the run. */
function normalize(list) {
  const max = (k) => Math.max(0, ...list.map((x) => x.m[k]));
  const mx = { volume: max('volume'), active: max('active'), average: max('average'), acquisition: max('acquisition') };
  for (const x of list) {
    const rel = (k) => (mx[k] > 0 ? round2((Math.max(0, x.m[k]) / mx[k]) * 100) : 0);
    x.n = {
      volume: rel('volume'),
      active: rel('active'),
      average: rel('average'),
      acquisition: rel('acquisition'),
      growth: round2((x.m.growth + 1) * 50),
      // No streamers at the start of the window: neutral, neither reward nor penalty.
      retention: x.m.retention === null ? 50 : round2(x.m.retention * 100),
      operations: x.m.operations,
      reliability: x.m.reliability,
    };
  }
}

/** The highest tier the agency qualifies for (index), by score, active streamers and overtaking its parent. */
function qualifiedTier(s, x) {
  for (let i = s.tiers.length - 1; i > 0; i--) {
    const t = s.tiers[i];
    if (x.score < t.min_score) continue;
    if (x.m.active < Math.max(t.min_active, s.performance.min_active_streamers)) continue;
    if (t.overtake && !x.overtakes) continue;
    return i;
  }
  return 0;
}

/**
 * One evaluation. dryRun = scores only (a simulation; nothing changes, and it doesn't count towards the
 * periods in a row). Returns { runId, effectiveFrom, rows }.
 */
export async function runPerformance(c, { asOf = new Date(), effectiveFrom = null, dryRun = false, actor = null, cadenceKey = null, note = '' } = {}) {
  asOf = new Date(asOf);
  const { values: s } = await settingsAt(c);
  const p = s.performance;
  const from = addMonths(asOf, -p.window_months);
  const now = new Date();
  let eff = effectiveFrom ? new Date(effectiveFrom) : p.effective === 'immediate' ? now : nextCadenceStart(asOf, p.cadence);
  if (eff < now) eff = now; // never back-dated: earnings already made keep their rate
  const run = await c.query(
    'INSERT INTO agency_perf_runs (as_of, window_from, effective_from, settings, cadence_key, dry_run, run_by, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [asOf, from, eff, JSON.stringify({ performance: p, weights: s.weights, tiers: s.tiers, parent_min_rate: s.parent_min_rate, parent_zero: s.parent_zero }), cadenceKey, dryRun, actor, String(note).slice(0, 300)],
  );
  const runId = Number(run.rows[0].id);

  const list = await metrics(c, s, asOf, from);
  normalize(list);
  const wsum = Object.values(s.weights).reduce((a, b) => a + b, 0);
  for (const x of list) x.score = round2(Object.entries(s.weights).reduce((a, [k, w]) => a + w * x.n[k], 0) / wsum);
  list.sort((a, b) => b.score - a.score || b.m.volume - a.m.volume);
  list.forEach((x, i) => (x.rank = i + 1));
  const byId = new Map(list.map((x) => [x.row.id, x]));

  // The previous real evaluation of each agency: streaks and decline.
  const prev = await c.query(
    `SELECT DISTINCT ON (s.agency_id) s.* FROM agency_perf_scores s JOIN agency_perf_runs r ON r.id = s.run_id
      WHERE r.dry_run = false AND r.id < $1 ORDER BY s.agency_id, s.run_id DESC`,
    [runId],
  );
  const prevOf = new Map(prev.rows.map((x) => [x.agency_id, x]));
  const idx = (key) => Math.max(0, s.tiers.findIndex((t) => t.key === key));
  const out = [];

  for (const x of list) {
    const a = x.row;
    const parent = a.parent_id ? byId.get(a.parent_id) : null;
    x.parentScore = parent ? parent.score : null;
    x.overtakes = !!parent && x.score > parent.score;
  }
  for (const x of list) {
    const a = x.row;
    const pv = prevOf.get(a.id);
    const flags = [];
    let qualified = null;
    let current = null;
    let assigned = null;
    let change = 'same';
    let streak = 0;
    if (pv && x.score < Number(pv.score) - p.decline_drop) flags.push('decline');
    if (x.m.active < p.min_active_streamers) flags.push('low_active');
    if (x.m.reliability < s.suspension_policy.reliability_below || (!x.m.recent_income && x.m.active === 0)) flags.push('review');
    if (x.m.volume > 0 && p.window_months >= 2 && x.m.last_month > 0.6 * x.m.volume && x.m.prev_volume < 0.5 * x.m.volume) flags.push('spike');
    if (list.some((y) => y.row.parent_id === a.id && y.overtakes)) flags.push('overtaken');

    if (a.level > 1) {
      const ci = idx(a.tier);
      const qi = qualifiedTier(s, x);
      current = s.tiers[ci].key;
      qualified = s.tiers[qi].key;
      assigned = current;
      const dir = Math.sign(qi - ci);
      const pdir = pv && pv.qualified_tier && pv.current_tier ? Math.sign(idx(pv.qualified_tier) - idx(pv.current_tier)) : 0;
      streak = dir === 0 ? 0 : pdir === dir ? pv.streak + 1 : 1;
      const held = a.status === 'suspended' || (a.tier_hold_until && new Date(a.tier_hold_until) > asOf);
      if (dir !== 0 && held) change = 'held';
      else if (dir > 0 && flags.includes('spike')) change = 'waiting';
      else if (dir !== 0 && streak < (dir > 0 ? p.promotion_min_periods : p.demotion_min_periods)) change = 'waiting';
      else if (dir !== 0) {
        assigned = s.tiers[ci + dir * Math.min(p.max_step, Math.abs(qi - ci))].key;
        change = dir > 0 ? 'up' : 'down';
      }
    }
    await c.query(
      `INSERT INTO agency_perf_scores (run_id, agency_id, parent_id, metrics, normalized, score, rank, parent_score, overtakes, qualified_tier, current_tier, assigned_tier, streak, change, flags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [runId, a.id, a.parent_id, JSON.stringify(x.m), JSON.stringify(x.n), x.score, x.rank, x.parentScore, x.overtakes, qualified, current, assigned, streak, change, flags],
    );
    out.push({ agencyId: a.id, name: a.name, parentId: a.parent_id, score: x.score, rank: x.rank, overtakes: x.overtakes, qualified, current, assigned, change, streak, flags, metrics: x.m, normalized: x.n });

    if (dryRun) continue;
    if (x.overtakes && !(pv && pv.overtakes)) {
      await notice(c, a.id, 'overtake', 'Performansta üst ajansını geçtin', `Puanın ${x.score}, üst ajansının ${x.parentScore}. Kademen bir sonraki değerlendirmelerde yükselebilir.`);
      await notice(c, a.parent_id, 'overtake', `${a.name} performansta seni geçti`, 'Bu alt ajansın komisyon payı artabilir; senin bu alt ajanstan aldığın fark payı azalır. Kendi yayıncılarından aldığın komisyon değişmez.');
    }
    if (change === 'up' || change === 'down') await applyTier(c, a, assigned, eff, { source: 'engine', runId, actor, reason: `Performans değerlendirmesi #${runId}: puan ${x.score}, sıra ${x.rank}` });
  }
  if (!dryRun) await audit(c, actor, 'performance.run', 'run', runId, { after: { asOf, effectiveFrom: eff, agencies: out.length, changes: out.filter((x) => x.change === 'up' || x.change === 'down').length } });
  return { runId, effectiveFrom: eff, rows: out };
}

/**
 * Moves a sub-agency to a tier: a new rate row from `eff` (never in the past), the tier history, notices to
 * the agency and its parent. Past earnings keep the rate they were computed with.
 */
export async function applyTier(c, a, tierKey, eff, { source, runId = null, actor = null, reason = '', rate = null }) {
  const { values: s } = await settingsAt(c);
  const tr = await tierRate(c, a.parent_id, tierKey, s);
  const newRate = rate ?? tr.rate;
  const before = await rateAt(c, a.id, new Date());
  const r = await c.query(
    `INSERT INTO agency_rates (agency_id, rate, parent_floor, tier, source, effective_from, reason, run_id, set_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [a.id, newRate, tr.floor, tierKey, source === 'engine' ? 'tier' : source === 'approval' ? 'default' : source, eff, reason.slice(0, 300), runId, actor],
  );
  await c.query('UPDATE agencies SET tier = $2 WHERE id = $1', [a.id, tierKey]);
  await c.query(
    `INSERT INTO agency_tier_history (agency_id, from_tier, to_tier, from_rate, to_rate, effective_from, source, run_id, rate_id, actor_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [a.id, a.tier, tierKey, before?.rate ?? null, newRate, eff, source, runId, r.rows[0].id, actor, reason.slice(0, 300)],
  );
  const pct = (x) => `%${(Math.round(x * 1e4) / 100).toLocaleString('tr-TR')}`;
  const when = new Date(eff).toISOString().slice(0, 10);
  const parentPct = a.parent_id ? Math.max(0, topRate(await rateAt(c, a.parent_id, new Date(eff)), s) - e4(newRate)) / 1e4 : 0;
  if (source !== 'approval') {
    await notice(c, a.id, 'tier', `Komisyon kademen: ${tierName(s, tierKey)}`, `Yeni payın ${pct(newRate)}; ${when} tarihinden itibaren kazanılan gelire uygulanır. Önceki kazançların değişmez.`);
    if (a.parent_id) await notice(c, a.parent_id, 'tier', `${a.name}: ${tierName(s, tierKey)} kademesi`, `Bu alt ajansın yayıncılarından fark payın ${when} tarihinden itibaren ${pct(parentPct)}. Kendi yayıncılarının komisyonu değişmez.`);
  }
  return { rateId: Number(r.rows[0].id), rate: Number(newRate), effectiveFrom: eff };
}
