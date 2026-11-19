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

describe('Bağlar ve Koruma sayıları panelden (Canlı ayarlar)', () => {
  test('bağ sınırı, cevap süresi ve kurallar yazısı katalogdan; bozuk değer uygulamanın', async () => {
    const { bondRulesText } = await import('@/data/bonds');
    const c = parseLiveCatalog({ gifts: [], bonds: { answerDays: 5, cooldownDays: 0, talkDaily: 0, max: { kanka: 2, kardes: 'çok', xyz: 4 } } });
    assert.deepEqual(c.bonds, { answerDays: 5, cooldownDays: 0, talkDaily: 0, max: { kanka: 2 } });
    assert.equal(bondKindOf('kanka', c).max, 2);
    assert.equal(bondKindOf('kardes', c).max, 3);
    const text = bondRulesText(c.bonds!).join(' ');
    assert.match(text, /5 gün içinde/);
    assert.match(text, /hemen yeniden/);
    assert.doesNotMatch(text, /mesajlaşma/);
    assert.equal(parseLiveCatalog({ gifts: [], bonds: { answerDays: 0, cooldownDays: 1, talkDaily: 1 } }).bonds, null);
  });

  test('Koruma kuralları sayfası sunucunun sayılarını söyler', async () => {
    const { guardRulesText } = await import('@/lib/guard-core');
    const c = parseLiveCatalog({ gifts: [], guard: { dropFrom: 10_000, dropShare: 0.25, dropFlat: 300, listMax: 50, thresholdPerLevel: 1000, thresholdEveryDays: 2 } });
    const text = guardRulesText(c.guard!).flatMap((s) => s.lines).join(' ');
    assert.match(text, /10\.000 puan ve üstünde puanın %25’u düşer; 10\.000’in altında 300 puan düşer/);
    assert.match(text, /Eşik 2 günde bir değişir/);
    assert.equal(parseLiveCatalog({ gifts: [], guard: { dropFrom: 1, dropShare: 2, dropFlat: 1, thresholdEveryDays: 7 } }).guard, null);
  });
});

describe('Aile temaları panelden', () => {
  test('tema seviyeleri katalogdan; bozuk olan atlanır', async () => {
    const { parseFamilyThemes } = await import('@/lib/live/catalog-live');
    assert.deepEqual(parseLiveCatalog({ gifts: [], family: { themes: { gece: 5, ates: 0, 'x y': 3 } } }).familyThemes, { gece: 5 });
    assert.equal(parseLiveCatalog({ gifts: [] }).familyThemes, null);
    assert.equal(parseFamilyThemes(null), null);
  });
});
