// Oyun anahtarları (game-switch.mjs; Canlı ayarlar › Oyun Salonu › Kapalı oyunlar and Yalnız yöneticilere açık
// oyunlar) against a real Postgres: every game the server plays reads as off and refuses a new round when it is
// switched off (admins included) or kept for admins (everyone else), with nothing moved; a round that went through
// keeps its replay; Acil durum › Hediye and Oyunlar stop Şanslı hediyeler too; a dealt hand of a room game can be
// played out; GET /api/config sends both lists; /api/me paidGames goes false once every coin game is shut.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';
import { GAMES as CASINO_GAMES } from '../casino-rules.mjs';
import { SWITCH_GAMES, isBig, validate } from '../live-registry.mjs';
import { TABLE_GAMES } from '../room-games-rules.mjs';

const h = startApi();
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) assert.equal((await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s))[0], 200);
  }
};
/** An adult past Cömertlik Lv.2 (1000 coins spent in the shop) with `coins` left; `role` 'admin' for an admin. */
async function player(name, coins, role = 'user') {
  const p = await signUp(name);
  await h.sql.query("UPDATE users SET birth_date = '1990-01-01', role = $2 WHERE id = $1", [p.user.id, role]);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) {
    assert.equal((await call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session))[0], 200);
  }
  return p;
}
const SETTINGS = '/api/admin/live-settings';
let boss;
async function setLive(changes) {
  boss ??= await h.account('Ayar yöneticisi', 'admin');
  const [, view] = await call('GET', SETTINGS, null, boss.session);
  const [st, j] = await call('POST', SETTINGS, { changes, reason: 'Oyun anahtarı testi', baseV: view.v, confirm: true }, boss.session);
  assert.equal(st, 200, j.error);
}
const reset = () => setLive({ casino_off: null, games_staff: null, features_off: null });

const round = (s, ref = rnd(8)) => call('POST', '/api/casino/play', { game: 'jackpot', bet: 250, ref }, s);
const spin = (s, ref = rnd(8)) => call('POST', '/api/wheel/spin', { tier: 'kiyi', count: 1, ref }, s);
const fuel = (s) => call('POST', '/api/casino/rocket/bet', { round: 1, bet: 250, ref: rnd(8) }, s);
const lucky = (s, to, ref = rnd(8)) => call('POST', '/api/lucky/send', { giftId: 'lk1', to: [to], count: 1, ref }, s);
const hall = async (s) => new Map((await call('GET', '/api/casino', null, s))[1].games.map((g) => [g.id, g.active]));
const config = async () => (await call('GET', '/api/config'))[1];
const purse = async (s) => {
  const u = await me(s);
  return u.coins + u.gameCoins;
};
const refused = async (p, status, re) => {
  const [st, j] = await p;
  assert.equal(st, status, j.error);
  if (re) assert.match(j.error, re);
  return j;
};

describe('Oyun anahtarlarının kuralları', () => {
  test('listede sunucunun oynattığı her oyun bir kez: Oyun Salonu, Rüzgâr Gülü, Şanslı hediyeler, oda masaları', () => {
    const ids = SWITCH_GAMES.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, [...CASINO_GAMES.map((g) => g.id), 'wheel', 'lucky', ...Object.keys(TABLE_GAMES)]);
    assert.deepEqual(
      SWITCH_GAMES.filter((g) => !g.chance).map((g) => g.label),
      ['Ludo (ücretsiz oda oyunu)', 'Renk Kartları (ücretsiz oda oyunu)', 'XOX (ücretsiz oda oyunu)', 'Dört Taş (ücretsiz oda oyunu)'],
    );
    assert.deepEqual(validate('casino_off', ['ludo', 'lucky', 'fish']), ['fish', 'lucky', 'ludo'], 'seçeneklerin sırasıyla');
    assert.deepEqual(validate('games_staff', ['wheel', 'xox']), ['wheel', 'xox']);
    assert.equal(validate('games_staff', []), null);
    assert.throws(() => validate('games_staff', ['okey']), /bilinmeyen/);
    // A game of chance leaving the admins' list opens to everyone: asked twice. A room game, or adding one, isn't.
    assert.equal(isBig('games_staff', ['lucky', 'ludo'], ['ludo']), true);
    assert.equal(isBig('games_staff', ['lucky', 'ludo'], null), true);
    assert.equal(isBig('games_staff', ['lucky', 'ludo'], ['lucky']), false);
    assert.equal(isBig('games_staff', [], ['lucky']), false);
  });
});

