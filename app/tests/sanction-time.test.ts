/// <reference types="node" />
// Sanction countdowns (lib/sanction-time): they run on the server's clock, a room mute counts only in its room,
// and a lifetime ban never runs out.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SanctionView } from '@/lib/api';
import { formatLeft, remaining, serverNow, setServerNow, stopping } from '@/lib/sanction-time';

const base: SanctionView = {
  id: 1,
  type: 'mute_global_text',
  label: 'Genel yazılı susturma',
  restricts: ['room_text', 'dm'],
  roomId: null,
  reasonCode: 'spam',
  reason: 'Spam',
  reasonText: '',
  startAt: '2026-11-04T10:00:00.000Z',
  endAt: '2026-11-04T11:00:00.000Z',
  permanent: false,
  appliedBy: 'Platform moderatörü',
  status: 'active',
};
const at = (iso: string) => Date.parse(iso);

test('kalan süre sunucu saatine göre; telefon saati değişse de sunucunun dediği geçerli', () => {
  setServerNow('2026-11-04T10:30:00.000Z');
  const now = serverNow();
  assert.ok(Math.abs(now - at('2026-11-04T10:30:00.000Z')) < 1000, 'sunucu saatinden başlar, telefonun saatinden değil');
  assert.ok(Math.abs(remaining(base) - 30 * 60_000) < 1000);
  assert.equal(remaining(base, at('2026-11-04T12:00:00.000Z')), 0, 'süre dolunca sıfır, eksiye düşmez');
  assert.equal(remaining({ ...base, permanent: true, endAt: null }), Infinity);
});

test('geri sayım yazısı en büyük iki birimi gösterir', () => {
  assert.equal(formatLeft(Infinity), 'Süresiz');
  assert.equal(formatLeft(65_000), '1 dk 05 sn');
  assert.equal(formatLeft(3 * 3600_000 + 5 * 60_000), '3 saat 5 dk');
  assert.equal(formatLeft(2 * 86400_000 + 4 * 3600_000), '2 gün 4 saat');
  assert.equal(formatLeft(400 * 86400_000), '1 yıl 1 ay');
  assert.equal(formatLeft(500), '0 dk 01 sn', 'son saniye sıfır gösterilmez');
});

test('oda susturması yalnız kendi odasında, genel susturma her odada durdurur', () => {
  const now = at('2026-11-04T10:30:00.000Z');
  const room: SanctionView = { ...base, id: 2, type: 'mute_room_voice', restricts: ['room_voice'], roomId: 'oda-a' };
  assert.equal(stopping([room], 'room_voice', 'oda-a', now)?.id, 2);
  assert.equal(stopping([room], 'room_voice', 'oda-b', now), null, 'başka odada mikrofon açık');
  assert.equal(stopping([base], 'room_text', 'oda-b', now)?.id, 1);
  assert.equal(stopping([base], 'dm', null, now)?.id, 1);
  assert.equal(stopping([base], 'room_voice', 'oda-a', now), null, 'yazılı susturma mikrofona dokunmaz');
});

test('süresi biten, kaldırılan veya onay bekleyen yaptırım durdurmaz', () => {
  const later = at('2026-11-04T11:00:01.000Z');
  assert.equal(stopping([base], 'dm', null, later), null);
  assert.equal(stopping([{ ...base, status: 'lifted' }], 'dm', null, at('2026-11-04T10:30:00.000Z')), null);
  assert.equal(stopping([{ ...base, status: 'pending' }], 'dm', null, at('2026-11-04T10:30:00.000Z')), null);
  assert.equal(stopping([{ ...base, permanent: true, endAt: null }], 'dm', null, at('2030-01-01T00:00:00.000Z'))?.id, 1, 'süresiz olan hep geçerli');
});
