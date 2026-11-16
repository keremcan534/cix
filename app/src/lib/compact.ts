// Big numbers in their short form (güncelleme 6, the owner's examples): 1k, 1.1k, 10k, 10.12k, 100k, 100.1k, 1m, 1.1m,
// and b for a billion. Used for every score and total people compare (PK points and team scores, the room's
// contribution ranking, the rankings, gift values received), not for money a person pays or holds (prices, balances,
// withdrawals), which stay exact. Cut down, never rounded up, so nobody shows more than they have.

const UNITS = [
  [1e9, 'b'],
  [1e6, 'm'],
  [1e3, 'k'],
] as const;

/**
 * `n` in its short form with at most `decimals` decimals (trailing zeros dropped, '.' between): 999, 1k, 1.1k,
 * 10.12k, 100.1k, 999.99k, 1m, 2.5b. Below 1.000 the whole number. Never rounded up: 999.999 is 999.99k, not 1m.
 */
export function compact(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const v = Math.floor(Math.abs(n));
  const unit = UNITS.find(([u]) => v >= u);
  if (!unit) return `${sign}${v}`;
  const [size, suffix] = unit;
  const d = Math.max(0, Math.min(2, Math.floor(decimals)));
  const scale = 10 ** d;
  // Integer arithmetic on the cut-down value: no float drift (1.1k must not read 1.09k).
  const cut = Math.floor((v * scale) / size);
  const whole = Math.floor(cut / scale);
  const frac = String(cut % scale)
    .padStart(d, '0')
    .replace(/0+$/, '');
  return `${sign}${whole}${frac ? `.${frac}` : ''}${suffix}`;
}

/**
 * The longest short form of `n` that has at most `chars` characters: two decimals, then one, then none (999k).
 * A slot that holds fewer characters than even that still gets the shortest form.
 */
export function compactFit(n: number, chars: number): string {
  const forms = [compact(n, 2), compact(n, 1), compact(n, 0)];
  return forms.find((s) => s.length <= chars) ?? forms[2];
}
