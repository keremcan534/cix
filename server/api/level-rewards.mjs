// Seviye ödülleri (docs/CANTA.md): an item the team ties to a level of VIP, Cömertlik or Yankı in the finance panel
// (Seviye ve VIP › Seviye ve görev ödülleri); whoever has that level finds it in Çantam (economy.mjs grantReward, source
// 'level', origin "VIP 5"). Given when the person's economy is read (GET /api/economy: the app reads it at sign-in and
// each time Çantam opens; older apps never read it, so theirs come with the update), every rule at or under their
// level now, once per rule and person (level_reward_claims, given or not: an item already had for good adds nothing
// and isn't tried again). Someone already past the level when the rule is made gets it at their next read too. A rule
// taken away gives nothing more; what it gave stays.
//
//   GET  /api/admin/level-rewards                              → { rules, items, systems }
//   POST /api/admin/level-rewards        { system, level, sku, days? }  → { rule }
//   POST /api/admin/level-rewards/delete { id }                 → { deleted }
import { itemNotice } from './system-notices.mjs';
import { HttpError, auth, clientIp, db, int, limit, readJson, tx } from './core.mjs';
import { MAX_AHEAD_DAYS } from './catalog.mjs';
// economy.mjs reads the rewards in GET /api/economy and this file gives them with its grantReward: used only inside
// handlers, so the two may import each other.
import { grantReward, pickReward, rewardChoices, rewardItem } from './economy.mjs';
import { SYSTEM_NAMES, docsNow } from './levels.mjs';
import { panelDetail } from './panel.mjs';
import { levelsOf } from './profiles.mjs';

/** The systems a reward can follow: the ones every person climbs (Rütbe is bought, Abonelik paid). */
export const REWARD_SYSTEMS = Object.freeze(['vip', 'wealth', 'charm']);
const RULES_MAX = 300;
const CACHE_MS = 15_000;

let cache = { at: 0, rules: [] };
/** The rules in force, read again at most every CACHE_MS (and at once after a panel change). */
async function rules(q = db) {
  if (Date.now() - cache.at < CACHE_MS) return cache.rules;
  const r = await q.query('SELECT id, system, level, sku, days FROM level_rewards WHERE deleted_at IS NULL ORDER BY system, level, id');
  cache = { at: Date.now(), rules: r.rows.map((x) => ({ id: Number(x.id), system: x.system, level: x.level, sku: x.sku, days: x.days })) };
  return cache.rules;
}
const forget = () => (cache = { at: 0, rules: [] });

/**
 * Gives `uid` every reward of a level they have now and haven't been given (`vip`: their VIP level, which the
 * economy read has worked out; Cömertlik and Yankı are read here only when a rule needs them). The number given.
 */
