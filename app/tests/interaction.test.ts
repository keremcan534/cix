/// <reference types="node" />
// Who may message, call, gift or invite whom (lib/interaction checkInteraction). The rules run in a fixed order —
// own profile → my block → their account status → my age → their privacy choice — and the first one that fails
// gives the reason. Each action only applies its own privacy choice (gifts have none). Demo privacy (data/privacy):
// u3 Zeynep DMs + calls only from people she follows, u6 Burak takes no calls, u10 Kaan is restricted, u11 Melis
// takes room invites only from people she follows; u1 Elif uses the defaults.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FOLLOWS_ME, ME, userById } from '@/data/mock';
import { MIN_AGE, checkInteraction, type Action } from '@/lib/interaction';

const ALL: Action[] = ['message', 'voice', 'video', 'gift', 'invite'];
const ctx = (o: { blocked?: string[]; following?: string[]; myAge?: number } = {}) => ({
  blocked: new Set(o.blocked ?? []),
  following: new Set(o.following ?? []),
  myAge: o.myAge ?? 24,
});
const check = (action: Action, id: string, c = ctx()) => checkInteraction(action, id === 'me' ? ME : userById(id), c);
const reason = (action: Action, id: string, c = ctx()) => {
  const r = check(action, id, c);
  return r.ok ? null : r.reason;
};
/** Runs fn while the demo user `id` follows me (FOLLOWS_ME is the mock "follows me back" list). */
function whileFollowingMe(id: string, fn: () => void) {
  const had = FOLLOWS_ME.has(id);
  FOLLOWS_ME.add(id);
  try {
    fn();
  } finally {
    if (!had) FOLLOWS_ME.delete(id);
  }
}

const SELF = 'Bu senin profilin.';
const BLOCKED = (name: string) => `${name} kişisini engelledin. Engeli kaldırmadan mesaj, arama, hediye veya davet gönderemezsin.`;
const RESTRICTED = 'Bu hesap geçici olarak kısıtlı; arama, hediye ve davet alamıyor.';
const AGE = `Bu özellik ${MIN_AGE} yaş ve üzeri içindir.`;

describe('Kural sırası', () => {
  test('kendi profilim her şeyden önce gelir (engel ve yaş da olsa)', () => {
    for (const a of ALL) assert.equal(reason(a, 'me', ctx({ blocked: ['me'], myAge: 16 })), SELF, a);
  });

  test('engel, hesap durumundan ve yaştan önce gelir', () => {
    for (const a of ALL) assert.equal(reason(a, 'u10', ctx({ blocked: ['u10'], myAge: 16 })), BLOCKED('Kaan'), a);
  });

  test('kısıtlı hesap yaştan önce gelir; mesaj kısıtlamaya takılmaz, yaşa takılır', () => {
    for (const a of ['voice', 'video', 'gift', 'invite'] as const) assert.equal(reason(a, 'u10', ctx({ myAge: 16 })), RESTRICTED, a);
    assert.equal(reason('message', 'u10', ctx({ myAge: 16 })), AGE);
  });

  test('yaş, karşı tarafın gizlilik seçiminden önce gelir', () => {
    assert.equal(reason('message', 'u3', ctx({ myAge: 17 })), AGE);
    assert.equal(reason('voice', 'u6', ctx({ myAge: 17 })), AGE);
    assert.equal(reason('invite', 'u11', ctx({ myAge: 17 })), AGE);
  });

  test(`yaş sınırı ${MIN_AGE} dahil`, () => {
    for (const a of ALL) {
      assert.equal(reason(a, 'u1', ctx({ myAge: MIN_AGE - 1 })), AGE, a);
      assert.deepEqual(check(a, 'u1', ctx({ myAge: MIN_AGE })), { ok: true }, a);
    }
  });

  test('engel yalnız engellenen kişiyi etkiler', () => {
    assert.equal(reason('gift', 'u1', ctx({ blocked: ['u2'] })), null);
    assert.equal(reason('gift', 'u2', ctx({ blocked: ['u2'] })), BLOCKED('Mert'));
  });
});

describe('Mesaj', () => {
  test('varsayılan herkes; "takip ettikleri" seçen kişi beni takip etmiyorsa mesaj kapalı', () => {
    assert.deepEqual(check('message', 'u1'), { ok: true });
    assert.equal(reason('message', 'u3'), 'Zeynep yalnızca takip ettiği kişilerden mesaj alıyor.');
    // My following her doesn't matter: it is about whom she follows.
    assert.equal(reason('message', 'u3', ctx({ following: ['u3'] })), 'Zeynep yalnızca takip ettiği kişilerden mesaj alıyor.');
    whileFollowingMe('u3', () => assert.deepEqual(check('message', 'u3'), { ok: true }));
  });

  test('aramayı ya da daveti kapatan kişiye mesaj açık; kısıtlı hesaba da mesaj gider', () => {
    for (const id of ['u6', 'u11', 'u10']) assert.deepEqual(check('message', id), { ok: true }, id);
  });
});

describe('Sesli / görüntülü arama', () => {
  test('aramaları kapatan kişi kimseden arama almaz', () => {
    for (const a of ['voice', 'video'] as const) {
      assert.equal(reason(a, 'u6'), 'Burak şu an arama kabul etmiyor.', a);
      whileFollowingMe('u6', () => assert.equal(reason(a, 'u6'), 'Burak şu an arama kabul etmiyor.', a));
    }
  });

  test('"takip ettikleri" seçen kişi yalnız takip ettiği kişiden arama alır', () => {
    for (const a of ['voice', 'video'] as const) {
      assert.equal(reason(a, 'u3'), 'Zeynep yalnızca takip ettiği kişilerden arama alıyor.', a);
      whileFollowingMe('u3', () => assert.deepEqual(check(a, 'u3'), { ok: true }, a));
      assert.deepEqual(check(a, 'u1'), { ok: true }, a);
    }
  });
});

describe('Hediye', () => {
  test('gizlilik seçimi hediyeyi etkilemez; yalnız engel, hesap durumu ve yaş', () => {
    for (const id of ['u1', 'u3', 'u6', 'u11']) assert.deepEqual(check('gift', id), { ok: true }, id);
    assert.equal(reason('gift', 'u10'), RESTRICTED);
    assert.equal(reason('gift', 'u3', ctx({ blocked: ['u3'] })), BLOCKED('Zeynep'));
    assert.equal(reason('gift', 'u3', ctx({ myAge: 17 })), AGE);
  });
});

describe('Oda daveti', () => {
  test('"takip ettikleri" seçen kişi yalnız takip ettiğinden davet alır; diğer seçimler daveti etkilemez', () => {
    assert.equal(reason('invite', 'u11'), 'Melis yalnızca takip ettiği kişilerden oda daveti alıyor.');
    whileFollowingMe('u11', () => assert.deepEqual(check('invite', 'u11'), { ok: true }));
    // Zeynep limits DMs and calls, Burak calls: neither limits invites.
    for (const id of ['u1', 'u3', 'u6']) assert.deepEqual(check('invite', id), { ok: true }, id);
    assert.equal(reason('invite', 'u10'), RESTRICTED);
  });

  test('davet kuralı arama ve mesajı etkilemez', () => {
    for (const a of ['message', 'voice', 'video', 'gift'] as const) assert.deepEqual(check(a, 'u11'), { ok: true }, a);
  });
});
