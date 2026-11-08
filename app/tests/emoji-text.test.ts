/// <reference types="node" />
// Emoji in messages: one to three emoji alone are drawn large, emoji in text a size up (lib/emoji-text).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { bigEmojiSize, emojiOnlyCount, emojiRuns } from '@/lib/emoji-text';

describe('emoji-text', () => {
  test('emoji alone are counted, joined and toned emoji count once', () => {
    assert.equal(emojiOnlyCount('😀'), 1);
    assert.equal(emojiOnlyCount(' 😀 ❤️ '), 2);
    assert.equal(emojiOnlyCount('👍🏽'), 1);
    assert.equal(emojiOnlyCount('👨‍👩‍👧'), 1);
    assert.equal(emojiOnlyCount('🇹🇷'), 1);
    assert.equal(emojiOnlyCount('😀😀😀😀'), 4);
  });
  test('anything besides emoji is not emoji alone', () => {
    assert.equal(emojiOnlyCount('selam 😀'), 0);
    assert.equal(emojiOnlyCount('123'), 0);
    assert.equal(emojiOnlyCount(''), 0);
  });
  test('large only for one to three', () => {
    assert.equal(bigEmojiSize(1), 44);
    assert.equal(bigEmojiSize(3), 32);
    assert.equal(bigEmojiSize(4), null);
    assert.equal(bigEmojiSize(0), null);
  });
  test('runs keep the text in order and merge neighbouring emoji', () => {
    assert.deepEqual(emojiRuns('selam 😀🎉 nasılsın'), [
      { text: 'selam ', emoji: false },
      { text: '😀🎉', emoji: true },
      { text: ' nasılsın', emoji: false },
    ]);
    assert.deepEqual(emojiRuns('düz yazı'), [{ text: 'düz yazı', emoji: false }]);
  });
});
