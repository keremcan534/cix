/// <reference types="node" />
// Product rule: below Cömertlik Lv.2 Oyun Salonu does not exist for the user (no tab, tile, link or banner),
// and a round cannot start even if a game's admin setting asks for a lower level.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CASINO_MIN_WEALTH, casinoAccess, casinoVisible, getGames } from '@/lib/games';

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
