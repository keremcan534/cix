// Günlük harcama limiti (spend-limit.mjs, wallet.mjs spendCoins) against a real Postgres: lowering applies at once,
// raising or lifting after 24 hours; every coin spend counts and stops at the limit (gifts, paid messages, call
// minutes, the wheel), nothing moves on a refusal; a Jeton Noktası sale isn't capped; the day is Turkey's.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const coins = async (s) => (await ok(call('GET', '/api/me', null, s), 'ben')).user.coins;
const topUp = (s, amount = 10000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s), 'yükleme');
const state = (s) => ok(call('GET', '/api/me/spend-limit', null, s), 'limit');
const setLimit = (s, limit) => call('POST', '/api/me/spend-limit', { limit }, s);
const gift = (s, to, giftId = 'g5', count = 1) => call('POST', '/api/gifts/send', { to, giftId, count, ref: rnd(6) }, s);
/** The waiting change as if its 24 hours had passed. */
const pass24h = (u) => q("UPDATE spend_limits SET next_at = now() - interval '1 minute' WHERE user_id = $1", [u.user.id]);

describe('Günlük harcama limiti', () => {
  test('ilk limit ve düşürmek hemen, artırmak ve kaldırmak 24 saat sonra geçerli', async () => {
    const a = await signUp('Limit A');
    let s = await state(a.session);
    assert.deepEqual([s.limit, s.next, s.spentToday, s.left, s.raiseHours], [null, null, 0, null, 24]);
    assert.match(s.day, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Date.parse(s.resetsAt) > Date.now(), 'gün sonu ileride');

    s = await ok(setLimit(a.session, 2000), 'ilk limit');
    assert.deepEqual([s.applied, s.limit, s.next, s.left], ['now', 2000, null, 2000]);
    s = await ok(setLimit(a.session, 500), 'düşür');
    assert.deepEqual([s.applied, s.limit, s.next], ['now', 500, null]);

    s = await ok(setLimit(a.session, 10000), 'artır');
    assert.equal(s.applied, 'later');
    assert.equal(s.limit, 500, 'artış beklerken eski limit geçerli');
    assert.equal(s.next.limit, 10000);
    const at = Date.parse(s.next.at);
    assert.ok(Math.abs(at - Date.now() - 24 * 3600_000) < 60_000, 'tam 24 saat sonra');
    // A smaller raise keeps the wait it already had; a bigger one starts it again.
    await q("UPDATE spend_limits SET next_at = next_at - interval '5 hours' WHERE user_id = $1", [a.user.id]);
    s = await ok(setLimit(a.session, 2000), 'daha az artış');
    assert.equal(s.next.limit, 2000);
    assert.ok(Date.parse(s.next.at) < at - 4 * 3600_000, 'bekleme süresi korunur');
    s = await ok(setLimit(a.session, 0), 'kaldır');
    assert.equal(s.limit, 500);
    assert.equal(s.next.limit, null, 'limitsiz bekliyor');
    assert.ok(Math.abs(Date.parse(s.next.at) - Date.now() - 24 * 3600_000) < 60_000, 'kaldırmak yeniden 24 saat');
    // Lowering while a raise waits: at once, and the raise is dropped.
    s = await ok(setLimit(a.session, 400), 'beklerken düşür');
    assert.deepEqual([s.applied, s.limit, s.next], ['now', 400, null]);

    await ok(setLimit(a.session, 5000), 'artır');
    await pass24h(a);
    s = await state(a.session);
    assert.deepEqual([s.limit, s.next], [5000, null], 'süre dolunca yeni limit');
    await ok(setLimit(a.session, 0), 'kaldır');
    await pass24h(a);
    assert.equal((await state(a.session)).limit, null, 'süre dolunca limitsiz');

    for (const bad of [50, -1, 1.5, '500', 20_000_000]) assert.equal((await setLimit(a.session, bad))[0], 400, `geçersiz ${bad}`);
  });

  test('hediye limite kadar gider, aşanı hiçbir şey almadan reddedilir; gün değişince sıfırlanır', async () => {
    const a = await signUp('Harcayan');
    const b = await signUp('Alan');
    await topUp(a.session);
    await ok(setLimit(a.session, 1200), 'limit');
    await ok(gift(a.session, b.user.id), 'birinci (500)');
    await ok(gift(a.session, b.user.id), 'ikinci (500)');
    let s = await state(a.session);
    assert.deepEqual([s.spentToday, s.left], [1000, 200]);
    const [st, j] = await gift(a.session, b.user.id);
    assert.equal(st, 409);
    assert.equal(j.code, 'daily_limit');
    assert.deepEqual([j.limit, j.left], [1200, 200]);
    assert.match(j.error, /Günlük harcama limitin 1\.200 jeton.*Bugün kalan: 200 jeton/);
    assert.equal(await coins(a.session), 9000, 'reddedilen hediye jeton almaz');
    assert.equal((await q("SELECT count(*)::int AS n FROM gift_events WHERE sender = $1", [a.user.id])).rows[0].n, 2, 'hediye kaydı yok');
    await ok(gift(a.session, b.user.id, 'g4'), 'kalanına sığan (200)');
    assert.equal((await state(a.session)).left, 0);

    // Yesterday's total (Turkey's day) no longer counts.
    await q("UPDATE spend_limits SET spent_day = spent_day - 1 WHERE user_id = $1", [a.user.id]);
    s = await state(a.session);
    assert.deepEqual([s.spentToday, s.left], [0, 1200]);
    await ok(gift(a.session, b.user.id), 'yeni gün');
    assert.equal((await state(a.session)).spentToday, 500);
  });

  test('limitsizken de sayılır: sonradan konan limit bugünkü harcamayı bilir', async () => {
    const a = await signUp('Sonra limit');
    const b = await signUp('Alıcı 2');
    await topUp(a.session);
    await ok(gift(a.session, b.user.id), 'limitsiz hediye');
    assert.equal((await state(a.session)).spentToday, 500);
    await ok(setLimit(a.session, 600), 'limit');
    const [st, j] = await gift(a.session, b.user.id);
    assert.equal(st, 409);
    assert.equal(j.left, 100);
  });

  test('ücretli mesaj ve arama dakikası da limitte durur; arama limitle biter', async () => {
    const man = await signUp('Arayan');
    await q("UPDATE users SET gender = 'Erkek' WHERE id = $1", [man.user.id]);
    const star = await signUp('Yayıncı');
    await q("UPDATE users SET gender = 'Kadın' WHERE id = $1", [star.user.id]);
    const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`L${rnd(3).toUpperCase()}`, `Limit ${rnd(3)}`])).rows;
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [star.user.id, ag.id]);
    await topUp(man.session);
    await topUp(man.session);

    // A paid message (240) past the limit is refused and not stored.
    await ok(setLimit(man.session, 300), 'limit');
    await ok(call('POST', '/api/messages', { to: star.user.id, text: 'Merhaba', ref: rnd(6) }, man.session), 'ücretli mesaj');
    let [st, j] = await call('POST', '/api/messages', { to: star.user.id, text: 'Tekrar', ref: rnd(6) }, man.session);
    assert.equal(st, 409);
    assert.equal(j.code, 'daily_limit');
    assert.equal((await q('SELECT count(*)::int AS n FROM messages WHERE sender = $1', [man.user.id])).rows[0].n, 1, 'reddedilen mesaj kaydedilmez');

    // A call whose first minute (2,000) doesn't fit doesn't ring.
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'gul', 1, 1500, 1500, 'chat', $3)", [man.user.id, star.user.id, rnd(6)]);
    [st, j] = await call('POST', '/api/calls', { to: star.user.id, mode: 'voice', ref: rnd(6) }, man.session);
    assert.equal(st, 409, 'ilk dakika limite sığmıyor');
    assert.equal(j.code, 'daily_limit');

    // Room for exactly one minute: the call rings and opens, then ends when the second minute doesn't fit.
    await q('UPDATE spend_limits SET daily_limit = 2240 WHERE user_id = $1', [man.user.id]);
    const { call: k } = await ok(call('POST', '/api/calls', { to: star.user.id, mode: 'voice', ref: rnd(6) }, man.session), 'ara');
    const ans = await ok(call('POST', '/api/calls/answer', { id: k.id }, star.session), 'aç');
    assert.equal(ans.call.minutes, 1);
    await q("UPDATE calls SET started_at = started_at - interval '61 seconds', caller_seen = now(), callee_seen = now() WHERE id = $1", [k.id]);
    const cut = (await ok(call('POST', '/api/calls/beat', { id: k.id }, man.session), 'beat')).call;
    assert.deepEqual([cut.status, cut.endReason, cut.minutes], ['ended', 'limit', 1]);
    assert.equal(await coins(man.session), 20000 - 240 - 2000, 'ödenemeyen dakika alınmaz');
  });

  test('çark ve Jeton Noktası: oyun limitte durur, banka satışı limite takılmaz', async () => {
    const a = await signUp('Çarkçı');
    const b = await signUp('Hediye alan');
    await topUp(a.session);
    // Cömertlik Lv.2 for the wheel: a 500-coin gift.
    await ok(gift(a.session, b.user.id), 'hediye');
    await ok(setLimit(a.session, 600), 'limit');
    const [st, j] = await call('POST', '/api/wheel/spin', { tier: 'kiyi', count: 1, ref: rnd(6) }, a.session);
    assert.equal(st, 409, j.error);
    assert.equal(j.code, 'daily_limit');
    assert.equal(await coins(a.session), 9500, 'çark jeton almadı');
    assert.equal((await q('SELECT count(*)::int AS n FROM wheel_spins WHERE user_id = $1', [a.user.id])).rows[0].n, 0);

    const bank = await signUp('Banka');
    const buyer = await signUp('Müşteri');
    await q("UPDATE users SET role = 'coins_bank' WHERE id = $1", [bank.user.id]);
    await topUp(bank.session);
    await ok(setLimit(bank.session, 100), 'bankanın limiti');
    await ok(call('POST', '/api/jeton/transfer', { to: buyer.user.id, coins: 1000, ref: rnd(6) }, bank.session), 'satış');
    assert.equal((await state(bank.session)).spentToday, 0, 'satış harcama sayılmaz');
    assert.equal(await coins(buyer.session), 1000);
  });

  test('hesap silinince limit satırı gider', async () => {
    const a = await signUp('Silinen limit');
    await ok(setLimit(a.session, 500), 'limit');
    await ok(call('DELETE', '/api/me', null, a.session), 'sil');
    assert.equal((await q('SELECT count(*)::int AS n FROM spend_limits WHERE user_id = $1', [a.user.id])).rows[0].n, 0);
  });
});
