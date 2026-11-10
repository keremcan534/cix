// Şanslı çanta's rules and its arithmetic, with no server around them (lucky-bags.mjs uses these; tests too).
import crypto from 'node:crypto';

/** What a bag may hold. The app shows these as they come (GET), so they can change without an app update. */
export const BAG_RULES = {
  coins: [1_000, 5_000, 10_000, 50_000],
  coinPackets: [5, 10, 20, 30],
  giftCounts: [10, 30, 99],
  giftPackets: [5, 10, 15],
  delays: [0, 120, 300],
  // How long a bag falls once it opens: whoever taps it then joins, and the draw is when it ends.
  windowSeconds: 30,
};

/**
 * `total` units in `n` shares, each at least 1, drawn at random: each share is at most twice what is left per
 * share, so the bag stays fair to the last ones (and the first one can't take nearly everything).
 */
export function split(total, n, rand = (lo, hi) => crypto.randomInt(lo, hi + 1)) {
  if (!(n > 0) || total < n) throw new Error('split: too few units');
  const out = [];
  let left = total;
  for (let i = n; i > 1; i--) {
    const hi = Math.min(left - (i - 1), Math.floor((2 * left) / i));
    const x = hi > 1 ? rand(1, hi) : 1;
    out.push(x);
    left -= x;
  }
  out.push(left);
  return out;
}

/** Takes `amount` coins from the bag's kept parts, first lot first: [taken, kept]. */
export function takeParts(parts, amount) {
  const taken = [];
  const kept = [];
  let left = amount;
  for (const p of parts) {
    const t = Math.min(left, p.amount);
    if (t > 0) taken.push({ ...p, amount: t });
    if (p.amount > t) kept.push({ ...p, amount: p.amount - t });
    left -= t;
  }
  if (left > 0) throw new Error('lucky bag: kept coins short');
  return [taken, kept];
}

/**
 * The bag's shares dealt among the people who joined, at random: with as many people as shares or more, a random
 * `shares.length` of them get one share each (not everyone wins); with fewer, everyone gets one and each share
 * left goes to someone among them at random, so the whole bag is always given out. [userId, units][], one per
 * winner, units summed.
 */
export function deal(shares, entrants, randInt = (n) => crypto.randomInt(n)) {
  if (!entrants.length) return [];
  const people = [...entrants];
  for (let i = people.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [people[i], people[j]] = [people[j], people[i]];
  }
  const won = new Map();
  shares.forEach((units, i) => {
    const who = i < people.length ? people[i] : people[randInt(people.length)];
    won.set(who, (won.get(who) ?? 0) + units);
  });
  return [...won];
}
