// Oyun Salonu on the server (casino.mjs): the catalog of the games the server plays (Bilye Şelalesi's rules are in
// casino-bilye.mjs), their stakes, and every game's
// round as pure functions. The same rules as the app's demo engines (app/src/lib/casino-odds.ts, board-games.ts,
// fish-hunt.ts, crash-rocket.ts, gold-tree.ts and data/games.ts); the app's test tests/casino-server.test.ts keeps
// them equal, draw for draw, so a screen replays exactly the round the server decided. The reel games are in
// casino-slots.mjs. No database and no core.mjs, so the app's tests can import this file.
//
// House rule of every coin game: of all coins played, 60 % stays with the house and 40 % goes back as randomly drawn
// winnings. The odds give every game and pick an expected return of at most 40 %; the payout pool (casino.mjs) books
// 60 % of each stake to the house at once and pays winnings only from the other 40 %, so the share holds exactly.
// The odds are fixed here, not live settings: the installed app shows these multipliers, paytables and rules, and a
// server-side change would promise prizes the server no longer pays (as gift prices, live-registry.mjs).
import { BILYE_MAX, BILYE_PICKS, bilyeDetail, bilyeReturn, playBilye } from './casino-bilye.mjs';
import { FENER_MAX, SLOT_CONFIGS, fenerReturn, playFener, playSlot, slotMax, slotReturn } from './casino-slots.mjs';

export const HOUSE_SHARE = 0.6;
export const RETURN_SHARE = 0.4;

// --- Catalog (app data/games.ts CASINO_GAMES, the active ones) ----------------------------------------------------
/** No coin game takes less than this per round. */
export const MIN_STAKE = 250;
/** Stake ladders: the higher a game's top multiplier, the lower its top stake (the top prize fits the pool seed). */
export const STAKES = {
  wide: [MIN_STAKE, 500, 1_000, 5_000, 10_000, 25_000],
  high: [MIN_STAKE, 500, 1_000, 5_000, 10_000],
  mid: [MIN_STAKE, 500, 1_000, 5_000],
  base: [MIN_STAKE, 500, 1_000],
};
/** The default daily ceiling per game: this many rounds at the game's top stake (live setting casino_daily_rounds). */
export const DAILY_ROUNDS = 40;
/**
 * The games the server plays, in the app's order. `id` is the app's (and the history's) key: 'olympus' is Fener
 * Kayalığı and 'slot' Gece Yarısı Çarkı. The demo's switched-off games (Şans Çarkı, Zar, Ejder ile Kaplan, Altın
 * Kasa) are not here: nothing in the app shows them.
 */
export const GAMES = [
  { id: 'slot', name: 'Gece Yarısı Çarkı', bets: STAKES.wide },
  { id: 'jackpot', name: 'Hazine Kulesi', bets: STAKES.wide },
  { id: 'olympus', name: 'Fener Kayalığı', bets: STAKES.base },
  { id: 'fish', name: 'Mercan Avı', bets: STAKES.high },
  { id: 'rocket', name: 'Yörünge', bets: STAKES.wide },
  { id: 'super777', name: 'Kızıl Yedi', bets: STAKES.high },
  { id: 'jungle', name: 'Vahşi Patika', bets: STAKES.mid },
  { id: 'goldtree', name: 'Bereket Ağacı', bets: STAKES.high },
  { id: 'foodwheel', name: 'Liman Pazarı', bets: STAKES.wide },
  { id: 'magiccard', name: 'Sihir Destesi', bets: STAKES.high },
  { id: 'pinata', name: 'Konfeti Kutusu', bets: STAKES.mid },
  { id: 'spellbook', name: 'Kayıp Parşömen', bets: STAKES.mid },
  { id: 'neon', name: 'Neon Bulvar', bets: STAKES.high },
  { id: 'bilye', name: 'Bilye Şelalesi', bets: STAKES.wide },
];
export const GAME_IDS = GAMES.map((g) => g.id);
export const gameById = (id) => (typeof id === 'string' ? GAMES.find((g) => g.id === id) : undefined);
export const topStake = (g) => g.bets[g.bets.length - 1];
/** The stakes a game takes when the top stake is capped at `max` (live setting casino_max_bet). */
export const betsUpTo = (g, max) => g.bets.filter((b) => b <= max);

/** Opening payout pool: a house advance so the first rounds can pay their top prize. */
export const POOL_SEED = 2_000_000;
/** Opening JACKPOT of each slot that has one, also house advances. */
export const JACKPOT_SEEDS = { jackpot: 100_000, jungle: 1_000_000, pinata: 500_000, spellbook: 800_000, neon: 2_000_000 };

