/// <reference types="node" />
// What players read about chance (Güncelleme 7, item 6, the owners' decision): no house details and nothing that
// explains winnings in Şanslı and the games (no house share, no share going to a JACKPOT fund, no average return),
// only how to play; nor how a result is made ("decided on the server", slices drawn equal, boosters, the pool; owners,
// 23 Nov 2026). The odds tables stay: Google Play (Payments §7) and Apple (3.1.1) want the odds of a paid
// random item shown before buying. The gift panel (items 7 and 8): the Çift shelf and its note, Çantam as the bag.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const GAMES = readdirSync(new URL('../src/components/games', import.meta.url))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => `src/components/games/${f}`);
/** The player-facing places that talk about the games and Şanslı (the room's own screen is checked elsewhere). */
const PLAYER = [
  ...GAMES,
  'src/components/games/fx/info-sheet.tsx',
  'src/data/games.ts',
  'src/lib/games.ts',
  'src/lib/casino-odds.ts',
  'src/lib/lucky.ts',
  'src/components/room/panels.tsx',
  'src/components/room/gift-sheet.tsx',
  'src/app/oyunlar.tsx',
  '../server/api/casino.mjs',
];
const HOUSE = [/sunucuda belirlen/i, /sunucu belirler/i, /aynı boyda çizilir/i, /şansı değiştirmez/i, /0,4 \/ x/, /kalkmadan patlar/i, /havuzu yetmez/i, /kasaya/i, /kasa payı/i, /kasada kal/i, /kasa kazan/i, /kazananlara\s+(rastgele\s+)?dağıl/i, /ortalama[^.\n]*döner/i, /%\s?40 eder/, /fonuna eklenir/i, /(JACKPOT|GRAND)[’']a eklenir/, /Ödül havuzu şu an/, /Ödül rezervi/, /En yüksek ödül ×/];

describe('Oyun yazıları: kasa ve kazanç açıklaması yok, olasılıklar duruyor', () => {
  test('oyuncunun gördüğü dosyalarda kasa payı, fon payı ve ortalama geri ödeme yazmaz', () => {
    for (const file of PLAYER) {
      const text = src(file);
      for (const re of HOUSE) assert.doesNotMatch(text, re, `${file}: ${re}`);
    }
  });

  test('olasılık tabloları yerinde', () => {
    const has: [string, RegExp][] = [
      ['src/components/room/gift-sheet.tsx', />Olasılık</],
      ['src/components/games/rocket-live.tsx', /Ulaşma şansı/],
      ['src/components/games/rocket.tsx', /Ulaşma şansı/],
      ['src/components/games/wheel.tsx', />Şans</],
      ['src/components/games/board.tsx', /Şans, o seçeneğin bir turda kazanma olasılığıdır/],
      ['src/components/games/fish.tsx', />Vurulma</],
      ['src/components/games/bilye.tsx', /Düşme şansı/],
    ];
    for (const [file, re] of has) assert.match(src(file), re, file);
    // Canlı Yörünge may crash early when its pool is short: said (without the pool), so its table doesn't overstate the odds.
    assert.match(src('src/components/games/rocket-live.tsx'), /Çok yakıt alınan turlarda roket tablodakinden daha erken patlayabilir/);
  });
});

describe('Hediye paneli rafları', () => {
  const sheet = src('src/components/room/gift-sheet.tsx');
  test('İkili rafı Çift oldu; yanlış %2 yakınlık sözü yok', () => {
    assert.match(sheet, /\{ key: 'couple', label: 'Çift' \}/);
    assert.doesNotMatch(sheet, /label: 'İkili'/);
    assert.doesNotMatch(sheet, /%2 artırır/);
    assert.match(src('src/lib/gifts-admin-core.ts'), /couple: 'Çift'/);
  });

  test('Çantam rafı 3B çanta simgesi ve adet rozeti, ekran okuyucuya adıyla', () => {
    assert.match(sheet, /<Icon3D name="bag" size=\{24\} \/>/);
    assert.match(sheet, /accessibilityLabel=\{n \? `\$\{s\.label\}, \$\{n\} çeşit hediye` : s\.label\}/);
  });
});
