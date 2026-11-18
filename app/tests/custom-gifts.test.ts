/// <reference types="node" />
// The admins' own gifts (Yönetim › Hediyeler, server/api/custom-gifts.mjs) on the phone: the live catalog reads them
// without trusting the answer, puts them first on their shelves and finds them by id; their videos come in the fx list
// at an address an older app's filter refuses (so it never downloads a clip for a gift it can't show), and an older
// app's shelf (the compiled list cut to what the server lists) simply doesn't have them. The panel's pure helpers:
// which file goes as what, the order arrows, the video line.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '@/data/mock';
import { fxFileName, parseFxList } from '@/lib/fx-videos-core';
import { giftById, giftShelf, roomGiftShelf, parseLiveCatalog, parseRemoteGifts, parseSavedLiveCatalog, visibleGifts, type LiveCatalog } from '@/lib/live/catalog-live';
import { contentTypeOf, fileProblem, moved, videoKindOf, videoLine, type AdminGift, type GiftLimits } from '@/lib/gifts-admin-core';
import * as server from '../../server/api/catalog.mjs';

type ServerGift = { id: string; name: string; emoji: string; price: number; cat: string; minSvip: number };
const ICON = 'https://130-61-230-94.sslip.io/api/media/f/gifticon/00000000-0000-4000-8000-000000000001/x.png';
const custom = (id: string, o: Record<string, unknown> = {}) => ({ id, name: `Hediye ${id}`, price: 1500, cat: 'hot', minSvip: 0, emoji: '🌙', icon: ICON, custom: true, ...o });
/** GET /api/catalog as gifts.mjs builds it now: the admins' gifts first, then the compiled ones. */
const body = (gifts: unknown[], fx: unknown[] = []) => ({
  gifts: [...gifts, ...(server.GIFTS as Map<string, ServerGift>).values()],
  packs: [],
  fx,
  exchange: { usdTry: 49.8 },
  v: 12,
});

