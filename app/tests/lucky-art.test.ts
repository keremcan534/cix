/// <reference types="node" />
// Şanslı hediye packages from the server (lib/lucky-art; server/api/lucky.mjs, lucky-art.mjs; Güncelleme 7 madde
// 10): the list is read without trusting it, a package's own icon comes before the app's picture and a room packet
// can set or take it off, my send's result waits for the package's video on the stage, a package clip is downloaded
// under its own name (an older filter refuses it), and the room packet's icon and price are read defensively.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addCue, emptyStage, endCue, type Cue } from '@/lib/fx-queue';
import { fxFileName, parseFxList } from '@/lib/fx-videos-core';
import { parseServerLucky } from '@/lib/live/room-bus';
import { LUCKY_MULTS, ODDS_TOTAL as LUCKY_ODDS_TOTAL } from '@/lib/lucky';
import { LUCKY_ART_MULTS, ODDS_TOTAL, luckyIconOf, luckyShown, luckyVideoPending, noteLuckyIcon, parseLuckyIcon, parseLuckyPackages, setLuckyIcons } from '@/lib/lucky-art';

const ICON = 'https://cdn.example.com/gifticon/u1/yonca.png';
const tiers = [
  { mult: 0, weight: 80_000 },
  { mult: 2, weight: 20_000 },
];
const pkg = (over: Record<string, unknown> = {}) => ({ id: 'lk5', name: 'Altın Yonca', emoji: '🌟', price: 50, enabled: true, tiers, open: true, since: 3, icon: ICON, fx: null, ...over });

describe('Şanslı paketleri sunucudan', () => {
  test('lib/lucky ile aynı oranlar ve çarpanlar', () => {
    assert.equal(ODDS_TOTAL, LUCKY_ODDS_TOTAL);
    assert.deepEqual(LUCKY_ART_MULTS, [...LUCKY_MULTS]);
  });

  test('doğru paket okunur; bozuk olan, ikinci kez gelen ve %100 etmeyen tablo bırakılır; asla patlamaz', () => {
    assert.deepEqual(parseLuckyPackages([pkg()]), [{ id: 'lk5', name: 'Altın Yonca', emoji: '🌟', price: 50, enabled: true, tiers, open: true, icon: ICON }]);
    for (const bad of [null, 'x', 42, {}, { gifts: [] }]) assert.deepEqual(parseLuckyPackages(bad), []);
    const list = parseLuckyPackages([
      pkg(),
      pkg(),
      pkg({ id: 'g1' }),
      pkg({ id: 'lk6', price: 0 }),
      pkg({ id: 'lk7', name: '   ' }),
      pkg({ id: 'lk8', tiers: [{ mult: 2, weight: 10 }] }),
      pkg({ id: 'lk9', tiers: [{ mult: 3, weight: ODDS_TOTAL }] }),
      pkg({ id: 'lka', tiers: [...tiers, { mult: 2, weight: 0 }] }),
      pkg({ id: 'lkb', icon: 'javascript:alert(1)', open: false, emoji: '' }),
      null,
      'lk',
    ]);
    assert.deepEqual(
      list.map((g) => g.id),
      ['lk5', 'lkb'],
    );
    // A malformed icon is none; a missing emoji the clover; `open: false` kept.
    assert.deepEqual([list[1].icon, list[1].emoji, list[1].open], [null, '🍀', false]);
    // An older server: no icon, no open → none, open.
    const old = parseLuckyPackages([{ id: 'lk1', name: 'Şans Yoncası', emoji: '🍀', price: 20, enabled: true, tiers }]);
    assert.deepEqual([old[0].icon, old[0].open], [null, true]);
    // At most 20 (the server's limit).
    assert.equal(parseLuckyPackages(Array.from({ length: 30 }, (_, i) => pkg({ id: `lk${i + 10}` }))).length, 20);
  });

  test('ikon: sunucunun listesi hepsini belirler; oda paketi birini koyar ya da kaldırır, eski sunucunun paketi dokunmaz', () => {
    assert.equal(parseLuckyIcon(ICON), ICON);
    assert.equal(parseLuckyIcon('/relative.png'), null);
    assert.equal(parseLuckyIcon(`https://x.com/${'a'.repeat(700)}`), null);
    setLuckyIcons([{ id: 'lk1', icon: ICON }, { id: 'lk2', icon: null }]);
    assert.equal(luckyIconOf('lk1'), ICON);
    assert.equal(luckyIconOf('lk2'), undefined);
    noteLuckyIcon('lk5', ICON);
    assert.equal(luckyIconOf('lk5'), ICON);
    noteLuckyIcon('lk5', undefined);
    assert.equal(luckyIconOf('lk5'), ICON);
    noteLuckyIcon('lk5', null);
    assert.equal(luckyIconOf('lk5'), undefined);
    noteLuckyIcon('g1', ICON);
    assert.equal(luckyIconOf('g1'), undefined);
    // A new list: what it doesn't name goes.
    setLuckyIcons([]);
    assert.equal(luckyIconOf('lk1'), undefined);
  });
});

