// Oda Süslemesi and Oda Kapağı (room-decor.mjs) against a real Postgres, a stand-in bucket and a fake LiveKit: the
// free backgrounds with their level locks, a paid background bought for a term, the owner's own picture for 5.000
// jeton and 30 days (charged once, replaced for free, removed, ended, taken down by staff), the room's card picture,
// and what happens to the files: a replaced, removed or ended picture leaves the storage, one in use stays, and
// everything goes with the account.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { ROOM_BGS } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const CDN = 'https://cdn.example.com';
// The bucket: the keys it holds, with their size and type.
const stored = new Map();
const S3_PORT = 25000 + (process.pid % 900);
const bucket = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const key = decodeURIComponent(u.pathname.replace(/^\/media\/?/, ''));
  if (!u.searchParams.get('X-Amz-Signature')) return res.writeHead(403).end();
  if (req.method === 'DELETE') return void (stored.delete(key), res.writeHead(204).end());
  if (req.method === 'HEAD') {
    const f = stored.get(key);
    return f ? res.writeHead(200, { 'content-length': String(f.size), 'content-type': f.type }).end() : res.writeHead(404).end();
  }
  if (req.method === 'GET' && u.searchParams.get('list-type') === '2') {
    const keys = [...stored.keys()].filter((k) => k.startsWith(u.searchParams.get('prefix') ?? ''));
    return res.writeHead(200, { 'content-type': 'application/xml' }).end(`<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`);
  }
  res.writeHead(400).end();
});
bucket.listen(S3_PORT, '127.0.0.1');
after(() => bucket.close());

// LiveKit: what the server told the rooms.
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

