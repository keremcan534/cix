// Live settings' registry (live-registry.mjs), no database: today's defaults, every key's bounds, the money rules
// (rate ±10 % per save, withdrawal limits only down), the "emin misin?" rules, the campaign sums and the snapshot.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { EXCHANGE, GIFTS, PACKS, SHOP, WITHDRAW, exchangeCoins } from '../catalog.mjs';
import {
  DEFAULTS,
  FEATURES,
  LiveError,
  MONEY_STOP,
  REGISTRY,
  campaignBonus,
  campaignRef,
  checkChange,
  compareVersion,
  configOf,
  defaultsOf,
  effectiveOf,
  exchangeOk,
  impactOf,
  isBig,
  snapshotOf,
  validate,
} from '../live-registry.mjs';

const refused = (fn, re) => assert.throws(fn, (e) => e instanceof LiveError && (!re || re.test(e.message)), String(re ?? ''));
const NOW = Date.parse('2026-11-05T12:00:00Z');
const H = 3_600_000;
const iso = (t) => new Date(t).toISOString();
const camp = (o = {}) => ({ percent: 20, startsAt: iso(NOW + H), endsAt: iso(NOW + 49 * H), label: 'Bayram', ...o });

describe('defaults are today', () => {
  test('an empty table changes nothing', () => {
    assert.deepEqual(defaultsOf({}), {
      features_off: [],
      notice: null,
      min_version: null,
      campaign: null,
      gifts_hidden: [],
      shop_hidden: [],
      packs_hidden: [],
      exchange_usd_try: EXCHANGE.usdTry,
      withdraw_max_diamonds: WITHDRAW.maxDiamonds,
      withdraw_weekly_diamonds: WITHDRAW.weeklyDiamonds,
      otp_global_per_hour: 300,
      dm_price: 240,
      call_voice_price: 2000,
      call_video_price: 3200,
      call_free: 3,
      call_free_seconds: 58,
      call_plain_voice_price: 600,
      call_plain_video_price: 750,
      match_voice_price: 600,
      match_video_price: 750,
      match_free: 3,
      match_free_seconds: 58,
      heart_voice_level: 2,
      heart_video_level: 4,
      backpack_call_task: 1,
      rewards_off: [],
      welcome_coins: 100,
      invite_coins: 200,
      invite_daily_cap: 10,
      casino_off: [],
      casino_open: [],
      casino_max_bet: 25_000,
      casino_daily_rounds: 40,
      room_decor_off: [],
      room_bg_custom_price: 5_000,
      room_bg_custom_days: 30,
      event_min_room_level: 1,
      event_min_lead_minutes: 30,
      event_max_minutes: 180,
      event_max_capacity: 500,
      event_grace_minutes: 15,
      event_strike_limit: 3,
      event_block_days: 14,
    });
    assert.equal(EXCHANGE.usdTry, 49.8);
    assert.equal(WITHDRAW.maxDiamonds, 5_000_000);
    assert.equal(WITHDRAW.weeklyDiamonds, 10_000_000);
    assert.equal(defaultsOf({ OTP_GLOBAL_PER_HOUR: '120' }).otp_global_per_hour, 120);
    assert.equal(defaultsOf({ OTP_GLOBAL_PER_HOUR: 'çok' }).otp_global_per_hour, 300);
    assert.equal(defaultsOf({ OTP_GLOBAL_PER_HOUR: '0' }).otp_global_per_hour, 0);
    assert.deepEqual(defaultsOf({ APP_NOTICE: ' Bakım ', APP_MIN_VERSION: '1.0.3' }).notice, 'Bakım');
    assert.deepEqual(defaultsOf({ APP_MIN_VERSION: '1.0.3' }).min_version, '1.0.3');
    assert.ok(Object.isFrozen(DEFAULTS) && Object.isFrozen(REGISTRY.features_off.bounds));
    for (const [k, r] of Object.entries(REGISTRY)) assert.deepEqual(r.default, DEFAULTS[k], k);
  });

  test('only the agreed keys; never the ones that need a deploy', () => {
    assert.deepEqual(Object.keys(REGISTRY), [
      'features_off',
      'notice',
      'campaign',
      'gifts_hidden',
      'shop_hidden',
      'packs_hidden',
      'exchange_usd_try',
      'withdraw_max_diamonds',
      'withdraw_weekly_diamonds',
      'otp_global_per_hour',
      'min_version',
      'dm_price',
      'call_voice_price',
      'call_video_price',
      'call_free',
      'call_free_seconds',
      'call_plain_voice_price',
      'call_plain_video_price',
      'match_voice_price',
      'match_video_price',
      'match_free',
      'match_free_seconds',
      'heart_voice_level',
      'heart_video_level',
      'backpack_call_task',
      'rewards_off',
      'welcome_coins',
      'invite_coins',
      'invite_daily_cap',
      'casino_off',
      'casino_open',
      'casino_max_bet',
      'casino_daily_rounds',
      'room_decor_off',
      'room_bg_custom_price',
      'room_bg_custom_days',
      'event_min_room_level',
      'event_min_lead_minutes',
      'event_max_minutes',
      'event_max_capacity',
      'event_grace_minutes',
      'event_strike_limit',
      'event_block_days',
    ]);
    for (const k of ['need_level', 'need_points', 'min_age', 'lucky_min_age', 'diamonds_per_usd', 'coin_diamond_ratio', 'lock_hours', 'test_daily', 'allow_test_topup', 'gift_prices', 'pack_prices', 'pack_coins', 'product_ids', 'sms_provider', '__proto__', 'constructor', 'toString']) {
      assert.ok(!Object.hasOwn(REGISTRY, k), k);
      refused(() => validate(k, 1), /Bilinmeyen ayar/);
    }
    for (const r of Object.values(REGISTRY)) assert.ok(r.label && r.help && r.group && r.type && r.field, r.label);
  });
});