describe('Yöneticinin hediyeleri: katalog', () => {
  test('sunucunun sırasıyla okunur: ad, fiyat, raf, VIP, emoji, ikon adresi', () => {
    const c = parseLiveCatalog(body([custom('a2', { cat: 'couple' }), custom('a1', { cat: 'privilege', minSvip: 3, price: 99_999, emoji: undefined })]));
    assert.deepEqual(c.remote, [
      { id: 'a2', name: 'Hediye a2', emoji: '🌙', price: 1500, cat: 'couple', icon: ICON, custom: true },
      { id: 'a1', name: 'Hediye a1', emoji: '🎁', price: 99_999, cat: 'privilege', minSvip: 3, icon: ICON, custom: true },
    ]);
    // The ids list (what the shelf cuts the compiled gifts to) has them too, well formed: an older app uses it as before.
    assert.ok(c.giftIds?.includes('a2') && c.giftIds.includes('g1'));
  });

  test('bozuk kayıt atlanır, gerisi okunur; uygulamadaki bir hediyenin kimliği yok sayılır', () => {
    const c = parseLiveCatalog(
      body([
        custom('a1'),
        custom('a2', { price: 0 }),
        custom('a3', { price: 1.5 }),
        custom('a4', { cat: 'lucky' }),
        custom('a5', { icon: 'javascript:alert(1)' }),
        custom('a6', { name: '   ' }),
        custom('a7', { custom: false }),
        custom('g1', { name: 'Sahte Gül', price: 1 }),
        custom('a1', { name: 'İkinci kez' }),
        custom('a8', { minSvip: 99 }),
        { id: 'a9' },
        null,
        'a10',
      ]),
    );
    assert.deepEqual(
      c.remote.map((g) => [g.id, g.name, g.minSvip ?? 0]),
      [
        ['a1', 'Hediye a1', 0],
        ['a8', 'Hediye a8', 0],
      ],
    );
    assert.equal(giftById('g1', c)?.name, 'Gül', 'derlenmiş hediye kazanır');
    // An older server (no custom entries) or no list at all: none.
    assert.deepEqual(parseRemoteGifts([...(server.GIFTS as Map<string, ServerGift>).values()]), []);
    assert.deepEqual(parseRemoteGifts(undefined), []);
  });

  test('raf: yöneticinin hediyeleri başta, sonra uygulamadakiler; aynı katalogda aynı dizi', () => {
    const c = parseLiveCatalog(body([custom('a2'), custom('a1', { cat: 'couple' })]));
    const shelf = roomGiftShelf(c);
    assert.deepEqual(shelf.slice(0, 2).map((g) => g.id), ['a2', 'a1']);
    assert.deepEqual(shelf.slice(2), visibleGifts(GIFTS, c));
    assert.equal(roomGiftShelf(c), shelf);
    // A bond gift goes only from the room's gift panel, as a bond request.
    assert.ok(shelf.some((g) => g.id === 'bag-kardes'));
    assert.ok(!giftShelf(c).some((g) => g.id.startsWith('bag-')));
    assert.ok(giftShelf(c).some((g) => g.id === 'koruma'));
    assert.deepEqual(giftShelf(c).filter((g) => (g.cat ?? 'hot') === 'couple')[0].id, 'a1', 'İkili rafının başında');
    // An older app's shelf: the compiled list cut to the server's ids. The new ones aren't in it, nothing breaks.
    assert.ok(!visibleGifts(GIFTS, c).some((g) => g.id.startsWith('a')));
    assert.equal(visibleGifts(GIFTS, c).length, GIFTS.filter((g) => c.giftIds?.includes(g.id) && shelf.includes(g)).length);
  });

  test('kimlikle bulunur: odada gelen hediye, kombo, geçmiş; bilinmeyen boş döner', () => {
    const c = parseLiveCatalog(body([custom('a5', { price: 4200 })]));
    assert.equal(giftById('a5', c)?.price, 4200);
    assert.equal(giftById('g6', c)?.name, 'Roket');
    assert.equal(giftById('a6', c), undefined);
    assert.equal(giftById(null, c), undefined);
    assert.equal(giftById('a5', null), undefined, 'katalog yokken yalnız derlenmişler');
  });

  test('telefondaki kopya yöneticinin hediyelerini de saklar; eski kopyada hiç yok', () => {
    const c = parseLiveCatalog(body([custom('a1')]));
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 5 }));
    assert.deepEqual(back?.catalog.remote, c.remote);
    const old = parseSavedLiveCatalog(JSON.stringify({ v: 3, giftIds: ['g1'], packs: [], campaign: null, usdTry: null, fx: [], fetchedAt: 5 }));
    assert.deepEqual(old?.catalog.remote, []);
  });
});

describe('Yöneticinin hediyeleri: video', () => {
  const v = 'abcdef012345';
  const list = [
    { kind: 'gift', id: 'g6', url: `/api/fx/roket.mp4?v=${v}`, bytes: 100, ms: 5000 },
    { kind: 'gift', id: 'a3', url: `/api/fx/g/a3.mp4?v=${v}`, bytes: 200, ms: 6000 },
  ];
  test('fx listesindeki adresi okunur, telefonda g- ile başlayan adla saklanır', () => {
    const fx = parseFxList(list);
    assert.deepEqual(fx?.map((x) => x.id), ['g6', 'a3']);
    assert.equal(fxFileName(fx![1]), `g-a3-${v}.mp4`);
    assert.equal(fxFileName(fx![0]), `roket-${v}.mp4`);
    assert.deepEqual(parseFxList([{ ...list[1], url: `/api/fx/g/../a3.mp4?v=${v}` }]), []);
  });

  test('eski uygulamanın süzgeci (bu değişiklikten önceki) bu adresi atlar: hiç indirmez', () => {
    const OLD = /^\/api\/fx\/([a-z0-9-]{1,64})\.mp4\?v=([0-9a-f]{6,64})$/;
    assert.ok(OLD.test(list[0].url));
    assert.ok(!OLD.test(list[1].url));
  });

  test('katalogla birlikte gelir', () => {
    const c: LiveCatalog = parseLiveCatalog(body([custom('a3')], list));
    assert.equal(c.fx?.find((x) => x.id === 'a3')?.bytes, 200);
  });
});

