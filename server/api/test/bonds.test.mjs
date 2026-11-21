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
/** `fn` until it gives something truthy (the bond sweep runs every 300 ms here). */
async function until(fn, what, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) {
    const v = await fn();
    if (v) return v;
  }
  assert.fail(`beklenen olmadı: ${what}`);
}
let admin = null;
/** Canlı ayarlar, saved by an admin (null: back to the default). */
async function setLive(changes) {
  if (!admin) {
    admin = await signUp('Yönetici');
    await h.sql.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  }
  const [, view] = await call('GET', '/api/admin/live-settings', null, admin.session);
  const [st, j] = await call('POST', '/api/admin/live-settings', { changes, reason: 'Bağlar testi', baseV: view.v, confirm: true }, admin.session);
  assert.equal(st, 200, j.error);
}

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
    // Aile kinds are practically unlimited by default (1000); a panel limit holds: three of a kind at most here.
    const others = await Promise.all(['E', 'F', 'G', 'H', 'I'].map((n) => signUp(n)));
    for (const o of others.slice(0, 4)) assert.equal((await ask(c.session, o.user.id, 'agabey'))[0], 200, 'varsayılan sınır 1000');
    await setLive({ bond_max_kin: 3 });
    try {
      const [st, j] = await ask(c.session, others[4].user.id, 'agabey');
      assert.equal(st, 409);
      assert.match(j.error, /En fazla 3 Ağabey/);
    } finally {
      await setLive({ bond_max_kin: null });
    }
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
    assert.deepEqual((await call('GET', `/api/bonds?user=${a.user.id}`, null, d.session))[1], { hidden: true, bonds: [], total: 0, next: null }, 'bağı olmayan hiçbirini görmez');
    // B is in one of A's bonds: B still sees that one (so the app offers no "Bağ kur"), never A's bond with C.
    const [, other] = await call('GET', `/api/bonds?user=${a.user.id}`, null, b.session);
    assert.equal(other.hidden, true);
    assert.deepEqual(other.bonds.map((x) => [x.id, x.partner.id, x.kind]), [[r.bond.id, b.user.id, 'kanka']]);
    const [, third] = await call('GET', `/api/bonds?user=${a.user.id}`, null, c.session);
    assert.deepEqual(third.bonds.map((x) => [x.id, x.partner.id]), [[r2.bond.id, c.user.id]]);
    const [again, why] = await ask(b.session, a.user.id, 'kardes');
    assert.equal(again, 409, 'gizli olsa da ikinci bağ yok');
    assert.equal(why.error, 'Aranızda Kanka bağı var');
    const [, own] = await call('GET', '/api/bonds', null, a.session);
    assert.equal(own.hidden, true);
    assert.equal(own.bonds.length, 2);
    const [, info] = await call('GET', '/api/bonds/info');
    assert.equal(info.kinds.find((k) => k.id === 'cift').price, 5000);
  });

  test('odadaki bağlar: ikisi de odadaysa; balon için Lv10 bağ eşi dışarıda da; gizli olan başkasına gelmez, kendine gelir', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => signUp(n)));
    await topUp(a.session, 6000);
    await topUp(c.session, 1000);
    const [, r1] = await ask(a.session, b.user.id, 'cift');
    const [, r2] = await ask(c.session, d.user.id, 'kanka');
    await call('POST', '/api/bonds/respond', { id: r1.bond.id, accept: true }, b.session);
    await call('POST', '/api/bonds/respond', { id: r2.bond.id, accept: true }, d.session);
    const among = (s, ids) => call('POST', '/api/bonds/among', { ids }, s);
    const key = (x) => `${x.kind}:${x.level}:${[x.a, x.b].sort().join()}`;
    const [st, all] = await among(d.session, [a.user.id, b.user.id, c.user.id]);
    assert.equal(st, 200, all.error);
    assert.deepEqual(all.bonds.map(key), [key({ kind: 'cift', level: 3, a: a.user.id, b: b.user.id })], 'yalnız ikisi de odada olan; C-D Lv1, D odada değil');
    // A Lv10 bond comes for the chat bubble with the partner anywhere (the stored level finds it, the points decide).
    await h.sql.query('UPDATE bonds SET talk_points = 2000, level = 10, level_said = 10 WHERE id = $1', [r2.bond.id]);
    const [, top] = await among(a.session, [a.user.id, c.user.id]);
    assert.deepEqual(top.bonds.map(key), [key({ kind: 'kanka', level: 10, a: c.user.id, b: d.user.id })], 'C\'nin Lv10 bağı, D odada olmasa da');
    await call('POST', '/api/bonds/privacy', { hidden: true }, b.session);
    assert.deepEqual((await among(d.session, [a.user.id, b.user.id]))[1].bonds, [], 'B gizledi: başkası görmez');
    assert.equal((await among(a.session, [a.user.id, b.user.id]))[1].bonds.length, 1, 'kendi bağını görür');
    assert.equal((await among(a.session, ['x']))[0], 400);
    assert.deepEqual((await among(a.session, []))[1].bonds, []);
  });
});

