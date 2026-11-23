// Jeton Yükle's dress (lib/coin-shop-look): rims grow with the packs, prices are read as the store writes them, and
// "EN AVANTAJLI" goes only to the pack that really gives the most coins per lira.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { RECHARGE_PACKS } from '@/data/status';
import { bestValue, bonusPct, packRim, parsePrice } from '@/lib/coin-shop-look';

describe('Jeton Yükle görünümü', () => {
  test('çerçeve paket büyüdükçe bronzdan altına, altından kraliyete geçer', () => {
    assert.deepEqual(
      Array.from({ length: 9 }, (_, i) => packRim(i, 9)),
      ['bronze', 'bronze', 'bronze', 'gold', 'gold', 'gold', 'royal', 'royal', 'royal'],
    );
    assert.equal(packRim(0, 1), 'gold');
  });

  test('fiyat mağazanın yazdığı gibi okunur', () => {
    assert.equal(parsePrice('29,99 TL'), 29.99);
    assert.equal(parsePrice('₺1.279,99'), 1279.99);
    assert.equal(parsePrice('TRY 23.599,99'), 23599.99);
    assert.equal(parsePrice('$4.99'), 4.99);
    assert.equal(parsePrice('1.000 TL'), 1000);
    assert.equal(parsePrice('Ücretsiz'), null);
  });

  test('en avantajlı rozeti yalnız gerçekten öndeki pakete gider', () => {
    const packs = RECHARGE_PACKS.map((p) => ({ key: p.id, coins: p.coins, price: p.price }));
    const best = bestValue(packs);
    const rate = (p: (typeof packs)[number]) => p.coins / parsePrice(p.price)!;
    if (best) assert.equal(rate(packs.find((p) => p.key === best)!), Math.max(...packs.map(rate)));
    assert.equal(bestValue([{ key: 'a', coins: 100, price: '10 TL' }, { key: 'b', coins: 100, price: '10 TL' }]), null);
    assert.equal(bestValue([{ key: 'a', coins: 100, price: 'Ücretsiz' }, { key: 'b', coins: 200, price: '10 TL' }]), null);
    assert.equal(bestValue([{ key: 'a', coins: 100, price: '10 TL' }, { key: 'b', coins: 300, price: '20 TL' }]), 'b');
  });

  test('bonus yüzdesi', () => {
    assert.equal(bonusPct(1000, 1000), 100);
    assert.equal(bonusPct(5000, 2500), 50);
    assert.equal(bonusPct(5000, 0), 0);
  });
});
