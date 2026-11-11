// Following a room (room-follow.mjs) and the room card's member list (room-members.mjs) against a real Postgres and
// a fake LiveKit: follow and unfollow with the count on the room read, blocks and kicks, the Odalarım list (open
// rooms first, closed ones marked, a reopened room still followed), the "room opened" notice (once per 6 hours,
// not for people who take no room invites), and the member list's roles, filters, pages and privacy.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

/** Who is in each LiveKit room, as ListParticipants answers. */
const voice = new Map();
const LK_PORT = 22000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    const send = (j) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(j));
    if (method === 'ListParticipants') return send({ participants: (voice.get(b.room) ?? []).map((identity) => ({ identity, attributes: {} })) });
    if (method === 'ListRooms') return send({ rooms: [] });
    send({});
  });
});
await new Promise((r) => lk.listen(LK_PORT, '127.0.0.1', r));
after(() => new Promise((r) => (lk.closeAllConnections?.(), lk.close(r))));

const h = startApi({ LIVEKIT_API_URL: `http://127.0.0.1:${LK_PORT}`, ROOM_BADGE_CACHE_MS: '0', AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const q = (s, p) => h.sql.query(s, p);
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const status = async (p) => (await p)[0];
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
const openRoom = async (owner, extra = {}) => (await ok(call('POST', '/api/rooms', { title: `Oda ${rnd(2)}`, ...extra }, owner.session), 'oda')).room.id;
const inVoice = (room, ...people) => voice.set(`oda-${room}`, people.map((u) => u.user.id));
const follow = (room, who) => call('POST', '/api/rooms/follow', { room }, who.session);
const unfollow = (room, who) => call('POST', '/api/rooms/unfollow', { room }, who.session);
const readRoom = async (room, who) => (await ok(call('GET', `/api/room?id=${room}`, null, who.session), 'oda oku')).room;
const followed = async (who) => (await ok(call('GET', '/api/rooms/followed', null, who.session), 'takip ettiklerim')).rooms;
const notices = async (who) => (await ok(call('GET', '/api/me/room-invites', null, who.session), 'bildirimler')).invites;
const enter = (room, who) => call('GET', `/token?room=oda-${room}`, null, who.session);
const openNotices = async (owner) => (await q('SELECT room_id, recipients FROM room_open_notices WHERE owner_id = $1 ORDER BY id', [owner.user.id])).rows;
const list = (room, who, filter = 'all', offset = 0) => call('GET', `/api/rooms/members/list?room=${room}&filter=${filter}&offset=${offset}`, null, who.session);

describe('Oda takibi', () => {
  test('takip et ve bırak: sayı ve "takip ediyor muyum" oda okumasında; sahip kendi odasını takip edemez', async () => {
    const owner = await signUp('Takip Sahibi');
    const a = await signUp('Takipçi A');
    const b = await signUp('Takipçi B');
    const room = await openRoom(owner);
    assert.deepEqual([(await readRoom(room, a)).followers, (await readRoom(room, a)).following], [0, false]);
    assert.deepEqual(await ok(follow(room, a), 'takip'), { following: true, followers: 1 });
    assert.deepEqual(await ok(follow(room, a), 'yeniden takip'), { following: true, followers: 1 }, 'iki kez takip bir sayılır');
    assert.deepEqual(await ok(follow(room, b), 'takip b'), { following: true, followers: 2 });
    assert.deepEqual([(await readRoom(room, a)).followers, (await readRoom(room, a)).following], [2, true]);
    assert.deepEqual([(await readRoom(room, owner)).followers, (await readRoom(room, owner)).following], [2, false]);
    assert.equal(await status(follow(room, owner)), 400, 'sahip kendi odasını takip edemez');
    assert.deepEqual(await ok(unfollow(room, a), 'bırak'), { following: false, followers: 1 });
    assert.deepEqual(await ok(unfollow(room, a), 'yeniden bırak'), { following: false, followers: 1 });
    assert.equal((await readRoom(room, a)).following, false);
    assert.equal(await status(follow('yok', a)), 400);
    assert.equal(await status(call('POST', '/api/rooms/follow', { room }, null)), 401, 'oturumsuz olmaz');
  });

  test('engel iki yönde de takibi reddeder ve bitirir; odadan atılan takip edemez, listesinde de görmez', async () => {
    const owner = await signUp('Engel Sahibi');
    const fan = await signUp('Engellenen Takipçi');
    const hater = await signUp('Engelleyen Takipçi');
    const kicked = await signUp('Atılan Takipçi');
    const room = await openRoom(owner);
    for (const u of [fan, hater, kicked]) await ok(follow(room, u), 'takip');
    assert.equal((await readRoom(room, owner)).followers, 3);

    await ok(call('POST', '/api/block', { to: fan.user.id, block: true }, owner.session), 'sahip engeller');
    await ok(call('POST', '/api/block', { to: owner.user.id, block: true }, hater.session), 'takipçi engeller');
    assert.equal((await readRoom(room, owner)).followers, 1, 'engel takibi bitirir');
    assert.equal(await status(follow(room, fan)), 403, 'sahibin engellediği takip edemez');
    assert.equal(await status(follow(room, hater)), 403, 'sahibi engelleyen takip edemez');
    assert.deepEqual(await followed(fan), []);
    assert.deepEqual(await followed(hater), []);
    // The block is lifted: the follow doesn't come back on its own.
    await ok(call('POST', '/api/block', { to: fan.user.id, block: false }, owner.session), 'engel kalkar');
    assert.deepEqual(await followed(fan), []);
    assert.equal((await ok(follow(room, fan), 'yeniden takip')).followers, 2);

    await ok(call('POST', '/api/rooms/ban', { room, user: kicked.user.id, minutes: 10 }, owner.session), 'at');
    assert.deepEqual(await followed(kicked), [], 'atıldığı oda listesinde yok');
    const other = await signUp('Atılan Yeni');
    await ok(call('POST', '/api/rooms/ban', { room, user: other.user.id, minutes: 10 }, owner.session), 'at 2');
    assert.equal(await status(follow(room, other)), 403, 'atılan takip edemez');
    await ok(call('POST', '/api/rooms/unban', { room, user: kicked.user.id }, owner.session), 'geri al');
    assert.deepEqual((await followed(kicked)).map((r) => r.id), [room], 'süre bitince yine listede');
    assert.equal((await ok(unfollow(room, kicked), 'bırakmak hep olur')).following, false);
  });

  test('Odalarım: açık odalar önce (kalabalık olan üstte), kapalı olan işaretli; yeniden açılan oda takipte kalır', async () => {
    const me = await signUp('Liste Takipçisi');
    const o1 = await signUp('Boş Oda Sahibi');
    const o2 = await signUp('Dolu Oda Sahibi');
    const o3 = await signUp('Kapanan Oda Sahibi');
    const r1 = await openRoom(o1);
    const r2 = await openRoom(o2);
    const r3 = await openRoom(o3);
    const own = await openRoom(me);
    for (const r of [r3, r1, r2]) await ok(follow(r, me), 'takip');
    await q("INSERT INTO room_presence (room, identity, sid) VALUES ($1, 'a', '1'), ($1, 'b', '2')", [`oda-${r2}`]);
    await ok(call('POST', '/api/rooms/close', { id: r3 }, o3.session), 'kapat');

    let rooms = await followed(me);
    assert.deepEqual(rooms.map((r) => [r.id, r.closed, r.listeners]), [[r2, false, 2], [r1, false, 0], [r3, true, 0]]);
    assert.ok(!rooms.some((r) => r.id === own));
    assert.equal(rooms[0].owner.id, o2.user.id);

    // The same account opens a room again: a new room id, still followed, and its follower count came along.
    const r3b = await openRoom(o3);
    rooms = await followed(me);
    assert.deepEqual([rooms[0].id, rooms.slice(1).map((r) => r.id).sort(), rooms.map((r) => r.closed)], [r2, [r1, r3b].sort(), [false, false, false]]);
    assert.deepEqual([(await readRoom(r3b, me)).followers, (await readRoom(r3b, me)).following], [1, true]);
    // Unfollowing by the old room id works too: the follow is on the room's account.
    await ok(unfollow(r3, me), 'eski oda ile bırak');
    assert.deepEqual((await followed(me)).map((r) => r.id).sort(), [r1, r2].sort());
    // Odalarım › Katıl is untouched by follows.
    assert.deepEqual((await ok(call('GET', '/api/rooms/joined', null, me.session), 'katıl')).rooms, []);
  });

  test('en çok 200 oda takip edilir; takip dakikada 30 istekle sınırlı', async () => {
    const me = await signUp('Çok Takip Eden');
    const owner = await signUp('Son Oda Sahibi');
    const room = await openRoom(owner);
    await q(
      `WITH made AS (INSERT INTO users (name) SELECT 'Oda Hesabı ' || g FROM generate_series(1, 200) g RETURNING id)
       INSERT INTO room_follows (owner_id, user_id) SELECT id, $1 FROM made`,
      [me.user.id],
    );
    const [st, j] = await follow(room, me);
    assert.equal(st, 409, j.error);
    assert.match(j.error, /200/);
    await q('DELETE FROM room_follows WHERE user_id = $1', [me.user.id]);
    assert.equal((await ok(follow(room, me), 'yer açılınca')).following, true);

    const fast = await signUp('Hızlı Takipçi');
    const codes = [];
    for (let i = 0; i < 32; i++) codes.push(await status(i % 2 ? unfollow(room, fast) : follow(room, fast)));
    assert.deepEqual(codes.slice(0, 30), Array(30).fill(200));
    assert.deepEqual(codes.slice(30), [429, 429]);
  });
});

describe('Takip edilen oda açıldı', () => {
  test('sahip odasına girince takipçilere bir kez haber gider; 6 saatte bir, davet almayana ve engelliye gitmez', async () => {
    const owner = await signUp('Açan Sahip');
    const f1 = await signUp('Haberli 1');
    const f2 = await signUp('Haberli 2');
    const shy = await signUp('Davet Almayan');
    const picky = await signUp('Yalnız Takip Ettiklerinden');
    const kicked = await signUp('Atılmış Takipçi');
    const guest = await signUp('Misafir');
    const room = await openRoom(owner);
    for (const u of [f1, f2, shy, picky, kicked]) await ok(follow(room, u), 'takip');
    await ok(call('PATCH', '/api/me/privacy', { invitesFrom: 'nobody' }, shy.session), 'kimseden');
    await ok(call('PATCH', '/api/me/privacy', { invitesFrom: 'following' }, picky.session), 'takip ettiklerimden');
    await ok(call('POST', '/api/rooms/ban', { room, user: kicked.user.id, minutes: 30 }, owner.session), 'at');

    // Someone else coming in is not the room opening.
    assert.equal(await status(enter(room, guest)), 200);
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(await openNotices(owner), []);
    assert.deepEqual(await notices(f1), []);

    assert.equal(await status(enter(room, owner)), 200);
    assert.ok(await until(async () => (await openNotices(owner)).length === 1), 'bildirim yazılır');
    assert.deepEqual(await openNotices(owner), [{ room_id: room, recipients: 3 }]);
    const got = await notices(f1);
    assert.deepEqual(got.map((i) => [i.kind, i.room.id, i.host.id]), [['open', room, owner.user.id]]);
    assert.equal((await notices(f2)).length, 1);
    assert.equal((await notices(picky)).length, 1, 'odayı takip eden, "takip ettiklerimden" ayarıyla da alır');
    assert.deepEqual(await notices(shy), [], 'davet almayan almaz');
    assert.deepEqual(await notices(kicked), [], 'atılan almaz');
    assert.deepEqual(await notices(guest), [], 'takip etmeyen almaz');

    // Later followers were not told; a block hides it.
    const late = await signUp('Sonradan Takipçi');
    await ok(follow(room, late), 'geç takip');
    assert.deepEqual(await notices(late), []);
    await ok(call('POST', '/api/block', { to: owner.user.id, block: true }, f2.session), 'engel');
    assert.deepEqual(await notices(f2), []);

    // The owner comes in again, and closes and reopens: still one in 6 hours.
    assert.equal(await status(enter(room, owner)), 200);
    await ok(call('POST', '/api/rooms/close', { id: room }, owner.session), 'kapat');
    assert.deepEqual(await notices(f1), [], 'kapanan odanın haberi gider');
    const room2 = await openRoom(owner);
    assert.equal(await status(enter(room2, owner)), 200);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await openNotices(owner)).length, 1, '6 saat içinde ikinci bildirim yok');

    await q("UPDATE room_open_notices SET created_at = now() - interval '7 hours' WHERE owner_id = $1", [owner.user.id]);
    assert.equal(await status(enter(room2, owner)), 200);
    assert.ok(await until(async () => (await openNotices(owner)).length === 2), '6 saat sonra yeniden');
    // f1, picky and the one who followed later; the kick was in the old room.
    assert.deepEqual((await openNotices(owner))[1], { room_id: room2, recipients: 4 });
    assert.deepEqual((await notices(late)).map((i) => [i.kind, i.room.id]), [['open', room2]]);
    assert.deepEqual((await notices(f1)).map((i) => i.room.id), [room2], 'eski bildirim 6 saatten eskiyse gelmez');
  });

  test('takipçisi olmayan odada bildirim yazılmaz; takipçi daveti ile aynı listede, yenisi üstte', async () => {
    const owner = await signUp('Takipçisiz Sahip');
    const fan = await signUp('İkisini de Alan');
    const room = await openRoom(owner);
    assert.equal(await status(enter(room, owner)), 200);
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(await openNotices(owner), []);

    await ok(call('POST', '/api/follow', { to: owner.user.id }, fan.session), 'hesabı takip');
    await ok(follow(room, fan), 'odayı takip');
    await ok(call('POST', '/api/rooms/invite-followers', { room }, owner.session), 'takipçi daveti');
    assert.equal(await status(enter(room, owner)), 200);
    assert.ok(await until(async () => (await openNotices(owner)).length === 1));
    assert.deepEqual((await notices(fan)).map((i) => i.kind ?? 'invite'), ['open', 'invite']);
  });

  test('hesap silinince takipleri ve bildirimleri gider', async () => {
    const owner = await signUp('Silinecek Oda Sahibi');
    const fan = await signUp('Silinecek Takipçi');
    const other = await signUp('Kalan Sahip');
    const room = await openRoom(owner);
    const room2 = await openRoom(other);
    await ok(follow(room, fan), 'takip');
    await ok(follow(room2, fan), 'takip 2');
    await ok(follow(room2, owner), 'sahip de takip eder');
    assert.equal(await status(enter(room, owner)), 200);
    assert.ok(await until(async () => (await openNotices(owner)).length === 1));
    await ok(call('DELETE', '/api/me', null, owner.session), 'sil');
    const left = async () =>
      (
        await q(
          `SELECT (SELECT count(*) FROM room_follows WHERE owner_id = $1 OR user_id = $1)::int AS follows,
                  (SELECT count(*) FROM room_open_notices WHERE owner_id = $1)::int AS notices,
                  (SELECT count(*) FROM room_follows WHERE user_id = $2)::int AS fan`,
          [owner.user.id, fan.user.id],
        )
      ).rows[0];
    assert.deepEqual(await left(), { follows: 0, notices: 0, fan: 1 });
    assert.deepEqual((await followed(fan)).map((r) => r.id), [room2], 'silinen hesabın odası listeden çıkar');
    await ok(call('DELETE', '/api/me', null, fan.session), 'takipçiyi sil');
    assert.equal((await left()).fan, 0);
    assert.equal((await readRoom(room2, other)).followers, 0);
  });

  test('verilerimde: takip ettiğim odalar, odamı takip edenler ve açılış bildirimleri', async () => {
    const owner = await signUp('Veri Sahibi');
    const fan = await signUp('Veri Takipçisi');
    const other = await signUp('Veri Başka Sahip');
    const room = await openRoom(owner);
    const room2 = await openRoom(other);
    await ok(follow(room, fan), 'takip');
    await ok(follow(room2, owner), 'sahip takip eder');
    assert.equal(await status(enter(room, owner)), 200);
    assert.ok(await until(async () => (await openNotices(owner)).length === 1));
    const rs = (await ok(call('GET', '/api/me/export', null, owner.session), 'veri kopyası')).roomSocial;
    assert.deepEqual(rs.roomsFollowed.map((f) => f.roomOf.id), [other.user.id]);
    assert.deepEqual(rs.roomFollowers.map((f) => f.id), [fan.user.id]);
    assert.deepEqual(rs.roomOpenNotices.map((n) => [n.room, n.recipients]), [[room, 1]]);
  });
});

