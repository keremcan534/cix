// Görev ödülleri (docs/CANTA.md): an item the team ties to a task of Görevler in the finance panel (Seviye ve görev
// ödülleri › Görev); whoever takes the task's reward finds it in Çantam too (economy.mjs grantReward, source 'task',
// origin the task's name), in the same transaction as the task's coins. A daily task gives it each day it is taken:
// a term adds to the one already had (up to MAX_AHEAD_DAYS ahead), an item had for good adds nothing. A rule taken
// away gives nothing more; what it gave stays. The only task on the server today is the daily call (call-log.mjs).
//
//   GET  /api/admin/task-rewards                      → { rules, items, tasks, limits }
//   POST /api/admin/task-rewards        { task, sku, days? }  → { rule }
//   POST /api/admin/task-rewards/delete { id }        → { deleted }
import { HttpError, auth, clientIp, db, int, limit, readJson, tx } from './core.mjs';
import { MAX_AHEAD_DAYS } from './catalog.mjs';
// economy.mjs gives the item; used only inside handlers.
import { grantReward, pickReward, rewardChoices, rewardItem } from './economy.mjs';
import { panelDetail } from './panel.mjs';

/** The tasks on the server that can give an item, and the name Çantam shows ("Görev ödülü · …"). */
export const TASKS = Object.freeze({ call: 'Günlük görüntülü arama' });
const RULES_MAX = 50;
const CACHE_MS = 15_000;

let cache = { at: 0, rules: [] };
async function rules() {
  if (Date.now() - cache.at < CACHE_MS) return cache.rules;
  const r = await db.query('SELECT id, task, sku, days FROM task_rewards WHERE deleted_at IS NULL ORDER BY task, id');
  cache = { at: Date.now(), rules: r.rows.map((x) => ({ id: Number(x.id), task: x.task, sku: x.sku, days: x.days })) };
  return cache.rules;
}
const forget = () => (cache = { at: 0, rules: [] });
const termOf = (item, days) => (item.days === null ? null : (days ?? item.days));

/** What `task` gives as items now, as the app shows them: { sku, kind, name, days } (days null: for good). */
export async function taskItems(task) {
  return (await rules())
    .filter((r) => r.task === task)
    .map((r) => [r, rewardItem(r.sku)])
    .filter(([, item]) => item)
    .map(([r, item]) => ({ sku: item.sku, kind: item.kind, name: item.name, days: termOf(item, r.days) }));
}

/**
 * Puts `task`'s items in `uid`'s Çantam, in the task reward's transaction `c`; `key` is that reward's own ref (one a
 * day for a daily task), so a replay gives nothing more. The items given.
 */
export async function grantTaskRewards(c, uid, task, key) {
  const given = [];
  for (const r of (await rules()).filter((x) => x.task === task)) {
    const item = rewardItem(r.sku);
    if (item && (await grantReward(c, uid, r.sku, { days: r.days ?? undefined, source: 'task', ref: `task:${key}:${r.id}`, origin: TASKS[task] }))) {
      given.push({ sku: item.sku, kind: item.kind, name: item.name, days: termOf(item, r.days) });
    }
  }
  return given;
}

// --- The panel -----------------------------------------------------------------------------------------------
async function admin(req) {
  const u = await auth(req);
  if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
  return u;
}
const audited = (c, a, action, detail, req) =>
  c.query('INSERT INTO audit_events (actor, action, target, detail, ip) VALUES ($1, $2, NULL, $3, $4)', [a.id, action, JSON.stringify({ ...detail, ...panelDetail(a) }), clientIp(req)]);
const ruleView = (r, names) => ({
  id: Number(r.id),
  task: r.task,
  taskName: TASKS[r.task],
  sku: r.sku,
  name: names.get(r.sku)?.name ?? r.sku,
  kind: names.get(r.sku)?.kind ?? null,
  days: r.days ?? null,
  given: Number(r.given ?? 0),
  createdAt: r.created_at,
});

export const taskRewardRoutes = {
  async 'GET /api/admin/task-rewards'(req) {
    await admin(req);
    const items = rewardChoices();
    const names = new Map(items.map((x) => [x.sku, x]));
    // How many times each was given (a daily task's: once a day each).
    const r = await db.query(
      `SELECT t.*, (SELECT count(*) FROM entitlements e WHERE e.source = 'task' AND e.ref LIKE 'task:%:' || t.id AND e.sku = t.sku) AS given
         FROM task_rewards t WHERE t.deleted_at IS NULL ORDER BY t.task, t.id`,
    );
    return { rules: r.rows.map((x) => ruleView(x, names)), items, tasks: TASKS, limits: { daysMax: MAX_AHEAD_DAYS, rulesMax: RULES_MAX } };
  },

  async 'POST /api/admin/task-rewards'(req) {
    const a = await admin(req);
    limit(`task-rewards:${a.id}`, 60, 'Çok fazla değişiklik, biraz bekle');
    const b = await readJson(req);
    if (!Object.hasOwn(TASKS, b.task)) throw new HttpError(400, 'Görev bulunamadı');
    const { item, days } = pickReward(b.sku, b.days);
    const rule = await tx(async (c) => {
      const n = (await c.query('SELECT count(*)::int AS n FROM task_rewards WHERE deleted_at IS NULL')).rows[0].n;
      if (n >= RULES_MAX) throw new HttpError(400, `En fazla ${RULES_MAX} görev ödülü olabilir`);
      const same = await c.query('SELECT 1 FROM task_rewards WHERE task = $1 AND sku = $2 AND deleted_at IS NULL', [b.task, item.sku]);
      if (same.rowCount) throw new HttpError(409, `${TASKS[b.task]} için bu ödül zaten var`);
      const r = (await c.query('INSERT INTO task_rewards (task, sku, days, created_by) VALUES ($1, $2, $3, $4) RETURNING *', [b.task, item.sku, days, a.id])).rows[0];
      await audited(c, a, 'task_reward.create', { rule: Number(r.id), task: b.task, sku: item.sku, days }, req);
      return r;
    });
    forget();
    return { rule: ruleView(rule, new Map(rewardChoices().map((x) => [x.sku, x]))) };
  },

  async 'POST /api/admin/task-rewards/delete'(req) {
    const a = await admin(req);
    limit(`task-rewards:${a.id}`, 60, 'Çok fazla değişiklik, biraz bekle');
    const id = int((await readJson(req)).id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz ödül');
    await tx(async (c) => {
      const r = (await c.query('UPDATE task_rewards SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *', [id, a.id])).rows[0];
      if (!r) throw new HttpError(404, 'Ödül bulunamadı');
      await audited(c, a, 'task_reward.delete', { rule: id, task: r.task, sku: r.sku, days: r.days }, req);
    });
    forget();
    return { deleted: true };
  },
};
