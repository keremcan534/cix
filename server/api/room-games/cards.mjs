// Renk Kartları at a room's table: one of the free room games behind room-games-rules.mjs (the seam every game
// follows is written there). Pure functions over the table's state; every card comes from `rnd(n)` → 0…n−1.
//
// Its fields: `hands` (each seat's cards, sent only to their owner) and `top` (the card to match).
export const meta = { name: 'Renk Kartları', min: 2, max: 6 };
export const seatFields = ['hands'];
export const HAND = 5;

export const newCard = (rnd) => ({ color: rnd(4), value: rnd(10) < 8 ? rnd(10) : rnd(2) ? '+2' : 'Atla' });
export const playable = (c, top) => c.color === top.color || c.value === top.value;

export function start(t, rnd) {
  const hands = Array.from({ length: t.seats.length }, () => Array.from({ length: HAND }, () => newCard(rnd)));
  return { hands, top: { color: rnd(4), value: rnd(10) }, log: 'Rengi veya sayısı aynı kartı at. Atamazsan kart çek.' };
}

/** { card } (an index in the hand) plays it, { card: null } draws one. */
export function move(t, seat, move, names, rnd) {
  const who = names[seat];
  const hands = t.hands.map((h) => [...h]);
  const n = t.seats.length;
  const card = move?.card;
  if (card === null || card === undefined) {
    hands[seat].push(newCard(rnd));
    return { ok: true, table: { ...t, hands, turn: (seat + 1) % n, log: `${who} kart çekti` } };
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
  if (!hands[seat].length) return { ok: true, table: { ...t, hands, top: played, status: 'over', winner: seat, log: `🏆 ${who} kartlarını bitirdi!` } };
  if (hands[seat].length === 1) log += ' · SON KART!';
  return { ok: true, table: { ...t, hands, top: played, turn: (seat + step) % n, log } };
}

/** A run-out turn: the table plays the seat's first card that fits, or draws. */
export function auto(t, names, rnd) {
  const i = t.hands[t.turn].findIndex((c) => playable(c, t.top));
  return move(t, t.turn, { card: i >= 0 ? i : null }, names, rnd).table;
}

/** Never another player's cards: their counts only. */
export function view(t, seat) {
  const { hands, ...rest } = t;
  if (!hands) return rest;
  return { ...rest, counts: hands.map((h) => h.length), hand: seat >= 0 ? hands[seat] : null };
}
