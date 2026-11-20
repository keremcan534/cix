// What a paid gift locks, and what may run beside it (send-locks.mjs, room-xp-add.mjs; the review of Güncelleme 7):
//   - the room owner's room actions (a poll opened or closed: rows that point at the room and at them) never wait for
//     a gift in their room, whoever sends it to whom (the owner's row was locked FOR UPDATE by every gift: deadlocks);
//   - a gift's room XP reaches the owner right after it commits, through room_xp_pending (the owner's row isn't
//     touched inside the gift); a row left behind by a crash is added by the sweep; Patron koltuğu counts it;
//   - two buyers of one Jeton Noktası send Şanslı at the same moment without waiting for each other.
// A gift is stopped half way by holding the sender's coin lots from a connection of the test's own.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 29000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, ROOM_XP_SWEEP_MS: '200', TEST_TOPUP_DAILY: '100000000' });
const { call, signUp } = h;
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (await fn()) return true;
  return false;
};
const topUp = (s, amount) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s.session), 'yükleme');
const roomPackets = (from) => lkCalls.slice(from).filter((c) => c.method === 'SendData').map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8'))).filter((p) => p.type === 'room');
/** True once a query matching `re` waits for a lock. */
const waitingOn = (re) => until(async () => (await q("SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()")).some((x) => re.test(x.query)));
/** `p` settled within `ms`, or 'still waiting'. */
const within = (p, ms = 3000) => Promise.race([p, sleep(ms).then(() => 'still waiting')]);

/**
 * Runs `fn` while `userId`'s coin lots are held: a gift of theirs started in it stops in its coin step, with its
 * accounts locked. The lots are let go when `fn` returns.
 */
async function holdingLots(userId, fn) {
  const c = await h.sql.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT id FROM coin_lots WHERE user_id = $1 FOR UPDATE', [userId]);
    return await fn();
  } finally {
    await c.query('COMMIT');
    c.release();
  }
}
const gift = (from, to, room, giftId = 'g7', count = 1) => call('POST', '/api/gifts/send', { to: to.user.id, giftId, count, room, ref: rnd(8) }, from.session);

describe('Odadaki hediye ve oda sahibinin işleri', () => {
  test('hediye yarıdayken oda sahibi anket açıp kapatır: beklemez, kilitlenme olmaz (kim kime gönderirse göndersin)', async () => {
    const owner = await signUp('Oda Sahibi');
    const s = await signUp('Gönderen');
    const b = await signUp('Alan');
    for (const p of [owner, s]) await topUp(p, 50_000);
    const room = (await ok(call('POST', '/api/rooms', { title: `Kilit ${rnd(2)}` }, owner.session), 'oda')).room.id;
    let poll = null;
    // Someone to someone else, someone to the owner, the owner to someone: the owner's poll each time.
    for (const [from, to] of [[s, b], [s, owner], [owner, b], [s, b]]) {
      const [giftP, action] = await holdingLots(from.user.id, async () => {
        const giftP = gift(from, to, room);
        assert.ok(await waitingOn(/coin_lots/), 'hediye jeton adımında bekliyor');
        const action = poll
          ? call('POST', '/api/rooms/poll/close', { id: poll }, owner.session)
          : call('POST', '/api/rooms/poll', { room, question: `Nasıl ${rnd(2)}?`, options: ['İyi', 'Kötü'], seconds: 300, live: true }, owner.session);
        const done = await within(action);
        assert.notEqual(done, 'still waiting', 'oda sahibinin işi hediyeyi beklememeli');
        return [giftP, done];
      });
      const [st, j] = action;
      assert.equal(st, 200, `anket: ${j.error}`);
      poll = poll ? null : j.poll.id;
      await ok(giftP, 'hediye');
    }
    assert.equal((await q('SELECT count(*)::int AS n FROM gift_events WHERE room = $1', [room]))[0].n, 4);
  });
});

