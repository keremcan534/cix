/// <reference types="node" />
// XOX: practice games are played with the app's own copy of the rules (lib/room-games/xox, on the seam copied in
// lib/room-games/seam) and a live room shows the server's (server/api/room-games/xox.mjs behind
// room-games-rules.mjs). Hundreds of seeded hands go through both, step for step, with run-out turns, players
// leaving and refused moves in between; then the practice opponent.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { MoveResult, Rnd, TableBase } from '@/lib/room-games/seam';
import { LINES, META, botCell, leaveTable, moveTable, openTable, sitDown, startTable, timeoutTable, xoxLine, type Mark, type XoxMove, type XoxState, type XoxTable } from '@/lib/room-games/xox';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as rules from '../../server/api/room-games-rules.mjs';
import * as server from '../../server/api/room-games/xox.mjs';

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
const none: Rnd = () => assert.fail('XOX’ta çekiliş yok');

type Waiting = TableBase<'xox'> & Partial<XoxState>;
const srv = {
  open: (opener: string) => rules.openTable('xox', opener, undefined) as unknown as Waiting,
  start: (t: Waiting) => rules.startTable(t, none) as unknown as XoxTable,
  move: (t: XoxTable, seat: number, m: unknown, names: string[]) => rules.moveTable(t, seat, m, names, none) as unknown as MoveResult<XoxTable>,
  timeout: (t: XoxTable, names: string[]) => rules.timeoutTable(t, names, none) as unknown as XoxTable,
  leave: <T extends Waiting>(t: T, seat: number, names: string[]) => rules.leaveTable(t, seat, names) as unknown as T,
};

describe('XOX kuralları: uygulama ile sunucu aynı oyunu oynar', () => {
  test('çizgiler ve sabitler aynı', () => {
    assert.deepEqual([LINES, { ...META }], [server.LINES, server.meta]);
    assert.deepEqual(rules.TABLE_GAMES.xox, server.meta);
    assert.deepEqual(openTable('p0'), srv.open('p0'));
  });

  test('yüzlerce el: her işarette iki taraf aynı masayı verir (süresi dolan, kalkan oyuncu, reddedilen hamle dahil)', () => {
    const seen = { steps: 0, hands: 0, timeouts: 0, leaves: 0, refused: 0, lines: 0, draws: 0 };
    for (let seed = 1; seed <= 400; seed++) {
      const next = seeded(seed);
      let names = ['Ayşe', 'Bora'];
      let app = startTable(sitDown(openTable('p0') as Waiting, 'p1'));
      let srvT = srv.start(sitDown(srv.open('p0'), 'p1'));
      assert.deepEqual(app, srvT, `el başı (${seed})`);
      seen.hands++;
      for (let i = 0; i < 80; i++) {
        const where = `tohum ${seed}, adım ${i}`;
        if (app.status === 'over') {
          assert.deepEqual(xoxLine(app.board), server.xoxLine(srvT.board), where);
          if (xoxLine(app.board)) seen.lines++;
          else if (app.winner === null) seen.draws++;
          if (app.seats.length < 2 || next(3) === 0) break;
          [app, srvT] = [startTable(app), srv.start(srvT)];
          assert.deepEqual(app, srvT, where);
          seen.hands++;
          continue;
        }
        const roll = next(1000);
        const seat = app.turn;
        if (roll < 15) {
          const gone = next(2);
          [app, srvT] = [leaveTable(app, gone, names), srv.leave(srvT, gone, names)];
          names = names.filter((_, k) => k !== gone);
          seen.leaves++;
        } else if (roll < 50) {
          [app, srvT] = [timeoutTable(app, names), srv.timeout(srvT, names)];
          seen.timeouts++;
        } else if (roll < 130) {
          const taken = app.board.findIndex(Boolean);
          const bad: [number, unknown][] = [[1 - seat, { cell: 4 }], [seat, { cell: 9 }], [seat, { cell: -1 }], [seat, { cell: '4' }], [seat, {}], [seat, null], ...(taken >= 0 ? [[seat, { cell: taken }] as [number, unknown]] : [])];
          const [who, m] = bad[next(bad.length)];
          const [a, s] = [moveTable(app, who, m as XoxMove, names), srv.move(srvT, who, m, names)];
          assert.equal(a.ok, false, where);
          assert.deepEqual(a, s, where);
          seen.refused++;
        } else {
          const free = app.board.flatMap((v, k) => (v ? [] : [k]));
          const cell = free[next(free.length)];
          const [a, s] = [moveTable(app, seat, { cell }, names), srv.move(srvT, seat, { cell }, names)];
          assert.ok(a.ok, where);
          assert.deepEqual(a, s, where);
          app = a.table;
          srvT = (s as { table: XoxTable }).table;
        }
        assert.deepEqual(app, srvT, where);
        seen.steps++;
      }
    }
    for (const [k, v] of Object.entries(seen)) assert.ok(v > 20, `${k}: ${v}`);
  });

  test('deneme rakibi: üçlüsünü tamamlar, rakibinkini keser, yoksa ortayı alır; dolu kareye oynamaz', () => {
    const b = (s: string) => [...s].map((ch) => (ch === '.' ? null : (ch as Mark)));
    const any: Rnd = () => 0;
    assert.equal(botCell(b('OO.XX....'), 'O', any), 2, 'kendi üçlüsü önce');
    assert.equal(botCell(b('XX..O....'), 'O', any), 2, 'rakibi keser');
    assert.equal(botCell(b('X........'), 'O', any), 4, 'orta');
    assert.equal(botCell(b('....X....'), 'O', any), 0);
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = seeded(seed);
      let t = startTable(sitDown(openTable('p0') as Waiting, 'p1'));
      for (let i = 0; t.status === 'playing'; i++) {
        assert.ok(i < 9);
        const free = t.board.flatMap((v, k) => (v ? [] : [k]));
        const cell = t.turn === 1 ? botCell(t.board, 'O', rnd) : free[rnd(free.length)];
        assert.ok(free.includes(cell), `dolu kare (${seed})`);
        const r = moveTable(t, t.turn, { cell }, ['Sen', 'Rakip']);
        assert.ok(r.ok);
        t = r.table;
      }
    }
  });
});
