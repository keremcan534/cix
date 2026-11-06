// Bağlar (bonds.mjs) against a real Postgres: request holds the coins, accept pays them as a gift, refuse /
// withdraw / expiry give them back, limits, one bond per pair, points from gifts and replies, ending, privacy.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { rnd, startApi } from './harness.mjs';

const h = startApi({ BOND_SWEEP_MS: '300' });
const { call, signUp } = h;
const me = async (s) => (await call('GET', '/api/me', null, s))[1].user;
// Test top-ups come in packs of 1000, 5000 and 10000; `amount` is made of those.
const topUp = async (s, amount) => {
  for (const pack of [10000, 5000, 1000]) {
    for (; amount >= pack; amount -= pack) {
      const [st, j] = await call('POST', '/api/wallet/test-topup', { amount: pack, ref: rnd(6) }, s);
      assert.equal(st, 200, j.error);
    }
  }
  assert.equal(amount, 0, 'paketlerle yüklenemeyen miktar');
};
const ask = (s, to, kind, ref = rnd(6)) => call('POST', '/api/bonds/request', { to, kind, ref }, s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Bağlar', () => {
  test('istek jetonu tutar, kabul hediye olarak öder, tek kez', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    await topUp(a.session, 6000);
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => ask(a.session, b.user.id, 'cift', ref)));
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.equal((await me(a.session)).coins, 1000, 'aynı istek iki kez gelse de bir kez düşer');
    const [, req] = await call('GET', '/api/bonds/requests', null, b.session);
    assert.equal(req.incoming.length, 1);
    assert.equal(req.incoming[0].label, 'Çift');
    assert.equal(req.incoming[0].partner.id, a.user.id);
    assert.equal((await call('POST', '/api/bonds/respond', { id: req.incoming[0].id, accept: true }, a.session))[0], 403, 'kendi isteğini kabul edemez');
    const [st, done] = await call('POST', '/api/bonds/respond', { id: req.incoming[0].id, accept: true }, b.session);
    assert.equal(st, 200, done.error);
    assert.equal(done.bond.status, 'active');
    assert.equal(done.bond.score, 50, '5.000 jetonluk bağ hediyesi 50 puan');
    assert.equal(done.bond.level, 3);
    assert.equal((await me(b.session)).diamonds, 5000, 'bağ hediyesi elmas olarak geçer');
    assert.equal((await call('POST', '/api/bonds/respond', { id: req.incoming[0].id, accept: true }, b.session))[0], 409, 'ikinci kez kabul yok');
    const gift = await h.sql.query("SELECT gift_id, total FROM gift_events WHERE recipient = $1", [b.user.id]);
    assert.deepEqual(gift.rows.map((r) => [r.gift_id, Number(r.total)]), [['bag-cift', 5000]]);
    const [, wall] = await call('GET', `/api/bonds?user=${a.user.id}`, null, b.session);
    assert.equal(wall.bonds.length, 1);
    assert.equal(wall.bonds[0].partner.id, b.user.id, 'A\'nın duvarında karşı taraf B');
  });

  test('ret ve geri alma jetonu aynı kaynağa iade eder', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    const c = await signUp('C');
    await topUp(a.session, 2000);
    const [, r1] = await ask(a.session, b.user.id, 'kardes');
    const [, r2] = await ask(a.session, c.user.id, 'kanka');
    assert.equal((await me(a.session)).coins, 500);
    assert.equal((await call('POST', '/api/bonds/respond', { id: r1.bond.id, accept: false }, b.session))[1].bond.status, 'refused');
    assert.equal((await call('POST', '/api/bonds/withdraw', { id: r2.bond.id }, b.session))[0], 403);
    assert.equal((await call('POST', '/api/bonds/withdraw', { id: r2.bond.id }, a.session))[1].bond.status, 'withdrawn');
    assert.equal((await me(a.session)).coins, 2000);
    const lots = await h.sql.query('SELECT sum(remaining) AS n FROM coin_lots WHERE user_id = $1', [a.user.id]);
    assert.equal(Number(lots.rows[0].n), 2000, 'jeton kendi paketine döner');
    assert.equal((await me(b.session)).diamonds, 0);
  });

  test('süresi dolan istek iade edilir (açınca ve arka planda)', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    const c = await signUp('C');
    await topUp(a.session, 2000);
    const [, r1] = await ask(a.session, b.user.id, 'abla');
    const [, r2] = await ask(a.session, c.user.id, 'abla');
    await h.sql.query("UPDATE bonds SET expires_at = now() - interval '1 minute' WHERE id = $1", [r1.bond.id]);
    assert.equal((await call('POST', '/api/bonds/respond', { id: r1.bond.id, accept: true }, b.session))[0], 410);
    await h.sql.query("UPDATE bonds SET expires_at = now() - interval '1 minute' WHERE id = $1", [r2.bond.id]);
    for (let i = 0; i < 40 && (await me(a.session)).coins < 2000; i++) await wait(100);
    assert.equal((await me(a.session)).coins, 2000);
    const st = await h.sql.query('SELECT status FROM bonds WHERE a = $1 ORDER BY id', [a.user.id]);
    assert.deepEqual(st.rows.map((r) => r.status), ['expired', 'expired']);
  });

  test('sınırlar: çift tek, aynı ikili tek bağ, yetersiz jeton, kendine yok', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => signUp(n)));
    await topUp(a.session, 20000);
    await topUp(c.session, 20000);
    const [, r] = await ask(a.session, b.user.id, 'cift');
    assert.equal((await ask(a.session, b.user.id, 'kanka'))[0], 409, 'aynı kişiyle ikinci istek yok');
    assert.equal((await ask(a.session, d.user.id, 'cift'))[0], 409, 'bekleyen çift isteği varken ikincisi yok');
    await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session);
    const [full, why] = await ask(c.session, b.user.id, 'cift');
    assert.equal(full, 409);
    assert.match(why.error, /dolu/);
    assert.equal((await ask(a.session, a.user.id, 'kanka'))[0], 400);
    assert.equal((await ask(a.session, c.user.id, 'patron'))[0], 400);
    assert.equal((await ask(d.session, a.user.id, 'kanka'))[0], 409, 'jetonu yok');
    assert.equal((await me(d.session)).coins, 0);
    // Three of a kind at most.
    const others = await Promise.all(['E', 'F', 'G', 'H'].map((n) => signUp(n)));
    for (const o of others.slice(0, 3)) assert.equal((await ask(c.session, o.user.id, 'agabey'))[0], 200);
    assert.equal((await ask(c.session, others[3].user.id, 'agabey'))[0], 409);
  });

  test('puan: hediye ve karşılıklı mesaj; bitirince sıfırlanır, 7 gün bekleme', async () => {
    const a = await signUp('A');
    const b = await signUp('B');
    await topUp(a.session, 5000);
    const [, r] = await ask(a.session, b.user.id, 'kanka');
    await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session);
    await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g4', count: 1, ref: rnd(6) }, a.session);
    const send = (s, to) => call('POST', '/api/messages', { to, text: 'selam', ref: rnd(6) }, s);
    await send(a.session, b.user.id);
    await send(a.session, b.user.id);
    for (let i = 0; i < 12; i++) {
      await send(b.session, a.user.id);
      await send(a.session, b.user.id);
    }
    await wait(200);
    const [, mine] = await call('GET', '/api/bonds', null, a.session);
    const bond = mine.bonds[0];
    const gift = await h.sql.query('SELECT gift_coins, talk_points FROM bonds WHERE id = $1', [bond.id]);
    assert.ok(Number(gift.rows[0].gift_coins) > 500, 'bağ varken gönderilen hediye puana eklenir');
    assert.equal(gift.rows[0].talk_points, 10, 'cevap mesajları günde en çok 10 puan');
    assert.equal((await call('POST', '/api/bonds/end', { id: bond.id }, b.session))[1].bond.status, 'ended');
    assert.equal((await call('GET', '/api/bonds', null, a.session))[1].bonds.length, 0);
    const [again, why] = await ask(a.session, b.user.id, 'kanka');
    assert.equal(again, 409);
    assert.match(why.error, /7 gün/);
  });

  test('gizlilik: başkası göremez, kendisi görür; bağın öbür ucu yalnızca kendi bağını görür', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => signUp(n)));
    await topUp(a.session, 2000);
    const [, r] = await ask(a.session, b.user.id, 'kanka');
    await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session);
    const [, r2] = await ask(a.session, c.user.id, 'kardes');
    await call('POST', '/api/bonds/respond', { id: r2.bond.id, accept: true }, c.session);
    await call('POST', '/api/bonds/privacy', { hidden: true }, a.session);
    assert.deepEqual((await call('GET', `/api/bonds?user=${a.user.id}`, null, d.session))[1], { hidden: true, bonds: [] }, 'bağı olmayan hiçbirini görmez');
    // B is in one of A's bonds: B still sees that one (so the app offers no "Bağ kur"), never A's bond with C.
    const [, other] = await call('GET', `/api/bonds?user=${a.user.id}`, null, b.session);
    assert.equal(other.hidden, true);
    assert.deepEqual(other.bonds.map((x) => [x.id, x.partner.id, x.kind]), [[r.bond.id, b.user.id, 'kanka']]);
    const [, third] = await call('GET', `/api/bonds?user=${a.user.id}`, null, c.session);
    assert.deepEqual(third.bonds.map((x) => [x.id, x.partner.id]), [[r2.bond.id, c.user.id]]);
    const [again, why] = await ask(b.session, a.user.id, 'kardes');
    assert.equal(again, 409, 'gizli olsa da ikinci bağ yok');
    assert.match(why.error, /zaten bir bağın var/);
    const [, own] = await call('GET', '/api/bonds', null, a.session);
    assert.equal(own.hidden, true);
    assert.equal(own.bonds.length, 2);
    const [, info] = await call('GET', '/api/bonds/info');
    assert.equal(info.kinds.find((k) => k.id === 'cift').price, 5000);
  });

  test('odadaki bağlar: gizli olan başkasına gelmez, kendine gelir', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => signUp(n)));
    await topUp(a.session, 6000);
    await topUp(c.session, 1000);
    const [, r1] = await ask(a.session, b.user.id, 'cift');
    const [, r2] = await ask(c.session, d.user.id, 'kanka');
    await call('POST', '/api/bonds/respond', { id: r1.bond.id, accept: true }, b.session);
    await call('POST', '/api/bonds/respond', { id: r2.bond.id, accept: true }, d.session);
    const among = (s, ids) => call('POST', '/api/bonds/among', { ids }, s);
    const [st, all] = await among(d.session, [a.user.id, c.user.id]);
    assert.equal(st, 200, all.error);
    const key = (x) => `${x.kind}:${x.level}:${[x.a, x.b].sort().join()}`;
    assert.deepEqual(all.bonds.map(key).sort(), [key({ kind: 'cift', level: 3, a: a.user.id, b: b.user.id }), key({ kind: 'kanka', level: 1, a: c.user.id, b: d.user.id })].sort(), 'odadakilerin bağları, eşi dışarıda olsa da');
    await call('POST', '/api/bonds/privacy', { hidden: true }, b.session);
    assert.deepEqual((await among(d.session, [a.user.id]))[1].bonds, [], 'B gizledi: başkası görmez');
    assert.equal((await among(a.session, [a.user.id, b.user.id]))[1].bonds.length, 1, 'kendi bağını görür');
    assert.equal((await among(a.session, ['x']))[0], 400);
    assert.deepEqual((await among(a.session, []))[1].bonds, []);
  });
});
