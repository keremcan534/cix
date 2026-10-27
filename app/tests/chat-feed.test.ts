/// <reference types="node" />
// Chat filters: classification, no duplicates, history kept per kind, filters don't rebuild or delete
// (Canlı Oda şartnamesi §8, §9, §13 "Sohbet filtreleri").
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FEED_CAPS, filterFeed, inTab, kindOf, mergeFeed, type FeedMsg } from '@/lib/chat-feed';

const chat = (id: string, at = 0): FeedMsg => ({ id, userId: 'u1', text: 'selam', at });
const giftMsg = (id: string, at = 0): FeedMsg => ({ id, system: true, text: '🎁', gift: { fromId: 'u1', toIds: ['u2'], emoji: '🌹', name: 'Gül', count: 1 }, at });
const sys = (id: string, at = 0): FeedMsg => ({ id, system: true, text: 'Elif odaya katıldı', at });
const bot = (id: string): FeedMsg => ({ id, bot: true, text: 'ipucu' });

describe('Sınıflandırma', () => {
  test('her olay tek bir türdedir', () => {
    assert.equal(kindOf(chat('a')), 'chat');
    assert.equal(kindOf(giftMsg('b')), 'gift');
    assert.equal(kindOf(sys('c')), 'system');
    assert.equal(kindOf(bot('d')), 'bot');
    assert.equal(kindOf({ id: 'e', text: 'yazarı yok' }), 'system', 'yazarı olmayan mesaj sohbet sayılmaz');
  });

  test('Tümü hepsini, Hediyeler yalnız hediyeleri, Sohbet yalnız sohbet mesajlarını gösterir', () => {
    const list = [chat('1'), giftMsg('2'), sys('3'), bot('4')];
    assert.deepEqual(filterFeed(list, 'all').map((m) => m.id), ['1', '2', '3', '4']);
    assert.deepEqual(filterFeed(list, 'gifts').map((m) => m.id), ['2']);
    assert.deepEqual(filterFeed(list, 'chat').map((m) => m.id), ['1']);
    assert.ok(!inTab(giftMsg('x'), 'chat'));
    assert.ok(!inTab(chat('x'), 'gifts'));
  });

  test('filtre değişimi kaynağı değiştirmez ve aynı nesneleri döndürür', () => {
    const list = [chat('1'), giftMsg('2'), sys('3')];
    const copy = [...list];
    const gifts = filterFeed(list, 'gifts');
    filterFeed(list, 'chat');
    assert.deepEqual(list, copy);
    assert.equal(gifts[0], list[1]);
    assert.equal(filterFeed(list, 'all'), list);
  });
});

describe('Geçmiş ve tekilleştirme', () => {
  test('aynı olay iki kez gelirse bir kez listelenir; yeni bir şey yoksa liste aynı kalır', () => {
    const a = mergeFeed([], [giftMsg('g1'), chat('c1')]);
    const b = mergeFeed(a, [giftMsg('g1')]);
    assert.equal(b, a);
    const c = mergeFeed(a, [chat('c1'), chat('c2'), chat('c2')]);
    assert.deepEqual(c.map((m) => m.id), ['g1', 'c1', 'c2']);
  });

  test('yoğun sohbet hediye geçmişini silmez', () => {
    let list = mergeFeed([], [giftMsg('g-old')]);
    for (let i = 0; i < FEED_CAPS.chat * 3; i++) list = mergeFeed(list, [chat(`c${i}`)]);
    assert.ok(list.some((m) => m.id === 'g-old'));
    assert.equal(filterFeed(list, 'chat').length, FEED_CAPS.chat);
  });

  test('bağlantı dönüşünde tamponlanan olaylar zaman sırasına girer, tekrarlar elenir', () => {
    const shown = mergeFeed([], [chat('c1', 100), chat('c4', 400)]);
    const merged = mergeFeed(shown, [giftMsg('g2', 200), sys('s3', 300), chat('c4', 400)]);
    assert.deepEqual(merged.map((m) => m.id), ['c1', 'g2', 's3', 'c4']);
  });
});
