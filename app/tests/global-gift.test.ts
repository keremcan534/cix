/// <reference types="node" />
// Global hediye on the phone (lib/global-gift-core, lib/tr-dative, lib/live/global-gift, server/api/global-gifts.mjs):
// the dative after a name ("Artemis’e", or "Artemis kişisine" when its ending can't be told), the line event read
// defensively (a hidden name is "Bir kullanıcı", anything malformed is left out), the sentence and the chat line, the
// catalog's global marks, and each announcement once in the banner line.
import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getWinNews, shiftWinNews } from '@/lib/broadcast';
import { globalChatLine, globalGiftBlocked, globalGiftOfLine, globalGiftText, parseGlobalIds, parseSoonIds, type GlobalGift } from '@/lib/global-gift-core';
import { isGlobalGift, isSoonGift, parseLiveCatalog, parseSavedLiveCatalog } from '@/lib/live/catalog-live';
import { onGlobalGift, takeGlobalGiftEvent } from '@/lib/live/global-gift';
import type { LineEvent } from '@/lib/live/line-events';
import { dativeOf, toPerson } from '@/lib/tr-dative';

const KAAN = '11111111-1111-4111-8111-111111111111';
const ARTEMIS = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';
const event = (over: Record<string, unknown> = {}) => ({
  type: 'global_gift',
  id: 41,
  from: { id: KAAN, name: 'Kaan', avatar: 'https://api.test/api/media/f/avatar/k.jpg' },
  to: { id: ARTEMIS, name: 'Artemis' },
  gift: { id: 'g6', name: 'Roket', emoji: '🚀', icon: null },
  count: 1,
  room: { id: ROOM, title: 'Gece Sohbeti', locked: false },
  ...over,
});

describe('İsimden sonra -e hâli', () => {
  test('kesme işareti, ünlü uyumu, kaynaştırma y', () => {
    const cases: [string, string][] = [
      ['Artemis', 'Artemis’e'],
      ['Ayşe', 'Ayşe’ye'],
      ['Ali', 'Ali’ye'],
      ['Bora', 'Bora’ya'],
      ['Umut', 'Umut’a'],
      ['Kaan', 'Kaan’a'],
      ['Işıl', 'Işıl’a'],
      ['İlker', 'İlker’e'],
      ['Ömer', 'Ömer’e'],
      ['Doğa', 'Doğa’ya'],
      ['Su', 'Su’ya'],
      ['Gül', 'Gül’e'],
      ['Ayşe Nur', 'Ayşe Nur’a'],
      ['  Mehmet   Ali ', 'Mehmet Ali’ye'],
      ['Kemal', 'Kemal’e'],
      ['Hilal', 'Hilal’e'],
      ['KAAN', 'KAAN’A'],
      ['AYŞE', 'AYŞE’YE'],
    ];
    for (const [name, want] of cases) assert.equal(dativeOf(name), want, name);
  });
  test('sonu okunamayan ad tahmin edilmez: "… kişisine"', () => {
    for (const name of ['Kaan34', 'Artemis 🌸', 'X', 'Jack', 'Hugh', 'Jenny', 'Max', 'Mr.', 'Krkt', '', '   ', '@ali']) assert.equal(dativeOf(name), null, name);
    assert.equal(toPerson('Artemis 🌸'), 'Artemis 🌸 kişisine');
    assert.equal(toPerson('Kaan34'), 'Kaan34 kişisine');
    assert.equal(toPerson('Bora'), 'Bora’ya');
  });
});

