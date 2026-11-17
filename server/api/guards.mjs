// Koruma (docs/KORUMA.md, 090): someone sends a person the Koruma Kartı gift (GUARD_CARD, an ordinary gift of the
// catalog: the same price, coins, diamonds and income as any) and becomes their guardian. From then on every gift the
// guardian sends that person, from anywhere, adds its coins as Koruma points (1 coin = 1 point: the gift_events
// trigger, so rooms, chats, profile, Aile, Bağlar, lucky gifts and the bag all count). At Türkiye's midnight a pair whose
// guardian sent nothing the day before loses points: a tenth at 5 000 or more, else 1 000 (not below 0); the day the
// card was sent costs nothing the night after (the card is itself that day's gift). Only the guardian ends it, and
// the points go with it. The guardian with the most points shows on the ward's profile (the Koruma area) once they
// reach the ward's own threshold; a person can turn Koruma off (nobody new may start), and set the threshold once a
// week, up to a limit that grows with their Yankı level. People who guard each other see each other on their profiles.
//
//   GET  /api/guard?user=<id>          → { guardian, ward, mine, off }  a profile's Koruma area
//   GET  /api/guard/me                 → { guardians, wards, settings }  Benim Koruma (the top 50 each way)
//   POST /api/guard/end { ward }       → { ended }  the guardian leaves (points gone)
//   POST /api/guard/settings { off?, threshold? } → { settings }
//
// GUARD_SWEEP_MS: how often the midnight drop is looked for (default 5 min; it applies once per Türkiye day). Soon
// after midnight matters: a gift sent before the drop is worked out counts as the day before's.
import { HttpError, auth, db, env, int, limit, readJson, tx, userId } from './core.mjs';
import { levelsOf } from './profiles.mjs';
import { notify } from './push.mjs';

import { GUARD_CARD, GUARD_RULES } from './guard-rules.mjs';

export { GUARD_CARD, GUARD_RULES };
const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};
const SWEEP_MS = positive(env.GUARD_SWEEP_MS, 300_000);
const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
const fmt = (n) => Number(n).toLocaleString('tr-TR');

/**
 * The card's check and start, in the gift's transaction before its gift_events row (so the trigger counts the card's
 * coins): a person who turned Koruma off takes no new guardian; a guardian already guarding just adds the card's
 * points. True when a new Koruma started.
 */
export async function startGuard(c, guardian, ward) {
  const s = await c.query('SELECT off FROM guard_settings WHERE user_id = $1', [ward]);
  const have = await c.query('SELECT 1 FROM guards WHERE guardian = $1 AND ward = $2 AND ended_at IS NULL', [guardian, ward]);
  if (have.rowCount) return false;
  if (s.rows[0]?.off) throw new HttpError(403, 'Bu kişi korumayı kapatmış: kimse yeni koruyucusu olamaz');
  const r = await c.query(
    `INSERT INTO guards (guardian, ward, first_day, gift_day) VALUES ($1, $2, ${TODAY}, ${TODAY})
     ON CONFLICT (guardian, ward) WHERE ended_at IS NULL DO NOTHING RETURNING id`,
    [guardian, ward],
  );
  return r.rowCount > 0;
}
/** After the card's gift went through: the ward hears who guards them now. */
export function guardStarted(guardian, ward) {
  notify([ward], { title: 'Koruma', body: `${guardian.name} artık seni koruyor`, data: { type: 'guard', from: guardian.id } });
}

// --- The midnight drop -------------------------------------------------------------------------------------------
let running = false;
/**
 * Once per Türkiye day for each pair: no gift the day before (nor the card that day) costs points. Pairs started
 * today wait for tomorrow. A night the server missed isn't made up. → how many pairs lost points.
 */
