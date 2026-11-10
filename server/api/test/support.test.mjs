// Destek talepleri (support.mjs) against a real Postgres and a stand-in for the bucket: a ticket with evidence photos,
// its thread with staff, closing and opening again, the open-ticket and daily limits, the staff queue (admins and
// moderators only), the Similar Ekibi notice a staff reply leaves, no contact filter on either side, evidence that
// never leaves the storage while its ticket holds it, and erasure with the account.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
// The bucket: the keys it holds; DELETE and list are all this needs.
const stored = new Set();
const S3_PORT = 19000 + ((process.pid + 450) % 900);
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.searchParams.get('X-Amz-Signature')) return res.writeHead(403).end();
  if (req.method === 'DELETE') {
    stored.delete(decodeURIComponent(u.pathname.replace(/^\/media\//, '')));
    return res.writeHead(204).end();
  }
  if (req.method === 'GET' && u.pathname === '/media' && u.searchParams.get('list-type') === '2') {
    const prefix = u.searchParams.get('prefix') ?? '';
    const keys = [...stored].filter((k) => k.startsWith(prefix));
    return res.writeHead(200, { 'content-type': 'application/xml' }).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  }
  res.writeHead(400).end();
});
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

const h = startApi({ AUTO_MUTE_REFUSALS: '0', SUPPORT_PRUNE_MS: '0', S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`, S3_BUCKET: 'media', S3_KEY: 'testkey', S3_SECRET: 'testsecret', S3_PUBLIC_URL: CDN });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
/** A file in the bucket under kind/<owner>/, and its public address. */
const file = (kind, owner) => {
  const key = `${kind}/${owner}/${rnd(8)}.jpg`;
  stored.add(key);
  return { key, url: `${CDN}/${key}` };
};
const settle = async (gone = []) => {
  for (let i = 0; i < 60 && gone.some((k) => stored.has(k)); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 150));
};
const open = (s, body) => call('POST', '/api/support/tickets', { category: 'Ödeme', text: 'Ödemem bakiyeme yansımadı, yardım eder misiniz?', ref: rnd(6), ...body }, s);
const mine = (s) => ok(call('GET', '/api/support/tickets', null, s), 'taleplerim');
const staffOf = async (name, role) => {
  const a = await signUp(name);
  await q('UPDATE users SET role = $2 WHERE id = $1', [a.user.id, role]);
  return a;
};

describe('Destek talepleri', () => {
  test('talep, kanıt fotoğrafı, yazışma, kapatma ve yeniden açılma', async () => {
    const a = await signUp('Talep A');
    const mod = await staffOf('Destekçi', 'moderator');
    const photo = file('ticket', a.user.id);
    const ref = rnd(6);
    const made = await ok(open(a.session, { photos: [photo.url], ref }), 'talep');
    const t = made.ticket;
    assert.match(t.number, /^TK-\d{5,}$/);
    assert.deepEqual([t.category, t.status, t.photos, t.messages], ['Ödeme', 'open', [photo.url], []]);
    assert.equal((await ok(open(a.session, { photos: [photo.url], ref }), 'tekrar')).replay, true, 'aynı istek bir kez');

    // Staff see it in the queue, read it with the person's name, and answer.
    const queue = await ok(call('GET', '/api/admin/support', null, mod.session), 'kuyruk');
    assert.ok(queue.waiting >= 1);
    const row = queue.tickets.find((x) => x.id === t.id);
    assert.equal(row.user.name, 'Talep A');
    const full = (await ok(call('GET', `/api/admin/support/ticket?id=${t.id}`, null, mod.session), 'oku')).ticket;
    assert.equal(full.text, t.text);
    // Support may need an IBAN or a phone number: no contact filter on either side.
    const iban = 'TR33 0006 1005 1978 6457 8413 26 numaralı hesaba iade yapılacak, telefon 0532 123 45 67';
    const answered = (await ok(call('POST', '/api/admin/support/reply', { id: t.id, text: iban }, mod.session), 'yanıt')).ticket;
    assert.equal(answered.status, 'answered');
    assert.equal(answered.messages[0].by.name, 'Destekçi', 'yetkili kimin yazdığını görür');

    // The person reads it as "Destek", without a name, and is told in Similar Ekibi.
    let my = (await mine(a.session)).tickets.find((x) => x.id === t.id);
    assert.equal(my.status, 'answered');
    assert.deepEqual(my.messages.map((m) => [m.from, m.text]), [['support', iban]]);
    assert.equal(my.messages[0].by, undefined, 'yetkilinin adı gitmez');
    const team = await ok(call('GET', '/api/team', null, a.session), 'ekip');
    const notice = team.notices.find((n) => n.title.includes(t.number));
    assert.ok(notice?.personal, 'kişiye özel duyuru');
    assert.equal(notice.link, '/destek?tab=talepler');
    assert.ok(!notice.body.includes('TR33'), 'duyuru yanıtın metnini taşımaz');

    const back = (await ok(call('POST', '/api/support/reply', { id: t.id, text: 'Hesabım TR33 0006 1005 1978 6457 8413 26, teşekkürler' }, a.session), 'cevap')).ticket;
    assert.equal(back.status, 'reopened');
    assert.equal((await ok(call('POST', '/api/support/close', { id: t.id }, a.session), 'kapat')).ticket.status, 'closed');
    my = (await mine(a.session)).tickets.find((x) => x.id === t.id);
    assert.equal(my.status, 'closed');
    assert.equal((await ok(call('POST', '/api/support/reply', { id: t.id, text: 'Yine oldu' }, a.session), 'yeniden')).ticket.status, 'reopened');

    // Staff close it with a last word; the status can be set back.
    const closed = (await ok(call('POST', '/api/admin/support/reply', { id: t.id, text: 'Çözüldü, iyi günler', close: true }, mod.session), 'kapatarak yanıt')).ticket;
    assert.deepEqual([closed.status, closed.closedBy], ['closed', 'Destekçi']);
    assert.equal((await ok(call('GET', '/api/admin/support?status=closed', null, mod.session), 'kapalılar')).tickets.some((x) => x.id === t.id), true);
    assert.equal((await ok(call('POST', '/api/admin/support/status', { id: t.id, status: 'open' }, mod.session), 'aç')).ticket.status, 'open');
    assert.equal((await call('POST', '/api/admin/support/status', { id: t.id, status: 'reopened' }, mod.session))[0], 400);
  });

  test('girdiler denetlenir; başkasının talebi ve yetkili kuyruğu görünmez', async () => {
    const a = await signUp('Kural A');
    const b = await signUp('Kural B');
    assert.equal((await open(a.session, { category: 'Uydurma' }))[0], 400, 'kategori');
    assert.equal((await open(a.session, { text: 'kısa' }))[0], 400, 'en az 10 karakter');
    assert.equal((await open(a.session, { photos: [file('ticket', b.user.id).url] }))[0], 400, 'başkasının fotoğrafı');
    assert.equal((await open(a.session, { photos: [file('dm', a.user.id).url] }))[0], 400, 'başka türden fotoğraf');
    assert.equal((await open(a.session, { photos: [1, 2, 3, 4].map(() => file('ticket', a.user.id).url) }))[0], 400, 'en fazla 3 fotoğraf');
    const fb = (await ok(open(a.session, { category: 'Teknik', feedback: true, text: 'Karanlık temada yazılar daha büyük olsun' }), 'geri bildirim')).ticket;
    assert.equal(fb.feedback, true);
    assert.equal((await call('POST', '/api/support/reply', { id: fb.id, text: 'Benim değil' }, b.session))[0], 404);
    assert.equal((await call('POST', '/api/support/close', { id: fb.id }, b.session))[0], 404);
    assert.equal((await mine(b.session)).tickets.length, 0);
    assert.equal((await call('GET', '/api/admin/support', null, a.session))[0], 403, 'kullanıcı kuyruğu göremez');
    assert.equal((await call('POST', '/api/admin/support/reply', { id: fb.id, text: 'x' }, a.session))[0], 403);
  });

  test('en fazla 3 açık talep ve günde 5 talep', async () => {
    const a = await signUp('Sınır A');
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push((await ok(open(a.session), `talep ${i + 1}`)).ticket.id);
    let [st, j] = await open(a.session);
    assert.deepEqual([st, j.code], [429, 'tickets_open']);
    assert.equal((await mine(a.session)).open, 3);
    // Closing one makes room; writing on a closed one counts as opening it again.
    await ok(call('POST', '/api/support/close', { id: ids[0] }, a.session), 'kapat');
    const fourth = (await ok(open(a.session), 'dördüncü')).ticket;
    assert.equal((await call('POST', '/api/support/reply', { id: ids[0], text: 'Bir şey daha' }, a.session))[0], 429, 'kapalıyı açmak sınırı aşamaz');
    await ok(call('POST', '/api/support/close', { id: fourth.id }, a.session), 'kapat');
    await ok(call('POST', '/api/support/close', { id: ids[1] }, a.session), 'kapat');
    await ok(open(a.session), 'beşinci');
    [st, j] = await open(a.session);
    assert.deepEqual([st, j.code], [429, 'tickets_day'], 'günde 5');
  });

  test('kanıt fotoğrafı başka yoldan silinmez; hesap silinince talep ve fotoğraf gider', async () => {
    const a = await signUp('Kanıt A');
    const photo = file('ticket', a.user.id);
    const t = (await ok(open(a.session, { photos: [photo.url] }), 'talep')).ticket;
    // The ticket's photo set as the avatar and then replaced: the avatar's clean-up must not take the evidence.
    await ok(call('PATCH', '/api/me', { avatarUrl: photo.url }, a.session), 'avatar');
    await ok(call('PATCH', '/api/me', { avatarUrl: null }, a.session), 'avatar kaldır');
    await settle();
    assert.equal(stored.has(photo.key), true, 'talep varken kanıt kalır');
    await ok(call('POST', '/api/admin/support/reply', { id: t.id, text: 'İnceliyoruz' }, (await staffOf('Yönetici', 'admin')).session), 'yanıt');

    await ok(call('DELETE', '/api/me', null, a.session), 'hesabı sil');
    await settle([photo.key]);
    assert.equal(stored.has(photo.key), false, 'hesapla birlikte gider');
    const left = await q('SELECT (SELECT count(*)::int FROM support_tickets WHERE user_id = $1) AS t, (SELECT count(*)::int FROM support_messages WHERE ticket_id = $2) AS m', [a.user.id, t.id]);
    assert.deepEqual(left.rows[0], { t: 0, m: 0 });
  });

  test('kapanalı bir yılı geçen talep fotoğrafıyla silinir', async () => {
    const a = await signUp('Eski A');
    const photo = file('ticket', a.user.id);
    const t = (await ok(open(a.session, { photos: [photo.url] }), 'talep')).ticket;
    await ok(call('POST', '/api/support/close', { id: t.id }, a.session), 'kapat');
    await q("UPDATE support_tickets SET closed_at = now() - interval '366 days' WHERE id = $1", [t.id]);
    // The clean-up (hourly; on every list here) takes it and its photo.
    await mine(a.session);
    await settle([photo.key]);
    assert.equal((await q('SELECT count(*)::int AS n FROM support_tickets WHERE id = $1', [t.id])).rows[0].n, 0);
    assert.equal(stored.has(photo.key), false);
  });
});
