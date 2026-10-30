/// <reference types="node" />
// Produced visuals (docs/GORSEL_URETIM_LISTESI.md §1–5): every bundled file exists, every catalog
// gift, effect and sticker has its picture, store pictures belong to real store items, every
// room type, theme and level has its picture, and only sticker tokens (never standard emoji) become stickers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANIMATION_SEED } from '@/data/animations';
import { CASINO_GAMES, ROOM_GAMES } from '@/data/games';
import { ALL_STICKERS, COSMETICS, COSMETIC_KINDS, FREE_PACK_IDS, ROOM_LEVEL_ICONS, ROOM_THEMES, ROOM_TYPES, STANDARD_EMOJI, STICKER_PACKS } from '@/data/catalog';
import { GIFTS } from '@/data/mock';
import { stickerIdOf, stickersOf, stickerText, stickerToken } from '@/lib/stickers';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');
const ART_FILES = ['components/GiftArt.tsx', 'components/ReactionArt.tsx', 'components/StoreArt.tsx', 'components/RoomArt.tsx', 'components/Art.tsx', 'components/fx/anim-art.tsx'];

describe('Görsel dosyaları', () => {
  test('bağlanan her PNG diskte var', () => {
    for (const file of ART_FILES) {
      const paths = [...read(file).matchAll(/require\('([^']+\.png)'\)/g)].map((m) => m[1]);
      assert.ok(paths.length > 0, file);
      for (const p of paths) assert.ok(existsSync(resolve(SRC, dirname(file), p)), `${file}: ${p}`);
    }
  });

  test('katalogdaki her hediyenin ve Lucky paketinin görseli var', () => {
    const giftArt = read('components/GiftArt.tsx');
    for (const g of GIFTS) assert.match(giftArt, new RegExp(`^  ${g.id}: \\{ sm:`, 'm'), `${g.id} ${g.name}`);
    for (const id of ['lk1', 'lk2', 'lk3', 'lk4']) assert.match(giftArt, new RegExp(`^  ${id}: \\{ sm:`, 'm'), id);
  });

  test('her çıkartmanın görseli var, görseller birbirinin kopyası değil', () => {
    const reactionArt = read('components/ReactionArt.tsx');
    const files = new Map([...reactionArt.matchAll(/^  '([^']+)': require\('([^']+)'\)/gm)].map((m) => [m[1], m[2]]));
    assert.deepEqual([...files.keys()].sort(), ALL_STICKERS.map((x) => x.id).sort());
    const bytes = new Set([...files.values()].map((f) => readFileSync(resolve(SRC, 'components', f)).toString('base64')));
    assert.equal(bytes.size, files.size, 'aynı görsel iki çıkartmada');
  });

  test('mağaza görselleri gerçek ürünlere ve sekmelere bağlı', () => {
    const storeArt = read('components/StoreArt.tsx');
    const items = [...storeArt.matchAll(/^  '([^']+)': require/gm)].map((m) => m[1]);
    const tabs = [...storeArt.matchAll(/^  (\w+): require/gm)].map((m) => m[1]);
    assert.ok(items.length > 0 && tabs.length > 0);
    for (const id of items) assert.ok(COSMETICS.some((c) => c.id === id && c.kind !== 'frame'), id);
    for (const kind of tabs) assert.ok(COSMETIC_KINDS.some((k) => k.kind === kind), kind);
  });

  test('her oda tipinin, temasının ve seviyesinin görseli var', () => {
    const roomArt = read('components/RoomArt.tsx');
    const block = (name: string, end: string) => roomArt.slice(roomArt.indexOf(name), roomArt.indexOf(end, roomArt.indexOf(name)));
    const keys = (name: string) => [...block(name, '};').matchAll(/^  (\w+): require/gm)].map((m) => m[1]).sort();
    assert.deepEqual(keys('ROOM_TYPE_ART'), ROOM_TYPES.map((t) => t.id).sort());
    assert.deepEqual(keys('ROOM_THEME_ART'), ROOM_THEMES.map((t) => t.id).sort());
    const levels = block('ROOM_LEVEL_ART: number[]', '];').split(/\r?\n/).filter((l) => /^  \S/.test(l));
    assert.equal(levels.length, ROOM_LEVEL_ICONS.length);
  });

  test('oyun görselleri gerçek oyunlara bağlı', () => {
    const covers = [...read('components/GameArt.tsx').matchAll(/^  (\w+): '(oyun-[^']+)',/gm)].map((m) => [m[1], m[2]]);
    const art = read('components/Art.tsx');
    assert.ok(covers.length > 0);
    for (const [id, name] of covers) {
      assert.ok([...ROOM_GAMES, ...CASINO_GAMES].some((g) => g.id === id), id);
      assert.ok(art.includes(`'${name}': require`), name);
    }
  });

  test('yerleşik animasyonlar emoji değil görsel çizer', () => {
    for (const a of ANIMATION_SEED) assert.notEqual(a.preview_asset.kind, 'emoji', a.name);
  });
});

describe('Emoji ve çıkartma paketleri', () => {
  test('eski paket kimlikleri korunuyor, satın alınanlar kaybolmuyor', () => {
    assert.deepEqual(
      STICKER_PACKS.map((p) => p.id),
      ['basic', 'fun', 'love', 'animals', 'vip', 'anim'],
    );
    assert.deepEqual(FREE_PACK_IDS, ['basic']);
  });
  test('ücretli paketler yalnız özel çizim çıkartma, standart emojiler ücretsiz ve ayrı', () => {
    for (const p of STICKER_PACKS) for (const x of p.stickers) assert.match(x.id, /^[a-z0-9-]+$/, `${p.name}: ${x.id}`);
    const all = STANDARD_EMOJI.flatMap((g) => g.emojis);
    assert.ok(all.length > 300, `${all.length} emoji`);
    assert.equal(new Set(all).size, all.length, 'tekrar eden emoji');
    // Every emoji the old paid packs sold is now in the free standard set.
    for (const x of ALL_STICKERS) assert.ok(all.includes(x.emoji), `${x.name}: ${x.emoji}`);
  });
});

describe('Çıkartma mesajı', () => {
  const known = (id: string) => ['temel-kahkaha', 'ask-kalp', 'vip-ates'].includes(id);
  const k = stickerToken('temel-kahkaha');
  test('yalnız çıkartma token\'ından oluşan mesaj çıkartma olur', () => {
    assert.deepEqual(stickersOf(k, known), ['temel-kahkaha']);
    assert.deepEqual(stickersOf(` ${k} ${stickerToken('vip-ates')} `, known), ['temel-kahkaha', 'vip-ates']);
    assert.equal(stickerIdOf(k), 'temel-kahkaha');
  });
  test('standart emoji, metin, bilinmeyen veya fazlası çıkartma olmaz', () => {
    assert.equal(stickersOf('😂', known), null, 'emoji yazmak ücretli çıkartmayı açmaz');
    assert.equal(stickerIdOf('😂'), null);
    assert.equal(stickersOf(`selam ${k}`, known), null);
    assert.equal(stickersOf(stickerToken('yok'), known), null);
    assert.equal(stickersOf(k.repeat(4), known), null);
    assert.equal(stickersOf('', known), null);
  });
  test('önizlemede token adıyla yazılır', () => {
    assert.equal(stickerText(`selam ${k}`, (id) => (id === 'temel-kahkaha' ? 'Kahkaha' : undefined)), 'selam [Kahkaha]');
    assert.equal(stickerText(stickerToken('yok'), () => undefined), stickerToken('yok'));
  });
});
