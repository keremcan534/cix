// Aile (families.mjs) against a real Postgres: founding fee once, one family per person, open and approved joins,
// roles, kicking, handing over, the chat, power from gifts, profiles and account deletion.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ AUTO_MUTE_REFUSALS: '0' });
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
const ok = async (p, what) => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const topUp = (s) => ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, s), 'yükleme');
const found = (s, name, ref = rnd(6)) => call('POST', '/api/families', { name, ref }, s);

describe('Aile', () => {
  test('ücret ve seviye tablosu uygulamadakiyle aynı', () => {
    const app = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'app', 'src', 'data', f), 'utf8');
    const server = fs.readFileSync(path.join(import.meta.dirname, '..', 'families.mjs'), 'utf8');
    assert.equal(/KABILE_CREATE_COST = (\d+)/.exec(app('kabile.ts'))[1], /FAMILY_COST = (\d+)/.exec(server)[1]);
    const xp = (s) => /FAMILY_XP = \[([^\]]+)\]/.exec(s)[1].replace(/\s/g, '');
    assert.equal(xp(app('rules.ts')), xp(server));
  });

  test('kurma: ücret bir kez, tek aile, aynı isim yok', async () => {
    const a = await signUp('Lider');
    assert.equal((await found(a.session, 'Kartallar'))[0], 409, 'jetonsuz kurulamaz');
    await topUp(a.session);
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => found(a.session, 'Kartallar', ref)));
    assert.deepEqual(both.map((x) => x[0]), [200, 200], JSON.stringify(both.map((x) => x[1].error)));
    assert.equal((await me(a.session)).coins, 500, 'ücret bir kez');
    const f = both[0][1].family;
    assert.equal(f.name, 'Kartallar');
    assert.equal(f.members, 1);
    assert.equal(f.level, 1);
    assert.equal(f.capacity, 50);
    assert.equal((await found(a.session, 'İkinci'))[0], 409, 'bir kişi tek aile');

    const b = await signUp('Öteki');
    await topUp(b.session);
    assert.equal((await found(b.session, 'kartallar'))[0], 409, 'aynı isim');
    assert.notEqual((await found(b.session, 'ara 0532 123 45 67'))[0], 200, 'iletişim bilgisi yok');
    assert.equal((await me(b.session)).coins, 1000, 'reddedilen kurulum jeton almaz');
  });

  test('katılma: onaylı ve açık, roller, çıkarma, devir', async () => {
    const lead = await signUp('Başkan');
    await topUp(lead.session);
    const { family } = await ok(found(lead.session, 'Martılar'), 'kur');
    const x = await signUp('Üye1');
    const y = await signUp('Üye2');

    const r = await ok(call('POST', '/api/family/join', { id: family.id }, x.session), 'istek');
    assert.deepEqual(r, { requested: true });
    const seen = await ok(call('GET', `/api/family?id=${family.id}`, null, x.session), 'göz at');
    assert.equal(seen.requested, true);
    assert.equal(seen.myRole, null);
    assert.deepEqual(seen.requests, [], 'istekleri yalnız yönetenler görür');

    const mine = await ok(call('GET', '/api/family', null, lead.session), 'ailem');
    assert.equal(mine.myRole, 'owner');
    assert.deepEqual(mine.requests.map((q) => q.id), [x.user.id]);
    assert.equal((await call('POST', '/api/family/request', { userId: x.user.id, accept: true }, x.session))[0], 403, 'istek sahibi kendini kabul edemez');
    const acc = await ok(call('POST', '/api/family/request', { userId: x.user.id, accept: true }, lead.session), 'kabul');
    assert.deepEqual(acc.members.map((m) => [m.name, m.role]), [['Başkan', 'owner'], ['Üye1', 'member']]);

    await ok(call('POST', '/api/family/settings', { joinMode: 'open' }, lead.session), 'açık katılım');
    assert.equal((await call('POST', '/api/family/settings', { joinMode: 'approve' }, x.session))[0], 403, 'üye ayar değiştiremez');
    assert.deepEqual(await ok(call('POST', '/api/family/join', { id: family.id }, y.session), 'katıl'), { joined: true });

    await ok(call('POST', '/api/family/role', { userId: x.user.id, role: 'helper' }, lead.session), 'yardımcı');
    assert.equal((await call('POST', '/api/family/role', { userId: y.user.id, role: 'helper' }, x.session))[0], 403, 'yardımcı rol veremez');
    assert.equal((await call('POST', '/api/family/kick', { userId: lead.user.id }, x.session))[0], 403, 'lider çıkarılamaz');
    const kicked = await ok(call('POST', '/api/family/kick', { userId: y.user.id }, x.session), 'yardımcı üyeyi çıkarır');
    assert.equal(kicked.members.length, 2);
    assert.equal((await ok(call('GET', '/api/family', null, y.session), 'çıkan')).family, null);

    // The leader leaves: the helper leads; the last one out closes the family.
    await ok(call('POST', '/api/family/leave', {}, lead.session), 'lider ayrılır');
    const after = await ok(call('GET', '/api/family', null, x.session), 'yeni lider');
    assert.equal(after.myRole, 'owner');
    assert.equal(after.family.leader.id, x.user.id);
    await ok(call('POST', '/api/family/leave', {}, x.session), 'son kişi');
    assert.equal((await call('GET', `/api/family?id=${family.id}`, null, x.session))[0], 404, 'aile kapandı');
    assert.equal((await call('POST', '/api/family/leave', {}, x.session))[0], 409);
  });

  test('sohbet, hediye gücü, profil ve hesap silme', async () => {
    const a = await signUp('Yazar');
    await topUp(a.session);
    const { family } = await ok(found(a.session, 'Yıldızlar'), 'kur');
    const out = await signUp('Dışarıdan');
    assert.equal((await call('GET', '/api/family/chat', null, out.session))[0], 403, 'üye olmayan okuyamaz');
    assert.equal((await call('POST', '/api/family/chat', { text: 'selam' }, out.session))[0], 403);
    const m = await ok(call('POST', '/api/family/chat', { text: 'Herkese selam' }, a.session), 'yaz');
    assert.notEqual((await call('POST', '/api/family/chat', { text: 'mail: a@b.com' }, a.session))[0], 200, 'iletişim bilgisi yok');
    const chat = await ok(call('GET', '/api/family/chat', null, a.session), 'oku');
    assert.deepEqual(chat.messages.map((x) => x.text), ['Herkese selam']);
    assert.deepEqual((await ok(call('GET', `/api/family/chat?after=${m.message.id}`, null, a.session), 'yeni')).messages, []);

    // A gift sent after joining counts towards the family's power.
    await ok(call('POST', '/api/gifts/send', { to: out.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, a.session), 'hediye');
    const list = await ok(call('GET', '/api/families?q=Yıldız', null, out.session), 'liste');
    const f = list.families.find((x) => x.id === family.id);
    assert.ok(f.power > 0 && f.weekly === f.power, JSON.stringify(f));
    assert.equal(list.mine, null);

    const prof = await ok(call('GET', `/api/user?id=${a.user.id}`, null, out.session), 'profil');
    assert.deepEqual(prof.family, { id: family.id, name: 'Yıldızlar', role: 'owner' });
    assert.equal(prof.agency, null);

    await ok(call('DELETE', '/api/me', null, a.session), 'hesap silme');
    assert.equal((await h.sql.query('SELECT closed_at FROM families WHERE id = $1', [family.id])).rows[0].closed_at !== null, true, 'tek üyeli aile kapanır');
  });
});
