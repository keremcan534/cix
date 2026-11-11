// Renk Kartları at a room's table: one of the free room games behind room-games-rules.mjs (the seam every game
// follows is written there). Pure functions over the table's state; every shuffle comes from `rnd(n)` → 0…n−1. The
// app keeps a copy of these rules for its table and its practice games (app/src/lib/room-games/cards.ts);
// app/tests/cards.test.ts plays the same seeded games through both and fails when they differ.
//
// The deck is our own: 102 cards, each a number 0…101 that `cardOf` reads. Four colours (0 Turkuaz, 1 Mercan,
// 2 Altın, 3 Yeşil) with, in each, 1…9 twice, two Atla, two Yön and two +2; then four Joker and two Joker +4, which
// have no colour.
//
// The rules:
//  - Seven cards each from the shuffled pile; the first card on the table is a number.
//  - On your turn you play a card of the colour on the table, or one with the top card's face, or a Joker; or you
//    draw one. A drawn card that fits may be played at once (that card only) or kept (a pass); one that doesn't fit
//    ends the turn.
//  - Atla: the next player misses a turn. Yön: play turns the other way (with two players it is an Atla). +2: the
//    next player draws two and misses a turn. Joker: whoever plays it names the colour. Joker +4: names the colour,
//    and the next player draws four and misses a turn. Draws are not stacked and not answered.
//  - When the pile runs out, the played cards under the top one are shuffled into a new pile.
//  - The first with no cards wins. The table says SON KART when someone is down to one: nothing to call, no penalty.
//
// Its fields: hands (each seat's cards, sent only to their owner), draw (the pile, its top last), discard (the played
// cards, the top last), color (the colour to follow: the top card's, or the one a Joker named), dir (1 or −1: the
// seats play in rising or falling order), drawn (the card the seat on turn just drew and may still play, else null),
// deal (counts the table's hands), n (counts the hand's events) and last, the event that made this state, for the
// screen to play: { n, seat, type ('play' | 'draw' | 'pass' | 'left'), card (the one played), took ([seat, how many]
// drawn in this event), skipped (the seat that missed its turn), turned (play changed direction), one (that seat is
// down to one card), mixed (the played cards became the new pile) }.
export const meta = { name: 'Renk Kartları', min: 2, max: 6 };
export const seatFields = ['hands'];
export const HAND = 7;
export const DECK = 102;
export const COLOR_NAMES = ['Turkuaz', 'Mercan', 'Altın', 'Yeşil'];
/** A colour's 24 cards, in the order of their numbers. */
const FACES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'Atla', 'Atla', 'Yön', 'Yön', '+2', '+2'];
const COLORED = 4 * FACES.length;

/** The card numbered `id`: { color (null for the Jokers), value (1…9, 'Atla', 'Yön', '+2', 'Joker' or '+4', the Joker +4) }. */
export const cardOf = (id) => (id < COLORED ? { color: Math.floor(id / FACES.length), value: FACES[id % FACES.length] } : { color: null, value: id < COLORED + 4 ? 'Joker' : '+4' });
/** The card as the log says it. */
export const cardName = (id) => {
  const c = cardOf(id);
  return c.color === null ? (c.value === '+4' ? 'Joker +4' : 'Joker') : `${COLOR_NAMES[c.color]} ${c.value}`;
};
/** True when `id` may be played on `top` while `color` is the colour to follow. */
export const fits = (id, color, top) => {
  const c = cardOf(id);
  return c.color === null || c.color === color || c.value === cardOf(top).value;
};

/** The seat `steps` turns after `seat` in the direction of play. */
const after = (t, seat, steps = 1) => (((seat + t.dir * steps) % t.seats.length) + t.seats.length) % t.seats.length;

function shuffled(cards, rnd) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Takes `count` cards off the pile; when it runs out, the played cards under the top one are shuffled into a new one. Fewer come when every other card is in a hand. */
function take(t, count, rnd) {
  let draw = [...t.draw];
  let discard = t.discard;
  let mixed = false;
  const cards = [];
  while (cards.length < count) {
    if (!draw.length) {
      if (discard.length < 2) break;
      draw = shuffled(discard.slice(0, -1), rnd);
      discard = discard.slice(-1);
      mixed = true;
    }
    cards.push(draw.pop());
  }
  return { cards, draw, discard, mixed };
}

