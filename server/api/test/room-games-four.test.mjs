// Dört Taş at a room's table (room-games/four.mjs behind room-games-rules.mjs). First the rules as pure functions:
// a disc comes to rest on the lowest free row, a line of four in each direction, a full board, who starts, the
// table's own choice of a column, a run-out turn, leaving. Then a table over HTTP against a real Postgres: the game
// is one the room's table may hold (migration 054), it starts when the second player sits, and the server checks
// every disc.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';
import { MISSES, TABLE_GAMES, TURN_MS, leaveTable, moveTable, openTable, startTable, timeoutTable, viewOf } from '../room-games-rules.mjs';
import { COLS, DEPTH, ROWS, cellOf, colScores, lineThrough, pickCol, restRow } from '../room-games/four.mjs';

const names = ['A', 'B'];
const none = () => assert.fail('Dört Taş’ta çekiliş yok');
/** A small seeded generator (mulberry32): the same games every run. */
const seeded = (seed) => {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
};
const fresh = (more = {}) => ({ ...startTable({ ...openTable('four', 'p0'), seats: ['p0', 'p1'], misses: [0, 0] }, none), ...more });
const drop = (t, col) => {
  const r = moveTable(t, t.turn, { col }, names, none);
  assert.ok(r.ok, r.reason);
  return r.table;
};
/** The table after these columns, played in turn from a new hand. */
const after_ = (cols, t = fresh()) => cols.reduce(drop, t);
/** A board drawn top row first: '0' and '1' are the two colours, '.' is empty. */
const board = (...rows) => {
  assert.equal(rows.length, ROWS);
  const b = Array(COLS * ROWS).fill(null);
  rows.forEach((line, i) => [...line].forEach((ch, col) => ch !== '.' && (b[cellOf(col, ROWS - 1 - i)] = Number(ch))));
  return b;
};

