/// <reference types="node" />
// Renk Kartları: practice games are played with the app's own copy of the rules (lib/room-games/cards, on the seam
// copied in lib/room-games/seam) and a live room shows the server's (server/api/room-games/cards.mjs behind
// room-games-rules.mjs). If the two drift apart, a practice game would teach rules the room doesn't play, and the
// table would raise cards the server refuses. So hundreds of seeded hands go through both, step for step, with
// run-out turns, players leaving and refused moves in between; then what each seat is told, and the practice
// opponents' choice of a card.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { COLOR_NAMES, DECK, HAND, META, MISSES, TURN_MS, cardName, cardOf, fits, leaveTable, moveTable, openTable, pickCard, seatAfter, sitDown, startTable, timeoutTable, viewOf, type CardsMove, type CardsState, type CardsTable } from '@/lib/room-games/cards';
import type { MoveResult, Rnd, TableBase } from '@/lib/room-games/seam';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as rules from '../../server/api/room-games-rules.mjs';
import * as server from '../../server/api/room-games/cards.mjs';

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
type Waiting = TableBase<'cards'> & Partial<CardsState>;
const srv = {
  open: (opener: string) => rules.openTable('cards', opener, undefined) as unknown as Waiting,
  start: (t: Waiting, rnd: Rnd) => rules.startTable(t, rnd) as unknown as CardsTable,
  move: (t: CardsTable, seat: number, m: unknown, names: string[], rnd: Rnd) => rules.moveTable(t, seat, m, names, rnd) as unknown as MoveResult<CardsTable>,
  timeout: (t: CardsTable, names: string[], rnd: Rnd) => rules.timeoutTable(t, names, rnd) as unknown as CardsTable,
  leave: <T extends Waiting>(t: T, seat: number, names: string[]) => rules.leaveTable(t, seat, names) as unknown as T,
  view: (t: Waiting, seat: number) => rules.viewOf(t, seat) as unknown,
};
const PEOPLE = ['Ayşe', 'Bora', 'Cem', 'Deniz', 'Ece', 'Fırat'];
const ALL = Array.from({ length: DECK }, (_, id) => id);

