// Renk Kartları at a room's table (room-games/cards.mjs behind room-games-rules.mjs). First the rules as pure
// functions with the cards given: the deck, the deal, what may be played, each card that does something, drawing
// and keeping, the pile running out, the last card, a run-out turn, leaving, what each seat is told. Then a table
// over HTTP against a real Postgres: cards only to their owner, moves checked by the server, the table's own play and
// a table kept from the older game.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';
import { MISSES, TABLE_GAMES, TURN_MS, leaveTable, moveTable, openTable, staleTable, startTable, timeoutTable, viewOf } from '../room-games-rules.mjs';
import { COLOR_NAMES, DECK, HAND, cardName, cardOf, fits, pickCard } from '../room-games/cards.mjs';

const names = ['A', 'B', 'C', 'D', 'E', 'F'];
/** A small seeded generator (mulberry32): the same shuffles every run. */
const seeded = (seed) => {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * n);
  };
};
/** No draw is expected: one fails the test. */
const none = () => assert.fail('beklenmeyen çekiliş');
const ALL = Array.from({ length: DECK }, (_, id) => id);
/** The number of a card: card(1, 7) is a Kızıl 7, card(1, 7, 1) the other one; card(null, 'Joker') a Joker. */
const card = (color, value, k = 0) => ALL.filter((id) => cardOf(id).color === color && cardOf(id).value === value)[k];
const JOKER = card(null, 'Joker');
const PLUS4 = card(null, '+4');
/** A hand just dealt to `n` players. */
const dealt = (n, seed = 1) => startTable({ ...openTable('cards', 'p0'), seats: Array.from({ length: n }, (_, i) => `p${i}`), misses: Array(n).fill(0) }, seeded(seed));
/** A hand in the state a test needs: these hands, this card on the table, and whatever `more` says. */
const hand = (hands, top, more = {}) => ({ ...dealt(hands.length), hands, discard: [top], color: cardOf(top).color ?? 0, draw: [card(3, 1), card(3, 2), card(3, 3), card(3, 4), card(3, 6)], ...more });
const play = (t, m, rndFn = none) => {
  const r = moveTable(t, t.turn, m, names, rndFn);
  assert.ok(r.ok, r.reason);
  return r.table;
};
const refused = (t, seat, m) => moveTable(t, seat, m, names, none).reason;
const everyCard = (t) => [...t.hands.flat(), ...t.draw, ...t.discard].sort((a, b) => a - b);

