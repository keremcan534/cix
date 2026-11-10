// Room social features (room-social.mjs) against a real Postgres and a fake LiveKit: mic invites (owner and admins
// invite someone in the room; accept takes the mic if it is still free; decline or no answer ends it), the shared
// room poll, upcoming events across rooms, Odalarım › Katıl, the once-a-day follower invite and the Odalar badges.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { rnd, startApi } from './harness.mjs';

const lkCalls = [];
/** Who is in each LiveKit room, as ListParticipants answers: { identity, seat } (seat null: not on a mic). */
const voice = new Map();
const LK_PORT = 21000 + (process.pid % 900);
const lk = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const method = req.url.split('/').pop();
    const b = JSON.parse(body || '{}');
    lkCalls.push({ method, body: b });
    const send = (j) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(j));
    if (method === 'ListParticipants')
      return send({ participants: (voice.get(b.room) ?? []).map((p) => ({ identity: p.identity, attributes: p.seat === null ? {} : { seat: String(p.seat) } })) });
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
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
};
/** The server's data packets to a room since call `from`, decoded. */
const packets = (from, type) =>
  lkCalls
    .slice(from)
    .filter((c) => c.method === 'SendData')
    .map((c) => ({ room: c.body.room, ...JSON.parse(Buffer.from(c.body.data, 'base64').toString('utf8')) }))
    .filter((p) => !type || p.type === type);
const openRoom = async (owner, extra = {}) => (await ok(call('POST', '/api/rooms', { title: `Oda ${rnd(2)}`, ...extra }, owner.session), 'oda')).room.id;
const inVoice = (room, ...people) => voice.set(`oda-${room}`, people.map(([u, seat = null]) => ({ identity: u.user.id, seat })));

