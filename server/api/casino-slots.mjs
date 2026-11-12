// Oyun Salonu reel games (casino.mjs): the payline slots (Hazine Kulesi, Kızıl Yedi, Vahşi Patika, Konfeti Kutusu,
// Kayıp Parşömen, Neon Bulvar) and Yıldız Avı. Pure data and functions, the same as the app's demo engines
// (app/src/lib/line-slot.ts, slot-configs.ts, fener-slot.ts); the app's test tests/casino-server.test.ts keeps them
// equal, draw for draw, so the screens replay exactly what the server decided.
//
// House rule of every coin game: the expected return of a round is at most 40 % of the stake (line wins + scatter
// pays + the JACKPOT share), computed exactly by slotReturn and fenerReturn.

// --- Payline slot engine (app lib/line-slot) ---------------------------------------------------------------------
// Each reel has a fixed strip (counts per symbol, spread evenly); one stop is drawn per reel, uniformly. The window
// shows the stop and the rows − 1 symbols after it. The stake is spread over the lines; a line pays for 3+ of the
// same symbol from the leftmost reel, wild standing in for all but the scatter. The scatter pays anywhere, in
// multiples of the whole stake. With `jackpotShare`, a line of only wilds wins the game's JACKPOT fund instead.

/** Lays counts out as a strip, spreading each symbol evenly so equal symbols don't bunch up. */
export function buildStrip(counts) {
  const placed = [];
  Object.keys(counts).forEach((sym, k) => {
    for (let i = 0; i < counts[sym]; i++) placed.push({ sym, at: (i + 0.5) / counts[sym] + k * 1e-3 });
  });
  return placed.sort((a, b) => a.at - b.at).map((p) => p.sym);
}

const stripCache = new Map();
export const stripsOf = (c) => {
  let s = stripCache.get(c.id);
  if (!s) stripCache.set(c.id, (s = c.counts.map(buildStrip)));
  return s;
};

/** Pay of one line in line bets from the symbols it crosses (left to right); 'jackpot' for a line of wilds. */
export function linePay(c, syms) {
  const first = syms.findIndex((s) => s !== c.wild);
  if (first < 0) {
    if (c.jackpotShare) return 'jackpot';
    const t = c.paytable[c.wild];
    return t ? { sym: c.wild, count: syms.length, pay: t[syms.length - 3] } : null;
  }
  const sym = syms[first];
  const table = c.paytable[sym];
  if (!table) return null;
  let count = first + 1;
  while (count < syms.length && (syms[count] === sym || syms[count] === c.wild)) count++;
  return count >= 3 ? { sym, count, pay: table[count - 3] ?? 0 } : null;
}

export const scatterPay = (c, n) => {
  if (!c.scatterPays) return 0;
  const keys = Object.keys(c.scatterPays)
    .map(Number)
    .filter((k) => k <= n);
  return keys.length ? c.scatterPays[Math.max(...keys)] : 0;
};

export const slotWindow = (c, stops) => {
  const strips = stripsOf(c);
  return stops.map((s, r) => Array.from({ length: c.rows }, (_, k) => strips[r][(s + k) % strips[r].length]));
};

export function slotSpin(c, stops) {
  const grid = slotWindow(c, stops);
  const wins = [];
  const jackpotLines = [];
  c.lines.forEach((rows, line) => {
    const w = linePay(
      c,
      rows.map((row, reel) => grid[reel][row]),
    );
    if (w === 'jackpot') jackpotLines.push(line);
    else if (w && w.pay) wins.push({ line, ...w });
  });
  const scatters = c.scatter ? grid.flat().filter((s) => s === c.scatter).length : 0;
  const lineWin = wins.reduce((n, w) => n + w.pay, 0) / c.lines.length;
  return { stops, grid, wins, scatters, jackpotLines, multiplier: lineWin + scatterPay(c, scatters) };
}

/** One round from a uniform draw function (rnd(n) → 0…n−1). */
export const playSlot = (c, rnd) =>
  slotSpin(
    c,
    stripsOf(c).map((s) => rnd(s.length)),
  );

