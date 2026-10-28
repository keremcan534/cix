/// <reference types="node" />
// Lucky gifts: no per-user send cap (only the balance limits sending), the recipient is credited 20 % of the
// gift value, and PK scores the same 20 % for the receiving side (never the sender's reward).
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { LUCKY_RECIPIENT_SHARE, RULES, luckyHostDiamonds } from '@/data/rules';
import { getLucky, luckyPkPoints, newLuckyTxId, sendLucky, setForceNext } from '@/lib/lucky';
import { getPk, pkPointsFor, recordGift, resetPk, startRoomPk } from '@/lib/pk';
import { resetPresence, seedRoom } from '@/lib/room-presence';

/** A wallet that only spends; rewards are counted apart so they don't refill the balance. */
const wallet = (coins: number) => {
  const w = { coins, won: 0 };
  return {
    w,
    spend: (n: number) => (n <= w.coins ? ((w.coins -= n), true) : false),
    credit: (n: number) => void (w.won += n),
  };
};
const send = (userId: string, giftId: string, toId: string, wl: ReturnType<typeof wallet>, txId = newLuckyTxId()) =>
  sendLucky({ txId, userId, userAge: 30, roomId: 'lk-room', giftId, toId, toName: toId }, wl);

describe('Lucky: gönderim sınırı yok', () => {
  test('eski günlük (500) ve dakikalık (60) sınırın üstünde gönderim; yalnız bakiye bitince durur', () => {
    const wl = wallet(20 * 600);
    for (let i = 0; i < 600; i++) {
      const r = send('nolimit', 'lk1', 'host', wl);
      assert.ok(r.ok, `gönderim ${i + 1}: ${r.ok ? '' : r.reason}`);
    }
    assert.equal(wl.w.coins, 0);
    const last = send('nolimit', 'lk1', 'host', wl);
    assert.deepEqual(last, { ok: false, reason: 'Yetersiz bakiye.' });
  });

  test('ayarlarda kullanıcı başına sınır alanı kalmadı', () => {
    const cfg = getLucky().config as Record<string, unknown>;
    assert.equal('perUserDaily' in cfg, false);
    assert.equal('perMinute' in cfg, false);
  });
});

describe('Lucky: alıcıya %20', () => {
  test('tek sabit: kurallar ve elmas hesabı aynı %20’yi kullanır', () => {
    assert.equal(LUCKY_RECIPIENT_SHARE, 0.2);
    assert.equal(RULES.luckyHostShare, LUCKY_RECIPIENT_SHARE);
    assert.equal(luckyHostDiamonds(500), 100);
  });

  test('her pakette alıcının kaydına fiyatın %20’si yazılır; kazanılan ödül alıcıyı etkilemez', () => {
    for (const g of getLucky().config.gifts) {
      setForceNext(1000);
      const wl = wallet(g.price);
      const r = send('share', g.id, 'host', wl);
      assert.ok(r.ok);
      assert.equal(r.record.hostDiamonds, Math.floor(g.price * LUCKY_RECIPIENT_SHARE), g.name);
    }
    setForceNext(null);
  });
});

describe('Lucky: PK puanı %20', () => {
  const R = 'lk-pk-room';
  beforeEach(() => {
    resetPk();
    resetPresence();
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 9_000_000 });
    seedRoom(R, { ownerId: 'host', adminIds: ['admin'], seats: ['host', 'admin', 'p1', 'p2'], capacity: 15, total: 8, regulars: ['fan1', 'fan2'] });
  });
  afterEach(() => mock.timers.reset());
  const pk = () => getPk().sessions[0];

  test('Normal PK: Lucky alıcıya hediye değerinin %20’si kadar puan getirir, ödül sayılmaz', () => {
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'solo' });
    mock.timers.tick(5_000);
    setForceNext(100);
    const r = send('fan1', 'lk3', 'p1', wallet(500));
    assert.ok(r.ok);
    assert.equal(r.record.reward, 50_000);
    assert.equal(luckyPkPoints(r.record), r.record.hostDiamonds);
    assert.ok(recordGift(R, r.record.txId, 'fan1', 'p1', r.record.giftId, luckyPkPoints(r.record)).ok);
    assert.equal(pkPointsFor(pk(), R, 'p1'), 100);
    // A normal gift still scores its full value next to it.
    assert.ok(recordGift(R, 'normal-1', 'fan2', 'p1', 'g-test', 500).ok);
    assert.equal(pkPointsFor(pk(), R, 'p1'), 600);
  });

  test('Takım PK: alıcının takımına %20 eklenir', () => {
    startRoomPk({ roomId: R, starterId: 'host', durationMin: 15, mode: 'team', red: ['host', 'admin'], blue: ['p1', 'p2'] });
    mock.timers.tick(5_000);
    for (let i = 0; i < 3; i++) {
      const r = send('fan2', 'lk4', 'p2', wallet(1_000));
      assert.ok(r.ok);
      recordGift(R, r.record.txId, 'fan2', 'p2', r.record.giftId, luckyPkPoints(r.record));
    }
    const blue = pk().teams.find((t) => t.id === 'blue')!;
    assert.equal(blue.score, 3 * 200);
    assert.equal(pk().teams.find((t) => t.id === 'red')!.score, 0);
  });
});
