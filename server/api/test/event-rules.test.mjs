// The events list's time filter (event-rules.mjs), without a database: days are the person's own, from the offset the
// app sends, and Türkiye's when a request sends none.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { offsetOf, windowOf } from '../event-rules.mjs';

const iso = (ms) => new Date(ms).toISOString();

describe('Etkinlik zaman filtresi', () => {
  test('saat dilimi yoksa ya da okunamıyorsa Türkiye saati sayılır', () => {
    for (const v of [null, undefined, '', ' ', 'abc', '90.5', '-721', '841']) assert.equal(offsetOf(v), 180, JSON.stringify(v));
    for (const [v, n] of [['0', 0], ['180', 180], ['-300', -300], ['-720', -720], ['840', 840]]) assert.equal(offsetOf(v), n, v);
  });

  test('yarın, kişinin kendi gününe göre hesaplanır', () => {
    // 22:45 UTC on 18 November is 01:45 on the 19th in Türkiye.
    const now = Date.UTC(2026, 10, 18, 22, 45);
    const w = windowOf('tomorrow', now, 180);
    assert.deepEqual([iso(w.from), iso(w.to)], ['2026-11-19T21:00:00.000Z', '2026-11-20T21:00:00.000Z']);
    const utc = windowOf('tomorrow', now, 0);
    assert.deepEqual([iso(utc.from), iso(utc.to)], ['2026-11-19T00:00:00.000Z', '2026-11-20T00:00:00.000Z']);
  });

  test('saat dilimi göndermeyen istekte 90 dakika sonraki etkinlik gece de bugündür', () => {
    // The CI run that failed: an event 90 minutes on, asked for without tz at 01:45 Türkiye time.
    const now = Date.UTC(2026, 10, 18, 22, 45);
    const start = now + 90 * 60_000;
    const w = windowOf('tomorrow', now, offsetOf(null));
    assert.equal(start >= w.from && start < w.to, false);
  });
});