// --- Mercan Avı (app lib/fish-hunt) ------------------------------------------------------------------------------
// A shot at a fish worth m× is caught when the draw (0…10m−1) is below FISH_HIT: P = 4 / 10m, so m × P = 0.4.
export const FISH = [
  { id: 'clown', name: 'Palyaço Balığı', emoji: '🐠', mult: 2, size: 34, cross: 9, spawn: 30 },
  { id: 'sardine', name: 'Sarı Balık', emoji: '🐟', mult: 3, size: 36, cross: 10, spawn: 26 },
  { id: 'puffer', name: 'Balon Balığı', emoji: '🐡', mult: 5, size: 40, cross: 11, spawn: 18 },
  { id: 'squid', name: 'Kalamar', emoji: '🦑', mult: 8, size: 44, cross: 12, spawn: 12 },
  { id: 'octopus', name: 'Ahtapot', emoji: '🐙', mult: 10, size: 48, cross: 13, spawn: 10 },
  { id: 'turtle', name: 'Kaplumbağa', emoji: '🐢', mult: 15, size: 50, cross: 15, spawn: 8 },
  { id: 'dolphin', name: 'Yunus', emoji: '🐬', mult: 20, size: 56, cross: 12, spawn: 6 },
  { id: 'shark', name: 'Köpekbalığı', emoji: '🦈', mult: 30, size: 64, cross: 14, spawn: 4 },
  { id: 'whale', name: 'Balina', emoji: '🐳', mult: 50, size: 76, cross: 18, spawn: 2 },
  { id: 'dragon', name: 'Altın Ejderha', emoji: '🐉', mult: 100, size: 84, cross: 20, spawn: 1 },
];
export const FISH_HIT = 4;
export const fishById = (id) => FISH.find((f) => f.id === id);
export const fishDraw = (f) => f.mult * 10;
export function shootFish(f, d) {
  const caught = d < FISH_HIT;
  return { caught, multiplier: caught ? f.mult : 0 };
}
export function fishReturn(f) {
  let sum = 0;
  for (let d = 0; d < fishDraw(f); d++) sum += shootFish(f, d).multiplier;
  return sum / fishDraw(f);
}

// --- Yörünge (app lib/crash-rocket) ------------------------------------------------------------------------------
// crash = ⌊ 0.4 · N / (d + 1) ⌋ / 100 for a uniform draw d in 0…N−1, capped at ROCKET_MAX, so P(crash ≥ x) ≤ 0.4 / x.
export const ROCKET_DRAW = 100_000;
export const ROCKET_MAX = 1000;
export const ROCKET_TARGETS = [1.2, 1.5, 2, 3, 5, 10, 20, 50, 100, 1000];
export function crashPoint(d) {
  const x = Math.floor((0.4 * ROCKET_DRAW * 100) / (d + 1)) / 100;
  return x < 1 ? 0 : Math.min(x, ROCKET_MAX);
}
export const rocketMultiplier = (crash, target) => (crash >= target ? target : 0);
export function rocketReturn(target) {
  let lo = 0;
  let hi = ROCKET_DRAW;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (crashPoint(mid) >= target) lo = mid + 1;
    else hi = mid;
  }
  return (lo * target) / ROCKET_DRAW;
}

// --- Bereket Ağacı (app lib/gold-tree) ---------------------------------------------------------------------------
export const TREE_LABEL = { tree: '🌳', red: '🔴', blue: '🔵', green: '🟢', blank: '' };
export const TREE_PAYS = [
  { name: '🌳🌳🌳', pay: 188, test: (s) => s.every((x) => x === 'tree') },
  { name: '🔴🔴🔴', pay: 58, test: (s) => s.every((x) => x === 'red') },
  { name: '🔵🔵🔵', pay: 28, test: (s) => s.every((x) => x === 'blue') },
  { name: '🟢🟢🟢', pay: 18, test: (s) => s.every((x) => x === 'green') },
  { name: '🌳 + iki para', pay: 8, test: (s) => s[0] === 'tree' && s.slice(1).every((x) => x !== 'blank') },
  { name: 'Herhangi üç para', pay: 2, test: (s) => s.every((x) => x !== 'blank' && x !== 'tree') },
];
const treeStrip = (counts) => {
  const placed = [];
  Object.keys(counts).forEach((sym, k) => {
    for (let i = 0; i < counts[sym]; i++) placed.push({ sym, at: (i + 0.5) / counts[sym] + k * 1e-3 });
  });
  return placed.sort((a, b) => a.at - b.at).map((p) => p.sym);
};
export const TREE_STRIPS = [
  treeStrip({ tree: 1, red: 2, blue: 3, green: 4, blank: 13 }),
  treeStrip({ tree: 1, red: 2, blue: 3, green: 4, blank: 13 }),
  treeStrip({ tree: 1, red: 2, blue: 3, green: 4, blank: 12 }),
];
const treeWindow = (stops) => stops.map((s, r) => [-1, 0, 1].map((k) => TREE_STRIPS[r][(s + k + TREE_STRIPS[r].length) % TREE_STRIPS[r].length]));
function treePay(middle) {
  const hit = TREE_PAYS.find((p) => p.test(middle));
  return hit ? { name: hit.name, pay: hit.pay } : null;
}
export function treeSpin(stops) {
  const grid = treeWindow(stops);
  const win = treePay(grid.map((c) => c[1]));
  return { stops, grid, win, multiplier: win?.pay ?? 0 };
}
export const playTree = (rnd) => treeSpin(TREE_STRIPS.map((s) => rnd(s.length)));
export function treeReturn() {
  let sum = 0;
  let n = 0;
  for (let a = 0; a < TREE_STRIPS[0].length; a++)
    for (let b = 0; b < TREE_STRIPS[1].length; b++)
      for (let c = 0; c < TREE_STRIPS[2].length; c++) {
        sum += treeSpin([a, b, c]).multiplier;
        n++;
      }
  return sum / n;
}
export const TREE_MAX = TREE_PAYS[0].pay;