describe('Mikrofon daveti', () => {
  test('sahip odadakini davet eder; davetli kabul edince boş mikrofona geçer, odaya haber gider', async () => {
    const owner = await signUp('Davet Sahibi');
    const guest = await signUp('Davetli');
    const room = await openRoom(owner);
    inVoice(room, [owner, 0], [guest]);
    const from = lkCalls.length;
    const { invite } = await ok(call('POST', '/api/rooms/invite', { room, user: guest.user.id, seat: 3 }, owner.session), 'davet');
    assert.deepEqual([invite.status, invite.seat, invite.from.id, invite.to.id], ['pending', 3, owner.user.id, guest.user.id]);
    assert.ok(invite.expiresIn > 25_000 && invite.expiresIn <= 30_000, `süre ${invite.expiresIn}`);
    assert.ok(await until(() => packets(from, 'invite').length === 1));
    assert.deepEqual(packets(from, 'invite')[0], { room: `oda-${room}`, type: 'invite', id: String(invite.id), to: guest.user.id, from: owner.user.id });

    const mine = await ok(call('GET', `/api/rooms/invites?room=${room}`, null, guest.session), 'davetlerim');
    assert.deepEqual(mine.invites.map((i) => [i.id, i.status]), [[invite.id, 'pending']]);
    assert.equal((await call('POST', '/api/rooms/invite', { room, user: guest.user.id }, owner.session))[0], 409, 'bekleyen davet varken ikincisi yok');

    const other = await signUp('Başkası');
    assert.equal(await status(call('POST', '/api/rooms/invite/answer', { id: invite.id, accept: true }, other.session)), 403, 'yalnızca davetli yanıtlar');
    const before = lkCalls.length;
    const answered = await ok(call('POST', '/api/rooms/invite/answer', { id: invite.id, accept: true }, guest.session), 'kabul');
    assert.deepEqual([answered.invite.status, answered.invite.seat], ['accepted', 3]);
    const moved = lkCalls.slice(before).find((c) => c.method === 'UpdateParticipant');
    assert.deepEqual(moved.body, { room: `oda-${room}`, identity: guest.user.id, attributes: { seat: '3' } });
    assert.ok(await until(() => packets(before, 'invite').length === 1), 'davet eden yanıtı duyar');
    assert.equal(await status(call('POST', '/api/rooms/invite/answer', { id: invite.id, accept: true }, guest.session)), 409, 'bir kez yanıtlanır');
  });

  test('aynı yetkiler: üye davet edemez, yönetici sahibini ya da başka yöneticiyi davet edemez; odada olmayan, mikrofondaki ve engelli olmaz', async () => {
    const owner = await signUp('Sahip');
    const admin = await signUp('Yönetici');
    const admin2 = await signUp('Yönetici 2');
    const member = await signUp('Üye');
    const away = await signUp('Odada yok');
    const seated = await signUp('Mikrofonda');
    const room = await openRoom(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    await ok(call('POST', '/api/rooms/admin', { room, user: admin2.user.id }, owner.session), 'yönetici 2');
    inVoice(room, [owner, 0], [admin], [admin2], [member], [seated, 2]);
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: admin.user.id }, member.session)), 403, 'üye');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: owner.user.id }, admin.session)), 403, 'sahibi');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: admin2.user.id }, admin.session)), 403, 'aynı rütbe');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: admin.user.id }, admin.session)), 400, 'kendini');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: away.user.id }, admin.session)), 409, 'odada değil');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: seated.user.id }, admin.session)), 409, 'zaten mikrofonda');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: member.user.id, seat: 2 }, admin.session)), 409, 'dolu mikrofon');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: member.user.id, seat: 0 }, admin.session)), 400, 'sahibin mikrofonu');
    await ok(call('POST', '/api/rooms/seat', { room, action: 'lock', seat: 4 }, owner.session), 'kilit');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: member.user.id, seat: 4 }, admin.session)), 409, 'kilitli mikrofon');
    await ok(call('POST', '/api/block', { to: admin.user.id, block: true }, member.session), 'engel');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: member.user.id }, admin.session)), 403, 'engelli');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: admin.user.id }, owner.session)), 200, 'sahip yöneticiyi davet eder');
    assert.equal((await q('SELECT count(*)::int AS n FROM room_mic_invites WHERE room_id = $1', [room])).rows[0].n, 1, 'reddedilenler yazılmadı');
  });

  test('davet almayan kişi (Gizlilik › kimse) davet edilemez; takipçi davetine de girmez', async () => {
    const owner = await signUp('Gizli Sahip');
    const shy = await signUp('Davet Almaz');
    const room = await openRoom(owner);
    inVoice(room, [owner, 0], [shy]);
    await ok(call('PATCH', '/api/me/privacy', { invitesFrom: 'nobody' }, shy.session), 'gizlilik');
    const [st, j] = await call('POST', '/api/rooms/invite', { room, user: shy.user.id }, owner.session);
    assert.equal(st, 403);
    assert.equal(j.code, 'privacy');
    await ok(call('POST', '/api/follow', { to: owner.user.id, follow: true }, shy.session), 'takip');
    assert.equal((await ok(call('GET', `/api/rooms/invite-followers?room=${room}`, null, owner.session), 'sayı')).count, 0, 'takipçi sayısına girmez');
    await ok(call('PATCH', '/api/me/privacy', { invitesFrom: 'everyone' }, shy.session), 'gizlilik geri');
    assert.equal((await ok(call('GET', `/api/rooms/invite-followers?room=${room}`, null, owner.session), 'sayı')).count, 1);
    await ok(call('POST', '/api/rooms/invite', { room, user: shy.user.id }, owner.session), 'artık davet edilir');
  });

  test('ret ve 30 sn yanıtsızlık daveti bitirir; dolan mikrofon kabulü boşa çıkarır; personel odanın davetlerini görür', async () => {
    const owner = await signUp('Sahip 3');
    const a = await signUp('Reddeden');
    const b = await signUp('Geç kalan');
    const c = await signUp('Şanssız');
    const room = await openRoom(owner);
    inVoice(room, [owner, 0], [a], [b], [c]);
    const ia = (await ok(call('POST', '/api/rooms/invite', { room, user: a.user.id }, owner.session), 'a')).invite;
    const ib = (await ok(call('POST', '/api/rooms/invite', { room, user: b.user.id }, owner.session), 'b')).invite;
    const ic = (await ok(call('POST', '/api/rooms/invite', { room, user: c.user.id, seat: 5 }, owner.session), 'c')).invite;

    const staffView = await ok(call('GET', `/api/rooms/invites?room=${room}`, null, owner.session), 'liste');
    assert.equal(staffView.invites.length, 3);
    assert.deepEqual((await ok(call('GET', `/api/rooms/invites?room=${room}`, null, a.session), 'a liste')).invites.map((i) => i.id), [ia.id], 'üye yalnızca kendisininkini');

    assert.equal((await ok(call('POST', '/api/rooms/invite/answer', { id: ia.id, accept: false }, a.session), 'ret')).invite.status, 'declined');
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: a.user.id }, owner.session)), 429, '20 sn dolmadan aynı kişiye yok');
    await q("UPDATE room_mic_invites SET created_at = now() - interval '25 seconds' WHERE id = $1", [ia.id]);
    assert.equal(await status(call('POST', '/api/rooms/invite', { room, user: a.user.id }, owner.session)), 200, 'sonra yeniden');

    await q("UPDATE room_mic_invites SET expires_at = now() - interval '1 second' WHERE id = $1", [ib.id]);
    assert.equal(await status(call('POST', '/api/rooms/invite/answer', { id: ib.id, accept: true }, b.session)), 410, 'süresi doldu');
    assert.equal((await q('SELECT status FROM room_mic_invites WHERE id = $1', [ib.id])).rows[0].status, 'expired');

    inVoice(room, [owner, 0], [a], [b], [c], [await signUp('Hızlı'), 5]);
    assert.equal(await status(call('POST', '/api/rooms/invite/answer', { id: ic.id, accept: true }, c.session)), 409, 'mikrofon doldu');
    assert.equal((await q('SELECT status FROM room_mic_invites WHERE id = $1', [ic.id])).rows[0].status, 'failed');
  });

  test('herhangi bir mikrofona davet: davetli telefonun seçtiği boş mikrofona geçer; odadan çıkan geçemez', async () => {
    const owner = await signUp('Sahip 4');
    const guest = await signUp('Serbest');
    const room = await openRoom(owner);
    inVoice(room, [owner, 0], [guest]);
    const { invite } = await ok(call('POST', '/api/rooms/invite', { room, user: guest.user.id }, owner.session), 'davet');
    assert.equal(invite.seat, null);
    assert.equal(await status(call('POST', '/api/rooms/invite/answer', { id: invite.id, accept: true }, guest.session)), 400, 'seçilen mikrofon gerekir');
    const r = await ok(call('POST', '/api/rooms/invite/answer', { id: invite.id, accept: true, seat: 6 }, guest.session), 'kabul');
    assert.equal(r.invite.seat, 6);

    const late = await signUp('Çıkan');
    inVoice(room, [owner, 0], [guest, 6], [late]);
    const { invite: i2 } = await ok(call('POST', '/api/rooms/invite', { room, user: late.user.id }, owner.session), 'davet 2');
    inVoice(room, [owner, 0], [guest, 6]);
    assert.equal(await status(call('POST', '/api/rooms/invite/answer', { id: i2.id, accept: true, seat: 2 }, late.session)), 409, 'odada değil');
    assert.equal((await q('SELECT status FROM room_mic_invites WHERE id = $1', [i2.id])).rows[0].status, 'cancelled');
  });
});

