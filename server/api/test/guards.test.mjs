// Koruma (guards.mjs, 090, docs/KORUMA.md): the Koruma Kartı gift makes its sender the receiver's guardian; every gift
// from the guardian to them after that adds its coins as points (1 coin = 1 point, wherever it is sent); a Türkiye day
// without one costs points at the next midnight (a tenth from 5 000 up, else 1 000; not the night after the card); only
// the guardian ends it. The top guardian over the ward's threshold shows on the ward's profile, and the person someone
// guards shows on theirs. Koruma can be turned off for oneself; the threshold changes once a week.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '../catalog.mjs';
import { GUARD_CARD, GUARD_RULES } from '../guard-rules.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ GUARD_SWEEP_MS: '200' });
const { call } = h;
const ok = ([st, j], what = 'istek') => {
  assert.equal(st, 200, `${what}: ${j?.error}`);
  return j;
};
const refused = ([st, j], code, re) => {
  assert.equal(st, code, `beklenen ${code}, gelen ${st}: ${j?.error}`);
  if (re) assert.match(j.error, re);
  return j;
};
const THRESHOLD_PER_LEVEL = GUARD_RULES.thresholdPerLevel;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CARD = GIFTS.get(GUARD_CARD);
const person = async (name, coins = 0) => {
  const u = await h.signUp(name);
  if (coins) await h.credit(u.user.id, coins);
  return u;
};
const send = (from, to, giftId, { count = 1, ref = `k${rnd(10)}`, place = 'profile' } = {}) =>
  call('POST', '/api/gifts/send', { to: to.user.id, giftId, count, ref, price: GIFTS.get(giftId).price, place }, from.session);
const card = (from, to, ref) => send(from, to, GUARD_CARD, { ref });
const area = async (who, of) => ok(await call('GET', `/api/guard?user=${of.user.id}`, null, who.session), 'koruma alanı');
const mine = async (who) => ok(await call('GET', '/api/guard/me', null, who.session), 'Benim Koruma');
const coins = async (who) => (await h.sql.query('SELECT coins FROM users WHERE id = $1', [who.user.id])).rows[0].coins;
const pair = async (g, w) => (await h.sql.query('SELECT * FROM guards WHERE guardian = $1 AND ward = $2 AND ended_at IS NULL', [g.user.id, w.user.id])).rows[0];

