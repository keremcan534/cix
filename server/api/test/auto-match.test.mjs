// Otomatik mesaj's matching (auto-chat.mjs) against a real Postgres, one round at a time (POST /api/admin/auto-chat/
// round, the sweep off): who gets a streamer's automatic message and when, the daily rights, the people who are never
// written to (switched off, blocked, already talking), a man's free conversation start only once his app told him, and
// the scoring rules on their own (auto-chat-rules.mjs).
import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { manCap, manScore, streamerScore } from '../auto-chat-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0', AUTO_CHAT_SWEEP_MS: '0', HOLD_SWEEP_MS: '200' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const person = async (name, gender, { daysOld = 0 } = {}) => {
  const a = await signUp(name);
  await q("UPDATE users SET gender = $2, created_at = now() - make_interval(days => $3) WHERE id = $1", [a.user.id, gender, daysOld]);
  return a;
};
async function streamer(name) {
  const a = await person(name, 'Kadın');
  const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`M${rnd(3).toUpperCase()}`, `Ay ${rnd(3)}`])).rows;
  await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [a.user.id, ag.id]);
  return a;
}
let admin = null;
const round = () => ok(call('POST', '/api/admin/auto-chat/round', {}, admin.session), 'tur');
async function setLive(changes) {
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  return ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Eşleştirme testi', baseV: view.v, confirm: true }, admin.session), 'ayar kaydı');
}
const sends = async (sender) => (await q('SELECT kind, recipient, template_no FROM auto_sends WHERE sender = $1 ORDER BY id', [sender])).rows;
/** The last automatic message she sent is `minutes` old, so her next turn may come. */
const later = (sender, minutes = 30) => q("UPDATE auto_sends SET created_at = created_at - make_interval(mins => $2) WHERE sender = $1", [sender, minutes]);

beforeEach(async () => {
  if (!admin) {
    admin = await signUp('Yönetici');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  }
  // Each test matches only its own people.
  await q('UPDATE users SET gender = NULL WHERE id <> $1', [admin.user.id]);
});

