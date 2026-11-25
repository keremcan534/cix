// The centre's side of the agency network (platform management): the organisation tree, applications,
// status, rates and tiers by hand (with a reason, never back-dated), settings with history, performance runs,
// the commission ledger (income, reversal, adjustment, period close), payouts with separated duties,
// transfers and independence with transition commission, roles, BD, appeals, reports, background jobs.
// Each route checks one platform permission (PLATFORM_PERMS in agency-lib.mjs); users.role = admin holds all.
//
//   GET  /api/admin/agency/tree | overview | list | settings | performance | payouts | transfers | audit
//        | roles | staff | appeals | report | bd-report
//   POST /api/admin/agency/create | decide | status | rate | tier | parent | assign | settings
//        | performance/run | commissions/run | income | commissions/reverse | adjust | periods/close
//        | payouts/decide | transfers/decide | transition | roles | staff/set | staff/remove | bd | ops-score
//        | violation | appeals/decide | simulate | jobs/run
import { HttpError, REF, UUID, auth, db, env, readJson, text, tx } from './core.mjs';
import { payoutTl } from './catalog.mjs';
import { live } from './live-settings.mjs';
import {
  AGENCY_PERMS,
  CRITERIA,
  DEFAULTS,
  INCOME_TYPES,
  PLATFORM_PERMS,
  STATUS_LABEL,
  accessOf,
  agencyRow,
  audit,
  cadenceKey,
  chainAt,
  d4,
  e4,
  effectiveChain,
  fmt4,
  needPlatform,
  notice,
  parentFloor,
  periodEnd,
  periodOf,
  rateAt,
  rateView,
  recordIncome,
  reverseAssistantShares,
  settingsAt,
  tierName,
  topRate,
  usdOf,
  validateSetting,
} from './agency-lib.mjs';
import { activityJobs } from './agency-activity.mjs';
import { levelName, settleLevels } from './agency-levels.mjs';
import { levelFor } from './agency-level-rules.mjs';
import {
  approveAgency,
  approveTransfer,
  checkCanFoundSub,
  firstAgencyOfPerson,
  linkStreamer,
  moveParent,
  namesFor,
  payoutStep,
  rejectTransfer,
  setStatus,
  transferView,
  unlinkStreamer,
} from './agency-ops.mjs';
import { applyTier, calcPending, runPerformance } from './agency-perf.mjs';
import { PLAY_PAYOUT, insertAgency, playMoneyOn } from './agency.mjs';
import { openRoomOf, whoIs } from './public-no.mjs';

const TEST = env.ALLOW_TEST_TOPUP === '1';
const bad = (m) => {
  throw new HttpError(400, m);
};
const uuid = (v, what = 'kimlik') => (typeof v === 'string' && UUID.test(v) ? v : bad(`Geçersiz ${what}`));
const reasonOf = (v) => text(v, 3, 300, 'Gerekçe');
const n = (v) => Number(v ?? 0);
const dateParam = (v, dflt) => {
  if (!v) return dflt;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? bad('Geçersiz tarih') : d;
};
/** A future (or now) moment from input; a past one is refused: rules never change earnings already made. */
const notPast = (v) => {
  if (v === undefined || v === null) return new Date();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) bad('Geçersiz tarih');
  if (d.getTime() < Date.now() - 60e3) bad('Geçmiş tarihli değişiklik yapılamaz; geçmiş kazançlar değişmez');
  return d;
};
const rate4 = (v, max, f) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) bad(`${f} 0–${max} arasında olmalı`);
  if (Math.abs(Math.round(v * 1e4) - v * 1e4) > 1e-6) bad(`${f} en fazla 4 ondalık`);
  return Math.round(v * 1e4) / 1e4;
};

async function center(c, req, perm) {
  const u = await auth(req);
  const acc = await accessOf(c, u);
  const { values: s } = await settingsAt(c);
  if (perm) await needPlatform(c, acc, perm, req.url);
  return { u, acc, s };
}

const pctLabel = (r) => `%${(Math.round(r * 1e4) / 100).toLocaleString('tr-TR')}`;

// --- Background jobs ---------------------------------------------------------------------------------------
/**
 * Runs the periodic work once: missed commissions (and gift income a failed write left out), closing periods
 * past their grace days, the performance evaluation of the current cadence period (once), transfer decision
 * timeouts. Safe to run any number of times.
 */
export async function runJobs(now = new Date()) {
  const out = {};
  // Gift income that never reached income_events (a failed write during the gift) is added back.
  out.backfilled = (
    await db.query(
      `INSERT INTO income_events (streamer_id, source_type, source_ref, diamonds, occurred_at)
       SELECT g.recipient, 'gift', 'gift:' || g.id, g.total, g.created_at FROM gift_events g
        WHERE g.created_at > now() - interval '35 days' AND g.total > 0
          AND NOT EXISTS (SELECT 1 FROM income_events e WHERE e.source_ref = 'gift:' || g.id)
       ON CONFLICT (source_ref) DO NOTHING`,
    )
  ).rowCount;
  out.calc = await tx((c) => calcPending(c));
  const { values: s } = await settingsAt(db);
  // Periods with ledger rows that ended more than period_close_days ago are closed.
  const open = await db.query('SELECT DISTINCT period FROM agency_ledger l WHERE NOT EXISTS (SELECT 1 FROM agency_periods p WHERE p.period = l.period)');
  out.closed = [];
  for (const { period } of open.rows) {
    if (periodEnd(period).getTime() + s.period_close_days * 86400e3 <= now.getTime()) {
      await db.query('INSERT INTO agency_periods (period) VALUES ($1) ON CONFLICT DO NOTHING', [period]);
      out.closed.push(period);
    }
  }
  // Ajans seviyeleri (agency-levels.mjs): the week that ended is settled once. They replaced the performance
  // engine's monthly run, which no longer sets any rate (24 Nov 2026).
  out.levels = await settleLevels(now);
  // Transfer timeouts: the agency a streamer leaves did not answer in time → its approval is given by the rule.
  const late = await db.query(
    `SELECT id FROM agency_transfers WHERE status = 'pending' AND kind IN ('streamer_move', 'streamer_leave') AND 'from' = ANY(needs)
        AND NOT (approvals ? 'from') AND created_at < now() - make_interval(days => $1::int)`,
    [s.transfer_policy.decision_days],
  );
  out.timeouts = 0;
  for (const { id } of late.rows) {
    await tx(async (c) => {
      const t = (await c.query("SELECT * FROM agency_transfers WHERE id = $1 AND status = 'pending' FOR UPDATE", [id])).rows[0];
      if (!t || t.approvals.from) return;
      await approveTransfer(c, t, 'from', null, { mode: Number(t.fee) > 0 ? 'paid' : 'free', timeout: true });
      out.timeouts++;
    });
  }
  out.expired = (await db.query("UPDATE agency_transfers SET status = 'cancelled', decided_at = now(), decision_note = 'Süresi doldu' WHERE status = 'pending' AND created_at < now() - make_interval(days => greatest(30, $1::int + 1))", [s.transfer_policy.decision_days])).rowCount;
  Object.assign(out, await streamerPolicyJobs(s));
  // The 60-day rule and returns (agency-activity.mjs).
  Object.assign(out, await tx((c) => activityJobs(c)));
  return out;
}

/**
 * streamer_policy on links made before it (or around it): a man's account leaves its agency (women_only); an
 * account that joined an agency by its own choice while the same person's earlier account was in another goes
 * to that first agency (one_agency_per_person). Links made by a transfer or by the centre stay where they are.
 */
