// Agency panels and the streamer side of the agency network. The centre's routes are in agency-admin.mjs;
// the engine in agency-lib.mjs, agency-perf.mjs and agency-ops.mjs; the rules in docs/AJANS_HIYERARSI.md.
// Every check is here on the server: the app only shows what these return.
//
// Streamer:
//   GET  /api/agency/me                                   → { membership, requests, transfer, agencies, platform, streamer }
//   GET  /api/agency/lookup?code=                         → { agency }
//   POST /api/agency/join { code, method?, note? }        → { membership } (code, link) | { request } (application)
//   POST /api/agency/requests/respond { requestId, accept } (an invite to me)
//   POST /api/agency/requests/cancel  { requestId }        (my join request)
//   POST /api/agency/transfer { toCode?, reason, ref }    → { transfer }  (move to another agency; from the centre
//        when held; leaving only if streamer_policy.can_leave)
// Agency panel (id = agency; who may see what: permsOn in agency-lib.mjs):
//   GET  /api/agency/overview?id=      GET /api/agency/streamers?id=&scope=direct|sub
//   GET  /api/agency/subagencies?id=   GET /api/agency/commissions?id=&from&to&streamer&sub&kind&format=csv
//   GET  /api/agency/performance?id=   GET /api/agency/report?id=&from&to&group=day|week|month
//   GET  /api/agency/requests?id=      POST /api/agency/invite { id, user | username, note? }
//   GET  /api/agency/invite/search?id=&q=  → { users }  (whom to invite, by name or username)
//   POST /api/agency/requests/decide { id, requestId, approve, note? }
//   POST /api/agency/sub/create { parentId, name, owner?, …, submit? }   POST /api/agency/sub/submit { id }
//   POST /api/agency/sub/decide { id, approve, note? }    POST /api/agency/apply { name, parentCode?, owner?, … }
//   GET  /api/agency/staff?id=   POST /api/agency/staff/set { id, user, roleId?, extra?, denied? }
//   POST /api/agency/staff/remove { id, user }            GET /api/agency/roles
//   GET  /api/agency/payouts?id=   POST /api/agency/payouts/request { id, currency, ref }
//   POST /api/agency/payouts/cancel { id, payoutId }
//   GET  /api/agency/transfers?id=   POST /api/agency/transfers/approve { id, transferId, approve, mode?, note? }
//   POST /api/agency/independence { id, reason, ref }     POST /api/agency/change-parent { id, toCode, reason, ref }
//   POST /api/agency/sub/close { id, reason, ref }        POST /api/agency/appeal { id, subject, body }
//   GET  /api/agency/notices?id=
import { HttpError, REF, UUID, assertClean, auth, db, readJson, text, tx } from './core.mjs';
import {
  AGENCY_PERMS,
  PLATFORM_PERMS,
  STATUS_LABEL,
  accessOf,
  agencyByCode,
  agencyRow,
  audit,
  balances,
  d4,
  needAgency,
  newCode,
  notice,
  permsOn,
  rateView,
  rowStatus,
  settingsAt,
  tierName,
  usdOf,
  viewerOf,
} from './agency-lib.mjs';
import {
  HELD_MSG,
  LEAVE_MSG,
  approveTransfer,
  assertEligible,
  checkCanFoundSub,
  feeRule,
  firstAgencyOfPerson,
  linkStreamer,
  namesFor,
  openTransfer,
  payoutStep,
  rejectTransfer,
  setStatus,
  streamerState,
  submitAgency,
  transferView,
} from './agency-ops.mjs';
import { PLAY_MONEY, everHadPlayMoney } from './wallet.mjs';

/**
 * Commission is never paid out on a server that holds or held play money (test top-ups, test or sandbox
 * purchases): the same rule as diamond withdrawals (withdraw.mjs). Coins are fungible, so no commission there is
 * provably earned with real money. Requests, approvals and payments are refused; only reject or cancel remain.
 */
export const PLAY_PAYOUT = 'Test jetonundan gelen kazanç ödenemez';
export const playMoneyOn = async (c) => PLAY_MONEY || (await everHadPlayMoney(c));

// --- Small helpers -----------------------------------------------------------------------------------------
const bad = (m) => {
  throw new HttpError(400, m);
};
const uuid = (v, what = 'kimlik') => (typeof v === 'string' && UUID.test(v) ? v : bad(`Geçersiz ${what}`));
const ref = (v) => (typeof v === 'string' && REF.test(v) ? v : bad('Geçersiz istek kimliği'));
const opt = (v, max, field) => (v === undefined || v === null ? '' : text(v, 0, max, field));
/**
 * A note or reason the other side reads (a streamer, another agency): no phone numbers, IBANs, e-mails, links
 * or social media accounts (contact-filter.mjs). The refusal is counted for `x.u` at `place`.
 */
const said = (s, x, place, field = 'note') => assertClean(s, x.u, place, field);
const dateParam = (v, dflt) => {
  if (!v) return dflt;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? bad('Geçersiz tarih') : d;
};
const n = (v) => Number(v ?? 0);

async function ctx(c, req) {
  const u = await auth(req);
  const acc = await accessOf(c, u);
  const { values: s } = await settingsAt(c);
  return { u, acc, s };
}

/** The agency `id`, if the caller may see it (perm = a specific permission, else any relation). */
async function agencyFor(c, x, id, perm = null) {
  const a = await agencyRow(c, uuid(id, 'ajans'));
  if (perm) await needAgency(c, x.acc, perm, a, x.s);
  else if (!viewerOf(x.acc, a)) {
    await audit(db, x.u.id, 'agency.view', 'agency', a.id, { result: 'denied' });
    throw new HttpError(403, 'Bu ajans için yetkin yok');
  }
  return a;
}

/** Acting in an agency (never through the parent's view rights): own permissions only. */
async function actIn(c, x, a, perm) {
  if (x.acc.agency.get(a.id)?.has(perm)) return;
  await audit(db, x.u.id, perm, 'agency', a.id, { result: 'denied' });
  throw new HttpError(403, 'Bu işlem için bu ajansta yetkin yok');
}

const card = (a, s) => ({
  id: a.id,
  code: a.code,
  name: a.name,
  level: a.level,
  status: a.status,
  parentId: a.parent_id,
  tier: a.tier,
  tierName: tierName(s, a.tier),
  country: a.country,
  region: a.region,
  createdAt: a.created_at,
  approvedAt: a.approved_at,
});

/** The latest real performance evaluation of an agency, with the next tier and what it still needs. */
async function perfOf(c, a, s) {
  const r = await c.query(
    `SELECT sc.*, r.as_of, r.effective_from FROM agency_perf_scores sc JOIN agency_perf_runs r ON r.id = sc.run_id
      WHERE sc.agency_id = $1 AND r.dry_run = false ORDER BY sc.run_id DESC LIMIT 1`,
    [a.id],
  );
  if (!r.rowCount) return null;
  const x = r.rows[0];
  const out = {
    runId: Number(x.run_id),
    asOf: x.as_of,
    score: n(x.score),
    rank: x.rank,
    parentScore: x.parent_score === null ? null : n(x.parent_score),
    overtakes: x.overtakes,
    change: x.change,
    streak: x.streak,
    flags: x.flags,
    metrics: x.metrics,
    normalized: x.normalized,
    qualifiedTier: x.qualified_tier,
    next: null,
  };
  if (a.level > 1) {
    const i = Math.max(0, s.tiers.findIndex((t) => t.key === a.tier));
    const nx = s.tiers[i + 1];
    if (nx) {
      out.next = {
        key: nx.key,
        name: nx.name,
        subRate: nx.sub_rate,
        needScore: Math.max(0, Math.round((nx.min_score - out.score) * 100) / 100),
        needActive: Math.max(0, Math.max(nx.min_active, s.performance.min_active_streamers) - n(x.metrics.active)),
        needOvertake: nx.overtake && !x.overtakes,
        periodsInRow: s.performance.promotion_min_periods,
      };
    }
  }
  return out;
}

