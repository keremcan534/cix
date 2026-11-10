// Çantam (backpack.mjs): the call task puts a Kalp in the backpack (call-log.mjs, Canlı ayarlar backpack_call_task);
// a send from it costs no coins, takes the stock down once, and is a gift event like any gift (stage, Yankı, boards),
// with the recipient's diamonds locked as free coins' are and no agency commission. Also the Jeton Noktası block
// rules (jeton.mjs). Against a real Postgres.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { GIFTS } from '../catalog.mjs';
import { rnd, startApi } from './harness.mjs';

const h = startApi({ AGENCY_JOBS: '0', LIVE_POLL_MS: '100' });
const { call, signUp } = h;
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const refused = async (p, code, what = '') => {
  const [st, j] = await p;
  assert.equal(st, code, `${what}: beklenen ${code}, gelen ${st} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
};
const KALP = GIFTS.get('g2');
const DAY = 864e5;

const me = async (who) => (await ok(call('GET', '/api/me', null, who.session), 'ben')).user;
const backpack = (who) => ok(call('GET', '/api/backpack', null, who.session), 'çanta');
const send = (who, to, room, body = {}) => call('POST', '/api/backpack/send', { to: to.user.id, giftId: 'g2', count: 1, room, ref: rnd(6), ...body }, who.session);
const claim = (who) => call('POST', '/api/me/call-task/claim', {}, who.session);
/** A video call of today that stayed on long enough for the call task. */
const videoCall = (a, b) =>
  h.sql.query(
    `INSERT INTO calls (kind, mode, caller, callee, price, status, ref, created_at, started_at, ended_at, minutes, coins)
     VALUES ('call', 'video', $1, $2, 0, 'ended', $3, now() - interval '5 minutes', now() - interval '5 minutes', now() - interval '3 minutes', 0, 0)`,
    [a.user.id, b.user.id, rnd(6)],
  );
async function roomOf(owner) {
  return (await ok(call('POST', '/api/rooms', { title: `Oda ${rnd(2)}` }, owner.session), 'oda')).room.id;
}
/** Someone whose call task today put the backpack gift in. */
async function withKalp(name) {
  const a = await signUp(name);
  const friend = await signUp(`${name} arkadaşı`);
  await videoCall(a, friend);
  await ok(claim(a), 'görev ödülü');
  return a;
}

let admin;
async function setLive(changes) {
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  const r = await ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Çanta testi', baseV: view.v, confirm: true }, admin.session), 'ayar kaydı');
  // The API process reads the table again within LIVE_POLL_MS; the save itself already applied it there.
  return r;
}

describe('Çantam', () => {
  test('görev ödülü çantaya bir Kalp koyar, günde bir kez; çanta ve kaynak sunucudan', async () => {
    admin = await h.account('Yönetici', 'admin');
    const a = await signUp('Görevli Aslı');
    const friend = await signUp('Arkadaş Bora');
    const empty = await backpack(a);
    assert.deepEqual(empty.items, []);
    assert.deepEqual(empty.sources, [{ key: 'call_task', label: 'Görev ödülü', giftId: 'g2', count: 1 }]);
    await refused(claim(a), 409, 'görev yapılmadı');
    assert.deepEqual((await backpack(a)).items, []);

    await videoCall(a, friend);
    const r = await ok(claim(a), 'ödül');
    assert.equal(r.replay, false);
    assert.deepEqual(r.backpack, { giftId: 'g2', count: 1 });
    assert.equal(r.user.coins, 25, 'ödül jetonu yine verilir');
    const again = await ok(claim(a), 'tekrar');
    assert.equal(again.replay, true);
    assert.equal(again.backpack, null);
    assert.deepEqual((await backpack(a)).items, [{ giftId: 'g2', count: 1, source: 'call_task', label: 'Görev ödülü' }]);
    assert.equal((await q('SELECT count(*)::int AS n FROM backpack_moves WHERE user_id = $1', [a.user.id]))[0].n, 1);
  });

  test('çantadan gönderim: jeton harcanmaz, adet bir kez düşer; hediye olayı, Yankı ve sıralama; elmas 7 gün kilitli', async () => {
    const a = await withKalp('Gönderen Ayla');
    const host = await signUp('Yayıncı Hande');
    const owner = await signUp('Oda Sahibi');
    const room = await roomOf(owner);
    const before = await me(a);
    const ref = rnd(6);
    const both = await Promise.all([1, 2].map(() => call('POST', '/api/backpack/send', { to: host.user.id, giftId: 'g2', count: 1, room, ref }, a.session)));
    for (const [st, j] of both) assert.equal(st, 200, j.error);
    assert.deepEqual(both.map(([, j]) => j.replay).sort(), [false, true], 'aynı istek bir kez');
    const [, out] = both[0];
    assert.equal(out.total, KALP.price);
    assert.equal(out.user.coins, before.coins, 'jeton düşmez');
    assert.deepEqual(out.items, []);

    const events = await q('SELECT gift_id, count, unit_price::int AS unit, total::int AS total, room FROM gift_events WHERE sender = $1', [a.user.id]);
    assert.deepEqual(events, [{ gift_id: 'g2', count: 1, unit: KALP.price, total: KALP.price, room }]);
    const e = await ok(call('GET', '/api/wallet/earnings', null, host.session), 'gelir');
    assert.deepEqual([e.diamonds, e.locked, e.withdrawable], [KALP.price, KALP.price, 0], 'hemen çekilemez');
    assert.equal(e.locks.length, 1);
    assert.equal(e.locks[0].channel, 'cantam');
    assert.equal(e.locks[0].channelLabel, 'Çanta hediyesi');
    assert.equal(Math.round((Date.parse(e.locks[0].unlockAt) - Date.now()) / DAY), 7, 'ücretsiz jetonun kilidi: 7 gün');
    assert.equal(e.locks[0].gift.id, 'g2');
    assert.equal((await me(host)).charmXp, KALP.price, 'Yankı puanı');
    assert.equal((await me(a)).wealthXp, 0, 'Cömertlik puanı yok: jeton harcanmadı');
    const charm = await ok(call('GET', '/api/rankings?board=charm&period=day', null, a.session), 'sıralama');
    assert.ok(charm.rows.some((x) => x.user.id === host.user.id && x.score === KALP.price));
    // Nothing that counts coins: no spending, no bond coins.
    assert.equal((await q("SELECT count(*)::int AS n FROM ledger WHERE user_id = $1 AND currency = 'coin' AND amount < 0", [a.user.id]))[0].n, 0);
    const income = await q("SELECT source_type FROM income_events WHERE source_ref = 'gift:' || (SELECT id FROM gift_events WHERE sender = $1)::text", [a.user.id]);
    assert.deepEqual(income, [{ source_type: 'bonus' }]);

    // Nothing left: 409, nothing moves.
    const short = await refused(send(a, host, room), 409, 'çanta boş');
    assert.equal(short.code, 'bag_short');
    assert.equal((await q('SELECT count(*)::int AS n FROM gift_events WHERE sender = $1', [a.user.id]))[0].n, 1);
    assert.equal((await me(host)).diamonds, KALP.price);

    // Five at once (stock put in for the test): the diamonds can't be exchanged, sold or withdrawn yet.
    await q("UPDATE backpack_items SET count = 5 WHERE user_id = $1 AND gift_id = 'g2'", [a.user.id]);
    const five = await ok(send(a, host, room, { count: 5 }), 'beşli');
    assert.equal(five.total, KALP.price * 5);
    const [st, j] = await call('POST', '/api/wallet/exchange', { diamonds: 100, ref: rnd(6) }, host.session);
    assert.equal(st, 409);
    assert.match(j.error, /kilidi henüz açılmadı; çekilebilir bakiyen 0 elmas/);
  });

  test('alıcı kuralları: kendine, odasız, adet, engel iki yönde, gizli hediye; hiçbiri adet düşürmez', async () => {
    const a = await withKalp('Kurallı Kaan');
    const b = await signUp('Alıcı Berk');
    const room = await roomOf(await signUp('Oda Sahibi 2'));
    await refused(send(a, a, room), 400, 'kendine');
    await refused(send(a, b, undefined), 400, 'odasız');
    await refused(send(a, b, 'demo-oda'), 400, 'sunucu odası değil');
    await refused(send(a, b, room, { count: 3 }), 400, 'adet');
    await refused(send(a, b, room, { giftId: 'yok' }), 400, 'bilinmeyen hediye');
    await refused(send(a, b, room, { count: 5 }), 409, 'çantada 1 var');
    await ok(call('POST', '/api/block', { to: a.user.id, block: true }, b.session), 'engelle');
    await refused(send(a, b, room), 403, 'alıcı engelledi');
    await ok(call('POST', '/api/block', { to: a.user.id, block: false }, b.session), 'engeli kaldır');
    await ok(call('POST', '/api/block', { to: b.user.id, block: true }, a.session), 'engelle');
    await refused(send(a, b, room), 403, 'gönderen engelledi');
    await ok(call('POST', '/api/block', { to: b.user.id, block: false }, a.session), 'engeli kaldır');
    await setLive({ gifts_hidden: ['g2'] });
    await refused(send(a, b, room), 400, 'gizli hediye');
    assert.deepEqual((await backpack(a)).items, [], 'gizli hediye çantada görünmez');
    await setLive({ gifts_hidden: null });
    assert.equal((await backpack(a)).items[0].count, 1, 'hiçbiri adet düşürmedi');
    // A deleted recipient.
    const gone = await signUp('Silinen');
    await ok(call('DELETE', '/api/me', null, gone.session), 'hesap sil');
    await refused(send(a, gone, room), 404, 'silinmiş hesap');
    await ok(send(a, b, room), 'sonunda gider');
  });

  test('ajans komisyonu yok: ücretli hediye komisyon alır, çanta hediyesi almaz; arka plan işi de eklemez', async () => {
    const center = await signUp('Merkez');
    await q("UPDATE users SET role = 'admin' WHERE id = $1", [center.user.id]);
    const ownerOf = await signUp('Ajans Sahibi');
    const agency = (await ok(call('POST', '/api/admin/agency/create', { name: 'Çanta Ajans', owner: ownerOf.user.id }, center.session), 'ajans')).agency;
    const code = (await q('SELECT code FROM agencies WHERE id = $1', [agency.id]))[0].code;
    const host = await signUp('Ajanslı Yayıncı');
    await q("UPDATE users SET gender = 'Kadın' WHERE id = $1", [host.user.id]);
    await ok(call('POST', '/api/agency/join', { code }, host.session), 'ajansa katıl');
    const room = await roomOf(await signUp('Oda Sahibi 3'));
    const a = await withKalp('Cömert Cem');
    await ok(send(a, host, room), 'çanta hediyesi');
    const payer = await signUp('Ödeyen');
    await ok(call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, payer.session), 'yükleme');
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'g2', count: 1, room, ref: rnd(6) }, payer.session), 'ücretli hediye');
    await ok(call('POST', '/api/admin/agency/jobs/run', {}, center.session), 'ajans işleri');
    const rows = await q(
      `SELECT g.sender = $2 AS free, e.source_type, (SELECT count(*)::int FROM agency_commissions c WHERE c.income_event_id = e.id) AS commissions
         FROM gift_events g JOIN income_events e ON e.source_ref = 'gift:' || g.id WHERE g.recipient = $1 ORDER BY g.id`,
      [host.user.id, a.user.id],
    );
    assert.deepEqual(rows, [
      { free: true, source_type: 'bonus', commissions: 0 },
      { free: false, source_type: 'gift', commissions: 1 },
    ]);
  });

  test('Canlı ayarlar 0: görev ödülü çantaya bir şey koymaz; hediye kapalıyken gönderim 503', async () => {
    const holder = await withKalp('Bekleyen Bade');
    await setLive({ backpack_call_task: 0 });
    const a = await withKalp('Ayarlı Ada');
    assert.deepEqual((await backpack(a)).items, []);
    assert.deepEqual((await backpack(a)).sources, []);
    const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session));
    assert.equal(view.settings.find((x) => x.key === 'backpack_call_task').group, 'Çantam');
    await setLive({ backpack_call_task: null, features_off: ['gifts'] });
    const room = await roomOf(await signUp('Oda Sahibi 4'));
    const [st, j] = await send(holder, await signUp('Alıcı'), room);
    assert.equal(st, 503, j.error);
    await setLive({ features_off: null });
    assert.equal((await backpack(holder)).items[0].count, 1, 'kapalıyken adet düşmedi');
  });

  test('verilerimin kopyasında var, hesap silinince gider', async () => {
    const a = await withKalp('Kopya Kerem');
    const out = await ok(call('GET', '/api/me/export', null, a.session), 'kopya');
    assert.deepEqual(out.backpack.items.map((x) => [x.giftId, x.count]), [['g2', 1]]);
    assert.deepEqual(out.backpack.moves.map((x) => [x.giftId, x.change, x.source]), [['g2', 1, 'call_task']]);
    await ok(call('DELETE', '/api/me', null, a.session), 'hesap sil');
    assert.equal((await q('SELECT count(*)::int AS n FROM backpack_items WHERE user_id = $1', [a.user.id]))[0].n, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM backpack_moves WHERE user_id = $1', [a.user.id]))[0].n, 0);
  });
});

describe('Jeton Noktası ve engeller', () => {
  test('liste engelleneni ve kendini göstermez; engel iki yönde satışı ve bozdurmayı durdurur', async () => {
    const bank = await signUp('Nokta Banka');
    await ok(call('POST', '/api/admin/jeton/bank', { user: bank.user.id, enabled: true }, admin.session), 'banka aç');
    const buyer = await signUp('Alıcı Bulut');
    const host = await signUp('Bozduran Begüm');
    const list = async (who) => ok(call('GET', '/api/jeton/banks', null, who.session), 'liste');
    assert.ok((await list(buyer)).banks.some((x) => x.id === bank.user.id));
    assert.equal((await list(buyer)).mine, false);
    const own = await list(bank);
    assert.equal(own.mine, true);
    assert.ok(!own.banks.some((x) => x.id === bank.user.id), 'kendini görmez');

    // Buyers reach a bank by message; only a bank reads who wrote to it.
    await refused(call('GET', '/api/jeton/buyers', null, buyer.session), 403, 'banka değil');
    await ok(call('POST', '/api/messages', { to: bank.user.id, text: 'Jeton almak istiyorum', ref: rnd(6) }, buyer.session), 'mesaj');
    const buyers = async () => (await ok(call('GET', '/api/jeton/buyers', null, bank.session), 'alıcılar')).buyers.map((x) => x.id);
    assert.deepEqual(await buyers(), [buyer.user.id]);

    await ok(call('POST', '/api/admin/jeton/wholesale', { bank: bank.user.id, coins: 10_000, paymentRef: 'DEKONT-1', ref: rnd(6) }, admin.session), 'toptan');
    await ok(call('POST', '/api/block', { to: bank.user.id, block: true }, buyer.session), 'engelle');
    assert.ok(!(await list(buyer)).banks.some((x) => x.id === bank.user.id), 'engellediği banka listede yok');
    assert.deepEqual(await buyers(), [], 'engelleyen alıcı bankanın listesinde yok');
    await refused(call('POST', '/api/jeton/transfer', { to: buyer.user.id, coins: 100, paymentRef: 'HAVALE-9', ref: rnd(6) }, bank.session), 403, 'engelleyen alıcıya satış');
    await ok(call('POST', '/api/block', { to: bank.user.id, block: false }, buyer.session), 'engeli kaldır');
    const sale = await ok(call('POST', '/api/jeton/transfer', { to: buyer.user.id, coins: 100, paymentRef: 'HAVALE-9', ref: rnd(6) }, bank.session), 'satış');
    assert.equal(sale.transfer.paymentRef, 'HAVALE-9');

    await q('UPDATE users SET diamonds = 5000 WHERE id = $1', [host.user.id]);
    await ok(call('POST', '/api/block', { to: host.user.id, block: true }, bank.session), 'banka engelledi');
    assert.ok(!(await list(host)).banks.some((x) => x.id === bank.user.id), 'engelleyen banka listede yok');
    await refused(call('POST', '/api/jeton/sell-diamonds', { bank: bank.user.id, diamonds: 1000, ref: rnd(6) }, host.session), 403, 'engelleyen bankaya bozdurma');
    assert.equal((await me(host)).diamonds, 5000, 'elmas yerinde');
  });
});
