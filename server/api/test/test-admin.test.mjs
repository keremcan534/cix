// The test server (ALLOW_TEST_TOPUP=1) puts admin accounts at the top of everything (test-admin.mjs, index.mjs
// fillTestAdmin): millions of coins, SVIP 10, the top rank and room level, the last Cömertlik and Yankı levels. An
// ordinary account gets none of it.
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SVIP_XP, svipLevel } from '../catalog.mjs';
import { CHARM_XP, WEALTH_XP } from '../profile-rules.mjs';
import { startApi } from './harness.mjs';

// rooms.mjs needs the voice server's keys at import, so its last room-level step is read from the source.
const ROOM_TOP = Number(/ROOM_XP_THRESHOLDS = \[[^\]]*?([\d_]+)\]/.exec(fs.readFileSync(path.join(import.meta.dirname, '..', 'rooms.mjs'), 'utf8'))[1].replaceAll('_', ''));

const h = startApi({ TEST_ADMIN_MAX: undefined, LEVELS_CACHE_MS: '0' });
const { call } = h;
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const me = async (who) => (await ok(call('GET', '/api/me', null, who.session))).user;
const fills = async (who) => q("SELECT amount FROM ledger WHERE user_id = $1 AND currency = 'coin' AND ref LIKE 'test-admin-%' ORDER BY id", [who.user.id]);
const ranks = async (who) => q("SELECT sku, price, source FROM entitlements WHERE user_id = $1 AND kind = 'noble'", [who.user.id]);

describe('test sunucusu: yönetici her şeyin en üstünde', () => {
  let admin, member;
  test('yönetici: milyonlarca jeton, SVIP 10, en yüksek rütbe ve oda seviyesi, son Cömertlik ve Yankı seviyesi', async () => {
    [admin, member] = await Promise.all([h.account('Yönetici', 'admin'), h.account('Üye')]);
    // Two /me calls at once fill once.
    const [a, b] = await Promise.all([me(admin), me(admin)]);
    for (const u of [a, b]) assert.equal(u.coins, 10_000_000);
    assert.equal((await fills(admin)).length, 1);
    assert.equal(a.wealthXp, WEALTH_XP.at(-1));
    assert.equal(a.charmXp, CHARM_XP.at(-1));
    assert.equal(svipLevel(a.svipXp), SVIP_XP.length);
    const [row] = await q('SELECT room_xp FROM users WHERE id = $1', [admin.user.id]);
    assert.equal(Number(row.room_xp), ROOM_TOP);
    assert.deepEqual(await ranks(admin), [{ sku: 'noble-5', price: '0', source: 'admin' }]);
    const eco = await ok(call('GET', '/api/economy', null, admin.session));
    assert.equal(eco.noble.tier, 5);
    assert.equal(eco.vipLevel, 15);
    const seen = (await ok(call('GET', `/api/user?id=${admin.user.id}`, null, member.session))).user;
    assert.deepEqual(seen.levels, { wealth: WEALTH_XP.length - 1, charm: CHARM_XP.length - 1 });
    const health = await ok(call('GET', '/api/health'));
    assert.ok(!health.warnings.includes('test_topups_high'), 'yöneticinin dolumu alarm değil');
  });

  test('5 milyonun altına inince 10 milyona tamamlanır; doluyken bir şey yazılmaz', async () => {
    assert.equal((await me(admin)).coins, 10_000_000);
    assert.equal((await fills(admin)).length, 1);
    assert.equal((await ranks(admin)).length, 1);
    await q('UPDATE users SET coins = 1000 WHERE id = $1', [admin.user.id]);
    assert.equal((await me(admin)).coins, 10_000_000);
    assert.deepEqual((await fills(admin)).map((x) => Number(x.amount)), [10_000_000, 9_999_000]);
    assert.equal((await ranks(admin)).length, 1);
  });

  test('sıradan hesap: hiçbir şey almaz', async () => {
    const u = await me(member);
    assert.equal(u.coins, 0);
    assert.equal(u.svipXp, 0);
    assert.equal(u.wealthXp, 0);
    assert.equal(u.charmXp, 0);
    assert.equal((await fills(member)).length, 0);
    assert.equal((await ranks(member)).length, 0);
    const eco = await ok(call('GET', '/api/economy', null, member.session));
    assert.equal(eco.noble, null);
    assert.equal(eco.vipLevel, 0);
    const seen = (await ok(call('GET', `/api/user?id=${member.user.id}`, null, admin.session))).user;
    assert.deepEqual(seen.levels, { wealth: 0, charm: 0 });
  });
});