describe('validate', () => {
  test('null is the default; undefined and wrong types are refused', () => {
    for (const k of Object.keys(REGISTRY)) {
      assert.equal(validate(k, null), null, k);
      refused(() => validate(k, undefined), /değer gerekli/);
    }
    refused(() => validate('features_off', 'gifts'), /liste/);
    refused(() => validate('notice', 5), /metin/);
    refused(() => validate('exchange_usd_try', '50'), /sayı/);
    refused(() => validate('withdraw_max_diamonds', '100000'));
    refused(() => validate('campaign', []), /eksik/);
    refused(() => validate('min_version', 103), /1\.2\.3/);
  });

  test('sets: known ids, no doubles, kept in catalog order, empty = null', () => {
    assert.deepEqual(validate('features_off', ['dm', 'gifts']), ['gifts', 'dm']);
    assert.equal(validate('features_off', []), null);
    assert.deepEqual(validate('features_off', FEATURES), FEATURES);
    refused(() => validate('features_off', ['gifts', 'gifts']), /iki kez/);
    refused(() => validate('features_off', ['casino']), /bilinmeyen/);
    assert.deepEqual(validate('gifts_hidden', ['g3', 'g1']), ['g1', 'g3']);
    refused(() => validate('gifts_hidden', ['g999']), /bilinmeyen/);
    refused(() => validate('gifts_hidden', [1]), /bilinmeyen/);
    assert.equal(validate('gifts_hidden', [...GIFTS.keys()]).length, 54);
    const eight = PACKS.slice(0, 8).map((p) => p.id);
    assert.deepEqual(validate('packs_hidden', eight), eight);
    refused(() => validate('packs_hidden', PACKS.map((p) => p.id)), /En az bir paket/);
    refused(() => validate('packs_hidden', ['coins_1000']), /bilinmeyen/);
    assert.deepEqual(validate('shop_hidden', ['noble-1', 'fr-neon']), ['fr-neon', 'noble-1']);
    refused(() => validate('shop_hidden', ['fr-yok']), /bilinmeyen/);
    assert.equal(validate('shop_hidden', [...SHOP.keys()]).length, SHOP.size);
  });

  test('the emergency stop of older admin apps (all six money features) switches Mağaza off too', () => {
    assert.deepEqual(validate('features_off', MONEY_STOP), ['gifts', 'topup', 'exchange', 'jeton', 'games', 'withdraw', 'shop']);
    assert.deepEqual(validate('features_off', [...MONEY_STOP, 'dm']), ['gifts', 'topup', 'exchange', 'jeton', 'games', 'dm', 'withdraw', 'shop']);
    // Five of six: no stop, so the shop stays as chosen.
    assert.deepEqual(validate('features_off', MONEY_STOP.slice(1)), ['topup', 'exchange', 'jeton', 'games', 'withdraw']);
    assert.deepEqual(validate('features_off', ['shop']), ['shop']);
    // Stored rows parse the same way, so an older stop already saved covers the shop as well.
    assert.ok(snapshotOf([{ key: 'features_off', value: MONEY_STOP, v: 1 }], {}).featuresOff.has('shop'));
    assert.match(impactOf('features_off', [], validate('features_off', MONEY_STOP), { raw: MONEY_STOP }), /Mağaza da kapalı kalır/);
    assert.match(impactOf('features_off', [], ['shop'], { raw: ['shop'] }), /Mağazadan alım durur/);
  });

  test('notice: trimmed, at most 300, line breaks only', () => {
    assert.equal(validate('notice', '  Bakım var\nyarın  '), 'Bakım var\nyarın');
    assert.equal(validate('notice', ''), '');
    assert.equal(validate('notice', 'ş'.repeat(300)).length, 300);
    refused(() => validate('notice', 'x'.repeat(301)), /300/);
    refused(() => validate('notice', 'a\u0007b'), /özel karakter/);
  });

  test('campaign: 5–50 in steps of 5, starts within 30 days, lasts 1 h – 14 days', () => {
    assert.deepEqual(validate('campaign', camp({ label: '  Bayram ', startsAt: '2026-11-05T16:00:00+03:00' }), { now: NOW }), { percent: 20, startsAt: '2026-11-05T13:00:00.000Z', endsAt: iso(NOW + 49 * H), label: 'Bayram' });
    for (const p of [5, 25, 50]) assert.equal(validate('campaign', camp({ percent: p }), { now: NOW }).percent, p);
    for (const p of [0, 4, 7, 55, 20.5, '20']) refused(() => validate('campaign', camp({ percent: p }), { now: NOW }), /yüzdesi/);
    validate('campaign', camp({ startsAt: iso(NOW - 4 * 60_000) }), { now: NOW });
    refused(() => validate('campaign', camp({ startsAt: iso(NOW - 6 * 60_000) }), { now: NOW }), /30 gün/);
    refused(() => validate('campaign', camp({ startsAt: iso(NOW + 31 * 24 * H), endsAt: iso(NOW + 32 * 24 * H) }), { now: NOW }), /30 gün/);
    validate('campaign', camp({ endsAt: iso(NOW + 2 * H) }), { now: NOW });
    refused(() => validate('campaign', camp({ endsAt: iso(NOW + 2 * H - 1000) }), { now: NOW }), /1 saat/);
    validate('campaign', camp({ endsAt: iso(NOW + H + 14 * 24 * H) }), { now: NOW });
    refused(() => validate('campaign', camp({ endsAt: iso(NOW + H + 14 * 24 * H + 1000) }), { now: NOW }), /14 gün/);
    refused(() => validate('campaign', camp({ startsAt: 'yarın' }), { now: NOW }), /zaman/);
    refused(() => validate('campaign', camp({ startsAt: '2026-11-05' }), { now: NOW }), /zaman/);
    refused(() => validate('campaign', camp({ label: 'ab' }), { now: NOW }), /adı/);
    refused(() => validate('campaign', camp({ label: 'x'.repeat(41) }), { now: NOW }), /adı/);
    // A saved campaign (or a rollback to one) is not compared with now.
    assert.equal(validate('campaign', camp({ startsAt: iso(NOW - 90 * 24 * H), endsAt: iso(NOW - 89 * 24 * H) }), { now: NOW, stored: true }).percent, 20);
  });

  test('exchange rate: 40.00–75.00, two decimals', () => {
    assert.equal(validate('exchange_usd_try', 40), 40);
    assert.equal(validate('exchange_usd_try', 75), 75);
    assert.equal(validate('exchange_usd_try', 51.25), 51.25);
    for (const r of [39.99, 75.01, 498, 0, -50, NaN, Infinity]) refused(() => validate('exchange_usd_try', r));
    refused(() => validate('exchange_usd_try', 50.123), /ondalık/);
  });

  test('withdrawal limits: steps of 10,000, never above today', () => {
    assert.equal(validate('withdraw_max_diamonds', 5_000_000), 5_000_000);
    assert.equal(validate('withdraw_max_diamonds', 50_000), 50_000);
    refused(() => validate('withdraw_max_diamonds', 5_010_000), /5\.000\.000/);
    refused(() => validate('withdraw_max_diamonds', 40_000));
    refused(() => validate('withdraw_max_diamonds', 1_234_567), /katı/);
    assert.equal(validate('withdraw_weekly_diamonds', 10_000_000), 10_000_000);
    refused(() => validate('withdraw_weekly_diamonds', 10_010_000));
    refused(() => validate('withdraw_weekly_diamonds', 1e7 + 0.5));
  });

  test('SMS cap 0–2000 and the version pattern', () => {
    assert.equal(validate('otp_global_per_hour', 0), 0);
    assert.equal(validate('otp_global_per_hour', 2000), 2000);
    refused(() => validate('otp_global_per_hour', 2001));
    refused(() => validate('otp_global_per_hour', -1));
    refused(() => validate('otp_global_per_hour', 1.5));
    assert.equal(validate('min_version', ' 1.4.0 '), '1.4.0');
    assert.equal(validate('min_version', '2'), '2');
    for (const v of ['v1.4', '1.4.0-beta', '1.2.3.4', '', '1.'.repeat(11) + '1']) refused(() => validate('min_version', v), /1\.2\.3/);
  });
});

