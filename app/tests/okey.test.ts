/// <reference types="node" />
// Okey engine (lib/okey): deck, dealing, okey from the indicator, finish detection with runs, groups, pairs
// and jokers, turns, bots playing whole hands, and what spectators may see.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove,
  autoPlay,
  arrangePairs,
  arrangeRuns,
  botDiscard,
  botMove,
  deal,
  fillBots,
  finishOf,
  isWild,
  makeDeck,
  meldsOf,
  moveOnRack,
  okeyOf,
  openTable,
  play,
  playAs,
  sit,
  stand,
  startHand,
  syncRack,
  takeable,
  viewFor,
  watch,
  winningDiscard,
  type Face,
  type Game,
  type Tile,
} from '@/lib/okey';

/** Seeded random (mulberry32) so dealt hands are repeatable. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextId = 1000;
const C = { Y: 0, B: 1, K: 2, R: 3 } as const;
/** "R5" = red 5, "F" = false joker. */
const tile = (code: string): Tile => (code === 'F' ? { id: nextId++, c: -1, n: 0, fake: true } : { id: nextId++, c: C[code[0] as keyof typeof C], n: Number(code.slice(1)) });
const hand = (codes: string) => codes.split(/\s+/).filter(Boolean).map(tile);
// Okey is black 13 in most tests (indicator black 12).
const OKEY: Face = { c: C.K, n: 13 };

describe('deck and deal', () => {
  test('106 tiles: 4 colors × 1–13 twice, plus two false jokers', () => {
    const deck = makeDeck();
    assert.equal(deck.length, 106);
    assert.equal(deck.filter((t) => t.fake).length, 2);
    for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) assert.equal(deck.filter((t) => t.c === c && t.n === n).length, 2);
    assert.equal(new Set(deck.map((t) => t.id)).size, 106);
  });

  test('the starter gets 15 tiles, others 14; indicator is never a false joker; nothing lost', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = deal(seed % 4, seeded(seed));
      g.hands.forEach((h, i) => assert.equal(h.length, i === g.starter ? 15 : 14));
      assert.ok(!g.indicator.fake);
      assert.equal(g.pile.length, 106 - 57 - 1);
      const all = [...g.pile, g.indicator, ...g.hands.flat()].map((t) => t.id);
      assert.equal(new Set(all).size, 106);
      assert.equal(g.turn, g.starter);
      assert.equal(g.phase, 'discard', 'the starter skips the first draw');
    }
  });

  test('okey is one above the indicator, same color; 13 wraps to 1', () => {
    assert.deepEqual(okeyOf({ c: C.R, n: 5 }), { c: C.R, n: 6 });
    assert.deepEqual(okeyOf({ c: C.B, n: 13 }), { c: C.B, n: 1 });
    const g = deal(0, seeded(7));
    assert.deepEqual(g.okey, okeyOf(g.indicator));
    assert.ok(isWild({ id: 1, c: g.okey.c, n: g.okey.n }, g.okey));
    assert.ok(!isWild({ id: 2, c: -1, n: 0, fake: true }, g.okey), 'a false joker is not wild');
  });
});

