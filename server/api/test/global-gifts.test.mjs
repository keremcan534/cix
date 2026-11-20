// Global hediye (global-gifts.mjs, 102) against a real Postgres and a stand-in bucket: the admins mark a gift global
// from Canlı ayarlar' minimum price on (never a bond gift, Koruma Kartı or a Şanslı package), every change audited;
// the catalog says global: true (an older app ignores it). A paid send of one in a server room goes, once, to every
// live line opened with ?global=1 whose owner is of the sender's country and in no block with the sender or the
// receiver; an older app's line never gets it, a send outside a room is never told, and a room anyone couldn't see the
// two in (private, password, resting, "Bulunduğum odayı göster" off, a hidden name) isn't named. A person can hide their name ("Bir kullanıcı"). At most one announcement every
// global_gift_gap_seconds; the same send while one waits adds to it (×N).
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';
import { bucketEnv, png, standInBucket } from './stand-in-bucket.mjs';

const PORT = 24000 + (process.pid % 900);
standInBucket(PORT);
const h = startApi({ ...bucketEnv(PORT), CUSTOM_GIFTS_POLL_MS: '200', LIVE_BEAT_MS: '200' });
const { call } = h;
const q = (s, p) => h.sql.query(s, p);
const rnd = () => Math.random().toString(36).slice(2, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = async (p, what = 'istek') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, re) => {
  const [st, j] = await p;
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j.error}`);
  if (re) assert.match(j.error, re);
  return j;
};

let admin;
const update = (body) => call('POST', '/api/admin/gifts/update', body, admin.session);
const panel = async () => ok(call('GET', '/api/admin/gifts?builtin=1', null, admin.session), 'panel');
/** Canlı ayarlar: these keys to these values (null: the default). */
async function setLive(changes) {
  const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
  await ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Global hediye testi', baseV: view.v, confirm: true }, admin.session), 'canlı ayar');
}
async function upload(who, kind, body, type) {
  const up = await ok(call('POST', '/api/media/upload-url', { kind, contentType: type, size: body.length }, who.session), `yükleme adresi ${kind}`);
  assert.equal((await fetch(up.uploadUrl, { method: 'PUT', headers: up.headers, body })).status, 200);
  return up.publicUrl;
}

/** A live line for `session` opened as `query` asks; `next(type)` waits for that event. */
async function open(session, query = 'wins=1&rocket=1&global=1') {
  const ctl = new AbortController();
  const res = await fetch(`${h.base}/api/live?${query}`, { headers: { authorization: `Bearer ${session}` }, signal: ctl.signal });
  assert.equal(res.status, 200);
  const events = [];
  let raw = '';
  (async () => {
    const dec = new TextDecoder();
    try {
      for await (const chunk of res.body) {
        raw += dec.decode(chunk, { stream: true });
        let i;
        while ((i = raw.indexOf('\n\n')) >= 0) {
          const block = raw.slice(0, i);
          raw = raw.slice(i + 2);
          for (const l of block.split('\n')) if (l.startsWith('data: ')) events.push({ ...JSON.parse(l.slice(6)), at: Date.now() });
        }
      }
    } catch {
      // closed
    }
  })();
  const next = async (type, ms = 4000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = events.findIndex((e) => e.type === type);
      if (i >= 0) return events.splice(i, 1)[0];
      if (Date.now() > end) throw new Error(`no ${type} event (got ${JSON.stringify(events)})`);
      await sleep(20);
    }
  };
  /** The global gifts that came before a ping on this line (events on one line keep their order). */
  const globalsSoFar = async () => {
    await ok(call('POST', '/api/live/ping', {}, session), 'ping');
    await next('ping');
    return events.filter((e) => e.type === 'global_gift').splice(0);
  };
  return { events, next, globalsSoFar, close: () => ctl.abort() };
}
/** An event as the phones get it, without the time this test saw it. */
const bare = ({ at, ...e }) => e;
const eventOf = async (sender, ref) => Number((await q('SELECT id FROM gift_events WHERE sender = $1 AND ref = $2', [sender, ref])).rows[0].id);

describe('Global hediye', () => {
  before(async () => {
    admin = await h.account('Hediye Yöneticisi', 'admin');
  });

  test('yönetici işaretler: en düşük fiyattan, bağ / Koruma / Şanslı değil; denetim kaydı; katalog global der', async () => {
    assert.equal((await panel()).globalMinPrice, 300_000);
    // Roket (1.999 jeton) is under the minimum: refused, nothing changes.
    await refused(update({ id: 'g6', global: true }), 400, /en az 300\.000 jeton/);
    assert.equal((await panel()).gifts.find((g) => g.id === 'g6').global, false);
    await refused(update({ id: 'koruma', global: true }), 400, /Koruma Kartı global olamaz/);
    await refused(update({ id: 'bag-kardes', global: true }), 400, /Bağ hediyesi global olamaz/);
    // A Şanslı package is no gift of Hediyeler at all.
    const [lk] = await update({ id: 'lk1', global: true });
    assert.ok(lk === 400 || lk === 404, `Şanslı paketi: ${lk}`);
    await refused(update({ id: 'c6', global: 'evet' }), 400, /Global seçimi geçersiz/);

    // Yıldız Faytonu (699.999): global, with its audit row.
    const c6 = (await ok(update({ id: 'c6', global: true }), 'global')).gift;
    assert.equal(c6.global, true);
    assert.ok(c6.changed.includes('global'));
    const log = (await q("SELECT detail FROM audit_events WHERE action = 'gift.update' AND detail->>'gift' = 'c6' ORDER BY id DESC LIMIT 1")).rows[0].detail;
    assert.equal(log.before.global, undefined);
    assert.equal(log.after.global, true);
    // A newer app and an older one (its price unchanged, so listed for it too): global: true, which the older ignores.
    for (const path of ['/api/catalog?gifts=2', '/api/catalog']) {
      const c = await ok(call('GET', path), path);
      assert.equal(c.gifts.find((g) => g.id === 'c6').global, true, path);
      assert.equal(c.gifts.find((g) => g.id === 'c8').global, undefined, `${path}: işaretlenmeyen`);
    }
    // Its price can't go under the minimum while it is global; with the box off it can.
    await refused(update({ id: 'c6', price: 200_000 }), 400, /en az 300\.000/);
    assert.equal((await ok(update({ id: 'c6', price: 200_000, global: false }), 'ucuz ve global değil')).gift.global, false);
    assert.equal((await ok(update({ id: 'c6', price: 699_999, global: true }), 'geri')).gift.global, true);

    // An admin's gift: at create and update, the same rule.
    const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    await refused(call('POST', '/api/admin/gifts', { name: 'Ucuz Global', price: 299_000, cat: 'hot', icon, global: true }, admin.session), 400, /en az 300\.000/);
    const mine = (await ok(call('POST', '/api/admin/gifts', { name: 'Altın Gökkuşağı', price: 500_000, cat: 'hot', icon, global: true }, admin.session), 'yönetici hediyesi')).gift;
    assert.equal(mine.global, true);
    const created = (await q("SELECT detail FROM audit_events WHERE action = 'gift.create' AND detail->>'gift' = $1", [mine.id])).rows[0].detail;
    assert.equal(created.after.global, true);
    assert.equal((await ok(call('GET', '/api/catalog?gifts=2'), 'katalog')).gifts.find((g) => g.id === mine.id).global, true);
    // Another change leaves it as it is; a lower price is refused.
    assert.equal((await ok(update({ id: mine.id, name: 'Altın Gökkuşağı 2' }), 'ad')).gift.global, true);
    await refused(update({ id: mine.id, price: 1000 }), 400, /en az/);
    assert.equal((await ok(update({ id: mine.id, global: false }), 'kaldır')).gift.global, false);

    // A minimum raised later: still ticked in the panel, but not global until the price reaches it.
    await setLive({ global_gift_min_price: 800_000 });
    assert.equal((await panel()).globalMinPrice, 800_000);
    assert.equal((await panel()).gifts.find((g) => g.id === 'c6').global, true);
    assert.equal((await ok(call('GET', '/api/catalog?gifts=2'), 'katalog')).gifts.find((g) => g.id === 'c6').global, undefined);
    await setLive({ global_gift_min_price: null });
    assert.equal((await ok(call('GET', '/api/catalog?gifts=2'), 'katalog')).gifts.find((g) => g.id === 'c6').global, true);

    // Back to the app's value (not global), alone or with everything.
    assert.equal((await ok(call('POST', '/api/admin/gifts/reset', { id: 'c6', fields: ['global'] }, admin.session), 'geri al')).gift.global, false);
    assert.equal((await ok(update({ id: 'c6', global: true }), 'yine global')).gift.global, true);
  });

  test('duyuru: yalnız yeni uygulamanın hattına, gönderenin ülkesine, engelsiz olanlara; tekrar gönderim duyurulmaz; ad gizlenebilir', async () => {
    await setLive({ global_gift_gap_seconds: 0 });
    const owner = await h.signUp('Oda Sahibi');
    const room = (await ok(call('POST', '/api/rooms', { title: `Gece ${rnd().slice(0, 4)}` }, owner.session), 'oda')).room;
    const kaan = await h.signUp('Kaan');
    const artemis = await h.signUp('Artemis');
    const watcher = await h.signUp('İzleyen');
    const older = await h.signUp('Eski Uygulama');
    const abroad = await h.signUp('Almanya');
    const blocksKaan = await h.signUp('Kaanı Engelleyen');
    const blockedByArtemis = await h.signUp('Artemisin Engellediği');
    await h.credit(kaan.user.id, 15_000_000);
    await ok(call('PATCH', '/api/me/extras', { country: 'DE' }, abroad.session), 'ülke');
    await ok(call('POST', '/api/block', { to: kaan.user.id }, blocksKaan.session), 'engelle');
    await ok(call('POST', '/api/block', { to: blockedByArtemis.user.id }, artemis.session), 'engelle 2');

    const w = await open(watcher.session);
    const old = await open(older.session, 'wins=1&rocket=1');
    const de = await open(abroad.session);
    const b1 = await open(blocksKaan.session);
    const b2 = await open(blockedByArtemis.session);
    const own = await open(kaan.session);

    const send = (ref, extra = {}, who = kaan, to = artemis) => call('POST', '/api/gifts/send', { to: to.user.id, giftId: 'c6', count: 1, price: 699_999, room: room.id, ref, ...extra }, who.session);
    const ref = rnd();
    await ok(send(ref), 'gönder');
    const id = await eventOf(kaan.user.id, ref);
    const event = {
      type: 'global_gift',
      id,
      from: { id: kaan.user.id, name: 'Kaan', avatar: null },
      to: { id: artemis.user.id, name: 'Artemis' },
      gift: { id: 'c6', name: 'Yıldız Faytonu', emoji: '🐎', icon: null },
      count: 1,
      room: { id: room.id, title: room.title, locked: false },
    };
    assert.deepEqual(bare(await w.next('global_gift')), event);
    // The sender's own phone hears it too (its room shows the gift as before).
    assert.deepEqual(bare(await own.next('global_gift')), event);
    // Written to every line in one go: the others had it by now, if they were to.
    assert.deepEqual(await old.globalsSoFar(), [], 'eski uygulamanın hattı');
    assert.deepEqual(await de.globalsSoFar(), [], 'başka ülke');
    assert.deepEqual(await b1.globalsSoFar(), [], 'göndereni engelleyen');
    assert.deepEqual(await b2.globalsSoFar(), [], 'alıcının engellediği');

    // The same request again (a lost answer): no second announcement. The next send is the next event.
    assert.equal((await ok(send(ref), 'tekrar')).replay, true);
    const ref2 = rnd();
    await ok(send(ref2, { count: 5 }), 'beşli');
    const five = await w.next('global_gift');
    assert.deepEqual([five.id, five.count], [await eventOf(kaan.user.id, ref2), 5]);
    assert.deepEqual(await w.globalsSoFar(), []);

    // A gift that isn't global (Düğün Günü): nothing.
    await ok(call('POST', '/api/gifts/send', { to: artemis.user.id, giftId: 'c8', count: 1, price: 399_999, room: room.id, ref: rnd() }, kaan.session), 'global değil');
    // Gizlilik › "Adım genel duyurularda görünmesin": the receiver's, then the sender's.
    await ok(call('PATCH', '/api/me/privacy', { globalHideName: true }, artemis.session), 'alıcı gizler');
    await ok(send(rnd()), 'alıcı gizli');
    const hidden = await w.next('global_gift');
    assert.equal(hidden.gift.id, 'c6', 'global olmayan duyurulmadı');
    assert.deepEqual([hidden.from.name, hidden.to], ['Kaan', { id: null, name: null }]);
    // A hidden name hides the room too (its title, "Kaan'ın odası", would name them).
    assert.equal(hidden.room, null, 'alıcı adını gizleyince oda da yazmaz');
    await ok(call('PATCH', '/api/me/privacy', { globalHideName: false }, artemis.session), 'alıcı gösterir');
    await ok(call('PATCH', '/api/me/privacy', { globalHideName: true }, kaan.session), 'gönderen gizler');
    await ok(send(rnd()), 'gönderen gizli');
    const anon = await w.next('global_gift');
    assert.deepEqual([anon.from, anon.to.name, anon.room], [{ id: null, name: null, avatar: null }, 'Artemis', null]);

    // The sender in Germany: Germany hears it, Turkey doesn't.
    await ok(call('PATCH', '/api/me/extras', { country: 'DE' }, kaan.session), 'gönderen ülke');
    await ok(send(rnd()), 'almanya');
    assert.equal((await de.next('global_gift')).gift.id, 'c6');
    assert.deepEqual(await w.globalsSoFar(), [], 'türkiye duymaz');
    await ok(call('PATCH', '/api/me/extras', { country: null }, kaan.session), 'ülke boş: TR');

    // A photo goes out at the address phones load it (core.mjs filesOut), not the storage's own; an admin's gift with
    // its icon the same way.
    await ok(call('PATCH', '/api/me/privacy', { globalHideName: false }, kaan.session), 'ad görünür');
    const photo = await upload(kaan, 'avatar', png(256, 256), 'image/png');
    await ok(call('PATCH', '/api/me', { avatarUrl: photo }, kaan.session), 'fotoğraf');
    const served = (url) => url.replace(/^https:\/\/pub-test\.r2\.dev\//, `${h.base}/api/media/f/`);
    const icon = await upload(admin, 'gifticon', png(256, 256), 'image/png');
    const big = (await ok(call('POST', '/api/admin/gifts', { name: 'Gece Yıldızı', emoji: '🌟', price: 300_000, cat: 'hot', icon, global: true }, admin.session), 'yönetici hediyesi')).gift;
    await ok(call('POST', '/api/gifts/send', { to: artemis.user.id, giftId: big.id, count: 1, price: 300_000, room: room.id, ref: rnd() }, kaan.session), 'yönetici hediyesi gönder');
    const pic = await w.next('global_gift');
    assert.equal(pic.from.avatar, served(photo));
    assert.deepEqual(pic.gift, { id: big.id, name: 'Gece Yıldızı', emoji: '🌟', icon: served(big.icon) });

    // A password room: announced, but the room isn't named (a closed door, as the profile's "Şu an odada" keeps it).
    await q('UPDATE users SET room_xp = 600 WHERE id = $1', [kaan.user.id]);
    const locked = (await ok(call('POST', '/api/rooms', { title: 'Kilitli', password: '1234' }, kaan.session), 'şifreli oda')).room;
    await ok(send(rnd(), { room: locked.id }), 'şifreli odada');
    const shut = await w.next('global_gift');
    assert.deepEqual([shut.from.name, shut.to.name, shut.room], ['Kaan', 'Artemis', null]);

    for (const l of [w, old, de, b1, b2, own]) l.close();
  });

  test('oda dışı gönderim duyurulmaz; özel oda ve "Bulunduğum odayı göster" kapalıysa oda adı gitmez', async () => {
    // (The gap is 0 since the test before.)
    const kaan = await h.signUp('Kaan Özel');
    const artemis = await h.signUp('Artemis Özel');
    await h.credit(kaan.user.id, 15_000_000);
    await q('UPDATE users SET room_xp = 600 WHERE id = $1', [kaan.user.id]);
    const w = await open((await h.signUp('Yabancı')).session);
    const gift = (extra) => ok(call('POST', '/api/gifts/send', { to: artemis.user.id, giftId: 'c6', count: 1, price: 699_999, ref: rnd(), ...extra }, kaan.session), 'gönder');
    // A one-to-one chat, a profile, Anlar and an older app's send with no place: the gift goes, nobody hears.
    for (const place of ['chat', 'profile', 'moment']) await gift({ place });
    await gift({});
    assert.deepEqual(await w.globalsSoFar(), [], 'oda dışında duyuru yok');
    // A room for its members only: told, the room not named.
    const secret = (await ok(call('POST', '/api/rooms', { title: 'Gizli Bulusma' }, artemis.session), 'oda')).room;
    await q("UPDATE rooms SET room_type = 'private' WHERE id = $1", [secret.id]);
    await gift({ room: secret.id });
    const a = await w.next('global_gift');
    assert.deepEqual([a.from.name, a.to.name, a.room], ['Kaan Özel', 'Artemis Özel', null]);
    // An open room: named, until either of the two turns off "Bulunduğum odayı göster".
    const plain = (await ok(call('POST', '/api/rooms', { title: 'Açık Oda' }, kaan.session), 'oda')).room;
    await gift({ room: plain.id });
    assert.deepEqual((await w.next('global_gift')).room, { id: plain.id, title: 'Açık Oda', locked: false });
    for (const who of [artemis, kaan]) {
      await ok(call('PATCH', '/api/me/privacy', { showCurrentRoom: false }, who.session), 'odamı gösterme');
      await gift({ room: plain.id });
      assert.equal((await w.next('global_gift')).room, null, `${who.user.name}: oda adı gitmez`);
      await ok(call('PATCH', '/api/me/privacy', { showCurrentRoom: true }, who.session), 'odamı göster');
    }
    // A resting room (room-autoclose.mjs): not named either.
    await q('UPDATE rooms SET paused_at = now() WHERE id = $1', [plain.id]);
    await gift({ room: plain.id });
    assert.equal((await w.next('global_gift')).room, null, 'dinlenen oda');
    assert.deepEqual(await w.globalsSoFar(), []);
    w.close();
  });

  test('aralık: en çok belirli saniyede bir; beklerken aynı gönderim ×N toplanır', async () => {
    await setLive({ global_gift_gap_seconds: 2 });
    const a = await h.signUp('Ayşe');
    const b = await h.signUp('Bora');
    const c = await h.signUp('Cem');
    for (const p of [a, c]) await h.credit(p.user.id, 5_000_000);
    const w = await open((await h.signUp('Bekleyen')).session);
    const room = (await ok(call('POST', '/api/rooms', { title: `Aralık ${rnd().slice(0, 4)}` }, b.session), 'oda')).room.id;
    const send = (who, ref) => ok(call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'c6', count: 1, price: 699_999, room, ref }, who.session), 'gönder');
    // The previous test's last announcement may still hold the gap: the first goes once it has passed.
    await sleep(2100);
    const first = rnd();
    await send(a, first);
    const one = await w.next('global_gift');
    assert.deepEqual([one.id, one.count], [await eventOf(a.user.id, first), 1]);
    // Two more of the same while the gap runs: one announcement ×2, then Cem's on its own.
    const second = rnd();
    await send(a, second);
    await send(a, rnd());
    await send(c, rnd());
    const two = await w.next('global_gift', 5000);
    assert.deepEqual([two.from.name, two.id, two.count], ['Ayşe', await eventOf(a.user.id, second), 2]);
    assert.ok(two.at - one.at >= 1800, `aralık ${two.at - one.at} ms`);
    const three = await w.next('global_gift', 5000);
    assert.deepEqual([three.from.name, three.count], ['Cem', 1]);
    assert.ok(three.at - two.at >= 1800, `aralık ${three.at - two.at} ms`);
    w.close();
    await setLive({ global_gift_gap_seconds: 0 });
  });

  test('Şanslı gönderim hiç duyurulmaz', async () => {
    const p = await h.signUp('Şanslı Oyuncu');
    await q("UPDATE users SET birth_date = '1990-01-01' WHERE id = $1", [p.user.id]);
    await h.credit(p.user.id, 2_000_000);
    // Cömertlik Lv.2: 1.000 coins spent in the shop.
    for (const [sku, price] of [['fr-silver', 800], ['en-sparkle', 200]]) await ok(call('POST', '/api/shop/buy', { sku, price, ref: rnd() }, p.session), sku);
    const to = await h.signUp('Şanslı Alan');
    const w = await open((await h.signUp('Şanslı İzleyen')).session);
    const room = (await ok(call('POST', '/api/rooms', { title: `Şanslı ${rnd().slice(0, 4)}` }, to.session), 'oda')).room.id;
    await ok(call('POST', '/api/lucky/send', { giftId: 'lk4', to: [to.user.id], count: 1, room, ref: rnd() }, p.session), 'şanslı');
    // A global send after it is the next event: the Şanslı one put nothing before it.
    const ref = rnd();
    await ok(call('POST', '/api/gifts/send', { to: to.user.id, giftId: 'c6', count: 1, price: 699_999, room, ref }, p.session), 'global');
    const e = await w.next('global_gift');
    assert.equal(e.id, await eventOf(p.user.id, ref));
    assert.deepEqual(await w.globalsSoFar(), []);
    w.close();
  });
});
