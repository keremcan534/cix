/// <reference types="node" />
// The heart level's looks (lib/heart-tiers): every level has exactly one look and the looks only grow with the
// level; the levels are the server's (server/api/one-on-one.mjs HEART_LEVELS); the words are right; the motion
// curves loop without a jump and stand still with "Animasyonları azalt" or "Efektleri kapat".
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  HEART_LEVELS,
  HEART_TIERS,
  HEART_TOP,
  MEET,
  curve,
  glowCurve,
  heartLevelOf,
  heartMoves,
  heartShare,
  heartTier,
  heartTitle,
  heartView,
  lvAt,
  nextHeartTier,
  nextLookText,
  particleCurves,
  particleWindows,
  pulseCurves,
  rippleCurves,
  scaleCurve,
  type Curve,
  type HeartMotion,
} from '@/lib/heart-tiers';
import { INTIMACY, formatIntimacy } from '@/data/messages-ui';

const MOTIONS: HeartMotion[] = ['still', 'breathe', 'pulse', 'beat'];
/** A curve Animated can loop: inputs rise from 0 to 1, as many outputs as inputs. */
function assertLoopable(c: Curve, name: string) {
  assert.equal(c.inputRange.length, c.outputRange.length, `${name}: girdi ve çıktı sayısı`);
  assert.ok(c.inputRange.length >= 2, `${name}: en az iki nokta`);
  assert.equal(c.inputRange[0], 0, `${name}: 0'dan başlar`);
  assert.equal(c.inputRange[c.inputRange.length - 1], 1, `${name}: 1'de biter`);
  for (let i = 1; i < c.inputRange.length; i++) assert.ok(c.inputRange[i] > c.inputRange[i - 1], `${name}: girdiler artar`);
  for (const v of c.outputRange) assert.ok(Number.isFinite(v), `${name}: sayı`);
}

describe('Kalp seviyeleri sunucudakiyle aynı', () => {
  test('eşikler server/api/one-on-one.mjs HEART_LEVELS ile aynı', () => {
    const server = fs.readFileSync(path.resolve(import.meta.dirname, '../../server/api/one-on-one.mjs'), 'utf8');
    const levels = /export const HEART_LEVELS = \[([^\]]+)\]/.exec(server)?.[1].split(',').map((x) => Number(x.trim().replace(/_/g, '')));
    assert.deepEqual(levels, [...HEART_LEVELS]);
    assert.equal(HEART_TOP, 10);
  });

  test('puan seviyeye sunucunun kuralıyla döner (eşikte yeni seviye)', () => {
    assert.equal(heartLevelOf(0), 0);
    assert.equal(heartLevelOf(299), 0);
    assert.equal(heartLevelOf(300), 1);
    assert.equal(heartLevelOf(4_999), 2);
    assert.equal(heartLevelOf(5_000), 3);
    assert.equal(heartLevelOf(249_999), 6);
    assert.equal(heartLevelOf(250_000), 7);
    assert.equal(heartLevelOf(2_000_000), 10);
    assert.equal(heartLevelOf(9_000_000), 10);
    HEART_LEVELS.forEach((p, level) => assert.equal(heartLevelOf(p), level));
  });

  test('demodaki örnek kalpler her görünümü gösterir', () => {
    const shown = new Set(Object.values(INTIMACY).map((p) => heartTier(heartLevelOf(p)).id));
    assert.deepEqual([...shown].sort(), HEART_TIERS.map((t) => t.id).sort());
  });

  test('kalp görünümü sunucunun pair.heart biçiminde', () => {
    assert.deepEqual(heartView(7_400), { points: 7_400, level: 3, floor: 5_000, next: 15_000 });
    assert.deepEqual(heartView(0), { points: 0, level: 0, floor: 0, next: 300 });
    assert.deepEqual(heartView(2_150_000), { points: 2_150_000, level: 10, floor: 2_000_000, next: null });
    assert.equal(heartView(-5).points, 0);
  });

  test('ilerleme çubuğu seviyenin içinde 0 ile 1 arası, en üstte dolu', () => {
    assert.equal(heartShare(heartView(5_000)), 0);
    assert.equal(heartShare(heartView(10_000)), 0.5);
    assert.equal(heartShare(heartView(2_150_000)), 1);
    assert.equal(heartShare({ points: 50, level: 1, floor: 300, next: 1_500 }), 0, 'eşiğin altı 0');
    assert.equal(heartShare({ points: 9_999, level: 1, floor: 300, next: 1_500 }), 1, 'üstü 1');
  });
});

