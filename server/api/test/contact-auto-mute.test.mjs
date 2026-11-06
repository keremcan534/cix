// The contact filter's automatic mute (sanctions.mjs contactStrike, core.mjs countRefusal), against a real
// Postgres (harness.mjs): 5 refusals inside an hour, the server's and the app's own alike, mute the person's
// messages (DMs and room chat) for an hour with the reason contact_sharing. One or two tries before that the
// refusal says how many are left; nothing is added while the mute runs, and refusals made while it ran never
// count: once it is over or lifted (this rule's mute or staff's), the count starts from zero with the same
// warnings; staff are never muted; refusals at the same moment make one mute; refusals over the per-minute write
// cap count too; only the system gives the reason; a slow LiveKit doesn't hide the mute from the answer; and the
// refused text is stored nowhere. A fake LiveKit records the chat permission an open voice connection is given.
// Time passing is simulated by moving rows into the past in the database.
//   POSTGRES_PASSWORD=… node --test test/contact-auto-mute.test.mjs
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';

import { CONTACT_MESSAGE } from '../contact-filter.mjs';
import { rnd, startApi, tokenOf } from './harness.mjs';

const lkCalls = [];
/** People whose LiveKit calls answer only after 3 seconds (a slow LiveKit). */
const lkSlow = new Set();
const LK_PORT = 20000 + (process.pid % 1000);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const call = { method: req.url.split('/').pop(), body: JSON.parse(body || '{}') };
    lkCalls.push(call);
    setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end('{}'), lkSlow.has(call.body.identity) ? 3000 : 0);
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => lk.close(r)));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, AUTO_MUTE_REFUSALS: '5', AUTO_MUTE_MINUTES: '60', AUTO_MUTE_WINDOW: '60' });
const { call, signUp } = h;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const REASON_TEXT = 'Otomatik: iletişim bilgisi paylaşma denemesi';
const PHONE = '0532 123 45 67';

