/// <reference types="node" />
// The emoji panel's packs as Yönetim › Emojiler has them (server/api/emoji.mjs) on the phone: read from the catalog
// (?emoji=1) without trusting it, laid over the app's own packs. Names, prices, VIP levels, order and on/off come from
// the server; the app's stickers keep their pictures unless the server gives one; the admins' stickers are drawn from
// their address; a sticker taken off is out of the panel but still drawn; a deleted one is its name and emoji. An
// older server (no emoji) leaves the app's packs exactly as they are.
import { register } from 'node:module';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { STICKER_PACKS } from '@/data/catalog';
import { parseLiveEmoji } from '@/lib/emoji-live-core';
import { parseLiveCatalog, parseSavedLiveCatalog } from '@/lib/live/catalog-live';
import { livePack, livePackOf, livePacks, liveSticker, stickerArt } from '@/lib/live/emoji-live';

const ART = 'https://130-61-230-94.sslip.io/api/media/f/stickerart/00000000-0000-4000-8000-000000000001/a.png';
const LOTTIE = 'https://130-61-230-94.sslip.io/api/media/f/stickerart/00000000-0000-4000-8000-000000000001/b.json';
/** The server's list as emoji.mjs builds it: the app's packs in its order, unchanged. */
const asServer = () =>
  STICKER_PACKS.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    minVip: p.minVip ?? 0,
    ...(p.roomOnly ? { roomOnly: true } : {}),
    ...(p.animated ? { animated: true } : {}),
    ...(p.retired ? { off: true } : {}),
    stickers: p.stickers.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji })),
  }));
const catalogWith = (emoji: unknown) => parseLiveCatalog({ gifts: [], giftsFormat: 2, packs: [], emoji, v: 9 });
const ids = (list: { id: string }[]) => list.map((x) => x.id);
// lib/emoji-panel reads the phone's storage when it loads: an in-memory stand-in, then the module.
register('./api-stub-hooks.mjs', import.meta.url);
type Panel = typeof import('../src/lib/emoji-panel.ts');
const panel = (): Promise<Panel> => import(`../src/lib/emoji-panel.ts?live=${1}`);

