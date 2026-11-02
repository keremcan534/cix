/// <reference types="node" />
// Turkish text helpers (lib/tr): number suffixes on screen copy and leaderboard period labels from the real date.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { fromN, locative, periodLabel, stampLabel, youAreIn, youLabel } from '@/lib/tr';

describe('Sayı ekleri', () => {
  test('son kelimenin okunuşuna göre -den/-dan/-ten/-tan', () => {
    const cases: [number, string][] = [
      [1, '1’den'], [2, '2’den'], [3, '3’ten'], [4, '4’ten'], [5, '5’ten'], [6, '6’dan'], [7, '7’den'], [8, '8’den'], [9, '9’dan'],
      [10, '10’dan'], [20, '20’den'], [30, '30’dan'], [40, '40’tan'], [50, '50’den'], [60, '60’tan'], [70, '70’ten'], [80, '80’den'], [90, '90’dan'],
      [0, '0’dan'], [15, '15’ten'], [100, '100’den'], [250, '250’den'], [1000, '1000’den'], [1500, '1500’den'],
    ];
    for (const [n, want] of cases) assert.equal(fromN(n), want, String(n));
  });
});

describe('Sıralama dönemi', () => {
  // Months are 0-based in Date: 10 = Kasım.
  test('günlük ve aylık', () => {
    assert.equal(periodLabel('daily', new Date(2026, 10, 2)), '2 Kasım 2026');
    assert.equal(periodLabel('monthly', new Date(2026, 10, 2)), '1–30 Kasım 2026');
    assert.equal(periodLabel('monthly', new Date(2028, 1, 10)), '1–29 Şubat 2028');
  });

  test('haftalık pazartesiden pazara; ay ve yıl geçişi', () => {
    assert.equal(periodLabel('weekly', new Date(2026, 10, 4)), '2–8 Kasım 2026');
    assert.equal(periodLabel('weekly', new Date(2026, 10, 8)), '2–8 Kasım 2026', 'pazar aynı haftada kalır');
    assert.equal(periodLabel('weekly', new Date(2026, 10, 1)), '26 Ekim – 1 Kasım 2026');
    assert.equal(periodLabel('weekly', new Date(2026, 11, 30)), '28 Aralık 2026 – 3 Ocak 2027');
  });
});

describe('Kendi satırın adı', () => {
  test('varsayılan ad "Sen" iken tekrar etmez', () => {
    assert.equal(youLabel('Sen'), 'Sen');
    assert.equal(youLabel(' sen '), 'Sen');
    assert.equal(youLabel('Deniz'), 'Deniz (sen)');
  });
});

describe('Satır zamanı', () => {
  const now = new Date(2026, 10, 2, 15, 0);
  test('bugün, dün, daha önce ve eski kayıt', () => {
    assert.equal(stampLabel('2026-11-2', '14:05', now), 'Bugün 14:05');
    assert.equal(stampLabel('2026-11-1', '09:10', now), 'Dün 09:10');
    assert.equal(stampLabel('2026-10-28', '09:10', now), '28 Ekim 09:10');
    assert.equal(stampLabel('2025-12-31', '23:59', now), '31 Aralık 2025 23:59');
    assert.equal(stampLabel(undefined, '14:05', now), '14:05', 'gün bilgisi olmayan eski kayıt');
    assert.equal(stampLabel('bozuk', '14:05', now), '14:05');
  });
});

describe('Yer ekleri', () => {
  test('ünlü uyumu ve sert ünsüz', () => {
    assert.equal(locative('İstanbul'), 'İstanbul’da');
    assert.equal(locative('İzmir'), 'İzmir’de');
    assert.equal(locative('Ankara'), 'Ankara’da');
    assert.equal(locative('Rize'), 'Rize’de');
    assert.equal(locative('Antep'), 'Antep’te');
    assert.equal(locative('Bursa'), 'Bursa’da');
    assert.equal(locative('Muş'), 'Muş’ta');
    assert.equal(youAreIn('İstanbul'), 'İstanbul’dasınız');
    assert.equal(youAreIn('İzmir'), 'İzmir’desiniz');
    assert.equal(youAreIn('Antep'), 'Antep’tesiniz');
  });
});
