// Cömertlik and Yankı thresholds come from one curve (levelCurve). These tests pin its shape: the anchors hold,
// every level asks for more than the last, the numbers stay readable, and the levels that open something stay
// within reach.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CHARM_MAX, CHARM_XP, charmLevelOf } from '@/data/charm';
import { WEALTH_MAX, WEALTH_XP, levelCurve, readablePoints, wealthLevelOf } from '@/data/wealth';

const sigDigits = (n: number) => String(n).replace(/0+$/, '').length;

for (const [name, table, last] of [
  ['Cömertlik', WEALTH_XP, 30_000_000],
  ['Yankı', CHARM_XP, 60_000_000],
] as const) {
  describe(`${name} eşikleri`, () => {
    it('Lv.0–50, Lv.0 sıfırdan, Lv.1 ilk hediyeyle, en üst seviye çapada', () => {
      assert.equal(table.length, 51);
      assert.equal(table[0], 0);
      assert.equal(table[1], 10);
      assert.equal(table[50], last);
    });
    it('her seviye bir öncekinden fazla ister; ortadan sonra artış yaklaşık dörtte bir', () => {
      for (let l = 1; l <= 50; l++) assert.ok(table[l] > table[l - 1], `Lv.${l}`);
      // The curve itself grows 24–32 % a level from Lv.20 on; rounding to two digits moves a step by up to ~5 %.
      for (let l = 20; l <= 50; l++) {
        const r = table[l] / table[l - 1];
        assert.ok(r > 1.15 && r < 1.4, `Lv.${l} ×${r.toFixed(2)}`);
      }
    });
    it('okunur sayılar: 100 altı 5’in katı, üstü en çok iki anlamlı basamak', () => {
      for (const xp of table.slice(1)) {
        if (xp < 100) assert.equal(xp % 5, 0, String(xp));
        else assert.ok(sigDigits(xp) <= 2, String(xp));
      }
    });
  });
}

describe('levelCurve', () => {
  it('readablePoints yuvarlar', () => {
    assert.equal(readablePoints(3), 5);
    assert.equal(readablePoints(37), 35);
    assert.equal(readablePoints(461), 460);
    assert.equal(readablePoints(1_745), 1_700);
    assert.equal(readablePoints(999.7), 1_000);
    assert.equal(readablePoints(1_455_000), 1_500_000);
  });
  it('iki çapa yeter, eğri başka uzunlukta da kurulur', () => {
    const c = levelCurve(20, 1_000_000, 10);
    assert.equal(c.length, 11);
    assert.equal(c[1], 20);
    assert.equal(c[10], 1_000_000);
  });
  it('seviye hesabı eşiklere oturur', () => {
    assert.equal(wealthLevelOf(0), 0);
    assert.equal(wealthLevelOf(9), 0);
    assert.equal(wealthLevelOf(10), 1);
    assert.equal(wealthLevelOf(WEALTH_XP[2] - 1), 1);
    assert.equal(wealthLevelOf(WEALTH_XP[2]), 2);
    assert.equal(wealthLevelOf(1e12), WEALTH_MAX);
    assert.equal(charmLevelOf(CHARM_XP[6]), 6);
    assert.equal(charmLevelOf(1e12), CHARM_MAX);
  });
  it('açılan ayrıcalıklar ulaşılabilir kalır', () => {
    // Oyun Salonu (Lv.2) tek bir Kalp hediyesiyle (50 jeton) açılır.
    assert.ok(WEALTH_XP[2] <= 50);
    // Giriş efekti (Lv.5) bir Taç (500), seviye duyurusu (Lv.10) bir Roket (1.999) civarında.
    assert.ok(WEALTH_XP[5] <= 500);
    assert.ok(WEALTH_XP[10] <= 2_000);
    // Yankı kazanç bonusu (Lv.6) birkaç yüz elmasla başlar.
    assert.ok(CHARM_XP[6] <= 500);
  });
});
