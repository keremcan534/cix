/// <reference types="node" />
// Oda roketi on the phone (lib/room-rocket-core, lib/live/room-bus; server/api/room-rocket.mjs): the room's rocket
// read without trusting it (no five levels: no rocket; a bad prize or person left out), how full a level shows, and
// the server's 'rocket' packets (a launch, then who won), which only the server can send.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { onServerRocket, parseServerRocket, reportSignal, type RocketNews } from '@/lib/live/room-bus';
import { parsePrize, parseRocket, pctText, prizeLabel, rocketPct, shownLevel } from '@/lib/room-rocket-core';

const AVATAR = 'https://130-61-230-94.sslip.io/api/media/f/avatar/00000000-0000-4000-8000-000000000001/a.jpg';
const user = (id: string, name: string) => ({ id, name, avatarUrl: AVATAR });
/** GET /api/rooms/rocket as room-rocket.mjs answers it: Lv.1 launched and paid, Lv.2 filling. */
const answer = () => ({
  on: true,
  day: '2026-11-17',
  resetsAt: '2026-11-17T21:00:00.000Z',
  fuel: 1_200,
  current: 2,
  levels: [
    {
      level: 1,
      goal: 1_000,
      filled: 1_000,
      launched: true,
      launchedAt: '2026-11-17T16:00:00.000Z',
      prizes: [
        { kind: 'item', sku: 'fr-neon', name: 'Neon Halka', itemKind: 'frame', days: 1, winners: 1 },
        { kind: 'coins', amount: 100, winners: 2 },
      ],
      top: [
        { rank: 1, user: user('u-a', 'Ayşe'), coins: 500 },
        { rank: 2, user: user('u-b', 'Burak'), coins: 500 },
      ],
      mine: 500,
    },
    { level: 2, goal: 2_000, filled: 200, launched: false, launchedAt: null, prizes: [{ kind: 'coins', amount: 200, winners: 1 }], top: [{ rank: 1, user: user('u-b', 'Burak'), coins: 200 }], mine: 0 },
    ...[3, 4, 5].map((level) => ({ level, goal: level * 1_000, filled: 0, launched: false, launchedAt: null, prizes: [], top: [], mine: 0 })),
  ],
  last: {
    launch: 7,
    level: 1,
    at: '2026-11-17T16:00:01.000Z',
    winners: [
      { user: user('u-b', 'Burak'), prize: { kind: 'item', sku: 'fr-neon', name: 'Neon Halka', itemKind: 'frame', days: 1, winners: 1 }, paid: true },
      { user: user('u-a', 'Ayşe'), prize: { kind: 'coins', amount: 100, winners: 1 }, paid: true },
    ],
  },
});

describe('Oda roketi: sunucunun cevabı', () => {
  test('beş seviye, ödüller, ilk üç, katkım ve son kazananlar okunur; kopyası aynı okunur', () => {
    const r = parseRocket(answer())!;
    assert.deepEqual([r.on, r.fuel, r.current, r.levels.length], [true, 1_200, 2, 5]);
    assert.deepEqual(r.levels[0].prizes.map(prizeLabel), ['Neon Halka · 1 gün', '100 jeton']);
    assert.deepEqual(r.levels[0].top.map((t) => [t.rank, t.user.name, t.coins]), [[1, 'Ayşe', 500], [2, 'Burak', 500]]);
    assert.equal(r.levels[0].mine, 500);
    assert.deepEqual(r.last!.winners.map((w) => [w.user.name, prizeLabel(w.prize)]), [['Burak', 'Neon Halka · 1 gün'], ['Ayşe', '100 jeton']]);
    assert.deepEqual(parseRocket(JSON.parse(JSON.stringify(r))), r);
  });

  test('beş seviyesi olmayan ya da hedefi bozuk cevap roket değildir; bozuk ödül ve kişi atlanır', () => {
    for (const raw of [undefined, null, 5, {}, { levels: [] }, { ...answer(), levels: answer().levels.slice(0, 4) }]) assert.equal(parseRocket(raw), null, JSON.stringify(raw));
    const broken = answer();
    (broken.levels[2] as Record<string, unknown>).goal = 'çok';
    assert.equal(parseRocket(broken), null);
    const odd = answer();
    odd.levels[0].prizes.push({ kind: 'nft', amount: 5, winners: 1 } as never, { kind: 'coins', amount: -3, winners: 1 } as never);
    odd.levels[0].top.push({ rank: 9, user: user('u-x', 'X'), coins: 1 }, { rank: 3, user: { id: '', name: 'Boş' } as never, coins: 4 });
    (odd.levels[1] as Record<string, unknown>).filled = 99_999;
    const r = parseRocket(odd)!;
    assert.equal(r.levels[0].prizes.length, 2, 'bozuk ödül atlanır');
    assert.equal(r.levels[0].top.length, 2, 'bozuk kişi atlanır');
    assert.equal(r.levels[1].filled, 2_000, 'hedeften fazla gösterilmez');
    assert.equal(parsePrize({ kind: 'item', sku: 'fr-neon', days: 0, winners: 1 }), null);
  });

  test('doluluk: dolmadan 100 gösterilmez; Türkçe ondalık; gösterilen seviye', () => {
    assert.equal(rocketPct({ filled: 575, goal: 1_000, launched: false }), 57.5);
    assert.equal(rocketPct({ filled: 999, goal: 1_000, launched: false }), 99.9);
    assert.equal(rocketPct({ filled: 3, goal: 1_000, launched: true }), 100);
    assert.equal(pctText(57.5), '57,5%');
    assert.equal(pctText(100), '100%');
    const r = parseRocket(answer())!;
    assert.equal(shownLevel(r), 2);
    assert.equal(shownLevel({ ...r, current: null }), 5, 'beşi de kalkınca son seviye');
  });
});

describe('Oda roketi: odanın duyuruları', () => {
  test('sunucunun kalkış ve ödeme paketi okunur; bozuğu ve telefondan geleni atlanır', () => {
    const paid = { type: 'rocket', event: 'paid', level: 1, launch: 7, winners: [{ user: 'u-b', name: 'Burak', prize: 'Neon Halka (1 gün)', paid: true }, { user: 5, prize: 'x' }] };
    assert.deepEqual(parseServerRocket(paid), { event: 'paid', level: 1, launch: 7, winners: [{ user: 'u-b', name: 'Burak', prize: 'Neon Halka (1 gün)', paid: true }] });
    assert.deepEqual(parseServerRocket({ type: 'rocket', event: 'launch', level: 3, launch: 9 }), { event: 'launch', level: 3, launch: 9, winners: [] });
    for (const raw of [{ type: 'rocket', event: 'boom', level: 1, launch: 1 }, { type: 'rocket', event: 'launch', level: 6, launch: 1 }, { type: 'rocket', event: 'launch', level: 1 }, { type: 'bag' }, null]) {
      assert.equal(parseServerRocket(raw), null, JSON.stringify(raw));
    }
    const got: RocketNews[] = [];
    const off = onServerRocket('oda-1', (n) => got.push(n));
    reportSignal('oda-1', null, { type: 'rocket', event: 'launch', level: 2, launch: 11 });
    reportSignal('oda-1', 'phone-1', { type: 'rocket', event: 'launch', level: 2, launch: 12 });
    reportSignal('oda-2', null, { type: 'rocket', event: 'launch', level: 2, launch: 13 });
    off();
    reportSignal('oda-1', null, { type: 'rocket', event: 'launch', level: 2, launch: 14 });
    assert.deepEqual(got.map((n) => n.launch), [11], 'yalnız sunucudan, yalnız bu odadan');
  });
});
