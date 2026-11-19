/// <reference types="node" />
// Bond prices from the panel (Yönetim › Hediyeler, server/api/bonds.mjs bondGift): in a live build the Bağlar screen
// shows the bond gift's name and price as the server's catalog says (bag-<kind>), and sends that price with the
// request (lib/live/bonds bondKindNow); without the catalog, or with a malformed price, it keeps the app's own
// (data/bonds).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOND_KINDS } from '@/data/bonds';
import { GIFTS } from '@/data/mock';
import { bondKindOf, parseLiveCatalog } from '@/lib/live/catalog-live';

const base = (id: string) => {
  const g = GIFTS.find((x) => x.id === id)!;
  return { id, name: g.name, emoji: g.emoji, price: g.price, cat: g.cat ?? 'hot', minSvip: 0 };
};
const catalog = (gifts: unknown[]) => parseLiveCatalog({ gifts, giftsFormat: 2, packs: [], fx: [], v: 3 });

describe('Bağ fiyatı panelden', () => {
  test('katalogdaki bağ hediyesinin adı ve fiyatı; sınır ve etiket uygulamanın', () => {
    const c = catalog([{ ...base('bag-kanka'), name: 'Kanka Madalyası', price: 750 }, base('bag-kardes')]);
    assert.deepEqual(bondKindOf('kanka', c), { ...BOND_KINDS.kanka, gift: 'Kanka Madalyası', price: 750 });
    assert.equal(bondKindOf('kardes', c).price, 1000);
  });

  test('katalog yoksa ya da fiyat bozuksa uygulamanın fiyatı', () => {
    assert.deepEqual(bondKindOf('kanka', null), BOND_KINDS.kanka);
    const bad = catalog([{ ...base('bag-kanka'), price: -5 }]);
    assert.equal(bondKindOf('kanka', bad).price, 500);
  });
});