const h = startApi({
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_BUCKET: 'media',
  S3_KEY: 'testkey',
  S3_SECRET: 'testsecret',
  S3_PUBLIC_URL: CDN,
  UPLOAD_VERIFY: '1',
  LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`,
  // The paid backgrounds' pictures aren't in the app yet: this server sells them anyway.
  ROOM_BG_PREVIEW: '1',
  ROOM_DECOR_SWEEP_MS: '300',
});
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const coins = async (u) => (await call('GET', '/api/me', null, u.session))[1].user.coins;
const topUp = (u, amount = 10_000) => ok(call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, u.session), 'yükleme');
const openRoom = async (owner) => (await ok(call('POST', '/api/rooms', { title: `Süs ${rnd(2)}` }, owner.session), 'oda')).room.id;
const roomOf = async (id, who) => (await ok(call('GET', `/api/room?id=${id}`, null, who.session), 'oda')).room;
const decorOf = async (id, who) => (await ok(call('GET', `/api/rooms/decor?room=${id}`, null, who.session), 'süsleme')).decor;
/** A file in the bucket under kind/<owner>/, and its public address. */
const file = (kind, owner, meta = { size: 1000, type: 'image/jpeg' }) => {
  const key = `${kind}/${owner.user.id}/${rnd(8)}.jpg`;
  stored.set(key, meta);
  return { key, url: `${CDN}/${key}` };
};
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
};
const gone = (f) => until(() => !stored.has(f.key));
/** Deletions run after the answer: long enough for one that should not happen to have happened. */
const settle = () => new Promise((r) => setTimeout(r, 400));
const roomPackets = (id, from) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData' && c.body.room === `oda-${id}`)
    .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')))
    .filter((p) => p.type === 'room');
const custom = (u, room, f, extra = {}) => call('POST', '/api/rooms/decor/custom', { room, url: f.url, price: 5_000, ref: rnd(6), ...extra }, u.session);
const DAY = 86_400_000;
let admin;
async function setLive(changes) {
  admin ??= await h.account('Yönetici', 'admin');
  const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
  const [st, j] = await call('POST', '/api/admin/live-settings', { changes, reason: 'Oda süslemesi testi', baseV: view.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}
const makeSuper = (room, owner, u) => ok(call('POST', '/api/rooms/admin', { room, user: u.user.id, admin: true, super: true }, owner.session), 'süper yönetici');

describe('Oda Süslemesi', () => {
  test('önceki oda aynı görünür; ücretsiz süsleme seviyesiyle açılır ve odadaki herkese duyurulur', async () => {
    const owner = await signUp('Süs Sahibi');
    const boss = await signUp('Süper');
    const helper = await signUp('Yönetici');
    const guest = await signUp('Misafir');
    const id = await openRoom(owner);
    await makeSuper(id, owner, boss);
    await ok(call('POST', '/api/rooms/admin', { room: id, user: helper.user.id, admin: true }, owner.session), 'yönetici');
    let r = await roomOf(id, guest);
    assert.deepEqual([r.bgId, r.background, r.coverUrl, r.coverId], [null, { kind: 'free', id: null, url: null, until: null }, null, null]);
    // What an older app picks as the room's "cover" stays the card's picture: it is not the background.
    r = (await ok(call('POST', '/api/rooms/update', { id, coverId: 'bg1' }, owner.session), 'eski kapak')).room;
    assert.deepEqual([r.coverId, r.bgId, r.background.id], ['bg1', null, null]);

    const mark = lkCalls.length;
    let j = await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg1' }, owner.session), 'ücretsiz süsleme');
    assert.deepEqual([j.room.bgId, j.room.background], ['bg1', { kind: 'free', id: 'bg1', url: null, until: null }]);
    assert.equal(j.decor.bgId, 'bg1');
    assert.deepEqual(j.decor.free.map((x) => [x.id, x.minLevel, x.open]), [['bg1', 1, true], ['bg2', 2, false], ['bg3', 4, false], ['bg4', 7, false]]);
    assert.ok(await until(() => roomPackets(id, mark).length >= 1), 'odadaki telefonlara "odayı yeniden oku" gitti');
    assert.equal((await roomOf(id, guest)).background.id, 'bg1', 'misafir de görür');

    let [st, e] = await call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg4' }, owner.session);
    assert.equal(st, 403, 'Lv.7 süslemesi Lv.1 odada kilitli');
    assert.match(e.error, /Lv\.7/);
    assert.equal((await call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'yok' }, owner.session))[0], 400);
    assert.equal((await call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free' }, owner.session))[0], 400, 'bgId gerekli');
    await q('UPDATE users SET room_xp = 100 WHERE id = $1', [owner.user.id]);
    j = await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg2' }, boss.session), 'süper yönetici seçer');
    assert.equal(j.room.bgId, 'bg2');
    assert.deepEqual([j.decor.canEdit, j.decor.owner], [true, false]);
    [st] = await call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg1' }, helper.session);
    assert.equal(st, 403, 'yönetici değiştiremez');
    assert.equal((await call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg1' }, guest.session))[0], 403);
    assert.equal((await call('GET', `/api/rooms/decor?room=${id}`, null, guest.session))[0], 403);
    assert.equal((await call('GET', `/api/rooms/decor?room=${id}`, null, helper.session))[0], 403);
    j = await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: null }, owner.session), 'tema görünümü');
    assert.deepEqual([j.room.bgId, j.room.background.id, j.room.coverId], [null, null, 'bg1']);
  });

  test('Özel: 5.000 jeton ve 30 gün; aynı istek bir kez ödenir; süre içinde ücretsiz değişir ve kaldırılır', async () => {
    const owner = await signUp('Özel Sahip');
    const boss = await signUp('Özel Süper');
    const id = await openRoom(owner);
    await makeSuper(id, owner, boss);
    await topUp(owner);
    await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg1' }, owner.session), 'ücretsiz');
    let d = await decorOf(id, owner);
    assert.deepEqual(d.custom, { on: true, price: 5_000, days: 30, until: null, url: null, changesLeft: 10, removed: false });

    const first = file('roombg', owner);
    const ref = rnd(6);
    const mark = lkCalls.length;
    let j = await ok(custom(owner, id, first, { ref }), 'özel süsleme');
    assert.deepEqual([j.charged, j.replay, j.user.coins], [true, false, 5_000]);
    assert.deepEqual([j.room.background.kind, j.room.background.url, j.room.bgId], ['custom', first.url, 'bg1']);
    assert.ok(Math.abs(Date.parse(j.room.background.until) - Date.now() - 30 * DAY) < 60_000, '30 gün sonra biter');
    assert.deepEqual([j.decor.pick, j.decor.custom.url, j.decor.custom.changesLeft], ['custom', first.url, 10]);
    assert.ok(await until(() => roomPackets(id, mark).length >= 1), 'odaya duyuruldu');
    const line = (await q("SELECT amount, reason, detail FROM ledger WHERE user_id = $1 AND ref = $2 AND currency = 'coin'", [owner.user.id, ref])).rows[0];
    assert.deepEqual([Number(line.amount), line.reason, line.detail.room, line.detail.decor], [-5_000, 'Oda süslemesi: özel görsel (30 gün)', id, 'custom']);
    // The same request again (its answer was lost): charged once, the room unchanged.
    j = await ok(custom(owner, id, first, { ref }), 'aynı istek');
    assert.equal(await coins(owner), 5_000);
    assert.equal(j.room.background.url, first.url);

    // Inside the term a new picture costs nothing; the one it replaces leaves the storage.
    const second = file('roombg', owner);
    j = await ok(custom(owner, id, second), 'değiştir');
    assert.deepEqual([j.charged, j.room.background.url, j.decor.custom.changesLeft], [false, second.url, 9]);
    assert.equal(await coins(owner), 5_000, 'yeniden ödenmedi');
    assert.ok(await gone(first), 'eski görsel depodan silindi');
    assert.equal(stored.has(second.key), true);

    // A Süper Yönetici picks among what the room has, but the owner's picture is the owner's to upload and remove.
    assert.equal((await custom(boss, id, file('roombg', boss)))[0], 403);
    assert.equal((await call('POST', '/api/rooms/decor/custom/remove', { room: id }, boss.session))[0], 403);
    j = await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: null }, boss.session), 'ücretsize geç');
    assert.deepEqual([j.room.background.kind, j.decor.pick, j.decor.custom.url], ['free', null, second.url]);
    j = await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'custom' }, boss.session), 'özel görsele dön');
    assert.equal(j.room.background.url, second.url);

    // Not a picture this person uploaded for a background: refused.
    const stranger = await signUp('Başkası');
    assert.equal((await custom(owner, id, file('roombg', stranger)))[0], 400, 'başkasının dosyası');
    assert.equal((await custom(owner, id, file('avatar', owner)))[0], 400, 'başka türde dosya');
    assert.equal((await custom(owner, id, { url: 'https://example.com/x.jpg' }))[0], 400);
    const missing = { url: `${CDN}/roombg/${owner.user.id}/${rnd(8)}.jpg` };
    assert.equal((await custom(owner, id, missing))[0], 400, 'depoda olmayan dosya');
    const big = file('roombg', owner, { size: 5 * 1024 * 1024, type: 'image/jpeg' });
    assert.equal((await custom(owner, id, big))[0], 400, 'fazla büyük dosya');
    assert.ok(await gone(big), 'reddedilen dosya silindi');
    assert.equal((await roomOf(id, owner)).background.url, second.url, 'reddedilenler odayı değiştirmedi');

    // Removed: the file goes, the room is back on its free background, and the term still runs.
    j = await ok(call('POST', '/api/rooms/decor/custom/remove', { room: id }, owner.session), 'kaldır');
    assert.deepEqual([j.room.background.kind, j.room.background.id], ['free', null]);
    assert.ok(await gone(second), 'kaldırılan görsel silindi');
    assert.equal(j.decor.custom.url, null);
    assert.ok(j.decor.custom.until, 'süre devam ediyor');
    const third = file('roombg', owner);
    j = await ok(custom(owner, id, third), 'süre içinde yeniden yükle');
    assert.deepEqual([j.charged, j.room.background.url], [false, third.url]);
    assert.equal(await coins(owner), 5_000);

    // A picture still in use is not deleted by another deletion (the same file set as the avatar, then replaced).
    await ok(call('PATCH', '/api/me', { avatarUrl: third.url }, owner.session), 'aynı dosya profil fotoğrafı');
    await ok(call('PATCH', '/api/me', { avatarUrl: null }, owner.session), 'profil fotoğrafını kaldır');
    await settle();
    assert.equal(stored.has(third.key), true, 'kullanılan görsel korunur');
  });

  test('jeton yetmezse ya da fiyat değiştiyse hiçbir şey alınmaz ve yüklenen dosya silinir; günde en fazla 10 değişiklik', async () => {
    const owner = await signUp('Az Jeton');
    const id = await openRoom(owner);
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1_000, ref: rnd(6) }, owner.session), 'yükleme');
    const f = file('roombg', owner);
    let [st, j] = await custom(owner, id, f);
    assert.deepEqual([st, j.code], [409, 'insufficient']);
    assert.ok(await gone(f), 'kullanılmayan dosya silindi');
    assert.equal(await coins(owner), 1_000);
    assert.equal((await q('SELECT 1 FROM room_decor WHERE owner = $1', [owner.user.id])).rowCount, 0);
    await topUp(owner);
    const g = file('roombg', owner);
    [st, j] = await custom(owner, id, g, { price: 4_000 });
    assert.deepEqual([st, j.code, j.price], [409, 'price_changed', 5_000]);
    assert.equal(await coins(owner), 11_000);
    assert.equal((await custom(owner, id, file('roombg', owner), { ref: 'kısa' }))[0], 400, 'geçersiz istek kimliği');
    // A ref another charge used is not this purchase's replay.
    const used = rnd(6);
    await ok(call('POST', '/api/rooms/animation', { room: id, animationId: 'an-butterfly', ref: used }, owner.session), 'animasyon');
    [st] = await custom(owner, id, file('roombg', owner), { ref: used });
    assert.equal(st, 409);
    assert.equal((await roomOf(id, owner)).background.kind, 'free');

    await ok(custom(owner, id, file('roombg', owner)), 'özel süsleme');
    await q('UPDATE room_decor SET changes = 10, changes_day = current_date WHERE owner = $1', [owner.user.id]);
    const late = file('roombg', owner);
    [st, j] = await custom(owner, id, late);
    assert.equal(st, 429, 'günlük sınır');
    assert.ok(await gone(late));
    await q("UPDATE room_decor SET changes_day = current_date - 1 WHERE owner = $1", [owner.user.id]);
    j = await ok(custom(owner, id, file('roombg', owner)), 'ertesi gün');
    assert.equal(j.decor.custom.changesLeft, 9);
  });

  test('süre bitince görsel gösterilmez, oda son ücretsiz süslemesine döner, dosya silinir; yenisi yeniden ödenir', async () => {
    const owner = await signUp('Süre Sahibi');
    const id = await openRoom(owner);
    await topUp(owner);
    await topUp(owner);
    await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg1' }, owner.session), 'ücretsiz');
    const f = file('roombg', owner);
    await ok(custom(owner, id, f), 'özel süsleme');
    assert.equal((await roomOf(id, owner)).background.kind, 'custom');
    const mark = lkCalls.length;
    await q("UPDATE room_decor SET custom_until = now() - interval '1 second' WHERE owner = $1", [owner.user.id]);
    assert.deepEqual((await roomOf(id, owner)).background, { kind: 'free', id: 'bg1', url: null, until: null }, 'hemen son ücretsiz süsleme');
    assert.ok(await gone(f), 'süresi biten görsel depodan silindi');
    assert.ok(await until(() => roomPackets(id, mark).length >= 1), 'odaya duyuruldu');
    const row = (await q('SELECT pick, custom_url FROM room_decor WHERE owner = $1', [owner.user.id])).rows[0];
    assert.deepEqual([row.pick, row.custom_url], [null, null]);
    const d = await decorOf(id, owner);
    assert.deepEqual([d.custom.until, d.custom.url, d.pick], [null, null, null]);
    assert.equal((await call('POST', '/api/rooms/decor/pick', { room: id, pick: 'custom' }, owner.session))[0], 409);
    const j = await ok(custom(owner, id, file('roombg', owner)), 'yeni dönem');
    assert.deepEqual([j.charged, j.user.coins], [true, 10_000]);
  });

  test('canlı ayarlar: fiyat ve gün değişir, satış kapatılır; süren dönem etkilenmez', async () => {
    const owner = await signUp('Ayar Sahibi');
    const running = await signUp('Süren Sahip');
    const id = await openRoom(owner);
    const other = await openRoom(running);
    await topUp(owner);
    await topUp(running);
    await ok(custom(running, other, file('roombg', running)), 'süren dönem');
    try {
      await setLive({ room_bg_custom_price: 7_000, room_bg_custom_days: 7 });
      const d = await decorOf(id, owner);
      assert.deepEqual([d.custom.price, d.custom.days], [7_000, 7]);
      let [st, j] = await custom(owner, id, file('roombg', owner));
      assert.deepEqual([st, j.code, j.price], [409, 'price_changed', 7_000]);
      j = await ok(custom(owner, id, file('roombg', owner), { price: 7_000 }), 'yeni fiyatla');
      assert.equal(j.user.coins, 3_000);
      assert.ok(Math.abs(Date.parse(j.room.background.until) - Date.now() - 7 * DAY) < 60_000, '7 gün');
      assert.match((await q("SELECT reason FROM ledger WHERE user_id = $1 AND amount = -7000", [owner.user.id])).rows[0].reason, /7 gün/);

      await setLive({ room_decor_off: ['custom'] });
      const late = await signUp('Geç Kalan');
      const lateRoom = await openRoom(late);
      await topUp(late);
      [st, j] = await custom(late, lateRoom, file('roombg', late), { price: 7_000 });
      assert.deepEqual([st, j.code], [503, 'decor_off']);
      assert.equal(await coins(late), 10_000);
      assert.equal((await decorOf(lateRoom, late)).custom.on, false);
      j = await ok(custom(running, other, file('roombg', running)), 'süren dönemde değiştirmek serbest');
      assert.equal(j.charged, false);
    } finally {
      await setLive({ room_bg_custom_price: null, room_bg_custom_days: null, room_decor_off: null });
    }
    assert.equal((await decorOf(id, owner)).custom.price, 5_000);
  });

  test('Ücretli: oda sahibi süreli satın alır, oda hemen gösterir; biten süsleme son ücretsize döner', async () => {
    const owner = await signUp('Ücretli Sahip');
    const boss = await signUp('Ücretli Süper');
    const id = await openRoom(owner);
    await makeSuper(id, owner, boss);
    await topUp(owner);
    await topUp(boss);
    const item = ROOM_BGS.get('rb-yildiz');
    let d = await decorOf(id, owner);
    assert.equal(d.paid.on, true);
    assert.deepEqual(d.paid.items.map((x) => x.sku), [...ROOM_BGS.keys()]);
    assert.deepEqual(d.paid.items[0], { sku: item.sku, name: item.name, price: item.price, days: item.days, onSale: true, until: null });
    const buy = (u, body) => call('POST', '/api/rooms/decor/buy', { room: id, sku: item.sku, price: item.price, ref: rnd(6), ...body }, u.session);

    assert.equal((await buy(boss))[0], 403, 'yalnızca oda sahibi öder');
    let [st, j] = await buy(owner, { price: item.price - 1 });
    assert.deepEqual([st, j.code, j.price], [409, 'price_changed', item.price]);
    assert.equal((await buy(owner, { sku: 'rb-yok' }))[0], 400);
    assert.equal((await call('POST', '/api/rooms/decor/pick', { room: id, pick: item.sku }, owner.session))[0], 403, 'sahip olmadan seçilemez');

    const ref = rnd(6);
    const mark = lkCalls.length;
    j = await ok(buy(owner, { ref }), 'satın al');
    assert.deepEqual([j.replay, j.user.coins], [false, 10_000 - item.price]);
    assert.deepEqual([j.room.background.kind, j.room.background.id, j.decor.pick], ['paid', item.sku, item.sku]);
    assert.ok(Math.abs(Date.parse(j.room.background.until) - Date.now() - item.days * DAY) < 60_000);
    assert.ok(j.decor.paid.items[0].until);
    assert.ok(await until(() => roomPackets(id, mark).length >= 1), 'odaya duyuruldu');
    j = await ok(buy(owner, { ref }), 'aynı istek');
    assert.deepEqual([j.replay, j.user.coins], [true, 10_000 - item.price]);
    const e = (await q("SELECT id, kind, price, source FROM entitlements WHERE user_id = $1 AND sku = $2", [owner.user.id, item.sku])).rows;
    assert.deepEqual(e.map((x) => [x.kind, Number(x.price), x.source]), [['roombg', item.price, 'buy']]);
    assert.match((await q('SELECT reason FROM ledger WHERE user_id = $1 AND ref = $2', [owner.user.id, ref])).rows[0].reason, /^Oda süslemesi: Yıldızlı Gece \(30 gün\)$/);

    // The Süper Yönetici switches between the free background and what the owner owns.
    await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'free', bgId: 'bg1' }, boss.session), 'ücretsize geç');
    assert.equal((await roomOf(id, boss)).background.kind, 'free');
    j = await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: item.sku }, boss.session), 'ücretliye dön');
    assert.equal(j.room.background.id, item.sku);

    // Its term ends (here: support takes the item back): the room is on its last free background at once.
    admin ??= await h.account('Yönetici', 'admin');
    await ok(call('POST', '/api/admin/economy/revoke', { id: Number(e[0].id), reason: 'test: süre bitti' }, admin.session), 'geri al');
    assert.deepEqual((await roomOf(id, owner)).background, { kind: 'free', id: 'bg1', url: null, until: null });
    assert.equal((await call('POST', '/api/rooms/decor/pick', { room: id, pick: item.sku }, owner.session))[0], 403);
    // A term that runs out by the clock, the same way.
    await q("INSERT INTO entitlements (user_id, sku, kind, price, starts_at, ends_at, source, ref) VALUES ($1, 'rb-neon', 'roombg', 900, now() - interval '30 days', now() + interval '1 second', 'buy', $2)", [owner.user.id, rnd(6)]);
    await ok(call('POST', '/api/rooms/decor/pick', { room: id, pick: 'rb-neon' }, owner.session), 'bitmek üzere olan');
    assert.ok(await until(async () => (await roomOf(id, owner)).background.kind === 'free', 3000), 'süre bitince ücretsize döndü');

    try {
      await setLive({ room_decor_off: ['paid'] });
      [st, j] = await buy(owner);
      assert.deepEqual([st, j.code], [503, 'decor_off']);
      assert.equal((await decorOf(id, owner)).paid.on, false);
    } finally {
      await setLive({ room_decor_off: null });
    }
  });

  test('yetkili kural dışı görseli kaldırır: dosya silinir, dönem biter, iade yok, denetim kaydı düşer', async () => {
    const owner = await signUp('Kural Sahibi');
    const id = await openRoom(owner);
    await topUp(owner);
    const f = file('roombg', owner);
    await ok(custom(owner, id, f), 'özel süsleme');
    const mod = await h.account('Moderatör', 'moderator');
    assert.equal((await call('GET', `/api/admin/rooms/background?room=${id}`, null, owner.session))[0], 403);
    assert.equal((await call('POST', '/api/admin/rooms/background/remove', { room: id, reason: 'Uygunsuz görsel' }, owner.session))[0], 403);
    const seen = await ok(call('GET', `/api/admin/rooms/background?room=${id}`, null, mod.session), 'yetkili bakar');
    assert.deepEqual([seen.url, seen.shown, seen.owner.id], [f.url, true, owner.user.id]);
    assert.equal((await call('POST', '/api/admin/rooms/background/remove', { room: id }, mod.session))[0], 400, 'neden gerekli');
    const mark = lkCalls.length;
    await ok(call('POST', '/api/admin/rooms/background/remove', { room: id, reason: 'Uygunsuz görsel' }, mod.session), 'kaldır');
    assert.ok(await gone(f), 'dosya silindi');
    assert.ok(await until(() => roomPackets(id, mark).length >= 1), 'odaya duyuruldu');
    assert.equal((await roomOf(id, owner)).background.kind, 'free');
    assert.equal(await coins(owner), 5_000, 'iade yok');
    const d = await decorOf(id, owner);
    assert.deepEqual([d.custom.until, d.custom.url, d.custom.removed], [null, null, true]);
    const log = (await q("SELECT actor, actor_role, target_user, detail FROM sanction_audit_logs WHERE action = 'room_background_remove'")).rows;
    assert.equal(log.length, 1);
    assert.deepEqual([log[0].actor, log[0].actor_role, log[0].target_user, log[0].detail.room, log[0].detail.reason, log[0].detail.price], [mod.user.id, 'moderator', owner.user.id, id, 'Uygunsuz görsel', 5_000]);
    assert.equal((await call('POST', '/api/admin/rooms/background/remove', { room: id, reason: 'Uygunsuz görsel' }, mod.session))[0], 404, 'kaldırılacak görsel kalmadı');
    // The term ended with it: a new picture is a new purchase.
    const j = await ok(custom(owner, id, file('roombg', owner)), 'yeniden satın al');
    assert.deepEqual([j.charged, j.user.coins, j.decor.custom.removed], [true, 0, false]);
  });
});

describe('Oda Kapağı', () => {
  test('oda sahibi ya da Süper Yönetici yükler; listelerde görünür; değişen ve kaldırılan dosya silinir', async () => {
    const owner = await signUp('Kapak Sahibi');
    const boss = await signUp('Kapak Süper');
    const helper = await signUp('Kapak Yönetici');
    const guest = await signUp('Kapak Misafir');
    const id = await openRoom(owner);
    await makeSuper(id, owner, boss);
    await ok(call('POST', '/api/rooms/admin', { room: id, user: helper.user.id, admin: true }, owner.session), 'yönetici');
    const cover = (u, url) => call('POST', '/api/rooms/cover', { room: id, url }, u.session);

    const first = file('roomcover', owner);
    const mark = lkCalls.length;
    let j = await ok(cover(owner, first.url), 'kapak');
    assert.deepEqual([j.room.coverUrl, j.room.background.kind, j.room.bgId], [first.url, 'free', null], 'kapak süslemeyi değiştirmez');
    assert.ok(await until(() => roomPackets(id, mark).length >= 1), 'odaya duyuruldu');
    const listed = (await ok(call('GET', '/api/rooms', null, owner.session), 'liste')).rooms.find((x) => x.id === id);
    assert.equal(listed.coverUrl, first.url);
    assert.equal((await roomOf(id, guest)).coverUrl, first.url);
    assert.equal((await decorOf(id, owner)).cover.url, first.url);

    const second = file('roomcover', boss);
    j = await ok(cover(boss, second.url), 'süper yönetici değiştirir');
    assert.equal(j.room.coverUrl, second.url);
    assert.ok(await gone(first), 'eski kapak silindi');
    assert.equal((await cover(helper, file('roomcover', helper).url))[0], 403, 'yönetici değiştiremez');
    assert.equal((await cover(guest, file('roomcover', guest).url))[0], 403);
    assert.equal((await cover(owner, file('avatar', owner).url))[0], 400, 'başka türde dosya');
    assert.equal((await cover(owner, file('roomcover', guest).url))[0], 400, 'başkasının dosyası');
    assert.equal((await cover(owner, undefined))[0], 400);
    const big = file('roomcover', owner, { size: 3 * 1024 * 1024, type: 'image/jpeg' });
    assert.equal((await cover(owner, big.url))[0], 400, 'fazla büyük');
    assert.ok(await gone(big));
    assert.equal((await roomOf(id, guest)).coverUrl, second.url);

    j = await ok(cover(owner, null), 'kapağı kaldır');
    assert.equal(j.room.coverUrl, null);
    assert.ok(await gone(second), 'kaldırılan kapak silindi');

    // Staff take a cover down for breaking the rules: audited, the file goes, the owner may upload another.
    const third = file('roomcover', owner);
    await ok(cover(owner, third.url), 'yeni kapak');
    const mod = await h.account('Kapak Moderatörü', 'moderator');
    assert.equal((await call('POST', '/api/admin/rooms/cover/remove', { room: id, reason: 'Uygunsuz kapak' }, owner.session))[0], 403);
    assert.equal((await ok(call('GET', `/api/admin/rooms/background?room=${id}`, null, mod.session), 'yetkili bakar')).coverUrl, third.url);
    await ok(call('POST', '/api/admin/rooms/cover/remove', { room: id, reason: 'Uygunsuz kapak' }, mod.session), 'yetkili kaldırır');
    assert.ok(await gone(third), 'dosya silindi');
    assert.equal((await roomOf(id, guest)).coverUrl, null);
    const log = (await q("SELECT actor, target_user, detail FROM sanction_audit_logs WHERE action = 'room_cover_remove'")).rows;
    assert.deepEqual(log.map((x) => [x.actor, x.target_user, x.detail.room, x.detail.reason]), [[mod.user.id, owner.user.id, id, 'Uygunsuz kapak']]);
    assert.equal((await call('POST', '/api/admin/rooms/cover/remove', { room: id, reason: 'Uygunsuz kapak' }, mod.session))[0], 404);
    assert.equal((await cover(owner, file('roomcover', owner).url))[0], 200, 'sahibi yenisini yükleyebilir');
  });

  test('oda kapanınca kapağın dosyası silinir', async () => {
    const owner = await signUp('Kapanan Sahip');
    const id = await openRoom(owner);
    const f = file('roomcover', owner);
    await ok(call('POST', '/api/rooms/cover', { room: id, url: f.url }, owner.session), 'kapak');
    await settle();
    assert.equal(stored.has(f.key), true, 'açık odanın kapağı durur');
    await ok(call('POST', '/api/rooms/close', { id }, owner.session), 'kapat');
    assert.ok(await gone(f), 'kapanan odanın kapağı silindi');
    assert.equal((await q('SELECT cover_url FROM rooms WHERE id = $1', [id])).rows[0].cover_url, null);
    assert.equal((await call('POST', '/api/rooms/cover', { room: id, url: file('roomcover', owner).url }, owner.session))[0], 410);
  });
});

describe('Oda görselleri: yükleme izni, hesap silme, veri kopyası', () => {
  test('yükleme adresi: süsleme için açık odası olan, kapak için sahibi ya da Süper Yönetici; JPEG/PNG/WebP, boyut sınırı', async () => {
    const owner = await signUp('Yükleyen Sahip');
    const boss = await signUp('Yükleyen Süper');
    const nobody = await signUp('Odasız');
    const id = await openRoom(owner);
    await makeSuper(id, owner, boss);
    const ask = (u, kind, extra = {}) => call('POST', '/api/media/upload-url', { kind, contentType: 'image/jpeg', size: 200_000, ...extra }, u.session);
    let [st, j] = await ask(owner, 'roombg');
    assert.equal(st, 200, j.error);
    assert.ok(j.publicUrl.startsWith(`${CDN}/roombg/${owner.user.id}/`));
    assert.equal((await ask(owner, 'roomcover'))[0], 200);
    assert.equal((await ask(boss, 'roomcover'))[0], 200);
    assert.equal((await ask(boss, 'roombg'))[0], 403, 'süslemeyi yalnızca oda sahibi yükler');
    assert.equal((await ask(nobody, 'roombg'))[0], 403);
    assert.equal((await ask(nobody, 'roomcover'))[0], 403);
    assert.equal((await ask(owner, 'roombg', { contentType: 'image/heic' }))[0], 400);
    assert.equal((await ask(owner, 'roombg', { size: 4 * 1024 * 1024 + 1 }))[0], 400);
    assert.equal((await ask(owner, 'roomcover', { size: 2 * 1024 * 1024 + 1 }))[0], 400);
  });

  test('hesap silinince süsleme, kapak ve dosyaları gider; başkasının odasına yüklediği kapak da', async () => {
    const owner = await signUp('Silinen Sahip');
    const host = await signUp('Kalan Sahip');
    const id = await openRoom(owner);
    const hostRoom = await openRoom(host);
    await makeSuper(hostRoom, host, owner);
    await topUp(owner);
    const bg = file('roombg', owner);
    const cover = file('roomcover', owner);
    const theirs = file('roomcover', owner);
    const hostBg = file('roombg', host);
    await topUp(host);
    await ok(custom(owner, id, bg), 'özel süsleme');
    await ok(custom(host, hostRoom, hostBg), 'başkasının süslemesi');
    await ok(call('POST', '/api/rooms/cover', { room: id, url: cover.url }, owner.session), 'kapak');
    await ok(call('POST', '/api/rooms/cover', { room: hostRoom, url: theirs.url }, owner.session), 'başkasının odasına kapak');
    // The data copy has it (UK GDPR access).
    const copy = await ok(call('GET', '/api/me/export', null, owner.session), 'veri kopyası');
    const text = JSON.stringify(copy);
    assert.ok(text.includes(bg.url) && text.includes(cover.url), 'süsleme ve kapak veri kopyasında');
    assert.ok(!text.includes(hostBg.url), 'başkasının görseli yok');

    await ok(call('DELETE', '/api/me', null, owner.session), 'hesap silindi');
    assert.ok((await gone(bg)) && (await gone(cover)) && (await gone(theirs)), 'dosyaları silindi');
    assert.equal((await q('SELECT 1 FROM room_decor WHERE owner = $1', [owner.user.id])).rowCount, 0);
    assert.equal((await q('SELECT cover_url FROM rooms WHERE id = $1', [id])).rows[0].cover_url, null);
    const kept = await roomOf(hostRoom, host);
    assert.deepEqual([kept.coverUrl, kept.background.url], [null, hostBg.url], 'kalan odanın kapağı boşaldı, süslemesi duruyor');
    assert.equal(stored.has(hostBg.key), true);
  });
});
