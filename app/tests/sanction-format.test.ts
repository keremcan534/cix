/// <reference types="node" />
// Yaptırım panel rules (lib/sanction-format): durations in dk / saat / gün / ay / yıl, which lengths a moderator
// or admin may give (the server's permFor and LIMIT), a sanction's state, policy steps and the apply form's
// checks and request body.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_MINUTES,
  appealOutcomes,
  applyBody,
  applyError,
  applyResult,
  customError,
  durationOptions,
  evidenceItems,
  fmtLength,
  fmtMinutes,
  groupPolicies,
  lengthOf,
  mayLift,
  minutesFrom,
  needsConfirm,
  normalizeStep,
  permFor,
  policyError,
  splitSanctions,
  stateOf,
  typeAllowed,
  type ApplyForm,
  type SanctionMeta,
  type SanctionPolicy,
} from '@/lib/sanction-format';

const limits = { ban: 90 * 1440, device_ban: 30 * 1440 };
const presets = {
  mute: [1, 5, 15, 60, 360, 1440, 4320, 10080, 43200],
  account_ban: [60, 1440, 4320, 10080, 43200, 129600],
  device_ban: [60, 1440, 10080, 43200, 129600],
};
const MOD = ['sanction.view', 'sanction.mute', 'sanction.ban', 'sanction.device_ban', 'sanction.lift', 'sanction.appeal'];
const ADMIN = [...MOD, 'sanction.ban_permanent', 'sanction.device_ban_permanent', 'sanction.approve', 'sanction.appeal_decide', 'sanction.policy', 'sanction.permissions'];
const meta = (perms: string[], policies: SanctionPolicy[] = []): Pick<SanctionMeta, 'perms' | 'limits' | 'presets' | 'policies'> => ({ perms, limits, presets, policies });

const form = (over: Partial<ApplyForm> = {}): ApplyForm => ({
  usePolicy: false,
  type: 'mute_global_text',
  reason: 'spam',
  minutes: 60,
  description: 'Tekrarlı reklam mesajı',
  note: '',
  roomId: '',
  includeDm: false,
  includeCalls: false,
  deviceIds: [],
  evidence: '',
  ...over,
});
const ROOM = '3F2504E0-4F89-11D3-9A0C-0305E82C3301';

describe('sanction-format: süreler', () => {
  test('fmtMinutes writes at most two parts', () => {
    assert.equal(fmtMinutes(null), 'Süresiz');
    assert.equal(fmtMinutes(0), '0 dk');
    assert.equal(fmtMinutes(5), '5 dk');
    assert.equal(fmtMinutes(90), '1 saat 30 dk');
    assert.equal(fmtMinutes(1441), '1 gün 1 dk');
    assert.equal(fmtMinutes(10080), '7 gün');
    assert.equal(fmtMinutes(43200), '1 ay');
    assert.equal(fmtMinutes(129600), '3 ay');
    assert.equal(fmtMinutes(525600), '1 yıl');
    assert.equal(fmtMinutes(525600 + 43200 + 60), '1 yıl 1 ay');
  });

  test('fmtLength: a ban without end is lifelong, a mute indefinite', () => {
    assert.equal(fmtLength('account_ban', null), 'Ömür boyu');
    assert.equal(fmtLength('device_ban', null), 'Ömür boyu');
    assert.equal(fmtLength('mute_all', null), 'Süresiz');
    assert.equal(fmtLength('account_ban', 1440), '1 gün');
  });

  test('minutesFrom converts units and rejects bad or too long amounts', () => {
    assert.equal(minutesFrom('3', 'gun'), 4320);
    assert.equal(minutesFrom(' 2 ', 'saat'), 120);
    assert.equal(minutesFrom('1,5', 'saat'), 90);
    assert.equal(minutesFrom('10', 'yil'), MAX_MINUTES);
    assert.equal(minutesFrom('11', 'yil'), null);
    assert.equal(minutesFrom('0', 'dk'), null);
    assert.equal(minutesFrom('-1', 'dk'), null);
    assert.equal(minutesFrom('abc', 'dk'), null);
    assert.equal(minutesFrom('5', 'hafta'), null);
  });

  test('lengthOf reads start and end', () => {
    assert.equal(lengthOf({ startAt: '2026-11-04T10:00:00Z', endAt: '2026-11-04T11:30:00Z', permanent: false }), 90);
    assert.equal(lengthOf({ startAt: '2026-11-04T10:00:00Z', endAt: null, permanent: true }), null);
  });
});

