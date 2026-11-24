// VIP aylık değerlendirme (owners, 24 Nov 2026). A VIP account's period is the calendar month (Türkiye); on the 1st
// at 00:00 the month that ended is judged:
// - It reached a higher level in the month: that level is kept.
// - It loaded at least its level's keep amount (the level's own step: the level's points minus the one below's;
//   VIP 1 25.000 … VIP 10 9.500.000): the level is kept.
// - Otherwise (no loading, or not enough): one level down. A second such month in a row: VIP is gone, back to 0.
// - The first VIP month is not judged: its points and level carry on and are judged with the next month's.
// Each new month starts at the level's own points (users.svip_xp = the level's threshold): the month's points
// count from there, so reaching the next level takes the next level's step in one month.
// Yükseltme koruma dönemi: an account that kept its level but did not move up may, in the last days of the month, put
// the evaluation off by a number of days for coins (Canlı ayarlar › VIP; price 0: not offered).
// VIP points: every coin loaded (a store purchase, a Jeton Noktası sale, a management load) is one point; a store
// refund and a management load taken back take theirs back (addVipPoints, written with the time in vip_points).
import { HttpError, auth, claimRef, db, env, int, once, readJson, tx } from './core.mjs';
import { docsNow, svipLevel } from './levels.mjs';
import { live } from './live-settings.mjs';
import { systemNotice } from './system-notices.mjs';
import { TEST_ADMIN } from './test-admin.mjs';
import { spendCoins } from './wallet.mjs';

const fmt = (n) => Number(n).toLocaleString('tr-TR');
const TR = 3 * 3_600_000;