export async function streamerPolicyJobs(s) {
  const out = { policyGender: 0, multiAccount: 0 };
  if (s.streamer_policy.women_only) {
    const r = await db.query("UPDATE agency_streamers m SET ended_at = now(), end_reason = 'policy_gender' FROM users u WHERE u.id = m.streamer_id AND m.ended_at IS NULL AND u.gender = 'Erkek' RETURNING m.agency_id");
    out.policyGender = r.rowCount;
    for (const id of new Set(r.rows.map((x) => x.agency_id))) await notice(db, id, 'status', 'Erkek hesaplar ajanstan çıkarıldı', 'Ajanslarda yalnız kadın hesaplar yayıncı olabilir; erkek hesaplar katkısını Aile üyesi olarak verir.');
  }
  if (!s.streamer_policy.one_agency_per_person) return out;
  const dup = await db.query(
    `SELECT m.streamer_id FROM agency_streamers m WHERE m.ended_at IS NULL AND m.method IN ('code', 'link', 'invite', 'application')
        AND EXISTS (SELECT 1 FROM agency_streamers o JOIN agencies a ON a.id = o.agency_id
                     WHERE o.ended_at IS NULL AND a.status = 'approved' AND o.agency_id <> m.agency_id AND o.joined_at < m.joined_at
                       AND o.streamer_id IN (SELECT d2.user_id FROM device_accounts d1 JOIN device_accounts d2 ON d2.device_id = d1.device_id
                                              WHERE d1.user_id = m.streamer_id AND d2.user_id <> m.streamer_id))`,
  );
  for (const { streamer_id: id } of dup.rows) {
    try {
      await tx(async (c) => {
        const cur = (await c.query('SELECT agency_id FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL FOR UPDATE', [id])).rows[0];
        const first = await firstAgencyOfPerson(c, id);
        if (!cur || !first || first.id === cur.agency_id) return;
        await unlinkStreamer(c, id, 'multi_account');
        await linkStreamer(c, id, first, 'transfer', null);
        await audit(c, null, 'streamer.multi_account', 'streamer', id, { before: { agency: cur.agency_id }, after: { agency: first.id } });
        await notice(c, cur.agency_id, 'transfer', 'Bir yayıncın ilk ajansına taşındı', 'Aynı kişinin bu cihazdaki ilk hesabı başka bir ajansta; ikinci hesap da oraya bağlanır.');
        await notice(c, first.id, 'transfer', 'Yayıncının ikinci hesabı ajansına bağlandı', '');
        out.multiAccount++;
      });
    } catch (e) {
      console.error('agency multi-account', String(e?.message ?? e).slice(0, 200));
    }
  }
  return out;
}

if (env.AGENCY_JOBS !== '0') {
  const run = () => runJobs().catch((e) => console.error('agency jobs', String(e?.message ?? e).slice(0, 300)));
  setTimeout(run, 20_000).unref();
  setInterval(run, 10 * 60_000).unref();
}

// --- Routes ------------------------------------------------------------------------------------------------
/** Links the open room `no` names (the room's ID, its owner's) to agency `agencyId`; a 404 or 409 that says why. */
async function linkRoom(c, agencyId, no) {
  const owner = await whoIs(String(no ?? ''), c);
  const room = owner ? await openRoomOf(owner.id, c) : null;
  if (!room) throw new HttpError(404, 'Bu ID’de açık bir oda yok: odanın ID’sini (oda sahibinin ID’si) yazın');
  const taken = await c.query('SELECT name FROM agencies WHERE room_id = $1 AND id <> $2', [room.id, agencyId]);
  if (taken.rowCount) throw new HttpError(409, `Bu oda zaten ${taken.rows[0].name} ajansına bağlı`);
  await c.query('UPDATE agencies SET room_id = $2 WHERE id = $1', [agencyId, room.id]);
  return { id: room.id, title: room.title, no: owner.public_no === null || owner.public_no === undefined ? null : String(owner.public_no) };
}

