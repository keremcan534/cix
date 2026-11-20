// Profil izleri (profile-marks.mjs, docs/PROFIL_IZLERI.md): 💩 Kaka Şakası leaves a mark on its receiver's profile
// photo for Canlı ayarlar › Profil izleri hours (24) or until someone sends 💧 Temizlik Suyu (dearer), whose diamonds go
// to the cleaned person. A second Kaka starts the time again; Su on a clean profile is a plain gift; someone who refuses
// marks (Gizlilik) is never sent a Kaka and nothing moves, and the marks they have stay; staff take a mark off with an
// audit row; a block takes off the blocked person's mark. An older app's catalog has neither gift; a Kaka it sends
// still leaves the mark. The people marked here let everyone mark them (marksFrom everyone; the default, only the
// people they follow, and the rest of Muzip hediyeler are test/muzip.test.mjs).
import { after, describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startApi } from './harness.mjs';

// A fake LiveKit: what the server tells the rooms (SendData packets).
const lkCalls = [];
const LK_PORT = 24000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    lkCalls.push({ method: req.url.split('/').pop(), body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));
const packets = (from, type) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => p.type === type);
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};

const h = startApi({
  LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`,
  CUSTOM_GIFTS_POLL_MS: '200',
  LIVE_POLL_MS: '200',
  // A stand-in storage, for an admin's gift's icon: upload addresses are signed without reaching it (UPLOAD_VERIFY 0).
  S3_ENDPOINT: 'http://127.0.0.1:9',
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: 'https://pub-test.r2.dev',
});
const { call } = h;
const q = async (s, p) => (await h.sql.query(s, p)).rows;
const rnd = () => Math.random().toString(36).slice(2, 12);
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let admin, ali, ayse, can, deniz;
const send = (from, to, giftId, extra = {}) => call('POST', '/api/gifts/send', { to: to.user.id, giftId, count: 1, ref: `m-${giftId}-${rnd()}`, ...extra }, from.session);
const kaka = (from, to, extra) => send(from, to, 'k1', { price: 999, ...extra });
const su = (from, to, extra) => send(from, to, 'k2', { price: 1999, ...extra });
const profile = (viewer, who) => ok(call('GET', `/api/user?id=${who.user.id}`, null, viewer.session), 'profil');
const looks = async (viewer, who) => (await ok(call('GET', `/api/looks?ids=${who.user.id}`, null, viewer.session), 'görünüm')).looks[who.user.id];
const balances = async (...who) => (await q('SELECT id, coins, diamonds FROM users WHERE id = ANY($1::uuid[])', [who.map((w) => w.user.id)])).reduce((m, x) => ({ ...m, [x.id]: [Number(x.coins), Number(x.diamonds)] }), {});
const rows = (who) => q('SELECT * FROM profile_marks WHERE user_id = $1 ORDER BY id', [who.user.id]);
async function setLive(changes) {
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'canlı ayarlar');
  await ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Profil izleri testi', baseV: view.v, confirm: true }, admin.session), 'ayar');
  // The API reads its own saves at once; give the snapshot a moment anyway.
  await sleep(50);
}

describe('Profil izleri', () => {
  before(async () => {
    admin = await h.account('İz Yöneticisi', 'admin');
    ali = await h.signUp('Ali Atan');
    ayse = await h.signUp('Ayşe Alan');
    can = await h.signUp('Can Temizleyen');
    deniz = await h.signUp('Deniz Diğer');
    for (const p of [ali, can, deniz]) await h.credit(p.user.id, 100_000);
    for (const p of [ayse, deniz]) await ok(call('PATCH', '/api/me/privacy', { marksFrom: 'everyone' }, p.session), 'herkes iz bırakabilir');
  });

  test('katalog: eski uygulama Kaka ve Su görmez; yenisi (marks=1) kuralıyla görür', async () => {
    const old = await ok(call('GET', '/api/catalog?gifts=2'), 'eski katalog');
    assert.ok(!old.gifts.some((g) => g.id === 'k1' || g.id === 'k2'), 'eski uygulamada adı, resmi ve fiyatı yok');
    assert.ok(!old.gifts.some((g) => 'mark' in g));
    const fresh = await ok(call('GET', '/api/catalog?gifts=2&marks=1'), 'yeni katalog');
    const k1 = fresh.gifts.find((g) => g.id === 'k1');
    const k2 = fresh.gifts.find((g) => g.id === 'k2');
    assert.deepEqual(k1, { id: 'k1', name: 'Kaka Şakası', emoji: '💩', price: 999, cat: 'gameplay', minSvip: 0, mark: { role: 'leave', kind: 'kaka', hours: 24 } });
    assert.deepEqual(k2, { id: 'k2', name: 'Temizlik Suyu', emoji: '💧', price: 1999, cat: 'gameplay', minSvip: 0, mark: { role: 'clean', kind: 'kaka' } });
    assert.ok(!fresh.gifts.find((g) => g.id === 'g6').mark, 'düz hediyenin kuralı yok');
  });

  test('Kaka iz bırakır: profilde, görünümde; para normal hediye gibi', async () => {
    const before = await balances(ali, ayse);
    const r = await ok(kaka(ali, ayse), 'kaka');
    assert.equal(r.total, 999);
    assert.equal(r.mark.role, 'leave');
    assert.equal(r.mark.kind, 'kaka');
    assert.equal(r.mark.hours, 24);
    assert.equal(r.mark.clean, '💧');
    assert.equal(r.mark.again, false);
    const after = await balances(ali, ayse);
    assert.equal(after[ali.user.id][0], before[ali.user.id][0] - 999);
    assert.equal(after[ayse.user.id][1], before[ayse.user.id][1] + 999, 'alıcıya elması');
    const mine = await profile(ayse, ayse);
    assert.equal(mine.marks.length, 1);
    assert.equal(mine.marks[0].kind, 'kaka');
    assert.equal(mine.marks[0].gift, 'k1');
    assert.equal(mine.marks[0].emoji, '💩');
    assert.deepEqual(mine.marks[0].from, { id: ali.user.id, name: 'Ali Atan' }, 'kendi profilimde kim bıraktı');
    const hours = (Date.parse(mine.marks[0].until) - Date.now()) / 3_600_000;
    assert.ok(hours > 23.9 && hours <= 24, `24 saat (${hours})`);
    const theirs = await profile(deniz, ayse);
    assert.equal(theirs.marks.length, 1);
    assert.ok(!('from' in theirs.marks[0]), 'başkası kimin bıraktığını görmez');
    const look = await looks(deniz, ayse);
    assert.deepEqual(look.marks, theirs.marks, 'odadaki görünüm aynı izi taşır');
    assert.equal(look.noMarks, undefined);
  });

  test('ikinci Kaka süreyi yeniden başlatır, iz birikmez', async () => {
    const first = await rows(ayse);
    await q("UPDATE profile_marks SET expires_at = now() + interval '2 hours' WHERE id = $1", [first[0].id]);
    const r = await ok(kaka(deniz, ayse, { count: 5 }), 'ikinci kaka');
    assert.equal(r.mark.again, true);
    const all = await rows(ayse);
    assert.equal(all.length, 2, 'her Kaka kendi satırı');
    const showing = all.filter((m) => !m.cleared_at && m.expires_at > new Date());
    assert.equal(showing.length, 1, 'tek iz');
    assert.equal(showing[0].from_user, deniz.user.id);
    const mine = await profile(ayse, ayse);
    assert.equal(mine.marks.length, 1);
    assert.ok(Date.parse(mine.marks[0].until) - Date.now() > 23.9 * 3_600_000, 'süre yeniden 24 saat');
    assert.equal(mine.marks[0].from.id, deniz.user.id);
  });

  test('Su izi temizler, elması temizlenene; temiz profile Su düz hediye', async () => {
    const before = await balances(can, ayse);
    const r = await ok(su(can, ayse), 'su');
    assert.deepEqual(r.mark, { role: 'clean', kind: 'kaka', gift: 'k2', emoji: '💧' });
    const after = await balances(can, ayse);
    assert.equal(after[can.user.id][0], before[can.user.id][0] - 1999);
    assert.equal(after[ayse.user.id][1], before[ayse.user.id][1] + 1999, 'temizlenen kişiye elması');
    assert.deepEqual((await profile(ayse, ayse)).marks, []);
    assert.deepEqual((await looks(deniz, ayse)).marks, []);
    const cleaned = (await rows(ayse)).find((m) => m.cleared_at);
    assert.equal(cleaned.cleared_how, 'gift');
    assert.equal(cleaned.cleared_by, can.user.id);
    assert.ok(cleaned.clear_event_id);
    const plain = await ok(su(can, ayse), 'temiz profile su');
    assert.equal(plain.mark, undefined, 'düz hediye');
    assert.equal(plain.total, 1999);
  });

  test('aynı anda iki Su: biri temizler, öteki düz hediye', async () => {
    await ok(kaka(ali, ayse), 'kaka');
    const [a, b] = await Promise.all([su(can, ayse), su(deniz, ayse)]);
    assert.equal(a[0], 200, a[1].error);
    assert.equal(b[0], 200, b[1].error);
    const marks = [a[1].mark, b[1].mark].filter(Boolean);
    assert.equal(marks.length, 1, 'yalnız biri temizler');
    assert.equal(marks[0].role, 'clean');
    assert.equal((await rows(ayse)).filter((m) => m.cleared_how === 'gift').length, 2, 'iki temizlik toplamda (önceki ve bu)');
  });

  test('tekrarlanan istek: tek iz, tek ücret; süre dolan iz görünmez', async () => {
    const ref = `m-again-${rnd()}`;
    const before = await balances(ali);
    const one = await ok(kaka(ali, ayse, { ref }), 'kaka');
    const two = await ok(kaka(ali, ayse, { ref }), 'aynı istek');
    assert.equal(one.replay, false);
    assert.equal(two.replay, true);
    // The retry answers the mark that request left (a phone whose first answer was lost draws it), writing none.
    assert.deepEqual(two.mark, { ...one.mark, again: false }, 'tekrar aynı izi söyler');
    assert.equal((await balances(ali))[ali.user.id][0], before[ali.user.id][0] - 999);
    assert.equal((await q('SELECT count(*)::int AS n FROM profile_marks WHERE gift_event_id = (SELECT id FROM gift_events WHERE sender = $1 AND ref = $2)', [ali.user.id, ref]))[0].n, 1);
    // 24 hours later: gone, and Su is a plain gift.
    await q("UPDATE profile_marks SET expires_at = now() - interval '1 minute', created_at = now() - interval '25 hours' WHERE user_id = $1 AND cleared_at IS NULL", [ayse.user.id]);
    assert.deepEqual((await profile(ayse, ayse)).marks, []);
    assert.deepEqual((await looks(deniz, ayse)).marks, []);
    assert.equal((await ok(su(can, ayse), 'süresi dolmuşa su')).mark, undefined);
  });

  test('"Profilime iz bırakılmasın": yeni Kaka para oynamadan reddedilir, mevcut iz kalır; Su temizler; tekrar açılır', async () => {
    await ok(kaka(ali, ayse), 'kaka');
    const ref = `m-before-off-${rnd()}`;
    await ok(kaka(deniz, ayse, { ref }), 'kapatmadan önce');
    const p = await ok(call('PATCH', '/api/me/privacy', { profileMarks: false }, ayse.session), 'gizlilik');
    assert.equal(p.privacy.profileMarks, false);
    assert.equal(p.privacy.marksFrom, 'nobody', 'eski anahtar: kimse');
    // The owners' decision (20 Nov 2026): the switch blocks new marks, the one showing stays.
    assert.equal((await profile(ayse, ayse)).marks.length, 1, 'kapatınca mevcut iz kalır');
    assert.equal((await rows(ayse)).filter((m) => m.cleared_how === 'self').length, 0);
    assert.equal((await looks(deniz, ayse)).noMarks, true, 'odadakiler bilir');
    const before = await balances(ali, ayse);
    const events = (await q('SELECT count(*)::int AS n FROM gift_events'))[0].n;
    const [st, j] = await kaka(ali, ayse);
    assert.equal(st, 403);
    assert.equal(j.code, 'marks_off');
    assert.match(j.error, /^Ayşe Alan, profiline iz bırakılmasını kapattı\. Kaka Şakası ona gönderilemez/);
    assert.deepEqual(await balances(ali, ayse), before, 'hiçbir şey oynamadı');
    assert.equal((await q('SELECT count(*)::int AS n FROM gift_events'))[0].n, events, 'hediye kaydı yok');
    // A retry of a Kaka that went through before: its replay, not the refusal.
    const again = await ok(kaka(deniz, ayse, { ref }), 'önceki isteğin tekrarı');
    assert.equal(again.replay, true);
    assert.equal((await ok(su(can, ayse), 'su')).mark?.role, 'clean', 'Su kalan izi temizler');
    assert.equal((await ok(su(can, ayse), 'su')).mark, undefined, 'temiz profile Su düz hediye');
    // On again from an app that has only the switch: back to the choice before (everyone here).
    const on = await ok(call('PATCH', '/api/me/privacy', { profileMarks: true }, ayse.session), 'yeniden aç');
    assert.equal(on.privacy.marksFrom, 'following', 'kapatınca seçim gitti: yeniden açınca varsayılan');
    await ok(call('PATCH', '/api/me/privacy', { marksFrom: 'everyone' }, ayse.session), 'herkes');
    assert.equal((await ok(kaka(ali, ayse), 'açınca kaka')).mark.role, 'leave');
  });

  test('engellenen kişinin bıraktığı iz gider', async () => {
    await ok(kaka(deniz, ayse), 'kaka');
    assert.equal((await profile(ayse, ayse)).marks.length, 1);
    await ok(call('POST', '/api/block', { to: deniz.user.id }, ayse.session), 'engelle');
    assert.deepEqual((await profile(ayse, ayse)).marks, []);
    assert.equal((await rows(ayse)).at(-1).cleared_how, 'block');
    await ok(call('POST', '/api/block', { to: deniz.user.id, block: false }, ayse.session), 'engeli kaldır');
  });

  test('yönetici izi kaldırır: denetim kaydıyla; yönetici olmayan kaldıramaz', async () => {
    await ok(kaka(ali, ayse), 'kaka');
    const [st] = await call('POST', '/api/admin/marks/clear', { user: ayse.user.id }, ali.session);
    assert.equal(st, 403);
    const list = await ok(call('GET', `/api/admin/marks?user=${ayse.user.id}`, null, admin.session), 'liste');
    assert.equal(list.marks[0].showing, true);
    assert.deepEqual(list.marks[0].from, { id: ali.user.id, name: 'Ali Atan' });
    assert.equal(list.on, true);
    assert.equal((await call('POST', '/api/admin/marks/clear', { user: ayse.user.id, kind: 'KAKA!' }, admin.session))[0], 400);
    const r = await ok(call('POST', '/api/admin/marks/clear', { user: ayse.user.id, kind: 'kaka', reason: 'Şikâyet' }, admin.session), 'kaldır');
    assert.equal(r.cleared, 1);
    assert.deepEqual((await profile(ayse, ayse)).marks, []);
    const audit = (await q("SELECT actor, target, detail FROM audit_events WHERE action = 'marks.clear' ORDER BY id DESC LIMIT 1"))[0];
    assert.equal(audit.actor, admin.user.id);
    assert.equal(audit.target, ayse.user.id);
    assert.equal(audit.detail.reason, 'Şikâyet');
    assert.equal(audit.detail.before.length, 1);
    assert.equal(audit.detail.before[0].from, ali.user.id);
    assert.deepEqual(audit.detail.after, []);
    const row = (await rows(ayse)).at(-1);
    assert.deepEqual([row.cleared_how, row.cleared_by], ['admin', admin.user.id]);
    assert.equal((await ok(call('POST', '/api/admin/marks/clear', { user: ayse.user.id }, admin.session), 'boşken')).cleared, 0);
  });

  test('eski uygulama (fiyatsız) Kaka gönderirse de iz kalır', async () => {
    const r = await ok(send(ali, ayse, 'k1'), 'eski uygulama');
    assert.equal(r.mark.role, 'leave');
    await ok(su(can, ayse), 'temizle');
  });

  test('panel: Su, Kaka’dan pahalı olmalı (iki yönde); hediyenin kendi süresi; kapatılabilir', async () => {
    const update = (body) => call('POST', '/api/admin/gifts/update', body, admin.session);
    const [s1, j1] = await update({ id: 'k2', price: 999 });
    assert.equal(s1, 400);
    assert.match(j1.error, /^Temizlik Suyu izi temizlediği için onu bırakan hediyelerden pahalı olmalı: Kaka Şakası 999 jeton, bu 999 jeton\.$/);
    const [s2, j2] = await update({ id: 'k1', price: 2500 });
    assert.equal(s2, 400);
    assert.match(j2.error, /^Kaka Şakası iz bıraktığı için onu temizleyen hediyelerden ucuz olmalı: Temizlik Suyu 1\.999 jeton, bu 2\.500 jeton\.$/);
    // An admin's gift that cleans the same kind must also cost more than Kaka; one that leaves it, less than Su.
    const up = await ok(call('POST', '/api/media/upload-url', { kind: 'gifticon', contentType: 'image/png', size: 1000 }, admin.session), 'ikon adresi');
    const make = (body) => call('POST', '/api/admin/gifts', { cat: 'gameplay', icon: up.publicUrl, ...body }, admin.session);
    const [s3, j3] = await make({ name: 'Sabun', price: 500, mark: { role: 'clean', kind: 'kaka' } });
    assert.equal(s3, 400, 'ucuz temizleyici');
    assert.equal(j3.error, 'Sabun izi temizlediği için onu bırakan hediyelerden pahalı olmalı: Kaka Şakası 999 jeton, bu 500 jeton.');
    assert.equal((await make({ name: 'Çamur', price: 1999, mark: { role: 'leave', kind: 'kaka' } }))[0], 400, 'Su kadar pahalı bırakan');
    // A kind is one of İz türleri (mark-kinds.mjs): a word nobody made is refused.
    const [s0, j0] = await make({ name: 'Çamur', price: 300, mark: { role: 'leave', kind: 'camur', hours: 6 } });
    assert.equal(s0, 400);
    assert.match(j0.error, /^"camur" diye bir iz türü yok/);
    await ok(call('POST', '/api/admin/mark-kinds', { kind: 'camur', name: 'Çamur' }, admin.session), 'tür');
    const mud = await ok(make({ name: 'Çamur', price: 300, mark: { role: 'leave', kind: 'camur', hours: 6 } }), 'başka bir iz');
    assert.deepEqual(mud.gift.mark, { role: 'leave', kind: 'camur', hours: 6, minutes: 360 });
    assert.equal((await make({ name: 'Hortum', price: 300, mark: { role: 'clean', kind: 'camur' } }))[0], 400, 'çamurdan pahalı olmalı');
    const hose = await ok(make({ name: 'Hortum', price: 301, mark: { role: 'clean', kind: 'camur' } }), 'çamuru temizleyen');
    assert.equal((await update({ id: mud.gift.id, price: 301 }))[0], 400, 'bırakan temizleyen kadar olamaz');
    assert.deepEqual((await ok(update({ id: hose.gift.id, mark: null }), 'kural kalkar')).gift.mark, null);
    assert.equal((await ok(update({ id: mud.gift.id, price: 5000 }), 'temizleyen yokken serbest')).gift.price, 5000);
    for (const id of [mud.gift.id, hose.gift.id]) await ok(call('POST', '/api/admin/gifts/delete', { id }, admin.session), 'sil');
    const g = await ok(update({ id: 'k1', price: 1500, mark: { role: 'leave', kind: 'kaka', hours: 2 } }), 'kaka 1.500, 2 saat');
    assert.deepEqual(g.gift.mark, { role: 'leave', kind: 'kaka', hours: 2, minutes: 120 });
    assert.deepEqual(g.gift.changed.sort(), ['mark', 'price']);
    assert.equal((await call('POST', '/api/admin/gifts/update', { id: 'k1', mark: { role: 'leave', kind: 'kaka', hours: 500 } }, admin.session))[0], 400);
    assert.equal((await call('POST', '/api/admin/gifts/update', { id: 'k2', mark: { role: 'clean', kind: 'kaka', hours: 3 } }, admin.session))[0], 400, 'temizleyenin süresi olmaz');
    await sleep(300);
    const r = await ok(send(ali, ayse, 'k1', { price: 1500 }), 'yeni fiyatla');
    assert.equal(r.mark.hours, 2);
    const until = (await profile(ayse, ayse)).marks[0].until;
    assert.ok(Date.parse(until) - Date.now() <= 2 * 3_600_000 + 1000);
    // The older app shows 999: a moved price asks it to update, as for every re-priced gift.
    const [os, oj] = await send(ali, ayse, 'k1');
    assert.equal(os, 409);
    assert.equal(oj.code, 'update_required');
    const back = await ok(call('POST', '/api/admin/gifts/reset', { id: 'k1' }, admin.session), 'geri al');
    assert.deepEqual(back.gift.mark, { role: 'leave', kind: 'kaka', hours: null, minutes: null });
    assert.deepEqual(back.gift.changed, []);
    const audit = (await q("SELECT detail FROM audit_events WHERE action = 'gift.update' AND detail->>'gift' = 'k1' ORDER BY id DESC LIMIT 1"))[0];
    assert.deepEqual(audit.detail.after.mark, { role: 'leave', kind: 'kaka', hours: 2, minutes: 120 });
    // Kaka made a plain gift: no mark.
    await ok(update({ id: 'k1', mark: null }), 'düz hediye');
    await sleep(300);
    await ok(su(can, ayse), 'temizle');
    assert.equal((await ok(kaka(ali, ayse), 'düz kaka')).mark, undefined);
    await ok(call('POST', '/api/admin/gifts/reset', { id: 'k1', fields: ['mark'] }, admin.session), 'kural geri');
    await sleep(300);
  });

  test('Canlı ayar 0: profil izleri kapalı, hediyeler düz; açınca izler yeniden görünür', async () => {
    assert.equal((await ok(kaka(ali, ayse), 'kaka')).mark.role, 'leave');
    await setLive({ mark_hours: 0 });
    assert.deepEqual((await profile(ayse, ayse)).marks, []);
    assert.deepEqual((await looks(deniz, ayse)).marks, []);
    assert.equal((await ok(su(can, ayse), 'kapalıyken su')).mark, undefined);
    const cat = await ok(call('GET', '/api/catalog?gifts=2&marks=1'), 'katalog');
    assert.equal(cat.gifts.find((g) => g.id === 'k1').mark, undefined);
    await setLive({ mark_hours: null });
    assert.equal((await profile(ayse, ayse)).marks.length, 1, 'süresi dolmayan iz geri gelir');
    await ok(su(can, ayse), 'temizle');
  });

  test('verilerimin kopyası: bırakılan ve aldığım izler', async () => {
    const mine = await ok(call('GET', '/api/me/export', null, ayse.session), 'kopya');
    assert.ok(mine.profileMarks.received.length >= 5);
    const first = mine.profileMarks.received[0];
    assert.deepEqual(first.from, { id: ali.user.id, name: 'Ali Atan' });
    assert.equal(first.gift, 'Kaka Şakası');
    assert.deepEqual(mine.profileMarks.left, []);
    assert.equal(mine.privacy.settings.marks_from, 'everyone', 'kimlerin iz bırakabileceği kopyada');
    const theirs = await ok(call('GET', '/api/me/export', null, ali.session), 'kopya');
    assert.ok(theirs.profileMarks.left.length >= 3);
    assert.deepEqual(theirs.profileMarks.left[0].on, { id: ayse.user.id, name: 'Ayşe Alan' });
  });

  test('odada: hediye paketi izi taşır; odanın dışından bırakılan iz odadaki yüzüne görünüm olarak gider', async () => {
    const roomId = crypto.randomUUID();
    const room = `oda-${roomId}`;
    let from = lkCalls.length;
    const r = await ok(kaka(ali, ayse, { room: roomId }), 'odada kaka');
    assert.ok(await until(() => packets(from, 'gift').length > 0), 'hediye paketi');
    const [gift] = packets(from, 'gift');
    assert.equal(gift.room, room);
    assert.deepEqual(gift.mark, r.mark);
    assert.equal(gift.mark.role, 'leave');
    assert.equal(packets(from, 'look').length, 0, 'odadaki hediye görünüm paketi göndermez');
    from = lkCalls.length;
    await ok(su(can, ayse, { room: roomId }), 'odada su');
    assert.ok(await until(() => packets(from, 'gift').length > 0), 'su paketi');
    assert.deepEqual(packets(from, 'gift')[0].mark, { role: 'clean', kind: 'kaka', gift: 'k2', emoji: '💧' });
    // Ayşe sits in a room; a Kaka from her profile reaches that room as her look.
    await q("INSERT INTO room_presence (room, identity, sid) VALUES ($1, $2, 'PA_marks')", [room, ayse.user.id]);
    from = lkCalls.length;
    await ok(kaka(ali, ayse, { place: 'profile' }), 'profilden kaka');
    assert.ok(await until(() => packets(from, 'look').length > 0), 'görünüm paketi');
    const look = packets(from, 'look')[0];
    assert.equal(look.user, ayse.user.id);
    assert.equal(look.look.marks.length, 1);
    // Staff take it off: the room hears that too.
    from = lkCalls.length;
    await ok(call('POST', '/api/admin/marks/clear', { user: ayse.user.id }, admin.session), 'kaldır');
    assert.ok(await until(() => packets(from, 'look').length > 0), 'kaldırınca görünüm paketi');
    assert.deepEqual(packets(from, 'look')[0].look.marks, []);
    await q('DELETE FROM room_presence WHERE identity = $1', [ayse.user.id]);
  });

  test('hesap silinince üzerindeki izler gider, bıraktıkları adsız kalır', async () => {
    const gone = await h.signUp('Gidecek');
    await h.credit(gone.user.id, 5_000);
    await ok(call('PATCH', '/api/me/privacy', { marksFrom: 'everyone' }, gone.session), 'herkes');
    await ok(kaka(gone, deniz), 'kaka');
    await ok(kaka(ali, gone), 'kaka');
    await ok(call('DELETE', '/api/me', null, gone.session), 'sil');
    assert.equal((await rows(gone)).length, 0);
    const left = await rows(deniz);
    assert.equal(left.at(-1).from_user, null);
  });
});
