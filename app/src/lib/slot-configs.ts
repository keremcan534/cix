// The payline slots, as data for lib/line-slot. Pays are written in round numbers and multiplied by the game's
// `scale` (rounded down to cents of a line bet), which brings each game just under the 40 % house rule; the tests
// recompute every return exactly. Retuning a game means changing its counts or its scale, nothing else.
import { LINES_10, LINES_15, LINES_20, LINES_3x3, type SlotConfig } from '@/lib/line-slot';

const scaled = (table: Record<string, number[]>, k: number) =>
  Object.fromEntries(Object.entries(table).map(([s, pays]) => [s, pays.map((p) => Math.floor(p * k * 100) / 100)]));
const same = <T,>(n: number, x: T) => Array.from({ length: n }, () => x);

/** Hazine Kulesi: classic fruit machine, 77 wild, JACKPOT for five 77s. */
export const MEGA: SlotConfig = {
  id: 'jackpot',
  rows: 3,
  symbols: {
    cherry: { name: 'Kiraz', label: '🍒' },
    bell: { name: 'Çan', label: '🔔' },
    bar: { name: 'BAR', label: 'BAR' },
    bar2: { name: 'Çift BAR', label: 'BAR BAR' },
    dollar: { name: 'Dolar', label: '$' },
    seven: { name: 'Yedi', label: '7' },
    wild: { name: '77 (Wild)', label: '77' },
  },
  wild: 'wild',
  paytable: { cherry: [1, 3, 8], bell: [2, 4, 10], bar: [2, 5, 12], bar2: [3, 8, 20], dollar: [5, 12, 30], seven: [6, 20, 60] },
  jackpotShare: 0.02,
  counts: [
    ...same(2, { cherry: 8, bell: 6, bar: 5, bar2: 3, dollar: 3, seven: 2, wild: 3 }),
    ...same(3, { cherry: 8, bell: 6, bar: 4, bar2: 4, dollar: 3, seven: 2, wild: 3 }),
  ],
  lines: LINES_10,
};

/** Kızıl Yedi: 3×3 fruit machine, 5 lines, three of a kind. */
export const SUPER777: SlotConfig = {
  id: 'super777',
  rows: 3,
  symbols: {
    cherry: { name: 'Kiraz', label: '🍒' },
    lemon: { name: 'Limon', label: '🍋' },
    mango: { name: 'Mango', label: '🥭' },
    grape: { name: 'Üzüm', label: '🍇' },
    diamond: { name: 'Elmas', label: '💎' },
    seven: { name: 'Yedi', label: '7' },
  },
  paytable: scaled({ cherry: [5], lemon: [8], mango: [10], grape: [15], diamond: [40], seven: [100] }, 1.029),
  counts: same(3, { cherry: 7, lemon: 6, mango: 5, grape: 4, diamond: 2, seven: 1 }),
  lines: LINES_3x3,
};

const CARDS = { ten: { name: '10', label: '10' }, j: { name: 'J', label: 'J' }, q: { name: 'Q', label: 'Q' }, k: { name: 'K', label: 'K' }, a: { name: 'A', label: 'A' } };

/** Vahşi Patika: jungle animals, 15 lines, lion wild, JACKPOT for five lions. */
export const JUNGLE: SlotConfig = {
  id: 'jungle',
  rows: 3,
  symbols: {
    ...CARDS,
    rhino: { name: 'Gergedan', label: '🦏' },
    croc: { name: 'Timsah', label: '🐊' },
    elephant: { name: 'Fil', label: '🐘' },
    gorilla: { name: 'Goril', label: '🦍' },
    wild: { name: 'Aslan (Wild)', label: '🦁' },
  },
  wild: 'wild',
  paytable: scaled({ ten: [1, 2, 5], j: [1, 2, 5], q: [1, 3, 6], k: [2, 4, 8], a: [2, 5, 10], rhino: [3, 8, 20], croc: [4, 10, 25], elephant: [5, 15, 40], gorilla: [8, 25, 80] }, 3.959),
  jackpotShare: 0.02,
  counts: same(5, { ten: 6, j: 6, q: 5, k: 5, a: 4, rhino: 3, croc: 3, elephant: 2, gorilla: 2, wild: 2 }),
  lines: LINES_15,
};