describe('sanction-format: yetkiler', () => {
  test('permFor matches the server limits', () => {
    assert.equal(permFor('mute_all', null, limits), 'sanction.mute');
    assert.equal(permFor('account_ban', limits.ban, limits), 'sanction.ban');
    assert.equal(permFor('account_ban', limits.ban + 1, limits), 'sanction.ban_permanent');
    assert.equal(permFor('account_ban', null, limits), 'sanction.ban_permanent');
    assert.equal(permFor('device_ban', limits.device_ban, limits), 'sanction.device_ban');
    assert.equal(permFor('device_ban', limits.device_ban + 1, limits), 'sanction.device_ban_permanent');
  });

  test('typeAllowed', () => {
    assert.equal(typeAllowed('mute_room_text', ['sanction.view']), false);
    assert.equal(typeAllowed('mute_room_text', MOD), true);
    assert.equal(typeAllowed('account_ban', ['sanction.ban_permanent']), true);
    assert.equal(typeAllowed('device_ban', ['sanction.mute']), false);
  });

  test('a moderator gets bans up to 90 days, device bans up to 30 days and no lifetime option', () => {
    const ban = durationOptions('account_ban', meta(MOD));
    assert.deepEqual(
      ban.map((o) => o.minutes),
      [60, 1440, 4320, 10080, 43200, 129600],
    );
    assert.equal(ban.at(-1)?.label, '3 ay');
    const dev = durationOptions('device_ban', meta(MOD));
    assert.deepEqual(
      dev.map((o) => o.minutes),
      [60, 1440, 10080, 43200],
    );
    assert.ok(!dev.some((o) => o.minutes === null));
  });

  test('an admin also gets Ömür boyu; mutes always offer Süresiz', () => {
    const ban = durationOptions('account_ban', meta(ADMIN));
    assert.deepEqual(ban.at(-1), { minutes: null, label: 'Ömür boyu' });
    assert.deepEqual(durationOptions('mute_all', meta(MOD)).at(-1), { minutes: null, label: 'Süresiz' });
    assert.deepEqual(durationOptions('account_ban', meta(['sanction.mute'])), []);
  });

  test('customError explains the cap', () => {
    assert.equal(customError('account_ban', 1440, meta(MOD)), null);
    assert.equal(customError('account_ban', limits.ban + 1, meta(MOD)), 'Yetkinle en çok 3 ay verebilirsin');
    assert.equal(customError('device_ban', limits.device_ban + 1, meta(MOD)), 'Yetkinle en çok 1 ay verebilirsin');
    assert.equal(customError('account_ban', limits.ban + 1, meta(ADMIN)), null);
    assert.equal(customError('account_ban', 60, meta(['sanction.mute'])), 'Bu tür için yetkin yok');
    assert.equal(customError('mute_all', null, meta(MOD)), 'Süre 1 dakika ile 10 yıl arası bir tam sayı olmalı');
  });

  test('appealOutcomes: reduce and lift only with appeal_decide', () => {
    assert.deepEqual(appealOutcomes(MOD), ['upheld', 'needs_review']);
    assert.deepEqual(appealOutcomes(ADMIN), ['upheld', 'reduced', 'lifted', 'needs_review']);
    assert.deepEqual(appealOutcomes(['sanction.view']), []);
  });

  test('mayLift: a lifetime ban needs the lifetime permission', () => {
    assert.equal(mayLift({ type: 'mute_all', permanent: false, status: 'active' }, MOD), true);
    assert.equal(mayLift({ type: 'account_ban', permanent: true, status: 'active' }, MOD), false);
    assert.equal(mayLift({ type: 'account_ban', permanent: true, status: 'active' }, ADMIN), true);
    assert.equal(mayLift({ type: 'device_ban', permanent: true, status: 'active' }, MOD), false);
    assert.equal(mayLift({ type: 'mute_all', permanent: false, status: 'lifted' }, ADMIN), false);
    assert.equal(mayLift({ type: 'mute_all', permanent: false, status: 'active' }, ['sanction.mute']), false);
  });
});

