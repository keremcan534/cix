/// <reference types="node" />
// Yönetim › Mağaza on the phone (lib/shop-live-core, GET /api/catalog?shop=1 `shop`, server/api/shop-items.mjs): the
// shop's frames, entry effects, chat bubbles and voice waves as the panel has them. The app's own keep their art and
// take the server's name, price, days, VIP level, shelf and order; the team's own come with their picture, their clip
// and name plate, or their look. Anything malformed is left out; no list (an older server, demo) is the compiled shop.
// The plate is placed over the clip as the player draws it (aspect-fit), and a long name gets smaller to stay on one
// line inside the plate; a bubble's picture is cut in nine so its corners stay as they are round any message.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { COSMETICS, cosmeticById, setLiveCosmetics, shopCosmetics } from '@/data/catalog';
import { fxFileName, parseFxList } from '@/lib/fx-videos-core';
import { PLATE_LOOK, mergeShop, nineSlice, parseBubbleLook, parseLiveShop, parsePlate, parseWaveLook, plateLayout, plateText, trUpper } from '@/lib/shop-live-core';

const ART = 'https://130-61-230-94.sslip.io/api/media/f/shopframe/00000000-0000-4000-8000-000000000001/halka.png';
/** A plate as a server before the plate's look and timing sends it, and as the phone reads it. */
const PLATE = { x: 0.5, y: 0.7, w: 0.5, size: 0.04, color: '#FFD700', bold: true };
const PLATE_READ = { ...PLATE, ...PLATE_LOOK };
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
    const read = parseLiveShop(shopFromServer());
    assert.deepEqual(parseLiveShop(JSON.parse(JSON.stringify(read))), read, 'telefondaki kopya aynı okunur');
    const merged = mergeShop(COSMETICS, read);
    const frames = merged.filter((c) => c.kind === 'frame');
    assert.equal(frames[0].id, 'sf3', 'sunucunun sırası');
    assert.deepEqual(frames[0].remote, { art: { url: ART, hole: 0.245 } });
    const neon = merged.find((c) => c.id === 'fr-neon')!;
    const compiled = COSMETICS.find((c) => c.id === 'fr-neon')!;
    assert.deepEqual([neon.name, neon.price, neon.days, neon.fx, neon.emoji], ['Neon Halka', 200, 14, compiled.fx, compiled.emoji], 'resmi ve animasyonu uygulamanın');
    const ejder = merged.find((c) => c.id === 'se1')!;
    assert.deepEqual([ejder.kind, ejder.days, ejder.minVip, ejder.remote], ['entry', null, 3, { video: true, plate: PLATE_READ }]);
    assert.equal(merged.find((c) => c.id === 'en-dragon')!.retired, undefined, 'satışta');
    assert.equal(merged.find((c) => c.id === 'en-sparkle')!.retired, true, 'satışta değil');
    // The kinds the server didn't list stay as compiled, all of them, each kind in its order.
    for (const kind of ['ride', 'bubble', 'specialId', 'wave'] as const) assert.deepEqual(merged.filter((c) => c.kind === kind), COSMETICS.filter((c) => c.kind === kind), kind);
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
    assert.deepEqual(parsePlate({ ...PLATE, bold: undefined }), { ...PLATE_READ, bold: true });
    assert.equal(parsePlate({ ...PLATE, w: 2 }), null);
    // A 412 × 915 phone: the 540 × 960 clip fits its width (412 × 732), centred with 91.5 above and below.
    const short = plateLayout(PLATE_READ, 'KaaN', 412, 915);
    assert.equal(Math.round(short.cx), 206);
    assert.equal(Math.round(short.cy), Math.round(91.5 + 0.7 * 732.44));
    assert.equal(Math.round(short.width), 206);
    assert.equal(Math.round(short.fontSize * 100) / 100, Math.round(0.04 * 732.44 * 100) / 100, 'kısa ad plakanın yazı boyunda');
    const long = plateLayout(PLATE_READ, 'Kraliçe Ayşegül Yıldırım', 412, 915);
    assert.ok(long.fontSize < short.fontSize, 'uzun ad küçülür');
    assert.ok(long.fontSize * 24 * 0.62 <= long.width + 0.01, 'plakaya sığar');
  });

  test('yazının görünüşü ve zamanı okunur; eksik ya da bozuk alan olağan haline döner, ad yine yazılır', () => {
    const full = { ...PLATE, show: false, upper: true, spacing: 0.1, shadow: { color: '#ff00ff', size: 0.4 }, outline: { color: '#000000', size: 0.08 }, back: { color: '#111827', alpha: 0.5 }, from: 1.2, to: 3, anim: 'zoom' };
    assert.deepEqual(parsePlate(full), { ...full, shadow: { color: '#FF00FF', size: 0.4 } });
    // A plate from before (place, size, colour): written, soft shadow, the whole clip, at once.
    assert.deepEqual(parsePlate(PLATE), PLATE_READ);
    assert.equal(parsePlate({ ...PLATE, shadow: null })!.shadow, null, 'gölgesiz');
    // Malformed parts fall back one by one.
    const odd = { spacing: 3, shadow: { color: 'mor', size: 0.3 }, outline: { color: '#000000', size: 1 }, back: { color: '#000000' }, from: -1, to: 99, anim: 'spin', upper: 'evet', show: 'hayır' };
    assert.deepEqual(parsePlate({ ...PLATE, ...odd }), PLATE_READ);
    assert.equal(parsePlate({ ...PLATE, from: 2, to: 1 })!.to, 0, 'gelmeden gitmez: video bitene kadar');
    // Capitals the Turkish way, whatever the phone's language; capitals and room between letters make a long name smaller.
    assert.equal(trUpper('kerim ılgaz şişli'), 'KERİM ILGAZ ŞİŞLİ');
    assert.equal(plateText({ ...PLATE_READ, upper: true }, 'iğdır'), 'İĞDIR');
    assert.equal(plateText(PLATE_READ, 'iğdır'), 'iğdır');
    const plain = plateLayout(PLATE_READ, 'Kraliçe Ayşegül', 412, 915).fontSize;
    assert.ok(plateLayout({ ...PLATE_READ, upper: true, spacing: 0.2 }, 'KRALİÇE AYŞEGÜL', 412, 915).fontSize < plain);
  });

  test('ekibin giriş efektinin ikonu mağazaya gelir; bozuk adres ve uygulamanın eşyasındaki ikon yok sayılır', () => {
    const ICON = 'https://130-61-230-94.sslip.io/api/media/f/shopframe/00000000-0000-4000-8000-000000000009/ikon.png';
    const shop = parseLiveShop({
      items: [
        { sku: 'se5', kind: 'entry', name: 'İkonlu', price: 10, days: 30, minVip: 0, video: true, plate: PLATE, icon: { url: ICON } },
        { sku: 'se6', kind: 'entry', name: 'Kötü ikon', price: 10, days: 30, minVip: 0, video: true, plate: PLATE, icon: { url: 'javascript:alert(1)' } },
        { sku: 'en-dragon', kind: 'entry', name: 'Ejderha', price: 3000, days: 30, minVip: 7, builtin: true, icon: { url: ICON } },
      ],
    })!;
    assert.deepEqual(shop.items.map((x) => [x.sku, x.icon]), [['se5', { url: ICON }], ['se6', undefined], ['en-dragon', undefined]]);
    assert.deepEqual(parseLiveShop(JSON.parse(JSON.stringify(shop))), shop, 'telefondaki kopya aynı okunur');
    const merged = mergeShop(COSMETICS, shop);
    assert.deepEqual(merged.find((c) => c.id === 'se5')!.remote, { video: true, plate: PLATE_READ, icon: { url: ICON } });
    assert.equal(merged.find((c) => c.id === 'en-dragon')!.remote, undefined);
  });

  test('ekibin hareketli çerçevesi: durağan resim, delik ve hareketli WebP gelir; bozuk hareketli adres düşer, resim kalır', () => {
    const MOVE = 'https://130-61-230-94.sslip.io/api/media/f/shopframe/00000000-0000-4000-8000-000000000004/imparator.webp';
    const shop = parseLiveShop({
      items: [
        { sku: 'sf7', kind: 'frame', name: 'İmparator', price: 900, days: 30, minVip: 0, art: { url: ART, hole: 0.27, motion: { url: MOVE } } },
        { sku: 'sf8', kind: 'frame', name: 'Bozuk Hareket', price: 900, days: 30, minVip: 0, art: { url: ART, hole: 0.27, motion: { url: 'javascript:alert(1)' } } },
      ],
    })!;
    assert.deepEqual(shop.items.map((x) => x.art), [{ url: ART, hole: 0.27, motion: { url: MOVE } }, { url: ART, hole: 0.27 }]);
    assert.deepEqual(parseLiveShop(JSON.parse(JSON.stringify(shop))), shop, 'telefondaki kopya aynı okunur');
    assert.deepEqual(mergeShop(COSMETICS, shop).find((c) => c.id === 'sf7')!.remote, { art: { url: ART, hole: 0.27, motion: { url: MOVE } } });
  });

  test('çerçevenin deliği ortada değilse yeri gelir; resmin dışına taşıtan ya da bozuk yer atlanır, fotoğraf ortalanır', () => {
    const frame = (sku: string, art: object) => ({ sku, kind: 'frame', name: `Çerçeve ${sku}`, price: 900, days: 30, minVip: 0, art: { url: ART, ...art } });
    const shop = parseLiveShop({
      items: [
        frame('sf9', { hole: 0.29, at: { x: 0.467, y: 0.42 } }),
        frame('sf10', { hole: 0.27, at: { x: 0.9, y: 0.5 } }),
        frame('sf11', { hole: 0.4, at: { x: 0.5, y: 0.32 } }),
        frame('sf12', { hole: 0.27, at: { x: '0.5', y: 0.45 } }),
      ],
    })!;
    assert.deepEqual(shop.items.map((x) => x.art?.at), [{ x: 0.467, y: 0.42 }, undefined, undefined, undefined]);
    assert.deepEqual(mergeShop(COSMETICS, shop).find((c) => c.id === 'sf9')!.remote, { art: { url: ART, hole: 0.29, at: { x: 0.467, y: 0.42 } } });
  });
});

