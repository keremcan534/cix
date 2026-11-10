// The free room games played at a table in a room (room-games.mjs): Ludo, Renk Kartları and XOX, with the demo's rules
// (app/src/components/games/room-games.tsx), as pure functions over a table's state. No database and no core.mjs.
// Every draw (a die, a card) comes from `rnd(n)` → 0…n−1, crypto randomness on the server.
//
// State: { game, seats: [user ids], status: 'waiting' | 'playing' | 'over', turn (seat), winner (seat or null),
// log, misses (turns in a row the table played for each seat) } plus the game's own fields: XOX `board`, Ludo `pos`
// and `die`, Renk Kartları `hands` and `top`. Nothing here is money: the games are free.

export const TABLE_GAMES = {
  ludo: { name: 'Ludo', min: 2, max: 4 },
  cards: { name: 'Renk Kartları', min: 2, max: 6 },
  xox: { name: 'XOX', min: 2, max: 2 },
};
/** A turn's time; then the table plays for that seat (room-games.mjs). After MISSES such turns in a row the seat goes. */
export const TURN_MS = 30_000;
export const MISSES = 3;
/** Ludo's track: one token each, 6 to leave base, exact roll to finish. */
export const TRACK = 24;
export const HAND = 5;
/** XOX's winning lines. */
export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const newCard = (rnd) => ({ color: rnd(4), value: rnd(10) < 8 ? rnd(10) : rnd(2) ? '+2' : 'Atla' });
export const playable = (c, top) => c.color === top.color || c.value === top.value;
export const xoxLine = (b) => LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) ?? null;

/** A new table with its opener on the first seat. */
export const openTable = (game, opener) => ({ game, seats: [opener], status: 'waiting', turn: 0, winner: null, log: 'Oyuncular bekleniyor.', misses: [0] });

/** Starts (or starts again) the hand with the seated players. */
export function startTable(t, rnd) {
  const n = t.seats.length;
  const base = { ...t, status: 'playing', turn: 0, winner: null, misses: Array(n).fill(0) };
  if (t.game === 'xox') return { ...base, board: Array(9).fill(null), log: 'Sıra X’te.' };
  if (t.game === 'ludo') return { ...base, pos: Array(n).fill(-1), die: null, log: 'Zar at. 6 atınca taşın yola çıkar.' };
  return { ...base, hands: Array.from({ length: n }, () => Array.from({ length: HAND }, () => newCard(rnd))), top: { color: rnd(4), value: rnd(10) }, log: 'Rengi veya sayısı aynı kartı at. Atamazsan kart çek.' };
}

/**
 * One move by seat `seat` (`names[seat]` for the log). XOX: { cell }; Ludo: {} (the die is rolled here); Renk
 * Kartları: { card } (an index in the hand) or { card: null } to draw. Returns { ok: true, table } or { ok: false, reason }.
 */
