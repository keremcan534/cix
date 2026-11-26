// Ajans asistanı (güncelleme 4, item 17; docs/AJANS_ASISTANI.md). An agency owner names assistants among the agency's
// own people (its streamers or its team), at most assistant_policy.max at once (1 by default, a centre setting). The
// streamers an assistant brings in (an invite they sent and the streamer accepted, or the assistant's own code)
// give the assistant a share of the agency's own commission on their income, in whole percent. The split itself is
// in the commission engine (agency-lib.mjs calcEvent, bookAssistantShare): the share leaves the owner's commission
// and reaches the assistant's wallet as diamonds in the same transaction; a refund takes it back the same way.
//
//   GET  /api/agency/assistants?id=                        → { max, open, canAdd, weekStart, nextWeek, assistants }
//   GET  /api/agency/assistants/candidates?id=&q=          → { users }            (the agency's own people)
//   POST /api/agency/assistants/add    { id, user, pct }   → { assistant }
//   POST /api/agency/assistants/share  { id, assistantId, pct } → { assistant, replay }   (management only, 26 Nov 2026)
//   POST /api/agency/assistants/offer/answer { assistantId, answer: accept|reject } → { assistant }   (the person named)
//   POST /api/agency/assistants/remove { id, assistantId, ask? } → { removed, request }  (the owner asks; the centre ends it)
//   POST /api/agency/assistants/removal/answer  { requestId, answer: accept|reject|dispute, note? } → { request }  (the assistant)
//   POST /api/agency/assistants/removal/dispute { requestId, note } → { request }   (the owner, after a rejection)
//   GET  /api/admin/agency/assistant-removals?status=open|all      → { requests }   (Yönetim: disputes to settle)
//   POST /api/admin/agency/assistant-removals/resolve { requestId, outcome: remove|keep, note } → { request }
//   (the assistant's own view is in GET /api/agency/me, `assistant`; the wallet's Gelir kaynakları lists the share)
//
// Rules, all here on the server:
//  - Only the agency's owner names an assistant, with the share agreed (the centre may remove one). The person named
//    accepts or refuses it first (owners, 26 Nov 2026): until then nothing is written and the code doesn't work. The
//    share is not changed afterwards by the owner; management may correct it. The person must be
//    one of the agency's own now, not its owner, and not an assistant anywhere else.
//  - The first share starts with the assignment. A change starts the next Monday 00:00 (Türkiye) and comes at most
//    once a calendar week. Shares never change backwards.
//  - Removed (or gone from the agency, or the account deleted): no share from then on; the streamers they brought
//    stay in the agency and count wholly for the owner. Someone removed this week can be named again next week.
//  - Removing takes the assistant's consent (owners, 25 Nov 2026): the owner asks, the assistant accepts (it ends),
//    rejects (it stays) or disputes; after a rejection the owner may dispute. A dispute goes to management, who talk
//    to both and settle it in the panel (remove or keep). The centre may still end one at once.
//  - Supporters' top-ups give an agency no commission (only streamers' income does), so there is no supporter share.
import { HttpError, UUID, auth, db, readJson, text, tx } from './core.mjs';
import { JOIN_CODE, accessOf, agencyRow, audit, d4, freeJoinCode, needPlatform, nextWeekStart, notice, settingsAt, weekStart } from './agency-lib.mjs';
import { notify } from './push.mjs';

const bad = (m) => {
  throw new HttpError(400, m);
};
const uuid = (v, what = 'kimlik') => (typeof v === 'string' && UUID.test(v) ? v : bad(`Geçersiz ${what}`));
const pctOf = (v) => (Number.isSafeInteger(v) && v >= 0 && v <= 100 ? v : bad('Pay 0 ile 100 arasında tam sayı olmalı'));
const idOf = (v) => (Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : bad('Geçersiz asistan'));
const n = (v) => Number(v ?? 0);

/** The person is one of the agency's own now: an open streamer membership in it or an open place on its team. */
const MEMBER = `(EXISTS (SELECT 1 FROM agency_streamers m WHERE m.streamer_id = u.id AND m.agency_id = $1 AND m.ended_at IS NULL)
              OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = u.id AND s.agency_id = $1 AND s.revoked_at IS NULL))`;

async function ctx(c, req) {
  const u = await auth(req);
  return { u, acc: await accessOf(c, u), s: (await settingsAt(c)).values };
}

/** Owner only (the centre may look, and remove). */
async function ownerOf(c, x, id, { lock = false, centre = null } = {}) {
  const a = await agencyRow(c, uuid(id, 'ajans'), lock);
  if (x.acc.owned.has(a.id)) return a;
  if (centre) {
    await needPlatform(c, x.acc, centre, a.id);
    return a;
  }
  await audit(db, x.u.id, 'assistants.manage', 'agency', a.id, { result: 'denied' });
  throw new HttpError(403, 'Asistanları yalnız ajans sahibi yönetir');
}

