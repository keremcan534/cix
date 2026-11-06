// Moderation for staff (users.role = moderator or admin): the report queue and platform bans. Apple 1.2 and
// Play's UGC policy expect reports to be acted on; this is the server half, the app's Yönetim panel (components/admin) uses it.
//
//   GET  /api/admin/reports?status=open                 → { reports }  (each target with its name and ban state)
//   POST /api/admin/reports/handle { id, status, banDays?, permanent?, reason? } → { report, bannedUntil, permanent }
//   POST /api/admin/ban    { user, days, permanent?, reason? }  (days null = lift)  → { bannedUntil, permanent }
// Bans are sanctions (sanctions.mjs): days become an account ban of that length (more than 90 days needs the
// lifetime-ban permission), permanent: true a lifetime one (is_permanent, the same permission), null lifts the
// running account bans (each by the lifting rules, sanctions.mjs mayLift). `reason` is a sanction_reasons code;
// without it a report's ban takes the report's category, otherwise 'other'. Every step is audited there.
import { HttpError, LIVE_SANCTION, SANCTION_SELECT, auth, db, int, readJson, userId } from './core.mjs';
import { applySanction, audit, liftSanction, mayLift, permsOf } from './sanctions.mjs';

async function staff(req) {
  const u = await auth(req);
  if (u.role !== 'moderator' && u.role !== 'admin') throw new HttpError(403, 'Yetkili hesabı gerekli');
  return u;
}

const RANK = { user: 0, coins_bank: 0, moderator: 1, admin: 2 };

/** A report's category (the app's report sheets) as a sanction reason; the rest is 'other'. */
const REPORT_REASON = {
  'Taciz veya hakaret': 'harassment',
  'Taciz / hakaret': 'harassment',
  'Uygunsuz içerik': 'inappropriate',
  'Uygunsuz görüntü': 'inappropriate',
  Dolandırıcılık: 'fraud',
  'Sahte profil': 'fake_account',
  Spam: 'spam',
  'Spam veya reklam': 'spam',
  'Nefret söylemi': 'hate',
};
/** The reason a ban is given for: a code from the request, else the report's category, else 'other'. */
const banReason = (code, reportReason) => (typeof code === 'string' && code ? code : (REPORT_REASON[reportReason] ?? 'other'));

/**
 * An account ban by `me`: `days` long, for life with `permanent`, or (days null, not permanent) lifting the
 * running ones. Returns when it ends (null when none runs or it is for life).
 */
async function ban(me, target, days, { permanent = false, reason = 'other', reportId = null } = {}) {
  const t = (await db.query('SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL', [target])).rows[0];
  if (!t || RANK[t.role] >= 1) throw new HttpError(404, 'Kullanıcı bulunamadı veya yetkili hesabı');
  const perms = await permsOf(me);
  const actor = { id: me.id, role: me.role === 'admin' ? 'admin' : 'moderator' };
  if (days === null && !permanent) {
    const live = await db.query(`${SANCTION_SELECT} WHERE s.user_id = $1 AND s.sanction_type = 'account_ban' AND ${LIVE_SANCTION}`, [target]);
    const need = live.rows.some((s) => s.is_permanent) ? 'sanction.ban_permanent' : 'sanction.lift';
    if (!perms.has('sanction.lift') || !perms.has(need)) {
      await audit(db, { actor: me.id, role: me.role, action: 'lift', target, result: 'denied' });
      throw new HttpError(403, 'Bu işlem için yaptırım yetkin yok');
    }
    // All or none: a ban a higher rank gave stays, and so do the others.
    for (const s of live.rows) await mayLift(me, s);
    for (const s of live.rows) await liftSanction(actor, s, 'Yönetim panelinden kaldırıldı');
    return null;
  }
  const need = permanent || days > 90 ? 'sanction.ban_permanent' : 'sanction.ban';
  if (!perms.has(need)) {
    await audit(db, { actor: me.id, role: me.role, action: 'apply', target, result: 'denied', detail: { type: 'account_ban', days, permanent } });
    throw new HttpError(403, permanent ? 'Süresiz askıya alma için yaptırım yetkin yok' : 'Bu süre için yaptırım yetkin yok');
  }
  const [s] = await applySanction(actor, {
    user: target,
    type: 'account_ban',
    reason,
    minutes: permanent ? null : days * 1440,
    source: reportId ? 'report' : 'manual',
    reportId,
    note: 'Yönetim panelinden askıya alma',
  });
  return s.expires_at;
}

