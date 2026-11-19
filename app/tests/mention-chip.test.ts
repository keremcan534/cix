/// <reference types="node" />
// "Senden bahsedildi" in the room chat (lib/mention-chip, components/room/chat-feed; Güncelleme 7, madde 2): a line
// that names me and went by unseen gets a chip; a tap goes to it, oldest first; it goes away once the line is seen.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MAX_MENTIONS, addMention, chipLabel, mentionChip, mentionsIn, seenMentions, type MentionMark } from '@/lib/mention-chip';

const SRC = resolve(import.meta.dirname, '../src');
const m = (id: string, from = 'u-kaan'): MentionMark => ({ id, from });
const ids = (...x: string[]) => new Set(x);

describe('Senden bahsedildi', () => {
  test('satır ekranda değilse çip var; ekrandaysa yok', () => {
    const list = [m('l1')];
    assert.deepEqual(mentionChip(list, ids('l7', 'l8')), { to: 'l1', count: 1 });
    assert.equal(mentionChip(list, ids('l1', 'l2')), null);
    assert.equal(mentionChip([], ids()), null, 'bahsedilmedikçe çip yok');
  });

  test('birkaç bahsetme: önce en eskisine gider, sayısı yazar', () => {
    let list: MentionMark[] = [];
    for (const id of ['l1', 'l2', 'l3']) list = addMention(list, m(id));
    assert.deepEqual(mentionChip(list, ids()), { to: 'l1', count: 3 });
    assert.equal(chipLabel(3), 'Senden 3 kez bahsedildi');
    assert.equal(chipLabel(1), 'Senden bahsedildi');
    // A tap on it: that line is seen; the next tap goes to the next one.
    list = seenMentions(list, ['l1']);
    assert.deepEqual(mentionChip(list, ids('l9')), { to: 'l2', count: 2 });
  });

  test('aynı satır iki kez eklenmez; en çok MAX_MENTIONS tutulur, en eskiler düşer', () => {
    let list: MentionMark[] = [];
    for (let i = 1; i <= MAX_MENTIONS + 2; i++) list = addMention(list, m(`l${i}`));
    list = addMention(list, m(`l${MAX_MENTIONS + 2}`));
    assert.equal(list.length, MAX_MENTIONS);
    assert.equal(list[0].id, 'l3');
  });

  test('görülen satırlar düşer; hiçbiri görülmediyse liste aynen kalır', () => {
    const list = [m('l1'), m('l2')];
    assert.equal(seenMentions(list, ['l9']), list);
    assert.deepEqual(seenMentions(list, ['l2']), [m('l1')]);
  });

  test('sohbetten düşen (eski) satıra çip yok', () => {
    assert.deepEqual(mentionsIn([m('l1'), m('l2')], ids('l2', 'l3')), [m('l2')]);
  });

  test('oda: bahseden satırın kimliği çipin gittiği kimlik; çip yalnız oda sohbetinde', () => {
    const room = readFileSync(resolve(SRC, 'components/room/live-room.tsx'), 'utf8');
    assert.match(room, /setUnseenMentions\(\(l\) => addMention\(l, \{ id: line, from \}\)\);/);
    assert.match(room, /return addMsg\(\{ id: line, userId: from, text: mask\(msg\.text\) \}\);/);
    assert.match(room, /mentions=\{chipMentions\} onMentionsSeen=\{mentionsSeen\} attended=\{chatAttended\}/);
    // A line under a sheet, or with the room minimized, is not seen.
    assert.match(room, /const chatAttended = full && !panel && !giftOpen/);
    const feed = readFileSync(resolve(SRC, 'components/room/chat-feed.tsx'), 'utf8');
    assert.match(feed, /onViewableItemsChanged=\{onViewable\}/);
    assert.match(feed, /scrollToIndex\(\{ index, viewPosition: 0\.5, animated: true \}\)/);
    assert.match(feed, /onScrollToIndexFailed=/);
  });
});