describe('Renk Kartları kuralları: uygulama ile sunucu aynı oyunu oynar', () => {
  test('deste, sabitler ve kartın uyup uymadığı aynı', () => {
    assert.deepEqual([DECK, HAND, COLOR_NAMES, { ...META }], [server.DECK, server.HAND, server.COLOR_NAMES, server.meta]);
    assert.deepEqual([rules.TABLE_GAMES.cards, MISSES, TURN_MS], [server.meta, rules.MISSES, rules.TURN_MS]);
    for (const id of ALL) {
      assert.deepEqual(cardOf(id), server.cardOf(id), `kart ${id}`);
      assert.equal(cardName(id), server.cardName(id));
    }
    for (const id of ALL) for (let color = 0; color < 4; color++) for (const top of [0, 17, 18, 21, 23, 40, 70, 95, 96, 101]) assert.equal(fits(id, color, top), server.fits(id, color, top), `${id} ${color} ${top}`);
    assert.deepEqual(openTable('p0'), srv.open('p0'));
  });

  test('aynı karılmış desteyle yüzlerce el: her adımda iki taraf aynı masayı ve aynı görünümü verir', () => {
    const seen = { steps: 0, hands: 0, timeouts: 0, leaves: 0, refused: 0, finished: 0, jokers: 0, mixed: 0, drawn: 0 };
    for (let seed = 1; seed <= 260; seed++) {
      // Three generators: what happens next, and the same shuffles for each side.
      const next = seeded(seed);
      const appRnd = seeded(seed * 7919 + 13);
      const srvRnd = seeded(seed * 7919 + 13);
      const n = 2 + next(5);
      let names = PEOPLE.slice(0, n);
      let waitingApp: Waiting = openTable('p0');
      let waitingSrv = srv.open('p0');
      for (let i = 1; i < n; i++) [waitingApp, waitingSrv] = [sitDown(waitingApp, `p${i}`), sitDown(waitingSrv, `p${i}`)];
      let app = startTable(waitingApp, appRnd);
      let srvT = srv.start(waitingSrv, srvRnd);
      assert.deepEqual(app, srvT, `el başı (${seed})`);
      seen.hands++;
      for (let i = 0; i < 4000; i++) {
        const where = `tohum ${seed}, adım ${i}`;
        if (app.status === 'over') {
          if (app.winner !== null && app.hands[app.winner].length === 0) seen.finished++;
          // Sometimes somebody gets up after the hand, sometimes another hand is played with whoever is left.
          if (next(4) === 0 && app.seats.length > 1) {
            const seat = next(app.seats.length);
            [app, srvT] = [leaveTable(app, seat, names), srv.leave(srvT, seat, names)];
            names = names.filter((_, k) => k !== seat);
            assert.deepEqual(app, srvT, where);
          }
          if (app.seats.length < META.min || app.deal >= 3 || next(3) === 0) break;
          [app, srvT] = [startTable(app, appRnd), srv.start(srvT, srvRnd)];
          assert.deepEqual(app, srvT, where);
          seen.hands++;
          continue;
        }
        const roll = next(1000);
        const seat = app.turn;
        const top = app.discard[app.discard.length - 1];
        if (roll < 4) {
          const gone = next(app.seats.length);
          [app, srvT] = [leaveTable(app, gone, names), srv.leave(srvT, gone, names)];
          names = names.filter((_, k) => k !== gone);
          seen.leaves++;
        } else if (roll < 90) {
          [app, srvT] = [timeoutTable(app, names, appRnd), srv.timeout(srvT, names, srvRnd)];
          // The third run-out turn in a row took the seat away.
          if (app.seats.length < names.length) names = names.filter((_, k) => k !== seat);
          seen.timeouts++;
        } else if (roll < 150) {
          // A move that must be refused, with the same words.
          const wrong = app.hands[seat].find((id) => !fits(id, app.color, top));
          const joker = app.hands[seat].find((id) => cardOf(id).color === null && (app.drawn === null || app.drawn === id));
          const bad: [number, unknown][] = [
            [(seat + 1) % app.seats.length, { draw: true }],
            [seat, { card: ALL.find((id) => !app.hands[seat].includes(id)) }],
            [seat, app.drawn === null ? { pass: true } : { draw: true }],
            [seat, {}],
            [seat, null],
            ...(wrong !== undefined ? [[seat, { card: wrong, color: 1 }] as [number, unknown]] : []),
            ...(joker !== undefined ? [[seat, { card: joker }] as [number, unknown], [seat, { card: joker, color: 7 }] as [number, unknown]] : []),
          ];
          const [who, m] = bad[next(bad.length)];
          const [a, s] = [moveTable(app, who, m as CardsMove, names, appRnd), srv.move(srvT, who, m, names, srvRnd)];
          assert.equal(a.ok, false, `${where} ${JSON.stringify(m)}`);
          assert.deepEqual(a, s, where);
          seen.refused++;
        } else {
          const can = app.drawn !== null ? [app.drawn] : app.hands[seat].filter((id) => fits(id, app.color, top));
          // The practice opponents' choice in every third game, any legal move in the others.
          let m: CardsMove;
          const pick = pickCard(app, seat);
          assert.deepEqual(pick, server.pickCard(srvT, seat), where);
          if (seed % 3 === 0) m = pick ?? { draw: true };
          else if (app.drawn !== null) m = next(3) ? { card: app.drawn, color: next(4) } : { pass: true };
          else if (!can.length || next(10) === 0) m = { draw: true };
          else m = { card: can[next(can.length)], color: next(4) };
          const [a, s] = [moveTable(app, seat, m, names, appRnd), srv.move(srvT, seat, m, names, srvRnd)];
          assert.ok(a.ok, where);
          assert.deepEqual(a, s, where);
          app = a.table;
          srvT = (s as { table: CardsTable }).table;
          if (app.last?.mixed) seen.mixed++;
          if (app.last?.card != null && cardOf(app.last.card).color === null) seen.jokers++;
          if (app.drawn !== null) seen.drawn++;
        }
        assert.deepEqual(app, srvT, where);
        // What each seat is told, and what someone watching is.
        for (let s = -1; s < app.seats.length; s++) assert.deepEqual(viewOf(app, s), srv.view(srvT, s), `${where}, koltuk ${s}`);
        if (app.status === 'playing') assert.equal(seatAfter(app, app.turn) < app.seats.length, true);
        seen.steps++;
      }
    }
    for (const [k, v] of Object.entries(seen)) assert.ok(v > (k === 'mixed' ? 3 : 30), `${k}: ${v}`);
  });

  test('görünüm: başkasının kartı, destenin içi ve çekilen kart gizli', () => {
    const t = startTable(sitDown(sitDown(openTable('p0'), 'p1'), 'p2'), seeded(5));
    const mine = viewOf(t, 1);
    assert.deepEqual([mine.mine, mine.counts, mine.pile, mine.top], [t.hands[1], [HAND, HAND, HAND], DECK - 3 * HAND - 1, t.discard[0]]);
    assert.deepEqual(['hands' in mine, 'draw' in mine, 'discard' in mine], [false, false, false]);
    assert.equal(viewOf(t, -1).mine, null);
    assert.deepEqual(viewOf(openTable('p0'), 0), openTable('p0'));
  });

  test('deneme rakipleri kurala uyan kartı atar ve eli bitirir', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = seeded(seed);
      const n = 2 + (seed % 5);
      const names = PEOPLE.slice(0, n);
      let t = startTable(Array.from({ length: n - 1 }, (_, i) => `p${i + 1}`).reduce(sitDown, openTable('p0') as Waiting), rnd);
      for (let i = 0; t.status === 'playing'; i++) {
        assert.ok(i < 3000, `el bitmiyor (${seed})`);
        const m: CardsMove = pickCard(t, t.turn) ?? { draw: true };
        const r = moveTable(t, t.turn, m, names, rnd);
        assert.ok(r.ok, JSON.stringify(m));
        t = r.table;
      }
      assert.equal(t.hands[t.winner as number].length, 0);
      assert.deepEqual([...t.hands.flat(), ...t.draw, ...t.discard].sort((a, b) => a - b), ALL);
    }
  });
});
