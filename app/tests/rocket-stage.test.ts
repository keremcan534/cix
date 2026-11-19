/// <reference types="node" />
// The Oda roketi on the room's stage (lib/rocket-stage, lib/fx-queue; Güncelleme 7, madde 5b): the rocket waits for the
// gift on screen and the gifts already in line, the gifts after it wait for the rocket, and two big effects never play
// at once. The winners' line follows its own launch.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_WAITING, WAIT_MS, addCue, emptyStage, endCue, type Cue, type Stage } from '@/lib/fx-queue';
import type { RocketNews } from '@/lib/live/room-bus';
import { LAUNCH_MS, PAID_MS, ROCKET_GRACE_MS, newsGate, stageRocket, type RocketPlay } from '@/lib/rocket-stage';

type Play = { kind: 'gift'; name: string } | RocketPlay;
let n = 0;
const gift = (name: string, t: number, price = 1_000): Cue<Play> => ({ key: `g${++n}`, from: `u-${name}`, what: name, to: { 'u-host': 1 }, each: 1, price, ms: 5_000, last: t, payload: { kind: 'gift', name } });
const news = (event: 'launch' | 'paid', launch = 7, level = 2): RocketNews => ({ event, level, launch, winners: event === 'paid' ? [{ user: 'u-a', name: 'Ayşe', prize: '750 jeton', paid: true }] : [] });
const rocket = (s: Stage<Play>, x: RocketNews, at: number, held = false) =>
  stageRocket(s, x, { at, held, key: `r${++n}` }, (r) => r, (p) => (p.kind === 'rocket' ? p : null));
const label = (p: Play | undefined) => (!p ? null : p.kind === 'gift' ? p.name : `${p.news.event}${p.paid ? '+paid' : ''}`);
const playing = (s: Stage<Play>) => label(s.now?.payload);
const waiting = (s: Stage<Play>) => s.next.map((c) => label(c.payload));
const finish = (s: Stage<Play>, t: number) => endCue(s, s.now!.key, t);

describe('Roket sahnede sırasını bekler', () => {
  test('ekrandaki hediye ve sıradakiler biter, sonra roket; sonra gelen hediyeler roketi bekler', () => {
    let s = addCue(emptyStage<Play>(), gift('aslan', 0));
    s = addCue(s, gift('tac', 300));
    s = rocket(s, news('launch'), 300 + ROCKET_GRACE_MS);
    s = addCue(s, gift('yuzuk', 2_000));
    assert.equal(playing(s), 'aslan', 'oynayan kesilmez');
    assert.deepEqual(waiting(s), ['tac', 'launch', 'yuzuk']);
    s = finish(s, 5_000);
    assert.equal(playing(s), 'tac');
    s = finish(s, 10_000);
    assert.equal(playing(s), 'launch', 'iki büyük efekt aynı anda oynamaz');
    s = finish(s, 12_600);
    assert.equal(playing(s), 'yuzuk');
  });

  test('roketi dolduran kendi hediyem: gönderimin cevabı paketten sonra gelse de önce o oynar', () => {
    // The server's 'launch' packet comes at 100 ms; my send answers at 800 ms (then my gift is queued); the packet goes
    // on the stage ROCKET_GRACE_MS after it came.
    let s = addCue(emptyStage<Play>(), gift('benim-roketim', 800));
    s = rocket(s, news('launch'), 100 + ROCKET_GRACE_MS);
    assert.equal(playing(s), 'benim-roketim');
    assert.deepEqual(waiting(s), ['launch']);
  });

  test('sahne boşsa hemen kalkar; giriş videosu sahneyi tutarken bekler', () => {
    assert.equal(playing(rocket(emptyStage<Play>(), news('launch'), 0)), 'launch');
    const held = rocket(emptyStage<Play>(), news('launch'), 0, true);
    assert.equal(held.now, null);
    assert.deepEqual(waiting(held), ['launch']);
  });

  test('uzun kuyrukta düşmez: hediyeler kısalır, roket sırasında kalır', () => {
    let s = addCue(emptyStage<Play>(), gift('ilk', 0));
    s = rocket(s, news('launch'), 50);
    for (let i = 0; i < MAX_WAITING + 4; i++) s = addCue(s, gift(`h${i}`, 100 + i, 10 + i));
    assert.ok(waiting(s).includes('launch'), 'roket bekleyenlerden atılmaz');
    assert.equal(waiting(s)[0], 'launch', 'sırası değişmez');
    const gifts = s.next.filter((c) => !c.keep);
    assert.ok(gifts.length > 1 && gifts.length <= MAX_WAITING, 'hediyelerin sınırı yine geçerli');
    assert.ok(gifts.reduce((t, c) => t + c.ms, 0) <= WAIT_MS, 'roket hediyelerin bekleme süresinden yer almaz');
    assert.deepEqual(waiting(s).slice(-2), [`h${MAX_WAITING + 2}`, `h${MAX_WAITING + 3}`], 'düşenler en düşük değerliler');
    // A cheap rocket cue (price 0) is still never the one dropped.
    assert.equal(s.next.find((c) => c.keep)?.price, 0);
  });
});

describe('Kazananlar kendi kalkışının ardından', () => {
  test('ödeme, bekleyen kalkışa katılır: roket, hemen ardından kazananlar', () => {
    let s = addCue(emptyStage<Play>(), gift('aslan', 0));
    s = rocket(s, news('launch'), 100);
    s = addCue(s, gift('tac', 200));
    s = rocket(s, news('paid'), 300);
    assert.deepEqual(waiting(s), ['launch+paid', 'tac'], 'kazananlar ayrı sıraya girmez');
    const cue = s.next[0];
    assert.equal(cue.ms, LAUNCH_MS + PAID_MS);
  });

  test('ödeme, oynayan kalkışa da katılır; anahtarı değişmez (gösteri baştan başlamaz)', () => {
    let s = rocket(emptyStage<Play>(), news('launch'), 0);
    const key = s.now!.key;
    s = rocket(s, news('paid'), 500);
    assert.equal(playing(s), 'launch+paid');
    assert.equal(s.now!.key, key);
  });

  test('kalkışı bitmişse ya da başka kalkışınsa kendi sırasına girer', () => {
    let s = rocket(emptyStage<Play>(), news('launch', 7), 0);
    s = finish(s, LAUNCH_MS);
    s = rocket(s, news('paid', 7), LAUNCH_MS + 10);
    assert.equal(playing(s), 'paid');
    let t = rocket(emptyStage<Play>(), news('launch', 8), 0);
    t = rocket(t, news('paid', 7), 10);
    assert.deepEqual([playing(t), ...waiting(t)], ['launch', 'paid']);
  });

  test('aynı duyuru iki kez gelirse (yeniden bağlanma) bir kez oynar', () => {
    const fresh = newsGate(3);
    assert.equal(fresh(news('launch', 1)), true);
    assert.equal(fresh(news('launch', 1)), false);
    assert.equal(fresh(news('paid', 1)), true, 'aynı kalkışın ödemesi ayrı duyuru');
    for (const l of [2, 3, 4]) fresh(news('launch', l));
    assert.equal(fresh(news('launch', 1)), true, 'eskiler unutulur, liste kısa kalır');
  });
});
