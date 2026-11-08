// Anlar posting opens at Yankı Lv.5 (moments.mjs POST_CHARM, 250 points: the diamonds received in gifts,
// wallet.mjs charmPoints); staff may always post, and anyone may comment. The app's Yankı curve starts Lv.5 at the
// same 250 (app/tests/live-moments.test.ts).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const post = (s, text = 'Merhaba Anlar') => call('POST', '/api/moments', { text, ref: rnd(10) }, s);
const gift = (s, to, giftId) => ok(call('POST', '/api/gifts/send', { to, giftId, count: 1, ref: rnd(6) }, s), `hediye ${giftId}`);

describe('Anlar: Yankı Lv.5', () => {
  test('Yankı 250 puana ulaşınca paylaşır; yorum herkese açık; yönetici her zaman paylaşır', async () => {
    const a = await signUp('Yeni Gelen');
    const fan = await signUp('Hayran');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, fan.session), 'yükleme');

    const feed = await ok(call('GET', '/api/moments?tab=recent', null, a.session), 'akış');
    assert.deepEqual(feed.posting, { allowed: false, needLevel: 5, need: 250, points: 0 });
    const [st, j] = await post(a.session);
    assert.equal(st, 403);
    assert.equal(j.code, 'charm');
    assert.match(j.error, /Yankı Lv\.5/);

    await gift(fan.session, a.user.id, 'g4'); // 200
    assert.equal((await post(a.session))[0], 403, '200 puan yetmez');
    await gift(fan.session, a.user.id, 'g2'); // 50
    assert.equal((await ok(call('GET', '/api/me', null, a.session))).user.charmXp, 250);
    assert.equal((await ok(call('GET', '/api/moments?tab=recent', null, a.session))).posting.allowed, true);
    const p = await ok(post(a.session), 'Yankı 5 paylaşır');
    // Sending gifts is not Yankı: the fan still can't post, but may comment.
    assert.equal((await ok(call('GET', '/api/me', null, fan.session))).user.charmXp, 0);
    assert.equal((await post(fan.session))[0], 403);
    await ok(call('POST', '/api/moments/comment', { id: p.moment.id, text: 'Tebrikler', ref: rnd(10) }, fan.session), 'yorum');

    const mod = await signUp('Moderatör');
    await h.sql.query("UPDATE users SET role = 'moderator' WHERE id = $1", [mod.user.id]);
    await ok(post(mod.session, 'Duyuru'), 'yönetici paylaşır');
  });
});
