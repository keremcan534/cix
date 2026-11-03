/// <reference types="node" />
// Casino winnings live in a separate game balance: stakes use it first, every win is credited to it and never
// to the wallet, refunds go back where the stake came from.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { CASINO_GAMES, MIN_STAKE } from '@/data/games';
import { BOARDS } from '@/lib/board-games';
import { PICKS, maxMultiplier } from '@/lib/casino-odds';
import { POOL_SEED, getGames, playCasino, playDuel, resetGames, setGameDeps, setProviderStatus, updateCasino } from '@/lib/games';

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

// Şans Çarkı is switched off in the launch catalog; these tests use it for its fixed slices.
beforeEach(() => {
  resetGames();
  updateCasino('wheel', { active: true });
});
afterEach(() => mock.restoreAll());

describe('Oyun bakiyesi', () => {
  test('kazanç oyun bakiyesine yazılır, cüzdana değil', () => {
    deps(1_000, 0);
    forceRandom(0.9995);
    const r = playCasino('wheel', 250, '', profile, 'req-test-1');
    assert.equal(r.ok, true);
    assert.equal(wallet, 750, 'bahis cüzdandan');
    assert.equal(game, 5_000, '20x kazanç oyun bakiyesine');
  });

  test('bahis önce oyun bakiyesinden düşer, yetmeyen kısım cüzdandan', () => {
    deps(1_000, 30);
    forceRandom(0);
    playCasino('wheel', 250, '', profile, 'req-test-2');
    assert.deepEqual([game, wallet], [0, 780]);
  });

  test('yalnız oyun bakiyesiyle de oynanır; toplam yetmezse tur reddedilir ve hiçbir şey düşmez', () => {
    deps(0, 250);
    forceRandom(0);
    assert.equal(playCasino('wheel', 250, '', profile, 'req-test-3').ok, true);
    assert.equal(game, 0);
    deps(20, 30);
    const r = playCasino('wheel', 250, '', profile, 'req-test-4');
    assert.equal(r.ok, false);
    assert.deepEqual([wallet, game], [20, 30]);
  });

  test('sağlayıcı hatasında bahis geldiği yere iade edilir', () => {
    deps(1_000, 40);
    setProviderStatus('wheel', 'error');
    const r = playCasino('wheel', 250, '', profile, 'req-test-5');
    assert.equal(r.ok, false);
    assert.deepEqual([wallet, game], [1_000, 40]);
  });

  test('kasa defteri: oynananın %60’ı kasaya, kazanç havuzdan', () => {
    deps(1_000, 0);
    forceRandom(0.9995);
    playCasino('wheel', 250, '', profile, 'req-test-6');
    const b = getGames().bank;
    assert.deepEqual([b.wagered, b.house, b.paid], [250, 150, 5_000]);
    assert.equal(b.pool, b.seed + 100 - 5_000);
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

describe('Bahis kademeleri', () => {
  test('hiçbir oyun 250 jetondan az bahis almaz; kademeler artan sırada', () => {
    for (const g of CASINO_GAMES) {
      assert.equal(g.bets[0], MIN_STAKE, `${g.id} en düşük bahis`);
      assert.ok(g.bets.every((b, i) => i === 0 || b > g.bets[i - 1]), `${g.id} sırası`);
      assert.ok(g.bets.every((b) => [250, 500, 1_000, 5_000, 10_000, 25_000].includes(b)), `${g.id} yalnız izinli tutarlar`);
    }
  });

  test('en yüksek bahsin en büyük ödülü açılış havuzuna sığar (roket: oyuncunun seçtiği çarpan hariç)', () => {
    for (const g of CASINO_GAMES) {
      if (g.id === 'rocket') continue;
      const picks = BOARDS[g.id] ? BOARDS[g.id].options.map((o) => o.id) : PICKS[g.id];
      const top = Math.max(...picks.map((p) => maxMultiplier(g.id, p)));
      const stake = g.bets[g.bets.length - 1];
      assert.ok(stake * top <= POOL_SEED, `${g.id}: ${stake} × ${top} > ${POOL_SEED}`);
    }
  });

  test('günlük limit en yüksek bahisle en az bir tura izin verir; 250 altı bahis reddedilir', () => {
    for (const g of CASINO_GAMES) assert.ok(g.dailyLimit >= g.bets[g.bets.length - 1], g.id);
    deps(1_000, 0);
    const r = playCasino('wheel', 100, '', profile, 'req-stake-low');
    assert.equal(r.ok, false);
    assert.equal(wallet, 1_000, 'hiçbir şey düşmedi');
  });
});
