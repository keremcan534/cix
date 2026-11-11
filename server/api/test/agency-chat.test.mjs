// Ajans sohbet grubu (agency-chat.mjs): only the agency's own people read and write; a sub-agency has its own
// group; the members list says who is online, in which room and when they were last seen, unless they hid it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0' });
const { call, signUp } = h;

async function account(name) {
  const s = await signUp(name);
  return { id: s.user.id, name, session: s.session, get: (p) => call('GET', p, null, s.session), post: (p, b) => call('POST', p, b, s.session) };
}
const ok = ([st, j], msg = '') => {
  assert.equal(st, 200, `${msg} ${j?.error ?? ''}`);
  return j;
};
const join = (agency, user) => h.sql.query("INSERT INTO agency_streamers (agency_id, streamer_id, method) VALUES ($1, $2, 'code')", [agency, user]);

describe('Ajans sohbet grubu', () => {
  test('yalnızca ajansın yayıncıları, sahibi ve yetkilisi okur ve yazar', async () => {
    const [admin, owner, ayse, zehra, staff, outsider, otherOwner] = await Promise.all(['Merkez', 'Sahip', 'Ayşe Yayıncı', 'Zehra Yayıncı', 'Yetkili', 'Yabancı', 'Öteki Sahip'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const A = ok(await admin.post('/api/admin/agency/create', { name: 'Sohbet Ajans', owner: owner.id })).agency;
    const B = ok(await admin.post('/api/admin/agency/create', { name: 'Öteki Ajans', owner: otherOwner.id })).agency;
    await join(A.id, ayse.id);
    await join(A.id, zehra.id);
    await h.sql.query('INSERT INTO staff_assignments (user_id, agency_id) VALUES ($1, $2)', [staff.id, A.id]);

    // Each sees only their own group, with their place in it.
    assert.deepEqual(ok(await owner.get('/api/agency/chat/groups')).groups, [{ id: A.id, name: 'Sohbet Ajans', role: 'owner' }]);
    assert.deepEqual(ok(await ayse.get('/api/agency/chat/groups')).groups, [{ id: A.id, name: 'Sohbet Ajans', role: 'streamer' }]);
    assert.deepEqual(ok(await staff.get('/api/agency/chat/groups')).groups, [{ id: A.id, name: 'Sohbet Ajans', role: 'staff' }]);
    assert.deepEqual(ok(await outsider.get('/api/agency/chat/groups')).groups, []);

    const m1 = ok(await ayse.post('/api/agency/chat', { id: A.id, text: 'Merhaba ajans' }), 'yayıncı yazar').message;
    assert.equal(m1.author.id, ayse.id);
    ok(await owner.post('/api/agency/chat', { id: A.id, text: 'Hoş geldin' }), 'sahip yazar');
    ok(await staff.post('/api/agency/chat', { id: A.id, text: 'Bu akşam yayın var' }), 'yetkili yazar');
    const all = ok(await zehra.get(`/api/agency/chat?id=${A.id}`)).messages;
    assert.deepEqual(all.map((m) => m.text), ['Merhaba ajans', 'Hoş geldin', 'Bu akşam yayın var']);
    assert.deepEqual(ok(await zehra.get(`/api/agency/chat?id=${A.id}&after=${m1.id}`)).messages.map((m) => m.text), ['Hoş geldin', 'Bu akşam yayın var']);

    // Nobody from outside: a stranger, another agency's owner, even the centre.
    for (const who of [outsider, otherOwner, admin]) {
      assert.equal((await who.get(`/api/agency/chat?id=${A.id}`))[0], 403);
      assert.equal((await who.post('/api/agency/chat', { id: A.id, text: 'Ben de geldim' }))[0], 403);
      assert.equal((await who.get(`/api/agency/chat/members?id=${A.id}`))[0], 403);
    }
    assert.equal((await ayse.get(`/api/agency/chat?id=${B.id}`))[0], 403, 'başka ajansın grubu');
    assert.equal((await ayse.get('/api/agency/chat?id=yok'))[0], 400);
    assert.equal((await call('GET', `/api/agency/chat?id=${A.id}`, null, null))[0], 401);

    // Contact details are refused, an empty line too.
    assert.equal((await ayse.post('/api/agency/chat', { id: A.id, text: 'Beni ara 0532 123 45 67' }))[0], 400);
    assert.equal((await ayse.post('/api/agency/chat', { id: A.id, text: '   ' }))[0], 400);
    assert.equal(ok(await zehra.get(`/api/agency/chat?id=${A.id}`)).messages.length, 3);

    // Out of the agency: out of the group at once, and what she wrote stays for the others.
    await h.sql.query("UPDATE agency_streamers SET ended_at = now(), end_reason = 'left' WHERE streamer_id = $1", [ayse.id]);
    assert.equal((await ayse.get(`/api/agency/chat?id=${A.id}`))[0], 403);
    assert.equal(ok(await zehra.get(`/api/agency/chat?id=${A.id}`)).messages.length, 3);

    // A suspended agency's group is closed.
    await h.sql.query("UPDATE agencies SET status = 'suspended' WHERE id = $1", [A.id]);
    assert.equal((await zehra.get(`/api/agency/chat?id=${A.id}`))[0], 403);
  });

  test('alt ajansın grubu ayrıdır: üst ajans girmez', async () => {
    const [admin, top, sub, streamer] = await Promise.all(['Merkez 2', 'Üst Sahip', 'Alt Sahip', 'Alt Yayıncı'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const T = ok(await admin.post('/api/admin/agency/create', { name: 'Üst Ajans', owner: top.id })).agency;
    const S = ok(await admin.post('/api/admin/agency/create', { name: 'Alt Ajans', owner: sub.id })).agency;
    await h.sql.query('UPDATE agencies SET parent_id = $2, level = 2 WHERE id = $1', [S.id, T.id]);
    await join(S.id, streamer.id);
    ok(await streamer.post('/api/agency/chat', { id: S.id, text: 'Alt ajans içi' }));
    assert.equal((await top.get(`/api/agency/chat?id=${S.id}`))[0], 403);
    assert.equal((await streamer.get(`/api/agency/chat?id=${T.id}`))[0], 403);
    assert.deepEqual(ok(await sub.get(`/api/agency/chat?id=${S.id}`)).messages.map((m) => m.text), ['Alt ajans içi']);
  });

  test('üyeler: kim çevrim içi, hangi odada, en son ne zaman; gizleyen görünmez', async () => {
    const [admin, owner, inRoom, away, shy] = await Promise.all(['Merkez 3', 'Liste Sahip', 'Odadaki', 'Uzaktaki', 'Gizli'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const A = ok(await admin.post('/api/admin/agency/create', { name: 'Liste Ajans', owner: owner.id })).agency;
    for (const u of [inRoom, away, shy]) await join(A.id, u.id);
    const room = ok(await inRoom.post('/api/rooms', { title: 'Yayın Odası' })).room;
    await h.sql.query('INSERT INTO room_presence (room, identity) VALUES ($1, $2)', [`oda-${room.id}`, inRoom.id]);
    await h.sql.query("UPDATE sessions SET last_seen_at = now() - interval '3 hours' WHERE user_id = $1", [away.id]);
    ok(await call('PATCH', '/api/me/privacy', { showOnline: false, showCurrentRoom: false }, shy.session), 'gizlilik');

    const members = ok(await owner.get(`/api/agency/chat/members?id=${A.id}`)).members;
    const by = Object.fromEntries(members.map((m) => [m.id, m]));
    assert.deepEqual(members.map((m) => m.role), ['owner', 'streamer', 'streamer', 'streamer'], 'sahip en üstte');
    assert.equal(by[owner.id].online, true, 'şimdi istek atan çevrim içi');
    assert.deepEqual([by[inRoom.id].online, by[inRoom.id].room], [true, { id: room.id, title: 'Yayın Odası' }]);
    assert.deepEqual([by[away.id].online, by[away.id].room], [false, null]);
    assert.ok(Date.now() - Date.parse(by[away.id].lastSeenAt) > 2.9 * 3600_000, 'en son 3 saat önce');
    assert.deepEqual([by[shy.id].online, by[shy.id].room, by[shy.id].lastSeenAt], [null, null, null], 'gizleyen söylenmez');
    // She still sees her own line.
    const mine = ok(await shy.get(`/api/agency/chat/members?id=${A.id}`)).members.find((m) => m.id === shy.id);
    assert.equal(mine.online, true);
    // No e-mail, phone or anything else about a member leaves here.
    assert.deepEqual(Object.keys(members[0]).sort(), ['avatarUrl', 'gender', 'id', 'lastSeenAt', 'name', 'online', 'role', 'room']);
  });

  test('susturulan yazamaz; hesabını silenin satırları gider; verilerimde görünür', async () => {
    const [admin, owner, a, b] = await Promise.all(['Merkez 4', 'Silme Sahip', 'Yazan', 'Okuyan'].map(account));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
    const A = ok(await admin.post('/api/admin/agency/create', { name: 'Silme Ajans', owner: owner.id })).agency;
    await join(A.id, a.id);
    await join(A.id, b.id);
    ok(await a.post('/api/agency/chat', { id: A.id, text: 'Benim satırım' }));

    // A mute on public text stops writing here too; reading goes on.
    await h.sql.query(
      "INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, expires_at, created_role) VALUES ($1, 'mute_global_text', 'global', 'spam', 'Spam', now() + interval '1 hour', 'moderator')",
      [b.id],
    );
    assert.equal((await b.post('/api/agency/chat', { id: A.id, text: 'Yazabilir miyim' }))[0], 403);
    assert.equal(ok(await b.get(`/api/agency/chat?id=${A.id}`)).messages.length, 1);

    // "Verilerimin kopyası" holds what I wrote, under the agency's name.
    const mine = ok(await a.get('/api/me/export'));
    assert.ok(JSON.stringify(mine).includes('Benim satırım'), 'dışa aktarımda yok');

    // Deleting the account takes the lines with it.
    ok(await call('DELETE', '/api/me', null, a.session), 'hesap silme');
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM agency_messages WHERE author = $1', [a.id])).rows[0].n, 0);
    assert.deepEqual(ok(await b.get(`/api/agency/chat?id=${A.id}`)).messages, []);
  });
});
