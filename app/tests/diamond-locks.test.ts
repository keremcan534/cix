/// <reference types="node" />
// Gelir: "Çekilebilir kazanç" / "Kilitli elmas" (lib/diamond-locks). Gift diamonds stay locked through the refund
// window: 7 days for store coins, 1 day for Jeton Noktası coins; locked diamonds can't be withdrawn or exchanged.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_RULES } from '@/data/rules';
import {
  MAX_LOCKS,
  activeLocks,
  addLock,
  diamondSplit,
  lockDays,
  lockMs,
  fromServerLock,
  lockLabel,
  lockLength,
  lockProgress,
  lockTotalMs,
  lockedReason,
  locksFor,
  nextUnlock,
  timeLeft,
  type DiamondLock,
} from '@/lib/diamond-locks';
import { readSnapshot } from '@/lib/snapshot';

const H = 3_600_000;
const D = 24 * H;
const T = 1_800_000_000_000;
const lock = (amount: number, unlockAt: number, extra: Partial<DiamondLock> = {}): DiamondLock => ({ id: `l${amount}-${unlockAt}`, amount, unlockAt, channel: 'store', source: 'Hediye', ...extra });

describe('Elmas kilidi', () => {
  test('mağaza jetonu 7 gün, Jeton Noktası jetonu 1 gün kilitler', () => {
    assert.equal(DEFAULT_RULES.pendingDays, 7);
    assert.equal(DEFAULT_RULES.jetonPendingDays, 1);
    assert.equal(lockDays('store'), 7);
    assert.equal(lockDays('jeton'), 1);
    assert.equal(lockMs('store'), 7 * D);
    assert.equal(lockMs('jeton'), D);
  });

  test('hediye, arama ve bunların bonusları kilitlenir; platform ödülleri kilitlenmez', () => {
    for (const s of ['Hediye', 'Arama', 'Cazibe bonusu', 'Oda sahibi bonusu', 'Arama bonusu'] as const) assert.equal(locksFor(s), true, s);
    for (const s of ['Görev', 'Ajans bonusu', 'Aile bonusu'] as const) assert.equal(locksFor(s), false, s);
  });

  test('bakiye iki parçaya bölünür; açılmış kilit sayılmaz, kilit bakiyeyi aşamaz', () => {
    const locks = [lock(3_000, T + 2 * D), lock(500, T + H, { channel: 'jeton' }), lock(900, T - 1)];
    assert.deepEqual(diamondSplit(10_000, locks, T), { locked: 3_500, withdrawable: 6_500 });
    assert.deepEqual(diamondSplit(2_000, locks, T), { locked: 2_000, withdrawable: 0 });
    assert.deepEqual(diamondSplit(10_000, locks, T + H), { locked: 3_000, withdrawable: 7_000 }, 'Jeton Noktası kilidi bir saat sonra açıldı');
    assert.deepEqual(diamondSplit(10_000, [], T), { locked: 0, withdrawable: 10_000 });
    assert.deepEqual(activeLocks(locks, T).map((l) => l.amount), [3_000, 500]);
  });

  test('kilitli elmas çekilemez ve çevrilemez; mesaj sunucuyla aynı', () => {
    assert.equal(lockedReason(6_500, 10_000, 3_500), null);
    assert.equal(lockedReason(6_501, 10_000, 3_500), '3.500 elmasın kilidi henüz açılmadı; çekilebilir bakiyen 6.500 elmas.');
    assert.equal(lockedReason(2_000, 2_000, 2_000), '2.000 elmasın kilidi henüz açılmadı; çekilebilir bakiyen 0 elmas.');
    assert.equal(lockedReason(20_000, 10_000, 3_500), null, 'bakiyeyi aşan tutar "yetersiz bakiye" olarak ayrıca reddedilir');
  });

  test('ilk açılacak kilit ve kalan süre', () => {
    const locks = [lock(1, T + 2 * D + 4 * H), lock(2, T + 14 * H), lock(3, T - H)];
    assert.equal(nextUnlock(locks, T), T + 14 * H);
    assert.equal(nextUnlock([lock(3, T - H)], T), null);
    assert.equal(timeLeft(T + 2 * D + 4 * H, T), '2 gün 4 saat');
    assert.equal(timeLeft(T + 3 * D, T), '3 gün');
    assert.equal(timeLeft(T + 14 * H + 59 * 60_000, T), '14 saat');
    assert.equal(timeLeft(T + 35 * 60_000, T), '35 dk');
    assert.equal(timeLeft(T + 1_000, T), '1 dk');
    assert.equal(timeLeft(T, T), 'Açıldı');
  });

  test('ilerleme çubuğu kilit süresinin geçen kısmını gösterir', () => {
    const l = lock(1, T + 7 * D);
    assert.equal(lockProgress(l, T), 0);
    assert.equal(lockProgress(l, T + 3.5 * D), 0.5);
    assert.equal(lockProgress(l, T + 8 * D), 1);
    assert.equal(lockProgress(lock(1, T + 12 * H, { channel: 'jeton' }), T), 0.5);
  });

  test('aynı kişiden aynı hediye bir saat içinde tek satırda birleşir, geç açılan süre kalır', () => {
    const gift = { id: 'g1', name: 'Gül', emoji: '', count: 1 };
    let locks = addLock([], lock(10, T + 7 * D, { id: 'a', fromId: 'u2', gift }));
    locks = addLock(locks, lock(10, T + 7 * D + 10 * 60_000, { id: 'b', fromId: 'u2', gift }));
    assert.equal(locks.length, 1);
    assert.equal(locks[0].amount, 20);
    assert.equal(locks[0].gift?.count, 2);
    assert.equal(locks[0].unlockAt, T + 7 * D + 10 * 60_000);
    locks = addLock(locks, lock(10, T + 7 * D, { id: 'c', fromId: 'u5', gift }));
    locks = addLock(locks, lock(10, T + 7 * D + 2 * H, { id: 'd', fromId: 'u2', gift }));
    locks = addLock(locks, lock(10, T + D, { id: 'e', fromId: 'u2', gift, channel: 'jeton' }));
    assert.deepEqual(locks.map((l) => l.id), ['e', 'd', 'c', 'a'], 'başka kişi, saat dışı ve başka kanal ayrı satır');
  });

  test('satır sınırı aşılınca ilk açılacaklar tek satıra katlanır, hiçbiri erken açılmaz', () => {
    let locks: DiamondLock[] = [];
    for (let i = 0; i < MAX_LOCKS + 5; i++) locks = addLock(locks, lock(1, T + i * 2 * H, { id: `x${i}`, fromId: `u${i}` }));
    assert.equal(locks.length, MAX_LOCKS);
    assert.equal(locks.reduce((t, l) => t + l.amount, 0), MAX_LOCKS + 5, 'toplam korunur');
    const folded = locks[locks.length - 1];
    assert.equal(folded.amount, 6);
    assert.equal(folded.unlockAt, T + 5 * 2 * H, 'katlanan satır içindeki en son kilitle açılır');
    assert.ok(locks.slice(0, -1).every((l) => l.unlockAt > folded.unlockAt));
  });

  test('kayıttan okunan kilitler doğrulanır', () => {
    const s = readSnapshot({
      diamondLocks: [
        { id: 'k1', amount: 100, unlockAt: T, channel: 'store', source: 'Hediye' },
        { id: 'k2', amount: 50, unlockAt: T, channel: 'jeton', source: 'Hediye', fromId: 'u5', gift: { id: 'g', name: 'Gül', emoji: '', count: 2 } },
        { id: 'k3', amount: 50, unlockAt: T, channel: 'kripto', source: 'Hediye' },
        { id: 'k4', amount: 0, unlockAt: T, channel: 'store', source: 'Hediye' },
        { id: 'k5', amount: 10, unlockAt: 'yarın', channel: 'store', source: 'Hediye' },
        { id: 'k6', amount: 10, unlockAt: T, channel: 'store', source: 'Hediye', gift: { name: 3 } },
      ],
    })!;
    assert.deepEqual(s.diamondLocks!.map((l) => l.id), ['k1', 'k2']);
    assert.equal('diamondLocks' in readSnapshot({ diamondLocks: 'hepsi' })!, false);
  });
});

