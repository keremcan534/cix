// Mesajlar › Aramalar, Yakınlık, Yayıncı Merkezi's call figures and Görevler's call task (call-log.mjs), read from
// what 1v1 (one-on-one.mjs) records. Against a real Postgres.
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
const history = (s, before) => ok(call('GET', `/api/me/calls${before ? `?before=${before}` : ''}`, null, s), 'arama geçmişi');
/** A finished call row as one-on-one.mjs leaves it; `secs` on the line (0: never answered). */
async function pastCall(from, to, { mode = 'voice', status = 'ended', secs = 90, coins = 0, payer = null, earner = null, ago = '1 hour' } = {}) {
  const r = await q(
    `INSERT INTO calls (kind, mode, caller, callee, payer, earner, price, status, ref, created_at, started_at, ended_at, minutes, coins)
     VALUES ('call', $1, $2, $3, $4, $5, $6, $7, $8, now() - interval '${ago}',
             CASE WHEN $9::int > 0 THEN now() - interval '${ago}' END,
             now() - interval '${ago}' + make_interval(secs => $9::int), CASE WHEN $6::int > 0 THEN 1 ELSE 0 END, $6)
     RETURNING id`,
    [mode, from.user.id, to.user.id, payer?.user.id ?? null, earner?.user.id ?? null, coins, status, rnd(6), secs],
  );
  return Number(r.rows[0].id);
}

describe('Arama geçmişi', () => {
  test('iki yönde, en yenisi önce; kim, sesli/görüntülü, süre, cevapsız, ücret ve kazanç', async () => {
    const me = await signUp('Geçmiş Gül');
    const ali = await signUp('Arayan Ali');
    const ece = await signUp('Aranan Ece');
    const paid = await pastCall(me, ece, { mode: 'video', secs: 150, coins: 300, payer: me, earner: ece, ago: '3 hours' });
    const missed = await pastCall(ali, me, { status: 'missed', secs: 0, ago: '2 hours' });
    const declined = await pastCall(me, ali, { status: 'declined', secs: 0, ago: '1 hour' });
    // An open call is not history yet.
    await q("INSERT INTO calls (kind, mode, caller, callee, status, ref) VALUES ('call', 'voice', $1, $2, 'ringing', $3)", [ece.user.id, me.user.id, rnd(6)]);

    const { calls, next } = await history(me.session);
    assert.equal(next, null);
    assert.deepEqual(calls.map((c) => c.id), [declined, missed, paid]);
    assert.deepEqual(
      calls.map((c) => [c.other.name, c.mode, c.outgoing, c.status, c.seconds, c.coins, c.iPay, c.iEarn]),
      [
        ['Arayan Ali', 'voice', true, 'declined', 0, 0, false, false],
        ['Arayan Ali', 'voice', false, 'missed', 0, 0, false, false],
        ['Aranan Ece', 'video', true, 'ended', 150, 300, true, false],
      ],
    );
    const hers = (await history(ece.session)).calls.find((c) => c.id === paid);
    assert.deepEqual([hers.outgoing, hers.iPay, hers.iEarn, hers.other.name], [false, false, true, 'Geçmiş Gül']);
  });

  test('sayfalar 30’ar; temizlemek yalnızca benim geçmişimi boşaltır, sonraki aramalar görünür', async () => {
    const me = await signUp('Temiz Tuba');
    const peer = await signUp('Karşı Kaan');
    for (let i = 0; i < 32; i++) await pastCall(me, peer, { ago: `${40 - i} minutes` });
    const first = await history(me.session);
    assert.equal(first.calls.length, 30);
    assert.ok(first.next);
    const second = await history(me.session, first.next);
    assert.equal(second.calls.length, 2);
    assert.equal(second.next, null);

    await ok(call('POST', '/api/me/calls/clear', {}, me.session), 'temizle');
    assert.equal((await history(me.session)).calls.length, 0);
    assert.ok((await history(peer.session)).next, 'karşı tarafın geçmişi kalır');
    const later = await pastCall(peer, me, { ago: '1 minute' });
    assert.deepEqual((await history(me.session)).calls.map((c) => c.id), [later]);
    await ok(call('DELETE', '/api/me', null, me.session), 'hesabı sil');
    assert.equal((await q('SELECT count(*)::int AS n FROM call_history_cleared WHERE user_id = $1', [me.user.id])).rows[0].n, 0, 'silinen hesabın işareti gider');
    assert.equal((await history(peer.session)).calls.length, 0, 'silinen hesapla aramalar listede yok');
  });

  test('engellenen kişiyle aramalar iki tarafta da listede yok', async () => {
    const a = await signUp('Engel Aylin');
    const b = await signUp('Engel Burak');
    await pastCall(a, b);
    await ok(call('POST', '/api/block', { to: a.user.id, block: true }, b.session), 'engelle');
    assert.equal((await history(a.session)).calls.length, 0);
    assert.equal((await history(b.session)).calls.length, 0);
  });
});