describe('Dört Taş’ın kuralları', () => {
  test('el başlar: 7 sütun, 6 sıra, boş tahta; ilk taşı eller sırayla atar', () => {
    const t = fresh();
    assert.deepEqual([COLS, ROWS, TABLE_GAMES.four], [7, 6, { name: 'Dört Taş', min: 2, max: 2, autoStart: true }]);
    assert.deepEqual([t.status, t.turn, t.colors, t.wins, t.hand, t.line, t.n, t.last, t.board.length, t.board.every((x) => x === null)], ['playing', 0, [0, 1], [0, 0], 1, null, 0, null, 42, true]);
    const second = startTable({ ...t, status: 'over', winner: 0, wins: [1, 0] }, none);
    assert.deepEqual([second.hand, second.turn, second.wins, second.winner], [2, 1, [1, 0], null], 'ikinci eli ikinci koltuk başlatır');
    assert.equal(startTable(second, none).turn, 0);
    assert.deepEqual(viewOf(t, 1), t, 'gizlenecek bir şey yok');
  });

  test('taş sütunun en alttaki boş sırasına düşer; dolu sütun ve geçersiz sütun reddedilir', () => {
    let t = drop(fresh(), 3);
    assert.deepEqual([t.board[cellOf(3, 0)], t.turn, t.n, t.last, t.log], [0, 1, 1, { n: 1, color: 0, col: 3, row: 0 }, 'A 4. sütuna bıraktı']);
    t = drop(t, 3);
    assert.deepEqual([t.board[cellOf(3, 1)], t.turn, t.last], [1, 0, { n: 2, color: 1, col: 3, row: 1 }]);
    t = after_([3, 3, 3, 3], t);
    assert.deepEqual([restRow(t.board, 3), restRow(t.board, 0), t.n], [-1, 0, 6]);
    assert.equal(moveTable(t, 0, { col: 3 }, names, none).reason, 'Bu sütun dolu.');
    for (const m of [{ col: 7 }, { col: -1 }, { col: '2' }, { col: 1.5 }, {}, null]) assert.equal(moveTable(t, 0, m, names, none).reason, 'Bir sütun seç.', JSON.stringify(m));
    assert.equal(moveTable(t, 1, { col: 0 }, names, none).reason, 'Sıra sende değil.');
  });

  test('dört taş yan yana, üst üste ya da çapraz dizilince el biter; kazanan çizgi ve skor yazılır', () => {
    // Across the bottom row.
    let t = after_([0, 0, 1, 1, 2, 2, 3]);
    assert.deepEqual([t.status, t.winner, t.line, t.wins, t.log], ['over', 0, [0, 1, 2, 3], [1, 0], '🏆 A dört taşı dizdi!']);
    assert.equal(moveTable(t, 1, { col: 4 }, names, none).reason, 'Oyun başlamadı.');
    // Up a column, by the second seat.
    t = after_([0, 1, 0, 1, 2, 1, 2, 1]);
    assert.deepEqual([t.status, t.winner, t.line, t.wins], ['over', 1, [1, 8, 15, 22], [0, 1]]);
    // Both diagonals.
    t = after_([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    assert.deepEqual([t.winner, t.line], [0, [cellOf(0, 0), cellOf(1, 1), cellOf(2, 2), cellOf(3, 3)]]);
    t = after_([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
    assert.deepEqual([t.winner, t.line], [0, [cellOf(6, 0), cellOf(5, 1), cellOf(4, 2), cellOf(3, 3)].sort((a, b) => a - b)]);
    // A disc that completes two lines at once, and one of five: every cell of them.
    const b = board('.......', '.......', '.......', '0......', '0......', '0.0000.');
    assert.deepEqual(lineThrough(b, cellOf(2, 0)), [2, 3, 4, 5]);
    const cross = board('.......', '.......', '.......', '...0...', '...0...', '000.000');
    cross[cellOf(3, 0)] = 0;
    cross[cellOf(3, 3)] = 0;
    assert.deepEqual(lineThrough(cross, cellOf(3, 0)), [0, 1, 2, 3, 4, 5, 6, 10, 17, 24]);
    assert.deepEqual([lineThrough(b, cellOf(0, 1)), lineThrough(b, cellOf(1, 0))], [null, null]);
  });

  test('tahta dolup çizgi çıkmazsa berabere; kimsenin skoru artmaz', () => {
    const full = board('010101.', '0101010', '1010101', '1010101', '0101010', '0101010');
    const t = fresh({ board: full, turn: 1, n: 41, wins: [2, 1] });
    const r = drop(t, 6);
    assert.deepEqual([r.status, r.winner, r.line, r.wins, r.log], ['over', null, null, [2, 1], 'Berabere: tahta doldu.']);
  });

  test('masanın seçtiği sütun: kazanır, rakibin dördünü keser, rakibe dördü vermez, yoksa ortayı tutar', () => {
    assert.equal(DEPTH, 4);
    assert.equal(pickCol(fresh(), 0), 3, 'boş tahtada orta sütun');
    // Three in a row with both ends open: it takes the line.
    let t = fresh({ board: board('.......', '.......', '.......', '.......', '.11....', '.000...'), turn: 0 });
    assert.ok([0, 4].includes(pickCol(t, 0)));
    assert.equal(drop(t, pickCol(t, 0)).status, 'over');
    // The opponent's three up a column are stopped.
    t = fresh({ board: board('.......', '.......', '.......', '1......', '1.0....', '1.0....'), turn: 0 });
    assert.equal(pickCol(t, 0), 0);
    // Winning comes before stopping.
    t = fresh({ board: board('.......', '.......', '.......', '1.0....', '1.0....', '1.0....'), turn: 0 });
    assert.equal(pickCol(t, 0), 2);
    // A disc in column 3 would let the opponent finish the row above on it: anywhere else.
    t = fresh({ board: board('.......', '.......', '.......', '.......', '111.0..', '010.0..'), turn: 0 });
    assert.notEqual(pickCol(t, 0), 3);
    assert.equal(colScores(t, 0)[3] < 0, true);
    // A full column is never named, and a shallower look still sees a line of its own.
    t = after_([3, 3, 3, 3, 3, 3]);
    assert.equal(colScores(t, 0)[3], null);
    assert.notEqual(pickCol(t, 0), 3);
    t = fresh({ board: board('.......', '.......', '.......', '.......', '.11....', '.000...'), turn: 0 });
    assert.ok([0, 4].includes(pickCol(t, 0, 1)));
    // The table names the same column every time.
    assert.equal(pickCol(after_([3, 2, 4]), 1), pickCol(after_([3, 2, 4]), 1));
  });

  test('süresi dolan sırada masa taşı bırakır; üçüncüde koltuk gider ve el kalana yazılır', () => {
    let t = timeoutTable(fresh(), names, none);
    assert.deepEqual([t.board[cellOf(3, 0)], t.turn, t.misses, t.n], [0, 1, [1, 0], 1]);
    t = timeoutTable(t, names, none);
    assert.deepEqual([t.turn, t.misses, t.n], [0, [1, 1], 2]);
    // A disc of one's own clears the count.
    assert.deepEqual(drop(fresh({ misses: [2, 1] }), 0).misses, [0, 1]);
    // The table finishes a line it finds.
    t = timeoutTable(fresh({ board: board('.......', '.......', '.......', '.......', '.11....', '.000...'), turn: 0 }), names, none);
    assert.deepEqual([t.status, t.winner, t.wins, t.misses], ['over', 0, [1, 0], [1, 0]]);
    t = timeoutTable(fresh({ misses: [MISSES - 1, 0], wins: [0, 2] }), names, none);
    assert.deepEqual([t.status, t.winner, t.seats, t.colors, t.wins, t.log], ['over', 0, ['p1'], [1], [3], 'A masadan kalktı · 🏆 B kazandı!']);
  });

  test('masadan kalkan eli kaybeder; taşların rengi ve skor koltukla kalır', () => {
    const t = after_([3, 2]);
    let r = leaveTable({ ...t, wins: [1, 4] }, 1, names);
    assert.deepEqual([r.status, r.winner, r.seats, r.colors, r.wins, r.board, r.log], ['over', 0, ['p0'], [0], [2], t.board, 'B masadan kalktı · 🏆 A kazandı!']);
    // After a hand the seat just goes; whoever sits down next starts from none, and the colours are dealt again.
    const over = after_([0, 0, 1, 1, 2, 2, 3]);
    r = leaveTable(over, 0, names);
    assert.deepEqual([r.seats, r.colors, r.wins, r.winner, r.status], [['p1'], [1], [0], null, 'over']);
    const next = startTable({ ...r, seats: ['p1', 'p2'], misses: [0, 0] }, none);
    assert.deepEqual([next.colors, next.wins, next.hand, next.turn], [[0, 1], [0, 0], 2, 1]);
    assert.equal(leaveTable(openTable('four', 'a'), 0, names).seats.length, 0);
  });

  test('rastgele oynanan yüzlerce el ya bir çizgiyle ya dolu tahtayla biter; tahta hiç bozulmaz', () => {
    const seen = { wins: 0, draws: 0, across: 0, up: 0, diagonal: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const r = seeded(seed);
      let t = fresh();
      for (let discs = 0; t.status === 'playing'; discs++) {
        assert.ok(discs < 42, `el bitmiyor (${seed})`);
        const before = t;
        const seat = t.turn;
        const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => restRow(t.board, c) >= 0);
        // Every fourth game one side is played by the table's own choice (a shallow look keeps the test quick).
        const col = seed % 4 === 0 && seat === 0 ? pickCol(t, seat, 2) : open[r(open.length)];
        t = drop(t, col);
        const { color, row } = t.last;
        assert.deepEqual([t.n, t.last.n, t.last.col, color], [before.n + 1, before.n + 1, col, before.colors[seat]]);
        assert.equal(row, restRow(before.board, col), 'en alttaki boş sıra');
        assert.equal(t.board.filter((x) => x !== null).length, t.n);
        assert.deepEqual(t.board.map((x, i) => (i === cellOf(col, row) ? null : x)), before.board, 'yalnız bir taş eklenir');
        for (let c = 0; c < COLS; c++) for (let rw = 1; rw < ROWS; rw++) assert.ok(t.board[cellOf(c, rw)] === null || t.board[cellOf(c, rw - 1)] !== null, 'havada taş yok');
        if (t.status === 'playing') assert.deepEqual([t.turn, t.line, lineThrough(t.board, cellOf(col, row))], [1 - seat, null, null]);
      }
      if (t.winner === null) {
        seen.draws++;
        assert.ok(t.board.every((x) => x !== null) && t.line === null);
        continue;
      }
      seen.wins++;
      assert.ok(t.line.length >= 4 && t.line.every((cell) => t.board[cell] === t.colors[t.winner]));
      assert.deepEqual(t.wins, t.winner === 0 ? [1, 0] : [0, 1]);
      const [a, b2] = t.line;
      if (b2 - a === 1) seen.across++;
      else if (b2 - a === COLS) seen.up++;
      else seen.diagonal++;
    }
    for (const [k, v] of Object.entries(seen)) assert.ok(v > (k === 'draws' ? -1 : 20), `${k}: ${v}`);
  });
});

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

describe('Dört Taş masası sunucuda', () => {
  let owner;
  let a;
  let b;
  let room;
  const stored = async () => (await h.sql.query('SELECT game, state FROM room_tables WHERE room_id = $1', [room])).rows[0];

  test('masa açılır (oyun listede), ikinci oyuncu oturunca el başlar; taşları sunucu denetler ve çizgiyi o bulur', async () => {
    owner = await signUp('Oda Sahibi');
    a = await signUp('Ayşe');
    b = await signUp('Bora');
    const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session);
    assert.equal(st, 200, j.error);
    room = j.room.id;
    let t = await ok(act(owner.session, room, 'open', { game: 'four' }));
    assert.deepEqual([t.game, t.name, t.min, t.max, t.status, t.mySeat], ['four', 'Dört Taş', 2, 2, 'waiting', 0]);
    assert.equal((await stored()).game, 'four');
    t = await ok(act(a.session, room, 'join'));
    assert.deepEqual([t.status, t.mySeat, t.turn, t.colors, t.wins, t.hand, t.board.length, t.turnEndsAt !== null], ['playing', 1, 0, [0, 1], [0, 0], 1, 42, true]);
    assert.equal((await act(b.session, room, 'join'))[0], 409, 'oyun başladı');
    assert.equal((await act(a.session, room, 'move', { move: { col: 3 } }))[1].error, 'Sıra sende değil.');
    assert.equal((await act(b.session, room, 'move', { move: { col: 3 } }))[1].error, 'Bu masada oturmuyorsun');
    assert.deepEqual(await act(owner.session, room, 'move', { move: { col: 9 } }), [409, { error: 'Bir sütun seç.' }]);
    for (const [s, col] of [[owner, 0], [a, 0], [owner, 1], [a, 1], [owner, 2], [a, 2]]) t = await ok(act(s.session, room, 'move', { move: { col } }));
    assert.deepEqual([t.n, t.last, t.turn], [6, { n: 6, color: 1, col: 2, row: 1 }, 0]);
    // Someone watching reads the same board.
    const seen = await ok(table(b.session, room));
    assert.deepEqual([seen.mySeat, seen.board, seen.last], [-1, t.board, t.last]);
    t = await ok(act(owner.session, room, 'move', { move: { col: 3 } }));
    assert.deepEqual([t.status, t.winner, t.line, t.wins, t.turnEndsAt, t.log], ['over', 0, [0, 1, 2, 3], [1, 0], null, '🏆 Oda Sahibi dört taşı dizdi!']);
    assert.equal((await act(a.session, room, 'move', { move: { col: 4 } }))[1].error, 'Oyun başlamadı.');
  });

  test('yeniden oynanınca tahta boşalır, skor kalır ve ilk taş öbür oyuncuya geçer; süre dolunca masa oynar', async () => {
    let t = await ok(act(a.session, room, 'again'));
    assert.deepEqual([t.status, t.hand, t.turn, t.wins, t.n, t.line, t.board.every((x) => x === null)], ['playing', 2, 1, [1, 0], 0, null, true]);
    await h.sql.query('UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1', [room, TURN_MS / 1000 + 1]);
    t = await ok(table(b.session, room));
    assert.deepEqual([t.n, t.last, t.turn], [1, { n: 1, color: 1, col: 3, row: 0 }, 0], 'masa orta sütuna bıraktı');
    assert.deepEqual((await stored()).state.misses, [0, 1]);
    // Ayşe never plays again: her seat goes and the hand is the owner's.
    await h.sql.query("UPDATE room_tables SET state = state || '{\"turn\": 1}'::jsonb || jsonb_build_object('misses', jsonb_build_array(0, $2::int)), turn_at = now() - make_interval(secs => $3) WHERE room_id = $1", [room, MISSES - 1, TURN_MS / 1000 + 1]);
    t = await ok(table(owner.session, room));
    assert.deepEqual([t.status, t.winner, t.seats.map((x) => x.name), t.colors, t.wins], ['over', 0, ['Oda Sahibi'], [0], [2]]);
    assert.match(t.log, /Ayşe masadan kalktı · 🏆 Oda Sahibi kazandı!/);
    assert.equal(await ok(act(owner.session, room, 'close')), null);
  });
});
