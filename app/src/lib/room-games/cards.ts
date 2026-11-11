// Renk Kartları's rules in the app: a copy of the server's (server/api/room-games/cards.mjs, behind the seam copied
// in lib/room-games/seam), for the table (which cards may be played) and for practice games against the app's own
// opponents. In a live room the server deals and checks; the screens only read its state. tests/cards.test.ts plays
// the same seeded games through this copy and through the server's files and fails when they differ. Pure.
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
import * as seam from '@/lib/room-games/seam';
import type { Game, MoveResult, Rnd, TableBase } from '@/lib/room-games/seam';

export type CardValue = number | 'Atla' | 'Yön' | '+2' | 'Joker' | '+4';
/** A card's face: `color` null for the Jokers; '+4' is the Joker +4. */
export type CardFace = { color: number | null; value: CardValue };
/**
 * The event that made a state, for the screen to play: who (`seat`) did what, the card played, who drew how many
 * (`took`: [seat, count]), who missed a turn, whether play changed direction, whether that seat is down to one card
 * and whether the played cards became the new pile.
 */
export type CardsEvent = { n: number; seat: number; type: 'play' | 'draw' | 'pass' | 'left'; card: number | null; took: [number, number] | null; skipped: number | null; turned: boolean; one: boolean; mixed: boolean };
/** Renk Kartları's own fields on a table once a hand has started. */
export type CardsState = {
  /** Each seat's cards. */
  hands: number[][];
  /** The pile, its top last. */
  draw: number[];
  /** The played cards, the top last. */
  discard: number[];
  /** The colour to follow: the top card's, or the one a Joker named. */
  color: number;
  /** The seats play in rising (1) or falling (−1) order. */
  dir: 1 | -1;
  /** The card the seat on turn just drew and may still play. */
  drawn: number | null;
  /** Counts the table's hands. */
  deal: number;
  /** Counts the hand's events. */
  n: number;
  last: CardsEvent | null;
};
export type CardsTable = TableBase<'cards'> & CardsState;
export type CardsMove = { card: number; color?: number } | { draw: true } | { pass: true };
/** What one seat is told of a hand (the server's `view`): its own cards, everyone's counts, the top of the two piles. */
export type CardsSeen = Omit<CardsState, 'hands' | 'draw' | 'discard'> & { counts: number[]; mine: number[] | null; top: number; under: number[]; pile: number };

export const META = { name: 'Renk Kartları', min: 2, max: 6 } as const;
export const HAND = 7;
export const DECK = 102;
export const COLOR_NAMES = ['Turkuaz', 'Mercan', 'Altın', 'Yeşil'];
export { MISSES, TURN_MS, sitDown } from '@/lib/room-games/seam';
/** A colour's 24 cards, in the order of their numbers. */
const FACES: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'Atla', 'Atla', 'Yön', 'Yön', '+2', '+2'];
const COLORED = 4 * FACES.length;

/** The card numbered `id`. */
export const cardOf = (id: number): CardFace => (id < COLORED ? { color: Math.floor(id / FACES.length), value: FACES[id % FACES.length] } : { color: null, value: id < COLORED + 4 ? 'Joker' : '+4' });
/** The card as the log says it. */
export const cardName = (id: number) => {
  const c = cardOf(id);
  return c.color === null ? (c.value === '+4' ? 'Joker +4' : 'Joker') : `${COLOR_NAMES[c.color]} ${c.value}`;
};
/** True when `id` may be played on `top` while `color` is the colour to follow. */
export const fits = (id: number, color: number, top: number) => {
  const c = cardOf(id);
  return c.color === null || c.color === color || c.value === cardOf(top).value;
};

type Turning = Pick<CardsTable, 'seats' | 'dir'>;
/** The seat `steps` turns after `seat` in the direction of play. */
export const seatAfter = (t: Turning, seat: number, steps = 1) => (((seat + t.dir * steps) % t.seats.length) + t.seats.length) % t.seats.length;

