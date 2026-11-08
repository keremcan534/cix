// Şanslı çanta (lucky-bags.mjs) against a real Postgres: a coin bag paid when dropped and shared at random, a gift
// bag whose shares are real gifts, a bag that waits before it opens, followers only, and what nobody took going
// back to the sender.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { split, takeParts } from '../lucky-bag-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', BAG_SWEEP_MS: '200' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const topUp = (s, amount = 10_000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s), 'yükleme');
async function room(owner) {
  const [, j] = await call('POST', '/api/rooms', { title: `Çanta ${rnd(2)}` }, owner.session);
  return j.room.id;
}
const drop = (s, body) => call('POST', '/api/lucky-bags', { followersOnly: false, delay: 0, ref: rnd(6), ...body }, s);
const grab = (s, id) => call('POST', '/api/lucky-bags/grab', { id }, s);

describe('Şanslı çanta: paylaştırma', () => {
  test('her pay en az 1, toplam aynı, hiçbir pay kalanın iki katını geçmez', () => {
    for (const [total, n] of [[1000, 5], [1000, 30], [10, 10], [99, 15], [50_000, 20]]) {
      for (let i = 0; i < 50; i++) {
        const s = split(total, n);
        assert.equal(s.length, n);
        assert.equal(s.reduce((a, b) => a + b, 0), total);
        assert.ok(s.every((x) => x >= 1));
      }
    }
    assert.throws(() => split(4, 5));
  });

  test('ayrılan jeton parçaları sırayla alınır', () => {
    const parts = [{ lot: 1, channel: 'google', amount: 300, lockHours: 168 }, { lot: 2, channel: 'jeton_noktasi', amount: 700, lockHours: 24 }];
    const [a, keep] = takeParts(parts, 500);
    assert.deepEqual(a.map((p) => [p.lot, p.amount]), [[1, 300], [2, 200]]);
    assert.deepEqual(keep.map((p) => [p.lot, p.amount]), [[2, 500]]);
    assert.throws(() => takeParts(keep, 501));
  });
});