describe('Mağaza: sohbet balonları ve ses dalgaları', () => {
  const PIC = 'https://130-61-230-94.sslip.io/api/media/f/shopframe/00000000-0000-4000-8000-000000000002/balon.png';
  const SPARK = 'https://130-61-230-94.sslip.io/api/media/f/shopframe/00000000-0000-4000-8000-000000000003/kalp.png';

  test('balonun renkleri ve resmi okunur; bozuk resim düşer, renkler kalır', () => {
    assert.deepEqual(parseBubbleLook({ colors: ['#0f172a', '#1E3A8A'], text: '#ffffff' }), { colors: ['#0F172A', '#1E3A8A'], text: '#FFFFFF' });
    for (const bad of [null, {}, { colors: ['#000000'], text: '#FFFFFF' }, { colors: ['#000000', 'mavi'], text: '#FFFFFF' }, { colors: ['#000000', '#111111'] }])
      assert.equal(parseBubbleLook(bad), null, JSON.stringify(bad));
    const art = { url: PIC, w: 300, h: 150, t: 40, r: 60, b: 40, l: 60 };
    assert.deepEqual(parseBubbleLook({ colors: ['#B45309', '#F59E0B'], text: '#1F1300', art })?.art, art);
    // Corners that leave nothing to stretch, or a bad address: the picture is left out, the colours are drawn.
    for (const a of [{ ...art, l: 150, r: 150 }, { ...art, t: 0 }, { ...art, url: 'javascript:alert(1)' }, { ...art, w: '300' }])
      assert.deepEqual(parseBubbleLook({ colors: ['#B45309', '#F59E0B'], text: '#1F1300', art: a }), { colors: ['#B45309', '#F59E0B'], text: '#1F1300' }, JSON.stringify(a));
  });

  test('dalganın stili ve renk sayısı denetlenir; resim yalnız Parıltı stilinde', () => {
    assert.deepEqual(parseWaveLook({ style: 'spin', colors: ['#00c2ff', '#0047FF', '#00FFB2'] }), { style: 'spin', colors: ['#00C2FF', '#0047FF', '#00FFB2'] });
    assert.deepEqual(parseWaveLook({ style: 'sparkle', colors: ['#FF5FA2', '#FFFFFF'], art: { url: SPARK } }), { style: 'sparkle', colors: ['#FF5FA2', '#FFFFFF'], art: { url: SPARK } });
    assert.deepEqual(parseWaveLook({ style: 'ring', colors: ['#FF5FA2'], art: { url: SPARK } }), { style: 'ring', colors: ['#FF5FA2'] }, 'halkada resim yok');
    for (const bad of [{ style: 'zigzag', colors: ['#FFFFFF'] }, { style: 'constructor', colors: ['#FFFFFF'] }, { style: 'ring', colors: ['#FFFFFF', '#000000'] }, { style: 'spin', colors: ['#FFFFFF'] }, { style: 'double', colors: ['#FFFFFF', 'kırmızı'] }])
      assert.equal(parseWaveLook(bad), null, JSON.stringify(bad));
  });

  test('listede uygulamanın balon ve dalgası sunucunun değerleriyle; ekibinki görünüşüyle; görünüşü bozuk olan atlanır', () => {
    const shop = parseLiveShop({
      items: [
        { sku: 'sb4', kind: 'bubble', name: 'Taçlı', price: 900, days: 30, minVip: 0, look: { colors: ['#B45309', '#F59E0B'], text: '#1F1300', art: { url: PIC, w: 300, h: 150, t: 40, r: 60, b: 40, l: 60 } } },
        { sku: 'sb5', kind: 'bubble', name: 'Görünüşsüz', price: 900, days: 30, minVip: 0 },
        { sku: 'bb-candy', kind: 'bubble', name: 'Pamuk Şeker', price: 150, days: 7, minVip: 0, builtin: true },
        { sku: 'sw6', kind: 'wave', name: 'Kalpler', price: 3000, days: null, minVip: 0, look: { style: 'sparkle', colors: ['#FF5FA2', '#FFFFFF'], art: { url: SPARK } } },
        { sku: 'sw7', kind: 'wave', name: 'Bozuk', price: 3000, days: null, minVip: 0, look: { style: 'zigzag', colors: ['#FFFFFF'] } },
        { sku: 'wv-gold', kind: 'wave', name: 'Altın Halka', price: 5000, days: 30, minVip: 0, builtin: true, off: true },
      ],
    });
    assert.deepEqual(shop!.items.map((x) => x.sku), ['sb4', 'bb-candy', 'sw6', 'wv-gold']);
    // The phone keeps the list it read and reads its copy again after a restart (lib/live/catalog-live): nothing
    // may be lost on the way, the team's bubbles and waves included.
    assert.deepEqual(parseLiveShop(JSON.parse(JSON.stringify(shop))), shop, 'telefondaki kopya aynı okunur');
    const merged = mergeShop(COSMETICS, shop);
    const taç = merged.find((c) => c.id === 'sb4')!;
    assert.deepEqual([taç.kind, taç.emoji, taç.remote?.bubble?.art?.w], ['bubble', '💬', 300]);
    const candy = merged.find((c) => c.id === 'bb-candy')!;
    assert.deepEqual([candy.name, candy.price, candy.color], ['Pamuk Şeker', 150, COSMETICS.find((c) => c.id === 'bb-candy')!.color], 'renkleri uygulamanın');
    assert.equal(merged.filter((c) => c.kind === 'bubble')[0].id, 'sb4', 'sunucunun sırası');
    assert.deepEqual(merged.find((c) => c.id === 'sw6')!.remote, { wave: { style: 'sparkle', colors: ['#FF5FA2', '#FFFFFF'], art: { url: SPARK } } });
    assert.deepEqual([merged.find((c) => c.id === 'wv-gold')!.days, merged.find((c) => c.id === 'wv-gold')!.retired], [30, true]);
    // The app's waves the server didn't list stay as compiled, after the listed ones.
    assert.deepEqual(merged.filter((c) => c.kind === 'wave').map((c) => c.id), ['sw6', 'wv-gold', 'wv-sparkle', 'wv-flame', 'wv-rainbow']);
  });

  test('balon resmi dokuz parçada: köşeler aynı kalır, kenarlar ve orta uzar, mesaj ortada', () => {
    const art = { url: PIC, w: 300, h: 150, t: 45, r: 60, b: 30, l: 90 };
    const k = 1 / 3;
    const s = nineSlice(art, k);
    assert.deepEqual(s.pad, { paddingTop: 15, paddingRight: 20, paddingBottom: 10, paddingLeft: 30 });
    assert.equal(s.pieces.length, 9);
    // Top left corner: its own size, the picture at its size, unmoved.
    assert.deepEqual(s.pieces[0].box, { position: 'absolute', overflow: 'hidden', left: 0, width: 30, top: 0, height: 15 });
    assert.deepEqual(s.pieces[0].image, { position: 'absolute', width: `${(300 / 90) * 100}%`.replace(/(\.\d{4})\d+/, '$1'), height: `${(150 / 45) * 100}%`.replace(/(\.\d{4})\d+/, '$1'), left: '0%', top: '0%' });
    // The middle: between the corners, the picture's middle (150 × 75 px) stretched over the whole piece.
    const mid = s.pieces[4];
    assert.deepEqual(mid.box, { position: 'absolute', overflow: 'hidden', left: 30, right: 20, top: 15, bottom: 10 });
    assert.deepEqual(mid.image, { position: 'absolute', width: '200%', height: '200%', left: '-60%', top: '-60%' });
    // Bottom right corner: from the picture's right and bottom edges.
    assert.deepEqual(s.pieces[8].box, { position: 'absolute', overflow: 'hidden', right: 0, width: 20, bottom: 0, height: 10 });
    assert.deepEqual(s.pieces[8].image, { position: 'absolute', width: '500%', height: '500%', left: '-400%', top: '-400%' });
    // Whatever the message's size W × H, laid out as the phone does (percentages of each piece's box), every piece
    // shows exactly its own part of the picture: corners, edges and middle meet with nothing missing or doubled.
    const xs = [0, art.l, art.w - art.r, art.w];
    const ys = [0, art.t, art.h - art.b, art.h];
    const of = (v: string, size: number) => (parseFloat(v) / 100) * size;
    const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} ≠ ${b}`);
    for (const [W, H] of [[60, 30], [240, 90], [400, 200]]) {
      s.pieces.forEach((p, i) => {
        const b = p.box as { left?: number; right?: number; top?: number; bottom?: number; width?: number; height?: number };
        const bw = b.width ?? W - (b.left ?? 0) - (b.right ?? 0);
        const bh = b.height ?? H - (b.top ?? 0) - (b.bottom ?? 0);
        const iw = of(p.image.width, bw);
        const ih = of(p.image.height, bh);
        const il = of(p.image.left, bw);
        const it = of(p.image.top, bh);
        const [col, row] = [i % 3, Math.floor(i / 3)];
        const at = `${W} × ${H}, parça ${i}`;
        near((-il / iw) * art.w, xs[col], `${at} sol`);
        near(((bw - il) / iw) * art.w, xs[col + 1], `${at} sağ`);
        near((-it / ih) * art.h, ys[row], `${at} üst`);
        near(((bh - it) / ih) * art.h, ys[row + 1], `${at} alt`);
      });
    }
  });
});
