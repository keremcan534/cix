// 1v1 (one-on-one.mjs) against a real Postgres: paid messages to a streamer, free ones on a mutual follow, the
// heart level that opens calls, a call's minutes paid as they start and cut off when the coins run out, free
// calls between people who follow each other, and Eşleşme with its free matches and their time limit.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi, tokenOf } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', CALL_SWEEP_MS: '300' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const topUp = (s, amount = 1000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s), 'yükleme');
const person = async (name, gender) => {
  const a = await signUp(name);
  if (gender) await q('UPDATE users SET gender = $2 WHERE id = $1', [a.user.id, gender]);
  return a;
};
/** An approved agency streamer (a woman). */
async function streamer(name) {
  const a = await person(name, 'Kadın');
  const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`K${rnd(3).toUpperCase()}`, `Kıyı ${rnd(3)}`])).rows;
  await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [a.user.id, ag.id]);
  return a;
}
const pair = async (s, other) => (await ok(call('GET', `/api/one-on-one?with=${other}`, null, s), 'birebir')).pair;
const dm = (s, to, text = 'Merhaba', ref = rnd(6)) => call('POST', '/api/messages', { to, text, ref }, s);
const follow = (s, to) => ok(call('POST', '/api/follow', { to }, s), 'takip');
/** Heart points as if `from` had sent `to` a chat gift. */
const giftPoints = (from, to, total) =>
  q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'gul', 1, $3, $3, 'chat', $4)", [from, to, total, rnd(6)]);
const ring = (s, to, mode = 'voice', ref = rnd(6)) => call('POST', '/api/calls', { to, mode, ref }, s);
const beat = (s, id) => ok(call('POST', '/api/calls/beat', { id }, s), 'beat');
const backdate = (id, secs) => q("UPDATE calls SET started_at = started_at - make_interval(secs => $2), caller_seen = now(), callee_seen = now() WHERE id = $1", [id, secs]);
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('zaman aşımı');
};

