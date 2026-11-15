/// <reference types="node" />
// The app's own gifts as changed in Yönetim › Hediyeler (server/api/custom-gifts.mjs) on the phone: with gifts=2 the
// server lists every gift on the shelves in the shelves' order with what it is now; this app takes its name, emoji,
// price, shelf, VIP level and a replaced icon, keeps its own art and badges otherwise, and trusts the list alone for
// what is on the shelves (a paused gift put back shows; one taken off doesn't). Anything malformed keeps the compiled
// value. An older server (no giftsFormat) is read exactly as before.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '@/data/mock';
import { GIFTS_PAUSED } from '@/data/gifts-paused';
import { bagGifts, everyGift, giftById, giftShelf, parseLiveCatalog, parseSavedLiveCatalog, remoteIconOf, visibleGifts } from '@/lib/live/catalog-live';

const ICON = 'https://130-61-230-94.sslip.io/api/media/f/gifticon/00000000-0000-4000-8000-000000000001/x.png';
const base = (id: string) => {
  const g = GIFTS.find((x) => x.id === id)!;
  return { id, name: g.name, emoji: g.emoji, price: g.price, cat: g.cat ?? 'hot', minSvip: g.minSvip ?? 0 };
};
/** GET /api/catalog?gifts=2 as gifts.mjs builds it: the shelves in order, the app's own as they are now. */
const format2 = (gifts: unknown[]) => ({ gifts, giftsFormat: 2, packs: [], fx: [], exchange: { usdTry: 49.8 }, v: 30 });
const ids = (list: { id: string }[]) => list.map((g) => g.id);

describe('Uygulamanın hediyeleri: sunucunun dediği gibi (gifts=2)', () => {
  test('ad, emoji, fiyat, raf ve VIP sunucudan; resim ve rozet uygulamanın; sıra sunucunun', () => {
    const c = parseLiveCatalog(
      format2([
        { ...base('h15'), name: 'Dev Panda', emoji: '🐻', price: 6500 },
        { id: 'a7', name: 'Ay Işığı', price: 900, cat: 'hot', minSvip: 0, emoji: '🌙', icon: ICON, custom: true },
        base('g6'),
        { ...base('c3'), cat: 'privilege', minSvip: 4 },
      ]),
    );
    assert.deepEqual(c.shelf, ['h15', 'a7', 'g6', 'c3']);
    assert.deepEqual(ids(giftShelf(c)), ['h15', 'a7', 'g6', 'c3']);
    const panda = giftById('h15', c)!;
    assert.deepEqual([panda.name, panda.emoji, panda.price, panda.cat], ['Dev Panda', '🐻', 6500, 'hot']);
    assert.equal(panda.badge, 'music', 'rozet uygulamanın');
    const c3 = giftById('c3', c)!;
    assert.deepEqual([c3.cat, c3.minSvip], ['privilege', 4]);
    // Unchanged: the compiled gift itself.
    assert.deepEqual(giftById('g6', c), { ...GIFTS.find((g) => g.id === 'g6'), minSvip: undefined });
    assert.equal(giftById('a7', c)?.name, 'Ay Işığı');
    // Not on the shelves but still drawn when it arrives (an older phone sent it).
    assert.equal(giftById('h1', c)?.name, 'Oyun Zamanı');
  });

  test('listede olmayan rafta değil, duraklatılmış olan listedeyse rafta (yöneticinin geri koyduğu)', () => {
    assert.ok(GIFTS_PAUSED.has('g1'));
    const c = parseLiveCatalog(format2([base('g1'), base('h15')]));
    assert.deepEqual(ids(giftShelf(c)), ['g1', 'h15']);
    // Fixed lists (a chat's gifts) follow the same list, as the gifts are now.
    const chat = ['g1', 'g2', 'g3'].map((id) => GIFTS.find((g) => g.id === id)!);
    assert.deepEqual(ids(visibleGifts(chat, c)), ['g1']);
    const renamed = parseLiveCatalog(format2([{ ...base('g1'), name: 'Kırmızı Gül' }]));
    assert.equal(visibleGifts(chat, renamed)[0].name, 'Kırmızı Gül');
    // Çantam: every gift of the app as it is now (the server's backpack already leaves out what it refuses).
    assert.equal(bagGifts(GIFTS, renamed).length, GIFTS.length);
    assert.equal(bagGifts(GIFTS, renamed).find((g) => g.id === 'g1')?.name, 'Kırmızı Gül');
  });

  test('değiştirilen ikonun adresi; değiştirilmemişte yok (uygulamanın resmi)', () => {
    const c = parseLiveCatalog(format2([{ ...base('c13'), icon: ICON }, base('g6'), { ...base('h13'), icon: 'javascript:alert(1)' }]));
    assert.equal(remoteIconOf('c13', c), ICON);
    assert.equal(remoteIconOf('g6', c), undefined);
    assert.equal(remoteIconOf('h13', c), undefined, 'bozuk adres yok sayılır');
  });

  test('bozuk alan uygulamadaki değere döner; bilinmeyen kimlik atlanır; hiçbir şey kalmazsa raf boş açılmaz', () => {
    const c = parseLiveCatalog(
      format2([
        { ...base('h15'), price: 0, name: '  ', cat: 'lucky', emoji: 'x'.repeat(40) },
        { ...base('v12'), minSvip: 99 },
        { id: 'zz9', name: 'Bilinmez', price: 5, cat: 'hot' },
        null,
        'g6',
      ]),
    );
    const h15 = giftById('h15', c)!;
    assert.deepEqual([h15.name, h15.price, h15.cat, h15.emoji], ['Sevimli Panda', 5999, 'hot', '🐼']);
    assert.equal(giftById('v12', c)?.minSvip, 9, 'VIP uygulamadaki');
    assert.deepEqual(c.shelf, ['h15', 'v12']);
    // A list with nothing this app can draw: the shelf isn't left empty.
    const empty = parseLiveCatalog(format2([{ id: 'zz9', name: 'Bilinmez', price: 5, cat: 'hot' }]));
    assert.ok(giftShelf(empty).length > 0);
  });

  test('eski sunucu (giftsFormat yok): eskisi gibi, adlar ve fiyatlar uygulamanın', () => {
    const c = parseLiveCatalog({ gifts: [{ ...base('h15'), name: 'Dev Panda', price: 6500 }, base('g6')], packs: [], v: 3 });
    assert.equal(c.shelf, null);
    assert.deepEqual(c.app, {});
    assert.equal(giftById('h15', c)?.name, 'Sevimli Panda');
    assert.deepEqual(ids(giftShelf(c)), ['g6', 'h15'], 'uygulamadaki sırayla');
  });

  test('telefondaki kopya: sıra ve değişiklikler aynen geri okunur', () => {
    const c = parseLiveCatalog(format2([{ ...base('h15'), price: 6500, icon: ICON }, base('g1')]));
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 5 }));
    assert.deepEqual(back?.catalog, c);
    assert.deepEqual(ids(giftShelf(back!.catalog)), ['h15', 'g1']);
    assert.equal(everyGift(back!.catalog).find((g) => g.id === 'h15')?.price, 6500);
  });
});
