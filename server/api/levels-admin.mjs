// Seviye ve VIP ayarları, the panel's side (levels.mjs holds the settings; docs/SEVIYE_AYARLARI.md):
//
//   GET  /api/admin/levels                       every system's settings, today's values, the perk list
//   POST /api/admin/levels/preview {system, doc} who would move up or down, how many each level holds, who the level
//                                                drop would take today; nothing saved
//   POST /api/admin/levels/save {system, doc, rev, confirm?}   saved whole; when anyone would drop (a higher
//                                                threshold, a drop turned on) only with confirm: true (409 confirm
//                                                with the numbers otherwise); `rev` as read (409 stale when someone
//                                                saved meanwhile); audit_events levels.save, before and after
//   POST /api/admin/levels/reset {system, rev, confirm?}  back to today's values, saved as a document (the same checks)
//   GET  /api/admin/levels/drops?system=&limit=  the latest level drops, with names
//   GET  /api/levels/drops                       mine (the app's level pages)
//
// The level drop: once in a while (LEVEL_DECAY_MS, default 6 h) each system whose rule is on takes those who have been
// inactive `idleDays` and weren't dropped in the last `everyDays` down `drop` levels (never below `floor`), to the
// first points of their new level. VIP: users.svip_xp. Cömertlik and Yankı are summed from the ledger, which never
// changes: the points go off in level_offsets. Each drop is a level_drops row and a notice to the person.
// Inactive: VIP no store top-up (purchases), Cömertlik no counted spend, Yankı no gift or call income.

import { HttpError, auth, clientIp, db, env, int, limit, readJson, tx } from './core.mjs';
import {
  DECAYING, DEFAULTS, PERKS, SYSTEMS, SYSTEM_NAMES, charmLevel, docsNow, pointsAt, refreshLevels, settingsOf, svipLevel, validate, wealthLevel,
} from './levels.mjs';
import { panelDetail } from './panel.mjs';
import { notify } from './push.mjs';
import { TEST_ADMIN } from './test-admin.mjs';
import { charmPointsOf } from './wallet.mjs';
import { COUNTED_SPEND, wealthPointsOf } from './wheel.mjs';

const positive = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const DECAY_MS = positive(env.LEVEL_DECAY_MS, 6 * 3600_000);
/** A day of the level drop's rules, in seconds (tests run days as seconds: LEVEL_DAY_SECONDS=1). */
const DAY_S = positive(env.LEVEL_DAY_SECONDS, 86_400);
const fmt = (n) => Number(n).toLocaleString('tr-TR');

async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const audited = (c, a, action, detail, req) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, action, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);
const systemOf = (v) => {
  if (!SYSTEMS.includes(v)) throw new HttpError(400, 'Bilinmeyen seviye sistemi');
  return v;
};
const conflict = (message, extra) => Object.assign(new HttpError(409, message), { extra });

// --- Who holds which level ---------------------------------------------------------------------------------------
/** Diamonds someone else gave (gifts): what Yankı counts (wallet.mjs charmPointsOf) and its activity. Alias l. */
const CHARM_INCOME = 'l.currency = \'diamond\' AND l.counterparty IS NOT NULL AND l.counterparty <> l.user_id AND l.amount > 0';
/** A store top-up that counted for VIP (purchases.mjs: sandbox ones don't). Alias p. */
const VIP_TOPUP = "p.status = 'credited' AND NOT p.sandbox";
/** Test server: admin accounts read at the top of everything (test-admin.mjs), so no drop applies to them. Alias u. */
const NOT_TEST_ADMIN = TEST_ADMIN ? "AND u.role <> 'admin'" : '';
/**
 * When someone was last active in a system ($1: their id): VIP their last store top-up (else when the account
 * started), Cömertlik their last counted spend, Yankı the last gift they got. Null: never.
 */
const LAST_ACTIVE = {
  vip: `SELECT coalesce((SELECT max(p.created_at) FROM purchases p WHERE p.user_id = u.id AND ${VIP_TOPUP}), u.created_at) AS last FROM users u WHERE u.id = $1`,
  wealth: `SELECT max(l.created_at) AS last FROM ledger l WHERE l.user_id = $1 AND ${COUNTED_SPEND}`,
  charm: `SELECT max(l.created_at) AS last FROM ledger l WHERE l.user_id = $1 AND ${CHARM_INCOME}`,
};

