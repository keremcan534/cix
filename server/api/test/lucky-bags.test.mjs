// Şanslı çanta (lucky-bags.mjs) against a real Postgres: a coin bag paid when dropped, joined by whoever taps it
// while it falls and dealt among them at random when it ends (all of it, to few or to many), a gift bag whose
// shares are real gifts, a bag that waits before it opens, followers only, and a bag nobody joined going back.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { deal, split, takeParts } from '../lucky-bag-rules.mjs';
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
/** The bag's time is up now; waits for the sweep (BAG_SWEEP_MS 200) to draw it. */
async function drawNow(id) {
  await q("UPDATE lucky_bags SET closes_at = now() - interval '1 second' WHERE id = $1", [id]);
  for (let i = 0; i < 60; i++) {
    const b = (await q('SELECT status, returned FROM lucky_bags WHERE id = $1', [id])).rows[0];
    if (b.status !== 'open') return b;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('bag not drawn');
}
const winners = async (id) => (await q('SELECT user_id, units, coins FROM lucky_bag_grabs WHERE bag_id = $1', [id])).rows;

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

  test('dağıtım: çok kişide paylar kadar kazanan, az kişide hepsi dağıtılır, kimse yoksa boş', () => {
    const shares = [5, 1, 3, 2, 4];
    for (let i = 0; i < 30; i++) {
      const many = deal(shares, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
      assert.equal(many.length, 5, 'her pay ayrı birine');
      assert.equal(many.reduce((t, [, u]) => t + u, 0), 15);
      const few = deal(shares, ['a', 'b']);
      assert.equal(few.length, 2, 'katılan herkes kazanır');
      assert.equal(few.reduce((t, [, u]) => t + u, 0), 15, 'çantanın hepsi dağıtılır');
      assert.deepEqual(deal(shares, []), []);
    }
  });
});

