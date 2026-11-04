// A server set up like production, against a real Postgres (harness.mjs) and a local stand-in for the stores
// and LiveKit (fake-stores.mjs): no development sign-in, no test coins, store test purchases refused, paid
// withdrawals, Google Play refunds read on a timer, the sign-in code limits and voice rooms that end and kick.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeStores } from './fake-stores.mjs';
import { rnd, startApi } from './harness.mjs';

const stores = await fakeStores();
const REVIEW_PHONE = '+905550000009';
const REVIEW_CODE = '135791';
const h = startApi({
  ...stores.env,
  ALLOW_DEV_AUTH: undefined,
  ALLOW_TEST_TOPUP: '0',
  LOCK_DAYS_STORE: '0',
  AGENCY_JOBS: '0',
  SMS_PROVIDER: 'log',
  OTP_GLOBAL_PER_HOUR: '3',
  OTP_REVIEW_PHONE: REVIEW_PHONE,
  OTP_REVIEW_CODE: REVIEW_CODE,
  OTP_REVIEW_MAX_TRIES: '3',
  GOOGLE_VOIDED_POLL_MIN: '0.01',
});
const { call } = h;
const ok = async (p) => {
  const [st, j] = await p;
  assert.equal(st, 200, j.error);
  return j;
};
const ref = () => `h${rnd(8)}`;
const q = async (sql, vals = []) => (await h.sql.query(sql, vals)).rows;
const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const buyGoogle = (s, productId, token) => call('POST', '/api/wallet/purchase', { platform: 'android', productId, token }, s);
const buyApple = (s, productId, transactionId) => call('POST', '/api/wallet/purchase', { platform: 'ios', productId, transactionId }, s);
const me = async (s) => (await ok(call('GET', '/api/me', null, s))).user;

let admin, buyer, host;

