/// <reference types="node" />
// Yönetim › Mağaza on the phone (lib/shop-live-core, GET /api/catalog?shop=1 `shop`, server/api/shop-items.mjs): the
// shop's frames and entry effects as the panel has them. The app's own keep their art and take the server's name,
// price, days, VIP level, shelf and order; the team's own come with their picture or their clip and name plate.
// Anything malformed is left out; no list (an older server, demo) is the compiled shop. The plate is placed over the
// clip as the player draws it (aspect-fit), and a long name gets smaller to stay on one line inside the plate.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { COSMETICS, cosmeticById, setLiveCosmetics, shopCosmetics } from '@/data/catalog';
import { fxFileName, parseFxList } from '@/lib/fx-videos-core';
import { mergeShop, parseLiveShop, parsePlate, plateLayout } from '@/lib/shop-live-core';

const ART = 'https://130-61-230-94.sslip.io/api/media/f/shopframe/00000000-0000-4000-8000-000000000001/halka.png';
const PLATE = { x: 0.5, y: 0.7, w: 0.5, size: 0.04, color: '#FFD700', bold: true };
/** GET /api/catalog?shop=1 `shop` as shop-items.mjs builds it: the app's own in order, the team's own first. */
const shopFromServer = () => ({
  items: [
    { sku: 'sf3', kind: 'frame', name: 'Pembe Taç', price: 1500, days: 30, minVip: 0, art: { url: ART, hole: 0.245 } },
    ...COSMETICS.filter((c) => c.kind === 'frame').map((c) => ({ sku: c.id, kind: 'frame', name: c.id === 'fr-neon' ? 'Neon Halka' : c.name, price: c.id === 'fr-neon' ? 200 : c.price, days: c.id === 'fr-neon' ? 14 : c.days, minVip: c.minVip ?? 0, builtin: true })),
    { sku: 'se1', kind: 'entry', name: 'Altın Ejderha', price: 5000, days: null, minVip: 3, video: true, plate: PLATE },
    ...COSMETICS.filter((c) => c.kind === 'entry').map((c) => ({ sku: c.id, kind: 'entry', name: c.name, price: c.price, days: c.days, minVip: c.minVip ?? 0, builtin: true, ...(c.id === 'en-dragon' ? {} : { off: true }) })),
  ],
});

