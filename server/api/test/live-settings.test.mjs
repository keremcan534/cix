// Live settings against a real Postgres (live-settings.mjs, 015): the admin routes with preview, "emin misin?",
// stale saves, history and rollback; a live switch-off refused on the server at once, .env switches that stay
// off, a row from another process picked up by the poll, the append-only table, campaignAt, the push to every
// admin, and LIVE_SAFE_MODE ignoring the table.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import { FEATURES } from '../live-registry.mjs';
import { campaignAt } from '../live-settings.mjs';
import { rnd, startApi } from './harness.mjs';

/** The sign-in switches /api/config adds: the harness turns on development sign-in only. */
const SIGN_IN = { signIn: { dev: true, google: false, email: false, phone: false }, verify: { sms: false, whatsapp: false } };

// A stand-in for Expo's push service.
const pushed = [];
const pushMock = http.createServer(async (req, res) => {
  let body = '';
  for await (const ch of req) body += ch;
  const batch = JSON.parse(body);
  pushed.push(...batch);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ data: batch.map(() => ({ status: 'ok', id: rnd(4) })) }));
});
await new Promise((r) => pushMock.listen(0, '127.0.0.1', r));
pushMock.unref();

const h = startApi({ FEATURES_OFF: 'dm', LIVE_POLL_MS: '200', PUSH_ENABLED: '1', PUSH_URL: `http://127.0.0.1:${pushMock.address().port}/push` });
const { call } = h;

