// Staff tools of 25 Nov 2026 against a real Postgres: an agency's own room linked by the room's ID (when founding the
// agency or later; Odalar shows the room under the agency's name whoever owns it; one room, one agency), and a family
// founded by staff for free.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0' });
const { call, signUp } = h;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};

describe('Ajansın odası', () => {
  let admin, owner, room, other;
  const noOf = async (u) => (await q('SELECT public_no::text AS no FROM users WHERE id = $1', [u.user.id]))[0].no;
  const listed = async (s) => (await ok(call('GET', '/api/rooms', null, s), 'odalar')).rooms.find((r) => r.id === room.id);

  test('ajans kurulurken odanın ID’si yazılır; oda Odalar’da ajansın adıyla görünür', async () => {
    admin = await signUp('Merkez');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    owner = await signUp('Oda Sahibi');
    other = await signUp('Başka');
    room = (await ok(call('POST', '/api/rooms', { title: 'Ajans Odası' }, owner.session), 'oda')).room;
    const roomNo = await noOf(owner);
    const [st, j] = await call('POST', '/api/admin/agency/create', { name: `Kıyı ${rnd(3)}`, roomNo: '999999999999' }, admin.session);
    assert.equal(st, 404, 'yanlış ID ajansı da kurmaz');
    assert.match(j.error, /açık bir oda yok/);
    const a = (await ok(call('POST', '/api/admin/agency/create', { name: `Yıldız ${rnd(3)}`, roomNo }, admin.session), 'ajans')).agency;
    assert.deepEqual([a.room.id, a.room.no], [room.id, roomNo]);
    assert.deepEqual((await listed(other.session)).agency, { id: a.id, name: a.name }, 'oda sahibi ajansın sahibi ya da yayıncısı değil, yine ajansın adı');
    const node = (await ok(call('GET', '/api/admin/agency/tree', null, admin.session), 'ağaç')).nodes.find((n) => n.id === a.id);
    assert.deepEqual(node.room, { id: room.id, title: 'Ajans Odası', no: roomNo });
    // One room, one agency.
    const b = (await ok(call('POST', '/api/admin/agency/create', { name: `Ay ${rnd(3)}` }, admin.session), 'ikinci ajans')).agency;
    const [st2, j2] = await call('POST', '/api/admin/agency/room', { agencyId: b.id, roomNo }, admin.session);
    assert.equal(st2, 409);
    assert.match(j2.error, /zaten .* ajansına bağlı/);
    // Taken off later, then the other agency may have it.
    await ok(call('POST', '/api/admin/agency/room', { agencyId: a.id, roomNo: null }, admin.session), 'bağı kaldır');
    assert.equal((await listed(other.session)).agency, null);
    const linked = await ok(call('POST', '/api/admin/agency/room', { agencyId: b.id, roomNo }, admin.session), 'sonradan bağla');
    assert.equal(linked.room.id, room.id);
    assert.deepEqual((await listed(other.session)).agency, { id: b.id, name: b.name });
    assert.equal((await call('POST', '/api/admin/agency/room', { agencyId: b.id, roomNo }, other.session))[0], 403);
    assert.equal((await q("SELECT count(*)::int AS n FROM agency_audit WHERE action = 'agency.room'"))[0].n, 3, 'her bağ denetime yazılır');
  });
});

describe('Panelden aile kurma', () => {
  test('ücretsiz; kurucu lider olur; zaten ailesi olan ve aynı ad reddedilir; yalnız yönetici', async () => {
    const admin = await signUp('Yönetim');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    const founder = await signUp('Kurucu');
    const coins = async (u) => Number((await q('SELECT coins FROM users WHERE id = $1', [u.user.id]))[0].coins);
    const before = await coins(founder);
    const f = (await ok(call('POST', '/api/admin/families/create', { name: 'Gece Kuşları', founder: founder.user.id }, admin.session), 'aile')).family;
    assert.equal(f.name, 'Gece Kuşları');
    assert.equal(await coins(founder), before, 'jeton alınmaz');
    const mine = await ok(call('GET', '/api/family', null, founder.session), 'ailem');
    assert.equal(mine.family?.name ?? mine.name, 'Gece Kuşları');
    const [st, j] = await call('POST', '/api/admin/families/create', { name: 'Başka Aile', founder: founder.user.id }, admin.session);
    assert.equal(st, 409);
    assert.match(j.error, /zaten bir ailede/);
    const second = await signUp('İkinci Kurucu');
    assert.equal((await call('POST', '/api/admin/families/create', { name: 'gece kuşları', founder: second.user.id }, admin.session))[0], 409, 'aynı ad');
    assert.equal((await call('POST', '/api/admin/families/create', { name: 'Aile', founder: second.user.id }, founder.session))[0], 403);
    const list = (await ok(call('GET', '/api/admin/families', null, admin.session), 'liste')).families;
    assert.deepEqual([list[0].name, list[0].members, list[0].leader.name], ['Gece Kuşları', 1, 'Kurucu']);
    assert.equal((await q("SELECT count(*)::int AS n FROM audit_events WHERE action = 'family.create'"))[0].n, 1);
  });
});