describe('Şanslı çanta', () => {
  test('jeton çantası: atınca ödenir; düşerken dokunanlar katılır, bitince paylar onlara dağıtılır', async () => {
    const owner = await signUp('Oda Sahibi');
    const id = await room(owner);
    const rich = await signUp('Cömert');
    await topUp(rich.session);
    const before = (await me(rich.session)).coins;
    const ref = rnd(6);
    const r = await ok(drop(rich.session, { room: id, kind: 'coins', amount: 1000, packets: 5, ref }), 'çanta');
    assert.equal(r.bag.left, 5);
    assert.equal(r.bag.coins, 1000);
    assert.equal(r.bag.entrants, 0);
    assert.equal((await me(rich.session)).coins, before - 1000);
    // A retry with the same ref drops nothing more.
    const again = await ok(drop(rich.session, { room: id, kind: 'coins', amount: 1000, packets: 5, ref }), 'çanta 2');
    assert.equal(again.bag.id, r.bag.id);
    assert.equal(again.replay, true);
    assert.equal((await me(rich.session)).coins, before - 1000);
    const [st0] = await grab(rich.session, r.bag.id);
    assert.equal(st0, 400, 'sahibi kendi çantasına katılamaz');

    const list = await ok(call('GET', `/api/lucky-bags?room=${id}`, null, owner.session), 'liste');
    assert.ok(list.bags.some((b) => b.id === r.bag.id));
    assert.deepEqual(list.rules.coins, [1000, 5000, 10000, 50000]);
    assert.equal(list.rules.windowSeconds, 30);

    // Seven people tap it while it falls: they join, nobody is paid yet.
    const takers = [];
    for (let i = 0; i < 7; i++) {
      const t = await signUp(`Dokunan ${i}`);
      takers.push(t);
      const j = await ok(grab(t.session, r.bag.id), `katıl ${i}`);
      assert.equal(j.joined, true);
      assert.equal(j.bag.joined, true);
      assert.equal(j.bag.entrants, i + 1);
      assert.equal((await me(t.session)).coins, 0);
    }
    // A tap again changes nothing.
    assert.equal((await ok(grab(takers[0].session, r.bag.id), 'yine')).bag.entrants, 7);

    assert.equal((await drawNow(r.bag.id)).status, 'done');
    const won = await winners(r.bag.id);
    assert.equal(won.length, 5, 'payların sayısı kadar kazanan (herkes kazanmaz)');
    assert.equal(won.reduce((t, w) => t + Number(w.coins), 0), 1000, 'çantanın tamamı dağıtıldı');
    for (const w of won) assert.equal((await me(takers.find((t) => t.user.id === w.user_id).session)).coins, Number(w.coins));
    const late = await signUp('Geç Kalan');
    const [st2, j2] = await grab(late.session, r.bag.id);
    assert.equal(st2, 409);
    assert.equal(j2.code, 'empty');
    const one = await ok(call('GET', `/api/lucky-bags/one?id=${r.bag.id}`, null, late.session), 'kimler kazandı');
    assert.equal(one.grabs.length, 5);
    assert.equal(one.bag.status, 'done');
    assert.equal(one.bag.entrants, 7);
    // Coins from a bag: their own channel, their source lot kept.
    const lots = (await q('SELECT channel, source_lot FROM coin_lots WHERE user_id = $1', [won[0].user_id])).rows;
    assert.ok(lots.length >= 1 && lots.every((l) => l.channel === 'canta' && l.source_lot !== null));
    // Putting coins in a bag is not Cömertlik.
    assert.equal((await me(rich.session)).wealthXp, 0);
  });

  test('az kişi katılırsa da çantanın hepsi onlara dağıtılır', async () => {
    const owner = await signUp('Oda Sahibi 5');
    const id = await room(owner);
    const rich = await signUp('Bol Paylı');
    await topUp(rich.session);
    const r = await ok(drop(rich.session, { room: id, kind: 'coins', amount: 1000, packets: 20 }), 'çanta');
    const a = await signUp('Tek');
    const b = await signUp('Çift');
    await ok(grab(a.session, r.bag.id), 'katıl a');
    await ok(grab(b.session, r.bag.id), 'katıl b');
    assert.equal((await drawNow(r.bag.id)).status, 'done');
    const won = await winners(r.bag.id);
    assert.equal(won.length, 2);
    assert.equal((await me(a.session)).coins + (await me(b.session)).coins, 1000);
    assert.equal((await q('SELECT parts FROM lucky_bags WHERE id = $1', [r.bag.id])).rows[0].parts.length, 0, 'çantada jeton kalmadı');
  });

  test('hediye çantası: kazananın payları o hediyeden gönderilmiş sayılır (elmas, hediye kaydı)', async () => {
    const owner = await signUp('Oda Sahibi 2');
    const id = await room(owner);
    const rich = await signUp('Hediyeci');
    await topUp(rich.session);
    const r = await ok(drop(rich.session, { room: id, kind: 'gift', giftId: 'g4', count: 10, packets: 5 }), 'hediye çantası');
    const price = r.bag.unitPrice;
    assert.equal(r.bag.coins, price * 10);
    const t = await signUp('Şanslı');
    await ok(grab(t.session, r.bag.id), 'katıl');
    await drawNow(r.bag.id);
    // Alone in the draw: the whole bag is theirs.
    assert.equal((await me(t.session)).diamonds, price * 10);
    const ev = (await q('SELECT sender, count, total FROM gift_events WHERE recipient = $1', [t.user.id])).rows;
    assert.deepEqual(ev.map((e) => [e.sender, e.count, Number(e.total)]), [[rich.user.id, 10, price * 10]]);
  });

  test('bekleyen çantaya erken katılınmaz; yalnız takipçiler; kimse katılmazsa hepsi sahibine döner', async () => {
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
    // Nobody joined: it all goes back.
    const bag = await drawNow(r.bag.id);
    assert.equal(bag.status, 'returned');
    assert.equal(bag.returned, 1000);
    assert.equal((await me(rich.session)).coins, start);
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