const STREAMER_ROW = `SELECT m.streamer_id, m.agency_id, m.joined_at, m.method, m.contract, u.name, u.username, u.avatar_url, u.phone IS NOT NULL AS verified,
    (SELECT coalesce(sum(e.diamonds), 0) FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.occurred_at >= greatest(m.joined_at, now() - interval '30 days')) AS d30,
    (SELECT coalesce(sum(l.seconds), 0) FROM presence_log l WHERE l.user_id = m.streamer_id AND l.left_at > now() - interval '30 days') AS online30,
    EXISTS (SELECT 1 FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.diamonds > 0 AND e.occurred_at > now() - make_interval(days => $2::int))
      OR EXISTS (SELECT 1 FROM presence_log l WHERE l.user_id = m.streamer_id AND l.left_at > now() - make_interval(days => $2::int)) AS active
  FROM agency_streamers m JOIN users u ON u.id = m.streamer_id`;
const streamerView = (r) => ({
  id: r.streamer_id,
  name: r.name,
  username: r.username,
  avatarUrl: r.avatar_url,
  agencyId: r.agency_id,
  joinedAt: r.joined_at,
  method: r.method,
  contract: r.contract,
  verified: r.verified,
  diamonds30: n(r.d30),
  usd30: usdOf(r.d30),
  onlineHours30: Math.round(n(r.online30) / 360) / 10,
  active: r.active,
});