/** Exact expected return of one round, as a share of the stake: line wins, scatter pays and the jackpot share. */
export function slotReturn(c) {
  const strips = stripsOf(c);
  const syms = Object.keys(c.symbols);
  const p = strips.map((strip) => Object.fromEntries(syms.map((s) => [s, strip.filter((x) => x === s).length / strip.length])));
  let lines = 0;
  let jackpotLine = 0;
  const walk = (reel, picked, prob) => {
    if (prob === 0) return;
    if (reel === strips.length) {
      const w = linePay(c, picked);
      if (w === 'jackpot') jackpotLine += prob;
      else lines += prob * (w?.pay ?? 0);
      return;
    }
    for (const s of syms) walk(reel + 1, [...picked, s], prob * p[reel][s]);
  };
  walk(0, [], 1);
  let scatter = 0;
  if (c.scatter && c.scatterPays) {
    let dist = [1];
    strips.forEach((strip) => {
      const per = [];
      strip.forEach((_, s) => {
        const n = Array.from({ length: c.rows }, (_, k) => strip[(s + k) % strip.length]).filter((x) => x === c.scatter).length;
        per[n] = (per[n] ?? 0) + 1 / strip.length;
      });
      const next = [];
      dist.forEach((a, i) => per.forEach((b = 0, j) => (next[i + j] = (next[i + j] ?? 0) + a * b)));
      dist = next;
    });
    scatter = dist.reduce((n, pr = 0, k) => n + pr * scatterPay(c, k), 0);
  }
  const jackpot = c.jackpotShare ?? 0;
  return { lines, scatter, jackpot, total: lines + scatter + jackpot, jackpotLine };
}

/** Highest win of one round from lines and scatter, in multiples of the stake (every line at the top pay). */
export const slotMax = (c) => Math.max(...Object.values(c.paytable).map((t) => t[t.length - 1])) + Math.max(0, ...Object.values(c.scatterPays ?? {}));

// --- Payline sets ------------------------------------------------------------------------------------------------
/** 5×3, 10 lines. */
export const LINES_10 = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 2, 1, 0, 1],
];
/** 5×3, 15 lines. */
export const LINES_15 = [...LINES_10, [1, 0, 1, 2, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2]];
/** 5×3, 20 lines. */
export const LINES_20 = [...LINES_15, [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]];
/** 3×3, 5 lines: the three rows and the two diagonals. */
export const LINES_3x3 = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

// --- The six slots (app lib/slot-configs) ------------------------------------------------------------------------
// Pays are written in round numbers and multiplied by the game's scale (rounded down to cents of a line bet), which
// brings each game just under the 40 % house rule.
const scaled = (table, k) => Object.fromEntries(Object.entries(table).map(([s, pays]) => [s, pays.map((p) => Math.floor(p * k * 100) / 100)]));
const same = (n, x) => Array.from({ length: n }, () => x);

/** Hazine Kulesi: classic fruit machine, 77 wild, JACKPOT for five 77s. */
export const MEGA = {
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
  counts: [...same(2, { cherry: 8, bell: 6, bar: 5, bar2: 3, dollar: 3, seven: 2, wild: 3 }), ...same(3, { cherry: 8, bell: 6, bar: 4, bar2: 4, dollar: 3, seven: 2, wild: 3 })],
  lines: LINES_10,
};

