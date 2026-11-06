// Canlı ayarlar (live settings): the values the owner changes from the admin panel without a deploy. The keys,
// their bounds and the preview text are in live-registry.mjs; this file keeps the table's state in memory, reads
// it again when another process saves (poll), and has the admin routes. Every save is a new batch of rows in
// live_settings (015), an audit_events row and a push to every admin; nothing is ever changed or deleted.
//
//   live()                 the settings in effect now (frozen snapshot, synchronous; snapshotOf in live-registry.mjs)
//   campaignAt(c, at)      the campaign that was saved as of time `at` (a late-verified purchase), or null
//
//   GET  /api/admin/live-settings          → { v, safeMode, serverNow, env, settings: [...] }
//   POST /api/admin/live-settings          { changes: { key: value | null }, reason, baseV, dryRun?, confirm?, appVersion? }
//                                          → dryRun: { preview, needsConfirm, v }, else { batch, v, preview }
//   GET  /api/admin/live-settings/history  ?before=<v>&limit=30 → { batches: [...], next }
//   POST /api/admin/live-settings/rollback { batch, reason, baseV, dryRun?, confirm?, appVersion? } → as the save
//
// A save answers 409 { code: 'stale', v } when baseV is not the current v (someone saved in between), and 409
// { code: 'confirm_needed', preview } when a change needs a second confirmation and confirm isn't true. The
// admin routes are in no feature of features.mjs ROUTES, so no kill switch can lock the owner out.
//
//   LIVE_POLL_MS    how often other processes' saves are picked up (default 5000)
//   LIVE_SAFE_MODE  1: the table is ignored (defaults and .env only) and saving is refused; for when a bad
//                   value locks everyone out. Needs a restart.
import crypto from 'node:crypto';
import { HttpError, UUID, auth, clientIp, db, env, int, limit, readJson, text, tx } from './core.mjs';
import { LiveError, REGISTRY, checkChange, configOf, effectiveOf, impactOf, isBig, snapshotOf, validate } from './live-registry.mjs';
import { notify } from './push.mjs';

const positive = (v, d) => {
  const n = Number(v ?? d);
  return Number.isSafeInteger(n) && n > 0 ? n : d;
};

export const LIVE_SAFE_MODE = env.LIVE_SAFE_MODE === '1';
const POLL_MS = positive(env.LIVE_POLL_MS, 5000);
const ENV = configOf(env);
if (LIVE_SAFE_MODE) console.warn('LIVE_SAFE_MODE=1: live settings are ignored and cannot be saved');

let current = snapshotOf([], env, { v: 0 });
/** The settings in effect now. Frozen; v is the newest live_settings id it was read at (0 = nothing saved). */
export const live = () => current;

const known = (key) => Object.hasOwn(REGISTRY, key);
const INVALID = Symbol('invalid');
/** A stored value as the registry cleans it today; INVALID when it no longer passes. */
function storedOf(key, value) {
  try {
    return validate(key, value, { stored: true });
  } catch {
    return INVALID;
  }
}
const same = (a, b) => a !== INVALID && b !== INVALID && JSON.stringify(a) === JSON.stringify(b);

/** The newest row per key (with its author's name) and v, in one statement so both are from the same moment. */
async function readState(q = db) {
  const r = await q.query(
    `SELECT m.v, l.id, l.key, l.value, l.reason, l.set_by, l.created_at, u.name AS set_by_name
       FROM (SELECT coalesce(max(id), 0) AS v FROM live_settings) m
       LEFT JOIN LATERAL (SELECT DISTINCT ON (key) * FROM live_settings ORDER BY key, created_at DESC, id DESC) l ON true
       LEFT JOIN users u ON u.id = l.set_by`,
  );
  return { v: Number(r.rows[0].v), rows: r.rows.filter((x) => x.key !== null) };
}

