/// <reference types="node" />
// Koltuk rengi on the phone (data/seat-colors, lib/shop-live-core): the rooms' seat colors come in the shop's list
// (kind seat, Yönetim › Mağaza › Koltuk renkleri) apart from what a person buys; a malformed one is left out, an
// unknown or deleted one is drawn as the default, and the phone's copy reads back the same. While a room's state is
// read again (joining, a dropped voice connection coming back) the seats keep the last color seen, not the default.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SEAT_COLORS, SEAT_DEFAULT, roomSeatColorShown, seatColorOf, seatColors, setLiveSeatColors } from '@/data/seat-colors';
import { parseLiveShop } from '@/lib/shop-live-core';

/** GET /api/catalog?shop=1 `shop` with seat colors, as server/api/shop-items.mjs shopCatalog builds it. */
const fromServer = () => ({
  items: [
    { sku: 'fr-neon', kind: 'frame', name: 'Neon', price: 200, days: 14, minVip: 0, builtin: true },
    { sku: 'gumus', kind: 'seat', name: 'Gümüş', price: 0, days: null, minVip: 0, builtin: true, look: { color: '#D5DAE1' }, default: true },
    { sku: 'pembe', kind: 'seat', name: 'Açık Pembe', price: 2500, days: 30, minVip: 0, builtin: true, look: { color: '#f4b6c8' } },
    { sku: 'sc4', kind: 'seat', name: 'Lacivert', price: 3000, days: null, minVip: 0, off: true, look: { color: '#1F2A5A' } },
    // Left out: no color, free but not the default, a bad id, a second default, a color that isn't #RRGGBB.
    { sku: 'sc5', kind: 'seat', name: 'Renksiz', price: 100, days: null, minVip: 0 },
    { sku: 'sc6', kind: 'seat', name: 'Bedava', price: 0, days: null, minVip: 0, look: { color: '#000000' } },
    { sku: 'SC 7', kind: 'seat', name: 'Kötü', price: 100, days: null, minVip: 0, look: { color: '#000000' } },
    { sku: 'sc8', kind: 'seat', name: 'İkinci', price: 0, days: null, minVip: 0, look: { color: '#000000' }, default: true },
    { sku: 'sc9', kind: 'seat', name: 'Kırmızımsı', price: 100, days: null, minVip: 0, look: { color: 'red' } },
  ],
});

describe('Koltuk renkleri', () => {
  test('mağazanın listesinden gelir, kişinin eşyalarından ayrı; telefondaki kopya aynı okunur', () => {
    const shop = parseLiveShop(fromServer())!;
    assert.deepEqual(
      shop.items.map((x) => x.sku),
      ['fr-neon'],
      'koltuk rengi kişinin eşyası değil',
    );
    assert.deepEqual(shop.seats, [
      { id: 'gumus', name: 'Gümüş', price: 0, days: null, color: '#D5DAE1', isDefault: true },
      { id: 'pembe', name: 'Açık Pembe', price: 2500, days: 30, color: '#F4B6C8' },
      { id: 'sc4', name: 'Lacivert', price: 3000, days: null, color: '#1F2A5A', off: true },
    ]);
    assert.deepEqual(parseLiveShop(JSON.parse(JSON.stringify(shop))), shop, 'telefondaki kopya aynı okunur');
    assert.deepEqual(parseLiveShop({ items: [] })!.seats, [], 'eski sunucu: liste yok');
  });

  test('listedeki renk çizilir; bilinmeyen ya da silinmiş renk varsayılandır; liste yoksa uygulamanınki', () => {
    setLiveSeatColors(parseLiveShop(fromServer())!.seats);
    try {
      assert.equal(seatColorOf('sc4').color, '#1F2A5A', 'panelin eklediği renk');
      assert.equal(seatColorOf('pembe').price, 2500);
      assert.equal(seatColorOf('pembe').days, 30);
      assert.equal(seatColorOf('silinmis').id, SEAT_DEFAULT);
      assert.equal(seatColorOf(null).id, SEAT_DEFAULT);
      assert.deepEqual(
        seatColors().map((c) => c.id),
        ['gumus', 'pembe', 'sc4'],
      );
    } finally {
      setLiveSeatColors(null);
    }
    assert.equal(seatColors().length, SEAT_COLORS.length, 'liste gelmeyince uygulamanınki');
    assert.equal(seatColorOf('pembe').price, SEAT_COLORS.find((c) => c.id === 'pembe')!.price);
    assert.equal(seatColorOf('sc4').id, SEAT_DEFAULT);
    assert.deepEqual(
      SEAT_COLORS.filter((c) => c.price === 0).map((c) => c.id),
      [SEAT_DEFAULT],
      'yalnız gümüş ücretsiz',
    );
  });

  test('oda durumu yeniden okunurken koltuklar son görülen renkte kalır', () => {
    assert.equal(roomSeatColorShown('oda-1', undefined), null, 'hiç görülmedi: varsayılan');
    assert.equal(roomSeatColorShown('oda-1', 'pembe'), 'pembe');
    assert.equal(roomSeatColorShown('oda-1', undefined), 'pembe', 'bağlantı dönerken');
    assert.equal(roomSeatColorShown('oda-1', null), 'pembe');
    assert.equal(roomSeatColorShown('oda-1', 'gumus'), 'gumus', 'yeni renk gelince o');
    assert.equal(roomSeatColorShown('oda-1', undefined), 'gumus');
    assert.equal(roomSeatColorShown('oda-2', undefined), null, 'başka oda');
  });
});
