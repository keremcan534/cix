// Otomatik mesaj (docs/OTOMATIK_MESAJ.md) against a real Postgres: the 5-minute rule (message-holds.mjs: a paid
// message's coins wait for the streamer's answer, become her diamonds in time, go back to the payer otherwise, and a
// store refund takes them with the purchase), quick replies and their daily rights, a streamer's templates, the answer
// figures (Mesaj Performansım, the agency's report), and SimilarClub Sistem's call and daily notices.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', HOLD_SWEEP_MS: '200', CALL_SWEEP_MS: '300', CALL_NOTICE_SWEEP_MS: '200', AUTO_CHAT_SWEEP_MS: '0' });
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
/** An approved agency streamer (a woman), in a new agency of `owner` when given. */
async function streamer(name, agency = null) {
  const a = await person(name, 'Kadın');
  const ag = agency ?? (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`K${rnd(3).toUpperCase()}`, `Kıyı ${rnd(3)}`])).rows[0].id;
  await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [a.user.id, ag]);
  return Object.assign(a, { agency: ag });
}
const dm = (s, to, text = 'Merhaba', ref = rnd(6)) => call('POST', '/api/messages', { to, text, ref }, s);
const quick = (s, to, n = 1, ref = rnd(6)) => call('POST', '/api/messages', { to, quick: n, ref }, s);
const thread = async (s, other) => (await ok(call('GET', `/api/messages?with=${other}`, null, s), 'konuşma')).messages;
const holdOf = async (id) => (await q('SELECT * FROM message_holds WHERE message_id = $1', [id])).rows[0];
/** Puts a hold's time in the past (its deadline `secs` ago). */
const expire = (id, secs = 60) => q("UPDATE message_holds SET deadline_at = now() - make_interval(secs => $2), delivered_at = now() - make_interval(secs => $2 + 300) WHERE message_id = $1", [id, secs]);
const until = async (fn, ms = 5000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('zaman aşımı');
};
let admin = null;
async function adminOf() {
  if (!admin) {
    admin = await signUp('Yönetici');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  }
  return admin;
}
async function setLive(changes) {
  await adminOf();
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  return ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Otomatik mesaj testi', baseV: view.v, confirm: true }, admin.session), 'ayar kaydı');
}

// The sums below are worked out at these prices (the owners' of 25 Nov 2026 are the defaults: live-registry.test).
let priced = null;
function oldPrices() {
  return (priced ??= setLive({ dm_price: 240, call_voice_price: 2000, call_video_price: 3200 }));
}
/** A live call that has lasted `secs` (past 30 s its first minute is paid and earned). */
const lasted = (id, secs) => q('UPDATE calls SET started_at = started_at - make_interval(secs => $2), caller_seen = now(), callee_seen = now() WHERE id = $1', [id, secs]);

