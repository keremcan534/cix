/// <reference types="node" />
// A picture sized only by its height and an aspect ratio takes its file's own width on Android (React Native puts the
// image's size under the style, and Yoga lets the ratio win over the height): the person card's pill ends, 104-pixel
// slices, became 104-point ovals bleeding over the card on the client's phone (Güncelleme 7). Every inline Image style
// with an aspectRatio must also give a width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });

test('no Image is sized by height and aspectRatio alone', () => {
  const bad: string[] = [];
  for (const f of files(SRC)) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/<(?:Animated\.)?Image\b[^>]*?style=\{\{([^}]*)\}\}/g)) {
      const style = m[1];
      if (/\baspectRatio\b/.test(style) && !/\bwidth\s*:/.test(style)) bad.push(`${relative(SRC, f)}: ${style.trim()}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the person card pill ends have an explicit width and are clipped', () => {
  const art = readFileSync(join(SRC, 'components/person-card-art.tsx'), 'utf8');
  const pill = art.slice(art.indexOf('export function SlicePill'));
  assert.equal((pill.match(/style=\{\{ width: end, height: '100%' \}\}/g) ?? []).length, 2);
  assert.match(pill, /overflow: 'hidden'/);
});