const ok = async (p, msg = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${msg} ${JSON.stringify(j)}`);
  return j;
};
/** A contact_blocked refusal; returns its body. */
const blocked = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 400, JSON.stringify(j));
  assert.equal(j.code, 'contact_blocked', JSON.stringify(j));
  assert.equal(j.error, CONTACT_MESSAGE);
  return j;
};
const dm = (from, to, text) => call('POST', '/api/messages', { to: to.user.id, text, ref: `m${rnd(8)}` }, from.session);
/** A refusal the app made on its own (room chat), reported to the server. */
const appRefusal = (who, place = 'room.chat') => ok(call('POST', '/api/contact/refusals', { category: 'phone', place }, who.session));
const autoMutes = (who) =>
  q(
    `SELECT s.*, m.include_dm, m.include_calls, extract(epoch FROM s.expires_at - s.start_at)::int AS secs
       FROM user_sanctions s LEFT JOIN user_mute_records m ON m.sanction_id = s.id
      WHERE s.user_id = $1 AND s.reason_code = 'contact_sharing' ORDER BY s.id`,
    [who.user.id],
  );
/**
 * An hour passes and the mute is over: it started 59 minutes ago and ended a second ago. The person's refusals
 * from before it move to just before it began; those made while it ran move to 20 minutes ago, inside the mute
 * and still inside the hour.
 */
const runOut = async (who, s) => {
  await q(
    `UPDATE contact_refusals SET created_at = CASE WHEN created_at < (SELECT start_at FROM user_sanctions WHERE id = $2) THEN now() - interval '60 minutes'
                                                    ELSE now() - interval '20 minutes' END
      WHERE user_id = $1`,
    [who.user.id, s.id],
  );
  await q("UPDATE user_sanctions SET start_at = now() - interval '59 minutes', expires_at = now() - interval '1 second' WHERE id = $1", [s.id]);
};
const refusalsOf = async (who) => (await q('SELECT count(*)::int AS n FROM contact_refusals WHERE user_id = $1', [who.user.id]))[0].n;
/** Waits up to `ms` for `check` to hold. */
const waitFor = async (check, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 25))) if (await check()) return true;
  return check();
};
const lift = (staff, s, reason = 'İtiraz üzerine kaldırıldı') => ok(call('POST', '/api/admin/sanctions/lift', { id: Number(s.id), reason }, staff.session), 'kaldırma');

let a, b, room;

describe('iletişim filtresi: otomatik susturma', () => {
  test('hazırlık', async () => {
    [a, b] = await Promise.all(['Ayşe', 'Burak'].map((n) => signUp(n)));
    room = (await ok(call('POST', '/api/rooms', { title: 'Akşam Sohbeti' }, b.session))).room.id;
    // Ayşe is in the room's voice call: the open connection is told when she can't chat.
    await q('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3)', [`oda-${room}`, a.user.id, 'PA_a']);
  });

  test('4 deneme susturmaz, 3. ve 4. kalan hakkı söyler; 5. deneme 1 saat susturur', async () => {
    const r1 = await blocked(dm(a, b, `beni ara ${PHONE}`));
    assert.equal(r1.strikesLeft, undefined, 'ilk retlerde uyarı yok');
    assert.equal(r1.muted, undefined);
    const r2 = await blocked(call('PATCH', '/api/me', { bio: `wp ${PHONE}` }, a.session));
    assert.equal(r2.strikesLeft, undefined);
    // The app's own refusal counts like the server's and answers the same way.
    assert.deepEqual(await appRefusal(a), { counted: true, strikesLeft: 2, muteMinutes: 60 });
    const r4 = await blocked(dm(a, b, 'ayse@gmail.com yaz'));
    assert.deepEqual([r4.category, r4.field, r4.strikesLeft, r4.muteMinutes, r4.muted], ['email', 'text', 1, 60, undefined], 'mevcut alanlar aynı kalır');
    assert.equal((await autoMutes(a)).length, 0, '4 denemede susturma yok');
    await ok(dm(a, b, 'Selam, akşam odada mısın?'), 'henüz mesaj yazabilir');

    const r5 = await blocked(dm(a, b, `numaram ${PHONE}`));
    assert.equal(r5.muted, true, JSON.stringify(r5));
    assert.equal(r5.strikesLeft, undefined);
    assert.equal(r5.sanction.reasonCode, 'contact_sharing');
    assert.equal(r5.sanction.reasonText, REASON_TEXT);
    assert.deepEqual(r5.sanction.restricts, ['room_text', 'dm']);
    assert.equal(r5.until, r5.sanction.endAt);
    assert.ok(r5.serverNow);
    const left = (new Date(r5.until) - new Date(r5.serverNow)) / 60_000;
    assert.ok(left > 59 && left <= 60, String(left));

    const [s, ...more] = await autoMutes(a);
    assert.equal(more.length, 0);
    assert.deepEqual(
      [s.sanction_type, s.scope, s.include_dm, s.include_calls, s.source, s.created_role, s.created_by, s.status, s.is_permanent, s.secs],
      ['mute_global_text', 'global', true, false, 'auto', 'system', null, 'active', false, 3600],
    );
    assert.equal(s.reason_description, REASON_TEXT);
    assert.equal(s.internal_note, '1 saatte 5 kez iletişim bilgisi yazmaya çalıştı');
    const audit = await q('SELECT action, actor, actor_role, detail FROM sanction_audit_logs WHERE sanction_id = $1', [s.id]);
    assert.deepEqual(audit.map((x) => [x.action, x.actor, x.actor_role, x.detail.source, x.detail.reason]), [['apply', null, 'system', 'auto', 'contact_sharing']]);
  });

  test('susturulan kişi DM ve oda sohbeti yazamaz; bunu her yerde görür', async () => {
    const [st, j] = await dm(a, b, 'Selam!');
    assert.equal(st, 403, JSON.stringify(j));
    assert.equal(j.code, 'muted');
    assert.equal(j.sanction.reasonText, REASON_TEXT);
    for (const action of ['dm', 'room_text']) {
      const chk = await ok(call('GET', `/api/sanctions/check?action=${action}&room=${room}`, null, a.session));
      assert.equal(chk.allowed, false, action);
      assert.equal(chk.sanction.reasonText, REASON_TEXT);
    }
    // Voice is not part of it.
    assert.equal((await ok(call('GET', `/api/sanctions/check?action=room_voice&room=${room}`, null, a.session))).allowed, true);
    const t = await ok(call('GET', `/token?room=oda-${room}`, null, a.session));
    assert.deepEqual([tokenOf(t.token).video.canPublishData, tokenOf(t.token).video.canPublish, t.canChat], [false, true, false], 'ses anahtarında sohbet izni yok');
    const chatOff = () => lkCalls.filter((c) => c.method === 'UpdateParticipant' && c.body.identity === a.user.id).at(-1)?.body.permission.canPublishData === false;
    assert.ok(await waitFor(chatOff), 'açık bağlantının sohbet izni hemen kalkar');

    const mine = await ok(call('GET', '/api/sanctions/mine', null, a.session));
    assert.equal(mine.sanctions.length, 1);
    const v = mine.sanctions[0];
    assert.deepEqual([v.reason, v.reasonText, v.appliedBy, v.label], ['İletişim bilgisi paylaşma', REASON_TEXT, 'Otomatik sistem', 'Genel yazılı susturma']);
    assert.equal(v.note, undefined, 'iç not kişiye gitmez');
    // Others can still write to her.
    await ok(dm(b, a, 'Görüşürüz'));
  });

  test('susturma sürerken yeni retler ikinci bir susturma eklemez, uyarı da vermez', async () => {
    const r = await blocked(call('PATCH', '/api/me', { city: 'insta: ayse.izmir' }, a.session));
    assert.deepEqual([r.strikesLeft, r.muted], [undefined, undefined]);
    for (let i = 0; i < 6; i++) assert.deepEqual(await appRefusal(a), { counted: true });
    assert.equal((await autoMutes(a)).length, 1);
  });

  test('susturma bitince eski retler yeniden tetiklemez; yeni 5 deneme yeniden susturur', async () => {
    const [s] = await autoMutes(a);
    await runOut(a, s);
    await ok(dm(a, b, 'Tekrar selam'), 'süre bitince mesaj yazabilir');
    // The 7 refusals made while the mute ran are inside the hour, yet they don't count: the first new one starts
    // the count again, and the last two tries are warned about as before.
    assert.equal((await q("SELECT count(*)::int AS n FROM contact_refusals WHERE user_id = $1 AND created_at > now() - interval '30 minutes'", [a.user.id]))[0].n, 7);
    assert.deepEqual(await appRefusal(a), { counted: true });
    assert.deepEqual(await appRefusal(a), { counted: true });
    assert.deepEqual(await appRefusal(a), { counted: true, strikesLeft: 2, muteMinutes: 60 });
    assert.equal((await autoMutes(a)).length, 1);
    assert.equal((await appRefusal(a, 'moment.post')).strikesLeft, 1);
    const again = await appRefusal(a, 'tayfa.chat');
    assert.deepEqual([again.counted, again.muted, again.sanction.reasonCode], [true, true, 'contact_sharing']);
    assert.ok(again.until);
    assert.equal((await autoMutes(a)).length, 2);
    assert.equal((await autoMutes(a))[1].internal_note, '1 saatte 5 kez iletişim bilgisi yazmaya çalıştı', 'yalnızca yeni 5 ret');
    assert.equal((await dm(a, b, 'Selam'))[0], 403);
  });

  test('yetkili kaldırınca sayım baştan başlar; susturma sürerken yapılan retler sonradan sayılmaz', async () => {
    const u = await signUp('Ece');
    const mod = await h.account('Ekip kaldırma', 'moderator');
    for (let i = 0; i < 5; i++) await appRefusal(u);
    const [s] = await autoMutes(u);
    assert.ok(s, 'beşinci retle susturuldu');
    // Screens the mute doesn't close (profile, moments …) still refuse: counted for staff, no warning.
    for (let i = 0; i < 4; i++) assert.deepEqual(await appRefusal(u, 'profile.bio'), { counted: true }, 'susturma sürerken uyarı yok');
    await lift(mod, s);
    await ok(dm(u, b, 'Selam, tekrar yazabiliyorum'), 'kaldırılınca yazabilir');
    assert.deepEqual(await appRefusal(u), { counted: true }, 'kaldırmadan sonraki ilk ret susturmaz');
    assert.deepEqual(await appRefusal(u), { counted: true });
    assert.deepEqual(await appRefusal(u), { counted: true, strikesLeft: 2, muteMinutes: 60 });
    assert.equal((await appRefusal(u)).strikesLeft, 1);
    assert.equal((await autoMutes(u)).length, 1);
    assert.equal((await appRefusal(u)).muted, true);
    const mutes = await autoMutes(u);
    assert.deepEqual([mutes.length, mutes[1].internal_note], [2, '1 saatte 5 kez iletişim bilgisi yazmaya çalıştı']);
    assert.equal(await refusalsOf(u), 14, 'hepsi yetkili için sayıldı');
  });

  test('bir yetkilinin DM dahil susturması bitince de sayım baştan başlar', async () => {
    const u = await signUp('Furkan');
    const mod = await h.account('Ekip susturma', 'moderator');
    await appRefusal(u);
    await appRefusal(u);
    const [m] = (
      await ok(call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_global_text', reason: 'spam', minutes: 30, includeDm: true, note: 'Tekrarlı mesaj' }, mod.session), 'elle susturma')
    ).sanctions;
    for (let i = 0; i < 4; i++) assert.deepEqual(await appRefusal(u), { counted: true }, 'zaten yazamıyor: uyarı yok');
    assert.equal((await autoMutes(u)).length, 0, 'yetkilinin susturması sürerken otomatik eklenmez');
    await lift(mod, m, 'Süre yeterli görüldü');
    // The 2 refusals before it and the 4 while it ran: none counts now.
    assert.deepEqual(await appRefusal(u), { counted: true });
    assert.deepEqual(await appRefusal(u), { counted: true });
    assert.deepEqual(await appRefusal(u), { counted: true, strikesLeft: 2, muteMinutes: 60 });
    assert.equal((await autoMutes(u)).length, 0);
  });

  test('yalnızca oda sohbetini kapatan susturma sayımı sıfırlamaz', async () => {
    const u = await signUp('Gizem');
    const mod = await h.account('Ekip oda', 'moderator');
    await appRefusal(u);
    await appRefusal(u);
    // A global text mute without DMs: the person can still write DMs, so the rule still counts and warns.
    const [m] = (await ok(call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_global_text', reason: 'spam', minutes: 30, note: 'Oda sohbetini bozdu' }, mod.session))).sanctions;
    assert.deepEqual(await appRefusal(u), { counted: true, strikesLeft: 2, muteMinutes: 60 });
    await lift(mod, m, 'Süre yeterli görüldü');
    assert.equal((await appRefusal(u)).strikesLeft, 1);
  });

  test('bir saatten eski retler sayılmaz', async () => {
    const u = await signUp('Deniz');
    for (let i = 0; i < 4; i++) await appRefusal(u);
    await q("UPDATE contact_refusals SET created_at = now() - interval '61 minutes' WHERE user_id = $1", [u.user.id]);
    assert.deepEqual(await appRefusal(u), { counted: true });
    assert.equal((await autoMutes(u)).length, 0);
  });

  test('yöneticiler ve moderatörler susturulmaz', async () => {
    for (const role of ['moderator', 'admin']) {
      const staff = await h.account(`Ekip ${role}`, role);
      for (let i = 0; i < 6; i++) assert.deepEqual(await appRefusal(staff), { counted: true }, role);
      assert.equal((await autoMutes(staff)).length, 0, role);
      assert.equal((await q('SELECT count(*)::int AS n FROM contact_refusals WHERE user_id = $1', [staff.user.id]))[0].n, 6, 'yine de sayılır');
    }
  });

  test('aynı anda gelen retler tek susturma yapar', async () => {
    for (let round = 0; round < 3; round++) {
      const u = await signUp(`Eş zamanlı ${round}`);
      const answers = await Promise.all(Array.from({ length: 8 }, () => appRefusal(u)));
      assert.equal(answers.filter((x) => x.muted).length, 1, JSON.stringify(answers));
      assert.equal((await autoMutes(u)).length, 1);
    }
  });

  test('dakikalık yazma sınırına takılan retler de sayılır, ama yalnızca susturma bittikten sonrakiler', async () => {
    // 20 refusals a minute per person are written; the rest aren't, yet they still count, one by one, and only
    // those after the last mute ended (here: was lifted). The limit's minute is the server's own: when it rolled
    // over during the run (a refusal past the 20th was written), the run is repeated once.
    const mod = await h.account('Ekip sınır', 'moderator');
    for (let attempt = 0; attempt < 2; attempt++) {
      const u = await signUp(`Sınır ${attempt}`);
      for (let i = 0; i < 20; i++) await appRefusal(u);
      const [s] = await autoMutes(u);
      assert.ok(s, 'beşinci retle susturuldu');
      await lift(mod, s);
      const answers = [];
      for (let i = 0; i < 5; i++) answers.push(await appRefusal(u));
      if ((await refusalsOf(u)) > 20) continue;
      assert.deepEqual(answers.slice(0, 4), [{ counted: true }, { counted: true }, { counted: true, strikesLeft: 2, muteMinutes: 60 }, { counted: true, strikesLeft: 1, muteMinutes: 60 }], 'kaldırmadan sonraki ilk ret susturmaz');
      assert.equal(answers[4].muted, true, JSON.stringify(answers[4]));
      const mutes = await autoMutes(u);
      assert.deepEqual([mutes.length, mutes[1].internal_note], [2, '1 saatte 5 kez iletişim bilgisi yazmaya çalıştı']);
      return;
    }
    assert.fail('yazma sınırının dakikası iki kez döndü');
  });

  test('yalnızca sistem bu gerekçeyi verir: panelde yok, yetkili ve oda sahibi seçemez', async () => {
    const boss = await h.account('Ekip gerekçe', 'admin');
    const u = await signUp('Hakan');
    const meta = await ok(call('GET', '/api/admin/sanctions/meta', null, boss.session));
    assert.ok(meta.reasons.some((r) => r.code === 'spam'));
    assert.ok(!meta.reasons.some((r) => r.code === 'contact_sharing'), 'panel sunmaz');
    const manual = await call('POST', '/api/admin/sanctions', { user: u.user.id, type: 'mute_global_text', reason: 'contact_sharing', minutes: 60, includeDm: true, note: 'elle' }, boss.session);
    assert.equal(manual[0], 400, JSON.stringify(manual[1]));
    const policy = await call('POST', '/api/admin/sanction-policies', { reason: 'contact_sharing', steps: [{ type: 'mute_global_text', minutes: 60, auto: true }] }, boss.session);
    assert.equal(policy[0], 400, JSON.stringify(policy[1]));
    const byOwner = await call('POST', '/api/rooms/mute', { room, user: u.user.id, kind: 'text', minutes: 30, reason: 'contact_sharing' }, b.session);
    assert.equal(byOwner[0], 400, JSON.stringify(byOwner[1]));
    assert.equal((await q('SELECT count(*)::int AS n FROM user_sanctions WHERE user_id = $1', [u.user.id]))[0].n, 0);
    // Another reason still works for the same people.
    await ok(call('POST', '/api/rooms/mute', { room, user: u.user.id, kind: 'text', minutes: 30, reason: 'spam' }, b.session), 'oda sahibi');
  });

  test('LiveKit yavaş olsa da susturmayı başlatan ret bunu hemen söyler', async () => {
    const u = await signUp('İpek');
    await q('INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, $3)', [`oda-${room}`, u.user.id, 'PA_i']);
    lkSlow.add(u.user.id);
    for (let i = 0; i < 4; i++) await appRefusal(u);
    const r = await appRefusal(u);
    assert.equal(r.muted, true, JSON.stringify(r));
    assert.equal(r.sanction.reasonCode, 'contact_sharing');
    // The open connection still loses chat, once LiveKit answers.
    assert.ok(await waitFor(() => lkCalls.some((c) => c.method === 'UpdateParticipant' && c.body.identity === u.user.id && c.body.permission.canPublishData === false)));
  });

  test('018 yeniden çalıştırılabilir', async () => {
    const sql = await fs.readFile(new URL('../migrations/018_contact_auto_mute.sql', import.meta.url), 'utf8');
    await h.sql.query(sql);
    assert.deepEqual(await q("SELECT title, public_text, active FROM sanction_reasons WHERE code = 'contact_sharing'"), [
      { title: 'İletişim bilgisi paylaşma', public_text: REASON_TEXT, active: true },
    ]);
  });

  test('reddedilen metin hiçbir yerde saklanmaz', async () => {
    const hits = await q(
      `SELECT 'messages' AS t FROM messages WHERE body LIKE '%0532%' OR body LIKE '%@gmail%'
       UNION ALL SELECT 'sanctions' FROM user_sanctions WHERE internal_note ~ '0532|@|insta' OR reason_description ~ '0532|@|insta'
       UNION ALL SELECT 'audit' FROM sanction_audit_logs WHERE detail::text ~ '0532|@gmail|insta'
       UNION ALL SELECT 'evidence' FROM moderation_evidence WHERE content ~ '0532|@gmail|insta'
       UNION ALL SELECT 'users' FROM users WHERE bio ~ '0532' OR city ~ 'insta'`,
    );
    assert.deepEqual(hits, []);
    const cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_name = 'contact_refusals' ORDER BY ordinal_position")).map((r) => r.column_name);
    assert.deepEqual(cols, ['id', 'user_id', 'category', 'place', 'created_at']);
    assert.ok(!h.logs.some((l) => l.includes('0532') || l.includes('ayse@gmail')), 'sunucu çıktısında yok');
  });
});
