import { useEffect } from 'react';

import { setGameDeps } from '@/lib/games';
import { useApp } from '@/store';

/** Gives the game platform the one wallet and the current VIP level (re-read on every round). */
export function GamesBridge() {
  const { wealthLevel, coins, spendCoins, addCoins } = useApp();
  useEffect(() => {
    setGameDeps({ wealthLevel: () => wealthLevel, coins: () => coins, spend: spendCoins, credit: addCoins });
  });
  return null;
}
