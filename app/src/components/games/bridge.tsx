import { useEffect } from 'react';

import { setShowMyName, startWinFeed, stopWinFeed } from '@/lib/broadcast';
import { IS_DEMO } from '@/lib/build';
import { setGameDeps } from '@/lib/games';
import { liveMode } from '@/lib/live';
import { useApp } from '@/store';

/** Gives the game platform the one wallet and the current VIP level (re-read on every round). */
export function GamesBridge() {
  const { wealthLevel, coins, spendCoins, addCoins, gameCoins, spendGameCoins, addGameCoins, settings } = useApp();
  useEffect(() => {
    setGameDeps({ wealthLevel: () => wealthLevel, coins: () => coins, spend: spendCoins, credit: addCoins, gameCoins: () => gameCoins, spendGame: spendGameCoins, creditGame: addGameCoins });
    setShowMyName(settings.luckyAnnounce);
  });
  // Simulated wins from other rooms run only in the offline demo; a live build shows real wins only.
  useEffect(() => {
    if (!IS_DEMO || liveMode()) return;
    startWinFeed();
    return stopWinFeed;
  }, []);
  return null;
}
