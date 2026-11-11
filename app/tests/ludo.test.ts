/// <reference types="node" />
// Ludo: practice games are played with the app's own copy of the rules (lib/room-games/ludo) and a live room shows
// the server's (server/api/room-games/ludo.mjs behind room-games-rules.mjs). If the two drift apart, a practice game
// would teach rules the room doesn't play, and the board would light up tokens the server refuses to move. So
// hundreds of seeded games go through both, step for step, with run-out turns, players leaving and refused moves in
// between. Then the practice opponents (they play what the rules allow, and play it well) and the board's geometry.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  BASE,
  HOME,
  LAST,
  LOOP,
  META,
  MISSES,
  MODES,
  SAFE,
  leaveTable,
  legalTokens,
  moveTable,
  openTable,
  pickToken,
  seatColors,
  squareOf,
  startTable,
  tableOptions,
  timeoutTable,
  type LudoMove,
  type LudoState,
  type LudoTable,
  type MoveResult,
  type Rnd,
  type TableBase,
} from '@/lib/room-games/ludo';
import { GRID, LOOP_POINTS, cornerOf, hopSteps, stackSpots, tokenPoint, trackSquares, turned, turnsFor, yardCentre, type Point } from '@/lib/room-games/ludo-board';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as rules from '../../server/api/room-games-rules.mjs';
import * as server from '../../server/api/room-games/ludo.mjs';

/** A small seeded generator (mulberry32): the same draws every run. */
const seeded = (seed: number): Rnd => {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
};

// The server's side of each step, typed as the app's.
type Waiting = TableBase & Partial<LudoState>;
const srv = {
  open: (opener: string, options?: object) => rules.openTable('ludo', opener, options) as unknown as Waiting,
  start: (t: Waiting, rnd: Rnd) => rules.startTable(t, rnd) as unknown as LudoTable,
  move: (t: LudoTable, seat: number, m: unknown, names: string[], rnd: Rnd) => rules.moveTable(t, seat, m, names, rnd) as unknown as MoveResult,
  timeout: (t: LudoTable, names: string[], rnd: Rnd) => rules.timeoutTable(t, names, rnd) as unknown as LudoTable,
  leave: <T extends Waiting>(t: T, seat: number, names: string[]) => rules.leaveTable(t, seat, names) as unknown as T,
};
/** Sitting down is the table's own code on the server (room-games.mjs): a seat and its count of run-out turns. */
const sit = <T extends Waiting>(t: T, id: string): T => ({ ...t, seats: [...t.seats, id], misses: [...t.misses, 0] });
const PEOPLE = ['Ayşe', 'Bora', 'Cem', 'Deniz'];

