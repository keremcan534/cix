// Günlük harcama limiti in a live build (lib/spend-limit-view): which changes apply now and which wait 24 hours (as
// server/api/spend-limit.mjs decides), what is asked first, and the words under the choices.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ServerSpendLimit } from '@/lib/api';
import { confirmRaise, limitApplies, limitFooter } from '@/lib/spend-limit-view';

const state = (p: Partial<ServerSpendLimit> = {}): ServerSpendLimit => ({
  limit: 2000,
  next: null,
  spentToday: 1200,
  left: 800,
  day: '2026-11-10',
  resetsAt: '2026-11-10T21:00:00Z',
  raiseHours: 24,
  ...p,
});

describe('Günlük harcama limiti', () => {
  test('düşürmek hemen, artırmak ve kaldırmak sonra', () => {
    assert.equal(limitApplies(null, 500), 'now', 'ilk limit');
    assert.equal(limitApplies(2000, 500), 'now');
    assert.equal(limitApplies(2000, 2000), 'now');
    assert.equal(limitApplies(2000, 10000), 'later');
    assert.equal(limitApplies(2000, 0), 'later', 'kaldırmak');
    assert.equal(limitApplies(null, 0), 'now');
  });

  test('bekleyen değişiklikten önce sorulur', () => {
    assert.equal(confirmRaise(state(), 500), null);
    const up = confirmRaise(state(), 10000);
    assert.equal(up?.title, 'Limiti artır');
    assert.equal(up?.message, '10.000 jetonluk limit 24 saat sonra geçerli olur. O zamana kadar günlük limitin 2.000 jeton olarak kalır.');
    assert.equal(confirmRaise(state(), 0)?.title, 'Limiti kaldır');
  });

  test('alttaki açıklama: bugün, bekleyen, kural', () => {
    const now = new Date(2026, 10, 10, 12);
    const plain = limitFooter(state(), now);
    assert.match(plain, /^Bugün 1\.200 \/ 2\.000 jeton harcadın · kalan 800\. /);
    assert.match(plain, /düşürmek hemen, artırmak veya kaldırmak 24 saat sonra/);
    const waiting = limitFooter(state({ next: { limit: 10000, at: new Date(2026, 10, 11, 14, 32).toISOString() } }), now);
    assert.match(waiting, /Yeni limitin \(10\.000 jeton\) 11 Kas 14:32 tarihinde geçerli olacak\./);
    const lifting = limitFooter(state({ next: { limit: null, at: new Date(2026, 10, 11, 14, 32).toISOString() } }), now);
    assert.match(lifting, /Limitin 11 Kas 14:32 tarihinde kalkacak\./);
    assert.match(limitFooter(state({ limit: null, left: null, spentToday: 50 }), now), /^Bugün 50 jeton harcadın\./);
  });
});