export const adminRoutes = {
  async 'GET /api/admin/reports'(req, url) {
    await staff(req);
    const status = url.searchParams.get('status') ?? 'open';
    if (!['open', 'actioned', 'dismissed'].includes(status)) throw new HttpError(400, 'Geçersiz durum');
    const r = await db.query(
      `SELECT r.*, u.name AS reporter_name, t.name AS target_name, t.role AS target_role, (SELECT max(s.expires_at) FROM user_sanctions s WHERE s.user_id = t.id AND s.sanction_type = 'account_ban' AND ${LIVE_SANCTION}) AS target_banned_until,
              EXISTS (SELECT 1 FROM user_sanctions s WHERE s.user_id = t.id AND s.sanction_type = 'account_ban' AND s.is_permanent AND ${LIVE_SANCTION}) AS target_banned_forever, ro.title AS room_title,
              (SELECT count(*) FROM reports x WHERE x.target_type = r.target_type AND x.target_id = r.target_id) AS reports_on_target
         FROM reports r JOIN users u ON u.id = r.reporter
         LEFT JOIN users t ON r.target_type = 'user' AND t.id::text = r.target_id
         LEFT JOIN rooms ro ON r.target_type = 'room' AND ro.id::text = r.target_id
        WHERE r.status = $1 ORDER BY r.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 200`,
      [status],
    );
    return {
      reports: r.rows.map((x) => ({
        id: Number(x.id),
        reporter: { id: x.reporter, name: x.reporter_name },
        // name: the reported person's name or the room's title (null when it no longer exists or for messages);
        // staff: a moderator or admin (can't be banned); bannedUntil: a ban still running.
        target: {
          type: x.target_type,
          id: x.target_id,
          name: x.target_name ?? x.room_title ?? null,
          staff: x.target_role === 'moderator' || x.target_role === 'admin',
          bannedUntil: x.target_banned_until ?? null,
          bannedForever: !!x.target_banned_forever,
        },
        reason: x.reason,
        note: x.note,
        status: x.status,
        reportsOnTarget: Number(x.reports_on_target),
        createdAt: x.created_at,
        handledAt: x.handled_at,
      })),
    };
  },

  async 'POST /api/admin/reports/handle'(req) {
    const me = await staff(req);
    const b = await readJson(req);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (!id) throw new HttpError(400, 'Geçersiz şikâyet');
    if (!['actioned', 'dismissed'].includes(b.status)) throw new HttpError(400, 'Durum actioned veya dismissed olmalı');
    const found = await db.query('SELECT * FROM reports WHERE id = $1', [id]);
    if (!found.rowCount) throw new HttpError(404, 'Şikâyet bulunamadı');
    // Validate the ban before writing anything, so a bad request leaves the report open.
    let days = null;
    // 'Süresiz': a lifetime ban (is_permanent), whatever banDays says.
    const permanent = b.status === 'actioned' && b.permanent === true;
    if (b.status === 'actioned' && (b.banDays !== undefined || permanent)) {
      if (found.rows[0].target_type !== 'user') throw new HttpError(400, 'Askıya alma yalnızca kullanıcı şikâyetinde');
      if (b.banDays !== undefined) {
        days = int(b.banDays, 1, 3650);
        if (!days) throw new HttpError(400, 'Gün 1–3650 olmalı');
      }
      userId(found.rows[0].target_id);
    }
    const bannedUntil = days || permanent ? await ban(me, found.rows[0].target_id, days, { permanent, reason: banReason(b.reason, found.rows[0].reason), reportId: id }) : null;
    const r = await db.query('UPDATE reports SET status = $2, handled_by = $3, handled_at = now() WHERE id = $1 RETURNING *', [id, b.status, me.id]);
    const rep = r.rows[0];
    return { report: { id: Number(rep.id), status: rep.status, handledAt: rep.handled_at }, bannedUntil, permanent };
  },

  async 'POST /api/admin/ban'(req) {
    const me = await staff(req);
    const b = await readJson(req);
    const permanent = b.permanent === true;
    const lift = b.days === null && !permanent;
    const days = lift || (permanent && b.days === undefined) ? null : int(b.days, 1, 3650);
    if (!lift && !(permanent && b.days === undefined) && !days) throw new HttpError(400, 'Gün 1–3650 olmalı');
    return { bannedUntil: await ban(me, userId(b.user), days, { permanent, reason: banReason(b.reason) }), permanent };
  },
};
