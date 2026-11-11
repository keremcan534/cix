// How big a round's win is, for its celebration (components/games/fx/win-fx): by how many stakes it paid, never by
// the plain amount, so a small stake's big hit is celebrated like a big stake's. Pure, so it is unit tested.

export type WinTier = 'small' | 'big' | 'mega' | 'epic' | 'jackpot';

/** A win of at least this many stakes gets the full-stage celebration; below it only the amount and a few coins. */
export const BIG_WIN_X = 5;
const MEGA_WIN_X = 15;
const EPIC_WIN_X = 40;

export function winTierOf(amount: number, bet: number, jackpot = false): WinTier | null {
  if (!(amount > 0)) return null;
  if (jackpot) return 'jackpot';
  const x = bet > 0 ? amount / bet : 0;
  return x >= EPIC_WIN_X ? 'epic' : x >= MEGA_WIN_X ? 'mega' : x >= BIG_WIN_X ? 'big' : 'small';
}

export const WIN_TITLE: Record<Exclude<WinTier, 'small'>, string> = { big: 'BÜYÜK KAZANÇ', mega: 'DEV KAZANÇ', epic: 'EFSANE KAZANÇ', jackpot: 'JACKPOT' };

/** How long the celebration stays (ms) and how many coins it throws. A small win never holds the next round up. */
export const WIN_SHOW: Record<WinTier, { ms: number; coins: number }> = {
  small: { ms: 900, coins: 10 },
  big: { ms: 2400, coins: 28 },
  mega: { ms: 3200, coins: 44 },
  epic: { ms: 4000, coins: 60 },
  jackpot: { ms: 5000, coins: 80 },
};

/**
 * One coin of a burst or a shower, as fractions the layer scales to its own size: where it starts and ends across
 * the width (0…1), how high it rises (0…1 of the height; a shower's coins don't rise), when in the show it sets off
 * (0…1) and how much it turns. Drawn from `rnd` (0…1) so a test can pin them.
 */
export type CoinPath = { x0: number; x1: number; rise: number; delay: number; turns: number; size: number };

export function coinPaths(n: number, kind: 'fountain' | 'rain', rnd: () => number = Math.random): CoinPath[] {
  return Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => {
    if (kind === 'rain') {
      const x0 = rnd();
      return { x0, x1: Math.min(1, Math.max(0, x0 + (rnd() - 0.5) * 0.18)), rise: 0, delay: (i / Math.max(1, n)) * 0.62 + rnd() * 0.04, turns: 1 + rnd() * 2, size: 18 + Math.round(rnd() * 14) };
    }
    // A fountain opens like a fan from the middle: the further out a coin lands, the lower it flies.
    const side = (i % 2 ? 1 : -1) * (0.08 + rnd() * 0.42);
    return { x0: 0.5 + (rnd() - 0.5) * 0.06, x1: 0.5 + side, rise: 0.35 + rnd() * 0.4, delay: rnd() * 0.18, turns: 0.5 + rnd() * 1.5, size: 16 + Math.round(rnd() * 10) };
  });
}
