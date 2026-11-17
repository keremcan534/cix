/// <reference types="node" />
// Canlı Yörünge: the screen draws the climb the server pays (lib/rocket-live ↔ server/api/rocket-live-rules.mjs, number
// for number), reads the server's round defensively (a malformed answer or line event is left out, never a crash),
// and says where the round stands by the server's clock: the countdown, the engine lighting, the climb, the crash.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { RocketRound, RocketView } from '@/lib/api';
import { bandCounts, momentOf, mySeat, newer, offsetOf, readGame, readMine, readRound, readSeat, readView, viewOfEvent } from '@/lib/live/rocket-live-core';
import * as app from '@/lib/rocket-live';
// A plain JavaScript module of the server; TypeScript reads it through allowJs.
import * as server from '../../server/api/rocket-live-rules.mjs';

describe('Canlı Yörünge kuralları sunucuyla aynı', () => {
  test('sabitler, patlama noktası, ulaşma şansı, tırmanış ve ödeme', () => {
    for (const k of ['LIVE_DRAW', 'LIVE_MAX', 'RATE', 'AUTO_MIN', 'AUTO_MAX', 'HOUSE_PCT'] as const) assert.equal(app[k], server[k], k);
    for (const ret of [97, 60, 40, 10])
      for (const d of [0, 1, 2, 99, 1234, 399_999, 400_000, 599_999, 999_999]) assert.equal(app.crashOf(d, ret), server.crashOf(d, ret), `${ret}/${d}`);
    for (const ret of [97, 40]) for (const x of [0, 100, 101, 150, 215, 1000, 99_999, 100_000, 100_001]) assert.equal(app.reachChance(x, ret), server.reachChance(x, ret), `${ret}/${x}`);
    for (const rate of [app.RATE, 1, 3]) {
      for (const ms of [0, 1, 500, 9242, 30_701, 92_000]) assert.equal(app.multAt(ms, rate), server.multAt(ms, rate), `${rate}/${ms}`);
      for (const x of [100, 101, 200, 215, 1000, 100_000]) assert.equal(app.msTo(x, rate), server.msTo(x, rate), `${rate}/${x}`);
    }
    for (const [f, x] of [
      [1000, 215],
      [250, 133],
      [25_000, 100_000],
    ])
      assert.equal(app.payoutOf(f, x), server.payoutOf(f, x));
    // The screen's automatic choices are all ones the server takes.
    for (const x of app.AUTO_CHOICES) assert.equal(server.autoOf(x / 100), x);
  });

  test('çarpanın yazılışı', () => {
    assert.deepEqual([app.mulText(100), app.mulText(215), app.mulText(1000), app.mulText(100_000)], ['1,00×', '2,15×', '10,00×', '1.000,00×']);
  });
});

const ROUND: RocketRound = { id: 7, phase: 'fly', ret: 40, betUntil: 10_000, launchAt: 11_000, crash: null, players: 2, fuel: 1250 };
const VIEW = {
  v: 3,
  now: 12_000,
  rate: 1,
  round: ROUND,
  players: [
    { k: 41, n: 'Ali**', b: 1000, a: null, c: null, p: 0 },
    { k: 42, n: 'Ber**', b: 250, a: 150, c: 150, p: 375 },
  ],
  last: [300, 120, 100],
};

