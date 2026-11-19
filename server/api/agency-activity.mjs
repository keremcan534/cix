// Aday ajans / aktif ajans and the streamers' 90-day rule (docs/AJANS_STATUSU.md, the owners' rule of 19 Nov 2026).
//
// An approved agency is a candidate ("aday ajans") until it has enough streamers and enough of them earned in it
// (Canlı ayarlar › Ajans statüsü, live-registry.mjs AGENCY_AMOUNTS: 20 streamers, 10 of them 10 USD each); then it is
// active ("aktif ajans"). An active agency falls back to candidate when its streamers drop below the line (20).
// A candidate's commission is computed and kept in its ledger like any other; only a payout waits until it is active
// (agency.mjs payouts/request). An active agency that brought fewer new streamers than the monthly line in a month
// gets fewer points of its own share the next month (agency_month_rules, read by agency-lib.mjs calcEvent).
// A streamer who neither used the app nor withdrew for `inactiveDays` leaves the agency (the agency job) and stays a
// streamer under management (streamer-rule.mjs, "yönetim yayıncısı").
import { DIAMONDS_PER_USD, audit, notice } from './agency-lib.mjs';
import { agencyRuleOf } from './live-registry.mjs';
import { live } from './live-settings.mjs';

const TZ = 'Europe/Istanbul';
/** The first day of the month of `t` in Turkey ('2026-11-01'). */
export const monthOf = (t = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-01`;
};
/** The month before `month` ('2026-11-01' → '2026-10-01'). */
export const prevMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
};
/** A month's start as an instant, Turkey's midnight (SQL). */
const monthStartSql = (p) => `(${p}::date::timestamp AT TIME ZONE '${TZ}')`;

/** The rule now. */
export const agencyRule = (s = live()) => agencyRuleOf(s);

/**
 * Where agency `a` (an agencies row) stands now: its streamers, how many earned enough in it, new streamers this
 * month, and its status by the rule. `save`: write a changed status (with a notice to the agency and an audit row).
 */
export async function activityOf(c, a, { rule = agencyRule(), save = false, actor = null } = {}) {
  const earnDiamonds = rule.activationEarnUsd * DIAMONDS_PER_USD;
  const month = monthOf();
  const r = (
    await c.query(
      `WITH m AS (SELECT streamer_id, joined_at FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL AND contract = 'approved')
       SELECT (SELECT count(*) FROM m)::int AS hosts,
              (SELECT count(*) FROM m WHERE (SELECT coalesce(sum(e.diamonds), 0) FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.occurred_at >= m.joined_at) >= $2)::int AS earners,
              (SELECT count(DISTINCT s.streamer_id) FROM agency_streamers s WHERE s.agency_id = $1 AND s.joined_at >= ${monthStartSql('$3')}
                  AND NOT EXISTS (SELECT 1 FROM agency_streamers o WHERE o.agency_id = $1 AND o.streamer_id = s.streamer_id AND o.joined_at < ${monthStartSql('$3')}))::int AS new_hosts,
              (SELECT penalty FROM agency_month_rules WHERE agency_id = $1 AND month = $3::date) AS penalty`,
      [a.id, earnDiamonds, month],
    )
  ).rows[0];
  const off = rule.activationHosts === 0;
  const was = a.activity === 'active';
  const active = off || (was ? r.hosts >= rule.demoteBelow : r.hosts >= rule.activationHosts && r.earners >= rule.activationEarners);
  const status = active ? 'active' : 'candidate';
  if (save && a.status === 'approved' && status !== a.activity) {
    await c.query('UPDATE agencies SET activity = $2, activity_at = now() WHERE id = $1', [a.id, status]);
    await audit(c, actor, active ? 'agency.activated' : 'agency.candidate', 'agency', a.id, { before: { activity: a.activity }, after: { activity: status, hosts: r.hosts, earners: r.earners } });
    if (active) await notice(c, a.id, 'status', 'Ajansın aktif oldu', 'Yayıncı ve kazanç şartını tuttun; birikmiş ve yeni komisyonun ödenebilir.');
    else await notice(c, a.id, 'status', 'Ajansın aday ajansa düştü', `Yayıncı sayın ${rule.demoteBelow}'nin altına indi. Komisyonun birikmeye devam eder; yeniden ${rule.activationHosts} yayıncıya ulaşınca ödenebilir olur.`);
    a.activity = status;
  }
  return {
    status,
    off,
    hosts: r.hosts,
    earners: r.earners,
    newThisMonth: r.new_hosts,
    penalty: r.penalty === null || r.penalty === undefined ? 0 : Number(r.penalty),
    need: { hosts: rule.activationHosts, earners: rule.activationEarners, earnUsd: rule.activationEarnUsd, demoteBelow: rule.demoteBelow, monthlyNew: rule.monthlyNewHosts, penaltyPct: rule.monthlyPenaltyPct },
  };
}

