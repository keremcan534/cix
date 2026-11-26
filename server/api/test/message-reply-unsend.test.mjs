// Mesajlar (owners, 27 Nov 2026; messages.mjs, migration 139) against a real Postgres: a reply quotes a message of the
// same chat; a message is taken back within 2 minutes, never one that carries money; an approved streamer's paid
// photo is locked for the recipient until paid (dm_photo_price coins become her diamonds), gone after 2 minutes.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
const h = startApi({ AUTO_MUTE_REFUSALS: '0', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', S3_BUCKET: 'media', S3_KEY: 'testkey', S3_SECRET: 'testsecret', S3_PUBLIC_URL: CDN });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, what) => {
  const [st, j] = await p;
  assert.equal(st, code, `${what}: ${st} ${j.error}`);
  return j;
};
const send = (s, to, body) => call('POST', '/api/messages', { to, ref: rnd(6), ...body }, s);
const thread = async (s, other) => (await ok(call('GET', `/api/messages?with=${other}`, null, s), 'konuşma')).messages;
const photo = (u) => `${CDN}/dm/${u.user.id}/${rnd(6)}.jpg`;
const coins = async (u) => Number((await q('SELECT coins FROM users WHERE id = $1', [u.user.id])).rows[0].coins);
async function friends(a, b) {
  await q('INSERT INTO follows (follower, followee) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING', [a.user.id, b.user.id]);
}
async function streamer(name) {
  const a = await signUp(name);
  await q("UPDATE users SET gender = 'Kadın' WHERE id = $1", [a.user.id]);
  const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`M${rnd(4).toUpperCase().slice(0, 7)}`, `Mesaj ${rnd(3)}`])).rows;
  await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [a.user.id, ag.id]);
  return a;
}

describe('Yanıtla ve geri al', () => {
  test('yanıt alıntıyı taşır; başka sohbetin mesajı yanıtlanamaz', async () => {
    const [a, b, c] = await Promise.all([signUp('Yanıt A'), signUp('Yanıt B'), signUp('Yanıt C')]);
    await friends(a, b);
    await friends(a, c);
    const first = (await ok(send(b.session, a.user.id, { text: 'Akşam odada mısın?' }), 'ilk')).message;
    const other = (await ok(send(c.session, a.user.id, { text: 'Başka sohbet burası' }), 'başka')).message;
    const reply = (await ok(send(a.session, b.user.id, { text: 'Evet, gel bekliyorum', replyTo: first.id }), 'yanıt')).message;
    assert.deepEqual(reply.replyTo, { id: first.id, from: b.user.id, text: 'Akşam odada mısın?', photo: false });
    assert.deepEqual((await thread(b.session, a.user.id)).find((m) => m.id === reply.id).replyTo.id, first.id);
    await refused(send(a.session, b.user.id, { text: 'Bu olmaz ki', replyTo: other.id }), 400, 'başka sohbetin mesajı');
  });

  test('2 dakika içinde geri alınır, herkes "geri alındı" görür; geç kalan ve başkasının mesajı olmaz', async () => {
    const [a, b] = await Promise.all([signUp('Geri A'), signUp('Geri B')]);
    await friends(a, b);
    const pic = photo(a);
    const m = (await ok(send(a.session, b.user.id, { image: pic, text: 'Bu fotoğrafa bak' }), 'fotoğraf')).message;
    const reply = (await ok(send(b.session, a.user.id, { text: 'Çok güzel olmuş', replyTo: m.id }), 'yanıt')).message;
    await refused(call('POST', '/api/messages/unsend', { id: m.id }, b.session), 404, 'başkasının mesajı');
    const back = (await ok(call('POST', '/api/messages/unsend', { id: m.id }, a.session), 'geri al')).message;
    assert.deepEqual([back.retracted, back.image, back.text], ['unsent', null, 'Bu mesaj geri alındı']);
    const seen = (await thread(b.session, a.user.id)).find((x) => x.id === m.id);
    assert.deepEqual([seen.retracted, seen.image, seen.text], ['unsent', null, 'Bu mesaj geri alındı']);
    // The reply's quote says so too; the stored words stay for moderation.
    assert.equal((await thread(b.session, a.user.id)).find((x) => x.id === reply.id).replyTo.text, 'Bu mesaj geri alındı');
    assert.equal((await q('SELECT body FROM messages WHERE id = $1', [m.id])).rows[0].body, 'Bu fotoğrafa bak');
    await ok(call('POST', '/api/messages/unsend', { id: m.id }, a.session), 'ikinci kez: aynı cevap');
    await refused(send(b.session, a.user.id, { text: 'Geri alınana yanıt', replyTo: m.id }), 400, 'geri alınan yanıtlanmaz');

    const late = (await ok(send(a.session, b.user.id, { text: 'Bu eski bir mesaj' }), 'eski')).message;
    await q("UPDATE messages SET created_at = now() - interval '121 seconds' WHERE id = $1", [late.id]);
    const j = await refused(call('POST', '/api/messages/unsend', { id: late.id }, a.session), 409, 'geç');
    assert.equal(j.code, 'unsend_late');
  });

  test('ücretli mesaj ve ona kazanç getiren cevap geri alınamaz', async () => {
    const fan = await signUp('Ücretli Fan');
    const star = await streamer('Ücretli Yıldız');
    await h.credit(fan.user.id, 1000);
    const paid = (await ok(send(fan.session, star.user.id, { text: 'Merhaba nasılsın' }), 'ücretli mesaj')).message;
    assert.equal((await refused(call('POST', '/api/messages/unsend', { id: paid.id }, fan.session), 409, 'ücretli')).code, 'unsend_paid');
    const answer = await ok(send(star.session, fan.user.id, { text: 'İyiyim sen nasılsın' }), 'cevap');
    assert.ok(answer.reward?.count >= 1, 'cevap kazandırdı');
    assert.equal((await refused(call('POST', '/api/messages/unsend', { id: answer.message.id }, star.session), 409, 'kazandıran cevap')).code, 'unsend_paid');
  });
});