/** Kızıl Yedi: 3×3 fruit machine, 5 lines, three of a kind. */
export const SUPER777 = {
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
export const JUNGLE = {
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
export const PINATA = {
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

/** Kayıp Parşömen: books pay anywhere (3 MINI, 4 MINOR, 5+ MAJOR); five witches on a line win the GRAND fund. */
export const SPELL_PRIZES = { MINI: 5, MINOR: 20, MAJOR: 100 };
export const SPELLBOOK = {
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
export const NEON = {
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

export const SLOT_CONFIGS = Object.fromEntries([MEGA, SUPER777, JUNGLE, PINATA, SPELLBOOK, NEON].map((c) => [c.id, c]));

// --- Yıldız Avı (app lib/fener-slot) ------------------------------------------------------------------------------
// Each of the 5×4 cells is drawn on its own (empty sky, a star with a value, or a kuyruklu yıldız; the keys 'sea',
// 'ship' with its `cargo`, and 'lamp' are the game's first names, kept for the history); the beam stops on one row,
// uniformly, with its own brightness draw. 3+ kuyruklu yıldız start Yıldız Yağmuru: STORM_SPINS spins lighting two
// rows, one step brighter each spin. A round pays at most FENER_MAX times the stake.
export const COLS = 5;
export const ROWS = 4;
export const CELLS = COLS * ROWS;
export const CELL_WEIGHTS = { sea: 202, ship: 23, lamp: 5 };
/** A star's value (`cargo`) in tenths of the stake and its weight. */
export const CARGO = [
  { tenths: 1, weight: 900 },
  { tenths: 2, weight: 600 },
  { tenths: 5, weight: 280 },
  { tenths: 10, weight: 110 },
  { tenths: 20, weight: 45 },
  { tenths: 50, weight: 14 },
  { tenths: 100, weight: 5 },
  { tenths: 250, weight: 2 },
  { tenths: 500, weight: 1 },
];
export const BRIGHTNESS = [
  { value: 1, weight: 60 },
  { value: 2, weight: 24 },
  { value: 3, weight: 11 },
  { value: 5, weight: 5 },
];
export const STORM_TRIGGER = 3;
export const STORM_SPINS = 6;
export const STORM_ROWS = 2;
export const FENER_MAX = 500;
export const ROW_PAIRS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];
const CELL_TOTAL = CELL_WEIGHTS.sea + CELL_WEIGHTS.ship + CELL_WEIGHTS.lamp;
const CARGO_TOTAL = CARGO.reduce((n, c) => n + c.weight, 0);
const BRIGHT_TOTAL = BRIGHTNESS.reduce((n, b) => n + b.weight, 0);

/** Scores a board for the given lit rows and brightness. */
export function evaluateBoard(grid, lit, brightness) {
  let tenths = 0;
  for (const r of lit) for (const c of grid[r]) if (c.kind === 'ship') tenths += c.cargo;
  const lamps = grid.flat().filter((c) => c.kind === 'lamp').length;
  return { grid, lit, brightness, cargo: tenths / 10, lamps, pay: (tenths * brightness) / 10 };
}

function drawCell(rnd) {
  const r = rnd(CELL_TOTAL);
  if (r < CELL_WEIGHTS.sea) return { kind: 'sea' };
  if (r >= CELL_WEIGHTS.sea + CELL_WEIGHTS.ship) return { kind: 'lamp' };
  let w = rnd(CARGO_TOTAL);
  return { kind: 'ship', cargo: CARGO.find((c) => (w -= c.weight) < 0).tenths };
}
const drawBoard = (rnd) => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => drawCell(rnd)));

/** A base spin: the board, then the beam's row, then its brightness. */
export function baseSpin(rnd) {
  const grid = drawBoard(rnd);
  const row = rnd(ROWS);
  let b = rnd(BRIGHT_TOTAL);
  return evaluateBoard(grid, [row], BRIGHTNESS.find((x) => (b -= x.weight) < 0).value);
}

/** Yıldız Yağmuru spin `n` (1-based): two rows lit, brightness n. */
export function stormSpin(rnd, n) {
  const grid = drawBoard(rnd);
  return evaluateBoard(grid, [...ROW_PAIRS[rnd(ROW_PAIRS.length)]], n);
}

/** One round: the base spin and, with 3+ kuyruklu yıldız, Yıldız Yağmuru. */
export function playFener(rnd) {
  const base = baseSpin(rnd);
  const storm = base.lamps >= STORM_TRIGGER ? Array.from({ length: STORM_SPINS }, (_, i) => stormSpin(rnd, i + 1)) : [];
  const total = base.pay + storm.reduce((n, s) => n + s.pay, 0);
  return { base, storm, multiplier: Math.min(total, FENER_MAX), capped: total > FENER_MAX };
}

/** Exact expected return of one round, ignoring the FENER_MAX cap (which only lowers it): an upper bound. */
export function fenerReturn() {
  const cell = (CELL_WEIGHTS.ship / CELL_TOTAL) * (CARGO.reduce((n, c) => n + c.tenths * c.weight, 0) / CARGO_TOTAL / 10);
  const bright = BRIGHTNESS.reduce((n, b) => n + b.value * b.weight, 0) / BRIGHT_TOTAL;
  const base = bright * COLS * cell;
  // P(at least STORM_TRIGGER kuyruklu yıldız among CELLS independent cells).
  const p = CELL_WEIGHTS.lamp / CELL_TOTAL;
  let pk = (1 - p) ** CELLS;
  let below = 0;
  for (let k = 0; k < STORM_TRIGGER; k++) {
    below += pk;
    pk = (pk * (CELLS - k) * p) / ((k + 1) * (1 - p));
  }
  const trigger = 1 - below;
  const storm = ((STORM_SPINS * (STORM_SPINS + 1)) / 2) * STORM_ROWS * COLS * cell;
  return { cell, base, trigger, storm, total: base + trigger * storm };
}