/** The 1st 00:00 (Türkiye) of the month after the one `t` falls in. */
export function nextMonthStart(t) {
  const d = new Date(new Date(t).getTime() + TR);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - TR);
}
/** "Aralık 2026" for the month `t` falls in (Türkiye). */
const monthName = (t) => new Date(new Date(t).getTime() + TR).toLocaleDateString('tr-TR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const dayText = (t) => new Date(new Date(t).getTime() + TR).toLocaleDateString('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long' });

/** The points a level needs (0 for VIP 0), and its keep amount: its own step. */
export const pointsAt = (level, docs = docsNow()) => (level <= 0 ? 0 : Number(docs.vip.levels.find((l) => l.level === level)?.points ?? docs.vip.levels.at(-1).points));
export const keepOf = (level, docs = docsNow()) => (level <= 0 ? 0 : pointsAt(level, docs) - pointsAt(level - 1, docs));
const topLevel = (docs = docsNow()) => docs.vip.levels.length;

/**
 * Adds (or, negative, takes) VIP points in the caller's transaction, with the time; never below 0. Someone who
 * reaches VIP 1 without a period starts one: this month is their first (not judged).
 */
export async function addVipPoints(c, userId, amount, source, ref = null) {
  if (!amount) return;
  const u = (await c.query('UPDATE users SET svip_xp = greatest(0, svip_xp + $2) WHERE id = $1 RETURNING svip_xp, vip_eval_at', [userId, amount])).rows[0];
  if (!u) return;
  await c.query('INSERT INTO vip_points (user_id, amount, source, ref) VALUES ($1, $2, $3, $4)', [userId, amount, source, ref]);
  if (!u.vip_eval_at && svipLevel(u.svip_xp) >= 1) {
    await c.query('UPDATE users SET vip_period_start = now(), vip_eval_at = $2, vip_period_level = 0, vip_first = true, vip_misses = 0 WHERE id = $1', [userId, nextMonthStart(Date.now())]);
  }
}

/** The points of `userId` in [from, to) (to null: up to now). */
const pointsIn = async (c, userId, from, to = null) =>
  Number((await c.query('SELECT coalesce(sum(amount), 0) AS n FROM vip_points WHERE user_id = $1 AND at >= $2 AND ($3::timestamptz IS NULL OR at < $3)', [userId, from, to])).rows[0].n);

/**
 * Judges one account whose evaluation time came, its row locked: the decision, the new level's points (plus what
 * came in after the evaluation time), the next period. Returns the decision for the notice, or null.
 */
async function judge(c, id, now) {
  const u = (await c.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
  if (!u?.vip_eval_at || new Date(u.vip_eval_at) > now) return null;
  const docs = docsNow();
  const evalAt = new Date(u.vip_eval_at);
  const start = u.vip_period_start ? new Date(u.vip_period_start) : evalAt;
  const after = await pointsIn(c, id, evalAt);
  const month = await pointsIn(c, id, start, evalAt);
  const xpAtEval = Math.max(0, Number(u.svip_xp) - after);
  const reached = svipLevel(xpAtEval, docs);
  const from = u.vip_period_level;
  const keep = keepOf(from, docs);
  let result;
  let level;
  let misses = u.vip_misses;
  if (u.vip_first) {
    // The first VIP month: carried on, judged with the next one (its points count then).
    result = 'first';
    level = reached;
  } else if (reached > from) {
    result = 'upgraded';
    level = reached;
    misses = 0;
  } else if (from >= 1 && month >= keep) {
    result = 'kept';
    level = from;
    misses = 0;
  } else {
    misses += 1;
    result = misses >= 2 ? 'lost' : 'dropped';
    level = result === 'lost' ? 0 : Math.max(0, from - 1);
    if (level === 0) misses = 0;
  }
  const carry = result === 'first';
  const xp = carry ? Number(u.svip_xp) : pointsAt(level, docs) + after;
  const stays = level >= 1;
  await c.query(
    `UPDATE users SET svip_xp = $2, vip_period_start = $3, vip_eval_at = $4, vip_period_level = $5, vip_first = false, vip_misses = $6 WHERE id = $1`,
    [id, xp, carry ? start : evalAt, stays ? nextMonthStart(evalAt) : null, carry ? reached : level, misses],
  );
  await c.query(
    `INSERT INTO vip_evaluations (user_id, period_start, eval_at, level_start, level_end, period_points, keep_points, result, level_after, misses)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (user_id, eval_at) DO NOTHING`,
    [id, start, evalAt, from, reached, month, keep, result, level, misses],
  );
  if (level < reached) {
    await c.query('INSERT INTO level_drops (user_id, system, from_level, to_level, points_before, points_after, idle_days) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      id,
      'vip',
      reached,
      level,
      xpAtEval,
      pointsAt(level, docs),
      Math.max(0, Math.round((evalAt - start) / 86_400_000)),
    ]);
  }
  // Out of VIP but loaded since the evaluation time enough for VIP 1 again: a new first month from then.
  if (!stays && svipLevel(after, docs) >= 1) {
    await c.query('UPDATE users SET vip_period_start = $2, vip_eval_at = $3, vip_period_level = 0, vip_first = true, vip_misses = 0 WHERE id = $1', [id, evalAt, nextMonthStart(evalAt)]);
  }
  return { result, from, reached, level, month, keep, evalAt, next: stays ? nextMonthStart(evalAt) : null, top: topLevel(docs) };
}

const NOTE = {
  first: (x) => ({ title: 'VIP ilk ayın tamamlandı', body: `VIP ${x.level} olarak ilk ayını tamamladın. İlk ay değerlendirilmez: iki ayın puanı birlikte ${dayText(x.next)} günü değerlendirilir. VIP ${x.level} koruma puanı ${fmt(keepOf(x.level))}.` }),
  upgraded: (x) => ({ title: `VIP ${x.level} seviyen korundu`, body: `${monthName(x.evalAt - 1)} ayında VIP ${x.from} seviyesinden VIP ${x.level} seviyesine yükseldin; yeni seviyen korundu. Bu ay VIP ${x.level} seviyesini korumak için ${fmt(keepOf(x.level))} puan gerekir.` }),
  kept: (x) => ({ title: `VIP ${x.level} seviyen korundu`, body: `${monthName(x.evalAt - 1)} ayında ${fmt(x.month)} puan yükledin (koruma ${fmt(x.keep)}). Bu ay da koruma puanı ${fmt(x.keep)}.` }),
  dropped: (x) => ({
    title: `VIP seviyen VIP ${x.level} oldu`,
    body: `${monthName(x.evalAt - 1)} ayında VIP ${x.from} koruma puanı ${fmt(x.keep)} idi; ${fmt(x.month)} puan yükledin. Seviyen bir düştü. Bu ay VIP ${x.level} koruma puanını (${fmt(keepOf(x.level))}) yüklemezsen VIP statün tamamen sıfırlanır.`,
  }),
  lost: (x) => ({ title: 'VIP statün sıfırlandı', body: `İki ay üst üste koruma puanı yüklenmedi; VIP statün sıfırlandı. Yeniden jeton yükledikçe VIP 1'den başlarsın.` }),
};

let running = null;
/** Judges every account whose evaluation time came (in batches). Safe to call often; one run at a time here. */
export function runVipMonth(now = new Date()) {
  running ??= (async () => {
    try {
      const at = new Date(now);
      const out = { judged: 0 };
      for (;;) {
        const ids = (
          await db.query(`SELECT id FROM users WHERE vip_eval_at <= $1 AND deleted_at IS NULL ${TEST_ADMIN ? "AND role <> 'admin'" : ''} ORDER BY vip_eval_at LIMIT 200`, [at])
        ).rows.map((x) => x.id);
        if (!ids.length) break;
        for (const id of ids) {
          const d = await tx((c) => judge(c, id, at)).catch((e) => (console.error('vip month', id, String(e?.message ?? e).slice(0, 200)), null));
          if (!d) continue;
          out.judged++;
          out[d.result] = (out[d.result] ?? 0) + 1;
          if (d.result !== 'first' || d.level >= 1)
            await systemNotice({ target: id, category: 'vip', ref: `vipay:${d.evalAt.toISOString()}`, ...NOTE[d.result](d), data: { result: d.result, from: d.from, level: d.level, points: d.month, keep: d.keep }, link: '/vip' });
        }
        if (ids.length < 200) break;
      }
      return out;
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer = null;
export function startVipMonth() {
  if (timer || env.VIP_MONTH_JOBS === '0') return;
  const run = () => void runVipMonth().catch((e) => console.error('vip month failed', String(e?.message ?? e).slice(0, 200)));
  timer = setInterval(run, 5 * 60_000);
  timer.unref();
  setTimeout(run, 30_000).unref();
}
export function stopVipMonth() {
  clearInterval(timer);
  timer = null;
}

// --- The month as the app shows it, and the protection period --------------------------------------------------
/** The protection period's terms in effect: { price, days, offerDays } (price 0: off). */
const extendRules = (s = live()) => ({ price: s.vipExtendPrice ?? 0, days: s.vipExtendDays ?? 7, offerDays: s.vipExtendOfferDays ?? 3 });

/** Where account row `u` stands this month, read in `c`. */
export async function monthOf(c, u, now = new Date()) {
  const docs = docsNow();
  const level = svipLevel(u.svip_xp, docs);
  if (!u.vip_eval_at) return { active: false, level, points: Number(u.svip_xp), next: level < topLevel(docs) ? { level: level + 1, need: Math.max(0, pointsAt(level + 1, docs) - Number(u.svip_xp)) } : null };
  const start = u.vip_period_start ? new Date(u.vip_period_start) : now;
  const month = await pointsIn(c, u.id, start);
  const from = u.vip_period_level;
  const keep = u.vip_first ? 0 : keepOf(from, docs);
  const r = extendRules();
  const evalAt = new Date(u.vip_eval_at);
  const extended = u.vip_extended_for && u.vip_period_start && new Date(u.vip_extended_for).getTime() === start.getTime();
  // Offered: on, in the last days, kept the level this period but not moved up, not bought already, not the first month.
  const offered = r.price > 0 && !u.vip_first && !extended && from >= 1 && month >= keep && level === from && +now >= +evalAt - r.offerDays * 86_400_000 && now < evalAt;
  return {
    active: true,
    level,
    periodLevel: from,
    first: u.vip_first,
    periodStart: start.toISOString(),
    evalAt: evalAt.toISOString(),
    points: month,
    keep,
    kept: u.vip_first || month >= keep || level > from,
    misses: u.vip_misses,
    next: level < topLevel(docs) ? { level: level + 1, need: Math.max(0, pointsAt(level + 1, docs) - Number(u.svip_xp)) } : null,
    extension: { offered, price: r.price, days: r.days, bought: !!extended },
  };
}

export const vipMonthRoutes = {
  /** Staff: judges the accounts due now (the job does it every 5 minutes). `at` only with VIP_MONTH_TEST_CLOCK=1. */
  async 'POST /api/admin/vip/month/run'(req) {
    const u = await auth(req);
    if (u.role !== 'admin') throw new HttpError(403, 'Yönetici hesabı gerekli');
    const b = await readJson(req);
    const at = env.VIP_MONTH_TEST_CLOCK === '1' && typeof b.at === 'string' && !Number.isNaN(Date.parse(b.at)) ? new Date(b.at) : new Date();
    return { ok: true, ...(await runVipMonth(at)) };
  },

  /** My VIP month (the VIP page). */
  async 'GET /api/vip/month'(req) {
    const u = await auth(req);
    const row = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
    return monthOf(db, row);
  },

  /**
   * Yükseltme koruma dönemi: puts this period's evaluation off by the set days, for the set coins. `price`: what the
   * app showed (a moved price is a 409 price_changed, nothing moves). Once per period; only while it is offered.
   */
  async 'POST /api/vip/extend'(req) {
    const u = await auth(req);
    const b = await readJson(req);
    const shown = int(b.price, 1, 1e12);
    if (!shown) throw new HttpError(400, 'Geçersiz fiyat');
    const out = await once(u.id, 'coin', b.ref, async (c) => {
      const row = (await c.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [u.id])).rows[0];
      await claimRef(c, u.id, 'coin', b.ref);
      const m = await monthOf(c, row);
      const r = extendRules();
      if (!m.active || !m.extension.offered) throw Object.assign(new HttpError(409, 'Yükseltme koruma dönemi şu an alınamaz'), { extra: { code: 'vip_extend_unavailable' } });
      if (shown !== r.price) throw Object.assign(new HttpError(409, 'Fiyat değişti'), { extra: { code: 'price_changed', price: r.price, days: r.days } });
      await spendCoins(c, u.id, r.price, 'VIP yükseltme koruma dönemi', b.ref, null, { detail: { vipExtend: { days: r.days, evalBefore: m.evalAt } } });
      const before = new Date(row.vip_eval_at);
      const until = new Date(+before + r.days * 86_400_000);
      await c.query('UPDATE users SET vip_eval_at = $2, vip_extended_for = vip_period_start WHERE id = $1', [u.id, until]);
      await c.query('INSERT INTO vip_extensions (user_id, period_start, eval_before, eval_after, days, price, ref) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        u.id,
        row.vip_period_start,
        before,
        until,
        r.days,
        r.price,
        b.ref,
      ]);
    });
    const row = (await db.query('SELECT * FROM users WHERE id = $1', [u.id])).rows[0];
    return { ...out, month: await monthOf(db, row) };
  },
};