/**
 * An agency's invite code, or an open assistant's own code (their agency, and who brought the streamer). The
 * agency's code wins; the two never share a value (addAssistant checks both).
 */
export async function resolveJoinCode(c, code) {
  const s = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!JOIN_CODE.test(s)) throw new HttpError(400, 'Geçersiz ajans kodu');
  const a = await c.query('SELECT * FROM agencies WHERE code = $1', [s]);
  if (a.rowCount) return { agency: a.rows[0], assistant: null };
  const h = await c.query(
    `SELECT g.*, x.user_id AS assistant_user, u.name AS assistant_name FROM agency_assistants x JOIN agencies g ON g.id = x.agency_id JOIN users u ON u.id = x.user_id
      WHERE x.code = $1 AND x.ended_at IS NULL AND x.accepted_at IS NOT NULL AND u.deleted_at IS NULL`,
    [s],
  );
  if (!h.rowCount) throw new HttpError(404, 'Bu kodla bir ajans yok');
  const { assistant_user: userId, assistant_name: name, ...agency } = h.rows[0];
  return { agency, assistant: { userId, name } };
}

const SHARE_NOW = `(SELECT s.streamer_pct FROM agency_assistant_shares s WHERE s.assistant_id = x.id AND s.effective_from <= now() ORDER BY s.effective_from DESC, s.id DESC LIMIT 1)`;

/** One assignment with its numbers, for the owner's list and the assistant's own card. */
async function viewOf(q, row) {
  const wk = weekStart(new Date());
  const shares = await q.query('SELECT streamer_pct, effective_from, initial, created_at FROM agency_assistant_shares WHERE assistant_id = $1 ORDER BY effective_from, id', [row.id]);
  const now = Date.now();
  const inForce = shares.rows.filter((s) => new Date(s.effective_from).getTime() <= now).at(-1) ?? null;
  const upcoming = shares.rows.filter((s) => new Date(s.effective_from).getTime() > now).at(-1) ?? null;
  const changedThisWeek = shares.rows.some((s) => !s.initial && new Date(s.created_at) >= wk);
  const r = (
    await q.query(
      `SELECT
         (SELECT count(DISTINCT m.streamer_id) FROM agency_streamers m WHERE m.invited_by = $2 AND m.agency_id = $3)::int AS invited,
         (SELECT count(*) FROM agency_streamers m WHERE m.invited_by = $2 AND m.agency_id = $3 AND m.ended_at IS NULL)::int AS invited_now,
         (SELECT coalesce(sum(e.diamonds), 0) FROM agency_streamers m JOIN income_events e ON e.streamer_id = m.streamer_id
           WHERE m.invited_by = $2 AND m.agency_id = $3 AND e.occurred_at >= greatest(m.joined_at, $4) AND e.occurred_at < $5
             AND (m.ended_at IS NULL OR e.occurred_at < m.ended_at)) AS income_week,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1 AND l.created_at >= $4) AS share_week,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1
           AND l.created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AS share_month,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1) AS share_total,
         (SELECT coalesce(sum(l.wallet), 0) FROM agency_assistant_ledger l WHERE l.assistant_id = $1) AS wallet_total,
         (EXISTS (SELECT 1 FROM agency_streamers m WHERE m.streamer_id = $2 AND m.agency_id = $3 AND m.ended_at IS NULL)
           OR EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = $2 AND s.agency_id = $3 AND s.revoked_at IS NULL)) AS member`,
      [row.id, row.user_id, row.agency_id, wk, nextWeekStart(wk)],
    )
  ).rows[0];
  const rq = await q.query(`${REMOVAL} WHERE r.assistant_id = $1 AND r.status IN ('pending', 'rejected', 'disputed') ORDER BY r.id DESC LIMIT 1`, [row.id]);
  return {
    id: Number(row.id),
    agency: { id: row.agency_id, name: row.agency_name },
    user: { id: row.user_id, name: row.user_name, avatarUrl: row.avatar_url ?? null },
    code: row.code,
    assignedAt: row.assigned_at,
    endedAt: row.ended_at ?? null,
    active: !row.ended_at && !!row.accepted_at,
    // Named, not yet accepted by the person (owners, 26 Nov 2026).
    pending: !row.ended_at && !row.accepted_at,
    member: r.member,
    share: inForce ? { pct: inForce.streamer_pct, since: inForce.effective_from } : { pct: 0, since: row.assigned_at },
    upcoming: upcoming ? { pct: upcoming.streamer_pct, from: upcoming.effective_from } : null,
    canChange: !row.ended_at && !changedThisWeek,
    nextChangeFrom: nextWeekStart(new Date()),
    invited: { total: r.invited, now: r.invited_now },
    week: { streamerIncome: n(r.income_week), share: d4(r.share_week) },
    month: { share: d4(r.share_month) },
    total: { share: d4(r.share_total), wallet: n(r.wallet_total) },
    // An open request to end it (owners, 25 Nov 2026); null when none. Older apps ignore it.
    removal: rq.rowCount ? removalView(rq.rows[0]) : null,
  };
}

