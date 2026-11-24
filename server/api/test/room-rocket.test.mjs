// Oda roketi (room-rocket.mjs, room-rocket-rules.mjs) against a real Postgres and a fake LiveKit: gifts in an open
// server room fill today's rocket, a gift past a level's goal fills the next with the rest, a full level launches,
// its prizes are drawn among the people who filled it (at most one each) and paid once: coins (normal ones, Şanslı
// ödülü's channel) and shop items for some days. The room hears 'launch' and 'paid' packets; the sweep pays a launch nobody paid. Only
// admins read and save the settings; a save on an older copy is refused; a rocket that is off fills nothing.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { DEFAULT_ROCKET, levelEnds, prizeSlots, rankWinners, splitFuel } from '../room-rocket-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 27000 + (process.pid % 900);
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

// Işıltı off the shelf (the other tests' server sells everything, test/harness.mjs): a prize can't be an item not on sale.
const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, ROCKET_SWEEP_MS: '200', ROCKET_GRACE_S: '1', TEST_TOPUP_DAILY: '10000000', SHOP_PAUSED: 'en-sparkle' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j.error}`);
  if (re) assert.match(j.error, re);
  return j;
};
const until = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const packets = (type) =>
  lkCalls
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => p.type === type);
const topUp = async (s, coins) => {
  for (let n = 0; n < coins; n += 10_000) await ok(call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: rnd(6) }, s.session), 'yükleme');
};
const gift = (s, to, room, giftId, count, ref = rnd(6)) => ok(call('POST', '/api/gifts/send', { to, giftId, count, room, ref }, s.session), `hediye ${giftId}×${count}`);
const state = async (room, s) => ok(call('GET', `/api/rooms/rocket?room=${room}`, null, s.session), 'roket');
const paidLaunches = async (room) => (await h.sql.query('SELECT level, winners FROM room_rocket_launches WHERE room_id = $1 AND paid_at IS NOT NULL ORDER BY level', [room])).rows;
const wins = async (room, level) =>
  (
    await h.sql.query(
      'SELECT w.user_id, w.prize, w.outcome, w.ref FROM room_rocket_wins w JOIN room_rocket_launches l ON l.id = w.launch_id WHERE l.room_id = $1 AND l.level = $2 ORDER BY w.slot',
      [room, level],
    )
  ).rows;

/** Small goals (ends 1.000, 3.000, 6.000, 10.000, 15.000) so a few gifts launch them. */
const SMALL = {
  enabled: true,
  levels: [
    { goal: 1_000, prizes: [{ kind: 'item', sku: 'fr-neon', days: 1, winners: 1 }, { kind: 'coins', amount: 100, winners: 2 }] },
    { goal: 2_000, prizes: [{ kind: 'coins', amount: 200, winners: 1 }] },
    { goal: 3_000, prizes: [{ kind: 'coins', amount: 300, winners: 1 }] },
    { goal: 4_000, prizes: [{ kind: 'coins', amount: 400, winners: 1 }] },
    { goal: 5_000, prizes: [{ kind: 'coins', amount: 500, winners: 1 }] },
  ],
};

describe('Oda roketi kuralları (saf)', () => {
  test('hediye geçtiği seviyelere bölünür; en üst seviyeden sonrası saymaz', () => {
    const ends = levelEnds(SMALL);
    assert.deepEqual(ends, [1_000, 3_000, 6_000, 10_000, 15_000]);
    assert.deepEqual(splitFuel(ends, 900, 300), [{ level: 1, coins: 100 }, { level: 2, coins: 200 }]);
    assert.deepEqual(splitFuel(ends, 14_500, 2_000), [{ level: 5, coins: 500 }]);
    assert.deepEqual(splitFuel(ends, 15_000, 2_000), []);
    assert.equal(levelEnds(DEFAULT_ROCKET).length, 5);
  });
  // Owners, 25 Nov 2026: no draw; the one who gave most takes the biggest coin prize, items after the coins.
  test('katkı sırası: en çok veren en büyük jeton ödülünü alır; herkes en çok bir kez', () => {
    const fuel = [{ user: 'b', coins: 100 }, { user: 'a', coins: 900 }, { user: 'c', coins: 500 }, { user: 'd', coins: 0 }];
    assert.deepEqual(rankWinners(fuel, 5), ['a', 'c', 'b']);
    assert.deepEqual(rankWinners(fuel, 1), ['a']);
    assert.deepEqual(rankWinners([{ user: 'y', coins: 5 }, { user: 'x', coins: 5 }], 2), ['x', 'y'], 'eşitlikte hep aynı sıra');
    assert.deepEqual(rankWinners([], 3), []);
    const slots = prizeSlots([
      { kind: 'item', sku: 'fr-neon', days: 1, winners: 1 },
      { kind: 'coins', amount: 100, winners: 2 },
      { kind: 'coins', amount: 500, winners: 1 },
    ]);
    assert.deepEqual(slots.map((s) => (s.kind === 'coins' ? s.amount : s.sku)), [500, 100, 100, 'fr-neon']);
    assert.deepEqual(slots.map((s) => s.slot), [0, 1, 2, 3]);
  });
});

describe('Oda roketi', () => {
  let admin;
  let owner;
  let a;
  let b;
  let c;
  let room;
  before(async () => {
    admin = await h.account('Roket Yöneticisi', 'admin');
    owner = await signUp('Roket Odası Sahibi');
    a = await signUp('Roket A');
    b = await signUp('Roket B');
    c = await signUp('Roket C');
    for (const s of [a, b, c]) await topUp(s, 30_000);
    room = (await ok(call('POST', '/api/rooms', { title: `Roket ${rnd(2)}` }, owner.session), 'oda')).room.id;
  });

  test('ayarları yalnız yönetici okur ve kaydeder; yanlış ayar ve eski sürüm reddedilir', async () => {
    await refused(call('GET', '/api/admin/rocket', null, a.session), 403);
    const view = await ok(call('GET', '/api/admin/rocket', null, admin.session), 'ayarlar');
    assert.deepEqual([view.version, view.config.enabled, view.config.levels.length], [1, false, 5], 'panel açana kadar kapalı');
    // Off: a room gift fills nothing.
    await gift(a, owner.user.id, room, 'g4', 1);
    assert.equal((await state(room, a)).fuel, 0);
    const skus = view.items.map((x) => x.sku);
    assert.ok(skus.includes('fr-neon') && skus.includes('rd-sport'), 'çerçeve ve araç seçilebilir');
    assert.ok(!skus.includes('id-777') && !skus.includes('en-sparkle'), 'özel numara ve satışta olmayan seçilemez');
    await refused(call('POST', '/api/admin/rocket/config', { config: { ...SMALL, levels: SMALL.levels.slice(0, 4) }, version: 1 }, admin.session), 400, /5 seviyesi/);
    await refused(call('POST', '/api/admin/rocket/config', { config: { ...SMALL, levels: SMALL.levels.map((l) => ({ ...l, prizes: [{ kind: 'item', sku: 'id-777', days: 1, winners: 1 }] })) }, version: 1 }, admin.session), 400, /ödül olamaz|satışta olan/);
    await refused(call('POST', '/api/admin/rocket/config', { config: SMALL, version: 7 }, admin.session), 409, /bu arada değişti/);
    const saved = await ok(call('POST', '/api/admin/rocket/config', { config: SMALL, version: 1 }, admin.session), 'kaydet');
    assert.equal(saved.version, 2);
    const audit = (await h.sql.query("SELECT detail FROM audit_events WHERE action = 'rocket.config' ORDER BY id DESC LIMIT 1")).rows[0].detail;
    assert.deepEqual([audit.version, audit.after.levels[0].goal, audit.before.levels[0].goal], [2, 1_000, DEFAULT_ROCKET.levels[0].goal]);
  });

  test('odadaki hediyeler roketi doldurur; dolan seviye kalkar, ödüller katkı sırasıyla verilir ve bir kez ödenir', async () => {
    const from = lkCalls.length;
    await gift(a, owner.user.id, room, 'g5', 1); // 500
    let s = await state(room, a);
    assert.deepEqual([s.on, s.fuel, s.current, s.levels[0].filled, s.levels[0].goal, s.levels[0].mine], [true, 500, 1, 500, 1_000, 500]);
    assert.deepEqual(s.levels[0].top.map((x) => [x.user.id, x.coins]), [[a.user.id, 500]]);
    assert.deepEqual(s.levels[0].prizes[0], { kind: 'item', sku: 'fr-neon', name: s.levels[0].prizes[0].name, itemKind: 'frame', days: 1, winners: 1 });
    // b fills it (Lv.1 full at 1.000 and launches); b's next 200 go to Lv.2.
    await gift(b, owner.user.id, room, 'g5', 1);
    await gift(b, owner.user.id, room, 'g4', 1);
    assert.ok(await until(async () => (await paidLaunches(room)).length === 1), 'Lv.1 ödendi');
    const w = await wins(room, 1);
    // Two people gave 500 each by Lv.1's launch, three prizes: the two coin prizes (coins before items), the frame
    // left; equal amounts in the account id's order (owners, 25 Nov 2026: by what each gave, no draw).
    assert.equal(w.length, 2);
    assert.deepEqual(w.map((x) => x.user_id), [a.user.id, b.user.id].sort());
    assert.deepEqual(w.map((x) => [x.prize.kind, x.prize.amount]), [['coins', 100], ['coins', 100]]);
    assert.ok(w.every((x) => x.outcome === 'paid' && x.ref.startsWith('rocket:')));
    const lot = (await h.sql.query("SELECT channel, amount FROM coin_lots WHERE user_id = $1 AND channel = 'ugurlu'", [w[1].user_id])).rows;
    assert.deepEqual(lot.map((x) => Number(x.amount)), [100], 'normal jeton (Şanslı ödülü): her yerde harcanır, Cömertlik saymaz');
    const led = (await h.sql.query("SELECT reason FROM ledger WHERE user_id = $1 AND ref = $2", [w[1].user_id, w[1].ref])).rows[0];
    assert.equal(led.reason, 'Oda roketi Lv.1 ödülü');
    // The room heard the launch, then who won.
    const launch = packets('rocket').filter((p) => p.event === 'launch');
    const paid = packets('rocket').filter((p) => p.event === 'paid');
    assert.ok(lkCalls.length > from);
    assert.deepEqual(launch.map((p) => [p.room, p.level]), [[`oda-${room}`, 1]]);
    assert.deepEqual(paid.at(-1).winners.map((x) => x.user).sort(), [a.user.id, b.user.id].sort());
    s = await state(room, b);
    assert.deepEqual([s.fuel, s.current, s.levels[0].launched, s.levels[1].filled, s.levels[1].mine], [1_200, 2, true, 200, 200]);
    assert.deepEqual(s.last.winners.length, 2);
  });

  test('büyük hediye birden çok seviyeyi geçer; her kalkış ayrı çekilir; en üstten sonrası saymaz', async () => {
    await gift(c, owner.user.id, room, 'g6', 5); // 9.995: Lv.2 1.800, Lv.3 3.000, Lv.4 4.000, Lv.5 1.195
    assert.ok(await until(async () => (await paidLaunches(room)).length === 4), 'Lv.2–4 ödendi');
    const fuel = (await h.sql.query('SELECT level, coins FROM room_rocket_fuel WHERE room_id = $1 AND user_id = $2 ORDER BY level', [room, c.user.id])).rows.map((x) => [x.level, Number(x.coins)]);
    assert.deepEqual(fuel, [[2, 1_800], [3, 3_000], [4, 4_000], [5, 1_195]]);
    // Lv.3 and Lv.4: c alone filled them, one prize each.
    for (const level of [3, 4]) assert.deepEqual((await wins(room, level)).map((x) => x.user_id), [c.user.id]);
    // Past Lv.5's goal nothing more is counted today.
    await gift(a, owner.user.id, room, 'g6', 5);
    await gift(a, owner.user.id, room, 'g6', 1);
    assert.ok(await until(async () => (await paidLaunches(room)).length === 5), 'Lv.5 ödendi');
    const s = await state(room, a);
    assert.deepEqual([s.fuel >= 15_000, s.current, s.levels.every((l) => l.launched)], [true, null, true]);
    const lv5 = (await h.sql.query('SELECT sum(coins)::int AS n FROM room_rocket_fuel WHERE room_id = $1 AND level = 5', [room])).rows[0].n;
    assert.equal(lv5, 5_000);
  });

  test('aynı hediye iki kez sayılmaz; kalkışı ödenmemiş kalan seviyeyi süpürge öder', async () => {
    // A room of its own (one open room a person).
    const owner2 = await signUp('Roket Odası Sahibi 2');
    const room2 = (await ok(call('POST', '/api/rooms', { title: `Roket 2 ${rnd(2)}` }, owner2.session), 'oda')).room.id;
    const ref = rnd(8);
    await gift(a, owner2.user.id, room2, 'g5', 1, ref);
    await gift(a, owner2.user.id, room2, 'g5', 1, ref);
    assert.equal((await state(room2, a)).fuel, 500, 'tekrar istek bir kez');
    // A launch the gift's own call never paid (the process stopped): the sweep pays it.
    await h.sql.query(
      `INSERT INTO room_rocket_launches (room_id, day, level, goal, prizes, launched_at)
       SELECT room_id, day, 1, 1000, $2, now() - interval '5 seconds' FROM room_rockets WHERE room_id = $1`,
      [room2, JSON.stringify([{ kind: 'coins', amount: 50, winners: 3 }])],
    );
    assert.ok(await until(async () => (await paidLaunches(room2)).length === 1), 'süpürge ödedi');
    const w = await wins(room2, 1);
    assert.deepEqual(w.map((x) => [x.user_id, x.prize.amount]), [[a.user.id, 50]], 'tek katkı veren tek ödül');
    const n = (await h.sql.query("SELECT count(*)::int AS n FROM ledger WHERE ref LIKE 'rocket:%' AND user_id = $1 AND ref = $2", [a.user.id, w[0].ref])).rows[0].n;
    assert.equal(n, 1);
  });

  test('kapalıyken roket dolmaz; telefonlar kapalı olduğunu görür', async () => {
    const view = await ok(call('GET', '/api/admin/rocket', null, admin.session), 'ayarlar');
    await ok(call('POST', '/api/admin/rocket/config', { config: { ...view.config, enabled: false }, version: view.version }, admin.session), 'kapat');
    const owner3 = await signUp('Roket Odası Sahibi 3');
    const room3 = (await ok(call('POST', '/api/rooms', { title: `Roket 3 ${rnd(2)}` }, owner3.session), 'oda')).room.id;
    await gift(b, owner3.user.id, room3, 'g5', 1);
    const s = await state(room3, b);
    assert.deepEqual([s.on, s.fuel], [false, 0]);
    await refused(call('GET', '/api/rooms/rocket?room=nope', null, b.session), 400);
    await refused(call('GET', `/api/rooms/rocket?room=${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)}`, null, b.session), 404);
  });
});