// --- Bet boards (app lib/board-games) ----------------------------------------------------------------------------
// Chips on any of the options; one result is drawn for the round and every bet on an option it pays wins that
// option's multiplier. Each option returns at most 40 % on its own, so any mix of bets does too.
export const LUCKY77 = {
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
const VEG = ['cabbage', 'mushroom', 'pumpkin', 'tomato'];
const MEAT = ['steak', 'shrimp', 'fish', 'crab'];
export const FOOD_WHEEL = {
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
export const MAGIC_CARD = {
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
    ].map(([id, weight]) => ({ id, name: '', label: '', weight, pays: [id] })),
    { id: 'joker', name: 'Joker', label: '🃏', weight: 1756, pays: [] },
  ],
};
export const BOARDS = Object.fromEntries([LUCKY77, FOOD_WHEEL, MAGIC_CARD].map((b) => [b.id, b]));
// Results that are a single option borrow its name and picture.
for (const b of Object.values(BOARDS))
  for (const r of b.results) {
    const o = b.options.find((x) => x.id === r.id);
    if (o && !r.name) Object.assign(r, { name: o.name, label: o.label });
  }
export const boardTotal = (b) => b.results.reduce((n, r) => n + r.weight, 0);
export const optionOf = (b, id) => b.options.find((o) => o.id === id);
export function boardResult(b, d) {
  let r = d;
  return b.results.find((x) => (r -= x.weight) < 0);
}
export const boardPayout = (b, bets, result) => Object.entries(bets).reduce((n, [id, amount]) => n + (result.pays.includes(id) ? amount * optionOf(b, id).mult : 0), 0);
export const optionReturn = (b, id) => (b.results.reduce((n, r) => n + (r.pays.includes(id) ? r.weight : 0), 0) * optionOf(b, id).mult) / boardTotal(b);
export const boardMaxPayout = (b, bets) => Math.max(...b.results.map((r) => boardPayout(b, bets, r)));

// --- Rounds (app lib/casino-odds) --------------------------------------------------------------------------------
export const isLineSlot = (id) => Object.hasOwn(SLOT_CONFIGS, id);
export const isBoard = (id) => Object.hasOwn(BOARDS, id);
/** The picks a game takes ('' for the ones without a choice); a board's options are bet on in `bets` instead. */
export const PICKS = Object.fromEntries(
  GAME_IDS.map((id) => [
    id,
    id === 'fish' ? FISH.map((f) => f.id) : id === 'rocket' ? ROCKET_TARGETS.map(String) : id === 'bilye' ? [...BILYE_PICKS] : isBoard(id) ? BOARDS[id].options.map((o) => o.id) : [''],
  ]),
);

/**
 * One round of a game from a uniform draw function (rnd(n) → 0…n−1), as the app's outcomeOf: `display`, the
 * multiplier, the history's `detail` and one field per engine for the screen to replay (slot, tree, rocket, board,
 * fener, caught).
 */
