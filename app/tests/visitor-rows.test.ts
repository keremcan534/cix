// "Profilimi Kimler Ziyaret Etti" rows (lib/visitor-rows): the server's visitors and the demo's sample ones come out
// in the same shape; blocked people stay out of the demo list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { User } from '@/data/mock';
import { demoVisitorRows, liveVisitorRows } from '@/lib/visitor-rows';

describe('Profil ziyaretçileri', () => {
  test('sunucudan gelenler: ad, kaç kez, ne zaman', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const rows = liveVisitorRows(
      [
        { id: 'a', name: 'Ayşe', avatarUrl: 'https://x/a.jpg', visits: 3, lastAt: '2026-11-10T11:48:00Z' },
        { id: 'b', name: 'Can', avatarUrl: null, visits: 1, lastAt: '2026-11-08T12:00:00Z' },
      ],
      now,
    );
    assert.deepEqual(rows, [
      { id: 'a', name: 'Ayşe', avatar: 'https://x/a.jpg', visits: 3, when: '12 dk önce' },
      { id: 'b', name: 'Can', visits: 1, when: '2 gün önce' },
    ]);
  });

  test('demo: engellenen kişi listede yok, yaş ve şehir yazılır', () => {
    const people: Record<string, User> = {
      u1: { id: 'u1', name: 'Ece', age: 24, city: 'İzmir', avatar: 'e.jpg', online: true } as User,
      u2: { id: 'u2', name: 'Mert', age: 0, city: '', avatar: '', online: false } as User,
    };
    const rows = demoVisitorRows(
      [
        { id: 'v1', userId: 'u1', count: 2, time: '1 sa önce' },
        { id: 'v2', userId: 'u2', count: 1, time: 'Dün' },
      ],
      new Set(['u2']),
      (id) => people[id],
    );
    assert.deepEqual(rows, [{ id: 'u1', name: 'Ece, 24', avatar: 'e.jpg', online: true, visits: 2, when: '1 sa önce', place: 'İzmir' }]);
  });
});