const SETTINGS = '/api/admin/live-settings';
const HISTORY = '/api/admin/live-settings/history';
const ROLLBACK = '/api/admin/live-settings/rollback';
const OFF = 'Bu özellik geçici olarak kapalı';
const rows = async () => Number((await h.sql.query('SELECT count(*) FROM live_settings')).rows[0].count);
const config = async () => (await fetch(`${h.base}/api/config`)).json();
const until = async (fn, ms = 1000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
/** The admin panel's view and a save on top of it. */
const panel = async (s) => {
  const [st, j] = await call('GET', SETTINGS, null, s);
  assert.equal(st, 200, j.error);
  return j;
};
const effective = async (s) => Object.fromEntries((await panel(s)).settings.map((x) => [x.key, x.effective]));
const save = async (s, changes, extra = {}) => call('POST', SETTINGS, { changes, reason: 'Test değişikliği', baseV: (await panel(s)).v, ...extra }, s);
const ok = ([st, j]) => {
  assert.equal(st, 200, j.error);
  return j;
};

let A;
let B;
const TOKEN_A = 'ExponentPushToken[adminAAAAAAAAAA]';
const TOKEN_B = 'ExponentPushToken[adminBBBBBBBBBB]';

describe('nothing saved', () => {
  test('/api/config is the .env config plus v: 0; the catalog is whole', async () => {
    A = await h.account('Ayşe Yönetici', 'admin');
    B = await h.account('Bora Yönetici', 'admin');
    assert.deepEqual(await config(), { minVersion: null, updateUrl: null, notice: null, featuresOff: ['dm'], v: 0, ...SIGN_IN });
    const [st, cat] = await call('GET', '/api/catalog');
    assert.equal(st, 200);
    assert.equal(cat.gifts.length, 57);
    assert.equal(cat.packs.length, 9);
  });

  test('admins only, on all four routes', async () => {
    const u = await h.signUp();
    for (const [m, p] of [
      ['GET', SETTINGS],
      ['POST', SETTINGS],
      ['GET', HISTORY],
      ['POST', ROLLBACK],
    ]) {
      const body = m === 'POST' ? { changes: { notice: 'x' }, reason: 'deneme', baseV: 0 } : null;
      assert.equal((await call(m, p, body))[0], 401, `${m} ${p}`);
      const [st, j] = await call(m, p, body, u.session);
      assert.equal(st, 403, `${m} ${p}`);
      assert.equal(j.error, 'Yönetici hesabı gerekli');
    }
    assert.equal(await rows(), 0);
  });

  test('the panel: every key with its default, nothing saved', async () => {
    const j = await panel(A.session);
    assert.equal(j.v, 0);
    assert.equal(j.safeMode, false);
    assert.ok(Math.abs(Date.parse(j.serverNow) - Date.now()) < 60_000);
    assert.deepEqual(j.env, { featuresOff: ['dm'], notice: null, minVersion: null });
    assert.deepEqual(
      j.settings.map((x) => x.key),
      [
        ...['features_off', 'notice', 'campaign', 'gifts_hidden', 'shop_hidden', 'packs_hidden', 'exchange_usd_try', 'withdraw_max_diamonds', 'withdraw_weekly_diamonds', 'otp_global_per_hour', 'min_version'],
        ...['dm_price', 'call_voice_price', 'call_video_price', 'call_free', 'call_free_seconds', 'call_plain_voice_price', 'call_plain_video_price', 'match_voice_price', 'match_video_price', 'match_free', 'match_free_seconds', 'heart_voice_level', 'heart_video_level'],
        'backpack_call_task',
        ...['rewards_off', 'welcome_coins', 'invite_coins', 'invite_daily_cap'],
        ...['casino_off', 'casino_open', 'casino_max_bet', 'casino_daily_rounds'],
        ...['room_decor_off', 'room_bg_custom_price', 'room_bg_custom_days'],
        ...['room_staff_away_minutes', 'boss_seat_coins', 'boss_seat_minutes'],
        ...['event_min_room_level', 'event_min_lead_minutes', 'event_max_minutes', 'event_max_capacity', 'event_grace_minutes', 'event_strike_limit', 'event_block_days', 'event_reminders_off'],
        'lucky_announce_min_coins',
      ],
    );
    const by = Object.fromEntries(j.settings.map((x) => [x.key, x]));
    for (const x of j.settings) {
      assert.equal(x.value, null, x.key);
      assert.equal(x.invalid, false);
      assert.equal(x.changedBy, null);
      assert.ok(x.label && x.help && x.group && x.type && x.bounds, x.key);
    }
    assert.deepEqual(by.features_off.effective, ['dm']);
    assert.deepEqual(by.features_off.bounds.options, FEATURES);
    assert.equal(by.features_off.bounds.labels.gifts, 'Hediye');
    assert.equal(by.exchange_usd_try.effective, 49.8);
    assert.equal(by.exchange_usd_try.default, 49.8);
    assert.deepEqual(by.exchange_usd_try.bounds, { min: 40, max: 75, decimals: 2, maxStepPct: 10, bigStepPct: 3 });
    assert.equal(by.withdraw_max_diamonds.bounds.max, 5_000_000);
    assert.equal(by.withdraw_weekly_diamonds.effective, 10_000_000);
    assert.equal(by.otp_global_per_hour.effective, 300);
    assert.equal(by.campaign.effective, null);
  });
});

describe('saving', () => {
  test('bad input is a 400 and writes nothing', async () => {
    const bad = [
      [{ changes: { notice: 'Bakım' }, reason: 'ab', baseV: 0 }, /Neden 3–300/],
      [{ changes: { notice: 'Bakım' }, reason: 'x'.repeat(301), baseV: 0 }, /Neden 3–300/],
      [{ changes: { notice: 'Bakım' }, reason: 'Bakım duyurusu' }, /baseV/],
      [{ changes: { notice: 'Bakım' }, reason: 'Bakım duyurusu', baseV: '0' }, /baseV/],
      [{ reason: 'Bakım duyurusu', baseV: 0 }, /Değişiklikler eksik/],
      [{ changes: ['notice'], reason: 'Bakım duyurusu', baseV: 0 }, /Değişiklikler eksik/],
      [{ changes: {}, reason: 'Bakım duyurusu', baseV: 0 }, /Değişiklik yok/],
      [{ changes: { need_level: 1 }, reason: 'Seviye düşsün', baseV: 0 }, /Bilinmeyen ayar: need_level/],
      [{ changes: { diamonds_per_usd: 6000 }, reason: 'Kur', baseV: 0 }, /Bilinmeyen ayar/],
      [{ changes: { exchange_usd_try: 498 }, reason: 'Kur yanlış', baseV: 0 }, /40,00 ile 75,00/],
      [{ changes: { exchange_usd_try: 55.5 }, reason: 'Kur çok arttı', baseV: 0 }, /en çok %10/],
      [{ changes: { withdraw_max_diamonds: 6_000_000 }, reason: 'Sınır artsın', baseV: 0 }, /5\.000\.000/],
      [{ changes: { notice: undefined, features_off: ['casino'] }, reason: 'Kapat', baseV: 0 }, /bilinmeyen seçim/],
      [{ changes: { packs_hidden: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] }, reason: 'Hepsini gizle', baseV: 0 }, /En az bir paket/],
    ];
    for (const [body, re] of bad) {
      const [st, j] = await call('POST', SETTINGS, body, A.session);
      assert.equal(st, 400, JSON.stringify(body));
      assert.match(j.error, re);
    }
    assert.equal((await call('POST', SETTINGS, '{nope', A.session))[0], 400);
    assert.equal(await rows(), 0);
  });

  test('a dryRun previews and writes nothing', async () => {
    const j = ok(await save(A.session, { exchange_usd_try: 51 }, { dryRun: true }));
    assert.equal(j.v, 0);
    assert.equal(j.needsConfirm, false);
    assert.equal(j.preview.length, 1);
    const [p] = j.preview;
    assert.deepEqual({ ...p, impact: undefined }, { key: 'exchange_usd_try', label: 'Çevirme kuru', before: 49.8, after: 51, reset: false, impact: undefined, big: false });
    assert.match(p.impact, /^10\.000 💎 = 4\.220 → 4\.322 jeton \(\+%2,4\)\.$/);
    assert.equal(await rows(), 0);
  });

  test('a big change needs confirm; a save on a stale view is refused', async () => {
    await call('POST', '/api/push/register', { token: TOKEN_A, platform: 'android' }, A.session);
    await call('POST', '/api/push/register', { token: TOKEN_B, platform: 'ios' }, B.session);
    const [st, j] = await save(A.session, { exchange_usd_try: 53 });
    assert.equal(st, 409);
    assert.equal(j.code, 'confirm_needed');
    assert.equal(j.preview[0].big, true);
    assert.equal(await rows(), 0);
    const dry = ok(await save(A.session, { exchange_usd_try: 53 }, { dryRun: true }));
    assert.equal(dry.needsConfirm, true);

    const saved = ok(await save(A.session, { exchange_usd_try: 53 }, { confirm: true }));
    assert.match(saved.batch, /^[0-9a-f-]{36}$/);
    assert.ok(saved.v > 0);
    assert.equal(saved.preview[0].after, 53);
    assert.equal((await effective(B.session)).exchange_usd_try, 53);
    assert.equal((await config()).v, saved.v);

    // B's screen was loaded before A saved.
    const [st2, j2] = await call('POST', SETTINGS, { changes: { exchange_usd_try: 52 }, reason: 'Eski ekrandan', baseV: 0, confirm: true }, B.session);
    assert.equal(st2, 409);
    assert.deepEqual(j2, { error: 'Ayarlar bu arada değişti, tekrar bak', code: 'stale', v: saved.v });
    const [st3, j3] = await call('POST', SETTINGS, { changes: { exchange_usd_try: 52 }, reason: 'Eski ekrandan', baseV: 0, dryRun: true }, B.session);
    assert.equal(st3, 409);
    assert.equal(j3.code, 'stale');
    // The same value again is no change.
    const [st4, j4] = await save(B.session, { exchange_usd_try: 53 });
    assert.equal(st4, 400);
    assert.equal(j4.error, 'Değişiklik yok');
    assert.equal(await rows(), 1);

    // Every admin's phone hears of it.
    assert.ok(await until(() => pushed.filter((m) => m.title === 'Canlı ayar değişti').length >= 2, 3000), 'push');
    const msgs = pushed.filter((m) => m.data?.batch === saved.batch);
    assert.deepEqual(msgs.map((m) => m.to).sort(), [TOKEN_A, TOKEN_B]);
    assert.equal(msgs[0].body, 'Ayşe Yönetici: Çevirme kuru — Test değişikliği');
    assert.equal(msgs[0].data.type, 'live_settings');
  });

  test('a live switch-off is refused on the server at once; .env switches stay off; admin routes stay open', async () => {
    const a = await h.signUp();
    const b = await h.signUp();
    ok(await call('POST', '/api/wallet/test-topup', { amount: 5000, ref: rnd(6) }, a.session));
    const send = () => call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g1', count: 1, ref: rnd(6) }, a.session);
    ok(await send());

    const j = ok(await save(B.session, { features_off: ['gifts'] }));
    assert.deepEqual(j.preview[0].before, ['dm']);
    assert.deepEqual(j.preview[0].after, ['dm', 'gifts']);
    assert.match(j.preview[0].impact, /Yeni hediye gönderimi durur\. Eski uygulamalar "Bu özellik geçici olarak kapalı" mesajı görür\. Sunucu ayarında kapalı kalır: Mesajlar\./);
    const [st, e] = await send();
    assert.equal(st, 503);
    assert.equal(e.error, OFF);
    assert.equal((await call('POST', '/api/wallet/gift', { to: b.user.id, amount: 10, ref: rnd(6) }, a.session))[0], 503);
    assert.deepEqual((await config()).featuresOff, ['dm', 'gifts']);

    // Everything off: the owner can still look, save and undo.
    ok(await save(B.session, { features_off: FEATURES }));
    assert.deepEqual((await config()).featuresOff, ['dm', 'gifts', 'purchases', 'topup', 'exchange', 'jeton', 'games', 'rooms', 'withdraw', 'shop']);
    assert.equal((await call('POST', '/api/rooms', { title: 'Oda' }, a.session))[0], 503);
    ok(await call('GET', HISTORY, null, B.session));
    ok(await save(B.session, { features_off: null }));

    // .env's dm can't be switched on from here.
    assert.deepEqual((await config()).featuresOff, ['dm']);
    assert.deepEqual((await effective(B.session)).features_off, ['dm']);
    const [st2, m] = await call('POST', '/api/messages', { to: b.user.id, text: 'selam', ref: rnd(6) }, a.session);
    assert.equal(st2, 503);
    assert.equal(m.error, OFF);
    ok(await send());
  });

  test('a forced version needs the admin app and no newer than it', async () => {
    const C = await h.account('Can Yönetici', 'admin');
    let [st, j] = await save(C.session, { min_version: '1.4.0' }, { confirm: true });
    assert.equal(st, 400);
    assert.equal(j.error, 'Uygulama sürümün gelmedi; zorunlu sürümü uygulamadan kaydet');
    [st, j] = await save(C.session, { min_version: '1.4.0' }, { confirm: true, appVersion: '1.3.9' });
    assert.equal(st, 400);
    assert.equal(j.error, 'Kendi uygulamandan (1.3.9) yeni bir sürümü zorunlu yapamazsın');
    [st, j] = await save(C.session, { min_version: '1.4.0' }, { appVersion: '1.4.0' });
    assert.equal(st, 409);
    assert.equal(j.code, 'confirm_needed');
    ok(await save(C.session, { min_version: '1.4.0' }, { appVersion: '1.4.0', confirm: true }));
    assert.equal((await config()).minVersion, '1.4.0');
    // Lifting it needs neither.
    ok(await save(C.session, { min_version: null }));
    assert.equal((await config()).minVersion, null);
  });
});