const REMOVAL = `SELECT r.*, g.name AS agency_name, a.name AS assistant_name, a.public_no::text AS assistant_no, o.name AS owner_name, o.public_no::text AS owner_no
  FROM agency_assistant_removals r JOIN agencies g ON g.id = r.agency_id JOIN users a ON a.id = r.user_id JOIN users o ON o.id = r.asked_by`;

/** A removal request as both sides (and the panel) see it: names and 12-digit IDs, never server ids of people. */
const removalView = (r) => ({
  id: Number(r.id),
  assistantId: Number(r.assistant_id),
  agency: { id: r.agency_id, name: r.agency_name },
  assistant: { name: r.assistant_name, no: r.assistant_no },
  owner: { name: r.owner_name, no: r.owner_no },
  status: r.status,
  disputedBy: r.disputed_by ?? null,
  disputeNote: r.dispute_note ?? null,
  askedAt: r.created_at,
  answeredAt: r.answered_at ?? null,
  disputedAt: r.disputed_at ?? null,
  resolvedAt: r.resolved_at ?? null,
  resolutionNote: r.resolution_note ?? null,
});

/** Ends an assignment by consent or by management; the same as the owner's removal before (no share from now on). */
async function endAssistant(c, assistantId, by, reason) {
  const r = await c.query('UPDATE agency_assistants SET ended_at = now(), ended_by = $2, end_reason = $3 WHERE id = $1 AND ended_at IS NULL RETURNING id, user_id, agency_id', [assistantId, by, reason]);
  if (!r.rowCount) return null;
  const who = (await c.query('SELECT name FROM users WHERE id = $1', [r.rows[0].user_id])).rows[0]?.name ?? 'Asistan';
  await notice(c, r.rows[0].agency_id, 'team', `${who} artık ajans asistanı değil`, 'Getirdiği yayıncılar ajansta kalır; kazançlarından komisyonun tamamı ajansa yazılır.');
  return r.rows[0];
}

/** Open requests on assignments that ended another way are closed (nothing left to decide). */
const closeStale = (c, where, vals) =>
  c.query(`UPDATE agency_assistant_removals r SET status = 'closed', resolved_at = now() FROM agency_assistants x
            WHERE x.id = r.assistant_id AND r.status IN ('pending', 'rejected', 'disputed') AND x.ended_at IS NOT NULL AND ${where}`, vals);

const ownerOfAgency = async (c, agencyId) => (await c.query('SELECT owner_id, name FROM agencies WHERE id = $1', [agencyId])).rows[0];

const ROW = `SELECT x.*, u.name AS user_name, u.avatar_url, g.name AS agency_name FROM agency_assistants x JOIN users u ON u.id = x.user_id JOIN agencies g ON g.id = x.agency_id`;

/**
 * My own assistant card for GET /api/agency/me: the open assignment, else the latest one that earned something;
 * with my latest shares. Null when I was never an assistant.
 */