// --- Routes ------------------------------------------------------------------------------------------------
export const agencyRoutes = {
  // --- Streamer side ---
  async 'GET /api/agency/me'(req) {
    const x = await ctx(db, req);
    const m = await db.query(
      `SELECT m.*, a.name, a.code, a.level, a.parent_id, p.name AS parent_name FROM agency_streamers m JOIN agencies a ON a.id = m.agency_id
         LEFT JOIN agencies p ON p.id = a.parent_id WHERE m.streamer_id = $1 AND m.ended_at IS NULL`,
      [x.u.id],
    );
    const reqs = await db.query(
      "SELECT r.*, a.name AS agency_name, a.code FROM agency_requests r JOIN agencies a ON a.id = r.agency_id WHERE r.user_id = $1 AND r.status = 'pending' ORDER BY r.id DESC",
      [x.u.id],
    );
    const tr = await db.query("SELECT * FROM agency_transfers WHERE streamer_id = $1 AND status = 'pending'", [x.u.id]);
    const ids = [...x.acc.agency.keys()];
    const ag = ids.length ? await db.query('SELECT * FROM agencies WHERE id = ANY($1::uuid[]) ORDER BY level, name', [ids]) : { rows: [] };
    const names = await namesFor(db, tr.rows);
    const st = await streamerState(db, x.u.id, x.s);
    const p = x.s.streamer_policy;
    return {
      // The streamer rules as they apply to me, so the app shows what is possible (the server checks again).
      streamer: { eligible: st.eligible, gender: st.gender, held: st.held, pickUntil: st.pickUntil, pickDays: p.pick_days, canLeave: p.can_leave, womenOnly: p.women_only },
      membership: m.rowCount
        ? { agency: { id: m.rows[0].agency_id, name: m.rows[0].name, code: m.rows[0].code, level: m.rows[0].level, parentName: m.rows[0].parent_name }, joinedAt: m.rows[0].joined_at, method: m.rows[0].method }
        : null,
      requests: reqs.rows.map((r) => ({ id: Number(r.id), kind: r.kind, method: r.method, agency: { id: r.agency_id, name: r.agency_name, code: r.code }, note: r.note, createdAt: r.created_at })),
      transfer: tr.rowCount ? transferView(tr.rows[0], names) : null,
      agencies: ag.rows.map((a) => ({ ...card(a, x.s), viewer: viewerOf(x.acc, a), perms: [...permsOn(x.acc, a, x.s)] })),
      platform: [...x.acc.platform],
    };
  },

  async 'GET /api/agency/lookup'(req, url) {
    await auth(req);
    const a = await agencyByCode(db, url.searchParams.get('code'));
    if (a.status !== 'approved') throw new HttpError(404, 'Bu kodla aktif bir ajans yok');
    const p = a.parent_id ? await db.query('SELECT name FROM agencies WHERE id = $1', [a.parent_id]) : null;
    return { agency: { id: a.id, name: a.name, code: a.code, level: a.level, parentName: p?.rows[0]?.name ?? null } };
  },

  async 'POST /api/agency/join'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyByCode(c, b.code);
      const method = b.method ?? 'code';
      if (!['code', 'link', 'application'].includes(method)) bad('Geçersiz katılım yolu');
      if (a.status !== 'approved') throw new HttpError(409, 'Bu ajans şu an yayıncı kabul etmiyor');
      const st = await streamerState(c, x.u.id, x.s);
      if (st.open) throw new HttpError(409, st.open === a.id ? 'Zaten bu ajanstasın' : 'Zaten bir ajansa bağlısın; değiştirmek için transfer talebi oluştur');
      assertEligible(st);
      if (st.held) throw new HttpError(409, HELD_MSG);
      // A code or a link is the agency's own invitation: it joins at once. Only an application waits for the
      // agency (join_policy). A second account of the same person joins the first one's agency at once.
      const first = x.s.streamer_policy.one_agency_per_person ? await firstAgencyOfPerson(c, x.u.id) : null;
      if (method !== 'application' || !x.s.join_policy.requires_approval || (first && first.id !== a.id)) {
        const m = await linkStreamer(c, x.u.id, a, method, x.u.id);
        const to = m.agency_id === a.id ? a : await agencyRow(c, m.agency_id);
        if (to.id === a.id) await notice(c, a.id, 'request', `${x.u.name} davet kodunla ajansına katıldı`, '');
        return { membership: { agency: { id: to.id, name: to.name, code: to.code }, joinedAt: m.joined_at, method }, sameDevice: to.id !== a.id };
      }
      try {
        await c.query('SAVEPOINT j');
        const r = await c.query("INSERT INTO agency_requests (agency_id, user_id, kind, method, note, created_by) VALUES ($1,$2,'join',$3,$4,$2) RETURNING *", [a.id, x.u.id, method, await said(opt(b.note, 300, 'Not'), x, 'agency.join')]);
        await c.query('RELEASE SAVEPOINT j');
        await notice(c, a.id, 'request', `${x.u.name} katılmak istiyor`, '');
        return { request: { id: Number(r.rows[0].id), status: 'pending', agency: { id: a.id, name: a.name } } };
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT j');
        if (e.code === '23505') throw new HttpError(409, 'Bu ajansa zaten başvurdun');
        throw e;
      }
    });
  },

  async 'POST /api/agency/requests/respond'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const r = await c.query("SELECT * FROM agency_requests WHERE id = $1 AND user_id = $2 AND kind = 'invite' AND status = 'pending' FOR UPDATE", [b.requestId, x.u.id]);
      if (!r.rowCount) throw new HttpError(404, 'Davet bulunamadı');
      const a = await agencyRow(c, r.rows[0].agency_id, true);
      if (b.accept === true) await linkStreamer(c, x.u.id, a, 'invite', x.u.id, null, r.rows[0].created_at);
      await c.query('UPDATE agency_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1', [r.rows[0].id, b.accept === true ? 'approved' : 'rejected', x.u.id]);
      return { status: b.accept === true ? 'approved' : 'rejected' };
    });
  },

  async 'POST /api/agency/requests/cancel'(req) {
    const b = await readJson(req);
    const u = await auth(req);
    const r = await db.query("UPDATE agency_requests SET status = 'cancelled', decided_by = $2, decided_at = now() WHERE id = $1 AND user_id = $2 AND kind = 'join' AND status = 'pending' RETURNING id", [b.requestId, u.id]);
    if (!r.rowCount) throw new HttpError(404, 'Başvuru bulunamadı');
    return { status: 'cancelled' };
  },

  async 'POST /api/agency/transfer'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const reason = await said(text(b.reason, 3, 500, 'Gerekçe'), x, 'agency.transfer', 'reason');
      const link = await c.query('SELECT * FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [x.u.id]);
      const st = await streamerState(c, x.u.id, x.s);
      assertEligible(st);
      if (!link.rowCount) {
        // Held by the centre (streamer_policy): into an agency only by a move that agency and the centre approve.
        if (!st.held) throw new HttpError(409, 'Bir ajansa bağlı değilsin; davet koduyla doğrudan katılabilirsin');
        if (!b.toCode) bad('Geçmek istediğin ajansın kodunu yaz');
        const to = await agencyByCode(c, b.toCode);
        if (to.status !== 'approved') throw new HttpError(409, 'Hedef ajans aktif değil');
        const t = await openTransfer(c, { kind: 'streamer_move', streamerId: x.u.id, toId: to.id, needs: ['to', 'center'], mode: 'free', reason, ref: ref(b.ref), actor: x.u.id });
        await notice(c, to.id, 'transfer', `${x.u.name} ajansına katılmak istiyor`, 'Merkez hesabından geçiş: senin ve merkezin onayıyla tamamlanır.');
        return { transfer: transferView(t, await namesFor(c, [t])) };
      }
      const from = await agencyRow(c, link.rows[0].agency_id);
      const center = x.s.transfer_policy.require_center ? ['center'] : [];
      let t;
      if (b.toCode) {
        const to = await agencyByCode(c, b.toCode);
        if (to.status !== 'approved') throw new HttpError(409, 'Hedef ajans aktif değil');
        if (to.id === from.id) bad('Zaten bu ajanstasın');
        const fr = await feeRule(c, 'streamer', x.u.id, x.s);
        t = await openTransfer(c, { kind: 'streamer_move', streamerId: x.u.id, fromId: from.id, toId: to.id, needs: ['from', 'to', ...center], mode: fr.fee > 0 ? null : 'free', fee: fr.fee, feeRule: fr, reason, ref: ref(b.ref), actor: x.u.id });
        await notice(c, to.id, 'transfer', `${x.u.name} ajansına geçmek istiyor`, reason);
      } else {
        if (!x.s.streamer_policy.can_leave) throw new HttpError(409, LEAVE_MSG);
        t = await openTransfer(c, { kind: 'streamer_leave', streamerId: x.u.id, fromId: from.id, needs: ['from', ...center], mode: 'free', reason, ref: ref(b.ref), actor: x.u.id });
      }
      await notice(c, from.id, 'transfer', `${x.u.name} ${b.toCode ? 'başka bir ajansa geçmek' : 'ajanstan ayrılmak'} istiyor`, `${x.s.transfer_policy.decision_days} gün içinde karar verilmezse ayrılış onaylanmış sayılır.`);
      return { transfer: transferView(t, await namesFor(c, [t])) };
    });
  },

  // --- Agency panel ---
  async 'GET /api/agency/overview'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'));
    const perms = permsOn(x.acc, a, x.s);
    const counts = (
      await db.query(
        `SELECT (SELECT count(*) FROM agency_streamers WHERE agency_id = $1 AND ended_at IS NULL)::int AS streamers,
                (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = $1 AND m.ended_at IS NULL
                   AND EXISTS (SELECT 1 FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.diamonds > 0 AND e.occurred_at > now() - make_interval(days => $2::int)))::int AS active,
                (SELECT count(*) FROM agencies WHERE parent_id = $1 AND status IN ('approved', 'suspended'))::int AS subs,
                (SELECT count(*) FROM agencies WHERE parent_id = $1 AND status = 'approved')::int AS active_subs,
                (SELECT count(*) FROM agencies WHERE parent_id = $1 AND status IN ('draft', 'pending'))::int AS pending_subs,
                (SELECT count(*) FROM agency_streamers m JOIN agencies s ON s.id = m.agency_id WHERE s.parent_id = $1 AND m.ended_at IS NULL)::int AS sub_streamers,
                (SELECT count(*) FROM agency_requests WHERE agency_id = $1 AND status = 'pending' AND kind = 'join')::int AS pending_requests,
                (SELECT count(*) FROM agency_transfers WHERE status = 'pending' AND $1 IN (agency_id, from_agency_id, to_agency_id))::int AS pending_transfers`,
        [a.id, x.s.performance.active_days],
      )
    ).rows[0];
    let earnings = null;
    if (perms.has('reports.commission')) {
      const e = (
        await db.query(
          `SELECT coalesce(sum(amount) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'), 0) AS today,
                  coalesce(sum(amount) FILTER (WHERE created_at > now() - interval '7 days'), 0) AS week,
                  coalesce(sum(amount) FILTER (WHERE created_at > now() - interval '30 days'), 0) AS month,
                  coalesce(sum(amount) FILTER (WHERE created_at > now() - interval '60 days' AND created_at <= now() - interval '30 days'), 0) AS prev_month,
                  coalesce(sum(amount) FILTER (WHERE kind = 'direct' AND created_at > now() - interval '30 days'), 0) AS direct30,
                  coalesce(sum(amount) FILTER (WHERE kind = 'difference' AND created_at > now() - interval '30 days'), 0) AS difference30,
                  coalesce(sum(amount) FILTER (WHERE kind = 'transition' AND created_at > now() - interval '30 days'), 0) AS transition30
             FROM agency_ledger WHERE agency_id = $1`,
          [a.id],
        )
      ).rows[0];
      earnings = { ...Object.fromEntries(Object.entries(e).map(([k, v]) => [k, d4(v)])), balances: await balances(db, a.id) };
      earnings.usd = { month: usdOf(earnings.month), available: usdOf(earnings.balances.available) };
    }
    const perf = perms.has('reports.performance') ? await perfOf(db, a, x.s) : null;
    let parent = null;
    if (a.parent_id) {
      const p = await agencyRow(db, a.parent_id);
      parent = { id: p.id, name: p.name, score: perf?.parentScore ?? null };
    }
    const indep = await db.query("SELECT * FROM agency_transfers WHERE agency_id = $1 AND kind IN ('independence', 'change_parent', 'sub_close') ORDER BY id DESC LIMIT 1", [a.id]);
    const notices = await db.query('SELECT id, kind, title, body, created_at FROM agency_notices WHERE agency_id = $1 ORDER BY id DESC LIMIT 5', [a.id]);
    const owner = a.owner_id ? (await db.query('SELECT id, name FROM users WHERE id = $1', [a.owner_id])).rows[0] : null;
    return {
      agency: card(a, x.s),
      owner: owner ? { id: owner.id, name: owner.name } : null,
      viewer: viewerOf(x.acc, a),
      perms: [...perms],
      counts,
      rate: await rateView(db, a, x.s),
      earnings,
      performance: perf,
      parent,
      request: indep.rowCount ? transferView(indep.rows[0], await namesFor(db, indep.rows)) : null,
      notices: ['owner', 'staff'].includes(viewerOf(x.acc, a)) ? notices.rows.map((r) => ({ id: Number(r.id), kind: r.kind, title: r.title, body: r.body, createdAt: r.created_at })) : [],
      tiers: x.s.tiers,
      poolCap: x.s.pool_cap,
    };
  },

  async 'GET /api/agency/streamers'(req, url) {
    const x = await ctx(db, req);
    const scope = url.searchParams.get('scope') ?? 'direct';
    if (!['direct', 'sub'].includes(scope)) bad('Geçersiz kapsam');
    const a = await agencyFor(db, x, url.searchParams.get('id'), scope === 'sub' ? 'subagencies.view' : 'streamers.view');
    const r =
      scope === 'direct'
        ? await db.query(`${STREAMER_ROW} WHERE m.agency_id = $1 AND m.ended_at IS NULL ORDER BY m.joined_at DESC LIMIT 500`, [a.id, x.s.performance.active_days])
        : await db.query(`${STREAMER_ROW} JOIN agencies s ON s.id = m.agency_id WHERE s.parent_id = $1 AND m.ended_at IS NULL ORDER BY m.joined_at DESC LIMIT 500`, [a.id, x.s.performance.active_days]);
    const subs = scope === 'sub' ? Object.fromEntries((await db.query('SELECT id, name FROM agencies WHERE parent_id = $1', [a.id])).rows.map((s) => [s.id, s.name])) : {};
    // Read-only for a parent: a sub-agency's streamers are listed with their agency; they can't be moved from here.
    return { scope, streamers: r.rows.map((row) => ({ ...streamerView(row), agencyName: subs[row.agency_id] ?? a.name })) };
  },

  async 'GET /api/agency/subagencies'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'), 'subagencies.view');
    const r = await db.query(
      `SELECT s.*, u.name AS owner_name,
         (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = s.id AND m.ended_at IS NULL)::int AS streamers,
         (SELECT count(*) FROM agency_streamers m WHERE m.agency_id = s.id AND m.ended_at IS NULL
            AND EXISTS (SELECT 1 FROM income_events e WHERE e.streamer_id = m.streamer_id AND e.diamonds > 0 AND e.occurred_at > now() - make_interval(days => $2::int)))::int AS active,
         (SELECT coalesce(sum(k.base_diamonds), 0) FROM agency_commissions k WHERE k.agency_id = s.id AND k.occurred_at > now() - interval '30 days') AS volume30,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_ledger l WHERE l.agency_id = s.id AND l.created_at > now() - interval '30 days') AS earned30,
         (SELECT coalesce(sum(l.amount), 0) FROM agency_ledger l JOIN agency_commissions k ON k.id = l.commission_id WHERE l.agency_id = $1 AND l.kind = 'difference' AND k.agency_id = s.id AND l.created_at > now() - interval '30 days') AS mine30,
         (SELECT p.status FROM agency_payouts p WHERE p.agency_id = s.id ORDER BY p.id DESC LIMIT 1) AS payout_status
       FROM agencies s LEFT JOIN users u ON u.id = s.owner_id
      WHERE s.parent_id = $1 AND s.status <> 'rejected' ORDER BY s.status = 'approved' DESC, s.name`,
      [a.id, x.s.performance.active_days],
    );
    const out = [];
    for (const s of r.rows) {
      const perms = permsOn(x.acc, s, x.s);
      const rv = s.status === 'approved' || s.status === 'suspended' ? await rateView(db, s, x.s) : null;
      const perf = await perfOf(db, s, x.s);
      out.push({
        ...card(s, x.s),
        owner: s.owner_name,
        pendingWith: s.pending_with,
        streamers: s.streamers,
        active: s.active,
        volume30: n(s.volume30),
        earned30: perms.has('reports.commission') ? d4(s.earned30) : null,
        mine30: d4(s.mine30),
        rate: rv?.rate ?? null,
        parentShare: rv?.parentShare ?? null,
        upcoming: rv?.upcoming ?? null,
        payoutStatus: s.payout_status ? STATUS_LABEL[s.payout_status] : null,
        score: perf?.score ?? null,
        overallRank: perf?.rank ?? null,
        overtakes: perf?.overtakes ?? false,
        next: perf?.next ?? null,
      });
    }
    // Ranking among this agency's sub-agencies by the latest score.
    out
      .filter((s) => s.score !== null)
      .sort((p, q) => q.score - p.score)
      .forEach((s, i) => (s.rank = i + 1));
    return { subagencies: out, nearPromotion: out.filter((s) => s.next && s.next.needScore <= 5 && s.next.needActive <= 1 && !s.next.needOvertake).map((s) => s.id) };
  },

  async 'GET /api/agency/commissions'(req, url) {
    const x = await ctx(db, req);
    const q = url.searchParams;
    const csv = q.get('format') === 'csv';
    const a = await agencyFor(db, x, q.get('id'), csv ? 'reports.export' : 'reports.commission');
    if (csv) await needAgency(db, x.acc, 'reports.commission', a, x.s);
    const from = dateParam(q.get('from'), new Date(Date.now() - 90 * 86400e3));
    const to = dateParam(q.get('to'), new Date(Date.now() + 60e3));
    const vals = [a.id, from, to];
    const where = ['l.agency_id = $1', 'l.created_at >= $2', 'l.created_at < $3'];
    if (q.get('streamer')) where.push(`k.streamer_id = $${vals.push(uuid(q.get('streamer')))}`);
    if (q.get('sub')) where.push(`k.agency_id = $${vals.push(uuid(q.get('sub')))}`);
    if (q.get('kind')) where.push(`l.kind = $${vals.push(String(q.get('kind')))}`);
    const r = await db.query(
      `SELECT l.*, k.txn, k.streamer_id, k.agency_id AS source_agency, k.parent_agency_id, k.base_diamonds, k.income_type, k.total_rate, k.agency_rate, k.parent_rate,
              k.transition_rate, k.agency_amount, k.parent_amount, k.transition_amount, k.rule_version, k.occurred_at, k.calculated_at, k.pool_cap,
              u.name AS streamer_name, sa.name AS source_name, p.status AS payout_status, ap.period IS NOT NULL AS closed
         FROM agency_ledger l LEFT JOIN agency_commissions k ON k.id = l.commission_id LEFT JOIN users u ON u.id = k.streamer_id
         LEFT JOIN agencies sa ON sa.id = k.agency_id LEFT JOIN agency_payouts p ON p.id = l.payout_id LEFT JOIN agency_periods ap ON ap.period = l.period
        WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT ${csv ? 10000 : 300}`,
      vals,
    );
    const rows = r.rows.map((l) => ({
      id: Number(l.id),
      kind: l.kind,
      amount: d4(l.amount),
      rate: l.rate === null ? null : n(l.rate),
      period: l.period,
      status: rowStatus(l),
      statusLabel: STATUS_LABEL[rowStatus(l)],
      createdAt: l.created_at,
      note: l.note,
      txn: l.txn,
      streamer: l.streamer_id ? { id: l.streamer_id, name: l.streamer_name } : null,
      sourceAgency: l.source_agency ? { id: l.source_agency, name: l.source_name } : null,
      base: l.base_diamonds === null ? null : n(l.base_diamonds),
      incomeType: l.income_type,
      totalRate: l.total_rate === null ? null : n(l.total_rate),
      subRate: l.agency_rate === null ? null : n(l.agency_rate),
      parentRate: l.parent_rate === null ? null : n(l.parent_rate),
      subAmount: l.agency_amount === null ? null : d4(l.agency_amount),
      parentAmount: l.parent_amount === null ? null : d4(l.parent_amount),
      transitionAmount: l.transition_amount === null ? null : d4(l.transition_amount),
      poolCap: l.pool_cap === null ? null : n(l.pool_cap),
      ruleVersion: l.rule_version,
      occurredAt: l.occurred_at,
      calculatedAt: l.calculated_at,
    }));
    if (csv) {
      await audit(db, x.u.id, 'reports.export', 'agency', a.id, { after: { rows: rows.length, from, to } });
      const head = ['islem', 'tur', 'yayinci', 'kaynak_ajans', 'matrah_elmas', 'toplam_oran', 'alt_oran', 'ust_fark_orani', 'tutar_elmas', 'tutar_usd', 'donem', 'durum', 'kural', 'gelir_zamani', 'hesap_zamani'];
      const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
      const lines = rows.map((x) => [x.txn ?? x.id, x.kind, x.streamer?.name, x.sourceAgency?.name, x.base, x.totalRate, x.subRate, x.parentRate, x.amount, usdOf(x.amount), x.period, x.statusLabel, x.ruleVersion, x.occurredAt?.toISOString?.() ?? '', x.calculatedAt?.toISOString?.() ?? ''].map(esc).join(','));
      return { csv: [head.join(','), ...lines].join('\n'), rows: rows.length };
    }
    const sum = (k) => d4(rows.filter((x) => x.kind === k).reduce((s, x) => s + x.amount, 0));
    return { rows, totals: { direct: sum('direct'), difference: sum('difference'), transition: sum('transition'), fees: sum('transfer_fee'), adjustments: d4(sum('adjustment') + sum('reversal')) } };
  },

  async 'GET /api/agency/performance'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'), 'reports.performance');
    const latest = await perfOf(db, a, x.s);
    const hist = await db.query(
      `SELECT sc.run_id, r.as_of, sc.score, sc.rank, sc.assigned_tier, sc.change, sc.overtakes, sc.metrics->>'volume' AS volume, sc.metrics->>'org_volume' AS org_volume, sc.metrics->>'active' AS active
         FROM agency_perf_scores sc JOIN agency_perf_runs r ON r.id = sc.run_id WHERE sc.agency_id = $1 AND r.dry_run = false ORDER BY sc.run_id DESC LIMIT 12`,
      [a.id],
    );
    const tiers = await db.query('SELECT * FROM agency_tier_history WHERE agency_id = $1 ORDER BY id DESC LIMIT 50', [a.id]);
    const rates = await db.query('SELECT * FROM agency_rates WHERE agency_id = $1 ORDER BY effective_from DESC, id DESC LIMIT 50', [a.id]);
    let subs = [];
    if (latest && a.level === 1) {
      const r = await db.query(
        `SELECT sc.agency_id, g.name, sc.score, sc.rank, sc.overtakes, sc.assigned_tier, sc.change, sc.metrics->>'active' AS active, sc.metrics->>'volume' AS volume
           FROM agency_perf_scores sc JOIN agencies g ON g.id = sc.agency_id WHERE sc.run_id = $1 AND sc.parent_id = $2 ORDER BY sc.score DESC`,
        [latest.runId, a.id],
      );
      subs = r.rows.map((s, i) => ({ id: s.agency_id, name: s.name, score: n(s.score), overallRank: s.rank, rank: i + 1, overtakes: s.overtakes, tier: s.assigned_tier, tierName: tierName(x.s, s.assigned_tier), change: s.change, active: n(s.active), volume: n(s.volume) }));
    }
    const total = latest ? (await db.query('SELECT count(*)::int AS n FROM agency_perf_scores WHERE run_id = $1', [latest.runId])).rows[0].n : 0;
    return {
      latest,
      ranked: total,
      history: hist.rows.map((h) => ({ runId: Number(h.run_id), asOf: h.as_of, score: n(h.score), rank: h.rank, tier: h.assigned_tier, tierName: tierName(x.s, h.assigned_tier), change: h.change, overtakes: h.overtakes, volume: n(h.volume), orgVolume: n(h.org_volume), active: n(h.active) })),
      tierHistory: tiers.rows.map((t) => ({ from: t.from_tier, fromName: tierName(x.s, t.from_tier), to: t.to_tier, toName: tierName(x.s, t.to_tier), fromRate: t.from_rate === null ? null : n(t.from_rate), toRate: n(t.to_rate), effectiveFrom: t.effective_from, source: t.source, reason: t.reason, at: t.created_at })),
      rateHistory: rates.rows.map((r) => ({ rate: n(r.rate), parentFloor: n(r.parent_floor), tier: r.tier, source: r.source, effectiveFrom: r.effective_from, reason: r.reason })),
      subagencies: subs,
      weights: x.s.weights,
      tiers: x.s.tiers,
      performance: x.s.performance,
    };
  },

  async 'GET /api/agency/report'(req, url) {
    const x = await ctx(db, req);
    const q = url.searchParams;
    const a = await agencyFor(db, x, q.get('id'), 'reports.performance');
    const group = q.get('group') ?? 'day';
    if (!['day', 'week', 'month'].includes(group)) bad('Geçersiz gruplama');
    const from = dateParam(q.get('from'), new Date(Date.now() - 90 * 86400e3));
    const to = dateParam(q.get('to'), new Date(Date.now() + 60e3));
    const bucket = `to_char(date_trunc('${group}', %s AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD')`;
    const vol = await db.query(
      `SELECT ${bucket.replace('%s', 'k.occurred_at')} AS b, coalesce(sum(k.base_diamonds) FILTER (WHERE k.agency_id = $1), 0) AS direct, coalesce(sum(k.base_diamonds), 0) AS org
         FROM agency_commissions k WHERE k.chain @> ARRAY[$1::uuid] AND k.occurred_at >= $2 AND k.occurred_at < $3 GROUP BY 1 ORDER BY 1`,
      [a.id, from, to],
    );
    const joins = await db.query(`SELECT ${bucket.replace('%s', 'joined_at')} AS b, count(*)::int AS n FROM agency_streamers WHERE agency_id = $1 AND joined_at >= $2 AND joined_at < $3 GROUP BY 1 ORDER BY 1`, [a.id, from, to]);
    let earn = [];
    if (permsOn(x.acc, a, x.s).has('reports.commission')) {
      const r = await db.query(
        `SELECT ${bucket.replace('%s', 'created_at')} AS b, coalesce(sum(amount) FILTER (WHERE kind = 'direct'), 0) AS direct, coalesce(sum(amount) FILTER (WHERE kind = 'difference'), 0) AS difference,
                coalesce(sum(amount) FILTER (WHERE kind = 'transition'), 0) AS transition, coalesce(sum(amount), 0) AS total
           FROM agency_ledger WHERE agency_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY 1 ORDER BY 1`,
        [a.id, from, to],
      );
      earn = r.rows.map((e) => ({ bucket: e.b, direct: d4(e.direct), difference: d4(e.difference), transition: d4(e.transition), total: d4(e.total) }));
    }
    return { group, from, to, volume: vol.rows.map((v) => ({ bucket: v.b, direct: n(v.direct), org: n(v.org) })), joins: joins.rows.map((j) => ({ bucket: j.b, count: j.n })), earnings: earn };
  },

  async 'GET /api/agency/requests'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'), 'streamers.view');
    const r = await db.query(
      `SELECT r.*, u.name, u.username FROM agency_requests r JOIN users u ON u.id = r.user_id WHERE r.agency_id = $1
        ORDER BY r.status = 'pending' DESC, r.id DESC LIMIT 100`,
      [a.id],
    );
    return { requests: r.rows.map((q) => ({ id: Number(q.id), kind: q.kind, method: q.method, status: q.status, user: { id: q.user_id, name: q.name, username: q.username }, note: q.note, createdAt: q.created_at, decidedAt: q.decided_at })) };
  },

  /**
   * "Yayıncı davet et": the people the app shows by name (few accounts have a username), found by name or
   * username, so the invite can name them by id. Only for whoever may invite in this agency; deleted accounts,
   * the caller and blocks either way are left out. `agency`: 'this' or 'other' when they already belong to one.
   */
  async 'GET /api/agency/invite/search'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyRow(db, uuid(url.searchParams.get('id'), 'ajans'));
    await actIn(db, x, a, 'streamers.invite');
    const q = (url.searchParams.get('q') ?? '').trim().replace(/^@+/, '');
    if (q.length < 2) return { users: [] };
    if (q.length > 40) bad('Arama en fazla 40 karakter olabilir');
    const esc = q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const r = await db.query(
      `SELECT u.id, u.name, u.username, u.avatar_url,
              (SELECT s.agency_id FROM agency_streamers s WHERE s.streamer_id = u.id AND s.ended_at IS NULL LIMIT 1) AS agency_id
         FROM users u
        WHERE u.deleted_at IS NULL AND u.id <> $1 AND (u.name ILIKE $2 OR u.username ILIKE $2)
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
          AND ($5::boolean = false OR u.gender = 'Kadın')
        ORDER BY lower(u.username) = lower($3) IS TRUE DESC, lower(u.name) = lower($3) DESC, u.name ILIKE $4 DESC, u.name, u.id
        LIMIT 20`,
      [x.u.id, `%${esc}%`, q, `${esc}%`, x.s.streamer_policy.women_only],
    );
    return {
      users: r.rows.map((u) => ({ id: u.id, name: u.name, username: u.username ?? null, avatarUrl: u.avatar_url ?? null, agency: u.agency_id === a.id ? 'this' : u.agency_id ? 'other' : null })),
    };
  },

  async 'POST /api/agency/invite'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'));
      await actIn(c, x, a, 'streamers.invite');
      if (a.status !== 'approved') throw new HttpError(409, 'Ajans aktif değil');
      const target = b.user
        ? await c.query('SELECT id, name FROM users WHERE id = $1 AND deleted_at IS NULL', [uuid(b.user, 'kullanıcı')])
        : await c.query('SELECT id, name FROM users WHERE lower(username) = lower($1) AND deleted_at IS NULL', [text(b.username, 2, 40, 'Kullanıcı adı')]);
      if (!target.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      const open = await c.query('SELECT agency_id FROM agency_streamers WHERE streamer_id = $1 AND ended_at IS NULL', [target.rows[0].id]);
      if (open.rowCount) throw new HttpError(409, open.rows[0].agency_id === a.id ? 'Bu yayıncı zaten ajansında' : 'Bu yayıncı başka bir ajansa bağlı; ancak kendi transfer talebiyle geçebilir');
      const st = await streamerState(c, target.rows[0].id, x.s);
      if (!st.eligible) throw new HttpError(409, st.gender ? 'Ajanslarda yalnız kadın hesaplar yayıncı olabilir' : 'Bu kişi profilinde cinsiyetini seçmemiş');
      if (st.held) throw new HttpError(409, 'Bu kişinin ajans seçme süresi doldu; ancak kendi transfer talebiyle katılabilir');
      try {
        await c.query('SAVEPOINT i');
        const r = await c.query("INSERT INTO agency_requests (agency_id, user_id, kind, method, note, created_by) VALUES ($1,$2,'invite','invite',$3,$4) RETURNING id", [a.id, target.rows[0].id, await said(opt(b.note, 300, 'Not'), x, 'agency.invite'), x.u.id]);
        await c.query('RELEASE SAVEPOINT i');
        await audit(c, x.u.id, 'streamer.invite', 'agency', a.id, { after: { user: target.rows[0].id } });
        return { request: { id: Number(r.rows[0].id), user: target.rows[0], status: 'pending' } };
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT i');
        if (e.code === '23505') throw new HttpError(409, 'Bu kişiyle bekleyen bir davet veya başvuru var');
        throw e;
      }
    });
  },

  async 'POST /api/agency/requests/decide'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      await actIn(c, x, a, 'streamers.approve');
      const note = await said(opt(b.note, 300, 'Not'), x, 'agency.request');
      const r = await c.query("SELECT * FROM agency_requests WHERE id = $1 AND agency_id = $2 AND kind = 'join' AND status = 'pending' FOR UPDATE", [b.requestId, a.id]);
      if (!r.rowCount) throw new HttpError(404, 'Başvuru bulunamadı');
      if (b.approve === true) await linkStreamer(c, r.rows[0].user_id, a, r.rows[0].method, x.u.id, null, r.rows[0].created_at);
      await c.query('UPDATE agency_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1', [r.rows[0].id, b.approve === true ? 'approved' : 'rejected', x.u.id]);
      await audit(c, x.u.id, b.approve === true ? 'request.approve' : 'request.reject', 'agency', a.id, { after: { user: r.rows[0].user_id }, reason: note });
      return { status: b.approve === true ? 'approved' : 'rejected' };
    });
  },

  // --- Sub-agencies and applications ---
  async 'POST /api/agency/sub/create'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const parent = await agencyRow(c, uuid(b.parentId, 'üst ajans'), true);
      await actIn(c, x, parent, 'subagencies.manage');
      await checkCanFoundSub(c, parent, x.s);
      const a = await insertAgency(c, b, { parent, owner: b.owner ? uuid(b.owner, 'yönetici') : null, actor: x.u.id, status: 'draft', pendingWith: null, screen: x.u });
      if (b.submit === true) await submitAgency(c, a, x.u.id);
      return { agency: card(await agencyRow(c, a.id), x.s) };
    });
  },

  async 'POST /api/agency/sub/submit'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (a.status !== 'draft' || !a.parent_id) throw new HttpError(409, 'Yalnızca taslak alt ajans başvurusu gönderilebilir');
      const parent = await agencyRow(c, a.parent_id, true);
      await actIn(c, x, parent, 'subagencies.manage');
      await checkCanFoundSub(c, parent, x.s);
      await submitAgency(c, a, x.u.id);
      return { agency: card(await agencyRow(c, a.id), x.s) };
    });
  },

  /** Anyone may apply to run an agency: a top agency (the centre decides) or a sub-agency under a code. */
  async 'POST /api/agency/apply'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const bd = x.acc.platform.has('bd.acquire');
      const owner = b.owner && bd ? uuid(b.owner, 'yönetici') : x.u.id;
      let parent = null;
      if (b.parentCode) {
        parent = await agencyByCode(c, b.parentCode);
        await checkCanFoundSub(c, parent, x.s);
      }
      const a = await insertAgency(c, b, { parent, owner, actor: x.u.id, status: 'pending', pendingWith: parent ? 'parent' : 'center', bd: bd ? x.u.id : null, screen: bd ? null : x.u });
      if (parent) await notice(c, parent.id, 'sub', `Yeni alt ajans başvurusu: ${a.name}`, '');
      return { agency: card(a, x.s), pendingWith: a.pending_with };
    });
  },

  /** The parent's decision on a sub-agency application from outside; approved ones go on to the centre. */
  async 'POST /api/agency/sub/decide'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (a.status !== 'pending' || a.pending_with !== 'parent') throw new HttpError(409, 'Bu başvuru üst ajans kararı beklemiyor');
      const parent = await agencyRow(c, a.parent_id, true);
      await actIn(c, x, parent, 'subagencies.manage');
      if (b.approve === true) await submitAgency(c, a, x.u.id);
      else {
        const note = await said(opt(b.note, 300, 'Not'), x, 'agency.sub_decide');
        await setStatus(c, a, 'rejected', x.u.id, note);
        await audit(c, x.u.id, 'agency.reject', 'agency', a.id, { reason: note });
      }
      return { agency: card(await agencyRow(c, a.id), x.s) };
    });
  },

  // --- Staff ---
  async 'GET /api/agency/roles'(req) {
    await auth(req);
    const r = await db.query("SELECT id, name, scope, permissions FROM staff_roles WHERE archived_at IS NULL ORDER BY scope, id");
    return { agencyPerms: AGENCY_PERMS, platformPerms: PLATFORM_PERMS, roles: r.rows.map((x) => ({ ...x, id: Number(x.id) })) };
  },

  async 'GET /api/agency/staff'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'));
    await actIn(db, x, a, 'staff.manage');
    const r = await db.query(
      `SELECT s.*, u.name, r.name AS role_name, r.permissions FROM staff_assignments s JOIN users u ON u.id = s.user_id LEFT JOIN staff_roles r ON r.id = s.role_id
        WHERE s.agency_id = $1 AND s.revoked_at IS NULL ORDER BY s.id`,
      [a.id],
    );
    const roles = await db.query("SELECT id, name, permissions FROM staff_roles WHERE scope = 'agency' AND archived_at IS NULL ORDER BY id");
    return {
      staff: r.rows.map((s) => {
        const denied = new Set(s.denied);
        return { user: { id: s.user_id, name: s.name }, roleId: s.role_id === null ? null : Number(s.role_id), role: s.role_name, extra: s.extra, denied: s.denied, perms: [...new Set([...(s.permissions ?? []), ...s.extra])].filter((p) => !denied.has(p)), since: s.granted_at };
      }),
      roles: roles.rows.map((x) => ({ ...x, id: Number(x.id) })),
      catalog: AGENCY_PERMS,
    };
  },

  async 'POST /api/agency/staff/set'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      await actIn(c, x, a, 'staff.manage');
      const user = uuid(b.user, 'kullanıcı');
      if (user === a.owner_id) bad('Ajans yöneticisi zaten bütün yetkilere sahip');
      const list = (v) => (v === undefined ? [] : Array.isArray(v) && v.every((p) => p in AGENCY_PERMS) ? [...new Set(v)] : bad('Bilinmeyen izin'));
      const extra = list(b.extra);
      const denied = list(b.denied);
      let rolePerms = [];
      if (b.roleId !== undefined && b.roleId !== null) {
        const r = await c.query("SELECT * FROM staff_roles WHERE id = $1 AND scope = 'agency' AND archived_at IS NULL", [b.roleId]);
        if (!r.rowCount) bad('Rol bulunamadı');
        rolePerms = r.rows[0].permissions;
      }
      // Staff can hand out only what they hold themselves; the owner and the centre anything in the catalog.
      const mine = x.acc.agency.get(a.id);
      const granted = [...new Set([...rolePerms, ...extra])].filter((p) => !denied.includes(p));
      if (!x.acc.owned.has(a.id) && granted.some((p) => !mine.has(p))) throw new HttpError(403, 'Sahip olmadığın bir yetkiyi veremezsin');
      const u = await c.query('SELECT id, name FROM users WHERE id = $1 AND deleted_at IS NULL', [user]);
      if (!u.rowCount) throw new HttpError(404, 'Kullanıcı bulunamadı');
      const before = await c.query('UPDATE staff_assignments SET revoked_at = now(), revoked_by = $3 WHERE user_id = $1 AND agency_id = $2 AND revoked_at IS NULL RETURNING role_id, extra, denied', [user, a.id, x.u.id]);
      await c.query('INSERT INTO staff_assignments (user_id, agency_id, role_id, extra, denied, granted_by) VALUES ($1,$2,$3,$4,$5,$6)', [user, a.id, b.roleId ?? null, extra, denied, x.u.id]);
      await audit(c, x.u.id, 'staff.set', 'agency', a.id, { before: before.rows[0] ?? null, after: { user, roleId: b.roleId ?? null, extra, denied } });
      return { staff: { user: u.rows[0], perms: granted } };
    });
  },

  async 'POST /api/agency/staff/remove'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'));
      await actIn(c, x, a, 'staff.manage');
      const r = await c.query('UPDATE staff_assignments SET revoked_at = now(), revoked_by = $3 WHERE user_id = $1 AND agency_id = $2 AND revoked_at IS NULL RETURNING id', [uuid(b.user, 'kullanıcı'), a.id, x.u.id]);
      if (!r.rowCount) throw new HttpError(404, 'Personel bulunamadı');
      await audit(c, x.u.id, 'staff.remove', 'agency', a.id, { after: { user: b.user } });
      return { removed: true };
    });
  },

  // --- Payouts ---
  async 'GET /api/agency/payouts'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'), 'reports.commission');
    const p = await db.query('SELECT * FROM agency_payouts WHERE agency_id = $1 ORDER BY id DESC LIMIT 50', [a.id]);
    const h = p.rowCount ? await db.query('SELECT * FROM agency_payout_history WHERE payout_id = ANY($1::bigint[]) ORDER BY id', [p.rows.map((r) => r.id)]) : { rows: [] };
    return {
      balances: await balances(db, a.id),
      policy: x.s.payout_policy,
      payouts: p.rows.map((r) => ({
        id: Number(r.id),
        amount: d4(r.amount),
        usd: n(r.usd),
        currency: r.currency,
        status: r.status,
        statusLabel: STATUS_LABEL[r.status],
        requestedAt: r.requested_at,
        approvedAt: r.approved_at,
        paidAt: r.paid_at,
        paymentRef: r.payment_ref,
        note: r.note,
        history: h.rows.filter((y) => y.payout_id === r.id).map((y) => ({ from: y.from_status, to: y.to_status, note: y.note, at: y.created_at })),
      })),
    };
  },

  async 'POST /api/agency/payouts/request'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      await actIn(c, x, a, 'payouts.request');
      const r0 = ref(b.ref);
      const same = await c.query('SELECT * FROM agency_payouts WHERE agency_id = $1 AND ref = $2', [a.id, r0]);
      if (same.rowCount) return { payout: { id: Number(same.rows[0].id), amount: d4(same.rows[0].amount), status: same.rows[0].status }, replay: true };
      if (a.status !== 'approved') throw new HttpError(403, 'Askıdaki veya kapalı ajans ödeme talep edemez');
      if (!x.s.payout_policy.currencies.includes(b.currency)) bad(`Para birimi: ${x.s.payout_policy.currencies.join(', ')}`);
      if (await playMoneyOn(c)) throw new HttpError(409, PLAY_PAYOUT);
      const open = await c.query("SELECT 1 FROM agency_payouts WHERE agency_id = $1 AND status IN ('pending', 'ready')", [a.id]);
      if (open.rowCount) throw new HttpError(409, 'Sonuçlanmamış bir ödeme talebin var');
      // Only earnings of closed periods that no payout has claimed; claimed in the same statement's lock.
      const rows = await c.query('SELECT l.id, l.amount FROM agency_ledger l JOIN agency_periods ap ON ap.period = l.period WHERE l.agency_id = $1 AND l.payout_id IS NULL FOR UPDATE OF l', [a.id]);
      const total = d4(rows.rows.reduce((s, l) => s + Number(l.amount), 0));
      if (total <= 0) throw new HttpError(409, 'Ödenebilir kazanç yok (dönem kapanınca ödenebilir olur)');
      if (total < x.s.payout_policy.min_diamonds) throw new HttpError(409, `Ödeme alt limiti ${x.s.payout_policy.min_diamonds.toLocaleString('tr-TR')} elmas`);
      const p = await c.query('INSERT INTO agency_payouts (agency_id, ref, amount, usd, currency, requested_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [a.id, r0, total, usdOf(total), b.currency, x.u.id]);
      await c.query('UPDATE agency_ledger SET payout_id = $1 WHERE id = ANY($2::bigint[])', [p.rows[0].id, rows.rows.map((l) => l.id)]);
      await c.query("INSERT INTO agency_payout_history (payout_id, from_status, to_status, actor_id) VALUES ($1, NULL, 'pending', $2)", [p.rows[0].id, x.u.id]);
      await audit(c, x.u.id, 'payout.request', 'payout', p.rows[0].id, { after: { amount: total, currency: b.currency } });
      return { payout: { id: Number(p.rows[0].id), amount: total, usd: usdOf(total), status: 'pending' }, replay: false };
    });
  },

  async 'POST /api/agency/payouts/cancel'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'));
      await actIn(c, x, a, 'payouts.request');
      const p = await c.query("SELECT * FROM agency_payouts WHERE id = $1 AND agency_id = $2 AND status = 'pending' FOR UPDATE", [b.payoutId, a.id]);
      if (!p.rowCount) throw new HttpError(404, 'İptal edilebilir talep bulunamadı');
      await payoutStep(c, p.rows[0], 'cancelled', x.u.id, 'Ajans iptal etti');
      return { status: 'cancelled' };
    });
  },

  // --- Transfers, independence, parent change ---
  async 'GET /api/agency/transfers'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'), 'streamers.view');
    const r = await db.query('SELECT * FROM agency_transfers WHERE $1 IN (agency_id, from_agency_id, to_agency_id) ORDER BY status = \'pending\' DESC, id DESC LIMIT 100', [a.id]);
    const names = await namesFor(db, r.rows);
    return { transfers: r.rows.map((t) => ({ ...transferView(t, names), myParty: t.needs.filter((p) => (p === 'from' && t.from_agency_id === a.id) || (p === 'to' && t.to_agency_id === a.id)) })), names };
  },

  async 'POST /api/agency/transfers/approve'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'));
      await actIn(c, x, a, 'transfers.manage');
      const t = (await c.query('SELECT * FROM agency_transfers WHERE id = $1 FOR UPDATE', [b.transferId])).rows[0];
      if (!t) throw new HttpError(404, 'Talep bulunamadı');
      // A parent is not a party to its sub-agency's independence: it can neither approve nor block it.
      const party = t.from_agency_id === a.id && t.needs.includes('from') ? 'from' : t.to_agency_id === a.id && t.needs.includes('to') ? 'to' : null;
      if (!party) throw new HttpError(403, 'Bu talep ajansının kararını beklemiyor');
      if (b.approve !== true) {
        await rejectTransfer(c, t, x.u.id, await said(opt(b.note, 300, 'Not'), x, 'agency.transfer_decide'));
        return { transfer: transferView(t, await namesFor(c, [t])) };
      }
      const extra = {};
      if (party === 'from' && t.kind === 'streamer_move') {
        const paid = Number(t.fee) > 0;
        const mode = b.mode ?? (paid ? 'paid' : 'free');
        if (!['free', 'paid'].includes(mode)) bad('Geçersiz transfer türü');
        if (mode === 'paid' && !paid) bad('Bu transfer kurala göre ücretsiz');
        if (mode === 'free' && paid && !x.s.transfer_policy.owner_choice) throw new HttpError(403, 'Ücretsiz bırakma kapalı');
        extra.mode = mode;
        if (mode === 'free') extra.fee = 0;
      }
      await approveTransfer(c, t, party, x.u.id, extra);
      return { transfer: transferView(t, await namesFor(c, [t])) };
    });
  },

  async 'POST /api/agency/independence'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      await actIn(c, x, a, 'transfers.manage');
      if (!a.parent_id || a.status !== 'approved') throw new HttpError(409, 'Yalnızca aktif bir alt ajans bağımsızlık başvurusu yapabilir');
      const t = await openTransfer(c, { kind: 'independence', agencyId: a.id, fromId: a.parent_id, needs: ['center'], mode: 'free', reason: await said(text(b.reason, 3, 500, 'Gerekçe'), x, 'agency.independence', 'reason'), ref: ref(b.ref), actor: x.u.id });
      await notice(c, a.parent_id, 'transfer', `${a.name} bağımsızlık başvurusu yaptı`, 'Kararı merkez verir. Onaylanırsa bu ajansın bundan sonraki gelirinden pay almazsın; geçmiş kazançların değişmez.');
      return { transfer: transferView(t, await namesFor(c, [t])) };
    });
  },

  async 'POST /api/agency/change-parent'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      await actIn(c, x, a, 'transfers.manage');
      if (a.status !== 'approved') throw new HttpError(409, 'Ajans aktif değil');
      const to = await agencyByCode(c, b.toCode);
      if (to.status !== 'approved' || to.level !== 1 || to.id === a.id || to.id === a.parent_id) throw new HttpError(409, 'Hedef aktif bir üst ajans olmalı');
      const fr = await feeRule(c, 'agency', a.id, x.s);
      const t = await openTransfer(c, { kind: 'change_parent', agencyId: a.id, fromId: a.parent_id, toId: to.id, needs: ['to', 'center'], mode: fr.fee > 0 ? 'paid' : 'free', fee: fr.fee, feeRule: fr, reason: await said(text(b.reason, 3, 500, 'Gerekçe'), x, 'agency.change_parent', 'reason'), ref: ref(b.ref), actor: x.u.id });
      await notice(c, to.id, 'transfer', `${a.name} alt ajansın olmak istiyor`, '');
      if (a.parent_id) await notice(c, a.parent_id, 'transfer', `${a.name} üst ajans değişikliği istedi`, 'Kararı hedef ajans ve merkez verir.');
      return { transfer: transferView(t, await namesFor(c, [t])) };
    });
  },

  /** Closing a sub-agency (by itself or its parent): its streamers move to the parent once the centre approves. */
  async 'POST /api/agency/sub/close'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'), true);
      if (!a.parent_id || !['approved', 'suspended'].includes(a.status)) throw new HttpError(409, 'Yalnızca açık bir alt ajans kapatılabilir');
      const own = x.acc.agency.get(a.id)?.has('transfers.manage');
      const parent = x.acc.agency.get(a.parent_id)?.has('subagencies.manage');
      if (!own && !parent) {
        await audit(db, x.u.id, 'sub.close', 'agency', a.id, { result: 'denied' });
        throw new HttpError(403, 'Bu işlem için yetkin yok');
      }
      const t = await openTransfer(c, { kind: 'sub_close', agencyId: a.id, fromId: a.id, toId: a.parent_id, needs: ['center'], mode: 'free', reason: await said(text(b.reason, 3, 500, 'Gerekçe'), x, 'agency.sub_close', 'reason'), ref: ref(b.ref), actor: x.u.id });
      return { transfer: transferView(t, await namesFor(c, [t])) };
    });
  },

  async 'POST /api/agency/appeal'(req) {
    const b = await readJson(req);
    return tx(async (c) => {
      const x = await ctx(c, req);
      const a = await agencyRow(c, uuid(b.id, 'ajans'));
      if (!x.acc.agency.has(a.id)) throw new HttpError(403, 'Yalnızca kendi ajansın için itiraz edebilirsin');
      if (!['tier', 'commission', 'transfer', 'other'].includes(b.subject)) bad('Geçersiz konu');
      const r = await c.query('INSERT INTO agency_appeals (agency_id, subject, body, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [a.id, b.subject, text(b.body, 5, 1000, 'Açıklama'), x.u.id]);
      await audit(c, x.u.id, 'appeal.open', 'agency', a.id, { after: { appeal: Number(r.rows[0].id), subject: b.subject } });
      return { appeal: { id: Number(r.rows[0].id), status: 'open' } };
    });
  },

  async 'GET /api/agency/notices'(req, url) {
    const x = await ctx(db, req);
    const a = await agencyFor(db, x, url.searchParams.get('id'));
    if (!x.acc.agency.has(a.id)) throw new HttpError(403, 'Yalnızca kendi ajansının bildirimleri');
    const r = await db.query('SELECT id, kind, title, body, created_at FROM agency_notices WHERE agency_id = $1 ORDER BY id DESC LIMIT 100', [a.id]);
    return { notices: r.rows.map((x) => ({ id: Number(x.id), kind: x.kind, title: x.title, body: x.body, createdAt: x.created_at })) };
  },
};

