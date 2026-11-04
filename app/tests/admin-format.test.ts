/// <reference types="node" />
// Yönetim panel wording (lib/admin-format): dates and "… önce", uptime, ban phrases and the result lines the
// owner reads after a refund or a Google refund check. Dates are built in local time so the test passes in any
// time zone.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BAN_OPTIONS, ago, banLabel, banPhrase, fmtDate, fmtUptime, fmtUsd, purchaseCoins, refundResult, voidedResult } from '@/lib/admin-format';

const now = new Date(2026, 10, 4, 15, 0);
const iso = (d: Date) => d.toISOString();

describe('admin-format: tarih', () => {
  test('fmtDate shows day, month and time; the year only when it differs', () => {
    assert.equal(fmtDate(iso(new Date(2026, 10, 4, 14, 5)), now), '4 Kas 14:05');
    assert.equal(fmtDate(iso(new Date(2025, 0, 9, 8, 0)), now), '9 Oca 2025 08:00');
    assert.equal(fmtDate(null, now), '');
    assert.equal(fmtDate('nope', now), '');
  });

  test('ago counts minutes, hours and days, then falls back to the date', () => {
    const before = (ms: number) => iso(new Date(now.getTime() - ms));
    assert.equal(ago(before(20_000), now), 'az önce');
    assert.equal(ago(before(5 * 60_000), now), '5 dk önce');
    assert.equal(ago(before(3 * 3_600_000), now), '3 sa önce');
    assert.equal(ago(before(2 * 86_400_000), now), '2 gün önce');
    assert.equal(ago(iso(new Date(2026, 9, 1, 9, 30)), now), '1 Eki 09:30');
    assert.equal(ago(undefined, now), '');
  });

  test('fmtUptime', () => {
    assert.equal(fmtUptime(30), '0 dk');
    assert.equal(fmtUptime(12 * 60), '12 dk');
    assert.equal(fmtUptime(2 * 3600 + 10 * 60), '2 sa 10 dk');
    assert.equal(fmtUptime(3 * 86400 + 4 * 3600), '3 gün 4 sa');
  });
});

describe('admin-format: askı', () => {
  test('ban options stay inside what the server accepts (1–3650 days)', () => {
    for (const o of BAN_OPTIONS) assert.ok(o.days >= 1 && o.days <= 3650, o.label);
    assert.equal(banLabel(3650), 'Süresiz');
    assert.equal(banLabel(14), '14 gün');
  });

  test('banPhrase', () => {
    assert.equal(banPhrase(7), '7 gün askıya alındı');
    assert.equal(banPhrase(3650), 'süresiz askıya alındı');
    assert.equal(banPhrase(1, true), '1 gün askıya alınacak');
  });
});

describe('admin-format: sonuç cümleleri', () => {
  test('purchaseCoins and money', () => {
    assert.equal(purchaseCoins(5000, 2500), '5.000 jeton + 2.500 hediye');
    assert.equal(purchaseCoins(800, 0), '800 jeton');
    assert.equal(fmtUsd(12.5), '12,50 USD');
  });

  test('refundResult says what came back and what could not', () => {
    assert.equal(refundResult({ coins: 5000, diamonds: 0, unrecoveredDiamonds: 0 }), '5.000 jeton geri alındı.');
    assert.equal(refundResult({ coins: 1200, diamonds: 300, unrecoveredDiamonds: 0 }), '1.200 jeton ve 300 elmas geri alındı.');
    assert.equal(refundResult({ coins: 0, diamonds: 0, unrecoveredDiamonds: 40 }), 'Geri alınacak jeton kalmamıştı. 40 elmas kilidi açıldığı için geri alınamadı.');
  });

  test('voidedResult', () => {
    assert.equal(voidedResult({ checked: 0, refunded: 0, unknown: 0 }), 'Google Play’de yeni iade yok.');
    assert.equal(voidedResult({ checked: 3, refunded: 2, unknown: 0 }), '3 iade kaydı okundu, 2 tanesi uygulandı.');
    assert.equal(voidedResult({ checked: 2, refunded: 0, unknown: 1 }), '2 iade kaydı okundu, yeni uygulanacak iade yok, 1 tanesi bu uygulamanın alımı değil.');
  });
});