export const agencyAdminRoutes = {
  async 'GET /api/admin/agency/tree'(req) {
    const x = await center(db, req);
    const all = x.acc.admin || x.acc.platform.has('agencies.view');
    if (!all && !x.acc.platform.has('bd.assigned')) await needPlatform(db, x.acc, 'agencies.view');
    const r = await db.query(
      `SELECT a.*, u.name AS owner_name,
         (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = a.id AND m.ended_at IS NULL)::int AS streamers,
         (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.agency_id = a.id AND k.occurred_at > now() - interval '30 days') AS volume30,
         (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.chain @> ARRAY[a.id] AND k.occurred_at > now() - interval '30 days') AS org_volume30,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_ledger l WHERE l.agency_id = a.id AND l.created_at > now() - interval '30 days') AS earned30,
         (SELECT row_to_json(z) FROM (SELECT sc.score, sc.rank, sc.overtakes, sc.flags FROM agency_perf_scores sc JOIN agency_perf_runs pr ON pr.id = sc.run_id
             WHERE sc.agency_id = a.id AND pr.dry_run = false ORDER BY sc.run_id DESC LIMIT 1) z) AS perf,
         (SELECT b.bd_id FROM bd_assignments b WHERE b.agency_id = a.id AND b.ended_at IS NULL) AS bd_id,
         (SELECT row_to_json(z) FROM (SELECT bu.name, bu.public_no::text AS no FROM bd_assignments b JOIN users bu ON bu.id = b.bd_id WHERE b.agency_id = a.id AND b.ended_at IS NULL LIMIT 1) z) AS bd_user,
         u.public_no AS owner_no,
         (SELECT row_to_json(z) FROM (SELECT ro.id, ro.title, ru.public_no::text AS no FROM rooms ro JOIN users ru ON ru.id = ro.owner WHERE ro.id = a.room_id AND ro.closed_at IS NULL) z) AS room
       FROM agencies a LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.status IN ('approved', 'suspended', 'pending', 'draft') ORDER BY a.level, a.name LIMIT 5000`,
    );
    const rows = all ? r.rows : r.rows.filter((a) => x.acc.bd.has(a.id));
    const nodes = [];
    for (const a of rows) {
      const live = a.status === 'approved' || a.status === 'suspended';
      const rv = live ? await rateView(db, a, x.s) : null;
      nodes.push({
        id: a.id,
        parentId: a.parent_id,
        name: a.name,
        code: a.code,
        level: a.level,
        status: a.status,
        owner: a.owner_name,
        tier: a.level_key ?? null,
        tierName: levelName(x.s, a.level_key),
        // Aday ajans / aktif ajans as the agency job last worked it out (agency-activity.mjs).
        // Aday ajans ended (24 Nov 2026): none, so no card shows it.
        activity: null,
        streamers: a.streamers,
        volume30: n(a.volume30),
        orgVolume30: n(a.org_volume30),
        earned30: d4(a.earned30),
        rate: rv?.rate ?? null,
        parentShare: rv?.parentShare ?? null,
        upcoming: rv?.upcoming ?? null,
        score: a.perf ? n(a.perf.score) : null,
        rank: a.perf?.rank ?? null,
        overtakes: a.perf?.overtakes ?? false,
        flags: a.perf?.flags ?? [],
        bd: a.bd_id,
        // The BD and the owner as staff know them: name and ID in the app (bd above stays for the calls).
        bdName: a.bd_user?.name ?? null,
        bdNo: a.bd_user?.no ?? null,
        ownerNo: a.owner_no === null || a.owner_no === undefined ? null : String(a.owner_no),
        // Its own room (owners, 25 Nov 2026), while open: { id, title, no }.
        room: a.room ?? null,
      });
    }
    return { nodes, poolCap: x.s.pool_cap, topRate: x.s.top_rate };
  },

  async 'GET /api/admin/agency/overview'(req) {
    const x = await center(db, req, 'agencies.view');
    const r = (
      await db.query(
        `SELECT (SELECT count(*) FROM agencies WHERE level = 1 AND status = 'approved')::int AS tops,
                (SELECT count(*) FROM agencies WHERE level > 1 AND status = 'approved')::int AS subs,
                (SELECT count(*) FROM agencies WHERE status = 'suspended')::int AS suspended,
                (SELECT count(*) FROM agencies WHERE status = 'pending')::int AS pending,
                (SELECT count(*) FROM agency_streamers WHERE ended_at IS NULL)::int AS streamers,
                (SELECT coalesce(sum(base_diamonds), 0) FROM agency_commissions WHERE occurred_at > now() - interval '30 days') AS base30,
                (SELECT coalesce(sum(agency_amount + parent_amount + transition_amount), 0) FROM agency_commissions WHERE occurred_at > now() - interval '30 days') AS commission30,
                (SELECT coalesce(sum(amount), 0) FROM bd_ledger WHERE created_at > now() - interval '30 days') AS bd30,
                (SELECT coalesce(sum(amount), 0) FROM agency_payouts WHERE status IN ('pending', 'ready')) AS payouts_open,
                (SELECT count(*) FROM agency_payouts WHERE status IN ('pending', 'ready'))::int AS payouts_open_count,
                (SELECT count(*) FROM agency_transfers WHERE status = 'pending' AND 'center' = ANY(needs) AND NOT (approvals ? 'center'))::int AS transfers_waiting,
                (SELECT count(*) FROM agency_appeals WHERE status = 'open')::int AS appeals_open,
                (SELECT count(*) FROM income_events WHERE calc_status = 'pending')::int AS calc_pending`,
      )
    ).rows[0];
    return { ...r, base30: n(r.base30), commission30: d4(r.commission30), bd30: d4(r.bd30), payouts_open: d4(r.payouts_open), usd: { base30: usdOf(r.base30), commission30: usdOf(r.commission30) }, poolCap: x.s.pool_cap };
  },

  /**
   * The finance panel's Ajans / BD / Yayıncı lists, taken from here (owners, 22 Nov 2026: they were typed in by hand
   * there, and a streamer the panel didn't know stayed "unmatched"): every agency with its code, status, upper agency,
   * BD and its commission rate now; every BD with an agency; every streamer in an agency now. Read only.
   */
  async 'GET /api/admin/agency/finance-roster'(req) {
    const x = await center(db, req, 'agencies.view');
    const [agencies, bds, streamers] = await Promise.all([
      db.query(
        `SELECT a.*, b.bd_id FROM agencies a LEFT JOIN bd_assignments b ON b.agency_id = a.id AND b.ended_at IS NULL
          WHERE a.status IN ('approved', 'suspended', 'closed') ORDER BY a.level, a.name LIMIT 5000`,
      ),
      db.query(
        `SELECT DISTINCT u.id, u.name, u.public_no FROM bd_assignments b JOIN users u ON u.id = b.bd_id WHERE b.ended_at IS NULL AND u.deleted_at IS NULL ORDER BY u.name LIMIT 5000`,
      ),
      db.query(
        `SELECT m.streamer_id, m.agency_id, u.name, u.public_no FROM agency_streamers m JOIN users u ON u.id = m.streamer_id
          WHERE m.ended_at IS NULL AND u.deleted_at IS NULL ORDER BY m.joined_at LIMIT 50000`,
      ),
    ]);
    const out = [];
    for (const a of agencies.rows) {
      const rv = a.status === 'closed' ? null : await rateView(db, a, x.s);
      out.push({ id: a.id, code: a.code, name: a.name, status: a.status, parentId: a.parent_id, bd: a.bd_id ?? null, rate: rv?.rate ?? null });
    }
    return {
      agencies: out,
      bds: bds.rows.map((u) => ({ id: u.id, name: u.name, publicNo: u.public_no === null ? null : String(u.public_no) })),
      streamers: streamers.rows.map((m) => ({ id: m.streamer_id, name: m.name, publicNo: m.public_no === null ? null : String(m.public_no), agencyId: m.agency_id })),
      topRate: x.s.top_rate,
      poolCap: x.s.pool_cap,
    };
  },

  async 'GET /api/admin/agency/list'(req, url) {
    const x = await center(db, req, 'agencies.view');
    const q = url.searchParams;
    const vals = [];
    const where = [];
    if (q.get('status')) where.push(`a.status = $${vals.push(q.get('status'))}`);
    if (q.get('pendingWith')) where.push(`a.pending_with = $${vals.push(q.get('pendingWith'))}`);
    if (q.get('q')) where.push(`(a.name ILIKE $${vals.push(`%${q.get('q')}%`)} OR a.code = upper($${vals.length}))`);
    const r = await db.query(
      `SELECT a.*, u.name AS owner_name, p.name AS parent_name FROM agencies a LEFT JOIN users u ON u.id = a.owner_id LEFT JOIN agencies p ON p.id = a.parent_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.created_at DESC LIMIT 300`,
      vals,
    );
    return {
      agencies: r.rows.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        level: a.level,
        status: a.status,
        pendingWith: a.pending_with,
        parent: a.parent_id ? { id: a.parent_id, name: a.parent_name } : null,
        owner: a.owner_id ? { id: a.owner_id, name: a.owner_name } : null,
        country: a.country,
        region: a.region,
        contact: { name: a.contact_name, phone: a.contact_phone, email: a.contact_email },
        expectedStreamers: a.expected_streamers,
        description: a.description,
        tier: a.level_key ?? null,
        tierName: levelName(x.s, a.level_key),
        // Aday ajans ended (24 Nov 2026): none, so no card shows it.
        activity: null,
        createdAt: a.created_at,
      })),
    };
  },

  /**
   * An agency's own room (owners, 25 Nov 2026): { agencyId, roomNo } links the open room that ID names (the room's ID
   * is its owner's); roomNo null takes the link off. Odalar shows the room under the agency's name.
   */
  async 'POST /api/admin/agency/room'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      const a = await agencyRow(c, uuid(b.agencyId, 'ajans'), true);
      const room = b.roomNo === null || b.roomNo === '' ? null : await linkRoom(c, a.id, b.roomNo);
      if (!room) await c.query('UPDATE agencies SET room_id = NULL WHERE id = $1', [a.id]);
      await audit(c, x.u.id, 'agency.room', 'agency', a.id, { before: { room: a.room_id ?? null }, after: { room: room?.id ?? null } });
      return { room };
    });
  },

  async 'POST /api/admin/agency/create'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      let parent = null;
      if (b.parentId) {
        parent = await agencyRow(c, uuid(b.parentId, 'üst ajans'), true);
        await checkCanFoundSub(c, parent, x.s);
      }
      const a = await insertAgency(c, b, { parent, owner: b.owner ? uuid(b.owner, 'yönetici') : null, actor: x.u.id, status: 'pending', pendingWith: 'center' });
      await approveAgency(c, a, x.u.id, 'Merkez oluşturdu');
      // Its own room, by the room's ID (owners, 25 Nov 2026): a wrong ID stops the founding, nothing is kept.
      const room = b.roomNo ? await linkRoom(c, a.id, b.roomNo) : null;
      if (room) await audit(c, x.u.id, 'agency.room', 'agency', a.id, { before: { room: null }, after: { room: room.id } });
      return { agency: { id: a.id, code: a.code, name: a.name, level: a.level, status: 'approved', room } };
    });
  },

  async 'POST /api/admin/agency/decide'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (a.status !== 'pending') throw new HttpError(409, 'Bu başvuru onay beklemiyor');
      if (b.approve === true) {
        if (a.parent_id) await checkCanFoundSub(c, await agencyRow(c, a.parent_id), x.s);
        await approveAgency(c, a, x.u.id, b.note ?? '');
      } else {
        const note = reasonOf(b.note);
        await setStatus(c, a, 'rejected', x.u.id, note);
        await audit(c, x.u.id, 'agency.reject', 'agency', a.id, { reason: note });
      }
      return { status: a.status === 'pending' ? 'approved' : a.status };
    });
  },

  async 'POST /api/admin/agency/status'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      const reason = reasonOf(b.reason);
      const from = a.status;
      if (b.status === 'suspended') {
        if (a.status !== 'approved') throw new HttpError(409, 'Yalnızca aktif ajans askıya alınır');
      } else if (b.status === 'approved') {
        if (a.status !== 'suspended') throw new HttpError(409, 'Yalnızca askıdaki ajans yeniden açılır');
      } else if (b.status === 'closed') {
        if (!['approved', 'suspended'].includes(a.status)) throw new HttpError(409, 'Ajans açık değil');
        const subs = await c.query("SELECT 1 FROM agencies WHERE parent_id = $1 AND status IN ('draft', 'pending', 'approved', 'suspended')", [a.id]);
        if (subs.rowCount) throw new HttpError(409, 'Önce alt ajansları kapat veya taşı');
        const ended = await c.query("UPDATE agency_streamers SET ended_at = now(), end_reason = 'agency_closed' WHERE agency_id = $1 AND ended_at IS NULL", [a.id]);
        await c.query('UPDATE agency_parents SET valid_to = now() WHERE agency_id = $1 AND valid_to IS NULL', [a.id]);
        await c.query("UPDATE agency_requests SET status = 'cancelled', decided_at = now() WHERE agency_id = $1 AND status = 'pending'", [a.id]);
        b.ended = ended.rowCount;
      } else bad('Durum: suspended, approved veya closed');
      // Financial history stays as it is: ledger, commissions and payouts are never touched by a status change.
      await setStatus(c, a, b.status, x.u.id, reason);
      await notice(c, a.id, 'status', b.status === 'suspended' ? 'Ajansın askıya alındı' : b.status === 'closed' ? 'Ajansın kapatıldı' : 'Ajansın yeniden aktif', reason);
      await audit(c, x.u.id, 'agency.status', 'agency', a.id, { before: { status: from }, after: { status: b.status, streamersReleased: b.ended ?? 0 }, reason });
      return { status: b.status };
    });
  },

  /** A manual rate correction: from now or a future date, with a reason; optionally held from the engine. */
  async 'POST /api/admin/agency/rate'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.rates');
      // Ajans seviyeleri (24 Nov 2026): the week's level sets the rate.
      if (x) throw new HttpError(409, 'Komisyon oranı artık haftalık ajans seviyesinden gelir; elle oran ve kademe verilmez (Ajans seviyeleri)');
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (!['approved', 'suspended'].includes(a.status)) throw new HttpError(409, 'Ajans açık değil');
      const rate = rate4(b.rate, x.s.pool_cap, 'Oran (havuz sınırı)');
      const reason = reasonOf(b.reason);
      const eff = notPast(b.effectiveFrom);
      const before = await rateAt(c, a.id, new Date());
      const floor = a.parent_id ? parentFloor(x.s, a.tier) : 0;
      if (a.parent_id) {
        const parentRate = topRate(await rateAt(c, a.parent_id, eff), x.s);
        if (e4(rate) > parentRate - e4(floor)) bad(`Alt ajans oranı üst ajansın oranından asgari payı (${pctLabel(floor)}) düşünce kalan ${pctLabel((parentRate - e4(floor)) / 1e4)} sınırını aşamaz`);
      }
      const r = await c.query("INSERT INTO agency_rates (agency_id, rate, parent_floor, tier, source, effective_from, reason, set_by) VALUES ($1,$2,$3,$4,'manual',$5,$6,$7) RETURNING id", [a.id, rate, floor, a.tier, eff, reason, x.u.id]);
      await c.query("INSERT INTO agency_tier_history (agency_id, from_tier, to_tier, from_rate, to_rate, effective_from, source, rate_id, actor_id, reason) VALUES ($1,$2,$2,$3,$4,$5,'manual',$6,$7,$8)", [a.id, a.tier, before?.rate ?? null, rate, eff, r.rows[0].id, x.u.id, reason]);
      if (b.holdUntil) await c.query('UPDATE agencies SET tier_hold_until = $2 WHERE id = $1', [a.id, notPast(b.holdUntil)]);
      await notice(c, a.id, 'rate', `Komisyon oranın ${pctLabel(rate)} olarak düzeltildi`, `${eff.toISOString().slice(0, 10)} tarihinden itibaren. Gerekçe: ${reason}`);
      await audit(c, x.u.id, 'agency.rate', 'agency', a.id, { before: { rate: before ? n(before.rate) : null }, after: { rate, effectiveFrom: eff, holdUntil: b.holdUntil ?? null }, reason });
      return { rateId: Number(r.rows[0].id), rate, effectiveFrom: eff };
    });
  },

  async 'POST /api/admin/agency/tier'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.rates');
      if (x) throw new HttpError(409, 'Komisyon oranı artık haftalık ajans seviyesinden gelir; elle oran ve kademe verilmez (Ajans seviyeleri)');
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (!a.parent_id || !['approved', 'suspended'].includes(a.status)) throw new HttpError(409, 'Kademe yalnızca açık alt ajanslarda');
      if (!x.s.tiers.some((t) => t.key === b.tier)) bad('Kademe bulunamadı');
      const reason = reasonOf(b.reason);
      const before = { tier: a.tier };
      const r = await applyTier(c, a, b.tier, notPast(b.effectiveFrom), { source: 'manual', actor: x.u.id, reason });
      if (b.holdUntil) await c.query('UPDATE agencies SET tier_hold_until = $2 WHERE id = $1', [a.id, notPast(b.holdUntil)]);
      await audit(c, x.u.id, 'agency.tier', 'agency', a.id, { before, after: { tier: b.tier, rate: r.rate, effectiveFrom: r.effectiveFrom }, reason });
      return r;
    });
  },

  async 'POST /api/admin/agency/parent'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (a.status !== 'approved') throw new HttpError(409, 'Ajans aktif değil');
      const to = b.parentId ? uuid(b.parentId, 'üst ajans') : null;
      if (to === a.parent_id) bad('Zaten bu üst ajansın altında');
      await moveParent(c, a, to, x.u.id, reasonOf(b.reason));
      return { parentId: to, level: to ? 2 : 1 };
    });
  },

  async 'POST /api/admin/agency/assign'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      const streamer = uuid(b.streamer, 'yayıncı');
      const reason = reasonOf(b.reason);
      const before = await unlinkStreamer(c, streamer, 'admin');
      if (b.agencyId) await linkStreamer(c, streamer, await agencyRow(c, uuid(b.agencyId, 'ajans'), true), 'admin', x.u.id);
      await audit(c, x.u.id, 'streamer.assign', 'streamer', streamer, { before: { agency: before?.agency_id ?? null }, after: { agency: b.agencyId ?? null }, reason });
      return { agencyId: b.agencyId ?? null };
    });
  },

  async 'GET /api/admin/agency/settings'(req) {
    const x = await center(db, req, 'agencies.view');
    const h = await db.query('SELECT s.id, s.key, s.value, s.reason, s.created_at, u.name AS set_by FROM agency_settings s LEFT JOIN users u ON u.id = s.set_by ORDER BY s.id DESC LIMIT 200');
    return { values: x.s, defaults: DEFAULTS, criteria: CRITERIA, incomeTypes: INCOME_TYPES, history: h.rows.map((r) => ({ ...r, id: Number(r.id) })) };
  },

  async 'POST /api/admin/agency/settings'(req) {
    const b = await readJson(req, 50_000);
    return tx(async (c) => {
      await c.query('LOCK TABLE agency_settings IN SHARE ROW EXCLUSIVE MODE');
      const x = await center(c, req, 'agencies.settings');
      if (typeof b.key !== 'string' || !(b.key in DEFAULTS)) bad('Bilinmeyen ayar');
      const reason = reasonOf(b.reason);
      const value = validateSetting(b.key, b.value, x.s);
      // A tier table change must keep the parent-zero tier and every agency's current tier resolvable.
      if (b.key === 'tiers' && !value.some((t) => t.key === x.s.parent_zero.tier)) bad('Üst ajans payını sıfırlama ayarındaki kademe silinemez');
      if (b.key === 'pool_cap' && value < x.s.top_rate) bad('Havuz sınırı üst ajans oranının altına inemez; önce üst ajans oranını düşür');
      await c.query('INSERT INTO agency_settings (key, value, reason, set_by) VALUES ($1,$2,$3,$4)', [b.key, JSON.stringify(value), reason, x.u.id]);
      await audit(c, x.u.id, 'settings.set', 'setting', b.key, { before: x.s[b.key], after: value, reason });
      return { key: b.key, value };
    });
  },

  async 'POST /api/admin/agency/performance/run'(req) {
    const b = await readJson(req);
    const x = await center(db, req, 'agencies.performance');
    // The performance engine set rates by score; the weekly levels replaced it (agency-levels.mjs).
    if (x) throw new HttpError(409, 'Komisyon oranı artık haftalık ajans seviyesinden gelir; elle oran ve kademe verilmez (Ajans seviyeleri)');
    await tx((c) => calcPending(c));
    const r = await tx((c) =>
      runPerformance(c, {
        asOf: TEST && b.asOf ? new Date(b.asOf) : new Date(),
        effectiveFrom: b.effectiveFrom ? notPast(b.effectiveFrom) : null,
        dryRun: b.dryRun === true,
        actor: x.u.id,
        note: typeof b.note === 'string' ? b.note.slice(0, 300) : 'Elle değerlendirme',
      }),
    );
    return r;
  },

  async 'GET /api/admin/agency/performance'(req, url) {
    const x = await center(db, req, 'agencies.view');
    const runs = await db.query('SELECT r.*, u.name AS run_by_name FROM agency_perf_runs r LEFT JOIN users u ON u.id = r.run_by ORDER BY r.id DESC LIMIT 30');
    const runId = url.searchParams.get('runId') ? Number(url.searchParams.get('runId')) : runs.rows[0] ? Number(runs.rows[0].id) : null;
    const scores = runId
      ? await db.query('SELECT sc.*, a.name, a.level, p.name AS parent_name FROM agency_perf_scores sc JOIN agencies a ON a.id = sc.agency_id LEFT JOIN agencies p ON p.id = sc.parent_id WHERE sc.run_id = $1 ORDER BY sc.rank', [runId])
      : { rows: [] };
    return {
      runs: runs.rows.map((r) => ({ id: Number(r.id), asOf: r.as_of, windowFrom: r.window_from, effectiveFrom: r.effective_from, dryRun: r.dry_run, cadenceKey: r.cadence_key, runBy: r.run_by_name, note: r.note })),
      runId,
      scores: scores.rows.map((s) => ({
        agencyId: s.agency_id,
        name: s.name,
        level: s.level,
        parent: s.parent_id ? { id: s.parent_id, name: s.parent_name } : null,
        score: n(s.score),
        rank: s.rank,
        parentScore: s.parent_score === null ? null : n(s.parent_score),
        overtakes: s.overtakes,
        qualified: s.qualified_tier,
        current: s.current_tier,
        assigned: s.assigned_tier,
        assignedName: tierName(x.s, s.assigned_tier),
        change: s.change,
        streak: s.streak,
        flags: s.flags,
        metrics: s.metrics,
        normalized: s.normalized,
      })),
    };
  },

  async 'POST /api/admin/agency/commissions/run'(req) {
    await center(db, req, 'agencies.ledger');
    return tx((c) => calcPending(c));
  },

  /**
   * Records a streamer income the commission is based on, outside gifts (a campaign, bonus or task reward the
   * platform pays). It does not move diamonds: the wallet credit is the paying feature's job.
   */
  async 'POST /api/admin/agency/income'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.ledger');
      const streamer = uuid(b.streamer, 'yayıncı');
      if (!INCOME_TYPES.includes(b.type)) bad('Geçersiz gelir türü');
      if (!Number.isSafeInteger(b.diamonds) || b.diamonds === 0 || Math.abs(b.diamonds) > 1e10) bad('Geçersiz elmas');
      if (b.type === 'refund' ? b.diamonds > 0 : b.diamonds < 0) bad('İade negatif, diğer gelirler pozitif olmalı');
      if (typeof b.ref !== 'string' || !REF.test(b.ref)) bad('Geçersiz istek kimliği');
      const at = TEST && b.occurredAt ? new Date(b.occurredAt) : null;
      const com = await recordIncome(c, streamer, b.type, `manual:${b.ref}`, b.diamonds, at);
      await audit(c, x.u.id, 'income.record', 'streamer', streamer, { after: { type: b.type, diamonds: b.diamonds, ref: b.ref, occurredAt: at } });
      const ev = await c.query('SELECT id, calc_status FROM income_events WHERE source_ref = $1', [`manual:${b.ref}`]);
      if (!ev.rowCount) throw new HttpError(500, 'Gelir kaydedilemedi');
      return { eventId: Number(ev.rows[0].id), status: ev.rows[0].calc_status, commission: com ? { id: Number(com.id), txn: com.txn, totalRate: n(com.total_rate), agencyAmount: d4(com.agency_amount), parentAmount: d4(com.parent_amount) } : null };
    });
  },

  async 'POST /api/admin/agency/commissions/reverse'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.ledger');
      const reason = reasonOf(b.reason);
      const rows = await c.query('SELECT l.* FROM agency_ledger l WHERE l.commission_id = $1 AND NOT EXISTS (SELECT 1 FROM agency_ledger r WHERE r.reverses = l.id) FOR UPDATE', [b.commissionId]);
      if (!rows.rowCount) throw new HttpError(404, 'Ters kaydı yapılacak komisyon yok');
      const period = periodOf(new Date(), x.s.commission_period);
      const reversals = new Map();
      for (const l of rows.rows) {
        const rv = await c.query("INSERT INTO agency_ledger (agency_id, kind, amount, rate, commission_id, reverses, period, note, created_by) VALUES ($1,'reversal',$2,$3,NULL,$4,$5,$6,$7) RETURNING id", [l.agency_id, fmt4(-e4(l.amount)), l.rate, l.id, period, reason, x.u.id]);
        reversals.set(Number(l.id), rv.rows[0].id);
        await notice(c, l.agency_id, 'ledger', 'Komisyon ters kaydı', `${d4(l.amount)} elmaslık kayıt düzeltildi: ${reason}`);
      }
      // The agency assistant's part of it goes back from their wallet, as the owner's 'assistant' row is reversed above.
      const assistants = await reverseAssistantShares(c, b.commissionId, period, reversals);
      await audit(c, x.u.id, 'commission.reverse', 'commission', b.commissionId, { after: { rows: rows.rowCount, assistants, period }, reason });
      return { reversed: rows.rowCount, assistants, period };
    });
  },

  async 'POST /api/admin/agency/adjust'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.ledger');
      const a = await agencyRow(c, uuid(b.agencyId, 'ajans'));
      if (typeof b.amount !== 'number' || !Number.isFinite(b.amount) || b.amount === 0 || Math.abs(b.amount) > 1e10) bad('Geçersiz tutar');
      if (typeof b.ref !== 'string' || !REF.test(b.ref)) bad('Geçersiz istek kimliği');
      const reason = reasonOf(b.reason);
      const period = periodOf(new Date(), x.s.commission_period);
      const r = await c.query(
        "INSERT INTO agency_ledger (agency_id, kind, amount, ref, period, note, created_by) VALUES ($1,'adjustment',$2,$3,$4,$5,$6) ON CONFLICT (agency_id, kind, ref) DO NOTHING RETURNING id",
        [a.id, fmt4(e4(b.amount)), b.ref, period, reason, x.u.id],
      );
      if (r.rowCount) {
        await notice(c, a.id, 'ledger', 'Komisyon düzeltmesi', `${d4(b.amount)} elmas: ${reason}`);
        await audit(c, x.u.id, 'ledger.adjust', 'agency', a.id, { after: { amount: d4(b.amount), period }, reason });
      }
      return { id: r.rowCount ? Number(r.rows[0].id) : null, replay: !r.rowCount, period };
    });
  },

  async 'POST /api/admin/agency/periods/close'(req) {
    const b = await readJson(req);
    const x = await center(db, req, 'agencies.ledger');
    const end = periodEnd(String(b.period ?? ''));
    if (end > new Date()) bad('Dönem henüz bitmedi');
    await tx((c) => calcPending(c));
    const r = await db.query('INSERT INTO agency_periods (period, closed_by) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING period', [b.period, x.u.id]);
    await audit(db, x.u.id, 'period.close', 'period', b.period, { after: { closed: r.rowCount > 0 } });
    return { period: b.period, closed: true, replay: !r.rowCount };
  },

  async 'GET /api/admin/agency/payouts'(req, url) {
    const x = await center(db, req);
    if (!['agencies.payouts.approve', 'agencies.payouts.pay', 'agencies.ledger'].some((p) => x.acc.admin || x.acc.platform.has(p))) await needPlatform(db, x.acc, 'agencies.payouts.approve');
    const st = url.searchParams.get('status');
    const r = await db.query(
      `SELECT p.*, a.name AS agency_name, a.code, a.status AS agency_status, u.name AS requested_by_name, ap.name AS approved_by_name
         FROM agency_payouts p JOIN agencies a ON a.id = p.agency_id JOIN users u ON u.id = p.requested_by LEFT JOIN users ap ON ap.id = p.approved_by
        ${st ? 'WHERE p.status = $1' : ''} ORDER BY p.id DESC LIMIT 200`,
      st ? [st] : [],
    );
    // payable: false = commission on a server with play money; it can't be approved or paid (agency.mjs PLAY_PAYOUT).
    const playMoney = await playMoneyOn(db);
    // The TL to send now, at the payout rate in effect (Canlı ayarlar › payout_usd_try); paid ones keep theirs.
    const rate = live().payoutUsdTry;
    return {
      playMoney,
      payUsdTry: rate,
      payouts: r.rows.map((p) => ({
        id: Number(p.id),
        agency: { id: p.agency_id, name: p.agency_name, code: p.code, status: p.agency_status },
        amount: d4(p.amount),
        usd: n(p.usd),
        tlNow: payoutTl(n(p.usd), rate),
        payUsdTry: p.pay_usd_try === null ? null : n(p.pay_usd_try),
        payTl: p.pay_tl === null ? null : n(p.pay_tl),
        currency: p.currency,
        status: p.status,
        statusLabel: STATUS_LABEL[p.status],
        requestedBy: p.requested_by_name,
        requestedAt: p.requested_at,
        approvedBy: p.approved_by_name,
        approvedAt: p.approved_at,
        paidAt: p.paid_at,
        paymentRef: p.payment_ref,
        note: p.note,
        payable: !playMoney,
      })),
    };
  },

  /** approve (pending → ready), pay (ready → paid, with the payment reference), reject, cancel. */
  async 'POST /api/admin/agency/payouts/decide'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req);
      const p = (await c.query('SELECT * FROM agency_payouts WHERE id = $1 FOR UPDATE', [b.payoutId])).rows[0];
      if (!p) throw new HttpError(404, 'Ödeme talebi bulunamadı');
      // Separation of duties: nobody decides a payout of an agency they belong to or that they requested.
      if (x.acc.agency.has(p.agency_id) || p.requested_by === x.u.id) throw new HttpError(403, 'Kendi ajansının veya kendi talebinin ödemesine karar veremezsin');
      const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : '';
      switch (b.action) {
        case 'approve':
          await needPlatform(c, x.acc, 'agencies.payouts.approve', String(p.id));
          if (p.status !== 'pending') throw new HttpError(409, 'Talep onay beklemiyor');
          if (await playMoneyOn(c)) throw new HttpError(409, PLAY_PAYOUT);
          await payoutStep(c, p, 'ready', x.u.id, note);
          break;
        case 'pay': {
          await needPlatform(c, x.acc, 'agencies.payouts.pay', String(p.id));
          if (p.status !== 'ready') throw new HttpError(409, 'Önce onaylanmalı');
          if (await playMoneyOn(c)) throw new HttpError(409, PLAY_PAYOUT);
          if (x.s.payout_policy.two_person && p.approved_by === x.u.id) throw new HttpError(403, 'Onaylayan kişi ödendi olarak işaretleyemez (iki kişili onay)');
          const paymentRef = text(b.paymentRef, 3, 100, 'Ödeme referansı');
          // At the payout rate in effect, which must be the one the panel showed (payUsdTry); else nothing changes.
          const rate = live().payoutUsdTry;
          if (b.payUsdTry !== undefined && b.payUsdTry !== null && !(typeof b.payUsdTry === 'number' && Math.round(b.payUsdTry * 100) === Math.round(rate * 100))) {
            throw Object.assign(new HttpError(409, 'Ödeme kuru değişti; yeni TL tutarını kontrol et'), { extra: { code: 'rate_changed', payUsdTry: rate, tl: payoutTl(n(p.usd), rate) } });
          }
          const tl = payoutTl(n(p.usd), rate);
          await payoutStep(c, p, 'paid', x.u.id, note, { paymentRef });
          await c.query('UPDATE agency_payouts SET pay_usd_try = $2, pay_tl = $3 WHERE id = $1', [p.id, rate, tl]);
          await notice(c, p.agency_id, 'payout', 'Ödemen yapıldı', `${d4(p.amount)} elmas (${n(p.usd)} USD = ${tl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL, kur ${rate.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}), referans ${paymentRef}`);
          break;
        }
        case 'reject':
        case 'cancel':
          await needPlatform(c, x.acc, 'agencies.payouts.approve', String(p.id));
          if (!['pending', 'ready'].includes(p.status)) throw new HttpError(409, 'Talep açık değil');
          await payoutStep(c, p, b.action === 'reject' ? 'rejected' : 'cancelled', x.u.id, reasonOf(b.note));
          await notice(c, p.agency_id, 'payout', b.action === 'reject' ? 'Ödeme talebin reddedildi' : 'Ödeme talebin iptal edildi', note);
          break;
        default:
          bad('İşlem: approve, pay, reject, cancel');
      }
      return { status: p.status };
    });
  },

  async 'GET /api/admin/agency/transfers'(req, url) {
    await center(db, req, 'agencies.transfers');
    const st = url.searchParams.get('status') ?? 'pending';
    const r = await db.query('SELECT * FROM agency_transfers WHERE status = $1 ORDER BY id DESC LIMIT 200', [st]);
    const names = await namesFor(db, r.rows);
    return { transfers: r.rows.map((t) => transferView(t, names)) };
  },

  async 'POST /api/admin/agency/transfers/decide'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.transfers');
      const t = (await c.query('SELECT * FROM agency_transfers WHERE id = $1 FOR UPDATE', [b.transferId])).rows[0];
      if (!t) throw new HttpError(404, 'Talep bulunamadı');
      if (b.approve !== true) {
        await rejectTransfer(c, t, x.u.id, reasonOf(b.note));
        for (const id of [t.agency_id, t.from_agency_id, t.to_agency_id].filter(Boolean)) await notice(c, id, 'transfer', 'Transfer talebi reddedildi', b.note);
        return { transfer: transferView(t, await namesFor(c, [t])) };
      }
      const extra = {};
      if (b.mode !== undefined) {
        if (!['free', 'paid'].includes(b.mode)) bad('Geçersiz transfer türü');
        extra.mode = b.mode;
        if (b.mode === 'free') extra.fee = 0;
      }
      if (b.transition) {
        if (t.kind !== 'independence') bad('Geçiş komisyonu yalnızca bağımsızlaşmada');
        const tr = b.transition;
        const rate = rate4(tr.rate, x.s.top_rate, 'Geçiş komisyonu oranı');
        const days = tr.endsAt ? null : Number.isSafeInteger(tr.days) && tr.days >= 1 && tr.days <= 730 ? tr.days : bad('Geçiş süresi 1–730 gün');
        const endsAt = tr.endsAt ? notPast(tr.endsAt).toISOString() : null;
        const scope = tr.scope ?? 'existing';
        if (!['all', 'existing'].includes(scope)) bad('Geçersiz kapsam');
        const incomeTypes = tr.incomeTypes ?? [];
        if (!Array.isArray(incomeTypes) || incomeTypes.some((y) => !INCOME_TYPES.includes(y))) bad('Geçersiz gelir türü');
        if (rate > 0) extra.transition = { rate, days, endsAt, scope, incomeTypes };
      }
      if (!t.needs.includes('center')) bad('Bu talep merkez onayı beklemiyor; yalnızca reddedilebilir');
      await approveTransfer(c, t, 'center', x.u.id, extra);
      await audit(c, x.u.id, 'transfer.center', 'transfer', t.id, { after: { status: t.status, ...extra }, reason: b.note ?? '' });
      return { transfer: transferView(t, await namesFor(c, [t])) };
    });
  },

  async 'POST /api/admin/agency/transition'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.transfers');
      const a = await agencyRow(c, uuid(b.agencyId, 'ajans'));
      const old = await agencyRow(c, uuid(b.oldParentId, 'eski üst ajans'));
      if (a.parent_id) bad('Geçiş komisyonu bağımsız (üst) ajans için tanımlanır');
      const rate = rate4(b.rate, x.s.top_rate, 'Geçiş komisyonu oranı');
      if (rate <= 0) bad('Oran sıfırdan büyük olmalı');
      const starts = notPast(b.startsAt);
      const ends = new Date(b.endsAt);
      if (Number.isNaN(ends.getTime()) || ends <= starts) bad('Bitiş başlangıçtan sonra olmalı');
      const scope = b.scope ?? 'existing';
      if (!['all', 'existing'].includes(scope)) bad('Geçersiz kapsam');
      const types = b.incomeTypes ?? [];
      if (!Array.isArray(types) || types.some((y) => !INCOME_TYPES.includes(y))) bad('Geçersiz gelir türü');
      const reason = reasonOf(b.reason);
      const r = await c.query('INSERT INTO agency_transitions (agency_id, old_parent_id, rate, starts_at, ends_at, scope, income_types, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [a.id, old.id, rate, starts, ends, scope, types, reason, x.u.id]);
      await audit(c, x.u.id, 'transition.create', 'agency', a.id, { after: { oldParent: old.id, rate, starts, ends, scope, types }, reason });
      return { id: Number(r.rows[0].id) };
    });
  },

  async 'GET /api/admin/agency/audit'(req, url) {
    await center(db, req, 'agencies.audit');
    const q = url.searchParams;
    const vals = [];
    const where = [];
    if (q.get('type')) where.push(`a.target_type = $${vals.push(q.get('type'))}`);
    if (q.get('target')) where.push(`a.target_id = $${vals.push(q.get('target'))}`);
    if (q.get('result')) where.push(`a.result = $${vals.push(q.get('result'))}`);
    const r = await db.query(`SELECT a.*, u.name AS actor_name FROM agency_audit a LEFT JOIN users u ON u.id = a.actor_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT 300`, vals);
    return { rows: r.rows.map((a) => ({ id: Number(a.id), actor: a.actor_id ? { id: a.actor_id, name: a.actor_name } : null, action: a.action, targetType: a.target_type, targetId: a.target_id, before: a.before, after: a.after, result: a.result, reason: a.reason, at: a.created_at })) };
  },

  async 'GET /api/admin/agency/roles'(req) {
    await center(db, req, 'agencies.view');
    const r = await db.query('SELECT * FROM staff_roles ORDER BY scope, id');
    // agencyPerms: what an agency-scope role may hold, for editors outside the app (the finance panel).
    return { roles: r.rows.map((x) => ({ id: Number(x.id), name: x.name, scope: x.scope, permissions: x.permissions, protected: x.protected, archived: !!x.archived_at })), platformPerms: PLATFORM_PERMS, agencyPerms: AGENCY_PERMS };
  },

  async 'POST /api/admin/agency/roles'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.roles');
      const scope = b.scope;
      if (!['platform', 'agency'].includes(scope)) bad('Kapsam: platform veya agency');
      const cat = scope === 'platform' ? PLATFORM_PERMS : AGENCY_PERMS;
      if (!Array.isArray(b.permissions) || b.permissions.some((p) => !(p in cat))) bad('Bilinmeyen izin');
      const name = text(b.name, 2, 40, 'Rol adı');
      if (b.id) {
        const old = (await c.query('SELECT * FROM staff_roles WHERE id = $1 FOR UPDATE', [b.id])).rows[0];
        if (!old) throw new HttpError(404, 'Rol bulunamadı');
        if (old.protected && !x.acc.admin) throw new HttpError(403, 'Korumalı rolü yalnızca yönetici hesabı değiştirebilir');
        if (old.scope !== scope) bad('Rolün kapsamı değiştirilemez');
        await c.query('UPDATE staff_roles SET name = $2, permissions = $3, archived_at = CASE WHEN $4 THEN now() ELSE NULL END, updated_by = $5, updated_at = now() WHERE id = $1', [b.id, name, [...new Set(b.permissions)], b.archive === true && !old.protected, x.u.id]);
        await audit(c, x.u.id, 'role.update', 'role', b.id, { before: { name: old.name, permissions: old.permissions }, after: { name, permissions: b.permissions, archived: b.archive === true } });
        return { id: Number(b.id) };
      }
      const r = await c.query('INSERT INTO staff_roles (name, scope, permissions, updated_by) VALUES ($1,$2,$3,$4) RETURNING id', [name, scope, [...new Set(b.permissions)], x.u.id]).catch((e) => {
        if (e.code === '23505') throw new HttpError(409, 'Bu adla bir rol var');
        throw e;
      });
      await audit(c, x.u.id, 'role.create', 'role', r.rows[0].id, { after: { name, scope, permissions: b.permissions } });
      return { id: Number(r.rows[0].id) };
    });
  },

  async 'GET /api/admin/agency/staff'(req) {
    await center(db, req, 'agencies.roles');
    const r = await db.query(
      `SELECT s.*, u.name, r.name AS role_name, r.permissions FROM staff_assignments s JOIN users u ON u.id = s.user_id LEFT JOIN staff_roles r ON r.id = s.role_id
        WHERE s.agency_id IS NULL AND s.revoked_at IS NULL ORDER BY s.id`,
    );
    return { staff: r.rows.map((s) => ({ user: { id: s.user_id, name: s.name }, roleId: s.role_id === null ? null : Number(s.role_id), role: s.role_name, extra: s.extra, denied: s.denied, perms: [...new Set([...(s.permissions ?? []), ...s.extra])].filter((p) => !s.denied.includes(p)) })) };
  },

  async 'POST /api/admin/agency/staff/set'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.roles');
      const user = uuid(b.user, 'kullanıcı');
      const list = (v) => (v === undefined ? [] : Array.isArray(v) && v.every((p) => p in PLATFORM_PERMS) ? [...new Set(v)] : bad('Bilinmeyen izin'));
      const extra = list(b.extra);
      const denied = list(b.denied);
      if (b.roleId !== undefined && b.roleId !== null) {
        const r = await c.query("SELECT 1 FROM staff_roles WHERE id = $1 AND scope = 'platform' AND archived_at IS NULL", [b.roleId]);
        if (!r.rowCount) bad('Rol bulunamadı');
      }
      const u = await c.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL', [user]);
      if (!u.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      const before = await c.query('UPDATE staff_assignments SET revoked_at = now(), revoked_by = $2 WHERE user_id = $1 AND agency_id IS NULL AND revoked_at IS NULL RETURNING role_id, extra, denied', [user, x.u.id]);
      await c.query('INSERT INTO staff_assignments (user_id, agency_id, role_id, extra, denied, granted_by) VALUES ($1, NULL, $2, $3, $4, $5)', [user, b.roleId ?? null, extra, denied, x.u.id]);
      await audit(c, x.u.id, 'platform_staff.set', 'user', user, { before: before.rows[0] ?? null, after: { roleId: b.roleId ?? null, extra, denied } });
      return { user, roleId: b.roleId ?? null };
    });
  },

  async 'POST /api/admin/agency/staff/remove'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.roles');
      const r = await c.query('UPDATE staff_assignments SET revoked_at = now(), revoked_by = $2 WHERE user_id = $1 AND agency_id IS NULL AND revoked_at IS NULL RETURNING id', [uuid(b.user, 'kullanıcı'), x.u.id]);
      if (!r.rowCount) throw new HttpError(404, 'Personel bulunamadı');
      await audit(c, x.u.id, 'platform_staff.remove', 'user', b.user, {});
      return { removed: true };
    });
  },

  async 'POST /api/admin/agency/bd'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.manage');
      const a = await agencyRow(c, uuid(b.agencyId, 'ajans'));
      const before = await c.query('UPDATE bd_assignments SET ended_at = now() WHERE agency_id = $1 AND ended_at IS NULL RETURNING bd_id', [a.id]);
      if (b.bd) await c.query('INSERT INTO bd_assignments (bd_id, agency_id, assigned_by) VALUES ($1,$2,$3)', [uuid(b.bd, 'BD'), a.id, x.u.id]);
      await audit(c, x.u.id, 'bd.assign', 'agency', a.id, { before: { bd: before.rows[0]?.bd_id ?? null }, after: { bd: b.bd ?? null } });
      return { bd: b.bd ?? null };
    });
  },

  async 'POST /api/admin/agency/ops-score'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.performance');
      const a = await agencyRow(c, uuid(b.agencyId, 'ajans'), true);
      if (!Number.isSafeInteger(b.score) || b.score < 0 || b.score > 100) bad('Puan 0–100');
      const reason = reasonOf(b.reason);
      await c.query('UPDATE agencies SET ops_score = $2 WHERE id = $1', [a.id, b.score]);
      await audit(c, x.u.id, 'agency.ops_score', 'agency', a.id, { before: { ops: a.ops_score }, after: { ops: b.score }, reason });
      return { score: b.score };
    });
  },

  async 'POST /api/admin/agency/violation'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.performance');
      const a = await agencyRow(c, uuid(b.agencyId, 'ajans'));
      if (!Number.isSafeInteger(b.points) || b.points < 1 || b.points > 100) bad('Puan 1–100');
      const note = text(b.note, 3, 300, 'Açıklama');
      const r = await c.query('INSERT INTO agency_violations (agency_id, points, note, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [a.id, b.points, note, x.u.id]);
      await notice(c, a.id, 'violation', 'İhlal kaydı', note);
      await audit(c, x.u.id, 'agency.violation', 'agency', a.id, { after: { points: b.points }, reason: note });
      return { id: Number(r.rows[0].id) };
    });
  },

  async 'GET /api/admin/agency/appeals'(req, url) {
    await center(db, req, 'agencies.appeals');
    const r = await db.query('SELECT p.*, a.name AS agency_name, u.name AS by_name FROM agency_appeals p JOIN agencies a ON a.id = p.agency_id JOIN users u ON u.id = p.created_by WHERE p.status = $1 ORDER BY p.id DESC LIMIT 200', [url.searchParams.get('status') ?? 'open']);
    return { appeals: r.rows.map((p) => ({ id: Number(p.id), agency: { id: p.agency_id, name: p.agency_name }, subject: p.subject, body: p.body, status: p.status, by: p.by_name, createdAt: p.created_at, decisionNote: p.decision_note })) };
  },

  async 'POST /api/admin/agency/appeals/decide'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await center(c, req, 'agencies.appeals');
      const note = reasonOf(b.note);
      const r = await c.query("UPDATE agency_appeals SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1 AND status = 'open' RETURNING agency_id", [b.id, b.accept === true ? 'accepted' : 'rejected', x.u.id, note]);
      if (!r.rowCount) throw new HttpError(404, 'Açık itiraz bulunamadı');
      await notice(c, r.rows[0].agency_id, 'appeal', b.accept === true ? 'İtirazın kabul edildi' : 'İtirazın reddedildi', note);
      await audit(c, x.u.id, 'appeal.decide', 'appeal', b.id, { after: { accept: b.accept === true }, reason: note });
      return { status: b.accept === true ? 'accepted' : 'rejected' };
    });
  },

  /** How a base would be split now: for an agency's current chain, or for hypothetical rates. Nothing is written. */
  /**
   * What a week's diamonds give (Ajans seviyeleri): `base` diamonds, `active` streamers (default enough), `isNew`.
   * The old fields stay (one direct share, the pool the level's rate).
   */
  async 'POST /api/admin/agency/simulate'(req) {
    const b = await readJson(req);
    const x = await center(db, req, 'agencies.view');
    if (!Number.isSafeInteger(b.base) || b.base <= 0 || b.base > 1e12) bad('Matrah pozitif tam sayı (elmas)');
    const lv = x.s.weekly_levels;
    const active = Number.isSafeInteger(b.active) && b.active >= 0 ? b.active : lv.min_active;
    const { level, reason } = levelFor({ base: b.base, active, isNew: b.isNew === true }, lv);
    const pool = d4(b.base * level.rate);
    return {
      base: b.base,
      active,
      level: { key: level.key, name: level.name, rate: level.rate },
      reason,
      poolCap: lv.levels.at(-1).rate,
      totalRate: level.rate,
      pool,
      shares: [{ agency: 'Ajans', kind: 'direct', rate: level.rate, amount: pool }],
      platformKeeps: d4(b.base - pool),
      usd: { base: usdOf(b.base), pool: usdOf(pool) },
    };
  },

  /** Report (§12): filters from, to, top, sub, streamer; BD sees their agencies only. */
  async 'GET /api/admin/agency/report'(req, url) {
    const x = await center(db, req);
    const all = x.acc.admin || x.acc.platform.has('agencies.view');
    if (!all && !x.acc.platform.has('bd.reports')) await needPlatform(db, x.acc, 'agencies.view');
    const q = url.searchParams;
    const from = dateParam(q.get('from'), new Date(Date.now() - 30 * 86400e3));
    const to = dateParam(q.get('to'), new Date(Date.now() + 60e3));
    const vals = [from, to];
    const where = ['k.occurred_at >= $1', 'k.occurred_at < $2'];
    if (q.get('top')) where.push(`k.top_agency_id = $${vals.push(uuid(q.get('top')))}`);
    if (q.get('agency')) where.push(`k.chain @> ARRAY[$${vals.push(uuid(q.get('agency')))}::uuid]`);
    if (q.get('sub')) where.push(`k.agency_id = $${vals.push(uuid(q.get('sub')))}`);
    if (q.get('streamer')) where.push(`k.streamer_id = $${vals.push(uuid(q.get('streamer')))}`);
    if (!all) where.push(`k.chain && $${vals.push([...x.acc.bd])}::uuid[]`);
    const W = where.join(' AND ');
    const tot = (
      await db.query(
        `SELECT coalesce(sum(k.base_diamonds), 0) AS base, coalesce(sum(k.agency_amount), 0) AS direct, coalesce(sum(k.parent_amount), 0) AS difference,
                coalesce(sum(k.transition_amount), 0) AS transition, count(*)::int AS events, count(DISTINCT k.streamer_id)::int AS streamers,
                (SELECT coalesce(sum(b.amount), 0) FROM bd_ledger b WHERE b.commission_id IN (SELECT k.id FROM agency_commissions k WHERE ${W})) AS bd
           FROM agency_commissions k WHERE ${W}`,
        vals,
      )
    ).rows[0];
    const byTop = await db.query(
      `SELECT k.top_agency_id AS id, a.name, coalesce(sum(k.base_diamonds), 0) AS base, coalesce(sum(k.agency_amount + k.parent_amount + k.transition_amount), 0) AS commission,
              count(DISTINCT k.agency_id) FILTER (WHERE k.agency_id <> k.top_agency_id)::int AS subs, count(DISTINCT k.streamer_id)::int AS streamers
         FROM agency_commissions k JOIN agencies a ON a.id = k.top_agency_id WHERE ${W} GROUP BY 1, 2 ORDER BY base DESC LIMIT 100`,
      vals,
    );
    const bySub = await db.query(
      `SELECT k.agency_id AS id, a.name, p.name AS parent_name, coalesce(sum(k.base_diamonds), 0) AS base, coalesce(sum(k.agency_amount), 0) AS own, coalesce(sum(k.parent_amount), 0) AS to_parent,
              count(DISTINCT k.streamer_id)::int AS streamers
         FROM agency_commissions k JOIN agencies a ON a.id = k.agency_id LEFT JOIN agencies p ON p.id = k.parent_agency_id WHERE ${W} AND k.parent_agency_id IS NOT NULL GROUP BY 1, 2, 3 ORDER BY base DESC LIMIT 200`,
      vals,
    );
    const topStreamers = await db.query(
      `SELECT k.streamer_id AS id, u.name, coalesce(sum(k.base_diamonds), 0) AS base, coalesce(sum(k.agency_amount + k.parent_amount + k.transition_amount), 0) AS commission
         FROM agency_commissions k JOIN users u ON u.id = k.streamer_id WHERE ${W} GROUP BY 1, 2 ORDER BY base DESC LIMIT 20`,
      vals,
    );
    const misc = (
      await db.query(
        `SELECT (SELECT count(*) FROM agency_streamers WHERE joined_at >= $1 AND joined_at < $2)::int AS new_streamers,
                (SELECT count(*) FROM agency_transfers WHERE status = 'completed' AND decided_at >= $1 AND decided_at < $2)::int AS transfers,
                (SELECT count(*) FROM agencies WHERE approved_at >= $1 AND approved_at < $2)::int AS new_agencies,
                (SELECT coalesce(sum(amount), 0) FROM agency_payouts WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2) AS paid,
                (SELECT coalesce(sum(amount), 0) FROM agency_payouts WHERE status IN ('pending', 'ready')) AS open_payouts`,
        [from, to],
      )
    ).rows[0];
    // Ajans seviyeleri: the weeks' level rows (agency-levels.mjs) by when they were written, for the agencies filtered
    // (none for one streamer: a level row is the agency's week, not a streamer's).
    const lvVals = [from, to];
    const lvWhere = ["l.kind = 'level'", 'l.created_at >= $1', 'l.created_at < $2'];
    const lvAgency = (id) => {
      const i = lvVals.push(id);
      return `(l.agency_id = $${i} OR l.agency_id IN (SELECT id FROM agencies WHERE parent_id = $${i}))`;
    };
    if (q.get('top')) lvWhere.push(lvAgency(uuid(q.get('top'))));
    if (q.get('agency')) lvWhere.push(lvAgency(uuid(q.get('agency'))));
    if (q.get('sub')) lvWhere.push(`l.agency_id = $${lvVals.push(uuid(q.get('sub')))}`);
    if (!all) lvWhere.push(`l.agency_id = ANY($${lvVals.push([...x.acc.bd])}::uuid[])`);
    const level = q.get('streamer') ? 0 : n((await db.query(`SELECT coalesce(sum(l.amount), 0) AS s FROM agency_ledger l WHERE ${lvWhere.join(' AND ')}`, lvVals)).rows[0].s);
    const commission = d4(n(tot.direct) + n(tot.difference) + n(tot.transition) + level);
    return {
      from,
      to,
      totals: { base: n(tot.base), commission, level: d4(level), direct: d4(tot.direct), difference: d4(tot.difference), transition: d4(tot.transition), bd: d4(tot.bd), events: tot.events, streamers: tot.streamers, platformKeeps: d4(n(tot.base) - commission), usd: { base: usdOf(tot.base), commission: usdOf(commission), bd: usdOf(tot.bd) } },
      ...(all ? { activity: { newStreamers: misc.new_streamers, transfers: misc.transfers, newAgencies: misc.new_agencies, paid: d4(misc.paid), openPayouts: d4(misc.open_payouts) } } : {}),
      byTop: byTop.rows.map((r) => ({ id: r.id, name: r.name, base: n(r.base), commission: d4(r.commission), subs: r.subs, streamers: r.streamers })),
      bySub: bySub.rows.map((r) => ({ id: r.id, name: r.name, parent: r.parent_name, base: n(r.base), own: d4(r.own), toParent: d4(r.to_parent), streamers: r.streamers })),
      topStreamers: topStreamers.rows.map((r) => ({ id: r.id, name: r.name, base: n(r.base), commission: d4(r.commission) })),
    };
  },

  /** A BD's own view: the agencies they are responsible for and their separate BD commission. */
  async 'GET /api/admin/agency/bd-report'(req, url) {
    const x = await center(db, req);
    const other = url.searchParams.get('bd');
    if (other && other !== x.u.id) await needPlatform(db, x.acc, 'agencies.view');
    else if (!x.acc.admin && !x.acc.platform.has('bd.reports') && !x.acc.platform.has('bd.assigned')) await needPlatform(db, x.acc, 'bd.reports');
    const bd = other ? uuid(other, 'BD') : x.u.id;
    const ag = await db.query(
      `SELECT a.id, a.name, a.level, a.status, b.assigned_at,
         (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.chain @> ARRAY[a.id] AND k.occurred_at > now() - interval '30 days') AS org30,
         (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.chain @> ARRAY[a.id] AND k.occurred_at > now() - interval '60 days' AND k.occurred_at <= now() - interval '30 days') AS org_prev30
       FROM bd_assignments b JOIN agencies a ON a.id = b.agency_id WHERE b.bd_id = $1 AND b.ended_at IS NULL ORDER BY a.name`,
      [bd],
    );
    const led = await db.query('SELECT period, coalesce(sum(amount), 0) AS amount, count(*)::int AS rows FROM bd_ledger WHERE bd_id = $1 GROUP BY period ORDER BY period DESC LIMIT 24', [bd]);
    return {
      bd,
      policy: x.s.bd_policy,
      agencies: ag.rows.map((a) => ({ id: a.id, name: a.name, level: a.level, status: a.status, since: a.assigned_at, org30: n(a.org30), growth: n(a.org_prev30) > 0 ? Math.round(((n(a.org30) - n(a.org_prev30)) / n(a.org_prev30)) * 100) : null })),
      ledger: led.rows.map((r) => ({ period: r.period, amount: d4(r.amount), usd: usdOf(r.amount), rows: r.rows })),
    };
  },

  async 'POST /api/admin/agency/jobs/run'(req) {
    const x = await center(db, req, 'agencies.settings');
    const r = await runJobs();
    await audit(db, x.u.id, 'jobs.run', 'platform', '', { after: r });
    return r;
  },
};

