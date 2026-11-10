// Yeni üye ödülleri (referrals.mjs) against a real Postgres: the welcome coins of a new phone sign-up (once, never
// for a phone another account used, the live amount and switch), Arkadaşını Getir (a personal code, entering one
// within 7 days, the reward for both on the invitee's first room entry from LiveKit's signed webhook, the device,
// block, self and daily-cap rules, the switch, staff taking fake-account coins back, the data copy and deletion),
// and the first-purchase gift on Google Play packs (shown until the pack is bought, taken back by a refund, off by
// the live switch).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { codeOf } from '../referrals.mjs';
import { fakeStores } from './fake-stores.mjs';
import { rnd, startApi } from './harness.mjs';

const stores = await fakeStores();
const h = startApi({
  ...stores.env,
  SMS_PROVIDER: 'log',
  PHONE_SIGN_IN: '1',
  ONE_ACCOUNT_PER_DEVICE: '1',
  OTP_IP_PER_HOUR: '1000',
  LIVE_POLL_MS: '200',
  AGENCY_JOBS: '0',
});
const { call, signUp } = h;
const q = async (sql, args) => (await h.sql.query(sql, args)).rows;
const ok = async (p, what = '') => {
  const [st, j] = await p;
  assert.equal(st, 200, `${what}: ${j.error}`);
  return j;
};
const coins = async (id) => Number((await q('SELECT coins FROM users WHERE id = $1', [id]))[0].coins);
const lotsOf = (id) => q('SELECT channel, amount, remaining, ref FROM coin_lots WHERE user_id = $1 ORDER BY id', [id]);

let admin;
async function setLive(changes) {
  const view = await ok(call('GET', '/api/admin/live-settings', null, admin.session), 'ayarlar');
  return ok(call('POST', '/api/admin/live-settings', { changes, reason: 'Ödül testi', baseV: view.v, confirm: true }, admin.session), 'ayar kaydı');
}

// --- Phone sign-up (a real new account, as the app makes it) ------------------------------------------------
const phoneNo = () => `+90532${String(crypto.randomInt(0, 1e7)).padStart(7, '0')}`;
const aPhone = (hardwareId = rnd(8)) => ({ installId: rnd(20), hardwareId, platform: 'android', model: 'Pixel 9', os: 'Android 15', app: '1.0.0' });
async function phoneSignUp(deviceInfo = aPhone()) {
  const phone = phoneNo();
  const from = h.logs.length;
  const start = await ok(call('POST', '/api/auth/otp/start', { phone }), 'kod');
  const code = (await h.waitLog(new RegExp(`^otp \\${phone} \\d{6}$`), from)).split(' ')[2];
  const [st, j] = await call('POST', '/api/auth/otp/verify', { phone, code, challenge: start.challenge, name: 'Yeni Üye', deviceInfo });
  return [st, { ...j, deviceInfo }];
}

// --- LiveKit's signed webhook (as launch.test.mjs) ----------------------------------------------------------
const sign = (body) => {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const hp = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'testkey', nbf: now - 5, exp: now + 300, sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
  return `${hp}.${crypto.createHmac('sha256', 'testsecret').update(hp).digest('base64url')}`;
};
const hook = (event, extra) => {
  const body = JSON.stringify({ event, id: `EV_${rnd(4)}`, createdAt: String(Math.floor(Date.now() / 1000)), ...extra });
  return call('POST', '/api/livekit/webhook', body, null, { authorization: sign(body), 'content-type': 'application/webhook+json' });
};
let room;
const enterRoom = async (who) => ok(hook('participant_joined', { room: { name: `oda-${room}` }, participant: { identity: who.user.id, sid: `PA_${rnd(4)}` } }), 'odaya giriş');

const invite = (who) => ok(call('GET', '/api/invite', null, who.session), 'davet');
const redeem = (who, code) => call('POST', '/api/invite/redeem', { code }, who.session);
const rewards = (who) => ok(call('GET', '/api/rewards', null, who.session), 'ödüller');

describe('başlangıç', () => {
  test('yönetici ve oda', async () => {
    admin = await h.account('Yönetici', 'admin');
    const owner = await signUp('Oda Sahibi');
    room = (await ok(call('POST', '/api/rooms', { title: 'Davet Odası' }, owner.session), 'oda')).room.id;
  });
});

