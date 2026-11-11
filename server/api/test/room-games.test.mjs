// Oda oyunları at a table in a room (room-games.mjs, room-games-rules.mjs) against a real Postgres: what every game
// shares and XOX's rules, only room staff open a table, seats and turns checked here, cards only to their owner, a
// run-out turn played by the table, blocks both ways, a ban, leaving, the room told after every change, and account
// deletion. Each other game's own rules and a whole table of it are in room-games-ludo.test.mjs,
// room-games-cards.test.mjs and room-games-four.test.mjs.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';
import { MISSES, TABLE_GAMES, TURN_MS, leaveTable, moveTable, openTable, startTable, timeoutTable } from '../room-games-rules.mjs';

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
  test('dört oyun da tek kapıdan oynanır: adı, oyuncu sayısı, masayı açanın seçimi', () => {
    assert.deepEqual(Object.keys(TABLE_GAMES), ['ludo', 'cards', 'xox', 'four']);
    assert.deepEqual([TABLE_GAMES.ludo, TABLE_GAMES.cards], [{ name: 'Ludo', min: 2, max: 4 }, { name: 'Renk Kartları', min: 2, max: 6 }]);
    assert.deepEqual([TABLE_GAMES.xox.name, TABLE_GAMES.xox.min, TABLE_GAMES.xox.max], ['XOX', 2, 2]);
    assert.deepEqual(openTable('xox', 'a', { mode: 'classic' }), { game: 'xox', seats: ['a'], status: 'waiting', turn: 0, winner: null, log: 'Oyuncular bekleniyor.', misses: [0] }, 'seçimi olmayan oyun seçim taşımaz');
    assert.equal(openTable('ludo', 'a', { mode: 'classic' }).mode, 'classic');
    assert.equal(moveTable(openTable('cards', 'a'), 0, { draw: true }, names, seq(0)).reason, 'Oyun başlamadı.');
  });

  test('XOX: sıra, kazanan ve beraberlik; masadan kalkan kaybeder; işaretler ve kazanılan eller koltukla kalır', () => {
    let t = startTable({ ...openTable('xox', 'a'), seats: ['a', 'b'], misses: [0, 0] }, seq(0));
    assert.deepEqual([t.board, t.marks, t.wins, t.turn, t.log], [Array(9).fill(null), ['X', 'O'], [0, 0], 0, 'Sıra X’te.']);
    for (const [seat, cell] of [[0, 0], [1, 4], [0, 1], [1, 5]]) t = moveTable(t, seat, { cell }, names, seq(0)).table;
    assert.equal(moveTable(t, 1, { cell: 8 }, names, seq(0)).reason, 'Sıra sende değil.');
    assert.equal(moveTable(t, 0, { cell: 4 }, names, seq(0)).reason, 'Bu kare dolu.');
    const won = moveTable(t, 0, { cell: 2 }, names, seq(0)).table;
    assert.deepEqual([won.status, won.winner, won.wins, won.log], ['over', 0, [1, 0], '🏆 A kazandı!']);
    // The next hand keeps the count; a draw adds to nobody's.
    let next = startTable(won, seq(0));
    assert.deepEqual([next.wins, next.board.every((x) => x === null), next.turn], [[1, 0], true, 0]);
    for (const [seat, cell] of [[0, 0], [1, 1], [0, 2], [1, 4], [0, 3], [1, 5], [0, 7], [1, 6], [0, 8]]) next = moveTable(next, seat, { cell }, names, seq(0)).table;
    assert.deepEqual([next.status, next.winner, next.wins, next.log], ['over', null, [1, 0], 'Berabere']);
    // Leaving mid-hand gives the hand to the one left, who keeps the mark played with.
    const gone = leaveTable({ ...t, wins: [2, 1] }, 0, names);
    assert.deepEqual([gone.status, gone.seats, gone.winner, gone.marks, gone.wins], ['over', ['b'], 0, ['O'], [2]]);
    // After a hand the seat just goes, with its mark and its count; whoever sits down next starts from none.
    const after = leaveTable(won, 0, names);
    assert.deepEqual([after.seats, after.marks, after.wins, after.winner], [['b'], ['O'], [0], null]);
    assert.deepEqual(startTable({ ...after, seats: ['b', 'c'], misses: [0, 0] }, seq(0)).wins, [0, 0]);
    // A table kept from before the counts: it plays on.
    const { marks: _m, wins: _w, ...old } = t;
    assert.deepEqual(moveTable(old, 0, { cell: 2 }, names, seq(0)).table.wins, [1, 0]);
    assert.deepEqual(leaveTable(old, 1, names).wins, [1]);
  });

  test('üç kişilik elde biri kalkınca sıra doğru kişide kalır', () => {
    const t = startTable({ ...openTable('ludo', 'a'), seats: ['a', 'b', 'c'], misses: [0, 0, 0] }, seq(0));
    assert.deepEqual([leaveTable({ ...t, turn: 2 }, 0, names).turn, leaveTable({ ...t, turn: 1 }, 1, names).turn, leaveTable({ ...t, turn: 2 }, 2, names).turn], [1, 1, 0]);
  });

  test('süresi dolan sıra: XOX’ta kimse onun yerine oynamaz, süresi dolan kaybeder', () => {
    const x = startTable({ ...openTable('xox', 'a'), seats: ['a', 'b'], misses: [0, 0] }, seq(0));
    const r = timeoutTable({ ...x, turn: 1 }, names, seq(0));
    assert.deepEqual([r.status, r.winner, r.seats, r.misses, r.wins, r.log], ['over', 0, ['a', 'b'], [0, 0], [1, 0], 'B için süre doldu · 🏆 A kazandı!']);
    assert.equal(MISSES, 3);
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
    assert.deepEqual([t.status, t.winner, t.board.slice(0, 3), t.marks, t.wins], ['over', 0, ['X', 'X', 'X'], ['X', 'O'], [1, 0]]);
    assert.ok(await until(() => tablePackets(from).length === 5));
    // Another hand with the same two.
    t = await ok(act(a.session, room, 'again'));
    assert.deepEqual([t.status, t.board.every((x) => x === null), t.wins], ['playing', true, [1, 0]]);
    // Time runs out on X: X loses.
    await h.sql.query("UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1", [room, TURN_MS / 1000 + 1]);
    t = await ok(table(b.session, room));
    assert.deepEqual([t.status, t.winner, t.mySeat, t.wins], ['over', 1, -1, [1, 1]]);
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
    assert.equal(t.mine.length, 7);
    assert.deepEqual(t.counts, [7, 7]);
    assert.equal(t.hands, undefined);
    const seen = await ok(table(b.session, room));
    assert.deepEqual([seen.mine, seen.hands, seen.counts], [null, undefined, [7, 7]]);
    t = await ok(act(owner.session, room, 'move', { move: { draw: true } }));
    // A drawn card that fits may still be played: the turn waits for it. Any other passes the turn.
    assert.deepEqual([t.counts[0], t.turn], [8, t.drawn === null ? 1 : 0]);
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