/** Everyone with points in `system` (vip, wealth, charm): id → points (Cömertlik and Yankı less their drops). */
async function pointsOfAll(system) {
  if (system === 'vip') {
    const r = await db.query('SELECT id, svip_xp FROM users WHERE svip_xp > 0 AND deleted_at IS NULL');
    return new Map(r.rows.map((x) => [x.id, Number(x.svip_xp)]));
  }
  const which = system === 'wealth' ? COUNTED_SPEND : CHARM_INCOME;
  const r = await db.query(`SELECT DISTINCT l.user_id FROM ledger l JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL WHERE ${which}`);
  const list = r.rows.map((x) => x.user_id);
  if (!list.length) return new Map();
  return system === 'wealth' ? wealthPointsOf(db, list) : charmPointsOf(db, list);
}
const levelIn = (system, points, docs) => (system === 'vip' ? svipLevel(points, docs) : system === 'wealth' ? wealthLevel(points, docs) : charmLevel(points, docs));

/**
 * Who the drop would take now under `rule` (system vip, wealth or charm; docs: the settings to apply): inactive
 * `idleDays`, not dropped in the last `everyDays`, above the floor. A shortlist: applyDrop reads each again.
 */
async function decayCandidates(system, rule, docs) {
  let rows;
  if (system === 'vip') {
    rows = (
      await db.query(
        `SELECT u.id, u.svip_xp AS points FROM users u
           CROSS JOIN LATERAL (SELECT coalesce((SELECT max(p.created_at) FROM purchases p WHERE p.user_id = u.id AND ${VIP_TOPUP}), u.created_at) AS last) x
          WHERE u.svip_xp > 0 AND u.deleted_at IS NULL ${NOT_TEST_ADMIN} AND x.last < now() - make_interval(secs => $1)`,
        [rule.idleDays * DAY_S],
      )
    ).rows.map((x) => ({ id: x.id, points: Number(x.points) }));
  } else {
    const r = await db.query(
      `SELECT l.user_id AS id FROM ledger l JOIN users u ON u.id = l.user_id AND u.deleted_at IS NULL ${NOT_TEST_ADMIN}
        WHERE ${system === 'wealth' ? COUNTED_SPEND : CHARM_INCOME}
        GROUP BY l.user_id HAVING max(l.created_at) < now() - make_interval(secs => $1)`,
      [rule.idleDays * DAY_S],
    );
    const ids = r.rows.map((x) => x.id);
    const points = ids.length ? await (system === 'wealth' ? wealthPointsOf(db, ids) : charmPointsOf(db, ids)) : new Map();
    rows = ids.map((id) => ({ id, points: points.get(id) ?? 0 }));
  }
  if (!rows.length) return [];
  const recent = new Set(
    (
      await db.query('SELECT DISTINCT user_id FROM level_drops WHERE system = $1 AND user_id = ANY($2::uuid[]) AND created_at > now() - make_interval(secs => $3)', [
        system,
        rows.map((x) => x.id),
        rule.everyDays * DAY_S,
      ])
    ).rows.map((x) => x.user_id),
  );
  return rows.filter((x) => !recent.has(x.id) && levelIn(system, x.points, docs) > rule.floor);
}

/** How a draft changes things: who moves up or down, how many each level holds after, who the drop takes today. */
async function impactOf(system, next) {
  const docs = { ...docsNow(), [system]: next };
  const out = { people: 0, up: 0, down: 0, levels: {}, decayToday: 0 };
  if (system === 'vip' || system === 'wealth' || system === 'charm') {
    const points = await pointsOfAll(system);
    for (const p of points.values()) {
      if (p <= 0) continue;
      const before = levelIn(system, p, docsNow());
      const after = levelIn(system, p, docs);
      out.people++;
      if (after > before) out.up++;
      if (after < before) out.down++;
      out.levels[after] = (out.levels[after] ?? 0) + 1;
    }
    if (next.decay?.on && system !== 'vip') out.decayToday = (await decayCandidates(system, next.decay, docs)).length;
  } else if (system === 'noble') {
    const r = await db.query(
      `SELECT tier, count(DISTINCT user_id)::int AS n FROM entitlements
        WHERE kind = 'noble' AND revoked_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) GROUP BY tier`,
    );
    for (const x of r.rows) out.levels[x.tier] = x.n;
    out.people = r.rows.reduce((s, x) => s + x.n, 0);
  }
  return out;
}

// --- The level drop ----------------------------------------------------------------------------------------------
const DROP_TEXT = {
  vip: (x) => ({ title: 'VIP seviyen düştü', body: `VIP ${x.level} → VIP ${x.to}: ${x.idle} gündür jeton yüklemedin. Yükleme yaptıkça puanın yeniden artar.` }),
  wealth: (x) => ({ title: 'Cömertlik seviyen düştü', body: `Lv.${x.level} → Lv.${x.to}: ${x.idle} gündür harcama yapmadın. Harcadıkça puanın yeniden artar.` }),
  charm: (x) => ({ title: 'Yankı seviyen düştü', body: `Lv.${x.level} → Lv.${x.to}: ${x.idle} gündür hediye almadın. Hediye aldıkça puanın yeniden artar.` }),
};

