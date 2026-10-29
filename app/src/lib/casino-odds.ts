// House rule for every coin game (casino and the room's Zar Düellosu): of all coins played, 60 % stays with
// the house and 40 % goes back to players as randomly drawn winnings. Two things enforce it:
//   1. odds — every game and every pick has an expected return of 40 % of the stake (tests enumerate
//      every outcome to prove it);
//   2. the payout pool in lib/games — 60 % of each stake is booked to the house at once, 40 % goes into the
//      pool, and winnings are paid only from the pool, so the house share holds exactly, not just on average.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.
import { FISH, fishById, fishDraw, fishReturn, shootFish } from '@/lib/fish-hunt';
import { FORTUNE_MAX, SYMBOLS, fortuneReturn, playRound, type FortuneRound } from '@/lib/fortune-slot';
import { JACKPOT_SHARE, MEGA_MAX, SYMBOLS as MEGA_SYMBOLS, jackpotReturn, playMega, type MegaSpin } from '@/lib/mega-jackpot';
import { OLYMPUS_MAX, OSYMBOLS, olympusReturn, playOlympus, type OlympusRound } from '@/lib/olympus-slot';

export const CASINO_HOUSE_SHARE = 0.6;
export const CASINO_RETURN_SHARE = 0.4;

export type CasinoId = 'wheel' | 'dice' | 'slot' | 'dragon' | 'fortune' | 'jackpot' | 'olympus' | 'fish';
/** Games whose round has its own engine instead of a list of uniform draws. */
type EngineId = 'fortune' | 'jackpot' | 'olympus' | 'fish';
/**
 * fortune / mega / olympus: the whole slot round for the reels to replay; fish: whether the shot caught the fish.
 * A Mega Jackpot round with five 77s on a line also wins the JACKPOT, which lib/games pays from the jackpot fund.
 */
export type Outcome = { display: string[]; multiplier: number; detail: string; fortune?: FortuneRound; mega?: MegaSpin; olympus?: OlympusRound; caught?: boolean };

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
/**
 * Lucky 77 fruit wheel: 20 slices in drawing order. Bets go on Karpuz (2x), Elma (2x) or 77 (8x); Limon and Üzüm
 * slices pay nobody. Each pick returns exactly 40 %: 4/20 × 2 = 1/20 × 8 = 0.4.
 */
export type LuckySlice = 'seven' | 'apple' | 'melon' | 'lemon' | 'grape';
export const LUCKY_WHEEL: LuckySlice[] = ['seven', 'apple', 'lemon', 'melon', 'grape', 'apple', 'lemon', 'melon', 'grape', 'lemon', 'apple', 'melon', 'grape', 'lemon', 'apple', 'melon', 'grape', 'lemon', 'grape', 'lemon'];
export const LUCKY_PAYS: Record<string, number> = { melon: 2, seven: 8, apple: 2 };
export const LUCKY_NAMES: Record<LuckySlice, string> = { seven: '77', apple: 'Elma', melon: 'Karpuz', lemon: 'Limon', grape: 'Üzüm' };
export const CARD = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Dice: 10–12 "Büyük", 2–4 "Küçük", each 6/36 → 2.4x. */
export const DICE_MULT = 2.4;
/** Dragon Tiger: your side wins with a card at least 4 higher (45/169) → 1.5x; tie (13/169) → 5.2x. */
export const DT_GAP = 4;
export const DT_MULT = 1.5;
export const DT_TIE = 5.2;
/** Zar Düellosu (room): you win when your die beats the other by 3 or more (6/36) → 2.4x. */
export const DUEL_GAP = 3;
export const DUEL_MULT = 2.4;

/**
 * How many equally likely values each random draw of a game takes (the server draws them uniformly). Altın Kasa
 * draws one stop per reel for the base spin and again for each free spin, so it has its own round (outcomeOf).
 */
