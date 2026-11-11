// Patron koltuğu (boss-seat.mjs, boss-rules.mjs) against a real Postgres and a fake LiveKit: in Otomatik mode one
// send of at least the live amount sits its sender down for the live minutes, the holder's further gifts extend the
// sitting, after 5 seconds a single larger send than the holder's total takes it, and the sweep ends a sitting whose
// time is up; every change reaches the room as a 'boss' packet and a 'room' packet, and old apps still read
// room.boss. In Davet mode only the owner seats someone; the holder gets up, the owner takes them off; a ban does too.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { BOSS_HOLD_MS, bossStep } from '../boss-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
const LK_PORT = 26000 + (process.pid % 900);
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

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, BOSS_SWEEP_MS: '150', TEST_TOPUP_DAILY: '10000000' });
const { call, signUp } = h;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
const packets = (from, type) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')))
    .filter((p) => p.type === type);
const topUp = async (s, coins) => {
  for (let n = 0; n < coins; n += 10_000) await ok(call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: rnd(6) }, s.session), 'yükleme');
};
let admin;
async function setLive(changes) {
  admin ??= await h.account('Yönetici', 'admin');
  const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
  const [st, j] = await call('POST', '/api/admin/live-settings', { changes, reason: 'Patron koltuğu testi', baseV: view.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}
/** A Lv.3 room with the Patron koltuğu on, in `mode`. */
async function bossRoom(owner, mode = 'auto') {
  const room = (await ok(call('POST', '/api/rooms', { title: `Patron ${rnd(2)}` }, owner.session), 'oda')).room.id;
  await h.sql.query('UPDATE users SET room_xp = 300 WHERE id = $1', [owner.user.id]);
  await ok(call('POST', '/api/rooms/update', { id: room, rules: { bossSeat: true, bossMode: mode } }, owner.session), 'patron koltuğu');
  return room;
}
const gift = (s, to, room, giftId, count) => ok(call('POST', '/api/gifts/send', { to, giftId, count, room, ref: rnd(6) }, s.session), `hediye ${giftId}×${count}`);
const read = async (room, s) => (await ok(call('GET', `/api/room?id=${room}`, null, s.session), 'oda')).room;
const MIN = 60_000;

describe('Patron koltuğu kuralı (saf)', () => {
  const cfg = { coins: 25_000, minutes: 10 };
  const T = 1_000_000;
  test('boşken tek seferde en az M jeton oturtur; azı oturtmaz', () => {
    assert.deepEqual(bossStep(null, { sender: 'a', coins: 24_999 }, cfg, T), { seat: null, event: null, before: null });
    const r = bossStep(null, { sender: 'a', coins: 25_000 }, cfg, T);
    assert.deepEqual(r, { seat: { holder: 'a', since: T, until: T + 10 * MIN, spent: 25_000 }, event: 'sat', before: null });
  });
  test('sahibinin her hediyesi süreyi 10 dakika uzatır, harcaması toplanır', () => {
    const seat = { holder: 'a', since: T, until: T + 10 * MIN, spent: 25_000 };
    assert.deepEqual(bossStep(seat, { sender: 'a', coins: 10 }, cfg, T + MIN).seat, { holder: 'a', since: T, until: T + 20 * MIN, spent: 25_010 });
  });
  test('5 saniyeden sonra, sahibin toplamından büyük tek gönderim koltuğu alır', () => {
    const seat = { holder: 'a', since: T, until: T + 10 * MIN, spent: 30_000 };
    assert.equal(bossStep(seat, { sender: 'b', coins: 90_000 }, cfg, T + BOSS_HOLD_MS).event, null, '5 saniye dolmadan alınmaz');
    assert.equal(bossStep(seat, { sender: 'b', coins: 30_000 }, cfg, T + 6_000).event, null, 'eşit yetmez');
    assert.deepEqual(bossStep(seat, { sender: 'b', coins: 30_001 }, cfg, T + 6_000), { seat: { holder: 'b', since: T + 6_000, until: T + 6_000 + 10 * MIN, spent: 30_001 }, event: 'took', before: null });
  });
  test('süresi dolmuş koltuk boştur; davet koltuğu hediyeyle değişmez', () => {
    const seat = { holder: 'a', since: T, until: T + 10 * MIN, spent: 30_000 };
    assert.deepEqual(bossStep(seat, { sender: 'b', coins: 100 }, cfg, T + 10 * MIN), { seat: null, event: null, before: 'a' });
    assert.equal(bossStep(seat, { sender: 'b', coins: 25_000 }, cfg, T + 11 * MIN).event, 'sat');
    const invited = { holder: 'a', since: T, until: null, spent: 0 };
    assert.equal(bossStep(invited, { sender: 'a', coins: 100 }, cfg, T + MIN).event, null);
    assert.equal(bossStep(null, { sender: 'a', coins: 0 }, { coins: 0, minutes: 10 }, T).event, null, 'jetonsuz gönderim sayılmaz');
  });
});

describe('Otomatik mod', () => {
  test('oturur, uzatır, 5 saniyeden sonra büyük tek gönderimle el değiştirir, süresi dolunca kalkar', async () => {
    const owner = await signUp('Patron Odası');
    const a = await signUp('Ayla');
    const b = await signUp('Burak');
    const room = await bossRoom(owner);
    await topUp(a, 70_000);
    await topUp(b, 130_000);

    // 24.750 jeton: 25.000'in altında kimse oturmaz.
    await gift(a, owner.user.id, room, 'g7', 5);
    assert.equal((await read(room, a)).boss, null);

    let from = lkCalls.length;
    await gift(a, owner.user.id, room, 'h4', 10); // 39.990
    let seen = await read(room, b);
    assert.deepEqual(seen.boss, { id: a.user.id, name: 'Ayla', avatarUrl: null }, 'eski uygulamalar room.boss okur');
    assert.equal(seen.bossSeat.holder.id, a.user.id);
    assert.equal(seen.bossSeat.spent, 39_990);
    assert.ok(Math.abs(Date.parse(seen.bossSeat.until) - Date.now() - 10 * MIN) < 30_000, '10 dakika');
    assert.ok(seen.bossSeat.left > 9 * 60 && seen.bossSeat.left <= 600);
    assert.ok(await until(() => packets(from, 'boss').length === 1 && packets(from, 'room').length >= 1));
    assert.deepEqual(packets(from, 'boss')[0], { type: 'boss', event: 'sat', user: a.user.id, name: 'Ayla' });

    // 5 saniye dolmadan daha büyük gönderim koltuğu almaz.
    await gift(b, owner.user.id, room, 'g7', 10); // 49.500
    assert.equal((await read(room, b)).boss.id, a.user.id);

    // Sahibin küçük bir hediyesi de süreyi 10 dakika uzatır.
    const before = Date.parse((await read(room, a)).bossSeat.until);
    from = lkCalls.length;
    await gift(a, owner.user.id, room, 'g1', 1);
    seen = await read(room, a);
    assert.equal(Date.parse(seen.bossSeat.until) - before, 10 * MIN);
    assert.equal(seen.bossSeat.spent, 40_000);
    assert.ok(await until(() => packets(from, 'room').length >= 1), 'uzayınca odadaki telefonlar yeniden okur');
    assert.equal(packets(from, 'boss').length, 0, 'uzatma sohbete yazılmaz');

    // 5 saniye geçti: sahibin toplamından (40.000) küçük gönderim almaz, büyüğü alır.
    await h.sql.query("UPDATE rooms SET boss_since = now() - interval '10 seconds' WHERE id = $1", [room]);
    await gift(b, owner.user.id, room, 'g7', 5); // 24.750
    assert.equal((await read(room, b)).boss.id, a.user.id);
    from = lkCalls.length;
    await gift(b, owner.user.id, room, 'g7', 10); // 49.500
    seen = await read(room, a);
    assert.equal(seen.boss.id, b.user.id);
    assert.equal(seen.bossSeat.spent, 49_500, 'yeni oturuş yalnız bu gönderimle başlar');
    assert.ok(Math.abs(Date.parse(seen.bossSeat.until) - Date.now() - 10 * MIN) < 30_000);
    assert.ok(await until(() => packets(from, 'boss').length === 1));
    assert.deepEqual(packets(from, 'boss')[0], { type: 'boss', event: 'took', user: b.user.id, name: 'Burak' });

    // Süre dolunca okuyan boş görür, tarama koltuğu boşaltır ve odaya söyler.
    from = lkCalls.length;
    await h.sql.query("UPDATE rooms SET boss_until = now() - interval '1 second' WHERE id = $1", [room]);
    assert.equal((await read(room, a)).boss, null);
    assert.ok(await until(() => packets(from, 'boss').length === 1));
    assert.deepEqual(packets(from, 'boss')[0], { type: 'boss', event: 'expired', user: b.user.id, name: 'Burak' });
    const row = (await h.sql.query('SELECT boss_id, boss_until, boss_spent FROM rooms WHERE id = $1', [room])).rows[0];
    assert.deepEqual([row.boss_id, row.boss_until, Number(row.boss_spent)], [null, null, 0]);
  });

  test('tutar ve süre Canlı ayarlardan; yasaklı oturmaz, yasaklanan sahip kalkar', async () => {
    const owner = await signUp('Ayarlı Oda');
    const c = await signUp('Cem');
    const d = await signUp('Deniz');
    const room = await bossRoom(owner);
    await topUp(c, 10_000);
    await topUp(d, 10_000);
    await setLive({ boss_seat_coins: 1_000, boss_seat_minutes: 2 });
    try {
      const seat = (await read(room, c)).bossSeat;
      assert.deepEqual([seat.minCoins, seat.minutes, seat.holdSeconds], [1_000, 2, 5]);
      await ok(call('POST', '/api/rooms/ban', { room, user: d.user.id, minutes: 30 }, owner.session), 'çıkar');
      await gift(d, owner.user.id, room, 'h10', 1); // 1.299
      assert.equal((await read(room, c)).boss, null, 'odadan çıkarılan oturmaz');
      await gift(c, owner.user.id, room, 'h10', 1);
      const seen = await read(room, c);
      assert.equal(seen.boss.id, c.user.id);
      assert.ok(Math.abs(Date.parse(seen.bossSeat.until) - Date.now() - 2 * MIN) < 30_000, '2 dakika');
      const from = lkCalls.length;
      await ok(call('POST', '/api/rooms/ban', { room, user: c.user.id, minutes: 30 }, owner.session), 'sahibi çıkar');
      assert.equal((await read(room, owner)).boss, null);
      assert.ok(await until(() => packets(from, 'boss').some((p) => p.event === 'removed' && p.user === c.user.id)));
    } finally {
      await setLive({ boss_seat_coins: null, boss_seat_minutes: null });
    }
  });
});

describe('Davet modu', () => {
  test('yalnız sahip oturtur; hediye koltuğu değiştirmez; sahibi kalkar, oda sahibi indirir', async () => {
    const owner = await signUp('Davet Odası');
    const e = await signUp('Ece');
    const f = await signUp('Furkan');
    const room = await bossRoom(owner);
    const boss = (s, body) => call('POST', '/api/rooms/boss', { room, ...body }, s.session);
    assert.equal((await boss(owner, { action: 'seat', user: e.user.id }))[0], 409, 'otomatik modda oturtulmaz');
    let from = lkCalls.length;
    await ok(call('POST', '/api/rooms/update', { id: room, rules: { bossMode: 'invite' } }, owner.session), 'davet modu');
    assert.ok(await until(() => packets(from, 'boss').some((p) => p.event === 'mode')));
    assert.deepEqual(packets(from, 'boss').find((p) => p.event === 'mode'), { type: 'boss', event: 'mode', user: null, name: null, mode: 'invite' });

    await topUp(f, 50_000);
    await gift(f, owner.user.id, room, 'g7', 10);
    assert.equal((await read(room, f)).boss, null, 'davet modunda hediye oturtmaz');
    assert.equal((await boss(f, { action: 'seat', user: f.user.id }))[0], 403, 'yalnız oda sahibi');

    from = lkCalls.length;
    let j = await ok(boss(owner, { action: 'seat', user: e.user.id }), 'oturt');
    assert.equal(j.room.boss.id, e.user.id);
    assert.deepEqual([j.room.bossSeat.until, j.room.bossSeat.left, j.room.bossSeat.mode], [null, null, 'invite'], 'davet koltuğunun bitişi yok');
    assert.ok(await until(() => packets(from, 'boss').length === 1));
    assert.deepEqual(packets(from, 'boss')[0], { type: 'boss', event: 'sat', user: e.user.id, name: 'Ece' });

    from = lkCalls.length;
    j = await ok(boss(owner, { action: 'seat', user: f.user.id }), 'başkasını oturt');
    assert.equal(j.room.boss.id, f.user.id);
    assert.ok(await until(() => packets(from, 'boss').length === 2));
    assert.deepEqual(packets(from, 'boss').map((p) => [p.event, p.user]), [['removed', e.user.id], ['sat', f.user.id]]);

    assert.equal((await boss(e, { action: 'leave' }))[0], 409, 'koltukta olmayan kalkamaz');
    from = lkCalls.length;
    j = await ok(boss(f, { action: 'leave' }), 'kalk');
    assert.equal(j.room.boss, null);
    assert.ok(await until(() => packets(from, 'boss').some((p) => p.event === 'left' && p.user === f.user.id)));

    await ok(boss(owner, { action: 'seat', user: e.user.id }), 'yeniden oturt');
    from = lkCalls.length;
    j = await ok(boss(owner, { action: 'clear' }), 'indir');
    assert.equal(j.room.boss, null);
    assert.ok(await until(() => packets(from, 'boss').some((p) => p.event === 'removed' && p.user === e.user.id)));
    assert.equal((await boss(owner, { action: 'clear' }))[0], 409, 'boş koltuk');

    await ok(call('POST', '/api/rooms/ban', { room, user: f.user.id, minutes: null }, owner.session), 'kara liste');
    assert.equal((await boss(owner, { action: 'seat', user: f.user.id }))[0], 403, 'kara listedeki oturamaz');
    assert.equal((await boss(owner, { action: 'dans' }))[0], 400);

    // Mod değişince ya da koltuk kapanınca koltuk boşalır.
    await ok(boss(owner, { action: 'seat', user: e.user.id }), 'oturt');
    j = await ok(call('POST', '/api/rooms/update', { id: room, rules: { bossMode: 'auto' } }, owner.session), 'otomatik');
    assert.equal(j.room.boss, null);
    await ok(call('POST', '/api/rooms/update', { id: room, rules: { bossSeat: false } }, owner.session), 'kapat');
    assert.equal((await boss(owner, { action: 'clear' }))[0], 409, 'kapalı koltuk');
  });
});