describe('Yönetim › Hediyeler: yardımcılar', () => {
  const limits: GiftLimits = {
    nameMin: 2,
    nameMax: 24,
    priceMax: 1_000_000,
    svipMax: 10,
    iconBytes: 1024 * 1024,
    iconMinPx: 128,
    iconMaxPx: 1024,
    videoBytes: 12 * 1024 * 1024,
    sourceBytes: 100 * 1024 * 1024,
    videoMinMs: 1000,
    videoMaxMs: 15_000,
    width: 540,
    height: 960,
    fps: 20,
    fills: [0.45, 0.6, 0.8, 1],
    fill: 0.6,
  };
  test('dosyanın türü adından ya da tipinden: ikon, hazır video, saydam kaynak, SVGA', () => {
    assert.equal(contentTypeOf('gifticon', { name: 'a.PNG', mimeType: null }), 'image/png');
    assert.equal(contentTypeOf('gifticon', { name: 'a', mimeType: 'image/webp' }), 'image/webp');
    assert.equal(contentTypeOf('gifticon', { name: 'a.jpg', mimeType: 'image/jpeg' }), null);
    assert.equal(contentTypeOf('giftsource', { name: 'efekt.svga', mimeType: 'application/octet-stream' }), 'application/x-svga');
    assert.equal(contentTypeOf('giftsource', { name: 'efekt.mov', mimeType: null }), 'video/quicktime');
    assert.equal(videoKindOf({ name: 'yuzuk.svga', mimeType: null }), 'svga');
    assert.equal(videoKindOf({ name: 'yuzuk.webm', mimeType: 'video/webm' }), 'source');
    assert.equal(videoKindOf({ name: 'yuzuk.mp4', mimeType: 'video/mp4' }), 'stacked');
    assert.equal(videoKindOf({ name: 'yuzuk.gif', mimeType: 'image/gif' }), null);
  });

  test('yüklemeden önce boyut ve tür', () => {
    assert.equal(fileProblem('gifticon', { name: 'a.png', mimeType: 'image/png', size: 500_000 }, limits), null);
    assert.match(fileProblem('gifticon', { name: 'a.png', mimeType: 'image/png', size: 2_000_000 }, limits) ?? '', /1 MB/);
    assert.match(fileProblem('giftvideo', { name: 'a.webm', mimeType: 'video/webm', size: 10 }, limits) ?? '', /MP4/);
    assert.equal(fileProblem('giftsource', { name: 'a.svga', mimeType: null, size: null }, limits), null);
  });

  const gift = (id: string, cat: AdminGift['cat'], sort: number): AdminGift => ({
    id,
    name: id,
    emoji: '🎁',
    price: 10,
    cat,
    minSvip: 0,
    sort,
    enabled: true,
    icon: ICON,
    video: null,
    job: null,
    sent: { count: 0, coins: 0 },
    createdAt: '',
    updatedAt: '',
    updatedBy: null,
  });
  test('ok tuşları rafın içinde bir yer değiştirir; uçtakiler kımıldamaz', () => {
    const list = [gift('a1', 'hot', 0), gift('a2', 'hot', 1), gift('a3', 'couple', -1), gift('a4', 'hot', 2)];
    assert.deepEqual(moved(list, 'a2', -1), ['a2', 'a1', 'a4']);
    assert.deepEqual(moved(list, 'a2', 1), ['a1', 'a4', 'a2']);
    assert.equal(moved(list, 'a1', -1), null);
    assert.equal(moved(list, 'a3', 1), null);
  });

  test('video satırı: çevriliyor, çevrilemedi (nedeniyle), hazır, yok', () => {
    assert.equal(videoLine({ video: null, job: { status: 'processing', error: null } }).tone, 'action');
    assert.match(videoLine({ video: null, job: { status: 'failed', error: 'Bu videoda saydamlık yok' } }).text, /saydamlık yok/);
    assert.match(videoLine({ video: { url: '/api/fx/g/a1.mp4?v=abcdef', bytes: 2_500_000, ms: 6200 }, job: null }).text, /6,2 sn · 2,4 MB/);
    assert.equal(videoLine({ video: null, job: null }).tone, 'neutral');
  });
});
