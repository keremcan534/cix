/// <reference types="node" />
// Oda oyunları in a live room: the server's table packet (server/api/room-games.mjs) reaches the room's phones through
// the room bus as "read the table again", only from the server and only for that room; and a live Oyun Merkezi tries
// the room games against bots named as bots, never against real people.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPracticeBot, practiceBots } from '@/lib/games';
import { isServerTable, onServerTable, reportSignal } from '@/lib/live/room-bus';

test('masa paketi yalnız sunucudan ve yalnız o odaya gelir', () => {
  const heard: string[] = [];
  const off = onServerTable('oda-1', () => heard.push('oda-1'));
  reportSignal('oda-1', null, { type: 'table', version: 3 });
  reportSignal('oda-2', null, { type: 'table', version: 1 });
  // A phone can't move anyone's table.
  reportSignal('oda-1', 'p1', { type: 'table', version: 4 });
  off();
  reportSignal('oda-1', null, { type: 'table', version: 5 });
  assert.deepEqual(heard, ['oda-1']);
  assert.equal(isServerTable({ type: 'table' }), true);
  assert.equal(isServerTable({ type: 'gift' }), false);
  assert.equal(isServerTable(null), false);
});

test('Oyun Merkezi’nde canlı denemenin rakipleri bot ve bot diye görünür', () => {
  const bots = practiceBots(3);
  assert.deepEqual(
    bots.map((b) => [b.id, b.name, b.avatar]),
    [
      ['bot-1', 'Bot 1', ''],
      ['bot-2', 'Bot 2', ''],
      ['bot-3', 'Bot 3', ''],
    ],
  );
  assert.ok(bots.every((b) => isPracticeBot(b.id)));
  assert.equal(isPracticeBot('u1'), false);
  assert.equal(isPracticeBot('me'), false);
});
