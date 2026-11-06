/// <reference types="node" />
// The server's wallet history as Gelir and Cüzdan show it (lib/ledger-view): gift rows read from the server's
// reason text, the three Kazanç Detayları tabs, gifts grouped with their senders and today's coin top-ups.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { coinsAddedOn, diamondIncome, giftOfReason, groupGifts, incomeKind, toLedgerEntry, type LedgerEntry, type RawLedgerRow } from '@/lib/ledger-view';

let n = 0;
const row = (p: Partial<RawLedgerRow>): LedgerEntry =>
  toLedgerEntry({ id: ++n, currency: 'diamond', amount: 0, balance: 0, reason: '', ref: `r${n}`, counterparty: null, created_at: '2026-11-06T10:00:00.000Z', ...p });

describe('Sunucu cüzdan kayıtları', () => {
  test('server rows keep their ref and time; numbers arrive as numbers', () => {
    const e = toLedgerEntry({ id: '12' as unknown as number, currency: 'coin', amount: '500' as unknown as number, balance: '900' as unknown as number, reason: 'Jeton yüklendi', ref: 'gp:abc', counterparty: null, created_at: '2026-11-06T09:00:00.000Z' });
    assert.deepEqual(e, { id: 12, currency: 'coin', amount: 500, balance: 900, reason: 'Jeton yüklendi', ref: 'gp:abc', counterparty: null, channel: null, createdAt: '2026-11-06T09:00:00.000Z' });
  });

  test('gift reasons as the server writes them', () => {
    assert.deepEqual(giftOfReason('Hediye alındı: Gül ×25'), { name: 'Gül', count: 25 });
    assert.deepEqual(giftOfReason('Hediye alındı: Uğur Böceği'), { name: 'Uğur Böceği', count: 1 });
    assert.deepEqual(giftOfReason('Hediye alındı'), { name: 'Hediye', count: 1 });
    assert.equal(giftOfReason('Elmas çekim talebi'), null);
  });

  test('Kazanç Detayları tabs', () => {
    assert.equal(incomeKind(row({ amount: 250, reason: 'Hediye alındı: Gül ×25' })), 'social');
    assert.equal(incomeKind(row({ amount: -50_000, reason: 'Elmas çekim talebi' })), 'spend');
    assert.equal(incomeKind(row({ amount: 50_000, reason: 'Çekim reddedildi, iade', channel: 'cekim' })), 'spend');
    assert.equal(incomeKind(row({ amount: 300, reason: 'Görev ödülü' })), 'system');
    assert.equal(incomeKind(row({ currency: 'coin', amount: 300, reason: 'Jeton yüklendi' })), null);
  });

  test('diamond income leaves out coins, spending and withdrawal refunds', () => {
    const rows = [
      row({ amount: 250, reason: 'Hediye alındı: Gül ×25' }),
      row({ amount: -10, reason: 'Elmas → jeton' }),
      row({ amount: 50_000, reason: 'Çekim reddedildi, iade', channel: 'cekim' }),
      row({ currency: 'coin', amount: 1000, reason: 'Jeton yüklendi' }),
      row({ amount: 40, reason: 'Görev ödülü' }),
    ];
    assert.deepEqual(diamondIncome(rows).map((r) => r.amount), [250, 40]);
  });

  test('gifts grouped by name, biggest total first, top senders by count', () => {
    const rows = [
      row({ amount: 100, reason: 'Hediye alındı: Gül ×10', counterparty: 'a' }),
      row({ amount: 30, reason: 'Hediye alındı: Gül ×3', counterparty: 'b' }),
      row({ amount: 20, reason: 'Hediye alındı: Gül ×2', counterparty: 'a' }),
      row({ amount: 500, reason: 'Hediye alındı: Taç', counterparty: 'c' }),
      row({ amount: 40, reason: 'Görev ödülü' }),
    ];
    assert.deepEqual(groupGifts(rows), [
      { name: 'Taç', count: 1, total: 500, senders: [['c', 1]] },
      { name: 'Gül', count: 15, total: 150, senders: [['a', 2], ['b', 1]] },
    ]);
  });

  test("today's coin top-ups by the phone's calendar day", () => {
    const now = new Date(2026, 10, 6, 15, 0);
    const at = (h: number, day = 6) => new Date(2026, 10, day, h, 0).toISOString();
    const rows = [
      row({ currency: 'coin', amount: 1000, created_at: at(9) }),
      row({ currency: 'coin', amount: 500, created_at: at(14) }),
      row({ currency: 'coin', amount: -200, created_at: at(14) }),
      row({ currency: 'coin', amount: 700, created_at: at(23, 5) }),
      row({ amount: 900, created_at: at(10) }),
    ];
    assert.equal(coinsAddedOn(rows, now), 1500);
  });
});