describe('5 dakika kuralı', () => {
  test('ücretli mesajın jetonu cevabı bekler; zamanında cevap elmas olur, gösterge yalnız yayıncıya', async () => {
    const man = await person('Kerem', 'Erkek');
    const star = await streamer('Ela');
    await topUp(man.session);
    const sent = await ok(dm(man.session, star.user.id, 'Selam'), 'ücretli mesaj');
    assert.equal(sent.price, 240);
    assert.equal(sent.coins, 760, 'jeton hemen ayrılır');
    assert.equal(sent.hold.coins, 240);
    assert.ok(Date.parse(sent.hold.deadline) > Date.now() + 290_000, 'süre 5 dakika');
    assert.deepEqual(sent.message.fee, { coins: 240, state: 'held', returned: 0 });
    assert.equal(sent.message.reward, undefined, 'ödeyen elmas göstergesini görmez');

    const hers = (await thread(star.session, man.user.id)).find((m) => m.id === sent.message.id);
    assert.equal(hers.reward.diamonds, 240);
    assert.equal(hers.reward.state, 'waiting');
    assert.equal(hers.fee, undefined);
    assert.equal((await me(star.session)).diamonds, 0);

    // Too short to be an answer: nothing is settled yet.
    const dot = await ok(dm(star.session, man.user.id, '.'), 'nokta');
    assert.equal(dot.reward, undefined);
    assert.equal((await holdOf(sent.message.id)).status, 'pending');

    const answer = await ok(dm(star.session, man.user.id, 'Merhaba, nasılsın?'), 'cevap');
    assert.deepEqual(answer.reward, { diamonds: 240, count: 1 });
    assert.equal((await me(star.session)).diamonds, 240);
    const h1 = await holdOf(sent.message.id);
    assert.equal(h1.status, 'won');
    assert.equal(h1.reply_source, 'manual');
    assert.equal((await thread(star.session, man.user.id)).find((m) => m.id === sent.message.id).reward.state, 'won');
    assert.equal((await thread(man.session, star.user.id)).find((m) => m.id === sent.message.id).fee.state, 'paid');
    // A second answer pays nothing more.
    assert.equal((await ok(dm(star.session, man.user.id, 'Orada mısın?'), 'ikinci')).reward, undefined);
    assert.equal((await me(star.session)).diamonds, 240);
  });

  test('cevap gelmezse jeton aynı partiye geri döner; geç cevap ödül getirmez ama performansa yazılır', async () => {
    const man = await person('Mert', 'Erkek');
    const star = await streamer('Defne');
    await topUp(man.session);
    const lots = async () => Number((await q('SELECT sum(remaining) AS n FROM coin_lots WHERE user_id = $1', [man.user.id])).rows[0].n);
    const a = await ok(dm(man.session, star.user.id, 'Bir'), 'bir');
    const b = await ok(dm(man.session, star.user.id, 'İki'), 'iki');
    assert.equal((await me(man.session)).coins, 520);
    assert.equal(await lots(), 520);
    // The first runs out with no answer: the sweep gives it back.
    await expire(a.message.id);
    await until(async () => (await holdOf(a.message.id)).status === 'expired');
    assert.equal((await me(man.session)).coins, 760);
    assert.equal(await lots(), 760, 'jeton partiye döner');
    const back = (await q("SELECT amount, reason FROM ledger WHERE user_id = $1 AND ref = $2", [man.user.id, `msg:${a.message.id}:iade`])).rows[0];
    assert.equal(Number(back.amount), 240);
    assert.match(back.reason, /iadesi/);
    assert.equal((await thread(man.session, star.user.id)).find((m) => m.id === a.message.id).fee.state, 'refunded');
    // The second is past its time when she answers (before the sweep): refunded at once, and her late answer noted.
    await q("UPDATE message_holds SET deadline_at = now() - interval '2 minutes' WHERE message_id = $1", [b.message.id]);
    const late = await ok(dm(star.session, man.user.id, 'Kusura bakma, geç kaldım'), 'geç cevap');
    assert.equal(late.reward, undefined);
    const hb = await holdOf(b.message.id);
    assert.equal(hb.status, 'expired');
    assert.ok(hb.replied_at, 'geç cevap kaydedilir');
    assert.equal((await me(man.session)).coins, 1000);
    assert.equal((await me(star.session)).diamonds, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM paid_events WHERE payer = $1', [man.user.id])).rows[0].n, 0, 'kalp ve gelir yalnız kazanılan mesajda');
  });

  test('süre sınırı sunucunun saatiyle: süre payı içinde gelen cevap sayılır; tarama başarısız kalan cevabı bulur', async () => {
    const man = await person('Ozan', 'Erkek');
    const star = await streamer('İnci');
    await topUp(man.session);
    const a = await ok(dm(man.session, star.user.id, 'Selam'), 'mesaj');
    // The deadline passed 3 s ago: inside the 10 s grace.
    await q("UPDATE message_holds SET deadline_at = now() - interval '3 seconds' WHERE message_id = $1", [a.message.id]);
    assert.deepEqual((await ok(dm(star.session, man.user.id, 'Buradayım'), 'payla cevap')).reward, { diamonds: 240, count: 1 });

    // An answer whose settling never ran (stored without the route): the sweep reads the messages and pays her.
    const b = await ok(dm(man.session, star.user.id, 'Yine ben'), 'mesaj 2');
    await q("INSERT INTO messages (sender, recipient, body, ref, created_at) VALUES ($1, $2, 'Cevabım bu', $3, now() - interval '25 seconds')", [star.user.id, man.user.id, rnd(8)]);
    await q("UPDATE message_holds SET delivered_at = now() - interval '6 minutes', deadline_at = now() - interval '20 seconds' WHERE message_id = $1", [b.message.id]);
    await q("UPDATE messages SET created_at = now() - interval '6 minutes' WHERE id = $1", [b.message.id]);
    await until(async () => (await holdOf(b.message.id)).status !== 'pending');
    assert.equal((await holdOf(b.message.id)).status, 'won');
    assert.equal((await me(star.session)).diamonds, 480);
  });

  test('yayıncının otomatik mesajı cevap sayılmaz; aynı anda iki cevap elması bir kez öder', async () => {
    const man = await person('Efe', 'Erkek');
    const star = await streamer('Nehir');
    await topUp(man.session);
    const a = await ok(dm(man.session, star.user.id, 'Merhaba'), 'mesaj');
    await q("INSERT INTO messages (sender, recipient, body, ref, source) VALUES ($1, $2, 'Selam 😊', $3, 'auto_streamer')", [star.user.id, man.user.id, `auto:${rnd(8)}`]);
    await expire(a.message.id);
    await until(async () => (await holdOf(a.message.id)).status !== 'pending');
    assert.equal((await holdOf(a.message.id)).status, 'expired', 'otomatik mesaj ödül getirmez');

    const b = await ok(dm(man.session, star.user.id, 'Bir daha'), 'mesaj 2');
    const both = await Promise.all([dm(star.session, man.user.id, 'Cevap bir'), dm(star.session, man.user.id, 'Cevap iki')]);
    assert.deepEqual(both.map(([st]) => st), [200, 200]);
    assert.equal(both.filter(([, j]) => j.reward).length, 1, 'yalnız biri kazanır');
    assert.equal((await holdOf(b.message.id)).status, 'won');
    assert.equal((await me(star.session)).diamonds, 240);
  });

  test('mağaza iadesi bekleyen mesajın jetonunu satın almayla götürür; sonra gelen cevap elmas yaratmaz', async () => {
    const man = await person('Arda', 'Erkek');
    const star = await streamer('Yaren');
    await adminOf();
    const p = await ok(call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, man.session), 'satın alma');
    assert.ok(p);
    const a = await ok(dm(man.session, star.user.id, 'Merhaba'), 'mesaj');
    const [purchase] = (await q('SELECT id FROM purchases WHERE user_id = $1', [man.user.id])).rows;
    await ok(call('POST', '/api/admin/purchases/refund', { purchase: Number(purchase.id) }, admin.session), 'iade');
    const hold = await holdOf(a.message.id);
    assert.equal(hold.status, 'withdrawn');
    assert.equal(hold.returned, 0, 'iade edilen partiden gelen jeton geri dönmez');
    assert.equal((await ok(dm(star.session, man.user.id, 'Selam'), 'cevap')).reward, undefined);
    assert.equal((await me(star.session)).diamonds, 0);
  });

  test('kural kapalıyken (0 dakika) yayıncı ücretli mesajın elmasını hemen alır', async () => {
    await setLive({ reply_minutes: 0 });
    try {
      const man = await person('Deniz', 'Erkek');
      const star = await streamer('Lara');
      await topUp(man.session);
      const sent = await ok(dm(man.session, star.user.id, 'Selam'), 'mesaj');
      assert.equal(sent.hold, undefined);
      assert.equal((await me(star.session)).diamonds, 240);
      assert.equal((await q('SELECT count(*)::int AS n FROM message_holds WHERE payer = $1', [man.user.id])).rows[0].n, 0);
    } finally {
      await setLive({ reply_minutes: null });
    }
  });
});

