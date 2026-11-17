/// <reference types="node" />
// Çantam (lib/bag-core, GET /api/economy `items`, server/api/economy.mjs): what I own, until when and where it came
// from, read without trusting it; an older server without `source` reads as Çarşı's. The bag's words for where an
// item came from and how long it lasts, and its tabs (rides with the entry effects, as in Çarşı).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BAG_TABS, parseBag, sourceText, termText } from '@/lib/bag-core';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-17T12:00:00.000Z');

describe('Çantam', () => {
  test('sunucunun listesi okunur; bozuk eşya atlanır, kaynağı olmayan Çarşı’nındır', () => {
    for (const raw of [undefined, null, 5, {}, { items: 'x' }]) assert.equal(parseBag(raw), null, String(raw));
    const bag = parseBag({
      serverNow: new Date(NOW).toISOString(),
      items: [
        { sku: 'fr-neon', kind: 'frame', until: new Date(NOW + 7 * DAY).toISOString(), source: 'level', origin: '  VIP 5  ' },
        { sku: 'fr-gold', kind: 'frame', until: null, source: 'admin' },
        { sku: 'rd-sport', kind: 'ride', until: new Date(NOW + DAY).toISOString(), source: 'buy' },
        { sku: 'se3', kind: 'entry', until: null },
        { sku: 'en-x', kind: 'entry', until: null, source: 'ödül' },
        { sku: 'BAD', kind: 'frame', until: null },
        { sku: 'fr-neon', kind: 'frame', until: null, source: 'buy' },
        { sku: 'sb1', kind: 'bubble', until: 'yarın' },
        { sku: 'sw1', kind: '', until: null },
      ],
    })!;
    assert.equal(bag.at, NOW);
    assert.deepEqual(
      bag.items.map((x) => [x.sku, x.source, x.origin ?? null, x.until]),
      [
        ['fr-neon', 'level', 'VIP 5', NOW + 7 * DAY],
        ['fr-gold', 'admin', null, null],
        ['rd-sport', 'shop', null, NOW + DAY],
        ['se3', 'shop', null, null],
        ['en-x', 'shop', null, null],
      ],
    );
  });

  test('nereden geldiği ve ne kadar kaldığı', () => {
    assert.equal(sourceText({ source: 'shop' }), 'Çarşı');
    assert.equal(sourceText({ source: 'admin' }), 'Yetkili hediyesi');
    assert.equal(sourceText({ source: 'level', origin: 'VIP 5' }), 'Seviye ödülü · VIP 5');
    assert.equal(sourceText({ source: 'event', origin: 'Yaz Festivali' }), 'Etkinlik ödülü · Yaz Festivali');
    assert.equal(sourceText({ source: 'task' }), 'Görev ödülü');
    assert.equal(termText(null, NOW), 'Kalıcı');
    assert.equal(termText(NOW + 2.5 * DAY, NOW), '3 gün kaldı');
    assert.equal(termText(NOW + 3 * 3_600_000, NOW), 'Bugün bitiyor');
    assert.equal(termText(NOW - 1, NOW), 'Bitti');
  });

  test('sekmeler: binek giriş efektleriyle', () => {
    assert.deepEqual(
      BAG_TABS.map((x) => [x.key, [...x.kinds]]),
      [
        ['frame', ['frame']],
        ['entry', ['entry', 'ride']],
        ['bubble', ['bubble']],
        ['wave', ['wave']],
      ],
    );
  });
});
