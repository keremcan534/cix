// Everyone's own number (082, public-no.mjs, docs/KIMLIK_NUMARASI.md): the server gives each account a unique number,
// never changed, the one the old app already showed for it where no older account has it, always of the shape the
// contact filter lets through; a room's ID is its owner's number. Anyone is found by it (a special ID and an open
// room's old 8-digit ID too), and staff search and the panel's account fields take it instead of the account's uuid.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { startApi } from './harness.mjs';

// rooms.mjs roomCode, the old 8-digit room ID (that module loads the LiveKit one, which needs keys, so it isn't
// imported here; a different formula would fail the lookups below).
const roomCode = (id) => String(10_000_000 + [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9_000_000, 7));

const h = startApi();
const { call } = h;
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
const rnd = () => Math.random().toString(36).slice(2, 10);
/** The number the old app works out for an account (app data/profile seedOf and displayId). */
const appNo = (id) => String(100_000_000_000 + (([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_003, 17) * 7919) % 900_000_000_000));
/** The shape every number has: what the contact filter lets through as a user ID (contact-filter.mjs userId). */
const shaped = (n) => /^10[0-7]\d{9}$/.test(n) && (Number(n) - 100_000_000_000) % 7919 === 0;
const lookup = (no, who) => call('GET', `/api/lookup?no=${encodeURIComponent(no)}`, null, who.session);
// The app's copy (app/src/data/profile.ts seedOf and displayId): what older apps show must stay the server's.
const profileSrc = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'app', 'src', 'data', 'profile.ts'), 'utf8');
const appSeedOf = new Function('id', `return ${/export const seedOf = \(id: string\) => (.+);\r?\n/.exec(profileSrc)[1]}`);
const appDisplayId = new Function('seedOf', 'id', `return ${/export const displayId = \(id: string\) => (.+);\r?\n/.exec(profileSrc)[1]}`);