/** Reads the table and swaps the snapshot (never back to an older one). With LIVE_SAFE_MODE the table is not read. */
export async function refreshLive() {
  if (LIVE_SAFE_MODE) return current;
  const st = await readState();
  if (st.v >= current.v) {
    const next = snapshotOf(st.rows, env, { v: st.v });
    if (next.invalid.length && st.v !== current.v) console.warn(`live settings: stored value no longer valid, default used: ${next.invalid.join(', ')}`);
    current = next;
  }
  return current;
}

let timer = null;
/** Picks up saves from other processes (and rows written by hand) every LIVE_POLL_MS. A failed read keeps the last snapshot. */
export function startLiveSync() {
  if (LIVE_SAFE_MODE || timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await db.query('SELECT coalesce(max(id), 0) AS v FROM live_settings');
      if (Number(r.rows[0].v) !== current.v) await refreshLive();
    } catch (e) {
      console.error('live settings sync failed', String(e?.message ?? e).slice(0, 200));
    } finally {
      busy = false;
    }
  }, POLL_MS);
  timer.unref();
}
export function stopLiveSync() {
  clearInterval(timer);
  timer = null;
}

/**
 * The campaign saved as of `at` (Date, ms or ISO string): the newest 'campaign' row created at or before it, or
 * null. For a purchase verified after the campaign was changed; campaignBonus() then checks the time window.
 */
export async function campaignAt(c = db, at = new Date()) {
  if (LIVE_SAFE_MODE) return null;
  const t = new Date(typeof at === 'string' ? Date.parse(at) : at instanceof Date ? at.getTime() : Number(at));
  if (!Number.isFinite(t.getTime())) return null;
  const r = await c.query("SELECT value FROM live_settings WHERE key = 'campaign' AND created_at <= $1 ORDER BY created_at DESC, id DESC LIMIT 1", [t]);
  const v = r.rowCount ? storedOf('campaign', r.rows[0].value) : null;
  return v && v !== INVALID ? Object.freeze(v) : null;
}

// --- Admin routes ------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}

/** The registry's refusals (LiveError) as a 400 with its Turkish text. */
function checked(fn) {
  try {
    return fn();
  } catch (e) {
    throw e instanceof LiveError ? new HttpError(400, e.message) : e;
  }
}
const conflict = (message, extra) => Object.assign(new HttpError(409, message), { extra });
const stale = (v) => conflict('Ayarlar bu arada değişti, tekrar bak', { code: 'stale', v });

/** What every save and rollback starts with: the rate limit, safe mode, the body, reason and baseV. */
async function writeBody(req, a) {
  limit(`live-settings:${a.id}`, 30, 'Çok fazla deneme, biraz bekle');
  if (LIVE_SAFE_MODE) throw new HttpError(503, 'Canlı ayarlar güvenli modda kapalı');
  const b = await readJson(req, 16_384);
  const reason = text(b.reason, 3, 300, 'Neden');
  if ([...reason].length < 3) throw new HttpError(400, 'Neden 3–300 karakter olmalı');
  const baseV = int(b.baseV, 0, Number.MAX_SAFE_INTEGER);
  if (baseV === null) throw new HttpError(400, 'Ayarların sürümü (baseV) eksik');
  return { ...b, reason, baseV, dryRun: b.dryRun === true, confirm: b.confirm === true, appVersion: typeof b.appVersion === 'string' ? b.appVersion.slice(0, 40) : null };
}

/**
 * The save path shared by a change and a rollback. `changes`: [{ key, value (cleaned, null = default),
 * changedSince? }]. `rollbackOf`: the batch a rollback undoes.
 */
