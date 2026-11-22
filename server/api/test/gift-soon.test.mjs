// "Yakında" (owners, 22 Nov 2026): on Aile ve Dost, Koruma Kartı stays on; the bond gifts but Çift's show greyed with
// "Yakında" and can't be sent, nor their bonds asked for; the panel turns each on or off. Kalbim Seninle (Çift's
// bond gift, bag-cift) is on Çift. A newer app (catalog ?soon=1) gets them with soon: true; an older one, which would
// offer them, doesn't get them, and the server refuses its sends.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS_SOON_DEFAULT } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ GIFTS_SOON: undefined });
const { call, signUp } = h;
const catalog = async (q) => (await call('GET', `/api/catalog?gifts=2&family=1${q}`))[1];
const gift = (c, id) => c.gifts.find((g) => g.id === id);
const topUp = (s, amount) => call('POST', '/api/wallet/test-topup', { amount, ref: rnd(6) }, s);

describe('Yakında hediyeler', () => {
  test('varsayılan: Koruma Kartı açık, Kalbim Seninle Çift rafında, öteki bağ hediyeleri Yakında', async () => {
    const c = await catalog('&soon=1');
    assert.deepEqual(GIFTS_SOON_DEFAULT, ['bag-kanka', 'bag-kardes', 'bag-baci', 'bag-agabey', 'bag-abla', 'bag-yenge', 'bag-enishte']);
    for (const id of GIFTS_SOON_DEFAULT) assert.equal(gift(c, id)?.soon, true, id);
    assert.equal(gift(c, 'koruma').soon, undefined);
    assert.deepEqual([gift(c, 'bag-cift').cat, gift(c, 'bag-cift').soon], ['couple', undefined]);
    assert.deepEqual([...c.bonds.soon].sort(), ['abla', 'agabey', 'baci', 'enishte', 'kanka', 'kardes', 'yenge']);
    // An older app: not on its shelves at all.
    const old = await catalog('');
    for (const id of GIFTS_SOON_DEFAULT) assert.equal(gift(old, id), undefined, id);
    assert.ok(gift(old, 'koruma') && gift(old, 'bag-cift'));
  });

  test('bağ isteği ve hediye reddedilir, jeton oynamaz; panel açıp kapatır', async () => {
    const [admin, a, b] = await Promise.all(['Yönetici', 'A', 'B'].map((n) => signUp(n)));
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    assert.equal((await topUp(a.session, 5000))[0], 200);
    const coins = async () => (await call('GET', '/api/me', null, a.session))[1].user.coins;
    const before = await coins();
    const [st, j] = await call('POST', '/api/bonds/request', { to: b.user.id, kind: 'kanka', ref: rnd(6) }, a.session);
    assert.deepEqual([st, j.error, j.code], [409, 'Kanka bağı yakında açılacak', 'soon']);
    assert.equal(await coins(), before, 'jeton oynamadı');

    // The panel opens it: the bond is asked for and accepted.
    const set = (id, soon) => call('POST', '/api/admin/gifts/update', { id, soon }, admin.session);
    assert.equal((await set('bag-kanka', false))[0], 200);
    assert.equal(gift(await catalog('&soon=1'), 'bag-kanka').soon, undefined);
    assert.ok(gift(await catalog(''), 'bag-kanka'), 'eski uygulama da görür');
    const [rs, r] = await call('POST', '/api/bonds/request', { to: b.user.id, kind: 'kanka', ref: rnd(6) }, a.session);
    assert.equal(rs, 200, r.error);
    assert.equal((await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session))[0], 200);
    // Closed again: the bond stays, its gift can't be sent.
    assert.equal((await set('bag-kanka', true))[0], 200);
    const mid = await coins();
    const [gs, g] = await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'bag-kanka', count: 1, price: 500, place: 'profile', ref: rnd(6) }, a.session);
    assert.deepEqual([gs, g.error], [409, 'Kanka Rozeti yakında açılacak']);
    assert.equal(await coins(), mid);
    assert.equal((await h.sql.query("SELECT count(*)::int AS n FROM bonds WHERE status = 'active' AND $1 IN (pair_lo, pair_hi)", [a.user.id])).rows[0].n, 1, 'bağ sürer');
    // Only the app's own gifts have it; Koruma Kartı can be put on it too.
    assert.equal((await set('koruma', true))[0], 200);
    assert.equal(gift(await catalog('&soon=1'), 'koruma').soon, true);
    assert.equal((await set('koruma', false))[0], 200);
    assert.equal((await set('bag-kanka', 'evet'))[0], 400);
    const audit = await h.sql.query("SELECT count(*)::int AS n FROM audit_events WHERE action = 'gift.update' AND detail->>'gift' = 'bag-kanka'");
    assert.ok(audit.rows[0].n >= 2, 'denetime yazılır');
  });

  test('bağ hediyesi Aile ve Dost ya da Çift rafında olur, başka rafta olmaz', async () => {
    const admin = await signUp('Raf Yöneticisi');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
    assert.equal((await call('POST', '/api/admin/gifts/update', { id: 'bag-kardes', cat: 'couple' }, admin.session))[0], 200);
    const [st, j] = await call('POST', '/api/admin/gifts/update', { id: 'bag-kardes', cat: 'hot' }, admin.session);
    assert.deepEqual([st, j.error], [400, 'Bağ hediyesi Aile ve Dost ya da Çift rafında kalır']);
    assert.equal((await call('POST', '/api/admin/gifts/update', { id: 'bag-kardes', cat: 'family' }, admin.session))[0], 200);
  });
});
