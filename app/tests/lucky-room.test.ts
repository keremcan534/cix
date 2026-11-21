/// <reference types="node" />
// Şanslı hediyeler in the room (Güncelleme 8): every gift shows in the middle first and flies to all its recipients at
// once; a Şanslı send writes no chat line but one strip once it is over; "Bu sefer ödül çıkmadı" is gone (the card
// only for a win); "Şanslı hediyeleri göster" off leaves only the strip.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  test('ödül çıkmayınca kart yok; ayar kapalıyken hediyenin kendisi görünmez', () => {
    const mine = body('showLuckySend');
    assert.match(mine, /if \(reward > 0\) setLuckyFx\(/);
    assert.match(mine, /if \(settings\.luckyFx\) flyGift\(/);
    assert.match(body('showLuckyFrom'), /if \(settings\.luckyFx\) \{/);
    assert.match(src('store.tsx'), /luckyFx: true,/);
    assert.match(src('components/room/community.tsx'), /k="luckyFx"[^/]*Şanslı hediyeleri göster/);
  });
});
