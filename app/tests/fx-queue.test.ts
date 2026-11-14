/// <reference types="node" />
// The room's stage (lib/fx-queue): big gift effects play one at a time, in order, each to its end; repeats merge
// into one ×N play, the pieces of one multi-recipient send play once, and the backlog stays short.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BURST_MS, MAX_WAITING, ROOM, SMALL_FRESH_MS, WAIT_MS, addCue, cueCount, cueTo, emptyStage, endCue, resumeCue, type Cue, type Stage } from '@/lib/fx-queue';

let n = 0;
/** A gift cue: `from` sent `count` of `what` to each of `to` at time `t`. */
const gift = (from: string, what: string, to: string[], t: number, more: Partial<Cue<string>> = {}): Cue<string> => {
  const count = more.each ?? 1;
  return { key: `k${++n}`, from, what, to: Object.fromEntries(to.map((u) => [u, count])), each: count, price: 1_000, ms: 5_000, last: t, payload: what, ...more };
};
const add = (s: Stage<string>, ...cues: Cue<string>[]) => cues.reduce((x, c) => addCue(x, c), s);
const playing = (s: Stage<string>) => s.now?.payload ?? null;
const waiting = (s: Stage<string>) => s.next.map((c) => c.payload);

describe('Sahne sırası', () => {
  test('ilk gelen hemen oynar; sonrakiler sırayla bekler, oynayan kesilmez', () => {
    let s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0), gift('b', 'tac', ['h'], 100), gift('c', 'yuzuk', ['h'], 200));
    assert.equal(playing(s), 'roket');
    assert.deepEqual(waiting(s), ['tac', 'yuzuk']);
    s = endCue(s, s.now!.key, 5_000);
    assert.equal(playing(s), 'tac');
    s = endCue(s, s.now!.key, 10_000);
    assert.equal(playing(s), 'yuzuk');
    s = endCue(s, s.now!.key, 15_000);
    assert.equal(s.now, null);
    assert.equal(s.next.length, 0);
  });

  test('eski bir efektin geç gelen "bitti"si yeni oynayanı bitirmez', () => {
    let s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0), gift('b', 'tac', ['h'], 100));
    const first = s.now!.key;
    s = endCue(s, first, 5_000);
    const again = endCue(s, first, 5_100);
    assert.equal(again, s);
    assert.equal(playing(again), 'tac');
  });

  test('kendi gönderimim de aynı sıraya girer', () => {
    const s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0), gift('me', 'tac', ['h'], 100));
    assert.equal(playing(s), 'roket');
    assert.deepEqual(waiting(s), ['tac']);
  });
});

describe('Birleştirme (×N)', () => {
  test('aynı kişinin aynı hediyesi beklerken tek oynatmada toplanır', () => {
    let s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0));
    for (let i = 1; i <= 9; i++) s = add(s, gift('a', 'roket', ['h'], i * 300));
    assert.equal(playing(s), 'roket');
    assert.equal(s.next.length, 1);
    assert.equal(cueCount(s.next[0]), 9, 'çarkla 9 tekrar: sonra bir kez ×9');
  });

  test('aradaki başka bir gönderen sırayı korur: birleşmez', () => {
    const s = add(emptyStage<string>(), gift('x', 'pasta', ['h'], 0), gift('a', 'roket', ['h'], 100), gift('b', 'tac', ['h'], 200), gift('a', 'roket', ['h'], 300));
    assert.deepEqual(waiting(s), ['roket', 'tac', 'roket']);
  });

  test('birden çok kişiye tekrar: kişi başı adet toplanır, şeritte en çok alanınki yazar', () => {
    let s = add(emptyStage<string>(), gift('x', 'pasta', ['h'], 0));
    s = add(s, gift('a', 'roket', ['p', 'q'], 100, { each: 10 }), gift('a', 'roket', ['p', 'q'], 400, { each: 10 }));
    assert.deepEqual(s.next[0].to, { p: 20, q: 20 });
    assert.equal(cueCount(s.next[0]), 20);
  });
});

describe('Birden çok kişiye tek gönderim (sunucu odası: kişi başı bir duyuru)', () => {
  test('arkadan gelen alıcılar oynayan efekte katılır; efekt yeniden başlamaz', () => {
    let s = add(emptyStage<string>(), gift('a', 'roket', ['p'], 0));
    const key = s.now!.key;
    s = add(s, gift('a', 'roket', ['q'], 400), gift('a', 'roket', ['r'], 800));
    assert.equal(s.now!.key, key);
    assert.deepEqual(cueTo(s.now!).sort(), ['p', 'q', 'r']);
    assert.equal(s.next.length, 0, 'aynı gönderim ikinci kez oynamaz');
  });

  test('beklerken gelen parçalar da tek bekleyen efekte toplanır', () => {
    const s = add(emptyStage<string>(), gift('x', 'pasta', ['h'], 0), gift('a', 'roket', ['p'], 100), gift('a', 'roket', ['q'], 500), gift('a', 'roket', ['r'], 900));
    assert.equal(s.next.length, 1);
    assert.deepEqual(cueTo(s.next[0]).sort(), ['p', 'q', 'r']);
  });

  test('aynı kişiye tekrar oynayan efekte katılmaz, ardından ×N oynar', () => {
    const s = add(emptyStage<string>(), gift('a', 'roket', ['p'], 0), gift('a', 'roket', ['p'], 300));
    assert.equal(cueCount(s.now!), 1);
    assert.equal(s.next.length, 1);
  });

  test('geç kalan parça (BURST_MS sonra) ayrı oynar', () => {
    const s = add(emptyStage<string>(), gift('a', 'roket', ['p'], 0), gift('a', 'roket', ['q'], BURST_MS + 1));
    assert.deepEqual(cueTo(s.now!), ['p']);
    assert.equal(s.next.length, 1);
  });

  test('başka adetle gönderilen aynı hediye oynayana katılmaz', () => {
    const s = add(emptyStage<string>(), gift('a', 'roket', ['p'], 0), gift('a', 'roket', ['q'], 300, { each: 10 }));
    assert.deepEqual(cueTo(s.now!), ['p']);
    assert.equal(s.next.length, 1);
  });
});

