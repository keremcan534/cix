/// <reference types="node" />
// Casino winnings live in a separate game balance: stakes use it first, every win is credited to it and never
// to the wallet, refunds go back where the stake came from.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { getGames, playCasino, playDuel, resetGames, setGameDeps, setProviderStatus } from '@/lib/games';

let wallet = 0;
let game = 0;
function deps(w: number, g: number) {
  wallet = w;
  game = g;
  setGameDeps({
    wealthLevel: () => 5,
    coins: () => wallet,
    spend: (n) => (wallet >= n ? ((wallet -= n), true) : false),
    credit: (n) => void (wallet += n),
    gameCoins: () => game,
    spendGame: (n) => (game >= n ? ((game -= n), true) : false),
    creditGame: (n) => void (game += n),
  });
}
const profile = { from: 'profile' as const };
// Fixed request ids: with Math.random mocked, generated ids could repeat and replay an earlier round.
/** Wheel draw 999 of 1000 = the 20x slice; 0 = the 0x slice. */
const forceRandom = (v: number) => mock.method(Math, 'random', () => v);

beforeEach(() => resetGames());
afterEach(() => mock.restoreAll());

describe('Oyun bakiyesi', () => {
  test('kazanç oyun bakiyesine yazılır, cüzdana değil', () => {
    deps(1_000, 0);
    forceRandom(0.9995);
    const r = playCasino('wheel', 100, '', profile, 'req-test-1');
    assert.equal(r.ok, true);
    assert.equal(wallet, 900, 'bahis cüzdandan');
    assert.equal(game, 2_000, '20x kazanç oyun bakiyesine');
  });

  test('bahis önce oyun bakiyesinden düşer, yetmeyen kısım cüzdandan', () => {
    deps(1_000, 30);
    forceRandom(0);
    playCasino('wheel', 100, '', profile, 'req-test-2');
    assert.deepEqual([game, wallet], [0, 930]);
  });

  test('yalnız oyun bakiyesiyle de oynanır; toplam yetmezse tur reddedilir ve hiçbir şey düşmez', () => {
    deps(0, 100);
    forceRandom(0);
    assert.equal(playCasino('wheel', 100, '', profile, 'req-test-3').ok, true);
    assert.equal(game, 0);
    deps(20, 30);
    const r = playCasino('wheel', 100, '', profile, 'req-test-4');
    assert.equal(r.ok, false);
    assert.deepEqual([wallet, game], [20, 30]);
  });

  test('sağlayıcı hatasında bahis geldiği yere iade edilir', () => {
    deps(1_000, 40);
    setProviderStatus('wheel', 'error');
    const r = playCasino('wheel', 100, '', profile, 'req-test-5');
    assert.equal(r.ok, false);
    assert.deepEqual([wallet, game], [1_000, 40]);
  });

  test('kasa defteri: oynananın %60’ı kasaya, kazanç havuzdan', () => {
    deps(1_000, 0);
    forceRandom(0.9995);
    playCasino('wheel', 100, '', profile, 'req-test-6');
    const b = getGames().bank;
    assert.deepEqual([b.wagered, b.house, b.paid], [100, 60, 2_000]);
    assert.equal(b.pool, b.seed + 40 - 2_000);
  });

  test('oda Zar Düellosu kazancı da oyun bakiyesine', () => {
    deps(500, 0);
    // First die 6, second die 1 → 5 farkla kazanç (2.4x).
    let i = 0;
    mock.method(Math, 'random', () => [0.99, 0.01][i++ % 2]);
    const r = playDuel(100);
    assert.ok(r.ok);
    assert.deepEqual([wallet, game], [400, 240]);
  });
});