describe('Kalp görünümleri seviyeyle büyür', () => {
  test('0–10 arasındaki her seviyenin tek bir görünümü var, boşluk yok', () => {
    assert.equal(HEART_TIERS[0].from, 0);
    assert.equal(HEART_TIERS[HEART_TIERS.length - 1].to, HEART_TOP);
    for (let i = 1; i < HEART_TIERS.length; i++) assert.equal(HEART_TIERS[i].from, HEART_TIERS[i - 1].to + 1, `${HEART_TIERS[i].name} bir öncekinin ardından başlar`);
    for (let level = 0; level <= HEART_TOP; level++) assert.equal(HEART_TIERS.filter((t) => level >= t.from && level <= t.to).length, 1, `Lv.${level}`);
  });

  test('kesme noktaları: 1–2 yumuşak, 3–4 ışıltı, 5–6 nabız, 7–8 tutku, 9–10 sonsuz', () => {
    const ids = Array.from({ length: HEART_TOP + 1 }, (_, l) => heartTier(l).id);
    assert.deepEqual(ids, ['none', 'soft', 'soft', 'glow', 'glow', 'pulse', 'pulse', 'beat', 'beat', 'crown', 'crown']);
    assert.equal(heartTier(99).id, 'crown', 'en üstün üstü en üst görünür');
    assert.equal(heartTier(-1).id, 'none');
    assert.equal(heartTier(Number.NaN).id, 'none');
  });

  test('her görünüm bir öncekinden fazlasını yapar', () => {
    const motionRank: Record<HeartMotion, number> = { still: 0, breathe: 1, pulse: 2, beat: 3 };
    const lineRank = { none: 0, still: 1, one: 2, both: 3 } as const;
    for (let i = 1; i < HEART_TIERS.length; i++) {
      const [a, b] = [HEART_TIERS[i - 1], HEART_TIERS[i]];
      assert.ok(motionRank[b.motion] >= motionRank[a.motion], `${b.name}: hareket`);
      assert.ok(lineRank[b.line] >= lineRank[a.line], `${b.name}: çizgi`);
      assert.ok(b.particles >= a.particles, `${b.name}: yükselen kalpler`);
      assert.ok(!a.pin || b.pin, `${b.name}: profildeki kalp`);
    }
    // The heartbeat line moves from the pulse look; the profile photo's heart beats from the beat look.
    assert.deepEqual(HEART_TIERS.filter((t) => t.line === 'one' || t.line === 'both').map((t) => t.from), [5, 7, 9]);
    assert.deepEqual(HEART_TIERS.filter((t) => t.pin).map((t) => t.from), [7, 9]);
    assert.ok(heartTier(HEART_TOP).rim, 'en üst görünümün altın kenarı var');
  });

  test('hareket eden her görünümün bir döngü süresi var, duranınki yok', () => {
    for (const t of HEART_TIERS) {
      if (t.motion === 'still') assert.equal(t.periodMs, 0, t.name);
      else assert.ok(t.periodMs >= 800 && t.periodMs <= 4000, `${t.name}: sakin bir tempo`);
    }
  });

  test('renkler mor değil (palette: mercan, altın)', () => {
    const purple = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return b > g + 40 && r > g + 40 && b > r - 30;
    };
    for (const t of HEART_TIERS.filter((x) => x.id !== 'none')) {
      for (const c of [...t.fill, t.tint, t.glow, t.rim].filter((x): x is string => !!x)) assert.ok(!purple(c), `${t.name}: ${c}`);
    }
  });
});

describe('Kalp sözleri', () => {
  test('seviye eki sayıya göre', () => {
    assert.deepEqual(
      Array.from({ length: 10 }, (_, i) => lvAt(i + 1)),
      ['Lv.1’de', 'Lv.2’de', 'Lv.3’te', 'Lv.4’te', 'Lv.5’te', 'Lv.6’da', 'Lv.7’de', 'Lv.8’de', 'Lv.9’da', 'Lv.10’da'],
    );
  });

  test('sonraki görünüm ne getirir', () => {
    assert.equal(nextLookText(0), 'Lv.1’de kalbiniz kıvılcımlanır');
    assert.equal(nextLookText(2), 'Lv.3’te kalbiniz ışıldar');
    assert.equal(nextLookText(4), 'Lv.5’te kalpler atmaya başlar');
    assert.equal(nextLookText(5), 'Lv.7’de kalp atışları aranızda gidip gelir');
    assert.equal(nextLookText(8), 'Lv.9’da kalbiniz altınla parlar');
    assert.equal(nextLookText(9), null);
    assert.equal(nextLookText(10), null);
    assert.equal(nextHeartTier(10), null);
    assert.equal(nextHeartTier(6)?.id, 'beat');
  });

  test('Yakınlık puanı kısa yazılır', () => {
    assert.deepEqual(
      [0, 940, 1_280, 7_400, 21_000, 300_000, 999_999, 1_100_000, 2_150_000].map(formatIntimacy),
      ['0', '940', '1,3B', '7,4B', '21B', '300B', '1Mn', '1,1Mn', '2,1Mn'],
    );
  });

  test('başlık seviye ve görünüm adıyla', () => {
    assert.equal(heartTitle(0), 'Kalp Lv.0');
    assert.equal(heartTitle(3), 'Kalp Lv.3 · Işıltı');
    assert.equal(heartTitle(10), 'Kalp Lv.10 · Sonsuz');
  });
});

