/// <reference types="node" />
// Coins Bank payout path (lib/bank): request checks, idempotent request creation with the amount blocked in the
// same update, auto-approval vs manual review, payout account (re)verification, the IBAN check digits and the BD
// share engine.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { RULES } from '@/data/rules';
import {
  blockedFor,
  computeBdShares,
  createPayout,
  getBank,
  resetBank,
  saveAccount,
  validIban,
  validatePayout,
  verifyAccount,
  weeklyUsedFor,
  type BankState,
  type BdEarning,
  type Payout,
  type PayoutStatus,
  type Scope,
} from '@/lib/bank';

const bank = (): BankState => getBank();

const fmt = (n: number) => n.toLocaleString('tr-TR');
const IBAN = 'TR33 0006 1005 1978 6457 8413 26';
const IBAN2 = 'TR42 0001 0000 0000 0000 0000 01';
const save = (scope: Scope, iban = IBAN) => assert.equal(saveAccount(scope, { kind: 'bank', holder: 'Ayşe Yılmaz', iban }), null);
/** A saved account that went through the (demo) verification. */
function verified(scope: Scope) {
  save(scope);
  verifyAccount(scope);
  mock.timers.tick(1500);
  assert.equal(bank().accounts[scope]?.status, 'Doğrulandı');
}

const MIN = RULES.minWithdrawDiamonds;
const MAX = RULES.maxWithdrawDiamonds;
const WEEK = RULES.weeklyWithdrawLimitDiamonds;
const AUTO = RULES.autoApproveUnderDiamonds;

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 9_000_000 });
  resetBank();
});
afterEach(() => mock.timers.reset());

describe('IBAN doğrulama (validIban)', () => {
  test('ISO 13616 kontrol hanesi (mod 97) tutan TR IBAN geçer', () => {
    for (const ok of [IBAN, IBAN2, 'TR470000000000000000000000']) assert.equal(validIban(ok), true, ok);
  });

  test('biçimi doğru ama kontrol hanesi tutmayan IBAN reddedilir', () => {
    for (const bad of [
      'TR000000000000000000000000', // shape only: the old check let this through
      'TR34 0006 1005 1978 6457 8413 26', // check digits off by one
      'TR33 0006 1005 1978 6457 8413 27', // one account digit changed
      'TR33 0006 1005 1978 6475 8413 26', // two neighbouring digits swapped
      'TR12 0001 0000 0000 0000 0000 01', // the old test IBAN
    ])
      assert.equal(validIban(bad), false, bad);
  });

  test('boşluk, tire ve küçük harf yok sayılır', () => {
    assert.equal(validIban('tr33 0006 1005 1978 6457 8413 26'), true);
    assert.equal(validIban('  TR33-0006-1005-1978-6457-8413-26 '), true);
    assert.equal(validIban('TR330006100519786457841326'), true);
  });

  test('yanlış uzunluk, harf içeren gövde ve başka ülke reddedilir (kontrol hanesi tutsa bile)', () => {
    for (const bad of [
      'TR04 0006 1005 1978 6457 8413 260', // 25 digits, mod 97 = 1
      'TR23 0006 1005 1978 6457 8413 2', // 23 digits, mod 97 = 1
      'TR33 0006 1005 1978 6457 8413 2',
      'TR3X 0006 1005 1978 6457 8413 26',
      'DE89 3704 0044 0532 0130 00', // a valid German IBAN
      'TR',
      '',
    ])
      assert.equal(validIban(bad), false, bad);
  });

  test('hesap kaydı kontrol hanesi tutmayan IBAN’ı aynı hata metniyle reddeder, kayıt bırakmaz', () => {
    assert.equal(saveAccount('creator', { kind: 'bank', holder: 'Ayşe Yılmaz', iban: 'TR000000000000000000000000' }), 'Geçerli bir IBAN gir (TR + 24 hane).');
    assert.equal(bank().accounts.creator, undefined);
    assert.deepEqual(bank().audit, []);
  });
});