export function outcomeOf(game, pick, rnd) {
  if (isLineSlot(game)) {
    const c = SLOT_CONFIGS[game];
    const sp = playSlot(c, rnd);
    const detail = [
      sp.grid.map((reel) => c.symbols[reel[1]].label).join(' '),
      sp.wins.length ? `${sp.wins.length} çizgi` : 'çizgi yok',
      sp.scatters && c.scatter ? `${sp.scatters} ${c.symbols[c.scatter].label}` : '',
      sp.jackpotLines.length && c.jackpotShare ? 'JACKPOT' : '',
      `${Math.round(sp.multiplier * 10) / 10}x`,
    ];
    return { display: sp.grid.flat(), multiplier: sp.multiplier, detail: detail.filter(Boolean).join(' · '), slot: sp };
  }
  if (game === 'goldtree') {
    const t = playTree(rnd);
    return { display: t.grid.map((c) => c[1]), multiplier: t.multiplier, detail: `${t.grid.map((c) => TREE_LABEL[c[1]] || '▫️').join('')} · ${t.win ? `${t.win.name} ${t.win.pay}x` : 'kazanç yok'}`, tree: t };
  }
  if (game === 'rocket') {
    const crash = crashPoint(rnd(ROCKET_DRAW));
    const target = Number(pick);
    const m = rocketMultiplier(crash, target);
    return { display: [String(crash)], multiplier: m, detail: `Roket ${crash ? `${crash.toFixed(2)}x'te patladı` : 'rampada patladı'} · hedef ${target}x`, rocket: { crash, target } };
  }
  if (isBoard(game)) {
    const b = BOARDS[game];
    const r = boardResult(b, rnd(boardTotal(b)));
    return { display: [r.id], multiplier: r.pays.includes(pick) ? optionOf(b, pick).mult : 0, detail: `Sonuç: ${r.label} ${r.name}`, board: r };
  }
  if (game === 'olympus') {
    const round = playFener(rnd);
    const ships = round.base.grid[round.base.lit[0]].filter((c) => c.kind === 'ship').length;
    const detail = [
      ships ? `ışıkta ${ships} gemi · parlaklık ×${round.base.brightness}` : 'ışıkta gemi yok',
      round.storm.length ? `Fırtına Gecesi ${round.storm.length} dönüş` : '',
      `${Math.round(round.multiplier * 10) / 10}x`,
    ];
    return { display: round.base.grid.flat().map((c) => (c.kind === 'ship' ? `ship${c.cargo}` : c.kind)), multiplier: round.multiplier, detail: detail.filter(Boolean).join(' · '), fener: round };
  }
  if (game === 'bilye') {
    const r = playBilye(pick, rnd);
    const bilye = { lane: r.lane, target: r.target, variant: r.variant };
    return { display: [String(r.target)], multiplier: r.multiplier, detail: bilyeDetail(bilye), bilye };
  }
  if (game === 'fish') {
    const f = fishById(pick);
    const shot = shootFish(f, rnd(fishDraw(f)));
    return { display: [f.id], multiplier: shot.multiplier, detail: `${f.name} ${shot.caught ? `yakalandı · ${f.mult}x` : 'kaçtı'}`, caught: shot.caught };
  }
  throw new Error(`unknown game ${game}`);
}

/** Exact expected return (share of the stake paid back) of a game and pick, the JACKPOT share included. */
export function expectedReturn(game, pick = '') {
  if (isLineSlot(game)) return slotReturn(SLOT_CONFIGS[game]).total;
  if (game === 'goldtree') return treeReturn();
  if (game === 'rocket') return rocketReturn(Number(pick));
  if (isBoard(game)) return optionReturn(BOARDS[game], pick);
  if (game === 'olympus') return fenerReturn().total;
  if (game === 'fish') return fishReturn(fishById(pick));
  if (game === 'bilye') return bilyeReturn(pick);
  throw new Error(`unknown game ${game}`);
}

/** Highest multiplier a round can pay (the pool must cover bet × this before the round starts). */
export function maxMultiplier(game, pick = '') {
  if (isLineSlot(game)) return slotMax(SLOT_CONFIGS[game]);
  if (game === 'goldtree') return TREE_MAX;
  if (game === 'rocket') return Number(pick);
  if (isBoard(game)) return optionOf(BOARDS[game], pick).mult;
  if (game === 'olympus') return FENER_MAX;
  if (game === 'fish') return fishById(pick).mult;
  if (game === 'bilye') return BILYE_MAX;
  throw new Error(`unknown game ${game}`);
}

/** Where a stake comes from: game coins (winnings) first, then coins. */
export function splitStake(bet, gameBalance) {
  const fromGame = Math.min(bet, Math.max(0, gameBalance));
  return { fromGame, fromCoins: bet - fromGame };
}
/** The house's part of a stake, booked at once; the rest joins the payout pool. */
export const houseShare = (bet) => Math.round(bet * HOUSE_SHARE);
/** A slot's JACKPOT share of a stake (2 % of every ladder stake is a whole number of coins). */
export const jackpotShareOf = (game, bet) => (isLineSlot(game) && SLOT_CONFIGS[game].jackpotShare ? Math.round(bet * SLOT_CONFIGS[game].jackpotShare) : 0);
/** A line of wilds wins bet / top stake of the game's fund (the demo's rule, lib/games). */
export const jackpotWin = (fund, bet, top) => Math.floor((fund * bet) / top);
