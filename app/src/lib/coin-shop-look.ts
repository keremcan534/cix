// How the Jeton Yükle screen dresses its packs (app/cuzdan): which rim a pack wears as the packs grow, the true
// "EN AVANTAJLI" pack (most coins per lira, read from the prices the store shows), and the bonus as a percentage.
// Only what is true is shown: no pack is called popular, nothing counts down, nothing claims to be running out
// (Google Play's and the consumer law's rules on misleading offers). Plain functions, checked by
// tests/coin-shop-look.test.ts.

export type PackRim = 'bronze' | 'gold' | 'royal';

/** The rim of the `index`th smallest of `count` packs: the first third bronze, the middle gold, the largest royal. */
export function packRim(index: number, count: number): PackRim {
  if (count <= 1) return 'gold';
  const f = index / (count - 1);
  return f < 1 / 3 ? 'bronze' : f < 2 / 3 ? 'gold' : 'royal';
}

/**
 * A price as the store wrote it ("29,99 TL", "₺1.279,99", "TRY 23.599,99", "$4.99") in its units, or null when it
 * can't be read. The last separator followed by one or two digits is the decimal mark; the others group thousands.
 */
export function parsePrice(text: string): number | null {
  const s = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const m = /^(.*?)([.,])(\d{1,2})$/.exec(s);
  const whole = (m ? m[1] : s).replace(/[.,]/g, '');
  const n = Number(m ? `${whole}.${m[3]}` : whole);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The key of the pack giving the most coins per unit of money (bonuses counted), when every price can be read and
 * one pack really is ahead (by at least 1 %); null otherwise, so the badge never guesses.
 */
export function bestValue(packs: { key: string; coins: number; price: string }[]): string | null {
  if (packs.length < 2) return null;
  const rates = packs.map((p) => ({ key: p.key, rate: (() => { const v = parsePrice(p.price); return v ? p.coins / v : null; })() }));
  if (rates.some((r) => r.rate === null)) return null;
  const sorted = [...rates].sort((a, b) => b.rate! - a.rate!);
  return sorted[0].rate! >= sorted[1].rate! * 1.01 ? sorted[0].key : null;
}

/** A pack's bonus as a whole percentage of its coins ("+%100"), 0 when it has none. */
export const bonusPct = (coins: number, bonus: number) => (coins > 0 && bonus > 0 ? Math.round((bonus / coins) * 100) : 0);