async function apply(req, a, b, changes, rollbackOf = null) {
  const st = await readState();
  if (b.baseV !== st.v) throw stale(st.v);
  const now = Date.now();
  const stored = new Map(st.rows.map((r) => [r.key, r]));
  const rawOf = (key) => (stored.has(key) ? stored.get(key).value : null);
  const todo = changes.filter((c) => !same(stored.has(c.key) ? storedOf(c.key, rawOf(c.key)) : null, c.value));
  if (!todo.length) throw new HttpError(400, 'Değişiklik yok');

  const before = effectiveOf(snapshotOf(st.rows, env, { v: st.v }));
  const keys = new Set(todo.map((c) => c.key));
  const next = effectiveOf(snapshotOf([...st.rows.filter((r) => !keys.has(r.key)), ...todo], env));
  for (const c of todo) checked(() => checkChange(c.key, before[c.key], next[c.key], { appVersion: b.appVersion, raw: c.value, now }));
  const preview = todo.map((c) => {
    const impact = impactOf(c.key, before[c.key], next[c.key], { env: ENV, next, raw: c.value, now });
    return {
      key: c.key,
      label: REGISTRY[c.key].label,
      before: before[c.key],
      after: next[c.key],
      reset: c.value === null,
      impact: c.changedSince ? `Bu ayar sonradan yine değişti; geri alınca o değişiklik de gider. ${impact}` : impact,
      big: !!c.changedSince || isBig(c.key, before[c.key], c.value),
      ...(rollbackOf ? { changedSince: !!c.changedSince } : {}),
    };
  });
  const needsConfirm = preview.some((p) => p.big);
  if (b.dryRun) return { preview, needsConfirm, v: st.v };
  if (needsConfirm && !b.confirm) throw conflict('Bu değişiklik için onay gerekli', { code: 'confirm_needed', preview });

  const batch = crypto.randomUUID();
  const ip = clientIp(req);
  const v = await tx(async (c) => {
    // One writer at a time, and only on top of what the admin saw.
    await c.query('LOCK TABLE live_settings IN SHARE ROW EXCLUSIVE MODE');
    const m = await c.query('SELECT coalesce(max(id), 0) AS v FROM live_settings');
    if (Number(m.rows[0].v) !== b.baseV) throw stale(Number(m.rows[0].v));
    let last = 0;
    for (const x of todo) {
      const r = await c.query('INSERT INTO live_settings (batch, key, value, reason, set_by, rollback_of, ip) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [
        batch,
        x.key,
        JSON.stringify(x.value),
        b.reason,
        a.id,
        rollbackOf,
        ip,
      ]);
      last = Number(r.rows[0].id);
    }
    const detail = { batch, reason: b.reason, ...(rollbackOf ? { rollbackOf } : {}), changes: todo.map((x) => ({ key: x.key, before: rawOf(x.key), after: x.value })) };
    await c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, rollbackOf ? 'live_settings.rollback' : 'live_settings.set', JSON.stringify(detail), ip]);
    return last;
  });

  console.log(`live settings ${rollbackOf ? 'rollback' : 'set'} by ${a.id}: ${[...keys].join(', ')}`);
  await refreshLive().catch((e) => console.error('live settings refresh failed', String(e?.message ?? e).slice(0, 200)));
  const labels = preview.map((p) => p.label).join(', ');
  db.query("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL")
    .then((r) => notify(r.rows.map((x) => x.id), { title: 'Canlı ayar değişti', body: `${a.name}${rollbackOf ? ' geri aldı' : ''}: ${labels} — ${b.reason}`, data: { type: 'live_settings', batch } }))
    .catch((e) => console.error('live settings push failed', String(e?.message ?? e).slice(0, 200)));
  return { batch, v, preview };
}

const nameOf = (row) => ({ id: row.set_by, name: row.set_by_name ?? null });