describe('Uzun kuyruk sınırı', () => {
  test(`en çok ${MAX_WAITING} efekt bekler; fazlasında en düşük değerli (eşitse en eski) düşer`, () => {
    let s = add(emptyStage<string>(), gift('x', 'buyuk', ['h'], 0, { price: 100_000, ms: 1_000 }));
    for (let i = 1; i <= MAX_WAITING; i++) s = add(s, gift(`u${i}`, `g${i}`, ['h'], i, { price: i === 3 || i === 5 ? 10 : 5_000, ms: 1_000 }));
    s = add(s, gift('u9', 'son', ['h'], 99, { price: 5_000, ms: 1_000 }));
    assert.equal(s.next.length, MAX_WAITING);
    assert.ok(!waiting(s).includes('g3'), 'ucuz ve en eski olan düştü');
    assert.ok(waiting(s).includes('g5'), 'ikinci ucuz hâlâ bekliyor');
    assert.equal(playing(s), 'buyuk', 'oynayan hiç düşmez');
  });

  test(`bekleyenlerin toplam süresi ${WAIT_MS / 1000} sn'yi geçmez`, () => {
    let s = add(emptyStage<string>(), gift('x', 'ilk', ['h'], 0, { ms: 5_600 }));
    for (let i = 1; i <= 5; i++) s = add(s, gift(`u${i}`, `g${i}`, ['h'], i, { ms: 5_600, price: 1_000 * i }));
    assert.ok(s.next.reduce((t, c) => t + c.ms, 0) <= WAIT_MS);
    assert.ok(!waiting(s).includes('g1'), 'en ucuzu düştü');
    assert.ok(waiting(s).includes('g5'));
  });

  test('düşük değerli yeni gelen, dolu kuyruğa girmez', () => {
    let s = add(emptyStage<string>(), gift('x', 'ilk', ['h'], 0));
    for (let i = 1; i <= 4; i++) s = add(s, gift(`u${i}`, `g${i}`, ['h'], i, { price: 50_000, ms: WAIT_MS / 4 }));
    s = add(s, gift('z', 'gul', ['h'], 10, { price: 10, ms: 2_500 }));
    assert.ok(!waiting(s).includes('gul'));
    assert.equal(s.next.length, 4, 'bekleyen büyükler yerinde');
  });
});

describe('Küçük efektler (standart hediyenin ortadaki görüntüsü)', () => {
  test('sahne boşken hemen oynar', () => {
    const s = add(emptyStage<string>(), gift('a', 'gul', ['h'], 0, { small: true, ms: 2_500 }));
    assert.equal(playing(s), 'gul');
  });

  test('kısa bir bekleyişten sonra oynar, eskiyince atlanır (uçuşu ve sohbet satırı zaten göründü)', () => {
    let s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0));
    s = add(s, gift('b', 'kalp', ['h'], 1_000, { small: true, ms: 2_500 }), gift('c', 'gul', ['h'], 1_500, { small: true, ms: 2_500 }), gift('d', 'tac', ['h'], 1_600));
    s = endCue(s, s.now!.key, 5_000);
    assert.equal(playing(s), 'kalp', '4 sn bekledi: hâlâ taze');
    s = endCue(s, s.now!.key, 1_500 + SMALL_FRESH_MS + 1);
    assert.equal(playing(s), 'tac', 'gül eskidi ve atlandı; büyük hediye hiç atlanmaz');
  });
});

describe('Sahneyi başka bir şey tutarken (giriş videosu)', () => {
  test('tutulurken hiçbir efekt başlamaz; bırakılınca sıradaki başlar', () => {
    let s = addCue(emptyStage<string>(), gift('a', 'roket', ['h'], 0), true);
    assert.equal(s.now, null);
    assert.deepEqual(waiting(s), ['roket']);
    s = resumeCue(s, 5_000);
    assert.equal(playing(s), 'roket');
  });

  test('tutulurken biten efektin yerine yenisi geçmez', () => {
    let s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0), gift('b', 'tac', ['h'], 100));
    s = endCue(s, s.now!.key, 5_000, true);
    assert.equal(s.now, null);
    assert.deepEqual(waiting(s), ['tac']);
    assert.equal(playing(resumeCue(s, 6_000)), 'tac');
  });
});

describe('Oda efekti (tam ekran Hareketli)', () => {
  const anim = (from: string, t: number): Cue<string> => ({ key: `k${++n}`, from, what: 'an-dragon', to: { [ROOM]: 1 }, each: 1, price: 19_999, ms: 3_400, last: t, payload: 'ejderha' });

  test('hediyelerle aynı sırada bekler; alıcısı olmadığı için oynayana katılmaz', () => {
    const s = add(emptyStage<string>(), gift('a', 'roket', ['h'], 0), anim('b', 100), anim('b', 200));
    assert.equal(playing(s), 'roket');
    assert.equal(s.next.length, 1, 'aynı kişinin iki ejderhası tek bekleyen');
    assert.deepEqual(cueTo(s.next[0]), []);
    const again = add(emptyStage<string>(), anim('b', 0), anim('b', 100));
    assert.equal(again.next.length, 1, 'oynayana katılmaz, ardından bir kez daha oynar');
  });
});