describe('Mağaza: sunucunun listesi', () => {
  test('liste yoksa uygulamanın kendi mağazası; bozuk eşya atlanır', () => {
    for (const raw of [undefined, null, 5, {}, { items: 'x' }]) assert.equal(parseLiveShop(raw), null, String(raw));
    assert.deepEqual(mergeShop(COSMETICS, null), COSMETICS);
    const shop = parseLiveShop({
      items: [
        { sku: 'sf1', kind: 'frame', name: 'Resimsiz', price: 10, days: 30, minVip: 0 },
        { sku: 'sf2', kind: 'frame', name: 'Kötü adres', price: 10, days: 30, minVip: 0, art: { url: 'javascript:alert(1)', hole: 0.3 } },
        { sku: 'se1', kind: 'entry', name: 'Videosuz', price: 10, days: 30, minVip: 0 },
        { sku: 'BAD ID', kind: 'frame', name: 'x', price: 10, days: 30, minVip: 0, builtin: true },
        { sku: 'fr-neon', kind: 'frame', name: 'Neon', price: -5, days: 30, minVip: 0, builtin: true },
        { sku: 'fr-ocean', kind: 'ride', name: 'Yörünge', price: 300, days: 30, minVip: 0, builtin: true },
        { sku: 'se2', kind: 'entry', name: 'Süresi sıfır', price: 10, days: 0, minVip: 0, video: true, plate: PLATE },
        { sku: 'se3', kind: 'entry', name: 'İyi', price: 10, days: null, minVip: 0, video: true, plate: { ...PLATE, color: 'altın' } },
      ],
    });
    // se2: 0 days is not a length the server sends (for good is null); se3's plate is malformed: none (the usual banner).
    assert.deepEqual(shop!.items.map((x) => [x.sku, x.plate]), [['se3', null]], 'yalnız geçerli olan');
  });

  test('uygulamanın eşyası sunucunun adı, fiyatı, süresi ve rafıyla; ekibin eşyası resmiyle ya da videosu ve plakasıyla', () => {
    const merged = mergeShop(COSMETICS, parseLiveShop(shopFromServer()));
    const frames = merged.filter((c) => c.kind === 'frame');
    assert.equal(frames[0].id, 'sf3', 'sunucunun sırası');
    assert.deepEqual(frames[0].remote, { art: { url: ART, hole: 0.245 } });
    const neon = merged.find((c) => c.id === 'fr-neon')!;
    const compiled = COSMETICS.find((c) => c.id === 'fr-neon')!;
    assert.deepEqual([neon.name, neon.price, neon.days, neon.fx, neon.emoji], ['Neon Halka', 200, 14, compiled.fx, compiled.emoji], 'resmi ve animasyonu uygulamanın');
    const ejder = merged.find((c) => c.id === 'se1')!;
    assert.deepEqual([ejder.kind, ejder.days, ejder.minVip, ejder.remote], ['entry', null, 3, { video: true, plate: PLATE }]);
    assert.equal(merged.find((c) => c.id === 'en-dragon')!.retired, undefined, 'satışta');
    assert.equal(merged.find((c) => c.id === 'en-sparkle')!.retired, true, 'satışta değil');
    // The other kinds stay as compiled, all of them.
    assert.deepEqual(merged.filter((c) => c.kind !== 'frame' && c.kind !== 'entry'), COSMETICS.filter((c) => c.kind !== 'frame' && c.kind !== 'entry'));
  });

  test('ekranlar sunucunun mağazasından okur; liste gelmeyince uygulamanınkine döner', () => {
    setLiveCosmetics(mergeShop(COSMETICS, parseLiveShop(shopFromServer())));
    try {
      assert.equal(cosmeticById('sf3')?.name, 'Pembe Taç');
      assert.equal(cosmeticById('fr-neon')?.price, 200);
      assert.ok(shopCosmetics().some((c) => c.id === 'se1'));
    } finally {
      setLiveCosmetics(null);
    }
    assert.equal(cosmeticById('sf3'), undefined);
    assert.equal(cosmeticById('fr-neon')?.price, COSMETICS.find((c) => c.id === 'fr-neon')!.price);
  });

  test('ekibin giriş efektinin videosu indirilir ve kendi adıyla saklanır', () => {
    const fx = parseFxList([
      { kind: 'entry', id: 'se1', url: '/api/fx/s/se1.mp4?v=0123456789ab', bytes: 6000, ms: 3000 },
      { kind: 'gift', id: 'a3', url: '/api/fx/g/a3.mp4?v=0123456789ab', bytes: 6000, ms: 3000 },
    ]);
    assert.deepEqual(fx!.map((x) => [x.kind, x.id]), [['entry', 'se1'], ['gift', 'a3']]);
    assert.deepEqual(fx!.map(fxFileName), ['s-se1-0123456789ab.mp4', 'g-a3-0123456789ab.mp4']);
  });

  test('isim plakası videonun ekrandaki yerine oturur; uzun ad küçülür, kısa ad plakanın boyunda kalır', () => {
    assert.deepEqual(parsePlate({ ...PLATE, bold: undefined }), { ...PLATE, bold: true });
    assert.equal(parsePlate({ ...PLATE, w: 2 }), null);
    // A 412 × 915 phone: the 540 × 960 clip fits its width (412 × 732), centred with 91.5 above and below.
    const short = plateLayout(PLATE, 'KaaN', 412, 915);
    assert.equal(Math.round(short.cx), 206);
    assert.equal(Math.round(short.cy), Math.round(91.5 + 0.7 * 732.44));
    assert.equal(Math.round(short.width), 206);
    assert.equal(Math.round(short.fontSize * 100) / 100, Math.round(0.04 * 732.44 * 100) / 100, 'kısa ad plakanın yazı boyunda');
    const long = plateLayout(PLATE, 'Kraliçe Ayşegül Yıldırım', 412, 915);
    assert.ok(long.fontSize < short.fontSize, 'uzun ad küçülür');
    assert.ok(long.fontSize * 24 * 0.62 <= long.width + 0.01, 'plakaya sığar');
  });
});
