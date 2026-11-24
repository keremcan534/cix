/// <reference types="node" />
// The app's week (owners, 24 Nov 2026): Monday 00:00 to Sunday 23:59:59, Türkiye time, whatever the phone's own
// time zone (lib/tr trCalendar, periodLabel, trDate; lib/week).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { periodLabel, trCalendar, trDate, trDateTime } from '@/lib/tr';
import { parseWeek, weekFromTally } from '@/lib/week';

const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);

describe('Uygulamanın haftası: Pazartesi 00:00 – Pazar 23:59:59, Türkiye saati', () => {
  test('gün ve haftanın günü Türkiye saatiyle', () => {
    // Sunday 29 November 2026, 23:59 in Türkiye is 20:59 UTC: still Sunday (6).
    assert.deepEqual(trCalendar(at(2026, 11, 29, 20, 59)), { y: 2026, m: 10, d: 29, weekday: 6, h: 23, min: 59 });
    // 21:00 UTC is Monday 00:00 in Türkiye: a new week (0).
    assert.deepEqual(trCalendar(at(2026, 11, 29, 21, 0)), { y: 2026, m: 10, d: 30, weekday: 0, h: 0, min: 0 });
  });

  test('sıralamanın hafta yazısı Türkiye haftası; gece yarısı geçişi doğru', () => {
    assert.equal(periodLabel('weekly', at(2026, 11, 24, 10)), '23–29 Kasım 2026');
    assert.equal(periodLabel('weekly', at(2026, 11, 29, 20, 59)), '23–29 Kasım 2026', 'Pazar 23:59 aynı hafta');
    assert.equal(periodLabel('weekly', at(2026, 11, 29, 21, 0)), '30 Kasım – 6 Aralık 2026', 'Pazartesi 00:00 yeni hafta');
    assert.equal(periodLabel('weekly', at(2026, 12, 30)), '28 Aralık 2026 – 3 Ocak 2027');
    assert.equal(periodLabel('daily', at(2026, 11, 29, 21, 30)), '30 Kasım 2026');
    assert.equal(periodLabel('monthly', at(2026, 11, 30, 21, 0)), '1–31 Aralık 2026', 'ayın son gecesi 00:00 yeni ay');
  });

  test('tarih yazısı Türkiye saatiyle: Pazartesi 00:00 yurt dışındaki telefonda da Pazartesi', () => {
    assert.equal(trDate(at(2026, 11, 29, 21, 0)), '30 Kas 2026');
    assert.equal(trDateTime(at(2026, 11, 29, 21, 5)), '30 Kas 00:05');
  });

  test('sunucunun haftası okunur; bozuk cevap kullanılmaz', () => {
    assert.deepEqual(parseWeek({ start: '2026-11-23', today: 1, days: [5, 7, 0, 0, 0, 0, 0] }), { today: 1, days: [5, 7, 0, 0, 0, 0, 0] });
    for (const bad of [null, 5, {}, { today: 7, days: [0, 0, 0, 0, 0, 0, 0] }, { today: 1, days: [1, 2] }, { today: 1, days: [0, 0, 0, -1, 0, 0, 0] }, { today: '1', days: [0, 0, 0, 0, 0, 0, 0] }])
      assert.equal(parseWeek(bad), null, JSON.stringify(bad));
  });

  test('demo sayacı haftaya oturur: Pazartesi öncesi düşer, bugünden sonrası 0', () => {
    const tally = [1, 2, 3, 4, 5, 6, 7]; // 7 = today
    assert.deepEqual(weekFromTally(tally, at(2026, 11, 25, 10)), { today: 2, days: [5, 6, 7, 0, 0, 0, 0] }, 'Çarşamba');
    assert.deepEqual(weekFromTally(tally, at(2026, 11, 29, 20)), { today: 6, days: [1, 2, 3, 4, 5, 6, 7] }, 'Pazar');
    assert.deepEqual(weekFromTally(tally, at(2026, 11, 29, 21)), { today: 0, days: [7, 0, 0, 0, 0, 0, 0] }, 'Pazartesi 00:00');
  });
});
