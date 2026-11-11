// Takip ettiklerim, Takipçilerim and Arkadaşlar (lib/follow-ties): my follows as three separate lists, and the
// profile's numbers counted the same way, so each number is its list.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { splitTies, tieCounts, tieSideOf, tiesOf } from '@/lib/follow-ties';

const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe('Takip listeleri ayrı', () => {
  test('karşılıklı takipleşen yalnız Arkadaşlar’da; tek yönlüler kendi listesinde', () => {
    const following = new Set(['ali', 'can', 'ece', 'me']);
    const followers = new Set(['can', 'deniz', 'ece', 'fatma']);
    const lists = splitTies(tiesOf(following, followers, new Set()));
    assert.deepEqual(ids(lists.following), ['ali']);
    assert.deepEqual(ids(lists.followers), ['deniz', 'fatma']);
    assert.deepEqual(ids(lists.friends), ['can', 'ece']);
    const all = [...lists.following, ...lists.followers, ...lists.friends].map((t) => t.id);
    assert.equal(new Set(all).size, all.length, 'kimse iki listede birden yok');
    assert.ok(!all.includes('me'), 'ben yokum');
  });

  test('engellediğim kimse hiçbir listede yok; sıra korunur', () => {
    const lists = splitTies(tiesOf(['b', 'x', 'a'], ['x', 'c'], new Set(['x'])));
    assert.deepEqual(ids(lists.following), ['b', 'a']);
    assert.deepEqual(ids(lists.followers), ['c']);
    assert.deepEqual(lists.friends, []);
  });

  test('sunucunun satırları (GET /api/me/friends) da aynı ayrılır', () => {
    const rows = [
      { id: 's1', name: 'Bir', iFollow: true, followsMe: true },
      { id: 's2', name: 'İki', iFollow: true, followsMe: false },
      { id: 's3', name: 'Üç', iFollow: false, followsMe: true },
      { id: 's4', name: 'Dört', iFollow: false, followsMe: false },
    ];
    const lists = splitTies(rows);
    assert.deepEqual([ids(lists.friends), ids(lists.following), ids(lists.followers)], [['s1'], ['s2'], ['s3']]);
    assert.equal(lists.friends[0].name, 'Bir', 'satırın kendisi kalır');
    assert.equal(tieSideOf(false, false), null);
  });
});

describe('Profildeki sayılar listelerle aynı', () => {
  test('Takipçi ve Takip tek yönlü, Arkadaş karşılıklı', () => {
    assert.deepEqual(tieCounts({ followers: 7, following: 5, friends: 3, oneWay: { followers: 4, following: 2 } }), { followers: 4, following: 2, friends: 3 });
  });

  test('eski sunucu: toplamlardan arkadaşlar düşülür; arkadaş sayısı da yoksa toplamlar kalır', () => {
    assert.deepEqual(tieCounts({ followers: 7, following: 5, friends: 3 }), { followers: 4, following: 2, friends: 3 });
    assert.deepEqual(tieCounts({ followers: 7, following: 5 }), { followers: 7, following: 5, friends: null });
    assert.deepEqual(tieCounts({ followers: 1, following: 0, friends: 2 }), { followers: 0, following: 0, friends: 2 }, 'eksiye düşmez');
  });

  test('her sayı kendi listesinin uzunluğu', () => {
    const following = ['a', 'b', 'c', 'd'];
    const followers = ['c', 'd', 'e'];
    const lists = splitTies(tiesOf(following, followers, new Set()));
    const friends = following.filter((id) => followers.includes(id)).length;
    const shown = [
      tieCounts({ followers: followers.length, following: following.length, friends }),
      tieCounts({ followers: followers.length, following: following.length, friends, oneWay: { followers: 1, following: 2 } }),
    ];
    for (const n of shown) assert.deepEqual(n, { followers: lists.followers.length, following: lists.following.length, friends: lists.friends.length });
  });
});