describe('gönderim gösterileni taşır', () => {
  test('sayfanın gösterdiği fiyat ve ayar sürümü; bilinmeyen paket ya da bozuk sürümle hiçbiri', () => {
    assert.deepEqual(luckyShown({ price: 50 }, 7), { price: 50, version: 7 });
    // Never read from the server: the app's own packages are version 1, and the server checks against that.
    assert.deepEqual(luckyShown({ price: 20 }, 1), { price: 20, version: 1 });
    assert.equal(luckyShown(undefined, 7), undefined);
    assert.equal(luckyShown({ price: 50 }, 0), undefined);
    assert.equal(luckyShown({ price: 0 }, 3), undefined);
  });
});

describe('benim Şanslı sonucum videodan sonra', () => {
  const cue = (from: string, what: string, last: number, key: string): Cue<string> => ({ key, from, what, to: { b: 1 }, each: 1, price: 100, ms: 5000, last, payload: 'v' });
  test('paketimin videosu oynarken ya da sırada beklerken sonuç kartı bekler; bitince ya da sıradan düşünce gelir', () => {
    let s = emptyStage<string>();
    assert.equal(luckyVideoPending(s, 'lk5'), false);
    s = addCue(s, cue('u1', 'g6', 0, 'a'));
    s = addCue(s, cue('me', 'lk5', 10, 'b'));
    // Behind someone else's gift: waiting counts.
    assert.equal(s.now?.key, 'a');
    assert.equal(luckyVideoPending(s, 'lk5'), true);
    assert.equal(luckyVideoPending(s, 'lk1'), false);
    s = endCue(s, 'a', 6000);
    assert.equal(s.now?.key, 'b');
    assert.equal(luckyVideoPending(s, 'lk5'), true);
    // Someone else's send of the same package doesn't hold my card.
    assert.equal(luckyVideoPending({ now: cue('u2', 'lk5', 0, 'c'), next: [] }, 'lk5'), false);
    s = endCue(s, 'b', 12_000);
    assert.equal(luckyVideoPending(s, 'lk5'), false);
  });
});

describe('Şanslı paketinin videosu ve oda paketi', () => {
  test('l/ adresi okunur ve kendi adıyla saklanır; bozuk adres bırakılır', () => {
    const list = parseFxList([
      { kind: 'gift', id: 'lk5', url: '/api/fx/l/lk5.mp4?v=0123456789ab', bytes: 1000, ms: 4000 },
      { kind: 'gift', id: 'lk6', url: '/api/fx/x/lk6.mp4?v=0123456789ab', bytes: 1000, ms: 4000 },
      { kind: 'gift', id: 'lk7', url: '/api/fx/l/../lk7.mp4?v=0123456789ab', bytes: 1000, ms: 4000 },
    ]);
    assert.deepEqual(list?.map((x) => x.id), ['lk5']);
    assert.equal(fxFileName(list![0]), 'l-lk5-0123456789ab.mp4');
  });

  test('odanın Şanslı paketi ikonu ve fiyatı taşır; bozuk olanı yok sayılır; eski sunucunun paketi eskisi gibi', () => {
    const base = { type: 'lucky', giftId: 'lk5', name: 'Altın Yonca', emoji: '🌟', count: 1, from: 'u-a', to: ['u-b'], eventIds: [9], best: 2, bigWin: 0 };
    const msg = (raw: Record<string, unknown>) => parseServerLucky(raw)?.msg;
    assert.deepEqual([msg({ ...base, icon: ICON, price: 50 })?.icon, msg({ ...base, icon: ICON, price: 50 })?.price], [ICON, 50]);
    assert.equal(msg({ ...base, icon: null })?.icon, null);
    assert.equal(msg({ ...base, icon: '<script>' })?.icon, null);
    const old = msg(base)!;
    assert.ok(!('icon' in old) && !('price' in old));
    assert.equal(msg({ ...base, price: -5 })?.price, undefined);
    assert.equal(msg({ ...base, price: 'çok' })?.price, undefined);
  });
});
