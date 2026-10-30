/// <reference types="node" />
// Sign-in guard: every screen file under src/app is listed in one of the root layout's Stack.Protected
// groups. Expo Router adds an unlisted route on its own, outside both groups, so it would open from a
// deep link without signing in.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../src/app');

function screens(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return screens(path);
    if (!name.endsWith('.tsx') || name.startsWith('_') || name.startsWith('+')) return [];
    return [relative(APP, path).replace(/\.tsx$/, '').split('\\').join('/')];
  });
}

describe('Giriş koruması', () => {
  test('her ekran kök düzende korumalı bir gruba yazılı', () => {
    const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8');
    const listed = new Set([...layout.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((m) => m[1]));
    // Screens inside a group folder are covered by the group's own entry ("(tabs)", "giris").
    const owner = (route: string) => {
      const top = route.split('/')[0];
      return top.startsWith('(') || top === 'giris' ? top : route;
    };
    const missing = screens(APP).filter((r) => !listed.has(owner(r)));
    assert.deepEqual(missing, [], `korumasız ekran: ${missing.join(', ')}`);
  });
});