describe('Ludo kuralları: uygulama ile sunucu aynı oyunu oynar', () => {
  test('sabitler, oyuncu sayısı ve masayı açanın seçimi aynı', () => {
    assert.deepEqual([LOOP, LAST, HOME, BASE, SAFE, MODES], [server.LOOP, server.LAST, server.HOME, server.BASE, server.SAFE, server.MODES]);
    assert.deepEqual({ ...META }, server.meta);
    assert.deepEqual(rules.TABLE_GAMES.ludo, server.meta);
    assert.equal(MISSES, rules.MISSES);
    for (const n of [2, 3, 4]) assert.deepEqual(seatColors(n), server.seatColors(n));
    for (const color of [0, 1, 2, 3]) for (let step = BASE; step <= HOME; step++) assert.equal(squareOf(color, step), server.squareOf(color, step));
    for (const o of [undefined, null, {}, { mode: 'quick' }, { mode: 'classic' }, { mode: 'dev' }, { mode: 3 }, { mode: 'toString' }]) {
      assert.deepEqual(tableOptions(o), rules.tableOptions('ludo', o), JSON.stringify(o));
      if (tableOptions(o)) assert.deepEqual(openTable('p0', o), srv.open('p0', o ?? undefined));
    }
  });

  test('aynı zarlarla yüzlerce el: her adımda iki taraf aynı masayı verir (süresi dolan sıra, kalkan oyuncu, reddedilen hamle dahil)', () => {
    const seen = { steps: 0, hands: 0, timeouts: 0, leaves: 0, refused: 0, captures: 0, home: 0 };
    for (let seed = 1; seed <= 320; seed++) {
      // Three generators: what happens next, and the same dice for each side.
      const next = seeded(seed);
      const appDice = seeded(seed * 7919 + 13);
      const serverDice = seeded(seed * 7919 + 13);
      const n = 2 + next(3);
      const options = { mode: next(2) ? 'quick' : 'classic' };
      let names = PEOPLE.slice(0, n);
      let waitingApp: Waiting = openTable('p0', options);
      let waitingServer = srv.open('p0', options);
      for (let i = 1; i < n; i++) [waitingApp, waitingServer] = [sit(waitingApp, `p${i}`), sit(waitingServer, `p${i}`)];
      assert.deepEqual(waitingApp, waitingServer);
      let app = startTable(waitingApp);
      let srvT = srv.start(waitingServer, serverDice);
      assert.deepEqual(app, srvT, `el başı (${seed})`);
      seen.hands++;
      for (let i = 0; i < 6000; i++) {
        const where = `tohum ${seed}, adım ${i}`;
        if (app.status === 'over') {
          // A hand played to its end, not one left to its last player.
          if (app.winner !== null && app.tokens[app.winner].every((step) => step === HOME)) seen.home++;
          // Sometimes somebody gets up after the hand, sometimes another hand is played with whoever is left.
          if (next(4) === 0 && app.seats.length > 1) {
            const seat = next(app.seats.length);
            [app, srvT] = [leaveTable(app, seat, names), srv.leave(srvT, seat, names)];
            names = names.filter((_, k) => k !== seat);
            assert.deepEqual(app, srvT, where);
          }
          if (app.seats.length < META.min || app.hand >= 3 || next(3) === 0) break;
          [app, srvT] = [startTable(app), srv.start(srvT, serverDice)];
          assert.deepEqual(app, srvT, where);
          seen.hands++;
          continue;
        }
        const roll = next(1000);
        const seat = app.turn;
        if (roll < 3) {
          const gone = next(app.seats.length);
          [app, srvT] = [leaveTable(app, gone, names), srv.leave(srvT, gone, names)];
          names = names.filter((_, k) => k !== gone);
          seen.leaves++;
        } else if (roll < 80) {
          [app, srvT] = [timeoutTable(app, names, appDice), srv.timeout(srvT, names, serverDice)];
          // The third run-out turn in a row took the seat away.
          if (app.seats.length < names.length) names = names.filter((_, k) => k !== seat);
          seen.timeouts++;
        } else if (roll < 130) {
          // A move that must be refused, with the same words: out of turn, the wrong step of the turn, a token that can't move.
          const bad: [number, unknown][] = [
            [(seat + 1) % app.seats.length, { roll: true }],
            [seat, app.phase === 'roll' ? { token: 0 } : { roll: true }],
            [seat, app.phase === 'roll' ? {} : { token: 9 }],
            [seat, app.phase === 'roll' ? null : { token: '0' }],
          ];
          const [who, m] = bad[next(bad.length)];
          const [a, s] = [moveTable(app, who, m as LudoMove, names, appDice), srv.move(srvT, who, m, names, serverDice)];
          assert.equal(a.ok, false, where);
          assert.deepEqual(a, s, where);
          seen.refused++;
        } else {
          let m: LudoMove = { roll: true };
          if (app.phase === 'move') {
            assert.deepEqual(app.movable, server.legalTokens(srvT, seat, srvT.die), where);
            assert.deepEqual(app.movable, legalTokens(app, seat, app.die ?? 0), where);
            // Half the choices are the table's own, which must be the same token on both sides.
            const careful = pickToken(app, seat);
            assert.equal(careful, server.pickToken(srvT, seat), where);
            m = { token: next(2) ? careful : app.movable[next(app.movable.length)] };
          }
          const [a, s] = [moveTable(app, seat, m, names, appDice), srv.move(srvT, seat, m, names, serverDice)];
          assert.deepEqual(a, s, where);
          assert.ok(a.ok && s.ok, where);
          [app, srvT] = [a.table, s.table];
          seen.captures += app.last?.captured.length ?? 0;
        }
        assert.deepEqual(app, srvT, where);
        seen.steps++;
      }
      assert.equal(app.status, 'over', `el bitmedi (${seed})`);
    }
    // The games really went everywhere the rules go.
    assert.ok(seen.steps > 70_000 && seen.hands > 350 && seen.home > 220, JSON.stringify(seen));
    assert.ok(seen.timeouts > 5000 && seen.leaves > 200 && seen.refused > 3500 && seen.captures > 1000, JSON.stringify(seen));
  });
});

