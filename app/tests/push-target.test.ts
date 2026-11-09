// A tapped push notification opens the right screen (lib/push-target): the chat for a message, the person for a
// gift or a follow, Aile for family news; a ringing call only opens the app (its incoming call card answers it).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { pushTarget } from '@/lib/push-target';

describe('Bildirime dokununca açılan ekran', () => {
  test('mesaj, hediye, takip, aile, para çekme, arama', () => {
    assert.equal(pushTarget({ type: 'message', from: 'abc' }), '/sohbet/abc');
    assert.equal(pushTarget({ type: 'message' }), '/(tabs)/mesajlar');
    assert.equal(pushTarget({ type: 'gift', from: 'u9' }), '/kullanici/u9');
    assert.equal(pushTarget({ type: 'follow', from: 'u9' }), '/kullanici/u9');
    assert.equal(pushTarget({ type: 'family_request', family: '4' }), '/aile');
    assert.equal(pushTarget({ type: 'withdrawal', id: '1' }), '/cuzdan');
    assert.equal(pushTarget({ type: 'call', from: 'u2', call: '7' }), null, 'çalan arama: uygulama açılır, kart cevaplar');
    assert.equal(pushTarget({ type: 'call', call: '7', missed: 'true' }), '/bildirimler');
    assert.equal(pushTarget({ type: 'moment', id: '3' }), '/bildirimler');
    assert.equal(pushTarget(undefined), '/bildirimler');
  });
});
