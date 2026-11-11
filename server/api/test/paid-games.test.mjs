// Who the coin games are for (wheel.mjs paidGamesOpen, live setting casino_open) against a real Postgres, with the
// server's own default: Oyun Salonu and Rüzgâr Gülü are shown to and played by admin accounts only, until an admin
// opens them to everyone in Canlı ayarlar. The other test files run with them open (harness CASINO_OPEN).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { defaultsOf, isBig, snapshotOf, validate } from '../live-registry.mjs';

// No CASINO_OPEN: the setting's default, as on the server.
const h = startApi({ CASINO_OPEN: null });
const { call } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
/** An account of `role` past Cömertlik Lv.2 (1000 coins spent in the shop) with `coins` left. */
async function account(name, role, coins) {
  const p = await h.account(name, role);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) {
    assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  }
  return p;
}
const round = (s, ref = rnd(8)) => call('POST', '/api/casino/play', { game: 'jackpot', bet: 250, ref }, s);
const spin = (s, ref = rnd(8)) => call('POST', '/api/wheel/spin', { tier: 'kiyi', count: 1, ref }, s);
const SETTINGS = '/api/admin/live-settings';
async function setLive(admin, changes) {
  const [, view] = await call('GET', SETTINGS, null, admin.session);
  const [st, j] = await call('POST', SETTINGS, { changes, reason: 'Jetonlu oyun testi', baseV: view.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}

describe('Jetonlu oyunlar kime açık', () => {
  test('ayarın varsayılanı: yalnız yöneticiler; herkese açmak iki kez onaylanır', () => {
    assert.deepEqual(defaultsOf({}).casino_open, []);
    assert.deepEqual(defaultsOf({ CASINO_OPEN: 'everyone' }).casino_open, ['everyone']);
    assert.deepEqual(defaultsOf({ CASINO_OPEN: 'yes' }).casino_open, []);
    assert.deepEqual(validate('casino_open', ['everyone']), ['everyone']);
    assert.equal(validate('casino_open', []), null);
    assert.throws(() => validate('casino_open', ['staff']));
    assert.equal(isBig('casino_open', [], ['everyone']), true);
    assert.equal(isBig('casino_open', ['everyone'], []), false);
    assert.deepEqual([...snapshotOf([{ key: 'casino_open', value: ['everyone'] }], {}).casinoOpen], ['everyone']);
    assert.deepEqual([...snapshotOf([], {}).casinoOpen], []);
  });

  test('üye göremez ve oynayamaz; jetonu düşmez', async () => {
    const p = await account('Üye', 'user', 5000);
    assert.equal((await me(p.session)).paidGames, false);
    const [, hall] = await call('GET', '/api/casino', null, p.session);
    assert.equal(hall.allowed, false);
    assert.ok(hall.games.length > 0 && hall.games.every((g) => g.active === false), 'bütün oyunlar kapalı görünür');
    assert.equal((await call('GET', '/api/wheel', null, p.session))[1].allowed, false);
    const [st, j] = await round(p.session);
    assert.equal(st, 403);
    assert.match(j.error, /yönetici/);
    const [st2, j2] = await spin(p.session);
    assert.equal(st2, 403);
    assert.match(j2.error, /yönetici/);
    const u = await me(p.session);
    assert.deepEqual([u.coins, u.gameCoins], [5000, 0]);
    // A moderator is not an admin.
    const m = await account('Moderatör', 'moderator', 1000);
    assert.equal((await me(m.session)).paidGames, false);
    assert.equal((await round(m.session))[0], 403);
  });

  test('yönetici görür ve oynar; seviye kuralı ona da geçerli', async () => {
    const a = await account('Yönetici', 'admin', 5000);
    assert.equal((await me(a.session)).paidGames, true);
    const [, hall] = await call('GET', '/api/casino', null, a.session);
    assert.equal(hall.allowed, true);
    assert.ok(hall.games.every((g) => g.active === true));
    assert.equal((await call('GET', '/api/wheel', null, a.session))[1].allowed, true);
    assert.equal((await round(a.session))[0], 200);
    assert.equal((await spin(a.session))[0], 200);
    // An admin below Cömertlik Lv.2 is still stopped by the level.
    const fresh = await h.account('Yeni yönetici', 'admin');
    await topUp(fresh.session, 1000);
    const [st, j] = await round(fresh.session);
    assert.equal(st, 403);
    assert.match(j.error, /Cömertlik/);
  });

  test('herkese açılınca üye oynar; kapatılınca yeniden yalnız yöneticiler', async () => {
    const admin = await h.account('Ayar yöneticisi', 'admin');
    const p = await account('Bekleyen üye', 'user', 5000);
    assert.equal((await round(p.session))[0], 403);
    await setLive(admin, { casino_open: ['everyone'] });
    assert.equal((await me(p.session)).paidGames, true);
    assert.equal((await call('GET', '/api/casino', null, p.session))[1].allowed, true);
    const ref = rnd(8);
    const [st, first] = await round(p.session, ref);
    assert.equal(st, 200);
    assert.equal((await spin(p.session))[0], 200);
    await setLive(admin, { casino_open: null });
    assert.equal((await me(p.session)).paidGames, false);
    assert.equal((await round(p.session))[0], 403);
    assert.equal((await spin(p.session))[0], 403);
    // A round that went through keeps its answer for a retry.
    const [st2, again] = await round(p.session, ref);
    assert.equal(st2, 200);
    assert.equal(again.replay, true);
    assert.equal(again.round.id, first.round.id);
  });
});