describe('Sunucunun turunu okuma', () => {
  test('düzgün tur olduğu gibi okunur', () => {
    const v = readView(VIEW)!;
    assert.deepEqual(v.round, ROUND);
    assert.equal(v.players.length, 2);
    assert.deepEqual(v.last, [300, 120, 100]);
  });

  test('bozuk cevap atlanır, çökmez', () => {
    for (const bad of [null, 5, 'x', [], {}, { now: 'a', rate: 1 }, { now: 1, rate: 0 }, { now: 1, rate: 1, round: { id: 'x' } }]) assert.equal(readView(bad), null, JSON.stringify(bad));
    const odd = readView({ ...VIEW, players: [null, { k: 1 }, { k: 2, n: 'A**', b: -5 }, VIEW.players[0], 'x'], last: [50, 'a', 300] })!;
    assert.deepEqual(
      odd.players.map((p) => p.k),
      [41],
    );
    assert.deepEqual(odd.last, [300]);
    assert.equal(readRound({ ...ROUND, phase: 'boom' }), null);
    assert.equal(readRound({ ...ROUND, ret: 400 })!.ret, 40);
    assert.equal(readSeat({ k: 1, n: 'Çok uzun bir isim burada**', b: 10, a: 50, c: -1, p: -3 })!.n.length, 20);
    assert.deepEqual(readSeat({ k: 1, n: 'A**', b: 10, a: 50, c: -1, p: -3 }), { k: 1, n: 'A**', b: 10, a: null, c: null, p: 0 });
    assert.equal(readMine({ k: 'x' }), null);
    assert.deepEqual(readMine({ k: 41, fuel: 1000, onBoard: 1000, auto: null, cashed: null, payout: 0 }), { k: 41, fuel: 1000, onBoard: 1000, auto: null, cashed: null, payout: 0 });
    assert.deepEqual(readGame({ active: true, bets: [250, 'x', -1, 1000] })!.bets, [250, 1000]);
    assert.equal(readGame(null), null);
  });

  test('canlı hattın olayı: yalnız roket olayındaki tur', () => {
    assert.deepEqual(viewOfEvent({ type: 'rocket', round: JSON.stringify(VIEW) })?.round, ROUND);
    assert.equal(viewOfEvent({ type: 'rocket', round: '{bozuk' }), null);
    assert.equal(viewOfEvent({ type: 'win', round: JSON.stringify(VIEW) }), null);
    assert.equal(viewOfEvent({ type: 'rocket', round: 5 }), null);
  });

  test('yeni olan kalır: sonraki tur, aynı turun sonraki hâli', () => {
    const v = readView(VIEW)!;
    assert.equal(newer(null, v), true);
    assert.equal(newer(v, { ...v, v: 2 }), false);
    assert.equal(newer(v, { ...v, v: 4 }), true);
    assert.equal(newer(v, { ...v, v: 1, round: { ...ROUND, id: 8, phase: 'bet' } }), true);
    assert.equal(newer(v, { ...v, v: 9, round: { ...ROUND, id: 6 } }), false);
  });
});

describe('Turun anı, sunucunun saatine göre', () => {
  const at = (phase: string, extra: object = {}) => readView({ ...VIEW, round: { ...ROUND, phase, ...extra } }) as RocketView;
  test('geri sayım, ateşleme, tırmanış, patlama', () => {
    assert.deepEqual(momentOf(null, 0), { kind: 'idle' });
    assert.deepEqual(momentOf(at('bet'), 7_500), { kind: 'bet', left: 2_500 });
    assert.deepEqual(momentOf(at('bet'), 12_000), { kind: 'bet', left: 0 });
    assert.deepEqual(momentOf(at('fly'), 10_500), { kind: 'ignite', left: 500 });
    // e^t at rate 1: 0,693 s after the launch it is 2,00×.
    assert.deepEqual(momentOf(at('fly'), 11_694), { kind: 'fly', x: 200, ms: 694 });
    assert.deepEqual(momentOf(at('done', { crash: 215 }), 99_999), { kind: 'done', crash: 215 });
    assert.deepEqual(momentOf(at('done'), 0), { kind: 'done', crash: 100 });
  });

  test('saat farkı, benim koltuğum, bantlar', () => {
    assert.equal(offsetOf(10_000, 2_000, 2_100), 7_950);
    const v = readView(VIEW)!;
    assert.equal(mySeat(v, { k: 42, fuel: 250, onBoard: 0, auto: 150, cashed: 150, payout: 375 })?.p, 375);
    assert.equal(mySeat(v, null), null);
    assert.deepEqual(bandCounts([100, 150, 250, 400, 700, 1500, 100_000], 10), [2, 1, 1, 1, 2]);
    assert.deepEqual(bandCounts([100, 150, 250], 1), [1, 0, 0, 0, 0]);
  });
});