export async function myAssistant(q, userId) {
  const r = await q.query(
    `${ROW} WHERE x.user_id = $1 AND (x.ended_at IS NULL OR EXISTS (SELECT 1 FROM agency_assistant_ledger l WHERE l.assistant_id = x.id))
      ORDER BY x.ended_at IS NULL DESC, x.assigned_at DESC LIMIT 1`,
    [userId],
  );
  if (!r.rowCount) return null;
  const v = await viewOf(q, r.rows[0]);
  const rows = await q.query(
    `SELECT l.id, l.amount, l.wallet, l.pct, l.basis, l.reverses, l.created_at, s.name AS streamer_name
       FROM agency_assistant_ledger l LEFT JOIN users s ON s.id = l.streamer_id WHERE l.user_id = $1 ORDER BY l.id DESC LIMIT 20`,
    [userId],
  );
  // Asistan merkezi (owners, 26 Nov 2026): the streamers I brought to this agency, by their 12-digit ID, with when they
  // joined (and left) and what they earned this week and since joining. Never anyone else's.
  const brought = await q.query(
    `SELECT u.name, u.public_no::text AS no, m.joined_at, m.ended_at,
            (SELECT coalesce(sum(e.diamonds), 0) FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.occurred_at >= greatest(m.joined_at, $3) AND (m.ended_at IS NULL OR e.occurred_at < m.ended_at)) AS week,
            (SELECT coalesce(sum(e.diamonds), 0) FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.occurred_at >= m.joined_at AND (m.ended_at IS NULL OR e.occurred_at < m.ended_at)) AS total
       FROM agency_streamers m JOIN users u ON u.id = m.streamer_id
      WHERE m.invited_by = $1 AND m.agency_id = $2 AND u.deleted_at IS NULL ORDER BY m.ended_at IS NULL DESC, m.joined_at DESC LIMIT 200`,
    [userId, v.agency.id, weekStart(new Date())],
  );
  return {
    ...v,
    streamers: brought.rows.map((x) => ({ name: x.name, no: x.no ?? null, joinedAt: x.joined_at, endedAt: x.ended_at ?? null, week: n(x.week), total: n(x.total) })),
    rows: rows.rows.map((x) => ({
      id: Number(x.id),
      amount: d4(x.amount),
      wallet: n(x.wallet),
      pct: x.pct,
      basis: d4(x.basis),
      reversal: x.reverses !== null || Number(x.amount) < 0,
      streamer: x.streamer_name ?? null,
      at: x.created_at,
    })),
  };
}

/** Ends the open assignments in an agency whose person is no longer one of its own (they left; shares already stopped). */
async function endGone(c, agencyId) {
  await c.query(
    `UPDATE agency_assistants x SET ended_at = now(), end_reason = 'left' FROM users u
      WHERE u.id = x.user_id AND x.agency_id = $1 AND x.ended_at IS NULL AND NOT ${MEMBER}`,
    [agencyId],
  );
  await closeStale(c, 'r.agency_id = $1', [agencyId]);
}

