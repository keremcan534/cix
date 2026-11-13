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
import { MOVE_ART, RPS } from '@/lib/room-moves';
import { stickerIdOf, stickersOf, stickerText, stickerToken } from '@/lib/stickers';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');
const ART_FILES = [
  'components/GiftArt.tsx',
  'components/ReactionArt.tsx',
  'components/StoreArt.tsx',
  'components/RoomArt.tsx',
  'components/Art.tsx',
  'components/fx/anim-art.tsx',
  'components/events/event-art.ts',
  'components/room-banners.tsx',
  'app/(tabs)/mesajlar.tsx',
  'components/bonds.tsx',
  'components/heart-level.tsx',
];

describe('Görsel dosyaları', () => {
  test('bağlanan her PNG diskte var', () => {
    for (const file of ART_FILES) {
      const paths = [...read(file).matchAll(/require\('([^']+\.(?:png|jpg))'\)/g)].map((m) => m[1]);
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
    // Pictures load with the file; animations (Duygular) only when drawn: `() => require(…)`.
    const files = new Map([...reactionArt.matchAll(/^  '([^']+)': (?:\(\) => )?require\('([^']+)'\)/gm)].map((m) => [m[1], m[2]]));
    const ids = ALL_STICKERS.map((x) => x.id);
    for (const id of ids) assert.ok(files.has(id), `${id}: görsel yok`);
    // Art that isn't a pick: what a Hamle plays on the mics (the three hands, the bang, the flying kiss, the die's faces).
    assert.deepEqual(
      [...files.keys()].filter((k) => !ids.includes(k)).sort(),
      ['hamle-carpma', 'hamle-kagit', 'hamle-makas', 'hamle-opucuk', 'hamle-tas', 'hamle-zar-1', 'hamle-zar-2', 'hamle-zar-3', 'hamle-zar-4', 'hamle-zar-5', 'hamle-zar-6'],
    );
    // Two names for one file only where a Hamle means it: a kiss to either side is the blowing kiss (the left one
    // turned round), and Taş Kağıt Makas's own tile.
    const shared = new Map<string, string[]>();
    for (const [id, f] of files) shared.set(f, [...(shared.get(f) ?? []), id]);
    assert.deepEqual(
      [...shared.values()].filter((v) => v.length > 1).map((v) => v.sort()).sort((a, b) => a[0].localeCompare(b[0])),
      [['duygu-opucuk', 'hamle-opucuk-sag', 'hamle-opucuk-sol'], ['hamle-tas', 'hamle-tkm']],
    );
    const bytes = new Set([...shared.keys()].map((f) => readFileSync(resolve(SRC, 'components', f)).toString('base64')));
    assert.equal(bytes.size, shared.size, 'aynı görsel iki çıkartmada');
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
      ['basic', 'duygu', 'muzik', 'hamle', 'fun', 'love', 'animals', 'vip', 'anim'],
    );
    assert.deepEqual(FREE_PACK_IDS, ['basic', 'duygu', 'muzik', 'hamle']);
  });
  test('Temel emoji panelinden ve mağazadan kalktı; gönderilmiş çıkartmaları yine çizilir', () => {
    assert.deepEqual(
      STICKER_PACKS.filter((p) => p.retired).map((p) => p.id),
      ['basic'],
    );
    // Free, so nobody loses a purchase; no paid pack is retired.
    for (const p of STICKER_PACKS.filter((x) => x.retired)) assert.ok(!p.price && !p.minVip, p.name);
    assert.match(read('app/magaza.tsx'), /STICKER_PACKS\.filter\(\(p\) => !p\.roomOnly && !p\.retired\)/);
    const art = read('components/ReactionArt.tsx');
    for (const x of STICKER_PACKS.find((p) => p.id === 'basic')!.stickers) assert.ok(art.includes(`'${x.id}': require(`), x.id);
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

describe('Duygular (Animated Noto Emoji, CC BY 4.0)', () => {
  test('ücretsiz, her birinin animasyonu var, kaynak notu uygulamayla gider', () => {
    const pack = STICKER_PACKS.find((p) => p.id === 'duygu');
    assert.ok(pack && !pack.price && !pack.minVip, 'ücretsiz paket');
    assert.equal(pack.stickers.length, 32);
    const art = read('components/ReactionArt.tsx');
    for (const x of pack.stickers) {
      assert.match(x.id, /^duygu-[a-z0-9-]+$/);
      // Read only when drawn: a function per animation, not a require at load.
      assert.ok(art.includes(`'${x.id}': () => require('../../assets/reactions/duygu/${x.id}.json'),`), x.id);
      const anim = JSON.parse(readFileSync(resolve(SRC, '../assets/reactions/duygu', `${x.id}.json`), 'utf8'));
      assert.ok(Array.isArray(anim.layers) && anim.layers.length > 0 && anim.fr > 0 && anim.op > anim.ip, `${x.id}: Lottie`);
    }
    assert.match(readFileSync(resolve(SRC, '../assets/reactions/duygu/LICENSE.txt'), 'utf8'), /Animated Noto Emoji[\s\S]*CC BY 4\.0/);
    assert.match(read('data/art-licenses.ts'), /creativecommons\.org\/licenses\/by\/4\.0/);
  });

  test('Müzik ve Hamle: aynı setten, ücretsiz; Hamle yalnız odada ve her seçimin animasyonu var', () => {
    const art = read('components/ReactionArt.tsx');
    const files = (id: string) => new RegExp(`'${id}': \\(\\) => require\\('\\.\\./\\.\\./assets/reactions/duygu/([a-z0-9-]+)\\.json'\\),`).exec(art)?.[1];
    for (const id of ['muzik', 'hamle']) {
      const pack = STICKER_PACKS.find((p) => p.id === id);
      assert.ok(pack && !pack.price && !pack.minVip, `${id}: ücretsiz paket`);
      for (const x of pack.stickers) {
        const file = files(x.id);
        assert.ok(file, `${x.id}: animasyon bağlı`);
        const anim = JSON.parse(readFileSync(resolve(SRC, '../assets/reactions/duygu', `${file}.json`), 'utf8'));
        assert.ok(Array.isArray(anim.layers) && anim.layers.length > 0 && anim.fr > 0 && anim.op > anim.ip, `${x.id}: Lottie`);
      }
    }
    assert.equal(STICKER_PACKS.find((p) => p.id === 'hamle')?.roomOnly, true, 'Hamle sohbet panelinde ve mağazada yok');
    assert.ok(!STICKER_PACKS.find((p) => p.id === 'muzik')?.roomOnly);
    // What a Hamle draws that isn't a pick: the three hands, the bang, the flying kiss.
    for (const id of ['hamle-tas', 'hamle-kagit', 'hamle-makas', 'hamle-carpma', 'hamle-opucuk']) {
      assert.ok(files(id), id);
      // Not in the catalog, so they carry their own name and the emoji drawn where the animation can't play.
      assert.ok(MOVE_ART[id]?.name && MOVE_ART[id].emoji, `${id}: yedek emoji`);
    }
    // The die's six faces: the games' die pictures, each its own face (the web draws ⚀…⚅).
    for (let n = 1; n <= 6; n++) {
      assert.ok(art.includes(`'hamle-zar-${n}': require('../../assets/art/zar-zar-yuzu-${n}.png'),`), `zar ${n}`);
      assert.equal(MOVE_ART[`hamle-zar-${n}`]?.emoji, String.fromCodePoint(0x267f + n), `zar ${n}: yedek`);
    }
    assert.deepEqual(Object.keys(MOVE_ART).sort(), ['hamle-carpma', 'hamle-kagit', 'hamle-makas', 'hamle-opucuk', 'hamle-tas', 'hamle-zar-1', 'hamle-zar-2', 'hamle-zar-3', 'hamle-zar-4', 'hamle-zar-5', 'hamle-zar-6']);
    // The kiss to either side is the blowing kiss, in the panel and on the mic; the left one is turned round there.
    assert.equal(files('hamle-opucuk-sol'), 'duygu-opucuk');
    assert.equal(files('hamle-opucuk-sag'), 'duygu-opucuk');
    assert.match(art, /MIRRORED_ART\.has\(id\)[\s\S]*scaleX: -1/);
    assert.deepEqual(RPS.map((h) => MOVE_ART[h.id].name), RPS.map((h) => h.name));
    assert.match(readFileSync(resolve(SRC, '../assets/reactions/duygu/LICENSE.txt'), 'utf8'), /muzik-\*\.json and hamle-\*\.json/);
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
