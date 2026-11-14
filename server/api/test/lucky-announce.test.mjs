// Şanslı kazancı herkese (lucky.mjs announceWin, live-line.mjs lineWin) against a real Postgres: a win goes out on
// every live line that asks for wins (GET /api/live?wins=1) with what its banner shows, the sender's name and photo
// only when the send says `named`; never to the winner's own lines, to anyone in a block with them, nor to an older
// app's line; once per send (a replay is not a new win); and only from the live setting's floor up (0: every win).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ LIVE_BEAT_MS: '200' });
const { call, signUp } = h;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) await ok(call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s), 'yükle');
  }
};
/** A signed-up adult past Cömertlik Lv.2 (1000 coins spent in the shop) with `coins` left. */
async function player(name, coins) {
  const p = await signUp(name);
  await h.sql.query("UPDATE users SET birth_date = '1990-01-01' WHERE id = $1", [p.user.id]);
  await topUp(p.session, coins + 1000);
  for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) await ok(call('POST', '/api/shop/buy', { sku, price, ref: rnd(6) }, p.session), sku);
  return p;
}

/** A live line for `session` (`wins`: as the apps that show the wins open it); `next(type)` waits for that event. */
async function open(session, wins = true) {
  const ctl = new AbortController();
  const res = await fetch(`${h.base}/api/live${wins ? '?wins=1' : ''}`, { headers: { authorization: `Bearer ${session}` }, signal: ctl.signal });
  assert.equal(res.status, 200);
  const events = [];
  let raw = '';
  (async () => {
    const dec = new TextDecoder();
    try {
      for await (const chunk of res.body) {
        raw += dec.decode(chunk, { stream: true });
        let i;
        while ((i = raw.indexOf('\n\n')) >= 0) {
          const block = raw.slice(0, i);
          raw = raw.slice(i + 2);
          for (const l of block.split('\n')) if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6)));
        }
      }
    } catch {
      // closed
    }
  })();
  const next = async (type) => {
    const end = Date.now() + 3000;
    for (;;) {
      const at = events.findIndex((e) => e.type === type);
      if (at >= 0) return events.splice(at, 1)[0];
      if (Date.now() > end) throw new Error(`no ${type} event (got ${JSON.stringify(events)})`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  /** The wins that came before a ping on this line: events on one line keep their order. */
  const winsSoFar = async () => {
    await ok(call('POST', '/api/live/ping', {}, session), 'ping');
    await next('ping');
    return events.filter((e) => e.type === 'win').splice(0);
  };
  return { events, next, winsSoFar, close: () => ctl.abort() };
}

describe('Şanslı kazancı bütün odalara', () => {
  test('kazanç herkese gider; adı yalnız isteyenin; kazananın kendine, engelliye ve eski uygulamaya gitmez', async () => {
    const admin = await signUp('Yönetici');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    // Şans Yoncası (20 coins) always pays ×2.
    const [, cur] = await call('GET', '/api/admin/lucky', null, admin.session);
    const config = structuredClone(cur.config);
    config.gifts[0].tiers = [
      { mult: 0, weight: 0 },
      { mult: 2, weight: 100_000 },
    ];
    await ok(call('POST', '/api/admin/lucky/config', { config, version: cur.version }, admin.session), 'ayar');

    const owner = await signUp('Oda Sahibi');
    const room = (await ok(call('POST', '/api/rooms', { title: `Şans Odası ${rnd(2)}` }, owner.session), 'oda')).room;
    const winner = await player('Kazanan', 5000);
    const photo = `https://cdn.example.com/avatar/${winner.user.id}/${rnd(6)}.jpg`;
    await ok(call('PATCH', '/api/me', { avatarUrl: photo }, winner.session), 'fotoğraf');
    const to = await signUp('Alan');
    const watcher = await signUp('İzleyen');
    const older = await signUp('Eski Uygulama');
    const blocker = await signUp('Engelleyen');
    await ok(call('POST', '/api/block', { to: winner.user.id }, blocker.session), 'engelle');

    const w = await open(watcher.session);
    const old = await open(older.session, false);
    const own = await open(winner.session);
    const blocked = await open(blocker.session);

    const ref = rnd(8);
    const sent = await ok(call('POST', '/api/lucky/send', { giftId: 'lk1', to: [to.user.id], count: 1, room: room.id, ref, named: true }, winner.session), 'gönder');
    assert.equal(sent.send.payout, 40);
    assert.deepEqual(await w.next('win'), {
      type: 'win',
      id: sent.send.id,
      uid: winner.user.id,
      name: 'Kazanan',
      avatar: photo,
      gift: 'Şans Yoncası',
      emoji: '🍀',
      mult: 2,
      coins: 40,
      wins: 1,
      room: room.title,
    });
    assert.deepEqual(await own.winsSoFar(), [], 'kazananın telefonu kendisi gösterdi');
    assert.deepEqual(await blocked.winsSoFar(), [], 'engelleyene gitmez');
    assert.deepEqual(await old.winsSoFar(), [], 'kazançları istemeyen hatta gitmez');

    // The same request again (a lost answer): no second win.
    const again = await ok(call('POST', '/api/lucky/send', { giftId: 'lk1', to: [to.user.id], count: 1, room: room.id, ref, named: true }, winner.session), 'tekrar');
    assert.equal(again.replay, true);
    assert.deepEqual(await w.winsSoFar(), []);

    // Without `named` (the name hidden, or an older app): no name, photo or id, outside a room no room either.
    await ok(call('POST', '/api/lucky/send', { giftId: 'lk1', to: [to.user.id], count: 5, ref: rnd(8) }, winner.session), 'adsız');
    const anon = await w.next('win');
    assert.deepEqual([anon.uid, anon.name, anon.avatar, anon.room, anon.coins, anon.wins], [null, null, null, null, 200, 5]);

    // Canlı ayarlar › Kazanç duyurusu: from 100 coins up.
    const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
    await ok(call('POST', '/api/admin/live-settings', { changes: { lucky_announce_min_coins: 100 }, reason: 'Duyuru testi', baseV: view.v }, admin.session), 'canlı ayar');
    await ok(call('POST', '/api/lucky/send', { giftId: 'lk1', to: [to.user.id], count: 1, room: room.id, ref: rnd(8), named: true }, winner.session), 'küçük kazanç');
    assert.deepEqual(await w.winsSoFar(), [], '40 jeton duyurulmaz');
    await ok(call('POST', '/api/lucky/send', { giftId: 'lk1', to: [to.user.id], count: 5, room: room.id, ref: rnd(8), named: true }, winner.session), 'büyük kazanç');
    const big = await w.next('win');
    assert.deepEqual([big.name, big.coins, big.wins, big.mult], ['Kazanan', 200, 5, 2]);

    for (const l of [w, old, own, blocked]) l.close();
  });
});