describe('Oyun anahtarları sunucuda', () => {
  let a;
  let b;
  let admin;
  test('varsayılan: hepsi açık; /api/config iki listeyi boş gönderir', async () => {
    a = await player('Ayşe', 30_000);
    b = await player('Bora', 1_000);
    admin = await player('Yönetici', 30_000, 'admin');
    const c = await config();
    assert.deepEqual([c.gamesOff, c.gamesStaff], [[], []]);
    assert.ok([...(await hall(a.session)).values()].every(Boolean));
    assert.equal((await call('GET', '/api/wheel', null, a.session))[1].active, true);
    const [, l] = await call('GET', '/api/lucky', null, a.session);
    assert.equal(l.active, true);
    assert.ok(l.gifts.length > 0);
  });

  test('Kapalı oyunlar: herkese (yöneticiye de) kapalı, jeton düşmez, geçen tur tekrarında cevabını alır', async () => {
    const roundRef = rnd(8);
    const spinRef = rnd(8);
    const sendRef = rnd(8);
    assert.equal((await round(a.session, roundRef))[0], 200);
    assert.equal((await spin(a.session, spinRef))[0], 200);
    assert.equal((await lucky(a.session, b.user.id, sendRef))[0], 200);

    await setLive({ casino_off: ['jackpot', 'wheel', 'lucky', 'rocket'] });
    const c = await config();
    assert.deepEqual([c.gamesOff, c.gamesStaff], [['jackpot', 'rocket', 'wheel', 'lucky'], []]);
    const before = await purse(a.session);
    for (const s of [a.session, admin.session]) {
      const games = await hall(s);
      assert.deepEqual([games.get('jackpot'), games.get('rocket'), games.get('fish')], [false, false, true]);
      await refused(round(s), 409, /Hazine Kulesi şu an kapalı/);
      assert.equal((await call('GET', '/api/wheel', null, s))[1].active, false);
      await refused(spin(s), 409, /Rüzgâr Gülü şu an kapalı/);
      await refused(fuel(s), 409, /Yörünge şu an kapalı/);
      assert.equal((await call('GET', '/api/casino/rocket', null, s))[1].game.active, false);
      const [, l] = await call('GET', '/api/lucky', null, s);
      assert.deepEqual([l.active, l.gifts], [false, []]);
      const j = await refused(lucky(s, b.user.id), 409, /Şanslı hediyeler şu an kapalı/);
      assert.equal(j.code, 'lucky_closed');
    }
    assert.equal(await purse(a.session), before, 'reddedilen turda jeton düşmez');
    // What went through before the switch is answered again, not refused.
    assert.equal((await round(a.session, roundRef))[1].replay, true);
    assert.equal((await spin(a.session, spinRef))[1].replay, true);
    assert.equal((await lucky(a.session, b.user.id, sendRef))[1].replay, true);
    // Another game of Oyun Salonu still plays, and the coin games are still shown.
    assert.equal((await call('POST', '/api/casino/play', { game: 'fish', bet: 250, pick: 'clown', ref: rnd(8) }, a.session))[0], 200);
    assert.equal((await me(a.session)).paidGames, true);
    await reset();
    assert.equal((await round(a.session))[0], 200, 'açılınca yeniden oynanır');
    assert.equal((await lucky(a.session, b.user.id))[0], 200);
  });

  test('Yalnız yöneticilere açık: üyeye kapalı görünür ve reddedilir, yönetici oynar', async () => {
    await setLive({ games_staff: ['jackpot', 'rocket', 'wheel', 'lucky'] });
    assert.deepEqual((await config()).gamesStaff, ['jackpot', 'rocket', 'wheel', 'lucky']);
    const before = await purse(a.session);
    const games = await hall(a.session);
    assert.deepEqual([games.get('jackpot'), games.get('rocket'), games.get('fish')], [false, false, true]);
    await refused(round(a.session), 409, /Hazine Kulesi şu an kapalı/);
    assert.equal((await call('GET', '/api/wheel', null, a.session))[1].active, false);
    await refused(spin(a.session), 409, /Rüzgâr Gülü şu an kapalı/);
    await refused(fuel(a.session), 409, /Yörünge şu an kapalı/);
    assert.deepEqual((await call('GET', '/api/lucky', null, a.session))[1].gifts, []);
    await refused(lucky(a.session, b.user.id), 409, /Şanslı hediyeler şu an kapalı/);
    assert.equal(await purse(a.session), before);
    assert.equal((await me(a.session)).paidGames, true, 'Oyun Salonu’nun diğer oyunları açık');

    const mine = await hall(admin.session);
    assert.deepEqual([mine.get('jackpot'), mine.get('rocket')], [true, true]);
    assert.equal((await round(admin.session))[0], 200);
    assert.equal((await call('GET', '/api/wheel', null, admin.session))[1].active, true);
    assert.equal((await spin(admin.session))[0], 200);
    assert.ok((await call('GET', '/api/lucky', null, admin.session))[1].gifts.length > 0);
    assert.equal((await lucky(admin.session, b.user.id))[0], 200);
    await reset();
  });

  test('bütün jetonlu oyunlar kapalıysa /api/me paidGames false (eski APK’lar Oyun Salonu’nu ve çarkı gizler)', async () => {
    await setLive({ casino_off: [...CASINO_GAMES.map((g) => g.id), 'wheel'] });
    assert.equal((await me(a.session)).paidGames, false);
    assert.equal((await me(admin.session)).paidGames, false, 'kapalı oyun yöneticiye de kapalı');
    await setLive({ casino_off: CASINO_GAMES.map((g) => g.id) });
    assert.equal((await me(a.session)).paidGames, true, 'Rüzgâr Gülü açıksa görünür');
    await setLive({ casino_off: CASINO_GAMES.map((g) => g.id), games_staff: ['wheel'] });
    assert.equal((await me(a.session)).paidGames, false);
    assert.equal((await me(admin.session)).paidGames, true);
    await reset();
  });

  test('Acil durum: Hediye ve Oyunlar Şanslı hediyeyi de durdurur; Oyunlar Yörünge’yi de', async () => {
    await setLive({ features_off: ['gifts'] });
    await refused(lucky(a.session, b.user.id), 503, /geçici olarak kapalı/);
    await setLive({ features_off: ['games'] });
    await refused(lucky(a.session, b.user.id), 503, /geçici olarak kapalı/);
    await refused(fuel(a.session), 503, /geçici olarak kapalı/);
    assert.equal((await call('GET', '/api/lucky', null, a.session))[1].active, false);
    assert.equal((await call('GET', '/api/wheel', null, a.session))[1].active, false);
    assert.equal((await me(a.session)).paidGames, false);
    await reset();
    assert.equal((await lucky(a.session, b.user.id))[0], 200);
  });
});