export function moveTable(t, seat, move, names, rnd) {
  if (t.status !== 'playing') return { ok: false, reason: 'Oyun başlamadı.' };
  if (t.turn !== seat) return { ok: false, reason: 'Sıra sende değil.' };
  const who = names[seat];
  const misses = t.misses.map((m, i) => (i === seat ? 0 : m));
  if (t.game === 'xox') {
    const cell = move?.cell;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || t.board[cell]) return { ok: false, reason: 'Bu kare dolu.' };
    const board = t.board.map((v, i) => (i === cell ? (seat === 0 ? 'X' : 'O') : v));
    const line = xoxLine(board);
    if (line) return { ok: true, table: { ...t, board, misses, status: 'over', winner: seat, log: `🏆 ${who} kazandı!` } };
    if (board.every(Boolean)) return { ok: true, table: { ...t, board, misses, status: 'over', winner: null, log: 'Berabere' } };
    return { ok: true, table: { ...t, board, misses, turn: 1 - seat, log: `Sıra ${names[1 - seat]}’de.` } };
  }
  if (t.game === 'ludo') {
    const d = rnd(6) + 1;
    const pos = [...t.pos];
    const cur = pos[seat];
    let log = `${who} ${d} attı`;
    if (cur < 0) {
      if (d === 6) {
        pos[seat] = 0;
        log += ', yola çıktı';
      }
    } else if (cur + d <= TRACK) {
      pos[seat] = cur + d;
      const hit = pos.findIndex((x, i) => i !== seat && x === pos[seat] && x > 0 && x < TRACK);
      if (hit >= 0) {
        pos[hit] = -1;
        log += ` ve ${names[hit]} taşını eve gönderdi!`;
      }
    } else log += ', bitişe tam sayı lazım';
    if (pos[seat] === TRACK) return { ok: true, table: { ...t, pos, die: d, misses, status: 'over', winner: seat, log: `🏆 ${who} kazandı!` } };
    // A 6 rolls again.
    return { ok: true, table: { ...t, pos, die: d, misses, turn: d === 6 ? seat : (seat + 1) % t.seats.length, log } };
  }
  const hands = t.hands.map((h) => [...h]);
  const n = t.seats.length;
  const card = move?.card;
  if (card === null || card === undefined) {
    hands[seat].push(newCard(rnd));
    return { ok: true, table: { ...t, hands, misses, turn: (seat + 1) % n, log: `${who} kart çekti` } };
  }
  if (!Number.isInteger(card) || card < 0 || card >= hands[seat].length || !playable(hands[seat][card], t.top)) return { ok: false, reason: 'Bu kart atılamaz.' };
  const [played] = hands[seat].splice(card, 1);
  let step = 1;
  let log = `${who} kart attı`;
  if (played.value === '+2') {
    const victim = (seat + 1) % n;
    hands[victim].push(newCard(rnd), newCard(rnd));
    log = `${who} +2 attı: ${names[victim]} 2 kart çekti`;
  } else if (played.value === 'Atla') {
    step = 2;
    log = `${who} sırayı atlattı`;
  }
  if (!hands[seat].length) return { ok: true, table: { ...t, hands, top: played, misses, status: 'over', winner: seat, log: `🏆 ${who} kartlarını bitirdi!` } };
  if (hands[seat].length === 1) log += ' · SON KART!';
  return { ok: true, table: { ...t, hands, top: played, misses, turn: (seat + step) % n, log } };
}

/** The move the table makes for a seat whose time ran out: Ludo rolls, Renk Kartları plays its first card that fits or draws. */
export function autoMove(t) {
  if (t.game === 'ludo') return {};
  const i = t.hands[t.turn].findIndex((c) => playable(c, t.top));
  return { card: i >= 0 ? i : null };
}

/**
 * Seat `seat` leaves. While waiting the seat just goes. In a hand: XOX is won by the other player; in Ludo and Renk
 * Kartları the hand goes on without them, and the last one left wins.
 */
export function leaveTable(t, seat, names) {
  const who = names[seat];
  const rest = (xs) => xs.filter((_, i) => i !== seat);
  const seats = rest(t.seats);
  const left = rest(names);
  if (t.status !== 'playing') return { ...t, seats, misses: rest(t.misses), winner: t.winner === null || t.winner === seat ? null : t.winner - (t.winner > seat ? 1 : 0), ...(t.status === 'over' ? {} : { log: `${who} masadan kalktı.` }) };
  if (t.game === 'xox') return { ...t, seats, misses: rest(t.misses), status: 'over', winner: 0, log: `${who} masadan kalktı · 🏆 ${left[0]} kazandı!` };
  const next = { ...t, seats, misses: rest(t.misses), ...(t.game === 'ludo' ? { pos: rest(t.pos) } : { hands: rest(t.hands) }) };
  if (seats.length === 1) return { ...next, status: 'over', turn: 0, winner: 0, log: `${who} masadan kalktı · 🏆 ${left[0]} kazandı!` };
  // The turn stays on whoever came after the one who left.
  const turn = t.turn > seat ? t.turn - 1 : t.turn === seat ? seat % seats.length : t.turn;
  return { ...next, turn, log: `${who} masadan kalktı.` };
}

/** One seat's view: never another player's cards (their counts only). */
export function viewOf(t, seat) {
  const { hands, ...rest } = t;
  if (t.game !== 'cards' || !hands) return rest;
  return { ...rest, counts: hands.map((h) => h.length), hand: seat >= 0 ? hands[seat] : null };
}
