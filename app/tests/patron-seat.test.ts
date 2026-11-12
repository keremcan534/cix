/// <reference types="node" />
// The Patron seat (lib/patron-seat): its holder is drawn on it only while in the room and on no numbered mic, so
// nobody shows in two places; the demo's Otomatik rule gives the server's answers (server/api/boss-rules.mjs) for the
// same sends; the sheet's words and the chat lines say what the seat does in our own words.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BOSS_HOLD_MS, BOSS_SEAT_DEFAULTS, bossHeadline, bossLeftText, bossLine, bossNeed, bossRules, bossStep, patronOnSeat, type BossSitting } from '@/lib/patron-seat';
import * as server from '../../server/api/boss-rules.mjs';
import * as registry from '../../server/api/live-registry.mjs';

describe('Patron koltuğu: bir kişi tek yerde', () => {
  test('sahibi odada ve numaralı mikrofonda değilse koltukta görünür', () => {
    assert.equal(patronOnSeat('u3', ['u1', null, null], ['me', 'u1', 'u3']), 'u3');
    assert.equal(patronOnSeat('me', [null, 'u1'], ['u1']), 'me', 'kendi telefonum hep odada');
  });

  test('numaralı mikrofona geçince patron koltuğu boş kalır', () => {
    assert.equal(patronOnSeat('u3', ['u1', 'u3', null], ['me', 'u1', 'u3']), null);
    assert.equal(patronOnSeat('me', ['me', null], ['me']), null);
  });

  test('odada olmayan sahip ve sahipsiz koltuk boş görünür', () => {
    assert.equal(patronOnSeat('u3', ['u1', null], ['me', 'u1']), null);
    assert.equal(patronOnSeat(null, ['u1', null], ['me', 'u1']), null);
  });
});

describe('Patron koltuğu: otomatik kural sunucununkiyle aynı', () => {
  const MIN = 60_000;
  const T = 5_000_000;
  const cfg = { ...BOSS_SEAT_DEFAULTS };
  test('varsayılanlar ve bekleme süresi sunucudakiyle aynı', () => {
    assert.deepEqual([registry.DEFAULTS.boss_seat_coins, registry.DEFAULTS.boss_seat_minutes], [BOSS_SEAT_DEFAULTS.coins, BOSS_SEAT_DEFAULTS.minutes]);
    assert.equal(server.BOSS_HOLD_MS, BOSS_HOLD_MS);
  });

  test('her durum ve gönderimde aynı cevap', () => {
    const seats: (BossSitting | null)[] = [
      null,
      { holder: 'a', since: T, until: T + 10 * MIN, spent: 25_000 },
      { holder: 'a', since: T - 4_000, until: T + 10 * MIN, spent: 40_000 },
      { holder: 'a', since: T - 5_000, until: T + 10 * MIN, spent: 40_000 },
      { holder: 'a', since: T - 6_000, until: T + 10 * MIN, spent: 40_000 },
      { holder: 'a', since: T - 20 * MIN, until: T, spent: 90_000 },
      { holder: 'a', since: T - MIN, until: null, spent: 0 },
    ];
    const sends = [
      { sender: 'a', coins: 10 },
      { sender: 'b', coins: 10 },
      { sender: 'b', coins: 24_999 },
      { sender: 'b', coins: 25_000 },
      { sender: 'b', coins: 40_000 },
      { sender: 'b', coins: 40_001 },
      { sender: 'b', coins: 0 },
      { sender: 'b', coins: 1.5 },
    ];
    for (const seat of seats) for (const send of sends) for (const c of [cfg, { coins: 1_000, minutes: 2 }]) assert.deepEqual(bossStep(seat, send, c, T), server.bossStep(seat, send, c, T), JSON.stringify({ seat, send, c }));
  });

  test('oturur, uzatır, 5 saniyeden sonra büyük tek gönderimle el değiştirir', () => {
    let r = bossStep(null, { sender: 'a', coins: 25_000 }, cfg, T);
    assert.equal(r.event, 'sat');
    r = bossStep(r.seat, { sender: 'a', coins: 50 }, cfg, T + MIN);
    assert.deepEqual([r.event, r.seat?.until, r.seat?.spent], ['extended', T + 20 * MIN, 25_050]);
    assert.equal(bossStep(r.seat, { sender: 'b', coins: 99_000 }, cfg, T + BOSS_HOLD_MS).event, null, 'ilk 5 saniye');
    assert.equal(bossStep(r.seat, { sender: 'b', coins: 25_050 }, cfg, T + MIN).event, null, 'eşit yetmez');
    assert.equal(bossStep(r.seat, { sender: 'b', coins: 25_051 }, cfg, T + MIN).event, 'took');
  });
});

