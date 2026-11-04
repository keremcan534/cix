// Rüzgâr Gülü (the wheel game, docs/RUZGAR_GULU.md): pure data, shared by the API (wheel.mjs) and the app's test
// that keeps app/src/data/wheel.ts equal to it.
//
// House rule of every coin game: 60 % of what is played stays with the house, 40 % goes back as winnings. Here the
// fixed slices return 37.994 % of each spin's price and the JACKPOT fund the other ~2 %: 1.5 % of every spin goes
// into its tier's fund, and when the fund is won it starts again from a seed of 20 spins' price (20 × 1/4000 =
// 0.5 %). Rounded down, in the house's favour.

/** Tiers: one spin's price in coins. */
export const TIERS = {
  kiyi: { label: 'Kıyı', price: 250 },
  acik: { label: 'Açık Deniz', price: 2500 },
  okyanus: { label: 'Derin Okyanus', price: 10000 },
};
/** Spins in one go. */
export const COUNTS = [1, 10, 50];

/**
 * The 12 slices in wheel order: `milli` is the prize in thousandths of the spin price (null = JACKPOT), `weight`
 * the chance in millionths. Every slice pays something; the wheel draws them all the same size.
 */
export const SLICES = [
  { milli: 100, weight: 373_400 },
  { milli: 2000, weight: 14_000 },
  { milli: 300, weight: 150_000 },
  { milli: 25_000, weight: 600 },
  { milli: 200, weight: 250_000 },
  { milli: 5000, weight: 5000 },
  { milli: 500, weight: 100_000 },
  { milli: null, weight: 250 },
  { milli: 800, weight: 50_000 },
  { milli: 10_000, weight: 2000 },
  { milli: 1000, weight: 54_600 },
  { milli: 100_000, weight: 150 },
];
export const WEIGHT_TOTAL = 1_000_000;
/** Of every spin's price, thousandths that go into the tier's JACKPOT fund. */
export const JACKPOT_SHARE_MILLI = 15;
/** A won fund starts again from this many spins' price. */
export const JACKPOT_SEED_SPINS = 20;

/** The slice for a draw in [0, WEIGHT_TOTAL). */
export function sliceAt(draw) {
  let left = draw;
  for (let i = 0; i < SLICES.length; i++) {
    left -= SLICES[i].weight;
    if (left < 0) return i;
  }
  return SLICES.length - 1;
}

export const jackpotSeed = (tier) => TIERS[tier].price * JACKPOT_SEED_SPINS;
export const jackpotShare = (tier) => Math.floor((TIERS[tier].price * JACKPOT_SHARE_MILLI) / 1000);
/** A fixed slice's prize for one spin of `tier`. */
export const prizeOf = (tier, slice) => Math.floor((TIERS[tier].price * SLICES[slice].milli) / 1000);

/**
 * Plays `count` spins of `tier` with `draw()` (an integer in [0, WEIGHT_TOTAL)) against a JACKPOT fund of `fund`.
 * Each spin first adds its share to the fund, so a JACKPOT pays the fund with that share in it.
 */
export function playSpins(tier, count, fund, draw) {
  const slices = [];
  const wins = [];
  let jackpot = 0;
  for (let i = 0; i < count; i++) {
    fund += jackpotShare(tier);
    const s = sliceAt(draw());
    let win;
    if (SLICES[s].milli === null) {
      win = fund;
      jackpot += fund;
      fund = jackpotSeed(tier);
    } else win = prizeOf(tier, s);
    slices.push(s);
    wins.push(win);
  }
  return { slices, wins, payout: wins.reduce((a, b) => a + b, 0), jackpot, fund };
}
