// Bet-board games (Lucky 77 çarkı, Lezzet Çarkı, Büyücü Kartı): place chips on any of the options, one result is
// drawn for the whole round and every bet on an option that the result pays wins its multiplier. Each option's
// expected return is at most the house rule's 40 % on its own (weight of every result that pays it × multiplier),
// so any mix of bets in a round returns at most 40 % too. Results that pay nobody hold the house share.
//
// Pure functions only (no app or storage imports), so the server and the tests run the same rules.

export type BoardOption = { id: string; name: string; label: string; mult: number };
export type BoardResult = { id: string; name: string; label: string; weight: number; /** Options this result pays. */ pays: string[] };
export type Board = { id: string; options: BoardOption[]; results: BoardResult[] };

/**
 * Lucky 77: a 20-slice fruit wheel. Karpuz and Elma pay 2x, 77 pays 8x; Limon and Üzüm slices pay nobody.
 * Each pick: 4/20 × 2 = 1/20 × 8 = 0.4.
 */
export const LUCKY77: Board = {
  id: 'slot',
  options: [
    { id: 'melon', name: 'Karpuz', label: '🍉', mult: 2 },
    { id: 'seven', name: '77', label: '77', mult: 8 },
    { id: 'apple', name: 'Elma', label: '🍎', mult: 2 },
  ],
  results: [
    { id: 'seven', name: '77', label: '77', weight: 1, pays: ['seven'] },
    { id: 'apple', name: 'Elma', label: '🍎', weight: 4, pays: ['apple'] },
    { id: 'melon', name: 'Karpuz', label: '🍉', weight: 4, pays: ['melon'] },
    { id: 'lemon', name: 'Limon', label: '🍋', weight: 6, pays: [] },
    { id: 'grape', name: 'Üzüm', label: '🍇', weight: 5, pays: [] },
  ],
};
/** Order of the Lucky 77 wheel's 20 slices, by result id (spread so equal fruit don't sit together). */
export const LUCKY_WHEEL = ['seven', 'apple', 'lemon', 'melon', 'grape', 'apple', 'lemon', 'melon', 'grape', 'lemon', 'apple', 'melon', 'grape', 'lemon', 'apple', 'melon', 'grape', 'lemon', 'grape', 'lemon'];

/**
 * Lezzet Çarkı: eight dishes on a Ferris wheel. Salata pays every vegetable bet, Pizza every meat and sea bet; Boş
 * Tabak pays nobody. Weights out of 9000: (540 + 180) × 5 = (324 + 36) × 10 = (204 + 36) × 15 = (108 + 36) × 25 =
 * (44 + 36) × 45 = 3600 → each option returns exactly 0.4.
 */
const VEG = ['cabbage', 'mushroom', 'pumpkin', 'tomato'];
const MEAT = ['steak', 'shrimp', 'fish', 'crab'];
export const FOOD_WHEEL: Board = {
  id: 'foodwheel',
  options: [
    { id: 'crab', name: 'Yengeç', label: '🦀', mult: 45 },
    { id: 'fish', name: 'Balık', label: '🐟', mult: 25 },
    { id: 'shrimp', name: 'Karides', label: '🍤', mult: 15 },
    { id: 'steak', name: 'Et', label: '🥩', mult: 10 },
    { id: 'tomato', name: 'Domates', label: '🍅', mult: 5 },
    { id: 'pumpkin', name: 'Balkabağı', label: '🎃', mult: 5 },
    { id: 'mushroom', name: 'Mantar', label: '🍄', mult: 5 },
    { id: 'cabbage', name: 'Lahana', label: '🥬', mult: 5 },
  ],
  results: [
    ...VEG.map((id) => ({ id, name: '', label: '', weight: 540, pays: [id] })),
    { id: 'steak', name: '', label: '', weight: 324, pays: ['steak'] },
    { id: 'shrimp', name: '', label: '', weight: 204, pays: ['shrimp'] },
    { id: 'fish', name: '', label: '', weight: 108, pays: ['fish'] },
    { id: 'crab', name: '', label: '', weight: 44, pays: ['crab'] },
    { id: 'salad', name: 'Salata', label: '🥗', weight: 180, pays: VEG },
    { id: 'pizza', name: 'Pizza', label: '🍕', weight: 36, pays: MEAT },
    { id: 'empty', name: 'Boş Tabak', label: '🍽️', weight: 5944, pays: [] },
  ],
};

/**
 * Büyücü Kartı: eight zodiac cards. Weights out of 3000 are 1200 / multiplier, so each card returns exactly 0.4; the
 * Joker result pays nobody.
 */
export const MAGIC_CARD: Board = {
  id: 'magiccard',
  options: [
    { id: 'aquarius', name: 'Kova', label: '♒', mult: 100 },
    { id: 'virgo', name: 'Başak', label: '♍', mult: 4 },
    { id: 'taurus', name: 'Boğa', label: '♉', mult: 4 },
    { id: 'cancer', name: 'Yengeç', label: '♋', mult: 5 },
    { id: 'pisces', name: 'Balık', label: '♓', mult: 50 },
    { id: 'leo', name: 'Aslan', label: '♌', mult: 25 },
    { id: 'sagittarius', name: 'Yay', label: '♐', mult: 15 },
    { id: 'scorpio', name: 'Akrep', label: '♏', mult: 5 },
  ],
  results: [
    ...[
      ['aquarius', 12],
      ['virgo', 300],
      ['taurus', 300],
      ['cancer', 240],
      ['pisces', 24],
      ['leo', 48],
      ['sagittarius', 80],
      ['scorpio', 240],
    ].map(([id, weight]) => ({ id: id as string, name: '', label: '', weight: weight as number, pays: [id as string] })),
    { id: 'joker', name: 'Joker', label: '🃏', weight: 1756, pays: [] },
  ],
};

export const BOARDS: Record<string, Board> = Object.fromEntries([LUCKY77, FOOD_WHEEL, MAGIC_CARD].map((b) => [b.id, b]));

// Results that are a single option borrow its name and picture.
for (const b of Object.values(BOARDS))
  for (const r of b.results) {
    const o = b.options.find((x) => x.id === r.id);
    if (o && !r.name) Object.assign(r, { name: o.name, label: o.label });
  }

export const boardTotal = (b: Board) => b.results.reduce((n, r) => n + r.weight, 0);
export const optionOf = (b: Board, id: string) => b.options.find((o) => o.id === id);

/** The result for a uniform draw 0…total−1. */
export function boardResult(b: Board, d: number): BoardResult {
  let r = d;
  return b.results.find((x) => (r -= x.weight) < 0)!;
}
/** Payout of a set of bets (option → coins) for a result. */
export const boardPayout = (b: Board, bets: Record<string, number>, result: BoardResult) =>
  Object.entries(bets).reduce((n, [id, amount]) => n + (result.pays.includes(id) ? amount * optionOf(b, id)!.mult : 0), 0);
/** Exact expected return of a bet on one option. */
export const optionReturn = (b: Board, id: string) => (b.results.reduce((n, r) => n + (r.pays.includes(id) ? r.weight : 0), 0) * optionOf(b, id)!.mult) / boardTotal(b);
/** Highest payout a set of bets can get from one result (the pool must cover it before the round). */
export const boardMaxPayout = (b: Board, bets: Record<string, number>) => Math.max(...b.results.map((r) => boardPayout(b, bets, r)));
