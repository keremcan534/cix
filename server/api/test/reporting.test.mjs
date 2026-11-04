// The pieces of reporting.mjs that need no server: DSN parsing, masking and the event shape.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { eventOf, framesOf, parseDsn, scrub } from '../reporting.mjs';

describe('error reporting', () => {
  test('parseDsn: Sentry DSNs, with and without a path; anything else is off', () => {
    assert.deepEqual(parseDsn('https://abc123@o42.ingest.de.sentry.io/4509'), {
      url: 'https://o42.ingest.de.sentry.io/api/4509/envelope/',
      key: 'abc123',
      dsn: 'https://abc123@o42.ingest.de.sentry.io/4509',
    });
    assert.equal(parseDsn('https://k@self.hosted/sentry/7').url, 'https://self.hosted/sentry/api/7/envelope/');
    for (const bad of ['', undefined, 'not a url', 'https://sentry.io/1', 'https://k@sentry.io/']) assert.equal(parseDsn(bad), null, String(bad));
  });

  test('scrub masks phone numbers but keeps short numbers', () => {
    assert.equal(scrub('Key (phone)=(+905321234567) already exists'), 'Key (phone)=([numara]) already exists');
    assert.equal(scrub('0532 123 45 67 aradı'), '[numara] aradı');
    assert.equal(scrub('panel 503: 12 olay'), 'panel 503: 12 olay');
  });

  test('an error becomes an exception with frames, oldest first', () => {
    const e = Object.assign(new TypeError('bad +905321234567'), { code: '23514' });
    const ev = eventOf({ error: e, tags: { path: '/api/x' } });
    assert.match(ev.event_id, /^[0-9a-f]{32}$/);
    assert.equal(ev.platform, 'node');
    assert.equal(ev.exception.values[0].type, 'TypeError');
    assert.equal(ev.exception.values[0].value, 'bad [numara]');
    assert.deepEqual(ev.tags, { path: '/api/x', code: '23514' });
    const frames = ev.exception.values[0].stacktrace.frames;
    assert.ok(frames.length > 0);
    assert.match(frames.at(-1).filename, /reporting\.test\.mjs$/);
    assert.equal(frames.at(-1).in_app, true);
    assert.deepEqual(framesOf('Error: x\n    at f (/a/b.mjs:1:2)\n    at node:internal/x:3:4'), [
      { function: '?', filename: 'node:internal/x', lineno: 3, colno: 4, in_app: false },
      { function: 'f', filename: '/a/b.mjs', lineno: 1, colno: 2, in_app: true },
    ]);
    assert.equal(eventOf({ message: 'finance sync panel 500', level: 'warning' }).message.formatted, 'finance sync panel 500');
  });
});
