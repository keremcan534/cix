/// <reference types="node" />
// Dört Taş: practice games are played with the app's own copy of the rules (lib/room-games/four, on the seam copied
// in lib/room-games/seam) and a live room shows the server's (server/api/room-games/four.mjs behind
// room-games-rules.mjs). If the two drift apart, the board would drop a disc where the server doesn't, or light a
// line the server never saw. So hundreds of seeded hands go through both, step for step, with run-out turns, players
// leaving and refused moves in between; then the practice opponent.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { COLS, DEPTH, META, MISSES, ROWS, botCol, cellOf, colScores, leaveTable, lineThrough, moveTable, openTable, pickCol, restRow, sitDown, startTable, timeoutTable, type FourMove, type FourState, type FourTable } from '@/lib/room-games/four';
import type { MoveResult, Rnd, TableBase } from '@/lib/room-games/seam';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as rules from '../../server/api/room-games-rules.mjs';
import * as server from '../../server/api/room-games/four.mjs';

/** A small seeded generator (mulberry32): the same games every run. */
const seeded = (seed: number): Rnd => {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
};
const none: Rnd = () => assert.fail('Dört Taş’ta çekiliş yok');

type Waiting = TableBase<'four'> & Partial<FourState>;
const srv = {
  open: (opener: string) => rules.openTable('four', opener, undefined) as unknown as Waiting,
  start: (t: Waiting) => rules.startTable(t, none) as unknown as FourTable,
  move: (t: FourTable, seat: number, m: unknown, names: string[]) => rules.moveTable(t, seat, m, names, none) as unknown as MoveResult<FourTable>,
  timeout: (t: FourTable, names: string[]) => rules.timeoutTable(t, names, none) as unknown as FourTable,
  leave: <T extends Waiting>(t: T, seat: number, names: string[]) => rules.leaveTable(t, seat, names) as unknown as T,
};
const PEOPLE = ['Ayşe', 'Bora'];