export const agencyAssistantRoutes = {
  async 'GET /api/agency/assistants'(req, url) {
    const x = await ctx(db, req);
    const a = await ownerOf(db, x, url.searchParams.get('id'), { centre: 'agencies.view' });
    const r = await db.query(`${ROW} WHERE x.agency_id = $1 AND x.ended_at IS NULL ORDER BY x.assigned_at`, [a.id]);
    const assistants = [];
    for (const row of r.rows) assistants.push(await viewOf(db, row));
    const max = x.s.assistant_policy.max;
    const open = assistants.filter((v) => v.member).length;
    return { max, open, canAdd: a.status === 'approved' && x.acc.owned.has(a.id) && open < max, weekStart: weekStart(new Date()), nextWeek: nextWeekStart(new Date()), assistants };
  },

  async 'GET /api/agency/assistants/candidates'(req, url) {
    const x = await ctx(db, req);
    const a = await ownerOf(db, x, url.searchParams.get('id'));
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length > 40) bad('Arama en fazla 40 karakter olabilir');
    const esc = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const r = await db.query(
      `SELECT u.id, u.name, u.avatar_url,
              EXISTS (SELECT 1 FROM staff_assignments s WHERE s.user_id = u.id AND s.agency_id = $1 AND s.revoked_at IS NULL) AS staff
         FROM users u
        WHERE u.deleted_at IS NULL AND u.id <> $2 AND ${MEMBER}
          AND NOT EXISTS (SELECT 1 FROM agency_assistants x WHERE x.user_id = u.id AND x.ended_at IS NULL)
          AND ($3 = '' OR u.name ILIKE $4 OR u.username ILIKE $4)
        ORDER BY u.name, u.id LIMIT 30`,
      [a.id, a.owner_id, q, `%${esc}%`],
    );
    return { users: r.rows.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? null, role: u.staff ? 'staff' : 'streamer' })) };
  },

  async 'POST /api/agency/assistants/add'(req) {
    const b = await readJson(req);
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      // The agency row is locked: two adds at once can't both pass the limit.
      const a = await ownerOf(c, x, b.id, { lock: true });
      if (a.status !== 'approved') throw new HttpError(409, 'Ajans aktif değil');
      const user = uuid(b.user, 'kullanıcı');
      const pct = pctOf(b.pct);
      if (user === a.owner_id) bad('Ajans sahibi kendi asistanı olamaz');
      const p = await c.query(`SELECT u.id, u.name, ${MEMBER} AS member FROM users u WHERE u.id = $2 AND u.deleted_at IS NULL`, [a.id, user]);
      if (!p.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      if (!p.rows[0].member) throw new HttpError(409, 'Asistan, ajansının yayıncılarından ya da ekibinden biri olmalı');
      await endGone(c, a.id);
      const max = x.s.assistant_policy.max;
      const open = (await c.query('SELECT count(*)::int AS n FROM agency_assistants WHERE agency_id = $1 AND ended_at IS NULL', [a.id])).rows[0].n;
      if (open >= max) throw new HttpError(409, max === 0 ? 'Şu an asistan eklenemiyor' : `Şu an en fazla ${max} asistan ekleyebilirsin`);
      const wk = weekStart(new Date());
      const again = await c.query("SELECT 1 FROM agency_assistants WHERE agency_id = $1 AND user_id = $2 AND end_reason = 'owner' AND ended_at >= $3", [a.id, user, wk]);
      if (again.rowCount) throw new HttpError(409, 'Bu hafta asistanlıktan çıkardığın kişiyi gelecek hafta yeniden ekleyebilirsin');
      let row = null;
      for (let i = 0; i < 5 && !row; i++) {
        const code = await freeJoinCode(c);
        try {
          await c.query('SAVEPOINT asst');
          row = (await c.query('INSERT INTO agency_assistants (agency_id, user_id, code, assigned_by) VALUES ($1, $2, $3, $4) RETURNING *', [a.id, user, code, x.u.id])).rows[0];
          await c.query('RELEASE SAVEPOINT asst');
        } catch (e) {
          await c.query('ROLLBACK TO SAVEPOINT asst');
          if (e.code !== '23505') throw e;
          if (e.constraint === 'agency_assistants_open_user') throw new HttpError(409, 'Bu kişi zaten bir ajansın asistanı');
        }
      }
      if (!row) throw new HttpError(500, 'Asistan kodu üretilemedi');
      await c.query('INSERT INTO agency_assistant_shares (assistant_id, streamer_pct, effective_from, initial, set_by) VALUES ($1, $2, $3, true, $4)', [row.id, pct, row.assigned_at, x.u.id]);
      await audit(c, x.u.id, 'assistant.add', 'agency', a.id, { after: { assistant: Number(row.id), user, pct } });
      await notice(c, a.id, 'team', `${p.rows[0].name} kişisine asistanlık teklifi gitti`, `Pay: getirdiği yayıncıların kazancından ajans komisyonunun %${pct}'i. Onaylayınca başlar.`);
      const v = (await c.query(`${ROW} WHERE x.id = $1`, [row.id])).rows[0];
      return { assistant: await viewOf(c, v), notify: { user, agency: a.name, pct } };
    });
    notify([out.notify.user], { title: 'Asistanlık teklifi', body: `${out.notify.agency} seni asistan yapmak istiyor: getirdiğin yayıncıların kazancından ajans komisyonunun %${out.notify.pct}'i. Onayla ya da reddet.`, data: { type: 'assistant_removal' } });
    return { assistant: out.assistant };
  },

  async 'POST /api/agency/assistants/share'(req) {
    const b = await readJson(req);
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      const a = await ownerOf(c, x, b.id, { centre: 'agencies.manage' });
      // The share is agreed once, with the assistant's yes (owners, 26 Nov 2026): the owner can't change it; management may.
      if (x.acc.owned.has(a.id) && !x.acc.admin) throw new HttpError(403, 'Asistan payı anlaşıldıktan sonra değiştirilemez. Değişiklik için yönetimle görüş.');
      const pct = pctOf(b.pct);
      const r = await c.query(`${ROW} WHERE x.id = $1 AND x.agency_id = $2 AND x.ended_at IS NULL FOR UPDATE OF x`, [idOf(b.assistantId), a.id]);
      if (!r.rowCount) throw new HttpError(404, 'Asistan bulunamadı');
      const row = r.rows[0];
      const now = new Date();
      const from = nextWeekStart(now);
      const week = await c.query('SELECT streamer_pct, effective_from FROM agency_assistant_shares WHERE assistant_id = $1 AND initial = false AND created_at >= $2 ORDER BY id DESC LIMIT 1', [row.id, weekStart(now)]);
      // The same change sent twice (a double tap) is the one already made.
      if (week.rowCount && week.rows[0].streamer_pct === pct) return { assistant: await viewOf(c, row), replay: true };
      if (week.rowCount) throw new HttpError(409, 'Pay her takvim haftasında bir kez değiştirilebilir; yeni değişikliği pazartesiden sonra yapabilirsin');
      const last = await c.query('SELECT streamer_pct FROM agency_assistant_shares WHERE assistant_id = $1 ORDER BY effective_from DESC, id DESC LIMIT 1', [row.id]);
      if (last.rows[0]?.streamer_pct === pct) throw new HttpError(409, `Pay zaten %${pct}`);
      await c.query('INSERT INTO agency_assistant_shares (assistant_id, streamer_pct, effective_from, set_by) VALUES ($1, $2, $3, $4)', [row.id, pct, from, x.u.id]);
      await audit(c, x.u.id, 'assistant.share', 'agency', a.id, { before: { pct: last.rows[0]?.streamer_pct ?? null }, after: { assistant: Number(row.id), pct, from } });
      return { assistant: await viewOf(c, row), replay: false, notify: { user: row.user_id, agency: a.name, pct } };
    });
    if (out.notify) notify([out.notify.user], { title: 'Asistan payın değişiyor', body: `${out.notify.agency}: payın pazartesiden itibaren %${out.notify.pct} olacak.`, data: { type: 'agency_assistant' } });
    return { assistant: out.assistant, replay: out.replay };
  },

  async 'POST /api/agency/assistants/remove'(req) {
    const b = await readJson(req);
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      const a = await ownerOf(c, x, b.id, { centre: 'agencies.manage' });
      const id = idOf(b.assistantId);
      const own = (await c.query(`${ROW} WHERE x.id = $1 AND x.agency_id = $2 AND x.ended_at IS NULL FOR UPDATE OF x`, [id, a.id])).rows[0];
      if (!own) throw new HttpError(404, 'Asistan bulunamadı');
      // An offer not yet answered: the owner takes it back at once (nothing had started).
      if (!own.accepted_at && x.acc.owned.has(a.id)) {
        await c.query("UPDATE agency_assistants SET ended_at = now(), ended_by = $2, end_reason = 'withdrawn' WHERE id = $1", [id, x.u.id]);
        await audit(c, x.u.id, 'assistant.offer_withdraw', 'agency', a.id, { after: { assistant: id } });
        return { removed: true, request: null };
      }
      // The centre (not the owner): ended at once, as before; any open request is closed.
      if (!x.acc.owned.has(a.id)) {
        await endAssistant(c, id, x.u.id, 'center');
        await closeStale(c, 'r.assistant_id = $1', [id]);
        await audit(c, x.u.id, 'assistant.remove', 'agency', a.id, { after: { assistant: id, user: own.user_id } });
        return { removed: true, request: null, user: own.user_id, agency: a.name, ended: true };
      }
      // The owner asks the assistant (owners, 25 Nov 2026). A second tap gets the same open request.
      const open = await c.query(`${REMOVAL} WHERE r.assistant_id = $1 AND r.status IN ('pending', 'rejected', 'disputed')`, [id]);
      if (open.rowCount) {
        const o = open.rows[0];
        if (o.status === 'pending') return { removed: false, request: removalView(o), replay: true };
        throw new HttpError(409, o.status === 'rejected' ? `${own.user_name} isteği reddetti. Yönetime itiraz edebilirsin.` : 'İtiraz yönetimde; yönetim seninle iletişime geçecek.');
      }
      const r = (await c.query('INSERT INTO agency_assistant_removals (assistant_id, agency_id, user_id, asked_by) VALUES ($1, $2, $3, $4) RETURNING id', [id, a.id, own.user_id, x.u.id])).rows[0];
      await audit(c, x.u.id, 'assistant.remove_ask', 'agency', a.id, { after: { assistant: id, user: own.user_id, request: Number(r.id) } });
      const v = removalView((await c.query(`${REMOVAL} WHERE r.id = $1`, [r.id])).rows[0]);
      return { removed: false, request: v, user: own.user_id, agency: a.name, asked: true, name: own.user_name };
    });
    if (out.ended) notify([out.user], { title: 'Ajans asistanlığın sona erdi', body: `${out.agency}: bundan sonraki kazançlardan asistan payı yazılmaz.`, data: { type: 'agency_assistant' } });
    if (out.asked) notify([out.user], { title: 'Asistanlıktan çıkarma isteği', body: `${out.agency} seni asistanlıktan çıkarmak istiyor. Onayla, reddet ya da itiraz et.`, data: { type: 'assistant_removal' } });
    // An older app (no `ask`) said "ended" on any answer: it is told what happens now instead (the request stands).
    if (out.asked && b.ask !== true) throw new HttpError(409, `İsteğin ${out.name} kişisine gönderildi: onaylarsa asistanlıktan çıkar. Durumunu görmek için uygulamayı güncelle.`);
    return { removed: out.removed, request: out.request };
  },

  /** The person named answers the offer: accept (it starts now, with the share agreed) or reject (nothing starts). */
  async 'POST /api/agency/assistants/offer/answer'(req) {
    const b = await readJson(req);
    const answer = ['accept', 'reject'].includes(b.answer) ? b.answer : bad('Geçersiz cevap');
    const out = await tx(async (c) => {
      const u = await auth(req);
      const row = (await c.query(`${ROW} WHERE x.id = $1 FOR UPDATE OF x`, [idOf(b.assistantId)])).rows[0];
      if (!row || row.user_id !== u.id) throw new HttpError(404, 'Teklif bulunamadı');
      if (row.accepted_at && answer === 'accept') return { assistant: await viewOf(c, row), replay: true };
      if (row.ended_at || row.accepted_at) throw new HttpError(409, 'Bu teklife artık cevap verilemez');
      if (answer === 'accept') {
        await c.query('UPDATE agency_assistants SET accepted_at = now(), assigned_at = now() WHERE id = $1', [row.id]);
        // The agreed share (written when offered; shares are never changed) applies from now: nothing earlier counts.
        await notice(c, row.agency_id, 'team', `${row.user_name} ajans asistanı oldu`, 'Asistanlık teklifini onayladı.');
      } else {
        await c.query("UPDATE agency_assistants SET ended_at = now(), end_reason = 'declined' WHERE id = $1", [row.id]);
        await notice(c, row.agency_id, 'team', `${row.user_name} asistanlık teklifini reddetti`, '');
      }
      await audit(c, u.id, `assistant.offer_${answer}`, 'agency', row.agency_id, { after: { assistant: Number(row.id) } });
      const owner = (await c.query('SELECT owner_id FROM agencies WHERE id = $1', [row.agency_id])).rows[0]?.owner_id;
      const v = await viewOf(c, (await c.query(`${ROW} WHERE x.id = $1`, [row.id])).rows[0]);
      return { assistant: v, owner, name: row.user_name, answer };
    });
    if (!out.replay && out.owner)
      notify([out.owner], { title: 'Asistanlık teklifi', body: out.answer === 'accept' ? `${out.name} teklifini onayladı; artık ajans asistanın.` : `${out.name} asistanlık teklifini reddetti.`, data: { type: 'agency_assistant' } });
    return { assistant: out.assistant };
  },

  /** The assistant answers: accept (it ends now), reject (it stays; the owner may dispute) or dispute (to management). */
  async 'POST /api/agency/assistants/removal/answer'(req) {
    const b = await readJson(req);
    const answer = ['accept', 'reject', 'dispute'].includes(b.answer) ? b.answer : bad('Geçersiz cevap');
    const note = answer === 'dispute' ? text(b.note, 3, 500, 'İtiraz açıklaması') : null;
    const out = await tx(async (c) => {
      const u = await auth(req);
      const r = (await c.query(`${REMOVAL} WHERE r.id = $1 FOR UPDATE OF r`, [idOf(b.requestId)])).rows[0];
      if (!r || r.user_id !== u.id) throw new HttpError(404, 'İstek bulunamadı');
      const same = { accept: 'accepted', reject: 'rejected', dispute: 'disputed' }[answer];
      // The same answer sent twice (a double tap) is the one already given.
      if (r.status === same && (answer !== 'dispute' || r.disputed_by === 'assistant')) return { request: removalView(r), replay: true };
      if (r.status !== 'pending') throw new HttpError(409, 'Bu isteğe artık cevap verilemez');
      const live = (await c.query('SELECT 1 FROM agency_assistants WHERE id = $1 AND ended_at IS NULL', [r.assistant_id])).rowCount;
      if (!live) {
        await c.query("UPDATE agency_assistant_removals SET status = 'closed', resolved_at = now() WHERE id = $1", [r.id]);
        throw new HttpError(409, 'Asistanlığın zaten sona ermiş');
      }
      if (answer === 'accept') {
        await c.query("UPDATE agency_assistant_removals SET status = 'accepted', answered_at = now() WHERE id = $1", [r.id]);
        await endAssistant(c, r.assistant_id, u.id, 'owner');
      } else if (answer === 'reject') {
        await c.query("UPDATE agency_assistant_removals SET status = 'rejected', answered_at = now() WHERE id = $1", [r.id]);
      } else {
        await c.query("UPDATE agency_assistant_removals SET status = 'disputed', disputed_by = 'assistant', dispute_note = $2, answered_at = now(), disputed_at = now() WHERE id = $1", [r.id, note]);
      }
      await audit(c, u.id, `assistant.remove_${answer}`, 'agency', r.agency_id, { after: { request: Number(r.id), assistant: Number(r.assistant_id), note } });
      const v = removalView((await c.query(`${REMOVAL} WHERE r.id = $1`, [r.id])).rows[0]);
      return { request: v, owner: r.asked_by, name: r.assistant_name, answer };
    });
    if (!out.replay) {
      const body = {
        accept: `${out.name} isteğini onayladı; artık ajans asistanı değil.`,
        reject: `${out.name} isteğini reddetti; asistanlığı sürüyor. Yönetime itiraz edebilirsin.`,
        dispute: `${out.name} isteğine itiraz etti. Konu yönetime aktarıldı; yönetim iki tarafla iletişime geçecek.`,
      }[out.answer];
      notify([out.owner], { title: 'Asistanlıktan çıkarma isteği', body, data: { type: 'agency_assistant' } });
    }
    return { request: out.request };
  },

  /** The owner disputes a rejection: management decides. */
  async 'POST /api/agency/assistants/removal/dispute'(req) {
    const b = await readJson(req);
    const note = text(b.note, 3, 500, 'İtiraz açıklaması');
    const out = await tx(async (c) => {
      const u = await auth(req);
      const r = (await c.query(`${REMOVAL} WHERE r.id = $1 FOR UPDATE OF r`, [idOf(b.requestId)])).rows[0];
      const own = r && (await ownerOfAgency(c, r.agency_id));
      if (!r || own?.owner_id !== u.id) throw new HttpError(404, 'İstek bulunamadı');
      if (r.status === 'disputed' && r.disputed_by === 'owner') return { request: removalView(r), replay: true };
      if (r.status !== 'rejected') throw new HttpError(409, r.status === 'pending' ? 'Asistan henüz cevap vermedi' : 'Bu isteğe artık itiraz edilemez');
      await c.query("UPDATE agency_assistant_removals SET status = 'disputed', disputed_by = 'owner', dispute_note = $2, disputed_at = now() WHERE id = $1", [r.id, note]);
      await audit(c, u.id, 'assistant.remove_dispute', 'agency', r.agency_id, { after: { request: Number(r.id), assistant: Number(r.assistant_id), note } });
      return { request: removalView((await c.query(`${REMOVAL} WHERE r.id = $1`, [r.id])).rows[0]), user: r.user_id, agency: own.name };
    });
    if (!out.replay) notify([out.user], { title: 'Asistanlık itirazı yönetimde', body: `${out.agency} ajans sahibi itiraz etti. Yönetim iki tarafla iletişime geçecek.`, data: { type: 'assistant_removal' } });
    return { request: out.request };
  },

  // --- Yönetim (the panel): disputes to settle by talking to both sides ---
  async 'GET /api/admin/agency/assistant-removals'(req, url) {
    const x = await ctx(db, req);
    await needPlatform(db, x.acc, 'agencies.view', req.url);
    const all = url.searchParams.get('status') === 'all';
    const r = await db.query(`${REMOVAL} ${all ? '' : "WHERE r.status = 'disputed'"} ORDER BY r.status = 'disputed' DESC, r.id DESC LIMIT 200`);
    return { requests: r.rows.map(removalView) };
  },

  async 'POST /api/admin/agency/assistant-removals/resolve'(req) {
    const b = await readJson(req);
    const outcome = ['remove', 'keep'].includes(b.outcome) ? b.outcome : bad('Geçersiz karar');
    const note = text(b.note, 3, 500, 'Karar notu');
    const out = await tx(async (c) => {
      const x = await ctx(c, req);
      await needPlatform(c, x.acc, 'agencies.manage', req.url);
      const r = (await c.query(`${REMOVAL} WHERE r.id = $1 FOR UPDATE OF r`, [idOf(b.requestId)])).rows[0];
      if (!r) throw new HttpError(404, 'İstek bulunamadı');
      const done = { remove: 'removed', keep: 'kept' }[outcome];
      if (r.status === done) return { request: removalView(r), replay: true };
      if (r.status !== 'disputed') throw new HttpError(409, 'Yalnız itiraz edilmiş istekler karara bağlanır');
      const ended = outcome === 'remove' ? await endAssistant(c, r.assistant_id, x.u.id, 'center') : null;
      await c.query('UPDATE agency_assistant_removals SET status = $2, resolved_at = now(), resolved_by = $3, resolution_note = $4 WHERE id = $1', [r.id, ended || outcome === 'keep' ? done : 'closed', x.u.id, note]);
      await audit(c, x.u.id, `assistant.remove_${outcome}`, 'agency', r.agency_id, { before: { status: r.status }, after: { request: Number(r.id), assistant: Number(r.assistant_id), outcome, note }, panelDetail: note });
      return { request: removalView((await c.query(`${REMOVAL} WHERE r.id = $1`, [r.id])).rows[0]), users: [r.user_id, r.asked_by], outcome, agency: r.agency_name, name: r.assistant_name };
    });
    if (!out.replay) {
      const body = out.outcome === 'remove' ? `Yönetim kararı: ${out.name} artık ${out.agency} ajansının asistanı değil.` : `Yönetim kararı: ${out.name} ${out.agency} ajansının asistanı olarak kalıyor.`;
      notify(out.users, { title: 'Asistanlık itirazı sonuçlandı', body, data: { type: 'agency_assistant' } });
    }
    return { request: out.request };
  },
};
