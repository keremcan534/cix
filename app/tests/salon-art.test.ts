/// <reference types="node" />
// Oyun Salonu's look (components/games/fx/salon, fx/salon-art): every picture the art list names for the Salon
// (docs/GORSEL_URETIM_LISTESI.md §16, §17, §19, §24) has one line in the registry; a line that is open names a PNG on
// disk, and a PNG that has been delivered has its line open (so a dropped-in file can't be forgotten). Every Salon
// screen is drawn in the shared shell, and none of them brings back purple. Reads the sources as text.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const ART_DIR = resolve(SRC, '../assets/art');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');

const registry = read('components/games/fx/salon-art.tsx');
const names = [...(registry.match(/export type SalonArtName =([\s\S]*?);/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
// `  'name': require('../../../../assets/art/name.png'),`, open or behind `// `.
const lines = [...registry.matchAll(/^ {2}(\/\/ )?'([a-z0-9-]+)': require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/art\/([a-z0-9-]+)\.png'\),$/gm)].map((m) => ({ open: !m[1], name: m[2], file: m[3] }));

describe('Oyun Salonu görselleri', () => {
  test('listedeki her görselin kayıtta bir satırı var, dosya adı kendi adı', () => {
    assert.ok(names.length >= 60, `${names.length} ad`);
    for (const n of names) {
      const line = lines.find((l) => l.name === n);
      assert.ok(line, `${n}: satır yok`);
      assert.equal(line.file, n, `${n}: dosya adı`);
    }
    assert.equal(lines.length, names.length, 'fazla satır');
  });

  test('açık satırın PNG’si diskte, gelen PNG’nin satırı açık', () => {
    for (const l of lines) {
      const there = existsSync(resolve(ART_DIR, `${l.file}.png`));
      if (l.open) assert.ok(there, `${l.file}.png yok ama satırı açık`);
      else assert.ok(!there, `${l.file}.png geldi: salon-art.tsx'te satırının başındaki // kaldırılmalı`);
    }
  });

  test('her Oyun Salonu ekranı ortak sahneyle ve ortak kontrollerle çizilir', () => {
    const screens = ['line-slot.tsx', 'gold-tree.tsx', 'fener.tsx', 'board.tsx', 'fish.tsx', 'rocket.tsx', 'bilye.tsx', 'wheel.tsx'];
    for (const f of screens) {
      const code = read(`components/games/${f}`);
      assert.match(code, /<SalonStage\b/, `${f}: SalonStage`);
      assert.match(code, /\b(SpinControls|WalletRow|BalancePill)\b/, `${f}: ortak bakiye`);
      // The balance and the stake are the shell's: no game paints its own tint on them any more.
      assert.doesNotMatch(code, /<(BalancePill|BetStepper)[^>]*\btint=/, `${f}: kendi rengi`);
    }
  });

  test('Kızıl Yedi giydirmesi: her sembolün resmi var, kullandığı her görsel teslim edilmiş satır', () => {
    const skin = read('components/games/fx/slot-skin.tsx');
    const used = [...skin.matchAll(/pic\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
    // The 16th, the cover, is the game's picture in the lists (components/GameArt).
    assert.equal(new Set(used).size, 15, 'paketin kapak dışındaki 15 görseli');
    assert.match(read('components/GameArt.tsx'), /super777: 'kizil-yedi-kapak'/);
    used.push('kizil-yedi-kapak');
    for (const n of used)assert.ok(lines.find((l) => l.name === n)?.open, `${n}: kayıtta açık değil`);
    const configs = read('lib/slot-configs.ts');
    const symbols = [...(configs.match(/export const SUPER777[\s\S]*?symbols: \{([\s\S]*?)\n {2}\},/)?.[1] ?? '').matchAll(/^ {4}(\w+): \{/gm)].map((m) => m[1]);
    assert.deepEqual(symbols.sort(), ['cherry', 'diamond', 'grape', 'lemon', 'mango', 'seven']);
    const block = skin.match(/symbols: \{([\s\S]*?)\n {4}\},/)?.[1] ?? '';
    for (const x of symbols) assert.match(block, new RegExp(`\\b${x}: pic\\(`), `${x}: resmi yok`);
  });

  test('Oyun Salonu renkleri mor değil (palet: lacivert, turkuaz, altın, mercan)', () => {
    const purple = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return b > g + 40 && r > g + 40 && b > r - 30;
    };
    const files = ['components/games/fx/salon.tsx', 'components/games/slot-kit.tsx', 'components/games/line-slot.tsx', 'components/games/gold-tree.tsx', 'components/games/fener.tsx', 'components/games/board.tsx', 'components/games/bilye.tsx', 'components/games/rocket.tsx', 'components/games/fish.tsx', 'components/games/fx/win-fx.tsx', 'components/games/fx/chips.tsx'];
    for (const f of files) {
      const found = [...read(f).matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]).filter(purple);
      assert.deepEqual(found, [], f);
    }
  });
});
