// The gift sheet's shelves (lib/gift-shelves): Popüler also lists every gift with a video whatever its own shelf, after
// its own gifts, so a video gift of another shelf (Pırlanta Yüzük is İkili) is found where the others are; the order
// of Popüler's own gifts stays as data/mock has it (the new video gifts right after Roket).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '@/data/mock';
import { GIFTS_PAUSED } from '@/data/gifts-paused';
import { shelfGifts } from '@/lib/gift-shelves';

const VIDEO = new Set(['g6', 'h13', 'h14', 'c13', 'h15', 'h16', 'h17', 'h18', 'h19', 'h20', 'h21', 'h22']);
const shown = GIFTS.filter((g) => !GIFTS_PAUSED.has(g.id));

describe('Hediye rafları', () => {
  test('Popüler: kendi hediyeleri data sırasıyla, ardından başka raftaki videolu hediye (Pırlanta Yüzük)', () => {
    const hot = shelfGifts(shown, 'hot', 'default', new Set(), {}, shown, VIDEO);
    const own = shown.filter((g) => (g.cat ?? 'hot') === 'hot').map((g) => g.id);
    assert.deepEqual(hot.slice(0, own.length).map((g) => g.id), own);
    assert.equal(hot[own.length]?.id, 'c13');
    for (const id of VIDEO) assert.ok(hot.some((g) => g.id === id), `${id} Popüler'de`);
  });

  test('İkili rafı yüzüğü yine gösterir; video listesi yokken Popüler yalnız kendi hediyeleri', () => {
    assert.ok(shelfGifts(shown, 'couple', 'default', new Set(), {}, shown, VIDEO).some((g) => g.id === 'c13'));
    assert.ok(!shelfGifts(shown, 'hot', 'default', new Set(), {}).some((g) => g.id === 'c13'));
  });

  test('Fiyat sıralaması yüzüğü de sıraya katar', () => {
    const asc = shelfGifts(shown, 'hot', 'asc', new Set(), {}, shown, VIDEO);
    for (let i = 1; i < asc.length; i++) assert.ok(asc[i - 1].price <= asc[i].price, `${asc[i - 1].id} ${asc[i].id}`);
    assert.ok(asc.some((g) => g.id === 'c13'));
    const desc = shelfGifts(shown, 'hot', 'desc', new Set(), {}, shown, VIDEO);
    for (let i = 1; i < desc.length; i++) assert.ok(desc[i - 1].price >= desc[i].price, `${desc[i - 1].id} ${desc[i].id}`);
  });
});
