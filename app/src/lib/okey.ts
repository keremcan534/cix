// Okey (101'siz, klasik) as a pure engine: the deck, dealing, the okey from the indicator, turns, finish
// detection and bot moves. No React, no timers, no room state: lib/okey-table keeps one table per room and
// calls these functions; components only render `viewFor(...)`, which never contains another player's tiles.
//
// Rules used here:
// - 106 tiles: 4 colors × 1–13, two of each, plus 2 false jokers (sahte okey).
// - An indicator tile is turned up (never a false joker); the okey is the next number of the same color
//   (13 → 1). Both okey tiles are wild. A false joker is not wild: it stands for the okey's own value.
// - The starter gets 15 tiles, the others 14. On a turn you draw (center pile or the previous player's
//   discard), then discard one. The starter skips the first draw.
// - You finish by discarding the 15th tile when the other 14 are all in sets: runs (3+ same color in a row,
//   12-13-1 allowed, 13-1-2 not) or groups (3–4 of one number, all colors different). Seven pairs also win.
// - The center pile running out ends the hand without a winner.

export type Tile = { id: number; c: number; n: number; fake?: boolean };
export type Face = { c: number; n: number };
export type FinishKind = 'sets' | 'pairs';

export const SEATS = 4;
export const COLOR_NAMES = ['Sarı', 'Mavi', 'Siyah', 'Kırmızı'] as const;
/** Points for a win; finishing with pairs or by discarding an okey doubles it. */
export const WIN_POINTS = 2;

export type Rng = () => number;

