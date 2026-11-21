/// <reference types="node" />
// Şanslı hediyeler in the room (Güncelleme 8): every gift shows in the middle first and flies to all its recipients at
// once; a Şanslı send writes no chat line but one strip once it is over; "Bu sefer ödül çıkmadı" is gone (the card
// only for a win); "Şanslı hediyeleri göster" off leaves only the strip.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    for (const f of ['showGift', 'showLuckyFrom', 'showLuckySend']) assert.match(body(f), /flyGift\([^)]*giftMiddle\(\)[^)]*GIFT_HOLD_MS\)/, f);
    assert.match(body('flyGift'), /delay: hold \? 0 : i \* 90/);
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
    assert.match(mine, /if \(settings\.luckyFx\) flyGift\(/);
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
