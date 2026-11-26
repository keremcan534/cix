/// <reference types="node" />
// Oyun anahtarları (server/api/game-switch.mjs, lib/remote-config gameShut, lib/game-switch): the config's two lists
// read defensively, a shut game decided as the server decides it, the ids the same on both sides, and every screen
// that offers a game asking before it does.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CASINO_GAMES, ROOM_GAMES } from '@/data/games';
import { EMPTY_CONFIG, gameShut, parseConfig } from '@/lib/remote-config';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as rules from '../../server/api/casino-rules.mjs';
import * as registry from '../../server/api/live-registry.mjs';
import { TABLE_GAMES } from '../../server/api/room-games-rules.mjs';

describe('Oyun anahtarları: sunucunun listeleri', () => {
  test('iki liste okunur; bozuk değer, tekrar ve eski sunucunun eksik alanı boş liste olur', () => {
    const c = parseConfig({ gamesOff: ['lucky', 'lucky', 'LUDO', 42, '', 'x'.repeat(31), 'ludo'], gamesStaff: ['wheel', null] });
    assert.deepEqual([c.gamesOff, c.gamesStaff], [['lucky', 'ludo'], ['wheel']]);
    for (const raw of [{}, { gamesOff: 'lucky', gamesStaff: { wheel: true } }, { featuresOff: ['games'] }]) {
      const x = parseConfig(raw);
      assert.deepEqual([x.gamesOff, x.gamesStaff], [[], []], JSON.stringify(raw));
    }
    assert.deepEqual([EMPTY_CONFIG.gamesOff, EMPTY_CONFIG.gamesStaff], [[], []]);
  });

  test('kapalı oyun herkese kapalı, yöneticilere açık oyun yalnız üyeye; Acil durum › Oyunlar hepsini kapatır', () => {
    const c = parseConfig({ gamesOff: ['lucky'], gamesStaff: ['wheel'] });
    assert.deepEqual([gameShut(c, 'lucky', false), gameShut(c, 'lucky', true)], [true, true]);
    assert.deepEqual([gameShut(c, 'wheel', false), gameShut(c, 'wheel', true)], [true, false]);
    assert.deepEqual([gameShut(c, 'ludo', false), gameShut(c, 'ludo', true)], [false, false]);
    const stop = parseConfig({ featuresOff: ['games'] });
    assert.deepEqual([gameShut(stop, 'ludo', true), gameShut(stop, 'jackpot', false)], [true, true]);
    assert.equal(gameShut(EMPTY_CONFIG, 'lucky', false), false, 'sunucusuz demo hiçbir oyunu kapatmaz');
  });

  test('sunucunun anahtar listesindeki her oyunun kimliği uygulamada aynı', () => {
    const ids = registry.SWITCH_GAMES.map((g) => g.id);
    const serverCasino = rules.GAMES.map((g) => g.id);
    const tables = Object.keys(TABLE_GAMES);
    assert.deepEqual(ids, [...serverCasino, 'wheel', 'lucky', ...tables], 'Oyun Salonu, Rüzgâr Gülü, Şanslı, oda masaları');
    const casino = CASINO_GAMES.map((g) => g.id as string);
    for (const id of serverCasino) assert.ok(casino.includes(id), `${id} uygulamanın Oyun Salonu'nda`);
    const room = ROOM_GAMES.map((g) => g.id as string);
    for (const id of tables) assert.ok(room.includes(id), `${id} uygulamanın oda oyunlarında`);
    // The app's own 'wheel' is the demo's Şans Çarkı, which the server never plays (a live build shows it off): the
    // server's 'wheel' is Rüzgâr Gülü. Shutting Rüzgâr Gülü hides both, which is harmless.
    assert.ok(!serverCasino.includes('wheel'));
    assert.deepEqual(registry.REGISTRY.games_staff.bounds.options, registry.REGISTRY.casino_off.bounds.options);
  });

  test('oyun sunan her ekran kapalı oyunu sorar (menü, oyun paneli, çark kısayolu, Şanslı rafı, Oyun Merkezi)', () => {
    const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
    const room = src('components/room/live-room.tsx');
    assert.match(room, /const shut = useGameShut\(\)/);
    assert.match(room, /wheelShown = [^\n]*!shut\('wheel'\)/);
    assert.match(room, /roomGames\s*\.filter\(\(g\) => g\.active && !shut\(g\.id\)/);
    assert.match(room, /\.\.\.\(shut\('wheel'\) \? \[\] : \[\{ key: 'cg-ruzgar'/);
    assert.match(room, /\.filter\(\(g\) => g\.active && !shut\(g\.id\) && g\.fromRoom\)/);
    const panel = src('components/games/game-panel.tsx');
    assert.match(panel, /const shut = useGameShut\(\)/);
    assert.match(panel, /!shut\('wheel'\)/);
    assert.equal((panel.match(/!shut\(g\.id\)/g) ?? []).length, 2, 'oda oyunları ve Oyun Salonu');
    assert.match(src('components/room/gift-sheet.tsx'), /luckyShelf = gamblingLevelOk\(wealthLevel\) && !shut\('lucky'\)/);
    const center = src('app/oyunlar.tsx');
    assert.match(center, /!shut\('wheel'\) && \(/);
    assert.match(center, /casino\.filter\(\(g\) => g\.active && !shut\(g\.id\)\)/);
    assert.match(center, /g\.phase === phase && !shut\(g\.id\)/);
  });
});