describe('history and rollback', () => {
  test('history: newest first, who, why, before and after; an audit row per save', async () => {
    const [st, j] = await call('GET', HISTORY, null, A.session);
    assert.equal(st, 200);
    assert.equal(j.next, null);
    assert.equal(j.batches.length, 6);
    const [lift, force] = j.batches;
    assert.deepEqual(lift.changes, [{ key: 'min_version', label: 'Zorunlu sürüm', before: '1.4.0', after: null }]);
    assert.equal(lift.by.name, 'Can Yönetici');
    assert.equal(lift.reason, 'Test değişikliği');
    assert.equal(lift.rollbackOf, null);
    assert.deepEqual(force.changes, [{ key: 'min_version', label: 'Zorunlu sürüm', before: null, after: '1.4.0' }]);
    const rate = j.batches.at(-1);
    assert.deepEqual(rate.changes, [{ key: 'exchange_usd_try', label: 'Çevirme kuru', before: null, after: 53 }]);
    assert.deepEqual(rate.by, { id: A.user.id, name: 'Ayşe Yönetici' });
    assert.ok(Date.parse(rate.at) <= Date.parse(lift.at));

    const p1 = ok(await call('GET', `${HISTORY}?limit=2`, null, A.session));
    assert.deepEqual(p1.batches.map((x) => x.batch), [lift.batch, force.batch]);
    assert.ok(p1.next > 0);
    const p2 = ok(await call('GET', `${HISTORY}?limit=2&before=${p1.next}`, null, A.session));
    assert.deepEqual(p2.batches.map((x) => x.batch), j.batches.slice(2, 4).map((x) => x.batch));
    for (const q of ['?limit=0', '?limit=101', '?limit=abc', '?before=0', '?before=-3']) assert.equal((await call('GET', HISTORY + q, null, A.session))[0], 400, q);

    const audit = await h.sql.query("SELECT actor, action, target, detail FROM audit_events WHERE action LIKE 'live_settings.%' ORDER BY id");
    assert.equal(audit.rowCount, 6);
    assert.deepEqual(audit.rows.map((r) => r.detail.batch).reverse(), j.batches.map((x) => x.batch));
    assert.deepEqual(audit.rows[0], { actor: A.user.id, action: 'live_settings.set', target: null, detail: { batch: rate.batch, reason: 'Test değişikliği', changes: [{ key: 'exchange_usd_try', before: null, after: 53 }] } });
    const ip = await h.sql.query('SELECT DISTINCT ip FROM live_settings');
    assert.deepEqual(ip.rows.map((r) => r.ip), ['127.0.0.1']);
  });

  test('rollback puts a batch back; a rollback of the rollback redoes it; a later change needs confirm', async () => {
    const D = await h.account('Deniz Yönetici', 'admin');
    const x = ok(await save(D.session, { notice: 'Bakım 02:00', otp_global_per_hour: 120 }));
    assert.equal((await config()).notice, 'Bakım 02:00');
    assert.equal((await effective(D.session)).otp_global_per_hour, 120);

    const rb = (batch, extra = {}) => call('POST', ROLLBACK, { batch, reason: 'Geri al', baseV: extra.baseV, ...extra }, D.session);
    let v = (await panel(D.session)).v;
    const dry = ok(await rb(x.batch, { baseV: v, dryRun: true }));
    assert.equal(dry.needsConfirm, false);
    assert.deepEqual(
      dry.preview.map((p) => [p.key, p.before, p.after, p.reset, p.changedSince]),
      [
        ['notice', 'Bakım 02:00', null, true, false],
        ['otp_global_per_hour', 120, 300, true, false],
      ],
    );
    assert.equal(dry.v, v);
    const r1 = ok(await rb(x.batch, { baseV: v }));
    assert.equal((await config()).notice, null);
    assert.equal((await effective(D.session)).otp_global_per_hour, 300);

    v = (await panel(D.session)).v;
    ok(await rb(r1.batch, { baseV: v }));
    assert.equal((await config()).notice, 'Bakım 02:00');
    assert.equal((await effective(D.session)).otp_global_per_hour, 120);
    const top = ok(await call('GET', `${HISTORY}?limit=2`, null, D.session)).batches;
    assert.equal(top[0].rollbackOf, r1.batch);
    assert.equal(top[1].rollbackOf, x.batch);
    assert.deepEqual(top[0].changes.map((c) => [c.key, c.before, c.after]), [
      ['notice', null, 'Bakım 02:00'],
      ['otp_global_per_hour', null, 120],
    ]);
    assert.equal((await h.sql.query("SELECT count(*) FROM audit_events WHERE action = 'live_settings.rollback'")).rows[0].count, '2');

    // x's keys changed again since: undoing x now needs confirm.
    ok(await save(D.session, { notice: 'Yeni duyuru' }));
    v = (await panel(D.session)).v;
    const [st, j] = await rb(x.batch, { baseV: v });
    assert.equal(st, 409);
    assert.equal(j.code, 'confirm_needed');
    assert.ok(j.preview.every((p) => p.changedSince && p.big));
    assert.match(j.preview[0].impact, /^Bu ayar sonradan yine değişti/);
    ok(await rb(x.batch, { baseV: v, confirm: true }));
    assert.equal((await config()).notice, null);
    // Already back: nothing to do.
    v = (await panel(D.session)).v;
    assert.deepEqual(await rb(x.batch, { baseV: v }), [400, { error: 'Değişiklik yok' }]);

    assert.equal((await rb('00000000-0000-4000-8000-000000000000', { baseV: v }))[0], 404);
    assert.equal((await rb('yok', { baseV: v }))[0], 400);
    assert.equal((await rb(x.batch, { baseV: v, reason: 'x' }))[0], 400);
  });

  test('a rollback follows the same money rules', async () => {
    const E = await h.account('Ece Yönetici', 'admin');
    // 53 → 58 → 63.8: undoing the first save would drop the rate by more than 10 %.
    const first = ok(await save(E.session, { exchange_usd_try: 58 }, { confirm: true }));
    ok(await save(E.session, { exchange_usd_try: 63.8 }, { confirm: true }));
    const [st, j] = await call('POST', ROLLBACK, { batch: first.batch, reason: 'Geri al', baseV: (await panel(E.session)).v, confirm: true }, E.session);
    assert.equal(st, 400);
    assert.match(j.error, /en çok %10/);
    // Back down in steps; the default counts as a step too.
    ok(await save(E.session, { exchange_usd_try: 58 }, { confirm: true }));
    const [st2, j2] = await save(E.session, { exchange_usd_try: null }, { confirm: true });
    assert.equal(st2, 400);
    assert.match(j2.error, /şimdi 58,00, yeni değer 52,20–63,80 arasında/);
    ok(await save(E.session, { exchange_usd_try: 53 }, { confirm: true }));
    ok(await save(E.session, { exchange_usd_try: null }));
    assert.equal((await effective(E.session)).exchange_usd_try, 49.8);
  });
});

