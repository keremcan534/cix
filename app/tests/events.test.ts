/// <reference types="node" />
// Etkinlik Merkezi in the app: the themes are the server's (names and room levels), every server theme has a look,
// the times read the way people say them, a place line tells the truth about the capacity, an event notice opens the
// event, and the form's first start respects the earliest time the server allows.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as rules from '../../server/api/event-rules.mjs';
import { THEMES, THEME_LOOK, demoEvents, elapsedText, firstStart, placesText, spanText, timeLine, whenText } from '@/lib/events';
import { pushTarget } from '@/lib/push-target';

describe('Etkinlik Merkezi', () => {
  test('temalar sunucudakiyle aynı; her temanın görünümü var', () => {
    assert.deepEqual(THEMES, rules.THEMES);
    for (const t of THEMES) assert.ok(THEME_LOOK[t.id], t.id);
  });

  test('zaman yazıları', () => {
    const now = new Date(2026, 10, 11, 20, 0).getTime();
    assert.equal(whenText(new Date(2026, 10, 11, 21, 30).toISOString(), now), 'Bugün 21:30');
    assert.equal(whenText(new Date(2026, 10, 12, 9, 5).toISOString(), now), 'Yarın 09:05');
    assert.equal(whenText(new Date(2026, 10, 14, 22, 0).toISOString(), now), 'Cumartesi 22:00');
    assert.equal(whenText(new Date(2026, 11, 2, 18, 0).toISOString(), now), '2 Aralık 18:00');
    assert.deepEqual([spanText(45 * 60_000), spanText(120 * 60_000), spanText(95 * 60_000)], ['45 dk', '2 sa', '1 sa 35 dk']);
    assert.equal(elapsedText(3_725_000), '01:02:05');
    const soon = { state: 'upcoming' as const, startsAt: new Date(now + 40 * 60_000).toISOString(), endsAt: '', startedAt: null, endedAt: null };
    assert.equal(timeLine(soon, now), '40 dk sonra başlıyor');
  });

  test('yer satırı kontenjanı doğru söyler', () => {
    const e = { reserved: 50, capacity: 50, reservation: true, state: 'upcoming' as const, came: 0 };
    assert.equal(placesText(e), 'Kontenjan doldu');
    assert.equal(placesText({ ...e, reserved: 12 }), '12 / 50 yer');
    assert.equal(placesText({ ...e, capacity: null, reserved: 7 }), '7 kişi yer ayırttı');
    assert.equal(placesText({ ...e, reservation: false }), 'Yer ayırtmadan katılım');
    assert.equal(placesText({ ...e, state: 'live', came: 31 }), '31 katılımcı');
  });

  test('ilk başlangıç en erken izin verilen zamandan sonra, çeyrek saate yuvarlı', () => {
    const now = new Date(2026, 10, 11, 20, 7).getTime();
    const t = firstStart(30, now);
    assert.ok(t.getTime() >= now + 30 * 60_000);
    assert.equal(t.getMinutes() % 15, 0);
  });

  test('etkinlik bildirimi etkinliği açar', () => {
    assert.equal(pushTarget({ type: 'event', id: '42' }), '/?etkinlik=42');
    assert.equal(pushTarget({ type: 'event', id: 'x' }), '/');
  });

  test('demo etkinlikleri her durumu gösterir', () => {
    const list = demoEvents([{ id: 'r1', title: 'Oda', hostId: 'u1', cover: '' }], () => ({ name: 'Ev sahibi' }), Date.now());
    assert.deepEqual([...new Set(list.map((e) => e.state))].sort(), ['ended', 'live', 'upcoming']);
    for (const e of list) assert.ok(THEME_LOOK[e.theme], e.theme);
  });
});