describe('Herkesin kendi numarası', () => {
  test('uygulamanın formülü veritabanınınkiyle aynı (eski uygulamalar aynı numarayı gösterir)', async () => {
    for (const id of [crypto.randomUUID(), '00000000-0000-4000-8000-000000000000', 'ffffffff-ffff-4fff-bfff-ffffffffffff']) {
      const db = (await h.sql.query('SELECT app_public_no($1::uuid)::text AS n', [id])).rows[0].n;
      assert.equal(appDisplayId(appSeedOf, id), db, id);
      assert.equal(appNo(id), db, id);
    }
  });

  test('her hesabın numarası eşsiz, eski uygulamanın gösterdiği, iletişim filtresinin tanıdığı biçimde; profilde ve listelerde', async () => {
    const a = await h.signUp('Numaralı Ayşe');
    const b = await h.signUp('Numaralı Burak');
    const me = (await ok(call('GET', '/api/me', null, a.session), 'ben')).user;
    assert.equal(me.publicNo, appNo(a.user.id), 'eski uygulamanın numarası');
    assert.ok(shaped(me.publicNo));
    const prof = (await ok(call('GET', `/api/user?id=${b.user.id}`, null, a.session), 'profil')).user;
    assert.equal(prof.publicNo, appNo(b.user.id));
    // Staff-made accounts and every other way an account is made get one too (the trigger).
    const staff = await h.account('Numaralı Yönetici', 'admin');
    assert.equal((await ok(call('GET', '/api/me', null, staff.session), 'yönetici')).user.publicNo, appNo(staff.user.id));
    const all = (await h.sql.query('SELECT count(*)::int AS n, count(DISTINCT public_no)::int AS d, bool_and(public_no IS NOT NULL) AS every FROM users')).rows[0];
    assert.deepEqual([all.d, all.every], [all.n, true], 'herkesin, hepsi ayrı');
  });

  test('eski uygulamada aynı numaraya düşen ikinci hesap boş bir numara alır, aynı biçimde; numara değişmez', async () => {
    // Two account ids the old app gives the same number (about a million numbers: a pair turns up soon).
    const seen = new Map();
    let pair = null;
    while (!pair) {
      const id = crypto.randomUUID();
      const n = appNo(id);
      if (seen.has(n)) pair = [seen.get(n), id];
      else seen.set(n, id);
    }
    const insert = async (id, name) => (await h.sql.query('INSERT INTO users (id, name) VALUES ($1, $2) RETURNING public_no::text AS n', [id, name])).rows[0].n;
    const first = await insert(pair[0], 'İlk Gelen');
    const second = await insert(pair[1], 'İkinci Gelen');
    assert.equal(first, appNo(pair[0]), 'ilk gelen eski numarasını alır');
    assert.notEqual(second, first, 'ikincisi başka');
    assert.ok(shaped(second), `biçim: ${second}`);
    await h.sql.query("UPDATE users SET name = 'Adı Değişti' WHERE id = $1", [pair[1]]);
    assert.equal((await h.sql.query('SELECT public_no::text AS n FROM users WHERE id = $1', [pair[1]])).rows[0].n, second, 'değişmez');
    await assert.rejects(h.sql.query('UPDATE users SET public_no = $2 WHERE id = $1', [pair[1], first]), /users_public_no/);
    await assert.rejects(h.sql.query('UPDATE users SET public_no = 123456789012 WHERE id = $1', [pair[1]]), /users_public_no_shape/);
  });

  test('numarayla bulunur: kişi ve açık odası (oda ID’si sahibinin numarası), özel ID, eski 8 haneli oda ID’si; engelleyen bulunmaz', async () => {
    const a = await h.signUp('Arayan Ali');
    const b = await h.signUp('Bulunan Banu');
    const noB = appNo(b.user.id);
    let j = await ok(lookup(noB, a), 'numara');
    assert.deepEqual(j, { user: { id: b.user.id, name: 'Bulunan Banu', avatarUrl: null, publicNo: noB }, room: null });
    assert.equal((await ok(lookup(`${noB.slice(0, 4)} ${noB.slice(4, 8)} ${noB.slice(8)}`, a), 'boşluklu')).user.id, b.user.id);

    // Her room: its ID is her number, however often she opens it again; the old app's 8-digit one still finds it.
    const room = (await ok(call('POST', '/api/rooms', { title: 'Banu’nun Odası' }, b.session), 'oda')).room;
    assert.deepEqual([room.code, room.owner.publicNo], [noB, noB]);
    j = await ok(lookup(noB, a), 'odalı');
    assert.deepEqual(j.room, { id: room.id, title: 'Banu’nun Odası', code: noB });
    assert.equal((await ok(lookup(roomCode(room.id), a), 'eski oda ID')).user.id, b.user.id);
    const listed = (await ok(call('GET', '/api/rooms', null, a.session), 'oda listesi')).rooms.find((r) => r.id === room.id);
    assert.equal(listed?.code, noB);

    // A special ID someone has (the shop's "ID 777", one owner each), as a staff grant leaves it.
    await h.sql.query("INSERT INTO entitlements (user_id, sku, kind, price, source, ref) VALUES ($1, 'id-777', 'specialId', 0, 'admin', $2)", [b.user.id, `admin:pn-${rnd()}`]);
    assert.equal((await ok(lookup('ID 777', a), 'özel ID')).user.id, b.user.id);
    assert.equal((await ok(lookup('777', a), 'özel ID sade')).user.id, b.user.id);

    await refused(lookup('100000000001', a), 404, /kimse yok/);
    await refused(lookup('abc', a), 404);
    // Someone who blocked me isn't found; one I blocked is.
    await ok(call('POST', '/api/block', { to: a.user.id }, b.session), 'engelle');
    await refused(lookup(noB, a), 404);
    assert.equal((await ok(lookup(appNo(a.user.id), b), 'engellediğim')).user.id, a.user.id);
  });

  test('yetkililer numarayla arar: Kullanıcılar araması, panelin hesap alanları, Yaptırımlar, PK için oda araması', async () => {
    const admin = await h.account('Arama Yöneticisi', 'admin');
    const c = await h.signUp('Aranan Cem');
    const d = await h.signUp('Aranan Deniz');
    const noC = appNo(c.user.id);
    const found = (await ok(call('GET', `/api/admin/users?q=${noC}`, null, admin.session), 'arama')).users;
    assert.deepEqual(found.map((u) => [u.id, u.publicNo]), [[c.user.id, noC]]);

    const j = await ok(call('GET', `/api/admin/lookup?no=${noC}`, null, admin.session), 'panel');
    assert.deepEqual(j.user, { id: c.user.id, name: 'Aranan Cem', username: null, publicNo: noC, role: 'user' });
    await refused(call('GET', `/api/admin/lookup?no=${noC}`, null, d.session), 403);
    await refused(call('GET', '/api/admin/lookup?no=100000000001', null, admin.session), 404, /profilindeki ID/);
    const sanctioned = (await ok(call('GET', `/api/admin/sanctions/search?q=${encodeURIComponent(`ID: ${noC}`)}`, null, admin.session), 'yaptırım araması')).users;
    assert.deepEqual(sanctioned.map((u) => [u.id, u.publicNo]), [[c.user.id, noC]]);

    // PK with another room, found by its ID (its owner's number) from my room.
    const mine = (await ok(call('POST', '/api/rooms', { title: 'Cem PK Odası' }, c.session), 'oda 1')).room;
    const theirs = (await ok(call('POST', '/api/rooms', { title: 'Deniz PK Odası' }, d.session), 'oda 2')).room;
    const rooms = (await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${mine.id}&q=${appNo(d.user.id)}`, null, c.session), 'PK arama')).rooms;
    assert.deepEqual(rooms.map((r) => [r.id, r.code]), [[theirs.id, appNo(d.user.id)]]);
    const byName = (await ok(call('GET', `/api/rooms/pk/cross/rooms?room=${mine.id}&q=${encodeURIComponent('Deniz PK')}`, null, c.session), 'adla')).rooms;
    assert.deepEqual(byName.map((r) => r.id), [theirs.id]);

    // An older app's ID of a room closed since: nobody for the app, its owner for staff (a report names it).
    const old = roomCode(mine.id);
    await ok(call('POST', '/api/rooms/close', { id: mine.id }, c.session), 'oda kapandı');
    await refused(lookup(old, d), 404);
    assert.deepEqual((await ok(call('GET', `/api/admin/users?q=${old}`, null, admin.session), 'kapalı oda')).users.map((u) => u.id), [c.user.id]);
    assert.deepEqual((await ok(call('GET', `/api/admin/sanctions/search?q=${old}`, null, admin.session), 'yaptırımda kapalı oda')).users.map((u) => u.id), [c.user.id]);
  });
});