describe('Hazır cevap', () => {
  test('yalnız kadın yayıncı, yalnız ona yazana; metin sunucudan; hak günlük ve aynı anda bile aşılmaz', async () => {
    const man = await person('Burak', 'Erkek');
    const star = await streamer('Selin');
    await topUp(man.session, 5000);
    // Not hers to use: a man, and nobody wrote to her yet.
    assert.equal((await quick(man.session, star.user.id))[0], 403);
    const [st0, j0] = await quick(star.session, man.user.id);
    assert.equal(st0, 403);
    assert.equal(j0.code, 'quick_not_reply');

    const sent = await ok(dm(man.session, star.user.id, 'Merhaba'), 'mesaj');
    const mine = await ok(call('GET', '/api/auto-chat/me', null, star.session), 'haklarım');
    assert.equal(mine.tools, true);
    assert.equal(mine.quick.total, 10);
    assert.equal(mine.quick.left, 10);
    assert.ok(mine.quick.replies.length >= 5);
    assert.equal((await ok(call('GET', '/api/auto-chat/me', null, man.session), 'erkek')).tools, false);

    const ref = rnd(6);
    const r1 = await ok(quick(star.session, man.user.id, 2, ref), 'hazır cevap');
    assert.equal(r1.message.text, mine.quick.replies[1].text, 'metin havuzdan');
    assert.equal(r1.message.source, 'quick_reply');
    assert.deepEqual(r1.reward, { diamonds: 240, count: 1 }, 'hazır cevap da ödülü getirir');
    assert.equal(r1.quick.left, 9);
    // A retry of the same request takes no second right.
    assert.equal((await ok(quick(star.session, man.user.id, 2, ref), 'tekrar')).replay, true);
    assert.equal((await ok(call('GET', '/api/auto-chat/me', null, star.session), 'haklarım')).quick.used, 1);
    assert.equal((await holdOf(sent.message.id)).reply_source, 'quick_reply');

    // Twelve at once with nine left: nine go, three are refused, nothing past ten.
    const many = await Promise.all(Array.from({ length: 12 }, () => quick(star.session, man.user.id, 1)));
    assert.equal(many.filter(([st]) => st === 200).length, 9);
    const refused = many.filter(([st]) => st === 409);
    assert.equal(refused.length, 3);
    assert.equal(refused[0][1].code, 'quick_quota');
    assert.match(refused[0][1].error, /Günlük 10 hazır cevap hakkını kullandın/);
    assert.equal((await q("SELECT count(*)::int AS n FROM messages WHERE sender = $1 AND source = 'quick_reply'", [star.user.id])).rows[0].n, 10);
    // She still answers by hand, and still earns.
    const m2 = await ok(dm(man.session, star.user.id, 'Yine ben'), 'mesaj 2');
    assert.deepEqual((await ok(dm(star.session, man.user.id, 'Elle yazdım'), 'elle')).reward, { diamonds: 240, count: 1 });
    assert.equal((await holdOf(m2.message.id)).reply_source, 'manual');
    // Yesterday's rights don't count today.
    await q("UPDATE auto_quota SET day = day - 1 WHERE user_id = $1 AND kind = 'quick'", [star.user.id]);
    assert.equal((await ok(call('GET', '/api/auto-chat/me', null, star.session), 'yeni gün')).quick.left, 10);
    // The day's last one told SimilarClub Sistem, once.
    const notes = await q("SELECT count(*)::int AS n FROM team_notices WHERE target = $1 AND category = 'quota'", [star.user.id]);
    assert.equal(notes.rows[0].n, 1);
  });

  test('hazır cevap kapatılınca çalışmaz', async () => {
    const man = await person('Can', 'Erkek');
    const star = await streamer('Duru');
    await topUp(man.session);
    await ok(dm(man.session, star.user.id, 'Selam'), 'ilk');
    await setLive({ auto_chat_off: ['quick'] });
    try {
      const [st, j] = await quick(star.session, man.user.id);
      assert.equal(st, 403);
      assert.equal(j.code, 'quick_off');
    } finally {
      await setLive({ auto_chat_off: null });
    }
  });
});