describe('sanction-format: durum', () => {
  test('stateOf uses the server clock', () => {
    assert.equal(stateOf({ status: 'active', live: true }), 'active');
    assert.equal(stateOf({ status: 'active', live: false }), 'expired');
    assert.equal(stateOf({ status: 'lifted', live: false }), 'lifted');
    assert.equal(stateOf({ status: 'pending', live: false }), 'pending');
  });

  test('splitSanctions orders running (lifetime first), waiting and history', () => {
    const list = [
      { id: 1, status: 'active' as const, live: true, endAt: '2026-11-05T00:00:00Z' },
      { id: 2, status: 'active' as const, live: true, endAt: null },
      { id: 3, status: 'active' as const, live: true, endAt: '2026-12-01T00:00:00Z' },
      { id: 4, status: 'active' as const, live: false, endAt: '2026-11-01T00:00:00Z' },
      { id: 5, status: 'pending' as const, live: false, endAt: null },
      { id: 6, status: 'lifted' as const, live: false, endAt: null },
      { id: 7, status: 'pending' as const, live: false, endAt: null },
    ];
    const r = splitSanctions(list);
    assert.deepEqual(
      r.live.map((s) => s.id),
      [2, 3, 1],
    );
    assert.deepEqual(
      r.pending.map((s) => s.id),
      [5, 7],
    );
    assert.deepEqual(
      r.history.map((s) => s.id),
      [6, 4],
    );
  });
});

describe('sanction-format: ceza kademeleri', () => {
  const reasons = [
    { code: 'spam', title: 'Spam', publicText: '' },
    { code: 'hakaret', title: 'Hakaret', publicText: '' },
  ];
  const step = (n: number, over: Partial<SanctionPolicy> = {}): SanctionPolicy => ({ reason: 'spam', step: n, type: 'mute_all', minutes: 60, windowDays: 30, auto: false, requiresApproval: false, ...over });

  test('groupPolicies keeps every category and sorts steps', () => {
    const g = groupPolicies([step(2), step(1)], reasons);
    assert.equal(g.length, 2);
    assert.deepEqual(
      g[0].steps.map((s) => s.step),
      [1, 2],
    );
    assert.equal(g[0].windowDays, 30);
    assert.deepEqual(g[1].steps, []);
    assert.equal(g[1].windowDays, 90);
  });

  test('normalizeStep forces approval on heavy steps and auto only on mutes', () => {
    assert.deepEqual(normalizeStep({ type: 'device_ban', minutes: 60, auto: true, requiresApproval: false }), { type: 'device_ban', minutes: 60, auto: false, requiresApproval: true });
    assert.deepEqual(normalizeStep({ type: 'account_ban', minutes: null, auto: false, requiresApproval: false }).requiresApproval, true);
    assert.equal(normalizeStep({ type: 'account_ban', minutes: 1440, auto: true, requiresApproval: false }).auto, false);
    assert.equal(normalizeStep({ type: 'mute_all', minutes: 60, auto: true, requiresApproval: false }).auto, true);
    assert.equal(normalizeStep({ type: 'mute_all', minutes: 60, auto: true, requiresApproval: true }).auto, false);
  });

  test('policyError', () => {
    const s = { type: 'mute_all' as const, minutes: 60, auto: false, requiresApproval: false };
    assert.equal(policyError([s], '90'), null);
    assert.equal(policyError([], 'x'), null);
    assert.equal(policyError([s], '0'), 'Değerlendirme süresi 1–3650 gün olmalı');
    assert.equal(policyError([s, { ...s, minutes: 0 }], '30'), 'Kademe 2: süre geçersiz');
    assert.equal(policyError(Array(11).fill(s), '30'), 'En çok 10 kademe olabilir');
  });
});

