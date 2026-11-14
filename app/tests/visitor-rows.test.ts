// "Profilimi Kimler Ziyaret Etti" rows (lib/visitor-rows): the server's visitors and the demo's sample ones come out
// in the same shape; blocked people stay out of the demo list; without the Abonelik the visits come blurred, with
// nothing that names the visitor; the notice of a visit names them only with it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { User } from '@/data/mock';
import { demoVisitorRows, hiddenVisitorRows, hideVisitorRows, liveVisitorRows, visitNotice } from '@/lib/visitor-rows';

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

  test('abonelik yoksa: kaç kez ve ne zaman, kim olduğu yok', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const rows = hiddenVisitorRows(
      [
        { visits: 2, lastAt: '2026-11-10T11:48:00Z' },
        { visits: 1, lastAt: '2026-11-09T12:00:00Z' },
      ],
      now,
    );
    assert.deepEqual(rows, [
      { id: 'gizli-0', name: '', visits: 2, when: '12 dk önce', hidden: true },
      { id: 'gizli-1', name: '', visits: 1, when: '1 gün önce', hidden: true },
    ]);
    // The demo drops who made its sample visits the same way.
    const demo = hideVisitorRows([{ id: 'u1', name: 'Ece, 24', avatar: 'e.jpg', online: true, visits: 2, when: '1 sa önce', place: 'İzmir' }]);
    assert.deepEqual(demo, [{ id: 'gizli-0', name: '', visits: 2, when: '1 sa önce', hidden: true }]);
  });

  test('ziyaret bildirimi: abonelikle adıyla ve o kişiye, yoksa "biri" ve bulanık listeye', () => {
    assert.deepEqual(visitNotice({ id: 'abc', name: 'Ayşe' }), { kind: 'social', icon: 'eye', title: 'Profil ziyareti', body: 'Ayşe profiline baktı', href: '/kullanici/abc' });
    const blind = visitNotice(null);
    assert.equal(blind.href, '/(tabs)/profil?ziyaretciler=1');
    assert.match(blind.body, /^Biri profiline baktı/);
  });
});
