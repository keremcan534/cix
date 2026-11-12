/// <reference types="node" />
// Etkinlik Merkezi in the app: the themes are the server's (names and room levels), every server theme has a look,
// the times read the way people say them, a place line tells the truth about the capacity, an event notice opens the
// event, and the form's first start respects the earliest time the server allows. Aşama 4: the reminders and report
// periods are the server's, the reminder sentence, the share words (no link in a message, so they pass the contact
// filter on both sides), and the report's numbers as shown.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as rules from '../../server/api/event-rules.mjs';
import * as serverFilter from '../../server/api/contact-filter.mjs';
import type { EventReport } from '@/lib/api';
import { checkText } from '@/lib/contact-filter';
import {
  REMINDER_KINDS,
  REMINDER_LABEL,
  REPORT_DAYS,
  THEMES,
  THEME_LOOK,
  demoEvents,
  elapsedText,
  endRows,
  eventMessageText,
  eventPath,
  eventShareText,
  firstStart,
  placesText,
  rateText,
  recordText,
  reminderLine,
  reportTiles,
  spanText,
  timeLine,
  whenText,
} from '@/lib/events';
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

  test('hatırlatmalar ve rapor dönemleri sunucudakiyle aynı; hatırlatma cümlesi', () => {
    assert.deepEqual(REMINDER_KINDS, rules.REMINDER_KINDS);
    assert.deepEqual(REMINDER_LABEL, rules.REMINDER_LABEL);
    assert.deepEqual(REPORT_DAYS, rules.REPORT_DAYS);
    assert.equal(reminderLine(['hour', 'quarter', 'start']), 'Başlamadan 1 saat ve 15 dakika önce, bir de başlarken bildirim gelir.');
    assert.equal(reminderLine(['quarter', 'start']), 'Başlamadan 15 dakika önce, bir de başlarken bildirim gelir.');
    assert.equal(reminderLine(['hour']), 'Başlamadan 1 saat önce bildirim gelir.');
    assert.equal(reminderLine(['start']), 'Etkinlik başlarken bildirim gelir.');
    assert.equal(reminderLine([]), null);
  });

  test('paylaşım: bağlantı etkinliği açar, mesajda bağlantı yok ve süzgeçten geçer', () => {
    const now = new Date(2026, 10, 11, 20, 0).getTime();
    const e = { title: 'Akustik Gece', startsAt: new Date(2026, 10, 11, 21, 30).toISOString(), room: { id: 'r1', title: 'Gece Kuşları', closed: false } };
    assert.equal(eventPath(42), '?etkinlik=42');
    assert.equal(eventShareText(e, now), 'Similar Club’da “Akustik Gece” etkinliği: Bugün 21:30, “Gece Kuşları” odasında. Sen de gel!');
    const msg = eventMessageText(e, now);
    assert.equal(msg, '📅 Seni “Akustik Gece” etkinliğine bekliyorum! Bugün 21:30, “Gece Kuşları” odasında.');
    assert.equal(checkText(msg).ok, true, 'uygulamanın süzgeci');
    assert.equal((serverFilter.checkText(msg) as { ok: boolean }).ok, true, 'sunucunun süzgeci');
  });

  test('rapor sayıları ekranda', () => {
    const r: EventReport = {
      days: 30,
      since: '2026-10-12T00:00:00.000Z',
      events: 4,
      approved: 2,
      rejected: 1,
      cancelled: 1,
      review: 1,
      started: 1,
      reservations: 1234,
      attended: 2,
      missed: 1,
      participants: 3,
      attendanceRate: 0.667,
      avgParticipants: 2.5,
      categories: [],
      ends: { owner: 1, time: 0, room_closed: 2, not_started: 0, admin: 0 },
      records: [],
    };
    assert.deepEqual(reportTiles(r), [
      ['Etkinlik', '4'],
      ['Onaylanan', '2'],
      ['Reddedilen', '1'],
      ['İptal edilen', '1'],
      ['Yer ayırtma', '1.234'],
      ['Katılımcı', '3'],
      ['Katılım oranı', '%67'],
      ['Ortalama katılım', '2,5'],
    ]);
    assert.equal(rateText(null), '—');
    assert.equal(reportTiles({ ...r, avgParticipants: null }).at(-1)?.[1], '—');
    assert.deepEqual(endRows(r), [
      ['Düzenleyen bitirdi', 1],
      ['Oda kapandı', 2],
    ]);
    const rec = { event: { id: 1, title: 'A' }, room: 'Oda', by: 'Sistem', at: '2026-11-11T20:00:00.000Z' };
    assert.equal(recordText({ ...rec, action: 'start', reason: null }), 'Başladı');
    assert.equal(recordText({ ...rec, action: 'end', reason: 'time' }), 'Bitti · Süresi doldu');
    assert.equal(recordText({ ...rec, action: 'end', reason: null }), 'Bitti');
    assert.equal(recordText({ ...rec, action: 'not_started', reason: null }), 'Başlatılmadı');
  });
});