describe('Kalp hareketi', () => {
  test('"Animasyonları azalt" ve "Efektleri kapat" kalbi durdurur', () => {
    const beat = heartTier(7);
    const off = { reduceMotion: false, effectsOff: false };
    assert.equal(heartMoves(beat, off), true);
    assert.equal(heartMoves(beat, { ...off, reduceMotion: true }), false);
    assert.equal(heartMoves(beat, { ...off, effectsOff: true }), false);
    assert.equal(heartMoves(heartTier(1), off), false, 'kıvılcım zaten durağan');
    assert.equal(heartMoves(heartTier(0), off), false);
  });

  test('her eğri sıçramadan döner: girdiler 0→1 artar, çıktı başladığı yerde biter', () => {
    for (const m of MOTIONS) {
      for (const [name, c] of [[`boyut ${m}`, scaleCurve(m)], [`ışık ${m}`, glowCurve(m)]] as const) {
        assertLoopable(c, name);
        assert.equal(c.outputRange[0], c.outputRange[c.outputRange.length - 1], `${name}: başı ve sonu aynı`);
      }
    }
    const r = rippleCurves();
    assertLoopable(r.scale, 'halka boyutu');
    assertLoopable(r.opacity, 'halka görünürlüğü');
    assert.equal(r.opacity.outputRange[0], 0);
    assert.equal(r.opacity.outputRange[r.opacity.outputRange.length - 1], 0);
  });

  test('kalp ölçülü büyür ve vuruş nabızların buluştuğu anda', () => {
    for (const m of MOTIONS) {
      const c = scaleCurve(m);
      assert.ok(Math.max(...c.outputRange) <= 1.25, `${m}: en fazla %25`);
      assert.ok(Math.min(...c.outputRange) >= 1, `${m}: küçülmez`);
    }
    const beat = scaleCurve('beat');
    assert.equal(beat.inputRange[beat.outputRange.indexOf(Math.max(...beat.outputRange))], MEET);
    const pulse = scaleCurve('pulse');
    assert.equal(pulse.inputRange[pulse.outputRange.indexOf(Math.max(...pulse.outputRange))], MEET);
  });

  test('çizgideki nabızlar: tek yönde baştan sona, iki yönde ortada buluşur', () => {
    assert.equal(pulseCurves('none', 'me'), null);
    assert.equal(pulseCurves('still', 'me'), null);
    assert.equal(pulseCurves('one', 'them'), null, 'tek yönlü nabız benden çıkar');
    const one = pulseCurves('one', 'me')!;
    assertLoopable(one.at, 'tek yön konum');
    assertLoopable(one.opacity, 'tek yön görünürlük');
    assert.deepEqual([one.at.outputRange[0], one.at.outputRange[one.at.outputRange.length - 1]], [0, 1]);
    for (const from of ['me', 'them'] as const) {
      const c = pulseCurves('both', from)!;
      assertLoopable(c.at, `${from} konum`);
      assertLoopable(c.opacity, `${from} görünürlük`);
      assert.equal(c.at.outputRange[0], from === 'me' ? 0 : 1, `${from} kendi fotoğrafından çıkar`);
      assert.equal(c.at.outputRange[c.at.inputRange.indexOf(MEET)], 0.5, `${from} kalpte buluşur`);
      assert.equal(c.opacity.outputRange[c.opacity.inputRange.indexOf(MEET)], 0, 'kalbe varınca kaybolur');
      // Seen again only when the loop starts over from its photo: invisible at both ends.
      assert.equal(c.opacity.outputRange[0], 0);
      assert.equal(c.opacity.outputRange[c.opacity.outputRange.length - 1], 0);
    }
  });

  test('yükselen kalpler döngünün içinde, sırayla ve iki yana', () => {
    assert.deepEqual(particleWindows(0), []);
    for (const n of [1, 3, 5]) {
      const w = particleWindows(n);
      assert.equal(w.length, n);
      w.forEach((x, i) => {
        assert.ok(x.start >= 0 && x.end <= 1 && x.start < x.end, `${n}/${i}: döngünün içinde`);
        assert.ok(Math.abs(x.dx) <= 1 && x.dx !== 0, `${n}/${i}: yana kayar`);
        if (i > 0) assert.ok(x.start > w[i - 1].start, `${n}/${i}: sırayla`);
        if (i > 0) assert.ok(Math.sign(x.dx) !== Math.sign(w[i - 1].dx), `${n}/${i}: sağ sol sırayla`);
        const c = particleCurves(x);
        assertLoopable(c.rise, `${n}/${i} yükseliş`);
        assertLoopable(c.opacity, `${n}/${i} görünürlük`);
        assert.equal(c.opacity.outputRange[0], 0);
        assert.equal(c.opacity.outputRange[c.opacity.outputRange.length - 1], 0);
        assert.equal(Math.max(...c.opacity.outputRange), 1);
      });
    }
  });

  test('eğri yardımcısı geriye ya da aynı yere düşen noktayı atar', () => {
    assert.deepEqual(curve([[0, 1], [0, 2], [0.5, 3], [0.4, 9], [1, 1]]), { inputRange: [0, 0.5, 1], outputRange: [1, 3, 1] });
  });
});
