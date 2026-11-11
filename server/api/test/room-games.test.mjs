// Oda oyunları at a table in a room (room-games.mjs, room-games-rules.mjs) against a real Postgres: the games' rules,
// only room staff open a table, seats and turns checked here, cards only to their owner, a run-out turn played by
// the table, blocks both ways, a ban, leaving, the room told after every change, and account deletion. Ludo's own
// rules and a whole Ludo table are in room-games-ludo.test.mjs.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';
import { MISSES, TABLE_GAMES, TURN_MS, leaveTable, moveTable, openTable, startTable, timeoutTable, viewOf } from '../room-games-rules.mjs';

const lkCalls = [];
const LK_PORT = 22000 + (process.pid % 900);
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

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;
const table = (s, room) => call('GET', `/api/rooms/table?room=${room}`, null, s);
const act = (s, room, action, extra = {}) => call('POST', '/api/rooms/table', { room, action, ...extra }, s);
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j.table;
};
const tablePackets = (from) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')))
    .filter((p) => p.type === 'table');
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
/** Draws in order: rolls(5) gives a die of 6, rolls(0) a die of 1. */
const seq = (...xs) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('Oda oyunlarının kuralları', () => {
  const names = ['A', 'B', 'C'];
  test('üç oyun da tek kapıdan oynanır: adı, oyuncu sayısı, masayı açanın seçimi', () => {
    assert.deepEqual(Object.keys(TABLE_GAMES), ['ludo', 'cards', 'xox']);
    assert.deepEqual([TABLE_GAMES.ludo, TABLE_GAMES.cards], [{ name: 'Ludo', min: 2, max: 4 }, { name: 'Renk Kartları', min: 2, max: 6 }]);
    assert.deepEqual([TABLE_GAMES.xox.name, TABLE_GAMES.xox.min, TABLE_GAMES.xox.max], ['XOX', 2, 2]);
    assert.deepEqual(openTable('xox', 'a', { mode: 'classic' }), { game: 'xox', seats: ['a'], status: 'waiting', turn: 0, winner: null, log: 'Oyuncular bekleniyor.', misses: [0] }, 'seçimi olmayan oyun seçim taşımaz');
    assert.equal(openTable('ludo', 'a', { mode: 'classic' }).mode, 'classic');
    assert.equal(moveTable(openTable('cards', 'a'), 0, { card: null }, names, seq(0)).reason, 'Oyun başlamadı.');
  });

  test('Renk Kartları: aynı renk veya sayı, +2 sonrakine iki kart, Atla sırayı atlatır, kart çekmek sırayı geçirir', () => {
    const t = { ...openTable('cards', 'a'), seats: ['a', 'b', 'c'], misses: [0, 0, 0], status: 'playing', turn: 0, top: { color: 1, value: 4 } };
    const hands = [
      [{ color: 1, value: '+2' }, { color: 2, value: 4 }, { color: 3, value: 9 }],
      [{ color: 0, value: 1 }],
      [{ color: 2, value: 'Atla' }],
    ];
    assert.equal(moveTable({ ...t, hands }, 0, { card: 2 }, names, seq(0)).ok, false, 'renk de sayı da tutmuyor');
    let r = moveTable({ ...t, hands }, 0, { card: 0 }, names, seq(0));
    assert.deepEqual([r.table.hands[1].length, r.table.turn, r.table.log], [3, 1, 'A +2 attı: B 2 kart çekti']);
    r = moveTable({ ...t, hands, top: { color: 2, value: 7 }, turn: 2 }, 2, { card: 0 }, names, seq(0));
    assert.deepEqual([r.table.status, r.table.winner], ['over', 2], 'son kartını atan kazanır');
    r = moveTable({ ...t, hands: [[{ color: 2, value: 'Atla' }, { color: 0, value: 0 }], ...hands.slice(1)], top: { color: 2, value: 1 } }, 0, { card: 0 }, names, seq(0));
    assert.deepEqual([r.table.turn, r.table.log], [2, 'A sırayı atlattı · SON KART!']);
    r = moveTable({ ...t, hands }, 0, { card: null }, names, seq(1));
    assert.deepEqual([r.table.hands[0].length, r.table.turn, r.table.log], [4, 1, 'A kart çekti']);
    const v = viewOf({ ...t, hands }, 1);
    assert.deepEqual([v.counts, v.hand, v.hands], [[3, 1, 1], hands[1], undefined]);
    assert.equal(viewOf({ ...t, hands }, -1).hand, null, 'izleyen kart görmez');
  });

  test('XOX: sıra, kazanan ve beraberlik; masadan kalkan kaybeder', () => {
    let t = startTable({ ...openTable('xox', 'a'), seats: ['a', 'b'], misses: [0, 0] }, seq(0));
    for (const [seat, cell] of [[0, 0], [1, 4], [0, 1], [1, 5]]) t = moveTable(t, seat, { cell }, names, seq(0)).table;
    assert.equal(moveTable(t, 1, { cell: 8 }, names, seq(0)).reason, 'Sıra sende değil.');
    assert.equal(moveTable(t, 0, { cell: 4 }, names, seq(0)).reason, 'Bu kare dolu.');
    const won = moveTable(t, 0, { cell: 2 }, names, seq(0)).table;
    assert.deepEqual([won.status, won.winner, won.log], ['over', 0, '🏆 A kazandı!']);
    const gone = leaveTable(t, 0, names);
    assert.deepEqual([gone.status, gone.seats, gone.winner], ['over', ['b'], 0]);
  });

  test('üç kişilik elde biri kalkınca sıra doğru kişide kalır', () => {
    const t = startTable({ ...openTable('ludo', 'a'), seats: ['a', 'b', 'c'], misses: [0, 0, 0] }, seq(0));
    assert.deepEqual([leaveTable({ ...t, turn: 2 }, 0, names).turn, leaveTable({ ...t, turn: 1 }, 1, names).turn, leaveTable({ ...t, turn: 2 }, 2, names).turn], [1, 1, 0]);
  });

  test('süresi dolan sıra: Renk Kartları’nda masa oynar ve üçüncüde koltuk gider, XOX’ta süresi dolan kaybeder', () => {
    const t = { ...openTable('cards', 'a'), seats: ['a', 'b', 'c'], misses: [0, 0, 0], status: 'playing', turn: 0, top: { color: 1, value: 4 } };
    const hands = [[{ color: 3, value: 9 }, { color: 1, value: 7 }], [{ color: 0, value: 1 }], [{ color: 2, value: 5 }]];
    // The first card that fits is played for the seat, and the turn is counted against it.
    let r = timeoutTable({ ...t, hands }, names, seq(0));
    assert.deepEqual([r.hands[0], r.top, r.turn, r.misses, r.log], [[{ color: 3, value: 9 }], { color: 1, value: 7 }, 1, [1, 0, 0], 'A kart attı · SON KART!']);
    // Nothing fits: a card is drawn.
    r = timeoutTable({ ...t, hands, turn: 1, misses: [0, 1, 0] }, names, seq(2));
    assert.deepEqual([r.hands[1].length, r.turn, r.misses, r.log], [2, 2, [0, 2, 0], 'B kart çekti']);
    // A move of one's own clears the count; the third run-out turn in a row takes the seat away.
    assert.deepEqual(moveTable({ ...t, hands, misses: [2, 0, 0] }, 0, { card: 1 }, names, seq(0)).table.misses, [0, 0, 0]);
    r = timeoutTable({ ...t, hands, misses: [MISSES - 1, 0, 0] }, names, seq(0));
    assert.deepEqual([r.seats, r.hands.length, r.turn, r.status, r.log], [['b', 'c'], 2, 0, 'playing', 'A masadan kalktı.']);
    // A finished hand: the seat goes with its cards, so the others still see their own.
    const over = leaveTable({ ...t, hands, status: 'over', winner: 2 }, 0, names);
    assert.deepEqual([over.seats, over.winner, viewOf(over, 0).hand, viewOf(over, 0).counts], [['b', 'c'], 1, hands[1], [1, 1]]);

    const x = startTable({ ...openTable('xox', 'a'), seats: ['a', 'b'], misses: [0, 0] }, seq(0));
    r = timeoutTable({ ...x, turn: 1 }, names, seq(0));
    assert.deepEqual([r.status, r.winner, r.seats, r.misses, r.log], ['over', 0, ['a', 'b'], [0, 0], 'B için süre doldu · 🏆 A kazandı!']);
  });
});

