// Anlar on the server (moments.mjs): posting, the feed tabs, likes, comments, blocks, removal by the writer and
// by staff from a report, mutes, and account deletion.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.test';
const h = startApi({ S3_PUBLIC_URL: CDN, AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('Anlar', () => {
  test('uygulamadaki konu listesi sunucudakiyle aynı', () => {
    const app = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'app', 'src', 'data', 'social-ui.ts'), 'utf8');
    const block = /export const MOMENT_TOPICS[^=]*= \[([\s\S]*?)\n\];/.exec(app)[1];
    const ids = [...block.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
    const server = fs.readFileSync(path.join(import.meta.dirname, '..', 'moments.mjs'), 'utf8');
    assert.deepEqual(JSON.parse(/export const TOPICS = (\[[^\]]+\])/.exec(server)[1].replace(/'/g, '"')), ids);
  });

  test('paylaşım, akış sekmeleri, beğeni ve yorum', async () => {
    const a = await signUp('Yazan');
    const b = await signUp('Okuyan');
    const c = await signUp('Yabancı');

    assert.equal((await call('POST', '/api/moments', { text: '', ref: rnd(10) }, a.session))[0], 400, 'boş an');
    assert.equal((await call('POST', '/api/moments', { text: 'merhaba', topic: 'yok', ref: rnd(10) }, a.session))[0], 400, 'bilinmeyen konu');
    assert.equal((await call('POST', '/api/moments', { text: 'x', imageUrl: 'https://kotu.example/a.jpg', ref: rnd(10) }, a.session))[0], 400, 'başka yerden fotoğraf');
    assert.equal((await call('POST', '/api/moments', { text: 'x', imageUrl: `${CDN}/moment/${b.user.id}/a.jpg`, ref: rnd(10) }, a.session))[0], 400, 'başkasının fotoğrafı');
    const [refused] = await call('POST', '/api/moments', { text: 'beni ara 0532 123 45 67', ref: rnd(10) }, a.session);
    assert.notEqual(refused, 200, 'telefon numarası yazılamaz');

    const ref = rnd(10);
    const first = await ok(call('POST', '/api/moments', { text: 'İlk anım', topic: 'music', ref }, a.session), 'paylaş');
    assert.equal(first.moment.text, 'İlk anım');
    assert.equal(first.moment.author.name, 'Yazan');
    assert.equal(first.moment.likes, 0);
    assert.equal(first.replay, false);
    const again = await ok(call('POST', '/api/moments', { text: 'İlk anım', topic: 'music', ref }, a.session), 'tekrar');
    assert.equal(again.moment.id, first.moment.id, 'aynı istek iki kez kaydedilmez');
    assert.equal(again.replay, true);
    const photo = await ok(call('POST', '/api/moments', { text: '', imageUrl: `${CDN}/moment/${a.user.id}/x1.jpg`, ref: rnd(10) }, a.session), 'fotoğraflı');
    assert.equal(photo.moment.imageUrl, `${CDN}/moment/${a.user.id}/x1.jpg`);
    const id = first.moment.id;

    let feed = (await ok(call('GET', '/api/moments?tab=recent', null, b.session))).moments;
    assert.deepEqual(feed.map((m) => m.id), [photo.moment.id, id], 'en yenisi üstte');
    assert.deepEqual((await ok(call('GET', '/api/moments?tab=recent&topic=music', null, b.session))).moments.map((m) => m.id), [id]);
    assert.deepEqual((await ok(call('GET', `/api/moments?user=${a.user.id}`, null, c.session))).moments.length, 2, 'profildeki anlar');
    assert.equal((await ok(call('GET', '/api/moments?tab=friends', null, b.session))).moments.length, 0, 'takip etmeden Arkadaşlar boş');
    await ok(call('POST', '/api/follow', { to: a.user.id, follow: true }, b.session), 'takip');
    assert.equal((await ok(call('GET', '/api/moments?tab=friends', null, b.session))).moments.length, 2);

    let like = await ok(call('POST', '/api/moments/like', { id, like: true }, b.session), 'beğen');
    assert.deepEqual(like, { liked: true, likes: 1 });
    like = await ok(call('POST', '/api/moments/like', { id, like: true }, b.session), 'yine beğen');
    assert.equal(like.likes, 1, 'bir kişi bir kez');
    await ok(call('POST', '/api/moments/like', { id, like: true }, c.session), 'üçüncü kişi');
    feed = (await ok(call('GET', '/api/moments?tab=popular', null, b.session))).moments;
    assert.equal(feed[0].id, id, 'beğenilen Önerilen\'de üstte');
    assert.equal(feed[0].likes, 2);
    assert.equal(feed[0].liked, true);
    assert.equal((await ok(call('POST', '/api/moments/like', { id, like: false }, c.session))).likes, 1);

    assert.equal((await call('POST', '/api/moments/comment', { id, text: 'insta: ayse.05321234567', ref: rnd(10) }, b.session))[0] === 200, false, 'yorumda iletişim bilgisi yok');
    const cm = await ok(call('POST', '/api/moments/comment', { id, text: 'Çok güzel!', ref: rnd(10) }, b.session), 'yorum');
    assert.equal(cm.comment.text, 'Çok güzel!');
    assert.equal(cm.comments.length, 1);
    await ok(call('POST', '/api/moments/comment', { id, text: 'Katılıyorum', ref: rnd(10) }, c.session), 'yorum 2');
    const list = (await ok(call('GET', `/api/moments/comments?id=${id}`, null, a.session))).comments;
    assert.deepEqual(list.map((x) => x.text), ['Çok güzel!', 'Katılıyorum'], 'eskisi üstte');
    assert.equal((await ok(call('GET', '/api/moments?tab=recent', null, a.session))).moments.find((m) => m.id === id).comments, 2);

    assert.equal((await call('POST', '/api/moments/comment/delete', { id: list[1].id }, b.session))[0], 403, 'başkasının yorumu');
    await ok(call('POST', '/api/moments/comment/delete', { id: list[1].id }, a.session), 'an sahibi yorumu siler');
    assert.equal((await ok(call('GET', `/api/moments/comments?id=${id}`, null, a.session))).comments.length, 1);

    assert.equal((await call('POST', '/api/moments/delete', { id }, b.session))[0], 403, 'başkasının anı');
    await ok(call('POST', '/api/moments/delete', { id: photo.moment.id }, a.session), 'kendi anını siler');
    assert.deepEqual((await ok(call('GET', '/api/moments?tab=recent', null, b.session))).moments.map((m) => m.id), [id]);
    assert.equal((await call('POST', '/api/moments/like', { id: photo.moment.id, like: true }, b.session))[0], 404, 'silinen an beğenilmez');
  });

  test('engellenen kişinin anları ve yorumları görünmez', async () => {
    const a = await signUp('Engelleyen');
    const z = await signUp('Engellenen');
    const p = await ok(call('POST', '/api/moments', { text: 'Benim anım', ref: rnd(10) }, a.session));
    const q = await ok(call('POST', '/api/moments', { text: 'Onun anı', ref: rnd(10) }, z.session));
    await ok(call('POST', '/api/moments/comment', { id: p.moment.id, text: 'Selam', ref: rnd(10) }, z.session));
    await ok(call('POST', '/api/block', { to: z.user.id, block: true }, a.session), 'engelle');
    const mine = (await ok(call('GET', '/api/moments?tab=recent', null, a.session))).moments.map((m) => m.id);
    assert.ok(mine.includes(p.moment.id));
    assert.ok(!mine.includes(q.moment.id), 'engellediğimin anı yok');
    assert.equal((await ok(call('GET', `/api/moments/comments?id=${p.moment.id}`, null, a.session))).comments.length, 0, 'engellediğimin yorumu yok');
    assert.ok(!(await ok(call('GET', '/api/moments?tab=recent', null, z.session))).moments.some((m) => m.id === p.moment.id), 'engelleyenin anı da görünmez');
    assert.equal((await call('POST', '/api/moments/comment', { id: p.moment.id, text: 'Yine ben', ref: rnd(10) }, z.session))[0], 404);
    assert.equal((await call('GET', `/api/moments?user=${a.user.id}`, null, z.session))[0], 403);
  });

  test('şikâyet edilen an yönetimde görünür ve kaldırılır; susturulan paylaşamaz; hesap silinince anlar gider', async () => {
    const a = await signUp('Şikâyet Edilen');
    const r = await signUp('Şikâyet Eden');
    const mod = await signUp('Moderatör');
    await h.sql.query("UPDATE users SET role = 'moderator' WHERE id = $1", [mod.user.id]);
    const p = await ok(call('POST', '/api/moments', { text: 'Kötü bir an', ref: rnd(10) }, a.session));
    const cm = await ok(call('POST', '/api/moments/comment', { id: p.moment.id, text: 'Kötü yorum', ref: rnd(10) }, a.session));

    await ok(call('POST', '/api/report', { type: 'moment', id: p.moment.id, reason: 'Hakaret' }, r.session), 'an şikâyeti');
    await ok(call('POST', '/api/report', { type: 'comment', id: cm.comment.id, reason: 'Hakaret' }, r.session), 'yorum şikâyeti');
    const open = (await ok(call('GET', '/api/admin/reports?status=open', null, mod.session))).reports;
    const rp = open.find((x) => x.target.type === 'moment' && x.target.id === p.moment.id);
    const rc = open.find((x) => x.target.type === 'comment' && x.target.id === cm.comment.id);
    assert.deepEqual(rp.target.content, { text: 'Kötü bir an', imageUrl: null, removed: false, author: { id: a.user.id, name: 'Şikâyet Edilen' } });
    assert.equal(rc.target.content.text, 'Kötü yorum');

    const userReport = (await ok(call('POST', '/api/report', { type: 'user', id: a.user.id, reason: 'Hakaret' }, r.session)));
    assert.ok(userReport.reported);
    const ru = (await ok(call('GET', '/api/admin/reports?status=open', null, mod.session))).reports.find((x) => x.target.type === 'user' && x.target.id === a.user.id);
    assert.equal((await call('POST', '/api/admin/reports/handle', { id: ru.id, status: 'actioned', remove: true }, mod.session))[0], 400, 'kişi şikâyetinde kaldırma yok');

    await ok(call('POST', '/api/admin/reports/handle', { id: rp.id, status: 'actioned', remove: true }, mod.session), 'anı kaldır');
    await ok(call('POST', '/api/admin/reports/handle', { id: rc.id, status: 'actioned', remove: true }, mod.session), 'yorumu kaldır');
    assert.ok(!(await ok(call('GET', '/api/moments?tab=recent', null, r.session))).moments.some((m) => m.id === p.moment.id), 'kaldırılan an akışta yok');
    const done = (await ok(call('GET', '/api/admin/reports?status=actioned', null, mod.session))).reports.find((x) => x.id === rp.id);
    assert.equal(done.target.content.removed, true, 'kayıt için duruyor');

    // A text mute covers Anlar.
    await ok(call('POST', '/api/admin/sanctions', { user: a.user.id, type: 'mute_global_text', reason: 'spam', minutes: 30, note: 'Anlar' }, mod.session), 'sustur');
    const [st, j] = await call('POST', '/api/moments', { text: 'Susturulmuşken', ref: rnd(10) }, a.session);
    assert.equal(st, 403);
    assert.equal(j.code, 'muted');
    const other = await ok(call('POST', '/api/moments', { text: 'Başkasının anı', ref: rnd(10) }, r.session));
    assert.equal((await call('POST', '/api/moments/comment', { id: other.moment.id, text: 'Yorum', ref: rnd(10) }, a.session))[0], 403);
    await ok(call('POST', '/api/moments/like', { id: other.moment.id, like: true }, a.session), 'beğeni susturmaya takılmaz');

    // Deleting the account removes their posts, likes and comments.
    await ok(call('POST', '/api/moments/comment', { id: other.moment.id, text: 'Silinecek yorum', ref: rnd(10) }, mod.session));
    await ok(call('DELETE', '/api/me', null, mod.session), 'hesabı sil');
    assert.equal((await ok(call('GET', `/api/moments/comments?id=${other.moment.id}`, null, r.session))).comments.length, 0);
    const n = await h.sql.query('SELECT (SELECT count(*) FROM moments WHERE author = $1)::int + (SELECT count(*) FROM moment_comments WHERE author = $1)::int AS n', [mod.user.id]);
    assert.equal(n.rows[0].n, 0);
  });
});