describe('Global hediye olayı', () => {
  test('tam olay okunur; cümle ve sohbet satırı', () => {
    const g = globalGiftOfLine(event());
    assert.deepEqual(g, {
      id: 41,
      from: { id: KAAN, name: 'Kaan', avatar: 'https://api.test/api/media/f/avatar/k.jpg' },
      to: { id: ARTEMIS, name: 'Artemis' },
      gift: { id: 'g6', name: 'Roket', emoji: '🚀' },
      count: 1,
      room: { id: ROOM, title: 'Gece Sohbeti', locked: false },
    });
    assert.equal(globalGiftText(g!), 'Kaan → Artemis’e 🚀 Roket gönderdi');
    assert.equal(globalChatLine(g!), '🌍 Kaan → Artemis’e 🚀 Roket gönderdi · Gece Sohbeti odasında');
    const three = globalGiftOfLine(event({ count: 3, to: { id: ARTEMIS, name: 'Ayşe' }, room: null }))!;
    assert.equal(globalChatLine(three), '🌍 Kaan → Ayşe’ye 🚀 Roket ×3 gönderdi');
    const odd = globalGiftOfLine(event({ to: { id: ARTEMIS, name: 'Kaan34' } }))!;
    assert.equal(globalGiftText(odd), 'Kaan → Kaan34 kişisine 🚀 Roket gönderdi');
  });
  test('adını gizleyen "Bir kullanıcı": kimliği ve fotoğrafı yok', () => {
    const g = globalGiftOfLine(event({ from: { id: null, name: null, avatar: null }, to: { id: null, name: null } }))!;
    assert.deepEqual([g.from, g.to], [
      { id: null, name: 'Bir kullanıcı' },
      { id: null, name: 'Bir kullanıcı' },
    ]);
    assert.equal(globalGiftText(g), 'Bir kullanıcı → bir kullanıcıya 🚀 Roket gönderdi');
    // A name without its id is taken as hidden too.
    assert.equal(globalGiftOfLine(event({ from: { name: 'Kaan' } }))!.from.name, 'Bir kullanıcı');
  });
  test('bozuk olay atlanır, eksik parçalar güvenli değere düşer', () => {
    for (const bad of [
      event({ type: 'win' }),
      event({ id: 0 }),
      event({ id: '41' }),
      event({ count: 0 }),
      event({ count: 1.5 }),
      event({ gift: { id: 'g 6', name: 'Roket' } }),
      event({ gift: { id: 'g6' } }),
      event({ gift: null }),
      null,
      'global_gift',
    ])
      assert.equal(globalGiftOfLine(bad), null, JSON.stringify(bad));
    const g = globalGiftOfLine(
      event({
        from: { id: KAAN, name: 'Kaan', avatar: 'http://depo.test/a.jpg' },
        gift: { id: 'a12', name: 'Altın Gökkuşağı', icon: 'https://api.test/api/media/f/gifticon/a.png' },
        room: { id: 'oda-1', title: 'Gece' },
      }),
    )!;
    assert.equal(g.from.avatar, undefined, 'https olmayan fotoğraf gösterilmez');
    assert.deepEqual(g.gift, { id: 'a12', name: 'Altın Gökkuşağı', emoji: '🎁', icon: 'https://api.test/api/media/f/gifticon/a.png' });
    assert.equal(g.room, null, 'sunucu odası olmayan oda');
    assert.equal(globalGiftOfLine(event({ room: { id: ROOM, title: 'Kilitli', locked: true } }))!.room?.locked, true);
  });
  test('engellediğim biri varsa gösterilmez', () => {
    const g = globalGiftOfLine(event())!;
    assert.equal(globalGiftBlocked(g, new Set([ARTEMIS])), true);
    assert.equal(globalGiftBlocked(g, new Set(['başka'])), false);
    const hidden: GlobalGift = { ...g, to: { id: null, name: 'Bir kullanıcı' } };
    assert.equal(globalGiftBlocked(hidden, new Set([ARTEMIS])), false, 'gizli adın kimliği yok');
  });
});