describe('Oda anketi', () => {
  test('sahip başlatır, herkes bir kez oy verir, sonuçlar anlık; kapanınca oy yok', async () => {
    const owner = await signUp('Anket Sahibi');
    const a = await signUp('Oy A');
    const b = await signUp('Oy B');
    const room = await openRoom(owner);
    assert.equal(await status(call('POST', '/api/rooms/poll', { room, question: 'Hangi şarkı?', options: ['Pop', 'Rock'], seconds: 60 }, a.session)), 403, 'üye başlatamaz');
    const from = lkCalls.length;
    const { poll } = await ok(call('POST', '/api/rooms/poll', { room, question: 'Hangi şarkı?', options: ['Pop', 'Rock', 'Arabesk'], seconds: 60, live: true }, owner.session), 'anket');
    assert.deepEqual([poll.question, poll.options.map((o) => [o.text, o.votes]), poll.myVote, poll.closed, poll.live], ['Hangi şarkı?', [['Pop', 0], ['Rock', 0], ['Arabesk', 0]], null, false, true]);
    assert.ok(poll.endsIn > 55 && poll.endsIn <= 60);
    assert.ok(await until(() => packets(from, 'poll').length >= 1));
    assert.deepEqual(packets(from, 'poll')[0], { room: `oda-${room}`, type: 'poll', id: String(poll.id) });
    assert.equal(await status(call('POST', '/api/rooms/poll', { room, question: 'İkinci anket?', options: ['Evet', 'Hayır'], seconds: 30 }, owner.session)), 409, 'odada bir açık anket');

    const va = await ok(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 1 }, a.session), 'oy a');
    assert.deepEqual([va.poll.myVote, va.poll.options[1].votes, va.poll.total], [1, 1, 1]);
    assert.equal(await status(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 0 }, a.session)), 409, 'ikinci oy yok');
    assert.equal(await status(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 3 }, b.session)), 400, 'olmayan seçenek');
    await ok(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 1 }, b.session), 'oy b');
    const seen = await ok(call('GET', `/api/rooms/poll?room=${room}`, null, owner.session), 'okuma');
    assert.deepEqual(seen.poll.options.map((o) => o.votes), [0, 2, 0], 'herkes aynı sonucu görür');

    assert.equal(await status(call('POST', '/api/rooms/poll/close', { id: poll.id }, a.session)), 403, 'üye kapatamaz');
    const closed = await ok(call('POST', '/api/rooms/poll/close', { id: poll.id }, owner.session), 'kapat');
    assert.deepEqual([closed.poll.closed, closed.poll.endsIn], [true, 0]);
    assert.equal(await status(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 0 }, owner.session)), 409, 'kapanınca oy yok');
    await ok(call('POST', '/api/rooms/poll', { room, question: 'Yeni anket?', options: ['Evet', 'Hayır'], seconds: 30 }, owner.session), 'kapanınca yenisi');
  });

  test('anlık olmayan ankette sonuç oy verince ya da bitince görünür; süresi biten kendiliğinden kapanır', async () => {
    const owner = await signUp('Gizli Anket');
    const a = await signUp('Gizli Oy');
    const room = await openRoom(owner);
    const { poll } = await ok(call('POST', '/api/rooms/poll', { room, question: 'Kim kazanır?', options: ['Kırmızı', 'Mavi'], seconds: 30, live: false }, owner.session), 'anket');
    await ok(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 0 }, owner.session), 'oy');
    const before = await ok(call('GET', `/api/rooms/poll?room=${room}`, null, a.session), 'oy vermeden');
    assert.deepEqual([before.poll.options.map((o) => o.votes), before.poll.total], [[null, null], null], 'sonuç gizli');
    const voted = await ok(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 1 }, a.session), 'oy a');
    assert.deepEqual(voted.poll.options.map((o) => o.votes), [1, 1]);
    await q("UPDATE room_polls SET ends_at = now() - interval '1 second' WHERE id = $1", [poll.id]);
    const ended = await ok(call('GET', `/api/rooms/poll?room=${room}`, null, a.session), 'bitti');
    assert.deepEqual([ended.poll.closed, ended.poll.endsIn], [true, 0]);
    await q("UPDATE room_polls SET closed_at = now() - interval '11 minutes' WHERE id = $1", [poll.id]);
    assert.equal((await ok(call('GET', `/api/rooms/poll?room=${room}`, null, a.session), 'eski')).poll, null, 'eski sonuç ekrandan kalkar');
  });

  test('oda işlevleri sahibe ayrılınca yönetici anket açamaz; metinler iletişim filtresinden geçer', async () => {
    const owner = await signUp('İşlev Sahibi');
    const admin = await signUp('İşlev Yöneticisi');
    const room = await openRoom(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    const body = { room, question: 'Bu akşam ne yapalım?', options: ['Oyun', 'Sohbet'], seconds: 60 };
    await q('UPDATE rooms SET rules = $2 WHERE id = $1', [room, JSON.stringify({ manageFunctions: 'owner' })]);
    assert.equal(await status(call('POST', '/api/rooms/poll', body, admin.session)), 403);
    await q('UPDATE rooms SET rules = $2 WHERE id = $1', [room, JSON.stringify({ manageFunctions: 'admins' })]);
    assert.equal(await status(call('POST', '/api/rooms/poll', { ...body, question: 'Ara beni 0532 123 45 67' }, admin.session)), 400, 'iletişim bilgisi');
    assert.equal(await status(call('POST', '/api/rooms/poll', { ...body, options: ['Tek'] }, admin.session)), 400, 'tek seçenek');
    assert.equal(await status(call('POST', '/api/rooms/poll', { ...body, options: ['Aynı', 'aynı'] }, admin.session)), 400, 'aynı seçenek');
    assert.equal(await status(call('POST', '/api/rooms/poll', { ...body, seconds: 45 }, admin.session)), 400, 'süre');
    await ok(call('POST', '/api/rooms/poll', body, admin.session), 'yönetici açar');
    assert.equal((await q('SELECT count(*)::int AS n FROM room_polls WHERE room_id = $1', [room])).rows[0].n, 1);
  });
});