describe('Sunucudaki kilitler (canlı mod)', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const srv = (channel: string, channelLabel: string, hours: number, extra: Partial<ServerLockT> = {}): ServerLockT => ({
    id: 7,
    amount: 120,
    channel,
    channelLabel,
    createdAt: iso(T),
    unlockAt: iso(T + hours * H),
    from: null,
    gift: null,
    ...extra,
  });
  type ServerLockT = Parameters<typeof fromServerLock>[0];

  test("label and length come from the server row, not from the two local channels", () => {
    const play = fromServerLock(srv('google_play', 'Google Play', 7 * 24));
    assert.equal(play.channel, 'store');
    assert.equal(lockLabel(play), 'Google Play');
    assert.equal(lockLength(play), '7 gün');

    const cevir = fromServerLock(srv('cevir', 'Elmastan çevrildi', 24));
    assert.equal(cevir.channel, 'jeton', 'Çevir jetonu kısa kilitlenir');
    assert.equal(lockLabel(cevir), 'Elmastan çevrildi');
    assert.equal(lockLength(cevir), '1 gün');

    // A Jeton Noktası passing on store coins keeps the 7-day lock: the length is the server's, whatever the channel.
    const bank = fromServerLock(srv('jeton_noktasi', 'Jeton Noktası', 7 * 24));
    assert.equal(bank.channel, 'jeton');
    assert.equal(lockTotalMs(bank), 7 * D);
    assert.equal(lockLength(bank), '7 gün');
    assert.equal(lockLength(fromServerLock(srv('test', 'Test jetonu', 12))), '12 saat');
  });

  test('progress runs over the real lock length', () => {
    const l = fromServerLock(srv('jeton_noktasi', 'Jeton Noktası', 7 * 24));
    assert.equal(lockProgress(l, T + 7 * 12 * H), 0.5, 'local jeton channel would say 1 day and show it full');
    assert.equal(lockProgress(l, T + 8 * D), 1);
  });

  test('sender, gift and id are kept; a local lock still uses its channel', () => {
    const l = fromServerLock(srv('google_play', 'Google Play', 168, { from: { id: 'abc', name: 'Ayşe' }, gift: { id: 'rose', count: 3 } }), (id) => (id === 'rose' ? { name: 'Gül', emoji: '' } : undefined));
    assert.equal(l.id, 'srv-7');
    assert.equal(l.fromId, 'abc');
    assert.deepEqual(l.gift, { id: 'rose', name: 'Gül', emoji: '', count: 3 });
    assert.equal(l.lockedAt, T);
    const local = lock(10, T + D, { channel: 'jeton' });
    assert.equal(lockLabel(local), 'Jeton Noktası');
    assert.equal(lockTotalMs(local, DEFAULT_RULES), lockMs('jeton', DEFAULT_RULES));
  });
});
