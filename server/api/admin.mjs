// Moderation for staff (users.role = moderator or admin): the report queue and platform bans. Apple 1.2 and
// Play's UGC policy expect reports to be acted on; this is the server half, a staff web panel uses it.
//
//   GET  /api/admin/reports?status=open                 → { reports }
//   POST /api/admin/reports/handle { id, status, banDays? } → { report }  (status: actioned | dismissed)
//   POST /api/admin/ban    { user, days }  (null = lift)  → { bannedUntil }
import { HttpError, auth, db, int, readJson, userId } from './core.mjs';

async function staff(req) {
  const u = await auth(req);
  if (u.role !== 'moderator' && u.role !== 'admin') throw new HttpError(403, 'Yetkili hesabı gerekli');
  return u;
}

async function ban(target, days) {
  const r = await db.query(
    `UPDATE users SET banned_until = CASE WHEN $2::int IS NULL THEN NULL ELSE now() + make_interval(days => $2::int) END
      WHERE id = $1 AND role = 'user' RETURNING banned_until`,
    [target, days],
  );
  if (!r.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı veya yetkili hesabı');
  return r.rows[0].banned_until;
}

export const adminRoutes = {
  async 'GET /api/admin/reports'(req, url) {
    await staff(req);
    const status = url.searchParams.get('status') ?? 'open';
    if (!['open', 'actioned', 'dismissed'].includes(status)) throw new HttpError(400, 'Geçersiz durum');
    const r = await db.query(
      `SELECT r.*, u.name AS reporter_name,
              (SELECT count(*) FROM reports x WHERE x.target_type = r.target_type AND x.target_id = r.target_id) AS reports_on_target
         FROM reports r JOIN users u ON u.id = r.reporter
        WHERE r.status = $1 ORDER BY r.created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 200`,
      [status],
    );
    return {
      reports: r.rows.map((x) => ({
        id: Number(x.id),
        reporter: { id: x.reporter, name: x.reporter_name },
        target: { type: x.target_type, id: x.target_id },
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
    if (b.status === 'actioned' && b.banDays !== undefined) {
      if (found.rows[0].target_type !== 'user') throw new HttpError(400, 'Askıya alma yalnızca kullanıcı şikâyetinde');
      days = int(b.banDays, 1, 3650);
      if (!days) throw new HttpError(400, 'Gün 1–3650 olmalı');
      userId(found.rows[0].target_id);
    }
    const bannedUntil = days ? await ban(found.rows[0].target_id, days) : null;
    const r = await db.query('UPDATE reports SET status = $2, handled_by = $3, handled_at = now() WHERE id = $1 RETURNING *', [id, b.status, me.id]);
    const rep = r.rows[0];
    return { report: { id: Number(rep.id), status: rep.status, handledAt: rep.handled_at }, bannedUntil };
  },

  async 'POST /api/admin/ban'(req) {
    await staff(req);
    const b = await readJson(req);
    const days = b.days === null ? null : int(b.days, 1, 3650);
    if (b.days !== null && !days) throw new HttpError(400, 'Gün 1–3650 olmalı');
    return { bannedUntil: await ban(userId(b.user), days) };
  },
};