describe('save rules', () => {
  test('the rate moves at most ±10 % per save, also when going back to the default', () => {
    checkChange('exchange_usd_try', 49.8, 54.78);
    checkChange('exchange_usd_try', 49.8, 44.82);
    refused(() => checkChange('exchange_usd_try', 49.8, 54.79), /%10.*44,82–54,78/);
    refused(() => checkChange('exchange_usd_try', 49.8, 44.81), /%10/);
    refused(() => checkChange('exchange_usd_try', 60, 49.8, { raw: null }), /%10/);
    checkChange('exchange_usd_try', 54, 49.8, { raw: null });
  });

  test('a forced version needs the admin app, and no newer than it', () => {
    refused(() => checkChange('min_version', null, '1.4.0', {}), /sürümün gelmedi/);
    refused(() => checkChange('min_version', null, '1.4.0', { appVersion: 'yok' }), /sürümün gelmedi/);
    refused(() => checkChange('min_version', null, '1.4.1', { appVersion: '1.4.0' }), /Kendi uygulamandan \(1\.4\.0\)/);
    checkChange('min_version', null, '1.4.0', { appVersion: '1.4.0' });
    checkChange('min_version', null, '1.3', { appVersion: 'v1.4.0-beta' });
    // Back to .env's version: not the admin's pick.
    checkChange('min_version', '1.3.0', '9.0.0', { raw: null });
    checkChange('min_version', '1.3.0', null, {});
  });

  test('which changes need "emin misin?"', () => {
    assert.equal(isBig('exchange_usd_try', 49.8, 51.29), false);
    assert.equal(isBig('exchange_usd_try', 49.8, 51.3), true);
    assert.equal(isBig('exchange_usd_try', 49.8, 48.31), false);
    assert.equal(isBig('exchange_usd_try', 49.8, 48.3), true);
    assert.equal(isBig('exchange_usd_try', 60, null), false);
    assert.equal(isBig('campaign', null, camp({ percent: 25 })), false);
    assert.equal(isBig('campaign', null, camp({ percent: 30 })), true);
    assert.equal(isBig('campaign', camp({ percent: 30 }), null), false);
    assert.equal(isBig('min_version', null, '1.0.0'), true);
    assert.equal(isBig('min_version', '1.0.0', null), false);
    assert.equal(isBig('gifts_hidden', [], ['g1', 'g2', 'g3', 'g4', 'g5']), false);
    assert.equal(isBig('gifts_hidden', [], ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']), true);
    assert.equal(isBig('gifts_hidden', ['g1', 'g2'], ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']), false);
    assert.equal(isBig('otp_global_per_hour', 300, 1000), false);
    assert.equal(isBig('otp_global_per_hour', 300, 1001), true);
    assert.equal(isBig('features_off', [], FEATURES), false);
    const six = [...SHOP.keys()].slice(0, 6);
    assert.equal(isBig('shop_hidden', [], six.slice(0, 5)), false);
    assert.equal(isBig('shop_hidden', [], six), true);
    assert.equal(isBig('shop_hidden', six.slice(0, 2), [...six, 'noble-1']), false);
    assert.equal(isBig('withdraw_max_diamonds', 5e6, 50_000), false);
  });

  test('preview text: numbers from the real exchange sum, the effect of a switch', () => {
    const t = impactOf('exchange_usd_try', 49.8, 54.78);
    assert.ok(t.startsWith(`10.000 💎 = ${exchangeCoins(10_000).toLocaleString('tr-TR')} → `), t);
    assert.match(t, /\+%10,0/);
    assert.match(impactOf('exchange_usd_try', 49.8, 45), /eski uygulamalar/);
    const off = impactOf('features_off', ['dm'], ['gifts', 'dm'], { env: { featuresOff: ['dm'] }, raw: ['gifts'] });
    assert.match(off, /Yeni hediye gönderimi durur\. Eski uygulamalar "Bu özellik geçici olarak kapalı" mesajı görür\./);
    assert.match(off, /Sunucu ayarında kapalı kalır: Mesajlar/);
    assert.match(impactOf('campaign', null, validate('campaign', camp(), { now: NOW }), { now: NOW }), /^%20 kampanya "Bayram": 100\.000 jetonluk paket alan \+20\.000 kampanya jetonu alır\./);
    assert.match(impactOf('gifts_hidden', [], ['g1']), /Gizlenir: Gül/);
    assert.match(impactOf('packs_hidden', [], ['p1']), /1\.000 jeton/);
    assert.match(impactOf('shop_hidden', [], ['fr-neon']), /Mağazada gizlenir: Ses Dalgası/);
    assert.match(impactOf('shop_hidden', ['fr-neon'], []), /yeniden satılır: Ses Dalgası/);
    assert.match(impactOf('otp_global_per_hour', 300, 0), /SMS ile giriş kodu gönderimi durur/);
    assert.match(impactOf('withdraw_weekly_diamonds', 1e7, 1e6, { next: { withdraw_max_diamonds: 5e6 } }), /tek talepte de en çok bu kadar istenebilir/);
    assert.match(impactOf('withdraw_max_diamonds', 5e6, 1e6, { next: { withdraw_weekly_diamonds: 6e5 } }), /tek talepte en çok 600\.000 💎 istenebilir/);
    assert.match(impactOf('min_version', null, '1.4.0', { raw: '1.4.0' }), /1\.4\.0 sürümünden eski/);
  });
});

describe('Oda süslemesi', () => {
  test('a switch for each paid part, the price in hundreds, 1–90 days', () => {
    assert.deepEqual(REGISTRY.room_decor_off.bounds.options, ['custom', 'paid']);
    assert.deepEqual(validate('room_decor_off', ['paid', 'custom']), ['custom', 'paid']);
    assert.equal(validate('room_decor_off', []), null);
    refused(() => validate('room_decor_off', ['free']), /bilinmeyen/);
    assert.equal(validate('room_bg_custom_price', 7_500), 7_500);
    for (const v of [0, 50, 5_050, 100_100, '5000', 5_000.5]) refused(() => validate('room_bg_custom_price', v), /Özel süsleme ücreti/);
    assert.equal(validate('room_bg_custom_days', 7), 7);
    for (const v of [0, 91, 1.5]) refused(() => validate('room_bg_custom_days', v), /Özel süsleme süresi/);
    // A price that more than doubles or halves asks again; the days never do.
    assert.deepEqual([isBig('room_bg_custom_price', 5_000, 10_000), isBig('room_bg_custom_price', 5_000, 10_100), isBig('room_bg_custom_price', 5_000, 2_400), isBig('room_bg_custom_price', 5_000, null)], [false, true, true, false]);
    assert.equal(isBig('room_bg_custom_days', 30, 90), false);
    assert.equal(impactOf('room_bg_custom_price', 5_000, 7_000), 'Özel süsleme 5.000 → 7.000 jeton.');
    assert.match(impactOf('room_decor_off', [], ['custom']), /Yeni özel süsleme satın alınamaz/);
    assert.match(impactOf('room_decor_off', ['custom'], []), /Yeniden açılır: Özel süsleme/);
    const s = snapshotOf([{ key: 'room_decor_off', value: ['paid'] }, { key: 'room_bg_custom_price', value: 6_000 }, { key: 'room_bg_custom_days', value: 500 }]);
    assert.deepEqual([[...s.roomDecorOff], s.roomBgCustomPrice, s.roomBgCustomDays, s.invalid], [['paid'], 6_000, 30, ['room_bg_custom_days']]);
    assert.deepEqual([[...snapshotOf().roomDecorOff], snapshotOf().roomBgCustomPrice, snapshotOf().roomBgCustomDays], [[], 5_000, 30]);
  });
});

describe('sums the money handlers and the app share', () => {
  test('campaignBonus: inside [startsAt, endsAt), rounded down', () => {
    const c = validate('campaign', camp({ percent: 15 }), { now: NOW });
    const s = Date.parse(c.startsAt);
    const e = Date.parse(c.endsAt);
    assert.equal(campaignBonus(1000, c, s - 1), 0);
    assert.equal(campaignBonus(1000, c, s), 150);
    assert.equal(campaignBonus(1000, c, new Date(e - 1)), 150);
    assert.equal(campaignBonus(1000, c, iso(e)), 0);
    assert.equal(campaignBonus(1001, c, s), 150);
    assert.equal(campaignBonus(1013, c, s), 151);
    assert.equal(campaignBonus(1000, null, s), 0);
    assert.equal(campaignBonus(0, c, s), 0);
  });

  test('campaignRef: the Istanbul date of the start, as the database allows', () => {
    // 22:30 UTC is already the next day in Istanbul (UTC+3).
    assert.equal(campaignRef({ percent: 20, startsAt: '2026-11-05T22:30:00.000Z' }), 'kampanya_20261106_20');
    assert.equal(campaignRef({ percent: 5, startsAt: '2026-11-05T20:59:00.000Z' }), 'kampanya_20261105_5');
    assert.match(campaignRef({ percent: 50, startsAt: '2027-01-01T00:00:00Z' }), /^kampanya_[0-9]{8}_[0-9]{1,2}$/);
  });

  test('compareVersion and exchangeOk', () => {
    assert.equal(compareVersion('1.4.0', '1.4'), 0);
    assert.equal(compareVersion('1.10.0', '1.9.9'), 1);
    assert.equal(compareVersion('1.0.3', 'v1.0.4-beta'), -1);
    assert.equal(compareVersion('yok', '0.0.0'), 0);
    assert.equal(exchangeOk(49.8, 49.8), true);
    assert.equal(exchangeOk(49.8, 49.81), false);
    assert.equal(exchangeOk(50, 49.8), true);
    assert.equal(exchangeOk(49.8, undefined), false);
  });
});

describe('snapshot', () => {
  test('nothing saved: today; .env switches stay off', () => {
    const s = snapshotOf([], { FEATURES_OFF: 'dm', APP_NOTICE: 'Bakım', APP_MIN_VERSION: '1.0.1' });
    assert.equal(s.v, 0);
    assert.deepEqual([...s.featuresOff], ['dm']);
    assert.equal(s.notice, 'Bakım');
    assert.equal(s.minVersion, '1.0.1');
    assert.equal(s.giftsHidden.size, 0);
    assert.equal(s.campaign, null);
    assert.equal(s.usdTry, 49.8);
    assert.equal(s.withdrawMax, 5e6);
    assert.equal(s.withdrawWeekly, 1e7);
    assert.equal(s.otpPerHour, 300);
    assert.deepEqual(s.invalid, []);
  });

  test('saved values win, a later row wins, junk falls back to the default', () => {
    const rows = [
      { key: 'features_off', value: ['gifts', 'dm'] },
      { key: 'notice', value: '' },
      { key: 'exchange_usd_try', value: 52 },
      { key: 'exchange_usd_try', value: 53.5 },
      { key: 'withdraw_max_diamonds', value: 9e9 },
      { key: 'gifts_hidden', value: 'g1' },
      { key: 'packs_hidden', value: ['p2'] },
      { key: 'otp_global_per_hour', value: null },
      { key: 'campaign', value: { label: 'Kış', endsAt: '2020-01-02T00:00:00Z', percent: 10, startsAt: '2020-01-01T00:00:00Z' } },
      { key: 'need_level', value: 1 },
      null,
    ];
    const s = snapshotOf(rows, { FEATURES_OFF: 'dm', APP_NOTICE: 'Bakım' }, { v: 7 });
    assert.equal(s.v, 7);
    assert.deepEqual([...s.featuresOff], ['dm', 'gifts']);
    assert.equal(s.notice, null);
    assert.equal(s.usdTry, 53.5);
    assert.equal(s.withdrawMax, 5e6);
    assert.equal(s.giftsHidden.size, 0);
    assert.deepEqual([...s.packsHidden], ['p2']);
    assert.equal(s.otpPerHour, 300);
    assert.deepEqual(s.campaign, { percent: 10, startsAt: '2020-01-01T00:00:00.000Z', endsAt: '2020-01-02T00:00:00.000Z', label: 'Kış' });
    assert.deepEqual([...s.invalid].sort(), ['gifts_hidden', 'withdraw_max_diamonds']);
    assert.ok(Object.isFrozen(s) && Object.isFrozen(s.campaign));
    assert.throws(() => s.featuresOff.add('rooms'), TypeError);
    assert.throws(() => s.giftsHidden.clear(), TypeError);
    // A valid row after a bad one for the same key clears it.
    assert.deepEqual(snapshotOf([{ key: 'otp_global_per_hour', value: -1 }, { key: 'otp_global_per_hour', value: 50 }], {}).invalid, []);
    const eff = effectiveOf(s);
    assert.deepEqual(eff.features_off, ['dm', 'gifts']);
    assert.equal(eff.exchange_usd_try, 53.5);
    assert.deepEqual(Object.keys(eff), Object.keys(REGISTRY));
  });

  test('configOf moved here unchanged', () => {
    assert.deepEqual(configOf({ FEATURES_OFF: 'gifts, Topup,unknown' }).featuresOff, ['gifts', 'topup']);
  });

  test('features.mjs loads on its own and re-exports the same lists', () => {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const f = await import('./features.mjs'); const r = await import('./live-registry.mjs'); console.log(JSON.stringify([f.FEATURES === r.FEATURES, f.OFF_MESSAGE === r.OFF_MESSAGE, f.configOf === r.configOf, f.isOn('gifts')])); process.exit(0);",
      ],
      { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, FEATURES_OFF: '', PGHOST: '127.0.0.1' }, encoding: 'utf8' },
    );
    assert.deepEqual(JSON.parse(out.trim().split('\n').at(-1)), [true, true, true, true]);
  });
});