describe('Odalar: etkinlikler, odalarım, rozetler', () => {
  test('yaklaşan etkinlikler: görebildiğim açık odalardan; özel, engelli, kapalı ve iptal olan yok', async () => {
    const viewer = await signUp('Takvim');
    const make = async (name, extra) => {
      const owner = await signUp(name);
      const room = await openRoom(owner, extra);
      const { event } = await ok(call('POST', '/api/rooms/events', { room, title: `${name} gecesi`, when: 'Cuma 22:00', type: 'Oyun' }, owner.session), 'etkinlik');
      return { owner, room, event };
    };
    const open = await make('Açık');
    const priv = await make('Özel', { roomType: 'private' });
    const blocked = await make('Engelli');
    const closed = await make('Kapanan');
    const cancelled = await make('İptal');
    await ok(call('POST', '/api/block', { to: viewer.user.id, block: true }, blocked.owner.session), 'engel');
    await ok(call('POST', '/api/rooms/close', { id: closed.room }, closed.owner.session), 'kapat');
    await ok(call('POST', '/api/rooms/events/cancel', { id: cancelled.event.id }, cancelled.owner.session), 'iptal');
    const { events } = await ok(call('GET', '/api/rooms/events/upcoming', null, viewer.session), 'takvim');
    const mine = events.filter((e) => [open, priv, blocked, closed, cancelled].some((x) => x.room === e.room.id));
    assert.deepEqual(mine.map((e) => [e.title, e.when, e.room.id]), [['Açık gecesi', 'Cuma 22:00', open.room]]);
    assert.equal(mine[0].room.title.startsWith('Oda '), true);
  });

  test('Odalarım › Katıl: üyesi ve yöneticisi olduğum açık odalar; kendi odam, engelli ve çıkarıldığım oda yok', async () => {
    const me = await signUp('Üye Ben');
    const o1 = await signUp('Üyelik Sahibi');
    const o2 = await signUp('Yöneticilik Sahibi');
    const o3 = await signUp('Engelleyen Sahip');
    const o4 = await signUp('Atan Sahip');
    const r1 = await openRoom(o1);
    const r2 = await openRoom(o2);
    const r3 = await openRoom(o3);
    const r4 = await openRoom(o4);
    const own = await openRoom(me);
    await ok(call('POST', '/api/rooms/members/join', { room: r1 }, me.session), 'üye ol');
    await ok(call('POST', '/api/rooms/admin', { room: r2, user: me.user.id }, o2.session), 'yönetici');
    await ok(call('POST', '/api/rooms/members/join', { room: r3 }, me.session), 'üye 3');
    await ok(call('POST', '/api/rooms/members/join', { room: r4 }, me.session), 'üye 4');
    await ok(call('POST', '/api/block', { to: me.user.id, block: true }, o3.session), 'engel');
    await ok(call('POST', '/api/rooms/ban', { room: r4, user: me.user.id, minutes: 10 }, o4.session), 'at');
    const { rooms } = await ok(call('GET', '/api/rooms/joined', null, me.session), 'katıl');
    assert.deepEqual(rooms.map((r) => r.id).sort(), [r1, r2].sort());
    assert.ok(!rooms.some((r) => r.id === own));
    await ok(call('POST', '/api/rooms/members/leave', { room: r1 }, me.session), 'ayrıl');
    assert.deepEqual((await ok(call('GET', '/api/rooms/joined', null, me.session), 'katıl 2')).rooms.map((r) => r.id), [r2]);
  });

  test('oda listesi: sahibin ajansı ya da ailesi, süren PK ve haftanın ilk üç odası', async () => {
    const viewer = await signUp('Listeci');
    const fam = await signUp('Aileli');
    const agent = await signUp('Ajanslı');
    const top = await signUp('Hediyeli');
    const plain = await signUp('Sade');
    const rf = await openRoom(fam);
    const ra = await openRoom(agent);
    const rt = await openRoom(top);
    const rp = await openRoom(plain);
    const [f] = (await q("INSERT INTO families (name, leader) VALUES ($1, $2) RETURNING id", [`Aile ${rnd(2)}`, fam.user.id])).rows;
    await q("INSERT INTO family_members (user_id, family_id, role) VALUES ($1, $2, 'owner')", [fam.user.id, f.id]);
    const [ag] = (await q("INSERT INTO agencies (code, name, level, status) VALUES ($1, $2, 1, 'approved') RETURNING id, name", [`R${rnd(3).toUpperCase()}`, `Ajans ${rnd(2)}`])).rows;
    await q("INSERT INTO agency_streamers (streamer_id, agency_id, method) VALUES ($1, $2, 'admin')", [agent.user.id, ag.id]);
    await q(
      "INSERT INTO room_pks (room_id, mode, started_by, ref, duration_min, participants, start_at, end_at) VALUES ($1, 'solo', $2, $3, 15, $4, now(), now() + interval '15 minutes')",
      [rp, plain.user.id, rnd(6), [plain.user.id, viewer.user.id]],
    );
    await q("INSERT INTO gift_events (sender, recipient, gift_id, count, unit_price, total, room, ref) VALUES ($1, $2, 'g4', 1, 9000000, 9000000, $3, $4)", [viewer.user.id, top.user.id, `oda-${rt}`, rnd(6)]);
    const { rooms } = await ok(call('GET', '/api/rooms', null, viewer.session), 'liste');
    const of = (id) => rooms.find((r) => r.id === id);
    assert.equal(of(rf).family.name.startsWith('Aile '), true);
    assert.equal(of(rf).agency, null);
    assert.deepEqual(of(ra).agency, { id: ag.id, name: ag.name });
    assert.deepEqual([of(rp).pk, of(rf).pk], [true, false]);
    assert.equal(of(rt).weekRank, 1);
    assert.equal(of(rp).weekRank, null);
  });
});

