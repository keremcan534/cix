/// <reference types="node" />
// Hemen Tanış engine (lib/match): search → found → accept → peer → connect → per-minute billing, with the
// no-charge exits (low balance, timeout, peer declines, busy) and the grace refund when a call drops early.
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';

import { MATCH_ACCEPT_SECONDS, MATCH_GRACE_SECONDS } from '@/data/economy';
import {
  acceptMatch,
  getMatch,
  hangUp,
  modeLabel,
  priceOf,
  resetMatch,
  setMatchDeps,
  setScenario,
  startMatch,
  type MatchMode,
} from '@/lib/match';
import { beginCall, endCall, getMedia } from '@/lib/media';

// Engine delays (lib/match): search 2200 ms + random × 1500 (Math.random is pinned to 0), peer answer 1200 ms,
// connection 1000 ms, the 'drop' scenario cuts the call 5 s after it starts. A timer set inside a timer needs its
// own mock.timers.tick (the mock runs a tick at its end time), so each step is ticked separately.
const SEARCH_MS = 2200;
const PEER_MS = 1200;
const CONNECT_MS = 1000;
const DROP_MS = 5000;

/** A wallet behind the engine's deps: spend fails once the balance can't cover it. */
function wallet(coins: number) {
  const w = { coins };
  const spend = mock.fn((n: number, _reason: string) => (w.coins >= n ? ((w.coins -= n), true) : false));
  const refund = mock.fn((n: number, _reason: string) => void (w.coins += n));
  setMatchDeps({ coins: () => w.coins, spend, refund, blocked: new Set(), following: new Set(), myAge: 25 });
  return { w, spend, refund };
}
const m = () => getMatch();
function found(mode: MatchMode = 'voice') {
  startMatch(mode, 'Herkes');
  assert.equal(m().phase, 'searching');
  mock.timers.tick(SEARCH_MS);
  assert.equal(m().phase, 'found');
}
function active(mode: MatchMode = 'voice') {
  found(mode);
  acceptMatch();
  assert.equal(m().phase, 'awaiting_peer');
  mock.timers.tick(PEER_MS);
  assert.equal(m().phase, 'connecting');
  mock.timers.tick(CONNECT_MS);
  assert.equal(m().phase, 'active');
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 9_000_000 });
  mock.method(Math, 'random', () => 0);
});
afterEach(() => {
  // The engine keeps module state: end any call, drop timers, back to idle/normal, free the devices.
  if (m().phase === 'active') hangUp();
  resetMatch();
  setScenario('normal');
  endCall();
  mock.timers.reset();
  mock.restoreAll();
});

describe('Hemen Tanış: ücretsiz çıkışlar', () => {
  test('bakiye bir dakikaya yetmiyorsa kabul hata verir, görüşme başlamaz, ücret alınmaz', () => {
    const price = priceOf('voice');
    const { spend } = wallet(price - 1);
    found();
    acceptMatch();
    assert.equal(m().phase, 'error');
    assert.equal(m().message, `Bakiye yetersiz: ${modeLabel('voice')} dakikası ${price} jeton. Görüşme başlatılmadı, ücret alınmadı.`);
    mock.timers.tick(10_000);
    assert.equal(m().phase, 'error');
    assert.equal(spend.mock.callCount(), 0);
    assert.equal(getMedia().call, null);
  });

  test(`${MATCH_ACCEPT_SECONDS} sn içinde kabul edilmezse eşleşme kapanır, ücret alınmaz`, () => {
    const { spend } = wallet(1_000);
    found();
    mock.timers.tick(MATCH_ACCEPT_SECONDS * 1000 - 1);
    assert.equal(m().phase, 'found');
    mock.timers.tick(1);
    assert.equal(m().phase, 'declined');
    assert.match(m().message!, /Süre doldu/);
    acceptMatch();
    assert.equal(m().phase, 'declined', 'süre dolduktan sonra kabul işe yaramaz');
    assert.equal(spend.mock.callCount(), 0);
  });

  test('karşı taraf reddederse eşleşme kapanır, cihazlar alınmaz, ücret alınmaz', () => {
    const { spend } = wallet(1_000);
    setScenario('peer_declines');
    found();
    acceptMatch();
    assert.equal(m().phase, 'awaiting_peer');
    mock.timers.tick(PEER_MS);
    assert.equal(m().phase, 'declined');
    assert.match(m().message!, /reddetti\. Ücret alınmadı/);
    mock.timers.tick(10_000);
    assert.equal(m().phase, 'declined');
    assert.equal(spend.mock.callCount(), 0);
    assert.equal(getMedia().call, null);
  });

  test('bağlantı kurulamazsa veya ilk dakika tahsil edilemezse ücret alınmaz, cihazlar bırakılır', () => {
    const { spend } = wallet(1_000);
    setScenario('connect_error');
    found();
    acceptMatch();
    mock.timers.tick(PEER_MS);
    mock.timers.tick(CONNECT_MS);
    assert.equal(m().phase, 'error');
    assert.match(m().message!, /Bağlantı kurulamadı\. Ücret alınmadı/);
    assert.equal(spend.mock.callCount(), 0);
    assert.equal(getMedia().call, null);
    // Enough coins at accept, but the charge itself fails (e.g. daily limit).
    setScenario('normal');
    resetMatch();
    spend.mock.mockImplementation(() => false);
    found();
    acceptMatch();
    mock.timers.tick(PEER_MS);
    mock.timers.tick(CONNECT_MS);
    assert.equal(m().phase, 'error');
    assert.match(m().message!, /Ödeme alınamadı/);
    assert.equal(spend.mock.callCount(), 1);
    assert.equal(getMedia().call, null, 'cihazlar geri bırakıldı');
  });

  test('bire bir görüşme sürerken arama başlamaz: meşgul', () => {
    const { spend } = wallet(1_000);
    assert.ok(beginCall({ kind: 'direct', mode: 'voice', peerId: 'u1' }).ok);
    startMatch('voice');
    assert.equal(m().phase, 'busy');
    assert.equal(m().message, 'Şu an bire bir bir görüşmedesin; yeni eşleşme başlatılamaz.');
    mock.timers.tick(SEARCH_MS + 10_000);
    assert.equal(m().phase, 'busy', 'arka planda arama yok');
    assert.equal(getMedia().call?.kind, 'direct');
    assert.equal(spend.mock.callCount(), 0);
  });

  test('arama sürerken ikinci başlatma hiçbir şeyi değiştirmez', () => {
    wallet(1_000);
    startMatch('voice', 'Herkes');
    const before = m();
    startMatch('video', 'Kadın');
    assert.equal(m(), before);
    mock.timers.tick(SEARCH_MS);
    assert.deepEqual([m().phase, m().mode, m().filter], ['found', 'voice', 'Herkes']);
  });
});

