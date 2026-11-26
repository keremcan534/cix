// What a climbing label says (Yörünge: the multiplier, or Kaç's payout), as worklets: the Skia label works it out on
// the UI thread every frame (fx/climb-label). The same words as lib/rocket-live's mulText and payoutOf, without
// toLocaleString (not dependable on the UI thread): thousands with a dot, decimals with a comma.

export type ClimbFormat = { kind: 'mult' } | { kind: 'pay'; fuel: number; prefix: string } | { kind: 'plus'; prefix: string };

/** 1234567 → "1.234.567". */
export function groupTr(n: number): string {
  'worklet';
  const s = String(Math.max(0, Math.floor(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return out;
}

/** The label for a climb at `x` hundredths: "2,15×", or Kaç's "KAÇ · 2.150" for `fuel` on board; `plus`: a counting
 *  amount as it is ("+12.500", a win's plate). */
export function climbText(x: number, f: ClimbFormat): string {
  'worklet';
  const c = Math.max(0, Math.floor(x));
  if (f.kind === 'pay') return `${f.prefix}${groupTr(Math.floor((f.fuel * c) / 100))}`;
  if (f.kind === 'plus') return `${f.prefix}${groupTr(c)}`;
  const cents = c % 100;
  return `${groupTr(Math.floor(c / 100))},${cents < 10 ? '0' : ''}${cents}×`;
}