describe('Otomatik mesajlarım', () => {
  test('varsayılan 10 şablon; değişen yalnız o şablon; iletişim bilgisi ve uzunluk denetlenir; geri dönülür', async () => {
    const star = await streamer('Mina');
    const man = await person('Selim', 'Erkek');
    assert.equal((await call('GET', '/api/auto-chat/templates', null, man.session))[0], 403);
    const t = await ok(call('GET', '/api/auto-chat/templates', null, star.session), 'şablonlar');
    assert.equal(t.templates.length, 10);
    assert.equal(t.templates[0].text, 'Merhaba 😊 Günün nasıl geçiyor?');
    assert.ok(t.templates.every((x) => !x.custom));
    assert.equal(t.auto.total, 10);

    const saved = await ok(call('POST', '/api/auto-chat/templates', { no: 3, text: 'Bugün kahve mi çay mı?' }, star.session), 'kaydet');
    assert.equal(saved.template.custom, true);
    assert.equal(saved.templates[2].text, 'Bugün kahve mi çay mı?');
    assert.deepEqual(saved.templates.filter((x) => x.custom).map((x) => x.no), [3], 'yalnız 3. şablon değişti');
    assert.equal(saved.templates[0].text, t.templates[0].text);

    const phone = await call('POST', '/api/auto-chat/templates', { no: 4, text: 'Bana 0532 123 45 67 yaz' }, star.session);
    assert.equal(phone[0], 400, 'telefon numarası olamaz');
    assert.equal((await call('POST', '/api/auto-chat/templates', { no: 4, text: 'Hi' }, star.session))[0], 400, 'çok kısa');
    assert.equal((await call('POST', '/api/auto-chat/templates', { no: 4, text: 'x'.repeat(201) }, star.session))[0], 400, 'çok uzun');
    assert.equal((await call('POST', '/api/auto-chat/templates', { no: 11, text: 'Merhaba nasılsın' }, star.session))[0], 400);

    const reset = await ok(call('POST', '/api/auto-chat/templates/reset', { no: 3 }, star.session), 'geri dön');
    assert.equal(reset.template.custom, false);
    assert.equal(reset.template.text, t.templates[2].text);
  });

  test('erkek adına başlangıç ancak uygulama anlattıktan sonra; ayar yalnız açılır', async () => {
    const man = await person('Tuna', 'Erkek');
    const st = await ok(call('GET', '/api/auto-chat/me', null, man.session), 'durum');
    assert.equal(st.opener.sending, true, 'varsayılan açık (sahiplerin kararı)');
    assert.equal(st.opener.seen, false);
    assert.equal((await call('PATCH', '/api/me/privacy', { autoOpenerSeen: false }, man.session))[0], 400);
    await ok(call('PATCH', '/api/me/privacy', { autoOpenerSeen: true, autoOpener: false }, man.session), 'gördüm, kapat');
    const after = await ok(call('GET', '/api/auto-chat/me', null, man.session), 'durum 2');
    assert.equal(after.opener.seen, true);
    assert.equal(after.opener.sending, false);
  });
});