describe('Eşleştirme', () => {
  test('yeni erkek önce; yayıncının mesajları arayla gider, aynı kişiye bir kez; kendi şablonundan', async () => {
    const star = await streamer('Zeynep');
    const fresh = await person('Yeni', 'Erkek');
    const old = await person('Eski', 'Erkek', { daysOld: 40 });
    await ok(call('POST', '/api/auto-chat/templates', { no: 1, text: 'Merhaba, bugün nasılsın?' }, star.session), 'şablon');
    assert.equal((await round()).streamer, 1);
    let s = await sends(star.user.id);
    assert.deepEqual(s.map((x) => x.recipient), [fresh.user.id], 'yeni kullanıcı öncelikli');
    const msg = (await q("SELECT body, source, template_no FROM messages WHERE sender = $1", [star.user.id])).rows[0];
    assert.equal(msg.source, 'auto_streamer');
    const mine = (await ok(call('GET', '/api/auto-chat/templates', null, star.session), 'şablonlar')).templates;
    assert.equal(msg.body, mine[msg.template_no - 1].text, 'kendi şablonlarından');
    // The man sees it marked as automatic.
    const his = (await ok(call('GET', `/api/messages?with=${star.user.id}`, null, fresh.session), 'konuşma')).messages;
    assert.equal(his[0].source, 'auto_streamer');
    // Too soon for her next one.
    assert.equal((await round()).streamer, 0);
    await later(star.user.id);
    assert.equal((await round()).streamer, 1);
    s = await sends(star.user.id);
    assert.deepEqual(s.map((x) => x.recipient), [fresh.user.id, old.user.id], 'aynı kişiye ikinci kez gitmez');
    assert.notEqual(s[0].template_no, s[1].template_no, 'şablon tekrar etmez');
    const me = await ok(call('GET', '/api/auto-chat/me', null, star.session), 'haklarım');
    assert.equal(me.auto.used, 2);
    assert.equal(me.auto.left, 8);
  });

  test('kapatan, engelleyen, zaten yazışan ve çevrimdışı yayıncı eşleşmez; erkek yayıncı olamaz', async () => {
    const star = await streamer('Melek');
    const off = await person('Kapalı', 'Erkek');
    const blocker = await person('Engelleyen', 'Erkek');
    const talked = await person('Yazışan', 'Erkek');
    await ok(call('PATCH', '/api/me/privacy', { autoReceive: false }, off.session), 'kapat');
    await q('INSERT INTO blocks (blocker, blocked) VALUES ($1, $2) ON CONFLICT DO NOTHING', [blocker.user.id, star.user.id]);
    await ok(call('POST', '/api/messages', { to: talked.user.id, text: 'Önceden yazdım', ref: rnd(6) }, star.session), 'önceki mesaj');
    assert.equal((await round()).streamer, 0);
    // Offline: nobody sends in her name.
    const fresh = await person('Taze', 'Erkek');
    await q("UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE user_id = $1", [star.user.id]);
    assert.equal((await round()).streamer, 0);
    await q("UPDATE sessions SET last_seen_at = now() WHERE user_id = $1", [star.user.id]);
    // Her own switch.
    await ok(call('PATCH', '/api/me/privacy', { autoSend: false }, star.session), 'gönderme');
    assert.equal((await round()).streamer, 0);
    await ok(call('PATCH', '/api/me/privacy', { autoSend: true }, star.session), 'gönder');
    assert.equal((await round()).streamer, 1);
    assert.deepEqual((await sends(star.user.id)).map((x) => x.recipient), [fresh.user.id]);
  });

  test('günlük hak dolunca durur ve bir kez haber verilir; eski günün hakkı saymaz; meşgul yayıncıya gitmez', async () => {
    await setLive({ auto_daily: 2 });
    try {
      const star = await streamer('Sena');
      const men = await Promise.all([1, 2, 3].map((i) => person(`Erkek ${i}`, 'Erkek')));
      assert.equal((await round()).streamer, 1);
      await later(star.user.id);
      assert.equal((await round()).streamer, 1);
      await later(star.user.id);
      assert.equal((await round()).streamer, 0, 'günlük 2 hak bitti');
      const note = (await q("SELECT body FROM team_notices WHERE target = $1 AND category = 'quota'", [star.user.id])).rows;
      assert.equal(note.length, 1);
      assert.match(note[0].body, /Otomatik mesaj hakkın kalmadı/);
      // A new day in Turkey.
      await q("UPDATE auto_quota SET day = day - 1 WHERE user_id = $1", [star.user.id]);
      // Three paid messages wait for her answer: busy, no new start.
      const firstTo = (await sends(star.user.id))[0].recipient;
      const payer = men.find((m) => m.user.id === firstTo);
      await ok(call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, payer.session), 'yükleme');
      for (let i = 0; i < 3; i++) await ok(call('POST', '/api/messages', { to: star.user.id, text: `Cevap ${i}`, ref: rnd(6) }, payer.session), 'ücretli cevap');
      assert.equal((await q('SELECT replied_at FROM auto_sends WHERE recipient = $1 AND sender = $2', [payer.user.id, star.user.id])).rows[0].replied_at !== null, true, 'cevap sayıldı');
      assert.equal((await round()).streamer, 0, 'meşgul yayıncıya yeni başlangıç yok');
      await ok(call('POST', '/api/messages', { to: payer.user.id, text: 'Geldim', ref: rnd(6) }, star.session), 'cevap');
      assert.equal((await round()).streamer, 1);
    } finally {
      await setLive({ auto_daily: null });
    }
  });

  test('erkeğin ücretsiz başlangıcı yalnız uygulaması anlattıktan sonra; ücretsiz, işaretli, elmas getirmez', async () => {
    const man = await person('Onur', 'Erkek');
    const woman = await person('Gül', 'Kadın');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, man.session), 'yükleme');
    assert.equal((await round()).opener, 0, 'anlatılmadan gitmez (eski APK)');
    await ok(call('PATCH', '/api/me/privacy', { autoOpenerSeen: true }, man.session), 'gördüm');
    assert.equal((await round()).opener, 1);
    const m = (await q('SELECT recipient, source, body FROM messages WHERE sender = $1', [man.user.id])).rows;
    assert.equal(m.length, 1);
    assert.equal(m[0].recipient, woman.user.id);
    assert.equal(m[0].source, 'auto_opener');
    const coins = (await q('SELECT coins FROM users WHERE id = $1', [man.user.id])).rows[0].coins;
    assert.equal(Number(coins), 1000, 'ücretsiz');
    assert.equal((await q('SELECT count(*)::int AS n FROM message_holds WHERE payer = $1', [man.user.id])).rows[0].n, 0, 'ödüle uygun değil');
    assert.equal((await ok(call('GET', '/api/auto-chat/me', null, man.session), 'haklarım')).opener.used, 1);
    // He switches it off: no more.
    await ok(call('PATCH', '/api/me/privacy', { autoOpener: false }, man.session), 'kapat');
    await q("UPDATE auto_sends SET created_at = created_at - interval '3 hours' WHERE sender = $1", [man.user.id]);
    await person('Başka Kadın', 'Kadın');
    assert.equal((await round()).opener, 0);
  });
});

describe('Puanlama kuralları', () => {
  const s = { autoNewWeight: 40, autoReplyWeight: 30, autoOnlineWeight: 20, autoStreamerCoef: 50, autoManDaily: 3, autoQuietCut: 50 };
  const none = () => 0;
  test('yeni ve hiç sohbet etmemiş öne geçer; cevap verene öncelik; cevapsıza sınır düşer', () => {
    assert.ok(manScore({ newUser: true, chatted: false, received: 0, replied: 0, online: false }, s, none) > manScore({ newUser: true, chatted: true, received: 0, replied: 0, online: false }, s, none));
    assert.ok(manScore({ newUser: false, received: 10, replied: 9, online: false }, s, none) > manScore({ newUser: false, received: 10, replied: 1, online: false }, s, none));
    assert.equal(manCap({ received: 10, replied: 1 }, s), 1, 'yarıya iner');
    assert.equal(manCap({ received: 2, replied: 0 }, s), 3, 'az mesajda ceza yok');
    assert.equal(manCap({ received: 10, replied: 5 }, s), 3);
  });
  test('yeni yayıncı ortalama sayılır, dışlanmaz; katsayı 0 ise herkes eşit', () => {
    assert.equal(streamerScore({ total: 0, inTime: 0 }, s, none), 0.25);
    assert.equal(streamerScore({ total: 10, inTime: 10 }, s, none), 0.5);
    assert.equal(streamerScore({ total: 10, inTime: 0 }, s, none), 0);
    assert.equal(streamerScore({ total: 10, inTime: 10 }, { ...s, autoStreamerCoef: 0 }, () => 0.3), 0.3);
  });
});
