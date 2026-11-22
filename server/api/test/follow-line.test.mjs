// Takip satırı (owners, 22 Nov 2026): a man following a woman, or a woman following a man, puts "Seni takip etti" in
// the private chat of the two, which only the person followed sees (unread, in Mesajlar). Unfollowing tells nobody,
// anywhere. Following and unfollowing over and over writes one line a day. The line is no message anyone wrote:
// it opens no "write back" right, no quick reply and doesn't close the pair for automatic messages.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;
const follow = (who, to, on = true) => call('POST', '/api/follow', { to: to.user.id, ...(on ? {} : { follow: false }) }, who.session);
const convos = async (who) => (await call('GET', '/api/conversations', null, who.session))[1].conversations;
const thread = async (who, peer) => (await call('GET', `/api/messages?with=${peer.user.id}`, null, who.session))[1].messages;
const lines = async (to) => (await h.sql.query("SELECT sender, body, source FROM messages WHERE recipient = $1 AND source = 'follow' ORDER BY id", [to.user.id])).rows;

describe('Takip satırı', () => {
  test('erkek kadını, kadın erkeği takip edince özel mesajda satır; takipten çıkınca hiçbir şey', async () => {
    const [man, woman] = await Promise.all([signUp('Kaan'), signUp('Artemis')]);
    await h.sql.query("UPDATE users SET gender = CASE WHEN id = $1 THEN 'Erkek' ELSE 'Kadın' END WHERE id = ANY($2::uuid[])", [man.user.id, [man.user.id, woman.user.id]]);

    assert.equal((await follow(man, woman))[0], 200);
    const hers = await convos(woman);
    assert.equal(hers.length, 1);
    assert.deepEqual([hers[0].user.id, hers[0].last.text, hers[0].last.source, hers[0].unread], [man.user.id, 'Seni takip etti', 'follow', 1]);
    assert.deepEqual((await thread(woman, man)).map((m) => [m.from, m.text, m.source]), [[man.user.id, 'Seni takip etti', 'follow']]);
    // The follower's own Mesajlar stay as they were.
    assert.deepEqual(await convos(man), []);
    assert.deepEqual(await thread(man, woman), []);

    assert.equal((await follow(woman, man))[0], 200);
    assert.deepEqual((await convos(man)).map((c) => [c.user.id, c.last.text, c.unread]), [[woman.user.id, 'Seni takip etti', 1]]);

    // Unfollowing: no line, no notice, anywhere.
    const before = (await h.sql.query('SELECT (SELECT count(*) FROM messages) + (SELECT count(*) FROM team_notices) AS n')).rows[0].n;
    assert.equal((await follow(woman, man, false))[0], 200);
    assert.equal((await h.sql.query('SELECT (SELECT count(*) FROM messages) + (SELECT count(*) FROM team_notices) AS n')).rows[0].n, before, 'takipten çıkmak hiçbir şey yazmaz');
    // Following again the same day: no second line.
    assert.equal((await follow(woman, man))[0], 200);
    assert.equal((await follow(woman, man, false))[0], 200);
    assert.equal((await follow(woman, man))[0], 200);
    assert.equal((await lines(man)).length, 1, 'günde bir satır');
    // The heart (chat_days) doesn't count these lines: following can't raise it.
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM chat_days WHERE $1 IN (lo, hi)', [man.user.id])).rows[0].n, 0, 'kalbe sayılmaz');
    // A follow that was already there writes nothing.
    assert.equal((await follow(man, woman))[0], 200);
    assert.equal((await lines(woman)).length, 1);
  });

  test('satır kimsenin yazdığı mesaj sayılmaz: "karşılıklı takip" kuralı geçilemez', async () => {
    const [owner, other] = await Promise.all([signUp('Seçici'), signUp('Yazmak İsteyen')]);
    assert.equal((await call('PATCH', '/api/me/privacy', { dmFrom: 'mutual' }, owner.session))[0], 200);
    // The owner follows the other: their line goes to the other. The other doesn't follow back.
    assert.equal((await follow(owner, other))[0], 200);
    const [st, j] = await call('POST', '/api/messages', { to: owner.user.id, text: 'Merhaba', ref: rnd(8) }, other.session);
    assert.equal(st, 403, j.error);
    assert.match(j.error, /karşılıklı takipleştiği/);
    // Once the other follows back, they may write.
    assert.equal((await follow(other, owner))[0], 200);
    assert.equal((await call('POST', '/api/messages', { to: owner.user.id, text: 'Merhaba', ref: rnd(8) }, other.session))[0], 200);
  });
});