describe('Ödeme talebi kontrolleri (validatePayout)', () => {
  const account = (status: 'Doğrulanmadı' | 'Doğrulanıyor' | 'Doğrulandı') =>
    ({ id: 'ACC-1', scope: 'creator', kind: 'bank', holder: 'Ayşe Yılmaz', iban: 'TR330006100519786457841326', status, created: '10:00:00' }) as const;
  const po = (diamonds: number, status: PayoutStatus, scope: Scope = 'creator'): Payout => ({
    id: `PAY-${diamonds}-${status}`,
    ref: `PO-${diamonds}`,
    key: `k-${diamonds}-${status}`,
    scope,
    diamonds,
    account: { id: 'ACC-1', label: 'IBAN' },
    status,
    review: 'Manuel inceleme',
    createdTs: 0,
    created: '10:00:00',
    ruleVersion: RULES.version,
    steps: [],
  });
  const st = (payouts: Payout[] = [], status: 'Doğrulanmadı' | 'Doğrulanıyor' | 'Doğrulandı' | null = 'Doğrulandı'): BankState => ({
    accounts: status ? { creator: account(status) } : {},
    payouts,
    entries: [],
    audit: [],
    bdView: false,
  });

  test('geçersiz tutar, talep başına alt/üst sınır ve çekilebilir bakiye', () => {
    for (const bad of [1.5, 0, -MIN, Number.NaN]) assert.equal(validatePayout(st(), 'creator', bad, 10 * MAX), 'Geçerli bir tutar gir.', String(bad));
    assert.equal(validatePayout(st(), 'creator', MIN - 1, 10 * MAX), `Talep başına en az ${fmt(MIN)} 💎 çekebilirsin.`);
    assert.equal(validatePayout(st(), 'creator', MAX + 1, 10 * MAX), `Talep başına en fazla ${fmt(MAX)} 💎 çekebilirsin.`);
    assert.equal(
      validatePayout(st(), 'creator', MIN + 1, MIN),
      `Çekilebilir bakiye yetersiz (${fmt(MIN)} 💎). Ödeme sürecindeki tutarlar bloke edilmiştir.`,
    );
    assert.equal(validatePayout(st(), 'creator', MIN, MIN), null, 'sınırlar dahil');
    assert.equal(validatePayout(st(), 'creator', MAX, MAX), null, 'sınırlar dahil');
  });

  test('haftalık limit açık + ödenmiş talepleri sayar; kalan tutar doğru yazılır', () => {
    // 4M paid + 3M open count; the rejected/failed ones and another scope's request do not.
    const payouts = [po(4_000_000, 'Ödendi'), po(2_000_000, 'Onaylandı'), po(1_000_000, 'Manuel inceleme'), po(3_000_000, 'Reddedildi'), po(2_500_000, 'Başarısız'), po(4_500_000, 'Onaylandı', 'agency')];
    const s = st(payouts);
    assert.equal(weeklyUsedFor(s, 'creator'), 7_000_000);
    const remaining = WEEK - 7_000_000;
    assert.equal(validatePayout(s, 'creator', remaining, 10 * MAX), null, 'tam kalan tutar geçer');
    assert.equal(validatePayout(s, 'creator', remaining + 1, 10 * MAX), `Haftalık limit aşılıyor. Bu hafta kalan: ${fmt(remaining)} 💎.`);
    // Requests from before the session (legacyWeekly) also count.
    assert.equal(validatePayout(s, 'creator', remaining, 10 * MAX, 1_000_000), `Haftalık limit aşılıyor. Bu hafta kalan: ${fmt(remaining - 1_000_000)} 💎.`);
    assert.equal(validatePayout(s, 'creator', MIN, 10 * MAX, WEEK), 'Haftalık limit aşılıyor. Bu hafta kalan: 0 💎.', 'kalan eksiye düşmez');
  });

  test('hesap yoksa veya doğrulanmamışsa talep oluşturulamaz', () => {
    assert.equal(validatePayout(st([], null), 'creator', MIN, MAX), 'Önce bir ödeme hesabı ekle.');
    assert.equal(validatePayout(st(), 'agency', MIN, MAX), 'Önce bir ödeme hesabı ekle.', 'hesap kapsama özel');
    for (const status of ['Doğrulanmadı', 'Doğrulanıyor'] as const)
      assert.equal(validatePayout(st([], status), 'creator', MIN, MAX), 'Ödeme hesabın doğrulanmadan talep oluşturamazsın.', status);
    assert.equal(validatePayout(st(), 'creator', MIN, MAX), null);
  });
});