describe('the table', () => {
  test('rows can never be changed or deleted', async () => {
    await assert.rejects(h.sql.query("UPDATE live_settings SET reason = 'değişti'"), /değiştirilemez ve silinemez/);
    await assert.rejects(h.sql.query('DELETE FROM live_settings'), /değiştirilemez ve silinemez/);
    await assert.rejects(h.sql.query('TRUNCATE live_settings'), /değiştirilemez ve silinemez/);
    await assert.rejects(h.sql.query("INSERT INTO live_settings (batch, key, value, reason, set_by) VALUES (gen_random_uuid(), 'Kötü-Anahtar', '1', 'deneme', $1)", [A.user.id]), /check/i);
  });

  test("another process's save is picked up by the poll within a second", async () => {
    const r = await h.sql.query("INSERT INTO live_settings (batch, key, value, reason, set_by) VALUES (gen_random_uuid(), 'notice', '\"Elle yazıldı\"', 'Elle deneme', $1) RETURNING id", [A.user.id]);
    const id = Number(r.rows[0].id);
    assert.ok(await until(async () => {
      const c = await config();
      return c.notice === 'Elle yazıldı' && c.v === id;
    }), 'poll');
    // A value that no longer passes falls back to the default and is flagged.
    await h.sql.query("INSERT INTO live_settings (batch, key, value, reason, set_by) VALUES (gen_random_uuid(), 'otp_global_per_hour', '99999', 'Elle deneme', $1)", [A.user.id]);
    assert.ok(await until(async () => (await panel(A.session)).settings.find((x) => x.key === 'otp_global_per_hour').invalid));
    const otp = (await panel(A.session)).settings.find((x) => x.key === 'otp_global_per_hour');
    assert.equal(otp.value, 99999);
    assert.equal(otp.effective, 300);
    ok(await save(A.session, { otp_global_per_hour: null }));
  });

  test('campaignAt: the campaign saved as of a time', async () => {
    const F = await h.account('Fatma Yönetici', 'admin');
    const campaign = { percent: 10, startsAt: new Date(Date.now() + 60_000).toISOString(), endsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), label: 'Hafta sonu' };
    const j = ok(await save(F.session, { campaign }));
    assert.match(j.preview[0].impact, /^%10 kampanya "Hafta sonu": 100\.000 jetonluk paket alan \+10\.000 kampanya jetonu alır\./);
    assert.deepEqual((await effective(F.session)).campaign, campaign);
    const [big] = (await save(F.session, { campaign: { ...campaign, percent: 30 } }));
    assert.equal(big, 409);
    ok(await save(F.session, { campaign: null }));
    const [c1, c2] = (await h.sql.query("SELECT created_at FROM live_settings WHERE key = 'campaign' ORDER BY id")).rows.map((r) => r.created_at.getTime());
    assert.equal(await campaignAt(h.sql, c1 - 1000), null);
    assert.deepEqual(await campaignAt(h.sql, new Date(c1 + 1)), campaign);
    assert.deepEqual(await campaignAt(h.sql, new Date((c1 + c2) / 2).toISOString()), campaign);
    assert.equal(await campaignAt(h.sql, c2 + 1), null);
    assert.equal(await campaignAt(h.sql, 'yok'), null);
    assert.equal((await effective(F.session)).campaign, null);
  });
});

