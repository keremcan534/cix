/// <reference types="node" />
// Bağ işaretleri from the panel (lib/bond-looks, server/api/bond-looks.mjs): the catalog's designs parsed defensively,
// and a level without its own design taking the nearest lower one's (below the first: the app's own mark).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { bondLookAt, parseBondLooks } from '@/lib/bond-looks';

const pic = (name: string) => ({ url: `https://sunucu.example/api/media/f/shopframe/x/${name}`, v: 'a1b2c3d4e5f6', px: 256 });

describe('Bağ işaretleri (panelden)', () => {
  test('katalogdaki tasarımlar okunur; bozuk olan dışarıda kalır', () => {
    const looks = parseBondLooks({
      cift: { 3: { art: pic('c3.png'), size: 1.5 }, 10: { motion: pic('c10.webp'), art: pic('c10.png'), size: 2 } },
      kanka: { 1: { motion: pic('k1.webp') } },
      dost: { 1: { art: pic('yok.png'), size: 1 } },
      abla: { 0: { art: pic('a0.png') }, 21: { art: pic('a21.png') }, 2: { art: { url: 'javascript:alert(1)', v: 'x' } }, 4: { size: 2 } },
      kardes: 'bozuk',
    });
    assert.ok(looks);
    assert.deepEqual(Object.keys(looks).sort(), ['cift', 'kanka']);
    assert.equal(looks.cift?.[3]?.size, 1.5);
    assert.equal(looks.kanka?.[1]?.size, 1, 'boyut yoksa 1');
    assert.equal(looks.cift?.[10]?.motion?.url, pic('c10.webp').url);
    // The size stays within 1–3 whatever the answer says.
    assert.equal(parseBondLooks({ yenge: { 1: { art: pic('y.png'), size: 9 } } })?.yenge?.[1]?.size, 3);
    assert.equal(parseBondLooks(null), null);
    assert.equal(parseBondLooks({}), null);
    assert.equal(parseBondLooks([1, 2]), null);
  });

  test('tasarımı olmayan seviye bir alttakini alır; ilkinin altında uygulamanın kendi işareti', () => {
    const looks = parseBondLooks({ cift: { 3: { art: pic('c3.png') }, 10: { motion: pic('c10.webp') } } });
    assert.equal(bondLookAt(looks, 'cift', 1), null);
    assert.equal(bondLookAt(looks, 'cift', 2), null);
    assert.equal(bondLookAt(looks, 'cift', 3)?.art?.url, pic('c3.png').url);
    assert.equal(bondLookAt(looks, 'cift', 9)?.art?.url, pic('c3.png').url);
    assert.equal(bondLookAt(looks, 'cift', 10)?.motion?.url, pic('c10.webp').url);
    assert.equal(bondLookAt(looks, 'cift', 20)?.motion?.url, pic('c10.webp').url);
    assert.equal(bondLookAt(looks, 'cift', 25)?.motion?.url, pic('c10.webp').url);
    assert.equal(bondLookAt(looks, 'kanka', 20), null, 'başka tür etkilenmez');
    assert.equal(bondLookAt(null, 'cift', 5), null);
    assert.equal(bondLookAt(looks, 'cift', Number.NaN), null);
  });

  test('uygulama tasarımları isteyerek alır ve işarette çizer', () => {
    const live = readFileSync(resolve(import.meta.dirname, '../src/lib/live/catalog-live.ts'), 'utf8');
    assert.match(live, /bondlooks=1/);
    const mark = readFileSync(resolve(import.meta.dirname, '../src/components/bond-mark.tsx'), 'utf8');
    assert.match(mark, /bondLookOf\(kind, level, catalog\)/);
    assert.match(mark, /design\?\.motion \?\? design\?\.art/, 'hareketli hali önce');
  });
});
