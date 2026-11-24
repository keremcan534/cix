// VIP aylık değerlendirme (vip-month.mjs, owners 24 Nov 2026) against a real Postgres, with a test clock: the first
// VIP month is not judged and carries on; a month with the keep amount keeps the level, one that moved up keeps the
// new level, one without drops one level, a second such month in a row ends VIP; each month starts at the level's
// own points; the protection period puts the evaluation off for coins. The money checks run after the file.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ VIP_MONTH_JOBS: '0', VIP_MONTH_TEST_CLOCK: '1', ALLOW_TEST_TOPUP: '0' });
const { call, signUp } = h;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const TR = 3 * 3_600_000;
/** The 1st 00:00 (Türkiye) `n` months after the one `t` falls in. */
const monthStart = (n, t = Date.now()) => {
  const d = new Date(t + TR);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) - TR);
};
const M1 = monthStart(1);
const M2 = monthStart(2);
const M3 = monthStart(3);
const after = (t, min = 1) => new Date(+t + min * 60_000).toISOString();

let admin;
const run = async (t) => ok(await admin.post('/api/admin/vip/month/run', { at: t }), 'değerlendirme');
async function account(name) {
  const s = await signUp(name);
  return { id: s.user.id, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}
const row = async (u) => (await q('SELECT svip_xp, vip_eval_at, vip_period_level, vip_first, vip_misses FROM users WHERE id = $1', [u.id]))[0];
/** Points loaded at `at` (as a load would write them). */
const load = async (u, n, at = new Date()) => {
  await q('UPDATE users SET svip_xp = svip_xp + $2 WHERE id = $1', [u.id, n]);
  await q("INSERT INTO vip_points (user_id, amount, source, at) VALUES ($1, $2, 'test', $3)", [u.id, n, at]);
};
/** A VIP account already past its first month: level `level` (its points), this month's period. */
const vipNow = async (u, points, level) =>
  q('UPDATE users SET svip_xp = $2, vip_period_start = $3, vip_eval_at = $4, vip_period_level = $5, vip_first = false, vip_misses = 0 WHERE id = $1', [u.id, points, monthStart(0), M1, level]);
const lastNote = async (u) => (await q("SELECT title, body FROM team_notices WHERE target = $1 AND category = 'vip' ORDER BY id DESC LIMIT 1", [u.id]))[0];

describe('VIP aylık değerlendirme', () => {
  let a, b, c, e;
  test('hazırlık: yönetim yüklemesi puanı zamanıyla yazar, VIP olunca ilk ayı başlatır', async () => {
    admin = await account('Merkez');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const bank = await account('Banka');
    ok(await admin.post('/api/admin/jeton/bank', { user: bank.id, enabled: true }), 'banka');
    ok(await admin.post('/api/admin/jeton/wholesale', { bank: bank.id, coins: 200_000, paymentRef: 'U-1', ref: rnd(6) }), 'üretim');
    a = await account('İlk Ay');
    ok(await admin.post('/api/admin/jeton/load', { bank: bank.id, to: a.id, coins: 30_000, valueTl: 6600, ref: rnd(8) }), 'yükleme');
    const r = await row(a);
    assert.deepEqual([Number(r.svip_xp), r.vip_first, r.vip_period_level, +new Date(r.vip_eval_at)], [30_000, true, 0, +M1], 'VIP 1, ilk ay, değerlendirme gelecek ayın 1’i');
    assert.equal((await q("SELECT count(*)::int AS n FROM vip_points WHERE user_id = $1 AND source = 'admin_load'", [a.id]))[0].n, 1);
    [b, c, e] = [await account('Koruyan'), await account('Yükselen'), await account('Erteleyen')];
  });

  test('ay sonu: ilk ay geçer; koruma puanını yükleyen korur; ay içinde yükselen yeni seviyede kalır; ay seviyenin puanından başlar', async () => {
    await vipNow(b, 125_000, 3);
    await load(b, 70_000); // VIP 3 koruma 62.500
    await vipNow(c, 62_500, 2);
    await load(c, 62_500); // → 125.000: VIP 3
    const r1 = await run(after(M1));
    assert.ok(r1.judged >= 3);
    let r = await row(a);
    assert.deepEqual([Number(r.svip_xp), r.vip_first, r.vip_period_level, +new Date(r.vip_eval_at)], [30_000, false, 1, +M2], 'ilk ay: puan ve seviye taşınır');
    assert.match((await lastNote(a)).body, /İlk ay değerlendirilmez/);
    r = await row(b);
    assert.deepEqual([Number(r.svip_xp), r.vip_period_level, r.vip_misses], [125_000, 3, 0], 'VIP 3 korundu, 195.000 → 125.000');
    assert.match((await lastNote(b)).title, /VIP 3 seviyen korundu/);
    r = await row(c);
    assert.deepEqual([Number(r.svip_xp), r.vip_period_level], [125_000, 3], 'VIP 2 → VIP 3');
    const ev = await q('SELECT result, period_points, keep_points FROM vip_evaluations WHERE user_id = $1', [c.id]);
    assert.deepEqual(ev.map((x) => [x.result, Number(x.period_points), Number(x.keep_points)]), [['upgraded', 62_500, 37_500]]);
  });

  test('ikinci ay: ilk ayın puanı sayılır; yüklemeyen bir seviye düşer; bir ay daha tutmazsa VIP sıfırlanır', async () => {
    await run(after(M2));
    let r = await row(a);
    assert.deepEqual([Number(r.svip_xp), r.vip_period_level, r.vip_misses], [25_000, 1, 0], 'ilk ayın 30.000’i VIP 1 korumasını (25.000) tuttu');
    r = await row(b);
    assert.deepEqual([Number(r.svip_xp), r.vip_period_level, r.vip_misses], [62_500, 2, 1], 'VIP 3 → VIP 2');
    assert.match((await lastNote(b)).body, /yüklemezsen VIP statün tamamen sıfırlanır/);
    const m = ok(await b.get('/api/vip/month'));
    assert.deepEqual([m.level, m.keep, m.misses, m.next.level, m.next.need], [2, 37_500, 1, 3, 62_500]);
    // M2–M3: 10.000 (VIP 2 koruma 37.500): not enough, second month in a row.
    await load(b, 10_000, new Date(+M2 + 86_400_000));
    await run(after(M3));
    r = await row(b);
    assert.deepEqual([Number(r.svip_xp), r.vip_period_level, r.vip_eval_at], [0, 0, null], 'VIP 0');
    assert.match((await lastNote(b)).title, /VIP statün sıfırlandı/);
    const drops = await q("SELECT from_level, to_level FROM level_drops WHERE user_id = $1 AND system = 'vip' ORDER BY id", [b.id]);
    assert.deepEqual(drops.map((x) => [x.from_level, x.to_level]), [[3, 2], [2, 0]]);
  });

  test('yükseltme koruma dönemi: kapalıyken teklif yok; açınca son günlerde, korunmuş ama yükselmemişe; fiyat denetimi, bir kez', async () => {
    await vipNow(e, 25_000, 1);
    await load(e, 30_000);
    // Level 1 kept (30.000 ≥ 25.000) and up to 55.000 (VIP 2 is 62.500): not moved up.
    assert.equal(ok(await e.get('/api/vip/month')).extension.offered, false, 'fiyat 0: kapalı');
    const view = ok(await admin.get('/api/admin/live-settings'));
    ok(await admin.post('/api/admin/live-settings', { changes: { vip_extend_price: 5000, vip_extend_days: 7, vip_extend_offer_days: 15 }, reason: 'Test', baseV: view.v, confirm: true }), 'ayar');
    const m = ok(await e.get('/api/vip/month'));
    const soon = +M1 - Date.now() <= 15 * 86_400_000;
    assert.equal(m.extension.offered, soon);
    if (!soon) return;
    await h.credit(e.id, 10_000);
    const [st, j] = await e.post('/api/vip/extend', { price: 4000, ref: `t${rnd(8)}` });
    assert.deepEqual([st, j.code, j.price], [409, 'price_changed', 5000]);
    const x = ok(await e.post('/api/vip/extend', { price: 5000, ref: `t${rnd(8)}` }), 'erteleme');
    assert.equal(+new Date(x.month.evalAt), +M1 + 7 * 86_400_000);
    assert.equal(x.month.extension.bought, true);
    assert.equal(Number((await q('SELECT coins FROM users WHERE id = $1', [e.id]))[0].coins), 5000);
    const [st2, j2] = await e.post('/api/vip/extend', { price: 5000, ref: `t${rnd(8)}` });
    assert.deepEqual([st2, j2.code], [409, 'vip_extend_unavailable']);
    await run(after(M1));
    assert.equal((await row(e)).vip_period_level, 1, 'ertelendi: 1’inde değerlendirilmez');
    assert.equal((await q('SELECT count(*)::int AS n FROM vip_evaluations WHERE user_id = $1', [e.id]))[0].n, 0);
    await run(after(new Date(+M1 + 7 * 86_400_000)));
    assert.equal((await q('SELECT result FROM vip_evaluations WHERE user_id = $1', [e.id]))[0].result, 'kept');
  });
});
