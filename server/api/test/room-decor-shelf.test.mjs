// Oda Süslemesi › Ücretli as it ships (room-decor.mjs, no ROOM_BG_PREVIEW): a paid background whose picture isn't
// in the released app is listed as "yakında" and can't be bought, so nobody pays for a room nobody can draw.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_BGS } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi();
const { call, signUp } = h;

describe('Oda Süslemesi › Ücretli raf', () => {
  test('görseli uygulamada olmayan süsleme "yakında"dır: listelenir, satılmaz, jeton alınmaz', async () => {
    const owner = await signUp('Raf Sahibi');
    const [, made] = await call('POST', '/api/rooms', { title: 'Raf' }, owner.session);
    const room = made.room.id;
    await call('POST', '/api/wallet/test-topup', { amount: 10_000, ref: rnd(6) }, owner.session);
    const [st, j] = await call('GET', `/api/rooms/decor?room=${room}`, null, owner.session);
    assert.equal(st, 200, j.error);
    const waiting = [...ROOM_BGS.values()].filter((x) => !x.sale);
    assert.ok(waiting.length > 0, 'bu test, görseli bekleyen en az bir süsleme varken anlamlı');
    for (const x of waiting) {
      assert.equal(j.decor.paid.items.find((i) => i.sku === x.sku).onSale, false, x.sku);
      const [code, e] = await call('POST', '/api/rooms/decor/buy', { room, sku: x.sku, price: x.price, ref: rnd(6) }, owner.session);
      assert.deepEqual([code, e.code], [409, 'not_on_sale'], x.sku);
    }
    assert.equal((await call('GET', '/api/me', null, owner.session))[1].user.coins, 10_000);
    assert.equal((await h.sql.query("SELECT 1 FROM entitlements WHERE kind = 'roombg'")).rowCount, 0);
    // The shop's own routes don't sell a room background either.
    assert.equal((await call('POST', '/api/shop/buy', { sku: waiting[0].sku, price: waiting[0].price, ref: rnd(6) }, owner.session))[0], 400);
  });

  test('fiyatlar mağazanın 30 günlük basamaklarında ve özel süslemeden ucuz', () => {
    for (const x of ROOM_BGS.values()) {
      assert.match(x.sku, /^rb-[a-z0-9]{2,20}$/);
      assert.equal(x.kind, 'roombg');
      assert.equal(x.days, 30);
      assert.ok([600, 900, 1_200, 2_000].includes(x.price), `${x.sku}: ${x.price}`);
    }
  });
});