describe('Hoş geldin jetonu', () => {
  test('yeni hesaba bir kez 100 ödül jetonu; hediyede harcanmaz', async () => {
    const [st, me] = await phoneSignUp();
    assert.equal(st, 200, me.error);
    assert.equal(me.isNew, true);
    assert.equal(me.user.coins, 100, 'giriş yanıtındaki bakiye jetonu içerir');
    assert.deepEqual((await lotsOf(me.user.id)).map((l) => [l.channel, Number(l.amount), l.ref]), [['odul', 100, 'welcome:gift']]);
    const [led] = await q("SELECT reason, amount FROM ledger WHERE user_id = $1 AND currency = 'coin'", [me.user.id]);
    assert.deepEqual([led.reason, Number(led.amount)], ['Hoş geldin hediyesi', 100]);
    assert.deepEqual((await rewards(me)).welcome, { coins: 100, on: true, amount: 100 });
    // Reward coins are for the shop only: a gift is refused and nothing moves.
    const other = await signUp('Alıcı');
    const [gst, g] = await call('POST', '/api/gifts/send', { to: other.user.id, giftId: 'g2', count: 1, ref: rnd(8) }, me.session);
    assert.equal(gst, 409);
    assert.equal(g.code, 'reward_coins_only');
    assert.equal(await coins(me.user.id), 100);
  });

  test('aynı telefonda daha önce hesap açılmışsa verilmez (silinmiş hesap da sayılır); geliştirici girişi almaz', async () => {
    const phone = aPhone();
    const [, first] = await phoneSignUp(phone);
    assert.equal(first.user.coins, 100);
    await ok(call('DELETE', '/api/me', null, first.session), 'hesabı sil');
    const [st, second] = await phoneSignUp(phone);
    assert.equal(st, 200, second.error);
    assert.equal(second.isNew, true);
    assert.equal(second.user.coins, 0, 'telefon başka hesapta kullanılmış');
    assert.equal((await rewards(second)).welcome.coins, 0);

    // A development account on this phone first (test servers): the phone sign-up after it gets nothing either.
    const shared = aPhone();
    await ok(call('POST', '/api/auth/dev', { deviceKey: rnd(24), name: 'Test', deviceInfo: shared }), 'geliştirici');
    const [, third] = await phoneSignUp(shared);
    assert.equal(third.user.coins, 0);
    assert.equal((await signUp('Geliştirici')).user.coins, 0, 'geliştirici girişi hoş geldin jetonu almaz');
  });

  test('canlı ayar: miktar değişir, kapatılınca verilmez', async () => {
    await setLive({ welcome_coins: 50 });
    const [, a] = await phoneSignUp();
    assert.equal(a.user.coins, 50);
    await setLive({ rewards_off: ['welcome'] });
    const [, b] = await phoneSignUp();
    assert.equal(b.user.coins, 0);
    assert.equal((await rewards(b)).welcome.on, false);
    await setLive({ rewards_off: null, welcome_coins: null });
  });
});