describe('Renk Kartları’nın kuralları', () => {
  test('deste bizim: 102 kart; dört renkte 1–9 ikişer, ikişer Atla, Yön ve +2; dört Joker, iki Joker +4', () => {
    assert.deepEqual([DECK, HAND, COLOR_NAMES, TABLE_GAMES.cards], [102, 7, ['Turkuaz', 'Kızıl', 'Altın', 'Yeşil'], { name: 'Renk Kartları', min: 2, max: 6 }]);
    const count = (color, value) => ALL.filter((id) => cardOf(id).color === color && cardOf(id).value === value).length;
    for (let color = 0; color < 4; color++) {
      for (let v = 1; v <= 9; v++) assert.equal(count(color, v), 2, `${COLOR_NAMES[color]} ${v}`);
      for (const v of ['Atla', 'Yön', '+2']) assert.equal(count(color, v), 2, `${COLOR_NAMES[color]} ${v}`);
      assert.equal(count(color, 0), 0, 'sıfır yok');
    }
    assert.deepEqual([count(null, 'Joker'), count(null, '+4')], [4, 2]);
    assert.equal(ALL.filter((id) => cardOf(id).color === null).length, 6);
    assert.deepEqual([cardName(card(1, 7)), cardName(card(3, 'Yön')), cardName(JOKER), cardName(PLUS4)], ['Kızıl 7', 'Yeşil Yön', 'Joker', 'Joker +4']);
  });

  test('el başlar: karılmış desteden yedişer kart, ortaya bir sayı kartı; hiçbir kart kaybolmaz', () => {
    for (const n of [2, 3, 6]) {
      const t = dealt(n, n);
      assert.deepEqual([t.status, t.turn, t.dir, t.drawn, t.deal, t.n, t.last], ['playing', 0, 1, null, 1, 0, null]);
      assert.deepEqual(t.hands.map((h) => h.length), Array(n).fill(HAND));
      assert.equal(t.discard.length, 1);
      assert.equal(typeof cardOf(t.discard[0]).value, 'number', 'ilk kart sayı');
      assert.equal(t.color, cardOf(t.discard[0]).color);
      assert.equal(t.draw.length, DECK - n * HAND - 1);
      assert.deepEqual(everyCard(t), ALL);
    }
    // Another shuffle, another deal; the same shuffle, the same deal.
    assert.notDeepEqual(dealt(3, 1).hands, dealt(3, 2).hands);
    assert.deepEqual(dealt(3, 5), dealt(3, 5));
    const again = startTable({ ...dealt(2), status: 'over', winner: 1 }, seeded(9));
    assert.deepEqual([again.deal, again.n, again.winner, again.status, everyCard(again)], [2, 0, null, 'playing', ALL]);
    // A pile that starts with cards that do something: the first number under them comes to the table.
    let k = 0;
    const stacked = startTable({ ...openTable('cards', 'p0'), seats: ['p0', 'p1'], misses: [0, 0] }, (n) => (k++ < DECK - 1 ? n - 1 : 0));
    assert.deepEqual(everyCard(stacked), ALL);
    assert.equal(typeof cardOf(stacked.discard[0]).value, 'number');
  });

  test('rengi ya da yüzü tutan kart atılır; tutmayan, elde olmayan ve sırası gelmeyenin kartı reddedilir', () => {
    const t = hand([[card(1, 7), card(0, 5), card(3, 9)], [card(2, 3), card(0, 1)], [card(2, 8), card(2, 9)]], card(1, 5));
    assert.deepEqual([fits(card(1, 7), 1, card(1, 5)), fits(card(0, 5), 1, card(1, 5)), fits(card(3, 9), 1, card(1, 5)), fits(JOKER, 1, card(1, 5))], [true, true, false, true]);
    let r = play(t, { card: card(1, 7) });
    assert.deepEqual([r.hands[0], r.discard, r.color, r.turn, r.n, r.log], [[card(0, 5), card(3, 9)], [card(1, 5), card(1, 7)], 1, 1, 1, 'A Kızıl 7 attı']);
    assert.deepEqual(r.last, { n: 1, seat: 0, type: 'play', card: card(1, 7), took: null, skipped: null, turned: false, one: false, mixed: false });
    r = play(t, { card: card(0, 5) });
    assert.deepEqual([r.color, r.turn, r.log], [0, 1, 'A Turkuaz 5 attı'], 'aynı yüz rengi değiştirir');
    assert.equal(refused(t, 0, { card: card(3, 9) }), 'Bu kart atılamaz.');
    for (const m of [{ card: card(2, 3) }, { card: '5' }, { card: null }, {}, null, { card: 0.5 }]) assert.equal(refused(t, 0, m), 'Bu kart sende yok.', JSON.stringify(m));
    assert.equal(refused(t, 1, { card: card(2, 3) }), 'Sıra sende değil.');
    assert.equal(refused({ ...t, status: 'over' }, 0, { card: card(1, 7) }), 'Oyun başlamadı.');
  });

  test('Atla sıradakini atlatır; Yön oyunun yönünü çevirir, iki kişiyken Atla gibi oynar', () => {
    const three = (first) => hand([[first, card(0, 1), card(0, 2)], [card(2, 1), card(1, 2)], [card(3, 1), card(1, 3), card(1, 4)]], card(1, 5));
    let r = play(three(card(1, 'Atla')), { card: card(1, 'Atla') });
    assert.deepEqual([r.turn, r.dir, r.last.skipped, r.last.turned, r.log], [2, 1, 1, false, 'A Kızıl Atla attı: B sırasını kaçırdı']);
    r = play(three(card(1, 'Yön')), { card: card(1, 'Yön') });
    assert.deepEqual([r.turn, r.dir, r.last.skipped, r.last.turned, r.log], [2, -1, null, true, 'A Kızıl Yön attı: yön değişti']);
    // Play now runs the other way: after the third seat comes the second.
    r = play(r, { card: card(1, 3) });
    assert.deepEqual([r.turn, r.dir], [1, -1]);
    r = play(r, { card: card(1, 2) });
    assert.equal(r.turn, 0);
    // A second Yön turns it back.
    const back = play({ ...three(card(0, 'Yön')), dir: -1, color: 0, discard: [card(0, 7)] }, { card: card(0, 'Yön') });
    assert.deepEqual([back.dir, back.turn], [1, 1]);
    // An Atla against the direction of play skips the seat before.
    r = play({ ...three(card(1, 'Atla')), dir: -1 }, { card: card(1, 'Atla') });
    assert.deepEqual([r.turn, r.last.skipped], [1, 2]);

    const two = (first) => hand([[first, card(0, 1), card(0, 2)], [card(2, 1), card(1, 2)]], card(1, 5));
    r = play(two(card(1, 'Atla')), { card: card(1, 'Atla') });
    assert.deepEqual([r.turn, r.last.skipped, r.log], [0, 1, 'A Kızıl Atla attı: B sırasını kaçırdı']);
    r = play(two(card(1, 'Yön')), { card: card(1, 'Yön') });
    assert.deepEqual([r.turn, r.dir, r.last.skipped, r.last.turned, r.log], [0, -1, 1, true, 'A Kızıl Yön attı: sıra yine onda']);
  });

  test('+2 sıradakine iki kart çektirir ve sırasını geçirir; Joker rengi seçtirir; Joker +4 dört kart çektirir', () => {
    const t = (first, more) => hand([[first, card(0, 1), card(0, 2)], [card(2, 1)], [card(3, 5), card(3, 7)]], card(1, 5), more);
    let r = play(t(card(1, '+2'), { draw: [card(3, 7, 1), card(3, 8), card(3, 9)] }), { card: card(1, '+2') });
    // The pile's top is its last card: Yeşil 9 comes first.
    assert.deepEqual([r.hands[1], r.draw, r.turn, r.last.took, r.last.skipped], [[card(2, 1), card(3, 9), card(3, 8)], [card(3, 7, 1)], 2, [1, 2], 1]);
    assert.equal(r.log, 'A Kızıl +2 attı: B 2 kart çekti');
    // A +2 on a +2 is only a card with the same face: nothing is added up or sent back.
    r = play(hand([[card(1, '+2')], [card(3, '+2'), card(0, 1)], [card(2, 1)]], card(1, 5), { hands: [[card(0, 9), card(0, 8)], [card(3, '+2'), card(0, 1)], [card(2, 1)]], discard: [card(1, '+2')], color: 1, turn: 1 }), { card: card(3, '+2') });
    assert.deepEqual([r.hands[2].length, r.turn, r.color, r.last.took], [3, 0, 3, [2, 2]]);

    for (const m of [{ card: JOKER }, { card: JOKER, color: 4 }, { card: JOKER, color: -1 }, { card: JOKER, color: '2' }, { card: JOKER, color: 1.5 }]) assert.equal(refused(t(JOKER), 0, m), 'Jokerin rengini seç.', JSON.stringify(m));
    r = play(t(JOKER), { card: JOKER, color: 3 });
    assert.deepEqual([r.color, r.turn, r.discard.at(-1), r.last.took, r.log], [3, 1, JOKER, null, 'A Joker attı: renk Yeşil']);
    // The colour named is the one to follow; the card under the Joker no longer counts.
    assert.deepEqual([fits(card(3, 5), r.color, JOKER), fits(card(1, 5), r.color, JOKER), fits(card(1, 9), r.color, JOKER), fits(PLUS4, r.color, JOKER)], [true, false, false, true]);
    assert.equal(refused(r, 1, { card: card(2, 1) }), 'Bu kart atılamaz.');
    // A coloured card takes no colour from the move.
    assert.equal(play(t(card(1, 7)), { card: card(1, 7), color: 3 }).color, 1);

    r = play(t(PLUS4, { draw: [card(0, 3), card(0, 4), card(0, 6), card(0, 7), card(0, 8)] }), { card: PLUS4, color: 2 });
    assert.deepEqual([r.color, r.hands[1].length, r.draw, r.turn, r.last.took, r.last.skipped], [2, 5, [card(0, 3)], 2, [1, 4], 1]);
    assert.equal(r.log, 'A Joker +4 attı: renk Altın, B 4 kart çekti');
    // With two players the one who drew misses the turn: it comes back.
    r = play(hand([[card(1, '+2'), card(0, 1), card(0, 2)], [card(2, 1)]], card(1, 5)), { card: card(1, '+2') });
    assert.deepEqual([r.turn, r.hands[1].length], [0, 3]);
  });

  test('kart çekmek: tutmayan kart sırayı geçirir; tutan kart hemen atılabilir ya da elde tutulur', () => {
    const t = (draw) => hand([[card(1, 1), card(0, 2)], [card(2, 1)], [card(3, 1)]], card(1, 5), { draw });
    // Yeşil 7 doesn't fit a Kızıl 5.
    let r = play(t([card(1, 9), card(3, 7)]), { draw: true });
    assert.deepEqual([r.hands[0], r.draw, r.turn, r.drawn, r.log], [[card(1, 1), card(0, 2), card(3, 7)], [card(1, 9)], 1, null, 'A kart çekti']);
    assert.deepEqual(r.last, { n: 1, seat: 0, type: 'draw', card: null, took: [0, 1], skipped: null, turned: false, one: false, mixed: false });
    // Kızıl 9 fits: the turn waits for it to be played or kept. One may draw with a card to play in hand.
    const drew = play(t([card(3, 7), card(1, 9)]), { draw: true });
    assert.deepEqual([drew.hands[0].length, drew.turn, drew.drawn, drew.log], [3, 0, card(1, 9), 'A kart çekti']);
    assert.equal(refused(drew, 0, { draw: true }), 'Kartını çektin: onu at ya da pas geç.');
    assert.equal(refused(drew, 0, { card: card(1, 1) }), 'Yalnız çektiğin kartı atabilirsin.');
    r = play(drew, { pass: true });
    assert.deepEqual([r.turn, r.drawn, r.hands[0].length, r.last.type, r.n, r.log], [1, null, 3, 'pass', 2, 'A çektiği kartı tuttu']);
    r = play(drew, { card: card(1, 9) });
    assert.deepEqual([r.turn, r.drawn, r.hands[0], r.discard.at(-1), r.log], [1, null, [card(1, 1), card(0, 2)], card(1, 9), 'A Kızıl 9 attı']);
    // A drawn Joker still needs its colour.
    const joker = play(t([JOKER]), { draw: true });
    assert.equal(joker.drawn, JOKER);
    assert.equal(refused(joker, 0, { card: JOKER }), 'Jokerin rengini seç.');
    assert.equal(refused(t([card(1, 9)]), 0, { pass: true }), 'Önce kart at ya da çek.');
  });

  test('deste bitince atılan kartlar (en üstteki dışında) karılıp yeni deste olur; kart kalmadıysa çekilmez', () => {
    const under = [card(3, 1), card(3, 2), card(3, 3)];
    const t = hand([[card(0, 2)], [card(2, 1)]], card(1, 5), { draw: [], discard: [...under, card(1, 5)] });
    let r = play(t, { draw: true }, seeded(4));
    assert.deepEqual([r.discard, r.draw.length, r.hands[0].length, r.last.mixed, r.last.took], [[card(1, 5)], 2, 2, true, [0, 1]]);
    assert.deepEqual([...r.draw, r.hands[0][1]].sort((a, b) => a - b), under);
    // Every other card is in a hand: nothing to draw, the turn passes.
    r = play({ ...t, discard: [card(1, 5)] }, { draw: true });
    assert.deepEqual([r.hands[0], r.turn, r.last.took, r.last.mixed, r.log], [[card(0, 2)], 1, [0, 0], false, 'A çekecek kart bulamadı']);
    // A +2 with one card left to give: the pile is remade from the cards under the one just played.
    r = play(hand([[card(1, '+2'), card(0, 1)], [card(2, 1)]], card(1, 5), { draw: [card(3, 9)], discard: [card(3, 4), card(1, 5)] }), { card: card(1, '+2') }, seeded(4));
    assert.deepEqual([r.hands[1].length, r.draw.length, r.discard, r.last.took, r.last.mixed], [3, 1, [card(1, '+2')], [1, 2], true]);
    r = play(hand([[PLUS4, card(0, 1), card(0, 2)], [card(2, 1)]], card(1, 5), { draw: [card(3, 9)], discard: [card(1, 5)] }), { card: PLUS4, color: 0 }, seeded(4));
    assert.deepEqual([r.hands[1], r.draw, r.discard, r.last.took, r.log], [[card(2, 1), card(3, 9), card(1, 5)], [], [PLUS4], [1, 2], 'A Joker +4 attı: renk Turkuaz, B 2 kart çekti']);
  });

  test('son kartını atan kazanır; tek kartı kalana masa SON KART der', () => {
    let r = play(hand([[card(1, 7), card(0, 2)], [card(2, 1), card(2, 2)]], card(1, 5)), { card: card(1, 7) });
    assert.deepEqual([r.status, r.last.one, r.turn, r.log], ['playing', true, 1, 'A Kızıl 7 attı · SON KART!']);
    r = play(hand([[card(1, 'Atla'), card(0, 2)], [card(2, 1), card(2, 2)]], card(1, 5)), { card: card(1, 'Atla') });
    assert.equal(r.log, 'A Kızıl Atla attı: B sırasını kaçırdı · SON KART!');
    r = play(hand([[card(1, 7)], [card(2, 1), card(2, 2)]], card(1, 5)), { card: card(1, 7) });
    assert.deepEqual([r.status, r.winner, r.hands[0], r.last.one, r.last.card, r.log], ['over', 0, [], false, card(1, 7), '🏆 A kartlarını bitirdi!']);
    assert.equal(refused(r, 1, { draw: true }), 'Oyun başlamadı.');
    // The hand ends on the card: a last +2 makes nobody draw.
    r = play(hand([[card(1, '+2')], [card(2, 1), card(2, 2)]], card(1, 5)), { card: card(1, '+2') });
    assert.deepEqual([r.status, r.winner, r.hands[1].length, r.last.took], ['over', 0, 2, null]);
    r = play(hand([[JOKER], [card(2, 1)]], card(1, 5)), { card: JOKER, color: 2 });
    assert.deepEqual([r.status, r.winner, r.color], ['over', 0, 2]);
  });

  test('masanın seçtiği kart: bitirmek üzere olanı durdurur, yoksa elinde en çok olan rengi oynar, Jokeri sona saklar', () => {
    const pick = (mine, top, next = [card(2, 1), card(2, 2), card(2, 3)], more = {}) => pickCard(hand([mine, next, [card(3, 1), card(3, 2), card(3, 3)]], top, more), 0);
    assert.equal(pick([card(3, 9), card(2, 8)], card(1, 5)), null, 'tutan kart yok');
    assert.deepEqual(pick([card(1, 3), card(1, 8), card(0, 5)], card(1, 5)), { card: card(1, 8) }, 'renkte büyük sayı');
    assert.deepEqual(pick([card(1, 3), card(0, 5), card(0, 6), card(0, 7)], card(1, 5)), { card: card(0, 5) }, 'elinde çok olan renge geçer');
    assert.deepEqual(pick([card(1, '+2'), card(1, 3), card(1, 4)], card(1, 5)), { card: card(1, 4) }, 'durduran kart saklanır');
    assert.deepEqual(pick([JOKER, card(1, 3)], card(1, 5)), { card: card(1, 3) }, 'Joker saklanır');
    assert.deepEqual(pick([JOKER, PLUS4, card(3, 3), card(3, 4), card(2, 9)], card(1, 5)), { card: JOKER, color: 3 }, 'başka kart yoksa Joker, elinde çok olan renkle');
    assert.deepEqual(pick([JOKER, JOKER + 1], card(1, 5)), { card: JOKER, color: 1 }, 'yalnız Joker kaldıysa ortadaki renk');
    // The next player is down to two cards: the hardest stop first.
    const close = [card(2, 1), card(2, 2)];
    assert.deepEqual(pick([card(1, 9), card(1, 'Atla'), card(1, '+2'), PLUS4, card(0, 1)], card(1, 5), close), { card: PLUS4, color: 1 });
    assert.deepEqual(pick([card(1, 9), card(1, 'Atla'), card(1, '+2')], card(1, 5), close), { card: card(1, '+2') });
    assert.deepEqual(pick([card(1, 9), card(1, 'Atla'), card(1, 'Yön')], card(1, 5), close), { card: card(1, 'Atla') });
    assert.deepEqual(pick([card(1, 9), card(1, 'Yön')], card(1, 5), close), { card: card(1, 'Yön') });
    assert.deepEqual(pick([card(1, 9), JOKER], card(1, 5), close), { card: card(1, 9) }, 'Joker kimseyi durdurmaz');
    // Against the direction of play the next player is the one before.
    assert.deepEqual(pick([card(1, 9), card(1, 'Atla')], card(1, 5), close, { dir: -1 }), { card: card(1, 9) });
    // After a draw only the drawn card may go.
    assert.deepEqual(pick([card(1, 9), card(1, 3)], card(1, 5), close, { drawn: card(1, 3) }), { card: card(1, 3) });
  });

  test('süresi dolan sırada masa oynar: tutan kartı atar ya da çeker, çektiği tutarsa onu da atar; üçüncüde koltuk gider', () => {
    const t = (more) => hand([[card(3, 9), card(1, 7)], [card(0, 1), card(0, 3)], [card(2, 5), card(2, 6)]], card(1, 4), more);
    let r = timeoutTable(t(), names, none);
    assert.deepEqual([r.hands[0], r.discard.at(-1), r.turn, r.misses, r.log], [[card(3, 9)], card(1, 7), 1, [1, 0, 0], 'A Kızıl 7 attı · SON KART!']);
    // Nothing fits and the card drawn doesn't either: the turn passes.
    r = timeoutTable(t({ turn: 1, misses: [0, 1, 0], draw: [card(3, 8)] }), names, none);
    assert.deepEqual([r.hands[1], r.turn, r.misses, r.last.type, r.n, r.log], [[card(0, 1), card(0, 3), card(3, 8)], 2, [0, 2, 0], 'draw', 1, 'B kart çekti']);
    // The card drawn fits: it is played in the same run-out turn.
    r = timeoutTable(t({ turn: 1, draw: [card(1, 8)] }), names, none);
    assert.deepEqual([r.hands[1], r.discard.at(-1), r.turn, r.drawn, r.last.type, r.n, r.misses], [[card(0, 1), card(0, 3)], card(1, 8), 2, null, 'play', 2, [0, 1, 0]]);
    // The seat drew a card that fits and went away: the table plays it.
    const drew = play(t({ turn: 1, draw: [card(1, 8)] }), { draw: true });
    r = timeoutTable(drew, names, none);
    assert.deepEqual([r.discard.at(-1), r.turn, r.drawn, r.misses, r.n], [card(1, 8), 2, null, [0, 1, 0], 2]);
    // A Joker played by the table names the colour its seat holds most of.
    r = timeoutTable(hand([[JOKER, card(3, 3), card(3, 4), card(2, 9)], [card(0, 1), card(0, 2), card(0, 3)]], card(1, 5)), names, none);
    assert.deepEqual([r.color, r.discard.at(-1), r.turn, r.log], [3, JOKER, 1, 'A Joker attı: renk Yeşil']);
    // A move of one's own clears the count; the third run-out turn in a row takes the seat away.
    assert.deepEqual(play(t({ misses: [2, 1, 0] }), { card: card(1, 7) }).misses, [0, 1, 0]);
    assert.deepEqual(play(t({ misses: [2, 1, 0] }), { draw: true }).misses, [0, 1, 0]);
    r = timeoutTable(t({ misses: [MISSES - 1, 0, 0], draw: [card(3, 8)] }), names, none);
    assert.deepEqual([r.seats, r.hands, r.draw, r.turn, r.status, r.misses, r.log], [['p1', 'p2'], [[card(0, 1), card(0, 3)], [card(2, 5), card(2, 6)]], [card(3, 9), card(1, 7), card(3, 8)], 0, 'playing', [0, 0], 'A masadan kalktı.']);
  });

  test('masadan kalkanın kartları destenin altına girer; sırası oyunun yönünde sonrakine geçer, son kalan kazanır', () => {
    const hands = [[card(0, 1), card(0, 2)], [card(1, 1), card(1, 2)], [card(2, 1), card(2, 2)], [card(3, 1)]];
    const t = (more) => hand(hands, card(1, 5), { draw: [card(3, 8), card(3, 9)], ...more });
    // The one on turn leaves: the next in the direction of play has the turn.
    let r = leaveTable(t({ turn: 1 }), 1, names);
    assert.deepEqual([r.seats, r.hands, r.draw, r.turn, r.status, r.log], [['p0', 'p2', 'p3'], [hands[0], hands[2], hands[3]], [card(1, 1), card(1, 2), card(3, 8), card(3, 9)], 1, 'playing', 'B masadan kalktı.']);
    assert.deepEqual(r.last, { n: 1, seat: 1, type: 'left', card: null, took: null, skipped: null, turned: false, one: false, mixed: false });
    assert.equal(r.n, 1);
    r = leaveTable(t({ turn: 1, dir: -1 }), 1, names);
    assert.deepEqual([r.seats, r.turn, r.dir], [['p0', 'p2', 'p3'], 0, -1]);
    r = leaveTable(t({ turn: 0, dir: -1 }), 0, names);
    assert.deepEqual([r.seats, r.turn], [['p1', 'p2', 'p3'], 2], 'ilk koltuktan geriye doğru son koltuk');
    r = leaveTable(t({ turn: 3 }), 3, names);
    assert.deepEqual([r.seats, r.turn], [['p0', 'p1', 'p2'], 0]);
    // Someone else leaves: the turn stays with whoever had it.
    for (const dir of [1, -1]) {
      assert.equal(leaveTable(t({ turn: 2, dir }), 0, names).turn, 1);
      assert.equal(leaveTable(t({ turn: 2, dir }), 3, names).turn, 2);
    }
    // The card just drawn was the leaver's: nobody is left holding a turn half played.
    const drew = play(t({ turn: 1, draw: [card(3, 8), card(1, 9)] }), { draw: true });
    assert.equal(drew.drawn, card(1, 9));
    r = leaveTable(drew, 1, names);
    assert.deepEqual([r.drawn, r.turn, r.draw], [null, 1, [card(1, 1), card(1, 2), card(1, 9), card(3, 8)]]);
    // Somebody else leaving doesn't take the card drawn away from the one deciding.
    r = leaveTable(drew, 3, names);
    assert.deepEqual([r.drawn, r.turn], [card(1, 9), 1]);
    // Two players: the one left wins.
    r = leaveTable(hand([hands[0], hands[1]], card(1, 5)), 0, names);
    assert.deepEqual([r.status, r.winner, r.seats, r.hands, r.turn, r.log], ['over', 0, ['p1'], [hands[1]], 0, 'A masadan kalktı · 🏆 B kazandı!']);
    // After a hand a seat goes with its cards, so the others still see their own.
    const over = leaveTable({ ...t(), status: 'over', winner: 2 }, 0, names);
    assert.deepEqual([over.seats, over.winner, viewOf(over, 0).mine, viewOf(over, 0).counts, over.draw], [['p1', 'p2', 'p3'], 1, hands[1], [2, 2, 1], [card(3, 8), card(3, 9)]]);
  });

  test('her oyuncu yalnız kendi kartlarını görür; destenin içi ve çekilen kart başkasına gitmez', () => {
    const t = hand([[card(0, 1), card(0, 2)], [card(1, 1)], [card(2, 1), card(2, 2), card(2, 3)]], card(1, 5), { discard: [card(3, 1), card(3, 2), card(3, 3), card(1, 5)], draw: [card(3, 8), card(1, 9)], turn: 1 });
    const v = viewOf(t, 1);
    assert.deepEqual([v.counts, v.mine, v.top, v.under, v.pile, v.color, v.dir, v.drawn], [[2, 1, 3], [card(1, 1)], card(1, 5), [card(3, 2), card(3, 3)], 2, 1, 1, null]);
    assert.deepEqual([v.hands, v.draw, v.discard], [undefined, undefined, undefined]);
    assert.deepEqual([viewOf(t, -1).mine, viewOf(t, 0).mine], [null, [card(0, 1), card(0, 2)]], 'izleyen kart görmez');
    const drew = play(t, { draw: true });
    assert.deepEqual([viewOf(drew, 1).drawn, viewOf(drew, 0).drawn, viewOf(drew, -1).drawn, viewOf(drew, 0).counts, viewOf(drew, 0).pile], [card(1, 9), null, null, [2, 2, 3], 1]);
    assert.equal(JSON.stringify(viewOf(drew, 0)).includes(`${card(1, 9)}`), false, 'çekilen kartın numarası başkasına gitmez');
    // A table still waiting has nothing to hide, and someone who sat down after a hand has no cards yet.
    assert.deepEqual(viewOf(openTable('cards', 'a'), 0), openTable('cards', 'a'));
    assert.deepEqual(viewOf({ ...t, status: 'over', seats: [...t.seats, 'p3'], misses: [0, 0, 0, 0] }, 3).mine, []);
  });

  test('rastgele oynanan yüzlerce el hep bir kazananla biter; hiçbir kart kaybolmaz, çoğalmaz', () => {
    const seen = { skips: 0, turns: 0, plus2: 0, plus4: 0, jokers: 0, mixed: 0, passes: 0, last: 0, empty: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const r = seeded(seed);
      const n = 2 + (seed % 5);
      let t = dealt(n, seed * 31 + 7);
      for (let events = 0; t.status === 'playing'; events++) {
        assert.ok(events < 20_000, `el bitmiyor (${seed})`);
        const before = t;
        const seat = t.turn;
        const top = t.discard.at(-1);
        const can = t.drawn !== null ? [t.drawn] : t.hands[seat].filter((id) => fits(id, t.color, top));
        // Every third game is played by the table's own choice, the others at random (drawing now and then with a card to play).
        let m;
        if (seed % 3 === 0) m = pickCard(t, seat) ?? { draw: true };
        else if (t.drawn !== null) m = r(3) ? { card: t.drawn, color: r(4) } : { pass: true };
        else if (!can.length || r(12) === 0) m = { draw: true };
        else m = { card: can[r(can.length)], color: r(4) };
        const res = moveTable(t, seat, m, names, r);
        assert.ok(res.ok, `${res.reason} ${JSON.stringify(m)}`);
        t = res.table;
        assert.deepEqual(everyCard(t), ALL, `kartlar (${seed}, ${events})`);
        assert.deepEqual([t.n, t.last.n, t.last.seat], [before.n + 1, before.n + 1, seat]);
        assert.ok(t.color >= 0 && t.color < 4 && (t.dir === 1 || t.dir === -1));
        const face = cardOf(t.discard.at(-1));
        if (face.color !== null) assert.equal(t.color, face.color, 'ortadaki renk üstteki kartın rengi');
        assert.ok(t.discard.length >= 1 && t.turn >= 0 && t.turn < n);
        if (t.drawn !== null) assert.ok(t.turn === seat && t.hands[seat].includes(t.drawn) && fits(t.drawn, t.color, t.discard.at(-1)));
        const { type, skipped, took, turned, mixed, one } = t.last;
        if (type === 'pass') seen.passes++;
        if (skipped !== null) seen.skips++;
        if (turned) seen.turns++;
        if (mixed) seen.mixed++;
        if (one) seen.last++;
        if (took && took[1] === 0) seen.empty++;
        if (type === 'play') {
          const played = cardOf(t.last.card);
          if (played.value === '+2') seen.plus2++;
          if (played.value === '+4') seen.plus4++;
          if (played.color === null) seen.jokers++;
          assert.equal(t.hands[seat].length, before.hands[seat].length - 1);
          if (t.status === 'over') continue;
          // Who plays next: the turn stays only with two players and a card that stops the other one.
          const step = (k) => (((seat + t.dir * k) % n) + n) % n;
          const stops = ['Atla', '+2', '+4'].includes(played.value) || (played.value === 'Yön' && n === 2);
          assert.equal(t.turn, stops ? step(2) : step(1), JSON.stringify(t.last));
          if (played.value === '+2' || played.value === '+4') assert.deepEqual([took[0], skipped], [step(1), step(1)]);
        }
      }
      assert.equal(t.hands[t.winner].length, 0);
      assert.ok(t.hands.every((h, s) => s === t.winner || h.length > 0));
    }
    // The games really went through every rule (a pile runs out only in a long hand; one with nothing left to draw is rarer still).
    for (const [k, v] of Object.entries(seen)) assert.ok(v > (k === 'empty' ? -1 : k === 'mixed' ? 5 : 20), `${k}: ${v}`);
  });

  test('desteyi havadan dağıtan eski sürümden kalan masa oynanamaz sayılır', () => {
    const old = { game: 'cards', seats: ['a', 'b'], status: 'playing', turn: 0, winner: null, log: 'A kart attı', misses: [0, 0], hands: [[{ color: 1, value: 4 }], [{ color: 0, value: '+2' }]], top: { color: 1, value: 7 } };
    assert.equal(staleTable(old), true);
    assert.equal(staleTable({ ...old, status: 'over' }), true);
    assert.equal(staleTable({ ...old, status: 'waiting' }), false, 'bekleyen masa yeni kurallarla başlar');
    assert.deepEqual(everyCard(startTable({ ...old, status: 'waiting' }, seeded(3))), ALL);
    assert.equal(staleTable(dealt(2)), false);
  });
});

