// Odalar arası PK (pk-cross.mjs) and Oda Sahibi Merkezi (room-owner.mjs) against a real Postgres: only room staff
// invite, answer or end; one PK per room of either kind; blocks between the owners refuse it; gifts in each room
// score once for that room after the countdown, the same score for both rooms; ending early or closing a room
// cancels it; the owner's numbers come from the server's own records, for the owner only.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ PK_PREP_MS: '300' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const topUp = async (s) => assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 10000, ref: rnd(6) }, s))[0], 200);
const gift = (s, to, room, ref = rnd(6)) => call('POST', '/api/gifts/send', { to, giftId: 'g4', count: 1, room, ref }, s);
const read = async (s, room) => (await call('GET', `/api/rooms/pk?room=${room}`, null, s))[1].cross;
const invite = (s, room, to, durationMin = 15, ref = rnd(6)) => call('POST', '/api/rooms/pk/cross', { room, to, durationMin, ref }, s);
const answer = (s, room, id, accept) => call('POST', '/api/rooms/pk/cross/answer', { room, id, accept }, s);
const end = (s, room) => call('POST', '/api/rooms/pk/cross/end', { room }, s);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

async function roomOf(name) {
  const owner = await signUp(`${name} Sahibi`);
  const admin = await signUp(`${name} Yönetici`);
  const [, j] = await call('POST', '/api/rooms', { title: `${name} Odası` }, owner.session);
  await ok(call('POST', '/api/rooms/admin', { room: j.room.id, user: admin.user.id, admin: true }, owner.session), 'yönetici');
  return { owner, admin, id: j.room.id, title: j.room.title };
}
/** A name part of letters only (digits could read as contact details in a room name). */
const tag = () => rnd(2).replace(/\d/g, (d) => 'ghijklmnop'[d]);
async function setUp() {
  const a = await roomOf(`Kırmızı ${tag()}`);
  const b = await roomOf(`Mavi ${tag()}`);
  const fan = await signUp('Destekçi');
  const member = await signUp('Üye');
  await topUp(fan.session);
  return { a, b, fan, member };
}
/** A running cross-room PK between a and b, past its countdown. */
async function running(a, b) {
  const inv = await ok(invite(a.owner.session, a.id, b.id), 'davet');
  const acc = await ok(answer(b.admin.session, b.id, inv.cross.id, true), 'kabul');
  await wait(400);
  return acc.cross;
}

