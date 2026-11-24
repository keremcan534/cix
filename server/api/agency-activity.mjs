// The streamers' 60-day rule (owners, 24 Nov 2026; before it 90 days, docs/AJANS_STATUSU.md). A streamer who has
// not been online for INACTIVE_DAYS leaves her agency (the agency job). When she comes back she has the days to pick
// an agency again (streamer_policy.pick_days, 3) from her return: a code or a link joins her to any agency; past them
// she is a yönetim yayıncısı (streamer-rule.mjs). The rule is fixed: no setting changes it.
//
// The aday ajans / aktif ajans rule and the monthly new-streamer penalty (19 Nov 2026) ended on 24 Nov 2026: the
// weekly levels (agency-levels.mjs) replaced them.
import { audit, notice } from './agency-lib.mjs';

/** Days offline after which a streamer leaves her agency (owners: fixed). */
export const INACTIVE_DAYS = 60;

/** Whether account `x` (an SQL expression) was online at or after instant `since` (SQL). */
const onlineSinceSql = (x, since) =>
  `(EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = ${x} AND s.last_seen_at >= ${since})
    OR EXISTS (SELECT 1 FROM device_accounts d WHERE d.user_id = ${x} AND d.last_seen_at >= ${since}))`;

/**
 * The agency job's part: streamers offline for INACTIVE_DAYS leave their agency (with a notice to it), and a
 * streamer who left that way and has been online since gets her return marked (her days to pick start then).
 * Safe to run any number of times.
 */
export async function activityJobs(c) {
  const out = { inactive: 0, returned: 0 };
  const gone = await c.query(
    `UPDATE agency_streamers m SET ended_at = now(), end_reason = 'inactive'
      WHERE m.ended_at IS NULL AND m.joined_at < now() - make_interval(days => $1::int)
        AND NOT ${onlineSinceSql('m.streamer_id', 'now() - make_interval(days => $1::int)')}
      RETURNING m.agency_id, m.streamer_id`,
    [INACTIVE_DAYS],
  );
  out.inactive = gone.rowCount;
  const by = new Map();
  for (const x of gone.rows) by.set(x.agency_id, (by.get(x.agency_id) ?? 0) + 1);
  for (const [id, n] of by) {
    await notice(c, id, 'status', `${n} yayıncı ${INACTIVE_DAYS} gün çevrimiçi olmadığı için ajanstan düştü`, 'Geri dönen yayıncı 3 gün içinde bir ajansa katılabilir; katılmazsa yönetim yayıncısı olur.');
    await audit(c, null, 'streamer.inactive', 'agency', id, { after: { count: n, days: INACTIVE_DAYS } });
  }
  // Back: her last link ended for inactivity, she is in no agency, and she was online after it ended.
  const back = await c.query(
    `UPDATE agency_streamers m SET returned_at = now()
      WHERE m.end_reason = 'inactive' AND m.returned_at IS NULL AND m.ended_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM agency_streamers o WHERE o.streamer_id = m.streamer_id AND (o.ended_at IS NULL OR o.joined_at > m.joined_at))
        AND ${onlineSinceSql('m.streamer_id', 'm.ended_at')}`,
  );
  out.returned = back.rowCount;
  return out;
}
