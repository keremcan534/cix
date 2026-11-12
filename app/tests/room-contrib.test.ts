/// <reference types="node" />
// Oda katkı sıralaması (lib/room-contrib): ranking, my place, the demo room's sample lists and the texts.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { contribAmount, demoBoard, emptyNote, placeOf, pointsRule, rankScores, resetNote, totalsBy } from '@/lib/room-contrib';

const PEOPLE = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];

describe('Katkı sıralaması', () => {
  test('en çok puan önde; eşitlikte önce gelen; 0 puan listede yok', () => {
    const rows = rankScores([
      ['a', 50],
      ['b', 200],
      ['c', 50],
      ['d', 0],
    ]);
    assert.deepEqual(rows, [
      { uid: 'b', score: 200, rank: 1 },
      { uid: 'a', score: 50, rank: 2 },
      { uid: 'c', score: 50, rank: 3 },
    ]);
    assert.deepEqual(placeOf(rows, 'c'), { rank: 3, score: 50 });
    assert.deepEqual(placeOf(rows), { rank: null, score: 0 });
  });

  test('hediye günlüğü gönderene ya da alana göre toplanır', () => {
    const log = [
      { from: 'me', to: 'u1', coins: 10 },
      { from: 'u2', to: 'u1', coins: 200 },
      { from: 'me', to: 'u3', coins: 50 },
    ];
    assert.deepEqual([...totalsBy(log, 'sent')], [
      ['me', 60],
      ['u2', 200],
    ]);
    assert.deepEqual([...totalsBy(log, 'received')], [
      ['u1', 210],
      ['u3', 50],
    ]);
  });

  test('örnek oda: her açılışta aynı; saat ⊂ gün ⊂ hafta; oturumdaki hediyeler her döneme eklenir', () => {
    const board = (period: 'hour' | 'day' | 'week', session = {}) => demoBoard({ roomId: 'r1', side: 'sent', period, people: PEOPLE, session });
    assert.deepEqual(board('day'), board('day'));
    const hour = board('hour');
    const day = board('day');
    const week = board('week');
    assert.ok(hour.length < day.length && day.length <= week.length, `${hour.length} ${day.length} ${week.length}`);
    assert.equal(week.length, PEOPLE.length);
    const score = (rows: typeof week, uid: string) => rows.find((r) => r.uid === uid)?.score ?? 0;
    for (const uid of PEOPLE) {
      assert.ok(score(hour, uid) <= score(day, uid) && score(day, uid) <= score(week, uid), uid);
      assert.equal(score(week, uid) % 10, 0);
    }
    // Another room, another list; the other side too.
    assert.notDeepEqual(day, demoBoard({ roomId: 'r2', side: 'sent', period: 'day', people: PEOPLE, session: {} }));
    assert.notDeepEqual(day, demoBoard({ roomId: 'r1', side: 'received', period: 'day', people: PEOPLE, session: {} }));
    // My gifts of this visit put me on every list; someone already on it gets them added.
    const mine = { me: 1_000_000, u1: 5 };
    for (const p of ['hour', 'day', 'week'] as const) {
      const rows = board(p, mine);
      assert.deepEqual(placeOf(rows), { rank: 1, score: 1_000_000 });
      assert.equal(score(rows, 'u1'), score(board(p), 'u1') + 5);
    }
    // Nobody to sample: only this visit's gifts.
    assert.deepEqual(demoBoard({ roomId: 'r1', side: 'received', period: 'hour', people: [], session: new Map([['u4', 30]]) }), [{ uid: 'u4', score: 30, rank: 1 }]);
  });

  test('metinler kısa ve dönemine göre', () => {
    assert.equal(pointsRule('sent'), 'Bu odada gönderilen hediyelerde 1 jeton = 1 puan');
    assert.equal(pointsRule('received'), 'Bu odada alınan hediyelerde 1 jeton = 1 puan');
    assert.equal(resetNote('hour'), 'Her saat başı yenilenir · Türkiye saati');
    assert.equal(resetNote('week'), 'Her pazartesi 00:00’da yenilenir · Türkiye saati');
    assert.equal(emptyNote('sent', 'day'), 'Bugün henüz hediye gönderilmedi');
    assert.equal(emptyNote('received', 'hour'), 'Bu saat henüz hediye alan yok');
    assert.equal(contribAmount(12_450), '12.450');
    assert.equal(contribAmount(999_999), '999.999');
    assert.equal(contribAmount(1_250_000), '1,25 Mn');
    assert.equal(contribAmount(12_340_000), '12,3 Mn');
  });
});
