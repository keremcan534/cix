import { useEffect } from 'react';

import { setShowMyName, startWinFeed, stopWinFeed } from '@/lib/broadcast';
import { setGameDeps } from '@/lib/games';
import { useApp } from '@/store';

/** Gives the game platform the one wallet and the current VIP level (re-read on every round). */
export function GamesBridge() {
  const { wealthLevel, coins, spendCoins, addCoins, gameCoins, spendGameCoins, addGameCoins, settings } = useApp();
  useEffect(() => {
    setGameDeps({ wealthLevel: () => wealthLevel, coins: () => coins, spend: spendCoins, credit: addCoins, gameCoins: () => gameCoins, spendGame: spendGameCoins, creditGame: addGameCoins });
    setShowMyName(settings.luckyAnnounce);
  });
  // Win announcements from other rooms (prototype feed) run while the user is logged in.
  useEffect(() => {
    startWinFeed();
    return stopWinFeed;
  }, []);
  return null;
}