describe('Arkadaşını Getir', () => {
  test('kişisel kod: biçimi, kalıcı, girişte boşluk ve küçük harf sorun değil', async () => {
    const a = await signUp('Kodlu');
    const one = await invite(a);
    assert.match(one.code, /^SIMI-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal((await invite(a)).code, one.code);
    assert.deepEqual([one.on, one.coins, one.dailyCap, one.enterDays], [true, 200, 10, 7]);
    assert.deepEqual(one.stats, { invited: 0, rewarded: 0, waiting: 0, earned: 0 });
    assert.equal(codeOf(` ${one.code.toLowerCase().replace('-', ' ')} `), one.code);
    assert.equal(codeOf(one.code.slice(5)), one.code);
    assert.equal(codeOf('SIMI-0O1I00'), null);
  });

  test('kod girilir; arkadaş ilk odasına girince ikisine de 200 ödül jetonu, bir kez', async () => {
    const inviter = await signUp('Davet Eden');
    const friend = await signUp('Arkadaş');
    const { code } = await invite(inviter);
    const mine = (await ok(redeem(friend, code), 'kod gir')).mine;
    assert.deepEqual([mine.by.id, mine.by.name, mine.status, mine.canEnter], [inviter.user.id, 'Davet Eden', 'pending', false]);
    assert.equal((await ok(redeem(friend, code), 'tekrar')).mine.status, 'pending', 'aynı kod tekrar: aynı cevap');
    assert.deepEqual((await invite(inviter)).stats, { invited: 1, rewarded: 0, waiting: 1, earned: 0 });

    await enterRoom(friend);
    assert.deepEqual([await coins(inviter.user.id), await coins(friend.user.id)], [200, 200]);
    for (const who of [inviter, friend]) {
      const lots = await lotsOf(who.user.id);
      assert.deepEqual(lots.map((l) => [l.channel, Number(l.amount)]), [['odul', 200]], 'ödül jetonu: yalnız mağazada');
    }
    assert.deepEqual((await invite(inviter)).stats, { invited: 1, rewarded: 1, waiting: 0, earned: 200 });
    const after = await invite(friend);
    assert.deepEqual([after.mine.status, after.mine.coins, after.stats.earned], ['paid', 200, 200]);

    await enterRoom(friend);
    assert.deepEqual([await coins(inviter.user.id), await coins(friend.user.id)], [200, 200], 'ikinci giriş bir şey vermez');
    // Another code later: refused, and nothing new.
    const other = await signUp('Başka');
    const [st, j] = await redeem(friend, (await invite(other)).code);
    assert.deepEqual([st, j.code], [409, 'already']);
  });

  test('kendi kodu, bilinmeyen kod, yeni hesabın kodu, engel ve 7 gün', async () => {
    const old = await signUp('Eski Üye');
    const me = await signUp('Yeni Üye');
    const mineCode = (await invite(me)).code;
    assert.equal((await redeem(me, mineCode))[0], 400, 'kendi kodu');
    assert.equal((await redeem(me, 'SIMI-AAAAAA'))[0], 404);
    assert.equal((await redeem(me, 'merhaba'))[0], 400);
    const newer = await signUp('Daha Yeni');
    const [st, j] = await redeem(me, (await invite(newer)).code);
    assert.deepEqual([st, j.code], [409, 'newer'], 'iki yeni hesap birbirini davet edemez');

    const oldCode = (await invite(old)).code;
    await ok(call('POST', '/api/block', { to: me.user.id, block: true }, old.session), 'engel');
    assert.equal((await redeem(me, oldCode))[0], 404, 'engelleyenin kodu yok sayılır');
    await ok(call('POST', '/api/block', { to: me.user.id, block: false }, old.session), 'engel kalktı');

    await q("UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1", [me.user.id]);
    const [lst, late] = await redeem(me, oldCode);
    assert.deepEqual([lst, late.code], [409, 'too_late']);
    assert.equal((await invite(me)).mine.canEnter, false);
  });

  test('davetlinin telefonunda başka hesap varsa ödül yok; sonradan engellenirse ödül yok', async () => {
    const inviter = await signUp('Telefon Kontrol');
    const { code } = await invite(inviter);
    const hw = rnd(8);
    await ok(call('POST', '/api/auth/dev', { deviceKey: rnd(24), name: 'İlk', deviceInfo: aPhone(hw) }), 'ilk hesap');
    const [, second] = await call('POST', '/api/auth/dev', { deviceKey: rnd(24), name: 'İkinci', deviceInfo: aPhone(hw) });
    const [st, j] = await redeem(second, code);
    assert.deepEqual([st, j.code], [409, 'device']);

    // The phone was clean when the code went in; another account used it before the first room.
    const friend = await signUp('Temiz Telefon');
    await ok(redeem(friend, code), 'kod');
    const key = (await q('SELECT device_id FROM device_accounts WHERE user_id = $1', [friend.user.id]))[0].device_id;
    const late = await signUp('Sonradan');
    await q('INSERT INTO device_accounts (device_id, user_id) VALUES ($1, $2)', [key, late.user.id]);
    await enterRoom(friend);
    const mine = (await invite(friend)).mine;
    assert.deepEqual([mine.status, mine.reason], ['refused', 'device']);
    assert.deepEqual([await coins(inviter.user.id), await coins(friend.user.id)], [0, 0]);

    const friend2 = await signUp('Engelli');
    await ok(redeem(friend2, code), 'kod');
    await ok(call('POST', '/api/block', { to: inviter.user.id, block: true }, friend2.session), 'engel');
    await enterRoom(friend2);
    const m2 = (await invite(friend2)).mine;
    assert.deepEqual([m2.status, m2.reason, m2.by], ['refused', 'blocked', null], 'engellenenin adı görünmez');
    assert.equal(await coins(inviter.user.id), 0);
  });

  test('günlük sınır: fazlası bekler, ertesi gün ilk girişte ödenir; önceden odaya girmişse kod girince ödenir', async () => {
    await setLive({ invite_daily_cap: 1, invite_coins: 300 });
    const inviter = await signUp('Sınırlı');
    const { code } = await invite(inviter);
    const a = await signUp('Bir');
    const b = await signUp('İki');
    // `a` was in a room before entering the code: paid at once.
    await enterRoom(a);
    assert.equal((await ok(redeem(a, code), 'kod')).mine.status, 'paid');
    await ok(redeem(b, code), 'kod');
    await enterRoom(b);
    assert.equal((await invite(b)).mine.status, 'pending', 'bugünkü sınır doldu');
    assert.deepEqual([await coins(inviter.user.id), await coins(b.user.id)], [300, 0]);
    // A day later.
    await q("UPDATE referrals SET settled_at = now() - interval '1 day' WHERE inviter_id = $1 AND status = 'paid'", [inviter.user.id]);
    await enterRoom(b);
    assert.equal((await invite(b)).mine.status, 'paid');
    assert.deepEqual([await coins(inviter.user.id), await coins(b.user.id)], [600, 300]);
    await setLive({ invite_daily_cap: null, invite_coins: null });
  });

  test('kapalıyken kod alınmaz, bekleyen davet ödenmez; açılınca ilk girişte ödenir', async () => {
    const inviter = await signUp('Kapalı');
    const { code } = await invite(inviter);
    const friend = await signUp('Bekleyen');
    await ok(redeem(friend, code), 'kod');
    const late = await signUp('Geç');
    await setLive({ rewards_off: ['invite'] });
    const [st, j] = await redeem(late, code);
    assert.deepEqual([st, j.code], [409, 'invite_off']);
    assert.deepEqual((await rewards(late)).invite, { on: false, coins: 200, canEnter: false });
    await enterRoom(friend);
    assert.equal((await invite(friend)).mine.status, 'pending');
    await setLive({ rewards_off: null });
    await enterRoom(friend);
    assert.equal((await invite(friend)).mine.status, 'paid');
  });

  test('yönetim sahte hesabın davet jetonunu geri alır; harcanan geri gelmez', async () => {
    const inviter = await signUp('Sahte Davet');
    const friend = await signUp('Sahte Hesap');
    await ok(redeem(friend, (await invite(inviter)).code), 'kod');
    await enterRoom(friend);
    // The inviter spends 150 of their 200 in the shop (reward coins pay for it first).
    await ok(call('POST', '/api/shop/buy', { sku: 'fr-neon', price: 150, ref: rnd(8) }, inviter.session), 'mağaza');
    assert.equal(await coins(inviter.user.id), 50);
    const [st] = await call('POST', '/api/admin/referrals/revoke', { invitee: friend.user.id, reason: 'Sahte hesap' }, inviter.session);
    assert.equal(st, 403);
    const r = await ok(call('POST', '/api/admin/referrals/revoke', { invitee: friend.user.id, reason: 'Sahte hesap' }, admin.session), 'geri al');
    assert.deepEqual(r.coins, { inviter: 50, invitee: 200 });
    assert.deepEqual([await coins(inviter.user.id), await coins(friend.user.id)], [0, 0]);
    assert.equal((await invite(friend)).mine.status, 'revoked');
    assert.equal((await invite(inviter)).stats.earned, 150);
    assert.equal((await call('POST', '/api/admin/referrals/revoke', { invitee: friend.user.id, reason: 'Sahte hesap' }, admin.session))[0], 409);
    const [audit] = await q("SELECT actor, target FROM audit_events WHERE action = 'referral.revoke'");
    assert.deepEqual([audit.actor, audit.target], [admin.user.id, friend.user.id]);
  });

  test('verilerimin kopyasında var; hesap silinince kod ve davet satırları gider', async () => {
    const inviter = await signUp('Kopya Davet');
    const friend = await signUp('Kopya Arkadaş');
    const { code } = await invite(inviter);
    await ok(redeem(friend, code), 'kod');
    await enterRoom(friend);
    const x = await ok(call('GET', '/api/me/export', null, inviter.session), 'kopya');
    assert.equal(x.referrals.code.code, code);
    assert.deepEqual(x.referrals.invited.map((r) => [r.person.name, r.status, r.coins]), [['Kopya Arkadaş', 'paid', 200]]);
    const y = await ok(call('GET', '/api/me/export', null, friend.session), 'kopya');
    assert.equal(y.referrals.invitedBy.person.name, 'Kopya Davet');

    await ok(call('DELETE', '/api/me', null, inviter.session), 'sil');
    assert.equal((await q('SELECT count(*)::int AS n FROM referral_codes WHERE user_id = $1', [inviter.user.id]))[0].n, 0);
    assert.equal((await q('SELECT count(*)::int AS n FROM referrals WHERE inviter_id = $1 OR invitee_id = $1', [inviter.user.id]))[0].n, 0);
    assert.equal((await redeem(await signUp('Sonraki'), code))[0], 404, 'silinen hesabın kodu artık yok');
    // The friend was paid once; the inviter's rows are gone, the ledger still says so.
    const [st, j] = await redeem(friend, (await invite(await signUp('Yeni Davetçi'))).code);
    assert.deepEqual([st, j.code], [409, 'already']);
  });
});

describe('İlk alım hediyesi', () => {
  const google = (s, productId, token) => call('POST', '/api/wallet/purchase', { platform: 'android', productId, token }, s);

  test('alınmamış paketlerde gösterilir; ilk Google Play alımı hediyeyi ekler, iade geri alır', async () => {
    const buyer = await signUp('İlk Alıcı');
    assert.deepEqual((await rewards(buyer)).firstBonus, {
      on: true,
      packs: [
        { productId: 'coins_1000', bonus: 1_000 },
        { productId: 'coins_5000', bonus: 2_500 },
      ],
    });
    const out = await ok(google(buyer.session, 'coins_1000', `first${rnd(10)}`), 'alım');
    assert.deepEqual([out.coins, out.bonus], [1_000, 1_000]);
    assert.deepEqual((await lotsOf(buyer.user.id)).map((l) => [l.channel, Number(l.amount)]), [['google', 1_000], ['bonus', 1_000]]);
    assert.deepEqual((await rewards(buyer)).firstBonus.packs, [{ productId: 'coins_5000', bonus: 2_500 }]);
    const again = await ok(google(buyer.session, 'coins_1000', `again${rnd(10)}`), 'ikinci alım');
    assert.equal(again.bonus, 0, 'aynı paketin ikinci alımı hediyesiz');

    const p = (await q("SELECT id FROM purchases WHERE user_id = $1 AND bonus > 0", [buyer.user.id]))[0];
    const r = await ok(call('POST', '/api/admin/purchases/refund', { purchase: Number(p.id) }, admin.session), 'iade');
    assert.equal(r.coins, 2_000, 'paket ve hediyesi geri alınır');
    assert.equal(await coins(buyer.user.id), 1_000);
    assert.deepEqual((await rewards(buyer)).firstBonus.packs, [{ productId: 'coins_5000', bonus: 2_500 }], 'iade edilen alım da sayılır');
  });

  test('kapatılınca gösterilmez ve verilmez', async () => {
    const buyer = await signUp('Kapalı Alıcı');
    await setLive({ rewards_off: ['first_purchase'] });
    assert.deepEqual((await rewards(buyer)).firstBonus, { on: false, packs: [] });
    const out = await ok(google(buyer.session, 'coins_5000', `off${rnd(10)}`), 'alım');
    assert.deepEqual([out.coins, out.bonus], [5_000, 0]);
    await setLive({ rewards_off: null });
    assert.deepEqual((await rewards(buyer)).firstBonus.packs, [{ productId: 'coins_1000', bonus: 1_000 }]);
  });
});