describe('Ücretli fotoğraf', () => {
  test('kilitli gelir; fiyatı görüp açınca ödenir, yayıncı elmas kazanır; ikinci açış ödetmez', async () => {
    const fan = await signUp('Foto Fan');
    const star = await streamer('Foto Yıldız');
    const pic = photo(star);
    const sent = (await ok(send(star.session, fan.user.id, { image: pic, paid: true }), 'ücretli fotoğraf')).message;
    assert.equal(sent.image, pic, 'gönderen kendi fotoğrafını görür');
    assert.equal(sent.paidPhoto.state, 'locked');
    assert.equal(sent.paidPhoto.price, 120);

    const locked = (await thread(fan.session, star.user.id)).find((m) => m.id === sent.id);
    assert.equal(locked.image, null, 'ödemeden adres gelmez');
    assert.deepEqual([locked.paidPhoto.price, locked.paidPhoto.state], [120, 'locked']);
    assert.match(locked.text, /Ücretli fotoğraf \(120 jeton\)/);
    const list = (await ok(call('GET', '/api/conversations', null, fan.session), 'liste')).conversations;
    assert.equal(list.find((c) => c.user.id === star.user.id).last.image, null, 'listede de adres yok');

    assert.equal((await refused(call('POST', '/api/messages/open', { id: sent.id, price: 120 }, fan.session), 409, 'jeton yok')).code, 'insufficient');
    await h.credit(fan.user.id, 500);
    assert.equal((await refused(call('POST', '/api/messages/open', { id: sent.id, price: 100 }, fan.session), 409, 'başka fiyat')).code, 'price_changed');
    await refused(call('POST', '/api/messages/open', { id: sent.id, price: 120 }, star.session), 404, 'gönderen açamaz');
    const open = await ok(call('POST', '/api/messages/open', { id: sent.id, price: 120 }, fan.session), 'aç');
    assert.deepEqual([open.message.image, open.message.paidPhoto.state, open.coins], [pic, 'open', 380]);
    const won = (await q("SELECT amount FROM ledger WHERE user_id = $1 AND currency = 'diamond' AND ref = $2", [star.user.id, `photo:${sent.id}-in`])).rows;
    assert.equal(Number(won[0]?.amount), 120);
    await ok(call('POST', '/api/messages/open', { id: sent.id, price: 120 }, fan.session), 'tekrar');
    assert.equal(await coins(fan), 380, 'ikinci açış ödetmez');
    assert.equal((await refused(call('POST', '/api/messages/unsend', { id: sent.id }, star.session), 409, 'açılmış geri alınmaz')).code, 'unsend_paid');
  });

  test('2 dakikada açılmazsa gider; yalnız yayıncı, ödeme yapana gönderir', async () => {
    const fan = await signUp('Geç Fan');
    const star = await streamer('Geç Yıldız');
    await h.credit(fan.user.id, 500);
    const sent = (await ok(send(star.session, fan.user.id, { image: photo(star), paid: true }), 'ücretli')).message;
    await q("UPDATE messages SET paid_until = now() - interval '1 second' WHERE id = $1", [sent.id]);
    const gone = (await thread(fan.session, star.user.id)).find((m) => m.id === sent.id);
    assert.deepEqual([gone.retracted, gone.paidPhoto.state, gone.image], ['expired', 'expired', null]);
    assert.equal((await refused(call('POST', '/api/messages/open', { id: sent.id, price: 120 }, fan.session), 410, 'süresi dolan')).code, 'photo_expired');
    assert.equal(await coins(fan), 500);
    // The sender sees it gone too.
    assert.equal((await thread(star.session, fan.user.id)).find((m) => m.id === sent.id).paidPhoto.state, 'expired');

    // Not a streamer, or to another streamer: refused.
    const [x, y] = await Promise.all([signUp('Normal X'), signUp('Normal Y')]);
    await friends(x, y);
    await refused(send(x.session, y.user.id, { image: photo(x), paid: true }), 403, 'yayıncı değil');
    const other = await streamer('Başka Yıldız');
    await friends(star, other);
    await refused(send(star.session, other.user.id, { image: photo(star), paid: true }), 403, 'yayıncıya');
    await refused(send(star.session, fan.user.id, { text: 'Yazı ücretli olmaz', paid: true }), 400, 'fotoğrafsız');
  });
});