describe('Emoji paketleri: sunucunun dediği gibi', () => {
  test('değişmemiş liste: uygulamanın paketleri aynen', () => {
    const c = catalogWith({ packs: asServer(), gone: [] });
    assert.deepEqual(ids(livePacks(c)), ids(STICKER_PACKS));
    assert.equal(livePack('basic', c)?.retired, true);
    assert.deepEqual(livePack('vip', c)?.stickers, STICKER_PACKS.find((p) => p.id === 'vip')!.stickers);
    assert.equal(stickerArt('vip-tac', c), undefined, 'uygulamanın resmi');
    // Without an emoji answer (an older server): the compiled list itself.
    assert.equal(livePacks(parseLiveCatalog({ gifts: [] })), STICKER_PACKS);
    assert.equal(livePacks(null), STICKER_PACKS);
  });

  test('ad, fiyat, VIP, sıra, kapatma; yöneticinin paketi ve çıkartmaları (PNG ve Lottie)', () => {
    const list = asServer();
    const fun = list.find((p) => p.id === 'fun')!;
    Object.assign(fun, { name: 'Çılgınlar', price: 70, minVip: 2 });
    list.find((p) => p.id === 'muzik')!.off = true;
    const mine = {
      id: 'ep4',
      name: 'Kedi Sarayı',
      price: 120,
      minVip: 0,
      custom: true,
      animated: true,
      stickers: [
        { id: 'es5', name: 'Mırnav', emoji: '🐱', art: { url: ART, kind: 'image' }, custom: true },
        { id: 'es6', name: 'Dans eden kedi', emoji: '💃', art: { url: LOTTIE, kind: 'lottie' }, custom: true },
        { id: 'es7', name: 'Kapalı', emoji: '🙈', art: { url: ART, kind: 'image' }, custom: true, off: true },
      ],
    };
    const c = catalogWith({ packs: [mine, ...list], gone: [] });
    assert.deepEqual(ids(livePacks(c)).slice(0, 2), ['ep4', 'basic']);
    const p = livePack('fun', c)!;
    assert.deepEqual([p.name, p.price, p.minVip], ['Çılgınlar', 70, 2]);
    assert.equal(livePack('muzik', c)?.retired, true);
    const kedi = livePack('ep4', c)!;
    assert.deepEqual(ids(kedi.stickers), ['es5', 'es6'], 'kapalı çıkartma panelde yok');
    assert.equal(kedi.animated, true);
    assert.deepEqual(stickerArt('es5', c), { url: ART, kind: 'image' });
    assert.deepEqual(stickerArt('es6', c), { url: LOTTIE, kind: 'lottie' });
    // Taken off: still drawn where it was sent.
    assert.equal(liveSticker('es7', c)?.name, 'Kapalı');
    assert.deepEqual(stickerArt('es7', c), { url: ART, kind: 'image' });
    assert.equal(livePackOf('es5', c)?.id, 'ep4');
  });

  test('emoji paneli sunucunun paketlerini izler: kapatılan Müzik Emoji sekmesinde yok, yeni paketin sekmesi var', async () => {
    const list = asServer();
    list.find((p) => p.id === 'muzik')!.off = true;
    const mine = { id: 'ep4', name: 'Kedi Sarayı', price: 120, custom: true, stickers: [{ id: 'es5', name: 'Mırnav', emoji: '🐱', art: { url: ART, kind: 'image' }, custom: true }] };
    const c = catalogWith({ packs: [mine, ...list], gone: [] });
    const { emojiTabPacks, panelTabs } = await panel();
    assert.deepEqual(ids(emojiTabPacks(true, livePacks(c))), ['duygu', 'hamle']);
    const tabs = panelTabs(false, livePacks(c));
    assert.equal(tabs.find((t) => t.id === 'ep4')?.kind, 'vip', 'satılık paket VIP başlığında');
    // A pack with no sticker left has no tab.
    const empty = catalogWith({ packs: [{ ...mine, stickers: [] }, ...asServer()], gone: [] });
    assert.ok(!panelTabs(false, livePacks(empty)).some((t) => t.id === 'ep4'));
  });

  test('uygulamanın çıkartması: yeni resim, ad, başka pakete taşıma', () => {
    const list = asServer();
    const vip = list.find((p) => p.id === 'vip')!;
    const tac = vip.stickers.shift()!;
    list.find((p) => p.id === 'love')!.stickers.push({ ...tac, name: 'Altın Taç', art: { url: ART, kind: 'image' } } as never);
    const c = catalogWith({ packs: list, gone: [] });
    assert.equal(liveSticker('vip-tac', c)?.name, 'Altın Taç');
    assert.equal(livePackOf('vip-tac', c)?.id, 'love');
    assert.ok(!livePack('vip', c)!.stickers.some((s) => s.id === 'vip-tac'));
    assert.deepEqual(stickerArt('vip-tac', c), { url: ART, kind: 'image' });
  });

  test('bozuk kayıtlar: bilinmeyen kimlik, resimsiz yönetici çıkartması, bozuk adres atlanır; uygulamanınki kaybolmaz', () => {
    const list = asServer().filter((p) => p.id !== 'penguen');
    const e = parseLiveEmoji({
      packs: [
        { id: 'zz', name: 'Bilinmez', price: 5, stickers: [] },
        { id: 'ep1', name: 'Yarım', price: -3, custom: true, stickers: [{ id: 'es1', name: 'Resimsiz', emoji: '⭐', custom: true }, { id: 'es2', name: 'Kötü adres', emoji: '⭐', custom: true, art: { url: 'javascript:alert(1)', kind: 'image' } }, { id: 'es3', name: 'İyi', emoji: '⭐', custom: true, art: { url: ART, kind: 'gif' } }] },
        ...list,
        { id: 'ep1', name: 'İkinci kez', price: 1, custom: true, stickers: [] },
      ],
      gone: [{ id: 'es9', name: 'Silinen', emoji: '🗑️' }, { id: 'vip-tac', name: 'Sahte', emoji: '❌' }, { id: 'es10', name: '', emoji: '⭐' }],
    })!;
    assert.deepEqual(e.packs.find((p) => p.id === 'ep1'), { id: 'ep1', name: 'Yarım', price: 0, custom: true, stickers: [] });
    assert.ok(!e.packs.some((p) => p.id === 'zz'));
    assert.equal(e.packs.filter((p) => p.id === 'ep1').length, 1);
    // Penguen wasn't in the answer: it stays as the app has it, after the rest.
    assert.equal(e.packs.at(-1)?.id, 'penguen');
    assert.equal(e.packs.at(-1)?.stickers.length, 24);
    assert.deepEqual(e.gone, [{ id: 'es9', name: 'Silinen', emoji: '🗑️' }]);
    const c = catalogWith({ packs: e.packs, gone: e.gone });
    assert.equal(liveSticker('es9', c)?.emoji, '🗑️', 'silinen: emojisiyle');
    assert.equal(livePackOf('es9', c), undefined);
    for (const raw of [null, 'x', { packs: [] }, { packs: 'a' }, { packs: [{ id: 'zz' }] }]) assert.equal(parseLiveEmoji(raw), null, JSON.stringify(raw));
  });

  test('telefondaki kopya aynen geri okunur', () => {
    const list = asServer();
    list[1] = { ...list[1], name: 'Hepsi', price: 10 };
    const c = catalogWith({ packs: [{ id: 'ep2', name: 'Yeni', price: 0, custom: true, stickers: [{ id: 'es3', name: 'Yıldız', emoji: '⭐', art: { url: ART, kind: 'image' }, custom: true }] }, ...list], gone: [{ id: 'es1', name: 'Eski', emoji: '🙂' }] });
    const back = parseSavedLiveCatalog(JSON.stringify({ ...c, fetchedAt: 1 }));
    assert.deepEqual(back?.catalog.emoji, c.emoji);
  });
});