describe('Patron koltuğu: sözler', () => {
  const cfg = { ...BOSS_SEAT_DEFAULTS };
  test('boş koltuk eşiği söyler; dolu koltuk ne kadar gerektiğini ve kalan süreyi', () => {
    assert.deepEqual(bossHeadline({ mode: 'auto', holder: null, name: '', left: null, spent: 0, cfg }), {
      title: 'Patron koltuğu seni bekliyor',
      text: 'Tek seferde 25.000 jeton gönderirsen koltuğa oturursun.',
    });
    assert.deepEqual(bossHeadline({ mode: 'auto', holder: 'u2', name: 'Ayla', left: 430, spent: 40_000, cfg }), {
      title: 'Patron koltuğunda Ayla',
      text: 'Koltuğu almak için tek seferde 40.001 jeton gönder. Süresinin bitmesine 8 dakika var.',
    });
    assert.match(bossHeadline({ mode: 'auto', holder: 'me', name: 'Ben', left: 30, spent: 25_000, cfg }).text, /^1 dakikadan az kaldı\. .*10 dakika uzatır\.$/);
    assert.equal(bossHeadline({ mode: 'invite', holder: null, name: '', left: null, spent: 0, cfg }).text, 'Bu odada koltuğa yalnızca oda sahibi oturtur.');
    assert.equal(bossHeadline({ mode: 'invite', holder: 'me', name: 'Ben', left: null, spent: 0, cfg }).title, 'Patron koltuğu senin');
  });

  test('gereken tek gönderim; kalan süre', () => {
    assert.deepEqual([bossNeed('auto', null, 0, cfg), bossNeed('auto', 'u2', 40_000, cfg), bossNeed('auto', 'me', 40_000, cfg), bossNeed('invite', null, 0, cfg)], [25_000, 40_001, 0, 0]);
    assert.deepEqual([bossLeftText(null), bossLeftText(59), bossLeftText(60), bossLeftText(61)], [null, '1 dakikadan az', '1 dakika', '2 dakika']);
  });

  test('kurallar ayarlardaki sayılarla; davet modu ayrı', () => {
    const auto = bossRules('auto', { coins: 30_000, minutes: 15 });
    assert.equal(auto.length, 3);
    assert.match(auto[0], /30\.000 jetonluk/);
    assert.match(auto[1], /15 dakika kalınır.*15 dakika uzatır/);
    assert.match(auto[2], /5 saniyeden uzun/);
    assert.match(bossRules('invite', cfg)[0], /yalnızca oda sahibi/);
  });

  test('sunucunun her olayı için sohbet satırı', () => {
    assert.equal(bossLine({ event: 'sat', name: 'Ayla', mode: null }), '👑 Ayla patron koltuğuna oturdu');
    assert.equal(bossLine({ event: 'took', name: 'Burak', mode: null }), '👑 Burak patron koltuğunu aldı');
    assert.equal(bossLine({ event: 'expired', name: 'Burak', mode: null }), 'Burak için patron koltuğunun süresi doldu');
    assert.equal(bossLine({ event: 'left', name: null, mode: null }), 'Bir üye patron koltuğundan kalktı');
    assert.equal(bossLine({ event: 'removed', name: 'Cem', mode: null }), 'Cem patron koltuğundan indirildi');
    assert.equal(bossLine({ event: 'mode', name: null, mode: 'invite' }), '👑 Patron koltuğu davet modunda');
    assert.equal(bossLine({ event: 'mode', name: null, mode: 'off' }), 'Patron koltuğu kapatıldı');
    assert.equal(bossLine({ event: 'mode', name: null, mode: null }), null);
  });
});