describe('Hemen Tanış: dakika ücreti', () => {
  for (const mode of ['voice', 'video'] as const) {
    test(`bağlanınca ilk dakika alınır, her yeni dakikada bir dakika daha (${modeLabel(mode)})`, () => {
      const price = priceOf(mode);
      const { spend, refund } = wallet(10 * price);
      active(mode);
      assert.equal(m().charged, price);
      assert.equal(spend.mock.callCount(), 1);
      assert.match(spend.mock.calls[0].arguments[1], /1\. dk$/);
      assert.deepEqual([getMedia().call?.kind, getMedia().call?.mode], ['match', mode]);
      mock.timers.tick(59_000);
      assert.deepEqual([m().elapsed, m().charged, spend.mock.callCount()], [59, price, 1]);
      mock.timers.tick(1_000);
      assert.deepEqual([m().elapsed, m().charged, spend.mock.callCount()], [60, 2 * price, 2]);
      assert.match(spend.mock.calls[1].arguments[1], /2\. dk$/);
      hangUp();
      assert.equal(m().phase, 'completed');
      assert.deepEqual([m().last?.charged, m().last?.refunded, m().last?.seconds], [2 * price, 0, 60]);
      assert.equal(refund.mock.callCount(), 0);
      assert.equal(getMedia().call, null);
    });
  }

  test('bakiye 2. dakikaya yetmezse önce uyarır, sonra görüşme güvenle biter', () => {
    const price = priceOf('voice');
    const { spend, refund } = wallet(price);
    active();
    mock.timers.tick(39_000);
    assert.equal(m().lowBalance, false);
    mock.timers.tick(1_000);
    assert.equal(m().lowBalance, true, 'dakika bitmeden 20 sn önce uyarı');
    mock.timers.tick(20_000);
    assert.equal(m().phase, 'completed');
    assert.equal(m().message, 'Bakiyen bittiği için görüşme güvenli şekilde sonlandırıldı.');
    assert.deepEqual([m().last?.charged, m().last?.refunded, m().last?.seconds], [price, 0, 60]);
    assert.equal(spend.mock.callCount(), 2);
    assert.equal(refund.mock.callCount(), 0);
    assert.equal(getMedia().call, null);
    mock.timers.tick(120_000);
    assert.equal(spend.mock.callCount(), 2, 'sayaç durdu');
  });

  test(`bağlantı ${MATCH_GRACE_SECONDS} sn dolmadan koparsa ilk dakika iade edilir`, () => {
    const price = priceOf('voice');
    const { w, spend, refund } = wallet(5 * price);
    setScenario('drop');
    active();
    mock.timers.tick(DROP_MS);
    assert.equal(m().phase, 'error');
    assert.match(m().message!, /Bağlantı koptu/);
    assert.deepEqual([m().last?.refunded, m().last?.charged, m().last?.seconds], [price, 0, DROP_MS / 1000]);
    assert.equal(refund.mock.callCount(), 1);
    assert.equal(refund.mock.calls[0].arguments[0], price);
    assert.equal(w.coins, 5 * price, 'bakiye eski haline döndü');
    assert.equal(getMedia().call, null);
    mock.timers.tick(120_000);
    assert.deepEqual([spend.mock.callCount(), refund.mock.callCount()], [1, 1]);
  });
});
