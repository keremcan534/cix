// Spam rules for direct messages (owners, 26 Nov 2026; message-quality.mjs, messages.mjs): one letter or digit and a
// run of one character are refused, the same words a third time in a row are refused; nothing is stored or charged.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const send = (s, to, text, ref = `s${rnd(8)}`) => call('POST', '/api/messages', { to, text, ref }, s);

describe('Mesaj spamı', () => {
  test('tek harf, tek rakam, uzun tekrar ve üçüncü kez aynı mesaj reddedilir', async () => {
    const [a, b] = await Promise.all([signUp('Gönderen'), signUp('Alan')]);
    await h.sql.query('INSERT INTO follows (follower, followee) VALUES ($1, $2), ($2, $1)', [a.user.id, b.user.id]);
    for (const t of ['a', '7', 'k!', 'aaaaaaa', '??????']) {
      const [st, j] = await send(a.session, b.user.id, t);
      assert.deepEqual([st, j.code], [400, 'spam'], t);
    }
    for (const t of ['Merhaba!', 'merhaba']) assert.equal((await send(a.session, b.user.id, t))[0], 200, t);
    const [st, j] = await send(a.session, b.user.id, 'MERHABA.');
    assert.deepEqual([st, j.code], [400, 'spam_repeat'], 'üçüncü kez aynı');
    // A retry of a message that went through is not a repeat; another message is fine.
    assert.equal((await send(a.session, b.user.id, 'Nasılsın? 😊'))[0], 200);
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM messages WHERE sender = $1', [a.user.id])).rows[0].n, 3);
  });
});