describe('Odalar arası PK', () => {
  test('davet: yalnız oda yetkilisi; izinli süre; tekrar istek aynı davet; iki oda da görür; oda başına tek PK', async () => {
    const { a, b, member } = await setUp();
    const c = await roomOf(`Üçüncü ${tag()}`);
    const [st0, e0] = await invite(member.session, a.id, b.id);
    assert.equal(st0, 403);
    assert.equal(e0.error, 'PK’yı oda sahibi veya yöneticiler başlatabilir');
    assert.equal((await invite(a.owner.session, a.id, a.id))[0], 400, 'kendine davet');
    assert.equal((await invite(a.owner.session, a.id, b.id, 20))[0], 400, 'izinsiz süre');
    const list = await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${a.id}`, null, a.admin.session), 'oda listesi');
    assert.ok(list.rooms.some((r) => r.id === b.id) && !list.rooms.some((r) => r.id === a.id), 'kendi odası listede yok');
    assert.equal((await call('GET', `/api/rooms/pk/cross/rooms?room=${a.id}`, null, member.session))[0], 403);

    const ref = rnd(6);
    const r = await ok(invite(a.admin.session, a.id, b.id, 30, ref), 'davet');
    assert.equal(r.cross.status, 'invite');
    assert.equal(r.cross.durationMin, 30);
    assert.equal(r.cross.red.room.id, a.id);
    assert.equal(r.cross.blue.room.title, b.title);
    assert.equal(r.cross.startAt, null, 'kabul edilmeden saat başlamaz');
    const left = Date.parse(r.cross.inviteExpiresAt) - Date.parse(r.now);
    assert.ok(left > 55_000 && left <= 60_000, `60 sn içinde yanıt (${left})`);
    assert.equal((await ok(invite(a.admin.session, a.id, b.id, 30, ref), 'tekrar')).cross.id, r.cross.id, 'aynı istek kimliği aynı davet');
    assert.equal((await read(b.owner.session, b.id)).id, r.cross.id, 'davet edilen oda da görür');
    assert.equal((await read(member.session, a.id)).id, r.cross.id, 'odadaki herkes görür');

    const [st1, e1] = await invite(a.owner.session, a.id, c.id);
    assert.equal(st1, 409);
    assert.equal(e1.error, 'Bu odada zaten devam eden bir PK var');
    const [st2, e2] = await invite(c.owner.session, c.id, b.id);
    assert.equal(st2, 409);
    assert.equal(e2.error, `${b.title} şu an başka bir PK’da.`);
    const busyList = await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${c.id}`, null, c.owner.session), 'oda listesi');
    assert.ok(!busyList.rooms.some((x) => x.id === a.id || x.id === b.id), 'PK’daki odalar listede yok');
    // An Oda içi PK waits too (pk.mjs), and the other way round.
    const solo = { mode: 'solo', durationMin: 15, participants: [a.owner.user.id, a.admin.user.id] };
    const [st3, e3] = await call('POST', '/api/rooms/pk', { room: b.id, ...solo, ref: rnd(6) }, b.owner.session);
    assert.equal(st3, 409);
    assert.equal(e3.error, 'Bu odada zaten devam eden bir PK var');
    await ok(call('POST', '/api/rooms/pk', { room: c.id, ...solo, ref: rnd(6) }, c.owner.session), 'oda içi PK');
    const d = await roomOf(`Dördüncü ${tag()}`);
    const [st4] = await invite(d.owner.session, d.id, c.id);
    assert.equal(st4, 409, 'oda içi PK’daki oda davet edilemez');
  });

  test('yanıt: yalnız davet edilen odanın yetkilisi; ret; süresi dolan davet; kimlik ve oda ID’siyle arama', async () => {
    const { a, b, member } = await setUp();
    const inv = await ok(invite(a.owner.session, a.id, b.id), 'davet');
    assert.equal((await answer(member.session, b.id, inv.cross.id, true))[0], 403, 'üye yanıtlayamaz');
    assert.equal((await answer(a.owner.session, a.id, inv.cross.id, true))[0], 404, 'davet eden oda kabul edemez');
    const no = await ok(answer(b.owner.session, b.id, inv.cross.id, false), 'ret');
    assert.equal(no.cross.status, 'declined');
    assert.equal((await ok(answer(b.owner.session, b.id, inv.cross.id, false), 'tekrar ret')).cross.status, 'declined', 'tekrar istek aynı yanıt');
    assert.equal((await answer(b.owner.session, b.id, inv.cross.id, true))[0], 409, 'reddedilen davet kabul edilemez');
    assert.equal((await read(a.admin.session, a.id)).status, 'declined', 'davet eden oda reddi görür');

    const again = await ok(invite(a.owner.session, a.id, b.id), 'yeni davet');
    await q("UPDATE room_cross_pks SET invite_expires_at = now() - interval '1 second' WHERE id = $1", [again.cross.id]);
    const [st, e] = await answer(b.admin.session, b.id, again.cross.id, true);
    assert.equal(st, 410);
    assert.equal(e.error, 'Davetin süresi doldu');
    assert.equal((await read(a.owner.session, a.id)).status, 'expired');

    const code = String(10_000_000 + [...b.id].reduce((x, ch) => (x * 31 + ch.charCodeAt(0)) % 9_000_000, 7));
    const byCode = await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${a.id}&q=${code}`, null, a.owner.session), 'ID ile arama');
    assert.deepEqual(byCode.rooms.map((r) => r.id), [b.id]);
    const part = b.title.split(' ').slice(0, 2).join(' ').toLowerCase();
    const byName = await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${a.id}&q=${encodeURIComponent(part)}`, null, a.owner.session), 'adla arama');
    assert.deepEqual(byName.rooms.map((r) => r.id), [b.id]);
  });

  test('puan: geri sayımda sayılmaz; her odanın hediyesi kendi odasına bir kez; iki oda aynı skoru görür', async () => {
    const { a, b, fan } = await setUp();
    const inv = await ok(invite(a.owner.session, a.id, b.id), 'davet');
    await gift(fan.session, a.owner.user.id, a.id);
    assert.equal((await read(fan.session, a.id)).red.score, 0, 'davet sırasında sayılmaz');
    const acc = await ok(answer(b.admin.session, b.id, inv.cross.id, true), 'kabul');
    assert.equal(acc.cross.status, 'active');
    assert.equal(Date.parse(acc.cross.endAt) - Date.parse(acc.cross.startAt), 15 * 60_000);
    await gift(fan.session, a.owner.user.id, a.id);
    assert.equal((await read(fan.session, a.id)).red.score, 0, 'geri sayımda sayılmaz');
    await wait(400);
    const ref = rnd(6);
    await ok(gift(fan.session, a.admin.user.id, a.id, ref), 'hediye');
    assert.equal((await ok(gift(fan.session, a.admin.user.id, a.id, ref), 'tekrar')).replay, true);
    await ok(gift(fan.session, b.owner.user.id, `oda-${b.id}`), 'mavi odaya hediye');
    await ok(gift(fan.session, b.owner.user.id, b.id), 'mavi odaya hediye');
    await ok(gift(fan.session, b.admin.user.id, b.id), 'mavi odaya hediye');
    await ok(gift(fan.session, a.owner.user.id), 'oda dışı');
    const fromA = await read(a.owner.session, a.id);
    const fromB = await read(b.owner.session, b.id);
    assert.deepEqual([fromA.red.score, fromA.blue.score], [200, 600]);
    assert.deepEqual([fromB.red.score, fromB.blue.score], [200, 600], 'iki oda aynı skoru görür');
    assert.deepEqual(fromA.pairs, fromB.pairs);
    const rows = (list) => list.map((p) => [p.to, p.side, p.points, p.gifts].join(' ')).sort();
    assert.deepEqual(
      rows(fromA.pairs),
      rows([
        { to: b.owner.user.id, side: 'blue', points: 400, gifts: 2 },
        { to: a.admin.user.id, side: 'red', points: 200, gifts: 1 },
        { to: b.admin.user.id, side: 'blue', points: 200, gifts: 1 },
      ]),
    );
    assert.ok(fromA.people.some((p) => p.id === fan.user.id && p.name === 'Destekçi'));

    // Time's up: done for both, and the rooms are free again.
    await q("UPDATE room_cross_pks SET start_at = now() - interval '16 minutes', end_at = now() - interval '1 minute' WHERE id = $1", [inv.cross.id]);
    await ok(gift(fan.session, a.owner.user.id, a.id), 'bitince hediye');
    const done = await read(b.admin.session, b.id);
    assert.equal(done.status, 'done');
    assert.equal(done.red.score, 200, 'bittikten sonra sayılmaz');
    assert.equal((await read(fan.session, a.id)).status, 'done');
    await ok(invite(b.owner.session, b.id, a.id), 'yeni PK');
  });

  test('engel: sahipler arasında davet yok, liste göstermez; izleyen engellediğinin hediyesini görmez ama skor sayar', async () => {
    const { a, b, fan } = await setUp();
    await ok(call('POST', '/api/block', { to: a.owner.user.id }, b.owner.session), 'engel');
    const [st, e] = await invite(a.admin.session, a.id, b.id);
    assert.equal(st, 403);
    assert.equal(e.error, 'Bu odayı PK’ya davet edemezsin');
    const list = await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${a.id}`, null, a.admin.session), 'liste');
    assert.ok(!list.rooms.some((r) => r.id === b.id), 'engelli sahibin odası listede yok');
    await ok(call('POST', '/api/block', { to: a.owner.user.id, block: false }, b.owner.session), 'engel kalktı');

    // The invite went out before the block: the answer is refused once they block each other.
    const inv = await ok(invite(a.admin.session, a.id, b.id), 'davet');
    await ok(call('POST', '/api/block', { to: b.owner.user.id }, a.owner.session), 'engel');
    assert.equal((await answer(b.admin.session, b.id, inv.cross.id, true))[0], 403);
    await ok(call('POST', '/api/block', { to: b.owner.user.id, block: false }, a.owner.session), 'engel kalktı');
    await ok(answer(b.admin.session, b.id, inv.cross.id, true), 'kabul');
    await wait(400);

    const viewer = await signUp('İzleyen');
    await ok(call('POST', '/api/block', { to: fan.user.id }, viewer.session), 'izleyen engeller');
    await ok(gift(fan.session, b.admin.user.id, b.id), 'hediye');
    const seen = await read(viewer.session, b.id);
    assert.equal(seen.blue.score, 200, 'skor sayar');
    assert.deepEqual(seen.pairs, [], 'engellediğinin hediyesi görünmez');
    assert.ok(!seen.people.some((p) => p.id === fan.user.id));
    assert.equal((await read(b.owner.session, b.id)).pairs.length, 1, 'başkaları görür');
  });

  test('erken bitirme: iki taraf da bitirir, kazanan yok; oda kapanınca biter; hesap silinince kim yaptı silinir', async () => {
    const { a, b, fan, member } = await setUp();
    await running(a, b);
    assert.equal((await end(member.session, b.id))[0], 403, 'üye bitiremez');
    const stop = await ok(end(b.admin.session, b.id), 'bitir');
    assert.equal(stop.cross.status, 'cancelled');
    assert.equal(stop.cross.reason, 'staff');
    assert.equal(stop.cross.endedRoom, b.id);
    await ok(gift(fan.session, a.owner.user.id, a.id), 'sonra hediye');
    const after = await read(a.owner.session, a.id);
    assert.equal(after.status, 'cancelled', 'diğer oda da görür');
    assert.equal(after.red.score, 0, 'iptal sonrası sayılmaz');
    assert.equal((await end(a.owner.session, a.id))[0], 404, 'bitirilecek PK yok');

    // Withdrawn before an answer.
    await ok(invite(a.owner.session, a.id, b.id), 'davet');
    assert.equal((await ok(end(a.admin.session, a.id), 'geri al')).cross.status, 'cancelled');

    // A closed room ends it, for the other room too.
    const pk = await running(a, b);
    await ok(call('POST', '/api/rooms/close', { id: a.id }, a.owner.session), 'oda kapandı');
    const closed = await read(b.owner.session, b.id);
    assert.equal(closed.id, pk.id);
    assert.equal(closed.status, 'cancelled');
    assert.equal(closed.reason, 'room_closed');
    assert.equal(closed.endedRoom, a.id);

    // A room closed another way (the owner's account deleted) is seen at the next read.
    const c = await roomOf(`Silinecek ${tag()}`);
    const pk2 = await running(c, b);
    await ok(call('DELETE', '/api/me', null, b.admin.session), 'yönetici hesabı silindi');
    assert.equal((await q('SELECT answered_by FROM room_cross_pks WHERE id = $1', [pk2.id])).rows[0].answered_by, null, 'kim kabul etti silinir');
    await ok(call('DELETE', '/api/me', null, c.owner.session), 'hesap silindi');
    const gone = await read(b.owner.session, b.id);
    assert.equal(gone.status, 'cancelled');
    assert.equal(gone.reason, 'room_closed');
    assert.equal((await q('SELECT invited_by FROM room_cross_pks WHERE id = $1', [pk2.id])).rows[0].invited_by, null, 'kim davet etti silinir');
  });
});

describe('Oda Sahibi Merkezi', () => {
  test('yalnız sahibe; bu oturumun ziyaretçileri, en kalabalık anı, hediyeleri ve oda seviyesi', async () => {
    const { a, fan, member } = await setUp();
    assert.equal((await call('GET', `/api/rooms/owner-stats?room=${a.id}`, null, a.admin.session))[0], 403, 'yönetici göremez');
    assert.equal((await call('GET', `/api/rooms/owner-stats?room=${a.id}`, null, member.session))[0], 403);
    const empty = await ok(call('GET', `/api/rooms/owner-stats?room=${a.id}`, null, a.owner.session), 'boş');
    assert.equal(empty.session, false, 'sahip odada değilken son 24 saat');
    assert.equal(empty.minutes, null);
    assert.deepEqual([empty.visitors, empty.peak, empty.gifts.coins, empty.level, empty.nextXp], [0, 0, 0, 1, 100]);
    assert.equal(empty.hours.length, 10);

    // The owner came in 30 minutes ago; one visitor came and went, another is still here, one left before.
    const name = `oda-${a.id}`;
    await q("INSERT INTO room_presence (room, identity, joined_at) VALUES ($1, $2, now() - interval '30 minutes'), ($1, $3, now() - interval '15 minutes')", [name, a.owner.user.id, member.user.id]);
    await q(
      `INSERT INTO presence_log (user_id, room, joined_at, left_at, seconds) VALUES
         ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes', 600),
         ($3, $2, now() - interval '3 hours', now() - interval '2 hours', 3600)`,
      [fan.user.id, name, a.admin.user.id],
    );
    await ok(gift(fan.session, a.owner.user.id, a.id), 'hediye');
    await ok(gift(fan.session, member.user.id, `oda-${a.id}`), 'hediye');
    await topUp(a.owner.session);
    await ok(gift(a.owner.session, member.user.id, a.id), 'sahibin kendi hediyesi');
    await q("INSERT INTO room_members (room_id, user_id, status) VALUES ($1, $2, 'member')", [a.id, member.user.id]);

    const s = await ok(call('GET', `/api/rooms/owner-stats?room=${a.id}`, null, a.owner.session), 'oturum');
    assert.equal(s.session, true);
    assert.ok(s.minutes >= 29 && s.minutes <= 31, `süre ${s.minutes}`);
    assert.equal(s.visitors, 2, 'sahip ve oturumdan önce çıkan sayılmaz');
    assert.equal(s.peak, 3, 'aynı anda en çok 3 kişi');
    assert.equal(s.listeners, 2);
    assert.deepEqual(s.gifts, { coins: 400, count: 2, senders: 1 }, 'sahibin kendi hediyesi sayılmaz');
    assert.equal(s.newMembers, 1);
    assert.equal(s.xp, 600, 'odadaki bütün hediyeler oda seviyesine');
    assert.deepEqual([s.level, s.levelXp, s.nextXp], [4, 600, 1000]);
    assert.ok(s.hours.at(-1).people >= 2, 'bu saatte en az sahip ve kalan ziyaretçi');
    assert.ok(s.hours.slice(0, -1).some((x) => x.people >= 1), 'önceki saatler de sayılır');
    assert.ok(!JSON.stringify(s).includes(fan.user.id), 'kimsenin adı ya da kimliği yok');
  });
});