describe('Ludo deneme rakipleri', () => {
  const play = (seed: number, n: number, mode: 'quick' | 'classic', choose: (t: LudoTable, seat: number, rnd: Rnd) => number) => {
    const rnd = seeded(seed);
    let waiting: Waiting = openTable('p0', { mode });
    for (let i = 1; i < n; i++) waiting = sit(waiting, `p${i}`);
    let t = startTable(waiting);
    for (let i = 0; t.status === 'playing'; i++) {
      assert.ok(i < 20_000, `el bitmiyor (${seed})`);
      const seat = t.turn;
      const m: LudoMove = t.phase === 'roll' ? { roll: true } : { token: choose(t, seat, rnd) };
      const r = moveTable(t, seat, m, PEOPLE, rnd);
      assert.ok(r.ok, r.ok ? '' : r.reason);
      t = r.table;
    }
    return t;
  };

  test('rakip hep oynanabilir bir taş seçer ve el bir kazananla biter', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const t = play(seed, 2 + (seed % 3), seed % 2 ? 'quick' : 'classic', (table, seat) => {
        const token = pickToken(table, seat);
        assert.ok(table.movable.includes(token), `oynanamaz taş (${seed})`);
        return token;
      });
      assert.equal(t.status, 'over');
      assert.ok(t.winner !== null && t.tokens[t.winner].every((s) => s === HOME));
    }
  });

  test('sırası: kırmak, yola çıkmak, eve girmek, sonra en güvenli adım', () => {
    const at = (color: number, square: number) => (square - color * 13 + LOOP) % LOOP;
    const choose = (tokens: number[][], die: number) => {
      const t: LudoTable = { ...startTable(sit(openTable('p0'), 'p1')), tokens };
      const r = moveTable(t, 0, { roll: true }, PEOPLE, () => die - 1);
      assert.ok(r.ok && r.table.phase === 'move', JSON.stringify(tokens));
      return pickToken(r.table, 0);
    };
    assert.equal(choose([[10, BASE], [at(2, 16), BASE]], 6), 0, 'kırmak yola çıkmaktan önce');
    assert.equal(choose([[50, BASE], [BASE, BASE]], 6), 1, 'yola çıkmak eve girmekten önce');
    assert.equal(choose([[53, 10], [BASE, BASE]], 3), 0, 'eve girmek düz adımdan önce');
    assert.equal(choose([[4, 31], [BASE, BASE]], 4), 0, 'yıldıza gitmek');
    assert.equal(choose([[10, 30], [at(2, 8), BASE]], 2), 1, 'kırılabileceği kareye gitmemek');
    assert.equal(choose([[12, 30], [at(2, 8), BASE]], 3), 0, 'kırılabileceği kareden kaçmak');
  });

  test('özenli seçim rastgele seçimi yener', () => {
    let wins = 0;
    const games = 300;
    // The careful player sits first in one half of the games and second in the other.
    for (let seed = 1; seed <= games; seed++) {
      const careful = seed % 2;
      const t = play(seed + 5000, 2, 'classic', (table, seat, rnd) => (seat === careful ? pickToken(table, seat) : table.movable[rnd(table.movable.length)]));
      if (t.winner === careful) wins++;
    }
    assert.ok(wins / games > 0.6, `${wins}/${games}`);
  });
});