const lkCalls = [];
const LK_PORT = 22000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}` });
const { call, signUp } = h;
const table = (s, room) => call('GET', `/api/rooms/table?room=${room}`, null, s);
const act = (s, room, action, extra = {}) => call('POST', '/api/rooms/table', { room, action, ...extra }, s);
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j.table;
};

describe('Renk Kartları masası sunucuda', () => {
  let owner;
  let a;
  let b;
  let room;
  /** Puts the room's table in the state a test needs (the server only reads what is stored). */
  const set = (patch) => h.sql.query('UPDATE room_tables SET state = state || $2::jsonb, turn_at = now() WHERE room_id = $1', [room, JSON.stringify(patch)]);
  const stored = async () => (await h.sql.query('SELECT state FROM room_tables WHERE room_id = $1', [room])).rows[0]?.state;

  test('el dağıtılır: herkes yalnız kendi yedi kartını görür, izleyen hiçbirini', async () => {
    owner = await signUp('Oda Sahibi');
    a = await signUp('Ayşe');
    b = await signUp('Bora');
    const [st, j] = await call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session);
    assert.equal(st, 200, j.error);
    room = j.room.id;
    let t = await ok(act(owner.session, room, 'open', { game: 'cards' }));
    assert.deepEqual([t.game, t.name, t.min, t.max, t.status, t.mine, t.counts], ['cards', 'Renk Kartları', 2, 6, 'waiting', undefined, undefined]);
    assert.equal((await act(owner.session, room, 'start'))[1].error, 'Renk Kartları için en az 2 oyuncu gerekli');
    await ok(act(a.session, room, 'join'));
    t = await ok(act(owner.session, room, 'start'));
    assert.deepEqual([t.status, t.mine.length, t.counts, t.pile, t.under, t.dir, t.drawn, t.deal, t.n, t.turn], ['playing', 7, [7, 7], 102 - 15, [], 1, null, 1, 0, 0]);
    assert.deepEqual([t.hands, t.draw, t.discard], [undefined, undefined, undefined]);
    assert.equal(typeof cardOf(t.top).value, 'number');
    assert.equal(t.color, cardOf(t.top).color);
    const hers = await ok(table(a.session, room));
    assert.equal(hers.mine.length, 7);
    assert.equal(hers.mine.some((id) => t.mine.includes(id)), false, 'iki el ayrı kartlardan');
    const seen = await ok(table(b.session, room));
    assert.deepEqual([seen.mine, seen.counts, seen.top, seen.mySeat, seen.hands], [null, [7, 7], t.top, -1, undefined]);
    const state = await stored();
    assert.deepEqual([...state.hands.flat(), ...state.draw, ...state.discard].sort((x, y) => x - y), ALL);
  });

  test('hamleyi sunucu denetler: sıra, eldeki kart, tutan kart, Jokerin rengi; çekilen kart yalnız çekene söylenir', async () => {
    const mine = [card(1, 7), card(0, 5), card(3, 9), JOKER];
    const hers = [card(2, 3), card(1, 2), card(1, 3)];
    await set({ hands: [mine, hers], discard: [card(1, 5)], color: 1, draw: [card(3, 8), card(1, 9)], turn: 0, dir: 1, drawn: null });
    assert.equal((await act(a.session, room, 'move', { move: { card: hers[0] } }))[1].error, 'Sıra sende değil.');
    assert.equal((await act(b.session, room, 'move', { move: { draw: true } }))[1].error, 'Bu masada oturmuyorsun');
    assert.deepEqual(await act(owner.session, room, 'move', { move: { card: card(3, 9) } }), [409, { error: 'Bu kart atılamaz.' }]);
    assert.deepEqual(await act(owner.session, room, 'move', { move: { card: hers[0] } }), [409, { error: 'Bu kart sende yok.' }]);
    assert.deepEqual(await act(owner.session, room, 'move', { move: { card: JOKER } }), [409, { error: 'Jokerin rengini seç.' }]);
    assert.deepEqual(await act(owner.session, room, 'move', { move: { pass: true } }), [409, { error: 'Önce kart at ya da çek.' }]);
    let t = await ok(act(owner.session, room, 'move', { move: { card: card(1, 7) } }));
    assert.deepEqual([t.mine, t.top, t.under, t.counts, t.turn, t.log], [[card(0, 5), card(3, 9), JOKER], card(1, 7), [card(1, 5)], [3, 3], 1, 'Oda Sahibi Kızıl 7 attı']);
    assert.deepEqual(t.last, { n: t.n, seat: 0, type: 'play', card: card(1, 7), took: null, skipped: null, turned: false, one: false, mixed: false });
    // Ayşe draws with a card to play in hand: the Kızıl 9 on top of the pile fits, so the turn waits for her.
    t = await ok(act(a.session, room, 'move', { move: { draw: true } }));
    assert.deepEqual([t.drawn, t.turn, t.counts, t.pile, t.mine.length], [card(1, 9), 1, [3, 4], 1, 4]);
    const other = await ok(table(owner.session, room));
    assert.deepEqual([other.drawn, other.turn, other.counts, other.last.type, other.last.took], [null, 1, [3, 4], 'draw', [1, 1]]);
    assert.equal((await act(a.session, room, 'move', { move: { card: card(1, 2) } }))[1].error, 'Yalnız çektiğin kartı atabilirsin.');
    t = await ok(act(a.session, room, 'move', { move: { pass: true } }));
    assert.deepEqual([t.turn, t.drawn, t.counts, t.log], [0, null, [3, 4], 'Ayşe çektiği kartı tuttu']);
    // A Joker with its colour.
    t = await ok(act(owner.session, room, 'move', { move: { card: JOKER, color: 3 } }));
    assert.deepEqual([t.color, t.top, t.turn, t.log], [3, JOKER, 1, 'Oda Sahibi Joker attı: renk Yeşil']);
  });

  test('süre dolunca masa oynar; üç kez üst üste olunca koltuk gider, kartları desteye döner ve el kalana kalır', async () => {
    await set({ hands: [[card(0, 5), card(3, 9)], [card(2, 3), card(1, 2), card(3, 3)]], discard: [card(1, 5), JOKER], color: 3, draw: [card(0, 8), card(0, 9)], turn: 1, dir: 1, drawn: null, misses: [0, 0] });
    await h.sql.query('UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1', [room, TURN_MS / 1000 + 1]);
    let t = await ok(table(b.session, room));
    assert.deepEqual([t.top, t.counts, t.turn, t.log], [card(3, 3), [2, 2], 0, 'Ayşe Yeşil 3 attı']);
    assert.deepEqual((await stored()).misses, [0, 1]);
    await set({ turn: 1, misses: [0, MISSES - 1] });
    await h.sql.query('UPDATE room_tables SET turn_at = now() - make_interval(secs => $2) WHERE room_id = $1', [room, TURN_MS / 1000 + 1]);
    t = await ok(table(owner.session, room));
    assert.deepEqual([t.status, t.winner, t.seats.map((x) => x.name), t.counts, t.mine], ['over', 0, ['Oda Sahibi'], [2], [card(0, 5), card(3, 9)]]);
    assert.match(t.log, /Ayşe masadan kalktı · 🏆 Oda Sahibi kazandı!/);
    assert.deepEqual((await stored()).draw.slice(0, 2), [card(2, 3), card(1, 2)], 'kalkanın kartları destenin altında');
  });

  test('son kart: atan kazanır, el biter; yeniden oynanınca deste baştan karılır', async () => {
    await ok(act(a.session, room, 'join'));
    await ok(act(b.session, room, 'join'));
    let t = await ok(act(owner.session, room, 'again'));
    assert.deepEqual([t.status, t.counts, t.deal, t.seats.length], ['playing', [7, 7, 7], 2, 3]);
    await set({ hands: [[card(1, 'Yön'), card(0, 5)], [card(2, 3)], [card(1, 1), card(2, 2)]], discard: [card(1, 5)], color: 1, turn: 0, dir: 1, drawn: null });
    t = await ok(act(owner.session, room, 'move', { move: { card: card(1, 'Yön') } }));
    assert.deepEqual([t.dir, t.turn, t.last.turned, t.last.one, t.log], [-1, 2, true, true, 'Oda Sahibi Kızıl Yön attı: yön değişti · SON KART!']);
    t = await ok(act(b.session, room, 'move', { move: { card: card(1, 1) } }));
    assert.deepEqual([t.turn, t.last.one], [1, true]);
    assert.equal((await act(a.session, room, 'move', { move: { card: card(2, 3) } }))[1].error, 'Bu kart atılamaz.');
    await set({ color: 2 });
    t = await ok(act(a.session, room, 'move', { move: { card: card(2, 3) } }));
    assert.deepEqual([t.status, t.winner, t.counts, t.turnEndsAt, t.log], ['over', 1, [1, 0, 1], null, '🏆 Ayşe kartlarını bitirdi!']);
    assert.equal((await act(owner.session, room, 'move', { move: { draw: true } }))[1].error, 'Oyun başlamadı.');
    t = await ok(act(b.session, room, 'again'));
    assert.deepEqual([t.status, t.deal, t.counts, t.n, t.last, t.winner, t.dir], ['playing', 3, [7, 7, 7], 0, null, null, 1]);
  });

  test('desteyi havadan dağıtan eski sürümden kalan masa yok sayılır ve yerine yenisi açılır', async () => {
    await h.sql.query('UPDATE room_tables SET state = $2 WHERE room_id = $1', [room, JSON.stringify({ game: 'cards', seats: (await stored()).seats, status: 'playing', turn: 0, winner: null, log: 'A kart attı', misses: [0, 0, 0], hands: [[{ color: 1, value: 4 }], [], []], top: { color: 1, value: 7 } })]);
    assert.equal(await ok(table(owner.session, room)), null);
    assert.deepEqual(await act(owner.session, room, 'move', { move: { draw: true } }), [404, { error: 'Odada açık masa yok' }]);
    const t = await ok(act(owner.session, room, 'open', { game: 'cards' }));
    assert.deepEqual([t.status, t.seats.map((s) => s.name)], ['waiting', ['Oda Sahibi']]);
  });
});