describe('Mesaj performansı', () => {
  test('oranlar bütün uygun mesajlara göre; ajans yalnız kendi yayıncılarını görür, mesaj içeriği yok', async () => {
    const owner = await person('Ajans Sahibi', 'Erkek');
    const [ag] = (await q("INSERT INTO agencies (code, name, level, status, owner_id) VALUES ($1, 'Yıldız Ajans', 1, 'approved', $2) RETURNING id", [`Y${rnd(3).toUpperCase()}`, owner.user.id])).rows;
    const star = await streamer('Asya', ag.id);
    const other = await streamer('Başka');
    const man = await person('Kaya', 'Erkek');
    await topUp(man.session, 5000);
    // Four messages: two answered in time by one quick reply, one answered late, one never.
    const ids = [];
    for (let i = 0; i < 2; i++) ids.push((await ok(dm(man.session, star.user.id, `Mesaj ${i}`), 'mesaj')).message.id);
    await ok(quick(star.session, man.user.id, 1), 'hazır cevap');
    for (let i = 2; i < 4; i++) ids.push((await ok(dm(man.session, star.user.id, `Mesaj ${i}`), 'mesaj')).message.id);
    await q("UPDATE message_holds SET deadline_at = now() - interval '1 hour' WHERE message_id = ANY($1::bigint[])", [ids.slice(2)]);
    await until(async () => (await q("SELECT count(*)::int AS n FROM message_holds WHERE message_id = ANY($1::bigint[]) AND status = 'expired'", [ids.slice(2)])).rows[0].n === 2);
    await q("UPDATE message_holds SET replied_at = delivered_at + interval '9 minutes', reply_source = 'manual' WHERE message_id = $1", [ids[2]]);
    const perf = await ok(call('GET', '/api/auto-chat/performance?period=today', null, star.session), 'performans');
    const s = perf.stats;
    assert.equal(s.total, 4);
    assert.equal(s.inTime, 2);
    assert.equal(s.late, 1);
    assert.equal(s.unanswered, 1);
    assert.equal(s.inTimeRate, 50, '5 dakika oranı bütün uygun mesajlara göre');
    assert.equal(s.quick, 2);
    assert.equal(s.diamonds, 480);
    assert.equal(s.missed, 2);
    assert.equal(s.missedDiamonds, 480);
    assert.equal(perf.days.length, 1);
    assert.equal(perf.today.quick.used, 1);
    assert.equal((await call('GET', '/api/auto-chat/performance?period=custom&from=2026-01-01&to=2026-12-31', null, star.session))[0], 400, '92 günden uzun aralık olmaz');
    assert.equal((await call('GET', '/api/auto-chat/performance', null, man.session))[0], 403);

    const rep = await ok(call('GET', `/api/agency/message-performance?id=${ag.id}&period=7d`, null, owner.session), 'ajans');
    assert.deepEqual(rep.streamers.map((x) => x.id), [star.user.id], 'yalnız kendi yayıncısı');
    assert.equal(rep.streamers[0].total, 4);
    assert.equal(rep.totals.inTimeRate, 50);
    assert.equal(JSON.stringify(rep).includes('Mesaj 0'), false, 'mesaj içeriği yok');
    const [stx] = await call('GET', `/api/agency/message-performance?id=${other.agency}&period=7d`, null, owner.session);
    assert.ok(stx === 403 || stx === 404, 'başka ajansın raporu açılmaz');

    // The panel's report.
    await adminOf();
    const adm = await ok(call('GET', '/api/admin/auto-chat/report?period=today', null, admin.session), 'yönetim raporu');
    assert.ok(adm.stats.total >= 4);
    assert.ok(adm.streamers.some((x) => x.id === star.user.id && x.agency === 'Yıldız Ajans'));
    assert.equal((await call('GET', '/api/admin/auto-chat/report', null, owner.session))[0], 403);
  });

  test('günlük özet ve gecikme uyarısı SimilarClub Sistem’e bir kez gider', async () => {
    const star = await streamer('Ilgaz');
    const man = await person('Umut', 'Erkek');
    await topUp(man.session, 5000);
    await setLive({ perf_warn_min: 3 });
    const ids = [];
    for (let i = 0; i < 2; i++) ids.push((await ok(dm(man.session, star.user.id, `Soru ${i}`), 'mesaj')).message.id);
    await ok(dm(star.session, man.user.id, 'Cevap'), 'cevap');
    // Five more nobody answered (then all put back a day, as yesterday's): 2 of 7 in time.
    for (let i = 0; i < 5; i++) ids.push((await ok(dm(man.session, star.user.id, `Sonra ${i}`), 'mesaj')).message.id);
    await q("UPDATE message_holds SET deadline_at = now() - interval '1 hour' WHERE message_id = ANY($1::bigint[]) AND status = 'pending'", [ids]);
    await until(async () => (await q("SELECT count(*)::int AS n FROM message_holds WHERE earner = $1 AND status = 'pending'", [star.user.id])).rows[0].n === 0);
    await q("UPDATE message_holds SET delivered_at = delivered_at - interval '1 day', deadline_at = deadline_at - interval '1 day' WHERE earner = $1", [star.user.id]);
    const day = (await q("SELECT to_char((now() AT TIME ZONE 'Europe/Istanbul')::date - 1, 'YYYY-MM-DD') AS d")).rows[0].d;
    const run = await ok(call('POST', '/api/admin/auto-chat/daily', { day }, admin.session), 'günlük iş');
    assert.ok(run.summaries >= 1);
    const again = await ok(call('POST', '/api/admin/auto-chat/daily', { day }, admin.session), 'tekrar');
    assert.ok(again);
    const notes = (await q("SELECT category, title, body, data FROM team_notices WHERE target = $1 AND category IN ('message_summary', 'performance') ORDER BY id", [star.user.id])).rows;
    assert.deepEqual(notes.map((n) => n.category), ['message_summary', 'performance'], 'her biri bir kez');
    assert.match(notes[0].body, /toplam 480 elmas/);
    assert.equal(notes[0].data.inTime, 2);
    assert.match(notes[1].body, /yanıt sürenin uzadığını/);
    const team = await ok(call('GET', '/api/team', null, star.session), 'sistem sohbeti');
    const sum = team.notices.find((n) => n.category === 'message_summary');
    assert.equal(sum.system, true);
    assert.equal(sum.kind, 'reward', 'eski uygulama ödül kartı olarak gösterir');
    assert.equal(sum.data.diamonds, 480);
    await setLive({ perf_warn_min: null });
  });
});

