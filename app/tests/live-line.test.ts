// The live line's stream read into events (lib/live/line-events): whole events only, comments skipped, an event
// cut between two reads kept for the next one.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { takeEvents } from '@/lib/live/line-events';

describe('Anlık hat: akış olaylara ayrılır', () => {
  test('tam olaylar alınır, yorumlar atlanır, yarım olay sonraki okumaya kalır', () => {
    const a = takeEvents('retry: 3000\n: ok\n\ndata: {"type":"message","from":"u1"}\n\n: \n\ndata: {"type":"ca');
    assert.deepEqual(a.events, [{ type: 'message', from: 'u1' }]);
    assert.equal(a.rest, 'data: {"type":"ca');
    const b = takeEvents(`${a.rest}ll","call":7}\n\n`);
    assert.deepEqual(b.events, [{ type: 'call', call: 7 }]);
    assert.equal(b.rest, '');
  });
  test('bozuk ya da türü olmayan olay atlanır; CRLF de okunur', () => {
    const r = takeEvents('data: {bozuk\n\ndata: {"from":"x"}\n\ndata: {"type":"follow"}\r\n\r\n');
    assert.deepEqual(r.events, [{ type: 'follow' }]);
  });
});
