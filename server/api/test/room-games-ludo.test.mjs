// Ludo at a room's table (room-games/ludo.mjs behind room-games-rules.mjs). First the rules as pure functions with
// the dice given: leaving base, the choice of a token, sixes, captures and the squares where there are none, the
// exact throw home, winning, a run-out turn, leaving. Then a table over HTTP against a real Postgres: the opener's
// mode, the turn's two steps checked by the server, a hand played to its end, the table's own play and a table
// kept from the older Ludo.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';
import { MISSES, TURN_MS, leaveTable, moveTable, openTable, staleTable, startTable, tableOptions, timeoutTable } from '../room-games-rules.mjs';
import { BASE, HOME, LAST, LOOP, MODES, SAFE, legalTokens, pickToken, seatColors, squareOf } from '../room-games/ludo.mjs';

const names = ['A', 'B', 'C', 'D'];
/** The dice to come, in order: dice(6, 2) throws a 6, then a 2. A throw nobody expected fails the test. */
const dice = (...xs) => {
  let i = 0;
  return (n) => {
    assert.equal(n, 6, 'zar altı yüzlü');
    assert.ok(i < xs.length, 'beklenmeyen zar');
    return xs[i++] - 1;
  };
};
/** A hand just started with `n` players; `more` puts the table in the state a test needs. */
const hand = (n, more = {}, mode = 'quick') => ({ ...startTable({ ...openTable('ludo', 'p0', { mode }), seats: Array.from({ length: n }, (_, i) => `p${i}`), misses: Array(n).fill(0) }, dice()), ...more });
const roll = (t, die) => {
  const r = moveTable(t, t.turn, { roll: true }, names, dice(die));
  assert.ok(r.ok, r.reason);
  return r.table;
};
const pick = (t, token) => {
  const r = moveTable(t, t.turn, { token }, names, dice());
  assert.ok(r.ok, r.reason);
  return r.table;
};
/** The step at which a token of `color` stands on loop square `square`. */
const stepOn = (color, square) => (square - color * 13 + LOOP) % LOOP;

