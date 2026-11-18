// A message in the chat already on screen shows no banner (lib/open-chat, used by lib/push).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { isOpenChat, markChatOpen } from '@/lib/open-chat';

describe('Açık sohbetin bildirimi', () => {
  test('yalnız ekrandaki kişinin mesajı susturulur', () => {
    const close = markChatOpen('u1');
    assert.equal(isOpenChat({ type: 'message', sender: 'u1' }), true);
    assert.equal(isOpenChat({ type: 'message', from: 'u1' }), true, 'Expo bildirimi');
    assert.equal(isOpenChat({ type: 'message', sender: 'u2' }), false, 'başka sohbet');
    assert.equal(isOpenChat({ type: 'gift', sender: 'u1' }), false, 'hediye bildirimi görünür');
    close();
    assert.equal(isOpenChat({ type: 'message', sender: 'u1' }), false);
  });

  test('üstüne başka sohbet açıldıysa alttaki kapanınca onu silmez', () => {
    const closeA = markChatOpen('a');
    const closeB = markChatOpen('b');
    closeA();
    assert.equal(isOpenChat({ type: 'message', sender: 'b' }), true);
    closeB();
  });
});