describe('Aynı odada birbirini beklemeyen hediyeler', () => {
  test('bir hediye jeton adımında beklerken başka birinin başka birine hediyesi aynı odada geçer', async () => {
    // The owner's row locked by every gift made a room's gifts wait for each other from their first statement (half a
    // busy room's throughput, the review's measurement). Up to the coin step a gift holds only its own two people.
    const owner = await signUp('Kalabalık Oda');
    const [s1, s2, b1, b2] = await Promise.all(['Bir', 'İki', 'Üç', 'Dört'].map((n) => signUp(`Kalabalık ${n}`)));
    for (const p of [s1, s2]) await topUp(p, 50_000);
    const room = (await ok(call('POST', '/api/rooms', { title: `Kalabalık ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const { first } = await holdingLots(s1.user.id, async () => {
      const first = gift(s1, b1, room);
      assert.ok(await waitingOn(/coin_lots/), 'ilk hediye jeton adımında bekliyor');
      const second = await within(gift(s2, b2, room));
      assert.notEqual(second, 'still waiting', 'ikinci hediye ilkini beklememeli');
      assert.equal(second[0], 200, second[1].error);
      return { first };
    });
    await ok(first, 'ilk hediye');
    // Both gifts' coins are the owner's room XP.
    const [x] = await q('SELECT (SELECT room_xp FROM users WHERE id = $1) AS xp, (SELECT sum(total) FROM gift_events WHERE room = $2) AS sent', [owner.user.id, room]);
    assert.equal(Number(x.xp), Number(x.sent));
    assert.ok(Number(x.sent) > 0);
  });
});

describe('Oda XP', () => {
  test('hediye bitince sahibine geçer; bekleyen satır kalmaz; seviye atlayınca oda haber alır', async () => {
    const owner = await signUp('XP Sahibi');
    const s = await signUp('XP Gönderen');
    const b = await signUp('XP Alan');
    await topUp(s, 10_000);
    const room = (await ok(call('POST', '/api/rooms', { title: `XP ${rnd(2)}` }, owner.session), 'oda')).room.id;
    // The cheapest gift anyone may send takes the room from just under a level (rooms.mjs ROOM_XP_THRESHOLDS) to it.
    const rose = (await ok(call('GET', '/api/catalog?gifts=2'), 'katalog')).gifts.filter((g) => !g.minSvip && g.price <= 9000).sort((x, y) => x.price - y.price)[0];
    const steps = [0, 100, 300, 600, 1_000, 1_600, 2_400, 3_400, 4_800, 6_500, 8_500, 11_000, 14_000, 18_000, 23_000];
    const step = steps.find((t, i) => i > 0 && t - rose.price >= steps[i - 1]);
    await q('UPDATE users SET room_xp = $2 WHERE id = $1', [owner.user.id, step - rose.price]);
    assert.equal((await ok(call('GET', `/api/room?id=${room}`, null, s.session), 'oda')).room.level, steps.indexOf(step), 'bir alt seviye');
    const from = lkCalls.length;
    await ok(gift(s, b, room, rose.id), 'hediye');
    assert.equal(Number((await q('SELECT room_xp FROM users WHERE id = $1', [owner.user.id]))[0].room_xp), step);
    assert.equal((await q('SELECT count(*)::int AS n FROM room_xp_pending'))[0].n, 0);
    assert.equal((await ok(call('GET', `/api/room?id=${room}`, null, s.session), 'oda')).room.level, steps.indexOf(step) + 1);
    assert.ok(roomPackets(from).length >= 1, 'oda yeniden okunur');
    // Outside the room: no room XP.
    await ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: rose.id, count: 1, place: 'profile', ref: rnd(8) }, s.session), 'profil hediyesi');
    assert.equal(Number((await q('SELECT room_xp FROM users WHERE id = $1', [owner.user.id]))[0].room_xp), step);
  });

  test('bir çökmenin bıraktığı satırı süpürme ekler (bir kez)', async () => {
    const owner = await signUp('Çökme Sahibi');
    const room = (await ok(call('POST', '/api/rooms', { title: `Çökme ${rnd(2)}` }, owner.session), 'oda')).room.id;
    const from = lkCalls.length;
    await q("INSERT INTO room_xp_pending (event_id, owner, xp, created_at) VALUES (900000001, $1, 250, now() - interval '1 minute')", [owner.user.id]);
    assert.ok(await until(async () => Number((await q('SELECT room_xp FROM users WHERE id = $1', [owner.user.id]))[0].room_xp) === 250), 'süpürme ekler');
    assert.equal((await q('SELECT count(*)::int AS n FROM room_xp_pending'))[0].n, 0);
    assert.ok(await until(async () => roomPackets(from).length >= 1), 'seviye atlayan sahibin açık odası haber alır');
    await sleep(500);
    assert.equal(Number((await q('SELECT room_xp FROM users WHERE id = $1', [owner.user.id]))[0].room_xp), 250, 'bir kez');
    assert.ok(room);
  });

  test('Patron koltuğu: odayı Lv.3 yapan hediyenin kendi XP\'si sayılır', async () => {
    const owner = await signUp('Patron Sahibi');
    const a = await signUp('Patron Aday');
    await topUp(a, 50_000);
    const room = (await ok(call('POST', '/api/rooms', { title: `Patron ${rnd(2)}` }, owner.session), 'oda')).room.id;
    await q('UPDATE users SET room_xp = 300 WHERE id = $1', [owner.user.id]);
    await ok(call('POST', '/api/rooms/update', { id: room, rules: { bossSeat: true, bossMode: 'auto' } }, owner.session), 'patron koltuğu');
    // Lv.2 again: this gift (49.500 coins) takes the room to Lv.3, and so the seat to its sender.
    await q('UPDATE users SET room_xp = 299 WHERE id = $1', [owner.user.id]);
    await ok(gift(a, owner, room, 'g7', 10), 'hediye');
    const seen = (await ok(call('GET', `/api/room?id=${room}`, null, a.session), 'oda')).room;
    assert.equal(seen.bossSeat?.holder?.id, a.user.id);
  });
});

describe('Şanslı ve Jeton Noktası', () => {
  test('aynı Jeton Noktası\'ndan almış iki kişi aynı anda Şanslı gönderir: biri ötekini beklemez', async () => {
    const admin = await h.account('Yönetici', 'admin');
    const bank = await signUp('Jeton Noktası');
    await ok(call('POST', '/api/admin/jeton/bank', { user: bank.user.id, enabled: true }, admin.session), 'banka');
    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 100_000, paymentRef: 'DEKONT-1', ref: rnd(6) }, admin.session), 'toptan');
    const buyers = [await signUp('Alıcı Bir'), await signUp('Alıcı İki')];
    const to = [await signUp('Şanslı Alan 1'), await signUp('Şanslı Alan 2')];
    await q("UPDATE users SET birth_date = '1990-01-01' WHERE id = ANY($1::uuid[])", [buyers.map((x) => x.user.id)]);
    for (const p of buyers) {
      // Cömertlik Lv.2 from the shop first, so the coins left are only the Jeton Noktası's.
      await topUp(p, 1000);
      for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) await ok(call('POST', '/api/shop/buy', { sku, price, ref: rnd() }, p.session), sku);
      await ok(call('POST', '/api/jeton/transfer', { to: p.user.id, coins: 5000, paymentRef: 'HAVALE-1', ref: rnd(6) }, bank.session), 'satış');
    }
    assert.deepEqual((await q('SELECT DISTINCT source_user FROM coin_lots WHERE user_id = ANY($1::uuid[]) AND remaining > 0', [buyers.map((x) => x.user.id)])).map((x) => x.source_user), [bank.user.id]);
    const lucky = (p, r) => call('POST', '/api/lucky/send', { giftId: 'lk2', to: [r.user.id], count: 1, ref: rnd(8) }, p.session);
    // (Wrapped: an async function returning the send's promise would wait for it, and so for the lots it holds.)
    const { first } = await holdingLots(buyers[0].user.id, async () => {
      const first = lucky(buyers[0], to[0]);
      assert.ok(await waitingOn(/coin_lots/), 'ilk gönderim jeton adımında bekliyor');
      const second = await within(lucky(buyers[1], to[1]));
      assert.notEqual(second, 'still waiting', 'ikinci gönderim Jeton Noktası yüzünden beklememeli');
      assert.equal(second[0], 200, second[1].error);
      return { first };
    });
    await ok(first, 'ilk gönderim');
  });
});