/** A table kept from the version that dealt cards out of thin air: this one can't play it on. */
export const stale = (t) => t.status !== 'waiting' && !Array.isArray(t.draw);

export function start(t, rnd) {
  const draw = shuffled(Array.from({ length: DECK }, (_, id) => id), rnd);
  const hands = t.seats.map(() => []);
  for (let i = 0; i < HAND; i++) for (const hand of hands) hand.push(draw.pop());
  // The first card on the table is a number: the nearest one to the top of the pile.
  let at = draw.length - 1;
  while (typeof cardOf(draw[at]).value !== 'number') at--;
  const [first] = draw.splice(at, 1);
  return {
    hands,
    draw,
    discard: [first],
    color: cardOf(first).color,
    dir: 1,
    drawn: null,
    deal: (t.deal ?? 0) + 1,
    n: 0,
    last: null,
    log: 'Rengi ya da yüzü aynı kartı at; atamazsan kart çek.',
  };
}

const event = (t, seat, type) => ({ n: t.n + 1, seat, type, card: null, took: null, skipped: null, turned: false, one: false, mixed: false });

/** { card, color? } plays that card (a Joker names its colour), { draw: true } draws one, { pass: true } keeps the card just drawn. */
export function move(t, seat, m, names, rnd) {
  const who = names[seat];
  if (m?.pass === true) {
    if (t.drawn === null) return { ok: false, reason: 'Önce kart at ya da çek.' };
    return { ok: true, table: { ...t, drawn: null, turn: after(t, seat), n: t.n + 1, last: event(t, seat, 'pass'), log: `${who} çektiği kartı tuttu` } };
  }
  if (m?.draw === true) {
    if (t.drawn !== null) return { ok: false, reason: 'Kartını çektin: onu at ya da pas geç.' };
    const got = take(t, 1, rnd);
    const hands = t.hands.map((h, i) => (i === seat ? [...h, ...got.cards] : h));
    const next = { ...t, hands, draw: got.draw, discard: got.discard, n: t.n + 1, last: { ...event(t, seat, 'draw'), took: [seat, got.cards.length], mixed: got.mixed } };
    if (!got.cards.length) return { ok: true, table: { ...next, turn: after(t, seat), log: `${who} çekecek kart bulamadı` } };
    // A card that fits may still be played; any other ends the turn.
    if (fits(got.cards[0], t.color, t.discard.at(-1))) return { ok: true, table: { ...next, drawn: got.cards[0], log: `${who} kart çekti` } };
    return { ok: true, table: { ...next, turn: after(t, seat), log: `${who} kart çekti` } };
  }
  const card = m?.card;
  if (!Number.isInteger(card) || !t.hands[seat].includes(card)) return { ok: false, reason: 'Bu kart sende yok.' };
  if (t.drawn !== null && card !== t.drawn) return { ok: false, reason: 'Yalnız çektiğin kartı atabilirsin.' };
  if (!fits(card, t.color, t.discard.at(-1))) return { ok: false, reason: 'Bu kart atılamaz.' };
  const face = cardOf(card);
  const joker = face.color === null;
  if (joker && !(Number.isInteger(m.color) && m.color >= 0 && m.color < COLOR_NAMES.length)) return { ok: false, reason: 'Jokerin rengini seç.' };

  const hands = t.hands.map((h, i) => (i === seat ? h.filter((x) => x !== card) : h));
  const color = joker ? m.color : face.color;
  const last = { ...event(t, seat, 'play'), card, one: hands[seat].length === 1 };
  const played = { ...t, hands, discard: [...t.discard, card], color, drawn: null, n: t.n + 1 };
  if (!hands[seat].length) return { ok: true, table: { ...played, status: 'over', winner: seat, last, log: `🏆 ${who} kartlarını bitirdi!` } };

  let log = `${who} ${cardName(card)} attı`;
  let next = played;
  let turn = after(t, seat);
  if (face.value === 'Yön') {
    next = { ...played, dir: -t.dir };
    last.turned = true;
    // With two players the turn comes straight back: the other one misses it.
    if (t.seats.length === 2) {
      last.skipped = turn;
      turn = seat;
      log += ': sıra yine onda';
    } else {
      turn = after(next, seat);
      log += ': yön değişti';
    }
  } else if (face.value === 'Atla') {
    last.skipped = turn;
    turn = after(t, seat, 2);
    log += `: ${names[last.skipped]} sırasını kaçırdı`;
  } else if (face.value === '+2' || face.value === '+4') {
    const victim = turn;
    const got = take(played, face.value === '+2' ? 2 : 4, rnd);
    next = { ...played, hands: hands.map((h, i) => (i === victim ? [...h, ...got.cards] : h)), draw: got.draw, discard: got.discard };
    last.took = [victim, got.cards.length];
    last.skipped = victim;
    last.mixed = got.mixed;
    turn = after(t, seat, 2);
    log += `${joker ? `: renk ${COLOR_NAMES[color]},` : ':'} ${names[victim]} ${got.cards.length} kart çekti`;
  } else if (joker) log += `: renk ${COLOR_NAMES[color]}`;
  if (last.one) log += ' · SON KART!';
  return { ok: true, table: { ...next, turn, last, log } };
}