describe('Ludo tahtası', () => {
  const cell = (p: Point) => [Math.floor(p.x), Math.floor(p.y)];
  const inYard = ([c, r]: number[]) => (c < 6 || c > 8) && (r < 6 || r > 8);
  const inCentre = ([c, r]: number[]) => c >= 6 && c <= 8 && r >= 6 && r <= 8;

  test('52 karelik tur haçın çevresini saat yönünde dolaşır; çıkış kareleri ve yıldızlar yerinde', () => {
    const cells = LOOP_POINTS.map(cell);
    assert.equal(new Set(cells.map(String)).size, LOOP);
    cells.forEach((c, i) => {
      assert.ok(c.every((v) => v >= 0 && v < GRID) && !inYard(c) && !inCentre(c), `kare ${i}: ${c}`);
      const [nc, nr] = cells[(i + 1) % LOOP];
      assert.ok(Math.max(Math.abs(nc - c[0]), Math.abs(nr - c[1])) === 1, `kare ${i} ile sonraki bitişik`);
    });
    assert.deepEqual([0, 13, 26, 39].map((i) => cells[i]), [[1, 6], [8, 1], [13, 8], [6, 13]]);
    assert.deepEqual([8, 21, 34, 47].map((i) => cells[i]), [[6, 2], [12, 6], [8, 12], [2, 8]]);
    // A quarter turn of the board is thirteen squares along the loop.
    LOOP_POINTS.forEach((p, i) => assert.deepEqual(turned(p, 1), LOOP_POINTS[(i + 13) % LOOP]));
    assert.deepEqual(turned({ x: 2.5, y: 4 }, 4), { x: 2.5, y: 4 });
    assert.deepEqual(turned({ x: 2.5, y: 4 }, -1), turned({ x: 2.5, y: 4 }, 3));
  });

  test('taşın yeri: yuvada kendi köşesinde, turda ve ev yolunda karesinde, evde ortadaki üçgeninde', () => {
    for (const color of [0, 1, 2, 3]) {
      for (const count of [2, 4]) {
        const corner = yardCentre(color);
        const base = Array.from({ length: count }, (_, i) => tokenPoint(color, BASE, i, count, 0));
        assert.equal(new Set(base.map((p) => `${p.x},${p.y}`)).size, count);
        for (const p of base) assert.ok(Math.abs(p.x - corner.x) < 2 && Math.abs(p.y - corner.y) < 2, `yuva ${color}`);
        const home = Array.from({ length: count }, (_, i) => tokenPoint(color, HOME, i, count, 0));
        assert.equal(new Set(home.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size, count);
        for (const p of home) assert.ok(inCentre(cell(p)), `ev ${color}`);
      }
      assert.deepEqual(tokenPoint(color, 0, 0, 2, 0), LOOP_POINTS[color * 13]);
      // The way home: every step is the square next to the one before, and the column ends at the centre.
      const path = hopSteps(40, HOME - 1).map((step) => cell(tokenPoint(color, step, 0, 2, 0)));
      path.slice(1).forEach(([c, r], i) => assert.equal(Math.max(Math.abs(c - path[i][0]), Math.abs(r - path[i][1])), 1, `renk ${color}, adım ${42 + i}`));
      const lane = hopSteps(LAST, HOME - 1).map((step) => cell(tokenPoint(color, step, 0, 2, 0)));
      assert.ok(lane.every((c) => !inYard(c) && !inCentre(c)));
      assert.ok(lane.every(([c, r]) => c === 7 || r === 7), 'ev yolu kolun ortasında');
      const [lc, lr] = lane[lane.length - 1];
      assert.equal(Math.abs(lc - 7) + Math.abs(lr - 7), 2, 'ev yolunun sonu ortaya bitişik');
    }
    assert.deepEqual(hopSteps(LAST, HOME - 1).map((step) => cell(tokenPoint(0, step, 0, 2, 0))), [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]]);
    assert.deepEqual([hopSteps(BASE, 0), hopSteps(3, 6), hopSteps(49, 52), hopSteps(5, 5)], [[0], [4, 5, 6], [50, 51, 52], []]);
  });

  test('tahta, bakanın rengi sol altta olacak şekilde döner', () => {
    for (const color of [0, 1, 2, 3]) {
      const turns = turnsFor(color);
      assert.equal(cornerOf(color, turns), 3);
      const base = tokenPoint(color, BASE, 0, 4, turns);
      assert.ok(base.x < 6 && base.y > 9, `renk ${color} sol altta`);
      assert.deepEqual(cell(tokenPoint(color, 0, 0, 4, turns)), [6, 13], 'çıkış karesi alt kolun sol sütununda');
      assert.deepEqual(cell(tokenPoint(color, HOME - 1, 0, 4, turns)), [7, 9], 'ev yolu alttan ortaya çıkar');
      // The others keep their order clockwise from the viewer.
      assert.deepEqual([1, 2, 3].map((k) => cornerOf((color + k) % 4, turns)), [0, 1, 2]);
    }
  });

  test('çizilen kareler: 52 tur karesi ve dört ev yolu, renkleri ve okları doğru', () => {
    for (const turns of [0, 1, 2, 3]) {
      const all = trackSquares(turns);
      assert.equal(all.length, LOOP + 20);
      assert.equal(new Set(all.map((q) => `${q.col},${q.row}`)).size, all.length);
      assert.ok(all.every((q) => !inYard([q.col, q.row]) && !inCentre([q.col, q.row])));
      const count = (kind: string) => all.filter((q) => q.kind === kind).length;
      assert.deepEqual(['start', 'star', 'gate', 'lane', 'plain'].map(count), [4, 4, 4, 20, 40]);
      for (const color of [0, 1, 2, 3]) {
        const own = all.filter((q) => q.color === color);
        assert.deepEqual(own.map((q) => q.kind).sort(), ['gate', 'lane', 'lane', 'lane', 'lane', 'lane', 'start']);
        assert.ok(own.every((q) => q.heading === cornerOf(color, turns)), 'ok, rengin yürüdüğü yönde');
        const start = own.find((q) => q.kind === 'start')!;
        assert.deepEqual([start.col, start.row], cell(tokenPoint(color, 0, 0, 2, turns)));
        const gate = own.find((q) => q.kind === 'gate')!;
        assert.deepEqual([gate.col, gate.row], cell(tokenPoint(color, LAST, 0, 2, turns)));
      }
      // The safe squares of the rules are the ones drawn as a start square or a star.
      const safe = SAFE.map((i) => cell(turned(LOOP_POINTS[i], turns)).join()).sort();
      assert.deepEqual(all.filter((q) => q.kind === 'start' || q.kind === 'star').map((q) => `${q.col},${q.row}`).sort(), safe);
    }
  });

  test('aynı karedeki taşlar karenin içine sığar', () => {
    let last = 2;
    for (const n of [1, 2, 3, 4, 5, 8, 16]) {
      const { spots, scale } = stackSpots(n);
      assert.equal(spots.length, n);
      assert.ok(scale <= last && scale > 0.5);
      last = scale;
      assert.ok(spots.every((p) => Math.abs(p.x) + scale * 0.4 <= 0.55 && Math.abs(p.y) + scale * 0.4 <= 0.55), `${n} taş`);
    }
  });
});
