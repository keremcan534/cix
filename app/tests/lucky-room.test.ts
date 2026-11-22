/// <reference types="node" />
// Şanslı hediyeler in the room (Güncelleme 8): every gift shows in the middle first and flies to all its recipients at
// once (a Şanslı one streams its copies out, the owners' sample videos); a Şanslı send writes no chat line but counts
// on its strip from its first gift; "Bu sefer ödül çıkmadı" is gone (the card
// only for a win); "Şanslı hediyeleri göster" off leaves only the strip.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BIG_MULT, rollMs, tierOf } from '@/lib/lucky-strip';
import { parsePlans } from '@/lib/shop-live-core';

const src = (p: string) => readFileSync(resolve(import.meta.dirname, '../src', p), 'utf8');
const room = src('components/room/live-room.tsx');
const body = (name: string) => {
  const i = room.indexOf(`const ${name} = (`);
  assert.ok(i > 0, name);
  return room.slice(i, room.indexOf('\n  };\n', i));
};

describe('Şanslı hediyeler odada', () => {
  test('hediyeler ortadan çıkar, hepsi aynı anda gider', () => {
    assert.match(body('showGift'), /flyGift\([^)]*giftMiddle\(\)[^)]*GIFT_HOLD_MS\)/);
    assert.match(body('flyGift'), /delay: hold \? 0 : i \* 90/);
    // Şanslı (the owners' sample videos, 22 Nov 2026): from the middle too, no show there; copies stream out and perch.
    for (const f of ['showLuckyFrom', 'showLuckySend']) {
      assert.match(body(f), /flyLucky\(/, f);
      assert.doesNotMatch(body(f), /flyGift\(/, f);
    }
    const fly = body('flyLucky');
    assert.match(fly, /const from = giftMiddle\(\);/);
    assert.match(fly, /perch: c === copies - 1/);
    assert.doesNotMatch(fly, /setBursts|hold/);
  });
  test('şerit ilk hediyede çıkar, her hediyeyi sayar, gönderim bitince gider', () => {
    const strip = body('luckyStrip');
    // No waiting before it shows; the same person, gift and recipients add to one strip.
    assert.doesNotMatch(strip, /1200/);
    assert.match(strip, /const total = \(was\?\.count \?\? 0\) \+ count;/);
    assert.match(strip, /rollMs\(count\) \+ STRIP_HOLD_MS/);
    // Mine counts what each recipient got, as another phone's packet does.
    assert.match(body('showLuckySend'), /luckyStrip\('me', sentTo, first\.giftId, first\.emoji, Math\.max\(\.\.\.each\.values\(\)\)/);
    // Only Şanslı gifts have a strip; a plain gift keeps its chat line.
    assert.doesNotMatch(body('showGift'), /luckyStrip/);
  });
  test('sayaç hızı ve renkler', () => {
    assert.equal(rollMs(1), 0);
    assert.ok(rollMs(10) > 500 && rollMs(10) < 1000);
    assert.ok(rollMs(100) < rollMs(250));
    assert.equal(rollMs(5000), 2600);
    assert.notDeepEqual(tierOf(1, false).colors, tierOf(10, false).colors);
    assert.notDeepEqual(tierOf(49, false).colors, tierOf(50, false).colors);
    assert.deepEqual(tierOf(3, true), tierOf(999, true));
    assert.ok(BIG_MULT > 1);
  });
  test('şanslı gönderim sohbete yazı yazmaz; şerit gelir', () => {
    for (const f of ['showLuckyFrom', 'showLuckySend']) {
      assert.doesNotMatch(body(f), /\(Şanslı\) gönderdi|Şanslı hediyeden ×/, f);
      assert.match(body(f), /luckyStrip\(/, f);
    }
  });
  test('kazanç kartı yok, kazanç üstte kısa şeritle; ayar kapalıyken hediyenin kendisi görünmez', () => {
    const mine = body('showLuckySend');
    // No result card at all (21 Nov 2026): the win's short banner at the top says it.
    assert.doesNotMatch(room, /LuckyResult|setLuckyFx/);
    assert.match(room, /<WinBanner top=\{insets\.top \+ 50\}/);
    assert.match(mine, /if \(settings\.luckyFx\) flyLucky\(/);
    assert.match(body('showLuckyFrom'), /if \(settings\.luckyFx\) \{/);
    assert.match(src('store.tsx'), /luckyFx: true,/);
    assert.match(src('components/room/community.tsx'), /k="luckyFx"[^/]*Şanslı hediyeleri göster/);
  });
});

// Çarşı süre paketleri (Güncelleme 8, madde 6; lib/shop-live-core parsePlans): the catalog's other durations, read
// defensively.
describe('Çarşı süre paketleri', () => {
  test('geçerli paketler günlerine göre; bozuk, tekrar ve ana süre dışarıda; en çok 3', () => {
    assert.deepEqual(
      parsePlans([{ days: 30, price: 900 }, { days: 7, price: 300 }, { days: 7, price: 1 }, { days: 15, price: 0 }, { days: 'x', price: 5 }], 15),
      [
        { days: 7, price: 300 },
        { days: 30, price: 900 },
      ],
    );
    assert.equal(parsePlans([{ days: 3, price: 1 }, { days: 4, price: 1 }, { days: 5, price: 1 }, { days: 6, price: 1 }], 30).length, 3);
  });
  test('Çarşı seçilen sürenin fiyatıyla alır', () => {
    const shop = src('app/magaza.tsx');
    assert.match(shop, /buyCosmetic\(c\.id, o\.days \?\? undefined\)/);
    assert.match(src('store.tsx'), /const item = plan \? \{ \.\.\.listed, price: plan\.price, days: plan\.days \} : listed;/);
  });
});

// Şanslı rafında olasılık tablosu (owners, 22 Nov 2026): it no longer shows under the gifts; it opens on a tap, from
// "Olasılıklar" over it or under the send button (store rules want the odds before the purchase).
describe('Şanslı olasılık tablosu', () => {
  const sheet = src('components/room/gift-sheet.tsx');
  test('kendiliğinden açık değil; dokununca açılır', () => {
    assert.match(sheet, /useState<'odds' \| 'history' \| null>\(null\)/);
    assert.match(sheet, /onView=\{\(v\) => setLuckyView\(\(cur\) => \(cur === v \? null : v\)\)\}/);
  });
  test('gönder düğmesinin altındaki "Olasılıklar" bağlantısı duruyor', () => {
    assert.match(sheet, /<Pressable onPress=\{showOdds\}[^>]*accessibilityLabel=\{`\$\{footer\.text\}\. Olasılık tablosunu göster`\}/);
    assert.match(sheet, /setLuckyView\('odds'\);/);
  });
});
