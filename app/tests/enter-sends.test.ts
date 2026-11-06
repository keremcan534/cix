/// <reference types="node" />
// mesajlar-14 (web): the chat composers are multi-line, and react-native-web adds a new line on Enter there unless
// the composer handles the key itself (lib/enter-sends).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { TextInputKeyPressEvent } from 'react-native';
import { onWebEnter, sendsOnEnter } from '@/lib/enter-sends';

const press = (nativeEvent: object) => {
  let prevented = false;
  const e = { nativeEvent, preventDefault: () => void (prevented = true) } as unknown as TextInputKeyPressEvent;
  return { e, prevented: () => prevented };
};

describe('Web sohbet kutusu: Enter gönderir (onWebEnter)', () => {
  test('Enter gönderir ve yeni satır eklenmez', () => {
    let sent = 0;
    const p = press({ key: 'Enter' });
    onWebEnter(p.e, () => sent++);
    assert.equal(sent, 1);
    assert.equal(p.prevented(), true);
  });

  test('Shift+Enter yeni satırdır, başka tuş ve yazı birleştirme (IME) göndermez', () => {
    let sent = 0;
    for (const k of [{ key: 'Enter', shiftKey: true }, { key: 'a' }, { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
      const p = press(k);
      onWebEnter(p.e, () => sent++);
      assert.equal(p.prevented(), false, JSON.stringify(k));
    }
    assert.equal(sent, 0);
    assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }), true);
  });
});