/**
 * A new agency row (draft or pending) with a unique invite code. With `screen` (the applicant, for an
 * application from the app; staff tools pass none) the name, country and region, which other people see, are
 * checked for contact details (contact-filter.mjs). The contact fields and the description go to reviewers only.
 */
export async function insertAgency(c, b, { parent, owner, actor, status, pendingWith, bd = null, screen = null }) {
  const name = text(b.name, 2, 60, 'Ajans adı');
  const country = opt(b.country, 60, 'Ülke');
  const region = opt(b.region, 60, 'Bölge');
  if (screen) for (const [v, field] of [[name, 'name'], [country, 'country'], [region, 'region']]) await assertClean(v, screen, `agency.${field}`, field);
  for (let i = 0; i < 5; i++) {
    try {
      await c.query('SAVEPOINT ins');
      const r = await c.query(
        `INSERT INTO agencies (code, name, parent_id, level, owner_id, status, pending_with, country, region, contact_name, contact_phone, contact_email, expected_streamers, description, acquired_by_bd, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          newCode(),
          name,
          parent?.id ?? null,
          parent ? parent.level + 1 : 1,
          owner,
          status,
          pendingWith,
          country,
          region,
          opt(b.contactName, 60, 'Yetkili'),
          opt(b.contactPhone, 30, 'Telefon'),
          opt(b.contactEmail, 120, 'E-posta'),
          Number.isSafeInteger(b.expectedStreamers) && b.expectedStreamers >= 0 && b.expectedStreamers <= 100000 ? b.expectedStreamers : 0,
          opt(b.description, 1000, 'Açıklama'),
          bd,
          actor,
        ],
      );
      await c.query('RELEASE SAVEPOINT ins');
      await c.query('INSERT INTO agency_status_history (agency_id, from_status, to_status, actor_id, note) VALUES ($1, NULL, $2, $3, $4)', [r.rows[0].id, status, actor, 'Başvuru']);
      await audit(c, actor, 'agency.create', 'agency', r.rows[0].id, { after: { name, parent: parent?.id ?? null, owner, status } });
      return r.rows[0];
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT ins');
      if (e.code === '23503') throw new HttpError(404, 'Yönetici bulunamadı');
      if (e.code !== '23505') throw e;
      if (e.constraint === 'agencies_open_name') throw new HttpError(409, 'Bu adla açık bir ajans var');
      if (e.constraint === 'agencies_open_owner') throw new HttpError(409, 'Bu kişi zaten bir ajansın yöneticisi');
    }
  }
  throw new HttpError(500, 'Ajans kodu üretilemedi');
}