describe('Oda oyunları sunucuda', () => {
  let owner;
  let a;
  let b;
  let c;
  let room;
  test('masayı yalnız oda yönetimi açar; XOX ikinci oyuncu oturunca başlar; odaya haber gider', async () => {
    owner = await signUp('Oda Sahibi');
    a = await signUp('Ayşe');
    b = await signUp('Bora');
    c = await signUp('Cem');
    const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session);
    assert.equal(st, 200, j.error);
    room = j.room.id;
    assert.equal((await ok(table(a.session, room))), null);
    const [st1, why] = await act(a.session, room, 'open', { game: 'xox' });
    assert.equal(st1, 403);
    assert.match(why.error, /oda sahibi/);
    assert.equal((await act(owner.session, room, 'open', { game: 'satranç' }))[0], 400);
    let from = lkCalls.length;
    let t = await ok(act(owner.session, room, 'open', { game: 'xox' }));
    assert.deepEqual([t.game, t.status, t.mySeat, t.seats.map((x) => x.name)], ['xox', 'waiting', 0, ['Oda Sahibi']]);
    assert.ok(await until(() => tablePackets(from).length === 1));
    assert.equal(lkCalls.at(-1).body.room, `oda-${room}`);
    assert.equal((await act(owner.session, room, 'open', { game: 'ludo' }))[0], 409, 'odada açık masa var');
    t = await ok(act(a.session, room, 'join'));
    assert.deepEqual([t.status, t.mySeat, t.turn], ['playing', 1, 0]);
    assert.ok(t.turnEndsAt);
    assert.equal((await act(b.session, room, 'join'))[0], 409, 'oyun başladı');
    assert.equal((await act(a.session, room, 'move', { move: { cell: 4 } }))[1].error, 'Sıra sende değil.');
    from = lkCalls.length;
    for (const [s, cell] of [[owner, 0], [a, 3], [owner, 1], [a, 4]]) await ok(act(s.session, room, 'move', { move: { cell } }));
    t = await ok(act(owner.session, room, 'move', { move: { cell: 2 } }));
    assert.deepEqual([t.status, t.winner, t.board.slice(0, 3)], ['over', 0, ['X', 'X', 'X']]);
    assert.ok(await until(() => tablePackets(from).length === 5));
    // Another hand with the same two.
    t = await ok(act(a.session, room, 'again'));
    assert.deepEqual([t.status, t.board.every((x) => x === null)], ['playing', true]);
    // Time runs out on X: X loses.
    await h.sql.query("UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1", [room, TURN_MS / 1000 + 1]);
    t = await ok(table(b.session, room));
    assert.deepEqual([t.status, t.winner, t.mySeat], ['over', 1, -1]);
    assert.match(t.log, /süre doldu/);
    assert.equal((await act(b.session, room, 'close'))[0], 403);
    assert.equal(await ok(act(owner.session, room, 'close')), null);
  });

  test('Renk Kartları: kartlar yalnız sahibine; engelli kişi masaya oturamaz; yasaklı oynayamaz', async () => {
    await ok(act(owner.session, room, 'open', { game: 'cards' }));
    await ok(act(a.session, room, 'join'));
    // Blocks both ways: Bora blocked by Ayşe, Cem blocks the owner.
    assert.equal((await call('POST', '/api/block', { to: b.user.id }, a.session))[0], 200);
    assert.equal((await act(b.session, room, 'join'))[0], 403);
    assert.equal((await call('POST', '/api/block', { to: owner.user.id }, c.session))[0], 200);
    assert.equal((await act(c.session, room, 'join'))[0], 403);
    assert.equal((await act(a.session, room, 'start'))[0], 409, 'masayı açan başlatır');
    let t = await ok(act(owner.session, room, 'start'));
    assert.equal(t.status, 'playing');
    assert.equal(t.hand.length, 5);
    assert.deepEqual(t.counts, [5, 5]);
    assert.equal(t.hands, undefined);
    const seen = await ok(table(b.session, room));
    assert.deepEqual([seen.hand, seen.hands, seen.counts], [null, undefined, [5, 5]]);
    const before = t.counts[0];
    t = await ok(act(owner.session, room, 'move', { move: { card: null } }));
    assert.deepEqual([t.counts[0], t.turn], [before + 1, 1]);
    // A ban from the room: no table for them.
    assert.equal((await call('POST', '/api/rooms/ban', { room, user: b.user.id, minutes: 10 }, owner.session))[0], 200);
    assert.equal((await table(b.session, room))[0], 403);
    // Ayşe leaves: the owner, alone, wins.
    t = await ok(act(a.session, room, 'leave'));
    assert.deepEqual([t.status, t.winner, t.seats.length, t.mySeat], ['over', 0, 1, -1]);
    await call('POST', '/api/block', { to: b.user.id, block: false }, a.session);
    await call('POST', '/api/block', { to: owner.user.id, block: false }, c.session);
  });

  test('Ludo: süre dolunca masa zarı atar; üç kez üst üste olunca koltuk gider', async () => {
    await ok(act(owner.session, room, 'open', { game: 'ludo' }));
    await ok(act(a.session, room, 'join'));
    await ok(act(c.session, room, 'join'));
    let t = await ok(act(owner.session, room, 'start'));
    assert.deepEqual([t.status, t.mode, t.tokens, t.colors, t.phase, t.seats.length], ['playing', 'quick', [[-1, -1], [-1, -1], [-1, -1]], [0, 1, 2], 'roll', 3]);
    t = await ok(act(owner.session, room, 'move', { move: { roll: true } }));
    assert.ok(t.die >= 1 && t.die <= 6);
    // With every token in base only a 6 moves one (out, at once) and throws again.
    assert.deepEqual([t.turn, t.tokens[0]], t.die === 6 ? [0, [0, -1]] : [1, [-1, -1]]);
    // Nobody plays for a long while: the table throws for each seat in turn, and after MISSES turns each seat goes.
    await h.sql.query('UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1', [room, (TURN_MS / 1000) * (MISSES * 3 + 5)]);
    t = await ok(table(owner.session, room));
    assert.ok(t.status === 'over' || t.seats.length < 3, JSON.stringify(t));
    if (t.status === 'over') assert.ok(t.winner !== null);
  });

  test('hesap silinince oturduğu ve açtığı masalar gider', async () => {
    const t = await ok(table(owner.session, room));
    if (t?.status !== 'over') await ok(act(owner.session, room, 'close'));
    await ok(act(owner.session, room, 'open', { game: 'xox' }));
    await ok(act(a.session, room, 'join'));
    assert.equal((await call('DELETE', '/api/me', null, a.session))[1].deleted, true);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM room_tables WHERE room_id = $1', [room])).rows[0].n, 0);
  });
});