describe('finish detection', () => {
  test('runs and groups without jokers', () => {
    assert.equal(finishOf(hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 R11'), OKEY), 'sets');
    assert.equal(finishOf(hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 R12'), OKEY), null);
  });

  test('12-13-1 is a run, 13-1-2 is not', () => {
    assert.equal(finishOf(hand('Y12 Y13 Y1  B7 B8 B9  Y5 B5 R5  B11 B12 B13 Y2 Y3'), OKEY), null);
    assert.equal(finishOf(hand('Y12 Y13 Y1  B7 B8 B9  Y5 B5 R5  B11 B12 B13 R2 R3'), OKEY), null);
    assert.equal(finishOf(hand('Y11 Y12 Y13 Y1  B7 B8 B9  Y5 B5 R5  B10 B11 B12 B13'), OKEY), 'sets');
    assert.equal(finishOf(hand('Y13 Y1 Y2  B7 B8 B9  Y5 B5 R5  B10 B11 B12 B13 R1'), OKEY), null);
  });

  test('a group may not repeat a color', () => {
    assert.equal(finishOf(hand('R4 R4 B4  B7 B8 B9  Y1 Y2 Y3  Y10 Y11 Y12 B12 R12'), OKEY), null);
  });

  test('okeys fill a gap in a run, the end of a run, or a missing color in a group', () => {
    // K13 is the okey: fills R3 in a run, and Y9 in a group.
    assert.equal(finishOf(hand('R1 R2 K13 R4  B9 R9 K13  Y5 B5 K5  Y11 B11 K11 R11'), OKEY), 'sets');
    // Both okeys extend runs.
    assert.equal(finishOf(hand('R1 R2 R3 K13  B7 B8 K13  Y5 B5 K5  Y11 B11 K11 R11'), OKEY), 'sets');
    // Without the okeys these hands do not finish.
    assert.equal(finishOf(hand('R1 R2 Y8 R4  B9 R9 B1  Y5 B5 K5  Y11 B11 K11 R11'), OKEY), null);
  });

  test('a false joker stands for the okey value (black 13), not as a wild', () => {
    // F = black 13 here: K11 K12 F is a run.
    assert.equal(finishOf(hand('K11 K12 F  B7 B8 B9  Y5 B5 R5  Y1 Y2 Y3 Y4 Y5'), OKEY), 'sets');
    // F is not wild: it can't stand in as red 3.
    assert.equal(finishOf(hand('R1 R2 F  B7 B8 B9  Y5 B5 R5  Y1 Y2 Y3 Y4 Y6'), OKEY), null);
    // Group of 13s with the false joker as black 13.
    assert.equal(finishOf(hand('Y13 B13 F  B7 B8 B9 B10  Y5 B5 R5  Y1 Y2 Y3 Y4'), OKEY), 'sets');
  });

  test('seven pairs, with an okey pairing any tile', () => {
    assert.equal(finishOf(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 R13 R13 Y6 Y6 B10 B10'), OKEY), 'pairs');
    assert.equal(finishOf(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 R13 R13 Y6 Y6 B10 K13'), OKEY), 'pairs');
    assert.equal(finishOf(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 R13 R13 Y6 K13 B10 K13'), OKEY), 'pairs');
    assert.equal(finishOf(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 R13 R12 Y6 Y6 B10 B10'), OKEY), null);
    // Two false jokers are a pair of black 13s.
    assert.equal(finishOf(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 F F Y6 Y6 B10 B10'), OKEY), 'pairs');
  });

  test('meldsOf lays a finished hand out as its sets or pairs', () => {
    const h = hand('R1 R2 K13 R4  B9 R9 K13  Y5 B5 K5  Y11 B11 K11 R11');
    const sets = meldsOf(h, OKEY);
    assert.ok(sets);
    assert.equal(sets.flat().length, 14);
    assert.equal(new Set(sets.flat().map((t) => t.id)).size, 14);
    assert.ok(sets.every((x) => x.length >= 3));
    const run = sets.find((x) => x.some((t) => t.c === C.R && t.n === 1))!;
    assert.deepEqual(
      run.map((t) => (isWild(t, OKEY) ? 'W' : `${t.c}-${t.n}`)),
      ['3-1', '3-2', 'W', '3-4'],
    );
    const pairs = meldsOf(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 R13 R13 Y6 Y6 B10 K13'), OKEY);
    assert.equal(pairs?.length, 7);
    assert.ok(pairs!.every((p) => p.length === 2));
    assert.equal(meldsOf(hand('R1 R2 Y8 R4  B9 R9 B1  Y5 B5 K5  Y11 B11 K11 R11'), OKEY), null);
  });

  test('winningDiscard finds the one tile to throw from 15', () => {
    const h = hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 R11  Y2');
    const w = winningDiscard(h, OKEY);
    assert.ok(w);
    assert.equal(w.tile.c, C.Y);
    assert.equal(w.tile.n, 2);
    assert.equal(winningDiscard(hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 R6  Y2'), OKEY), null);
  });
});

/** A game with fixed hands: seat 0 to discard, the rest of the deck in the pile. */
function fixed(hand0: Tile[], okey = OKEY): Game {
  const g = deal(0, seeded(3));
  return { ...g, okey, indicator: { id: 9999, c: okey.c, n: okey.n === 1 ? 13 : okey.n - 1 }, hands: [hand0, ...g.hands.slice(1)] };
}

describe('turns', () => {
  test('discard, draw from center or the previous discard, in seat order', () => {
    let g = deal(0, seeded(11));
    assert.equal(applyMove(g, 1, { type: 'discard', tileId: g.hands[1][0].id }).ok, false, 'not your turn');
    assert.equal(applyMove(g, 0, { type: 'draw', from: 'pile' }).ok, false, 'the starter discards first');
    const thrown = g.hands[0][0];
    let r = applyMove(g, 0, { type: 'discard', tileId: thrown.id });
    assert.ok(r.ok);
    g = r.game;
    assert.equal(g.turn, 1);
    assert.equal(g.phase, 'draw');
    assert.equal(takeable(g, 1)?.id, thrown.id);
    r = applyMove(g, 1, { type: 'draw', from: 'discard' });
    assert.ok(r.ok);
    g = r.game;
    assert.equal(g.hands[1].length, 15);
    assert.ok(g.hands[1].some((t) => t.id === thrown.id));
    assert.equal(g.discards[0].length, 0);
    assert.equal(applyMove(g, 1, { type: 'draw', from: 'pile' }).ok, false, 'one draw per turn');
    r = applyMove(g, 1, { type: 'discard', tileId: g.hands[1][3].id });
    assert.ok(r.ok);
    const pile = r.game.pile.length;
    r = applyMove(r.game, 2, { type: 'draw', from: 'pile' });
    assert.ok(r.ok);
    assert.equal(r.game.pile.length, pile - 1);
  });

  test('discarding into a finished hand wins; an okey discard doubles the points', () => {
    const plain = fixed(hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 R11  Y2'));
    let r = applyMove(plain, 0, { type: 'discard', tileId: plain.hands[0][14].id });
    assert.ok(r.ok);
    assert.equal(r.game.phase, 'over');
    assert.equal(r.game.winner, 0);
    assert.equal(r.game.finish, 'sets');
    assert.deepEqual(r.game.points, [2, 0, 0, 0]);
    const h = hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 R5  Y11 B11 K11 R11  K13');
    const g2 = fixed(h);
    assert.equal(winningDiscard(h, OKEY)?.tile.n, 13, 'prefers throwing the okey');
    r = applyMove(g2, 0, { type: 'discard', tileId: h[14].id });
    assert.ok(r.ok);
    assert.equal(r.game.okeyFinish, true);
    assert.deepEqual(r.game.points, [4, 0, 0, 0]);
  });

  test('pairs finish doubles the points', () => {
    const g = fixed(hand('R1 R1 B4 B4 Y9 Y9 K2 K2 R13 R13 Y6 Y6 B10 B10 Y3'));
    const r = applyMove(g, 0, { type: 'discard', tileId: g.hands[0][14].id });
    assert.ok(r.ok);
    assert.equal(r.game.finish, 'pairs');
    assert.deepEqual(r.game.points, [4, 0, 0, 0]);
  });

  test('an empty center pile ends the hand without a winner', () => {
    const g = { ...deal(0, seeded(5)), pile: [] };
    const r = applyMove(g, 0, { type: 'discard', tileId: g.hands[0][0].id });
    assert.ok(r.ok);
    assert.equal(r.game.phase, 'over');
    assert.equal(r.game.winner, null);
  });
});

describe('bots', () => {
  test('a bot never throws an okey and throws the winning tile when it can', () => {
    const h = hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 K13  Y2');
    assert.notEqual(botDiscard(h, OKEY).n, 13);
    const win = hand('R1 R2 R3 R4  B7 B8 B9  Y5 B5 K5  Y11 B11 K11 R11  Y2');
    const t = botDiscard(win, OKEY);
    assert.equal(t.c, C.Y);
    assert.equal(t.n, 2);
  });

  test('a bot takes an okey from the previous discard', () => {
    let g = deal(0, seeded(21));
    const okeyTile = { id: 5000, c: g.okey.c, n: g.okey.n };
    g = { ...g, turn: 1, phase: 'draw', discards: [[okeyTile], [], [], []] };
    assert.deepEqual(botMove(g), { type: 'draw', from: 'discard' });
  });

  test('four bots play legal moves until the hand ends', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let g = deal(seed % 4, seeded(seed * 97));
      let guard = 0;
      while (g.phase !== 'over' && guard++ < 400) {
        const seat = g.turn;
        const before = g.hands[seat].length;
        const r = applyMove(g, seat, botMove(g));
        assert.ok(r.ok, r.ok ? '' : r.reason);
        g = r.game;
        const after = g.hands[seat].length;
        assert.ok(after === before + 1 || after === before - 1 || g.phase === 'over');
        const total = g.pile.length + 1 + g.hands.flat().length + g.discards.flat().length;
        assert.equal(total, 106, 'no tile appears or disappears');
      }
      assert.equal(g.phase, 'over');
      if (g.winner !== null) assert.ok(finishOf(g.hands[g.winner], g.okey));
    }
  });
});

describe('table, seats and spectators', () => {
  const me = { id: 'me', name: 'Sen', bot: false };
  const ali = { id: 'u2', name: 'Ali', bot: false };

  test('opening seats the opener; bots fill empty seats so a hand can start', () => {
    let t = openTable('r1', me, 0);
    assert.equal(startHand(t).ok, false);
    const s = sit(t, 2, ali);
    assert.ok(s.ok);
    t = s.table;
    assert.equal(sit(t, 2, { id: 'u3', name: 'Ece', bot: false }).ok, false, 'seat taken');
    t = fillBots(t);
    assert.deepEqual(
      t.seats.map((x) => x?.bot),
      [false, true, false, true],
    );
    const r = startHand(t, seeded(4), 0);
    assert.ok(r.ok);
    assert.equal(r.table.game?.hands[0].length, 15);
    // Between hands a spectator can take a bot's seat (never a person's).
    const swap = sit(t, 1, { id: 'u3', name: 'Ece', bot: false });
    assert.ok(swap.ok);
    assert.equal(swap.table.seats[1]?.id, 'u3');
    assert.equal(sit(t, 0, { id: 'u3', name: 'Ece', bot: false }).ok, false);
  });

  test('spectators see discards, indicator, turn and scores but no hands; players see only their own', () => {
    let t = fillBots(openTable('r1', me, 0));
    t = watch(t, ali);
    const r = startHand(t, seeded(8), 0);
    assert.ok(r.ok);
    t = r.table;
    const spec = viewFor(t, 'u2');
    assert.equal(spec.mySeat, -1);
    assert.deepEqual(spec.myHand, []);
    assert.equal(spec.seats[0].tiles, 15);
    assert.ok(spec.indicator);
    assert.equal(spec.turn, 0);
    assert.equal(JSON.stringify(spec).includes('"hands"'), false);
    const mine = viewFor(t, 'me');
    assert.equal(mine.mySeat, 0);
    assert.deepEqual(
      mine.myHand.map((x) => x.id),
      t.game!.hands[0].map((x) => x.id),
    );
    // Nothing from another seat's hand reaches either view.
    const otherIds = new Set(t.game!.hands.slice(1).flat().map((x) => x.id));
    for (const v of [spec, mine]) {
      assert.ok(v.myHand.every((x) => !otherIds.has(x.id)));
      assert.deepEqual(v.winnerHand, []);
    }
  });

  test('play updates scores at the end; leaving mid-hand hands the seat to a bot', () => {
    let t = fillBots(openTable('r1', me, 0));
    const r = startHand(t, seeded(9), 0);
    assert.ok(r.ok);
    t = r.table;
    assert.equal(sit(t, 1, ali).ok, false, 'no sitting mid-hand');
    const left = stand(t, 'me');
    assert.ok(left.ok);
    assert.equal(left.table.seats[0]?.bot, true);
    t = left.table;
    let guard = 0;
    while (t.game!.phase !== 'over' && guard++ < 400) {
      const p = play(t, t.game!.turn, botMove(t.game!), 0);
      assert.ok(p.ok);
      t = p.table;
    }
    const sum = t.scores.reduce((a, b) => a + b, 0);
    assert.equal(sum, t.game!.points.reduce((a, b) => a + b, 0));
    if (t.game!.winner !== null) assert.equal(viewFor(t, 'u2').winnerHand.length, 14);
  });
});

describe('idle players', () => {
  test('a person who times out twice in a row is replaced by a bot; playing resets the count', () => {
    let t = fillBots(openTable('r1', { id: 'me', name: 'Sen', bot: false }, 0));
    const over = () => t.game!.phase === 'over';
    const r = startHand(t, seeded(12), 0);
    assert.ok(r.ok);
    t = r.table;
    // Turn 1: the table plays for "me" (starter: discard only).
    let a = autoPlay(t, 0);
    assert.ok(a.ok);
    t = a.table;
    assert.equal(t.idle[0], 1);
    while (t.game!.turn !== 0) t = (autoPlay(t, 0) as { ok: true; table: typeof t }).table;
    // Turn 2: "me" plays the draw themselves, which clears the count, then times out on the discard.
    const own = playAs(t, 'me', { type: 'draw', from: 'pile' }, 0);
    assert.ok(own.ok);
    t = own.table;
    assert.equal(t.idle[0], 0);
    assert.equal(playAs(t, 'u9', { type: 'discard', tileId: t.game!.hands[0][0].id }).ok, false, 'spectators cannot move');
    a = autoPlay(t, 0);
    assert.ok(a.ok);
    t = a.table;
    assert.equal(t.idle[0], 1);
    while (t.game!.turn !== 0 && !over()) t = (autoPlay(t, 0) as { ok: true; table: typeof t }).table;
    if (over()) return;
    // Turn 3: times out completely again → a bot takes the seat.
    t = (autoPlay(t, 0) as { ok: true; table: typeof t }).table;
    t = (autoPlay(t, 0) as { ok: true; table: typeof t }).table;
    if (over() && t.game!.winner === 0) return;
    assert.equal(t.seats[0]?.bot, true);
  });
});

describe('rack', () => {
  test('auto-sort places every tile once; runs and pairs sit together', () => {
    const h = hand('R1 R2 R3 B7 B8 B9 Y5 B5 K5 R9 R9 Y12 K13 F B1');
    for (const slots of [arrangeRuns(h, OKEY), arrangePairs(h, OKEY)]) {
      const ids = slots.filter((x) => x !== null);
      assert.equal(ids.length, h.length);
      assert.equal(new Set(ids).size, h.length);
    }
    const runs = arrangeRuns(h, OKEY);
    const at = (code: Tile) => runs.indexOf(code.id);
    assert.equal(at(h[1]) - at(h[0]), 1);
    assert.equal(at(h[2]) - at(h[1]), 1);
    assert.equal(runs.at(-1) === null || runs.filter((x) => x !== null).at(-1) === h[12].id, true, 'okey goes last');
    const pairs = arrangePairs(h, OKEY);
    assert.equal(Math.abs(pairs.indexOf(h[9].id) - pairs.indexOf(h[10].id)), 1);
  });

  test('syncRack keeps positions, removes thrown tiles, adds drawn ones; moveOnRack swaps', () => {
    const h = hand('R1 R2 R3');
    let slots = arrangeRuns(h, OKEY);
    slots = moveOnRack(slots, slots.indexOf(h[0].id), 20);
    assert.equal(slots[20], h[0].id);
    const drawn = tile('Y4');
    const next = syncRack(slots, [h[0], h[2], drawn]);
    assert.equal(next[20], h[0].id);
    assert.equal(next.includes(h[1].id), false);
    assert.equal(next.filter((x) => x === drawn.id).length, 1);
  });
});