describe('Birebir mesaj', () => {
  test('yayıncıya takipsiz mesaj ücretli, karşılıklı takipte ücretsiz, yayıncı ücretsiz yazar', async () => {
    const man = await person('Kaan', 'Erkek');
    const star = await streamer('Ece');
    let p = await pair(man.session, star.user.id);
    assert.equal(p.streamer, true);
    assert.equal(p.iPay, true);
    assert.equal(p.dmPrice, 240);
    assert.equal(p.heart.level, 0);
    assert.equal(p.calls.voice.open, false);
    assert.equal(p.payer, undefined, 'kimin ödediği kimliğiyle dışarı çıkmaz');

    const [st, j] = await dm(man.session, star.user.id);
    assert.equal(st, 409);
    assert.equal(j.code, 'insufficient');
    assert.equal((await q('SELECT count(*)::int AS n FROM messages WHERE sender = $1', [man.user.id])).rows[0].n, 0, 'ödenmeyen mesaj gitmez');

    await topUp(man.session);
    const ref = rnd(6);
    const sent = await ok(dm(man.session, star.user.id, 'Selam', ref), 'ücretli mesaj');
    assert.equal(sent.price, 240);
    assert.equal(sent.coins, 760);
    const again = await ok(dm(man.session, star.user.id, 'Selam', ref), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal((await me(man.session)).coins, 760, 'tekrar bir daha ödemez');
    assert.equal((await me(star.session)).diamonds, 240, 'yayıncıya elmas');
    const ev = await q("SELECT kind, coins, earner FROM paid_events WHERE payer = $1", [man.user.id]);
    assert.deepEqual(ev.rows, [{ kind: 'message', coins: 240, earner: star.user.id }]);
    assert.equal((await q("SELECT count(*)::int AS n FROM income_events WHERE streamer_id = $1 AND source_type = 'message'", [star.user.id])).rows[0].n, 1, 'ajans geliri');

    const back = await ok(dm(star.session, man.user.id, 'Hoş geldin'), 'yayıncı yazar');
    assert.equal(back.price, undefined);
    assert.equal((await pair(star.session, man.user.id)).dmPrice, 0);

    const income = await ok(call('GET', '/api/wallet/income?period=all', null, star.session), 'gelir');
    assert.deepEqual(income.sources.find((x) => x.key === 'message_fee'), { key: 'message_fee', label: 'Mesaj ücretleri', diamonds: 240, count: 1, live: true });

    await follow(man.session, star.user.id);
    assert.equal((await pair(man.session, star.user.id)).dmPrice, 240, 'tek taraflı takip yetmez');
    await follow(star.session, man.user.id);
    assert.equal((await pair(man.session, star.user.id)).dmPrice, 0);
    const free = await ok(dm(man.session, star.user.id, 'Takipteyiz'), 'karşılıklı takip');
    assert.equal(free.price, undefined);
    assert.equal((await me(man.session)).coins, 760);
    assert.equal((await pair(man.session, star.user.id)).heart.points, 240, 'ücretli mesaj kalbe sayılır');
  });

  test('yayıncı olmayan iki kişi ücretsiz yazışır', async () => {
    const a = await person('Can', 'Erkek');
    const b = await person('Nil', 'Kadın');
    const p = await pair(a.session, b.user.id);
    assert.equal(p.streamer, false);
    assert.equal(p.dmPrice, 0);
    assert.equal(p.calls.voice.why, 'Arama için karşılıklı takip gerekli');
    assert.equal((await ok(dm(a.session, b.user.id), 'mesaj')).price, undefined);
  });

  test('sohbetten gönderilen hediye sohbette görünür, kalbi büyütür, mesaj ücreti alınmaz', async () => {
    const man = await person('Efe', 'Erkek');
    const star = await streamer('Duru');
    await topUp(man.session, 5000);
    const before = (await me(man.session)).coins;
    const ref = rnd(6);
    const gift = { to: star.user.id, giftId: 'g4', count: 1, place: 'chat', ref };
    await ok(call('POST', '/api/gifts/send', gift, man.session), 'hediye');
    // The same request again (a retry) adds no second line.
    await ok(call('POST', '/api/gifts/send', gift, man.session), 'hediye tekrarı');
    const { messages } = await ok(call('GET', `/api/messages?with=${man.user.id}`, null, star.session), 'mesajlar');
    assert.equal(messages.length, 1);
    assert.match(messages[0].text, /^Hediye gönderdi: /);
    const spent = before - (await me(man.session)).coins;
    const price = (await q("SELECT unit_price FROM gift_events WHERE ref = $1", [ref])).rows[0].unit_price;
    assert.equal(spent, Number(price), 'yalnız hediyenin fiyatı');
    assert.ok((await pair(man.session, star.user.id)).heart.points >= Number(price));
  });
});

describe('Birebir arama', () => {
  test('kalp seviyesi açar, dakika başında ödenir, jeton bitince kesilir', async () => {
    const man = await person('Emre', 'Erkek');
    const star = await streamer('Defne');
    const outsider = await person('Üçüncü', 'Erkek');
    let [st, j] = await ring(man.session, star.user.id);
    assert.equal(st, 403);
    assert.equal(j.code, 'locked');
    assert.match(j.error, /kalp seviyesi 2/);

    await giftPoints(man.user.id, star.user.id, 1500);
    const p = await pair(man.session, star.user.id);
    assert.equal(p.heart.level, 2);
    assert.equal(p.calls.voice.open, true);
    assert.equal(p.calls.voice.price, 2000);
    assert.equal(p.calls.video.open, false, 'görüntülü daha yüksek seviyede');
    assert.equal((await ring(man.session, star.user.id, 'video'))[0], 403);
    [st, j] = await ring(man.session, star.user.id);
    assert.equal(st, 409, 'ilk dakikası yoksa çalmaz');
    assert.equal(j.code, 'insufficient');

    await topUp(man.session, 5000);
    const ref = rnd(6);
    const { call: k } = await ok(ring(man.session, star.user.id, 'voice', ref), 'ara');
    assert.equal(k.status, 'ringing');
    assert.equal(k.iPay, true);
    assert.equal((await ok(ring(man.session, star.user.id, 'voice', ref), 'tekrar')).replay, true);
    assert.equal((await ring(man.session, star.user.id))[0], 409, 'aynı anda iki arama yok');
    const incoming = (await ok(call('GET', '/api/calls/current', null, star.session), 'gelen')).call;
    assert.equal(incoming.id, k.id);
    assert.equal(incoming.incoming, true);
    assert.equal(incoming.iEarn, true);
    assert.equal((await call('POST', '/api/calls/answer', { id: k.id }, man.session))[0], 403, 'arayan açamaz');
    assert.equal((await call('POST', '/api/calls/beat', { id: k.id }, outsider.session))[0], 404, 'başkasının araması görünmez');

    const ans = await ok(call('POST', '/api/calls/answer', { id: k.id }, star.session), 'aç');
    assert.equal(ans.call.status, 'live');
    assert.equal(ans.call.minutes, 1);
    const grant = tokenOf(ans.token);
    assert.equal(grant.sub, star.user.id);
    assert.equal(grant.video.room, `call-${k.id}`);
    assert.deepEqual(grant.video.canPublishSources, ['microphone'], 'sesli aramada kamera yok');
    assert.equal((await me(man.session)).coins, 3000, 'ilk dakika açılınca');
    assert.equal((await call('GET', `/token?room=call-${k.id}`, null, outsider.session))[0], 404, 'arama odasına oda jetonuyla girilmez');
    assert.ok((await ok(call('POST', '/api/calls/join', { id: k.id }, man.session), 'yeniden bağlan')).token);
    assert.equal((await call('POST', '/api/calls/join', { id: k.id }, outsider.session))[0], 404);

    await backdate(k.id, 61);
    const two = (await beat(man.session, k.id)).call;
    assert.equal(two.minutes, 2);
    assert.equal(two.coins, 4000);
    assert.equal((await me(man.session)).coins, 1000);

    await backdate(k.id, 60);
    const cut = (await beat(man.session, k.id)).call;
    assert.equal(cut.status, 'ended');
    assert.equal(cut.endReason, 'coins');
    assert.equal(cut.minutes, 2);
    assert.equal((await me(man.session)).coins, 1000, 'ödenemeyen dakika alınmaz');
    assert.equal((await me(star.session)).diamonds, 4000);
    const ev = await q('SELECT kind, coins FROM paid_events WHERE call_id = $1 ORDER BY id', [k.id]);
    assert.deepEqual(ev.rows, [{ kind: 'voice_call', coins: 2000 }, { kind: 'voice_call', coins: 2000 }]);
    assert.equal((await q("SELECT count(*)::int AS n FROM income_events WHERE streamer_id = $1 AND source_type = 'call'", [star.user.id])).rows[0].n, 2);
    assert.equal((await call('POST', '/api/calls/join', { id: k.id }, man.session))[0], 409, 'biten aramanın jetonu yok');
    const income = await ok(call('GET', '/api/wallet/income?period=all', null, star.session), 'gelir');
    assert.equal(income.sources.find((x) => x.key === 'voice_call').diamonds, 4000);
    assert.equal((await pair(man.session, star.user.id)).heart.points, 5500, 'dakikalar kalbe sayılır');
  });

  test('karşılıklı takipte ücretsiz arama; reddetme, vazgeçme, cevapsız', async () => {
    const a = await person('Ali', 'Erkek');
    const b = await person('Su', 'Kadın');
    let [st, j] = await ring(a.session, b.user.id);
    assert.equal(st, 403);
    assert.equal(j.error, 'Arama için karşılıklı takip gerekli');
    await follow(a.session, b.user.id);
    await follow(b.session, a.user.id);

    const { call: k } = await ok(ring(a.session, b.user.id, 'video'), 'ara');
    assert.equal(k.price, 0);
    assert.equal(k.iPay, false);
    const ans = await ok(call('POST', '/api/calls/answer', { id: k.id }, b.session), 'aç');
    assert.deepEqual(tokenOf(ans.token).video.canPublishSources, ['microphone', 'camera']);
    await backdate(k.id, 200);
    assert.equal((await beat(a.session, k.id)).call.status, 'live', 'ücretsiz arama sürer');
    const end = await ok(call('POST', '/api/calls/end', { id: k.id }, a.session), 'kapat');
    assert.equal(end.call.status, 'ended');
    assert.equal(end.call.coins, 0);

    const d = (await ok(ring(a.session, b.user.id), 'ara 2')).call;
    assert.equal((await ok(call('POST', '/api/calls/end', { id: d.id }, b.session), 'reddet')).call.status, 'declined');
    const c = (await ok(ring(a.session, b.user.id), 'ara 3')).call;
    assert.equal((await ok(call('POST', '/api/calls/end', { id: c.id }, a.session), 'vazgeç')).call.status, 'cancelled');
    assert.equal((await call('POST', '/api/calls/answer', { id: c.id }, b.session))[0], 409, 'biten arama açılmaz');

    const m = (await ok(ring(a.session, b.user.id), 'ara 4')).call;
    await q("UPDATE calls SET created_at = now() - interval '41 seconds' WHERE id = $1", [m.id]);
    await until(async () => (await q('SELECT status FROM calls WHERE id = $1', [m.id])).rows[0].status === 'missed');

    await q('INSERT INTO blocks (blocker, blocked) VALUES ($1, $2)', [b.user.id, a.user.id]);
    assert.equal((await ring(a.session, b.user.id))[0], 403, 'engelde arama yok');
  });

  test('sessiz kalan arama biter', async () => {
    const a = await person('Arda', 'Erkek');
    const b = await person('Ada', 'Kadın');
    await follow(a.session, b.user.id);
    await follow(b.session, a.user.id);
    const { call: k } = await ok(ring(a.session, b.user.id), 'ara');
    await ok(call('POST', '/api/calls/answer', { id: k.id }, b.session), 'aç');
    await q("UPDATE calls SET callee_seen = now() - interval '31 seconds' WHERE id = $1", [k.id]);
    await until(async () => (await q('SELECT status, end_reason FROM calls WHERE id = $1', [k.id])).rows[0].end_reason === 'lost');
  });
});

describe('Eşleşme', () => {
  const join = (s, mode = 'voice') => call('POST', '/api/match/join', { mode }, s);
  const state = (s) => ok(call('POST', '/api/match/state', null, s), 'durum');

  test('karşı cinsiyetle eşleşir; 3 ücretsiz hak, en çok 58 saniye; sonra dakika ücretli', async () => {
    const m = await person('Tolga', 'Erkek');
    const w = await person('İpek', 'Kadın');
    const other = await person('Burak', 'Erkek');
    const noGender = await person('Kimse');
    let [st, j] = await join(noGender.session);
    assert.equal(st, 400);
    assert.equal(j.code, 'gender');

    assert.equal((await ok(join(other.session), 'erkek bekler')).state, 'waiting');
    assert.equal((await ok(join(m.session), 'erkek bekler 2')).state, 'waiting', 'iki erkek eşleşmez');
    await ok(call('POST', '/api/match/leave', null, other.session), 'çık');
    assert.equal((await ok(join(w.session, 'video'), 'görüntülü bekler')).state, 'waiting');
    assert.equal((await state(m.session)).state, 'waiting', 'sesli görüntülüyle eşleşmez');
    await ok(call('POST', '/api/match/leave', null, w.session), 'çık');
    assert.equal((await ok(call('POST', '/api/match/leave', null, m.session), 'çık')).state, 'idle');

    const first = await ok(join(w.session), 'kadın bekler');
    assert.equal(first.state, 'waiting');
    assert.equal(first.rights.streamer, false);
    const got = await ok(join(m.session), 'eşleş');
    assert.equal(got.state, 'matched');
    assert.equal(got.call.kind, 'match');
    assert.equal(got.call.free, true);
    assert.equal(got.call.maxSeconds, 58);
    assert.equal(got.call.iPay, true, 'erkeğin hakkından');
    assert.equal(got.rights.freeLeft, 2);
    const hers = await state(w.session);
    assert.equal(hers.state, 'matched');
    assert.equal(hers.call.id, got.call.id);
    assert.equal(hers.rights.freeLeft, 3, 'kadının hakkı gitmez');
    const third = await person('Zeynep', 'Kadın');
    await follow(m.session, third.user.id);
    await follow(third.session, m.user.id);
    assert.equal((await ring(m.session, third.user.id))[0], 409, 'eşleşmedeyken arama yok');

    await backdate(got.call.id, 59);
    const over = (await beat(m.session, got.call.id)).call;
    assert.equal(over.status, 'ended');
    assert.equal(over.endReason, 'time');
    assert.equal((await me(m.session)).coins, 0);

    // The two other free matches of the day, then a paid one.
    for (let i = 0; i < 2; i++) {
      await q("INSERT INTO calls (kind, mode, caller, callee, payer, free, max_seconds, status, ref) VALUES ('match', 'voice', $1, $2, $2, true, 58, 'ended', $3)", [w.user.id, m.user.id, rnd(6)]);
    }
    const w2 = await person('Lale', 'Kadın');
    assert.equal((await ok(join(w2.session), 'bekler')).state, 'waiting');
    [st, j] = await join(m.session);
    assert.equal(st, 409, 'hakkı biten ve jetonu olmayan beklemeye bile girmez');
    assert.equal(j.code, 'insufficient');
    await topUp(m.session);
    const paid = await ok(join(m.session), 'ücretli eşleş');
    assert.equal(paid.state, 'matched');
    assert.equal(paid.call.free, false);
    assert.equal(paid.call.price, 600);
    assert.equal(paid.call.maxSeconds, null);
    assert.equal(paid.rights.freeLeft, 0);
    assert.ok(paid.rights.nextFreeAt);
    assert.equal((await me(m.session)).coins, 400);
    assert.equal((await me(w2.session)).diamonds, 0, 'yayıncı olmayan kazanmaz');
    const ev = await q('SELECT kind, coins, earner FROM paid_events WHERE call_id = $1', [paid.call.id]);
    assert.deepEqual(ev.rows, [{ kind: 'match_voice', coins: 600, earner: null }]);
    await ok(call('POST', '/api/calls/end', { id: paid.call.id }, w2.session), 'bitir');
    assert.equal((await state(m.session)).state, 'idle');

    // Not the same person again right away.
    await topUp(m.session);
    assert.equal((await ok(join(w2.session), 'yine bekler')).state, 'waiting');
    assert.equal((await ok(join(m.session), 'yine')).state, 'waiting');
  });

  test('yayıncıyla eşleşmede yayıncı olmayan öder, yayıncı kazanır', async () => {
    const m = await person('Serkan', 'Erkek');
    const star = await streamer('Melis');
    for (let i = 0; i < 3; i++) {
      await q("INSERT INTO calls (kind, mode, caller, callee, payer, free, max_seconds, status, ref) VALUES ('match', 'video', $1, $1, $1, true, 58, 'ended', $2)", [m.user.id, rnd(6)]);
    }
    await topUp(m.session);
    const theirs = await ok(join(star.session, 'video'), 'yayıncı bekler');
    assert.equal(theirs.rights.streamer, true);
    const got = await ok(join(m.session, 'video'), 'eşleş');
    assert.equal(got.state, 'matched');
    assert.equal(got.call.price, 750);
    assert.equal((await me(m.session)).coins, 250);
    assert.equal((await me(star.session)).diamonds, 750);
    assert.equal((await state(star.session)).call.iEarn, true);
  });
});
