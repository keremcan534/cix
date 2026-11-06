/// <reference types="node" />
// Product rule: below Cömertlik Lv.2 Oyun Salonu does not exist for the user (no tab, tile, link or banner),
// and a round cannot start even if a game's admin setting asks for a lower level.
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOARDS } from '@/lib/board-games';
import { PICKS } from '@/lib/casino-odds';
import { CASINO_MIN_WEALTH, casinoAccess, casinoVisible, gamblingLevelOk, getGames, playBoard, playCasino, playDuel, resetGames, setGameDeps } from '@/lib/games';

describe('Oyun Salonu görünürlüğü', () => {
  const game = getGames().casino.find((g) => g.active && g.fromProfile)!;

  test('Cömertlik Lv.2 altında görünmez, Lv.2 ve üstünde görünür', () => {
    assert.equal(CASINO_MIN_WEALTH, 2);
    assert.equal(casinoVisible(0), false);
    assert.equal(casinoVisible(1), false);
    assert.equal(casinoVisible(2), true);
    assert.equal(casinoVisible(9), true);
  });

  test('oyunun kendi seviyesi 1 olsa bile Lv.1 oynayamaz', () => {
    const access = casinoAccess({ ...game, minWealth: 1 }, { from: 'profile' }, 1);
    assert.equal(access.ok, false);
    assert.equal(access.ok ? 0 : access.needWealth, 2);
    assert.equal(casinoAccess({ ...game, minWealth: 1 }, { from: 'profile' }, 2).ok, true);
  });

  test('oyunun kendi seviyesi daha yüksekse o geçerli', () => {
    const access = casinoAccess({ ...game, minWealth: 5 }, { from: 'profile' }, 3);
    assert.equal(access.ok ? 0 : access.needWealth, 5);
  });
});

// Live build (server address set): the server has no round for these games, so the phone must not decide one.
describe('Canlı mod: telefonda hesaplanan şans oyunları kapalı', () => {
  const calls = { spend: 0, spendGame: 0, credit: 0, creditGame: 0 };
  const live = (on: boolean) => {
    if (on) process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
    else delete process.env.EXPO_PUBLIC_API_URL;
  };
  const game = getGames().casino.find((g) => g.active && g.fromProfile && PICKS[g.id].includes('') && !BOARDS[g.id])!;
  const board = getGames().casino.find((g) => g.active && g.fromProfile && BOARDS[g.id])!;
  beforeEach(() => {
    resetGames();
    Object.assign(calls, { spend: 0, spendGame: 0, credit: 0, creditGame: 0 });
    setGameDeps({
      wealthLevel: () => 9,
      coins: () => 10_000_000,
      gameCoins: () => 10_000_000,
      spend: () => (calls.spend++, true),
      spendGame: () => (calls.spendGame++, true),
      credit: () => void calls.credit++,
      creditGame: () => void calls.creditGame++,
    });
  });
  afterEach(() => live(false));

  test('demoda tur oynanır (karşılaştırma için)', () => {
    assert.equal(playCasino(game.id, game.bets[0], '', { from: 'profile' }, 'demo-1').ok, true);
    assert.ok(calls.spend + calls.spendGame > 0);
  });

  test('seviye ne olursa olsun Oyun Salonu görünmez; Rüzgâr Gülü Lv.2 kuralını korur', () => {
    live(true);
    assert.equal(casinoVisible(2), false);
    assert.equal(casinoVisible(9), false);
    assert.equal(gamblingLevelOk(1), false);
    assert.equal(gamblingLevelOk(2), true);
    assert.equal(casinoAccess(game, { from: 'profile' }, 9).ok, false);
  });

  test('Oyun Salonu turu, bahis tahtası ve Zar Düellosu reddedilir; hiç jeton düşülmez veya yazılmaz', () => {
    live(true);
    assert.equal(playCasino(game.id, game.bets[0], '', { from: 'profile' }, 'live-1').ok, false);
    const option = BOARDS[board.id].options[0].id;
    assert.equal(playBoard(board.id, { [option]: Math.min(...board.bets) }, { from: 'profile' }, 'live-2').ok, false);
    assert.equal(playDuel(game.bets[0]).ok, false);
    assert.deepEqual(calls, { spend: 0, spendGame: 0, credit: 0, creditGame: 0 });
    assert.equal(getGames().history.length, 0);
    assert.equal(getGames().bank.wagered, 0);
  });
});