/** Konfeti Kutusu: fiesta symbols, 20 lines, piñata wild, JACKPOT for five piñatas. */
export const PINATA: SlotConfig = {
  id: 'pinata',
  rows: 3,
  symbols: {
    j: CARDS.j,
    q: CARDS.q,
    k: CARDS.k,
    a: CARDS.a,
    chili: { name: 'Biber', label: '🌶️' },
    taco: { name: 'Tako', label: '🌮' },
    maraca: { name: 'Marakas', label: '🪇' },
    guitar: { name: 'Gitar', label: '🎸' },
    skull: { name: 'Kafatası', label: '💀' },
    wild: { name: 'Piñata (Wild)', label: '🪅' },
  },
  wild: 'wild',
  paytable: scaled({ j: [1, 2, 5], q: [1, 2, 5], k: [1, 3, 6], a: [2, 4, 8], chili: [2, 5, 12], taco: [3, 6, 15], maraca: [3, 8, 20], guitar: [5, 12, 30], skull: [8, 20, 60] }, 4.143),
  jackpotShare: 0.02,
  counts: same(5, { j: 6, q: 6, k: 5, a: 5, chili: 4, taco: 3, maraca: 3, guitar: 2, skull: 2, wild: 2 }),
  lines: LINES_20,
};

/**
 * Kayıp Parşömen: wizard symbols, 20 lines, witch wild. Books pay anywhere: 3 = MINI, 4 = MINOR, 5+ = MAJOR (fixed
 * multiples of the stake); five witches on a line win the GRAND (the jackpot fund).
 */
export const SPELL_PRIZES = { MINI: 5, MINOR: 20, MAJOR: 100 } as const;
export const SPELLBOOK: SlotConfig = {
  id: 'spellbook',
  rows: 3,
  symbols: {
    candle: { name: 'Mum', label: '🕯️' },
    scroll: { name: 'Parşömen', label: '📜' },
    staff: { name: 'Asa', label: '🪄' },
    goblet: { name: 'Kadeh', label: '🏆' },
    ring: { name: 'Yüzük', label: '💍' },
    amulet: { name: 'Muska', label: '🧿' },
    cat: { name: 'Kara Kedi', label: '🐈‍⬛' },
    wild: { name: 'Cadı (Wild)', label: '🧙‍♀️' },
    book: { name: 'Parşömen', label: '📜' },
  },
  wild: 'wild',
  scatter: 'book',
  paytable: scaled({ candle: [1, 2, 5], scroll: [1, 3, 6], staff: [2, 4, 8], goblet: [2, 5, 12], ring: [3, 8, 20], amulet: [5, 12, 30], cat: [8, 25, 75] }, 2.336),
  scatterPays: { 3: SPELL_PRIZES.MINI, 4: SPELL_PRIZES.MINOR, 5: SPELL_PRIZES.MAJOR },
  jackpotShare: 0.02,
  counts: same(5, { candle: 7, scroll: 6, staff: 5, goblet: 4, ring: 3, amulet: 3, cat: 2, wild: 2, book: 1 }),
  lines: LINES_20,
};

/** Neon Bulvar: neon fruit machine, 10 lines, WILD, JACKPOT for five wilds. */
export const NEON: SlotConfig = {
  id: 'neon',
  rows: 3,
  symbols: {
    j: CARDS.j,
    q: CARDS.q,
    k: CARDS.k,
    melon: { name: 'Karpuz', label: '🍉' },
    lips: { name: 'Dudak', label: '💋' },
    heart: { name: 'Kalp', label: '💖' },
    gem: { name: 'Elmas', label: '💎' },
    wild: { name: 'WILD', label: 'WILD' },
  },
  wild: 'wild',
  paytable: scaled({ j: [1, 3, 6], q: [1, 3, 6], k: [2, 4, 8], melon: [2, 5, 12], lips: [3, 8, 20], heart: [5, 12, 30], gem: [8, 25, 80] }, 2.196),
  jackpotShare: 0.02,
  counts: same(5, { j: 6, q: 6, k: 5, melon: 4, lips: 3, heart: 3, gem: 2, wild: 2 }),
  lines: LINES_10,
};

export const SLOT_CONFIGS: Record<string, SlotConfig> = Object.fromEntries([MEGA, SUPER777, JUNGLE, PINATA, SPELLBOOK, NEON].map((c) => [c.id, c]));