describe('Takipçilere davet', () => {
  test('sahip ya da yönetici günde bir kez gönderir; takipçiler bildirimi alır, engelliler ve sonradan takip eden almaz', async () => {
    const owner = await signUp('Davetçi Sahip');
    const admin = await signUp('Davetçi Yönetici');
    const member = await signUp('Davetçi Üye');
    const f1 = await signUp('Takipçi 1');
    const f2 = await signUp('Takipçi 2');
    const fb = await signUp('Engelli Takipçi');
    const room = await openRoom(owner);
    await ok(call('POST', '/api/rooms/admin', { room, user: admin.user.id }, owner.session), 'yönetici');
    for (const f of [f1, f2, fb]) await ok(call('POST', '/api/follow', { to: owner.user.id }, f.session), 'takip');
    await ok(call('POST', '/api/block', { to: owner.user.id, block: true }, fb.session), 'engel');
    // A block ends the follow; following again isn't possible while it lasts, so the blocked one is out either way.
    assert.equal(await status(call('GET', `/api/rooms/invite-followers?room=${room}`, null, member.session)), 403, 'üye göremez');
    const info = await ok(call('GET', `/api/rooms/invite-followers?room=${room}`, null, owner.session), 'bilgi');
    assert.deepEqual([info.count, info.lastAt, info.waitMs], [2, null, 0]);
    assert.equal(await status(call('POST', '/api/rooms/invite-followers', { room }, member.session)), 403, 'üye gönderemez');

    const sent = await ok(call('POST', '/api/rooms/invite-followers', { room }, admin.session), 'gönder');
    assert.equal(sent.sent, 2);
    assert.ok(sent.waitMs > 23 * 3600_000 && sent.lastAt);
    const [st, again] = await call('POST', '/api/rooms/invite-followers', { room }, owner.session);
    assert.equal(st, 429, 'günde bir');
    assert.equal(again.code, 'follower_invite_wait');
    assert.ok(again.waitMs > 0);

    const late = await signUp('Sonradan Takipçi');
    await ok(call('POST', '/api/follow', { to: owner.user.id }, late.session), 'geç takip');
    const got = await ok(call('GET', '/api/me/room-invites', null, f1.session), 'davetler');
    assert.deepEqual(got.invites.map((i) => [i.room.id, i.host.id]), [[room, owner.user.id]]);
    assert.equal((await ok(call('GET', '/api/me/room-invites', null, late.session), 'geç')).invites.length, 0, 'davetten sonra takip eden almaz');
    assert.equal((await ok(call('GET', '/api/me/room-invites', null, fb.session), 'engelli')).invites.length, 0);

    // A closed and reopened room is the same account: still one a day.
    await ok(call('POST', '/api/rooms/close', { id: room }, owner.session), 'kapat');
    const room2 = await openRoom(owner);
    assert.equal(await status(call('POST', '/api/rooms/invite-followers', { room: room2 }, owner.session)), 429, 'yeniden açılan oda');
    assert.equal((await ok(call('GET', '/api/me/room-invites', null, f1.session), 'kapanan oda')).invites.length, 0, 'kapanan odanın daveti gider');
    await q("UPDATE room_follower_invites SET created_at = now() - interval '25 hours' WHERE owner_id = $1", [owner.user.id]);
    assert.equal((await ok(call('POST', '/api/rooms/invite-followers', { room: room2 }, owner.session), '24 saat sonra')).sent, 3, 'sonradan takip eden de artık sayılır');
  });

  test('hesap silinince davetleri, oyları ve anketleri gider', async () => {
    const owner = await signUp('Silinecek Sahip');
    const guest = await signUp('Silinecek Davetli');
    const room = await openRoom(owner);
    inVoice(room, [owner, 0], [guest]);
    await ok(call('POST', '/api/follow', { to: owner.user.id }, guest.session), 'takip');
    await ok(call('POST', '/api/rooms/invite', { room, user: guest.user.id }, owner.session), 'davet');
    const { poll } = await ok(call('POST', '/api/rooms/poll', { room, question: 'Silinsin mi?', options: ['Evet', 'Hayır'], seconds: 30 }, owner.session), 'anket');
    await ok(call('POST', '/api/rooms/poll/vote', { id: poll.id, option: 0 }, guest.session), 'oy');
    await ok(call('POST', '/api/rooms/invite-followers', { room }, owner.session), 'takipçi daveti');
    await ok(call('DELETE', '/api/me', null, owner.session), 'sil');
    const left = await q(
      `SELECT (SELECT count(*) FROM room_mic_invites WHERE from_user = $1 OR to_user = $1)::int AS invites,
              (SELECT count(*) FROM room_polls WHERE creator = $1)::int AS polls,
              (SELECT count(*) FROM room_poll_votes WHERE poll_id = $2)::int AS votes,
              (SELECT count(*) FROM room_follower_invites WHERE owner_id = $1 OR sent_by = $1)::int AS followers`,
      [owner.user.id, poll.id],
    );
    assert.deepEqual(left.rows[0], { invites: 0, polls: 0, votes: 0, followers: 0 });
    await ok(call('DELETE', '/api/me', null, guest.session), 'davetliyi sil');
  });
});