function shuffled(cards: number[], rnd: Rnd) {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Takes `count` cards off the pile; when it runs out, the played cards under the top one are shuffled into a new one. Fewer come when every other card is in a hand. */
function take(t: Pick<CardsState, 'draw' | 'discard'>, count: number, rnd: Rnd) {
  let draw = [...t.draw];
  let discard = t.discard;
  let mixed = false;
  const cards: number[] = [];
  while (cards.length < count) {
    if (!draw.length) {
      if (discard.length < 2) break;
      draw = shuffled(discard.slice(0, -1), rnd);
      discard = discard.slice(-1);
      mixed = true;
    }
    cards.push(draw.pop() as number);
  }
  return { cards, draw, discard, mixed };
}

function start(t: TableBase<'cards'> & Partial<CardsState>, rnd: Rnd): CardsState & { log: string } {
  const draw = shuffled(Array.from({ length: DECK }, (_, id) => id), rnd);
  const hands: number[][] = t.seats.map(() => []);
  for (let i = 0; i < HAND; i++) for (const hand of hands) hand.push(draw.pop() as number);
  // The first card on the table is a number: the nearest one to the top of the pile.
  let at = draw.length - 1;
  while (typeof cardOf(draw[at]).value !== 'number') at--;
  const [first] = draw.splice(at, 1);
  return {
    hands,
    draw,
    discard: [first],
    color: cardOf(first).color as number,
    dir: 1,
    drawn: null,
    deal: (t.deal ?? 0) + 1,
    n: 0,
    last: null,
    log: 'Rengi ya da yüzü aynı kartı at; atamazsan kart çek.',
  };
}

const event = (t: CardsTable, seat: number, type: CardsEvent['type']): CardsEvent => ({ n: t.n + 1, seat, type, card: null, took: null, skipped: null, turned: false, one: false, mixed: false });

/** { card, color? } plays that card (a Joker names its colour), { draw: true } draws one, { pass: true } keeps the card just drawn. */
function move(t: CardsTable, seat: number, mv: CardsMove, names: string[], rnd: Rnd): MoveResult<CardsTable> {
  const who = names[seat];
  const m = mv as { card?: unknown; color?: unknown; draw?: unknown; pass?: unknown } | null;
  if (m?.pass === true) {
    if (t.drawn === null) return { ok: false, reason: 'Önce kart at ya da çek.' };
    return { ok: true, table: { ...t, drawn: null, turn: seatAfter(t, seat), n: t.n + 1, last: event(t, seat, 'pass'), log: `${who} çektiği kartı tuttu` } };
  }
  const top = t.discard[t.discard.length - 1];
  if (m?.draw === true) {
    if (t.drawn !== null) return { ok: false, reason: 'Kartını çektin: onu at ya da pas geç.' };
    const got = take(t, 1, rnd);
    const hands = t.hands.map((h, i) => (i === seat ? [...h, ...got.cards] : h));
    const next: CardsTable = { ...t, hands, draw: got.draw, discard: got.discard, n: t.n + 1, last: { ...event(t, seat, 'draw'), took: [seat, got.cards.length], mixed: got.mixed } };
    if (!got.cards.length) return { ok: true, table: { ...next, turn: seatAfter(t, seat), log: `${who} çekecek kart bulamadı` } };
    // A card that fits may still be played; any other ends the turn.
    if (fits(got.cards[0], t.color, top)) return { ok: true, table: { ...next, drawn: got.cards[0], log: `${who} kart çekti` } };
    return { ok: true, table: { ...next, turn: seatAfter(t, seat), log: `${who} kart çekti` } };
  }
  const card = m?.card;
  if (typeof card !== 'number' || !Number.isInteger(card) || !t.hands[seat].includes(card)) return { ok: false, reason: 'Bu kart sende yok.' };
  if (t.drawn !== null && card !== t.drawn) return { ok: false, reason: 'Yalnız çektiğin kartı atabilirsin.' };
  if (!fits(card, t.color, top)) return { ok: false, reason: 'Bu kart atılamaz.' };
  const face = cardOf(card);
  const joker = face.color === null;
  const named = m?.color;
  if (joker && !(typeof named === 'number' && Number.isInteger(named) && named >= 0 && named < COLOR_NAMES.length)) return { ok: false, reason: 'Jokerin rengini seç.' };

  const hands = t.hands.map((h, i) => (i === seat ? h.filter((x) => x !== card) : h));
  const color = joker ? (named as number) : (face.color as number);
  const last: CardsEvent = { ...event(t, seat, 'play'), card, one: hands[seat].length === 1 };
  const played: CardsTable = { ...t, hands, discard: [...t.discard, card], color, drawn: null, n: t.n + 1 };
  if (!hands[seat].length) return { ok: true, table: { ...played, status: 'over', winner: seat, last, log: `🏆 ${who} kartlarını bitirdi!` } };

  let log = `${who} ${cardName(card)} attı`;
  let next = played;
  let turn = seatAfter(t, seat);
  if (face.value === 'Yön') {
    next = { ...played, dir: -t.dir as 1 | -1 };
    last.turned = true;
    // With two players the turn comes straight back: the other one misses it.
    if (t.seats.length === 2) {
      last.skipped = turn;
      turn = seat;
      log += ': sıra yine onda';
    } else {
      turn = seatAfter(next, seat);
      log += ': yön değişti';
    }
  } else if (face.value === 'Atla') {
    last.skipped = turn;
    turn = seatAfter(t, seat, 2);
    log += `: ${names[last.skipped]} sırasını kaçırdı`;
  } else if (face.value === '+2' || face.value === '+4') {
    const victim = turn;
    const got = take(played, face.value === '+2' ? 2 : 4, rnd);
    next = { ...played, hands: hands.map((h, i) => (i === victim ? [...h, ...got.cards] : h)), draw: got.draw, discard: got.discard };
    last.took = [victim, got.cards.length];
    last.skipped = victim;
    last.mixed = got.mixed;
    turn = seatAfter(t, seat, 2);
    log += `${joker ? `: renk ${COLOR_NAMES[color]},` : ':'} ${names[victim]} ${got.cards.length} kart çekti`;
  } else if (joker) log += `: renk ${COLOR_NAMES[color]}`;
  if (last.one) log += ' · SON KART!';
  return { ok: true, table: { ...next, turn, last, log } };
}

const STOPS: CardValue[] = ['Yön', 'Atla', '+2', '+4'];

/**
 * The card a careful player would play from `seat`'s hand, as a move; null when nothing fits. Someone about to
 * finish is stopped first; otherwise a card of the colour held most of, numbers before the cards that stop someone,
 * and the Jokers kept for when nothing else fits. The practice opponents play it, and so does the server's table on
 * a run-out turn.
 */
export function pickCard(t: Pick<CardsTable, 'hands' | 'discard' | 'color' | 'drawn' | 'seats' | 'dir'>, seat: number): { card: number; color?: number } | null {
  const hand = t.hands[seat];
  const top = t.discard[t.discard.length - 1];
  const can = t.drawn !== null ? [t.drawn] : hand.filter((id) => fits(id, t.color, top));
  if (!can.length) return null;
  const close = t.hands[seatAfter(t, seat)].length <= 2;
  const held = (color: number, but: number) => hand.filter((x) => x !== but && cardOf(x).color === color).length;
  const score = (id: number) => {
    const c = cardOf(id);
    const stop = STOPS.indexOf(c.value);
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
function auto(t: CardsTable, names: string[], rnd: Rnd): CardsTable {
  const seat = t.turn;
  const done = (r: MoveResult<CardsTable>) => (r.ok ? r.table : t);
  const pick = pickCard(t, seat);
  if (pick) return done(move(t, seat, pick, names, rnd));
  const drew = done(move(t, seat, { draw: true }, names, rnd));
  const then = drew.drawn === null ? null : pickCard(drew, seat);
  return then ? done(move(drew, seat, then, names, rnd)) : drew;
}

/** `seat` leaves a hand that goes on: their cards go back under the pile, and a turn of theirs passes on in the direction of play. */
function left(t: CardsTable, seat: number): Partial<CardsState> & { turn?: number } {
  const more = { draw: [...t.hands[seat], ...t.draw], n: t.n + 1, last: event(t, seat, 'left') };
  if (t.turn !== seat) return more;
  const next = seatAfter(t, seat);
  // The seats after the one that left move down by one.
  return { ...more, drawn: null, turn: next > seat ? next - 1 : next };
}

const GAME: Game<'cards', CardsState, CardsMove> = { id: 'cards', meta: META, seatFields: ['hands'], start, move, auto, left };

/** A new table with its opener on the first seat. */
export const openTable = (opener: string) => seam.openTable('cards', opener);
/** Starts (or starts again) the hand with the seated players. */
export const startTable = (t: TableBase<'cards'> & Partial<CardsState>, rnd: Rnd) => seam.startTable(GAME, t, rnd);
/** One move by seat `seat` (`names[seat]` for the log). */
export const moveTable = (t: CardsTable, seat: number, m: CardsMove, names: string[], rnd: Rnd) => seam.moveTable(GAME, t, seat, m, names, rnd);
/** The turn's time ran out: the table plays for that seat, and after MISSES such turns in a row the seat leaves. */
export const timeoutTable = (t: CardsTable, names: string[], rnd: Rnd) => seam.timeoutTable(GAME, t, names, rnd);
/** Seat `seat` leaves, and its cards go back under the pile. */
export const leaveTable = <T extends TableBase<'cards'> & Partial<CardsState>>(t: T, seat: number, names: string[]) => seam.leaveTable(GAME, t, seat, names);

/**
 * What `seat` is told (−1: someone watching): never another player's cards (their counts only) and never the
 * pile's. The card just drawn is told only to whoever drew it.
 */
export function viewOf<T extends TableBase<'cards'> & Partial<CardsState>>(t: T, seat: number): Omit<T, 'hands' | 'draw' | 'discard' | 'drawn'> & Partial<Pick<CardsSeen, 'counts' | 'mine' | 'top' | 'under' | 'pile' | 'drawn'>> {
  const { hands, draw, discard, drawn, ...rest } = t;
  if (!hands || !draw || !discard) return rest;
  return {
    ...rest,
    counts: hands.map((h) => h.length),
    mine: seat >= 0 ? (hands[seat] ?? []) : null,
    top: discard[discard.length - 1],
    under: discard.slice(-3, -1),
    pile: draw.length,
    drawn: seat >= 0 && seat === t.turn ? (drawn ?? null) : null,
  };
}