describe('Ödeme talebi oluşturma (createPayout)', () => {
  beforeEach(() => verified('creator'));

  test('aynı idempotency anahtarı ikinci kez yeni talep açmaz: tek talep, tek blokaj kaydı', () => {
    const first = createPayout({ scope: 'creator', diamonds: 100_000, available: 1_000_000, key: 'tap-1' });
    assert.ok(first.ok);
    assert.equal(first.duplicate, false);
    // The retry comes with the amount already blocked (lower available); it still returns the original request.
    const again = createPayout({ scope: 'creator', diamonds: 100_000, available: 900_000, key: 'tap-1' });
    assert.ok(again.ok);
    assert.equal(again.duplicate, true);
    assert.equal(again.payout, first.payout);
    const s = bank();
    assert.equal(s.payouts.length, 1);
    assert.equal(s.entries.length, 1);
    assert.deepEqual([s.entries[0].kind, s.entries[0].amount, s.entries[0].payoutRef], ['Blokaj', 100_000, first.payout.ref]);
    assert.equal(s.audit.filter((r) => r.action === 'Ödeme talebi oluşturuldu').length, 1);
    assert.equal(blockedFor(s, 'creator'), 100_000);
  });

  test(`${fmt(AUTO)} 💎 altı otomatik onaylanır, üstü manuel incelemeye düşer; ikisi de bloke kalır`, () => {
    const auto = createPayout({ scope: 'creator', diamonds: AUTO - 1, available: 10 * AUTO, key: 'a' });
    const manual = createPayout({ scope: 'creator', diamonds: AUTO, available: 10 * AUTO, key: 'b' });
    assert.ok(auto.ok && manual.ok);
    assert.deepEqual([auto.payout.status, auto.payout.review], ['Onaylandı', 'Otomatik onay']);
    assert.deepEqual([manual.payout.status, manual.payout.review], ['Manuel inceleme', 'Manuel inceleme']);
    assert.equal(auto.payout.ruleVersion, RULES.version);
    assert.equal(auto.payout.steps.at(-1)?.label, 'Otomatik onaylandı');
    assert.equal(manual.payout.steps.at(-1)?.label, 'Manuel incelemeye alındı');
    const s = bank();
    assert.equal(blockedFor(s, 'creator'), 2 * AUTO - 1);
    assert.equal(weeklyUsedFor(s, 'creator'), 2 * AUTO - 1);
    assert.equal(blockedFor(s, 'agency'), 0);
    assert.deepEqual(
      s.audit.slice(0, 6).map((r) => r.action),
      ['Manuel incelemeye alındı', 'Tutar bloke edildi', 'Ödeme talebi oluşturuldu', 'Ödeme otomatik onaylandı', 'Tutar bloke edildi', 'Ödeme talebi oluşturuldu'],
    );
  });

  test('bloke tutar haftalık limitten düşer; hatalı talep hiçbir kayıt bırakmaz', () => {
    assert.ok(createPayout({ scope: 'creator', diamonds: MAX, available: 3 * MAX, key: 'big-1' }).ok);
    assert.ok(createPayout({ scope: 'creator', diamonds: MAX - 1_000_000, available: 2 * MAX, key: 'big-2' }).ok);
    const before = bank();
    assert.equal(blockedFor(before, 'creator'), 2 * MAX - 1_000_000);
    const over = createPayout({ scope: 'creator', diamonds: 1_000_001, available: MAX, key: 'big-3' });
    assert.deepEqual(over, { ok: false, error: `Haftalık limit aşılıyor. Bu hafta kalan: ${fmt(WEEK - (2 * MAX - 1_000_000))} 💎.` });
    const noAccount = createPayout({ scope: 'agency', diamonds: MIN, available: MAX, key: 'ag-1' });
    assert.deepEqual(noAccount, { ok: false, error: 'Önce bir ödeme hesabı ekle.' });
    assert.equal(bank(), before, 'durum değişmedi');
    // A failed key is not burned: the same key works once the request is valid.
    save('agency');
    verifyAccount('agency');
    mock.timers.tick(1500);
    const ok = createPayout({ scope: 'agency', diamonds: MIN, available: MAX, key: 'ag-1' });
    assert.ok(ok.ok && !ok.duplicate);
  });
});