describe('Dört Taş kuralları: uygulama ile sunucu aynı oyunu oynar', () => {
  test('sabitler ve tahtanın ölçüsü aynı', () => {
    assert.deepEqual([COLS, ROWS, DEPTH, { ...META }], [server.COLS, server.ROWS, server.DEPTH, server.meta]);
    assert.deepEqual([rules.TABLE_GAMES.four, MISSES], [server.meta, rules.MISSES]);
    for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) assert.equal(cellOf(col, row), server.cellOf(col, row));
    assert.deepEqual(openTable('p0'), srv.open('p0'));
  });

  test('yüzlerce el: her taşta iki taraf aynı masayı verir (süresi dolan sıra, kalkan oyuncu, reddedilen hamle dahil)', () => {
    const seen = { steps: 0, hands: 0, timeouts: 0, leaves: 0, refused: 0, lines: 0, draws: 0, picks: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const next = seeded(seed);
      let names = [...PEOPLE];
      let app = startTable(sitDown(openTable('p0') as Waiting, 'p1'));
      let srvT = srv.start(sitDown(srv.open('p0'), 'p1'));
      assert.deepEqual(app, srvT, `el başı (${seed})`);
      seen.hands++;
      for (let i = 0; i < 400; i++) {
        const where = `tohum ${seed}, adım ${i}`;
        if (app.status === 'over') {
          if (app.line) seen.lines++;
          else if (app.winner === null) seen.draws++;
          if (app.seats.length < 2 || app.hand >= 4 || next(4) === 0) break;
          [app, srvT] = [startTable(app), srv.start(srvT)];
          assert.deepEqual(app, srvT, where);
          seen.hands++;
          continue;
        }
        const roll = next(1000);
        const seat = app.turn;
        if (roll < 6) {
          const gone = next(2);
          [app, srvT] = [leaveTable(app, gone, names), srv.leave(srvT, gone, names)];
          names = names.filter((_, k) => k !== gone);
          seen.leaves++;
        } else if (roll < 60) {
          [app, srvT] = [timeoutTable(app, names), srv.timeout(srvT, names)];
          if (app.seats.length < names.length) names = names.filter((_, k) => k !== seat);
          seen.timeouts++;
        } else if (roll < 120) {
          const full = Array.from({ length: COLS }, (_, c) => c).find((c) => restRow(app.board, c) < 0);
          const bad: [number, unknown][] = [[1 - seat, { col: 3 }], [seat, { col: 7 }], [seat, { col: -1 }], [seat, { col: '3' }], [seat, {}], [seat, null], ...(full !== undefined ? [[seat, { col: full }] as [number, unknown]] : [])];
          const [who, m] = bad[next(bad.length)];
          const [a, s] = [moveTable(app, who, m as FourMove, names), srv.move(srvT, who, m, names)];
          assert.equal(a.ok, false, where);
          assert.deepEqual(a, s, where);
          seen.refused++;
        } else {
          const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => restRow(app.board, c) >= 0);
          let col = open[next(open.length)];
          // Now and then the table's own choice, which both sides must name alike (a shallower look most times, to keep the test quick).
          if (next(6) === 0) {
            const depth = next(5) === 0 ? DEPTH : 2;
            assert.deepEqual(colScores(app, seat, depth), server.colScores(srvT, seat, depth), where);
            col = pickCol(app, seat, depth);
            assert.equal(col, server.pickCol(srvT, seat, depth), where);
            seen.picks++;
          }
          const [a, s] = [moveTable(app, seat, { col }, names), srv.move(srvT, seat, { col }, names)];
          assert.ok(a.ok, where);
          assert.deepEqual(a, s, where);
          app = a.table;
          srvT = (s as { table: FourTable }).table;
          assert.deepEqual(lineThrough(app.board, cellOf(col, app.last!.row)), server.lineThrough(srvT.board, cellOf(col, app.last!.row)));
        }
        assert.deepEqual(app, srvT, where);
        seen.steps++;
      }
    }
    for (const [k, v] of Object.entries(seen)) assert.ok(v > (k === 'draws' ? -1 : 20), `${k}: ${v}`);
  });

  test('deneme rakibi: dolu sütuna oynamaz, dördü tamamlar, rakibin dördünü keser', () => {
    const names = [...PEOPLE];
    let blocks = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const rnd = seeded(seed);
      let t = startTable(sitDown(openTable('p0') as Waiting, 'p1'));
      for (let i = 0; t.status === 'playing'; i++) {
        assert.ok(i < 42);
        const seat = t.turn;
        const scores = colScores(t, seat, 1);
        const col = seat === 1 ? botCol(t, seat, rnd) : Array.from({ length: COLS }, (_, c) => c).filter((c) => restRow(t.board, c) >= 0)[rnd(COLS) % Math.max(1, scores.filter((s) => s !== null).length)];
        assert.ok(restRow(t.board, col) >= 0, `dolu sütun (${seed})`);
        if (seat === 1) {
          // A line of its own within reach is always taken; failing that, the other side's is always stopped.
          const mine = Array.from({ length: COLS }, (_, c) => c).filter((c) => restRow(t.board, c) >= 0 && lineThrough(t.board.map((v, k) => (k === cellOf(c, restRow(t.board, c)) ? t.colors[1] : v)), cellOf(c, restRow(t.board, c))));
          const theirs = Array.from({ length: COLS }, (_, c) => c).filter((c) => restRow(t.board, c) >= 0 && lineThrough(t.board.map((v, k) => (k === cellOf(c, restRow(t.board, c)) ? t.colors[0] : v)), cellOf(c, restRow(t.board, c))));
          if (mine.length) assert.ok(mine.includes(col), `kazanan sütun (${seed}, ${i})`);
          else if (theirs.length === 1) {
            assert.equal(col, theirs[0], `kesilecek sütun (${seed}, ${i})`);
            blocks++;
          }
        }
        const r = moveTable(t, seat, { col }, names);
        assert.ok(r.ok);
        t = r.table;
      }
    }
    assert.ok(blocks > 10, `kesme: ${blocks}`);
  });
});