/** The Turkish sentence a candidate gets when it asks for a payout. */
export const candidatePayoutText = (x) =>
  `Aday ajans ödeme alamaz. Ajansın ${x.need.hosts} yayıncıya${x.need.earners > 0 ? ` ve bunlardan ${x.need.earners} tanesi ${x.need.earnUsd} USD kazanınca` : ''} aktif olur; birikmiş komisyonun o zaman ödenir. Şu an ${x.hosts} yayıncı${x.need.earners > 0 ? `, ${x.earners} kazanan` : ''}.`;

/**
 * The agency job's part: streamers inactive too long leave their agency, every approved agency's status is
 * worked out again, and on the month's first run each active agency's rule for the month is written. Safe to run
 * any number of times.
 */
export async function activityJobs(c, now = new Date()) {
  const rule = agencyRule();
  const out = { inactive: 0, activated: 0, demoted: 0, monthRules: 0 };
  if (rule.inactiveDays > 0) {
    const gone = await c.query(
      `UPDATE agency_streamers m SET ended_at = now(), end_reason = 'inactive'
        WHERE m.ended_at IS NULL AND m.joined_at < now() - make_interval(days => $1::int)
          AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = m.streamer_id AND s.last_seen_at >= now() - make_interval(days => $1::int))
          AND NOT EXISTS (SELECT 1 FROM device_accounts d WHERE d.user_id = m.streamer_id AND d.last_seen_at >= now() - make_interval(days => $1::int))
          AND NOT EXISTS (SELECT 1 FROM withdrawals w WHERE w.user_id = m.streamer_id AND w.created_at >= now() - make_interval(days => $1::int))
        RETURNING m.agency_id, m.streamer_id`,
      [rule.inactiveDays],
    );
    out.inactive = gone.rowCount;
    const by = new Map();
    for (const x of gone.rows) by.set(x.agency_id, (by.get(x.agency_id) ?? 0) + 1);
    for (const [id, n] of by) {
      await notice(c, id, 'status', `${n} yayıncı ${rule.inactiveDays} gün pasif kaldığı için ajanstan düştü`, 'Uygulamaya girmeyen ve para çekmeyen yayıncılar yönetime geçer; kazançları sürer.');
      await audit(c, null, 'streamer.inactive', 'agency', id, { after: { count: n, days: rule.inactiveDays } });
    }
  }
  const all = await c.query("SELECT * FROM agencies WHERE status = 'approved' ORDER BY id");
  for (const a of all.rows) {
    const before = a.activity;
    await activityOf(c, a, { rule, save: true });
    if (before !== a.activity) out[a.activity === 'active' ? 'activated' : 'demoted']++;
  }
  // The month's rule: an agency active now that was approved before last month began, and brought fewer new
  // streamers than the line last month, gets the penalty this month. Written once per agency and month.
  if (rule.monthlyNewHosts > 0 && rule.monthlyPenaltyPct > 0) {
    const month = monthOf(now);
    const prev = prevMonth(month);
    const r = await c.query(
      `INSERT INTO agency_month_rules (agency_id, month, new_hosts, needed, penalty)
       SELECT a.id, $1::date, n.k, $3, CASE WHEN n.k < $3 THEN $4::numeric / 100 ELSE 0 END
         FROM agencies a
         CROSS JOIN LATERAL (SELECT count(DISTINCT s.streamer_id)::int AS k FROM agency_streamers s
                              WHERE s.agency_id = a.id AND s.joined_at >= ${monthStartSql('$2')} AND s.joined_at < ${monthStartSql('$1')}
                                AND NOT EXISTS (SELECT 1 FROM agency_streamers o WHERE o.agency_id = a.id AND o.streamer_id = s.streamer_id AND o.joined_at < ${monthStartSql('$2')})) n
        WHERE a.status = 'approved' AND a.activity = 'active' AND coalesce(a.approved_at, a.created_at) < ${monthStartSql('$2')}
       ON CONFLICT (agency_id, month) DO NOTHING
       RETURNING agency_id, new_hosts, penalty`,
      [month, prev, rule.monthlyNewHosts, rule.monthlyPenaltyPct],
    );
    out.monthRules = r.rowCount;
    for (const x of r.rows.filter((y) => Number(y.penalty) > 0)) {
      await notice(c, x.agency_id, 'status', `Bu ay komisyonun ${rule.monthlyPenaltyPct} puan düşük`, `Geçen ay ${x.new_hosts} yeni yayıncı getirdin; şart ${rule.monthlyNewHosts}. Bu ayın sonunda şartı tutarsan gelecek ay oranın geri gelir.`);
    }
  }
  return out;
}

/** The month's penalty (a rate) of agency `agencyId` for an income at `t`; 0 when none. */
export async function penaltyAt(c, agencyId, t) {
  const r = await c.query('SELECT penalty FROM agency_month_rules WHERE agency_id = $1 AND month = $2::date', [agencyId, monthOf(t)]);
  return r.rowCount ? Number(r.rows[0].penalty) : 0;
}
