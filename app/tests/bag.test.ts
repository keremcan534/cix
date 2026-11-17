/// <reference types="node" />
// Çantam (lib/bag-core, GET /api/economy `items`, server/api/economy.mjs): what I own, until when and where it came
// from, read without trusting it; an older server without `source` reads as Çarşı's. The bag's words for where an
// item came from and how long it lasts, and its tabs (rides with the entry effects, as in Çarşı).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BAG_TABS, eventRewardText, parseBag, sourceText, taskItemNames, termText } from '@/lib/bag-core';

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

  test('etkinliğin katılım ödülü: ne kazanılır, bitince kaç kişi kazandı', () => {
    const reward = { sku: 'fr-neon', kind: 'frame', name: 'Neon', days: 3 };
    assert.equal(eventRewardText({ state: 'upcoming', reward }), 'Etkinlik sürerken odaya gelen herkes Neon (3 gün) kazanır; etkinlik bitince Çantam’a gelir.');
    assert.equal(eventRewardText({ state: 'live', reward: { ...reward, days: null } }), 'Etkinlik sürerken odaya gelen herkes Neon (kalıcı) kazanır; etkinlik bitince Çantam’a gelir.');
    assert.equal(eventRewardText({ state: 'ended', reward: { ...reward, given: 1200 } }), '1.200 kişi Neon (3 gün) kazandı; Çantam’a geldi.');
    // Not given yet, given to nobody, taken down, none, malformed (an older server sends none).
    for (const e of [
      { state: 'ended', reward },
      { state: 'ended', reward: { ...reward, given: 0 } },
      { state: 'cancelled', reward },
      { state: 'upcoming', reward: null },
      { state: 'upcoming' },
      { state: 'upcoming', reward: { name: 5 } },
      { state: 'upcoming', reward: 'Neon' },
    ])
      assert.equal(eventRewardText(e), null, JSON.stringify(e));
  });

  test('görevin Çantam eşyaları: adları, bozuk olan atlanır', () => {
    assert.deepEqual(taskItemNames([{ sku: 'bb-candy', name: ' Şeker ' }, { name: 5 }, null, 'x', { name: '' }]), ['Şeker']);
    for (const raw of [undefined, null, {}, 'Şeker']) assert.deepEqual(taskItemNames(raw), []);
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
