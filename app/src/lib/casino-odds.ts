// House rule for every coin game (casino and the room's Zar Düellosu): of all coins played, 60 % stays with
// the house and 40 % goes back to players as randomly drawn winnings. Two things enforce it:
//   1. odds — every game and every pick has an expected return of 40 % of the stake (tests enumerate
//      every outcome to prove it);
//   2. the payout pool in lib/games — 60 % of each stake is booked to the house at once, 40 % goes into the
//      pool, and winnings are paid only from the pool, so the house share holds exactly, not just on average.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export const CASINO_HOUSE_SHARE = 0.6;
export const CASINO_RETURN_SHARE = 0.4;

export type CasinoId = 'wheel' | 'dice' | 'slot' | 'dragon';
export type Outcome = { display: string[]; multiplier: number; detail: string };

/** Wheel slices (in drawing order) and their weights out of 1000: expected return 400 / 1000. */
export const WHEEL = [
  { mult: 0, weight: 740 },
  { mult: 0.5, weight: 90 },
  { mult: 1, weight: 80 },
  { mult: 2, weight: 50 },
  { mult: 3, weight: 25 },
  { mult: 5, weight: 12 },
  { mult: 10, weight: 2 },
  { mult: 20, weight: 1 },
] as const;
const WHEEL_TOTAL = WHEEL.reduce((n, s) => n + s.weight, 0);
export const SLOT = ['7', '🍒', '🍋', '🍇', '🔔'];
export const CARD = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Dice: 10–12 "Büyük", 2–4 "Küçük", each 6/36 → 2.4x. */
export const DICE_MULT = 2.4;
/** Slot: three 7s 30x (1/125), three of the same fruit 5x (4/125). */
export const SLOT_SEVENS = 30;
export const SLOT_SAME = 5;
/** Dragon Tiger: your side wins with a card at least 4 higher (45/169) → 1.5x; tie (13/169) → 5.2x. */
export const DT_GAP = 4;
export const DT_MULT = 1.5;
export const DT_TIE = 5.2;
/** Zar Düellosu (room): you win when your die beats the other by 3 or more (6/36) → 2.4x. */
export const DUEL_GAP = 3;
export const DUEL_MULT = 2.4;

/** How many equally likely values each random draw of a game takes (the server draws them uniformly). */
export const DRAWS: Record<CasinoId | 'duel', number[]> = { wheel: [WHEEL_TOTAL], dice: [6, 6], slot: [5, 5, 5], dragon: [13, 13], duel: [6, 6] };
export const PICKS: Record<CasinoId, string[]> = { wheel: [''], dice: ['small', 'big'], slot: [''], dragon: ['dragon', 'tie', 'tiger'] };

/** The result of one round from its raw draws (each draw in 0…n−1). */
export function evaluate(game: CasinoId, pick: string, d: number[]): Outcome {
  if (game === 'wheel') {
    let r = d[0];
    const i = WHEEL.findIndex((s) => (r -= s.weight) < 0);
    return { display: [String(i)], multiplier: WHEEL[i].mult, detail: `Çark ${WHEEL[i].mult}x` };
  }
  if (game === 'dice') {
    const a = d[0] + 1;
    const b = d[1] + 1;
    const sum = a + b;
    const side = sum >= 10 ? 'big' : sum <= 4 ? 'small' : 'house';
    return { display: [String(a), String(b)], multiplier: side === pick ? DICE_MULT : 0, detail: `${a}+${b}=${sum} · ${side === 'house' ? 'kasa' : side === 'big' ? 'Büyük' : 'Küçük'}` };
  }
  if (game === 'slot') {
    const reels = d.map((i) => SLOT[i]);
    const sevens = reels.filter((x) => x === '7').length;
    const same = reels[0] === reels[1] && reels[1] === reels[2];
    return { display: reels, multiplier: sevens === 3 ? SLOT_SEVENS : same ? SLOT_SAME : 0, detail: reels.join(' ') };
  }
  const [dr, tg] = d;
  const winner = dr - tg >= DT_GAP ? 'dragon' : tg - dr >= DT_GAP ? 'tiger' : dr === tg ? 'tie' : 'house';
  const m = pick !== winner ? 0 : winner === 'tie' ? DT_TIE : DT_MULT;
  const label = { dragon: 'Ejder', tiger: 'Kaplan', tie: 'Beraberlik', house: 'fark 4’ten az, kasa' }[winner];
  return { display: [CARD[dr], CARD[tg]], multiplier: m, detail: `Ejder ${CARD[dr]} · Kaplan ${CARD[tg]} · ${label}` };
}
/**
 * Where a stake comes from: the game balance (casino winnings) first, then the wallet. Winnings always go back to
 * the game balance, so they can be played again but never gifted, exchanged or withdrawn.
 */
export function splitStake(bet: number, gameBalance: number) {
  const fromGame = Math.min(bet, Math.max(0, gameBalance));
  return { fromGame, fromWallet: bet - fromGame };
}
/** Zar Düellosu from two dice (1–6). */
export const duelMultiplier = (me: number, them: number) => (me - them >= DUEL_GAP ? DUEL_MULT : 0);

/** Every combination of the given draw sizes. */
function* combos(sizes: number[], prefix: number[] = []): Generator<number[]> {
  if (prefix.length === sizes.length) {
    yield prefix;
    return;
  }
  for (let i = 0; i < sizes[prefix.length]; i++) yield* combos(sizes, [...prefix, i]);
}
/** Exact expected return (share of the stake paid back) of a game and pick, over all outcomes. */
export function expectedReturn(game: CasinoId | 'duel', pick = ''): number {
  let sum = 0;
  let n = 0;
  for (const d of combos(DRAWS[game])) {
    sum += game === 'duel' ? duelMultiplier(d[0] + 1, d[1] + 1) : evaluate(game, pick, d).multiplier;
    n++;
  }
  return sum / n;
}
/** Highest multiplier a round can pay (the pool must cover bet × this before the round starts). */
export function maxMultiplier(game: CasinoId | 'duel', pick = ''): number {
  if (game === 'duel') return DUEL_MULT;
  let max = 0;
  for (const d of combos(DRAWS[game])) max = Math.max(max, evaluate(game, pick, d).multiplier);
  return max;
}