describe('Ludo’nun kuralları', () => {
  test('el başlar: Hızlı’da iki, Klasik’te dört taş; iki oyuncu karşılıklı renklerde oturur', () => {
    const t = hand(2);
    assert.deepEqual(
      [t.status, t.turn, t.mode, t.hand, t.colors, t.tokens, t.phase, t.die, t.sixes, t.movable, t.n, t.last],
      ['playing', 0, 'quick', 1, [0, 2], [[BASE, BASE], [BASE, BASE]], 'roll', null, 0, [], 0, null],
    );
    assert.deepEqual([hand(3).colors, hand(4).colors], [[0, 1, 2], [0, 1, 2, 3]]);
    const classic = hand(4, {}, 'classic');
    assert.deepEqual([classic.mode, classic.tokens.map((x) => x.length)], ['classic', [4, 4, 4, 4]]);
    assert.equal(startTable({ ...t, status: 'over', winner: 1 }, dice()).hand, 2, 'yeniden oynanan el sayılır');
    assert.deepEqual([MODES.quick, MODES.classic, seatColors(2)], [2, 4, [0, 2]]);
    // The opener's choice.
    assert.deepEqual([tableOptions('ludo', { mode: 'classic' }), tableOptions('ludo', undefined), tableOptions('ludo', {})], [{ mode: 'classic' }, { mode: 'quick' }, { mode: 'quick' }]);
    assert.deepEqual([tableOptions('ludo', { mode: 'dev' }), tableOptions('ludo', { mode: 4 }), tableOptions('ludo', { mode: 'constructor' })], [null, null, null]);
    assert.equal(openTable('ludo', 'a').mode, 'quick');
  });

  test('tahta: 52 karelik tur, renk başına 13 kare arayla çıkış, sekiz güvenli kare, sonra ev yolu', () => {
    assert.deepEqual([0, 1, 2, 3].map((c) => squareOf(c, 0)), [0, 13, 26, 39]);
    assert.deepEqual(SAFE, [0, 8, 13, 21, 26, 34, 39, 47]);
    assert.deepEqual([squareOf(0, LAST), squareOf(1, LAST), squareOf(3, 13), squareOf(3, 12)], [50, 11, 0, 51]);
    assert.deepEqual([squareOf(2, BASE), squareOf(2, LAST + 1), squareOf(2, HOME)], [null, null, null], 'yuvada, ev yolunda ve evde tur karesi yok');
    assert.equal(HOME - LAST, 6, 'turdan sonra beş kare ve ev');
  });

  test('yalnız 6 taşı yola çıkarır ve tekrar attırır; taş seçilecekse sorulur; üçüncü 6 oynanmaz', () => {
    let t = roll(hand(2), 3);
    assert.deepEqual([t.turn, t.tokens, t.die, t.log], [1, [[BASE, BASE], [BASE, BASE]], 3, 'A 3 attı, oynayacak taşı yok']);
    assert.deepEqual(t.last, { n: 1, color: 0, die: 3, rolled: true, token: null, from: null, to: null, captured: [], note: 'none' });
    // Both tokens are in base: they leave alike, so the table takes one out at once.
    t = roll(t, 6);
    assert.deepEqual([t.turn, t.phase, t.sixes, t.tokens[1], t.log], [1, 'roll', 1, [0, BASE], 'B 6 attı, taşını yola çıkardı · tekrar atıyor']);
    assert.deepEqual(t.last, { n: 2, color: 2, die: 6, rolled: true, token: 0, from: BASE, to: 0, captured: [], note: null });
    // A second 6: the token on the board or the one in base.
    t = roll(t, 6);
    assert.deepEqual([t.turn, t.phase, t.movable, t.sixes, t.tokens[1], t.log], [1, 'move', [0, 1], 2, [0, BASE], 'B 6 attı, taşını seçiyor']);
    assert.deepEqual([t.last.n, t.last.rolled, t.last.token], [3, true, null]);
    assert.equal(moveTable(t, 1, { roll: true }, names, dice()).reason, 'Oynayacağın taşı seç.');
    assert.equal(moveTable(t, 1, { token: 2 }, names, dice()).reason, 'Bu taş oynanamaz.');
    assert.equal(moveTable(t, 1, { token: '1' }, names, dice()).reason, 'Bu taş oynanamaz.');
    assert.equal(moveTable(t, 0, { token: 0 }, names, dice()).reason, 'Sıra sende değil.');
    t = pick(t, 1);
    assert.deepEqual([t.turn, t.phase, t.movable, t.tokens[1], t.sixes], [1, 'roll', [], [0, 0], 2]);
    assert.deepEqual(t.last, { n: 4, color: 2, die: 6, rolled: false, token: 1, from: BASE, to: 0, captured: [], note: null });
    assert.equal(moveTable(t, 1, { token: 0 }, names, dice()).reason, 'Önce zar at.');
    assert.equal(moveTable(t, 1, {}, names, dice()).reason, 'Önce zar at.');
    // The third 6 in a row is not played.
    t = roll(t, 6);
    assert.deepEqual([t.turn, t.phase, t.sixes, t.tokens[1], t.last.note, t.log], [0, 'roll', 0, [0, 0], 'sixes', 'B üst üste üçüncü 6’yı attı, sıra geçti']);
  });

  test('tek hamle varsa masa oynar; yan yana duran taşlar arasında seçim sorulmaz', () => {
    let t = roll(hand(2, { tokens: [[5, BASE], [BASE, BASE]] }), 4);
    assert.deepEqual([t.tokens[0], t.turn, t.phase, t.log], [[9, BASE], 1, 'roll', 'A 4 attı']);
    assert.deepEqual([t.last.rolled, t.last.token, t.last.from, t.last.to, t.n], [true, 0, 5, 9, 1]);
    t = roll(hand(2, { tokens: [[7, 7], [BASE, BASE]] }), 2);
    assert.deepEqual([t.tokens[0], t.turn, t.phase], [[9, 7], 1, 'roll']);
    t = roll(hand(2, { tokens: [[5, 20], [BASE, BASE]] }), 3);
    assert.deepEqual([t.phase, t.movable, t.turn], ['move', [0, 1], 0]);
    assert.deepEqual(pick(t, 1).tokens[0], [5, 23]);
    assert.deepEqual(legalTokens(t, 0, 6), [0, 1]);
    assert.deepEqual(legalTokens(hand(2, { tokens: [[BASE, 54, HOME, 50], [BASE]] }), 0, 6), [0, 3], 'yuvadan çıkan ve tam sayıyla eve giren');
  });

  test('tek duran rakip taş kırılır ve tekrar atılır; yıldızda, çıkış karesinde ve çift duran taşta kırılmaz', () => {
    // Colour 2's token stands on loop square 14, four squares ahead of colour 0's.
    let t = roll(hand(2, { tokens: [[10, BASE], [stepOn(2, 14), BASE]] }), 4);
    assert.deepEqual([t.tokens, t.turn, t.phase, t.sixes], [[[14, BASE], [BASE, BASE]], 0, 'roll', 0]);
    assert.deepEqual(t.last.captured, [{ color: 2, token: 0, from: stepOn(2, 14) }]);
    assert.equal(t.log, 'A 4 attı ve B oyuncusunun taşını kırdı! · tekrar atıyor');
    // A star square is shared.
    t = roll(hand(2, { tokens: [[17, BASE], [stepOn(2, 21), BASE]] }), 4);
    assert.deepEqual([t.tokens, t.turn, t.last.captured], [[[21, BASE], [stepOn(2, 21), BASE]], 1, []]);
    // So is a start square, even another colour's.
    t = roll(hand(2, { tokens: [[22, BASE], [0, BASE]] }), 4);
    assert.deepEqual([t.tokens, t.turn, t.last.captured], [[[26, BASE], [0, BASE]], 1, []]);
    // Two of one colour hold their square.
    t = roll(hand(2, { tokens: [[10, BASE], [stepOn(2, 14), stepOn(2, 14)]] }), 4);
    assert.deepEqual([t.tokens, t.turn, t.last.captured], [[[14, BASE], [stepOn(2, 14), stepOn(2, 14)]], 1, []]);
    // Tokens of two colours each alone on one square both go back.
    t = roll(hand(3, { tokens: [[10, BASE], [stepOn(1, 14), stepOn(1, 30)], [stepOn(2, 14), BASE]] }), 4);
    assert.deepEqual([t.tokens, t.turn], [[[14, BASE], [BASE, stepOn(1, 30)], [BASE, BASE]], 0]);
    assert.equal(t.log, 'A 4 attı ve 2 taş kırdı! · tekrar atıyor');
    // A home column is its colour's alone: the same step number of another colour is another square.
    t = roll(hand(2, { tokens: [[50, BASE], [53, BASE]] }), 3);
    assert.deepEqual([t.tokens, t.turn, t.last.captured], [[[53, BASE], [53, BASE]], 1, []]);
    // Passing over a token takes nothing.
    t = roll(hand(2, { tokens: [[10, BASE], [stepOn(2, 12), BASE]] }), 4);
    assert.deepEqual([t.tokens[1], t.turn], [[stepOn(2, 12), BASE], 1]);
  });

  test('eve tam sayıyla girilir, eve giren tekrar atar; 6’da oynayacak taş yoksa da tekrar atılır; bütün taşları evde olan kazanır', () => {
    // 54 + 3 is past home: only the other token moves.
    let t = roll(hand(2, { tokens: [[54, 30], [BASE, BASE]] }), 3);
    assert.deepEqual([t.tokens[0], t.turn], [[54, 33], 1]);
    t = roll(hand(2, { tokens: [[54, HOME], [BASE, BASE]] }), 3);
    assert.deepEqual([t.tokens[0], t.turn, t.last.note, t.log], [[54, HOME], 1, 'none', 'A 3 attı, oynayacak taşı yok']);
    t = roll(hand(2, { tokens: [[54, HOME], [BASE, BASE]] }), 6);
    assert.deepEqual([t.tokens[0], t.turn, t.phase, t.sixes, t.last.note, t.log], [[54, HOME], 0, 'roll', 1, 'none', 'A 6 attı, oynayacak taşı yok · tekrar atıyor']);
    t = pick(roll(hand(2, { tokens: [[54, 30], [BASE, BASE]] }), 2), 0);
    assert.deepEqual([t.tokens[0], t.turn, t.status, t.log], [[HOME, 30], 0, 'playing', 'A 2 attı, taşı bitişe ulaştı · tekrar atıyor']);
    t = roll(hand(2, { tokens: [[54, HOME], [20, BASE]] }), 2);
    assert.deepEqual([t.tokens[0], t.status, t.winner, t.turn, t.log], [[HOME, HOME], 'over', 0, 0, '🏆 A kazandı!']);
    assert.deepEqual(t.last, { n: 1, color: 0, die: 2, rolled: true, token: 0, from: 54, to: HOME, captured: [], note: null });
    assert.equal(moveTable(t, 0, { roll: true }, names, dice()).reason, 'Oyun başlamadı.');
  });

  test('süresi dolan sırada masa zarı atar, seçim varsa taşı da oynar; üçüncüde koltuk gider', () => {
    // A choice between a step forward and leaving base: one event, the turn counted against the seat.
    let t = timeoutTable(hand(2, { tokens: [[5, BASE], [BASE, BASE]] }), names, dice(6));
    assert.deepEqual([t.tokens[0], t.turn, t.phase, t.misses, t.n], [[5, 0], 0, 'roll', [1, 0], 1]);
    assert.deepEqual(t.last, { n: 1, color: 0, die: 6, rolled: true, token: 1, from: BASE, to: 0, captured: [], note: null });
    // The seat threw and then stayed away: the table only moves (onto the star, three squares on).
    const waiting = roll(hand(2, { tokens: [[5, 20], [BASE, BASE]] }), 3);
    t = timeoutTable(waiting, names, dice());
    assert.deepEqual([t.tokens[0], t.turn, t.misses, t.last.rolled, t.last.n], [[8, 20], 1, [1, 0], false, 2]);
    // Nothing to move: the turn passes, counted all the same.
    t = timeoutTable(hand(3, { misses: [0, 1, 0], turn: 1 }), names, dice(2));
    assert.deepEqual([t.turn, t.misses, t.last.note], [2, [0, 2, 0], 'none']);
    // A throw of one's own clears the count.
    assert.deepEqual(roll(hand(2, { misses: [2, 1] }), 3).misses, [0, 1]);
    // The third run-out turn in a row: the seat goes, and with it its tokens.
    t = timeoutTable(hand(3, { misses: [0, MISSES - 1, 0], turn: 1, tokens: [[3, BASE], [9, 9], [BASE, 40]], n: 7 }), names, dice());
    assert.deepEqual([t.seats, t.colors, t.tokens, t.turn, t.status, t.misses], [['p0', 'p2'], [0, 2], [[3, BASE], [BASE, 40]], 1, 'playing', [0, 0]]);
    assert.deepEqual([t.last, t.n, t.log], [{ n: 8, color: 1, die: null, rolled: false, token: null, from: null, to: null, captured: [], note: 'left' }, 8, 'B masadan kalktı.']);
  });

  test('masadan kalkanın taşları tahtadan kalkar; sıra ondaysa sonrakine geçer, son kalan kazanır', () => {
    const choosing = roll(hand(3, { tokens: [[5, 20], [9, BASE], [BASE, 40]] }), 3);
    assert.equal(choosing.phase, 'move');
    // The one choosing leaves: the next seat starts its own turn.
    let t = leaveTable(choosing, 0, names);
    assert.deepEqual([t.seats, t.colors, t.tokens, t.turn, t.phase, t.movable, t.sixes], [['p1', 'p2'], [1, 2], [[9, BASE], [BASE, 40]], 0, 'roll', [], 0]);
    assert.deepEqual([t.last.note, t.last.color, t.n], ['left', 0, 2]);
    // Someone else leaves: the choice stays as it was.
    t = leaveTable(choosing, 2, names);
    assert.deepEqual([t.seats, t.colors, t.turn, t.phase, t.movable, t.die, t.last.note, t.last.color], [['p0', 'p1'], [0, 1], 0, 'move', [0, 1], 3, 'left', 2]);
    assert.deepEqual(pick(t, 0).tokens, [[8, 20], [9, BASE]]);
    t = leaveTable(t, 1, names);
    assert.deepEqual([t.status, t.winner, t.seats, t.tokens, t.log], ['over', 0, ['p0'], [[5, 20]], 'B masadan kalktı · 🏆 A kazandı!']);
    // After a hand a seat goes with its tokens, so the board of the hand just played still reads right.
    const over = { ...hand(3, { tokens: [[HOME, HOME], [9, BASE], [BASE, 40]] }), status: 'over', winner: 0 };
    t = leaveTable(over, 1, names);
    assert.deepEqual([t.seats, t.colors, t.tokens, t.winner, t.n], [['p0', 'p2'], [0, 2], [[HOME, HOME], [BASE, 40]], 0, 0]);
    // Someone who sat down after the hand has no tokens yet: leaving takes only the seat.
    t = leaveTable({ ...over, seats: [...over.seats, 'p3'], misses: [0, 0, 0, 0] }, 3, names);
    assert.deepEqual([t.seats, t.colors, t.tokens.length], [['p0', 'p1', 'p2'], [0, 1, 2], 3]);
  });

  test('masanın seçtiği taş: önce kırar, sonra yola çıkar, sonra eve girer, sonra en güvenli adımı atar', () => {
    const choose = (tokens, die, n = 2) => {
      const t = roll(hand(n, { tokens }), die);
      assert.equal(t.phase, 'move', JSON.stringify(tokens));
      return pickToken(t, 0);
    };
    assert.equal(choose([[10, BASE], [stepOn(2, 16), BASE]], 6), 0, 'kırmak yola çıkmaktan önce');
    assert.equal(choose([[10, 20], [stepOn(2, 14), stepOn(2, 24)]], 4), 1, 'daha çok yol gelmiş taşı kırmak');
    assert.equal(choose([[50, BASE], [BASE, BASE]], 6), 1, 'yola çıkmak eve girmekten önce');
    assert.equal(choose([[53, 10], [BASE, BASE]], 3), 0, 'eve girmek düz adımdan önce');
    assert.equal(choose([[4, 31], [BASE, BASE]], 4), 0, 'yıldıza gitmek');
    assert.equal(choose([[48, 20], [BASE, BASE]], 4), 0, 'ev yoluna girmek');
    // Square 12 is four ahead of an opponent on 8; square 32 has nobody behind it.
    assert.equal(choose([[10, 30], [stepOn(2, 8), BASE]], 2), 1, 'kırılabileceği kareye gitmemek');
    // The token on 12 can be taken where it stands; the one on 30 can't.
    assert.equal(choose([[12, 30], [stepOn(2, 8), BASE]], 3), 0, 'kırılabileceği kareden kaçmak');
    assert.equal(choose([[10, 14], [stepOn(2, 12), BASE]], 4), 0, 'kendi taşının yanına gitmek güvenli');
    assert.equal(choose([[10, 30], [BASE, BASE]], 2), 1, 'başka fark yoksa öndeki taş');
  });

  test('rastgele oynanan yüzlerce el hep bir kazananla biter ve tahta hiç bozulmaz', () => {
    // A small seeded generator (mulberry32): the same games every run.
    const seeded = (seed) => {
      let a = seed >>> 0;
      return (n) => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = Math.imul(a ^ (a >>> 15), 1 | a);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
      };
    };
    const seen = { captures: 0, homes: 0, sixes: 0, choices: 0, shared: 0 };
    for (let seed = 1; seed <= 240; seed++) {
      const r = seeded(seed);
      const n = 2 + (seed % 3);
      const mode = seed % 2 ? 'quick' : 'classic';
      let t = startTable({ ...openTable('ludo', 'p0', { mode }), seats: Array.from({ length: n }, (_, i) => `p${i}`), misses: Array(n).fill(0) }, r);
      for (let events = 0; t.status === 'playing'; events++) {
        assert.ok(events < 20_000, `el bitmiyor (${seed})`);
        const before = t;
        const seat = t.turn;
        // Every third game is played by the table's own choice, the others by a random one.
        const m = t.phase === 'roll' ? { roll: true } : { token: seed % 3 ? t.movable[r(t.movable.length)] : pickToken(t, seat) };
        const res = moveTable(t, seat, m, names, r);
        assert.ok(res.ok, res.reason);
        t = res.table;
        assert.equal(t.n, before.n + 1, 'her hamle tek olay');
        assert.equal(t.last.n, t.n);
        assert.equal(t.last.color, before.colors[seat]);
        for (const ts of t.tokens) for (const s of ts) assert.ok(Number.isInteger(s) && s >= BASE && s <= HOME, `adım ${s}`);
        if (t.phase === 'move') {
          seen.choices++;
          assert.deepEqual(t.movable, legalTokens(t, t.turn, t.die));
          assert.ok(new Set(t.movable.map((i) => t.tokens[t.turn][i])).size > 1, 'seçim gerçek bir seçim');
          assert.deepEqual(t.tokens, before.tokens, 'seçilene kadar taş oynamaz');
        } else assert.deepEqual(t.movable, []);
        const { token, from, to, captured } = t.last;
        if (token !== null) {
          assert.equal(to, from === BASE ? 0 : from + t.last.die);
          assert.equal(t.tokens[seat][token], to);
          if (from === BASE) assert.equal(t.last.die, 6);
          for (const c of captured) {
            const s = before.colors.indexOf(c.color);
            assert.notEqual(s, seat);
            const square = squareOf(c.color, c.from);
            assert.equal(square, squareOf(t.last.color, to));
            assert.ok(!SAFE.includes(square), 'güvenli karede kırılmaz');
            assert.equal(before.tokens[s].filter((x) => x === c.from).length, 1, 'yalnız tek duran taş kırılır');
            assert.equal(t.tokens[s][c.token], BASE);
          }
          seen.captures += captured.length;
          if (to === HOME) seen.homes++;
          const square = squareOf(t.last.color, to);
          if (square !== null && t.tokens.some((ts, s) => s !== seat && ts.some((x) => squareOf(t.colors[s], x) === square))) seen.shared++;
        } else assert.deepEqual(t.tokens, before.tokens);
        if (t.last.note === 'sixes') seen.sixes++;
        // The turn stays only on a 6 that was played, a capture or a token home.
        if (t.status === 'playing' && t.phase === 'roll') {
          const again = t.last.note !== 'sixes' && (t.last.die === 6 || captured.length > 0 || to === HOME);
          assert.equal(t.turn, again ? seat : (seat + 1) % n, JSON.stringify(t.last));
        }
      }
      assert.ok(t.tokens[t.winner].every((s) => s === HOME));
      assert.ok(t.tokens.every((ts, s) => s === t.winner || ts.some((x) => x !== HOME)));
    }
    // The games really went through every rule.
    for (const [k, v] of Object.entries(seen)) assert.ok(v > 20, `${k}: ${v}`);
  });

  test('tek taşlı eski Ludo’dan kalan masa oynanamaz sayılır', () => {
    const old = { game: 'ludo', seats: ['a', 'b'], status: 'playing', turn: 0, winner: null, log: 'A 3 attı', misses: [0, 0], pos: [3, -1], die: 3 };
    assert.equal(staleTable(old), true);
    assert.equal(staleTable({ ...old, status: 'over' }), true);
    assert.equal(staleTable({ ...old, status: 'waiting' }), false, 'bekleyen masa yeni kurallarla başlar');
    assert.equal(startTable({ ...old, status: 'waiting' }, dice()).mode, 'quick');
    assert.equal(staleTable(hand(2)), false);
    assert.equal(staleTable(openTable('xox', 'a')), false);
    assert.equal(staleTable({ game: 'tavla', seats: [] }), true);
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

describe('Ludo masası sunucuda', () => {
  let owner;
  let a;
  let b;
  let room;
  /** Puts the room's table in the state a test needs (the server only reads what is stored). */
  const set = (patch) => h.sql.query('UPDATE room_tables SET state = state || $2::jsonb, turn_at = now() WHERE room_id = $1', [room, JSON.stringify(patch)]);
  const stored = async () => (await h.sql.query('SELECT state FROM room_tables WHERE room_id = $1', [room])).rows[0]?.state;

  test('masayı açan Hızlı ya da Klasik seçer; geçersiz seçim reddedilir', async () => {
    owner = await signUp('Oda Sahibi');
    a = await signUp('Ayşe');
    b = await signUp('Bora');
    const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session);
    assert.equal(st, 200, j.error);
    room = j.room.id;
    const [bad, why] = await act(owner.session, room, 'open', { game: 'ludo', options: { mode: 'dev' } });
    assert.deepEqual([bad, why.error], [400, 'Geçersiz oyun ayarı']);
    assert.equal(await ok(table(owner.session, room)), null);
    let t = await ok(act(owner.session, room, 'open', { game: 'ludo', options: { mode: 'classic' } }));
    assert.deepEqual([t.game, t.name, t.min, t.max, t.status, t.mode, t.mySeat], ['ludo', 'Ludo', 2, 4, 'waiting', 'classic', 0]);
    assert.equal((await act(owner.session, room, 'start'))[1].error, 'Ludo için en az 2 oyuncu gerekli');
    await ok(act(a.session, room, 'join'));
    t = await ok(act(owner.session, room, 'start'));
    assert.deepEqual([t.status, t.mode, t.colors, t.tokens, t.phase, t.hand], ['playing', 'classic', [0, 2], [[-1, -1, -1, -1], [-1, -1, -1, -1]], 'roll', 1]);
    assert.equal(await ok(act(owner.session, room, 'close')), null);
    // Not said: the short game.
    t = await ok(act(owner.session, room, 'open', { game: 'ludo' }));
    assert.equal(t.mode, 'quick');
  });

  test('zar ve taş sırayla oynanır: sıra, aşama ve taş sunucuda denetlenir; izleyen de aynı masayı görür', async () => {
    await ok(act(a.session, room, 'join'));
    let t = await ok(act(owner.session, room, 'start'));
    assert.deepEqual([t.tokens, t.colors, t.turn, t.turnEndsAt !== null], [[[-1, -1], [-1, -1]], [0, 2], 0, true]);
    assert.equal((await act(a.session, room, 'move', { move: { roll: true } }))[1].error, 'Sıra sende değil.');
    assert.equal((await act(b.session, room, 'move', { move: { roll: true } }))[1].error, 'Bu masada oturmuyorsun');
    assert.deepEqual(await act(owner.session, room, 'move', { move: { token: 0 } }), [409, { error: 'Önce zar at.' }]);
    const from = lkCalls.length;
    t = await ok(act(owner.session, room, 'move', { move: { roll: true } }));
    assert.ok(t.die >= 1 && t.die <= 6);
    assert.deepEqual([t.turn, t.tokens[0], t.last.token], t.die === 6 ? [0, [0, -1], 0] : [1, [-1, -1], null]);
    assert.deepEqual([t.n, t.last.n, t.last.rolled, t.last.color], [1, 1, true, 0]);
    assert.ok(await until(() => tablePackets(from).length === 1));
    // Two tokens on different squares: whatever the die, there is a choice to make.
    await set({ tokens: [[5, 20], [-1, -1]], turn: 0, phase: 'roll', sixes: 0, movable: [] });
    t = await ok(act(owner.session, room, 'move', { move: { roll: true } }));
    assert.deepEqual([t.phase, t.movable, t.turn, t.tokens[0]], ['move', [0, 1], 0, [5, 20]]);
    const die = t.die;
    assert.deepEqual(await act(owner.session, room, 'move', { move: { roll: true } }), [409, { error: 'Oynayacağın taşı seç.' }]);
    assert.deepEqual(await act(owner.session, room, 'move', { move: { token: 2 } }), [409, { error: 'Bu taş oynanamaz.' }]);
    assert.equal((await act(a.session, room, 'move', { move: { token: 0 } }))[1].error, 'Sıra sende değil.');
    t = await ok(act(owner.session, room, 'move', { move: { token: 1 } }));
    assert.deepEqual([t.tokens[0], t.phase, t.movable, t.turn], [[5, 20 + die], 'roll', [], die === 6 ? 0 : 1]);
    assert.deepEqual(t.last, { n: t.n, color: 0, die, rolled: false, token: 1, from: 20, to: 20 + die, captured: [], note: null });
    // Someone watching reads the same board, with no seat of their own.
    const seen = await ok(table(b.session, room));
    assert.deepEqual([seen.mySeat, seen.tokens, seen.last, seen.die, seen.seats.map((x) => x.name)], [-1, t.tokens, t.last, die, ['Oda Sahibi', 'Ayşe']]);
    assert.deepEqual([seen.misses, typeof seen.seats[0].id], [undefined, 'string']);
  });

  test('süre dolunca masa oynar: zarı atar, seçim varsa taşı da oynar', async () => {
    await set({ tokens: [[5, 20], [-1, -1]], turn: 0, phase: 'roll', sixes: 0, movable: [], n: 40, misses: [0, 0] });
    await h.sql.query('UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1', [room, TURN_MS / 1000 + 1]);
    const from = lkCalls.length;
    const t = await ok(table(b.session, room));
    assert.deepEqual([t.n, t.last.rolled, t.last.color, t.phase], [41, true, 0, 'roll']);
    assert.ok(t.last.token === 0 || t.last.token === 1);
    assert.equal(t.tokens[0][t.last.token], t.last.to);
    assert.deepEqual((await stored()).misses, [1, 0]);
    assert.ok(await until(() => tablePackets(from).length === 1), 'odaya haber gider');
    // Ayşe never plays: after MISSES run-out turns her seat goes, her tokens with it, and the hand is the owner's.
    await set({ tokens: [[5, 20], [9, -1]], turn: 1, phase: 'roll', sixes: 0, movable: [], misses: [0, MISSES - 1] });
    await h.sql.query('UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1', [room, TURN_MS / 1000 + 1]);
    const left = await ok(table(owner.session, room));
    assert.deepEqual([left.status, left.winner, left.seats.map((x) => x.name), left.tokens, left.colors], ['over', 0, ['Oda Sahibi'], [[5, 20]], [0]]);
    assert.match(left.log, /Ayşe masadan kalktı · 🏆 Oda Sahibi kazandı!/);
  });

  test('bitişe bir adım kala: 1 atan kazanır, el biter; yeniden oynanınca tahta sıfırlanır', async () => {
    // Two fresh players, so the turns below stay inside the per-minute limit of table actions.
    const x = await signUp('Xena');
    const y = await signUp('Yiğit');
    await ok(act(owner.session, room, 'close'));
    await ok(act(owner.session, room, 'open', { game: 'ludo' }));
    await ok(act(x.session, room, 'join'));
    await ok(act(y.session, room, 'join'));
    // The opener leaves the table: the first seat may start it.
    let t = await ok(act(owner.session, room, 'leave'));
    assert.deepEqual([t.seats.map((s) => s.name), t.mySeat], [['Xena', 'Yiğit'], -1]);
    assert.equal((await act(y.session, room, 'start'))[0], 409);
    t = await ok(act(x.session, room, 'start'));
    await set({ tokens: [[56, 55], [56, 55]] });
    const players = [x, y];
    let rolls = 0;
    for (; t.status === 'playing'; rolls++) {
      assert.ok(rolls < 100, 'yüz zarda 1 gelmedi');
      const seat = t.turn;
      t = await ok(act(players[seat].session, room, 'move', { move: { roll: true } }));
      if (t.die === 1) assert.deepEqual([t.status, t.winner, t.tokens[seat], t.last.to], ['over', seat, [56, 56], 56]);
      else assert.deepEqual([t.status, t.last.token, t.last.note], ['playing', null, t.sixes === 0 && t.die === 6 ? 'sixes' : 'none']);
    }
    assert.equal(t.log, `🏆 ${['Xena', 'Yiğit'][t.winner]} kazandı!`);
    assert.equal(t.turnEndsAt, null);
    assert.equal((await act(players[t.winner].session, room, 'move', { move: { roll: true } }))[1].error, 'Oyun başlamadı.');
    t = await ok(act(y.session, room, 'again'));
    assert.deepEqual([t.status, t.hand, t.tokens, t.n, t.last, t.turn, t.winner], ['playing', 2, [[-1, -1], [-1, -1]], 0, null, 0, null]);
  });

  test('tek taşlı eski Ludo’dan kalan masa yok sayılır ve yerine yenisi açılır', async () => {
    await h.sql.query('UPDATE room_tables SET state = $2 WHERE room_id = $1', [room, JSON.stringify({ game: 'ludo', seats: (await stored()).seats, status: 'playing', turn: 0, winner: null, log: 'A 3 attı', misses: [0, 0], pos: [3, -1], die: 3 })]);
    assert.equal(await ok(table(owner.session, room)), null);
    assert.deepEqual(await act(owner.session, room, 'move', { move: { roll: true } }), [404, { error: 'Odada açık masa yok' }]);
    const t = await ok(act(owner.session, room, 'open', { game: 'ludo', options: { mode: 'quick' } }));
    assert.deepEqual([t.status, t.seats.map((s) => s.name), t.mode], ['waiting', ['Oda Sahibi'], 'quick']);
  });
});