export function makeDeck(): Tile[] {
  const deck: Tile[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) for (let c = 0; c < 4; c++) for (let n = 1; n <= 13; n++) deck.push({ id: id++, c, n });
  deck.push({ id: id++, c: -1, n: 0, fake: true }, { id: id++, c: -1, n: 0, fake: true });
  return deck;
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The okey is one above the indicator in the same color; 13 wraps to 1. */
export const okeyOf = (indicator: Face): Face => ({ c: indicator.c, n: indicator.n === 13 ? 1 : indicator.n + 1 });
export const isWild = (t: Tile, okey: Face) => !t.fake && t.c === okey.c && t.n === okey.n;
/** What a tile counts as: a false joker is the okey's value; everything else is itself. */
export const faceOf = (t: Tile, okey: Face): Face => (t.fake ? okey : { c: t.c, n: t.n });

// --- Finish detection -------------------------------------------------------------------------------

/** Counts of non-wild tiles by face (index c*14+n, n 1..13) and the number of wilds. */
function tally(tiles: Tile[], okey: Face) {
  const cnt = new Array(4 * 14).fill(0);
  let wild = 0;
  for (const t of tiles) {
    if (isWild(t, okey)) wild++;
    else {
      const f = faceOf(t, okey);
      cnt[f.c * 14 + f.n]++;
    }
  }
  return { cnt, wild };
}

/**
 * Can every tile be used in runs and groups? Backtracks on the lowest remaining tile (color, then number).
 * With `out`, the sets found are written there as face indexes in order (-1 = a wild).
 */
function solveSets(cnt: number[], wild: number, out?: number[][]): boolean {
  const first = cnt.findIndex((x) => x > 0);
  if (first < 0) return wild === 0;
  const c = Math.floor(first / 14);
  const n = first % 14;

  // Groups of 3–4 with this number, one tile per color; wilds fill missing colors.
  const others = [0, 1, 2, 3].filter((k) => k !== c && cnt[k * 14 + n] > 0);
  for (let mask = 0; mask < 1 << others.length; mask++) {
    const picked = others.filter((_, i) => mask & (1 << i));
    for (let w = 0; w <= wild; w++) {
      const size = 1 + picked.length + w;
      if (size < 3 || size > 4) continue;
      cnt[first]--;
      picked.forEach((k) => cnt[k * 14 + n]--);
      const ok = solveSets(cnt, wild - w, out);
      cnt[first]++;
      picked.forEach((k) => cnt[k * 14 + n]++);
      if (ok) {
        out?.unshift([first, ...picked.map((k) => k * 14 + n), ...new Array(w).fill(-1)]);
        return true;
      }
    }
  }

  // Runs: no real tile of this color is lower than n, so anything below n in the run is a wild.
  // Value 14 is the 1 placed after 13.
  const run = (from: number, to: number, anchorAt: number, w: number): boolean => {
    // Positions from..to; `anchorAt` holds this tile, every other position takes a real tile (above n) or a wild.
    const path: number[] = [];
    const walk = (pos: number, wl: number): boolean => {
      if (pos > to) {
        if (!solveSets(cnt, wl, out)) return false;
        out?.unshift([...path]);
        return true;
      }
      const step = (idx: number, wl2: number) => {
        path.push(idx);
        const ok = walk(pos + 1, wl2);
        path.pop();
        return ok;
      };
      if (pos === anchorAt) return step(first, wl);
      const idx = c * 14 + (pos === 14 ? 1 : pos);
      if (pos > n && cnt[idx] > 0) {
        cnt[idx]--;
        const ok = step(idx, wl);
        cnt[idx]++;
        if (ok) return true;
      }
      return wl > 0 && step(-1, wl - 1);
    };
    cnt[first]--;
    const ok = walk(from, w);
    cnt[first]++;
    return ok;
  };
  for (let pre = 0; pre <= wild && n - pre >= 1; pre++) {
    for (let to = n; to <= 14; to++) {
      if (to - (n - pre) + 1 < 3) continue;
      if (run(n - pre, to, n, wild)) return true;
    }
  }
  // A 1 can also close a run as the tile after 13 (…12-13-1).
  if (n === 1) {
    for (let from = 12; from >= 2; from--) if (run(from, 14, 14, wild)) return true;
  }
  return false;
}

/** Seven pairs: identical faces two by two; a wild pairs with anything (or with the other wild). */
function solvePairs(cnt: number[], wild: number): boolean {
  const singles = cnt.reduce((s, x) => s + (x % 2), 0);
  return singles <= wild;
}

/** How a 14-tile hand finishes, or null. */
export function finishOf(tiles: Tile[], okey: Face): FinishKind | null {
  if (tiles.length !== 14) return null;
  const { cnt, wild } = tally(tiles, okey);
  if (solveSets([...cnt], wild)) return 'sets';
  if (solvePairs(cnt, wild)) return 'pairs';
  return null;
}

/** A finished hand laid out as its sets (or its pairs), for showing how someone finished. */
export function meldsOf(tiles: Tile[], okey: Face): Tile[][] | null {
  const kind = finishOf(tiles, okey);
  if (!kind) return null;
  const wilds = tiles.filter((t) => isWild(t, okey));
  const pool = tiles.filter((t) => !isWild(t, okey));
  const take = (idx: number): Tile => {
    if (idx < 0) return wilds.pop()!;
    const at = pool.findIndex((t) => {
      const f = faceOf(t, okey);
      return f.c * 14 + f.n === idx;
    });
    return pool.splice(at, 1)[0];
  };
  if (kind === 'pairs') {
    const sorted = [...pool].sort((a, b) => faceOf(a, okey).c - faceOf(b, okey).c || faceOf(a, okey).n - faceOf(b, okey).n);
    const out: Tile[][] = [];
    for (let i = 0; i < sorted.length; i++) {
      const same = i + 1 < sorted.length && faceOf(sorted[i], okey).c === faceOf(sorted[i + 1], okey).c && faceOf(sorted[i], okey).n === faceOf(sorted[i + 1], okey).n;
      out.push(same ? [sorted[i], sorted[++i]] : [sorted[i], wilds.pop()!]);
    }
    if (wilds.length) out.push(wilds.splice(0));
    return out;
  }
  const { cnt, wild } = tally(tiles, okey);
  const sets: number[][] = [];
  solveSets(cnt, wild, sets);
  return sets.map((set) => set.map(take));
}

/** A tile from a 15-tile hand whose discard finishes the hand (prefers discarding an okey: double points). */
export function winningDiscard(hand: Tile[], okey: Face): { tile: Tile; kind: FinishKind } | null {
  if (hand.length !== 15) return null;
  const order = [...hand].sort((a, b) => Number(isWild(b, okey)) - Number(isWild(a, okey)));
  const seen = new Set<string>();
  for (const t of order) {
    const key = t.fake ? 'f' : `${t.c}-${t.n}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = finishOf(
      hand.filter((x) => x.id !== t.id),
      okey,
    );
    if (kind) return { tile: t, kind };
  }
  return null;
}

// --- Game -----------------------------------------------------------------------------------------

export type Phase = 'draw' | 'discard' | 'over';
export type Game = {
  /** Center pile; the last tile is drawn next. */
  pile: Tile[];
  indicator: Tile;
  okey: Face;
  hands: Tile[][];
  /** Each seat's discards, newest last. The next seat may take the newest one. */
  discards: Tile[][];
  starter: number;
  turn: number;
  phase: Phase;
  winner: number | null;
  finish: FinishKind | null;
  /** The winner discarded an okey to finish. */
  okeyFinish: boolean;
  /** Points each seat earned this hand. */
  points: number[];
  moves: number;
};

export function deal(starter: number, rng: Rng = Math.random): Game {
  const deck = shuffle(makeDeck(), rng);
  const at = deck.findIndex((t) => !t.fake);
  const [indicator] = deck.splice(at, 1);
  const hands: Tile[][] = [];
  for (let s = 0; s < SEATS; s++) {
    const seat = (starter + s) % SEATS;
    hands[seat] = deck.splice(0, seat === starter ? 15 : 14);
  }
  return {
    pile: deck,
    indicator,
    okey: okeyOf(indicator),
    hands,
    discards: Array.from({ length: SEATS }, () => []),
    starter,
    turn: starter,
    phase: 'discard',
    winner: null,
    finish: null,
    okeyFinish: false,
    points: new Array(SEATS).fill(0),
    moves: 0,
  };
}

export const prevSeat = (seat: number) => (seat + SEATS - 1) % SEATS;
export const nextSeat = (seat: number) => (seat + 1) % SEATS;
/** The discard the seat may take now (the previous seat's newest), if any. */
export const takeable = (g: Game, seat: number): Tile | undefined => g.discards[prevSeat(seat)].at(-1);

export type Move = { type: 'draw'; from: 'pile' | 'discard' } | { type: 'discard'; tileId: number };
export type Applied = { ok: true; game: Game } | { ok: false; reason: string };

/** Applies one move for `seat`; checks turn, phase and that the tile is in the hand. */
export function applyMove(g: Game, seat: number, m: Move): Applied {
  if (g.phase === 'over') return { ok: false, reason: 'El bitti.' };
  if (g.turn !== seat) return { ok: false, reason: 'Sıra sende değil.' };
  if (m.type === 'draw') {
    if (g.phase !== 'draw') return { ok: false, reason: 'Önce bir taş at.' };
    const hands = g.hands.map((h) => [...h]);
    const discards = g.discards.map((d) => [...d]);
    if (m.from === 'discard') {
      const prev = discards[prevSeat(seat)];
      const t = prev.pop();
      if (!t) return { ok: false, reason: 'Yerde alınacak taş yok.' };
      hands[seat].push(t);
      return { ok: true, game: { ...g, hands, discards, phase: 'discard', moves: g.moves + 1 } };
    }
    const pile = [...g.pile];
    const t = pile.pop();
    if (!t) return { ok: true, game: { ...g, phase: 'over', moves: g.moves + 1 } };
    hands[seat].push(t);
    return { ok: true, game: { ...g, pile, hands, phase: 'discard', moves: g.moves + 1 } };
  }
  if (g.phase !== 'discard') return { ok: false, reason: 'Önce taş çek.' };
  const hand = g.hands[seat];
  const tile = hand.find((t) => t.id === m.tileId);
  if (!tile) return { ok: false, reason: 'Bu taş elinde değil.' };
  const rest = hand.filter((t) => t.id !== m.tileId);
  const hands = g.hands.map((h, i) => (i === seat ? rest : h));
  const discards = g.discards.map((d, i) => (i === seat ? [...d, tile] : d));
  const kind = finishOf(rest, g.okey);
  if (kind) {
    const okeyFinish = isWild(tile, g.okey);
    const points = new Array(SEATS).fill(0);
    points[seat] = WIN_POINTS * (kind === 'pairs' || okeyFinish ? 2 : 1);
    return { ok: true, game: { ...g, hands, discards, phase: 'over', winner: seat, finish: kind, okeyFinish, points, moves: g.moves + 1 } };
  }
  // The next player has nothing to draw from the center: the hand ends without a winner.
  if (g.pile.length === 0) return { ok: true, game: { ...g, hands, discards, phase: 'over', moves: g.moves + 1 } };
  return { ok: true, game: { ...g, hands, discards, turn: nextSeat(seat), phase: 'draw', moves: g.moves + 1 } };
}

// --- Bots -----------------------------------------------------------------------------------------

/** How useful a tile is in this hand: neighbours for runs, other colors for groups, twins for pairs. */
function usefulness(t: Tile, hand: Tile[], okey: Face): number {
  if (isWild(t, okey)) return 1000;
  const f = faceOf(t, okey);
  let score = 0;
  for (const o of hand) {
    if (o.id === t.id) continue;
    if (isWild(o, okey)) continue;
    const g = faceOf(o, okey);
    if (g.c === f.c && g.n === f.n) score += 2;
    else if (g.c === f.c) {
      const d = Math.min(Math.abs(g.n - f.n), 13 - Math.abs(g.n - f.n));
      if (d === 1) score += 4;
      else if (d === 2) score += 2;
    } else if (g.n === f.n) score += 3;
  }
  return score;
}

/** Score of a hand for bots: total usefulness, with a big bonus when it already finishes. */
function handValue(hand: Tile[], okey: Face): number {
  return hand.reduce((s, t) => s + Math.min(usefulness(t, hand, okey), 12), 0);
}

/** The least useful tile, never an okey. */
export function botDiscard(hand: Tile[], okey: Face): Tile {
  const win = winningDiscard(hand, okey);
  if (win) return win.tile;
  let worst = hand[0];
  let worstScore = Infinity;
  for (const t of hand) {
    const s = usefulness(t, hand, okey);
    if (s < worstScore) {
      worst = t;
      worstScore = s;
    }
  }
  return worst;
}

/** Takes the previous discard when it is an okey, finishes the hand, or clearly improves it. */
export function botDraw(g: Game, seat: number): 'pile' | 'discard' {
  const t = takeable(g, seat);
  if (!t) return 'pile';
  if (isWild(t, g.okey)) return 'discard';
  const hand = g.hands[seat];
  const withIt = [...hand, t];
  if (winningDiscard(withIt, g.okey)) return 'discard';
  const gain = handValue(withIt.filter((x) => x.id !== botDiscard(withIt, g.okey).id), g.okey) - handValue(hand, g.okey);
  return gain >= 6 ? 'discard' : 'pile';
}

/** The bot's next move for the seat whose turn it is. */
export function botMove(g: Game): Move {
  if (g.phase === 'draw') return { type: 'draw', from: botDraw(g, g.turn) };
  return { type: 'discard', tileId: botDiscard(g.hands[g.turn], g.okey).id };
}

// --- Rack arrangement (client side) ------------------------------------------------------------------

export const RACK_SLOTS = 26; // two rows of 13
const byFace = (okey: Face) => (a: Tile, b: Tile) => {
  const wa = isWild(a, okey) ? 1 : 0;
  const wb = isWild(b, okey) ? 1 : 0;
  if (wa !== wb) return wa - wb;
  const fa = faceOf(a, okey);
  const fb = faceOf(b, okey);
  return fa.c - fb.c || fa.n - fb.n || a.id - b.id;
};

/** Lays groups of tiles on the rack with a gap between groups, starting a group on the second row when it doesn't fit. */
function layout(groups: Tile[][]): (number | null)[] {
  const row = 13;
  const slots: (number | null)[] = new Array(RACK_SLOTS).fill(null);
  let i = 0;
  for (const grp of groups.filter((x) => x.length)) {
    if (i % row !== 0 && (i % row) + grp.length > row && i < row) i = row;
    for (const t of grp) {
      if (i >= RACK_SLOTS) return [...groups.flat().map((x) => x.id), ...new Array(RACK_SLOTS).fill(null)].slice(0, RACK_SLOTS);
      slots[i++] = t.id;
    }
    if (i % row !== 0) i++;
  }
  return slots;
}

/** Runs first (same color in a row), then groups (same number), then the rest; okeys last. */
export function arrangeRuns(hand: Tile[], okey: Face): (number | null)[] {
  const left = [...hand].sort(byFace(okey));
  const wilds = left.filter((t) => isWild(t, okey));
  let rest = left.filter((t) => !isWild(t, okey));
  const sets: Tile[][] = [];
  for (let c = 0; c < 4; c++) {
    let seq: Tile[] = [];
    const flush = () => {
      if (seq.length >= 3) {
        sets.push(seq);
        const ids = new Set(seq.map((t) => t.id));
        rest = rest.filter((t) => !ids.has(t.id));
      }
      seq = [];
    };
    for (let n = 1; n <= 14; n++) {
      const t = rest.find((x) => faceOf(x, okey).c === c && faceOf(x, okey).n === (n === 14 ? 1 : n) && !seq.includes(x));
      if (t && !(n === 14 && seq.length === 0)) seq.push(t);
      else {
        flush();
        if (t && n < 14) seq.push(t);
      }
    }
    flush();
  }
  for (let n = 1; n <= 13; n++) {
    const grp: Tile[] = [];
    for (let c = 0; c < 4; c++) {
      const t = rest.find((x) => faceOf(x, okey).c === c && faceOf(x, okey).n === n);
      if (t) grp.push(t);
    }
    if (grp.length >= 3) {
      sets.push(grp);
      const ids = new Set(grp.map((t) => t.id));
      rest = rest.filter((t) => !ids.has(t.id));
    }
  }
  return layout([...sets, rest, wilds]);
}

/** Identical tiles side by side, pairs first; okeys last. */
export function arrangePairs(hand: Tile[], okey: Face): (number | null)[] {
  const sorted = [...hand].sort(byFace(okey));
  const wilds = sorted.filter((t) => isWild(t, okey));
  const key = (t: Tile) => `${faceOf(t, okey).c}-${faceOf(t, okey).n}`;
  const pairs: Tile[] = [];
  const singles: Tile[] = [];
  const reals = sorted.filter((t) => !isWild(t, okey));
  for (let i = 0; i < reals.length; i++) {
    if (i + 1 < reals.length && key(reals[i]) === key(reals[i + 1])) {
      pairs.push(reals[i], reals[i + 1]);
      i++;
    } else singles.push(reals[i]);
  }
  const slots: (number | null)[] = new Array(RACK_SLOTS).fill(null);
  [...pairs, ...singles, ...wilds].forEach((t, i) => (slots[i] = t.id));
  return slots;
}

/** Keeps a player's arrangement in step with the hand: drops tiles that left, puts new ones in free slots. */
export function syncRack(slots: (number | null)[], hand: Tile[]): (number | null)[] {
  const ids = new Set(hand.map((t) => t.id));
  const next = slots.map((s) => (s !== null && ids.has(s) ? s : null));
  const placed = new Set(next.filter((s): s is number => s !== null));
  for (const t of hand) {
    if (placed.has(t.id)) continue;
    const lastTile = next.slice(0, 13).reduce<number>((m, s, i) => (s !== null ? i : m), -1);
    const free = lastTile + 1 < 13 && next[lastTile + 1] === null ? lastTile + 1 : next.indexOf(null);
    next[free] = t.id;
  }
  return next;
}

/** Moves the tile in slot `from` to slot `to`, swapping with whatever is there. */
export function moveOnRack(slots: (number | null)[], from: number, to: number): (number | null)[] {
  if (from === to || to < 0 || to >= slots.length) return slots;
  const next = [...slots];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// --- Table (seats around one game) -----------------------------------------------------------------

export type SeatHolder = { id: string; name: string; avatar?: string; bot: boolean };
export type Table = {
  roomId: string;
  openedBy: string;
  seats: (SeatHolder | null)[];
  /** People watching (not seated). */
  watchers: SeatHolder[];
  game: Game | null;
  /** Total points per seat across hands at this table. */
  scores: number[];
  hand: number;
  /** When the current turn started (ms), for the turn timer. */
  turnAt: number;
  /** Turns in a row the table had to play for each seat's person (they ran out of time). */
  idle: number[];
};

/** After this many timed-out turns in a row a person's seat goes to a bot (they left or lost connection). */
export const IDLE_LIMIT = 2;

export function openTable(roomId: string, by: SeatHolder, now = Date.now()): Table {
  return { roomId, openedBy: by.id, seats: [by, null, null, null], watchers: [], game: null, scores: new Array(SEATS).fill(0), hand: 0, turnAt: now, idle: new Array(SEATS).fill(0) };
}

export const seatOf = (t: Table, userId: string) => t.seats.findIndex((s) => s?.id === userId);

export type TableResult = { ok: true; table: Table } | { ok: false; reason: string };

export function sit(t: Table, seat: number, who: SeatHolder): TableResult {
  if (seat < 0 || seat >= SEATS) return { ok: false, reason: 'Böyle bir koltuk yok.' };
  // A person may take a bot's seat between hands.
  if (t.seats[seat] && !t.seats[seat]!.bot) return { ok: false, reason: 'Bu koltuk dolu.' };
  if (seatOf(t, who.id) >= 0) return { ok: false, reason: 'Zaten masadasın.' };
  if (t.game && t.game.phase !== 'over') return { ok: false, reason: 'El sürüyor; el bitince oturabilirsin.' };
  const seats = t.seats.map((s, i) => (i === seat ? who : s));
  return { ok: true, table: { ...t, seats, watchers: t.watchers.filter((w) => w.id !== who.id), idle: t.idle.map((x, i) => (i === seat ? 0 : x)) } };
}

/** Leaving mid-hand hands the seat to a bot so the others can finish. */
export function stand(t: Table, userId: string): TableResult {
  const seat = seatOf(t, userId);
  if (seat < 0) return { ok: false, reason: 'Masada değilsin.' };
  const playing = !!t.game && t.game.phase !== 'over';
  const seats = t.seats.map((s, i) => (i === seat ? (playing ? botAt(i) : null) : s));
  return { ok: true, table: { ...t, seats } };
}

export const botAt = (seat: number): SeatHolder => ({ id: `bot-${seat}`, name: `Bot ${seat + 1}`, bot: true });

export function fillBots(t: Table): Table {
  return { ...t, seats: t.seats.map((s, i) => s ?? botAt(i)) };
}

export function removeBot(t: Table, seat: number): TableResult {
  if (!t.seats[seat]?.bot) return { ok: false, reason: 'Bu koltukta bot yok.' };
  if (t.game && t.game.phase !== 'over') return { ok: false, reason: 'El sürerken bot kalkamaz.' };
  return { ok: true, table: { ...t, seats: t.seats.map((s, i) => (i === seat ? null : s)) } };
}

export function watch(t: Table, who: SeatHolder): Table {
  if (seatOf(t, who.id) >= 0 || t.watchers.some((w) => w.id === who.id)) return t;
  return { ...t, watchers: [...t.watchers, who] };
}
export const unwatch = (t: Table, userId: string): Table => ({ ...t, watchers: t.watchers.filter((w) => w.id !== userId) });

/** Deals a new hand once all four seats are taken (people or bots). The starter moves round the table. */
export function startHand(t: Table, rng: Rng = Math.random, now = Date.now()): TableResult {
  if (t.seats.some((s) => !s)) return { ok: false, reason: 'Boş koltukları doldur ya da bot ekle.' };
  if (!t.seats.some((s) => s && !s.bot)) return { ok: false, reason: 'Masada en az bir oyuncu olmalı.' };
  if (t.game && t.game.phase !== 'over') return { ok: false, reason: 'El zaten sürüyor.' };
  const starter = t.hand % SEATS;
  return { ok: true, table: { ...t, game: deal(starter, rng), hand: t.hand + 1, turnAt: now } };
}

export function play(t: Table, seat: number, m: Move, now = Date.now()): TableResult {
  if (!t.game) return { ok: false, reason: 'El başlamadı.' };
  const r = applyMove(t.game, seat, m);
  if (!r.ok) return r;
  const over = r.game.phase === 'over' && t.game.phase !== 'over';
  const scores = over ? t.scores.map((s, i) => s + r.game.points[i]) : t.scores;
  return { ok: true, table: { ...t, game: r.game, scores, turnAt: r.game.turn !== t.game.turn ? now : t.turnAt } };
}

/** A move by a person: it must be their seat; playing themselves clears their timed-out count. */
export function playAs(t: Table, userId: string, m: Move, now = Date.now()): TableResult {
  const seat = seatOf(t, userId);
  if (seat < 0) return { ok: false, reason: 'Masada değilsin; izleyiciler oynayamaz.' };
  const r = play(t, seat, m, now);
  return r.ok ? { ok: true, table: { ...r.table, idle: r.table.idle.map((x, i) => (i === seat ? 0 : x)) } } : r;
}

/**
 * The table plays the current seat: a bot's move, or a person's when their time ran out. A person who runs out
 * of time IDLE_LIMIT turns in a row gets a bot in their seat, so a closed app can't stall the table.
 */
export function autoPlay(t: Table, now = Date.now()): TableResult {
  const g = t.game;
  if (!g || g.phase === 'over') return { ok: false, reason: 'El sürmüyor.' };
  const seat = g.turn;
  const m = botMove(g);
  const r = play(t, seat, m, now);
  if (!r.ok || t.seats[seat]?.bot || m.type !== 'discard') return r;
  const idle = r.table.idle.map((x, i) => (i === seat ? x + 1 : x));
  const out = idle[seat] >= IDLE_LIMIT;
  return { ok: true, table: { ...r.table, idle: out ? idle.map((x, i) => (i === seat ? 0 : x)) : idle, seats: out ? r.table.seats.map((s, i) => (i === seat ? botAt(i) : s)) : r.table.seats } };
}

// --- What a viewer sees -------------------------------------------------------------------------------

export type SeatView = { holder: SeatHolder | null; tiles: number; discardTop?: Tile; discardCount: number; score: number };
export type TableView = {
  seats: SeatView[];
  /** Viewer's seat, or -1 for a spectator. */
  mySeat: number;
  /** Only the viewer's own tiles; empty for spectators. */
  myHand: Tile[];
  indicator?: Tile;
  okey?: Face;
  pile: number;
  turn: number;
  phase: Phase | 'waiting';
  winner: number | null;
  finish: FinishKind | null;
  okeyFinish: boolean;
  /** The winner's tiles, shown to everyone once the hand is over. */
  winnerHand: Tile[];
  watchers: SeatHolder[];
  hand: number;
};

/** The projection sent to one viewer: seat holders, counts and discards, but no one else's tiles. */
export function viewFor(t: Table, viewerId: string): TableView {
  const g = t.game;
  const mySeat = seatOf(t, viewerId);
  const over = g?.phase === 'over';
  return {
    seats: t.seats.map((holder, i) => ({
      holder,
      tiles: g ? g.hands[i].length : 0,
      discardTop: g?.discards[i].at(-1),
      discardCount: g ? g.discards[i].length : 0,
      score: t.scores[i],
    })),
    mySeat,
    myHand: g && mySeat >= 0 ? g.hands[mySeat].map((x) => ({ ...x })) : [],
    indicator: g?.indicator,
    okey: g?.okey,
    pile: g ? g.pile.length : 0,
    turn: g ? g.turn : -1,
    phase: g ? g.phase : 'waiting',
    winner: g?.winner ?? null,
    finish: g?.finish ?? null,
    okeyFinish: g?.okeyFinish ?? false,
    winnerHand: over && g.winner !== null ? g.hands[g.winner].map((x) => ({ ...x })) : [],
    watchers: t.watchers,
    hand: t.hand,
  };
}