describe('Oda masaları', () => {
  const act = (s, room, action, extra = {}) => call('POST', '/api/rooms/table', { room, action, ...extra }, s);
  const roomOf = async (owner) => {
    const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session);
    assert.equal(st, 200, j.error);
    return j.room.id;
  };

  test('kapalı oyun masa açmaz, yeni oyuncu ve yeni el almaz; başlamış el oynanıp kapanır', async () => {
    const owner = await signUp('Masa sahibi');
    const x = await signUp('Xavi');
    const y = await signUp('Yeşim');
    const room = await roomOf(owner);
    assert.equal((await act(owner.session, room, 'open', { game: 'xox' }))[0], 200);
    assert.equal((await act(x.session, room, 'join'))[1].table.status, 'playing');
    await setLive({ casino_off: ['xox', 'cards'] });
    assert.deepEqual((await config()).gamesOff, ['cards', 'xox']);
    await refused(act(y.session, room, 'join'), 409, /XOX şu an kapalı/);
    // The hand dealt before the switch: the player whose turn it is still moves, and the opener can close it.
    const [st, j] = await act(owner.session, room, 'move', { move: { cell: 4 } });
    assert.equal(st, 200, j.error);
    assert.equal((await act(owner.session, room, 'close'))[0], 200);
    await refused(act(owner.session, room, 'open', { game: 'xox' }), 409, /XOX şu an kapalı/);
    await refused(act(owner.session, room, 'open', { game: 'cards' }), 409, /Renk Kartları şu an kapalı/);
    assert.equal((await act(owner.session, room, 'open', { game: 'ludo' }))[0], 200, 'diğer oyun açık');
    await reset();
  });

  test('yalnız yöneticilere açık oyunun masasını yönetici açar, üye oturamaz', async () => {
    const member = await signUp('Üye sahibi');
    const boss2 = await h.account('Masa yöneticisi', 'admin');
    const guest = await signUp('Misafir');
    await setLive({ games_staff: ['four'] });
    await refused(act(member.session, await roomOf(member), 'open', { game: 'four' }), 409, /Dört Taş şu an kapalı/);
    const room = await roomOf(boss2);
    assert.equal((await act(boss2.session, room, 'open', { game: 'four' }))[0], 200);
    await refused(act(guest.session, room, 'join'), 409, /Dört Taş şu an kapalı/);
    await reset();
    assert.equal((await act(guest.session, room, 'join'))[0], 200);
  });
});