export const liveSettingsRoutes = {
  /** Every key with its bounds, the value saved (null = default), the value in effect and who changed it last. */
  async 'GET /api/admin/live-settings'(req) {
    await admin(req);
    const st = await readState();
    const snap = LIVE_SAFE_MODE ? current : snapshotOf(st.rows, env, { v: st.v });
    const eff = effectiveOf(snap);
    const stored = new Map(st.rows.map((r) => [r.key, r]));
    return {
      v: st.v,
      safeMode: LIVE_SAFE_MODE,
      serverNow: new Date().toISOString(),
      env: { featuresOff: ENV.featuresOff, notice: ENV.notice, minVersion: ENV.minVersion },
      settings: Object.entries(REGISTRY).map(([key, r]) => {
        const row = stored.get(key);
        const value = row ? storedOf(key, row.value) : null;
        return {
          key,
          group: r.group,
          label: r.label,
          help: r.help,
          type: r.type,
          bounds: r.bounds,
          default: r.default,
          value: value === INVALID ? row.value : value,
          effective: eff[key],
          invalid: value === INVALID,
          changedAt: row?.created_at ?? null,
          changedBy: row ? nameOf(row) : null,
          reason: row?.reason ?? null,
        };
      }),
    };
  },

  async 'POST /api/admin/live-settings'(req) {
    const a = await admin(req);
    const b = await writeBody(req, a);
    if (!b.changes || typeof b.changes !== 'object' || Array.isArray(b.changes)) throw new HttpError(400, 'Değişiklikler eksik');
    const now = Date.now();
    const changes = Object.keys(b.changes).map((key) => ({ key, value: checked(() => validate(key, b.changes[key], { now })) }));
    if (!changes.length) throw new HttpError(400, 'Değişiklik yok');
    return apply(req, a, b, changes);
  },

  /** Saved batches, newest first; before/after are the stored values (null = default), worked out in id order. */
  async 'GET /api/admin/live-settings/history'(req, url) {
    await admin(req);
    const q = (name, d, min, max) => {
      const s = url.searchParams.get(name);
      const n = s === null || s === '' ? d : int(Number(s), min, max);
      if (n === null) throw new HttpError(400, `Geçersiz ${name}`);
      return n;
    };
    const before = q('before', Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER);
    const n = q('limit', 30, 1, 100);
    const r = await db.query(
      `WITH b AS (SELECT batch, max(id) AS last FROM live_settings GROUP BY batch HAVING max(id) < $1 ORDER BY max(id) DESC LIMIT $2)
       SELECT l.id, l.batch, l.key, l.value, l.reason, l.set_by, l.rollback_of, l.created_at, b.last, u.name AS set_by_name,
              (SELECT p.value FROM live_settings p WHERE p.key = l.key AND p.id < l.id ORDER BY p.id DESC LIMIT 1) AS before
         FROM live_settings l JOIN b USING (batch) LEFT JOIN users u ON u.id = l.set_by
        ORDER BY b.last DESC, l.id`,
      [before, n],
    );
    const batches = [];
    for (const row of r.rows) {
      let x = batches.at(-1);
      if (x?.batch !== row.batch) {
        x = { batch: row.batch, at: row.created_at, by: nameOf(row), reason: row.reason, rollbackOf: row.rollback_of, changes: [], last: Number(row.last) };
        batches.push(x);
      }
      x.changes.push({ key: row.key, label: REGISTRY[row.key]?.label ?? row.key, before: row.before, after: row.value });
    }
    const next = batches.length === n ? batches.at(-1).last : null;
    return { batches: batches.map(({ last, ...x }) => x), next };
  },

  /** Puts each key of `batch` back to the value it had just before it, through the same checks as a save. */
  async 'POST /api/admin/live-settings/rollback'(req) {
    const a = await admin(req);
    const b = await writeBody(req, a);
    const batch = typeof b.batch === 'string' ? b.batch.toLowerCase() : '';
    if (!UUID.test(batch)) throw new HttpError(400, 'Geçersiz değişiklik');
    const r = await db.query(
      `SELECT l.key,
              (SELECT p.value FROM live_settings p WHERE p.key = l.key AND p.id < l.id ORDER BY p.id DESC LIMIT 1) AS target,
              EXISTS (SELECT 1 FROM live_settings n WHERE n.key = l.key AND n.id > l.id) AS changed_since
         FROM live_settings l WHERE l.batch = $1 ORDER BY l.id`,
      [batch],
    );
    if (!r.rowCount) throw new HttpError(404, 'Bu değişiklik bulunamadı');
    // A value that no longer passes the registry goes back to the default instead.
    const changes = r.rows
      .filter((x) => known(x.key))
      .map((x) => {
        const t = x.target === null ? null : storedOf(x.key, x.target);
        return { key: x.key, value: t === INVALID ? null : t, changedSince: x.changed_since };
      });
    return apply(req, a, b, changes, batch);
  },
};