describe('Koruma', () => {
  test('kart koruyucu yapar, kartın jetonu ilk puan; sonraki her hediye jetonu kadar puan; başkasının hediyesi saymaz', async () => {
    assert.ok(CARD && CARD.price > 0, 'Koruma Kartı katalogda');
    const g = await person('Koruyan', 100_000);
    const w = await person('Korunan');
    const other = await person('Başkası', 100_000);
    ok(await card(g, w), 'kart');
    let p = await pair(g, w);
    assert.equal(Number(p.points), CARD.price);
    // Any gift after it adds its coins, wherever it is sent; another person's doesn't.
    ok(await send(g, w, 'g6', { count: 10, place: 'chat' }), 'hediye');
    ok(await send(other, w, 'g6', { count: 10 }), 'başkası');
    p = await pair(g, w);
    assert.equal(Number(p.points), CARD.price + GIFTS.get('g6').price * 10);
    // A second card from the same guardian is just a gift: still one Koruma, more points.
    ok(await card(g, w), 'ikinci kart');
    assert.equal((await h.sql.query('SELECT count(*)::int AS n FROM guards WHERE guardian = $1 AND ward = $2', [g.user.id, w.user.id])).rows[0].n, 1);
    // The same ref again is the same gift: no new points.
    const ref = `k${rnd(10)}`;
    ok(await send(g, w, 'g6', { ref }), 'hediye');
    const before = Number((await pair(g, w)).points);
    ok(await send(g, w, 'g6', { ref }), 'aynı istek yeniden');
    assert.equal(Number((await pair(g, w)).points), before);
    // The receiver sees their guardian in their profile's area; the guardian sees whom they guard in theirs.
    const a = (await area(other, w));
    assert.deepEqual([a.guardian.id, a.guardian.points, a.guardian.days, a.mine], [g.user.id, before, 1, null]);
    assert.equal((await area(other, g)).ward.id, w.user.id);
    assert.equal((await area(g, w)).mine.points, before);
  });

  test('korumayı kapatan kişiye yeni koruyucu olunmaz, jeton düşmez; olan koruyucu kalır', async () => {
    const g1 = await person('İlk Koruyan', 50_000);
    const g2 = await person('Geç Kalan', 50_000);
    const w = await person('Kapatan');
    ok(await card(g1, w), 'kart');
    const s = ok(await call('POST', '/api/guard/settings', { off: true }, w.session), 'kapat').settings;
    assert.equal(s.off, true);
    const left = await coins(g2);
    refused(await card(g2, w), 403, /korumayı kapatmış/);
    assert.equal(await coins(g2), left, 'jeton düşmez');
    assert.equal(await pair(g2, w), undefined);
    // The guardian they had stays, and their gifts still count.
    ok(await send(g1, w, 'g6'), 'hediye');
    assert.equal(Number((await pair(g1, w)).points), CARD.price + GIFTS.get('g6').price);
    assert.equal((await area(g2, w)).off, true);
  });

  test('koruma alanı en çok puanlı koruyucu, eşiği geçtiyse; eşik haftada bir ve Yankı seviyesine göre sınırlı', async () => {
    const small = await person('Az Puanlı', 100_000);
    const big = await person('Çok Puanlı', 100_000);
    const w = await person('Eşikli');
    ok(await card(small, w), 'kart');
    ok(await card(big, w), 'kart');
    ok(await send(big, w, 'g6', { count: 10 }), 'hediye');
    assert.equal((await area(small, w)).guardian.id, big.user.id);
    const set = (body) => call('POST', '/api/guard/settings', body, w.session);
    // Someone who has received nothing (Yankı 0) can set the lowest limit; the more they receive, the higher it goes.
    assert.equal((await mine(small)).settings.thresholdMax, THRESHOLD_PER_LEVEL, 'Yankı 0: en düşük sınır');
    const max = (await mine(w)).settings.thresholdMax;
    assert.ok(max > THRESHOLD_PER_LEVEL && max % THRESHOLD_PER_LEVEL === 0, 'hediye alan kişinin sınırı yüksek');
    refused(await set({ threshold: max + 1 }), 400, /Koruma eşiği 0–/);
    const high = Number((await pair(big, w)).points) + 1;
    ok(await set({ threshold: high }), 'eşik');
    assert.equal((await area(small, w)).guardian, null, 'eşiğin altındaki gösterilmez');
    refused(await set({ threshold: 0 }), 429, /haftada bir/);
    assert.ok((await mine(w)).settings.thresholdNextAt, 'bir sonraki değişiklik zamanı');
    // A week later it changes again.
    await h.sql.query("UPDATE guard_settings SET threshold_at = now() - interval '8 days' WHERE user_id = $1", [w.user.id]);
    ok(await set({ threshold: 0 }), 'eşik sıfır');
    assert.equal((await area(small, w)).guardian.id, big.user.id);
  });

  test('birbirini koruyanlar ikisinin profilinde birbirini görür; Benim Koruma iki yönü listeler', async () => {
    const a = await person('Ayşe Koruma', 50_000);
    const b = await person('Bora Koruma', 50_000);
    ok(await card(a, b), 'kart');
    ok(await card(b, a), 'kart');
    const onA = (await area(b, a));
    const onB = (await area(a, b));
    assert.deepEqual([onA.guardian.id, onA.ward.id], [b.user.id, b.user.id]);
    assert.deepEqual([onB.guardian.id, onB.ward.id], [a.user.id, a.user.id]);
    const m = (await mine(a));
    assert.deepEqual([m.guardians.map((x) => x.id), m.wards.map((x) => x.id)], [[b.user.id], [b.user.id]]);
    assert.deepEqual([m.guardians[0].points, m.guardians[0].days, m.settings.off], [CARD.price, 1, false]);
  });

  test('gece düşüşü: önceki gün hediye yoksa 5 000 ve üstü %10, altı 1 000; dün hediye ya da kart varsa düşmez; günde bir', async () => {
    const g = await person('Gece Koruyan', 50_000);
    const ws = await Promise.all(['Büyük', 'Küçük', 'Sıfır', 'Dünkü', 'Kartlı'].map((n) => person(`${n} Korunan`)));
    for (const w of ws) ok(await card(g, w), 'kart');
    const [big, small, zero, gifted, fresh] = ws;
    const setPair = (w, points, giftDaysAgo, firstDaysAgo) =>
      h.sql.query(
        `UPDATE guards SET points = $3, decayed_on = NULL,
            gift_day = (now() AT TIME ZONE 'Europe/Istanbul')::date - $4::int, first_day = (now() AT TIME ZONE 'Europe/Istanbul')::date - $5::int
          WHERE guardian = $1 AND ward = $2 AND ended_at IS NULL`,
        [g.user.id, w.user.id, points, giftDaysAgo, firstDaysAgo],
      );
    await setPair(big, 20_000, 2, 10);
    await setPair(small, 3_500, 3, 10);
    await setPair(zero, 600, 5, 10);
    await setPair(gifted, 20_000, 1, 10);
    await setPair(fresh, 20_000, 1, 1);
    await sleep(800);
    const pts = async (w) => Number((await pair(g, w)).points);
    assert.deepEqual([await pts(big), await pts(small), await pts(zero), await pts(gifted), await pts(fresh)], [18_000, 2_500, 0, 20_000, 20_000]);
    // Once a day: the next sweeps leave them.
    await sleep(600);
    assert.deepEqual([await pts(big), await pts(small)], [18_000, 2_500]);
    // A pair with 0 points is still a Koruma, but not shown on the profile.
    assert.notEqual(await pair(g, zero), undefined);
    assert.equal((await area(g, zero)).guardian, null);
  });

  test('korumayı yalnız koruyucu bitirir, puan gider; korunan bitiremez; yeniden kartla sıfırdan başlar', async () => {
    const g = await person('Biten Koruyan', 50_000);
    const w = await person('Biten Korunan');
    ok(await card(g, w), 'kart');
    refused(await call('POST', '/api/guard/end', { ward: g.user.id }, w.session), 404, /korumuyorsun/);
    ok(await call('POST', '/api/guard/end', { ward: w.user.id }, g.session), 'bitir');
    assert.equal(await pair(g, w), undefined);
    assert.equal((await area(w, w)).guardian, null);
    const ended = (await h.sql.query('SELECT points FROM guards WHERE guardian = $1 AND ward = $2', [g.user.id, w.user.id])).rows;
    assert.deepEqual(ended.map((r) => Number(r.points)), [0]);
    ok(await card(g, w), 'yeniden kart');
    assert.equal(Number((await pair(g, w)).points), CARD.price);
    // My data copy has it, both ways.
    const copy = ok(await call('GET', '/api/me/export', null, w.session), 'kopya');
    assert.equal(copy.guard.guardMe.length, 2);
  });

  test('engelli kişiye kart gitmez; kendine kart olmaz', async () => {
    const g = await person('Engellenen Koruyan', 50_000);
    const w = await person('Engelleyen');
    ok(await call('POST', '/api/block', { to: g.user.id }, w.session), 'engelle');
    refused(await card(g, w), 403);
    refused(await call('POST', '/api/gifts/send', { to: g.user.id, giftId: GUARD_CARD, count: 1, ref: `k${rnd(10)}`, price: CARD.price }, g.session), 400, /Kendine/);
    assert.equal(await pair(g, w), undefined);
  });
});