describe('Ödeme hesabı ve doğrulama', () => {
  test('doğrulama kısa süre sonra tamamlanır', () => {
    save('creator');
    assert.equal(bank().accounts.creator?.status, 'Doğrulanmadı');
    verifyAccount('creator');
    assert.equal(bank().accounts.creator?.status, 'Doğrulanıyor');
    mock.timers.tick(1499);
    assert.equal(bank().accounts.creator?.status, 'Doğrulanıyor');
    mock.timers.tick(1);
    const s = bank();
    assert.equal(s.accounts.creator?.status, 'Doğrulandı');
    assert.deepEqual([s.audit[0].action, s.audit[0].actor], ['Hesap doğrulandı', 'Sistem']);
  });

  test('doğrulanmış hesabı değiştirmek doğrulamayı sıfırlar; talep yeniden doğrulamayı bekler', () => {
    verified('creator');
    const oldId = bank().accounts.creator!.id;
    save('creator', IBAN2);
    const s = bank();
    const acc = s.accounts.creator!;
    assert.equal(acc.status, 'Doğrulanmadı');
    assert.notEqual(acc.id, oldId);
    assert.equal(acc.iban, 'TR420001000000000000000001');
    assert.equal(s.audit[0].action, 'Ödeme hesabı değiştirildi');
    assert.match(s.audit[0].detail, /yeniden doğrulama gerekli/);
    assert.deepEqual(createPayout({ scope: 'creator', diamonds: MIN, available: MAX, key: 'after-change' }), {
      ok: false,
      error: 'Ödeme hesabın doğrulanmadan talep oluşturamazsın.',
    });
  });

  test('doğrulama sürerken hesap değişirse eski doğrulama geçersiz olur', () => {
    save('creator');
    verifyAccount('creator');
    save('creator', IBAN2);
    mock.timers.tick(1500);
    let s = bank();
    assert.equal(s.accounts.creator?.status, 'Doğrulanmadı');
    assert.equal(s.audit.filter((r) => r.action === 'Hesap doğrulandı').length, 0);
    // The new account verifies on its own.
    verifyAccount('creator');
    mock.timers.tick(1500);
    s = bank();
    assert.equal(s.accounts.creator?.status, 'Doğrulandı');
    assert.equal(s.accounts.creator?.iban, 'TR420001000000000000000001');
  });

  test('eski hesabın doğrulama sonucu, doğrulaması süren yeni hesabı onaylamaz', () => {
    save('creator');
    verifyAccount('creator');
    mock.timers.tick(1000);
    save('creator', IBAN2);
    verifyAccount('creator');
    mock.timers.tick(500); // the old account's check comes back now
    assert.equal(bank().accounts.creator?.status, 'Doğrulanıyor');
    mock.timers.tick(1000);
    assert.equal(bank().accounts.creator?.status, 'Doğrulandı');
  });
});

describe('BD payı (computeBdShares)', () => {
  const e = (earningId: string, agencyId: string, diamonds: number, period = '2026-H44'): BdEarning => ({ earningId, agencyId, host: 'h', diamonds, period });

  test('her kazanç kimliği bir kez sayılır; tekrarlar (yeniden deneme, ajans değişikliği) engellenir', () => {
    const feed = [e('e1', 'A1', 1_000), e('e2', 'A1', 500), e('e3', 'A2', 2_001), e('e1', 'A2', 1_000), e('e2', 'A1', 500), e('e0', 'A1', 9_999), e('e4', 'A1', 300, '2026-H45')];
    const already = new Set(['e0']);
    const r = computeBdShares(feed, RULES.bdCommission, RULES.version, already);
    assert.deepEqual(
      r.rows.map((x) => [x.agencyId, x.period, x.base, x.count, x.amount, x.rate, x.ruleVersion]),
      [
        ['A1', '2026-H44', 1_500, 2, Math.round(1_500 * RULES.bdCommission), RULES.bdCommission, RULES.version],
        ['A2', '2026-H44', 2_001, 1, Math.round(2_001 * RULES.bdCommission), RULES.bdCommission, RULES.version],
        ['A1', '2026-H45', 300, 1, Math.round(300 * RULES.bdCommission), RULES.bdCommission, RULES.version],
      ],
    );
    assert.deepEqual(
      r.blocked.map((x) => `${x.earningId}/${x.agencyId}`),
      ['e1/A2', 'e2/A1', 'e0/A1'],
    );
    assert.deepEqual([...r.seen].sort(), ['e0', 'e1', 'e2', 'e3', 'e4']);
    assert.deepEqual([...already], ['e0'], 'girdi kümesi değişmez');
    // Running the same feed again with what was counted: nothing new.
    const again = computeBdShares(feed, RULES.bdCommission, RULES.version, r.seen);
    assert.deepEqual(again.rows, []);
    assert.equal(again.blocked.length, feed.length);
  });
});