// Güncelleme 7: the same bond gift again is an ordinary gift that adds bond points; points drop on quiet nights and a
// quiet bond ends by itself; every change is told in SimilarClub Sistem; a profile's bonds come a page at a time.
describe('Bağlar: yeniden bağ hediyesi, düşüş, bildirimler', () => {
  const me2 = (s) => me(s);
  const send = (s, to, giftId, count, price, ref = rnd(6), extra = {}) => call('POST', '/api/gifts/send', { to, giftId, count, price, ref, ...extra }, s);
  /** A and B with an active bond of `kind`, A asked (and paid). */
  async function bonded(kind = 'kanka', coins = 6000) {
    const [a, b] = await Promise.all(['A', 'B'].map((n) => signUp(n)));
    await topUp(a.session, coins);
    const [st, r] = await ask(a.session, b.user.id, kind);
    assert.equal(st, 200, r.error);
    const [st2, j] = await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session);
    assert.equal(st2, 200, j.error);
    return { a, b, id: r.bond.id };
  }
  const row = async (id) => (await h.sql.query('SELECT * FROM bonds WHERE id = $1', [id])).rows[0];
  const notes = async (user, ref) =>
    (await h.sql.query("SELECT ref, title, body, kind, link, data FROM team_notices WHERE target = $1 AND category = 'bond' AND ($2::text IS NULL OR ref = $2) ORDER BY id", [user, ref ?? null])).rows;

  test('aynı tür bağ hediyesi sıradan hediye olarak gider: elmas, puan, istediği adet, iki yönden; tekrar isteği bir kez işlenir', async () => {
    const { a, b, id } = await bonded('kanka');
    const before = await me2(a.session);
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => send(a.session, b.user.id, 'bag-kanka', 5, 500, ref, { place: 'profile' })));
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.deepEqual(both.map(([, j]) => j.total), [2500, 2500]);
    assert.equal(both.filter(([, j]) => j.replay).length, 1, 'aynı istek iki kez: biri tekrar');
    assert.equal((await me2(a.session)).coins, before.coins - 2500, 'bir kez düşer');
    assert.equal((await me2(b.session)).diamonds, 500 + 2500, 'kabul edilen bağ hediyesi ve yenisi elmas');
    const g = await h.sql.query("SELECT gift_id, count, total, place FROM gift_events WHERE sender = $1 AND ref = $2", [a.user.id, ref]);
    assert.deepEqual(g.rows.map((x) => [x.gift_id, x.count, Number(x.total), x.place]), [['bag-kanka', 5, 2500, 'profile']]);
    // B sends one back: either side's bond gift counts.
    await topUp(b.session, 1000);
    const [st, back] = await send(b.session, a.user.id, 'bag-kanka', 1, 500);
    assert.equal(st, 200, back.error);
    const x = await row(id);
    assert.equal(Number(x.gift_coins), 500 + 2500 + 500);
    const [, mine] = await call('GET', '/api/bonds', null, a.session);
    assert.equal(mine.bonds[0].score, 35, '3.500 jeton 35 puan');
    assert.equal(mine.bonds[0].level, 3);
    assert.equal(mine.bonds[0].quietDays, 0, 'bugün hediye gitti');
    assert.equal(mine.bonds[0].endsInDays, 31);
  });

  test('ret: bağ yok, başka tür, engelli, gizlenen hediye, fiyat değişti; hiçbirinde jeton oynamaz', async () => {
    const { a, b } = await bonded('kanka');
    const c = await signUp('C');
    const coins = (await me2(a.session)).coins;
    const [none, j1] = await send(a.session, c.user.id, 'bag-kanka', 1, 500);
    assert.equal(none, 409);
    assert.equal(j1.code, 'bond_needed');
    const [other, j2] = await send(a.session, b.user.id, 'bag-kardes', 1, 1000);
    assert.equal(other, 409);
    assert.equal(j2.code, 'bond_kind');
    assert.equal(j2.error, 'Aranızda Kanka bağı var');
    const [moved, j3] = await send(a.session, b.user.id, 'bag-kanka', 1, 499);
    assert.equal(moved, 409);
    assert.equal(j3.code, 'price_changed');
    assert.equal((await send(a.session, b.user.id, 'bag-patron', 1, 500))[0], 400, 'bilinmeyen bağ hediyesi');
    await setLive({ gifts_hidden: ['bag-kanka'] });
    try {
      const [hid, j4] = await send(a.session, b.user.id, 'bag-kanka', 1, 500);
      assert.equal(hid, 400);
      assert.match(j4.error, /artık yok/);
    } finally {
      await setLive({ gifts_hidden: null });
    }
    // An older app asks for a bond it already has: told to update. A newer one hears the kind, with a code.
    const [old, o] = await ask(a.session, b.user.id, 'kanka');
    assert.equal(old, 409);
    assert.match(o.error, /^Aranızda Kanka bağı var\. Bağ hediyesini yeniden göndermek için uygulamayı güncelle$/);
    const [now, n] = await call('POST', '/api/bonds/request', { to: b.user.id, kind: 'kanka', ref: rnd(6), price: 500 }, a.session);
    assert.equal(now, 409);
    assert.deepEqual([n.error, n.code, n.kind], ['Aranızda Kanka bağı var', 'bond_active', 'kanka']);
    // A block: refused (and the bond is over: see the block test below).
    assert.equal((await call('POST', '/api/block', { to: b.user.id }, a.session))[1].blocked, true);
    assert.equal((await send(a.session, b.user.id, 'bag-kanka', 1, 500))[0], 403);
    assert.equal((await me2(a.session)).coins, coins, 'hiçbir retde jeton düşmez');
  });

  test('engel bağı bitirir: kimseye bildirim yok, odada işaret yok, sessiz gün bildirimi yok; engel kalkınca beklemeden yeniden kurulur', async () => {
    const { a, b, id } = await bonded('kanka');
    // Lv.5 (100 points), as the level column has it.
    await h.sql.query('UPDATE bonds SET talk_points = 100, level = 5, level_said = 5 WHERE id = $1', [id]);
    await until(async () => (await row(id)).decayed_on, 'ilk gece');
    const before = [(await notes(a.user.id)).length, (await notes(b.user.id)).length];
    assert.equal((await call('POST', '/api/block', { to: b.user.id }, a.session))[1].blocked, true);
    const r = await row(id);
    assert.deepEqual([r.status, r.end_reason, r.ended_by, r.told_status], ['ended', 'block', a.user.id, 'ended']);
    // The nights and the quiet warning would have named the other: an ended bond gets neither.
    const day = async (d) => (await h.sql.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`, [d])).rows[0].d;
    await h.sql.query('UPDATE bonds SET gift_day = $2::date, decayed_on = NULL WHERE id = $1', [id, await day(-28)]);
    await wait(1000);
    assert.deepEqual([(await notes(a.user.id)).length, (await notes(b.user.id)).length], before, 'ikisine de yeni bildirim yok');
    assert.equal((await row(id)).points_lost, '0', 'biten bağ gece puan kaybetmez');
    // The blocked person's room effects and profile: no bond.
    assert.deepEqual((await call('POST', '/api/bonds/among', { ids: [a.user.id, b.user.id] }, b.session))[1].bonds, []);
    assert.equal((await call('GET', `/api/bonds`, null, b.session))[1].bonds.length, 0);
    // Unblocked: a new request at once (no 7 days as after an end someone chose).
    await call('POST', '/api/block', { to: b.user.id, block: false }, a.session);
    await topUp(b.session, 1000);
    const [again, j] = await ask(b.session, a.user.id, 'kanka');
    assert.equal(again, 200, `engelden sonra bekleme yok: ${j.error}`);
  });

  test("başkasının bağlarında sessiz günler gelmez; kendi bağımda gelir", async () => {
    const { a, b } = await bonded('kanka');
    const c = await signUp('Meraklı');
    const [, other] = await call('GET', `/api/bonds?user=${a.user.id}`, null, c.session);
    assert.deepEqual(other.bonds.map((x) => [x.quietDays, x.endsInDays]), [[null, null]]);
    const [, own] = await call('GET', '/api/bonds', null, a.session);
    assert.equal(typeof own.bonds[0].quietDays, 'number');
    assert.equal(typeof own.bonds[0].endsInDays, 'number');
    // The bond's other end, looking at my list: their own bond with me, so they see it.
    const [, partner] = await call('GET', `/api/bonds?user=${a.user.id}`, null, b.session);
    assert.equal(typeof partner.bonds[0].quietDays, 'number');
  });

  test('Lv11 ve üstü: lv=20 diyen uygulama gerçek puanı alır; eski APK çubuğu seviyenin içindeki ilerlemeyle çizilir', async () => {
    const { a, b, id } = await bonded('kanka');
    // Kanka's 500-coin bond gift is 5 points; 3.195 talk points more: 3.200, Lv11 (3.000), next 4.500.
    await h.sql.query('UPDATE bonds SET talk_points = 3195, level = 11, level_said = 11 WHERE id = $1', [id]);
    const pick = (j) => [j.score, j.level, j.nextLevelAt];
    // The f9671d9 APK: its bar is (score - its Lv11 step, 0) / (nextLevelAt - 0) = 200 / 1.500 (13 %, the real
    // progress), its text "200 / 1500 puan · Lv.12 için 1300 puan".
    assert.deepEqual(pick((await call('GET', '/api/bonds', null, a.session))[1].bonds[0]), [200, 11, 1500]);
    assert.deepEqual(pick((await call('GET', `/api/bonds?user=${a.user.id}`, null, b.session))[1].bonds[0]), [200, 11, 1500]);
    // The app since Lv20 (lv=20): the points as they are.
    assert.deepEqual(pick((await call('GET', '/api/bonds?lv=20', null, a.session))[1].bonds[0]), [3200, 11, 4500]);
    assert.deepEqual(pick((await call('GET', `/api/bonds?user=${a.user.id}&lv=20`, null, b.session))[1].bonds[0]), [3200, 11, 4500]);
    // Lv20 (45.000): no next step, the points as they are for both ("en yüksek seviye").
    await h.sql.query('UPDATE bonds SET talk_points = 49995 WHERE id = $1', [id]);
    assert.deepEqual(pick((await call('GET', '/api/bonds', null, a.session))[1].bonds[0]), [50000, 20, null]);
    // Up to Lv10 nothing moves for either.
    await h.sql.query('UPDATE bonds SET talk_points = 95 WHERE id = $1', [id]);
    assert.deepEqual(pick((await call('GET', '/api/bonds', null, a.session))[1].bonds[0]), [100, 5, 200]);
    assert.deepEqual(pick((await call('GET', '/api/bonds?lv=20', null, a.session))[1].bonds[0]), [100, 5, 200]);
    // A route's own answer (the end, here) the same way.
    await h.sql.query('UPDATE bonds SET talk_points = 3195 WHERE id = $1', [id]);
    const [st, ended] = await call('POST', '/api/bonds/end?lv=20', { id }, a.session);
    assert.equal(st, 200, ended.error);
    assert.deepEqual(pick(ended.bond), [3200, 11, 4500]);
  });

  test('veri kopyası bağın kaybettiği puanı, seviyesini, son hediye gününü ve bitiş nedenini verir; engellenen engeli görmez', async () => {
    const { a, b, id } = await bonded('kanka');
    await h.sql.query('UPDATE bonds SET points_lost = 3 WHERE id = $1', [id]);
    assert.equal((await call('POST', '/api/block', { to: a.user.id }, b.session))[1].blocked, true);
    const today = (await h.sql.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date)::text AS d`)).rows[0].d;
    const copy = async (s) => {
      const [st, j] = await call('GET', '/api/me/export', null, s);
      assert.equal(st, 200, j.error);
      return j.bonds.find((x) => x.id === id);
    };
    const mine = await copy(b.session);
    assert.deepEqual([mine.status, mine.pointsLost, mine.level, mine.giftDay, mine.endReason], ['ended', 3, 1, today, 'block']);
    const theirs = await copy(a.session);
    assert.deepEqual([theirs.status, theirs.pointsLost, theirs.giftDay, theirs.endReason], ['ended', 3, today, null], 'engellenen engeli görmez');
  });

  test('aynı anda iki gönderim ve bitirme: kilitlenme yok, puan yalnız geçen hediyelerden', async () => {
    for (let round = 0; round < 4; round++) {
      const { a, b, id } = await bonded('kanka', 3000);
      await topUp(b.session, 2000);
      const [x, y, end] = await Promise.all([
        send(a.session, b.user.id, 'bag-kanka', 1, 500),
        send(b.session, a.user.id, 'bag-kanka', 1, 500),
        call('POST', '/api/bonds/end', { id }, round % 2 ? a.session : b.session),
      ]);
      assert.equal(end[0], 200, end[1].error);
      for (const [st, j] of [x, y]) assert.ok(st === 200 || (st === 409 && j.code === 'bond_needed'), `${st} ${j.error}`);
      const went = [x, y].filter(([st]) => st === 200).length;
      const r = await row(id);
      assert.equal(r.status, 'ended');
      assert.equal(Number(r.gift_coins), 500 + went * 500, 'bitmeden geçen hediyeler puana yazıldı');
      const got = await h.sql.query("SELECT count(*)::int AS n FROM gift_events WHERE gift_id = 'bag-kanka' AND sender = ANY($1::uuid[]) AND ref NOT LIKE 'bond:%'", [[a.user.id, b.user.id]]);
      assert.equal(got.rows[0].n, went);
    }
  });

  test('gece düşüşü: ilk gece yok, hediyesiz gece %10 (en az 10), hediye durdurur, seviye düşünce iki tarafa bildirim', async () => {
    const { a, b, id } = await bonded('cift');
    const day = async (d) => (await h.sql.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`, [d])).rows[0].d;
    const today = await day(0);
    // The accept day is a gift day: the sweep works it out with no drop.
    await until(async () => (await row(id)).decayed_on, 'ilk gece işlendi');
    assert.equal(Number((await row(id)).points_lost), 0, 'kabulden sonraki ilk gece puan düşmez');
    const night = async (giftDay) => {
      await h.sql.query('UPDATE bonds SET gift_day = $2::date, decayed_on = $3::date WHERE id = $1', [id, giftDay, await day(-1)]);
      await until(async () => (await row(id)).decayed_on?.getTime() === new Date(`${today}T00:00:00`).getTime(), 'gece işlendi');
      return row(id);
    };
    // 50 points (Çift, 5.000 jeton): 10 % is 5, so the least drop (10) goes.
    let r = await night(await day(-2));
    assert.equal(Number(r.points_lost), 10);
    assert.equal(r.level, 3, '40 puan hâlâ Lv3');
    // Yesterday someone sent a gift: no drop.
    r = await night(await day(-1));
    assert.equal(Number(r.points_lost), 10, 'dün hediye gitti: düşmez');
    // A message gives a talk point but doesn't stop the drop.
    await call('POST', '/api/messages', { to: a.user.id, text: 'selam', ref: rnd(6) }, b.session);
    await call('POST', '/api/messages', { to: b.user.id, text: 'selam', ref: rnd(6) }, a.session);
    await until(async () => (await row(id)).talk_points === 1, 'sohbet puanı');
    r = await night(await day(-2));
    assert.equal(Number(r.points_lost), 20, '41 puandan 10 düşer');
    await h.sql.query('UPDATE bonds SET talk_points = 0 WHERE id = $1', [id]);
    assert.equal((await notes(a.user.id)).filter((n) => n.ref.includes(':level:')).length, 0, 'seviye değişmeden bildirim yok');
    r = await night(await day(-2));
    assert.equal(Number(r.points_lost), 30);
    assert.equal(r.level, 2, '20 puan Lv2');
    const [, mine] = await call('GET', '/api/bonds', null, b.session);
    assert.deepEqual([mine.bonds[0].score, mine.bonds[0].level, mine.bonds[0].nextLevelAt], [20, 2, 30]);
    for (const u of [a, b]) {
      const n = await until(async () => (await notes(u.user.id, `bond:${id}:level:1`))[0], 'seviye bildirimi');
      assert.match(n.title, /düştü: Lv\.2/);
      assert.equal(n.kind, 'notice', 'eski APK "Duyuru" olarak gösterir');
      assert.equal(n.link, '/kullanici/me?tab=iliski');
    }
    // A bond gift today takes it back up (20 + 50 = 70 points, Lv4) and both hear it once.
    await topUp(a.session, 5000);
    const [st, j] = await send(a.session, b.user.id, 'bag-cift', 1, 5000);
    assert.equal(st, 200, j.error);
    for (const u of [a, b]) assert.match((await until(async () => (await notes(u.user.id, `bond:${id}:level:2`))[0], 'yükselme bildirimi')).title, /yükseldi: Lv\.4/);
    await wait(400);
    assert.equal((await notes(a.user.id)).filter((n) => n.ref.includes(':level:')).length, 2, 'her değişiklik bir kez');
    // The points never go below 0, however long it stays quiet.
    await h.sql.query('UPDATE bonds SET points_lost = gift_coins / 100 + talk_points WHERE id = $1', [id]);
    r = await night(await day(-2));
    assert.equal(Number(r.points_lost), Math.floor(Number(r.gift_coins) / 100) + r.talk_points, 'sıfırın altına inmez');
  });

  test('hediyesiz bağ: 3 gün önce bir kez uyarı, 30 gün sonunda kendiliğinden biter, beklemeden yeniden kurulur', async () => {
    const { a, b, id } = await bonded('kanka');
    const day = async (d) => (await h.sql.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`, [d])).rows[0].d;
    await until(async () => (await row(id)).decayed_on, 'ilk gece');
    // 28 quiet days: it ends in 3.
    await h.sql.query('UPDATE bonds SET gift_day = $2::date WHERE id = $1', [id, await day(-28)]);
    const ref = `bond:${id}:idle-warn:${await day(-28)}`;
    for (const u of [a, b]) {
      const n = await until(async () => (await notes(u.user.id, ref))[0], 'uyarı');
      assert.match(n.body, /3 gün içinde/);
    }
    await wait(700);
    assert.equal((await notes(a.user.id, ref)).length, 1, 'uyarı bir kez');
    assert.equal((await row(id)).status, 'active');
    // 31 quiet days: over.
    await h.sql.query('UPDATE bonds SET gift_day = $2::date, decayed_on = $3::date WHERE id = $1', [id, await day(-31), await day(-1)]);
    await until(async () => (await row(id)).status === 'ended', 'bağ bitti');
    const r = await row(id);
    assert.deepEqual([r.end_reason, r.ended_by], ['idle', null]);
    for (const u of [a, b]) {
      const n = await until(async () => (await notes(u.user.id, `bond:${id}:idle-end`))[0], 'bitiş bildirimi');
      assert.match(n.body, /31 gün boyunca/);
    }
    const coins = (await me2(a.session)).coins;
    assert.equal((await send(a.session, b.user.id, 'bag-kanka', 1, 500))[1].code, 'bond_needed', 'biten bağa bağ hediyesi gitmez');
    assert.equal((await me2(a.session)).coins, coins);
    const [again, j] = await ask(a.session, b.user.id, 'kanka');
    assert.equal(again, 200, `kendiliğinden biten bağdan sonra bekleme yok: ${j.error}`);
  });

  test('her değişiklik SimilarClub Sistem’e bir kez: istek, kabul, ret, geri çekme, bitirme, süre dolması, satın alma iadesi', async () => {
    const [a, b, c, d] = await Promise.all(['A', 'B', 'C', 'D'].map((n) => signUp(n)));
    await topUp(a.session, 5000);
    const ref = rnd(6);
    const [, r] = await ask(a.session, b.user.id, 'kanka', ref);
    await ask(a.session, b.user.id, 'kanka', ref);
    const req = await notes(b.user.id, `bond:${r.bond.id}:request`);
    assert.equal(req.length, 1, 'aynı istek iki kez: bildirim bir kez');
    assert.match(req[0].body, /A seninle Kanka bağı kurmak istiyor/);
    assert.equal(req[0].data.event, 'request');
    await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, b.session);
    assert.match((await notes(a.user.id, `bond:${r.bond.id}:accept`))[0].body, /B Kanka bağı isteğini kabul etti/);
    assert.match((await notes(b.user.id, `bond:${r.bond.id}:accept`))[0].body, /💎 500 elmas/);
    await call('POST', '/api/bonds/end', { id: r.bond.id }, b.session);
    assert.match((await notes(a.user.id, `bond:${r.bond.id}:end`))[0].body, /B Kanka bağınızı bitirdi/);
    assert.equal((await notes(b.user.id, `bond:${r.bond.id}:end`)).length, 0, 'bitiren kendine bildirim almaz');
    const [, r2] = await ask(a.session, c.user.id, 'kardes');
    await call('POST', '/api/bonds/respond', { id: r2.bond.id, accept: false }, c.session);
    assert.match((await notes(a.user.id, `bond:${r2.bond.id}:refuse`))[0].body, /1\.000 jetonun hesabına iade edildi/);
    const [, r3] = await ask(a.session, d.user.id, 'abla');
    await call('POST', '/api/bonds/withdraw', { id: r3.bond.id }, a.session);
    assert.match((await notes(d.user.id, `bond:${r3.bond.id}:withdraw`))[0].body, /A sana gönderdiği Abla bağı isteğini geri çekti/);
    const [, r4] = await ask(a.session, d.user.id, 'abla');
    await h.sql.query("UPDATE bonds SET expires_at = now() - interval '1 minute' WHERE id = $1", [r4.bond.id]);
    assert.match((await until(async () => (await notes(a.user.id, `bond:${r4.bond.id}:expire`))[0], 'süre doldu')).body, /zamanında yanıt vermedi/);
    // A store purchase refunded while its coins wait in a request: the requester hears it from the sweep.
    if (!admin) await setLive({});
    const buyer = await signUp('Alıcı');
    await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: rnd(8) }, buyer.session);
    const [, r5] = await ask(buyer.session, c.user.id, 'kardes');
    const p = (await h.sql.query('SELECT id FROM purchases WHERE user_id = $1', [buyer.user.id])).rows[0];
    assert.equal((await call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session))[0], 200);
    assert.match((await until(async () => (await notes(buyer.user.id, `bond:${r5.bond.id}:refund`))[0], 'iade bildirimi')).body, /satın alman iade edildiği için/);
    // Nothing twice: every ref once per person.
    const dup = await h.sql.query("SELECT target, ref, count(*)::int AS n FROM team_notices WHERE category = 'bond' GROUP BY 1, 2 HAVING count(*) > 1");
    assert.deepEqual(dup.rows, []);
    // Every state is told, a moment after its change commits (the notices go after the transaction, bond-life.mjs):
    // waited for, not read at once.
    const untold = async () => (await h.sql.query('SELECT count(*)::int AS n FROM bonds WHERE told_status IS DISTINCT FROM status')).rows[0].n;
    await until(async () => (await untold()) === 0, 'her durum anlatıldı');
  });

  test('profilde bağlar sayfa sayfa; odada çok bağı olan birinin yanındaki bağ kaybolmaz', async () => {
    const [x, y] = await Promise.all(['X', 'Y'].map((n) => signUp(n)));
    // 600 partners outside the room (rows of their own: no money moves, bonds aren't a wallet table).
    const many = await h.sql.query("INSERT INTO users (name) SELECT 'P' || g FROM generate_series(1, 600) g RETURNING id");
    await h.sql.query(
      `INSERT INTO bonds (a, b, pair_lo, pair_hi, kind, status, held_coins, gift_coins, ref, accepted_at, gift_day, told_status)
       SELECT $1::uuid, p, LEAST($1::uuid, p), GREATEST($1::uuid, p), 'kanka', 'active', 500, 500, 'seed-' || p, now(), (now() AT TIME ZONE 'Europe/Istanbul')::date, 'active'
         FROM unnest($2::uuid[]) p`,
      [x.user.id, many.rows.map((r) => r.id)],
    );
    await topUp(x.session, 6000);
    const [, r] = await ask(x.session, y.user.id, 'cift');
    await call('POST', '/api/bonds/respond', { id: r.bond.id, accept: true }, y.session);
    const [, p1] = await call('GET', `/api/bonds?user=${x.user.id}`, null, y.session);
    assert.deepEqual([p1.bonds.length, p1.total, p1.next], [50, 601, 50]);
    assert.equal(p1.bonds[0].kind, 'cift', 'Çift önce');
    const [, last] = await call('GET', `/api/bonds?user=${x.user.id}&offset=600`, null, y.session);
    assert.deepEqual([last.bonds.length, last.next], [1, null]);
    const [st, room] = await call('POST', '/api/bonds/among', { ids: [x.user.id, y.user.id] }, y.session);
    assert.equal(st, 200, room.error);
    assert.deepEqual(room.bonds.map((b) => b.kind), ['cift'], 'X-Y bağı gelir; dışarıdaki 600 Lv1 bağ gelmez');
  });
});
