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

// Staff and demo screens with only local sample data are left out of a live build, and the server test screen
// out of a store build, so a deep link cannot open them. Screens with demo data but an old link pointing at them
// stay routable and show ComingSoon in a live build instead.
describe('Canlı sürümde demo ekranları', () => {
  const layout = readFileSync(join(APP, '_layout.tsx'), 'utf8');
  /** The screen names listed in the (innermost) Stack.Protected block with this guard. */
  const group = (guard: string) => {
    const open = layout.indexOf(`<Stack.Protected guard={${guard}}>`);
    assert.ok(open >= 0, `grup yok: ${guard}`);
    const body = layout.slice(open, layout.indexOf('</Stack.Protected>', open));
    return { open, names: [...body.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((m) => m[1]) };
  };

  test('yönetim ve demo ekranları canlıda yok, oturum açmış grupta', () => {
    const { open, names } = group('!liveMode()');
    const demo = ['yetki', 'oyun-yonetimi', 'animasyon-yonetimi', 'pk-yonetimi', 'lucky-yonetimi', 'ajans/panel', 'ajans/ag', 'ajans/hesap/[id]', 'ajans/yonetim/index', 'ajans/yonetim/[id]'];
    assert.deepEqual([...names].sort(), [...demo].sort());
    assert.ok(open > layout.indexOf('<Stack.Protected guard={loggedIn}>') && open < layout.indexOf('<Stack.Protected guard={!loggedIn}>'));
  });

  test('sunucu deneme ekranı yalnızca önizleme sürümünde', () => {
    const { open, names } = group('IS_DEMO');
    assert.deepEqual(names, ['sunucu-hesabi']);
    assert.ok(open > layout.indexOf('<Stack.Protected guard={loggedIn}>') && open < layout.indexOf('<Stack.Protected guard={!loggedIn}>'));
  });

  test('örnek veriyle dolu ekranlar canlıda "yakında" gösterir', () => {
    for (const route of ['(tabs)/anlar', 'aile', 'kabile/index', 'kabile/sohbet', 'kabile/merkez', 'kabile/iliski', 'kabile/kasa', 'davet', 'coins-bank']) {
      const src = readFileSync(join(APP, `${route}.tsx`), 'utf8');
      assert.match(src, /liveMode\(\)[^\n]*<ComingSoon /, `${route}: canlıda ComingSoon yok`);
    }
  });

  test('Anlar sekmesi canlıda gizli', () => {
    const tabs = readFileSync(join(APP, '(tabs)/_layout.tsx'), 'utf8');
    assert.match(tabs, /name="anlar"[^\n]*liveMode\(\) \? \{ href: null \}/);
  });
});