export async function claimLevelRewards(uid, vip) {
  const all = await rules();
  if (!all.length) return 0;
  const done = new Set((await db.query('SELECT rule_id FROM level_reward_claims WHERE user_id = $1', [uid])).rows.map((x) => Number(x.rule_id)));
  let due = all.filter((r) => !done.has(r.id));
  if (!due.length) return 0;
  const levels = { vip };
  if (due.some((r) => r.system !== 'vip')) Object.assign(levels, (await levelsOf([uid], { fresh: true }))[uid]);
  due = due.filter((r) => (levels[r.system] ?? 0) >= r.level);
  if (!due.length) return 0;
  const told = [];
  const given = await tx(async (c) => {
    let given = 0;
    for (const r of due) {
      // Taken by a read running at the same time: that one gives it.
      const mine = await c.query('INSERT INTO level_reward_claims (rule_id, user_id, given) VALUES ($1, $2, false) ON CONFLICT DO NOTHING RETURNING 1', [r.id, uid]);
      if (!mine.rowCount) continue;
      const ok = await grantReward(c, uid, r.sku, { days: r.days ?? undefined, source: 'level', ref: `level:${r.id}`, origin: `${SYSTEM_NAMES[r.system]} ${r.level}` });
      if (ok) {
        await c.query('UPDATE level_reward_claims SET given = true WHERE rule_id = $1 AND user_id = $2', [r.id, uid]);
        given++;
        told.push(r);
      }
    }
    return given;
  });
  // SimilarClub Sistem, once the items are committed (ref level:<rule>, once each).
  for (const r of told) {
    const item = rewardItem(r.sku);
    const origin = `${SYSTEM_NAMES[r.system]} ${r.level}`;
    if (item) await itemNotice({ target: uid, ref: `level:${r.id}`, item, days: r.days ?? item.days ?? null, origin, why: `${origin} seviyesine ulaştığın için ${item.name} kazandın!` });
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
/** The top level of each system as Seviye ayarları have it now. */
const topOf = (system) => docsNow()[system].levels.at(-1).level;
const ruleView = (r, names) => ({
  id: Number(r.id),
  system: r.system,
  systemName: SYSTEM_NAMES[r.system],
  level: r.level,
  sku: r.sku,
  name: names.get(r.sku)?.name ?? r.sku,
  kind: names.get(r.sku)?.kind ?? null,
  days: r.days ?? null,
  given: Number(r.given ?? 0),
  createdAt: r.created_at,
});

export const levelRewardRoutes = {
  async 'GET /api/admin/level-rewards'(req) {
    await admin(req);
    const items = rewardChoices();
    const names = new Map(items.map((x) => [x.sku, x]));
    const r = await db.query(
      `SELECT l.*, (SELECT count(*) FROM level_reward_claims c WHERE c.rule_id = l.id AND c.given) AS given
         FROM level_rewards l WHERE l.deleted_at IS NULL ORDER BY l.system, l.level, l.id`,
    );
    return {
      rules: r.rows.map((x) => ruleView(x, names)),
      items,
      systems: Object.fromEntries(REWARD_SYSTEMS.map((s) => [s, { name: SYSTEM_NAMES[s], top: topOf(s) }])),
      limits: { daysMax: MAX_AHEAD_DAYS, rulesMax: RULES_MAX },
    };
  },

  async 'POST /api/admin/level-rewards'(req) {
    const a = await admin(req);
    limit(`level-rewards:${a.id}`, 60, 'Çok fazla değişiklik, biraz bekle');
    const b = await readJson(req);
    if (!REWARD_SYSTEMS.includes(b.system)) throw new HttpError(400, 'Seviye sistemi VIP, Cömertlik ya da Yankı olmalı');
    const top = topOf(b.system);
    const level = int(b.level, 1, top);
    if (level === null) throw new HttpError(400, `${SYSTEM_NAMES[b.system]} seviyesi 1–${top} olmalı`);
    const { item, days } = pickReward(b.sku, b.days);
    const rule = await tx(async (c) => {
      const n = (await c.query('SELECT count(*)::int AS n FROM level_rewards WHERE deleted_at IS NULL')).rows[0].n;
      if (n >= RULES_MAX) throw new HttpError(400, `En fazla ${RULES_MAX} seviye ödülü olabilir`);
      const same = await c.query('SELECT 1 FROM level_rewards WHERE system = $1 AND level = $2 AND sku = $3 AND deleted_at IS NULL', [b.system, level, item.sku]);
      if (same.rowCount) throw new HttpError(409, `${SYSTEM_NAMES[b.system]} ${level} için bu ödül zaten var`);
      const r = (
        await c.query('INSERT INTO level_rewards (system, level, sku, days, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *', [b.system, level, item.sku, days, a.id])
      ).rows[0];
      await audited(c, a, 'level_reward.create', { rule: Number(r.id), system: b.system, level, sku: item.sku, days }, req);
      return r;
    });
    forget();
    return { rule: ruleView(rule, new Map(rewardChoices().map((x) => [x.sku, x]))) };
  },

  async 'POST /api/admin/level-rewards/delete'(req) {
    const a = await admin(req);
    limit(`level-rewards:${a.id}`, 60, 'Çok fazla değişiklik, biraz bekle');
    const b = await readJson(req);
    const id = int(b.id, 1, Number.MAX_SAFE_INTEGER);
    if (id === null) throw new HttpError(400, 'Geçersiz ödül');
    await tx(async (c) => {
      const r = (await c.query('UPDATE level_rewards SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *', [id, a.id])).rows[0];
      if (!r) throw new HttpError(404, 'Ödül bulunamadı');
      await audited(c, a, 'level_reward.delete', { rule: id, system: r.system, level: r.level, sku: r.sku, days: r.days }, req);
    });
    forget();
    return { deleted: true };
  },
};
