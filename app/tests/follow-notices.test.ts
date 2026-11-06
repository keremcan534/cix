/// <reference types="node" />
// "Yeni takipçi" notices (lib/follow-notices): the first read only sets the mark; later reads tell about the
// followers newer than it, one notice each, or one for many.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SINGLE, followNotices } from '@/lib/follow-notices';

const T = Date.parse('2026-11-06T12:00:00Z');
const f = (id: string, name: string, min: number) => ({ id, name, followedAt: new Date(T + min * 60_000).toISOString() });

describe('Yeni takipçi bildirimi', () => {
  test('ilk okuma eski takipçileri duyurmaz, işareti en yeniye koyar', () => {
    const r = followNotices([f('a', 'Ayşe', 2), f('b', 'Bora', 1)], null);
    assert.deepEqual(r.notices, []);
    assert.equal(r.mark, T + 2 * 60_000);
  });

  test('işaretten yeni olanlar tek tek, eskiden yeniye; işaret ilerler', () => {
    const r = followNotices([f('c', 'Cem', 5), f('b', 'Bora', 4), f('a', 'Ayşe', 1)], T + 60_000, (id) => `x-${id}`);
    assert.deepEqual(r.notices.map((n) => n.body), ['Bora seni takip etmeye başladı', 'Cem seni takip etmeye başladı']);
    assert.equal(r.notices[0].href, '/kullanici/x-b');
    assert.equal(r.mark, T + 5 * 60_000);
  });

  test('yeni kimse yoksa bildirim yok; takibi bırakan işareti geri almaz', () => {
    const r = followNotices([f('a', 'Ayşe', 1)], T + 3 * 60_000);
    assert.deepEqual(r.notices, []);
    assert.equal(r.mark, T + 3 * 60_000);
    assert.equal(followNotices([], T + 3 * 60_000).mark, T + 3 * 60_000);
  });

  test('çok kişi birden gelince tek bildirim', () => {
    const many = Array.from({ length: MAX_SINGLE + 2 }, (_, i) => f(`u${i}`, `Kişi ${i}`, i + 1));
    const r = followNotices(many, T);
    assert.equal(r.notices.length, 1);
    assert.equal(r.notices[0].body, `Kişi ${MAX_SINGLE + 1} ve ${MAX_SINGLE + 1} kişi daha seni takip etmeye başladı`);
  });
});