export const DRAWS: Record<Exclude<CasinoId, EngineId> | 'duel', number[]> = { wheel: [WHEEL_TOTAL], dice: [6, 6], slot: [LUCKY_WHEEL.length], dragon: [13, 13], duel: [6, 6] };
export const PICKS: Record<CasinoId, string[]> = {
  wheel: [''],
  dice: ['small', 'big'],
  slot: Object.keys(LUCKY_PAYS),
  dragon: ['dragon', 'tie', 'tiger'],
  fortune: [''],
  jackpot: [''],
  olympus: [''],
  fish: FISH.map((f) => f.id),
};

/** One round of any casino game from a uniform draw function (rnd(n) → 0…n−1). */
export function outcomeOf(game: CasinoId, pick: string, rnd: (n: number) => number): Outcome {
  if (game === 'fortune') {
    const round = playRound(rnd);
    const lines = round.base.wins.length;
    const detail = [
      round.base.grid.map((reel) => SYMBOLS[reel[1]].emoji).join(''),
      lines ? `${lines} çizgi` : 'çizgi yok',
      round.free.length ? `${round.free.length} bedava dönüş` : '',
      `${Math.round(round.multiplier * 10) / 10}x`,
    ];
    return { display: round.base.grid.flat(), multiplier: round.multiplier, detail: detail.filter(Boolean).join(' · '), fortune: round };
  }
  if (game === 'jackpot') {
    const s = playMega(rnd);
    const detail = [
      s.grid.map((reel) => MEGA_SYMBOLS[reel[1]].label).join(' '),
      s.wins.length ? `${s.wins.length} çizgi` : 'çizgi yok',
      s.jackpotLines.length ? 'JACKPOT' : '',
      `${Math.round(s.multiplier * 10) / 10}x`,
    ];
    return { display: s.grid.flat(), multiplier: s.multiplier, detail: detail.filter(Boolean).join(' · '), mega: s };
  }
  if (game === 'olympus') {
    const round = playOlympus(rnd);
    const top = round.base.wins[0];
    const detail = [
      top ? `${OSYMBOLS[top.sym].emoji}×${top.count}` : 'kazanç yok',
      round.base.orbs ? `küre ×${round.base.orbs}` : '',
      round.free.length ? `${round.free.length} bedava dönüş` : '',
      `${Math.round(round.multiplier * 10) / 10}x`,
    ];
    return { display: round.base.grid.flat().map((c) => c.sym), multiplier: round.multiplier, detail: detail.filter(Boolean).join(' · '), olympus: round };
  }
  if (game === 'fish') {
    const f = fishById(pick)!;
    const shot = shootFish(f, rnd(fishDraw(f)));
    return { display: [f.id], multiplier: shot.multiplier, detail: `${f.name} ${shot.caught ? `yakalandı · ${f.mult}x` : 'kaçtı'}`, caught: shot.caught };
  }
  return evaluate(game, pick, DRAWS[game].map(rnd));
}

/** The result of one round from its raw draws (each draw in 0…n−1). */
export function evaluate(game: Exclude<CasinoId, EngineId>, pick: string, d: number[]): Outcome {
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
    const slice = LUCKY_WHEEL[d[0]];
    return { display: [String(d[0])], multiplier: slice === pick ? LUCKY_PAYS[pick] : 0, detail: `Çark: ${LUCKY_NAMES[slice]}` };
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
  // Too many reel combinations to list; the slot engines compute it exactly from their symbol counts instead.
  if (game === 'fortune') return fortuneReturn().total;
  // Line wins plus the share of every stake that goes into the JACKPOT fund and is paid out from it.
  if (game === 'jackpot') return jackpotReturn().lines + JACKPOT_SHARE;
  if (game === 'olympus') return olympusReturn().total;
  if (game === 'fish') return fishReturn(fishById(pick)!);
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
  if (game === 'fortune') return FORTUNE_MAX;
  if (game === 'jackpot') return MEGA_MAX;
  if (game === 'olympus') return OLYMPUS_MAX;
  if (game === 'fish') return fishById(pick)!.mult;
  let max = 0;
  for (const d of combos(DRAWS[game])) max = Math.max(max, evaluate(game, pick, d).multiplier);
  return max;
}