/**
 * One person's drop, everything read again with their account row locked: a top-up, spend or gift that landed
 * since the shortlist keeps their level, and two runs at once (a second API process) never drop them twice. Their
 * points go to the first points of the new level: VIP in users.svip_xp, Cömertlik and Yankı as more points off in
 * level_offsets (anything earned later counts on top). Whether they dropped.
 */
async function applyDrop(system, id, rule, docs) {
  const done = await tx(async (c) => {
    const u = (await c.query('SELECT svip_xp FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
    if (!u) return null;
    const again = await c.query('SELECT 1 FROM level_drops WHERE user_id = $1 AND system = $2 AND created_at > now() - make_interval(secs => $3)', [id, system, rule.everyDays * DAY_S]);
    if (again.rowCount) return null;
    const a = (
      await c.query(`SELECT a.last < now() - make_interval(secs => $2) AS idle, floor(extract(epoch FROM now() - a.last) / $3)::int AS days FROM (${LAST_ACTIVE[system]}) a`, [
        id,
        rule.idleDays * DAY_S,
        DAY_S,
      ])
    ).rows[0];
    if (!a?.idle) return null;
    const points = system === 'vip' ? Number(u.svip_xp) : ((await (system === 'wealth' ? wealthPointsOf : charmPointsOf)(c, [id])).get(id) ?? 0);
    const level = levelIn(system, points, docs);
    if (level <= rule.floor) return null;
    const to = Math.max(rule.floor, level - rule.drop);
    const after = Math.min(points, pointsAt(system, to, docs));
    if (system === 'vip') await c.query('UPDATE users SET svip_xp = $2 WHERE id = $1', [id, after]);
    else {
      await c.query(
        `INSERT INTO level_offsets (user_id, system, points) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, system) DO UPDATE SET points = level_offsets.points + EXCLUDED.points`,
        [id, system, points - after],
      );
    }
    await c.query('INSERT INTO level_drops (user_id, system, from_level, to_level, points_before, points_after, idle_days) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      system,
      level,
      to,
      points,
      after,
      a.days,
    ]);
    return { level, to, idle: a.days };
  });
  if (done) notify([id], { ...DROP_TEXT[system](done), data: { type: 'level_drop', system } });
  return !!done;
}

let running = false;
/** Applies every rule that is on, once: { vip?: n, wealth?: n, charm?: n } dropped. */
export async function runLevelDecay() {
  if (running) return {};
  running = true;
  try {
    const docs = docsNow();
    const out = {};
    for (const system of DECAYING) {
      // VIP: the monthly keep rule (vip-month.mjs, owners 24 Nov 2026) replaced the inactivity drop.
      if (system === 'vip') continue;
      const rule = docs[system].decay;
      if (!rule?.on) continue;
      let n = 0;
      for (const x of await decayCandidates(system, rule, docs)) {
        const ok = await applyDrop(system, x.id, rule, docs).catch((e) => (console.error('level drop', system, x.id, String(e?.message ?? e).slice(0, 200)), false));
        if (ok) n++;
      }
      out[system] = n;
      if (n) console.log(`level drop: ${system} ${n}`);
    }
    return out;
  } finally {
    running = false;
  }
}

let timer = null;
export function startLevelDecay() {
  if (timer) return;
  const run = () => void runLevelDecay().catch((e) => console.error('level drop failed', String(e?.message ?? e).slice(0, 200)));
  timer = setInterval(run, DECAY_MS);
  timer.unref();
  // Soon after a start too: a deploy doesn't push it back by hours.
  setTimeout(run, Math.min(DECAY_MS, 120_000)).unref();
}
export function stopLevelDecay() {
  clearInterval(timer);
  timer = null;
}

// --- Routes -------------------------------------------------------------------------------------------------------
function viewOf(system) {
  const { doc, meta } = settingsOf(system);
  // Edited: different from today's values (a reset saves those, so it reads as not edited again).
  const edited = !!meta && JSON.stringify(doc) !== JSON.stringify(validate(system, DEFAULTS[system]));
  return { system, name: SYSTEM_NAMES[system], doc, defaults: DEFAULTS[system], edited, rev: meta?.rev ?? 0, updatedAt: meta?.updatedAt ?? null };
}
const confirmText = (system, impact) => {
  const parts = [];
  if (impact.down) parts.push(`${fmt(impact.down)} kişinin ${SYSTEM_NAMES[system]} seviyesi düşer`);
  if (impact.decayToday) parts.push(`seviye düşmesi bugün ${fmt(impact.decayToday)} kişiyi düşürür`);
  return `${parts.join('; ')}. Onaylıyorsan yeniden kaydet.`;
};

/**
 * Saves `next` after the checks (reset saves today's values, so the row and its growing `rev` stay: the phones'
 * catalog version never goes back); the new view and the impact.
 */
async function store(req, a, system, next, b, action) {
  const impact = await impactOf(system, next);
  if ((impact.down > 0 || impact.decayToday > 0) && b.confirm !== true) throw conflict(confirmText(system, impact), { code: 'confirm', impact });
  await tx(async (c) => {
    // One save of a system at a time, also its first (no row to lock yet): the second reads the first's rev (stale).
    await c.query("SELECT pg_advisory_xact_lock(hashtext('level_settings:' || $1))", [system]);
    const cur = (await c.query('SELECT doc, rev FROM level_settings WHERE system = $1 FOR UPDATE', [system])).rows[0];
    const rev = cur ? Number(cur.rev) : 0;
    if (b.rev !== undefined && b.rev !== null && Number(b.rev) !== rev) throw conflict('Bu ayarı az önce başkası değiştirdi; sayfayı yenileyip tekrar dene', { code: 'stale' });
    const before = cur ? cur.doc : DEFAULTS[system];
    await c.query(
      `INSERT INTO level_settings (system, doc, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (system) DO UPDATE SET doc = EXCLUDED.doc, rev = nextval('level_settings_rev'), updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [system, JSON.stringify(next), a.id],
    );
    await audited(c, a, action, { system, before, after: next, impact: { up: impact.up, down: impact.down, decayToday: impact.decayToday } }, req);
  });
  await refreshLevels();
  return { ok: true, impact, ...viewOf(system) };
}

export const levelRoutes = {
  async 'GET /api/admin/levels'(req) {
    await admin(req);
    return { perks: PERKS, systems: SYSTEMS.map(viewOf) };
  },

  async 'POST /api/admin/levels/preview'(req) {
    const a = await admin(req);
    limit(`levels-preview:${a.id}`, 30, 'Çok fazla deneme, biraz bekle');
    const b = await readJson(req);
    const system = systemOf(b.system);
    return { system, impact: await impactOf(system, validate(system, b.doc)) };
  },

  async 'POST /api/admin/levels/save'(req) {
    const a = await admin(req);
    limit(`levels-admin:${a.id}`, 30, 'Çok fazla deneme, biraz bekle');
    const b = await readJson(req);
    const system = systemOf(b.system);
    return store(req, a, system, validate(system, b.doc), b, 'levels.save');
  },

  async 'POST /api/admin/levels/reset'(req) {
    const a = await admin(req);
    limit(`levels-admin:${a.id}`, 30, 'Çok fazla deneme, biraz bekle');
    const b = await readJson(req);
    const system = systemOf(b.system);
    return store(req, a, system, validate(system, DEFAULTS[system]), b, 'levels.reset');
  },

  async 'GET /api/admin/levels/drops'(req, url) {
    await admin(req);
    const system = url.searchParams.get('system');
    const n = int(Number(url.searchParams.get('limit') ?? 100), 1, 500) ?? 100;
    const r = await db.query(
      `SELECT d.id, d.user_id, u.name, d.system, d.from_level, d.to_level, d.points_before, d.points_after, d.idle_days, d.created_at
         FROM level_drops d JOIN users u ON u.id = d.user_id
        WHERE ($1::text IS NULL OR d.system = $1) ORDER BY d.id DESC LIMIT $2`,
      [system && DECAYING.includes(system) ? system : null, n],
    );
    return {
      drops: r.rows.map((x) => ({
        id: Number(x.id),
        userId: x.user_id,
        name: x.name,
        system: x.system,
        from: x.from_level,
        to: x.to_level,
        pointsBefore: Number(x.points_before),
        pointsAfter: Number(x.points_after),
        idleDays: x.idle_days,
        at: x.created_at,
      })),
    };
  },

  async 'GET /api/levels/drops'(req) {
    const u = await auth(req);
    const r = await db.query('SELECT system, from_level, to_level, idle_days, created_at FROM level_drops WHERE user_id = $1 ORDER BY id DESC LIMIT 20', [u.id]);
    return { drops: r.rows.map((x) => ({ system: x.system, from: x.from_level, to: x.to_level, idleDays: x.idle_days, at: x.created_at })) };
  },
};
