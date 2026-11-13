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
const ASSETS = resolve(SRC, '../assets');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');

const registry = read('components/games/fx/salon-art.tsx');
const names = [...(registry.match(/export type SalonArtName =([\s\S]*?);/)?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
// `  'name': require('../../../../assets/art/name.png'),`, open or behind `// `. Kızıl Yedi's pack is in assets/art,
// the packs after it in assets/games (an opaque background as a JPEG).
const lines = [...registry.matchAll(/^ {2}(\/\/ )?'([a-z0-9-]+)': require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/(art|games)\/([a-z0-9-]+)\.(png|jpg)'\),$/gm)].map((m) => ({ open: !m[1], name: m[2], dir: m[3], file: m[4], ext: m[5] }));
/** Where a picture of this name could have been dropped. */
const dropped = (file: string) => [`art/${file}.png`, `games/${file}.png`, `games/${file}.jpg`].some((p) => existsSync(resolve(ASSETS, p)));

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

  test('açık satırın görseli diskte, gelen görselin satırı açık', () => {
    for (const l of lines) {
      if (l.open) assert.ok(existsSync(resolve(ASSETS, l.dir, `${l.file}.${l.ext}`)), `${l.dir}/${l.file}.${l.ext} yok ama satırı açık`);
      else assert.ok(!dropped(l.file), `${l.file} geldi: salon-art.tsx'te satırının başındaki // kaldırılmalı`);
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

  test('giydirilen her makinenin her sembolünün resmi var, kullandığı her görsel teslim edilmiş satır', () => {
    const skin = read('components/games/fx/slot-skin.tsx');
    const configs = read('lib/slot-configs.ts');
    const used = [...skin.matchAll(/pic\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
    for (const n of used) assert.ok(lines.find((l) => l.name === n)?.open, `${n}: kayıtta açık değil`);
    // Each machine's block in SLOT_SKINS and its symbols in lib/slot-configs (a reel game of its own, Bereket Ağacı,
    // keeps its symbols by lib/gold-tree's names).
    const CONFIG: Record<string, string> = { jackpot: 'MEGA', super777: 'SUPER777', jungle: 'JUNGLE', pinata: 'PINATA', spellbook: 'SPELLBOOK', neon: 'NEON' };
    const table = skin.slice(skin.indexOf('export const SLOT_SKINS'), skin.indexOf('\n};', skin.indexOf('export const SLOT_SKINS')));
    const blocks = [...table.matchAll(/^ {2}(\w+): \{\r?\n([\s\S]*?)\r?\n {2}\},$/gm)].map((m) => [m[1], m[2]] as const);
    assert.deepEqual(blocks.map(([id]) => id).sort(), ['goldtree', 'jackpot', 'jungle', 'neon', 'pinata', 'spellbook', 'super777']);
    const configOf = (name: string) => {
      const at = configs.indexOf(`export const ${name}: SlotConfig = {`);
      assert.ok(at >= 0, name);
      return configs.slice(at, configs.indexOf('\n};', at));
    };
    for (const [id, block] of blocks) {
      let symbols = ['tree', 'red', 'blue', 'green'];
      if (id !== 'goldtree') {
        const config = configOf(CONFIG[id]);
        symbols = [...(config.match(/symbols: \{([\s\S]*?)\r?\n {2}\},/)?.[1] ?? '').matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
        // Vahşi Patika's card letters come in through a spread (`...CARDS`).
        if (config.includes('...CARDS')) symbols.push('ten', 'j', 'q', 'k', 'a');
      }
      assert.ok(symbols.length >= 4, `${id}: semboller`);
      const own = block.match(/symbols: \{([\s\S]*?)\r?\n {4}\},/)?.[1] ?? '';
      for (const x of symbols) assert.ok(own.includes(`${x}: pic(`), `${id} ${x}: resmi yok`);
    }
    // Their covers are the games' pictures in the lists (components/GameArt).
    const covers = read('components/GameArt.tsx');
    for (const [id, cover] of Object.entries({ super777: 'kizil-yedi-kapak', jackpot: 'hazine-kulesi-kapak', jungle: 'vahsi-patika-kapak', neon: 'neon-bulvar-kapak', pinata: 'konfeti-kutusu-kapak', spellbook: 'kayip-parsomen-kapak', goldtree: 'bereket-agaci-kapak', foodwheel: 'lezzet-carki-kapak', magiccard: 'sihir-destesi-kapak' })) {
      assert.match(covers, new RegExp(`${id}: '${cover}'`), id);
      assert.ok(lines.find((l) => l.name === cover)?.open, `${cover}: kayıtta açık değil`);
    }
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
