// The Patron seat's one-place rule (lib/patron-seat): its holder is drawn on it only while in the room and on no
// numbered mic, so nobody shows in two places.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { patronOnSeat } from '@/lib/patron-seat';

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
