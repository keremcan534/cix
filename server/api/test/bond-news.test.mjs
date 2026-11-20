// Bağlar at scale (bond-life.mjs; the review of Güncelleme 7): a gift's level notice doesn't wait behind a night's
// backlog of older ones, one sweep tells the whole backlog (not 200 a sweep, 5 minutes apart), and the nightly drop
// works through more bonds than one batch holds. The sweep here runs at the API's start only (BOND_SWEEP_MS default:
// 5 minutes), so what a test sees is what one sweep did.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({});
const { call, signUp } = h;
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 30_000) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) {
    const v = await fn();
    if (v) return v;
  }
  assert.fail(`beklenen olmadı: ${what}`);
}
const TODAY = "(now() AT TIME ZONE 'Europe/Istanbul')::date";
/** `n` people (in parallel, a few at a time). */
async function people(n, name) {
  const out = [];
  for (let i = 0; i < n; i += 10) out.push(...(await Promise.all(Array.from({ length: Math.min(10, n - i) }, (_, k) => signUp(`${name} ${i + k}`)))));
  return out;
}
/**
 * Active Kanka bonds between pairs of `list`, written as they would stand (not a wallet table: no coins are held by
 * an active bond). `row(i)` gives each one's talk points, level, level said and the days' columns.
 */
async function seedBonds(list, count, row) {
  const pairs = [];
  for (let i = 0; i < list.length && pairs.length < count; i++) for (let j = i + 1; j < list.length && pairs.length < count; j++) pairs.push([list[i].user.id, list[j].user.id]);
  assert.equal(pairs.length, count, 'yeterli ikili');
  const cols = pairs.map(([a, b], i) => ({ a, b, ...row(i) }));
  await h.sql.query(
    `INSERT INTO bonds (a, b, pair_lo, pair_hi, kind, status, held_coins, ref, accepted_at, talk_points, level, level_said, gift_day, decayed_on, told_status)
     SELECT x.a, x.b, LEAST(x.a, x.b), GREATEST(x.a, x.b), 'kanka', 'active', 500, 'tohum-' || x.tag, now(), x.talk, x.level, x.said,
            ${TODAY} + x.gift_day, ${TODAY} + x.decayed, 'active'
       FROM jsonb_to_recordset($1::jsonb) AS x(a uuid, b uuid, tag text, talk int, level int, said int, gift_day int, decayed int)`,
    [JSON.stringify(cols.map((c, i) => ({ a: c.a, b: c.b, tag: `${rnd(4)}-${i}`, talk: c.talk, level: c.level, said: c.said, gift_day: c.giftDay, decayed: c.decayed })))],
  );
}

describe('Bağ bildirimleri ve gece düşüşü, çok bağda', () => {
  test('bir hediyenin seviye haberi, eski haberlerin arkasında beklemeden gelir', async () => {
    const crowd = await people(26, 'Kalabalık');
    // 300 older level changes nobody was told of yet (worked out tonight already, so the drop leaves them).
    await seedBonds(crowd, 300, () => ({ talk: 10, level: 2, said: 1, giftDay: 0, decayed: 0 }));
    const [a, b] = await Promise.all([signUp('Hediye Atan'), signUp('Hediye Alan')]);
    await h.credit(a.user.id, 10_000);
    const [st, r] = await call('POST', '/api/bonds/request', { to: b.user.id, kind: 'kanka', ref: rnd(6) }, a.session);
    assert.equal(st, 200, r.error);
    assert.equal((await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session))[0], 200);
    // 5.000 coins: 50 more points, Lv.3.
    const [gs, gj] = await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'bag-kanka', count: 10, price: 500, ref: rnd(6) }, a.session);
    assert.equal(gs, 200, gj.error);
    const n = await until(async () => (await q("SELECT title FROM team_notices WHERE target = $1 AND category = 'bond' AND ref LIKE 'bond:%:level:%'", [b.user.id]))[0], 'hediyenin seviye haberi', 8000);
    assert.match(n.title, /yükseldi: Lv\.3/);
    // The backlog is the sweep's.
    assert.ok(Number((await q("SELECT count(*) AS n FROM bonds WHERE status = 'active' AND level <> level_said"))[0].n) >= 300);
  });

  test('tek gece 500\'den çok bağın düşüşünü çıkarır; doğan yüzlerce seviye haberini aynı süpürmede bitirir', async () => {
    const crowd = await people(48, 'Gece');
    // 1.100 quiet bonds (no gift for 3 days), not worked out tonight: 450 of them at Lv.2 with 10 points, which the
    // night takes (10 % of them, at least 10), so they drop to Lv.1; the rest have no points to lose.
    await seedBonds(crowd, 1100, (i) => (i < 450 ? { talk: 10, level: 2, said: 2, giftDay: -3, decayed: -1 } : { talk: 0, level: 1, said: 1, giftDay: -3, decayed: -1 }));
    // The sweep runs as the API starts.
    await h.restart();
    await until(async () => Number((await q(`SELECT count(*) AS n FROM bonds WHERE ref LIKE 'tohum-%' AND decayed_on = ${TODAY} AND gift_day = ${TODAY} - 3`))[0].n) >= 1100, 'gecenin hepsi');
    const dropped = await q(`SELECT count(*) FILTER (WHERE points_lost = 10 AND level = 1) AS n FROM bonds WHERE ref LIKE 'tohum-%' AND gift_day = ${TODAY} - 3`);
    assert.equal(Number(dropped[0].n), 450);
    // Every level change of that night and the earlier test's backlog, told in that one sweep.
    await until(async () => Number((await q("SELECT count(*) AS n FROM bonds WHERE status = 'active' AND level <> level_said"))[0].n) === 0, 'bütün seviye haberleri');
    const told = await q("SELECT count(*) AS n FROM team_notices WHERE category = 'bond' AND title LIKE '%düştü%'");
    assert.equal(Number(told[0].n), 900, 'her bağın iki ucuna birer');
  });
});
