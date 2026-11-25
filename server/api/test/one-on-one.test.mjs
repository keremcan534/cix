// 1v1 (one-on-one.mjs) against a real Postgres: paid messages to a streamer, free ones on a mutual follow, the
// heart level that opens calls, a call's minutes paid as they start and cut off when the coins run out, the free
// calls between people who follow each other (3 a day, 58 s each, then paid), and Eşleşme with its free matches.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi, tokenOf } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', CALL_SWEEP_MS: '300' }, { moneyCheck: { skip: ['gifts', 'paid'], why: 'hediye ve ücretli olay geçmişini puan için doğrudan yazar' } });
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
  await oldPrices();
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
let admin = null;
/** Live settings, as the panel saves them. */
async function setLive(changes) {
  if (!admin) {
    admin = await signUp('Yönetici');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  }
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  return ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Birebir testi', baseV: view.v, confirm: true }, admin.session), 'ayar kaydı');
}
// The sums below are worked out at these prices (the owners' of 25 Nov 2026 are the defaults: live-registry.test).
let priced = null;
function oldPrices() {
  return (priced ??= setLive({ dm_price: 240, call_voice_price: 2000, call_video_price: 3200, match_voice_price: 600, match_video_price: 750 }));
}

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
    // The 5-minute rule (message-holds.mjs): the coins wait for her answer.
    assert.equal((await me(star.session)).diamonds, 0, 'cevap gelene kadar elmas beklemede');
    assert.equal(sent.hold.coins, 240);

    const back = await ok(dm(star.session, man.user.id, 'Hoş geldin'), 'yayıncı yazar');
    assert.equal(back.price, undefined);
    assert.deepEqual(back.reward, { diamonds: 240, count: 1 }, 'zamanında cevap elması getirir');
    assert.equal((await me(star.session)).diamonds, 240, 'yayıncıya elmas');
    const ev = await q("SELECT kind, coins, earner FROM paid_events WHERE payer = $1", [man.user.id]);
    assert.deepEqual(ev.rows, [{ kind: 'message', coins: 240, earner: star.user.id }]);
    assert.equal((await q("SELECT count(*)::int AS n FROM income_events WHERE streamer_id = $1 AND source_type = 'message'", [star.user.id])).rows[0].n, 1, 'ajans geliri');
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
    assert.equal((await pair(man.session, star.user.id)).heart.points, 240 + 3 * 2, 'ücretli mesaj kalbe sayılır, her mesaj da 2 puan');
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

  test('sohbet hediyesinin satırı hediyeyi taşır (yeni uygulama oynatır), eski uygulama yazısını görür', async () => {
    const a = await person('Arda', 'Erkek');
    const b = await person('Bade', 'Kadın');
    await topUp(a.session, 5000);
    const ref = rnd(6);
    await ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g4', count: 5, place: 'chat', ref }, a.session), 'hediye');
    await ok(dm(b.session, a.user.id, 'Teşekkürler'), 'cevap');
    for (const s of [a.session, b.session]) {
      const { messages } = await ok(call('GET', `/api/messages?with=${s === a.session ? b.user.id : a.user.id}`, null, s), 'mesajlar');
      const line = messages.find((m) => m.from === a.user.id);
      assert.deepEqual(line.gift, { id: 'g4', count: 5 });
      assert.match(line.text, /^Hediye gönderdi: .+ ×5$/, 'eski uygulama yazıyı okur');
      assert.equal(messages.find((m) => m.from === b.user.id).gift, undefined, 'yazılan mesajda hediye yok');
    }
    // The line's ref is the server's: a phone can't send one with ':'.
    assert.equal((await q('SELECT ref FROM messages WHERE sender = $1', [a.user.id])).rows[0].ref, `gift:${ref}`);
    const [st] = await dm(a.session, b.user.id, 'Merhaba', `gift:${rnd(6)}`);
    assert.equal(st, 400);
    // The conversation list carries it on the last line too.
    await ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g4', count: 1, place: 'chat', ref: rnd(6) }, a.session), 'ikinci hediye');
    const { conversations } = await ok(call('GET', '/api/conversations', null, b.session), 'sohbetler');
    assert.deepEqual(conversations.find((c) => c.user.id === a.user.id).last.gift, { id: 'g4', count: 1 });
  });

  test('yazıyla hediye satırı taklidi reddedilir; önceden alınan ref hediye sayılmaz', async () => {
    const a = await person('Cem', 'Erkek');
    const b = await person('Dila', 'Kadın');
    const count = async () => Number((await q('SELECT count(*) FROM messages WHERE sender = $1', [a.user.id])).rows[0].count);
    for (const text of ['Hediye gönderdi: Aslan ×100', '🎁 HEDİYE  gönderdi : Roket', 'hediye gonderdi - Taç', 'Hedi​ye gönderdi: Aslan']) {
      const [st, j] = await dm(a.session, b.user.id, text);
      assert.equal(st, 400, text);
      assert.equal(j.code, 'fake_gift');
      assert.match(j.error, /gerçek bir hediye/);
    }
    assert.equal(await count(), 0, 'hiçbiri yazılmadı');
    // Ordinary words about gifts still go.
    for (const text of ['Hediye gönderdin mi?', 'Bana hediye gönderdi: Aslan', 'Hediye gönderdi']) await ok(dm(a.session, b.user.id, text), text);
    // A phone took the old line ref (gift-<ref>) before the gift: its message stays a plain message, the gift
    // writes its own line with the gift.
    await topUp(a.session, 1000);
    const ref = rnd(6);
    await ok(dm(a.session, b.user.id, 'Bu bir hediye değil', `gift-${ref}`), 'önceden alınan ref');
    await ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g4', count: 1, place: 'chat', ref }, a.session), 'hediye');
    const { messages } = await ok(call('GET', `/api/messages?with=${a.user.id}`, null, b.session), 'mesajlar');
    assert.equal(messages.find((m) => m.text === 'Bu bir hediye değil').gift, undefined);
    assert.deepEqual(messages.filter((m) => m.gift).map((m) => m.gift), [{ id: 'g4', count: 1 }]);
    // A line written before Nov 2026 (ref gift-<ref>, in the gift's transaction) still carries its gift; one whose
    // gift came later (a ref taken first) doesn't.
    const old = rnd(6);
    await q(
      `WITH g AS (INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'g4', 10, 10, 100, 'chat', $3) RETURNING id)
       INSERT INTO messages (sender, recipient, body, ref) SELECT $1, $2, 'Hediye gönderdi: Kahve ×10', 'gift-' || $3 FROM g`,
      [a.user.id, b.user.id, old],
    );
    const early = rnd(6);
    await q("INSERT INTO messages (sender, recipient, body, ref) VALUES ($1, $2, 'Erken', 'gift-' || $3)", [a.user.id, b.user.id, early]);
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'g4', 1, 10, 10, 'chat', $3)", [a.user.id, b.user.id, early]);
    const after = (await ok(call('GET', `/api/messages?with=${b.user.id}`, null, a.session), 'mesajlar')).messages;
    assert.deepEqual(after.find((m) => m.text === 'Hediye gönderdi: Kahve ×10').gift, { id: 'g4', count: 10 });
    assert.equal(after.find((m) => m.text === 'Erken').gift, undefined);
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
    assert.equal(ans.call.minutes, 0, 'ilk dakika açılınca değil');
    const grant = tokenOf(ans.token);
    assert.equal(grant.sub, star.user.id);
    assert.equal(grant.video.room, `call-${k.id}`);
    assert.deepEqual(grant.video.canPublishSources, ['microphone'], 'sesli aramada kamera yok');
    assert.equal((await me(man.session)).coins, 5000, 'açılınca henüz ödenmez');
    assert.equal((await call('GET', `/token?room=call-${k.id}`, null, outsider.session))[0], 404, 'arama odasına oda jetonuyla girilmez');
    assert.ok((await ok(call('POST', '/api/calls/join', { id: k.id }, man.session), 'yeniden bağlan')).token);
    assert.equal((await call('POST', '/api/calls/join', { id: k.id }, outsider.session))[0], 404);

    await backdate(k.id, 29);
    assert.equal((await beat(man.session, k.id)).call.minutes, 0, '30 saniyeden önce ödenmez');
    await backdate(k.id, 2);
    assert.equal((await beat(man.session, k.id)).call.minutes, 1);
    assert.equal((await me(man.session)).coins, 3000, 'ilk dakika 30. saniyede');
    assert.equal((await me(star.session)).diamonds, 2000);
    await backdate(k.id, 30);
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

  test('5.000 jetonluk hediye görüntülü aramayı da açar (kalp seviyesi 3)', async () => {
    const man = await person('Cömert', 'Erkek');
    const star = await streamer('Işıl');
    assert.equal((await pair(man.session, star.user.id)).calls.video.open, false);
    await giftPoints(man.user.id, star.user.id, 5000);
    const p = await pair(man.session, star.user.id);
    assert.deepEqual([p.heart.level, p.heart.videoAt, p.calls.voice.open, p.calls.video.open], [3, 3, true, true]);
  });

  test('arama sırasında hediye gönderilir; iki taraf da aramanın ekranında görür', async () => {
    const man = await person('Hediyeci', 'Erkek');
    const star = await streamer('Melis');
    // Before the call: not the call's gift.
    await giftPoints(man.user.id, star.user.id, 1500);
    await topUp(man.session, 10_000);
    const { call: k } = await ok(ring(man.session, star.user.id), 'ara');
    assert.equal(k.gifts, undefined, 'çalarken hediye özeti yok');
    await ok(call('POST', '/api/calls/answer', { id: k.id }, star.session), 'aç');
    let mine = (await beat(man.session, k.id)).call;
    assert.deepEqual(mine.gifts, { received: 0, sent: 0, last: null });

    const ref = rnd(6);
    await ok(call('POST', '/api/gifts/send', { to: star.user.id, giftId: 'g4', count: 1, place: 'chat', ref }, man.session), 'aramada hediye');
    const g = (await q('SELECT id, total FROM gift_events WHERE ref = $1', [ref])).rows[0];
    const total = Number(g.total);
    const theirs = (await beat(star.session, k.id)).call;
    assert.deepEqual(theirs.gifts, { received: total, sent: 0, last: { id: Number(g.id), fromMe: false, giftId: 'g4', count: 1, total } });
    mine = (await beat(man.session, k.id)).call;
    assert.deepEqual([mine.gifts.received, mine.gifts.sent, mine.gifts.last.fromMe], [0, total, true]);
    assert.equal((await ok(call('GET', '/api/calls/current', null, star.session), 'açık arama')).call.gifts.received, total);
    assert.equal(mine.status, 'live', 'hediye aramayı kesmez');
  });

  test('karşılıklı takipte arayanın 24 saatte 3 ücretsiz hakkı, her biri 58 saniye; sonra arayan dakika öder', async () => {
    const a = await person('Ali', 'Erkek');
    const b = await person('Su', 'Kadın');
    let [st, j] = await ring(a.session, b.user.id);
    assert.equal(st, 403);
    assert.equal(j.error, 'Arama için karşılıklı takip gerekli');
    await follow(a.session, b.user.id);
    await follow(b.session, a.user.id);
    const rights = async (s = a.session, other = b.user.id) => (await pair(s, other)).calls.voice;
    assert.deepEqual(await rights(), { open: true, price: 0, iPay: false, free: { total: 3, left: 3, seconds: 58, nextAt: null }, why: null });

    // One right, however long the call: it is cut at 58 s, and nobody pays.
    const { call: k } = await ok(ring(a.session, b.user.id, 'video'), 'ara');
    assert.equal(k.price, 0);
    assert.equal(k.free, true);
    assert.equal(k.maxSeconds, 58);
    assert.equal((await rights()).free.left, 2, 'çalarken hak ayrılır');
    assert.equal((await rights(b.session, a.user.id)).free.left, 3, 'arananın hakkı gitmez');
    const ans = await ok(call('POST', '/api/calls/answer', { id: k.id }, b.session), 'aç');
    assert.deepEqual(tokenOf(ans.token).video.canPublishSources, ['microphone', 'camera']);
    await backdate(k.id, 30);
    assert.equal((await beat(a.session, k.id)).call.status, 'live');
    await backdate(k.id, 29);
    const over = (await beat(b.session, k.id)).call;
    assert.equal(over.status, 'ended', '58. saniyede kesilir');
    assert.equal(over.endReason, 'time');
    assert.equal(over.coins, 0);
    assert.equal((await me(a.session)).coins, 0);

    // Declined, cancelled and missed calls give their right back.
    const d = (await ok(ring(a.session, b.user.id), 'ara 2')).call;
    assert.equal((await ok(call('POST', '/api/calls/end', { id: d.id }, b.session), 'reddet')).call.status, 'declined');
    const c = (await ok(ring(a.session, b.user.id), 'ara 3')).call;
    assert.equal((await ok(call('POST', '/api/calls/end', { id: c.id }, a.session), 'vazgeç')).call.status, 'cancelled');
    assert.equal((await call('POST', '/api/calls/answer', { id: c.id }, b.session))[0], 409, 'biten arama açılmaz');
    const m = (await ok(ring(a.session, b.user.id), 'ara 4')).call;
    await q("UPDATE calls SET created_at = now() - interval '41 seconds' WHERE id = $1", [m.id]);
    await until(async () => (await q('SELECT status FROM calls WHERE id = $1', [m.id])).rows[0].status === 'missed');
    assert.equal((await rights()).free.left, 2, 'açılmayan aramalar hak harcamaz');

    // The day's two other free calls (one of them yesterday's: it no longer counts), then paid minutes.
    const used = (ago) =>
      q(`INSERT INTO calls (kind, mode, caller, callee, payer, free, max_seconds, status, created_at, started_at, ref)
         VALUES ('call', 'voice', $1, $2, $1, true, 58, 'ended', now() - make_interval(hours => $3), now() - make_interval(hours => $3), $4)`, [a.user.id, b.user.id, ago, rnd(6)]);
    await used(25);
    assert.equal((await rights()).free.left, 2, '24 saatten eski hak geri gelmiştir');
    await used(1);
    await used(2);
    const gate = await rights();
    assert.equal(gate.free.left, 0);
    assert.equal(gate.price, 600);
    assert.equal(gate.iPay, true);
    assert.ok(Math.abs(Date.parse(gate.free.nextAt) - (Date.now() + 22 * 3600_000)) < 60_000, 'ilk kullanılan hak 24 saat sonra döner');
    assert.equal((await pair(a.session, b.user.id)).calls.video.price, 750);
    [st, j] = await ring(a.session, b.user.id);
    assert.equal(st, 409, 'hakkı biten ve jetonu olmayan arayamaz');
    assert.equal(j.code, 'insufficient');
    await topUp(a.session, 5000);
    const paid = (await ok(ring(a.session, b.user.id), 'ücretli ara')).call;
    assert.equal(paid.free, false);
    assert.equal(paid.price, 600);
    assert.equal(paid.maxSeconds, null);
    assert.equal(paid.iPay, true);
    await ok(call('POST', '/api/calls/answer', { id: paid.id }, b.session), 'aç');
    await backdate(paid.id, 31);
    await beat(a.session, paid.id);
    assert.equal((await me(a.session)).coins, 4400, 'ilk dakika 30. saniyede');
    assert.equal((await me(b.session)).diamonds, 0, 'kimse kazanmaz');
    assert.deepEqual((await q('SELECT kind, coins, earner FROM paid_events WHERE call_id = $1', [paid.id])).rows, [{ kind: 'voice_call', coins: 600, earner: null }]);
    await backdate(paid.id, 69);
    const on = (await beat(a.session, paid.id)).call;
    assert.equal(on.status, 'live', 'ücretli arama 58 saniyede kesilmez');
    assert.equal(on.minutes, 2);
    assert.equal((await me(a.session)).coins, 3800);
    await ok(call('POST', '/api/calls/end', { id: paid.id }, a.session), 'kapat');

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

  test('dakika ücreti, kimliği önceden başka bir harcamada kullanılarak atlanamaz', async () => {
    const man = await person('Kerem', 'Erkek');
    const star = await streamer('Lale');
    const other = await person('Başka', 'Kadın');
    await giftPoints(man.user.id, star.user.id, 1500);
    await topUp(man.session, 10000);
    const { call: k } = await ok(ring(man.session, star.user.id), 'ara');
    await ok(call('POST', '/api/calls/answer', { id: k.id }, star.session), 'aç');
    // The refs the server once used for the coming minutes and their earnings, taken first by the payer's own
    // spending (any request's ref): the minutes are charged all the same.
    for (const ref of [`call-${k.id}-2`, `call-${k.id}-3`]) await ok(call('POST', '/api/wallet/gift', { to: other.user.id, amount: 1, ref }, man.session), 'hediye');
    await backdate(k.id, 61);
    assert.equal((await beat(man.session, k.id)).call.minutes, 2);
    await backdate(k.id, 60);
    const three = (await beat(star.session, k.id)).call;
    assert.equal(three.minutes, 3);
    assert.equal(three.coins, 6000);
    assert.equal((await me(man.session)).coins, 10000 - 2 - 6000);
    assert.equal((await me(star.session)).diamonds, 6000);
  });
});

describe('İlk dakika: 10 saniyede kesilir, 30 saniyede kazanılır', () => {
  /** A live paid voice call between a man and a streamer, answered; the man has 10.000 coins. */
  async function liveCall(n) {
    const man = await person(`Arayan${n}`, 'Erkek');
    const star = await streamer(`Yayıncı${n}`);
    await giftPoints(man.user.id, star.user.id, 1500);
    await topUp(man.session, 10_000);
    const { call: k } = await ok(ring(man.session, star.user.id), 'ara');
    await ok(call('POST', '/api/calls/answer', { id: k.id }, star.session), 'aç');
    return { man, star, k };
  }
  const events = (id) => q('SELECT kind, coins, earner FROM paid_events WHERE call_id = $1 ORDER BY id', [id]).then((r) => r.rows);
  const income = (star) => q('SELECT count(*)::int AS n FROM income_events WHERE streamer_id = $1', [star]).then((r) => r.rows[0].n);

  test('10 saniyeden kısa görüşme ücretsiz', async () => {
    const { man, star, k } = await liveCall(1);
    await backdate(k.id, 9);
    const end = (await ok(call('POST', '/api/calls/end', { id: k.id }, man.session), 'kapat')).call;
    assert.equal(end.minutes, 0);
    assert.equal((await me(man.session)).coins, 10_000);
    assert.equal((await me(star.session)).diamonds, 0);
    assert.deepEqual(await events(k.id), []);
  });

  test('10–30 saniye: arayan tam 1 dakika öder, kadın kazanmaz, ajansa komisyon yok', async () => {
    const { man, star, k } = await liveCall(2);
    await backdate(k.id, 15);
    assert.equal((await beat(man.session, k.id)).call.minutes, 0, 'görüşürken henüz kesilmez');
    const end = (await ok(call('POST', '/api/calls/end', { id: k.id }, star.session), 'kapat')).call;
    assert.equal(end.minutes, 1);
    assert.equal((await me(man.session)).coins, 8000);
    assert.equal((await me(star.session)).diamonds, 0, '30 saniyeden kısa görüşmede kazanç yok');
    assert.deepEqual(await events(k.id), [{ kind: 'voice_call', coins: 2000, earner: null }]);
    assert.equal(await income(star.user.id), 0);
  });

  test('30 saniyeyi geçen görüşme bitince ilk dakika ödenir ve kazanılır (arada sorulmasa da)', async () => {
    const { man, star, k } = await liveCall(3);
    await backdate(k.id, 35);
    await ok(call('POST', '/api/calls/end', { id: k.id }, man.session), 'kapat');
    assert.equal((await me(man.session)).coins, 8000);
    assert.equal((await me(star.session)).diamonds, 2000);
    assert.deepEqual(await events(k.id), [{ kind: 'voice_call', coins: 2000, earner: star.user.id }]);
    assert.equal(await income(star.user.id), 1);
  });

  test('sessiz kalan aramada süre son duyulan ana kadar sayılır', async () => {
    const { man, star, k } = await liveCall(4);
    // Talked 20 s, then the man's phone went quiet for over 30 s: 20 s, not 51.
    await q("UPDATE calls SET started_at = now() - interval '51 seconds', caller_seen = now() - interval '31 seconds', callee_seen = now() WHERE id = $1", [k.id]);
    await until(async () => (await q('SELECT end_reason FROM calls WHERE id = $1', [k.id])).rows[0].end_reason === 'lost');
    assert.equal((await me(man.session)).coins, 8000);
    assert.equal((await me(star.session)).diamonds, 0);
  });

  test('saniyeler panelden değişir', async () => {
    await setLive({ call_charge_after_seconds: 5, call_earn_after_seconds: 20 });
    try {
      const { man, star, k } = await liveCall(5);
      await backdate(k.id, 21);
      assert.equal((await beat(man.session, k.id)).call.minutes, 1);
      assert.equal((await me(star.session)).diamonds, 2000);
    } finally {
      await setLive({ call_charge_after_seconds: null, call_earn_after_seconds: null });
    }
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
    assert.equal((await me(m.session)).coins, 1000, 'eşleşince henüz ödenmez');
    await backdate(paid.call.id, 31);
    await beat(m.session, paid.call.id);
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

  test('kimsenin ödemediği eşleşme de süresi dolunca kendiliğinden biter', async () => {
    await q('DELETE FROM match_queue'); // Whoever the test before left waiting.
    const star = await streamer('Sibel');
    const lead = await person('Yusuf', 'Erkek');
    await q("INSERT INTO agencies (code, name, level, status, owner_id) VALUES ($1, $2, 1, 'approved', $3)", [`K${rnd(3).toUpperCase()}`, `Kıyı ${rnd(3)}`, lead.user.id]);
    assert.equal((await ok(join(star.session), 'yayıncı bekler')).state, 'waiting');
    const got = await ok(join(lead.session), 'iki yayıncı eşleşir');
    assert.equal(got.state, 'matched');
    assert.equal(got.call.iPay, false);
    assert.equal(got.call.free, true);
    assert.equal(got.call.maxSeconds, 58, 'süresiz eşleşme olmaz');
    assert.equal(got.rights.freeLeft, 3, 'kimsenin hakkı gitmez');
    await backdate(got.call.id, 57);
    assert.equal((await beat(lead.session, got.call.id)).call.status, 'live', 'süre dolmadan kesilmez');
    // No phone asks: the server's own sweep ends it.
    await backdate(got.call.id, 2);
    await until(async () => (await q('SELECT status FROM calls WHERE id = $1', [got.call.id])).rows[0].status === 'ended');
    const [row] = (await q('SELECT end_reason FROM calls WHERE id = $1', [got.call.id])).rows;
    assert.equal(row.end_reason, 'time');
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
    await backdate(got.call.id, 31);
    await beat(m.session, got.call.id);
    assert.equal((await me(m.session)).coins, 250);
    assert.equal((await me(star.session)).diamonds, 750);
    assert.equal((await state(star.session)).call.iEarn, true);
  });
});
