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
    for (const route of [] as string[]) {
      const src = readFileSync(join(APP, `${route}.tsx`), 'utf8');
      assert.match(src, /liveMode\(\)[^\n]*<ComingSoon /, `${route}: canlıda ComingSoon yok`);
    }
  });

  // Jeton Noktası is on the server (lib/live/jeton): the banks, a host's diamond sale, a bank's stock and coin sales.
  test('Jeton Noktası canlıda sunucudan', () => {
    assert.match(readFileSync(join(APP, 'coins-bank.tsx'), 'utf8'), /liveMode\(\) \? <LiveCoinsBank \/> : <DemoCoinsBank \/>/);
    assert.match(readFileSync(join(APP, '../components/coins-bank-live.tsx'), 'utf8'), /from '@\/lib\/live\/jeton'/);
  });

  // Arkadaşını Getir is on the server (server/api/referrals.mjs, lib/live/rewards).
  test('Arkadaşını Getir canlıda sunucudan', () => {
    assert.match(readFileSync(join(APP, 'davet.tsx'), 'utf8'), /liveMode\(\) \? <LiveInvite \/> : <DemoInvite \/>/);
    assert.match(readFileSync(join(APP, '../components/invite-live.tsx'), 'utf8'), /from '@\/lib\/live\/rewards'/);
  });

  // Aile is on the server (lib/live/family): its list, my family, the family chat, Görevler and Uyum Köşesi show
  // what the server answers; the demo's treasury screen sends a live build to Görevler (the chests are there).
  test('Aile canlıda sunucudan', () => {
    assert.match(readFileSync(join(APP, 'aile.tsx'), 'utf8'), /liveMode\(\) \? <LiveFamilies \/> : <DemoFamilies \/>/);
    assert.match(readFileSync(join(APP, 'kabile/sohbet.tsx'), 'utf8'), /liveMode\(\) \? <LiveFamilyChat \/> : <DemoKabileChat \/>/);
    assert.match(readFileSync(join(APP, 'kabile/merkez.tsx'), 'utf8'), /liveMode\(\) \? <LiveFamilyTasks \/> : <DemoKabileMerkez \/>/);
    assert.match(readFileSync(join(APP, 'kabile/iliski.tsx'), 'utf8'), /liveMode\(\) \? <LiveFamilyPairs \/> : <DemoIliski \/>/);
    assert.match(readFileSync(join(APP, 'kabile/kasa.tsx'), 'utf8'), /liveMode\(\) \? <Redirect href=\{KABILE_ROUTES\.merkez\} \/> : <DemoKabileKasa \/>/);
    for (const f of ['family-live', 'family-center-live']) assert.match(readFileSync(join(APP, `../components/${f}.tsx`), 'utf8'), /from '@\/lib\/live\/family'/);
  });

  // Keşfet: five tabs, no gender filter (men see women, women see men), the globe picks the country.
  test('Keşfet sekmeleri ve dünya filtresi', () => {
    const src = readFileSync(join(APP, '(tabs)/kesfet.tsx'), 'utf8');
    assert.match(src, /TABS = \['Ana Sayfa', 'Yakındakiler', 'Öne çıkanlar', 'Çevrim içi', 'Yeni kullanıcılar'\]/);
    assert.match(src, /name="globe-outline"/);
    assert.doesNotMatch(src, /Cinsiyet|onlineOnly|newest/);
    assert.match(src, /'Öne çıkanlar': 'featured', 'Yeni kullanıcılar': 'new'/);
  });

  // The agency owner lands on their agency; sub-agencies are "Referans ajanslar", added only by management.
  test('Ajans paneli: sahibi kendi ajansına iner, Referans ajanslar yalnız görüntülenir', () => {
    const hub = readFileSync(join(APP, '../components/agency-net-hub.tsx'), 'utf8');
    assert.match(hub, /router\.replace\(\{ pathname: '\/ajans\/ofis', params: \{ id: ownId, hub: '1' \} \}/);
    const src = readFileSync(join(APP, 'ajans/ofis.tsx'), 'utf8');
    assert.match(src, /label: 'Referans ajanslar'/);
    assert.match(src, /\{ key: 'more', label: 'Diğer', hidden: !hub \}/);
    assert.doesNotMatch(src, /Alt ajans oluştur|CreateSub|submitSub|'Alt ajanslar'/);
    assert.match(src, /\['week', 'Haftalık'\]/);
    assert.match(src, /earningsCsv\(rows\)/);
  });

  // Anlar is on the server (lib/live/moments): a live build shows the tab and the server's feed, never the sample one.
  test('Anlar canlıda sunucudan, sekme görünür', () => {
    const tabs = readFileSync(join(APP, '(tabs)/_layout.tsx'), 'utf8');
    assert.doesNotMatch(tabs, /name="anlar"[^\n]*href: null/);
    const src = readFileSync(join(APP, '(tabs)/anlar.tsx'), 'utf8');
    assert.match(src, /liveMode\(\) \? <LiveMoments \/> : <DemoMoments \/>/);
    assert.match(src, /from '@\/lib\/live\/moments'/);
  });
});