describe('LIVE_SAFE_MODE', () => {
  let safe = null;
  after(() => safe?.kill());

  test('the table is ignored and nothing can be saved', async () => {
    const G = await h.account('Gül Yönetici', 'admin');
    ok(await save(G.session, { features_off: ['gifts'], notice: 'Canlı duyuru' }));
    assert.deepEqual((await config()).featuresOff, ['dm', 'gifts']);

    const port = await new Promise((resolve) => {
      const s = net.createServer().listen(0, '127.0.0.1', () => {
        const p = s.address().port;
        s.close(() => resolve(p));
      });
    });
    const env = { ...process.env, PGHOST: process.env.PGHOST ?? '127.0.0.1', PGPORT: process.env.PGPORT ?? '5432', POSTGRES_USER: process.env.POSTGRES_USER ?? 'postgres', POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? '', POSTGRES_DB: `similar_test_${process.pid}`, LIVEKIT_KEYS: 'testkey: testsecret', API_PORT: String(port), ALLOW_TEST_TOPUP: '1', RATE_AUTH: '100000', RATE_ALL: '100000', LOG_REQUESTS: '0', PUSH_ENABLED: '0', ALLOW_DEV_AUTH: '1', FEATURES_OFF: 'dm', LIVE_SAFE_MODE: '1' };
    safe = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'index.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    safe.stdout.on('data', (d) => (out += d));
    assert.ok(await until(() => out.includes('api on'), 10_000), 'safe api started');
    const base = `http://127.0.0.1:${port}`;
    const sc = async (m, p, body, s) => {
      const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${s}` }, body: body ? JSON.stringify(body) : undefined });
      return [r.status, await r.json()];
    };
    try {
      assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { minVersion: null, updateUrl: null, notice: null, featuresOff: ['dm'], v: 0, ...SIGN_IN });
      const [st, p] = await sc('GET', SETTINGS, null, G.session);
      assert.equal(st, 200);
      assert.equal(p.safeMode, true);
      assert.ok(p.v > 0);
      const by = Object.fromEntries(p.settings.map((x) => [x.key, x]));
      assert.deepEqual(by.features_off.value, ['gifts']);
      assert.deepEqual(by.features_off.effective, ['dm']);
      assert.equal(by.notice.effective, null);
      const [st2, w] = await sc('POST', SETTINGS, { changes: { notice: 'x' }, reason: 'Güvenli mod', baseV: p.v }, G.session);
      assert.deepEqual([st2, w], [503, { error: 'Canlı ayarlar güvenli modda kapalı' }]);
      const batch = ok(await call('GET', `${HISTORY}?limit=1`, null, G.session)).batches[0].batch;
      assert.equal((await sc('POST', ROLLBACK, { batch, reason: 'Güvenli mod', baseV: p.v }, G.session))[0], 503);
      // Gifts are off on the normal process, on in safe mode.
      const a = await h.signUp();
      const b = await h.signUp();
      ok(await call('POST', '/api/wallet/test-topup', { amount: 1000, ref: rnd(6) }, a.session));
      assert.equal((await call('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g1', count: 1, ref: rnd(6) }, a.session))[0], 503);
      assert.equal((await sc('POST', '/api/gifts/send', { to: b.user.id, giftId: 'g1', count: 1, ref: rnd(6) }, a.session))[0], 200);
    } finally {
      safe.kill();
      await new Promise((r) => (safe.exitCode !== null ? r() : safe.on('exit', r)));
      safe = null;
    }
  });
});