describe('sanction-format: uygulama formu', () => {
  test('evidenceItems splits lines into links and notes', () => {
    assert.deepEqual(evidenceItems(' https://x.com/a \n\n ekran görüntüsü mesajda \nhttp://bad link'), [
      { kind: 'link', content: 'https://x.com/a' },
      { kind: 'note', content: 'ekran görüntüsü mesajda' },
      { kind: 'note', content: 'http://bad link' },
    ]);
    assert.equal(evidenceItems(Array(15).fill('a').join('\n')).length, 10);
  });

  test('applyError checks in order', () => {
    const m = meta(MOD);
    assert.equal(applyError(form(), m), null);
    assert.equal(applyError(form({ reason: '' }), m), 'İhlal kategorisini seç');
    assert.equal(applyError(form({ usePolicy: true }), m), 'Bu kategori için ceza kademesi tanımlı değil');
    assert.equal(applyError(form({ type: 'account_ban' }), meta(['sanction.mute'])), 'Bu yaptırım türü için yetkin yok');
    assert.equal(applyError(form({ minutes: undefined }), m), 'Süreyi seç');
    assert.equal(applyError(form({ type: 'account_ban', minutes: null }), m), 'Süresiz yaptırım için yetkin yok');
    assert.equal(applyError(form({ type: 'account_ban', minutes: null }), meta(ADMIN)), null);
    assert.equal(applyError(form({ type: 'device_ban', minutes: limits.device_ban * 2, deviceIds: [1] }), m), 'Yetkinle en çok 1 ay verebilirsin');
    assert.match(applyError(form({ type: 'mute_room_text', roomId: 'oda' }), m) ?? '', /^Oda kimliğini yaz/);
    assert.equal(applyError(form({ type: 'mute_room_text', roomId: ROOM }), m), null);
    assert.equal(applyError(form({ type: 'device_ban', minutes: 60 }), m), 'Engellenecek en az bir cihaz seç');
    assert.equal(applyError(form({ description: 'ab' }), m), 'Gerekçe 3–300 karakter olmalı');
    assert.equal(applyError(form({ note: 'x'.repeat(2001) }), m), 'İç not en çok 2000 karakter');
    assert.equal(applyError(form({ description: ' ', note: '' }), m), 'Kullanıcıya gösterilecek gerekçe veya iç not yaz');
    assert.equal(applyError(form({ description: '', note: 'iç not' }), m), null);
  });

  test('a policy form skips type and length checks', () => {
    const m = meta(['sanction.view'], [{ reason: 'spam', step: 1, type: 'mute_all', minutes: 60, windowDays: 90, auto: false, requiresApproval: false }]);
    assert.equal(applyError(form({ usePolicy: true, minutes: undefined }), m), null);
  });

  test('applyBody sends only the fields that apply', () => {
    assert.deepEqual(applyBody('u1', form({ includeDm: true, includeCalls: true, roomId: ROOM, deviceIds: [3], description: '  reklam  ' })), {
      user: 'u1',
      type: 'mute_global_text',
      reason: 'spam',
      minutes: 60,
      description: 'reklam',
      note: '',
      includeDm: true,
    });
    const room = applyBody('u1', form({ type: 'mute_room_voice', roomId: ` ${ROOM} `, evidence: 'https://a.b/c' }), 12);
    assert.equal(room.roomId, ROOM.toLowerCase());
    assert.deepEqual(room.evidence, [{ kind: 'link', content: 'https://a.b/c' }]);
    assert.equal(room.reportId, 12);
    const dev = applyBody('u1', form({ type: 'device_ban', minutes: null, deviceIds: [3, 4] }));
    assert.equal('minutes' in dev && dev.minutes, null);
    assert.deepEqual(dev.deviceIds, [3, 4]);
    const pol = applyBody('u1', form({ usePolicy: true, minutes: undefined }));
    assert.equal('usePolicy' in pol && pol.usePolicy, true);
    assert.equal('minutes' in pol, false);
    assert.equal(applyBody('u1', form({ type: 'mute_global_voice', includeCalls: true })).includeCalls, true);
  });

  test('needsConfirm for bans and policy steps', () => {
    assert.equal(needsConfirm({ type: 'account_ban', usePolicy: false }), true);
    assert.equal(needsConfirm({ type: 'mute_all', usePolicy: true }), true);
    assert.equal(needsConfirm({ type: 'mute_all', usePolicy: false }), false);
  });

  test('applyResult', () => {
    assert.equal(applyResult([]), 'Yaptırım kaydedildi');
    assert.equal(applyResult([{ status: 'active', label: 'Hesap banı' }]), 'Hesap banı uygulandı');
    assert.equal(applyResult([{ status: 'pending', label: 'Cihaz banı' }]), 'Cihaz banı onaya gönderildi');
    assert.equal(
      applyResult([
        { status: 'pending', label: 'Cihaz banı' },
        { status: 'pending', label: 'Cihaz banı' },
      ]),
      '2 cihaz banı onaya gönderildi',
    );
  });
});
