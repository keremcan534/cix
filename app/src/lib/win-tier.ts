// How big a round's win is, for its celebration (components/games/fx/win-fx): by how many stakes it paid, never by
// the plain amount, so a small stake's big hit is celebrated like a big stake's; and only when it paid more than
// the round cost. Pure, so it is unit tested.

export type WinTier = 'small' | 'big' | 'mega' | 'epic' | 'jackpot';

/** A win of at least this many stakes gets the full-stage celebration; below it only the amount and a few coins. */
export const BIG_WIN_X = 5;
const MEGA_WIN_X = 15;
const EPIC_WIN_X = 40;

/**
 * The celebration a round's payout gets, or null for none. A payout that is not more than the round cost is money
 * back, not a win: it is shown plainly and never celebrated (no coins, no fanfare), in every game alike.
 */
export function winTierOf(amount: number, bet: number, jackpot = false): WinTier | null {
  if (!(amount > 0)) return null;
  if (jackpot) return 'jackpot';
  if (bet > 0 && amount <= bet) return null;
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
 * The title a big win shows while its amount counts up: it starts at BÜYÜK KAZANÇ and climbs with the amount on show
 * (DEV KAZANÇ from 15 stakes, EFSANE KAZANÇ from 40), never past the win's own tier, so a 50-stake win is seen
 * growing into a legend. A small win and a JACKPOT keep their own.
 */
export function winStageAt(shown: number, bet: number, final: WinTier): WinTier {
  if (final === 'small' || final === 'jackpot') return final;
  const ladder: WinTier[] = ['big', 'mega', 'epic'];
  const now = winTierOf(shown, bet);
  const at = now === 'mega' || now === 'epic' ? ladder.indexOf(now) : 0;
  return ladder[Math.min(at, ladder.indexOf(final))];
}

/**
 * One coin of a burst or a shower, as fractions the layer scales to its own size: where it starts and ends across
 * the width (0…1), how high it rises (0…1 of the height; a shower's coins don't rise), when in the show it sets off
 * (0…1) and how much it turns. A burst's coin also flies up or down (`dy`, a part of the height) and may leave the
 * stage: it is thrown at the viewer. Drawn from `rnd` (0…1) so a test can pin them.
 */
export type CoinPath = { x0: number; x1: number; rise: number; delay: number; turns: number; size: number; dy?: number };

export function coinPaths(n: number, kind: 'fountain' | 'rain' | 'burst', rnd: () => number = Math.random): CoinPath[] {
  return Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => {
    if (kind === 'burst') {
      // An explosion from the middle: every way round, a little off its share of the circle, out past the edge.
      const a = (i / Math.max(1, n)) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
      const d = 0.55 + rnd() * 0.4;
      return { x0: 0.5, x1: 0.5 + Math.cos(a) * d, dy: Math.sin(a) * d * 0.8, rise: 0, delay: rnd() * 0.08, turns: 1 + rnd() * 2.5, size: 18 + Math.round(rnd() * 14) };
    }
    if (kind === 'rain') {
      const x0 = rnd();
      return { x0, x1: Math.min(1, Math.max(0, x0 + (rnd() - 0.5) * 0.18)), rise: 0, delay: (i / Math.max(1, n)) * 0.62 + rnd() * 0.04, turns: 1 + rnd() * 2, size: 18 + Math.round(rnd() * 14) };
    }
    // A fountain opens like a fan from the middle: the further out a coin lands, the lower it flies.
    const side = (i % 2 ? 1 : -1) * (0.08 + rnd() * 0.42);
    return { x0: 0.5 + (rnd() - 0.5) * 0.06, x1: 0.5 + side, rise: 0.35 + rnd() * 0.4, delay: rnd() * 0.18, turns: 0.5 + rnd() * 1.5, size: 16 + Math.round(rnd() * 10) };
  });
}