describe('Katalogdaki global işaretleri', () => {
  test('global: true olanlar, sırasıyla; bozuk olan ve eski sunucu: yok', () => {
    const gifts = [
      { id: 'c6', name: 'Yıldız Faytonu', price: 699_999, cat: 'couple', global: true },
      { id: 'g6', name: 'Roket', price: 1999, cat: 'hot' },
      { id: 'a5', name: 'Altın', price: 500_000, cat: 'hot', global: 'evet' },
      { id: 'c6', global: true },
      { id: 'x y', global: true },
      { id: 'v12', name: 'Atlıkarınca', price: 699_999, cat: 'privilege', global: true },
    ];
    assert.deepEqual(parseGlobalIds(gifts), ['c6', 'v12']);
    assert.deepEqual(parseGlobalIds(null), []);
    const c = parseLiveCatalog({ gifts, giftsFormat: 2 });
    assert.deepEqual(c.global, ['c6', 'v12']);
    assert.equal(isGlobalGift('c6', c), true);
    assert.equal(isGlobalGift('g6', c), false);
    // Kept on the phone and read back; an older server's catalog has none.
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 1 }));
    assert.deepEqual(back?.catalog.global, ['c6', 'v12']);
    const old = parseLiveCatalog({ gifts: gifts.map(({ global: _, ...g }) => g) });
    assert.equal('global' in old, false);
    assert.equal(isGlobalGift('c6', old), false);
    assert.equal(isGlobalGift('c6', null), false);
  });
});

describe('Anlık hattan gelen global hediye', () => {
  beforeEach(() => getWinNews().forEach((n) => shiftWinNews(n.id)));
  test('bir kez bant sırasına girer, odanın sohbetine haber verilir; başka olay dokunulmaz', () => {
    const heard: number[] = [];
    const off = onGlobalGift((g) => heard.push(g.id));
    const e = event({ id: 501 }) as unknown as LineEvent;
    assert.equal(takeGlobalGiftEvent(e), true);
    assert.equal(takeGlobalGiftEvent(e), true, 'aynı olay yine onun, ama ikinci kez gösterilmez');
    assert.equal(takeGlobalGiftEvent({ type: 'global_gift', id: 'bozuk' } as LineEvent), true);
    assert.equal(takeGlobalGiftEvent({ type: 'win', id: 7 } as LineEvent), false);
    off();
    assert.deepEqual(heard, [501]);
    const q = getWinNews();
    assert.equal(q.length, 1);
    assert.equal(q[0].global?.id, 501);
    assert.equal(q[0].userName, 'Kaan');
  });
});

// Yakında (owners, 22 Nov 2026): the catalog's soon: true gifts, greyed on their shelf with the word and never sent.
describe('Yakında hediyeler', () => {
  test('katalogdan okunur, telefonda saklanır; bozuk olan atlanır', () => {
    const gifts = [
      { id: 'bag-kanka', name: 'Kanka Kilidi', price: 500, cat: 'family', soon: true },
      { id: 'koruma', name: 'Koruma Kartı', price: 999, cat: 'family' },
      { id: 'bag-cift', name: 'Kalbim Seninle', price: 5000, cat: 'couple' },
      { id: 'bag-abla', soon: 'evet' },
    ];
    assert.deepEqual(parseSoonIds(gifts), ['bag-kanka']);
    const c = parseLiveCatalog({ gifts, giftsFormat: 2 });
    assert.equal(isSoonGift('bag-kanka', c), true);
    assert.equal(isSoonGift('koruma', c), false);
    assert.deepEqual(parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 1 }))?.catalog.soon, ['bag-kanka']);
    assert.equal('soon' in parseLiveCatalog({ gifts: [] }), false);
  });
  test('hediye paneli Yakında hediyeyi seçtirmez; katalog ?soon=1 ister; bağ türü de istenmez', () => {
    const src = (p: string) => readFileSync(resolve(import.meta.dirname, '../src', p), 'utf8');
    const sheet = src('components/room/gift-sheet.tsx');
    assert.match(sheet, /if \(shelf !== 'bag' && isSoonGift\(it\.id, catalog\)\) return showAlert\('Yakında'/);
    assert.match(sheet, /<Text style=\{g\.soonText\}>Yakında<\/Text>/);
    assert.match(src('lib/live/catalog-live.ts'), /&soon=1`/);
    assert.match(src('components/bonds.tsx'), /if \(soonKind\(kind\)\) return showAlert\('Yakında'/);
  });
});