describe('Şanslı çanta', () => {
  test('jeton çantası: atınca ödenir, açanlar paylaşır, tekrar açılmaz, sahibi açamaz, Cömertlik saymaz', async () => {
    const owner = await signUp('Oda Sahibi');
    const id = await room(owner);
    const rich = await signUp('Cömert');
    await topUp(rich.session);
    const before = (await me(rich.session)).coins;
    const ref = rnd(6);
    const r = await ok(drop(rich.session, { room: id, kind: 'coins', amount: 1000, packets: 5, ref }), 'çanta');
    assert.equal(r.bag.left, 5);
    assert.equal(r.bag.coins, 1000);
    assert.equal((await me(rich.session)).coins, before - 1000);
    // A retry with the same ref drops nothing more.
    const again = await ok(drop(rich.session, { room: id, kind: 'coins', amount: 1000, packets: 5, ref }), 'çanta 2');
    assert.equal(again.bag.id, r.bag.id);
    assert.equal(again.replay, true);
    assert.equal((await me(rich.session)).coins, before - 1000);
    const [st0] = await grab(rich.session, r.bag.id);
    assert.equal(st0, 400, 'sahibi kendi çantasını açamaz');

    const list = await ok(call('GET', `/api/lucky-bags?room=${id}`, null, owner.session), 'liste');
    assert.ok(list.bags.some((b) => b.id === r.bag.id));
    assert.deepEqual(list.rules.coins, [1000, 5000, 10000, 50000]);

    let got = 0;
    const takers = [];
    for (let i = 0; i < 5; i++) {
      const t = await signUp(`Açan ${i}`);
      takers.push(t);
      const g = await ok(grab(t.session, r.bag.id), `aç ${i}`);
      assert.ok(g.got.coins >= 1);
      assert.equal((await me(t.session)).coins, g.got.coins);
      got += g.got.coins;
    }
    assert.equal(got, 1000, 'paylar toplamı çantadaki jeton');
    const [st1, j1] = await grab(takers[0].session, r.bag.id);
    assert.equal(st1, 409);
    assert.ok(['taken', 'empty'].includes(j1.code));
    const late = await signUp('Geç Kalan');
    const [st2, j2] = await grab(late.session, r.bag.id);
    assert.equal(st2, 409);
    assert.equal(j2.code, 'empty');
    const one = await ok(call('GET', `/api/lucky-bags/one?id=${r.bag.id}`, null, late.session), 'kimler aldı');
    assert.equal(one.grabs.length, 5);
    assert.equal(one.bag.status, 'done');
    // Coins from a bag: their own channel, their source lot kept.
    const lots = (await q("SELECT channel, source_lot FROM coin_lots WHERE user_id = $1", [takers[0].user.id])).rows;
    assert.ok(lots.length >= 1 && lots.every((l) => l.channel === 'canta' && l.source_lot !== null));
    // Putting coins in a bag is not Cömertlik.
    assert.equal((await me(rich.session)).wealthXp, 0);
  });

  test('hediye çantası: her pay o hediyeden gönderilmiş sayılır (elmas, hediye kaydı)', async () => {
    const owner = await signUp('Oda Sahibi 2');
    const id = await room(owner);
    const rich = await signUp('Hediyeci');
    await topUp(rich.session);
    const r = await ok(drop(rich.session, { room: id, kind: 'gift', giftId: 'g4', count: 10, packets: 5 }), 'hediye çantası');
    const price = r.bag.unitPrice;
    assert.equal(r.bag.coins, price * 10);
    const t = await signUp('Şanslı');
    const g = await ok(grab(t.session, r.bag.id), 'aç');
    assert.equal(g.got.kind, 'gift');
    assert.equal(g.got.coins, g.got.units * price);
    assert.equal((await me(t.session)).diamonds, g.got.coins);
    const ev = (await q('SELECT sender, count, total FROM gift_events WHERE recipient = $1', [t.user.id])).rows;
    assert.deepEqual(ev.map((e) => [e.sender, e.count, Number(e.total)]), [[rich.user.id, g.got.units, g.got.coins]]);
  });

  test('bekleyen çanta erken açılmaz; yalnız takipçiler; süresi dolunca kalan sahibine döner', async () => {
    const owner = await signUp('Oda Sahibi 3');
    const id = await room(owner);
    const rich = await signUp('Bekleten');
    await topUp(rich.session);
    const start = (await me(rich.session)).coins;
    const r = await ok(drop(rich.session, { room: id, kind: 'coins', amount: 1000, packets: 5, delay: 120, followersOnly: true }), 'çanta');
    const fan = await signUp('Takipçi');
    const stranger = await signUp('Yabancı');
    const [st, j] = await grab(fan.session, r.bag.id);
    assert.equal(st, 409);
    assert.equal(j.code, 'early');
    await q("UPDATE lucky_bags SET opens_at = now() - interval '1 second' WHERE id = $1", [r.bag.id]);
    const [st2, j2] = await grab(stranger.session, r.bag.id);
    assert.equal(st2, 403);
    assert.equal(j2.code, 'followers');
    await ok(call('POST', '/api/follow', { to: rich.user.id }, fan.session), 'takip');
    const g = await ok(grab(fan.session, r.bag.id), 'takipçi açar');
    // Time is up: the rest goes back.
    await q("UPDATE lucky_bags SET closes_at = now() - interval '1 second' WHERE id = $1", [r.bag.id]);
    let bag;
    for (let i = 0; i < 50; i++) {
      bag = (await q('SELECT status, returned FROM lucky_bags WHERE id = $1', [r.bag.id])).rows[0];
      if (bag.status === 'returned') break;
      await new Promise((res) => setTimeout(res, 100));
    }
    assert.equal(bag.status, 'returned');
    assert.equal(bag.returned, 1000 - g.got.coins);
    assert.equal((await me(rich.session)).coins, start - g.got.coins);
  });

  test('geçersiz seçimler ve ödül jetonu reddedilir', async () => {
    const owner = await signUp('Oda Sahibi 4');
    const id = await room(owner);
    const poor = await signUp('Az Jetonlu');
    const [st0] = await drop(poor.session, { room: id, kind: 'coins', amount: 1234, packets: 5 });
    assert.equal(st0, 400);
    const [st1] = await drop(poor.session, { room: id, kind: 'gift', giftId: 'g4', count: 10, packets: 15 });
    assert.equal(st1, 400);
    const [st2, j2] = await drop(poor.session, { room: id, kind: 'coins', amount: 1000, packets: 5 });
    assert.equal(st2, 409);
    assert.equal(j2.code, 'insufficient');
    const [st3] = await drop(poor.session, { room: 'yok', kind: 'coins', amount: 1000, packets: 5 });
    assert.equal(st3, 400);
  });
});
