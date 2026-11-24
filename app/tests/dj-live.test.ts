/// <reference types="node" />
// DJ modu (lib/live/dj-live, server/api/dj-live.mjs): the server's answer read defensively (a malformed one hides the
// switch, never crashes), the quality kept within music bounds, the phone's inputs offered one per kind with a USB
// sound card first, and the room's bar listing only people the room lets.
import { register } from 'node:module';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

register('./api-stub-hooks.mjs', import.meta.url);

const { DJ_KBPS_MAX, DJ_KBPS_MIN, choicesOf, djKbps, liveDjsOf, parseDjLive, reportDj, djState } = await import('@/lib/live/dj-live');

describe('DJ modu', () => {
  test('sunucunun cevabı: bozuksa kapalı, kalite 0 ise açılamaz', () => {
    assert.deepEqual(parseDjLive(null), { may: false, on: false, kbps: 0, perRoom: 1, live: [] });
    assert.deepEqual(parseDjLive('x'), { may: false, on: false, kbps: 0, perRoom: 1, live: [] });
    const ok = parseDjLive({ may: true, on: false, kbps: 96, perRoom: 2, live: [{ id: 'u1', publicNo: '100000000001', name: 'Dj' }, { id: 5 }, null, { id: 'u2' }] });
    assert.deepEqual(ok, { may: true, on: false, kbps: 96, perRoom: 2, live: [{ id: 'u1', publicNo: '100000000001', name: 'Dj' }, { id: 'u2', publicNo: null, name: 'Üye' }] });
    assert.equal(parseDjLive({ may: true, kbps: 0 }).may, false, 'yönetim kapattı');
    assert.equal(parseDjLive({ may: true, kbps: 96, perRoom: 0 }).perRoom, 1);
  });

  test('kalite müzik sınırları içinde kalır', () => {
    assert.equal(djKbps(96), 96);
    assert.equal(djKbps(1000), DJ_KBPS_MAX);
    assert.equal(djKbps(8), DJ_KBPS_MIN);
    assert.equal(djKbps('128'), 96, 'sayı değilse varsayılan');
    assert.equal(djKbps(Number.NaN), 96);
  });

  test('girişler: türü başına bir tane, önce USB ses kartı; telefonun mikrofonları tek satır', () => {
    const list = choicesOf([
      { id: 1, kind: 'phone', name: 'SM-A525F' },
      { id: 2, kind: 'phone', name: 'SM-A525F' },
      { id: 3, kind: 'bluetooth', name: 'Kulaklık' },
      { id: 9, kind: 'usb', name: 'USB Audio CODEC' },
      { id: 4, kind: 'wired', name: '' },
      { id: 10, kind: 'usb', name: 'USB Audio CODEC' },
    ]);
    assert.deepEqual(
      list.map((c) => [c.key, c.label, c.external]),
      [
        ['n9', 'USB ses kartı / mikser', true],
        ['n4', 'Kablolu giriş (kulaklık soketi)', true],
        ['n1', 'Telefonun mikrofonu', false],
        ['n3', 'Bluetooth', false],
      ],
    );
    assert.equal(list[0].sub, 'USB Audio CODEC');
    assert.equal(list[0].nativeInput, 9);
    assert.equal(list.find((c) => c.key === 'n3')?.warn, true, 'Bluetooth önerilmez');
    assert.deepEqual(choicesOf([]), []);
  });

  test('odadaki şerit: yalnız sahip ve DJ’ler (kendi özniteliğini yazan sayılmaz)', () => {
    const peers = [
      { identity: 'owner', name: 'Sahip', dj: true },
      { identity: 'dj1', name: 'Dj Bir', dj: false },
      { identity: 'guest', name: 'Dinleyici', dj: true },
      { identity: 'dj2', name: 'Dj İki', dj: true },
    ];
    const may = (id: string) => ['owner', 'dj1', 'dj2'].includes(id);
    assert.deepEqual(liveDjsOf(peers, may).map((p) => p.name), ['Sahip', 'Dj İki']);
  });

  test('motorun bildirdiği durum: aynı durum tekrar yayılmaz', () => {
    reportDj({ on: true, kbps: 96, stopped: null });
    const a = djState();
    reportDj({ on: true, kbps: 96, stopped: null });
    assert.equal(djState(), a);
    reportDj({ on: false, kbps: 0, stopped: 'seat' });
    assert.deepEqual(djState(), { on: false, kbps: 0, stopped: 'seat' });
  });
});