describe('Oda üyeleri listesi', () => {
  test('önce sahip ve yöneticiler, sonra üyeler; Odada ve Odada değil süzgeçleri ses odasından', async () => {
    const owner = await signUp('Liste Sahibi');
    const sup = await signUp('Süper Yönetici');
    const admin = await signUp('Yönetici');
    const m1 = await signUp('Üye Odada');
    const m2 = await signUp('Üye Dışarıda');
    const guest = await signUp('Üye Olmayan');
    const room = await openRoom(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: sup.user.id, admin: true, super: true }, owner.session), 'süper');
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id, admin: true }, owner.session), 'yönetici');
    for (const u of [m1, m2, admin]) await ok(call('POST', '/api/rooms/members/join', { room }, u.session), 'üye ol');
    await q("UPDATE room_members SET seen_at = now() - interval '3 days' WHERE room_id = $1 AND user_id = $2", [room, m2.user.id]);
    inVoice(room, owner, m1, guest);

    const all = await ok(list(room, guest), 'liste');
    assert.deepEqual(all.rows.map((r) => [r.name, r.role, r.inRoom]), [
      ['Liste Sahibi', 'owner', true],
      ['Süper Yönetici', 'super', false],
      ['Yönetici', 'admin', false],
      ['Üye Odada', 'member', true],
      ['Üye Dışarıda', 'member', false],
    ]);
    assert.deepEqual(all.counts, { all: 5, in: 2, out: 3, pending: 0 });
    assert.deepEqual([all.nextOffset, all.canManage], [null, false]);
    assert.ok(all.rows[3].seenAt && all.rows[4].seenAt && new Date(all.rows[3].seenAt) > new Date(all.rows[4].seenAt), 'son giriş');
    assert.ok(all.rows[3].since, 'üyelik tarihi');
    assert.equal(all.rows[0].seenAt, null, 'sahibin son girişi bilinmiyorsa boş');

    assert.deepEqual((await ok(list(room, guest, 'in'), 'odada')).rows.map((r) => r.name), ['Liste Sahibi', 'Üye Odada']);
    assert.deepEqual((await ok(list(room, guest, 'out'), 'odada değil')).rows.map((r) => r.name), ['Süper Yönetici', 'Yönetici', 'Üye Dışarıda']);
    assert.equal(await status(list(room, guest, 'pending')), 403, 'başvuruları üye göremez');
    assert.equal(await status(list(room, guest, 'hepsi')), 400);
    assert.equal(await status(list(room, guest, 'all', -1)), 400);

    // Staff who left the room: the time they left it is their "last in the room".
    await q("INSERT INTO presence_log (user_id, room, joined_at, left_at, seconds) VALUES ($1, $2, now() - interval '2 hours', now() - interval '1 hour', 3600)", [sup.user.id, `oda-${room}`]);
    const again = await ok(list(room, owner), 'sahip okur');
    assert.ok(again.rows[1].seenAt, 'yöneticinin son çıkışı');
    assert.equal(again.canManage, true);
  });

  test('başvurular yalnızca üyeleri yönetene; onay ve çıkarma sonrası liste güncel', async () => {
    const owner = await signUp('Başvuru Sahibi');
    const admin = await signUp('Başvuru Yöneticisi');
    const a1 = await signUp('Başvuran 1');
    const a2 = await signUp('Başvuran 2');
    const room = await openRoom(owner);
    await ok(call('POST', '/api/rooms/update', { id: room, rules: { joinMode: 'apply' } }, owner.session), 'başvurulu');
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id, admin: true }, owner.session), 'yönetici');
    assert.equal((await ok(call('POST', '/api/rooms/members/join', { room }, a1.session), 'başvur')).status, 'pending');
    assert.equal((await ok(call('POST', '/api/rooms/members/join', { room }, a2.session), 'başvur 2')).status, 'pending');
    inVoice(room, a1);

    const p = await ok(list(room, admin, 'pending'), 'başvurular');
    assert.deepEqual(p.rows.map((r) => [r.name, r.role, r.inRoom]), [['Başvuran 1', 'pending', true], ['Başvuran 2', 'pending', false]]);
    assert.deepEqual(p.counts, { all: 2, in: 0, out: 2, pending: 2 });
    assert.equal((await ok(list(room, a1), 'başvuran okur')).counts.pending, 0, 'başvuru sayısı yönetmeyene gitmez');

    await ok(call('POST', '/api/rooms/members/answer', { room, user: a1.user.id, accept: true }, admin.session), 'onay');
    await ok(call('POST', '/api/rooms/members/answer', { room, user: a2.user.id, accept: false }, admin.session), 'ret');
    let now = await ok(list(room, admin), 'sonra');
    assert.deepEqual(now.rows.map((r) => [r.name, r.role]), [['Başvuru Sahibi', 'owner'], ['Başvuru Yöneticisi', 'admin'], ['Başvuran 1', 'member']]);
    assert.equal(now.counts.pending, 0);
    await ok(call('POST', '/api/rooms/members/remove', { room, user: a1.user.id }, admin.session), 'çıkar');
    now = await ok(list(room, admin), 'çıkarınca');
    assert.deepEqual(now.rows.map((r) => r.role), ['owner', 'admin']);

    // Only the owner answers members when the room says so: the admin no longer sees the requests.
    await ok(call('POST', '/api/rooms/update', { id: room, rules: { manageMembers: 'owner' } }, owner.session), 'yalnız sahip');
    assert.equal(await status(list(room, admin, 'pending')), 403);
    assert.equal((await ok(list(room, admin), 'yönetici')).canManage, false);
  });

  test('sayfa sayfa: 50 kişi, sonraki sayfa kaldığı yerden', async () => {
    const owner = await signUp('Kalabalık Sahip');
    const room = await openRoom(owner);
    await q(
      `WITH made AS (INSERT INTO users (name) SELECT 'Üye ' || lpad(g::text, 3, '0') FROM generate_series(1, 60) g RETURNING id, name)
       INSERT INTO room_members (room_id, user_id, status, seen_at) SELECT $1, id, 'member', now() - (right(name, 3)::int || ' minutes')::interval FROM made`,
      [room],
    );
    const p1 = await ok(list(room, owner), 'sayfa 1');
    assert.deepEqual([p1.rows.length, p1.nextOffset, p1.counts.all], [50, 50, 61]);
    assert.deepEqual([p1.rows[0].role, p1.rows[1].name, p1.rows[49].name], ['owner', 'Üye 001', 'Üye 049']);
    const p2 = await ok(list(room, owner, 'all', p1.nextOffset), 'sayfa 2');
    assert.deepEqual([p2.rows.length, p2.nextOffset, p2.rows[0].name, p2.rows[10].name], [11, null, 'Üye 050', 'Üye 060']);
    assert.equal(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size, 61);
  });

  test('gizlilik ve engeller: son görülmeyi ve bulunduğu odayı gizleyen; engelleşenler birbirini görmez; atılan okuyamaz', async () => {
    const owner = await signUp('Gizlilik Sahibi');
    const hidden = await signUp('Gizli Üye');
    const plain = await signUp('Açık Üye');
    const viewer = await signUp('İçerideki Üye');
    const outsider = await signUp('Dışarıdaki');
    const room = await openRoom(owner);
    for (const u of [hidden, plain, viewer]) await ok(call('POST', '/api/rooms/members/join', { room }, u.session), 'üye ol');
    await ok(call('PATCH', '/api/me/privacy', { showLastSeen: false, showCurrentRoom: false }, hidden.session), 'gizle');
    inVoice(room, hidden, plain, viewer);
    const row = (j, u) => j.rows.find((r) => r.id === u.user.id);

    // In the room with them: I see who is here; not when the one who hides it was last in.
    const inside = await ok(list(room, viewer), 'içeriden');
    assert.deepEqual([row(inside, hidden).inRoom, row(inside, hidden).seenAt], [true, null]);
    assert.ok(row(inside, plain).seenAt && row(inside, viewer).seenAt);
    // From outside: the one who hides their room reads as not in it.
    const outside = await ok(list(room, outsider), 'dışarıdan');
    assert.deepEqual([row(outside, hidden).inRoom, row(outside, plain).inRoom], [false, true]);
    assert.deepEqual(outside.counts, { all: 4, in: 2, out: 2, pending: 0 });
    assert.deepEqual((await ok(list(room, outsider, 'in'), 'dışarıdan odada')).rows.map((r) => r.name).sort(), ['Açık Üye', 'İçerideki Üye']);
    // Whoever manages the members sees both.
    const mine = await ok(list(room, owner), 'sahip');
    assert.ok(row(mine, hidden).seenAt && row(mine, hidden).inRoom);
    // Someone who hides their own last seen doesn't see anyone's (but their own).
    const self = await ok(list(room, hidden), 'gizleyen');
    assert.equal(row(self, plain).seenAt, null);
    assert.ok(row(self, hidden).seenAt);

    await ok(call('POST', '/api/block', { to: viewer.user.id, block: true }, plain.session), 'engel');
    assert.equal(row(await ok(list(room, viewer), 'engelli'), plain), undefined, 'beni engelleyeni görmem');
    assert.equal(row(await ok(list(room, plain), 'engelleyen'), viewer), undefined, 'engellediğimi görmem');
    assert.ok(row(await ok(list(room, owner), 'sahip hepsini'), plain) && row(await ok(list(room, owner), 'sahip hepsini'), viewer));

    await ok(call('POST', '/api/rooms/ban', { room, user: outsider.user.id, minutes: 10 }, owner.session), 'at');
    assert.equal(await status(list(room, outsider)), 403, 'atılan okuyamaz');
    const blocked = await signUp('Sahibin Engellediği');
    await ok(call('POST', '/api/block', { to: blocked.user.id, block: true }, owner.session), 'sahip engeller');
    assert.equal(await status(list(room, blocked)), 403, 'sahiple engelleşen okuyamaz');
  });
});