/**
 * The card a careful player would play from `seat`'s hand, as a move ({ card, color? }); null when nothing fits.
 * Someone about to finish is stopped first; otherwise a card of the colour held most of, numbers before the cards
 * that stop someone, and the Jokers kept for when nothing else fits. The table plays it on a run-out turn, and so
 * do the app's practice opponents.
 */
export function pickCard(t, seat) {
  const hand = t.hands[seat];
  const top = t.discard.at(-1);
  const can = t.drawn !== null ? [t.drawn] : hand.filter((id) => fits(id, t.color, top));
  if (!can.length) return null;
  const close = t.hands[after(t, seat)].length <= 2;
  const held = (color, but) => hand.filter((x) => x !== but && cardOf(x).color === color).length;
  const score = (id) => {
    const c = cardOf(id);
    const stop = ['Yön', 'Atla', '+2', '+4'].indexOf(c.value);
    if (close && stop >= 0) return 1000 + stop;
    if (c.color === null) return c.value === '+4' ? 1 : 2;
    return 100 + held(c.color, id) * 20 + (typeof c.value === 'number' ? 10 + c.value : 0);
  };
  let best = can[0];
  let high = -Infinity;
  for (const id of can) {
    const s = score(id);
    if (s > high) [best, high] = [id, s];
  }
  if (cardOf(best).color !== null) return { card: best };
  // A Joker names the colour held most of; with nothing but Jokers left, the colour on the table.
  let color = t.color;
  let most = 0;
  for (let c = 0; c < COLOR_NAMES.length; c++) {
    const k = held(c, best);
    if (k > most) [color, most] = [c, k];
  }
  return { card: best, color };
}

/** A run-out turn: the table plays the card `pickCard` names, or draws; a drawn card that fits is played too, so the turn is never left half played. */
export function auto(t, names, rnd) {
  const seat = t.turn;
  const pick = pickCard(t, seat);
  if (pick) return move(t, seat, pick, names, rnd).table;
  const drew = move(t, seat, { draw: true }, names, rnd).table;
  return drew.drawn === null ? drew : move(drew, seat, pickCard(drew, seat), names, rnd).table;
}

/** `seat` leaves a hand that goes on: their cards go back under the pile, and a turn of theirs passes on in the direction of play. */
export function left(t, seat) {
  const more = { draw: [...t.hands[seat], ...t.draw], n: t.n + 1, last: event(t, seat, 'left') };
  if (t.turn !== seat) return more;
  const next = after(t, seat);
  // The seats after the one that left move down by one.
  return { ...more, drawn: null, turn: next > seat ? next - 1 : next };
}

/**
 * Never another player's cards (their counts only) and never the pile's: the top card, the two under it and how
 * many are left to draw. The card just drawn is told only to whoever drew it.
 */
export function view(t, seat) {
  const { hands, draw, discard, drawn, ...rest } = t;
  if (!hands) return rest;
  return {
    ...rest,
    counts: hands.map((h) => h.length),
    mine: seat >= 0 ? (hands[seat] ?? []) : null,
    top: discard.at(-1),
    under: discard.slice(-3, -1),
    pile: draw.length,
    drawn: seat >= 0 && seat === t.turn ? drawn : null,
  };
}