describe('Yakınlık ve yayıncı arama kazancı', () => {
  test('kalp puanı iki yönlü hediye ve ücretli dakikalardan; engel listeden çıkarır', async () => {
    const me = await signUp('Kalp Kader');
    const close = await signUp('Yakın Yasemin');
    const far = await signUp('Uzak Umut');
    const gift = (from, to, total) =>
      q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'gul', 1, $3, $3, 'chat', $4)", [from.user.id, to.user.id, total, rnd(6)]);
    await gift(me, close, 1000);
    await gift(close, me, 600);
    await gift(far, me, 50);
    await q("INSERT INTO paid_events (kind, payer, earner, coins, ref) VALUES ('message', $1, $2, 240, $3)", [me.user.id, close.user.id, rnd(6)]);
    let { hearts } = await ok(call('GET', '/api/me/hearts', null, me.session), 'kalpler');
    assert.deepEqual(hearts, [
      { id: close.user.id, points: 1840, level: 2 },
      { id: far.user.id, points: 50, level: 0 },
    ]);
    await ok(call('POST', '/api/block', { to: me.user.id, block: true }, far.session), 'engelle');
    ({ hearts } = await ok(call('GET', '/api/me/hearts', null, me.session), 'kalpler'));
    assert.deepEqual(hearts.map((x) => x.id), [close.user.id]);
  });

  test('bu haftaki ücretli aramalar: kaç arama, dakika, elmas (mesaj ücreti sayılmaz)', async () => {
    const star = await signUp('Yayıncı Yeliz');
    const fan = await signUp('Dinleyen Doruk');
    const k1 = await pastCall(fan, star, { coins: 200, payer: fan, earner: star });
    const k2 = await pastCall(fan, star, { mode: 'video', coins: 300, payer: fan, earner: star });
    const minute = (k, coins) => q("INSERT INTO paid_events (kind, payer, earner, coins, call_id, ref) VALUES ('voice_call', $1, $2, $3, $4, $5)", [fan.user.id, star.user.id, coins, k, rnd(6)]);
    await minute(k1, 100);
    await minute(k1, 100);
    await minute(k2, 300);
    await q("INSERT INTO paid_events (kind, payer, earner, coins, ref) VALUES ('message', $1, $2, 240, $3)", [fan.user.id, star.user.id, rnd(6)]);
    await q("INSERT INTO paid_events (kind, payer, earner, coins, call_id, ref, created_at) VALUES ('voice_call', $1, $2, 999, $3, $4, now() - interval '9 days')", [fan.user.id, star.user.id, k1, rnd(6)]);
    const { week } = await ok(call('GET', '/api/me/call-stats', null, star.session), 'arama kazancı');
    assert.deepEqual(week, { calls: 2, minutes: 3, diamonds: 500 });
    assert.deepEqual((await ok(call('GET', '/api/me/call-stats', null, fan.session), 'ödeyen')).week, { calls: 0, minutes: 0, diamonds: 0 });
  });
});

describe('Görev: 1 görüntülü arama yap', () => {
  test('bugün en az bir dakika süren görüntülü arama; ödül sunucuda, günde bir kez', async () => {
    const me = await signUp('Görevli Gizem');
    const friend = await signUp('Arkadaş Alp');
    const task = async () => (await ok(call('GET', '/api/me/call-task', null, me.session), 'görev')).task;
    const coins = async () => (await ok(call('GET', '/api/me', null, me.session), 'ben')).user.coins;
    assert.deepEqual(await task(), { goal: 1, done: 0, reward: 25, minSeconds: 60, claimed: false });

    await pastCall(me, friend, { mode: 'video', secs: 30, ago: '5 minutes' });
    await pastCall(friend, me, { mode: 'voice', secs: 300, ago: '10 minutes' });
    assert.equal((await task()).done, 0, 'kısa görüntülü ve sesli arama sayılmaz');
    const [st] = await call('POST', '/api/me/call-task/claim', {}, me.session);
    assert.equal(st, 409);

    await pastCall(friend, me, { mode: 'video', secs: 75, ago: '3 minutes' });
    assert.equal((await task()).done, 1, 'gelen arama da sayılır');
    const before = await coins();
    const r = await ok(call('POST', '/api/me/call-task/claim', {}, me.session), 'ödül');
    assert.equal(r.replay, false);
    assert.equal(r.task.claimed, true);
    assert.equal(r.user.coins, before + 25);
    const again = await ok(call('POST', '/api/me/call-task/claim', {}, me.session), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(await coins(), before + 25, 'ikinci kez ödemez');
    assert.equal((await task()).claimed, true);
    const lot = await q("SELECT channel, amount::int AS amount FROM coin_lots WHERE user_id = $1 AND ref LIKE 'task-call-%'", [me.user.id]);
    assert.deepEqual(lot.rows, [{ channel: 'odul', amount: 25 }], 'ödül jetonu');
  });
});