export async function runGuardDecay() {
  if (running) return 0;
  running = true;
  try {
    const r = await db.query(
      `UPDATE guards SET
          points = CASE WHEN gift_day >= ${TODAY} - 1 OR first_day >= ${TODAY} - 1 THEN points
                        WHEN points >= $1 THEN points - floor(points * $2::numeric)::bigint
                        ELSE greatest(points - $3, 0) END,
          decayed_on = ${TODAY}
        WHERE ended_at IS NULL AND first_day < ${TODAY} AND (decayed_on IS NULL OR decayed_on < ${TODAY})
        RETURNING (gift_day < ${TODAY} - 1 AND first_day < ${TODAY} - 1) AS dropped`,
      [GUARD_RULES.dropFrom, GUARD_RULES.dropShare, GUARD_RULES.dropFlat],
    );
    const n = r.rows.filter((x) => x.dropped).length;
    if (n) console.log(`guard drop: ${n}`);
    return n;
  } finally {
    running = false;
  }
}
let timer = null;
export function startGuardSweep() {
  if (timer) return;
  const run = () => void runGuardDecay().catch((e) => console.error('guard drop failed', String(e?.message ?? e).slice(0, 200)));
  timer = setInterval(run, SWEEP_MS);
  timer.unref();
  setTimeout(run, Math.min(SWEEP_MS, 60_000)).unref();
}
export function stopGuardSweep() {
  clearInterval(timer);
  timer = null;
}

// --- Views -------------------------------------------------------------------------------------------------------
const PERSON = `g.id AS guard_id, g.points, g.started_at, (${TODAY} - (g.started_at AT TIME ZONE 'Europe/Istanbul')::date + 1) AS days`;
const personOf = (r, side) => ({
  id: r[`${side}_id`],
  name: r[`${side}_name`],
  avatarUrl: r[`${side}_avatar`] ?? null,
  points: Number(r.points),
  days: Number(r.days),
  since: r.started_at,
});
const settingsRow = async (q, id) => (await q.query('SELECT off, threshold, threshold_at FROM guard_settings WHERE user_id = $1', [id])).rows[0] ?? { off: false, threshold: 0, threshold_at: null };
async function settingsView(id) {
  const s = await settingsRow(db, id);
  const charm = (await levelsOf([id]))[id]?.charm ?? 0;
  const next = s.threshold_at ? new Date(new Date(s.threshold_at).getTime() + GUARD_RULES.thresholdEveryDays * 86400_000) : null;
  return {
    off: s.off,
    threshold: Number(s.threshold),
    thresholdMax: GUARD_RULES.thresholdPerLevel * (charm + 1),
    thresholdNextAt: next && next.getTime() > Date.now() ? next.toISOString() : null,
  };
}