describe('SimilarClub Sistem: arama bildirimleri', () => {
  test('sesli aramada kazanan elmasını, ödeyen yalnız kendi tutarını görür; bir kez', async () => {
    await setLive({ heart_voice_level: 0, heart_video_level: 0 });
    const man = await person('Barış', 'Erkek');
    const star = await streamer('Eylül');
    await topUp(man.session, 10_000);
    const ring = await ok(call('POST', '/api/calls', { to: star.user.id, mode: 'voice', ref: rnd(6) }, man.session), 'ara');
    await ok(call('POST', '/api/calls/answer', { id: ring.call.id }, star.session), 'aç');
    await lasted(ring.call.id, 31);
    await ok(call('POST', '/api/calls/end', { id: ring.call.id }, man.session), 'kapat');
    const notes = await until(async () => {
      const r = (await q('SELECT target, category, title, body, data FROM team_notices WHERE ref LIKE $1 ORDER BY id', [`call:${ring.call.id}:%`])).rows;
      return r.length === 2 ? r : null;
    });
    const earn = notes.find((n) => n.target === star.user.id);
    const paid = notes.find((n) => n.target === man.user.id);
    assert.equal(earn.category, 'voice_call');
    assert.equal(earn.data.diamonds, 2000);
    const ledger = (await q("SELECT sum(amount)::int AS n FROM ledger WHERE user_id = $1 AND currency = 'diamond' AND ref LIKE $2", [star.user.id, `call:${ring.call.id}:%`])).rows[0].n;
    assert.equal(earn.data.diamonds, ledger, 'bildirim cüzdan kaydıyla aynı');
    assert.match(earn.body, /Kazandığın elmas: 💎 2\.000/);
    assert.equal(paid.category, 'call_paid');
    assert.match(paid.body, /İşlem tutarı: 2\.000 jeton/);
    assert.equal(paid.body.includes('elmas'), false, 'ödeyen kazancı görmez');
    assert.equal(paid.data.diamonds, undefined);
    await new Promise((r) => setTimeout(r, 600));
    assert.equal((await q('SELECT count(*)::int AS n FROM team_notices WHERE ref LIKE $1', [`call:${ring.call.id}:%`])).rows[0].n, 2, 'tekrar işlense de bir kez');
  });

  test('görüntülü arama ayrı kategori; kapatılan kategori gitmez; ücretsiz arama bildirim üretmez', async () => {
    const man = await person('Cem', 'Erkek');
    const star = await streamer('Ada');
    await topUp(man.session, 10_000);
    await setLive({ system_notices_off: ['call_paid'] });
    const ring = await ok(call('POST', '/api/calls', { to: star.user.id, mode: 'video', ref: rnd(6) }, man.session), 'ara');
    await ok(call('POST', '/api/calls/answer', { id: ring.call.id }, star.session), 'aç');
    await lasted(ring.call.id, 31);
    await ok(call('POST', '/api/calls/end', { id: ring.call.id }, star.session), 'kapat');
    await until(async () => (await q('SELECT notice_at FROM calls WHERE id = $1', [ring.call.id])).rows[0].notice_at);
    const notes = (await q('SELECT target, category FROM team_notices WHERE ref LIKE $1', [`call:${ring.call.id}:%`])).rows;
    assert.deepEqual(notes, [{ target: star.user.id, category: 'video_call' }]);
    await setLive({ system_notices_off: null });
    // A declined call never charged anything: nothing to tell.
    const no = await ok(call('POST', '/api/calls', { to: star.user.id, mode: 'voice', ref: rnd(6) }, man.session), 'ara 2');
    await ok(call('POST', '/api/calls/end', { id: no.call.id }, star.session), 'reddet');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal((await q('SELECT count(*)::int AS n FROM team_notices WHERE ref LIKE $1', [`call:${no.call.id}:%`])).rows[0].n, 0);
    const failures = await ok(call('GET', '/api/admin/system-notices?days=1', null, admin.session), 'bildirim kayıtları');
    assert.ok(failures.categories.find((c) => c.category === 'video_call').sent >= 1);
  });
});
