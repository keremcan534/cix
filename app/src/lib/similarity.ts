// "%82 benzer": how much two people have in common, the idea behind the app's name.
// Shared interests carry most of the weight; same city and close age add a little.
// The reasons are shown next to the score so it never feels like a black box.
import type { User } from '@/data/mock';

export type Similarity = { score: number; shared: string[]; reasons: string[] };

export function similarity(me: User, other: User): Similarity {
  const mine = new Set(me.interests ?? []);
  const theirs = other.interests ?? [];
  const shared = theirs.filter((i) => mine.has(i));
  const smaller = Math.max(1, Math.min(mine.size, theirs.length));
  let score = 35 + 45 * (shared.length / smaller);
  const reasons: string[] = [];
  if (shared.length) reasons.push(`İkiniz de ${shared.join(', ')} seviyorsunuz`);
  if (me.city && me.city === other.city) {
    score += 8;
    reasons.push(`İkiniz de ${other.city}'dasınız`);
  }
  const ageGap = Math.abs(me.age - other.age);
  if (ageGap <= 3) {
    score += 5;
    reasons.push('Yaşlarınız yakın');
  } else if (ageGap <= 6) score += 2;
  return { score: Math.round(Math.min(98, Math.max(30, score))), shared, reasons };
}
