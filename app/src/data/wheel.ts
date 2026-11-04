// Rüzgâr Gülü (docs/RUZGAR_GULU.md): the wheel game of the Oyun Salonu. The same tiers, slices and odds as the
// server (server/api/wheel-rules.mjs); tests/wheel.test.ts keeps the two equal. In live mode the server draws and
// pays; offline the demo plays with these rules on this phone.
//
// 40 % of what is played comes back: the fixed slices 37,994 %, the JACKPOT fund the other ~2 % (1,5 % of each
// spin goes into the tier's fund; a won fund starts again from 20 spins' price).

export type WheelTierId = 'kiyi' | 'acik' | 'okyanus';
export type WheelTier = { label: string; price: number };

export const WHEEL_TIERS: Record<WheelTierId, WheelTier> = {
  kiyi: { label: 'Kıyı', price: 250 },
  acik: { label: 'Açık Deniz', price: 2500 },
  okyanus: { label: 'Derin Okyanus', price: 10000 },
};
export const WHEEL_TIER_IDS = Object.keys(WHEEL_TIERS) as WheelTierId[];
export const isWheelTier = (x: unknown): x is WheelTierId => typeof x === 'string' && Object.hasOwn(WHEEL_TIERS, x);

/** Spins in one go. */
export const WHEEL_COUNTS = [1, 10, 50] as const;
export type WheelCount = (typeof WHEEL_COUNTS)[number];

/** `milli`: the prize in thousandths of the spin price (null = JACKPOT); `weight`: the chance in millionths. */
export type WheelSlice = { milli: number | null; weight: number };
/** The 12 slices in wheel order. */
export const WHEEL_SLICES: WheelSlice[] = [
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
export const WHEEL_WEIGHT_TOTAL = 1_000_000;
export const WHEEL_JACKPOT_SHARE_MILLI = 15;
export const WHEEL_JACKPOT_SEED_SPINS = 20;
/** A request whose best slice is at least this (thousandths) or a JACKPOT goes on the winners' list. */
export const WHEEL_BIG_MILLI = 10_000;
/** The server's default daily limit per person, in coins played (WHEEL_DAILY). */
export const WHEEL_DAILY = 1_000_000;
/** Cömertlik level the wheel opens at. */
export const WHEEL_NEED_LEVEL = 2;

export const jackpotSeed = (tier: WheelTierId) => WHEEL_TIERS[tier].price * WHEEL_JACKPOT_SEED_SPINS;
export const jackpotShare = (tier: WheelTierId) => Math.floor((WHEEL_TIERS[tier].price * WHEEL_JACKPOT_SHARE_MILLI) / 1000);
export const prizeOf = (tier: WheelTierId, slice: number) => Math.floor((WHEEL_TIERS[tier].price * (WHEEL_SLICES[slice].milli ?? 0)) / 1000);
export const isJackpotSlice = (slice: number) => WHEEL_SLICES[slice]?.milli === null;

/** The slice for a draw in [0, WHEEL_WEIGHT_TOTAL). */
export function sliceAt(draw: number) {
  let left = draw;
  for (let i = 0; i < WHEEL_SLICES.length; i++) {
    left -= WHEEL_SLICES[i].weight;
    if (left < 0) return i;
  }
  return WHEEL_SLICES.length - 1;
}

/** Plays `count` spins against a fund of `fund`; each spin first adds its share, so a JACKPOT pays the fund with it. */
export function playSpins(tier: WheelTierId, count: number, fund: number, draw: () => number) {
  const slices: number[] = [];
  const wins: number[] = [];
  let jackpot = 0;
  for (let i = 0; i < count; i++) {
    fund += jackpotShare(tier);
    const s = sliceAt(draw());
    let win: number;
    if (isJackpotSlice(s)) {
      win = fund;
      jackpot += fund;
      fund = jackpotSeed(tier);
    } else win = prizeOf(tier, s);
    slices.push(s);
    wins.push(win);
  }
  return { slices, wins, payout: wins.reduce((a, b) => a + b, 0), jackpot, fund };
}

/** "×0,1", "×25", "×100" for a slice; "JACKPOT" for the fund. */
export const sliceLabel = (slice: number) => {
  const m = WHEEL_SLICES[slice].milli;
  return m === null ? 'JACKPOT' : `×${(m / 1000).toLocaleString('tr-TR')}`;
};
/** The chance of a slice as Turkish percent text ("%37,34", "%0,015"). */
export const sliceChance = (slice: number) => `%${((WHEEL_SLICES[slice].weight / WHEEL_WEIGHT_TOTAL) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}`;
