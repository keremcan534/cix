/// <reference types="node" />
// Para çekme: the phone's checks (lib/withdraw-rules) match the server's (server/api withdraw.mjs, catalog.mjs),
// so a request the screen lets through is not refused for a rule the phone didn't know.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { RULES } from '@/data/rules';
import { checkWithdraw, formatIban, maskAccount, validAnyIban, withdrawUsd } from '@/lib/withdraw-rules';
// Plain JavaScript modules of the server; TypeScript reads them through allowJs.
import * as catalog from '../../server/api/catalog.mjs';

const ok = { diamonds: 60_000, withdrawable: 100_000, method: 'iban' as const, holder: 'Ada Yılmaz', account: 'GB82 WEST 1234 5698 7654 32' };

describe('Para çekme kuralları', () => {
  test('sınırlar ve elmasın değeri sunucuyla aynı', () => {
    const w = catalog.WITHDRAW as { minDiamonds: number; maxDiamonds: number; weeklyDiamonds: number };
    assert.deepEqual([w.minDiamonds, w.maxDiamonds, w.weeklyDiamonds], [RULES.minWithdrawDiamonds, RULES.maxWithdrawDiamonds, RULES.weeklyWithdrawLimitDiamonds]);
    for (const n of [50_000, 54_321, 99_995, 5_000_000]) assert.equal(withdrawUsd(n), (catalog.diamondValueUsd as (d: number) => number)(n), String(n));
    assert.equal(withdrawUsd(99_995), 19.99, 'kuruş aşağı yuvarlanır');
  });

  test('IBAN: her ülkeden, kontrol basamağıyla', () => {
    for (const iban of ['GB82 WEST 1234 5698 7654 32', 'DE89370400440532013000', 'tr330006100519786457841326', 'NL91ABNA0417164300']) assert.ok(validAnyIban(iban), iban);
    for (const iban of ['GB82 WEST 1234 5698 7654 33', 'DE00370400440532013000', 'GB82', '1234567890123456', '']) assert.ok(!validAnyIban(iban), iban);
    assert.equal(formatIban('gb82west12345698765432'), 'GB82 WEST 1234 5698 7654 32');
    assert.equal(maskAccount('iban', 'GB82 WEST 1234 5698 7654 32'), 'GB82 •••• 5432');
  });

  test('talep denetimi: ilk sorun söylenir', () => {
    assert.equal(checkWithdraw(ok), null);
    assert.match(checkWithdraw({ ...ok, diamonds: 49_999 }) ?? '', /En az 50\.000/);
    assert.match(checkWithdraw({ ...ok, diamonds: 5_000_001, withdrawable: 9_000_000 }) ?? '', /en çok 5\.000\.000/);
    assert.match(checkWithdraw({ ...ok, diamonds: 100_001 }) ?? '', /yetmiyor/);
    assert.match(checkWithdraw({ ...ok, holder: ' A ' }) ?? '', /adını/);
    assert.match(checkWithdraw({ ...ok, account: 'GB00 WEST 1234 5698 7654 32' }) ?? '', /IBAN geçersiz/);
    assert.equal(checkWithdraw({ ...ok, method: 'other', account: 'hesap 12345' }), null, 'diğer yöntem serbest metin');
    assert.match(checkWithdraw({ ...ok, method: 'other', account: 'ab' }) ?? '', /5–120/);
  });
});
