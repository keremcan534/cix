/// <reference types="node" />
// The Mesajlar tab badge counts the same chats the list shows: a blocked person's unread messages are left out,
// otherwise the badge could never be cleared.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { unreadTotal } from '@/lib/unread';

describe('Mesajlar rozeti', () => {
  const convs = [
    { userId: 'a', unread: 3 },
    { userId: 'b', unread: 2 },
    { userId: 'c', unread: 0 },
  ];

  test('tüm okunmamışları toplar', () => {
    assert.equal(unreadTotal(convs, new Set()), 5);
  });

  test('engellenen kişinin okunmamışlarını saymaz', () => {
    assert.equal(unreadTotal(convs, new Set(['a'])), 2);
    assert.equal(unreadTotal([{ userId: 'a', unread: 3 }], new Set(['a'])), 0);
  });
});