describe('yayın sunucusu', () => {
  test('geliştirme girişi kapalı; test jetonu, test satın alması ve serbest test hediyesi yok', async () => {
    [admin, buyer, host] = await Promise.all([h.account('Yönetici', 'admin'), h.account('Alıcı'), h.account('Yayıncı')]);
    assert.equal((await call('POST', '/api/auth/dev', { deviceKey: rnd(24), name: 'Deneme' }))[0], 403);
    assert.equal((await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: ref() }, buyer.session))[0], 403);
    assert.equal((await call('POST', '/api/wallet/purchase', { platform: 'test', productId: 'coins_1000', transactionId: ref() }, buyer.session))[0], 403);
    assert.equal((await call('POST', '/api/wallet/gift', { to: host.user.id, amount: 10, ref: ref() }, buyer.session))[0], 403);
    assert.equal((await me(buyer.session)).coins, 0);
  });

  test('Google Play: ödenmiş satın alma yüklenir; lisans testçisi ve promosyon kodu reddedilir, tüketilmez', async () => {
    for (const token of [`test-${rnd(12)}`, `promo-${rnd(12)}`]) {
      const [st, j] = await buyGoogle(buyer.session, 'coins_1000', token);
      assert.equal(st, 402, token);
      assert.match(j.error, /Test satın alması/);
      assert.ok(!stores.consumed.includes(token), 'tüketilmedi, Google kendisi iade eder');
    }
    assert.equal((await q('SELECT count(*)::int AS n FROM purchases'))[0].n, 0);

    const token = `paid${rnd(12)}`;
    const j = await ok(buyGoogle(buyer.session, 'coins_100000', token));
    assert.equal(j.coins, 100_000);
    assert.equal(j.user.coins, 100_000);
    assert.ok(stores.consumed.includes(token));
    const [lot] = await q("SELECT channel FROM coin_lots WHERE user_id = $1 AND amount = 100000", [buyer.user.id]);
    assert.equal(lot.channel, 'google');
    const [p] = await q('SELECT sandbox FROM purchases WHERE user_id = $1', [buyer.user.id]);
    assert.equal(p.sandbox, false);
    assert.equal(Number((await q('SELECT svip_xp FROM users WHERE id = $1', [buyer.user.id]))[0].svip_xp), 100_000);
  });

  test('App Store: sandbox (ve üretim sunucusundan gelen sandbox kaydı) reddedilir; üretim yüklenir', async () => {
    stores.apple.sandbox.set('200000001', { productId: 'coins_1000' });
    stores.apple.prod.set('100000002', { productId: 'coins_1000', environment: 'Sandbox' });
    stores.apple.prod.set('100000001', { productId: 'coins_1000' });
    for (const id of ['200000001', '100000002']) assert.equal((await buyApple(buyer.session, 'coins_1000', id))[0], 402, id);
    const j = await ok(buyApple(buyer.session, 'coins_1000', '100000001'));
    assert.equal(j.coins + j.bonus, 2_000);
    assert.equal(j.user.coins, 102_000);
    assert.equal((await q("SELECT count(*)::int AS n FROM coin_lots WHERE channel = 'test'"))[0].n, 0);
  });

  test('para çekme: gerçek parayla sunucuda yönetici öder', async () => {
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'c3', count: 1, ref: ref() }, buyer.session));
    const w = (await ok(call('POST', '/api/wallet/withdraw', { diamonds: 50_000, method: 'iban', details: { holder: 'Ada Yılmaz', account: 'DE89 3704 0044 0532 0130 00' }, ref: ref() }, host.session))).withdrawal;
    assert.equal(w.usd, 10);
    const list = await ok(call('GET', '/api/admin/withdrawals', null, admin.session));
    assert.equal(list.playMoney, false);
    const row = list.rows.find((x) => x.id === w.id);
    assert.equal(row.payable, true);
    const d = await ok(call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: true, note: 'Havale yapıldı' }, admin.session));
    assert.equal(d.withdrawal.status, 'paid');
    assert.equal(d.withdrawal.statusLabel, 'Ödendi');
    assert.equal((await me(host.session)).diamonds, 49_999);
    assert.equal((await call('POST', '/api/wallet/withdrawals/cancel', { id: w.id }, host.session))[0], 409, 'ödenmiş talep iptal edilmez');
    const [a] = await q("SELECT actor, detail FROM audit_events WHERE action = 'withdrawal.paid'");
    assert.equal(a.actor, admin.user.id);
    assert.equal(a.detail.withdrawal, w.id);
    assert.equal((await ok(call('GET', '/api/wallet/withdrawals', null, host.session))).withdrawals[0].status, 'paid');
  });

  test('Google Play iadesi kendiliğinden işlenir: jeton, kilitli elmas ve ajans komisyonu geri alınır; tekrar okumak bir şey değiştirmez', async () => {
    const [owner, streamer, buyer2] = await Promise.all([h.account('Ajans Sahibi'), h.account('Ajans Yayıncısı'), h.account('Alıcı 2')]);
    const agency = (await ok(call('POST', '/api/admin/agency/create', { name: 'Deneme Ajans', owner: owner.user.id }, admin.session))).agency;
    await ok(call('POST', '/api/admin/agency/assign', { streamer: streamer.user.id, agencyId: agency.id, reason: 'Sözleşme imzalandı' }, admin.session));

    const token = `void${rnd(12)}`;
    await ok(buyGoogle(buyer2.session, 'coins_100000', token));
    await ok(call('POST', '/api/gifts/send', { to: streamer.user.id, giftId: 'c3', count: 1, ref: ref() }, buyer2.session));
    // The store lock is 0 days on this server; this gift's diamonds are put back under lock, as in production.
    await q("UPDATE diamond_locks SET unlock_at = now() + interval '7 days' WHERE user_id = $1", [streamer.user.id]);
    const gift = await q("SELECT c.base_diamonds FROM agency_commissions c JOIN income_events e ON e.id = c.income_event_id WHERE c.streamer_id = $1 AND e.source_type = 'gift'", [streamer.user.id]);
    assert.equal(Number(gift[0].base_diamonds), 99_999, 'hediye komisyonu yazıldı');

    const [p] = await q('SELECT id, transaction_id FROM purchases WHERE user_id = $1', [buyer2.user.id]);
    stores.voided.push({ orderId: p.transaction_id, purchaseToken: token, voidedTimeMillis: String(Date.now()), voidedReason: 1 });
    stores.voided.push({ orderId: 'GPA.0000-unknown', purchaseToken: 'unknown-token', voidedTimeMillis: String(Date.now()) });
    assert.ok(await until(async () => (await q('SELECT status FROM purchases WHERE id = $1', [p.id]))[0].status === 'refunded'), 'zamanlayıcı iadeyi işledi');

    assert.equal((await me(streamer.session)).diamonds, 0);
    assert.equal((await me(buyer2.session)).coins, 0);
    const [ev] = await q("SELECT diamonds, calc_status FROM income_events WHERE streamer_id = $1 AND source_type = 'refund'", [streamer.user.id]);
    assert.equal(Number(ev.diamonds), -99_999);
    assert.equal(ev.calc_status, 'done');
    const back = await q("SELECT c.base_diamonds, c.agency_id FROM agency_commissions c JOIN income_events e ON e.id = c.income_event_id WHERE c.streamer_id = $1 AND e.source_type = 'refund'", [streamer.user.id]);
    assert.equal(Number(back[0].base_diamonds), -99_999, 'komisyon geri alındı');
    assert.equal(back[0].agency_id, agency.id);
    const [a] = await q("SELECT actor, detail FROM audit_events WHERE action = 'purchase.refund'");
    assert.equal(a.actor, null);
    assert.equal(a.detail.source, 'google_voided');
    assert.equal(a.detail.commissionDiamonds, 99_999);

    // The same list read again (the timer and this button): nothing more is taken.
    let again;
    assert.ok(
      await until(async () => {
        const [st, j] = await call('POST', '/api/admin/purchases/voided-sync', null, admin.session);
        if (st === 409) return false;
        assert.equal(st, 200, j.error);
        again = j;
        return true;
      }),
    );
    assert.deepEqual(again, { checked: 2, refunded: 0, unknown: 1, failed: 0 });
    assert.equal((await q("SELECT count(*)::int AS n FROM income_events WHERE source_type = 'refund'"))[0].n, 1);
    assert.equal((await call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session))[0], 409, 'elle ikinci iade');
    assert.equal((await call('POST', '/api/admin/purchases/voided-sync', null, buyer.session))[0], 403);
    assert.ok(stores.voidedCalls >= 2);
  });

  test('SMS kodu: saatte bütün numaralara en çok OTP_GLOBAL_PER_HOUR kod', async () => {
    const phone = (i) => `+90532${String(7000000 + i)}`;
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/api/auth/otp/start', { phone: phone(i) }))[0], 200, `kod ${i + 1}`);
    const [st, j] = await call('POST', '/api/auth/otp/start', { phone: phone(3) });
    assert.equal(st, 429);
    assert.match(j.error, /çok fazla kod/);
    assert.equal((await q('SELECT count(*)::int AS n FROM otp_sends'))[0].n, 3);
  });

  test('inceleme numarası: OTP_REVIEW_MAX_TRIES yanlış koddan sonra bir saat kilitli', async () => {
    const verify = (code) => call('POST', '/api/auth/otp/verify', { phone: REVIEW_PHONE, code, name: 'İnceleme' });
    assert.equal((await ok(verify(REVIEW_CODE))).user.name, 'İnceleme', 'doğru kod girer');
    for (let i = 0; i < 3; i++) assert.equal((await verify('000000'))[0], 400, `yanlış ${i + 1}`);
    const [st, j] = await verify(REVIEW_CODE);
    assert.equal(st, 429, 'kilitliyken doğru kod da girmez');
    assert.match(j.error, /bir saat sonra/);
    await q("UPDATE otp_review_lock SET locked_until = now() - interval '1 second'");
    await ok(verify(REVIEW_CODE));
    const [lock] = await q('SELECT fails FROM otp_review_lock WHERE phone = $1', [REVIEW_PHONE]);
    assert.equal(lock.fails, 0);
  });

  test('ses odası: çıkarılan kişi LiveKit\'ten de çıkar; kapanan oda LiveKit\'te biter; örnek oda yok', async () => {
    const [owner, guest] = await Promise.all([h.account('Oda Sahibi'), h.account('Misafir')]);
    const room = (await ok(call('POST', '/api/rooms', { title: 'Sohbet' }, owner.session))).room;
    const name = `oda-${room.id}`;
    await ok(call('GET', `/token?room=${name}`, null, guest.session));
    await ok(call('POST', '/api/rooms/ban', { room: room.id, user: guest.user.id, minutes: 10 }, owner.session));
    const kick = stores.livekit.find((x) => x.method === 'RemoveParticipant');
    assert.deepEqual(kick.body, { room: name, identity: guest.user.id });
    assert.deepEqual(kick.grant, { roomAdmin: true, room: name });
    assert.equal(kick.signed, true);
    assert.equal((await call('GET', `/token?room=${name}`, null, guest.session))[0], 403);

    await ok(call('POST', '/api/rooms/close', { id: room.id }, owner.session));
    const del = stores.livekit.find((x) => x.method === 'DeleteRoom');
    assert.deepEqual(del.body, { room: name });
    assert.deepEqual(del.grant, { roomCreate: true });
    assert.equal((await call('GET', `/token?room=${name}`, null, owner.session))[0], 410);
    assert.equal((await call('GET', '/token?room=oda-r1', null, owner.session))[0], 404);
  });

  test('veritabanında bir kez test jetonu olduysa hiçbir çekim ödenmez (yalnızca reddedilir)', async () => {
    await ok(buyGoogle(buyer.session, 'coins_100000', `paid${rnd(12)}`));
    await ok(call('POST', '/api/gifts/send', { to: host.user.id, giftId: 'c3', count: 1, ref: ref() }, buyer.session));
    await q("INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref) VALUES ($1, 'test', 10, 10, 0, 'eski-test')", [buyer.user.id]);
    const w = (await ok(call('POST', '/api/wallet/withdraw', { diamonds: 50_000, method: 'other', details: { holder: 'Ada Yılmaz', account: 'Wise: ada@example.com' }, ref: ref() }, host.session))).withdrawal;
    const row = (await ok(call('GET', '/api/admin/withdrawals', null, admin.session))).rows.find((x) => x.id === w.id);
    assert.equal(row.payable, false);
    const [st, j] = await call('POST', '/api/admin/withdrawals/decide', { id: w.id, approve: true }, admin.session);
    assert.equal(st, 409);
    assert.match(j.error, /test jetonu/);
  });
});