export const guardRoutes = {
  /**
   * A profile's Koruma area: the guardian with the most points who reached the person's threshold, the person they
   * guard with the most points (so two who guard each other each show the other), my own Koruma of them, and
   * whether they take new guardians.
   */
  async 'GET /api/guard'(req, url) {
    const me = await auth(req);
    const id = userId(url.searchParams.get('user'));
    const s = await settingsRow(db, id);
    const top = await db.query(
      `SELECT ${PERSON}, u.id AS guardian_id, u.name AS guardian_name, u.avatar_url AS guardian_avatar
         FROM guards g JOIN users u ON u.id = g.guardian AND u.deleted_at IS NULL
        WHERE g.ward = $1 AND g.ended_at IS NULL AND g.points >= $2 AND g.points > 0
        ORDER BY g.points DESC, g.started_at LIMIT 1`,
      [id, s.threshold],
    );
    const ward = await db.query(
      `SELECT ${PERSON}, u.id AS ward_id, u.name AS ward_name, u.avatar_url AS ward_avatar
         FROM guards g JOIN users u ON u.id = g.ward AND u.deleted_at IS NULL
        WHERE g.guardian = $1 AND g.ended_at IS NULL
        ORDER BY g.points DESC, g.started_at LIMIT 1`,
      [id],
    );
    const mine = me.id === id ? null : (await db.query(`SELECT ${PERSON} FROM guards g WHERE g.guardian = $1 AND g.ward = $2 AND g.ended_at IS NULL`, [me.id, id])).rows[0];
    return {
      guardian: top.rows[0] ? personOf(top.rows[0], 'guardian') : null,
      ward: ward.rows[0] ? personOf(ward.rows[0], 'ward') : null,
      mine: mine ? { points: Number(mine.points), days: Number(mine.days), since: mine.started_at } : null,
      off: s.off,
      threshold: Number(s.threshold),
    };
  },

  /** Benim Koruma: who guards me and whom I guard, the top 50 by points each way, and my settings. */
  async 'GET /api/guard/me'(req) {
    const me = await auth(req);
    const guardians = await db.query(
      `SELECT ${PERSON}, u.id AS guardian_id, u.name AS guardian_name, u.avatar_url AS guardian_avatar
         FROM guards g JOIN users u ON u.id = g.guardian AND u.deleted_at IS NULL
        WHERE g.ward = $1 AND g.ended_at IS NULL ORDER BY g.points DESC, g.started_at LIMIT $2`,
      [me.id, GUARD_RULES.listMax],
    );
    const wards = await db.query(
      `SELECT ${PERSON}, u.id AS ward_id, u.name AS ward_name, u.avatar_url AS ward_avatar
         FROM guards g JOIN users u ON u.id = g.ward AND u.deleted_at IS NULL
        WHERE g.guardian = $1 AND g.ended_at IS NULL ORDER BY g.points DESC, g.started_at LIMIT $2`,
      [me.id, GUARD_RULES.listMax],
    );
    return {
      guardians: guardians.rows.map((r) => personOf(r, 'guardian')),
      wards: wards.rows.map((r) => personOf(r, 'ward')),
      settings: await settingsView(me.id),
    };
  },

  /** The guardian ends their Koruma of someone; the points are gone. The guarded person can't end it. */
  async 'POST /api/guard/end'(req) {
    const me = await auth(req);
    limit(`guard:${me.id}`, 30, 'Çok fazla istek, biraz bekle');
    const b = await readJson(req);
    const ward = userId(b.ward, 'korunan kişi');
    const r = await db.query('UPDATE guards SET ended_at = now(), points = 0 WHERE guardian = $1 AND ward = $2 AND ended_at IS NULL RETURNING id', [me.id, ward]);
    if (!r.rowCount) throw new HttpError(404, 'Bu kişiyi korumuyorsun');
    return { ended: true };
  },

  /** Koruma on or off for me, and my profile's threshold (once a week, up to my Yankı level's limit). */
  async 'POST /api/guard/settings'(req) {
    const me = await auth(req);
    limit(`guard:${me.id}`, 30, 'Çok fazla istek, biraz bekle');
    const b = await readJson(req);
    if (b.off !== undefined && typeof b.off !== 'boolean') throw new HttpError(400, 'Koruma açık ya da kapalı olmalı');
    let threshold;
    if (b.threshold !== undefined) {
      const view = await settingsView(me.id);
      threshold = int(b.threshold, 0, view.thresholdMax);
      if (threshold === null) throw new HttpError(400, `Koruma eşiği 0–${fmt(view.thresholdMax)} puan olabilir (Yankı seviyen yükseldikçe sınır artar)`);
      if (threshold === view.threshold) threshold = undefined;
      else if (view.thresholdNextAt) throw new HttpError(429, `Koruma eşiği haftada bir değişir; bir sonraki: ${new Date(view.thresholdNextAt).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
    }
    await tx(async (c) => {
      await c.query('INSERT INTO guard_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [me.id]);
      if (b.off !== undefined) await c.query('UPDATE guard_settings SET off = $2 WHERE user_id = $1', [me.id, b.off]);
      if (threshold !== undefined) await c.query('UPDATE guard_settings SET threshold = $2, threshold_at = now() WHERE user_id = $1', [me.id, threshold]);
    });
    return { settings: await settingsView(me.id) };
  },
};

/** For the data copy (my-data.mjs): my Koruma both ways, ended ones too, and my settings. */
export async function guardsOfUser(q, id) {
  const rows = (
    await q.query(
      `SELECT g.guardian = $1 AS i_guard, CASE WHEN g.guardian = $1 THEN w.name ELSE gu.name END AS other_name, g.points,
              g.started_at, g.ended_at FROM guards g JOIN users gu ON gu.id = g.guardian JOIN users w ON w.id = g.ward
        WHERE g.guardian = $1 OR g.ward = $1 ORDER BY g.started_at`,
      [id],
    )
  ).rows;
  const s = await settingsRow(q, id);
  return {
    iGuard: rows.filter((r) => r.i_guard).map((r) => ({ name: r.other_name, points: Number(r.points), startedAt: r.started_at, endedAt: r.ended_at })),
    guardMe: rows.filter((r) => !r.i_guard).map((r) => ({ name: r.other_name, points: Number(r.points), startedAt: r.started_at, endedAt: r.ended_at })),
    settings: { off: s.off, threshold: Number(s.threshold) },
  };
}
