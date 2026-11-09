// A photo in a chat (messages.mjs, one-on-one.mjs pairOf photo, media.mjs dm) against a real Postgres: with a
// streamer from heart level 3, otherwise between people who follow each other; only one's own chat photo address.
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
const photo = (u) => `${CDN}/dm/${u.user.id}/${rnd(6)}.jpg`;
const send = (s, to, image, text) => call('POST', '/api/messages', { to, image, ...(text !== undefined && { text }), ref: rnd(6) }, s);
const pair = async (s, other) => (await ok(call('GET', `/api/one-on-one?with=${other}`, null, s), 'birebir')).pair;

describe('Mesajda fotoğraf', () => {
  test('karşılıklı takipte gider, yazısız da olur; başkasının adresi olmaz', async () => {
    const a = await signUp('Foto A');
    const b = await signUp('Foto B');
    const up = await ok(call('POST', '/api/media/upload-url', { kind: 'dm', contentType: 'image/jpeg', size: 1000 }, a.session), 'yükleme adresi');
    assert.ok(up.publicUrl.startsWith(`${CDN}/dm/${a.user.id}/`));
    const [st, j] = await send(a.session, b.user.id, photo(a));
    assert.equal(st, 403);
    assert.match(j.error, /karşılıklı takip/);
    assert.equal((await pair(a.session, b.user.id)).photo.open, false);

    await ok(call('POST', '/api/follow', { to: b.user.id }, a.session), 'takip');
    await ok(call('POST', '/api/follow', { to: a.user.id }, b.session), 'takip');
    assert.equal((await pair(a.session, b.user.id)).photo.open, true);
    const url = photo(a);
    const { message } = await ok(send(a.session, b.user.id, url), 'fotoğraf');
    assert.deepEqual([message.image, message.text], [url, 'Fotoğraf']);
    const withText = await ok(send(a.session, b.user.id, photo(a), 'Bak manzaraya'), 'yazılı fotoğraf');
    assert.equal(withText.message.text, 'Bak manzaraya');
    assert.equal((await send(a.session, b.user.id, photo(b)))[0], 400, 'başkasının fotoğrafı');
    assert.equal((await send(a.session, b.user.id, 'https://evil.example.com/x.jpg'))[0], 400, 'depo dışı adres');
    assert.equal((await send(a.session, b.user.id, photo(a), 'ara 0532 123 45 67'))[0], 400, 'yazısı yine süzülür');
    const thread = await ok(call('GET', `/api/messages?with=${a.user.id}`, null, b.session), 'konuşma');
    assert.ok(thread.messages.some((m) => m.image === url));
  });

  test('yayıncıyla kalp seviyesi 3 olunca açılır', async () => {
    const fan = await signUp('Hayran');
    const star = await signUp('Yayıncı');
    const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id", [`F${rnd(3).toUpperCase()}`, `Foto ${rnd(3)}`])).rows;
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [star.user.id, ag.id]);
    const p = await pair(fan.session, star.user.id);
    assert.deepEqual([p.photo.open, p.heart.photoAt], [false, 3]);
    const [st, j] = await send(fan.session, star.user.id, photo(fan), 'Merhaba');
    assert.equal(st, 403);
    assert.match(j.error, /kalp seviyesi 3/);
    // Heart level 3: 5,000 coins spent on each other.
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, place, ref) VALUES ($1, $2, 'g1', 1, 5000, 5000, 'chat', $3)", [fan.user.id, star.user.id, rnd(6)]);
    assert.equal((await pair(fan.session, star.user.id)).photo.open, true);
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, fan.session), 'yükleme');
    const r = await ok(send(fan.session, star.user.id, photo(fan), 'Merhaba'), 'yayıncıya fotoğraf');
    assert.ok(r.message.image);
  });
});
