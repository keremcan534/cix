/// <reference types="node" />
// Produced visuals (docs/GORSEL_URETIM_LISTESI.md §1–3): every bundled file exists, every catalog
// gift, effect and emoji-pack emoji has its picture, and only reactions-only messages become stickers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANIMATION_SEED } from '@/data/animations';
import { EMOJI_PACKS } from '@/data/catalog';
import { GIFTS } from '@/data/mock';
import { emojiKey, stickersOf } from '@/lib/stickers';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');
const ART_FILES = ['components/GiftArt.tsx', 'components/ReactionArt.tsx', 'components/fx/anim-art.tsx'];

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

  test('emoji paketlerindeki her emojinin çıkartması var', () => {
    const keys = new Set([...read('components/ReactionArt.tsx').matchAll(/^  '([^']+)': require/gm)].map((m) => emojiKey(m[1])));
    for (const p of EMOJI_PACKS) for (const e of p.emojis) assert.ok(keys.has(emojiKey(e)), `${p.name}: ${e}`);
  });

  test('yerleşik animasyonlar emoji değil görsel çizer', () => {
    for (const a of ANIMATION_SEED) assert.notEqual(a.preview_asset.kind, 'emoji', a.name);
  });
});

describe('Çıkartma mesajı', () => {
  const keys = ['😂', '❤', '👍', '🔥'];
  test('yalnız tepki emojisinden oluşan mesaj çıkartma olur', () => {
    assert.deepEqual(stickersOf('😂', keys), ['😂']);
    assert.deepEqual(stickersOf(' 😂 🔥 ', keys), ['😂', '🔥']);
    assert.deepEqual(stickersOf('❤️', keys), ['❤'], 'VS16 olan ve olmayan kalp aynı');
  });
  test('metin, bilinmeyen emoji veya fazlası düz metin kalır', () => {
    assert.equal(stickersOf('selam 😂', keys), null);
    assert.equal(stickersOf('😂🦖', keys), null);
    assert.equal(stickersOf('👍🏽', keys), null, 'ten rengi ayrı bir emoji');
    assert.equal(stickersOf('❤️‍🔥', keys), null, 'ZWJ dizisi parçalanmaz');
    assert.equal(stickersOf('😂😂😂😂', keys), null);
    assert.equal(stickersOf('', keys), null);
  });
});
