// Oyunlarda güçlü efektler (games/fx/divine-fx): the look climbs with the title, the embers are the same on every
// phone, an ember flies out and burns out, and the screens show the layer only with the setting on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';

import { DIVINE, EMBERS, RISING, emberAt, makeEmbers, makeRising } from '@/components/games/fx/divine-look';

const SRC = resolve(import.meta.dirname, '../src');
const read = (file: string) => readFileSync(resolve(SRC, file), 'utf8');

describe('Oyunlarda güçlü efektler', () => {
  test('her başlık bir öncekinden güçlü; şimşek EFSANE ile, ışık sütunu JACKPOT ile gelir', () => {
    const order = ['big', 'mega', 'epic', 'jackpot'] as const;
    order.slice(1).forEach((t, i) => {
      assert.ok(DIVINE[t].power > DIVINE[order[i]].power, t);
      assert.ok(DIVINE[t].rays > DIVINE[order[i]].rays, t);
    });
    assert.deepEqual(order.filter((t) => DIVINE[t].lightning), ['epic', 'jackpot']);
    assert.deepEqual(order.filter((t) => DIVINE[t].beam), ['jackpot']);
  });

  test('kıvılcımlar her telefonda aynı; zayıf telefon daha azını çizer', () => {
    assert.deepEqual(makeEmbers(20), makeEmbers(20));
    assert.deepEqual(makeRising(20), makeRising(20));
    assert.ok(EMBERS.low < EMBERS.high && RISING.low < RISING.high);
    assert.equal(makeEmbers(EMBERS.high).length, EMBERS.high);
  });

  test('bir kıvılcım dışarı uçar, küçülür ve ömrü bitince söner', () => {
    const [e] = makeEmbers(1);
    assert.equal(emberAt(e, -1, 100, 100, 1, 1), null);
    const near = emberAt(e, 50, 100, 100, 1, 1)!;
    const far = emberAt(e, e.life * 0.8, 100, 100, 1, 1)!;
    const d = (p: { x: number; y: number }) => Math.hypot(p.x - 100, p.y - 100);
    assert.ok(d(far) > d(near));
    assert.ok(far.r < near.r);
    assert.equal(emberAt(e, e.life + 1, 100, 100, 1, 1), null);
  });

  test('telefon ve web aynı parçaları verir; ekranlar katmanı yalnız ayar açıkken gösterir', () => {
    const exports = (f: string) => [...read(f).matchAll(/^export function (\w+)/gm)].map((m) => m[1]).sort();
    assert.deepEqual(exports('components/games/fx/divine-fx.native.tsx'), exports('components/games/fx/divine-fx.tsx'));
    assert.match(read('components/games/fx/win-fx.tsx'), /const divine = lively && gameFx;/);
    assert.match(read('components/games/fx/jackpot-show.tsx'), /const divine = !calm && gameFx;/);
    assert.match(read('components/games/line-slot.tsx'), /const aura = settings\.gameFx && !still && !settings\.effectsOff;/);
  });
});
